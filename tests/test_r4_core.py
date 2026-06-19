"""Revision 4 핵심 변경사항 TDD 테스트."""
from __future__ import annotations

import json
import numpy as np
import pytest

from sim.model import (
    NodeType, Node, Link, StationGraph, SimConfig,
    GenerationConfig, TrainConfig,
)
from sim.generation import build_generator, BatchGenerator
from sim.io import gnn_bundle_by_group


# ─────────────────────────────────────────────
# CHANGE 1: normal_pulse 제거 확인
# ─────────────────────────────────────────────

def test_generationconfig_has_no_center_sec():
    """GenerationConfig에 center_sec 필드가 없어야 한다."""
    assert not hasattr(GenerationConfig(kind="constant"), "center_sec")


def test_generationconfig_has_no_sigma_sec():
    """GenerationConfig에 sigma_sec 필드가 없어야 한다."""
    assert not hasattr(GenerationConfig(kind="constant"), "sigma_sec")


def test_generationconfig_has_no_total():
    """GenerationConfig에 total 필드가 없어야 한다."""
    assert not hasattr(GenerationConfig(kind="constant"), "total")


def test_build_generator_normal_pulse_raises():
    """build_generator에 normal_pulse를 전달하면 ValueError가 발생해야 한다."""
    cfg = GenerationConfig(kind="normal_pulse")
    with pytest.raises(ValueError, match="알 수 없는"):
        build_generator(cfg)


def test_validate_normal_pulse_kind_invalid():
    """normal_pulse kind는 이제 유효하지 않은 종류로 오류가 나야 한다."""
    n = Node(id="E", name="입구", type=NodeType.ENTRANCE, area=50,
             base_stay_prob=0.5, exit_weight=0.5,
             generation=GenerationConfig(kind="normal_pulse"))
    errs = StationGraph(nodes=[n], links=[]).validate()
    assert any("발생 분포 종류가 올바르지 않음" in e for e in errs)


# ─────────────────────────────────────────────
# CHANGE 2: batch(군집) 발생기
# ─────────────────────────────────────────────

def test_batch_generator_deterministic():
    """batch 결정론: rate * dt * batch_size를 반환해야 한다."""
    cfg = GenerationConfig(kind="batch", rate=3.0, batch_size=4.0)
    g = build_generator(cfg)
    # 3.0 batches/sec * 5.0 sec * 4.0 people/batch = 60.0
    result = g.amount(0, 5.0, np.random.default_rng(0), False)
    assert result == pytest.approx(60.0)


def test_batch_generator_deterministic_with_profile():
    """profile이 있으면 _rate_at을 통해 시간가변 rate가 적용된다."""
    cfg = GenerationConfig(kind="batch", rate=1.0, profile=[[0, 1.0], [50, 5.0]], batch_size=2.0)
    g = build_generator(cfg)
    # t=0s: rate=1.0 → 1.0*10.0*2.0=20.0
    assert g.amount(0, 10.0, np.random.default_rng(0), False) == pytest.approx(20.0)
    # t=60s (t_step=6, dt=10): rate=5.0 → 5.0*10.0*2.0=100.0
    assert g.amount(6, 10.0, np.random.default_rng(0), False) == pytest.approx(100.0)


def test_batch_generator_stochastic_nonneg_multiple_of_batch_size():
    """batch 확률론: 반환값은 batch_size의 비음수 정수 배수여야 한다."""
    batch_size = 7.0
    cfg = GenerationConfig(kind="batch", rate=2.0, batch_size=batch_size)
    g = build_generator(cfg)
    rng = np.random.default_rng(42)
    for _ in range(100):
        val = g.amount(0, 5.0, rng, True)
        assert val >= 0.0
        if val > 0:
            assert abs(round(val / batch_size) - val / batch_size) < 1e-9


