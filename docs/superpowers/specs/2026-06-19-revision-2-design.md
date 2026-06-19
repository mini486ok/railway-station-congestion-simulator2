# 2차 수정 설계 문서

- 작성일: 2026-06-19
- 범위: 엘리베이터 배치 운송, 승강장 승차/하차 역할 분리, 2노드/그룹 규칙 기반 예제, 그룹 검증 완화, 템플릿 삭제(숨김) 보완.
- 확정된 결정(사용자 승인): 엘리베이터=고정 주기 / 승강장=역할 분리(mode) / 삭제=내 템플릿+기본예제 숨김 / 적용=예제+모델+문서(편집기 자동보조 미포함).

## A. 엘리베이터 배치 운송 (코어)
- `ElevatorConfig { capacity: float, speed: int }`를 `Node.elevator`에 추가(엘리베이터 종류 전용).
- 엔진: 엘리베이터 노드는 일반 이동확률/Weidmann을 적용하지 않고 배치 운송으로 동작.
  - 유입 인원 누적, 평소 전원 체류(이동확률 0).
  - 처리 시점 `s = self.t`(N(s+1) 생성)에서 `(s + 1) % speed == 0`이면 `release = min(capacity, max(N[i], 0))`을 출력 링크 가중치 + `exit_weight`로 유출(소요시간 버퍼 사용, 일반 movers와 동일 경로). 그 외 스텝은 유출 0.
  - `congestion_enabled`는 의미 없음(엘리베이터 전용 분기에서 Weidmann 미적용).
- 검증: 엘리베이터 노드는 `elevator` 필수, `capacity > 0`, `speed >= 1`. 엘리베이터엔 `train`/`generation` 금지.

## B. 승강장 승차/하차 역할 분리 (코어)
- `TrainConfig.mode: "both" | "alight" | "board"` 추가(기본 `both`, 하위호환).
  - `alight`: 하차(발생)만. `board`: 탑승(정원 sink)만. `both`: 현행(탑승→하차).
- 엔진 열차 이벤트가 mode를 반영. 하차 노드(mode=alight)와 승차 노드(mode=board)가 같은 `first_arrival_sec`/`headway_sec`를 공유하면 동기화되어 한 그룹으로 묶일 수 있음.

## C. 그룹 검증 완화 (코어)
- R1의 "한 그룹에 승강장 2개 이상 금지" 규칙 제거.
- 대신: 한 그룹 내에서 **하차 역할(mode ∈ {both, alight}) 승강장이 2개 이상**이면 오류(하차 중복). 탑승 역할(board) 다수, 엘리베이터 다수 그룹은 허용.
- 그룹 내 `congestion_enabled` 일관성, Weidmann 파라미터 일관성 규칙은 유지(분리 노드는 종류가 같아 자동 충족).

## D. 여러 기본 예제 템플릿 (웹) — 모두 2노드/그룹 규칙
모든 물리 공간을 입력/출력 방향에 따라 2개 노드로 나누고, 두 노드를 같은 그룹으로 묶는다. 각 노드 면적은 물리 공간을 분할한 값.

- 예제 1 — 기본 역(입구-게이트-승강장):
  - `입구(입장)[그룹 출입구1]` → `게이트(승강장방향)[그룹 게이트1]` → `승강장(승차, train.mode=board)[그룹 승강장1]`
  - `승강장(하차, train.mode=alight)[그룹 승강장1]` → `게이트(출구방향)[그룹 게이트1]` → `출구(퇴장, exit_weight=1)[그룹 출입구1]`
  - 입구 generation(poisson), 출구 exit.
- 예제 2 — 엘리베이터 포함 역: 콘코스↔승강장 사이에 엘리베이터 2노드(그룹 엘리베이터1, ElevatorConfig).
- 예제 3 — 환승역: 승강장 2쌍(각 쌍 그룹), 공용 콘코스(2노드 그룹).
- 예제 4 — 다중 출입구: 출입구 2곳(각 입장/퇴장 2노드 그룹) → 공용 게이트(2노드 그룹) → 승강장(2노드 그룹).

모든 예제는 검증 통과(출력가중치 합+exit=1, 그룹 일관성, train mode 정합).

## E. 템플릿 삭제(숨김) 보완 (웹)
- 내 템플릿: 삭제(현행, localStorage).
- 기본 예제: 목록에서 "숨기기"(localStorage 숨김 이름 집합) + "숨긴 예제 복원" 버튼. 드롭다운은 숨겨지지 않은 기본예제 + 내 템플릿 표시.

## F. 웹 연동 + 문서
- `types.ts`/`defaults.ts`: `ElevatorConfig`, `TrainConfig.mode`. `makeNode('elevator')`는 기본 ElevatorConfig 부여, congestion off.
- `NodeInspector.tsx`: 엘리베이터 종류일 때 capacity/speed 필드, 승강장일 때 mode 선택. ⓘ 툴팁.
- `validation.ts`: 엘리베이터 config, train mode, 완화된 그룹 규칙 미러(Python과 동일).
- `paramHelp.ts`: elevator_capacity, elevator_speed, train_mode 설명 추가.
- `templates.ts`: 위 예제들 + 숨김 처리 연동.
- `UsageGuide.tsx`/`OutputGuide.tsx`: 2노드/그룹 규칙, 엘리베이터, 승강장 mode 설명.
- 직렬화: ElevatorConfig는 `asdict`/`_known_kwargs`로 자동 round-trip(train과 동일 패턴).

## G. 테스트
- 코어(pytest): 엘리베이터 배치 유출(speed 동안 체류 후 capacity 유출, 잔여 다음 주기), 엘리베이터 검증, train mode alight/board 동작, 완화된 그룹 검증(하차 1개 OK, 2개 오류; board 다수 OK), 예제 그래프 validate==[].
- 웹(vitest): defaults/elevator/mode, validation 미러, templates 검증(모든 예제 validate==[]), userTemplates 숨김.

## 하위호환
- `TrainConfig.mode` 기본 both, `Node.elevator` 기본 None → 기존 데이터/테스트 동작 불변.
- R1의 승강장-그룹 금지 규칙만 변경(완화)되므로, 해당 규칙에 의존한 테스트는 새 규칙으로 갱신.
