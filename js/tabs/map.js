/* 탭: 결함위치도 — 도면 캔버스, 핀/영역 마킹, 스타일·범례 */
window.BSA = window.BSA || { tabs: {}, shared: {} };

window.BSA.tabs['tab-map'] = {
    id: 'tab-map',
    title: '결함위치도 작성',
    features: [
        '도면 PAN/ZOOM/회전',
        'PC·현장 공통: 서버가 만든 일반·고해상도·초고해상도 레스터만 표시 (PDF는 최초 등록·벡터 출력만)',
        '핀 마킹 / 영역 마킹',
        'Ctrl+드래그·클릭 추가/해제 다중 선택 · 그룹 이동 · 선택 삭제',
        '벡터 PDF 내보내기 (원본 PDF + 마킹 벡터)',
        '결함 상세 모달 (사진·칩 입력, 하단은 위치·체크·화살표만)',
        '개구부 균열 체크 · 결함목록에서 켜고 끄기 · 조사표·한글 조사내용에 개구부 주위 ○○균열 표기',
        '결함표 추가: 도면 번호 N 유지, 표·한글은 N-1·N-2 행 (표당 15·최대 17)',
        '결함 종류 칩: 부재별 프리셋(비구조·마감 포함) · 복수 선택(선택 순) · 원인 연동',
        '발생 원인 복수 체크(복합 원인) · 원인 목록 확장',
        '균열 폭·길이·개수를 한 행에서 입력(행 추가/삭제) · /·x 조인 토글',
        '결함 창: 전차/현차 사진 가로 배치, 추가 사진은 아래 적재',
        '전차 사진 IndexedDB/클라우드 저장',
        '모바일 세로: 결함 수정 창 하단 1/2 · 목록은 창 높이만큼 줄여 하이라이트 유지',
        '결함목록·조사표·사진 → 도면: 약한 배율·세로 상단 1/4에 마킹 표시',
        '도면에서 핀 클릭 시 화면 순간이동 없음',
        '모바일: 번호 박스·화살표 모두 0.3초 길게 눌러 이동',
        '탭 전환 시 결함/NDT 드로어 자동 닫기',
        '모바일 우측 레일(핀·영역·선택·추가) + 하단 액션 바(선택 삭제 포함)',
        '모바일 현장: 좌 1/3 결함목록 · 우 도면 · 상단 소형 탭/층 툴바',
        '모바일: 전차 미등록·PC 등록도구 숨김 (태블릿은 PC와 동일)',
        '모바일: 선택 모드 — 화살표 기준 마퀴 선택 · 추가 모드는 토글 · 핀은 0.3초 길게 눌러 이동',
        '되돌리기·다시실행',
        '스타일(색/크기/모양) · 위치도 범례',
        '점검 차수·부재분류·손상유형 필터',
        '다음 회차 시작 (기존 건물·도면·결함 유지, 전회차 전환)',
        'PC: 전회차 체크 일괄 해제 (엑셀 전차 가져오기 후)',
        '결함 수정창 하단: 등록 회차·마킹 시각 타임라인',
        '고유코드(id) 동기화 · 삭제 시 NO. 당김 · 코드 재사용은 수동 정리만'
    ],
    ownerHint: 'app.js DRAWING CANVAS ENGINE + 결함 모달',
    enter: function () {
        function refreshMapCanvas(allowFit) {
            if (typeof window.resizeCanvas === 'function') window.resizeCanvas();
            const autoFit = allowFit && (typeof window.shouldAutoFitMapView !== 'function' || window.shouldAutoFitMapView());
            if (autoFit && typeof window.fitToScreen === 'function') window.fitToScreen();
            else if (typeof window.drawCanvas === 'function') window.drawCanvas();
        }
        setTimeout(function () { refreshMapCanvas(true); }, 50);
        setTimeout(function () { refreshMapCanvas(false); }, 220);
    }
};
