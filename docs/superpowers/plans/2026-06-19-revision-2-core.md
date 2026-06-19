# Revision-2 Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Python 코어(`sim/`)에 엘리베이터 배치 운송(A), 승강장 train mode 분리(B), 그룹 검증 완화(C)를 TDD로 구현한다.

**Architecture:** `sim/model.py`에 `ElevatorConfig` dataclass와 `TrainConfig.mode` 필드를 추가하고, `sim/engine.py`에서 엘리베이터 전용 step 분기와 mode-aware 열차 이벤트를 구현한다. `validate()`는 엘리베이터 노드 검증 규칙과 완화된 그룹 규칙(하차 2개 이상만 오류)을 반영한다.

**Tech Stack:** Python 3.11+, dataclasses, numpy, pytest

## Global Constraints

- 브랜치: `feature/revision-2`
- 테스트 실행: `python -m pytest -q` (프로젝트 루트에서)
- 기존 105개 테스트 중 `test_group_two_platforms_raises_error` 하나만 수정, 나머지는 모두 통과
- 하위 호환: `TrainConfig.mode` 기본값 `"both"`, `Node.elevator` 기본값 `None`
- 수정 대상 파일: `sim/model.py`, `sim/engine.py`, `tests/test_validate.py`(1개 테스트 수정 + 신규 추가), `tests/test_engine_train.py`(신규 추가)
- 새 파일: `tests/test_revision2.py` (신규 테스트 전용)
- SDD 작성 위치: `.superpowers/sdd/rev2-core.md`

---

## File Map

| 파일 | 역할 |
|------|------|
| `sim/model.py` | `ElevatorConfig` dataclass 추가, `Node.elevator` 필드 추가, `TrainConfig.mode` 필드 추가, `from_json` elevator 복원, `validate()` 규칙 갱신 |
| `sim/engine.py` | `__init__`에 `elevator_cfg` 빌드, `step()`에 elevator 전용 movers 오버라이드, 열차 이벤트에 mode 분기 |
| `tests/test_validate.py` | `test_group_two_platforms_raises_error` 업데이트 (기존 1개 수정) |
| `tests/test_revision2.py` | 신규: 엘리베이터, train mode, 그룹 완화 검증 테스트 모두 포함 |

---

## Task 1: 브랜치 생성 및 RED 테스트 작성

**Files:**
- Create: `tests/test_revision2.py`
- Modify: `tests/test_validate.py:101-107` (test_group_two_platforms_raises_error)

**Interfaces:**
- Produces: RED 테스트들 — `test_revision2.py`의 모든 테스트가 실패(ImportError 또는 AttributeError), `test_validate.py`의 수정된 테스트도 실패

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout -b feature/revision-2
```

- [ ] **Step 2: `tests/test_validate.py`의 `test_group_two_platforms_raises_error` 업데이트**

현재 코드(`tests/test_validate.py:101-107`):
```python
def test_group_two_platforms_raises_error():
    """한 그룹에 PLATFORM이 2개 이상이면 validate() 오류를 반환해야 한다."""
    p1 = _platform_node("P1", group="GRP")
    p2 = _platform_node("P2", group="GRP")
    g = StationGraph(nodes=[p1, p2], links=[])
    errs = g.validate()
    assert any("승강장" in e and "GRP" in e for e in errs), f"예상 오류 없음: {errs}"
```

새 코드로 교체:
```python
def test_group_two_alight_platforms_raises_error():
    """한 그룹에 하차(alight) 역할 PLATFORM이 2개 이상이면 validate() 오류를 반환해야 한다."""
    # _platform_node는 TrainConfig(mode 기본="both")이므로 둘 다 하차 역할
    p1 = _platform_node("P1", group="GRP")
    p2 = _platform_node("P2", group="GRP")
    g = StationGraph(nodes=[p1, p2], links=[])
    errs = g.validate()
    assert any("하차" in e and "GRP" in e for e in errs), f"예상 오류 없음: {errs}"


