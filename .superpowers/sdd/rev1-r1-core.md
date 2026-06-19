# Review Round-1 Core Fixes — rev1-r1-core

Date: 2026-06-19  
Branch: feature/revision-1  
TDD approach: RED → GREEN per fix

---

## FIX 1 — train_arrival_steps 무한루프 방지 (sim/generation.py)

**변경**: `train_arrival_steps` 함수에 `headway_sec <= 0` 가드 추가.  
첫 도착만 등록 후 즉시 return. while 루프 진입 차단.

**테스트 (tests/test_generation.py)**:
- `test_train_arrival_steps_headway_zero_returns_at_most_one`: headway=0 → len ≤ 1
- `test_train_arrival_steps_headway_negative_returns_at_most_one`: headway=-10 → len ≤ 1

---

## FIX 2 — config 유효성 검사 (sim/webapi.py)

**변경**: `load()` 내 그래프 검증 통과 후, `config.dt_seconds <= 0` 또는 `config.duration_seconds <= 0` 이면  
`ValueError("dt_seconds와 duration_seconds는 0보다 커야 합니다")` 발생.

**테스트 (tests/test_webapi.py)**:
- `test_load_raises_on_zero_dt`: dt=0.0 → ValueError
- `test_load_raises_on_negative_dt`: dt=-1.0 → ValueError
- `test_load_raises_on_zero_duration`: duration=0.0 → ValueError

---

## FIX 3 — assert → 명시적 RuntimeError (sim/webapi.py)

**변경**: 모든 `assert _engine is not None` 을 제거하고 `_require_engine()` 헬퍼로 대체.  
`_engine is None` 이면 `RuntimeError("load()를 먼저 호출하세요.")` 발생.  
step/run_all/reset/snapshot/export_csv/export_gnn/export_group_csv/history_json/_snapshot_text 적용.

**테스트 (tests/test_webapi.py)**:
- `test_step_without_load_raises_runtime_error`: _engine=None → step() → RuntimeError
- `test_run_all_without_load_raises_runtime_error`: _engine=None → run_all() → RuntimeError

---

## FIX 4 — 그래프 검증 강화 (sim/model.py, StationGraph.validate)

**변경**:
1. PLATFORM 노드 train 필드 검증: `headway_sec > 0`, `first_arrival_sec >= 0`, `capacity >= 0`
2. 그룹 일관성 검사:
   - 동일 그룹에 PLATFORM 2개 이상 → 오류
   - 동일 그룹에 `congestion_enabled` 혼재 → 오류

**테스트 (tests/test_validate.py)**:
- `test_platform_headway_zero_raises_error`: headway=0 → 오류
- `test_platform_headway_negative_raises_error`: headway=-5 → 오류
- `test_platform_first_arrival_negative_raises_error`: first_arrival=-1 → 오류
- `test_platform_capacity_negative_raises_error`: capacity=-1 → 오류
- `test_group_two_platforms_raises_error`: 그룹에 PLATFORM 2개 → 오류
- `test_group_mixed_congestion_enabled_raises_error`: congestion 혼재 → 오류
- `test_group_valid_two_passages_same_congestion_no_error`: 통로 2개+동일 congestion → 오류 없음

---

## FIX 5 — CSV 필드 이스케이프 (sim/io.py)

**변경**: `_csv_field(value)` 헬퍼 추가.  
- `=,+,-,@` 시작 → apostrophe 접두어 (수식 주입 방지)  
- 콤마/따옴표/개행 포함 → RFC-4180 따옴표 처리  
- 일반 값 → 그대로 (backward-compat 보장)

적용 대상:
- `history_to_csv`: 노드 id 헤더 셀
- `history_by_group`: 그룹명 헤더 셀
- `gnn_bundle`: 매트릭스 행/열 id, node_features의 id/name/type/group

**테스트 (tests/test_io_csv.py)**:
- `test_history_to_csv_plain_values_unquoted`: 일반값 → 미변경
- `test_history_to_csv_node_id_with_comma_quoted`: "A,B" → `"A,B"`
- `test_history_to_csv_formula_injection_prevented`: "=SUM(A1)" → `'=SUM(A1)`
- `test_history_by_group_group_name_with_comma_quoted`: "X,Y" 그룹명 → 따옴표
- `test_gnn_bundle_node_id_with_comma_quoted`: 매트릭스 헤더 이스케이프
- `test_gnn_bundle_node_features_name_with_comma_quoted`: name에 콤마 → 따옴표
- `test_gnn_bundle_plain_node_features_unquoted`: 일반 node_features → 미변경

---

## 테스트 증거

| 단계 | 결과 |
|------|------|
| 기존 64개 (수정 전) | 64 passed |
| 신규 테스트 RED 확인 | 7개 FAILED (headway=0 무한루프는 직접 실행 위험으로 제외 후 확인) |
| 구현 후 GREEN | 전체 85 passed |

**Full suite**: `python -m pytest -q` → **85 passed in 0.17s**  
신규 테스트 수: 21개 (기존 64 + 신규 21 = 85)
