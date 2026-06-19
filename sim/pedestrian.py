from __future__ import annotations

import math
import numpy as np

from sim.model import WeidmannParams


def speed_ratio(density: float, params: WeidmannParams) -> float:
    """Weidmann/Kladek 기본도의 속도비 v(ρ)/v_free ∈ [0,1]."""
    if density <= 0.0:
        return 1.0
    if density >= params.rho_max:
        return 0.0
    val = 1.0 - math.exp(-params.gamma * (1.0 / density - 1.0 / params.rho_max))
    return float(min(1.0, max(0.0, val)))


def move_probability_vec(
    N: np.ndarray,
    area: np.ndarray,
    base_move: np.ndarray,
    v_free: np.ndarray,
    rho_max: np.ndarray,
    gamma: np.ndarray,
    enabled: np.ndarray,
) -> np.ndarray:
    """노드별 이동확률 = base_move * speed_ratio(밀도). enabled=False면 base_move."""
    density = np.where(area > 0, N / area, 0.0)
    safe = np.clip(density, 1e-12, None)
    ratio = 1.0 - np.exp(-gamma * (1.0 / safe - 1.0 / rho_max))
    ratio = np.clip(ratio, 0.0, 1.0)
    ratio = np.where(density >= rho_max, 0.0, ratio)
    ratio = np.where(density <= 0.0, 1.0, ratio)
    effective = base_move * ratio
    return np.where(enabled, effective, base_move)
