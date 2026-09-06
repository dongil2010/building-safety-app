/* 탭: 상태조사표 — 표/앨범/통계, 엑셀·한글 내보내기, 외부 엑셀 가져오기 */
window.BSA = window.BSA || { tabs: {}, shared: {} };

/**
 * overflow-y:hidden + touch-action:pan-x 인 표에서 세로 제스처를
 * .app-content로 넘긴다. (조사표는 표 자체가 상하·좌우 스크롤이므로 제외)
 */
window.BSA.shared.bindHScrollVerticalPassthrough = function (selector) {
    const nodes = typeof selector === 'string'
        ? document.querySelectorAll(selector)
        : (selector && selector.length !== undefined ? selector : [selector]);
    Array.prototype.forEach.call(nodes, function (el) {
        if (!el || el.dataset.hScrollPass === '1') return;
        el.dataset.hScrollPass = '1';

        let startX = 0;
        let startY = 0;
        let lastY = 0;
        let axis = null; // null | 'v' | 'h' | 'multi'

        el.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) {
                axis = 'multi';
                return;
            }
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            lastY = startY;
            axis = null;
        }, { passive: true });

        el.addEventListener('touchmove', function (e) {
            if (axis === 'multi' || e.touches.length !== 1) return;
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - startX;
            const dy = y - startY;

            if (!axis) {
                if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                axis = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h';
            }

            if (axis === 'v') {
                var cs = window.getComputedStyle(el);
                var oy = cs.overflowY;
                if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
                    return;
                }
                e.preventDefault();
                const scroller = document.querySelector('.app-content');
                if (scroller) scroller.scrollTop -= (y - lastY);
            }
            lastY = y;
        }, { passive: false });

        el.addEventListener('touchend', function () { axis = null; }, { passive: true });
        el.addEventListener('touchcancel', function () { axis = null; }, { passive: true });
    });
};

window.BSA.shared.bindSurveyNdtTableScrollPassthrough = function () {
    const bind = window.BSA.shared.bindHScrollVerticalPassthrough;
    if (typeof bind !== 'function') return;
    // 조사표(.table-container)는 CSS로 2축 스크롤 — 여기선 비파괴 결과표만
    bind('#tab-ndt .table-responsive, #tab-ndt .table-container');
};

window.BSA.tabs['tab-survey'] = {
    id: 'tab-survey',
    title: '상태조사표',
    features: [
        '층별 상태조사표 렌더',
        '현장 사진 앨범 (탭→크게 보기 · 도면으로 → 결함위치도)',
        '표 컬럼 설정 (정밀/제3종)',
        '개구부 결함유무 컬럼(구조체 여부~진행여부 사이) · 한글 조사내용에 개구부 주위 ○○균열',
        '엑셀 저장 · 외부 엑셀 가져오기',
        '엑셀 전회차 규모 붙임값 분리 (0.3/3.00.2/3.0 → 폭·길이 2행, *·x는 x조인)',
        '엑셀 가져오기: 문상부·창하부·창측면 등 개구부 위치면 개구부 균열 체크',
        '한글(HWPX) 상태조사표 가져오기 (1·2종 신가병원 / 3종 칠산타워)',
        '3종 중점관리 전·현차 비교사진 (조사표 사진 앨범 상단)',
        '3종 균열 게이지·팁 누적 측정 요약 (작성은 비파괴조사 탭)',
        '결함 직접 등록 / 행 인라인 수정',
        '마킹 N → 결함표 N-1·N-2 행 추가 (도면 번호는 N, 표·한글은 분번)',
        '모바일: 조사목록 영역 상하·좌우 스크롤 (헤더 sticky)',
        '모바일 세로: 표 패딩만 축소(글자 미절단)',
        '표 컬럼 설정: 표시/숨김 체크박스',
        '태블릿·PC: 표·사진 앨범 한 화면 split · 사진 contain·탭으로 확대',
        '도면 보기: 결함위치도 탭 이동·마킹 선택'
    ],
    ownerHint: 'app.js SURVEY TABLE & ALBUM + Excel 엔진',
    enter: function () {
        if (typeof window.renderSurveyTable === 'function') window.renderSurveyTable();
        setTimeout(function () {
            if (typeof window.renderSurveyTable === 'function') window.renderSurveyTable();
        }, 120);
    }
};

document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.BSA.shared.bindSurveyNdtTableScrollPassthrough === 'function') {
        window.BSA.shared.bindSurveyNdtTableScrollPassthrough();
    }
});
