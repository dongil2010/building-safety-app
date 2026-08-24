/* 탭: 홈 — 건물 목록 / 등록·수정 / JSON 백업 / 회사명 / 휴대폰 촬영 연동 */
window.BSA = window.BSA || { tabs: {}, shared: {} };

window.BSA.tabs['tab-home'] = {
    id: 'tab-home',
    title: '홈',
    features: [
        '점검 대상 건축물 목록·검색',
        '신규 건축물 등록 / 건물 수정 / 도면 추가',
        'JSON 전체 백업·복원',
        '점검 수행회사명 저장',
        '휴대폰 QR 촬영 연동 시작',
        '사용자 프로필·로그아웃·가입 승인(관리자)',
        '앱 OTA 자동 업데이트 (로그인 시 감지·배너·설치)',
        'OTA 배포 (otaPublisher 권한 — APK 업로드)',
        '삭제 고유코드 수동 정리(재사용) — 전원 동기화 후'
    ],
    ownerHint: 'app.js BUILDING MANAGEMENT + JSON 백업 + 휴대폰 연동',
    enter: function () {
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }
};
