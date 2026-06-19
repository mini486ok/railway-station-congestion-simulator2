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
