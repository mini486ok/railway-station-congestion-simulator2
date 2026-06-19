# Python 시뮬레이션 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 철도역사 혼잡도 시계열을 생성하는 순수 Python+numpy 시뮬레이션 코어(라이브러리)를 TDD로 구현한다. 이 코어는 Pyodide(브라우저)와 로컬 pytest 양쪽에서 동일 코드로 동작한다.

**Architecture:** 이산 시간 거시적 유량(population-flow) 모델. 노드별 인원 `N(t)`를 상태로 두고, 매 스텝 (1) 혼잡도 기반 이동확률 계산 → (2) 링크 가중치로 유출 분배 + 지연버퍼(소요시간) → (3) `N(t+1)=잔류+유입+발생` 갱신 → (4) source(출입구·승강장 발생)/sink(출입구 이탈·승강장 탑승) 처리 순으로 진행한다.

**Tech Stack:** Python 3.11+, numpy, dataclasses, enum. 표준 라이브러리 외 의존성은 numpy 뿐. 테스트는 pytest.

## Global Constraints

- 외부 의존성은 **numpy만** 허용(Pyodide 기본 포함 패키지). C 확장이 필요한 다른 라이브러리 금지.
- 코어는 **파일 I/O를 직접 하지 않는다.** 내보내기 함수는 문자열(CSV/JSON text)을 반환한다(Pyodide 호환).
- 난수는 항상 `numpy.random.Generator`(예: `np.random.default_rng(seed)`)를 주입받아 사용한다. 전역 `np.random` 직접 호출 금지(재현성).
- 모든 확률/가중치 합 검증 허용오차(tolerance)는 `1e-6`을 사용한다.
- 인원수는 **연속 실수(float)** 로 다룬다(요구사항: 연속 결정론 + 선택적 노이즈).
- NodeType enum 값은 영문 소문자: `entrance, passage, stairs, escalator, elevator, gate, platform`.
- Python 3.11+ 문법 사용 가능(`X | None` 등).

---

### Task 1: 프로젝트 스캐폴드 + 데이터 모델 + JSON 라운드트립

**Files:**
- Create: `pyproject.toml`
- Create: `sim/__init__.py`
- Create: `sim/model.py`
- Test: `tests/test_model.py`

**Interfaces:**
- Consumes: (없음)
- Produces:
  - `NodeType(str, Enum)`: `ENTRANCE, PASSAGE, STAIRS, ESCALATOR, ELEVATOR, GATE, PLATFORM`
  - `WeidmannParams(v_free=1.34, rho_max=5.4, gamma=1.913)`
  - `GenerationConfig(kind: str, rate=0.0, profile: list|None=None, center_sec=0.0, sigma_sec=1.0, total=0.0)`
  - `TrainConfig(first_arrival_sec, headway_sec, jitter_sigma_sec=0.0, capacity=200.0, alight_kind="constant", alight_mean=100.0, alight_std=0.0)`
  - `Node(id, name, type: NodeType, area, base_stay_prob, congestion_enabled=True, weidmann=WeidmannParams(), initial_population=0.0, exit_weight=0.0, generation: GenerationConfig|None=None, train: TrainConfig|None=None)`
  - `Link(source, target, distance, weight, travel_time=0)`
  - `SimConfig(dt_seconds=5.0, duration_seconds=3600.0, default_walk_speed=1.34, stochastic=False, seed=0, observation_noise_std=0.0, missing_prob=0.0)`
  - `StationGraph(nodes: list[Node], links: list[Link])` with classmethods/methods `from_json(data: dict) -> StationGraph`, `to_json() -> dict`

- [ ] **Step 1: Write the failing test**

Create `tests/test_model.py`:

```python
from sim.model import (
    NodeType, WeidmannParams, GenerationConfig, TrainConfig,
    Node, Link, SimConfig, StationGraph,
)


def _sample_graph() -> StationGraph:
    nodes = [
        Node(id="A", name="입구A", type=NodeType.ENTRANCE, area=50.0,
             base_stay_prob=0.2, exit_weight=0.0,
             generation=GenerationConfig(kind="constant", rate=2.0)),
        Node(id="P", name="승강장1", type=NodeType.PLATFORM, area=200.0,
             base_stay_prob=0.5,
             train=TrainConfig(first_arrival_sec=60, headway_sec=300,
                               capacity=150, alight_mean=80)),
    ]
    links = [Link(source="A", target="P", distance=40.0, weight=1.0)]
    return StationGraph(nodes=nodes, links=links)


def test_node_defaults():
    n = Node(id="x", name="통로", type=NodeType.PASSAGE, area=30.0, base_stay_prob=0.3)
    assert n.congestion_enabled is True
    assert n.weidmann.v_free == 1.34
    assert n.initial_population == 0.0
    assert n.exit_weight == 0.0
    assert n.generation is None and n.train is None


def test_json_round_trip():
    g = _sample_graph()
    data = g.to_json()
    g2 = StationGraph.from_json(data)
    assert g2.to_json() == data
    # 중첩 dataclass 복원 확인
    assert isinstance(g2.nodes[0].type, NodeType)
    assert isinstance(g2.nodes[0].generation, GenerationConfig)
    assert isinstance(g2.nodes[1].train, TrainConfig)
    assert g2.nodes[1].train.capacity == 150
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sim'`

- [ ] **Step 3: Write minimal implementation**

Create `pyproject.toml`:

```toml
[project]
name = "railway-congestion-sim"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["numpy>=1.24"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

Create `sim/__init__.py`:

```python
"""철도역사 혼잡도 합성데이터 생성 시뮬레이션 코어."""
```

Create `sim/model.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_model.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml sim/__init__.py sim/model.py tests/test_model.py
git commit -m "feat: 데이터 모델 및 JSON 직렬화"
```

---

### Task 2: 보행자 기본도(Weidmann) — 혼잡도→이동확률

**Files:**
- Create: `sim/pedestrian.py`
- Test: `tests/test_pedestrian.py`

**Interfaces:**
- Consumes: `WeidmannParams` (Task 1)
- Produces:
  - `speed_ratio(density: float, params: WeidmannParams) -> float`  — `v(ρ)/v_free ∈ [0,1]`
  - `move_probability_vec(N, area, base_move, v_free, rho_max, gamma, enabled) -> np.ndarray` — numpy 배열 입력, 노드별 이동확률 반환

- [ ] **Step 1: Write the failing test**

Create `tests/test_pedestrian.py`:

```python
import numpy as np
from sim.model import WeidmannParams
from sim.pedestrian import speed_ratio, move_probability_vec


def test_speed_ratio_low_density_near_one():
    p = WeidmannParams()
    assert speed_ratio(0.05, p) > 0.95   # 매우 한산 → 거의 자유속도


def test_speed_ratio_zero_at_jam():
    p = WeidmannParams()
    assert speed_ratio(p.rho_max, p) == 0.0
    assert speed_ratio(p.rho_max + 1, p) == 0.0


def test_speed_ratio_monotonic_decreasing():
    p = WeidmannParams()
    densities = [0.1, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0]
    ratios = [speed_ratio(d, p) for d in densities]
    assert all(ratios[i] >= ratios[i + 1] for i in range(len(ratios) - 1))


