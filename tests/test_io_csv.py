import numpy as np
from sim.io import history_to_csv


def test_wide_csv_header_and_rows():
    hist = np.array([[0.0, 0.0], [10.0, 5.0]])
    csv = history_to_csv(hist, ["A", "B"], dt_seconds=5.0, layout="wide")
    lines = csv.strip().splitlines()
    assert lines[0] == "step,time_sec,A,B"
    assert lines[1] == "0,0.0,0.0,0.0"
    assert lines[2] == "1,5.0,10.0,5.0"


def test_long_csv():
    hist = np.array([[0.0, 0.0], [10.0, 5.0]])
    csv = history_to_csv(hist, ["A", "B"], dt_seconds=5.0, layout="long")
    lines = csv.strip().splitlines()
    assert lines[0] == "step,time_sec,node,congestion"
    assert "1,5.0,A,10.0" in lines
    assert "1,5.0,B,5.0" in lines
