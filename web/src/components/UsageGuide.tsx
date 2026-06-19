export function UsageGuide() {
  return (
    <div className="guide">
      <h2>사용법 안내</h2>
      <p>
        철도역사 혼잡도 합성데이터 시뮬레이터는 역사 내 승객 흐름을 노드-링크 그래프로 모델링하고,
        시뮬레이션을 실행하여 혼잡도 데이터를 생성하는 도구입니다.
      </p>

      <h3>1. 노드 추가</h3>
      <p>
        좌측 "노드 추가" 팔레트에서 종류 버튼을 클릭하면 그래프에 노드가 추가됩니다.
        지원하는 노드 종류는 다음과 같습니다.
      </p>
      <ul>
        <li><strong>출입구(Entrance)</strong>: 역사 외부와 연결되는 진입/퇴장 지점</li>
        <li><strong>통로(Corridor)</strong>: 승객이 지나가는 복도·통로</li>
        <li><strong>계단(Stairs)</strong>: 층간 이동 계단</li>
        <li><strong>에스컬레이터(Escalator)</strong>: 에스컬레이터</li>
        <li><strong>엘리베이터(Elevator)</strong>: 엘리베이터</li>
        <li><strong>게이트(Gate)</strong>: 개찰구·검표 게이트</li>
        <li><strong>승강장(Platform)</strong>: 열차 탑승 승강장</li>
      </ul>

      <h3>2. 링크 연결</h3>
      <p>
        그래프에서 노드의 핸들(노드 테두리의 점)을 드래그하여 다른 노드로 연결합니다.
        링크는 <strong>방향(source → target)</strong>이 있으며, 승객이 이동하는 방향을 나타냅니다.
      </p>
      <ul>
        <li>노드 우측 핸들에서 드래그 시작 → 대상 노드 좌측 핸들에서 드롭</li>
        <li>하나의 source 노드에서 여러 target으로 분기 가능</li>
        <li>링크를 클릭하면 우측 인스펙터에서 가중치 등을 편집할 수 있음</li>
      </ul>

      <h3>3. 속성 편집</h3>
      <p>
        노드 또는 링크를 클릭하면 우측 인스펙터 패널이 활성화됩니다.
        각 항목 옆 <strong>ⓘ</strong> 버튼을 클릭하면 해당 항목에 대한 설명을 볼 수 있습니다.
      </p>
      <ul>
        <li><strong>면적(area)</strong>: 노드의 물리적 면적(㎡). 혼잡도(인원/㎡) 계산에 사용</li>
        <li><strong>체류확률(dwellProb)</strong>: 해당 스텝에 노드에 머무를 확률(0~1)</li>
        <li><strong>발생(arrival)</strong>: 출입구 노드에서 매 스텝 생성되는 승객 수 분포</li>
        <li><strong>열차(train)</strong>: 승강장 노드에서 열차 도착 시 발생하는 승객 수</li>
        <li><strong>그룹(group)</strong>: 물리적으로 같은 장소인 노드들을 묶는 이름 (아래 5번 참고)</li>
        <li><strong>링크 가중치</strong>: source → target으로 이동하는 비율(0~1)</li>
      </ul>

      <h3>4. 검증</h3>
      <p>
        우측 상단의 <strong>검증 배너</strong>가 모델 오류를 실시간으로 표시합니다.
        가장 중요한 규칙은 다음과 같습니다.
      </p>
      <ul>
        <li>한 노드의 <strong>출력 링크 가중치 합 + 이탈(exit) 가중치 = 1.0</strong> 이어야 합니다.</li>
        <li>"출력 가중치 정규화" 버튼을 클릭하면 자동으로 합이 1이 되도록 조정됩니다.</li>
        <li>오류가 있으면 시뮬레이션이 시작되지 않습니다.</li>
      </ul>

      <h3>5. 방향성과 그룹</h3>
      <p>
        방향성은 <strong>단방향 링크</strong>로 표현합니다(되돌아오지 않게 하려면 역방향 링크를 만들지 마세요).
      </p>
      <p>
        같은 물리적 장소를 <em>입구방향</em>/<em>출구방향</em> 두 노드로 나눌 때는
        두 노드에 <strong>같은 '그룹' 이름</strong>을 주면 혼잡도(밀도)가 합산되어 서로의 보행속도에 영향을 줍니다.
        이때 각 노드 면적은 공간을 나눈 값으로 입력하고, <strong>한 그룹에 승강장은 1개만 두세요.</strong>
      </p>
      <ul>
        <li>예: "게이트A_입구" 노드와 "게이트A_출구" 노드 모두 그룹="게이트A"로 설정</li>
        <li>각 노드 면적: 물리 공간 전체 면적을 두 노드로 분할하여 입력 (예: 전체 20㎡ → 각 10㎡)</li>
        <li>그룹별 혼잡도는 별도 CSV 파일로 내보낼 수 있습니다</li>
      </ul>

      <h3>6. 시뮬레이션 실행</h3>
      <p>
        가운데 제어판에서 다음 설정 후 시뮬레이션을 시작합니다.
      </p>
      <ul>
        <li><strong>총 시간</strong>: 시뮬레이션 총 진행 시간(초)</li>
        <li><strong>Δt</strong>: 한 스텝의 시간 간격(초)</li>
        <li><strong>시드(seed)</strong>: 난수 시드 (재현성)</li>
        <li><strong>확률모드</strong>: 확률적/결정적 이동 방식 선택</li>
      </ul>
      <p>제어 버튼:</p>
      <ul>
        <li><strong>▶ 재생</strong>: 실시간 애니메이션으로 시뮬레이션 진행</li>
        <li><strong>⏸ 일시정지</strong>: 재생 중 일시 정지</li>
        <li><strong>⏭ 한 스텝</strong>: 스텝 하나씩 진행</li>
        <li><strong>⟲ 리셋</strong>: 처음 상태로 초기화</li>
        <li><strong>⚡ 즉시 실행</strong>: 애니메이션 없이 전체 결과를 즉시 계산</li>
        <li><strong>배속 슬라이더</strong>: 재생 속도 조절</li>
      </ul>

      <h3>7. 결과 보기</h3>
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

      <h3>8. 내보내기</h3>
      <p>
        시뮬레이션 결과와 설정을 다양한 형식으로 저장할 수 있습니다.
      </p>
      <ul>
        <li><strong>혼잡도 CSV</strong>: 노드별 시계열 혼잡도 (wide 형식)</li>
        <li><strong>그룹 혼잡도 CSV</strong>: 그룹별 합산 혼잡도</li>
        <li><strong>GNN 번들(zip)</strong>: STGCN 등 그래프 신경망 학습용 데이터셋</li>
        <li><strong>설정 JSON</strong>: 역 구성 저장/불러오기</li>
      </ul>
      <p>
        <strong>배치 패널</strong>을 사용하면 시드·파라미터를 바꿔 N회 반복 실행한 결과를
        ZIP으로 한 번에 저장하여 대량 학습데이터를 생성할 수 있습니다.
      </p>

      <h3>9. 템플릿</h3>
      <p>
        상단 드롭다운에서 예제 템플릿을 불러오거나,
        현재 구성을 <strong>"현재 구성을 템플릿으로 저장"</strong> 버튼으로 저장하여
        나중에 재사용할 수 있습니다.
      </p>
      <ul>
        <li>기본 예제: 미리 준비된 역사 구성 예제</li>
        <li>내 템플릿: 사용자가 직접 저장한 구성 (브라우저 localStorage에 저장)</li>
      </ul>
    </div>
  )
}
