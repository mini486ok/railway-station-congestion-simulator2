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

    def validate(self, tol: float = 1e-6, duration_seconds: float | None = None) -> list[str]:
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

            # FIX 2: initial_population 음수 검사
            if n.initial_population < 0:
                errors.append(f"노드 {n.id}: 초기 인원은 0 이상이어야 함")

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

            # PLATFORM 노드 train 필드 상세 검증
            if n.type == NodeType.PLATFORM and n.train is not None:
                train = n.train
                if train.headway_sec <= 0:
                    errors.append(f"노드 {n.id}: 배차간격(headway)은 0보다 커야 함")
                if train.first_arrival_sec < 0:
                    errors.append(f"노드 {n.id}: first_arrival_sec는 0 이상이어야 함")
                if train.capacity < 0:
                    errors.append(f"노드 {n.id}: capacity(열차 정원)는 0 이상이어야 함")
                # FIX 2: alight_kind 유효성 검사
                if train.alight_kind not in ("constant", "poisson", "normal"):
                    errors.append(f"노드 {n.id}: 하차 분포는 constant/poisson/normal 중 하나")

            # FIX 2: generation.kind 유효성 검사
            if n.generation is not None:
                if n.generation.kind not in ("constant", "poisson", "normal_pulse", "none"):
                    errors.append(f"노드 {n.id}: 발생 분포 종류가 올바르지 않음")

            # FIX 3: NormalPulse 잘림 경고 (duration_seconds 제공 시)
            if (duration_seconds is not None
                    and n.generation is not None
                    and n.generation.kind == "normal_pulse"):
                gen = n.generation
                if (gen.center_sec - 3 * gen.sigma_sec < 0
                        or gen.center_sec + 3 * gen.sigma_sec > duration_seconds):
                    errors.append(
                        f"노드 {n.id}: 정규펄스가 시뮬레이션 구간[0,{duration_seconds}]을"
                        f" 벗어나 총 발생 인원이 total보다 적을 수 있음"
                    )

        # 그룹 일관성 검사 (group 필드가 비어 있지 않은 노드만 대상)
        from collections import defaultdict
        group_nodes: dict[str, list[Node]] = defaultdict(list)
        for n in self.nodes:
            if n.group:
                group_nodes[n.group].append(n)

        for g, members in group_nodes.items():
            # 한 그룹에 PLATFORM이 2개 이상이면 오류
            platform_count = sum(1 for m in members if m.type == NodeType.PLATFORM)
            if platform_count >= 2:
                errors.append(
                    f"그룹 '{g}': 한 그룹에 승강장이 2개 이상이면 열차 하차가 중복 계산됩니다"
                )
            # 그룹 내 congestion_enabled 혼재 → 오류
            congestion_values = {m.congestion_enabled for m in members}
            if len(congestion_values) > 1:
                errors.append(
                    f"그룹 '{g}': 그룹 내 노드의 '혼잡 동적 체류' 설정이 일치해야 합니다"
                )
            # FIX 1: 그룹 내 Weidmann 파라미터 일관성 검사 (once per group)
            if len(members) > 1:
                first = members[0].weidmann
                mixed = any(
                    abs(m.weidmann.v_free - first.v_free) > tol
                    or abs(m.weidmann.rho_max - first.rho_max) > tol
                    or abs(m.weidmann.gamma - first.gamma) > tol
                    for m in members[1:]
                )
                if mixed:
                    errors.append(
                        f"그룹 '{g}': 그룹 내 노드의 Weidmann 파라미터(v_free/rho_max/gamma)가 일치해야 합니다"
                    )

        return errors
