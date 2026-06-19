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


# ─────────────────────────────────────────────
# FIX 1: 그룹 Weidmann 파라미터 일관성 검사
# ─────────────────────────────────────────────

def _passage_node_wp(nid: str, group: str, v_free: float = 1.34,
                     rho_max: float = 5.4, gamma: float = 1.913) -> Node:
    from sim.model import WeidmannParams
    return Node(id=nid, name=nid, type=NodeType.PASSAGE, area=10, base_stay_prob=1.0,
                exit_weight=0.0, group=group,
                weidmann=WeidmannParams(v_free=v_free, rho_max=rho_max, gamma=gamma))


def test_group_mixed_weidmann_v_free_raises_error():
    """같은 그룹 내 노드의 v_free가 다르면 validate() 오류를 반환해야 한다."""
    n1 = _passage_node_wp("N1", group="W", v_free=1.34)
    n2 = _passage_node_wp("N2", group="W", v_free=1.0)  # 다른 v_free
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    assert any("Weidmann" in e and "W" in e for e in errs), f"예상 오류 없음: {errs}"


def test_group_mixed_weidmann_rho_max_raises_error():
    """같은 그룹 내 노드의 rho_max가 다르면 validate() 오류를 반환해야 한다."""
    n1 = _passage_node_wp("N1", group="W", rho_max=5.4)
    n2 = _passage_node_wp("N2", group="W", rho_max=4.0)  # 다른 rho_max
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    assert any("Weidmann" in e and "W" in e for e in errs), f"예상 오류 없음: {errs}"


def test_group_mixed_weidmann_gamma_raises_error():
    """같은 그룹 내 노드의 gamma가 다르면 validate() 오류를 반환해야 한다."""
    n1 = _passage_node_wp("N1", group="W", gamma=1.913)
    n2 = _passage_node_wp("N2", group="W", gamma=2.0)  # 다른 gamma
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    assert any("Weidmann" in e and "W" in e for e in errs), f"예상 오류 없음: {errs}"


def test_group_same_weidmann_no_error():
    """같은 그룹 내 노드의 Weidmann 파라미터가 동일하면 그룹 오류 없어야 한다."""
    n1 = _passage_node_wp("N1", group="W", v_free=1.34, rho_max=5.4, gamma=1.913)
    n2 = _passage_node_wp("N2", group="W", v_free=1.34, rho_max=5.4, gamma=1.913)
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    weid_errs = [e for e in errs if "Weidmann" in e]
    assert weid_errs == [], f"Weidmann 오류가 있어서는 안 됨: {weid_errs}"


def test_group_weidmann_error_reported_once_per_group():
    """혼재 Weidmann 오류는 그룹당 1개만 보고되어야 한다."""
    n1 = _passage_node_wp("N1", group="W", v_free=1.34)
    n2 = _passage_node_wp("N2", group="W", v_free=1.0)
    n3 = _passage_node_wp("N3", group="W", v_free=0.9)
    g = StationGraph(nodes=[n1, n2, n3], links=[])
    errs = g.validate()
    w_errs = [e for e in errs if "Weidmann" in e and "W" in e]
    assert len(w_errs) == 1, f"그룹당 1개 오류여야 함: {w_errs}"


# ─────────────────────────────────────────────
# FIX 2: 추가 per-node 검증
# ─────────────────────────────────────────────

def test_negative_initial_population_raises_error():
    """노드의 initial_population < 0 이면 오류를 반환해야 한다."""
    n = _passage_node("N1", group="")
    n.initial_population = -1.0
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("초기 인원" in e and "N1" in e for e in errs), f"예상 오류 없음: {errs}"


def test_zero_initial_population_ok():
    """initial_population = 0 이면 오류가 없어야 한다."""
    n = _passage_node("N1", group="")
    n.initial_population = 0.0
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    ip_errs = [e for e in errs if "초기 인원" in e]
    assert ip_errs == [], f"초기 인원 오류가 있어서는 안 됨: {ip_errs}"


def test_platform_invalid_alight_kind_raises_error():
    """PLATFORM 노드의 train.alight_kind 가 올바르지 않으면 오류를 반환해야 한다."""
    p = _platform_node("P1")
    p.train.alight_kind = "beta"  # 유효하지 않음
    g = StationGraph(nodes=[p], links=[])
    errs = g.validate()
    assert any("하차 분포" in e and "P1" in e for e in errs), f"예상 오류 없음: {errs}"


