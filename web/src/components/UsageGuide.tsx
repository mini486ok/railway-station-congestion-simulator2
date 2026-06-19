export function UsageGuide() {
  return (
    <div className="guide">
      <h2>사용법 안내</h2>
      <p>
        철도역사 혼잡도 합성데이터 시뮬레이터는 역사 내 승객 흐름을 노드-링크 그래프로 모델링하고,
        시뮬레이션을 실행하여 혼잡도 데이터를 생성하는 도구입니다.
        처음 사용하신다면 <strong>1. 빠른 시작</strong>부터 읽어보세요.
      </p>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>1. 빠른 시작 (4단계)</h3>
      <ol>
        <li>
          <strong>템플릿 불러오기</strong> — 상단 드롭다운에서 "기본 역 (입구-게이트-승강장)"을
          선택하세요. 노드와 링크가 자동으로 그려집니다.
        </li>
        <li>
          <strong>▶ 재생 또는 ⚡ 즉시 실행</strong> — 가운데 제어판의 ▶ 버튼을 누르면
          애니메이션으로 진행하고, ⚡ 버튼을 누르면 전체 결과를 즉시 계산합니다.
          (빠른 결과가 필요하면 ⚡ 권장)
        </li>
        <li>
          <strong>대시보드 확인</strong> — 우측 대시보드에서 시계열 혼잡도 차트·총 재실·누적 발생·누적 이탈을 확인합니다.
        </li>
        <li>
          <strong>내보내기</strong> — 우측 하단 내보내기 버튼으로 혼잡도 CSV·GNN 번들·설정 JSON을 저장합니다.
        </li>
      </ol>
      <p><strong>유용한 단축키</strong></p>
      <ul>
        <li><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> — 실행취소 / 재실행 (노드·링크 편집 되돌리기)</li>
        <li><kbd>Ctrl+C</kbd> / <kbd>Ctrl+V</kbd> — 선택한 노드·링크 복사 / 붙여넣기</li>
        <li><strong>패널 접기</strong> — 좌측·중앙·우측 패널 경계를 클릭하거나 화살표 버튼으로 접으면 그래프 편집 영역을 넓게 사용할 수 있습니다.</li>
      </ul>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>2. 노드 추가 및 연결</h3>
      <p>
        좌측 "노드 추가" 팔레트에서 종류 버튼을 클릭하면 그래프에 노드가 추가됩니다.
        지원하는 노드 종류는 다음과 같습니다.
      </p>
      <ul>
        <li><strong>출입구(Entrance)</strong>: 역사 외부와 연결되는 진입/퇴장 지점 — <em>승객 발생(도착) 설정이 이 종류에서만 활성화됩니다.</em></li>
        <li><strong>통로(Corridor)</strong>: 승객이 지나가는 복도·통로</li>
        <li><strong>계단(Stairs)</strong>: 층간 이동 계단</li>
        <li><strong>에스컬레이터(Escalator)</strong>: 에스컬레이터</li>
        <li><strong>엘리베이터(Elevator)</strong>: 용량·출발 주기(slot) 기반 배치 운송</li>
        <li><strong>게이트(Gate)</strong>: 개찰구·검표 게이트</li>
        <li><strong>승강장(Platform)</strong>: 열차 탑승 승강장 — <em>열차 설정이 이 종류에서만 활성화됩니다.</em></li>
      </ul>

      <h4>링크 연결</h4>
      <p>
        그래프에서 노드의 핸들(노드 테두리의 점)을 드래그하여 다른 노드로 연결합니다.
        링크는 <strong>방향(source → target)</strong>이 있으며, 승객이 이동하는 방향을 나타냅니다.
      </p>
      <ul>
        <li>노드 우측 핸들에서 드래그 시작 → 대상 노드 좌측 핸들에서 드롭</li>
        <li>하나의 source 노드에서 여러 target으로 분기 가능</li>
        <li>링크를 클릭하면 우측 인스펙터에서 가중치 등을 편집할 수 있음</li>
      </ul>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>3. 파라미터 상세 설명</h3>

      <details>
        <summary><strong>노드 공통 파라미터</strong></summary>
        <ul>
          <li>
            <strong>종류(type)</strong> — 출입구 / 통로 / 계단 / 에스컬레이터 / 엘리베이터 / 게이트 / 승강장.
            종류에 따라 활성화되는 파라미터(발생·열차·엘리베이터)가 달라집니다.
          </li>
          <li>
            <strong>면적(area, m²)</strong> — 노드가 나타내는 물리 공간의 바닥 면적.
            밀도(혼잡도) = 인원 ÷ 면적으로 계산됩니다.
            그룹으로 묶인 노드는 <em>물리 공간을 분할</em>한 값을 각각 입력하세요.
          </li>
          <li>
            <strong>기본 체류확률(base_stay_prob)</strong> — 한 스텝에서 이 노드에 남아있을 확률(0~1).
            이동확률 = 1 − 체류확률. 혼잡 동적 체류가 켜져 있으면 밀도에 따라 자동 보정됩니다.
          </li>
          <li>
            <strong>이탈 가중치(exit_weight)</strong> — 이동하는 인원 중 역사 밖으로 나가는 비율.
            <em>출력 링크 가중치 합 + 이탈 가중치 = 1.0</em>이어야 합니다.
          </li>
          <li>
            <strong>그룹(group)</strong> — 물리적으로 같은 공간을 여러 노드로 나눌 때 동일한 이름을 부여합니다.
            같은 그룹 노드의 인원이 합산되어 밀도 계산에 반영됩니다. 자세한 내용은 <em>6. 그룹/2노드 규칙</em> 참조.
          </li>
          <li>
            <strong>초기 인원(initial_population)</strong> — 시뮬레이션 시작 시 이 노드에 이미 있는 인원.
            열차 연착 등 초기 혼잡 시나리오 구현에 유용합니다.
          </li>
          <li>
            <strong>혼잡 동적 체류(congestion_enabled, on/off)</strong> — 켜면 Weidmann 모델로 밀도가 높을수록 체류확률이 자동 증가합니다.
            에스컬레이터·엘리베이터처럼 속도가 고정된 설비는 끄세요. 자세한 내용은 <em>5. 혼잡 동적 체류(Weidmann)</em> 참조.
          </li>
        </ul>
      </details>

      <details>
        <summary><strong>Weidmann 파라미터 (혼잡 동적 체류 세부)</strong></summary>
        <ul>
          <li>
            <strong>자유보행속도(v_free, m/s)</strong> — 한산할 때(밀도≈0) 보행자가 걷는 속도. 기본값 1.34 m/s.
          </li>
          <li>
            <strong>임계밀도(ρ_max, 인/m²)</strong> — 이 밀도에 도달하면 보행속도가 0이 됩니다(완전 정체). 기본값 5.4 인/m².
          </li>
          <li>
            <strong>형상 계수(γ)</strong> — 속도-밀도 곡선의 오목/볼록 정도를 결정합니다. 기본값 1.913.
            값이 클수록 밀도 증가 초반에는 속도가 덜 감소하고, 임계밀도 근처에서 급격히 감소합니다.
          </li>
        </ul>
      </details>

      <details>
        <summary><strong>링크 파라미터</strong></summary>
        <ul>
          <li>
            <strong>거리(distance, m)</strong> — 두 노드 사이의 물리적 거리.
            소요시간(travel_time)이 0이면 거리 ÷ 보행속도로 자동 계산됩니다.
          </li>
          <li>
            <strong>가중치(weight)</strong> — 이 링크로 이동하는 인원의 비율(0~1).
            한 노드의 모든 출력 링크 가중치 합 + 이탈 가중치 = 1이어야 합니다.
            "출력 가중치 정규화" 버튼으로 자동 보정 가능.
          </li>
          <li>
            <strong>소요시간(travel_time, 스텝)</strong> — 링크를 통과하는 데 걸리는 이산 시간 스텝 수.
            0으로 두면 거리·보행속도로 자동 계산됩니다.
          </li>
        </ul>
      </details>

      <details>
        <summary><strong>발생(출입구 전용) 파라미터</strong></summary>
        <p>발생 설정은 <strong>출입구(Entrance)</strong> 노드에서만 활성화됩니다.</p>
        <ul>
          <li>
            <strong>분포 종류(generation_kind)</strong> — 상수(constant) / Poisson / 군집·배치(Compound Poisson).
            각 분포 개념은 아래 <em>4. 발생 분포</em> 섹션을 참고하세요.
          </li>
          <li>
            <strong>발생률(gen_rate)</strong> — 초당 발생 인원(상수·Poisson) 또는 초당 배치 도착 횟수(군집 모드).
          </li>
          <li>
            <strong>군집 크기(gen_batch_size)</strong> — 군집·배치 모드에서 한 번 도착할 때 평균 인원(명/배치).
            군집 모드에서만 활성화됩니다.
          </li>
          <li>
            <strong>시간가변 발생률(gen_profile)</strong> — [시각(초), 발생률] 구간 목록으로 시간대별 발생률을 지정합니다.
            출퇴근 첨두처럼 시간에 따라 유입량이 달라지는 패턴을 표현합니다.
            지정한 시각부터 해당 발생률이 적용됩니다.
          </li>
        </ul>
      </details>

      <details>
        <summary><strong>열차(승강장 전용) 파라미터</strong></summary>
        <p>열차 설정은 <strong>승강장(Platform)</strong> 노드에서만 활성화됩니다.</p>
        <ul>
          <li>
            <strong>첫 도착(train_first, 초)</strong> — 시뮬레이션 시작 후 첫 열차가 도착하는 시각.
          </li>
          <li>
            <strong>배차간격(train_headway, 초)</strong> — 열차와 열차 사이의 간격.
            예: 180이면 3분 간격.
          </li>
          <li>
            <strong>도착 지터σ(train_jitter, 초)</strong> — 열차 도착 시각의 무작위 변동(표준편차).
            확률(stochastic) 모드에서만 적용됩니다. 0이면 정확히 배차간격대로 도착.
          </li>
          <li>
            <strong>열차 정원(train_capacity)</strong> — 열차 한 대가 태울 수 있는 최대 인원.
            정원을 초과한 승객은 다음 열차까지 승강장에서 대기합니다.
          </li>
          <li>
            <strong>하차 분포(alight_kind)</strong> — 열차 한 대당 하차 인원의 분포(상수/Poisson/정규).
          </li>
          <li>
            <strong>하차 평균(alight_mean)</strong> — 열차 한 대당 평균 하차 인원.
          </li>
          <li>
            <strong>하차 표준편차(alight_std)</strong> — 하차 인원의 표준편차(정규 분포일 때 사용).
          </li>
          <li>
            <strong>열차 역할(train_mode)</strong> —
            <code>both</code>: 하차 + 탑승 모두 처리(단일 승강장 노드).
            <code>alight</code>: 하차(발생)만 처리.
            <code>board</code>: 탑승(정원만큼 시스템 이탈)만 처리.
            한 승강장을 승차/하차 노드로 나눌 때 각각 <code>board</code>/<code>alight</code>로 설정하고 같은 배차·그룹으로 묶으세요.
          </li>
        </ul>
      </details>

      <details>
        <summary><strong>엘리베이터 파라미터</strong></summary>
        <ul>
          <li>
            <strong>용량(elevator_capacity)</strong> — 엘리베이터 1회 운송 시 최대 인원.
            출발 주기(slot)마다 이 인원만큼 출력 노드로 이동합니다.
          </li>
          <li>
            <strong>출발 주기(elevator_speed, slot)</strong> — 몇 이산 시간 스텝마다 한 번 운행하는지.
            이 slot 수가 지날 때까지 승객이 대기하다가, 도달하면 용량만큼 한 번에 이동합니다.
          </li>
          <li>혼잡 동적 체류(congestion_enabled)는 엘리베이터에 자동으로 비활성화됩니다.</li>
        </ul>
      </details>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>4. 발생 분포 개념 설명</h3>
      <p>출입구에서 역사 내부로 승객이 유입되는 방식을 세 가지 분포로 모델링합니다.</p>

      <details>
        <summary><strong>상수(constant)</strong> — 결정론적 정확 발생</summary>
        <p>
          매 시간 스텝마다 정확히 <code>gen_rate × Δt</code>명이 도착합니다.
          무작위성 없이 항상 동일한 숫자가 발생하는 가장 단순한 모델입니다.
        </p>
        <p><strong>언제 쓰면 좋을까?</strong> 변동 없이 안정적인 기준선(baseline) 시나리오를 만들 때,
        또는 Δt가 작아 매 스텝 인원이 소수점이 되어 통계 노이즈가 필요 없을 때.</p>
      </details>

      <details>
        <summary><strong>Poisson</strong> — 무작위 독립 도착 (가장 일반적)</summary>
        <p>
          승객이 서로 독립적으로 무작위로 도착합니다. 단위 시간당 평균 λ명이 도착하며,
          실제 도착 수는 Poisson 분포를 따릅니다(평균 = 분산 = λ).
        </p>
        <p>
          실제 대중교통 도착 패턴(열차 없이 걸어오는 보행자)에서 가장 현실적인 기본 모형입니다.
          <br />
          <em>확률(stochastic) 모드에서만 변동이 드러납니다. 결정론 모드에서는 기대값만 적용됩니다.</em>
        </p>
        <p><strong>언제 쓰면 좋을까?</strong> 일반적인 승객 유입 모델링. 특별한 이유가 없으면 Poisson을 사용하세요.</p>
      </details>

      <details>
        <summary><strong>군집·배치(Compound Poisson)</strong> — 묶음 도착 (버스·연결열차)</summary>
        <p>
          버스나 연결 열차처럼 여러 명이 한꺼번에 묶음으로 도착합니다.
          먼저 배치 도착 횟수가 Poisson 분포를 따르고(<code>gen_rate</code> 배치/초),
          각 배치마다 Poisson 분포의 인원이 함께 도착합니다(<code>gen_batch_size</code> 인/배치).
        </p>
        <p>
          동일한 평균 유입량이라도 군집 도착은 Poisson보다 분산(변동)이 훨씬 크고,
          순간적으로 많은 인원이 몰리는 '버스트(burst)' 현상을 표현할 수 있습니다.
          <br />
          총 평균 유입률 ≈ <code>gen_rate × gen_batch_size</code> (인/초).
        </p>
        <p><strong>언제 쓰면 좋을까?</strong> 버스 환승·연결열차 등 여러 명이 동시에 쏟아지는 시나리오,
        또는 Poisson보다 큰 변동성을 실험할 때.</p>
      </details>

      <details>
        <summary><strong>시간가변 발생률(gen_profile)</strong> — 출퇴근 첨두 등 시계열 패턴</summary>
        <p>
          <code>[시각(초), 발생률]</code> 구간 목록으로 시간대별 발생률을 지정하는 비균질 Poisson 모델입니다.
          지정한 시각부터 해당 발생률이 적용되고, 다음 시각 전까지 유지됩니다.
        </p>
        <p>
          예시: <code>[[0, 0.5], [300, 3.0], [600, 1.0]]</code> →
          0~300초 0.5인/초, 300~600초 3.0인/초(첨두), 600초 이후 1.0인/초.
        </p>
        <p><strong>언제 쓰면 좋을까?</strong> 출퇴근 첨두처럼 시간대별로 유입량이 크게 달라지는 패턴.
        T8 첨두 혼잡 시나리오·T9 통근 첨두 패턴 템플릿에서 실제 예시를 확인하세요.</p>
      </details>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>5. 혼잡 동적 체류 (Weidmann 모델)</h3>
      <p>
        <strong>혼잡 동적 체류(congestion_enabled)</strong>를 켜면 노드의 밀도(인/m²)에 따라
        보행속도와 체류확률이 자동으로 계산됩니다.
        이 모델은 보행자 기본도(fundamental diagram)에 근거합니다.
      </p>

      <details>
        <summary><strong>개념 설명 (보행자 기본도)</strong></summary>
        <p>
          보행자 기본도란 <em>밀도↑ → 속도↓ → 흐름량 감소</em>의 관계를 나타내는 곡선입니다.
        </p>
        <ul>
          <li>밀도(ρ)가 0(한산)일 때: 보행자는 자유속도(v_free ≈ 1.34 m/s)로 걷습니다.</li>
          <li>밀도가 증가할수록: 속도가 점차 감소합니다.</li>
          <li>임계밀도(ρ_max ≈ 5.4 인/m²)에 도달하면: 보행속도 = 0 → 노드 정체(흡수 상태).</li>
        </ul>
        <p>속도-밀도 관계(Weidmann 식)의 직관:</p>
        <pre style={{background:'#f5f5f5', padding:'0.5em', borderRadius:'4px', fontSize:'0.85em', overflowX:'auto'}}>
{`v(ρ) = v_free × [ 1 − exp(−γ × (1/ρ − 1/ρ_max)) ]
    ρ: 현재 밀도(인/m²), v_free: 자유속도, ρ_max: 임계밀도, γ: 형상 계수`}
        </pre>
        <p>
          이 속도로 계산된 이동확률이 기본 체류확률보다 낮으면 체류확률이 증가합니다 —
          즉, 노드가 혼잡할수록 승객이 더 오래 머물게 됩니다.
        </p>
      </details>

      <details>
        <summary><strong>그룹과 밀도 합산</strong></summary>
        <p>
          같은 그룹으로 묶인 노드들은 <em>전체 인원(합산) ÷ 전체 면적(합산)</em>으로 공동 밀도를 계산합니다.
          물리적으로 같은 공간을 입·출 방향으로 나눈 두 노드가 실제 공간의 밀도를 공유하기 때문입니다.
        </p>
        <p>
          따라서 <strong>각 노드의 면적은 물리 공간 전체를 분할한 값으로 입력하세요.</strong>
          예: 전체 20m² 공간을 입·출 2개 노드로 나누면 각각 10m²씩 입력.
        </p>
      </details>

      <details>
        <summary><strong>on/off 의미</strong></summary>
        <ul>
          <li><strong>켬(on)</strong>: 밀도에 따라 체류확률이 동적으로 증가합니다. 통로·계단·게이트 등 보행자 흐름 공간에 적합합니다.</li>
          <li><strong>끔(off)</strong>: 밀도와 무관하게 base_stay_prob만 적용됩니다. 에스컬레이터·엘리베이터처럼 속도가 고정된 설비, 또는 단순화가 필요할 때 끄세요.</li>
        </ul>
      </details>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>6. 그룹 / 2노드 규칙</h3>
      <p>
        물리적으로 하나의 공간이라도 <strong>입력 방향과 출력 방향을 분리해 2개의 노드로 만들고</strong>,
        두 노드에 <strong>같은 '그룹' 이름</strong>을 부여하는 것이 권장 방식입니다.
        이렇게 하면 단방향 링크만으로 역사 내 흐름을 방향성 있게 모델링할 수 있습니다.
      </p>
      <ul>
        <li>예: 입구/출구 노드 쌍 → 그룹 = "출입구1"</li>
        <li>예: 게이트 양방향 노드 쌍 → 그룹 = "게이트1"</li>
        <li>예: 승강장 승차/하차 노드 쌍 → 그룹 = "승강장1"</li>
        <li>예: 엘리베이터 양방향 노드 쌍 → 그룹 = "엘리베이터1"</li>
      </ul>
      <p>
        같은 그룹 노드들의 혼잡도(인원)는 합산되어 Weidmann 밀도 계산에 사용됩니다.
        <br />
        <strong>각 노드 면적은 물리 공간 전체를 두 노드로 분할한 값으로 입력하세요.</strong>
        (그룹 면적 = 두 노드 면적의 합이 물리 공간 전체 면적이어야 합니다.)
      </p>
      <p>
        승강장은 <strong>승차 노드</strong>(<code>train_mode=board</code>, <code>base_stay_prob=1.0</code>)와
        <strong>하차 노드</strong>(<code>train_mode=alight</code>)로 나누고 동일한 배차·그룹으로 묶습니다.
        승차 노드는 출력 링크가 없으므로 <code>base_stay_prob=1.0</code>이어야 합니다
        (열차가 올 때까지 승객이 대기).
      </p>
      <p>
        <strong>한 그룹에 승강장(Platform)은 1개만 두세요</strong> — 복수의 승강장을 같은 그룹에 묶으면
        열차 배차 로직이 중복 적용될 수 있습니다.
      </p>

      <h4>그룹별 집계 출력</h4>
      <ul>
        <li>내보내기에서 <strong>"그룹 혼잡도 CSV"</strong>를 선택하면 그룹별로 합산된 시계열 혼잡도를 저장합니다.</li>
        <li><strong>"그룹 GNN 번들(zip)"</strong>은 그룹 단위의 그래프 신경망 학습용 데이터셋입니다. 노드가 아닌 그룹을 정점(vertex)으로 사용합니다.</li>
      </ul>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>7. 시뮬레이션 실행</h3>
      <p>
        가운데 제어판에서 다음 설정 후 시뮬레이션을 시작합니다.
      </p>
      <ul>
        <li><strong>총 시간(duration, 초)</strong>: 시뮬레이션 총 진행 시간</li>
        <li><strong>Δt(dt, 초)</strong>: 이산 시간 한 스텝의 길이. 모든 이동·발생은 이 단위로 처리됩니다.</li>
        <li><strong>시드(seed)</strong>: 난수 시드. 같은 시드·같은 설정이면 결과가 동일하게 재현됩니다.</li>
        <li><strong>확률모드(stochastic)</strong>: 켜면 발생·하차 인원을 확률 분포에서 표본 추출합니다. 끄면 기댓값으로 결정론적 계산(변동 없음).</li>
      </ul>
      <p>제어 버튼:</p>
      <ul>
        <li><strong>▶ 재생</strong>: 실시간 애니메이션으로 시뮬레이션 진행</li>
        <li><strong>⏸ 일시정지</strong>: 재생 중 일시 정지</li>
        <li><strong>⏭ 한 스텝</strong>: 스텝 하나씩 진행</li>
        <li><strong>⟲ 리셋</strong>: 처음 상태로 초기화</li>
        <li><strong>⚡ 즉시 실행</strong>: 애니메이션 없이 전체 결과를 즉시 계산. 배치 데이터 생성 시 권장.</li>
        <li><strong>배속 슬라이더</strong>: 재생 속도 조절</li>
      </ul>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>8. 검증</h3>
      <p>
        우측 상단의 <strong>검증 배너</strong>가 모델 오류를 실시간으로 표시합니다.
        가장 중요한 규칙은 다음과 같습니다.
      </p>
      <ul>
        <li>한 노드의 <strong>출력 링크 가중치 합 + 이탈(exit) 가중치 = 1.0</strong> 이어야 합니다.</li>
        <li>"출력 가중치 정규화" 버튼을 클릭하면 자동으로 합이 1이 되도록 조정됩니다.</li>
        <li>오류가 있으면 시뮬레이션이 시작되지 않습니다.</li>
      </ul>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>9. 결과 보기</h3>
      <p>
        시뮬레이션 실행 후 대시보드에서 결과를 확인합니다.
      </p>
      <ul>
        <li><strong>혼잡도 시계열 차트</strong>: 시간에 따른 각 노드의 인원 변화 그래프</li>
        <li><strong>현재 시각</strong>: 현재 시뮬레이션 시각(초)</li>
        <li><strong>총 재실</strong>: 현재 역사 내 총 인원</li>
        <li><strong>누적 발생</strong>: 시뮬레이션 시작 이후 생성된 총 승객 수</li>
        <li><strong>누적 이탈</strong>: 시뮬레이션 시작 이후 역사를 벗어난 총 승객 수</li>
      </ul>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>10. 내보내기 및 출력 파일 안내</h3>
      <p>
        시뮬레이션 결과와 설정을 다양한 형식으로 저장할 수 있습니다.
      </p>
      <ul>
        <li>
          <strong>혼잡도 CSV</strong> — 노드별 시계열 혼잡도 (wide 형식, 열=노드, 행=시각).
          <em>UTF-8 BOM으로 저장되어 Excel에서 한글 열 이름이 깨지지 않습니다.</em>
        </li>
        <li>
          <strong>그룹 혼잡도 CSV</strong> — 그룹별로 합산된 혼잡도 시계열.
          그룹을 사용하지 않으면 노드별 CSV와 동일합니다.
          <em>UTF-8 BOM 적용.</em>
        </li>
        <li>
          <strong>GNN 번들(zip)</strong> — 노드 단위의 STGCN 등 그래프 신경망 학습용 데이터셋.
          노드 특성·인접 행렬·시계열이 포함된 ZIP 파일입니다.
        </li>
        <li>
          <strong>그룹 GNN 번들(zip)</strong> — 그룹을 정점(vertex)으로 사용하는 GNN 학습용 ZIP.
          그룹 단위로 집계된 시계열과 그룹 간 인접 정보가 포함됩니다.
        </li>
        <li>
          <strong>설정 JSON</strong> — 역 구성 저장/불러오기. 노드·링크·파라미터 전체가 저장됩니다.
        </li>
      </ul>
      <p>
        <strong>배치 패널</strong>을 사용하면 시드·파라미터를 바꿔 N회 반복 실행한 결과를
        ZIP으로 한 번에 저장하여 대량 학습데이터를 생성할 수 있습니다.
      </p>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>11. 템플릿</h3>
      <p>
        상단 드롭다운에서 예제 템플릿을 불러오거나,
        현재 구성을 <strong>"현재 구성을 템플릿으로 저장"</strong> 버튼으로 저장하여
        나중에 재사용할 수 있습니다.
      </p>
      <ul>
        <li>기본 예제: 미리 준비된 역사 구성 예제 (2노드/그룹 규칙 적용)</li>
        <li>내 템플릿: 사용자가 직접 저장한 구성 (브라우저 localStorage에 저장)</li>
        <li><strong>이 예제 숨기기</strong>: 기본 예제 선택 후 클릭하면 드롭다운에서 숨겨집니다.</li>
        <li><strong>숨긴 예제 복원</strong>: 숨긴 예제가 있을 때 나타나며, 모두 복원합니다.</li>
      </ul>

      <h3>12. 기본 예제 템플릿 소개</h3>
      <p>아래 11개 내장 템플릿은 모두 2노드/그룹 규칙을 적용한 검증된 역사 구성입니다.</p>
      <ol>
        <li>
          <strong>기본 역 (입구-게이트-승강장)</strong> — 6노드.
          출입구→게이트→승강장의 가장 단순한 단방향 흐름. 처음 시작할 때 참고하세요.
        </li>
        <li>
          <strong>엘리베이터 포함 역</strong> — 8노드.
          계단·에스컬레이터 없이 엘리베이터 배치 운송(capacity/speed) 모델을 시연합니다.
        </li>
        <li>
          <strong>환승역 (승강장 2면·유료구역 환승통로)</strong> — 10노드.
          두 노선 간 유료구역 내 환승통로와 분기/합류 흐름, <strong>병목</strong>을 확인하세요.
        </li>
        <li>
          <strong>다중 출입구</strong> — 8노드.
          2개 입구에서 유입되어 1개 게이트에 합류하는 수렴 구조를 보여줍니다.
        </li>
        <li>
          <strong>중형 역 (2출입구·대합실·계단/에스컬레이터·섬식 승강장)</strong> — 14노드.
          계단과 에스컬레이터의 <strong>수직이동 모드 분담</strong>(3:1)을 적용한 중형 역.
        </li>
        <li>
          <strong>대형 환승역 (2개 노선 교차)</strong> — 약 30노드.
          A/B 두 노선 각각 계단·에스컬레이터·엘리베이터를 갖춘 대형 복합 역.
          노드가 많아 자동배치와 미니맵이 유용합니다. <strong>병목·수직이동</strong> 분석에 적합합니다.
        </li>
        <li>
          <strong>다층 지하역 (지상출입구→B1 대합실→B2 승강장)</strong> — 22노드.
          지상↔B1↔B2의 <strong>다층 수직이동</strong>을 두 단계 엘리베이터/에스컬레이터/계단으로 표현합니다.
        </li>
        <li>
          <strong>첨두 혼잡 시나리오 역</strong> — 12노드.
          높은 발생률(5/s)과 시간가변 profile(첨두 급증) 이벤트 입구, 좁은 게이트로 <strong>병목 혼잡</strong>을 연출합니다.
        </li>
        <li>
          <strong>통근 첨두 패턴 역</strong> — 14노드.
          입구에 <strong>시간가변 profile</strong>을 설정해 저밀도→첨두→급감을 재현하는 GNN 시계열 시연용.
        </li>
        <li>
          <strong>심야 저밀도 역</strong> — 8노드.
          매우 낮은 발생률(0.1/s)과 긴 배차간격(600s)으로 심야 운영 패턴을 시뮬레이션합니다.
        </li>
        <li>
          <strong>열차 연착(초기 혼잡) 역</strong> — 8노드.
          승강장에 <strong>initial_population=150</strong>을 설정해 시작부터 혼잡한 상태를 재현하고
          열차 도착 후 서서히 해소되는 과정을 관찰할 수 있습니다.
        </li>
      </ol>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>13. 모델 단순화 / 한계</h3>
      <p>
        본 시뮬레이터는 개념 검증 및 합성데이터 생성을 목적으로 다음과 같은 의도적인 단순화를 적용합니다.
        실제 운영 분석 시 아래 제약을 감안하세요.
      </p>
      <ul>
        <li>
          <strong>열차 승하차 즉시 처리</strong>:
          열차 도착 시 승하차 인원이 한 스텝(Δt) 안에 즉시 처리됩니다 — 정차 시간·출입문 처리율은 모델링되지 않습니다.
        </li>
        <li>
          <strong>수직 이동 용량 무제한</strong>:
          에스컬레이터·계단은 별도 처리율(용량) 제한이 없고, 이동 시간은 링크 소요시간으로만 반영됩니다.
          (엘리베이터는 capacity/speed 기반 배치 운송이 적용됩니다.)
        </li>
        <li>
          <strong>속도-밀도 임계 모델</strong>:
          밀도가 임계밀도(ρ_max) 이상이면 보행속도가 0이 되어 해당 노드가 정체(흡수) 상태가 됩니다 —
          발생률을 탑승 처리량에 비해 과도하게 높이면 영구 포화가 발생할 수 있습니다.
          (T8 '첨두 혼잡 시나리오'는 이를 의도적으로 연출한 템플릿입니다.)
        </li>
        <li>
          <strong>그룹 밀도 합산</strong>:
          그룹으로 묶인 두 방향 노드는 혼잡도(밀도)를 합산해 공유합니다 — 각 노드 면적은 물리 공간을 분할한 값으로 입력하세요.
        </li>
      </ul>

      {/* ───────────────────────────────────────────────────────── */}
      <h3>14. 자주 묻는 질문 (FAQ)</h3>

      <details>
        <summary><strong>Q. 승강장에는 왜 발생(도착) 설정이 없나요?</strong></summary>
        <p>
          승강장의 승객은 <em>열차 하차</em>로 발생합니다. 출입구처럼 외부에서 직접 유입되는 게 아니라
          열차가 도착할 때 하차 인원(alight_mean 등)이 승강장에 추가됩니다.
          따라서 발생 설정 대신 <strong>열차(train) 설정</strong>을 사용하세요.
        </p>
      </details>

      <details>
        <summary><strong>Q. 정규펄스(normal_pulse)는 어디 갔나요?</strong></summary>
        <p>
          정규펄스 분포는 제거되었습니다.
          시간가변 발생률(<strong>gen_profile</strong>)이 동일한 기능을 더 유연하게 대체합니다.
          출퇴근 첨두처럼 시간대별로 발생률을 다르게 지정하려면 gen_profile을 사용하세요.
        </p>
      </details>

      <details>
        <summary><strong>Q. 그래프가 실행되지 않아요.</strong></summary>
        <p>
          우측 상단 <strong>검증 배너</strong>의 오류 메시지를 확인하세요.
          가장 흔한 원인은 출력 링크 가중치 합 + 이탈 가중치 ≠ 1 입니다.
          "출력 가중치 정규화" 버튼을 클릭해 자동 보정하거나, 직접 값을 수정하세요.
        </p>
      </details>

      <details>
        <summary><strong>Q. 노드가 겹쳐 보여요.</strong></summary>
        <p>
          노드를 직접 드래그해 위치를 옮기거나, 좌측 팔레트의 <strong>"자동 배치"</strong> 버튼을 클릭하면
          노드들이 자동으로 배치됩니다. 노드가 많을 때는 미니맵을 사용해 전체 구조를 파악하세요.
        </p>
      </details>

      <details>
        <summary><strong>Q. Excel에서 한글이 깨졌어요.</strong></summary>
        <p>
          현재 버전의 CSV는 <strong>UTF-8 BOM</strong>으로 저장되어 Excel에서 파일을 직접 열어도
          한글 열 이름이 정상적으로 표시됩니다.
          만약 이전에 저장한 파일이 깨져 보인다면 Excel에서 "데이터 → 텍스트/CSV 가져오기"로
          인코딩을 UTF-8로 지정해 불러오세요.
        </p>
      </details>

      <details>
        <summary><strong>Q. 군집(배치) 도착과 Poisson의 차이는 무엇인가요?</strong></summary>
        <p>
          Poisson은 승객이 <em>한 명씩</em> 독립적으로 도착하는 모델입니다.
          군집(Compound Poisson)은 먼저 "배치"가 도착하고, 각 배치마다 여러 명이 함께 도착합니다.
          동일한 평균 유입량이라도 군집 도착은 분산이 훨씬 크고, 순간적으로 많은 인원이 몰리는
          '버스트' 현상이 나타납니다. 버스·연결열차 환승 시나리오에 적합합니다.
        </p>
      </details>

      <details>
        <summary><strong>Q. 그룹 GNN 파일은 무엇인가요?</strong></summary>
        <p>
          그룹 GNN 번들(zip)은 그룹을 그래프 정점(vertex)으로 사용하는 GNN 학습용 데이터셋입니다.
          노드가 아닌 <em>그룹 단위</em>로 집계된 시계열 혼잡도와 그룹 간 인접 정보가 포함됩니다.
          물리 공간을 기준으로 GNN 모델을 학습하고 싶을 때 사용하세요.
        </p>
      </details>

      <details>
        <summary><strong>Q. 배치 실행과 단건 실행의 차이는 무엇인가요?</strong></summary>
        <p>
          단건 실행(▶ / ⚡)은 현재 설정으로 한 번만 시뮬레이션합니다.
          <strong>배치 실행</strong>(가운데 패널 하단 배치 패널)은 시드·파라미터를 달리해 N회 반복하고,
          모든 결과를 ZIP으로 한 번에 저장합니다.
          GNN 학습을 위한 대량 합성데이터 생성에 활용하세요.
        </p>
      </details>

      <details>
        <summary><strong>Q. stochastic(확률) 모드는 무엇인가요?</strong></summary>
        <p>
          확률(stochastic) 모드를 켜면 발생 인원·하차 인원을 지정된 확률 분포에서 무작위 표본 추출합니다.
          같은 설정이라도 실행할 때마다 결과가 달라지며(시드로 재현 가능),
          Poisson·군집 분포의 변동성이 실제로 드러납니다.
          <br />
          끄면(결정론 모드) 분포의 기댓값을 그대로 사용하므로 실행마다 결과가 동일합니다.
          모델 검증이나 평균 거동 확인에 유용합니다.
        </p>
      </details>

      <details>
        <summary><strong>Q. 실행취소/복사 단축키는 무엇인가요?</strong></summary>
        <ul>
          <li><kbd>Ctrl+Z</kbd> — 실행취소 (이전 상태로 되돌리기)</li>
          <li><kbd>Ctrl+Y</kbd> — 재실행 (취소한 작업 다시 적용)</li>
          <li><kbd>Ctrl+C</kbd> — 선택한 노드·링크 복사</li>
          <li><kbd>Ctrl+V</kbd> — 복사한 노드·링크 붙여넣기</li>
        </ul>
      </details>

      <details>
        <summary><strong>Q. 패널을 접으면 어떻게 되나요?</strong></summary>
        <p>
          좌측(노드 추가·템플릿)·중앙(제어판·배치)·우측(인스펙터·대시보드) 패널을
          각 패널 경계의 화살표 버튼으로 접으면 그래프 편집 영역이 더 넓어집니다.
          노드가 많은 대형 역(예: T6 대형 환승역)을 편집할 때 유용합니다.
        </p>
      </details>
    </div>
  )
}