def test_group_board_plus_alight_platform_no_error():
    """한 그룹에 board 승강장 1개 + alight 승강장 1개이면 오류가 없어야 한다."""
    from sim.model import TrainConfig
    p_board = _platform_node("PB", group="GRP")
    p_board.train = TrainConfig(first_arrival_sec=60, headway_sec=300, mode="board")
    p_alight = _platform_node("PA", group="GRP")
    p_alight.train = TrainConfig(first_arrival_sec=60, headway_sec=300, mode="alight")
    g = StationGraph(nodes=[p_board, p_alight], links=[])
    errs = g.validate()
    group_errs = [e for e in errs if "하차" in e and "GRP" in e]
    assert group_errs == [], f"오류가 없어야 함: {group_errs}"
```

- [ ] **Step 3: `tests/test_revision2.py` 신규 테스트 파일 작성**

```python
"""Revision-2 신규 기능 TDD 테스트.

A. 엘리베이터 배치 운송
B. TrainConfig.mode (alight/board 분리)
C. 그룹 검증 완화 (하차 2개 이상만 오류)
"""
from __future__ import annotations

import numpy as np
import pytest

from sim.model import (
    NodeType, Node, Link, StationGraph, SimConfig,
    TrainConfig, ElevatorConfig,
)
from sim.engine import Engine


# ─────────────────────────────────────────────
# A. 엘리베이터 배치 운송
# ─────────────────────────────────────────────

def _elevator_graph(capacity: float, speed: int, initial_pop: float) -> StationGraph:
    """단일 엘리베이터 노드, exit_weight=1.0 (출력 링크 없음)."""
    node = Node(
        id="EL", name="엘리베이터", type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0,
        congestion_enabled=False,
        initial_population=initial_pop,
        exit_weight=1.0,
        elevator=ElevatorConfig(capacity=capacity, speed=speed),
    )
    return StationGraph(nodes=[node], links=[])


def test_elevator_holds_between_cycles():
    """speed=3일 때 t=0,1 스텝에서는 유출이 없고 t=2(3번째 스텝)에서 capacity만큼 유출."""
    g = _elevator_graph(capacity=5.0, speed=3, initial_pop=20.0)
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=30.0))
    idx = e.node_ids.index("EL")

    # step 0 → s=0, (0+1)%3=1 ≠ 0 → 유출 없음
    e.step()
    assert abs(e.N[idx] - 20.0) < 1e-9, f"step1 후 N={e.N[idx]}, 20이어야 함"
    assert abs(e.total_exited - 0.0) < 1e-9

    # step 1 → s=1, (1+1)%3=2 ≠ 0 → 유출 없음
    e.step()
    assert abs(e.N[idx] - 20.0) < 1e-9, f"step2 후 N={e.N[idx]}, 20이어야 함"
    assert abs(e.total_exited - 0.0) < 1e-9

    # step 2 → s=2, (2+1)%3=0 → min(5, 20)=5 유출
    e.step()
    assert abs(e.N[idx] - 15.0) < 1e-9, f"step3 후 N={e.N[idx]}, 15이어야 함"
    assert abs(e.total_exited - 5.0) < 1e-9, f"total_exited={e.total_exited}, 5이어야 함"


def test_elevator_releases_at_each_cycle():
    """두 번째 주기(s=5)에도 5 유출, 누적 10."""
    g = _elevator_graph(capacity=5.0, speed=3, initial_pop=20.0)
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=30.0))
    idx = e.node_ids.index("EL")

    for _ in range(6):  # 0..5 스텝 → s=2,5에서 각각 5 유출
        e.step()

    assert abs(e.N[idx] - 10.0) < 1e-9, f"6스텝 후 N={e.N[idx]}, 10이어야 함"
    assert abs(e.total_exited - 10.0) < 1e-9


