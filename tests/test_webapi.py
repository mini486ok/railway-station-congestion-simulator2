import json
from sim import webapi


def _cfg_text(duration=20.0, dt=5.0):
    graph = {
        "nodes": [
            {"id": "A", "name": "입구", "type": "entrance", "area": 50.0,
             "base_stay_prob": 0.5, "congestion_enabled": False,
             "weidmann": {"v_free": 1.34, "rho_max": 5.4, "gamma": 1.913},
             "initial_population": 0.0, "exit_weight": 0.0,
             "generation": {"kind": "constant", "rate": 2.0}, "train": None},
            {"id": "B", "name": "통로", "type": "passage", "area": 50.0,
             "base_stay_prob": 0.5, "congestion_enabled": False,
             "weidmann": {"v_free": 1.34, "rho_max": 5.4, "gamma": 1.913},
             "initial_population": 0.0, "exit_weight": 1.0,
             "generation": None, "train": None},
        ],
        "links": [{"source": "A", "target": "B", "distance": 5.0,
                   "weight": 1.0, "travel_time": 1}],
    }
    config = {"dt_seconds": dt, "duration_seconds": duration,
              "default_walk_speed": 1.34, "stochastic": False, "seed": 0,
              "observation_noise_std": 0.0, "missing_prob": 0.0}
    return json.dumps({"graph": graph, "config": config})


def test_validate_ok_and_error():
    assert json.loads(webapi.validate(_cfg_text())) == []
    bad = json.loads(_cfg_text())
    bad["graph"]["links"][0]["weight"] = 0.5  # A 출력합 0.5 != 1
    errs = json.loads(webapi.validate(json.dumps(bad)))
    assert any("가중치 합" in e for e in errs)


def test_load_step_run_reset_roundtrip():
    info = json.loads(webapi.load(_cfg_text(duration=20.0, dt=5.0)))
    assert info["node_ids"] == ["A", "B"]
    assert info["num_steps"] == 4
    snap = json.loads(webapi.step(1))
    assert snap["t"] == 1 and abs(snap["N"][0] - 10.0) < 1e-9  # 발생 2*5=10
    final = json.loads(webapi.run_all())  # run()은 reset 후 전체 실행
    assert final["t"] == 4
    r = json.loads(webapi.reset())
    assert r["t"] == 0 and r["total_generated"] == 0.0


def test_load_invalid_raises():
    bad = json.loads(_cfg_text())
    bad["graph"]["links"][0]["weight"] = 0.5
    try:
        webapi.load(json.dumps(bad))
        assert False, "should raise"
    except ValueError as e:
        assert "가중치 합" in str(e)


def test_export_csv_and_gnn():
    webapi.load(_cfg_text(duration=10.0, dt=5.0))
    webapi.run_all()
    csv = webapi.export_csv("wide")
    assert csv.splitlines()[0] == "step,time_sec,A,B"
    bundle = json.loads(webapi.export_gnn())
    assert set(bundle.keys()) == {"adjacency", "distance", "travel_time", "node_features"}
    assert bundle["adjacency"].splitlines()[0] == ",A,B"
