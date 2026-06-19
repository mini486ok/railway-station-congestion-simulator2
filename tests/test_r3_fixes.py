"""R3 (Review-round-2 반영) 수정사항 TDD 테스트."""
from __future__ import annotations

import json
import math
import pytest
import numpy as np

from sim.model import (
    NodeType, Node, Link, StationGraph, SimConfig,
    GenerationConfig, TrainConfig, ElevatorConfig,
)
from sim.generation import _rate_at, build_generator


# ─────────────────────────────────────────────
# FIX 1: _rate_at — profile 첫 항목 이전 시각에 cfg.rate 사용
# ─────────────────────────────────────────────

def test_rate_at_before_first_profile_uses_base_rate():
    """profile 첫 항목(t=50) 이전 시각(t=0)에서 cfg.rate(=2.0)를 반환해야 한다."""
    cfg = GenerationConfig(kind="constant", rate=2.0, profile=[[50, 5.0], [100, 10.0]])
    # t=0 < 50 → cfg.rate=2.0
    assert _rate_at(cfg, 0.0) == pytest.approx(2.0)


def test_rate_at_at_first_profile_time_uses_profile_rate():
    """profile 첫 항목 시각(t=50)에서 해당 rate(=5.0)를 반환해야 한다."""
    cfg = GenerationConfig(kind="constant", rate=2.0, profile=[[50, 5.0], [100, 10.0]])
    assert _rate_at(cfg, 50.0) == pytest.approx(5.0)


def test_rate_at_after_last_profile_time_uses_last_rate():
    """마지막 profile 항목(t=100) 이후 시각(t=200)에서 마지막 rate(=10.0)를 반환해야 한다."""
    cfg = GenerationConfig(kind="constant", rate=2.0, profile=[[50, 5.0], [100, 10.0]])
    assert _rate_at(cfg, 200.0) == pytest.approx(10.0)


def test_profile_time_varying_rate_regression():
    """기존 test_generation.py의 test_profile_time_varying_rate 회귀 테스트."""
    cfg = GenerationConfig(kind="poisson", rate=1.0, profile=[[0, 1.0], [50, 4.0]])
    g = build_generator(cfg)
    # t=0s: profile[0] 시각=0, t>=0 → rate=1.0 (FIX 1: cfg.rate=1.0도 동일)
    assert g.amount(0, 10.0, np.random.default_rng(0), False) == pytest.approx(10.0)
    # t=60s: t>=50 → rate=4.0
    assert g.amount(6, 10.0, np.random.default_rng(0), False) == pytest.approx(40.0)


# ─────────────────────────────────────────────
# FIX 2: 중복 노드 ID 검증
# ─────────────────────────────────────────────

def test_duplicate_node_id_raises_error():
    """동일한 id를 가진 노드가 2개 있으면 '중복된 노드 id: X' 오류가 나야 한다."""
    n1 = Node(id="A", name="노드1", type=NodeType.PASSAGE,
              area=10.0, base_stay_prob=1.0, exit_weight=0.0)
    n2 = Node(id="A", name="노드2", type=NodeType.PASSAGE,
              area=10.0, base_stay_prob=1.0, exit_weight=0.0)
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    assert any("중복된 노드 id: A" in e for e in errs), f"예상 오류 없음: {errs}"


def test_duplicate_node_id_one_error_per_duplicate():
    """중복 id가 3번 등장(2개의 추가 중복)하면 오류가 2개 보고되어야 한다."""
    n1 = Node(id="X", name="n1", type=NodeType.PASSAGE,
              area=10.0, base_stay_prob=1.0, exit_weight=0.0)
    n2 = Node(id="X", name="n2", type=NodeType.PASSAGE,
              area=10.0, base_stay_prob=1.0, exit_weight=0.0)
    n3 = Node(id="X", name="n3", type=NodeType.PASSAGE,
              area=10.0, base_stay_prob=1.0, exit_weight=0.0)
    g = StationGraph(nodes=[n1, n2, n3], links=[])
    errs = g.validate()
    dup_errs = [e for e in errs if "중복된 노드 id: X" in e]
    assert len(dup_errs) == 2, f"중복 오류는 2개여야 함: {dup_errs}"


def test_unique_node_ids_no_duplicate_error():
    """모든 id가 유일하면 중복 오류가 없어야 한다."""
    n1 = Node(id="A", name="n1", type=NodeType.PASSAGE,
              area=10.0, base_stay_prob=1.0, exit_weight=0.0)
    n2 = Node(id="B", name="n2", type=NodeType.PASSAGE,
              area=10.0, base_stay_prob=1.0, exit_weight=0.0)
    g = StationGraph(nodes=[n1, n2], links=[])
    errs = g.validate()
    dup_errs = [e for e in errs if "중복된 노드 id" in e]
    assert dup_errs == [], f"중복 오류가 없어야 함: {dup_errs}"


