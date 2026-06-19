from __future__ import annotations

from dataclasses import dataclass, field, asdict, fields
from enum import Enum


def _known_kwargs(cls, d: dict) -> dict:
    """dataclass cls의 실제 필드만 추려 미지정 키(버전 드리프트)를 무시한다."""
    valid = {f.name for f in fields(cls)}
    return {k: v for k, v in d.items() if k in valid}


class NodeType(str, Enum):
    ENTRANCE = "entrance"      # 출입구
    PASSAGE = "passage"        # 통로
    STAIRS = "stairs"          # 계단
    ESCALATOR = "escalator"    # 에스컬레이터
    ELEVATOR = "elevator"      # 엘리베이터
    GATE = "gate"              # 게이트
    PLATFORM = "platform"      # 승강장


@dataclass
class WeidmannParams:
    v_free: float = 1.34       # 자유보행속도 (m/s)
    rho_max: float = 5.4       # 임계(혼잡)밀도 (인/m^2)
    gamma: float = 1.913       # 형상 파라미터


@dataclass
class GenerationConfig:
    # kind: "constant" | "poisson" | "normal_pulse" | "none"
    kind: str
    rate: float = 0.0                       # 초당 발생률 (constant/poisson)
    profile: list | None = None             # 시간가변 [[t_sec, rate], ...] (옵션)
    center_sec: float = 0.0                 # normal_pulse 중심 시각
    sigma_sec: float = 1.0                  # normal_pulse 표준편차
    total: float = 0.0                      # normal_pulse 총 발생 인원


@dataclass
class TrainConfig:
    first_arrival_sec: float
    headway_sec: float
    jitter_sigma_sec: float = 0.0           # 도착시각 정규 지터
    capacity: float = 200.0                 # 열차 정원(탑승 sink 상한)
    alight_kind: str = "constant"           # "constant" | "poisson" | "normal"
    alight_mean: float = 100.0              # 하차 인원 평균
    alight_std: float = 0.0                 # 하차 인원 표준편차(normal)


@dataclass
class Node:
    id: str
    name: str
    type: NodeType
    area: float
    base_stay_prob: float
    congestion_enabled: bool = True
    weidmann: WeidmannParams = field(default_factory=WeidmannParams)
    initial_population: float = 0.0
    exit_weight: float = 0.0
    group: str = ""
    generation: GenerationConfig | None = None
    train: TrainConfig | None = None


@dataclass
class Link:
    source: str
    target: str
    distance: float
    weight: float
    travel_time: int = 0                     # 0 => 자동 계산(Task 6)


@dataclass
class SimConfig:
    dt_seconds: float = 5.0
    duration_seconds: float = 3600.0
    default_walk_speed: float = 1.34
    stochastic: bool = False
    seed: int = 0
    observation_noise_std: float = 0.0       # 관측 노이즈(선택)
    missing_prob: float = 0.0                # 결측 확률(선택)


@dataclass
class StationGraph:
    nodes: list[Node]
    links: list[Link]

    def to_json(self) -> dict:
        def node_json(n: Node) -> dict:
            d = asdict(n)
            d["type"] = n.type.value
            return d
        return {
            "nodes": [node_json(n) for n in self.nodes],
            "links": [asdict(l) for l in self.links],
        }

    @classmethod
    def from_json(cls, data: dict) -> "StationGraph":
        nodes = []
        for nd in data["nodes"]:
            nd = dict(nd)
            nd["type"] = NodeType(nd["type"])
            wd = nd.get("weidmann")
            nd["weidmann"] = WeidmannParams(**_known_kwargs(WeidmannParams, wd)) if wd else WeidmannParams()
            gen = nd.get("generation")
            nd["generation"] = GenerationConfig(**_known_kwargs(GenerationConfig, gen)) if gen else None
            tr = nd.get("train")
            nd["train"] = TrainConfig(**_known_kwargs(TrainConfig, tr)) if tr else None
            nodes.append(Node(**_known_kwargs(Node, nd)))
        links = [Link(**_known_kwargs(Link, dict(ld))) for ld in data["links"]]
        return cls(nodes=nodes, links=links)

    def resolve_travel_times(self, config: SimConfig) -> None:
        speed_by_id = {n.id: n.weidmann.v_free for n in self.nodes}
        for l in self.links:
            if l.travel_time and l.travel_time > 0:
                continue
            v = speed_by_id.get(l.source, config.default_walk_speed)
            if v <= 0:
                v = config.default_walk_speed
            steps = round(l.distance / (v * config.dt_seconds))
            l.travel_time = max(1, int(steps))

    def validate(self, tol: float = 1e-6) -> list[str]:
        errors: list[str] = []
        ids = {n.id for n in self.nodes}
        out_weight: dict[str, float] = {n.id: 0.0 for n in self.nodes}
        out_count: dict[str, int] = {n.id: 0 for n in self.nodes}

        for l in self.links:
            if l.source not in ids:
                errors.append(f"링크 source가 존재하지 않는 노드: {l.source}")
                continue
            if l.target not in ids:
                errors.append(f"링크 target이 존재하지 않는 노드: {l.target}")
                continue
            if l.distance <= 0:
                errors.append(f"링크 거리는 0보다 커야 함: {l.source}->{l.target}")
            if not (0.0 <= l.weight <= 1.0):
                errors.append(f"링크 가중치는 [0,1]: {l.source}->{l.target}")
            out_weight[l.source] += l.weight
            out_count[l.source] += 1

        for n in self.nodes:
            if not (0.0 <= n.base_stay_prob <= 1.0):
                errors.append(f"노드 {n.id}: 체류확률은 [0,1]")
            if n.area <= 0:
                errors.append(f"노드 {n.id}: 면적은 0보다 커야 함")
            if not (0.0 <= n.exit_weight <= 1.0):
                errors.append(f"노드 {n.id}: exit_weight는 [0,1]")

            total_out = out_weight[n.id] + n.exit_weight
            has_outflow = out_count[n.id] > 0 or n.exit_weight > 0
            if has_outflow:
                if abs(total_out - 1.0) > tol:
                    errors.append(
                        f"노드 {n.id}: 출력 가중치 합(+exit)이 1이 아님 ({total_out:.4f})")
            else:
                if abs(n.base_stay_prob - 1.0) > tol:
                    errors.append(
                        f"노드 {n.id}: 이동인원이 갈 곳이 없음(출력/exit 없음, 체류확률<1)")

            if n.generation is not None and n.type not in (NodeType.ENTRANCE, NodeType.PLATFORM):
                errors.append(f"노드 {n.id}: 발생은 출입구/승강장만 가능")
            if n.type == NodeType.PLATFORM and n.train is None:
                errors.append(f"노드 {n.id}: 승강장은 열차 설정(train)이 필요")
            if n.type != NodeType.PLATFORM and n.train is not None:
                errors.append(f"노드 {n.id}: 열차 설정은 승강장만 가능")

        return errors
