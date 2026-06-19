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


# FIX 4: PLATFORM train 필드 유효성 검사
def test_platform_headway_zero_raises_error():
    """PLATFORM 노드의 train.headway_sec=0 이면 validate() 오류를 반환해야 한다."""
    g = _ok_graph()
    g.nodes[1].train.headway_sec = 0
    errs = g.validate()
    assert any("배차간격" in e for e in errs), f"예상 오류 없음: {errs}"


def test_platform_headway_negative_raises_error():
    """PLATFORM 노드의 train.headway_sec<0 이면 validate() 오류를 반환해야 한다."""
    g = _ok_graph()
    g.nodes[1].train.headway_sec = -5
    errs = g.validate()
    assert any("배차간격" in e for e in errs), f"예상 오류 없음: {errs}"


def test_platform_first_arrival_negative_raises_error():
    """PLATFORM 노드의 train.first_arrival_sec<0 이면 validate() 오류를 반환해야 한다."""
    g = _ok_graph()
    g.nodes[1].train.first_arrival_sec = -1
    errs = g.validate()
    assert any("first_arrival" in e or "첫 도착" in e or "first" in e.lower() for e in errs), f"예상 오류 없음: {errs}"


def test_platform_capacity_negative_raises_error():
    """PLATFORM 노드의 train.capacity<0 이면 validate() 오류를 반환해야 한다."""
    g = _ok_graph()
    g.nodes[1].train.capacity = -1
    errs = g.validate()
    assert any("capacity" in e or "정원" in e for e in errs), f"예상 오류 없음: {errs}"


# FIX 4: 그룹 일관성 검사
def _platform_node(nid: str, group: str = "") -> Node:
    return Node(id=nid, name=nid, type=NodeType.PLATFORM, area=100, base_stay_prob=0.5,
                exit_weight=1.0, group=group,
                train=TrainConfig(first_arrival_sec=60, headway_sec=300))


def _passage_node(nid: str, group: str = "", congestion_enabled: bool = True) -> Node:
    return Node(id=nid, name=nid, type=NodeType.PASSAGE, area=10, base_stay_prob=1.0,
                exit_weight=0.0, group=group, congestion_enabled=congestion_enabled)


def test_group_two_platforms_raises_error():
    """한 그룹에 PLATFORM이 2개 이상이면 validate() 오류를 반환해야 한다."""
    p1 = _platform_node("P1", group="GRP")
    p2 = _platform_node("P2", group="GRP")
    g = StationGraph(nodes=[p1, p2], links=[])
    errs = g.validate()
    assert any("승강장" in e and "GRP" in e for e in errs), f"예상 오류 없음: {errs}"


def test_group_mixed_congestion_enabled_raises_error():
    """한 그룹 내에서 congestion_enabled가 혼재하면 validate() 오류를 반환해야 한다."""
    n1 = _passage_node("N1", group="Z", congestion_enabled=True)
    n2 = _passage_node("N2", group="Z", congestion_enabled=False)
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    assert any("혼잡 동적 체류" in e or "congestion" in e.lower() for e in errs), f"예상 오류 없음: {errs}"


def test_group_valid_two_passages_same_congestion_no_error():
    """같은 그룹에 통로(PASSAGE) 2개, congestion_enabled 동일하면 오류 없어야 한다."""
    n1 = _passage_node("N1", group="Z", congestion_enabled=True)
    n2 = _passage_node("N2", group="Z", congestion_enabled=True)
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    # 그룹 관련 오류가 없어야 함 (체류/가중치 문제만 발생 가능)
    group_errs = [e for e in errs if "그룹" in e]
    assert group_errs == [], f"그룹 오류가 있어서는 안 됨: {group_errs}"
