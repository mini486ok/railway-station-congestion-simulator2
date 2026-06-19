"""브라우저(Pyodide) Worker가 호출하는 얇은 파사드. 순수 Python."""
from __future__ import annotations

import json

from sim.io import load_config, history_to_csv, gnn_bundle, history_by_group
from sim.engine import Engine

_engine: Engine | None = None


def _require_engine() -> Engine:
    """엔진이 초기화되지 않았으면 명시적 RuntimeError를 발생시킨다."""
    if _engine is None:
        raise RuntimeError("load()를 먼저 호출하세요.")
    return _engine


def validate(config_text: str) -> str:
    graph, _ = load_config(config_text)
    return json.dumps(graph.validate(), ensure_ascii=False)


def _snapshot_text() -> str:
    eng = _require_engine()
    return json.dumps(eng.snapshot(), ensure_ascii=False)


def load(config_text: str) -> str:
    global _engine
    graph, config = load_config(config_text)
    errors = graph.validate()
    if errors:
        raise ValueError("; ".join(errors))
    # FIX 2: dt_seconds/duration_seconds 유효성 검사
    if config.dt_seconds <= 0 or config.duration_seconds <= 0:
        raise ValueError("dt_seconds와 duration_seconds는 0보다 커야 합니다")
    # FIX 5: headway < dt → 열차 누락 가드
    from sim.model import NodeType
    for nd in graph.nodes:
        if nd.type == NodeType.PLATFORM and nd.train is not None:
            if nd.train.headway_sec < config.dt_seconds:
                raise ValueError("배차간격(headway)이 Δt(dt_seconds)보다 작아 열차가 누락됩니다")
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
    eng = _require_engine()
    for _ in range(int(n)):
        if eng.t >= eng.num_steps:
            break
        eng.step()
        eng.history[eng.t] = eng.N
    return _snapshot_text()


def run_all() -> str:
    eng = _require_engine()
    eng.run()
    return _snapshot_text()


def reset() -> str:
    eng = _require_engine()
    eng.reset()
    return _snapshot_text()


def snapshot() -> str:
    return _snapshot_text()


def export_csv(layout: str = "wide") -> str:
    eng = _require_engine()
    return history_to_csv(eng.history, eng.node_ids,
                          eng.config.dt_seconds, layout)


def export_gnn() -> str:
    eng = _require_engine()
    return json.dumps(gnn_bundle(eng.graph), ensure_ascii=False)


def export_group_csv() -> str:
    """그룹별 혼잡도(인원 합) 시계열 CSV 를 반환한다."""
    eng = _require_engine()
    node_map = {nd.id: nd for nd in eng.graph.nodes}
    effective_groups = [
        node_map[nid].group if node_map[nid].group else nid
        for nid in eng.node_ids
    ]
    return history_by_group(
        eng.history, eng.node_ids, effective_groups, eng.config.dt_seconds
    )


def history_json() -> str:
    eng = _require_engine()
    return json.dumps({
        "node_ids": eng.node_ids,
        "dt": eng.config.dt_seconds,
        "values": [[float(x) for x in row] for row in eng.history],
    }, ensure_ascii=False)