def test_elevator_capacity_caps_release():
    """pop < capacity일 때 min(capacity, pop)이 유출된다."""
    g = _elevator_graph(capacity=100.0, speed=1, initial_pop=3.0)
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=10.0))
    idx = e.node_ids.index("EL")

    # speed=1 → (0+1)%1=0 → 첫 스텝에 min(100,3)=3 유출
    e.step()
    assert abs(e.N[idx] - 0.0) < 1e-9
    assert abs(e.total_exited - 3.0) < 1e-9


# ─────────────────────────────────────────────
# A. 엘리베이터 validate() 검증
# ─────────────────────────────────────────────

def _elev_node(nid: str, elevator=None, train=None, generation=None) -> Node:
    return Node(
        id=nid, name=nid, type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0,
        exit_weight=1.0,
        elevator=elevator,
        train=train,
        generation=generation,
    )


def test_elevator_without_config_raises_error():
    """엘리베이터 노드에 elevator 설정이 없으면 오류."""
    n = _elev_node("EL", elevator=None)
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("엘리베이터" in e and "EL" in e for e in errs), f"예상 오류 없음: {errs}"


def test_elevator_capacity_zero_raises_error():
    """엘리베이터 capacity <= 0이면 오류."""
    n = _elev_node("EL", elevator=ElevatorConfig(capacity=0.0, speed=3))
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("capacity" in e.lower() or "용량" in e for e in errs), f"예상 오류 없음: {errs}"


def test_elevator_speed_zero_raises_error():
    """엘리베이터 speed < 1이면 오류."""
    n = _elev_node("EL", elevator=ElevatorConfig(capacity=10.0, speed=0))
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("speed" in e.lower() or "속력" in e for e in errs), f"예상 오류 없음: {errs}"


def test_elevator_with_train_raises_error():
    """엘리베이터 노드에 train이 있으면 오류."""
    n = _elev_node(
        "EL",
        elevator=ElevatorConfig(capacity=10.0, speed=3),
        train=TrainConfig(first_arrival_sec=60, headway_sec=300),
    )
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("train" in e.lower() or "열차" in e for e in errs), f"예상 오류 없음: {errs}"


def test_elevator_with_generation_raises_error():
    """엘리베이터 노드에 generation이 있으면 오류."""
    from sim.model import GenerationConfig
    n = _elev_node(
        "EL",
        elevator=ElevatorConfig(capacity=10.0, speed=3),
        generation=GenerationConfig(kind="constant", rate=1.0),
    )
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("generation" in e.lower() or "발생" in e for e in errs), f"예상 오류 없음: {errs}"


def test_non_elevator_with_elevator_config_raises_error():
    """엘리베이터 아닌 노드에 elevator 설정이 있으면 오류."""
    n = Node(
        id="P", name="통로", type=NodeType.PASSAGE,
        area=10.0, base_stay_prob=1.0, exit_weight=0.0,
        elevator=ElevatorConfig(capacity=10.0, speed=3),
    )
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("elevator" in e.lower() or "엘리베이터" in e for e in errs), f"예상 오류 없음: {errs}"


def test_valid_elevator_node_no_error():
    """올바른 엘리베이터 노드는 오류 없어야 한다."""
    n = _elev_node("EL", elevator=ElevatorConfig(capacity=10.0, speed=3))
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    elev_errs = [e for e in errs if "EL" in e]
    assert elev_errs == [], f"오류가 없어야 함: {elev_errs}"


# ─────────────────────────────────────────────
# B. TrainConfig.mode
# ─────────────────────────────────────────────

