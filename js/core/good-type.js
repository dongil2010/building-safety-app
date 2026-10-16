/**
 * 2026-10-16 「양호로 보는 결함 종류」 한 곳에서 정한다.
 * 상태양호와 「보수가 끝났다」는 말(보수완료·보수 완료·보수됨·보수함·보수했음·보수 끝 …)은 모두 양호와 똑같이 다룬다
 * (핀 색·범례·평가·통계·출력·부재 수). 「보수요망·우선보수·보수필요·보수예정·미보수」처럼 아직 할 일이면 결함 그대로.
 * 띄어쓰기는 무시한다. 브라우저(window.BsaGoodType)·node(require) 둘 다.
 */
(function (root) {
    'use strict';
    // 이 말이 들어 있으면 양호가 아니다(먼저 본다)
    var EXCLUDE = /보수요망|우선보수|보수필요|보수가?필요|보수예정|보수요함|보수요|미보수|보수안됨|보수안함|보수미완|보수미흡|보수불량|재보수|보수중|보수권고|보수검토/;
    // 이 말이 들어 있으면 양호
    var INCLUDE = /상태양호|보수완료|보수됨|보수함|보수했음|보수하였음|보수끝|보수마침|보수조치완료|보수처리완료|보수시공완료|보수후양호/;
    function squash(t) { return String(t == null ? '' : t).replace(/\s+/g, ''); }
    function isGoodDefectText(t) {
        var s = squash(t);
        if (!s) return false;
        if (EXCLUDE.test(s)) return false;
        return INCLUDE.test(s);
    }
    /** 「접합부 상태양호」처럼 여러 종류를 쉼표로 붙여 쓴 글자: 모든 조각이 양호여야 양호 */
    function isGoodDefectList(t) {
        var parts = String(t == null ? '' : t).split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean);
        if (!parts.length) return false;
        return parts.every(isGoodDefectText);
    }
    var api = { isGoodDefectText: isGoodDefectText, isGoodDefectList: isGoodDefectList, squash: squash };
    root.BsaGoodType = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
