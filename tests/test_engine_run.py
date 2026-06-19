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