def test_batch_generator_stochastic_mean_approx():
    """batch 확률론: 충분한 표본에서 평균이 rate*dt*batch_size에 수렴해야 한다."""
    cfg = GenerationConfig(kind="batch", rate=2.0, batch_size=3.0)
    g = build_generator(cfg)
    rng = np.random.default_rng(99)
    samples = [g.amount(0, 5.0, rng, True) for _ in range(5000)]
    expected_mean = 2.0 * 5.0 * 3.0  # = 30.0
    assert abs(np.mean(samples) - expected_mean) < 1.5


def test_build_generator_returns_batch_generator_for_batch_kind():
    """build_generator가 batch kind에 대해 BatchGenerator를 반환해야 한다."""
    cfg = GenerationConfig(kind="batch", rate=1.0, batch_size=2.0)
    g = build_generator(cfg)
    assert isinstance(g, BatchGenerator)


# ─────────────────────────────────────────────
# CHANGE 4: generation은 출입구(ENTRANCE) 전용
# ─────────────────────────────────────────────

def test_entrance_with_generation_ok():
    """출입구 노드에 generation을 붙이면 오류가 없어야 한다."""
    n = Node(id="E", name="입구", type=NodeType.ENTRANCE, area=50,
             base_stay_prob=0.5, exit_weight=0.5,
             generation=GenerationConfig(kind="constant", rate=1.0))
    errs = StationGraph(nodes=[n], links=[]).validate()
    gen_errs = [e for e in errs if "발생(generation)은 출입구에서만 가능합니다" in e]
    assert gen_errs == [], f"출입구는 generation 허용: {gen_errs}"


