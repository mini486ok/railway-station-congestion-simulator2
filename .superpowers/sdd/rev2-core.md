# rev2-core SDD

작성일: 2026-06-19

## 변경 파일

- `sim/model.py`: ElevatorConfig dataclass 추가, Node.elevator 필드 추가, TrainConfig.mode 필드 추가, from_json elevator 복원, validate() 규칙 갱신
- `sim/engine.py`: __init__에 elevator_cfg 빌드, step()에 elevator 전용 movers 오버라이드, 열차 이벤트 mode 분기
- `tests/test_validate.py`: test_group_two_platforms_raises_error → test_group_two_alight_platforms_raises_error + test_group_board_plus_alight_platform_no_error
- `tests/test_revision2.py`: 신규 TDD 테스트 (엘리베이터 엔진/검증, train mode, 그룹 완화)

## 구현 상세

### A. ElevatorConfig (model.py)

```python
@dataclass
class ElevatorConfig:
    capacity: float = 10.0   # 1회 운송 인원
    speed: int = 3            # 출발 주기(slot 수)
```

- `Node.elevator: ElevatorConfig | None = None` (train 필드 다음에 위치)
- `from_json`에서 `_known_kwargs` 패턴으로 round-trip 지원

### A. Engine elevator 분기 (engine.py)

`__init__`에서 `self.elevator_cfg` 빌드 (ELEVATOR 노드만).

`step()`에서 `movers = self.N * move_prob` 계산 후, 출력 분배 루프 전에 오버라이드:
- `(s + 1) % speed == 0`이면 `min(capacity, N[i])` 유출
- 그 외 스텝은 `movers[i] = 0.0`

### B. TrainConfig.mode (model.py + engine.py)

```python
mode: str = "both"  # "both" | "alight" | "board"
```

`step()` 열차 이벤트:
- `mode in ("both", "board")` → 탑승(sink)
- `mode in ("both", "alight")` → 하차(source)
- 기본값 `"both"` → 기존 동작 완전 보존

### C. validate() 규칙 갱신

**엘리베이터 노드:**
- `elevator is None` → 오류
- `elevator.capacity <= 0` → 오류
- `elevator.speed < 1` → 오류
- `train is not None` → 오류
- `generation is not None` → 오류
- 비엘리베이터 노드에 `elevator is not None` → 오류

**TrainConfig.mode:**
- `mode not in ("both", "alight", "board")` → 오류

**그룹 플랫폼 규칙 완화:**
- 기존: PLATFORM >= 2개 → 오류
- 신규: 하차 역할(`mode in {both, alight}`) PLATFORM >= 2개 → 오류
- board 전용 다수, elevator 다수 그룹은 허용

## TDD 증거

RED → GREEN 순서:
1. `tests/test_revision2.py` 작성 → `ImportError: cannot import name 'ElevatorConfig'`
2. `tests/test_validate.py` 수정 → RED (규칙 미반영)
3. `sim/model.py` ElevatorConfig + TrainConfig.mode 추가 → elevator JSON round-trip 통과
4. `sim/model.py` validate() 갱신 → 검증 테스트 전체 통과
5. `sim/engine.py` elevator_cfg + step() elevator 분기 → 엘리베이터 엔진 테스트 통과
6. `sim/engine.py` train mode 분기 → mode 테스트 전체 통과

## 전체 테스트 결과

**125 passed, 0 failed**
- 기존 104개 (test_group_two_platforms_raises_error 삭제, test_group_two_alight_platforms_raises_error + test_group_board_plus_alight_platform_no_error 교체 = +1)
- 신규 test_revision2.py: 19개
- 최종: 125개 전체 통과