def _platform_graph_mode(mode: str, initial_pop: float = 100.0) -> tuple[StationGraph, Engine]:
    """단일 승강장, exit_weight=0, base_stay=1.0, 열차 t=0 도착."""
    nodes = [
        Node(
            id="P", name="승강장", type=NodeType.PLATFORM,
            area=1000.0, base_stay_prob=1.0,
            congestion_enabled=False,
            initial_population=initial_pop,
            exit_weight=0.0,
            train=TrainConfig(
                first_arrival_sec=0, headway_sec=10000,
                capacity=50.0, alight_kind="constant", alight_mean=30.0,
                mode=mode,
            ),
        )
    ]
    g = StationGraph(nodes=nodes, links=[])
    e = Engine(g, SimConfig(dt_seconds=5.0, duration_seconds=3600.0))
    return g, e


def test_train_mode_both_boards_and_alights():
    """mode=both: 탑승(sink)+하차(source) 모두 발생."""
    _, e = _platform_graph_mode("both", initial_pop=100.0)
    idx = e.node_ids.index("P")
    e.step()
    # 탑승: min(50, 100)=50 → 나머지 50, 하차: 30 추가 → 80
    assert abs(e.N[idx] - 80.0) < 1e-9, f"N={e.N[idx]}"
    assert abs(e.total_exited - 50.0) < 1e-9
    assert abs(e.total_generated - 30.0) < 1e-9


def test_train_mode_board_only_boards_no_alight():
    """mode=board: 탑승만, 하차 없음."""
    _, e = _platform_graph_mode("board", initial_pop=100.0)
    idx = e.node_ids.index("P")
    e.step()
    # 탑승: min(50, 100)=50 → 나머지 50, 하차 없음
    assert abs(e.N[idx] - 50.0) < 1e-9, f"N={e.N[idx]}"
    assert abs(e.total_exited - 50.0) < 1e-9
    assert abs(e.total_generated - 0.0) < 1e-9


def test_train_mode_alight_only_alights_no_board():
    """mode=alight: 하차만, 탑승 없음."""
    _, e = _platform_graph_mode("alight", initial_pop=100.0)
    idx = e.node_ids.index("P")
    e.step()
    # 탑승 없음, 하차: 30 추가 → 130
    assert abs(e.N[idx] - 130.0) < 1e-9, f"N={e.N[idx]}"
    assert abs(e.total_exited - 0.0) < 1e-9
    assert abs(e.total_generated - 30.0) < 1e-9


# ─────────────────────────────────────────────
# B. TrainConfig.mode validate()
# ─────────────────────────────────────────────

def _platform_node_mode(nid: str, mode: str, group: str = "") -> Node:
    return Node(
        id=nid, name=nid, type=NodeType.PLATFORM,
        area=100.0, base_stay_prob=0.5, exit_weight=1.0,
        group=group,
        train=TrainConfig(first_arrival_sec=60, headway_sec=300, mode=mode),
    )


def test_train_invalid_mode_raises_error():
    """train.mode가 both/alight/board 이외이면 오류."""
    n = _platform_node_mode("P1", mode="sink")
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("mode" in e.lower() or "both" in e for e in errs), f"예상 오류 없음: {errs}"


def test_train_valid_modes_ok():
    """train.mode가 both/alight/board이면 mode 관련 오류 없음."""
    for mode in ("both", "alight", "board"):
        n = _platform_node_mode("P1", mode=mode)
        g = StationGraph(nodes=[n], links=[])
        errs = g.validate()
        mode_errs = [e for e in errs if "mode" in e.lower() and "P1" in e]
        assert mode_errs == [], f"mode={mode}에서 오류: {mode_errs}"


# ─────────────────────────────────────────────
# C. 그룹 완화 검증
# ─────────────────────────────────────────────

def test_group_two_board_platforms_no_error():
    """한 그룹에 board 승강장 2개는 허용."""
    p1 = _platform_node_mode("P1", mode="board", group="GRP")
    p2 = _platform_node_mode("P2", mode="board", group="GRP")
    g = StationGraph(nodes=[p1, p2], links=[])
    errs = g.validate()
    alight_errs = [e for e in errs if "하차" in e and "GRP" in e]
    assert alight_errs == [], f"오류가 없어야 함: {alight_errs}"


