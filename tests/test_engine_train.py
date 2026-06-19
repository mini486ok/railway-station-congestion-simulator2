import numpy as np
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig, TrainConfig, GenerationConfig)
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


# ─────────────────────────────────────────────
# FIX 4: 열차 이벤트 포함 질량보존 테스트
# ─────────────────────────────────────────────

def test_mass_conservation_with_train_events():
    """열차 이벤트(탑승/하차)가 있는 그래프에서 30스텝 후 질량보존 항등식이 성립해야 한다.

    항등식: 현재 N 합 + in-transit(_pending) 합 + total_exited
          == 초기 N 합 + total_generated
    """
    # 승강장(P): 열차 있음, 입구(E): 발생원, 출구(X): exit sink
    # 가중치 합 조건: E→P(1.0), P→X(0.5)+exit(0.5), X→exit(1.0)
    nodes = [
        Node(id="E", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.0,
             exit_weight=0.0, initial_population=0.0,
             generation=GenerationConfig(kind="constant", rate=2.0)),
        Node(id="P", name="승강장", type=NodeType.PLATFORM, area=200, base_stay_prob=0.5,
             exit_weight=0.5, initial_population=50.0,
             train=TrainConfig(first_arrival_sec=10, headway_sec=30,
                               capacity=30, alight_kind="constant", alight_mean=20)),
        Node(id="X", name="출구", type=NodeType.ENTRANCE, area=30, base_stay_prob=0.0,
             exit_weight=1.0, initial_population=0.0),
    ]
    links = [
        Link(source="E", target="P", distance=10, weight=1.0),
        Link(source="P", target="X", distance=10, weight=0.5),
    ]
    graph = StationGraph(nodes=nodes, links=links)
    config = SimConfig(dt_seconds=5.0, duration_seconds=300.0, stochastic=False)
    e = Engine(graph, config)

    initial_N_sum = float(e.N.sum())

    # 30스텝 실행
    for _ in range(30):
        e.step()

    current_N = float(e.N.sum())
    in_transit = sum(float(arr.sum()) for arr in e._pending.values())
    total_exited = float(e.total_exited)
    total_generated = float(e.total_generated)

    lhs = current_N + in_transit + total_exited
    rhs = initial_N_sum + total_generated

    assert abs(lhs - rhs) < 1e-6, (
        f"질량보존 실패: N={current_N:.4f}, in_transit={in_transit:.4f}, "
        f"exited={total_exited:.4f}, lhs={lhs:.6f}, rhs={rhs:.6f}, diff={abs(lhs-rhs):.2e}"
    )
