import numpy as np
import pytest
from sim.io import history_to_csv, history_by_group, gnn_bundle
from sim.model import NodeType, Node, Link, StationGraph


def test_wide_csv_header_and_rows():
    hist = np.array([[0.0, 0.0], [10.0, 5.0]])
    csv = history_to_csv(hist, ["A", "B"], dt_seconds=5.0, layout="wide")
    lines = csv.strip().splitlines()
    assert lines[0] == "step,time_sec,A,B"
    assert lines[1] == "0,0.0,0.0,0.0"
    assert lines[2] == "1,5.0,10.0,5.0"


def test_long_csv():
    hist = np.array([[0.0, 0.0], [10.0, 5.0]])
    csv = history_to_csv(hist, ["A", "B"], dt_seconds=5.0, layout="long")
    lines = csv.strip().splitlines()
    assert lines[0] == "step,time_sec,node,congestion"
    assert "1,5.0,A,10.0" in lines
    assert "1,5.0,B,5.0" in lines


# FIX 5: CSV 필드 이스케이프
def test_history_to_csv_plain_values_unquoted():
    """일반 값(특수문자 없음)은 그대로 출력돼야 한다(backward compat)."""
    hist = np.array([[5.0, 3.0]])
    csv = history_to_csv(hist, ["A", "통로"], dt_seconds=5.0, layout="wide")
    lines = csv.strip().splitlines()
    assert lines[0] == "step,time_sec,A,통로"


def test_history_to_csv_node_id_with_comma_quoted():
    """콤마를 포함한 노드 id는 CSV 따옴표 처리해야 한다."""
    hist = np.array([[5.0, 3.0]])
    csv = history_to_csv(hist, ["A,B", "C"], dt_seconds=5.0, layout="wide")
    lines = csv.strip().splitlines()
    # "A,B"가 큰따옴표로 감싸여야 함
    assert '"A,B"' in lines[0], f"콤마 포함 id가 이스케이프되지 않음: {lines[0]}"


def test_history_to_csv_formula_injection_prevented():
    """= 로 시작하는 노드 id는 앞에 apostrophe가 붙어야 한다."""
    hist = np.array([[5.0]])
    csv = history_to_csv(hist, ["=SUM(A1)"], dt_seconds=5.0, layout="wide")
    lines = csv.strip().splitlines()
    assert "'=SUM(A1)" in lines[0], f"수식 주입이 방지되지 않음: {lines[0]}"


def test_history_by_group_group_name_with_comma_quoted():
    """콤마를 포함한 그룹명은 CSV 따옴표 처리해야 한다."""
    hist = np.array([[1.0, 2.0]])
    csv = history_by_group(hist, ["A", "B"], ["X,Y", "X,Y"], 5.0)
    lines = csv.strip().splitlines()
    assert '"X,Y"' in lines[0], f"콤마 포함 그룹명이 이스케이프되지 않음: {lines[0]}"


def test_gnn_bundle_node_id_with_comma_quoted():
    """콤마 포함 node id는 adjacency/distance/travel_time 매트릭스 헤더에서 이스케이프돼야 한다."""
    n1 = Node(id="A,B", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.5)
    n2 = Node(id="C", name="통로", type=NodeType.PASSAGE, area=30, base_stay_prob=0.5)
    links = [Link(source="A,B", target="C", distance=40, weight=1.0, travel_time=3)]
    g = StationGraph(nodes=[n1, n2], links=links)
    bundle = gnn_bundle(g)
    adj_lines = bundle["adjacency"].strip().splitlines()
    # 헤더에 "A,B" (따옴표 포함)가 있어야 함
    assert '"A,B"' in adj_lines[0], f"헤더에 이스케이프 없음: {adj_lines[0]}"


def test_gnn_bundle_node_features_name_with_comma_quoted():
    """node_features의 name 필드에 콤마가 있으면 따옴표 처리해야 한다."""
    n1 = Node(id="A", name="입구,메인", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.5)
    g = StationGraph(nodes=[n1], links=[])
    bundle = gnn_bundle(g)
    feat_lines = bundle["node_features"].strip().splitlines()
    assert '"입구,메인"' in feat_lines[1], f"name 이스케이프 없음: {feat_lines[1]}"


def test_gnn_bundle_plain_node_features_unquoted():
    """특수문자 없는 node_features는 그대로 출력돼야 한다(backward compat)."""
    n1 = Node(id="A", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.5)
    g = StationGraph(nodes=[n1], links=[])
    bundle = gnn_bundle(g)
    feat_lines = bundle["node_features"].strip().splitlines()
    assert feat_lines[1] == "A,입구,entrance,50.0,", f"일반 값이 변경됨: {feat_lines[1]}"


# ─────────────────────────────────────────────
# FIX 5: _csv_field leading-whitespace formula guard
# ─────────────────────────────────────────────

def test_csv_field_leading_whitespace_formula_guarded():
    """공백 후 = 로 시작하는 값(예: '  =SUM(A1)')에도 apostrophe가 앞에 붙어야 한다."""
    hist = np.array([[5.0]])
    csv = history_to_csv(hist, ["  =SUM(A1)"], dt_seconds=5.0, layout="wide")
    lines = csv.strip().splitlines()
    # 헤더에 apostrophe가 포함되어야 함
    assert "'  =SUM(A1)" in lines[0] or lines[0].startswith("step,time_sec,'"), \
        f"leading whitespace 수식 주입 방지 안 됨: {lines[0]}"


def test_csv_field_leading_whitespace_plus_formula_guarded():
    """공백 후 + 로 시작하는 값에도 apostrophe가 붙어야 한다."""
    hist = np.array([[1.0]])
    csv = history_to_csv(hist, ["  +CMD"], dt_seconds=1.0, layout="wide")
    lines = csv.strip().splitlines()
    assert "'  +CMD" in lines[0], f"leading whitespace + 수식 주입 방지 안 됨: {lines[0]}"


def test_csv_field_plain_leading_whitespace_unchanged():
    """공백 후 일반 문자 시작은 apostrophe 없이 그대로 출력돼야 한다."""
    from sim.io import _csv_field
    # leading whitespace + 일반 문자
    result = _csv_field("  hello")
    # 수식 트리거 없으므로 apostrophe 없어야 함
    assert result == "  hello", f"일반 leading whitespace 값이 변경됨: {result}"


def test_csv_field_empty_string_unchanged():
    """빈 문자열은 그대로 빈 문자열로 반환되어야 한다."""
    from sim.io import _csv_field
    assert _csv_field("") == ""
