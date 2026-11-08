/**
 * 결함 직접 입력(부재·결함내용·원인)을 프리셋에 넣을지, 이번 결함만 쓸지.
 * 기본은 이번만 사용(목록에 안 넣음). 「프리셋에 저장」은 그 입력 한 번에만 쓰이고 다시 이번만으로 돌아간다.
 * 기기에 기억하지 않는다 — 저장을 한 번 누른 뒤로 입력이 전부 공용 목록에 쌓이던 문제(2026-11-08).
 */
(function (root) {
    'use strict';

    var LEGACY_KEY = 'bsa_typed_preset_mode_v1';
    var SAVE = 'save';
    var ONCE = 'once';
    var current = ONCE;

    try {
        if (root.localStorage) root.localStorage.removeItem(LEGACY_KEY);
    } catch (e) { /* 지우지 못해도 더는 읽지 않는다 */ }

    function getMode() {
        return current;
    }

    function setMode(mode) {
        current = mode === SAVE ? SAVE : ONCE;
        return current;
    }

    function shouldPersist() {
        return getMode() === SAVE;
    }

    var api = {
        LEGACY_KEY: LEGACY_KEY,
        SAVE: SAVE,
        ONCE: ONCE,
        getMode: getMode,
        setMode: setMode,
        shouldPersist: shouldPersist
    };
    root.BSA = root.BSA || {};
    root.BSA.typedPresetMode = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
