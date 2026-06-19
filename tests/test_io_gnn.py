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
    assert lines[1] == "A,0.0,1.0"   # A->B weight 1
    assert lines[2] == "B,0.0,0.0"


def test_distance_and_travel_time():
    b = gnn_bundle(_g())
    assert "A,0.0,40.0" in b["distance"]
    assert "A,0,3" in b["travel_time"]


def test_node_features():
    b = gnn_bundle(_g())
    lines = b["node_features"].strip().splitlines()
    assert lines[0] == "id,name,type,area,group"
    assert lines[1] == "A,입구,entrance,50.0,"
