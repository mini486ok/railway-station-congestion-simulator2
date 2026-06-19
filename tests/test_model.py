from sim.model import (
    NodeType, WeidmannParams, GenerationConfig, TrainConfig,
    Node, Link, SimConfig, StationGraph,
)


def _sample_graph() -> StationGraph:
    nodes = [
        Node(id="A", name="입구A", type=NodeType.ENTRANCE, area=50.0,
             base_stay_prob=0.2, exit_weight=0.0,
             generation=GenerationConfig(kind="constant", rate=2.0)),
        Node(id="P", name="승강장1", type=NodeType.PLATFORM, area=200.0,
             base_stay_prob=0.5,
             train=TrainConfig(first_arrival_sec=60, headway_sec=300,
                               capacity=150, alight_mean=80)),
    ]
    links = [Link(source="A", target="P", distance=40.0, weight=1.0)]
    return StationGraph(nodes=nodes, links=links)


def test_node_defaults():
    n = Node(id="x", name="통로", type=NodeType.PASSAGE, area=30.0, base_stay_prob=0.3)
    assert n.congestion_enabled is True
    assert n.weidmann.v_free == 1.34
    assert n.initial_population == 0.0
    assert n.exit_weight == 0.0
    assert n.generation is None and n.train is None


def test_json_round_trip():
    g = _sample_graph()
    data = g.to_json()
    g2 = StationGraph.from_json(data)
    assert g2.to_json() == data
    # 중첩 dataclass 복원 확인
    assert isinstance(g2.nodes[0].type, NodeType)
    assert isinstance(g2.nodes[0].generation, GenerationConfig)
    assert isinstance(g2.nodes[1].train, TrainConfig)
    assert g2.nodes[1].train.capacity == 150
