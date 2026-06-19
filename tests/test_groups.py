"""물리적 존 그룹(zone group) TDD 테스트.

그룹으로 묶인 노드들은 혼잡도(밀도)를 공유하여 서로 영향을 주고,
그룹별 인원 합산 시계열을 export할 수 있어야 한다.
그룹 없는 노드는 이전과 동일하게 동작해야 한다(backward compat).
"""
from __future__ import annotations

import numpy as np
import pytest

from sim.model import NodeType, Node, Link, StationGraph, SimConfig, WeidmannParams
from sim.engine import Engine
from sim.io import history_by_group


def _node(nid: str, pop: float, group: str) -> Node:
    return Node(
        id=nid, name=nid, type=NodeType.PASSAGE, area=10.0,
        base_stay_prob=0.2, congestion_enabled=True,
        initial_population=pop, exit_weight=1.0,
        group=group,
        weidmann=WeidmannParams(),
    )


# ─────────────────────────────────────────────
# 1. 그룹 공유 밀도 테스트
# ─────────────────────────────────────────────

def test_group_shares_density_slows_movement():
    """그룹 내 다른 노드가 혼잡하면 한산한 노드의 이동확률도 낮아져야 한다."""
    # A(500명), B(5명) → 같은 그룹 Z
    # 그룹 밀도 = (500+5)/(10+10) = 505/20 = 25.25 (매우 혼잡)
    g = StationGraph(nodes=[_node('A', 500.0, 'Z'), _node('B', 5.0, 'Z')], links=[])
    e = Engine(g, SimConfig(dt_seconds=5.0))
    mp_grouped = e._move_prob()[1]   # B의 이동확률 (그룹밀도 기반)

    # 그룹 없는 단독 노드: B의 밀도 = 5/10 = 0.5 (한산)
    g2 = StationGraph(nodes=[_node('A', 500.0, ''), _node('B', 5.0, '')], links=[])
    e2 = Engine(g2, SimConfig(dt_seconds=5.0))
    mp_solo = e2._move_prob()[1]     # B 단독 밀도 = 0.5 → 거의 자유

    # 그룹(혼잡)이면 B도 느려져야 함
    assert mp_grouped < mp_solo, (
        f"그룹 공유 밀도가 적용되지 않음: mp_grouped={mp_grouped:.4f}, mp_solo={mp_solo:.4f}"
    )
    # 단독 노드는 거의 base_move(0.8)에 가까워야 함 (rho=0.5 << rho_max=5.4)
    assert abs(mp_solo - 0.8) < 0.05, (
        f"단독 노드 이동확률이 base_move와 너무 다름: {mp_solo:.4f}"
    )


def test_standalone_node_uses_own_density():
    """그룹이 없는 노드는 자기 자신의 밀도만 사용해야 한다(backward compat)."""
    # 이전 test_congestion.py 의 동작을 그룹 필드 추가 후에도 보장
    def run_one(pop, area):
        node = Node(
            id="A", name="A", type=NodeType.PASSAGE, area=area,
            base_stay_prob=0.2, congestion_enabled=True,
            initial_population=pop, exit_weight=1.0,
            group="",  # 그룹 없음
            weidmann=WeidmannParams(),
        )
        g = StationGraph(nodes=[node], links=[])
        e = Engine(g, SimConfig(dt_seconds=5.0))
        before = float(e.N[0])
        e.step()
        moved = before - float(e.N[0])
        return moved / before

    low_density_mp = run_one(pop=5.0, area=10.0)    # 밀도 0.5
    high_density_mp = run_one(pop=500.0, area=10.0)  # 밀도 50 → 거의 정지

    assert high_density_mp < low_density_mp
    assert high_density_mp < 0.8


def test_group_field_defaults_empty():
    """group 필드가 없는 기존 JSON 에서 로드해도 빈 문자열로 처리돼야 한다."""
    import json
    from sim.model import StationGraph

    data = {
        "nodes": [{
            "id": "A", "name": "A", "type": "passage", "area": 10.0,
            "base_stay_prob": 0.2, "congestion_enabled": True,
            "initial_population": 0.0, "exit_weight": 1.0,
            "weidmann": {"v_free": 1.34, "rho_max": 5.4, "gamma": 1.913},
            "generation": None, "train": None,
            # group 키 없음 → 하위호환 테스트
        }],
        "links": [],
    }
    graph = StationGraph.from_json(data)
    assert graph.nodes[0].group == ""


def test_group_roundtrips_in_json():
    """group 필드가 to_json/from_json 를 거쳐도 보존되어야 한다."""
    from sim.model import StationGraph

    n = _node('A', 0.0, 'corridor')
    g = StationGraph(nodes=[n], links=[])
    d = g.to_json()
    g2 = StationGraph.from_json(d)
    assert g2.nodes[0].group == 'corridor'


# ─────────────────────────────────────────────
# 2. history_by_group 함수 테스트
# ─────────────────────────────────────────────

def test_history_by_group_sums_members():
    """그룹 내 노드 인원을 합산하고, 단독 노드는 자신의 id로 컬럼을 만들어야 한다."""
    hist = np.array([[1.0, 2.0, 3.0],
                     [4.0, 5.0, 6.0]], dtype=float)
    # A, B → 그룹 Z / C → 단독('')
    csv = history_by_group(hist, ['A', 'B', 'C'], ['Z', 'Z', ''], 5.0)
    lines = csv.strip().splitlines()

    assert lines[0] == 'step,time_sec,Z,C', f"헤더 오류: {lines[0]}"
    assert lines[1] == '0,0.0,3.0,3.0', f"0행 오류: {lines[1]}"   # Z=1+2=3, C=3
    assert lines[2] == '1,5.0,9.0,6.0', f"1행 오류: {lines[2]}"   # Z=4+5=9, C=6


def test_history_by_group_all_solo():
    """모든 노드가 그룹 없음이면 각자 자기 id 컬럼을 가져야 한다."""
    hist = np.array([[10.0, 20.0]], dtype=float)
    csv = history_by_group(hist, ['X', 'Y'], ['', ''], 1.0)
    lines = csv.strip().splitlines()
    assert lines[0] == 'step,time_sec,X,Y'
    assert lines[1] == '0,0.0,10.0,20.0'


def test_history_by_group_all_one_group():
    """모든 노드가 같은 그룹이면 컬럼 하나, 값은 합이어야 한다."""
    hist = np.array([[3.0, 7.0],
                     [1.0, 2.0]], dtype=float)
    csv = history_by_group(hist, ['P', 'Q'], ['G', 'G'], 10.0)
    lines = csv.strip().splitlines()
    assert lines[0] == 'step,time_sec,G'
    assert lines[1] == '0,0.0,10.0'
    assert lines[2] == '1,10.0,3.0'


# ─────────────────────────────────────────────
# 3. GNN bundle group 컬럼 테스트
# ─────────────────────────────────────────────

def test_gnn_bundle_includes_group_column():
    """gnn_bundle 의 node_features CSV 에 group 컬럼이 포함되어야 한다."""
    from sim.io import gnn_bundle

    n1 = _node('A', 0.0, 'Z')
    n2 = _node('B', 0.0, '')
    g = StationGraph(nodes=[n1, n2], links=[])
    bundle = gnn_bundle(g)
    lines = bundle['node_features'].strip().splitlines()
    assert lines[0] == 'id,name,type,area,group', f"헤더 오류: {lines[0]}"
    # A → group Z, B → group 빈 문자열
    assert lines[1].endswith(',Z'), f"A행 group 오류: {lines[1]}"
    assert lines[2].endswith(','), f"B행 group 오류(빈 문자열): {lines[2]}"
