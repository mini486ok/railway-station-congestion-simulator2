from __future__ import annotations

import numpy as np

from sim.model import StationGraph, SimConfig, NodeType
from sim.pedestrian import move_probability_vec


class Engine:
    def __init__(self, graph: StationGraph, config: SimConfig):
        graph.resolve_travel_times(config)
        self.graph = graph
        self.config = config
        self.rng = np.random.default_rng(config.seed)

        self.node_ids = [n.id for n in graph.nodes]
        self._idx = {nid: i for i, nid in enumerate(self.node_ids)}
        n = len(self.node_ids)

        self.N = np.array([nd.initial_population for nd in graph.nodes], dtype=float)
        self.area = np.array([nd.area for nd in graph.nodes], dtype=float)
        self.base_move = np.array([1.0 - nd.base_stay_prob for nd in graph.nodes], dtype=float)
        self.exit_weight = np.array([nd.exit_weight for nd in graph.nodes], dtype=float)
        self.enabled = np.array([nd.congestion_enabled for nd in graph.nodes], dtype=bool)
        self.v_free = np.array([nd.weidmann.v_free for nd in graph.nodes], dtype=float)
        self.rho_max = np.array([nd.weidmann.rho_max for nd in graph.nodes], dtype=float)
        self.gamma = np.array([nd.weidmann.gamma for nd in graph.nodes], dtype=float)

        # 출력 링크: source_idx -> [(target_idx, weight, travel_time), ...]
        self.out_links: list[list[tuple[int, float, int]]] = [[] for _ in range(n)]
        for l in graph.links:
            si, ti = self._idx[l.source], self._idx[l.target]
            self.out_links[si].append((ti, l.weight, int(l.travel_time)))

        self._pending: dict[int, np.ndarray] = {}
        self.t = 0
        self.total_exited = 0.0
        self.total_generated = 0.0

    def _move_prob(self) -> np.ndarray:
        return move_probability_vec(self.N, self.area, self.base_move,
                                    self.v_free, self.rho_max, self.gamma, self.enabled)

    def step(self) -> None:
        n = len(self.node_ids)
        s = self.t
        move_prob = self.base_move  # 혼잡 미적용(Task 10에서 self._move_prob()로 교체)
        movers = self.N * move_prob
        newN = self.N - movers  # 잔류(stayers)

        # 유출 분배(링크 + exit sink): 도착시각(s+τ)으로 적재
        for i in range(n):
            m = movers[i]
            if m <= 0:
                continue
            self.total_exited += m * self.exit_weight[i]
            for (ti, w, tau) in self.out_links[i]:
                if w == 0:
                    continue
                arr = s + tau
                buf = self._pending.get(arr)
                if buf is None:
                    buf = np.zeros(n)
                    self._pending[arr] = buf
                buf[ti] += m * w

        # 이번 스텝이 만드는 N(s+1)에 도착하는 유입(τ=1 포함)
        arrivals = self._pending.pop(s + 1, np.zeros(n))
        newN = newN + arrivals

        self.N = newN
        self.t += 1
