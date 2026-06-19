export function OutputGuide() {
  return (
    <div className="guide">
      <h2>출력 파일 설명</h2>
      <p>
        시뮬레이터가 생성하는 파일의 형식과 내용을 설명합니다.
        모든 파일은 GNN(그래프 신경망) 학습 또는 분석 작업에 바로 사용할 수 있도록 설계되었습니다.
      </p>

      <h3>1. congestion_timeseries.csv — 혼잡도 시계열</h3>
      <p>
        각 행이 하나의 시간 스텝, 각 열이 노드에 해당하는 <strong>wide 형식</strong> CSV입니다.
        값은 해당 시점에 해당 노드에 있는 인원 수(혼잡도)입니다.
      </p>
      <ul>
        <li><code>step</code>: 스텝 번호 (0부터 시작)</li>
        <li><code>time_sec</code>: 실제 시각(초) = step × Δt</li>
        <li>나머지 열: 각 노드의 id (노드 인원 수)</li>
      </ul>
      <pre>{`step,time_sec,A,G,P,X
0,0.0,0.0,0.0,0.0,0.0
1,5.0,7.5,0.0,0.0,0.0
2,10.0,11.2,3.1,0.0,0.0`}</pre>

      <h3>2. congestion_by_group.csv — 그룹별 혼잡도</h3>
      <p>
        같은 <strong>그룹</strong> 이름이 지정된 노드들의 인원을 합산한 CSV입니다.
        물리적으로 같은 장소(예: 입구 방향 + 출구 방향 노드)를 하나의 장소 단위로 집계합니다.
      </p>
      <ul>
        <li>열 이름 = 그룹 이름 (그룹이 없는 노드는 노드 id 그대로 사용)</li>
        <li>형식은 congestion_timeseries.csv와 동일 (step, time_sec + 그룹 열)</li>
        <li>GNN 학습에서 실제 장소 단위 레이블로 활용</li>
      </ul>
      <pre>{`step,time_sec,게이트A,승강장B
0,0.0,0.0,0.0
1,5.0,7.5,0.0
2,10.0,14.3,0.0`}</pre>

      <h3>3. GNN 번들 (.zip) — 그래프 신경망 학습용</h3>
      <p>
        STGCN, DCRNN, Graph WaveNet 등 그래프 신경망 학습에 필요한
        정적 그래프 구조 파일 묶음입니다. ZIP 안에 다음 파일이 포함됩니다.
      </p>

      <h3>3-1. adjacency.csv — 가중 인접행렬</h3>
      <p>
        행 = source 노드, 열 = target 노드, 값 = 링크 가중치.
        비연결 쌍은 0.0입니다.
      </p>
      <pre>{`,A,G,P,X
A,0.0,1.0,0.0,0.0
G,0.0,0.0,0.5,0.5
P,0.0,0.0,0.0,0.0
X,0.0,0.0,0.0,0.0`}</pre>

      <h3>3-2. distance.csv — 노드 간 거리 행렬</h3>
      <p>
        노드 간 물리적 거리(m)를 기록한 대칭 행렬입니다.
        거리 정보가 없을 때는 링크 존재 여부로 추정합니다.
      </p>
      <pre>{`,A,G,P,X
A,0.0,15.0,0.0,0.0
G,15.0,0.0,20.0,20.0
P,0.0,20.0,0.0,0.0
X,0.0,20.0,0.0,0.0`}</pre>

      <h3>3-3. travel_time.csv — 소요시간 행렬</h3>
      <p>
        source → target 이동에 걸리는 시간(스텝 단위)을 기록합니다.
        distance ÷ 보행속도로 계산됩니다.
      </p>
      <pre>{`,A,G,P,X
A,0,3,0,0
G,3,0,4,4
P,0,4,0,0
X,0,4,0,0`}</pre>

      <h3>3-4. node_features.csv — 노드 특성</h3>
      <p>
        각 노드의 정적 속성을 기록합니다. GNN의 노드 피처 행렬로 사용합니다.
      </p>
      <ul>
        <li><code>id</code>: 노드 식별자</li>
        <li><code>name</code>: 노드 이름</li>
        <li><code>type</code>: 노드 종류 (entrance/corridor/stairs/escalator/elevator/gate/platform)</li>
        <li><code>area</code>: 면적(㎡)</li>
        <li><code>group</code>: 그룹 이름 (없으면 빈 문자열)</li>
      </ul>
      <pre>{`id,name,type,area,group
A,출입구,entrance,30.0,
G,게이트,gate,20.0,
P,승강장,platform,120.0,
X,출구,entrance,30.0,`}</pre>

      <h3>4. station_config.json — 역 구성 저장 파일</h3>
      <p>
        역 그래프 구조와 시뮬레이션 설정을 JSON 형식으로 저장합니다.
        다른 브라우저 세션이나 팀원과 공유할 때 사용합니다.
      </p>
      <pre>{`{
  "graph": {
    "nodes": [
      { "id": "A", "name": "출입구", "type": "entrance",
        "area": 30, "x": 100, "y": 200, "group": "" }
    ],
    "links": [
      { "source": "A", "target": "G", "weight": 1.0 }
    ]
  },
  "config": {
    "totalTime": 3600,
    "dt": 5,
    "seed": 42,
    "stochastic": true
  }
}`}</pre>

      <h3>5. 배치 ZIP — 대량 학습데이터</h3>
      <p>
        배치 패널에서 시드·파라미터를 바꿔 N회 반복 실행하면,
        모든 결과를 하나의 ZIP 파일로 저장합니다.
        GNN 학습셋으로 바로 사용할 수 있는 구조입니다.
      </p>
      <p>ZIP 내부 구조:</p>
      <pre>{`batch_results.zip
├── run_0_seed_0.csv      # 0번 실행(시드=0) 혼잡도 시계열
├── run_1_seed_1.csv      # 1번 실행(시드=1) 혼잡도 시계열
├── run_2_seed_2.csv      # 2번 실행(시드=2) 혼잡도 시계열
├── graph/
│   ├── adjacency.csv     # 공통 인접행렬 (모든 실행에서 동일)
│   ├── distance.csv      # 공통 거리 행렬
│   ├── travel_time.csv   # 공통 소요시간 행렬
│   └── node_features.csv # 공통 노드 특성
└── manifest.json         # 시드·파라미터 기록`}</pre>
      <p>
        <code>manifest.json</code>에는 각 실행의 시드, Δt, 총 시간, 확률모드 등이 기록되어
        재현성 검증에 사용할 수 있습니다.
      </p>
      <pre>{`{
  "runs": [
    { "run": 0, "seed": 0, "dt": 5, "totalTime": 3600, "stochastic": true },
    { "run": 1, "seed": 1, "dt": 5, "totalTime": 3600, "stochastic": true }
  ]
}`}</pre>
    </div>
  )
}