# ─────────────────────────────────────────────
# FIX 3: 엘리베이터 유출경로 검증
# ─────────────────────────────────────────────

def test_elevator_no_outflow_no_exit_raises_error():
    """엘리베이터가 출력 링크도 없고 exit_weight=0이면 '유출 경로 없음' 오류가 나야 한다."""
    n = Node(
        id="EL", name="엘리베이터", type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0, exit_weight=0.0,  # exit_weight=0
        elevator=ElevatorConfig(capacity=10.0, speed=3),
    )
    g = StationGraph(nodes=[n], links=[])  # 출력 링크 없음
    errs = g.validate()
    assert any("유출 경로 없음" in e and "EL" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_elevator_with_exit_weight_no_error():
    """엘리베이터에 exit_weight>0이면 '유출 경로 없음' 오류가 없어야 한다."""
    n = Node(
        id="EL", name="엘리베이터", type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0, exit_weight=1.0,  # exit_weight>0
        elevator=ElevatorConfig(capacity=10.0, speed=3),
    )
    g = StationGraph(nodes=[n], links=[])
    errs = g.validate()
    outflow_errs = [e for e in errs if "유출 경로 없음" in e]
    assert outflow_errs == [], f"exit_weight>0이면 유출 경로 오류 없어야 함: {outflow_errs}"


def test_elevator_with_outlink_no_error():
    """엘리베이터에 출력 링크가 있으면 '유출 경로 없음' 오류가 없어야 한다."""
    el = Node(
        id="EL", name="엘리베이터", type=NodeType.ELEVATOR,
        area=10.0, base_stay_prob=0.0, exit_weight=0.0,  # exit_weight=0
        elevator=ElevatorConfig(capacity=10.0, speed=3),
    )
    dest = Node(
        id="P", name="통로", type=NodeType.PASSAGE,
        area=20.0, base_stay_prob=1.0, exit_weight=0.0,
    )
    # EL→P 출력 링크 있음 → 유출 경로 OK
    link = Link(source="EL", target="P", distance=5.0, weight=1.0)
    g = StationGraph(nodes=[el, dest], links=[link])
    errs = g.validate()
    outflow_errs = [e for e in errs if "유출 경로 없음" in e]
    assert outflow_errs == [], f"출력 링크 있으면 유출 경로 오류 없어야 함: {outflow_errs}"


# ─────────────────────────────────────────────
# FIX 4: 발생 파라미터 검증
# ─────────────────────────────────────────────

def _entrance_with_gen(gen: GenerationConfig) -> StationGraph:
    """generation 파라미터 검증 테스트용 단일 입구 노드 그래프."""
    n = Node(
        id="E", name="입구", type=NodeType.ENTRANCE,
        area=50.0, base_stay_prob=0.5, exit_weight=0.5,
        generation=gen,
    )
    return StationGraph(nodes=[n], links=[])


def test_generation_rate_negative_raises_error():
    """generation.kind=constant, rate<0이면 '발생률(rate)은 0 이상이어야 함' 오류가 나야 한다."""
    g = _entrance_with_gen(GenerationConfig(kind="constant", rate=-1.0))
    errs = g.validate()
    assert any("발생률(rate)은 0 이상이어야 함" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_generation_rate_zero_ok():
    """generation.kind=constant, rate=0이면 rate 관련 오류 없어야 한다."""
    g = _entrance_with_gen(GenerationConfig(kind="constant", rate=0.0))
    errs = g.validate()
    rate_errs = [e for e in errs if "발생률(rate)" in e]
    assert rate_errs == [], f"rate=0은 유효해야 함: {rate_errs}"


def test_generation_rate_inf_raises_error():
    """generation.rate=inf이면 오류가 나야 한다."""
    g = _entrance_with_gen(GenerationConfig(kind="poisson", rate=math.inf))
    errs = g.validate()
    assert any("발생률(rate)은 0 이상이어야 함" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_normal_pulse_sigma_zero_raises_error():
    """normal_pulse sigma_sec=0이면 '정규펄스 sigma_sec는 0보다 커야 함' 오류가 나야 한다."""
    g = _entrance_with_gen(GenerationConfig(kind="normal_pulse", sigma_sec=0.0, total=100.0))
    errs = g.validate()
    assert any("정규펄스 sigma_sec" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_normal_pulse_sigma_negative_raises_error():
    """normal_pulse sigma_sec<0이면 오류가 나야 한다."""
    g = _entrance_with_gen(GenerationConfig(kind="normal_pulse", sigma_sec=-1.0, total=100.0))
    errs = g.validate()
    assert any("정규펄스 sigma_sec" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_normal_pulse_total_negative_raises_error():
    """normal_pulse total<0이면 오류가 나야 한다."""
    g = _entrance_with_gen(GenerationConfig(kind="normal_pulse", sigma_sec=10.0, total=-5.0))
    errs = g.validate()
    assert any("정규펄스" in e and "total" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_normal_pulse_sigma_positive_ok():
    """normal_pulse sigma_sec>0, total>=0이면 관련 오류 없어야 한다."""
    g = _entrance_with_gen(GenerationConfig(kind="normal_pulse", sigma_sec=10.0, total=100.0))
    errs = g.validate()
    pulse_errs = [e for e in errs if "정규펄스" in e]
    assert pulse_errs == [], f"sigma>0,total>=0은 유효해야 함: {pulse_errs}"


def test_profile_malformed_not_list_raises_error():
    """generation.profile이 list가 아닌 형태이면 '발생 profile 형식이 올바르지 않음' 오류."""
    gen = GenerationConfig(kind="constant", rate=1.0)
    gen.profile = "invalid"  # type: ignore
    g = _entrance_with_gen(gen)
    errs = g.validate()
    assert any("발생 profile 형식이 올바르지 않음" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_profile_malformed_negative_time_raises_error():
    """profile에 음수 시각이 있으면 오류가 나야 한다."""
    gen = GenerationConfig(kind="constant", rate=1.0, profile=[[-10, 2.0], [50, 5.0]])
    g = _entrance_with_gen(gen)
    errs = g.validate()
    assert any("발생 profile 형식이 올바르지 않음" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_profile_malformed_wrong_pair_length_raises_error():
    """profile 항목이 [number, number] 쌍이 아니면 오류가 나야 한다."""
    gen = GenerationConfig(kind="constant", rate=1.0, profile=[[0, 1.0, 2.0]])
    g = _entrance_with_gen(gen)
    errs = g.validate()
    assert any("발생 profile 형식이 올바르지 않음" in e and "E" in e for e in errs), \
        f"예상 오류 없음: {errs}"


def test_profile_valid_ok():
    """유효한 profile이면 profile 관련 오류 없어야 한다."""
    gen = GenerationConfig(kind="constant", rate=1.0, profile=[[0, 1.0], [60, 3.0]])
    g = _entrance_with_gen(gen)
    errs = g.validate()
    profile_errs = [e for e in errs if "profile 형식" in e]
    assert profile_errs == [], f"유효한 profile에서 오류 없어야 함: {profile_errs}"


# ─────────────────────────────────────────────
# FIX 5: headway < dt 가드 (webapi.load)
# ─────────────────────────────────────────────

def _headway_cfg_text(headway_sec: float, dt_sec: float = 5.0) -> str:
    """단일 플랫폼 노드 + 지정된 headway로 config JSON 생성."""
    graph = {
        "nodes": [
            {
                "id": "P", "name": "승강장", "type": "platform",
                "area": 200.0, "base_stay_prob": 1.0,
                "congestion_enabled": False,
                "weidmann": {"v_free": 1.34, "rho_max": 5.4, "gamma": 1.913},
                "initial_population": 0.0, "exit_weight": 0.0,
                "generation": None,
                "train": {
                    "first_arrival_sec": 60.0,
                    "headway_sec": headway_sec,
                    "jitter_sigma_sec": 0.0,
                    "capacity": 200.0,
                    "alight_kind": "constant",
                    "alight_mean": 100.0,
                    "alight_std": 0.0,
                    "mode": "both",
                },
                "elevator": None,
            }
        ],
        "links": [],
    }
    config = {
        "dt_seconds": dt_sec,
        "duration_seconds": 3600.0,
        "default_walk_speed": 1.34,
        "stochastic": False,
        "seed": 0,
        "observation_noise_std": 0.0,
        "missing_prob": 0.0,
    }
    return json.dumps({"graph": graph, "config": config})


def test_load_headway_less_than_dt_raises_value_error():
    """headway_sec(3) < dt_seconds(5)이면 load()가 ValueError를 발생시켜야 한다."""
    from sim import webapi
    with pytest.raises(ValueError, match="배차간격"):
        webapi.load(_headway_cfg_text(headway_sec=3.0, dt_sec=5.0))


def test_load_headway_equal_to_dt_ok():
    """headway_sec == dt_seconds이면 오류가 없어야 한다."""
    from sim import webapi
    result = webapi.load(_headway_cfg_text(headway_sec=5.0, dt_sec=5.0))
    info = json.loads(result)
    assert "node_ids" in info


def test_load_headway_greater_than_dt_ok():
    """headway_sec > dt_seconds이면 오류가 없어야 한다."""
    from sim import webapi
    result = webapi.load(_headway_cfg_text(headway_sec=300.0, dt_sec=5.0))
    info = json.loads(result)
    assert "node_ids" in info
