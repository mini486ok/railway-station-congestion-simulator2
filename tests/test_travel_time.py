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
