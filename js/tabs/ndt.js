/* 탭: 비파괴조사 — 부재실측, 강도, 탄산화, 기울기, 부동침하, 부재변위 */
window.BSA = window.BSA || { tabs: {}, shared: {} };

window.BSA.tabs['tab-ndt'] = {
    id: 'tab-ndt',
    title: '비파괴조사',
    features: [
        'NDT 전용 도면 / 층 도면 연동 (상단 탭 우측)',
        '측정 위치 마킹 (결함위치도와 동일 핀·지시선 스타일)',
        '좌클릭 마퀴 선택 · Ctrl+드래그 추가선택 · 휠클릭 화면이동 · 선택 삭제',
        'Delete/Backspace: 선택·수정창 마킹 삭제',
        '모바일·태블릿: 마킹 0.5초 홀딩 후 드래그',
        '부동침하/부재변위: 핀치 줌 시 마킹 방지 · 0.5초 홀딩 후 드래그 · 되돌리기',
        '조사 항목별 핀·화살표·연결선 크기 설정',
        'PC: 선택·마킹·크기·회전·줌은 도면 안 오버레이',
        '부재 실측 · 콘크리트 강도 · 탄산화',
        '외벽 기울기: 박스 주황 회전 핸들 드래그 · 면에 수직인 화살표(변 위치·길이)',
        '부동침하/부재변위: 마크 우선 배치 → NO.박스에서 레벨·길이 일괄 입력',
        '모바일·태블릿: 조사 항목(실측·강도·기울기 등)은 도면 우측 레일 — 상단 칩 숨겨 도면 공간 확보',
        '모바일 하단 독: 마킹·크기 토글 시트',
        '측정 결과표 · NDT 엑셀 · 벡터 PDF',
        '균열 게이지 · 팁 누적 측정 (균열 결함 — 도면 핀 클릭 시 팝업)',
        '태블릿: 도면·결과표 split — 표는 45% 이내 내부 스크롤',
    ],
    ownerHint: 'app.js NDT FIELD SURVEY ENGINE',
    enter: function () {
        if (typeof window.BSA.shared.bindSurveyNdtTableScrollPassthrough === 'function') {
            window.BSA.shared.bindSurveyNdtTableScrollPassthrough();
        }
        setTimeout(function () {
            if (typeof window.setupNdtCanvas === 'function') window.setupNdtCanvas();
            if (typeof window.resizeNdtCanvas === 'function') window.resizeNdtCanvas();
            if (typeof window.renderNdtSummaryTable === 'function') window.renderNdtSummaryTable();
            if (typeof window.bindNdtCrackMonitorInputs === 'function') window.bindNdtCrackMonitorInputs();
            if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
            if (typeof window.BSA.shared.bindSurveyNdtTableScrollPassthrough === 'function') {
                window.BSA.shared.bindSurveyNdtTableScrollPassthrough();
            }
        }, 50);
        setTimeout(function () {
            if (typeof window.resizeNdtCanvas === 'function') window.resizeNdtCanvas();
            if (typeof window.fitNdtCanvas === 'function') window.fitNdtCanvas();
        }, 220);
    }
};
