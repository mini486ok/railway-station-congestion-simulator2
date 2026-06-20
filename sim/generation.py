from __future__ import annotations

import numpy as np

from sim.model import GenerationConfig, TrainConfig


class Generator:
    def amount(self, t_step: int, dt: float, rng, stochastic: bool) -> float:
        raise NotImplementedError


class ZeroGenerator(Generator):
    def amount(self, t_step, dt, rng, stochastic) -> float:
        return 0.0


def _rate_at(cfg: GenerationConfig, t_sec: float) -> float:
    """profile이 있으면 계단식 시간가변 rate, 없으면 고정 rate. (입력 순서 무관)

    첫 번째 profile 브레이크포인트 이전(t_sec < 첫 ts)에는 기본값 cfg.rate 사용.
    각 프로파일 점은 해당 시각 이후부터 계단식으로 적용된다(step function).
    """
    if not cfg.profile:
        return cfg.rate
    entries = sorted(cfg.profile, key=lambda e: e[0])
    rate = cfg.rate
    for ts, r in entries:
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


class BatchGenerator(Generator):
    """진짜 Compound Poisson 군집 발생기.

    rate는 배치 도착률(batches/sec), batch_size는 배치당 평균 인원.
    확률론 모드: 배치 수 N ~ Poisson(lam), 각 배치 크기 S_i ~ Poisson(batch_size),
    총 인원 = sum(S_i, i=1..N). 이로써 분산이 과소추정되지 않는다.
    결정론 모드: lam * batch_size (기대값 보존).
    """
    def __init__(self, cfg: GenerationConfig):
        self.cfg = cfg

    def amount(self, t_step, dt, rng, stochastic) -> float:
        t_sec = t_step * dt
        lam = _rate_at(self.cfg, t_sec) * dt   # 이 스텝에서 기대 배치 수
        if stochastic:
            num_batches = int(rng.poisson(max(lam, 0.0)))
            if num_batches > 0:
                people = float(rng.poisson(max(self.cfg.batch_size, 0.0), size=num_batches).sum())
            else:
                people = 0.0
            return people
        else:
            return float(max(lam, 0.0)) * self.cfg.batch_size


def build_generator(cfg: GenerationConfig | None) -> Generator:
    if cfg is None or cfg.kind == "none":
        return ZeroGenerator()
    if cfg.kind in ("constant", "poisson"):
        return RateGenerator(cfg)
    if cfg.kind == "batch":
        return BatchGenerator(cfg)
    raise ValueError(f"알 수 없는 발생 종류: {cfg.kind}")


def train_arrival_steps(cfg: TrainConfig, dt: float, duration_sec: float,
                        rng, stochastic: bool) -> set[int]:
    """주기적 배차(+선택적 정규 지터)를 이산 스텝 집합으로 변환."""
    steps: set[int] = set()
    t = cfg.first_arrival_sec

    # headway_sec <= 0 이면 첫 도착만 등록하고 즉시 반환 (무한루프 방지)
    if cfg.headway_sec <= 0:
        jitter = 0.0
        if stochastic and cfg.jitter_sigma_sec > 0:
            jitter = float(rng.normal(0.0, cfg.jitter_sigma_sec))
        arrival = max(0.0, t + jitter)
        step = int(round(arrival / dt))
        if 0 <= step <= round(duration_sec / dt):
            steps.add(step)
        return steps

    while t <= duration_sec + 1e-9:
        jitter = 0.0
        if stochastic and cfg.jitter_sigma_sec > 0:
            jitter = float(rng.normal(0.0, cfg.jitter_sigma_sec))
        arrival = max(0.0, t + jitter)
        step = int(round(arrival / dt))
        if 0 <= step <= round(duration_sec / dt):
            steps.add(step)
        t += cfg.headway_sec
    return steps


def sample_alight(cfg: TrainConfig, rng, stochastic: bool) -> float:
    """열차 1대당 하차 인원 표본."""
    if not stochastic or cfg.alight_kind == "constant":
        return float(max(cfg.alight_mean, 0.0))
    if cfg.alight_kind == "poisson":
        return float(rng.poisson(max(cfg.alight_mean, 0.0)))
    if cfg.alight_kind == "normal":
        return float(max(0.0, rng.normal(cfg.alight_mean, cfg.alight_std)))
    raise ValueError(f"알 수 없는 하차 종류: {cfg.alight_kind}")