def test_group_two_alight_platforms_raises_error():
    """한 그룹에 alight 승강장 2개는 오류 (하차 중복)."""
    p1 = _platform_node_mode("P1", mode="alight", group="GRP")
    p2 = _platform_node_mode("P2", mode="alight", group="GRP")
    g = StationGraph(nodes=[p1, p2], links=[])
    errs = g.validate()
    assert any("하차" in e and "GRP" in e for e in errs), f"예상 오류 없음: {errs}"


def test_group_two_elevators_no_error():
    """한 그룹에 엘리베이터 2개는 허용."""
    e1 = Node(
        id="EL1", name="EL1", type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0, exit_weight=1.0, group="ELGRP",
        elevator=ElevatorConfig(capacity=10.0, speed=3),
    )
    e2 = Node(
        id="EL2", name="EL2", type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0, exit_weight=1.0, group="ELGRP",
        elevator=ElevatorConfig(capacity=10.0, speed=3),
    )
    g = StationGraph(nodes=[e1, e2], links=[])
    errs = g.validate()
    group_errs = [e for e in errs if "ELGRP" in e]
    assert group_errs == [], f"오류가 없어야 함: {group_errs}"


# ─────────────────────────────────────────────
# A. ElevatorConfig JSON round-trip
# ─────────────────────────────────────────────

def test_elevator_config_roundtrip_json():
    """ElevatorConfig가 to_json/from_json을 거쳐도 보존된다."""
    n = Node(
        id="EL", name="EL", type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0, exit_weight=1.0,
        elevator=ElevatorConfig(capacity=7.5, speed=4),
    )
    graph = StationGraph(nodes=[n], links=[])
    data = graph.to_json()
    graph2 = StationGraph.from_json(data)
    el = graph2.nodes[0].elevator
    assert el is not None
    assert abs(el.capacity - 7.5) < 1e-9
    assert el.speed == 4
```

- [ ] **Step 4: 테스트 실패 확인 (RED)**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)"
python -m pytest tests/test_revision2.py tests/test_validate.py::test_group_two_alight_platforms_raises_error -q 2>&1 | head -30
```

예상: `ImportError: cannot import name 'ElevatorConfig'` 또는 `AttributeError: mode` 류 오류로 FAILED.

---

## Task 2: `sim/model.py` — ElevatorConfig, Node.elevator, TrainConfig.mode 추가

**Files:**
- Modify: `sim/model.py`

**Interfaces:**
- Consumes: 없음(신규)
- Produces:
  - `ElevatorConfig(capacity: float = 10.0, speed: int = 3)` dataclass
  - `Node.elevator: ElevatorConfig | None = None` (train 필드 다음)
  - `TrainConfig.mode: str = "both"`
  - `StationGraph.from_json()` — elevator 복원

- [ ] **Step 1: `ElevatorConfig` dataclass 추가**

`sim/model.py`에서 `TrainConfig` dataclass 위에 삽입:

```python
@dataclass
class ElevatorConfig:
    capacity: float = 10.0   # 1회 운송 인원
    speed: int = 3            # 출발 주기(slot 수)
```

- [ ] **Step 2: `TrainConfig`에 `mode` 필드 추가**

`TrainConfig` dataclass의 `alight_std` 줄 다음에 추가:

```python
    mode: str = "both"        # "both" | "alight" | "board"
```

- [ ] **Step 3: `Node`에 `elevator` 필드 추가**

`Node` dataclass에서 `train: TrainConfig | None = None` 줄 다음에 추가:

```python
    elevator: ElevatorConfig | None = None
```

- [ ] **Step 4: `from_json`에 elevator 복원 추가**

`StationGraph.from_json` 메서드에서 `tr = nd.get("train")` 블록 다음에 추가:

```python
            el = nd.get("elevator")
            nd["elevator"] = ElevatorConfig(**_known_kwargs(ElevatorConfig, el)) if el else None
```

