import numpy as np
from sim.model import GenerationConfig, TrainConfig
from sim.generation import build_generator, train_arrival_steps, sample_alight


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


def test_batch_deterministic():
    """batch 결정론: rate * dt * batch_size."""
    cfg = GenerationConfig(kind="batch", rate=2.0, batch_size=5.0)
    g = build_generator(cfg)
    # 결정론: 2.0 * 5.0 * 5.0 = 50.0
    assert g.amount(0, 5.0, np.random.default_rng(0), False) == 50.0


def test_batch_stochastic_nonneg_and_mean():
    """batch 확률론(진짜 Compound Poisson): 반환값은 비음수 정수이며 대표본 평균은 rate*dt*batch_size에 수렴."""
    cfg = GenerationConfig(kind="batch", rate=2.0, batch_size=3.0)
    g = build_generator(cfg)
    rng = np.random.default_rng(7)
    samples = [g.amount(0, 5.0, rng, True) for _ in range(3000)]
    # 비음수
    assert all(v >= 0.0 for v in samples)
    # 정수값 (각 배치 크기도 Poisson 표본이므로 합도 정수)
    assert all(float(v).is_integer() for v in samples)
    # 평균 ≈ rate*dt*batch_size = 2.0*5.0*3.0 = 30.0
    assert abs(np.mean(samples) - 30.0) < 1.5
    # 분산이 존재해야 함 (단순 고정 batch_size 모델보다 분산 크거나 같음)
    assert np.var(samples) > 0.0


def test_train_arrival_steps_periodic():
    cfg = TrainConfig(first_arrival_sec=60, headway_sec=300)
    steps = train_arrival_steps(cfg, dt=5.0, duration_sec=700, rng=np.random.default_rng(0), stochastic=False)
    # 60s, 360s, 660s → step 12, 72, 132
    assert steps == {12, 72, 132}


def test_train_arrival_steps_within_duration():
    cfg = TrainConfig(first_arrival_sec=0, headway_sec=100)
    steps = train_arrival_steps(cfg, dt=10.0, duration_sec=250, rng=np.random.default_rng(0), stochastic=False)
    # 0,100,200 → step 0,10,20 (250 이하)
    assert steps == {0, 10, 20}


def test_sample_alight_constant():
    cfg = TrainConfig(first_arrival_sec=0, headway_sec=100, alight_kind="constant", alight_mean=80)
    assert sample_alight(cfg, np.random.default_rng(0), False) == 80.0
    assert sample_alight(cfg, np.random.default_rng(0), True) == 80.0  # constant은 항상 평균


def test_sample_alight_normal_mean_close():
    cfg = TrainConfig(first_arrival_sec=0, headway_sec=100, alight_kind="normal",
                      alight_mean=100, alight_std=15)
    rng = np.random.default_rng(1)
    samples = [sample_alight(cfg, rng, True) for _ in range(3000)]
    assert abs(np.mean(samples) - 100.0) < 2.0
    assert min(samples) >= 0.0  # 음수 클립


# FIX 1: headway_sec <= 0 무한루프 방지
def test_train_arrival_steps_headway_zero_returns_at_most_one():
    """headway_sec=0 이면 최대 1개 스텝만 반환하고 무한루프가 걸리지 않아야 한다."""
    import signal

    def _timeout_handler(signum, frame):
        raise TimeoutError("train_arrival_steps hung (infinite loop)")

    cfg = TrainConfig(first_arrival_sec=60, headway_sec=0)
    rng = np.random.default_rng(0)
    # 시간 제한 없이 그냥 호출 — 무한루프 시 pytest timeout 또는 OS로 잡힘
    # Windows에서 signal.alarm 없으므로 직접 실행하고 길이만 확인
    steps = train_arrival_steps(cfg, dt=5.0, duration_sec=700, rng=rng, stochastic=False)
    assert len(steps) <= 1, f"headway=0일 때 스텝이 1개를 초과함: {steps}"


def test_train_arrival_steps_headway_negative_returns_at_most_one():
    """headway_sec < 0 이면 최대 1개 스텝만 반환하고 무한루프가 걸리지 않아야 한다."""
    cfg = TrainConfig(first_arrival_sec=60, headway_sec=-10)
    rng = np.random.default_rng(0)
    steps = train_arrival_steps(cfg, dt=5.0, duration_sec=700, rng=rng, stochastic=False)
    assert len(steps) <= 1, f"headway<0일 때 스텝이 1개를 초과함: {steps}"
