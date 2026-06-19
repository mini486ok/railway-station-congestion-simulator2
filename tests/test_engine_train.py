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
