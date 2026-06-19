from __future__ import annotations

import json
import numpy as np
from dataclasses import asdict, fields

from sim.model import StationGraph, SimConfig


def _csv_field(value) -> str:
    """사용자 제어 문자열을 CSV-안전하게 이스케이프한다.

    - =, +, -, @ 로 시작하면 앞에 apostrophe 추가(수식 주입 방지)
    - 콤마, 큰따옴표, 개행 포함 시 RFC-4180 따옴표 처리
    - 특수문자 없는 일반 값은 그대로 반환(backward-compat)
    """
    s = str(value)
    stripped = s.lstrip()
    if stripped and stripped[0] in ('=', '+', '-', '@'):
        s = "'" + s
    if any(c in s for c in (',', '"', '\n', '\r')):
        s = '"' + s.replace('"', '""') + '"'
    return s


def history_to_csv(history: np.ndarray, node_ids: list[str],
                   dt_seconds: float, layout: str = "wide") -> str:
    rows = []
    if layout == "wide":
        rows.append(",".join(["step", "time_sec"] + [_csv_field(nid) for nid in node_ids]))
        for t in range(history.shape[0]):
            vals = [str(t), str(t * dt_seconds)]
            vals += [str(float(history[t, j])) for j in range(len(node_ids))]
            rows.append(",".join(vals))
    elif layout == "long":
        rows.append("step,time_sec,node,congestion")
        for t in range(history.shape[0]):
            for j, nid in enumerate(node_ids):
                rows.append(f"{t},{t * dt_seconds},{_csv_field(nid)},{float(history[t, j])}")
    else:
        raise ValueError(f"알 수 없는 layout: {layout}")
    return "\n".join(rows) + "\n"


def _matrix_csv(labels: list[str], mat) -> str:
    """행/열 레이블과 행렬(2D list)을 CSV 문자열로 변환하는 헬퍼."""
    escaped = [_csv_field(lbl) for lbl in labels]
    rows = ["," + ",".join(escaped)]
    for i, lbl in enumerate(labels):
        rows.append(_csv_field(lbl) + "," + ",".join(str(v) for v in mat[i]))
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

    feat_rows = ["id,name,type,area,group"]
    for node in graph.nodes:
        feat_rows.append(",".join([
            _csv_field(node.id),
            _csv_field(node.name),
            _csv_field(node.type.value),   # enum value: 안전하지만 일관성 위해 통과
            str(float(node.area)),          # 숫자: 그대로
            _csv_field(node.group),
        ]))

    return {
        "adjacency": _matrix_csv(ids, adj),
        "distance": _matrix_csv(ids, dist),
        "travel_time": _matrix_csv(ids, tt),
        "node_features": "\n".join(feat_rows) + "\n",
    }


def gnn_bundle_by_group(graph: StationGraph) -> dict[str, str]:
    """그룹 단위 GNN 번들. group 레이블 = node.group (비어 있으면 node.id), 첫 등장 순서."""
    # 그룹 레이블 결정 및 첫-등장 순서 유지
    eff_group = [n.group if n.group else n.id for n in graph.nodes]
    unique_groups: list[str] = []
    seen: dict[str, int] = {}
    for g in eff_group:
        if g not in seen:
            seen[g] = len(unique_groups)
            unique_groups.append(g)
    ng = len(unique_groups)

    # 그룹 인덱스 맵
    node_to_gidx = {n.id: seen[eff_group[i]] for i, n in enumerate(graph.nodes)}

    # 행렬 초기화
    adj = [[0.0] * ng for _ in range(ng)]
    dist_sum = [[0.0] * ng for _ in range(ng)]
    dist_cnt = [[0] * ng for _ in range(ng)]
    tt_sum = [[0.0] * ng for _ in range(ng)]
    tt_cnt = [[0] * ng for _ in range(ng)]

    node_id_map = {n.id: n for n in graph.nodes}
    for lnk in graph.links:
        src_node = node_id_map.get(lnk.source)
        tgt_node = node_id_map.get(lnk.target)
        if src_node is None or tgt_node is None:
            continue
        gi = node_to_gidx[lnk.source]
        gj = node_to_gidx[lnk.target]
        adj[gi][gj] += lnk.weight
        dist_sum[gi][gj] += float(lnk.distance)
        dist_cnt[gi][gj] += 1
        tt_sum[gi][gj] += float(lnk.travel_time)
        tt_cnt[gi][gj] += 1

    # 평균 거리 / 이동시간 행렬
    dist_avg = [
        [dist_sum[i][j] / dist_cnt[i][j] if dist_cnt[i][j] > 0 else 0.0 for j in range(ng)]
        for i in range(ng)
    ]
    tt_avg = [
        [round(tt_sum[i][j] / tt_cnt[i][j]) if tt_cnt[i][j] > 0 else 0 for j in range(ng)]
        for i in range(ng)
    ]

    # 그룹 피처: 노드 수, 총 면적, 타입(첫 등장 순서)
    group_num_nodes: list[int] = [0] * ng
    group_total_area: list[float] = [0.0] * ng
    group_types: list[list[str]] = [[] for _ in range(ng)]  # 첫 등장 순서 유지

    for i, node in enumerate(graph.nodes):
        gi = node_to_gidx[node.id]
        group_num_nodes[gi] += 1
        group_total_area[gi] += float(node.area)
        tv = node.type.value
        if tv not in group_types[gi]:
            group_types[gi].append(tv)

    feat_rows = ["group,num_nodes,total_area,types"]
    for gi, g in enumerate(unique_groups):
        feat_rows.append(",".join([
            _csv_field(g),
            str(group_num_nodes[gi]),
            str(group_total_area[gi]),
            _csv_field(";".join(group_types[gi])),
        ]))

    return {
        "adjacency": _matrix_csv(unique_groups, adj),
        "distance": _matrix_csv(unique_groups, dist_avg),
        "travel_time": _matrix_csv(unique_groups, tt_avg),
        "group_features": "\n".join(feat_rows) + "\n",
    }


def history_by_group(history: np.ndarray, node_ids: list[str],
                     groups: list[str], dt_seconds: float) -> str:
    """그룹별 혼잡도(인원 합) 시계열 CSV.

    groups: list[str] — 노드별 group, ""는 자기 자신 id로 취급.
    반환: wide CSV ``step,time_sec,<group1>,<group2>,...``
    그룹 컬럼 순서: 첫 등장 순서.
    """
    # 유효 그룹 레이블 결정 및 첫-등장 순서 유지
    eff_groups = [g if g else nid for g, nid in zip(groups, node_ids)]
    unique_groups: list[str] = []
    seen: dict[str, int] = {}
    for key in eff_groups:
        if key not in seen:
            seen[key] = len(unique_groups)
            unique_groups.append(key)

    num_steps = history.shape[0]
    num_unique = len(unique_groups)

    rows = [",".join(["step", "time_sec"] + [_csv_field(g) for g in unique_groups])]
    for t in range(num_steps):
        group_sum = np.zeros(num_unique, dtype=float)
        for j, key in enumerate(eff_groups):
            group_sum[seen[key]] += history[t, j]
        vals = [str(t), str(float(t * dt_seconds))]
        vals += [str(float(v)) for v in group_sum]
        rows.append(",".join(vals))
    return "\n".join(rows) + "\n"


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