def test_platform_valid_alight_kinds_ok():
    """PLATFORM 노드의 train.alight_kind 가 constant/poisson/normal 이면 오류 없어야 한다."""
    for kind in ("constant", "poisson", "normal"):
        p = _platform_node("P1")
        p.train.alight_kind = kind
        g = StationGraph(nodes=[p], links=[])
        errs = g.validate()
        alight_errs = [e for e in errs if "하차 분포" in e]
        assert alight_errs == [], f"kind={kind}에서 오류 발생: {alight_errs}"


def test_invalid_generation_kind_raises_error():
    """노드의 generation.kind 가 올바르지 않으면 오류를 반환해야 한다."""
    n = Node(id="E1", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
             exit_weight=0.0, generation=GenerationConfig(kind="gamma"))
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    assert any("발생 분포" in e and "E1" in e for e in errs), f"예상 오류 없음: {errs}"


def test_valid_generation_kinds_ok():
    """generation.kind 가 constant/poisson/normal_pulse/none 이면 오류 없어야 한다."""
    for kind in ("constant", "poisson", "normal_pulse", "none"):
        n = Node(id="E1", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
                 exit_weight=0.0, generation=GenerationConfig(kind=kind, rate=1.0))
        g = StationGraph(nodes=[n], links=[])
        errs = g.validate()
        gen_errs = [e for e in errs if "발생 분포" in e]
        assert gen_errs == [], f"kind={kind}에서 오류 발생: {gen_errs}"


# ─────────────────────────────────────────────
# FIX 3: NormalPulse 잘림 경고 (duration_seconds 옵션 파라미터)
# ─────────────────────────────────────────────

def test_normal_pulse_truncation_warning_left():
    """normal_pulse의 center - 3*sigma < 0 이면 경고를 반환해야 한다."""
    n = Node(id="E1", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
             exit_weight=0.0,
             generation=GenerationConfig(kind="normal_pulse",
                                         center_sec=10.0, sigma_sec=5.0, total=100.0))
    # center - 3*sigma = 10 - 15 = -5 < 0 → 경고
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate(duration_seconds=3600.0)
    assert any("정규펄스" in e and "E1" in e for e in errs), f"경고 없음: {errs}"


def test_normal_pulse_truncation_warning_right():
    """normal_pulse의 center + 3*sigma > duration 이면 경고를 반환해야 한다."""
    n = Node(id="E1", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
             exit_weight=0.0,
             generation=GenerationConfig(kind="normal_pulse",
                                         center_sec=3590.0, sigma_sec=5.0, total=100.0))
    # center + 3*sigma = 3590 + 15 = 3605 > 3600 → 경고
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate(duration_seconds=3600.0)
    assert any("정규펄스" in e and "E1" in e for e in errs), f"경고 없음: {errs}"


def test_normal_pulse_no_warning_when_within_duration():
    """normal_pulse가 시뮬레이션 구간 내에 있으면 경고 없어야 한다."""
    n = Node(id="E1", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
             exit_weight=0.0,
             generation=GenerationConfig(kind="normal_pulse",
                                         center_sec=1800.0, sigma_sec=100.0, total=100.0))
    # center - 3*sigma = 1800 - 300 = 1500 > 0, center + 3*sigma = 2100 < 3600 → OK
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate(duration_seconds=3600.0)
    pulse_errs = [e for e in errs if "정규펄스" in e]
    assert pulse_errs == [], f"경고가 있어서는 안 됨: {pulse_errs}"


def test_normal_pulse_no_warning_without_duration():
    """duration_seconds 미지정 시 정규펄스 경고가 없어야 한다(기존 동작 유지)."""
    n = Node(id="E1", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.2,
             exit_weight=0.0,
             generation=GenerationConfig(kind="normal_pulse",
                                         center_sec=10.0, sigma_sec=5.0, total=100.0))
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()  # duration 미지정
    pulse_errs = [e for e in errs if "정규펄스" in e]
    assert pulse_errs == [], f"duration 미지정 시 경고 없어야 함: {pulse_errs}"
