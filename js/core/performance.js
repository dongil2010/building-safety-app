/* 저사양 PC·모바일 성능 프로필 — 자동 감지 + 수동 토글 */
(function () {
    window.BSA = window.BSA || {};

    var STORAGE_KEY = 'bsa_perf_mode'; /* auto | low | normal */
    var _idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 64); };

    function getStoredMode() {
        try {
            var m = localStorage.getItem(STORAGE_KEY);
            if (m === 'low' || m === 'normal') return m;
        } catch (_e) { /* ignore */ }
        return 'auto';
    }

    function setMode(mode) {
        try {
            if (mode === 'auto') localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, mode);
        } catch (_e) { /* ignore */ }
        applyModeClass();
        refreshPerfModeUi();
    }

    function cycleMode() {
        var cur = getStoredMode();
        var next = cur === 'auto' ? 'low' : (cur === 'low' ? 'normal' : 'auto');
        setMode(next);
        return next;
    }

    function detectLowEndHardware() {
        var mem = navigator.deviceMemory;
        var cores = navigator.hardwareConcurrency;
        if (typeof mem === 'number' && mem > 0 && mem <= 4) return true;
        if (typeof cores === 'number' && cores > 0 && cores <= 4) return true;
        return false;
    }

    function isMobileContext() {
        if (window.BSA.isTabletEnvironment && window.BSA.isTabletEnvironment()) return true;
        if (window.BSA.prefersCompactLayout && window.BSA.prefersCompactLayout()) return true;
        return navigator.maxTouchPoints > 0 && (window.innerWidth || 0) <= 1024;
    }

    function isLowEnd() {
        var mode = getStoredMode();
        if (mode === 'low') return true;
        if (mode === 'normal') return false;
        return detectLowEndHardware();
    }

    function applyModeClass() {
        document.documentElement.classList.toggle('bsa-low-end', isLowEnd());
    }

    function getModeLabel(mode) {
        mode = mode || getStoredMode();
        if (mode === 'low') return '저사양 ON';
        if (mode === 'normal') return '고성능';
        return isLowEnd() ? '자동(절전)' : '자동';
    }

    function refreshPerfModeUi() {
        var btn = document.getElementById('btnTogglePerfMode');
        if (!btn) return;
        var mode = getStoredMode();
        var active = isLowEnd();
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.title = '성능 모드: ' + getModeLabel(mode)
            + ' — 클릭 시 자동 → 저사양 ON → 고성능 순환';
        var label = btn.querySelector('.perf-mode-label');
        if (label) label.textContent = getModeLabel(mode);
    }

    function getMaxCanvasDpr() {
        if (isLowEnd()) return isMobileContext() ? 1.5 : 1.75;
        if (isMobileContext() && !(window.BSA.isPcLikeLayout && window.BSA.isPcLikeLayout())) return 2.0;
        return 2.5;
    }

    function getMaxFloorTierDim() {
        if (!isLowEnd()) return 16000;
        return isMobileContext() ? 8000 : 8000;
    }

    function skipFloorCrossfade() {
        return isLowEnd();
    }

    function getSyncDebounceMs() {
        return isLowEnd() ? 900 : 400;
    }

    function getFloorSnapshotDelayMs() {
        return isLowEnd() ? 1200 : 500;
    }

    function deferHeavyWork() {
        return isLowEnd();
    }

    function runWhenIdle(fn, timeoutMs) {
        if (typeof fn !== 'function') return;
        if (timeoutMs != null) _idle(function () { fn(); }, { timeout: timeoutMs });
        else _idle(function () { fn(); });
    }

    /** 탭 진입: 저사양은 1회만, 일반은 짧은 2회 갱신 */
    function scheduleTabRefresh(run, opts) {
        opts = opts || {};
        var secondDelay = opts.secondDelay != null ? opts.secondDelay : 180;
        requestAnimationFrame(function () {
            run(true);
            if (!isLowEnd() || opts.forceSecond) {
                setTimeout(function () { run(false); }, secondDelay);
            }
        });
    }

    window.BSA.performance = {
        getMode: getStoredMode,
        setMode: setMode,
        cycleMode: cycleMode,
        isLowEnd: isLowEnd,
        detectLowEndHardware: detectLowEndHardware,
        isMobileContext: isMobileContext,
        getMaxCanvasDpr: getMaxCanvasDpr,
        getMaxFloorTierDim: getMaxFloorTierDim,
        skipFloorCrossfade: skipFloorCrossfade,
        getSyncDebounceMs: getSyncDebounceMs,
        getFloorSnapshotDelayMs: getFloorSnapshotDelayMs,
        deferHeavyWork: deferHeavyWork,
        runWhenIdle: runWhenIdle,
        scheduleTabRefresh: scheduleTabRefresh,
        applyModeClass: applyModeClass,
        refreshPerfModeUi: refreshPerfModeUi,
        getModeLabel: getModeLabel
    };

    applyModeClass();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshPerfModeUi);
    } else {
        refreshPerfModeUi();
    }
})();