def test_move_probability_vec_disabled_returns_base():
    N = np.array([100.0, 100.0])
    area = np.array([10.0, 10.0])
    base_move = np.array([0.8, 0.8])
    enabled = np.array([False, False])
    out = move_probability_vec(N, area, base_move, np.array([1.34, 1.34]),
                               np.array([5.4, 5.4]), np.array([1.913, 1.913]), enabled)
    assert np.allclose(out, base_move)


def test_move_probability_vec_congestion_lowers_move():
    # 동일 면적, 인원이 많은 노드의 이동확률이 더 낮아야 한다
    N = np.array([5.0, 500.0])
    area = np.array([10.0, 10.0])
    base_move = np.array([0.8, 0.8])
    enabled = np.array([True, True])
    out = move_probability_vec(N, area, base_move, np.array([1.34, 1.34]),
                               np.array([5.4, 5.4]), np.array([1.913, 1.913]), enabled)
    assert out[0] > out[1]
    assert out[1] < base_move[1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_pedestrian.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sim.pedestrian'`

- [ ] **Step 3: Write minimal implementation**

Create `sim/pedestrian.py`:

```python
from __future__ import annotations

import math
import numpy as np

from sim.model import WeidmannParams


def speed_ratio(density: float, params: WeidmannParams) -> float:
    """Weidmann/Kladek 기본도의 속도비 v(ρ)/v_free ∈ [0,1]."""
    if density <= 0.0:
        return 1.0
    if density >= params.rho_max:
        return 0.0
    val = 1.0 - math.exp(-params.gamma * (1.0 / density - 1.0 / params.rho_max))
    return float(min(1.0, max(0.0, val)))


def move_probability_vec(
    N: np.ndarray,
    area: np.ndarray,
    base_move: np.ndarray,
    v_free: np.ndarray,
    rho_max: np.ndarray,
    gamma: np.ndarray,
    enabled: np.ndarray,
) -> np.ndarray:
    """노드별 이동확률 = base_move * speed_ratio(밀도). enabled=False면 base_move."""
    density = np.where(area > 0, N / area, 0.0)
    safe = np.clip(density, 1e-12, None)
    ratio = 1.0 - np.exp(-gamma * (1.0 / safe - 1.0 / rho_max))
    ratio = np.clip(ratio, 0.0, 1.0)
    ratio = np.where(density >= rho_max, 0.0, ratio)
    ratio = np.where(density <= 0.0, 1.0, ratio)
    effective = base_move * ratio
    return np.where(enabled, effective, base_move)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_pedestrian.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/pedestrian.py tests/test_pedestrian.py
git commit -m "feat: Weidmann 보행자 기본도 기반 이동확률"
```

---

### Task 3: 발생 프로세스 (Constant / Poisson / NormalPulse)

**Files:**
- Create: `sim/generation.py`
- Test: `tests/test_generation.py`

**Interfaces:**
- Consumes: `GenerationConfig` (Task 1)
- Produces:
  - `class Generator` 추상: `amount(self, t_step: int, dt: float, rng, stochastic: bool) -> float`
  - `build_generator(cfg: GenerationConfig | None) -> Generator` (None/"none" → 항상 0 반환하는 `ZeroGenerator`)

- [ ] **Step 1: Write the failing test**

Create `tests/test_generation.py`:

```python
import numpy as np
from sim.model import GenerationConfig
from sim.generation import build_generator


def test_zero_generator_for_none():
    g = build_generator(None)
    assert g.amount(0, 5.0, np.random.default_rng(0), False) == 0.0


def test_constant_deterministic():
    g = build_generator(GenerationConfig(kind="constant", rate=2.0))
    # 결정론: rate * dt
    assert g.amount(0, 5.0, np.random.default_rng(0), False) == 10.0
    assert g.amount(100, 5.0, np.random.default_rng(0), False) == 10.0


def test_poisson_deterministic_equals_mean():
    g = build_generator(GenerationConfig(kind="poisson", rate=2.0))
    assert g.amount(0, 5.0, np.random.default_rng(0), False) == 10.0


def test_poisson_stochastic_mean_close():
    g = build_generator(GenerationConfig(kind="poisson", rate=2.0))
    rng = np.random.default_rng(42)
    samples = [g.amount(0, 5.0, rng, True) for _ in range(5000)]
    assert abs(np.mean(samples) - 10.0) < 0.5
    assert all(float(s).is_integer() for s in samples)  # 정수 표본


def test_profile_time_varying_rate():
    cfg = GenerationConfig(kind="poisson", rate=1.0, profile=[[0, 1.0], [50, 4.0]])
    g = build_generator(cfg)
    # t_sec < 50 이면 rate=1.0, 그 이후 4.0 (계단식 유지)
    assert g.amount(0, 10.0, np.random.default_rng(0), False) == 10.0   # t=0s, rate1
    assert g.amount(6, 10.0, np.random.default_rng(0), False) == 40.0   # t=60s, rate4


def test_normal_pulse_total_conserved():
    cfg = GenerationConfig(kind="normal_pulse", center_sec=50.0, sigma_sec=10.0, total=1000.0)
    g = build_generator(cfg)
    dt = 1.0
    total = sum(g.amount(t, dt, np.random.default_rng(0), False) for t in range(0, 100))
    assert abs(total - 1000.0) < 5.0   # 펄스 적분 ≈ total
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_generation.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sim.generation'`

- [ ] **Step 3: Write minimal implementation**

Create `sim/generation.py`:

```python
from __future__ import annotations

import math
import numpy as np

from sim.model import GenerationConfig, TrainConfig


class Generator:
    def amount(self, t_step: int, dt: float, rng, stochastic: bool) -> float:
        raise NotImplementedError


class ZeroGenerator(Generator):
    def amount(self, t_step, dt, rng, stochastic) -> float:
        return 0.0


def _rate_at(cfg: GenerationConfig, t_sec: float) -> float:
    """profile이 있으면 계단식 시간가변 rate, 없으면 고정 rate."""
    if not cfg.profile:
        return cfg.rate
    rate = cfg.profile[0][1]
    for ts, r in cfg.profile:
        if t_sec >= ts:
            rate = r
        else:
            break
    return rate


class RateGenerator(Generator):
    """constant / poisson 공용. poisson + stochastic 일 때만 표본추출."""
    def __init__(self, cfg: GenerationConfig):
        self.cfg = cfg

    def amount(self, t_step, dt, rng, stochastic) -> float:
        t_sec = t_step * dt
        mean = _rate_at(self.cfg, t_sec) * dt
        if stochastic and self.cfg.kind == "poisson":
            return float(rng.poisson(max(mean, 0.0)))
        return float(max(mean, 0.0))


class NormalPulseGenerator(Generator):
    def __init__(self, cfg: GenerationConfig):
        self.cfg = cfg

    def amount(self, t_step, dt, rng, stochastic) -> float:
        t_sec = t_step * dt
        s = max(self.cfg.sigma_sec, 1e-9)
        pdf = math.exp(-0.5 * ((t_sec - self.cfg.center_sec) / s) ** 2) / (s * math.sqrt(2 * math.pi))
        mean = self.cfg.total * pdf * dt
        if stochastic:
            return float(rng.poisson(max(mean, 0.0)))
        return float(max(mean, 0.0))


def build_generator(cfg: GenerationConfig | None) -> Generator:
    if cfg is None or cfg.kind == "none":
        return ZeroGenerator()
    if cfg.kind in ("constant", "poisson"):
        return RateGenerator(cfg)
    if cfg.kind == "normal_pulse":
        return NormalPulseGenerator(cfg)
    raise ValueError(f"알 수 없는 발생 종류: {cfg.kind}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_generation.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/generation.py tests/test_generation.py
git commit -m "feat: 발생 프로세스(상수/포아송/정규펄스)"
```

---

### Task 4: 열차 스케줄 + 하차 인원 표본

**Files:**
- Modify: `sim/generation.py`
- Test: `tests/test_generation.py` (추가)

**Interfaces:**
- Consumes: `TrainConfig` (Task 1)
- Produces:
  - `train_arrival_steps(cfg: TrainConfig, dt: float, duration_sec: float, rng, stochastic: bool) -> set[int]`
  - `sample_alight(cfg: TrainConfig, rng, stochastic: bool) -> float`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_generation.py`:

```python
from sim.model import TrainConfig
from sim.generation import train_arrival_steps, sample_alight


def test_train_arrival_steps_periodic():
    cfg = TrainConfig(first_arrival_sec=60, headway_sec=300)
    steps = train_arrival_steps(cfg, dt=5.0, duration_sec=700, rng=np.random.default_rng(0), stochastic=False)
    # 60s, 360s, 660s → step 12, 72, 132
    assert steps == {12, 72, 132}


def test_train_arrival_steps_within_duration():
    cfg = TrainConfig(first_arrival_sec=0, headway_sec=100)
    steps = train_arrival_steps(cfg, dt=10.0, duration_sec=250, rng=np.random.default_rng(0), stochastic=False)
    # 0,100,200 → step 0,10,20 (250 이하)
    assert steps == {0, 10, 20}


def test_sample_alight_constant():
    cfg = TrainConfig(first_arrival_sec=0, headway_sec=100, alight_kind="constant", alight_mean=80)
    assert sample_alight(cfg, np.random.default_rng(0), False) == 80.0
    assert sample_alight(cfg, np.random.default_rng(0), True) == 80.0  # constant은 항상 평균


def test_sample_alight_normal_mean_close():
    cfg = TrainConfig(first_arrival_sec=0, headway_sec=100, alight_kind="normal",
                      alight_mean=100, alight_std=15)
    rng = np.random.default_rng(1)
    samples = [sample_alight(cfg, rng, True) for _ in range(3000)]
    assert abs(np.mean(samples) - 100.0) < 2.0
    assert min(samples) >= 0.0  # 음수 클립
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_generation.py -v`
Expected: FAIL with `ImportError: cannot import name 'train_arrival_steps'`

- [ ] **Step 3: Write minimal implementation**

Append to `sim/generation.py`:

```python
def train_arrival_steps(cfg: TrainConfig, dt: float, duration_sec: float,
                        rng, stochastic: bool) -> set[int]:
    """주기적 배차(+선택적 정규 지터)를 이산 스텝 집합으로 변환."""
    steps: set[int] = set()
    t = cfg.first_arrival_sec
    while t <= duration_sec + 1e-9:
        jitter = 0.0
        if stochastic and cfg.jitter_sigma_sec > 0:
            jitter = float(rng.normal(0.0, cfg.jitter_sigma_sec))
        arrival = max(0.0, t + jitter)
        step = int(round(arrival / dt))
        if 0 <= step <= round(duration_sec / dt):
            steps.add(step)
        t += cfg.headway_sec
    return steps


def sample_alight(cfg: TrainConfig, rng, stochastic: bool) -> float:
    """열차 1대당 하차 인원 표본."""
    if not stochastic or cfg.alight_kind == "constant":
        return float(max(cfg.alight_mean, 0.0))
    if cfg.alight_kind == "poisson":
        return float(rng.poisson(max(cfg.alight_mean, 0.0)))
    if cfg.alight_kind == "normal":
        return float(max(0.0, rng.normal(cfg.alight_mean, cfg.alight_std)))
    raise ValueError(f"알 수 없는 하차 종류: {cfg.alight_kind}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_generation.py -v`
Expected: PASS (10 tests 총합)

- [ ] **Step 5: Commit**

```bash
git add sim/generation.py tests/test_generation.py
git commit -m "feat: 열차 스케줄 및 하차 인원 표본"
```

---

### Task 5: 그래프 검증 (StationGraph.validate)

**Files:**
- Modify: `sim/model.py`
- Test: `tests/test_validate.py`

**Interfaces:**
- Consumes: `StationGraph, Node, Link, NodeType` (Task 1)
- Produces: `StationGraph.validate(self) -> list[str]` — 오류 메시지 리스트(빈 리스트면 통과)

검증 규칙:
1. `0 <= base_stay_prob <= 1`, `area > 0`, `0 <= exit_weight <= 1`.
2. 링크 `source/target`가 존재하는 노드여야 하고, `distance > 0`, `0 <= weight <= 1`.
3. 각 노드의 (출력링크 weight 합 + exit_weight): 출력링크가 있거나 exit_weight>0 이면 합 == 1 (tol 1e-6). 출력도 없고 exit_weight==0 이면 `base_stay_prob == 1` 이어야 함(이동인원이 갈 곳 없음 방지).
4. `generation`은 ENTRANCE/PLATFORM 에만 허용.
5. PLATFORM 은 `train` 필수, 그 외 노드는 `train` 금지.

- [ ] **Step 1: Write the failing test**

Create `tests/test_validate.py`:

```python
from sim.model import (NodeType, Node, Link, StationGraph,
                       GenerationConfig, TrainConfig)


def _ok_graph() -> StationGraph:
    nodes = [
        Node(id="A", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
             exit_weight=0.0, generation=GenerationConfig(kind="constant", rate=1.0)),
        Node(id="P", name="승강장", type=NodeType.PLATFORM, area=200, base_stay_prob=0.5,
             exit_weight=1.0,  # 하차객은 다른 링크 없으면 전부 이탈하도록(여기선 단순화)
             train=TrainConfig(first_arrival_sec=60, headway_sec=300)),
    ]
    links = [Link(source="A", target="P", distance=40, weight=1.0)]
    return StationGraph(nodes=nodes, links=links)


def test_valid_graph_has_no_errors():
    assert _ok_graph().validate() == []


def test_weight_sum_must_be_one():
    g = _ok_graph()
    g.links[0].weight = 0.5  # A의 출력합 0.5 + exit 0 != 1
    errs = g.validate()
    assert any("가중치 합" in e for e in errs)


def test_generation_only_on_source_types():
    g = _ok_graph()
    g.nodes.append(Node(id="C", name="통로", type=NodeType.PASSAGE, area=10,
                        base_stay_prob=1.0, generation=GenerationConfig(kind="constant", rate=1.0)))
    assert any("발생" in e for e in g.validate())


def test_platform_requires_train():
    g = _ok_graph()
    g.nodes[1].train = None
    assert any("열차" in e for e in g.validate())


def test_link_references_existing_nodes():
    g = _ok_graph()
    g.links.append(Link(source="A", target="ZZZ", distance=10, weight=0.0))
    # A의 합이 깨지지 않도록 weight=0, 그래도 ZZZ 미존재 오류
    assert any("존재하지 않는" in e for e in g.validate())


def test_movers_with_nowhere_to_go():
    g = _ok_graph()
    # P의 exit_weight=0, 출력링크 없음, base_stay<1 → 오류
    g.nodes[1].exit_weight = 0.0
    g.nodes[1].base_stay_prob = 0.5
    assert any("갈 곳" in e for e in g.validate())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_validate.py -v`
Expected: FAIL with `AttributeError: 'StationGraph' object has no attribute 'validate'`

- [ ] **Step 3: Write minimal implementation**

Add to `StationGraph` in `sim/model.py` (after `from_json`):

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_validate.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/model.py tests/test_validate.py
git commit -m "feat: 그래프 검증 규칙"
```

---

### Task 6: 소요시간 자동 계산

**Files:**
- Modify: `sim/model.py`
- Test: `tests/test_travel_time.py`

**Interfaces:**
- Consumes: `StationGraph, SimConfig, Node, Link` (Task 1)
- Produces: `StationGraph.resolve_travel_times(self, config: SimConfig) -> None` — `travel_time==0`인 링크를 `max(1, round(distance / (v_free * dt)))`로 채운다. `v_free`는 source 노드의 `weidmann.v_free`, source가 없으면 `config.default_walk_speed`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_travel_time.py`:

```python
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig, WeidmannParams)


def _graph():
    nodes = [
        Node(id="A", name="A", type=NodeType.PASSAGE, area=10, base_stay_prob=0.5,
             weidmann=WeidmannParams(v_free=2.0)),
        Node(id="B", name="B", type=NodeType.PASSAGE, area=10, base_stay_prob=1.0),
    ]
    links = [Link(source="A", target="B", distance=40.0, weight=1.0, travel_time=0)]
    return StationGraph(nodes=nodes, links=links)


def test_auto_travel_time_uses_source_speed():
    g = _graph()
    g.resolve_travel_times(SimConfig(dt_seconds=5.0))
    # 40 / (2.0 * 5) = 4.0 → 4 step
    assert g.links[0].travel_time == 4


def test_travel_time_minimum_one():
    g = _graph()
    g.links[0].distance = 1.0  # 1/(2*5)=0.1 → round 0 → 최소 1
    g.resolve_travel_times(SimConfig(dt_seconds=5.0))
    assert g.links[0].travel_time == 1


def test_manual_travel_time_preserved():
    g = _graph()
    g.links[0].travel_time = 7
    g.resolve_travel_times(SimConfig(dt_seconds=5.0))
    assert g.links[0].travel_time == 7
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_travel_time.py -v`
Expected: FAIL with `AttributeError: ... 'resolve_travel_times'`

- [ ] **Step 3: Write minimal implementation**

Add to `StationGraph` in `sim/model.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_travel_time.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/model.py tests/test_travel_time.py
git commit -m "feat: 링크 소요시간 자동 계산"
```

---

### Task 7: 엔진 코어 — 유출/잔류/유입/지연버퍼/이탈 (발생·열차 제외)

**Files:**
- Create: `sim/engine.py`
- Test: `tests/test_engine_core.py`

**Interfaces:**
- Consumes: `StationGraph, SimConfig` (Task 1,6), `move_probability_vec` (Task 2)
- Produces:
  - `class Engine.__init__(self, graph: StationGraph, config: SimConfig)` — 내부에서 `graph.resolve_travel_times(config)` 호출, numpy 상태 구성
  - 속성: `Engine.N: np.ndarray`(현재 인원), `Engine.t: int`(현재 스텝), `Engine.node_ids: list[str]`, `Engine.total_exited: float`, `Engine.total_generated: float`
  - `Engine.step(self) -> None` — 한 스텝 진행(이 Task에서는 발생/열차 미적용)
  - 내부 도착 스케줄 `Engine._pending: dict[int, np.ndarray]`

이 Task의 step 순서(처리 시점 `s=self.t`, 이번 스텝이 `N(s+1)`을 생성): ① 이동확률(=base_move, 혼잡 미적용 단계) → ② movers=N(s)*move → ③ newN = N(s) - movers (잔류) → ④ movers를 출력링크 weight로 **도착시각** `_pending[s+τ]`에 적재(exit_weight 분은 total_exited로 제거) → ⑤ 이번 스텝 도착분 `arrivals=_pending.pop(s+1)`을 newN에 더함 → ⑥ N=newN, t+=1.

> **핵심(소요시간 정합성):** pending은 "도착 시각 인덱스"로 키잉한다. s에 출발한 인원은 `N(s+τ)`에 도착해야 하므로 `_pending[s+τ]`에 적재한다. 이번 스텝은 `N(s+1)`을 만들므로 `_pending[s+1]`을 소비한다(τ=1 인원은 같은 스텝에 적재→소비되어 `N(s+1)`에 도착). 이로써 "t에 출발 → t+τ 도착"(예: τ=3 → t+3)이 정확히 성립한다. **적재(④)를 소비(⑤)보다 먼저** 해야 τ=1이 누락되지 않는다.

> 참고: 혼잡 반영(Task 10), 발생(Task 8), 열차(Task 9)는 이후 Task에서 step에 끼워 넣는다. 본 Task는 base_move 고정으로 코어 흐름만 검증.

- [ ] **Step 1: Write the failing test**

Create `tests/test_engine_core.py`:

```python
import numpy as np
from sim.model import NodeType, Node, Link, StationGraph, SimConfig
from sim.engine import Engine


def _two_node(dist=5.0, weight=1.0, stay=0.5, tt=1):
    nodes = [
        Node(id="A", name="A", type=NodeType.PASSAGE, area=1000, base_stay_prob=stay,
             congestion_enabled=False, initial_population=100.0),
        Node(id="B", name="B", type=NodeType.PASSAGE, area=1000, base_stay_prob=1.0,
             congestion_enabled=False),
    ]
    links = [Link(source="A", target="B", distance=dist, weight=weight, travel_time=tt)]
    return StationGraph(nodes=nodes, links=links)


def test_flow_formula_one_step():
    g = _two_node(stay=0.5, tt=1)
    e = Engine(g, SimConfig(dt_seconds=5.0))
    a = e.node_ids.index("A")
    e.step()
    # A: 100*0.5(잔류) - 도착0 = 50, movers=50 → 링크로 빠짐
    assert abs(e.N[a] - 50.0) < 1e-9


def test_travel_time_delay_arrival():
    g = _two_node(stay=0.5, tt=3)  # A->B 3스텝 지연
    e = Engine(g, SimConfig(dt_seconds=5.0))
    b = e.node_ids.index("B")
    e.step()  # t0->1: B에는 아직 도착 없음
    assert abs(e.N[b]) < 1e-9
    e.step(); e.step()  # t=3 시점에 첫 코호트(50) 도착
    assert e.N[b] > 0


def test_mass_conservation_with_exit():
    # A는 50% 이동, 그 중 절반은 exit, 절반은 B로
    nodes = [
        Node(id="A", name="A", type=NodeType.PASSAGE, area=1000, base_stay_prob=0.5,
             congestion_enabled=False, initial_population=100.0, exit_weight=0.5),
        Node(id="B", name="B", type=NodeType.PASSAGE, area=1000, base_stay_prob=1.0,
             congestion_enabled=False),
    ]
    links = [Link(source="A", target="B", distance=5, weight=0.5, travel_time=1)]
    g = StationGraph(nodes=nodes, links=links)
    e = Engine(g, SimConfig(dt_seconds=5.0))
    for _ in range(10):
        e.step()
    in_system = float(e.N.sum())
    in_transit = sum(float(arr.sum()) for arr in e._pending.values())
    # 보존: 현재 + 이동중 + 누적이탈 == 초기 100 (발생 없음)
    assert abs(in_system + in_transit + e.total_exited - 100.0) < 1e-6
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_engine_core.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sim.engine'`

- [ ] **Step 3: Write minimal implementation**

Create `sim/engine.py`:

```python
from __future__ import annotations

import numpy as np

from sim.model import StationGraph, SimConfig, NodeType
from sim.pedestrian import move_probability_vec


class Engine:
    def __init__(self, graph: StationGraph, config: SimConfig):
        graph.resolve_travel_times(config)
        self.graph = graph
        self.config = config
        self.rng = np.random.default_rng(config.seed)

        self.node_ids = [n.id for n in graph.nodes]
        self._idx = {nid: i for i, nid in enumerate(self.node_ids)}
        n = len(self.node_ids)

        self.N = np.array([nd.initial_population for nd in graph.nodes], dtype=float)
        self.area = np.array([nd.area for nd in graph.nodes], dtype=float)
        self.base_move = np.array([1.0 - nd.base_stay_prob for nd in graph.nodes], dtype=float)
        self.exit_weight = np.array([nd.exit_weight for nd in graph.nodes], dtype=float)
        self.enabled = np.array([nd.congestion_enabled for nd in graph.nodes], dtype=bool)
        self.v_free = np.array([nd.weidmann.v_free for nd in graph.nodes], dtype=float)
        self.rho_max = np.array([nd.weidmann.rho_max for nd in graph.nodes], dtype=float)
        self.gamma = np.array([nd.weidmann.gamma for nd in graph.nodes], dtype=float)

        # 출력 링크: source_idx -> [(target_idx, weight, travel_time), ...]
        self.out_links: list[list[tuple[int, float, int]]] = [[] for _ in range(n)]
        for l in graph.links:
            si, ti = self._idx[l.source], self._idx[l.target]
            self.out_links[si].append((ti, l.weight, int(l.travel_time)))

        self._pending: dict[int, np.ndarray] = {}
        self.t = 0
        self.total_exited = 0.0
        self.total_generated = 0.0

    def _move_prob(self) -> np.ndarray:
        return move_probability_vec(self.N, self.area, self.base_move,
                                    self.v_free, self.rho_max, self.gamma, self.enabled)

    def step(self) -> None:
        n = len(self.node_ids)
        s = self.t
        move_prob = self.base_move  # 혼잡 미적용(Task 10에서 self._move_prob()로 교체)
        movers = self.N * move_prob
        newN = self.N - movers  # 잔류(stayers)

        # 유출 분배(링크 + exit sink): 도착시각(s+τ)으로 적재
        for i in range(n):
            m = movers[i]
            if m <= 0:
                continue
            self.total_exited += m * self.exit_weight[i]
            for (ti, w, tau) in self.out_links[i]:
                if w == 0:
                    continue
                arr = s + tau
                buf = self._pending.get(arr)
                if buf is None:
                    buf = np.zeros(n)
                    self._pending[arr] = buf
                buf[ti] += m * w

        # 이번 스텝이 만드는 N(s+1)에 도착하는 유입(τ=1 포함)
        arrivals = self._pending.pop(s + 1, np.zeros(n))
        newN = newN + arrivals

        self.N = newN
        self.t += 1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_engine_core.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/engine.py tests/test_engine_core.py
git commit -m "feat: 엔진 코어(유출/잔류/유입/지연버퍼/이탈)"
```

---

### Task 8: 엔진 발생(source) 통합

**Files:**
- Modify: `sim/engine.py`
- Test: `tests/test_engine_generation.py`

**Interfaces:**
- Consumes: `Engine` (Task 7), `build_generator` (Task 3)
- Produces: `Engine.step()`이 발생 노드(출입구/승강장의 연속 발생)를 `newN`에 더하고 `total_generated` 누적. 생성자에서 노드별 `self.generators`를 구성.

- [ ] **Step 1: Write the failing test**

Create `tests/test_engine_generation.py`:

```python
import numpy as np
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig,
                       GenerationConfig)
from sim.engine import Engine


def test_entrance_generation_adds_people():
    nodes = [
        Node(id="A", name="입구", type=NodeType.ENTRANCE, area=1000, base_stay_prob=1.0,
             congestion_enabled=False,
             generation=GenerationConfig(kind="constant", rate=2.0)),
    ]
    g = StationGraph(nodes=nodes, links=[])
    e = Engine(g, SimConfig(dt_seconds=5.0))
    a = e.node_ids.index("A")
    e.step()  # 발생 2*5=10, base_stay=1 → 이동 없음
    assert abs(e.N[a] - 10.0) < 1e-9
    e.step()
    assert abs(e.N[a] - 20.0) < 1e-9
    assert abs(e.total_generated - 20.0) < 1e-9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_engine_generation.py -v`
Expected: FAIL — `e.N[a]`가 0 (발생 미적용)

- [ ] **Step 3: Write minimal implementation**

In `sim/engine.py`, add import at top:

```python
from sim.generation import build_generator
```

In `Engine.__init__`, after building `out_links`, add:

```python
        # 노드별 발생자
        self.generators = [build_generator(nd.generation) for nd in graph.nodes]
```

In `Engine.step()`, immediately before `self.N = newN`, insert:

```python
        # 발생(source): 출입구/승강장 연속 발생
        for i in range(n):
            g = self.generators[i].amount(self.t, self.config.dt_seconds,
                                          self.rng, self.config.stochastic)
            if g:
                newN[i] += g
                self.total_generated += g
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_engine_generation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sim/engine.py tests/test_engine_generation.py
git commit -m "feat: 엔진 발생(source) 통합"
```

---

### Task 9: 엔진 승강장 열차 이벤트 (탑승 sink → 하차 source)

**Files:**
- Modify: `sim/engine.py`
- Test: `tests/test_engine_train.py`

**Interfaces:**
- Consumes: `Engine` (Task 8), `train_arrival_steps, sample_alight` (Task 4)
- Produces: 생성자에서 승강장별 `self.train_steps: dict[int, set[int]]`, `self.train_cfg: dict[int, TrainConfig]` 구성. `step()`에서 발생 처리 직후, 열차 도착 스텝이면 **탑승(min(정원, 현재인원) 제거, total_exited 누적) → 하차(sample_alight 더하기, total_generated 누적)** 순으로 처리.

- [ ] **Step 1: Write the failing test**

Create `tests/test_engine_train.py`:

```python
import numpy as np
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig, TrainConfig)
from sim.engine import Engine


def _platform_graph(capacity, alight, stay=1.0):
    nodes = [
        Node(id="P", name="승강장", type=NodeType.PLATFORM, area=1000, base_stay_prob=stay,
             congestion_enabled=False, initial_population=200.0, exit_weight=0.0,
             train=TrainConfig(first_arrival_sec=0, headway_sec=1000,
                               capacity=capacity, alight_kind="constant", alight_mean=alight)),
    ]
    return StationGraph(nodes=nodes, links=[])


def test_boarding_then_alighting_partial():
    # t=0에 열차: 대기 200 중 정원 150 탑승 → 50 남고, 하차 80 추가 → 130
    g = _platform_graph(capacity=150, alight=80)
    e = Engine(g, SimConfig(dt_seconds=5.0))
    p = e.node_ids.index("P")
    e.step()
    assert abs(e.N[p] - 130.0) < 1e-9
    assert abs(e.total_exited - 150.0) < 1e-9
    assert abs(e.total_generated - 80.0) < 1e-9


def test_boarding_capped_by_waiting():
    # 대기 200, 정원 1000 → 전원 탑승(200), 하차 0 → 0
    g = _platform_graph(capacity=1000, alight=0)
    e = Engine(g, SimConfig(dt_seconds=5.0))
    p = e.node_ids.index("P")
    e.step()
    assert abs(e.N[p] - 0.0) < 1e-9
    assert abs(e.total_exited - 200.0) < 1e-9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_engine_train.py -v`
Expected: FAIL — 열차 이벤트 미적용

- [ ] **Step 3: Write minimal implementation**

In `sim/engine.py`, add import:

```python
from sim.generation import build_generator, train_arrival_steps, sample_alight
```

In `Engine.__init__`, after `self.generators = ...`:

```python
        # 승강장 열차 스케줄
        duration = self.config.duration_seconds
        self.train_steps: dict[int, set[int]] = {}
        self.train_cfg = {}
        for i, nd in enumerate(graph.nodes):
            if nd.type == NodeType.PLATFORM and nd.train is not None:
                self.train_steps[i] = train_arrival_steps(
                    nd.train, self.config.dt_seconds, duration, self.rng,
                    self.config.stochastic)
                self.train_cfg[i] = nd.train
```

In `Engine.step()`, after the generation loop and before `self.N = newN`:

```python
        # 승강장 열차 이벤트: 탑승(sink) 먼저 → 하차(source) 나중
        for i, steps in self.train_steps.items():
            if self.t in steps:
                cfg = self.train_cfg[i]
                board = min(cfg.capacity, max(newN[i], 0.0))
                newN[i] -= board
                self.total_exited += board
                alight = sample_alight(cfg, self.rng, self.config.stochastic)
                newN[i] += alight
                self.total_generated += alight
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_engine_train.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/engine.py tests/test_engine_train.py
git commit -m "feat: 엔진 승강장 열차 탑승/하차 이벤트"
```

---

### Task 10: 혼잡도 기반 동적 이동확률 활성화

**Files:**
- Modify: `sim/engine.py`
- Test: `tests/test_engine_congestion.py`

**Interfaces:**
- Consumes: `Engine` (Task 9), `Engine._move_prob()` (Task 7에서 정의됨)
- Produces: `Engine.step()`의 `move_prob`를 `self.base_move` → `self._move_prob()`로 교체. 혼잡 시 이동확률 감소(체류 증가).

- [ ] **Step 1: Write the failing test**

Create `tests/test_engine_congestion.py`:

```python
import numpy as np
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig, WeidmannParams)
from sim.engine import Engine


def _node(pop, area, enabled):
    return Node(id="A", name="A", type=NodeType.PASSAGE, area=area, base_stay_prob=0.2,
                congestion_enabled=enabled, initial_population=pop, exit_weight=1.0,
                weidmann=WeidmannParams())


def _run_one(pop, area, enabled):
    g = StationGraph(nodes=[_node(pop, area, enabled)], links=[])
    e = Engine(g, SimConfig(dt_seconds=5.0))
    before = float(e.N[0])
    e.step()
    moved = before - float(e.N[0])  # exit_weight=1 이므로 빠져나간 양 = 이동량
    return moved / before  # 실효 이동확률


def test_congestion_reduces_move_probability():
    # 같은 base_move=0.8 이지만, 혼잡(고밀도)에서 실효 이동확률이 더 낮아야 함
    low = _run_one(pop=5.0, area=10.0, enabled=True)      # 밀도 0.5
    high = _run_one(pop=500.0, area=10.0, enabled=True)   # 밀도 50 (>rho_max → 거의 정지)
    assert high < low
    assert high < 0.8


def test_disabled_keeps_base_move():
    val = _run_one(pop=500.0, area=10.0, enabled=False)
    assert abs(val - 0.8) < 1e-9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_engine_congestion.py -v`
Expected: FAIL — `test_congestion_reduces_move_probability` (현재 base_move 고정)

- [ ] **Step 3: Write minimal implementation**

In `sim/engine.py`, in `Engine.step()`, replace:

```python
        move_prob = self.base_move  # 혼잡 미적용(Task 10에서 self._move_prob()로 교체)
```

with:

```python
        move_prob = self._move_prob()  # 혼잡도 기반 동적 이동확률
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_engine_congestion.py -v`
Expected: PASS (2 tests)

또한 회귀 확인: `pytest tests/test_engine_core.py -v` (core 테스트는 `congestion_enabled=False`로 작성되어 영향 없음) → PASS

- [ ] **Step 5: Commit**

```bash
git add sim/engine.py tests/test_engine_congestion.py
git commit -m "feat: 혼잡도 기반 동적 이동확률 활성화"
```

---

### Task 11: Engine.run() 전체 루프 + 이력 기록 + 스냅샷

**Files:**
- Modify: `sim/engine.py`
- Test: `tests/test_engine_run.py`

**Interfaces:**
- Consumes: `Engine` (Task 10)
- Produces:
  - `Engine.num_steps` (int) = `round(duration_seconds / dt_seconds)`
  - `Engine.history: np.ndarray` shape `(num_steps + 1, n_nodes)` — 행 0 = 초기상태 N(0), 행 t = step 후 상태
  - `Engine.run(self, on_progress=None) -> np.ndarray` — `num_steps`회 step 실행 후 history 반환. `on_progress(t, num_steps)` 콜백(옵션, 진행률/스냅샷용)
  - `Engine.snapshot(self) -> dict` — `{"t": int, "time_sec": float, "N": list[float], "node_ids": list[str], "total_generated": float, "total_exited": float}`

- [ ] **Step 1: Write the failing test**

Create `tests/test_engine_run.py`:

```python
import numpy as np
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig,
                       GenerationConfig)
from sim.engine import Engine


def _golden_graph():
    # A(입구, 상수발생) -> B(통로) -> exit
    nodes = [
        Node(id="A", name="입구", type=NodeType.ENTRANCE, area=1000, base_stay_prob=0.5,
             congestion_enabled=False,
             generation=GenerationConfig(kind="constant", rate=2.0)),
        Node(id="B", name="통로", type=NodeType.PASSAGE, area=1000, base_stay_prob=0.5,
             congestion_enabled=False, exit_weight=1.0),
    ]
    links = [Link(source="A", target="B", distance=5, weight=1.0, travel_time=1)]
    return StationGraph(nodes=nodes, links=links)


def test_history_shape_and_initial_row():
    g = _golden_graph()
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=50.0))
    hist = e.run()
    assert hist.shape == (11, 2)        # num_steps=10 → 11행
    assert np.allclose(hist[0], [0.0, 0.0])  # 초기상태


def test_snapshot_fields():
    g = _golden_graph()
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=10.0))
    e.run()
    snap = e.snapshot()
    assert snap["t"] == 2
    assert snap["time_sec"] == 10.0
    assert snap["node_ids"] == ["A", "B"]
    assert len(snap["N"]) == 2


def test_progress_callback_called():
    g = _golden_graph()
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=50.0))
    seen = []
    e.run(on_progress=lambda t, total: seen.append((t, total)))
    assert seen[-1] == (10, 10)


def test_golden_first_two_steps():
    # 손계산: A발생=10/스텝, stay=0.5, A->B weight1 tt1, B exit_weight1 stay0.5
    g = _golden_graph()
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=15.0))
    hist = e.run()
    # t1: A = 0*0.5 + 0(도착) + 10(발생) = 10 ; B = 0
    assert abs(hist[1][0] - 10.0) < 1e-9
    assert abs(hist[1][1] - 0.0) < 1e-9
    # t2: A movers(t1)=10*0.5=5 →B 지연1 ; A=10*0.5+0+10=15 ; B(t2)=0+arrivals(5 from t1 movers? tt1 도착 t2)=5
    assert abs(hist[2][0] - 15.0) < 1e-9
    assert abs(hist[2][1] - 5.0) < 1e-9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_engine_run.py -v`
Expected: FAIL with `AttributeError: ... 'run'`

- [ ] **Step 3: Write minimal implementation**

In `sim/engine.py`, at end of `Engine.__init__` add:

```python
        self.num_steps = int(round(self.config.duration_seconds / self.config.dt_seconds))
        self.history = np.zeros((self.num_steps + 1, len(self.node_ids)))
        self.history[0] = self.N
```

Add methods to `Engine`:

```python
    def run(self, on_progress=None) -> np.ndarray:
        for _ in range(self.num_steps):
            self.step()
            self.history[self.t] = self.N
            if on_progress is not None:
                on_progress(self.t, self.num_steps)
        return self.history

    def snapshot(self) -> dict:
        return {
            "t": int(self.t),
            "time_sec": float(self.t * self.config.dt_seconds),
            "N": [float(x) for x in self.N],
            "node_ids": list(self.node_ids),
            "total_generated": float(self.total_generated),
            "total_exited": float(self.total_exited),
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_engine_run.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/engine.py tests/test_engine_run.py
git commit -m "feat: Engine.run 전체 루프 및 이력/스냅샷"
```

---

### Task 12: CSV 내보내기 (혼잡도 시계열)

**Files:**
- Create: `sim/io.py`
- Test: `tests/test_io_csv.py`

**Interfaces:**
- Consumes: `Engine.history`, `Engine.node_ids` (Task 11), `SimConfig`
- Produces:
  - `history_to_csv(history: np.ndarray, node_ids: list[str], dt_seconds: float, layout: str = "wide") -> str`
    - wide: 헤더 `step,time_sec,<node_id>...`, 각 행은 시점별 인원
    - long: 헤더 `step,time_sec,node,congestion`

- [ ] **Step 1: Write the failing test**

Create `tests/test_io_csv.py`:

```python
import numpy as np
from sim.io import history_to_csv


def test_wide_csv_header_and_rows():
    hist = np.array([[0.0, 0.0], [10.0, 5.0]])
    csv = history_to_csv(hist, ["A", "B"], dt_seconds=5.0, layout="wide")
    lines = csv.strip().splitlines()
    assert lines[0] == "step,time_sec,A,B"
    assert lines[1] == "0,0.0,0.0,0.0"
    assert lines[2] == "1,5.0,10.0,5.0"


def test_long_csv():
    hist = np.array([[0.0, 0.0], [10.0, 5.0]])
    csv = history_to_csv(hist, ["A", "B"], dt_seconds=5.0, layout="long")
    lines = csv.strip().splitlines()
    assert lines[0] == "step,time_sec,node,congestion"
    assert "1,5.0,A,10.0" in lines
    assert "1,5.0,B,5.0" in lines
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_io_csv.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sim.io'`

- [ ] **Step 3: Write minimal implementation**

Create `sim/io.py`:

```python
from __future__ import annotations

import numpy as np


def history_to_csv(history: np.ndarray, node_ids: list[str],
                   dt_seconds: float, layout: str = "wide") -> str:
    rows = []
    if layout == "wide":
        rows.append(",".join(["step", "time_sec"] + list(node_ids)))
        for t in range(history.shape[0]):
            vals = [str(t), str(t * dt_seconds)]
            vals += [str(float(history[t, j])) for j in range(len(node_ids))]
            rows.append(",".join(vals))
    elif layout == "long":
        rows.append("step,time_sec,node,congestion")
        for t in range(history.shape[0]):
            for j, nid in enumerate(node_ids):
                rows.append(f"{t},{t * dt_seconds},{nid},{float(history[t, j])}")
    else:
        raise ValueError(f"알 수 없는 layout: {layout}")
    return "\n".join(rows) + "\n"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_io_csv.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/io.py tests/test_io_csv.py
git commit -m "feat: 혼잡도 시계열 CSV 내보내기"
```

---

### Task 13: GNN(STGCN) 번들 내보내기 (행렬 + 노드 특성)

**Files:**
- Modify: `sim/io.py`
- Test: `tests/test_io_gnn.py`

**Interfaces:**
- Consumes: `StationGraph` (Task 1)
- Produces: `gnn_bundle(graph: StationGraph) -> dict[str, str]` — 키: `adjacency`(가중 인접행렬), `distance`(거리행렬), `travel_time`(소요시간 행렬), `node_features`(노드 특성표 CSV). 행렬 CSV의 첫 행/열은 노드 id 라벨.

규칙: 노드 순서는 `graph.nodes` 순. 인접행렬 `A[i][j]` = source=i, target=j 링크의 weight 합(없으면 0). distance/travel_time 도 동일 위치에 값(없으면 0).

- [ ] **Step 1: Write the failing test**

Create `tests/test_io_gnn.py`:

```python
from sim.model import NodeType, Node, Link, StationGraph
from sim.io import gnn_bundle


def _g():
    nodes = [
        Node(id="A", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.5),
        Node(id="B", name="통로", type=NodeType.PASSAGE, area=30, base_stay_prob=0.5),
    ]
    links = [Link(source="A", target="B", distance=40, weight=1.0, travel_time=3)]
    return StationGraph(nodes=nodes, links=links)


def test_adjacency_matrix():
    b = gnn_bundle(_g())
    lines = b["adjacency"].strip().splitlines()
    assert lines[0] == ",A,B"
    assert lines[1] == "A,0.0,1.0"   # A행: A->A=0.0, A->B=1.0(열 순서 [A,B])
    assert lines[2] == "B,0.0,0.0"


def test_distance_and_travel_time():
    b = gnn_bundle(_g())
    assert "A,0.0,40.0" in b["distance"]
    assert "A,0,3" in b["travel_time"]


def test_node_features():
    b = gnn_bundle(_g())
    lines = b["node_features"].strip().splitlines()
    assert lines[0] == "id,name,type,area"
    assert lines[1] == "A,입구,entrance,50.0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_io_gnn.py -v`
Expected: FAIL with `ImportError: cannot import name 'gnn_bundle'`

- [ ] **Step 3: Write minimal implementation**

Append to `sim/io.py`:

```python
from sim.model import StationGraph


def gnn_bundle(graph: StationGraph) -> dict[str, str]:
    ids = [n.id for n in graph.nodes]
    idx = {nid: i for i, nid in enumerate(ids)}
    n = len(ids)
    adj = [[0.0] * n for _ in range(n)]
    dist = [[0.0] * n for _ in range(n)]
    tt = [[0] * n for _ in range(n)]
    for l in graph.links:
        i, j = idx[l.source], idx[l.target]
        adj[i][j] += l.weight
        dist[i][j] = l.distance
        tt[i][j] = int(l.travel_time)

    def matrix_csv(mat) -> str:
        rows = ["," + ",".join(ids)]
        for i, nid in enumerate(ids):
            rows.append(nid + "," + ",".join(str(v) for v in mat[i]))
        return "\n".join(rows) + "\n"

    feat_rows = ["id,name,type,area"]
    for node in graph.nodes:
        feat_rows.append(f"{node.id},{node.name},{node.type.value},{float(node.area)}")

    return {
        "adjacency": matrix_csv(adj),
        "distance": matrix_csv(dist),
        "travel_time": matrix_csv(tt),
        "node_features": "\n".join(feat_rows) + "\n",
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_io_gnn.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/io.py tests/test_io_gnn.py
git commit -m "feat: GNN(STGCN) 번들 내보내기"
```

---

### Task 14: 설정 저장/불러오기 + 관측 노이즈(선택)

**Files:**
- Modify: `sim/io.py`
- Test: `tests/test_io_config.py`

**Interfaces:**
- Consumes: `StationGraph` (Task 1), `SimConfig` (Task 1)
- Produces:
  - `save_config(graph: StationGraph, config: SimConfig) -> str` — `{"graph": graph.to_json(), "config": {...}}` JSON 문자열
  - `load_config(text: str) -> tuple[StationGraph, SimConfig]`
  - `apply_observation_noise(history: np.ndarray, config: SimConfig, rng) -> np.ndarray` — `observation_noise_std>0`이면 가우시안 노이즈(음수 클립), `missing_prob>0`이면 무작위 NaN 삽입. 둘 다 0이면 입력 그대로 복사 반환.

- [ ] **Step 1: Write the failing test**

Create `tests/test_io_config.py`:

```python
import numpy as np
from dataclasses import asdict
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig)
from sim.io import save_config, load_config, apply_observation_noise


def _g():
    nodes = [Node(id="A", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.5,
                  exit_weight=1.0)]
    return StationGraph(nodes=nodes, links=[])


def test_config_round_trip():
    g = _g()
    cfg = SimConfig(dt_seconds=10.0, duration_seconds=600.0, seed=7, stochastic=True)
    text = save_config(g, cfg)
    g2, cfg2 = load_config(text)
    assert g2.to_json() == g.to_json()
    assert asdict(cfg2) == asdict(cfg)


def test_observation_noise_disabled_is_passthrough():
    hist = np.array([[1.0, 2.0], [3.0, 4.0]])
    out = apply_observation_noise(hist, SimConfig(), np.random.default_rng(0))
    assert np.allclose(out, hist)
    assert out is not hist  # 복사본


def test_observation_noise_and_missing():
    hist = np.full((100, 2), 50.0)
    cfg = SimConfig(observation_noise_std=5.0, missing_prob=0.2)
    out = apply_observation_noise(hist, cfg, np.random.default_rng(0))
    valid = out[~np.isnan(out)]
    assert valid.min() >= 0.0                 # 음수 클립
    assert abs(np.nanmean(out) - 50.0) < 2.0  # 평균 보존
    assert np.isnan(out).mean() > 0.1         # 결측 일부 발생
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_io_config.py -v`
Expected: FAIL with `ImportError: cannot import name 'save_config'`

- [ ] **Step 3: Write minimal implementation**

Append to `sim/io.py` (add `import json` and `from sim.model import SimConfig` at top of file):

```python
import json
from dataclasses import asdict
from sim.model import SimConfig


def save_config(graph: StationGraph, config: SimConfig) -> str:
    return json.dumps({"graph": graph.to_json(), "config": asdict(config)},
                      ensure_ascii=False, indent=2)


def load_config(text: str) -> tuple[StationGraph, SimConfig]:
    data = json.loads(text)
    graph = StationGraph.from_json(data["graph"])
    config = SimConfig(**data["config"])
    return graph, config


def apply_observation_noise(history: np.ndarray, config: SimConfig, rng) -> np.ndarray:
    out = history.copy()
    if config.observation_noise_std > 0:
        out = out + rng.normal(0.0, config.observation_noise_std, size=out.shape)
        out = np.clip(out, 0.0, None)
    if config.missing_prob > 0:
        mask = rng.random(out.shape) < config.missing_prob
        out[mask] = np.nan
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_io_config.py -v`
Expected: PASS (3 tests)

전체 회귀: `pytest -v` → 모든 테스트 PASS

- [ ] **Step 5: Commit**

```bash
git add sim/io.py tests/test_io_config.py
git commit -m "feat: 설정 저장/불러오기 및 관측 노이즈"
```

---

## 완료 기준 (Definition of Done)

- `pytest -v` 전체 통과.
- `sim/` 패키지가 numpy만 의존하며, 파일 I/O 없이 문자열 반환.
- 핵심 시나리오(입구 발생 → 통로 → 승강장 탑승/하차, 혼잡 시 체류 증가, 소요시간 지연)가 테스트로 검증됨.
- 질량 보존(현재 + 이동중 + 이탈 = 초기 + 발생)이 성립.

## 다음 계획 (별도 문서로 작성 예정)

**계획 2 — 웹 프런트엔드:** Pyodide Web Worker 래퍼(이 코어 호출), React 그래프 에디터(React Flow), 실시간 대시보드(Plotly), 시뮬레이션 제어(배속/일시정지/스텝), 배치 실행(N회 시드/파라미터 변주 → JSZip ZIP 다운로드), GitHub Pages 배포(Actions).