- [ ] **Step 5: 테스트 일부 통과 확인**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)"
python -m pytest tests/test_revision2.py::test_elevator_config_roundtrip_json -v
```

예상: PASSED

---

## Task 3: `sim/model.py` — `validate()` 갱신 (엘리베이터 + mode + 그룹 완화)

**Files:**
- Modify: `sim/model.py` (`validate()` 메서드)

**Interfaces:**
- Consumes: `ElevatorConfig`, `TrainConfig.mode` (Task 2에서 추가)
- Produces: 엘리베이터 검증, mode 검증, 완화된 그룹 플랫폼 규칙

- [ ] **Step 1: 엘리베이터 노드 검증 규칙 추가**

`validate()` 메서드에서 기존 PLATFORM 검증 블록(`if n.type == NodeType.PLATFORM and n.train is None:`) 다음에 삽입:

```python
            # ELEVATOR 노드 검증
            if n.type == NodeType.ELEVATOR:
                if n.elevator is None:
                    errors.append(f"노드 {n.id}: 엘리베이터는 용량/속력 설정(elevator)이 필요")
                else:
                    if n.elevator.capacity <= 0:
                        errors.append(f"노드 {n.id}: elevator capacity는 0보다 커야 함")
                    if n.elevator.speed < 1:
                        errors.append(f"노드 {n.id}: elevator speed는 1 이상이어야 함")
                if n.train is not None:
                    errors.append(f"노드 {n.id}: 엘리베이터 노드에는 열차 설정(train)이 불가")
                if n.generation is not None:
                    errors.append(f"노드 {n.id}: 엘리베이터 노드에는 발생 설정(generation)이 불가")
            # 엘리베이터 아닌 노드에 elevator 설정 금지
            if n.type != NodeType.ELEVATOR and n.elevator is not None:
                errors.append(f"노드 {n.id}: 엘리베이터 설정은 엘리베이터 노드만 가능")
```

- [ ] **Step 2: `generation` 허용 타입에 ELEVATOR 제외 이미 처리됨 확인**

기존 코드:
```python
if n.generation is not None and n.type not in (NodeType.ENTRANCE, NodeType.PLATFORM):
    errors.append(f"노드 {n.id}: 발생은 출입구/승강장만 가능")
```

이 규칙이 ELEVATOR 노드에도 적용되어 `generation` 금지를 이미 처리한다. 하지만 엘리베이터 전용 오류 메시지를 위해 위 Step 1의 ELEVATOR 블록에서 별도로 체크했으므로 충돌하지 않는다. (두 오류가 모두 나타날 수 있지만 테스트는 어느 하나만 확인하므로 OK.)

- [ ] **Step 3: TrainConfig.mode 검증 추가**

`validate()` 메서드에서 기존 PLATFORM train 상세 검증 블록 (`if n.type == NodeType.PLATFORM and n.train is not None:`) 내부, `alight_kind` 검증 다음에 추가:

```python
                if train.mode not in ("both", "alight", "board"):
                    errors.append(f"노드 {n.id}: 열차 mode는 both/alight/board 중 하나")
```

- [ ] **Step 4: 그룹 플랫폼 규칙 변경**

`validate()` 메서드 끝의 그룹 검사 블록에서:

기존 코드:
```python
            # 한 그룹에 PLATFORM이 2개 이상이면 오류
            platform_count = sum(1 for m in members if m.type == NodeType.PLATFORM)
            if platform_count >= 2:
                errors.append(
                    f"그룹 '{g}': 한 그룹에 승강장이 2개 이상이면 열차 하차가 중복 계산됩니다"
                )
