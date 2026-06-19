from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum


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
            nd["weidmann"] = WeidmannParams(**wd) if wd else WeidmannParams()
            gen = nd.get("generation")
            nd["generation"] = GenerationConfig(**gen) if gen else None
            tr = nd.get("train")
            nd["train"] = TrainConfig(**tr) if tr else None
            nodes.append(Node(**nd))
        links = [Link(**dict(ld)) for ld in data["links"]]
        return cls(nodes=nodes, links=links)
