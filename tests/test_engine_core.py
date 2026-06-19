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
