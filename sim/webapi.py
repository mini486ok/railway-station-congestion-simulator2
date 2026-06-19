"""브라우저(Pyodide) Worker가 호출하는 얇은 파사드. 순수 Python."""
from __future__ import annotations

import json

from sim.io import load_config, history_to_csv, gnn_bundle, history_by_group
from sim.engine import Engine

_engine: Engine | None = None


def validate(config_text: str) -> str:
    graph, _ = load_config(config_text)
    return json.dumps(graph.validate(), ensure_ascii=False)


def _snapshot_text() -> str:
    assert _engine is not None
    return json.dumps(_engine.snapshot(), ensure_ascii=False)


def load(config_text: str) -> str:
    global _engine
    graph, config = load_config(config_text)
    errors = graph.validate()
    if errors:
        raise ValueError("; ".join(errors))
    _engine = Engine(graph, config)
    # 유효 그룹 레이블: group 있으면 그대로, 없으면 node.id
    node_map = {nd.id: nd for nd in graph.nodes}
    effective_groups = [
        node_map[nid].group if node_map[nid].group else nid
        for nid in _engine.node_ids
    ]
    return json.dumps(
        {
            "node_ids": _engine.node_ids,
            "num_steps": _engine.num_steps,
            "groups": effective_groups,
        },
        ensure_ascii=False,
    )


def step(n: int) -> str:
    assert _engine is not None
    for _ in range(int(n)):
        if _engine.t >= _engine.num_steps:
            break
        _engine.step()
        _engine.history[_engine.t] = _engine.N
    return _snapshot_text()


def run_all() -> str:
    assert _engine is not None
    _engine.run()
    return _snapshot_text()


def reset() -> str:
    assert _engine is not None
    _engine.reset()
    return _snapshot_text()


def snapshot() -> str:
    return _snapshot_text()


def export_csv(layout: str = "wide") -> str:
    assert _engine is not None
    return history_to_csv(_engine.history, _engine.node_ids,
                          _engine.config.dt_seconds, layout)


def export_gnn() -> str:
    assert _engine is not None
    return json.dumps(gnn_bundle(_engine.graph), ensure_ascii=False)


def export_group_csv() -> str:
    """그룹별 혼잡도(인원 합) 시계열 CSV 를 반환한다."""
    assert _engine is not None
    node_map = {nd.id: nd for nd in _engine.graph.nodes}
    effective_groups = [
        node_map[nid].group if node_map[nid].group else nid
        for nid in _engine.node_ids
    ]
    return history_by_group(
        _engine.history, _engine.node_ids, effective_groups, _engine.config.dt_seconds
    )


def history_json() -> str:
    assert _engine is not None
    return json.dumps({
        "node_ids": _engine.node_ids,
        "dt": _engine.config.dt_seconds,
        "values": [[float(x) for x in row] for row in _engine.history],
    }, ensure_ascii=False)
