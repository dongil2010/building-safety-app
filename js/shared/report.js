/* 공통: 미리보기 / PDF / 인쇄 / HWPX 한글 내보내기 (헤더 버튼, 전 탭 공유) */
window.BSA = window.BSA || { tabs: {}, shared: {} };

window.BSA.shared.report = {
    title: '보고서',
    features: [
        '보고서 미리보기 모달',
        '상태조사표·사진첩·결함위치도 PDF',
        '1·2종 / 3종 상태조사표 서식',
        '마킹 추가(n-n) 행 분리, 표당 15건(최대 17) · 15배수 마감',
        '비파괴 결과표·위치도 포함 출력',
        'HWPX(한글) 상태조사표 내보내기',
        '사진첩 페이지당 6장, 홀수 마지막은 좌측 표만',
        '조사표·사진 페이지 분리, 내부 표는 글자 취급',
        '표 칸 긴 글자는 자간 축소 없이 띄어쓰기에서 줄바꿈',
        '전경사진·설명은 HWPX 문서 맨 마지막에 출력'
    ],
    ownerHint: 'app.js REPORT PREVIEW / PDF EXPORT / HWPX'
};
