from sim.model import (NodeType, Node, Link, StationGraph,
                       GenerationConfig, TrainConfig)


def _ok_graph() -> StationGraph:
    nodes = [
        Node(id="A", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
             exit_weight=0.0, generation=GenerationConfig(kind="constant", rate=1.0)),
        Node(id="P", name="승강장", type=NodeType.PLATFORM, area=200, base_stay_prob=0.5,
             exit_weight=1.0,  # 하차객은 다른 링크 없으면 전부 이탈하도록(여기선 단순화)
             train=TrainConfig(first_arrival_sec=60, headway_sec=300)),
    ]
    links = [Link(source="A", target="P", distance=40, weight=1.0)]
    return StationGraph(nodes=nodes, links=links)


def test_valid_graph_has_no_errors():
    assert _ok_graph().validate() == []


def test_weight_sum_must_be_one():
    g = _ok_graph()
    g.links[0].weight = 0.5  # A의 출력합 0.5 + exit 0 != 1
    errs = g.validate()
    assert any("가중치 합" in e for e in errs)


def test_generation_only_on_source_types():
    g = _ok_graph()
    g.nodes.append(Node(id="C", name="통로", type=NodeType.PASSAGE, area=10,
                        base_stay_prob=1.0, generation=GenerationConfig(kind="constant", rate=1.0)))
    assert any("발생" in e for e in g.validate())


def test_platform_requires_train():
    g = _ok_graph()
    g.nodes[1].train = None
    assert any("열차" in e for e in g.validate())


def test_link_references_existing_nodes():
    g = _ok_graph()
    g.links.append(Link(source="A", target="ZZZ", distance=10, weight=0.0))
    # A의 합이 깨지지 않도록 weight=0, 그래도 ZZZ 미존재 오류
    assert any("존재하지 않는" in e for e in g.validate())


def test_movers_with_nowhere_to_go():
    g = _ok_graph()
    # P의 exit_weight=0, 출력링크 없음, base_stay<1 → 오류
    g.nodes[1].exit_weight = 0.0
    g.nodes[1].base_stay_prob = 0.5
    assert any("갈 곳" in e for e in g.validate())