def test_platform_with_generation_raises_error():
    """승강장(PLATFORM) 노드에 generation을 붙이면 '발생(generation)은 출입구에서만 가능합니다' 오류."""
    n = Node(id="P", name="승강장", type=NodeType.PLATFORM, area=200,
             base_stay_prob=1.0, exit_weight=1.0,
             generation=GenerationConfig(kind="constant", rate=1.0),
             train=TrainConfig(first_arrival_sec=60, headway_sec=300))
    errs = StationGraph(nodes=[n], links=[]).validate()
    assert any("발생(generation)은 출입구에서만 가능합니다" in e and "P" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_passage_with_generation_raises_error():
    """통로(PASSAGE) 노드에 generation을 붙이면 오류가 나야 한다."""
    n = Node(id="C", name="통로", type=NodeType.PASSAGE, area=10,
             base_stay_prob=1.0, exit_weight=0.0,
             generation=GenerationConfig(kind="constant", rate=1.0))
    errs = StationGraph(nodes=[n], links=[]).validate()
    assert any("발생(generation)은 출입구에서만 가능합니다" in e and "C" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_validate_batch_batch_size_zero_raises_error():
    """batch kind에서 batch_size=0이면 '군집 크기(batch_size)는 0보다 커야 함' 오류."""
    n = Node(id="E", name="입구", type=NodeType.ENTRANCE, area=50,
             base_stay_prob=0.5, exit_weight=0.5,
             generation=GenerationConfig(kind="batch", rate=1.0, batch_size=0.0))
    errs = StationGraph(nodes=[n], links=[]).validate()
    assert any("군집 크기(batch_size)는 0보다 커야 함" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_validate_batch_batch_size_positive_ok():
    """batch kind에서 batch_size>0이면 군집 크기 관련 오류 없어야 한다."""
    n = Node(id="E", name="입구", type=NodeType.ENTRANCE, area=50,
             base_stay_prob=0.5, exit_weight=0.5,
             generation=GenerationConfig(kind="batch", rate=1.0, batch_size=3.0))
    errs = StationGraph(nodes=[n], links=[]).validate()
    batch_errs = [e for e in errs if "군집 크기" in e]
    assert batch_errs == [], f"batch_size>0은 유효해야 함: {batch_errs}"


# ─────────────────────────────────────────────
# CHANGE 5: 그룹 단위 GNN 번들
# ─────────────────────────────────────────────

def _two_group_graph() -> StationGraph:
    """2개 그룹(G1: A+B, G2: C)으로 구성된 테스트 그래프.

    링크:
    A(G1) → C(G2) weight=0.6, distance=30, travel_time=3
    B(G1) → C(G2) weight=0.4, distance=20, travel_time=2
    C(G2) → A(G1) weight=1.0, distance=10, travel_time=1
    """
    nodes = [
        Node(id="A", name="입구A", type=NodeType.ENTRANCE, area=50.0,
             base_stay_prob=0.5, group="G1"),
        Node(id="B", name="통로B", type=NodeType.PASSAGE, area=30.0,
             base_stay_prob=0.5, group="G1"),
        Node(id="C", name="통로C", type=NodeType.PASSAGE, area=20.0,
             base_stay_prob=1.0, group="G2"),
    ]
    links = [
        Link(source="A", target="C", distance=30.0, weight=0.6, travel_time=3),
        Link(source="B", target="C", distance=20.0, weight=0.4, travel_time=2),
        Link(source="C", target="A", distance=10.0, weight=1.0, travel_time=1),
    ]
    return StationGraph(nodes=nodes, links=links)


def test_gnn_bundle_by_group_keys():
    """gnn_bundle_by_group은 adjacency/distance/travel_time/group_features 키를 반환해야 한다."""
    bundle = gnn_bundle_by_group(_two_group_graph())
    assert set(bundle.keys()) == {"adjacency", "distance", "travel_time", "group_features"}


def test_gnn_bundle_by_group_adjacency_weight_sum():
    """그룹 행렬: G1→G2 adjacency = A→C(0.6) + B→C(0.4) = 1.0."""
    bundle = gnn_bundle_by_group(_two_group_graph())
    lines = bundle["adjacency"].strip().splitlines()
    # header: ,G1,G2
    assert lines[0] == ",G1,G2"
    # G1 행: G1→G1=0.0 (intra-group 없음), G1→G2=1.0
    g1_row = lines[1]
    parts = g1_row.split(",")
    assert parts[0] == "G1"
    assert float(parts[1]) == pytest.approx(0.0)   # G1→G1
    assert float(parts[2]) == pytest.approx(1.0)   # G1→G2
    # G2 행: G2→G1=1.0, G2→G2=0.0
    g2_row = lines[2]
    parts2 = g2_row.split(",")
    assert parts2[0] == "G2"
    assert float(parts2[1]) == pytest.approx(1.0)  # G2→G1
    assert float(parts2[2]) == pytest.approx(0.0)  # G2→G2


def test_gnn_bundle_by_group_distance_average():
    """그룹 행렬: G1→G2 distance = (30+20)/2 = 25.0."""
    bundle = gnn_bundle_by_group(_two_group_graph())
    lines = bundle["distance"].strip().splitlines()
    g1_row = lines[1].split(",")
    g1_to_g2 = float(g1_row[2])
    assert g1_to_g2 == pytest.approx(25.0)


def test_gnn_bundle_by_group_travel_time_average():
    """그룹 행렬: G1→G2 travel_time = round((3+2)/2) = round(2.5) = 2."""
    bundle = gnn_bundle_by_group(_two_group_graph())
    lines = bundle["travel_time"].strip().splitlines()
    g1_row = lines[1].split(",")
    g1_to_g2 = int(g1_row[2])
    assert g1_to_g2 == round((3 + 2) / 2)


def test_gnn_bundle_by_group_features_header():
    """group_features CSV 헤더가 'group,num_nodes,total_area,types'이어야 한다."""
    bundle = gnn_bundle_by_group(_two_group_graph())
    lines = bundle["group_features"].strip().splitlines()
    assert lines[0] == "group,num_nodes,total_area,types"


def test_gnn_bundle_by_group_features_g1():
    """G1 그룹: num_nodes=2, total_area=80.0, types=entrance;passage."""
    bundle = gnn_bundle_by_group(_two_group_graph())
    lines = bundle["group_features"].strip().splitlines()
    g1_line = lines[1]
    parts = g1_line.split(",")
    assert parts[0] == "G1"
    assert int(parts[1]) == 2
    assert float(parts[2]) == pytest.approx(80.0)
    assert parts[3] == "entrance;passage"


def test_gnn_bundle_by_group_features_g2():
    """G2 그룹: num_nodes=1, total_area=20.0, types=passage."""
    bundle = gnn_bundle_by_group(_two_group_graph())
    lines = bundle["group_features"].strip().splitlines()
    g2_line = lines[2]
    parts = g2_line.split(",")
    assert parts[0] == "G2"
    assert int(parts[1]) == 1
    assert float(parts[2]) == pytest.approx(20.0)
    assert parts[3] == "passage"


def test_gnn_bundle_by_group_no_group_uses_node_id():
    """group이 비어 있는 노드는 자기 자신 id를 그룹 레이블로 사용해야 한다."""
    nodes = [
        Node(id="X", name="X", type=NodeType.ENTRANCE, area=10.0, base_stay_prob=1.0),
        Node(id="Y", name="Y", type=NodeType.PASSAGE, area=20.0, base_stay_prob=1.0),
    ]
    links = [Link(source="X", target="Y", distance=5.0, weight=1.0, travel_time=1)]
    g = StationGraph(nodes=nodes, links=links)
    bundle = gnn_bundle_by_group(g)
    # 헤더에 X, Y가 레이블로 사용되어야 함
    header = bundle["adjacency"].strip().splitlines()[0]
    assert "X" in header and "Y" in header


def test_gnn_bundle_by_group_intra_group_links():
    """같은 그룹 내 링크는 대각선(self-entry)에 합산되어야 한다."""
    nodes = [
        Node(id="A", name="A", type=NodeType.ENTRANCE, area=10.0,
             base_stay_prob=0.5, group="G"),
        Node(id="B", name="B", type=NodeType.PASSAGE, area=10.0,
             base_stay_prob=0.5, group="G"),
    ]
    links = [Link(source="A", target="B", distance=5.0, weight=0.8, travel_time=1)]
    g = StationGraph(nodes=nodes, links=links)
    bundle = gnn_bundle_by_group(g)
    lines = bundle["adjacency"].strip().splitlines()
    # 그룹 G만 있으므로 1x1 행렬: ,G \n G,0.8
    assert lines[0] == ",G"
    parts = lines[1].split(",")
    assert parts[0] == "G"
    assert float(parts[1]) == pytest.approx(0.8)


def test_webapi_export_gnn_group():
    """webapi.export_gnn_group()이 유효한 JSON을 반환하고 4개 키를 포함해야 한다."""
    from sim import webapi

    graph_data = {
        "nodes": [
            {
                "id": "E", "name": "입구", "type": "entrance",
                "area": 50.0, "base_stay_prob": 1.0,
                "congestion_enabled": False,
                "weidmann": {"v_free": 1.34, "rho_max": 5.4, "gamma": 1.913},
                "initial_population": 0.0, "exit_weight": 0.0,
                "group": "GA",
                "generation": None, "train": None, "elevator": None,
            }
        ],
        "links": [],
    }
    config_data = {
        "dt_seconds": 5.0,
        "duration_seconds": 60.0,
        "default_walk_speed": 1.34,
        "stochastic": False,
        "seed": 0,
        "observation_noise_std": 0.0,
        "missing_prob": 0.0,
    }
    webapi.load(json.dumps({"graph": graph_data, "config": config_data}))
    result = webapi.export_gnn_group()
    data = json.loads(result)
    assert set(data.keys()) == {"adjacency", "distance", "travel_time", "group_features"}
