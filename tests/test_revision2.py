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
