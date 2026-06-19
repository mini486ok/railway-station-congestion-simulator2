from __future__ import annotations

import numpy as np

from sim.model import StationGraph, SimConfig, NodeType
from sim.pedestrian import move_probability_vec
from sim.generation import build_generator, train_arrival_steps, sample_alight


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

        # 노드별 발생자
        self.generators = [build_generator(nd.generation) for nd in graph.nodes]

        # 승강장 열차 스케줄
        duration = self.config.duration_seconds
        self.train_steps: dict[int, set[int]] = {}
        self.train_cfg = {}
        for i, nd in enumerate(graph.nodes):
            if nd.type == NodeType.PLATFORM and nd.train is not None:
                self.train_steps[i] = train_arrival_steps(
                    nd.train, self.config.dt_seconds, duration, self.rng,
                    self.config.stochastic)
                self.train_cfg[i] = nd.train

        self._pending: dict[int, np.ndarray] = {}
        self.t = 0
        self.total_exited = 0.0
        self.total_generated = 0.0

        self.num_steps = int(round(self.config.duration_seconds / self.config.dt_seconds))
        self.history = np.zeros((self.num_steps + 1, len(self.node_ids)))
        self.history[0] = self.N

    def _move_prob(self) -> np.ndarray:
        return move_probability_vec(self.N, self.area, self.base_move,
                                    self.v_free, self.rho_max, self.gamma, self.enabled)

    def step(self) -> None:
        n = len(self.node_ids)
        s = self.t
        move_prob = self._move_prob()  # 혼잡도 기반 동적 이동확률
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

        # 발생(source): 출입구/승강장 연속 발생
        for i in range(n):
            g = self.generators[i].amount(self.t, self.config.dt_seconds,
                                          self.rng, self.config.stochastic)
            if g:
                newN[i] += g
                self.total_generated += g

        # 승강장 열차 이벤트: 탑승(sink) 먼저 → 하차(source) 나중
        for i, steps in self.train_steps.items():
            if self.t in steps:
                cfg = self.train_cfg[i]
                board = min(cfg.capacity, max(newN[i], 0.0))
                newN[i] -= board
                self.total_exited += board
                alight = sample_alight(cfg, self.rng, self.config.stochastic)
                newN[i] += alight
                self.total_generated += alight

        self.N = newN
        self.t += 1

    def run(self, on_progress=None) -> np.ndarray:
        for _ in range(self.num_steps):
            self.step()
            self.history[self.t] = self.N
            if on_progress is not None:
                on_progress(self.t, self.num_steps)
        return self.history

    def snapshot(self) -> dict:
        return {
            "t": int(self.t),
            "time_sec": float(self.t * self.config.dt_seconds),
            "N": [float(x) for x in self.N],
            "node_ids": list(self.node_ids),
            "total_generated": float(self.total_generated),
            "total_exited": float(self.total_exited),
        }
