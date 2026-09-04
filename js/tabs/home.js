/* 탭: 홈 — 건물 목록 / 등록·수정 / JSON 백업 / 회사명 / 휴대폰 촬영 연동 */
window.BSA = window.BSA || {};
if (!window.BSA.tabs) window.BSA.tabs = {};
if (!window.BSA.shared) window.BSA.shared = {};

window.BSA.tabs['tab-home'] = {
    id: 'tab-home',
    title: '홈',
    features: [
        '점검 대상 건축물 목록·검색 (현장 → 회차 → 동)',
        '태블릿: 모바일 터치 UI(PC 강제 레이아웃 해제) · 탭·레일·목록·결함창 크기 확대',
        '현장 목록 수정: 우측 작은 네모 버튼 · 수정창/도면창 분리 · 도면 클릭 미리보기',
        '우측 상단 톱니바퀴 설정: 회사명·백업·새로고침·PDF캐시·휴대폰촬영·프로필',
        '현장 → 회차(단일=점검·도면·전경 / 다동=동 선택) → 동별 점검·도면·전경',
        '점검 중 홈 복귀 시 회차·동 선택 화면 유지',
        '현장 생성 시 단일 건물 / 여러 동 선택 (단일이면 동 단계·동 추가 생략)',
        '하단 + FAB: 현장 추가 / 회차 추가 / 동 추가(여러 동 회차 안)',
        'PC만 + 호버 시 왼쪽으로 캡슐 확장(모바일은 +만)',
        '결함 즐겨찾기(기기별) · 회사 공통 항목 프리셋 동기화',
        'JSON 전체 백업·복원',
        '점검 수행회사명 저장',
        '휴대폰 QR 촬영 연동 시작',
        '사용자 프로필·로그아웃·계정 삭제·회사 나가기·가입 승인(관리자)',
        'Android WebView는 GitHub Pages 원격 웹 로드 (APK OTA 없음)',
        '점검 진입 시 로딩창 없이 맵으로 바로 들어가고, 온라인에서 3티어를 IDB에 받아 두면 오프라인에서도 확대 가능',
        '홈·점검 진입 시 서버 병합 + 홈 이동 시 업로드 (실시간 동기화). 톱니 → 동기화 상태로 수동 확인·재시도',
        '24시간 이상 안 들어간 점검의 IndexedDB 도면·사진은 온라인일 때만 정리 (현재·오프라인 점검은 유지)',
        '홈 새로고침 · 앱 재실행 시 최신 웹 동기화',
        '도면 PDF 로컬 캐시 지우기 (서버 원본은 유지, 필요 시 재다운로드)',
        '삭제 고유코드 수동 정리(재사용) — 전원 동기화 후',
        '건물 휴지통: 삭제 시 약 30일 보관·복원, 만료 시 영구 삭제',
        '전경사진(결함과 별도) — 회차 목록·점검 중 상단에서 촬영·한 줄 설명'
    ],
    ownerHint: 'app.js BUILDING MANAGEMENT + JSON 백업 + 휴대폰 연동',
    enter: function () {
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.refreshHomeSyncStatusUI === 'function') window.refreshHomeSyncStatusUI();
    }
};
