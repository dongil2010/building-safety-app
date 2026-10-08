/* 공통: 미리보기 / PDF / 인쇄 / HWPX 한글 내보내기 (헤더 버튼, 전 탭 공유) */
window.BSA = window.BSA || { tabs: {}, shared: {} };

window.BSA.shared.report = {
    title: '보고서',
    features: [
        '보고서 미리보기 모달',
        '상태조사표·사진첩·결함위치도 PDF',
        '1·2종 신가병원 / 3종 칠산타워 상태조사표 서식',
        '마킹 추가(n-n) 행 분리, 표당 15건(최대 17) · 15배수 마감',
        '비파괴 결과표·위치도 포함 출력',
        'HWPX(한글) 상태조사표 내보내기 (정밀안전점검·정밀안전진단 / 정기안전점검 양식)',
        '사진첩 페이지당 6장, 홀수 마지막은 좌측 표만',
        '조사표·사진 페이지 분리, 내부 표는 글자 취급',
        '표 칸 긴 글자는 자간 축소 없이 띄어쓰기에서 줄바꿈',
        '한글 규모 칸: 측정값 다음 줄에 -nEA 갯수 (문단 분리)',
        '전경사진·설명은 HWPX 문서 맨 마지막에 출력'
    ],
    ownerHint: 'app.js REPORT PREVIEW / PDF EXPORT / HWPX',

    /**
     * 보고서 본문 요약 페이지(report-summary.html)를 새 창으로 연다.
     * 본 앱과 따로 도는 페이지라 코드를 불러오지 않고 주소만 연다. 현장 앱(APK)에는 이 페이지가
     * 들어 있지 않으므로 배포 주소로 연다.
     */
    openSummaryPage: function () {
        const native = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
            && window.Capacitor.isNativePlatform());
        const url = native
            ? 'https://dongil2010.github.io/building-safety-app/report-summary.html'
            : new URL('report-summary.html', window.location.href).href;
        window.open(url, '_blank', 'noopener');
    }
};
