from __future__ import annotations

import json
import numpy as np
from dataclasses import asdict, fields

from sim.model import StationGraph, SimConfig


def history_to_csv(history: np.ndarray, node_ids: list[str],
                   dt_seconds: float, layout: str = "wide") -> str:
    rows = []
    if layout == "wide":
        rows.append(",".join(["step", "time_sec"] + list(node_ids)))
        for t in range(history.shape[0]):
            vals = [str(t), str(t * dt_seconds)]
            vals += [str(float(history[t, j])) for j in range(len(node_ids))]
            rows.append(",".join(vals))
    elif layout == "long":
        rows.append("step,time_sec,node,congestion")
        for t in range(history.shape[0]):
            for j, nid in enumerate(node_ids):
                rows.append(f"{t},{t * dt_seconds},{nid},{float(history[t, j])}")
    else:
        raise ValueError(f"알 수 없는 layout: {layout}")
    return "\n".join(rows) + "\n"


def gnn_bundle(graph: StationGraph) -> dict[str, str]:
    ids = [n.id for n in graph.nodes]
    idx = {nid: i for i, nid in enumerate(ids)}
    n = len(ids)
    adj = [[0.0] * n for _ in range(n)]
    dist = [[0.0] * n for _ in range(n)]
    tt = [[0] * n for _ in range(n)]
    for l in graph.links:
        i, j = idx[l.source], idx[l.target]
        adj[i][j] += l.weight
        dist[i][j] = float(l.distance)
        tt[i][j] = int(l.travel_time)

    def matrix_csv(mat) -> str:
        rows = ["," + ",".join(ids)]
        for i, nid in enumerate(ids):
            rows.append(nid + "," + ",".join(str(v) for v in mat[i]))
        return "\n".join(rows) + "\n"

    feat_rows = ["id,name,type,area"]
    for node in graph.nodes:
        feat_rows.append(f"{node.id},{node.name},{node.type.value},{float(node.area)}")

    return {
        "adjacency": matrix_csv(adj),
        "distance": matrix_csv(dist),
        "travel_time": matrix_csv(tt),
        "node_features": "\n".join(feat_rows) + "\n",
    }


def save_config(graph: StationGraph, config: SimConfig) -> str:
    return json.dumps({"graph": graph.to_json(), "config": asdict(config)},
                      ensure_ascii=False, indent=2)


def load_config(text: str) -> tuple[StationGraph, SimConfig]:
    data = json.loads(text)
    graph = StationGraph.from_json(data["graph"])
    known = {f.name for f in fields(SimConfig)}
    cfg_data = {k: v for k, v in data["config"].items() if k in known}
    config = SimConfig(**cfg_data)
    return graph, config


def apply_observation_noise(history: np.ndarray, config: SimConfig, rng) -> np.ndarray:
    out = history.copy()
    if config.observation_noise_std > 0:
        out = out + rng.normal(0.0, config.observation_noise_std, size=out.shape)
        out = np.clip(out, 0.0, None)
    if config.missing_prob > 0:
        mask = rng.random(out.shape) < config.missing_prob
        out[mask] = np.nan
    return out
