/**
 * CAD 핀: 바탕화면의 cad_defects_import.json 바로 불러오기(2026-10-20)
 * - PC 앱(Electron): preload 다리(window.bsaDesktop.readCadImportJson)로 바탕화면 파일을 읽는다.
 * - 웹·Chrome·모바일(2026-10-21): 바탕화면 바로 읽기 없음 — 지금처럼 파일 고르기.
 * - PC 앱에서 파일이 없으면 파일 고르기.
 */
(function (root) {
    'use strict';
    var FILE_NAME = 'cad_defects_import.json';

    /** 내용 검사 — 지금 CAD 가져오기와 같은 규칙. { ok, data, count, error } */
    function parseCadJson(text) {
        var data;
        try { data = JSON.parse(String(text == null ? '' : text).replace(/^\uFEFF/, '')); } catch (e) {
            return { ok: false, error: '캐드 JSON 파일을 불러오는 중 오류가 발생했습니다:\n' + (e && e.message) };
        }
        var list = (data && Array.isArray(data.defects)) ? data.defects : [];
        if (!list.length) return { ok: false, error: '선택한 파일에 유효한 결함 데이터(defects 배열)가 없습니다.' };
        if (!(data.refPoint1 && data.refPoint2)) {
            return { ok: false, error: '구버전 캐드 파일입니다. 최신 CAD2APP.lsp (v2.0)으로 다시 추출해 주세요.' };
        }
        return { ok: true, data: data, count: list.length };
    }

    /** PC 앱(Node)에서 찾아볼 바탕화면 경로들 — USERPROFILE·OneDrive 바탕 화면 포함 */
    function desktopCandidates(env, joinFn) {
        env = env || {};
        var join = joinFn || function () { return Array.prototype.slice.call(arguments).join('\\'); };
        var out = [];
        var home = env.USERPROFILE || env.HOME || '';
        var ones = [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(Boolean);
        if (home) ones.push(join(home, 'OneDrive'));
        if (home) out.push(join(home, 'Desktop', FILE_NAME));
        ones.forEach(function (od) {
            out.push(join(od, '바탕 화면', FILE_NAME));
            out.push(join(od, 'Desktop', FILE_NAME));
        });
        if (home) out.push(join(home, '바탕 화면', FILE_NAME));
        return out.filter(function (p, i) { return out.indexOf(p) === i; });
    }

    /** PC 앱(Electron)인가: UA가 아니라 preload 다리(window.bsaDesktop.readCadImportJson)로 판별 */
    function hasDesktopBridge(win) {
        return !!(win && win.bsaDesktop && typeof win.bsaDesktop.readCadImportJson === 'function');
    }

    var api = { FILE_NAME: FILE_NAME, parseCadJson: parseCadJson, desktopCandidates: desktopCandidates, hasDesktopBridge: hasDesktopBridge };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.cadDesktopImport = api; }
})(typeof window !== 'undefined' ? window : globalThis);
