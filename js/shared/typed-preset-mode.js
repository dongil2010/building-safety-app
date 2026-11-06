/**
 * 결함 직접 입력(부재·결함내용·원인)을 프리셋에 넣을지, 이번 결함만 쓸지.
 * 2026-11-06: 기본은 항상 「이번만 사용」. 「프리셋에 저장」은 그 입력 한 번에만 적용되고
 * 다음 입력(칸 포커스·입력 팝업 열림)에서 reset()으로 다시 이번만으로 돌아간다(기기에 저장 안 함).
 */
(function (root) {
    'use strict';

    var KEY = 'bsa_typed_preset_mode_v1';
    var SAVE = 'save';
    var ONCE = 'once';
    var EMPTY_DEFAULT = ONCE;

    function normalize(raw) {
        return raw === SAVE ? SAVE : (raw === ONCE ? ONCE : '');
    }

    var current = EMPTY_DEFAULT;

    // 예전 버전이 기기에 남긴 「프리셋에 저장」 선호값은 지운다(다음 입력에 끌려가지 않게).
    try {
        if (root.localStorage && typeof root.localStorage.removeItem === 'function') root.localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }

    function getMode() {
        return current;
    }

    function hasStoredPreference() {
        return false;
    }

    function setMode(mode) {
        current = mode === SAVE ? SAVE : ONCE;
        return current;
    }

    function reset() {
        current = EMPTY_DEFAULT;
        return current;
    }

    function shouldPersist() {
        return getMode() === SAVE;
    }

    var api = {
        KEY: KEY,
        SAVE: SAVE,
        ONCE: ONCE,
        EMPTY_DEFAULT: EMPTY_DEFAULT,
        getMode: getMode,
        setMode: setMode,
        reset: reset,
        shouldPersist: shouldPersist,
        hasStoredPreference: hasStoredPreference,
        normalize: normalize
    };
    root.BSA = root.BSA || {};
    root.BSA.typedPresetMode = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
