import numpy as np
from sim.model import GenerationConfig
from sim.generation import build_generator


def test_zero_generator_for_none():
    g = build_generator(None)
    assert g.amount(0, 5.0, np.random.default_rng(0), False) == 0.0


def test_constant_deterministic():
    g = build_generator(GenerationConfig(kind="constant", rate=2.0))
    # 결정론: rate * dt
    assert g.amount(0, 5.0, np.random.default_rng(0), False) == 10.0
    assert g.amount(100, 5.0, np.random.default_rng(0), False) == 10.0


def test_poisson_deterministic_equals_mean():
    g = build_generator(GenerationConfig(kind="poisson", rate=2.0))
    assert g.amount(0, 5.0, np.random.default_rng(0), False) == 10.0


def test_poisson_stochastic_mean_close():
    g = build_generator(GenerationConfig(kind="poisson", rate=2.0))
    rng = np.random.default_rng(42)
    samples = [g.amount(0, 5.0, rng, True) for _ in range(5000)]
    assert abs(np.mean(samples) - 10.0) < 0.5
    assert all(float(s).is_integer() for s in samples)  # 정수 표본


def test_profile_time_varying_rate():
    cfg = GenerationConfig(kind="poisson", rate=1.0, profile=[[0, 1.0], [50, 4.0]])
    g = build_generator(cfg)
    # t_sec < 50 이면 rate=1.0, 그 이후 4.0 (계단식 유지)
    assert g.amount(0, 10.0, np.random.default_rng(0), False) == 10.0   # t=0s, rate1
    assert g.amount(6, 10.0, np.random.default_rng(0), False) == 40.0   # t=60s, rate4


def test_normal_pulse_total_conserved():
    cfg = GenerationConfig(kind="normal_pulse", center_sec=50.0, sigma_sec=10.0, total=1000.0)
    g = build_generator(cfg)
    dt = 1.0
    total = sum(g.amount(t, dt, np.random.default_rng(0), False) for t in range(0, 100))
    assert abs(total - 1000.0) < 5.0   # 펄스 적분 ≈ total
