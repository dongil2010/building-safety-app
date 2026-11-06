/**
 * 스르륵 업데이트 — 2026-11-06
 *
 * 왜: 새 버전이 올라오면 쓰는 중에(45초마다 확인·창으로 돌아올 때) 화면이 새로고침됐다.
 * 어떻게: ① 새 버전을 알면 뒤에서 파일만 받아 둔다(화면 그대로)
 *         ② 사용자가 안 보는 순간(앱을 내렸을 때)에 바꾼다
 *         ③ 앱이 내려간 사이 멈춰 못 바꿨으면, 오래 내려갔다 돌아온 순간에 바꾼다(잠깐 로딩만 보임)
 * 입력 중·사진 저장·올리기 중·오프라인이면 바꾸지 않고 다음 기회를 본다. 쓰는 화면에서는 절대 바꾸지 않는다.
 * DOM·Firebase를 쓰지 않는다.
 */
(function (root) {
    'use strict';

    /** 이만큼 내려가 있다 돌아오면 다시 쓰기 시작한 게 아니라 새로 여는 것에 가깝다 */
    var RETURN_APPLY_MS = 30000;

    /**
     * opts: { prefetch(): Promise<bool>, apply(), isBusy(): bool, isOnline(): bool, now() }
     */
    function createController(opts) {
        var o = opts || {};
        var now = o.now || function () { return Date.now(); };
        var pendingSha = '';
        var ready = false;
        var fetching = false;
        var applied = false;
        var hiddenAt = 0;

        function canApply() {
            if (applied || !pendingSha || !ready) return false;
            if (typeof o.isOnline === 'function' && !o.isOnline()) return false;
            return !(typeof o.isBusy === 'function' && o.isBusy());
        }
        function applyNow() {
            applied = true;
            o.apply();
        }
        function prefetch() {
            if (ready || fetching || !pendingSha) return Promise.resolve(ready);
            fetching = true;
            return Promise.resolve().then(function () { return o.prefetch(); }).then(function (ok) {
                fetching = false;
                ready = ok !== false;   // 끊겼으면 다음 확인 때 다시 받는다
                return ready;
            }, function () {
                fetching = false;
                return false;
            });
        }
        return {
            /** 서버에 새 버전이 있다. 화면은 건드리지 않는다. */
            noteNewVersion: function (sha) {
                if (!sha) return Promise.resolve(false);
                if (sha !== pendingSha) { pendingSha = sha; ready = false; }
                return prefetch().then(function (ok) {
                    // 받는 동안 앱을 내렸으면 그 자리에서 바꾼다
                    if (ok && hiddenAt && canApply()) applyNow();
                    return ok;
                });
            },
            onHidden: function () {
                hiddenAt = now();
                if (canApply()) applyNow();
            },
            onVisible: function () {
                var away = hiddenAt ? now() - hiddenAt : 0;
                hiddenAt = 0;
                if (away >= RETURN_APPLY_MS && canApply()) applyNow();
            },
            state: function () { return { pendingSha: pendingSha, ready: ready, applied: applied }; }
        };
    }

    var api = { createController: createController, RETURN_APPLY_MS: RETURN_APPLY_MS };
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.silentUpdate = api;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);
