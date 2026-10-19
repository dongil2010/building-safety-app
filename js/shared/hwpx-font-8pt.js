/**
 * 한글(HWPX) 출력 글자 8.5pt → 8pt — 2026-10-19 사용자 요청 「8.5로 들어가던 부분은 전부 8포인트로」
 * 모든 한글 출력(상태조사표·비파괴·사진첩·비교사진·균열게이지·보고서 요약 …)의 글자 모양(charPr) 중
 * 크기 850(8.5pt)만 800(8pt)으로 바꾼다. 다른 크기는 그대로. 본문 줄 배치 정보(lineseg)의 8.5pt 줄도 8pt로 맞춘다.
 * 순수 함수 — app.js·summary-page.js·테스트가 같이 쓴다.
 */
(function (root) {
    'use strict';

    var FROM = 850;
    var TO = 800;
    var BASE_FROM = 723; // 850 × 0.85
    var BASE_TO = 680;   // 800 × 0.85

    function setAttr(tag, name, value) {
        var re = new RegExp('(\\s' + name + '=")[^"]*(")');
        return re.test(tag) ? tag.replace(re, '$1' + value + '$2') : tag;
    }
    function getAttr(tag, name) {
        var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
        return m ? m[1] : null;
    }

    /** header.xml: <hh:charPr … height="850"> → 800. 바꾼 id 목록도 돌려준다 */
    function headerTo8pt(xml) {
        var ids = [];
        var out = String(xml == null ? '' : xml).replace(/<hh:charPr\b[^>]*>/g, function (tag) {
            if (getAttr(tag, 'height') !== String(FROM)) return tag;
            ids.push(getAttr(tag, 'id'));
            return setAttr(tag, 'height', TO);
        });
        return { xml: out, ids: ids };
    }

    /** section*.xml: 8.5pt 줄(lineseg textheight=850)을 8pt 줄로 */
    function sectionTo8pt(xml) {
        return String(xml == null ? '' : xml).replace(/<hp:lineseg\b[^>]*>/g, function (tag) {
            if (getAttr(tag, 'textheight') !== String(FROM)) return tag;
            var t = setAttr(tag, 'textheight', TO);
            if (getAttr(t, 'vertsize') === String(FROM)) t = setAttr(t, 'vertsize', TO);
            if (getAttr(t, 'baseline') === String(BASE_FROM)) t = setAttr(t, 'baseline', BASE_TO);
            return t;
        });
    }

    function isHeaderPath(name) { return /^Contents\/header\d*\.xml$/i.test(name); }
    function isSectionPath(name) { return /^Contents\/section\d+\.xml$/i.test(name); }

    /** { 경로: 글 } 묶음(보고서 요약)을 그 자리에서 바꾼다 */
    function applyToFiles(files) {
        Object.keys(files || {}).forEach(function (name) {
            if (typeof files[name] !== 'string') return;
            if (isHeaderPath(name)) files[name] = headerTo8pt(files[name]).xml;
            else if (isSectionPath(name)) files[name] = sectionTo8pt(files[name]);
        });
        return files;
    }

    /** JSZip 묶음 — 머리(header) 파일만 바꾼다(본문은 호출부가 sectionTo8pt로 바꿔 넣는다) */
    function applyHeaderToZip(zip) {
        if (!zip || typeof zip.file !== 'function') return Promise.resolve(0);
        var names = Object.keys(zip.files || {}).filter(isHeaderPath);
        return Promise.all(names.map(function (name) {
            return zip.file(name).async('string').then(function (txt) {
                var r = headerTo8pt(txt);
                if (r.ids.length) zip.file(name, r.xml);
                return r.ids.length;
            });
        })).then(function (counts) { return counts.reduce(function (a, b) { return a + b; }, 0); });
    }

    var api = {
        FROM: FROM, TO: TO, headerTo8pt: headerTo8pt, sectionTo8pt: sectionTo8pt,
        applyToFiles: applyToFiles, applyHeaderToZip: applyHeaderToZip, isHeaderPath: isHeaderPath, isSectionPath: isSectionPath
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.hwpxFont8pt = api;
})(typeof window !== 'undefined' ? window : globalThis);
