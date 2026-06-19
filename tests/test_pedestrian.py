import numpy as np
from sim.model import WeidmannParams
from sim.pedestrian import speed_ratio, move_probability_vec


def test_speed_ratio_low_density_near_one():
    p = WeidmannParams()
    assert speed_ratio(0.05, p) > 0.95   # 매우 한산 → 거의 자유속도


def test_speed_ratio_zero_at_jam():
    p = WeidmannParams()
    assert speed_ratio(p.rho_max, p) == 0.0
    assert speed_ratio(p.rho_max + 1, p) == 0.0


def test_speed_ratio_monotonic_decreasing():
    p = WeidmannParams()
    densities = [0.1, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0]
    ratios = [speed_ratio(d, p) for d in densities]
    assert all(ratios[i] >= ratios[i + 1] for i in range(len(ratios) - 1))


def test_move_probability_vec_disabled_returns_base():
    N = np.array([100.0, 100.0])
    area = np.array([10.0, 10.0])
    base_move = np.array([0.8, 0.8])
    enabled = np.array([False, False])
    out = move_probability_vec(N, area, base_move, np.array([1.34, 1.34]),
                               np.array([5.4, 5.4]), np.array([1.913, 1.913]), enabled)
    assert np.allclose(out, base_move)


def test_move_probability_vec_congestion_lowers_move():
    # 동일 면적, 인원이 많은 노드의 이동확률이 더 낮아야 한다
    N = np.array([5.0, 500.0])
    area = np.array([10.0, 10.0])
    base_move = np.array([0.8, 0.8])
    enabled = np.array([True, True])
    out = move_probability_vec(N, area, base_move, np.array([1.34, 1.34]),
                               np.array([5.4, 5.4]), np.array([1.913, 1.913]), enabled)
    assert out[0] > out[1]
    assert out[1] < base_move[1]
