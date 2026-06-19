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
