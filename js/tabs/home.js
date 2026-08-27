/* 탭: 홈 — 건물 목록 / 등록·수정 / JSON 백업 / 회사명 / 휴대폰 촬영 연동 */
window.BSA = window.BSA || {};
if (!window.BSA.tabs) window.BSA.tabs = {};
if (!window.BSA.shared) window.BSA.shared = {};

window.BSA.tabs['tab-home'] = {
    id: 'tab-home',
    title: '홈',
    features: [
        '점검 대상 건축물 목록·검색 (현장명 + 회차만 표시)',
        '우측 상단 톱니바퀴 설정: 회사명·백업·새로고침·PDF캐시·휴대폰촬영·프로필',
        '현장명 선택 → 회차 선택 후 진입',
        '하단 + FAB로 신규 건축물 등록',
        '결함 즐겨찾기(기기별) · 회사 공통 항목 프리셋 동기화',
        'JSON 전체 백업·복원',
        '점검 수행회사명 저장',
        '휴대폰 QR 촬영 연동 시작',
        '사용자 프로필·로그아웃·가입 승인(관리자)',
        'Android WebView는 GitHub Pages 원격 웹 로드 (APK OTA 없음)',
        '점검 진입 시 로딩창 없이 맵으로 바로 들어가고, 온라인에서 3티어를 IDB에 받아 두면 오프라인에서도 확대 가능',
        '24시간 이상 안 들어간 점검의 IndexedDB 도면·사진은 온라인일 때만 정리 (현재·오프라인 점검은 유지)',
        '홈 새로고침 · 앱 재실행 시 최신 웹 동기화',
        '도면 PDF 로컬 캐시 지우기 (서버 원본은 유지, 필요 시 재다운로드)',
        '삭제 고유코드 수동 정리(재사용) — 전원 동기화 후',
        '전경사진(결함과 별도) — 회차 목록·점검 중 상단에서 촬영·한 줄 설명'
    ],
    ownerHint: 'app.js BUILDING MANAGEMENT + JSON 백업 + 휴대폰 연동',
    enter: function () {
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }
};