```

새 코드로 교체:
```python
            # 한 그룹에 하차 역할(mode in both/alight) PLATFORM이 2개 이상이면 오류
            alight_platform_count = sum(
                1 for m in members
                if m.type == NodeType.PLATFORM
                and m.train is not None
                and getattr(m.train, "mode", "both") in ("both", "alight")
            )
            if alight_platform_count >= 2:
                errors.append(
                    f"그룹 '{g}': 한 그룹에 하차(alight) 승강장이 2개 이상이면 하차가 중복됩니다"
                )
```

- [ ] **Step 5: validate 테스트 실행**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)"
python -m pytest tests/test_revision2.py -k "elevator" -v
```

예상: 엘리베이터 validate 관련 테스트들 PASSED (엔진 테스트는 아직 실패)

---

## Task 4: `sim/engine.py` — elevator_cfg 빌드 및 step() 엘리베이터 분기

**Files:**
- Modify: `sim/engine.py`

**Interfaces:**
- Consumes: `ElevatorConfig` (Task 2에서 추가), `NodeType.ELEVATOR`
- Produces: `self.elevator_cfg: dict[int, ElevatorConfig]`, step() 내 elevator 전용 movers 오버라이드

- [ ] **Step 1: `__init__`에 elevator_cfg 빌드 추가**

`Engine.__init__`의 `self.train_cfg = {}` 블록 이후에 추가:

```python
        # 엘리베이터 설정(정적)
        self.elevator_cfg: dict[int, "ElevatorConfig"] = {
            i: nd.elevator
            for i, nd in enumerate(graph.nodes)
            if nd.type == NodeType.ELEVATOR and nd.elevator is not None
        }
```

- [ ] **Step 2: `step()`에 elevator 전용 movers 오버라이드 추가**

`step()` 메서드에서 `movers = self.N * move_prob` 줄 다음, 유출 분배 루프(`for i in range(n):`) 앞에 삽입:

```python
        # 엘리베이터 배치 운송: 일반 이동확률을 무시하고 주기별로 capacity만큼 유출
        for i, cfg in self.elevator_cfg.items():
            spd = max(1, int(cfg.speed))
            if (s + 1) % spd == 0:
                movers[i] = min(cfg.capacity, max(self.N[i], 0.0))
            else:
                movers[i] = 0.0
```

- [ ] **Step 3: 엘리베이터 엔진 테스트 실행**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)"
python -m pytest tests/test_revision2.py -k "elevator" -v
```

예상: 모든 elevator 테스트 PASSED

---

## Task 5: `sim/engine.py` — train mode 분기 적용

**Files:**
- Modify: `sim/engine.py` (step() 내 열차 이벤트 루프)

**Interfaces:**
- Consumes: `TrainConfig.mode` (Task 2에서 추가)
- Produces: mode-aware 열차 이벤트 (board-only, alight-only, both)

- [ ] **Step 1: 열차 이벤트 루프 교체**

`step()` 메서드에서 기존 열차 이벤트 블록:

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

새 코드로 교체:

```python
        # 승강장 열차 이벤트: mode에 따라 탑승(sink)/하차(source) 선택
        for i, steps in self.train_steps.items():
            if self.t in steps:
                cfg = self.train_cfg[i]
                mode = getattr(cfg, "mode", "both")
                if mode in ("both", "board"):
                    board = min(cfg.capacity, max(newN[i], 0.0))
                    newN[i] -= board
                    self.total_exited += board
                if mode in ("both", "alight"):
                    alight = sample_alight(cfg, self.rng, self.config.stochastic)
                    newN[i] += alight
                    self.total_generated += alight
```

- [ ] **Step 2: mode 테스트 실행**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)"
python -m pytest tests/test_revision2.py -k "mode" -v
```

예상: PASSED

---

## Task 6: 전체 테스트 실행 및 검증

