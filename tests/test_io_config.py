import numpy as np
from dataclasses import asdict
from sim.model import (NodeType, Node, Link, StationGraph, SimConfig)
from sim.io import save_config, load_config, apply_observation_noise


def _g():
    nodes = [Node(id="A", name="입구", type=NodeType.ENTRANCE, area=50, base_stay_prob=0.5,
                  exit_weight=1.0)]
    return StationGraph(nodes=nodes, links=[])


def test_config_round_trip():
    g = _g()
    cfg = SimConfig(dt_seconds=10.0, duration_seconds=600.0, seed=7, stochastic=True)
    text = save_config(g, cfg)
    g2, cfg2 = load_config(text)
    assert g2.to_json() == g.to_json()
    assert asdict(cfg2) == asdict(cfg)


def test_observation_noise_disabled_is_passthrough():
    hist = np.array([[1.0, 2.0], [3.0, 4.0]])
    out = apply_observation_noise(hist, SimConfig(), np.random.default_rng(0))
    assert np.allclose(out, hist)
    assert out is not hist  # 복사본


def test_observation_noise_and_missing():
    hist = np.full((100, 2), 50.0)
    cfg = SimConfig(observation_noise_std=5.0, missing_prob=0.2)
    out = apply_observation_noise(hist, cfg, np.random.default_rng(0))
    valid = out[~np.isnan(out)]
    assert valid.min() >= 0.0                 # 음수 클립
    assert abs(np.nanmean(out) - 50.0) < 2.0  # 평균 보존
    assert np.isnan(out).mean() > 0.1         # 결측 일부 발생
