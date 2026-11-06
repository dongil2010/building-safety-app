/**
 * 결함 직접 입력(부재·결함내용·원인)을 프리셋에 넣을지, 이번 결함만 쓸지.
 * 기기 localStorage 선호값. 값 없으면 예전과 같이 이번만 사용(목록에 안 넣음).
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

    function readStored() {
        try {
            if (!root.localStorage) return '';
            return normalize(root.localStorage.getItem(KEY));
        } catch (e) {
            return '';
        }
    }

    function getMode() {
        return readStored() || EMPTY_DEFAULT;
    }

    function hasStoredPreference() {
        return !!readStored();
    }

    function setMode(mode) {
        var next = mode === SAVE ? SAVE : ONCE;
        try {
            if (root.localStorage) root.localStorage.setItem(KEY, next);
        } catch (e) { /* 기기 저장 실패해도 화면은 바뀜 */ }
        return next;
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
        shouldPersist: shouldPersist,
        hasStoredPreference: hasStoredPreference,
        normalize: normalize
    };
    root.BSA = root.BSA || {};
    root.BSA.typedPresetMode = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