**Files:**
- Read: 전체 테스트 결과

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)"
python -m pytest -q
```

예상:
- 기존 104개(test_group_two_platforms_raises_error 제거) + 신규 테스트들 = 전체 PASSED
- 0 failed

- [ ] **Step 2: 실패 시 디버그**

실패가 있으면 해당 테스트 메시지를 보고 수정:

```bash
python -m pytest -q --tb=short 2>&1 | head -50
```

---

## Task 7: 커밋 및 SDD 작성

**Files:**
- Create: `.superpowers/sdd/rev2-core.md`

- [ ] **Step 1: SDD 디렉터리 확인 및 생성**

```bash
mkdir -p "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/.superpowers/sdd"
```

- [ ] **Step 2: SDD 파일 작성**

`.superpowers/sdd/rev2-core.md` 내용:

```markdown
# rev2-core SDD

작성일: 2026-06-19

## 변경 파일

- `sim/model.py`: ElevatorConfig dataclass 추가, Node.elevator 필드 추가, TrainConfig.mode 필드 추가, from_json elevator 복원, validate() 규칙 갱신
- `sim/engine.py`: __init__에 elevator_cfg 빌드, step()에 elevator 전용 movers 오버라이드, 열차 이벤트 mode 분기
- `tests/test_validate.py`: test_group_two_platforms_raises_error → test_group_two_alight_platforms_raises_error + test_group_board_plus_alight_platform_no_error
- `tests/test_revision2.py`: 신규 TDD 테스트 (엘리베이터, train mode, 그룹 완화)

## TDD 증거

RED → GREEN 순서:
1. `tests/test_revision2.py` 작성 → ImportError(ElevatorConfig 없음)
2. `tests/test_validate.py` 수정 → AssertionError(규칙 미반영)
3. `sim/model.py` ElevatorConfig + TrainConfig.mode 추가 → elevator 검증 테스트 통과
4. `sim/model.py` validate() 갱신 → 검증 테스트 전체 통과
5. `sim/engine.py` elevator_cfg + step() elevator 분기 → 엘리베이터 엔진 테스트 통과
6. `sim/engine.py` train mode 분기 → mode 테스트 전체 통과

## 전체 테스트 결과

전체 XX passed (기존 104 + 신규 테스트)
0 failed
```

- [ ] **Step 3: 커밋**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)"
git add sim/model.py sim/engine.py tests/test_validate.py tests/test_revision2.py .superpowers/sdd/rev2-core.md
git commit -m "feat(core): 엘리베이터 배치 운송·승강장 train mode(alight/board)·그룹 검증 완화(2차)"
```

---

## Self-Review

### Spec Coverage Check

| 스펙 요구사항 | 구현 태스크 |
|---|---|
| A. ElevatorConfig dataclass | Task 2 |
| A. Node.elevator 필드 | Task 2 |
| A. from_json elevator 복원 | Task 2 |
| A. engine.__init__ elevator_cfg | Task 4 |
| A. step() elevator movers 오버라이드 | Task 4 |
| B. TrainConfig.mode 필드 | Task 2 |
| B. engine step() mode 분기 | Task 5 |
| C. elevator validate() 규칙 | Task 3 |
| C. mode validate() 규칙 | Task 3 |
| C. 그룹 플랫폼 규칙 완화 | Task 3 |
| C. 기존 R1 테스트 업데이트 | Task 1 |
| TDD: elevator 엔진 테스트 | Task 1 (test_revision2.py) |
| TDD: elevator validate 테스트 | Task 1 (test_revision2.py) |
| TDD: mode 테스트 | Task 1 (test_revision2.py) |
| TDD: 그룹 완화 테스트 | Task 1 (test_revision2.py) |
| SDD 작성 | Task 7 |

### Type Consistency

- `ElevatorConfig.capacity: float`, `ElevatorConfig.speed: int` — Task 2, 4에서 동일하게 사용
- `TrainConfig.mode: str` — Task 2, 5에서 동일하게 사용
- `self.elevator_cfg: dict[int, ElevatorConfig]` — Task 4에서 정의, step()에서 사용

### Placeholder Scan

없음 — 모든 코드 블록 구체적으로 작성됨.
