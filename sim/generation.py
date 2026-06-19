from __future__ import annotations

import math
import numpy as np

from sim.model import GenerationConfig, TrainConfig


class Generator:
    def amount(self, t_step: int, dt: float, rng, stochastic: bool) -> float:
        raise NotImplementedError


class ZeroGenerator(Generator):
    def amount(self, t_step, dt, rng, stochastic) -> float:
        return 0.0


def _rate_at(cfg: GenerationConfig, t_sec: float) -> float:
    """profile이 있으면 계단식 시간가변 rate, 없으면 고정 rate."""
    if not cfg.profile:
        return cfg.rate
    rate = cfg.profile[0][1]
    for ts, r in cfg.profile:
        if t_sec >= ts:
            rate = r
        else:
            break
    return rate


class RateGenerator(Generator):
    """constant / poisson 공용. poisson + stochastic 일 때만 표본추출."""
    def __init__(self, cfg: GenerationConfig):
        self.cfg = cfg

    def amount(self, t_step, dt, rng, stochastic) -> float:
        t_sec = t_step * dt
        mean = _rate_at(self.cfg, t_sec) * dt
        if stochastic and self.cfg.kind == "poisson":
            return float(rng.poisson(max(mean, 0.0)))
        return float(max(mean, 0.0))


class NormalPulseGenerator(Generator):
    def __init__(self, cfg: GenerationConfig):
        self.cfg = cfg

    def amount(self, t_step, dt, rng, stochastic) -> float:
        t_sec = t_step * dt
        s = max(self.cfg.sigma_sec, 1e-9)
        pdf = math.exp(-0.5 * ((t_sec - self.cfg.center_sec) / s) ** 2) / (s * math.sqrt(2 * math.pi))
        mean = self.cfg.total * pdf * dt
        if stochastic:
            return float(rng.poisson(max(mean, 0.0)))
        return float(max(mean, 0.0))


def build_generator(cfg: GenerationConfig | None) -> Generator:
    if cfg is None or cfg.kind == "none":
        return ZeroGenerator()
    if cfg.kind in ("constant", "poisson"):
        return RateGenerator(cfg)
    if cfg.kind == "normal_pulse":
        return NormalPulseGenerator(cfg)
    raise ValueError(f"알 수 없는 발생 종류: {cfg.kind}")
