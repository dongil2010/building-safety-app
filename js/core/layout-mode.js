/* 모바일 브라우저 "데스크톱 사이트" · 태블릿 — PC 레이아웃 유지 */
(function () {
    window.BSA = window.BSA || {};
    if (!window.BSA.tabs) window.BSA.tabs = {};
    if (!window.BSA.shared) window.BSA.shared = {};

    var DESKTOP_LAYOUT_WIDTH = 1280;

    function detectDesktopSiteMode() {
        if (document.documentElement.classList.contains('layout-desktop')) return true;
        var ua = navigator.userAgent || '';
        // iOS Safari — Request Desktop Website
        if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
        // Android Chrome — Desktop site (Android without Mobile)
        if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
        // Chrome desktop UA on touch devices
        if (/Linux x86_64|CrOS/i.test(ua) && navigator.maxTouchPoints > 0) return true;
        return false;
    }

    /** iPad·Android 태블릿·현장 태블릿 앱 — PC와 동일 레이아웃·LOD */
    function detectTabletEnvironment() {
        if (document.documentElement.classList.contains('layout-tablet')) return true;
        var ua = navigator.userAgent || '';
        if (/iPad/i.test(ua)) return true;
        if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
        if (/Tablet|PlayBook|Silk/i.test(ua)) return true;
        try {
            if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
                && window.Capacitor.isNativePlatform()
                && String(window.Capacitor.getPlatform && window.Capacitor.getPlatform() || '').toLowerCase() === 'android') {
                var sw = window.screen.width || 0;
                var sh = window.screen.height || 0;
                if (Math.min(sw, sh) >= 600) return true;
            }
        } catch (_) {}
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        var h = window.innerHeight || document.documentElement.clientHeight || 0;
        if (navigator.maxTouchPoints > 0 && Math.min(w, h) >= 600 && Math.max(w, h) >= 900) return true;
        return false;
    }

    function detectPcLikeLayout() {
        return detectDesktopSiteMode() || detectTabletEnvironment();
    }

    function applyPcLikeLayoutViewport() {
        if (!detectPcLikeLayout()) return false;
        document.documentElement.classList.add('layout-desktop');
        if (detectTabletEnvironment()) {
            document.documentElement.classList.add('layout-tablet');
        }
        var vp = document.getElementById('viewportMeta') || document.querySelector('meta[name="viewport"]');
        if (vp) {
            vp.setAttribute(
                'content',
                'width=' + DESKTOP_LAYOUT_WIDTH + ', initial-scale=1.0, minimum-scale=0.25, maximum-scale=5.0, user-scalable=yes'
            );
        }
        return true;
    }

    window.BSA.isDesktopSiteMode = detectDesktopSiteMode;
    window.BSA.isTabletEnvironment = detectTabletEnvironment;
    window.BSA.isPcLikeLayout = detectPcLikeLayout;
    window.BSA.DESKTOP_LAYOUT_WIDTH = DESKTOP_LAYOUT_WIDTH;

    window.BSA.prefersMobileLayout = function () {
        if (detectPcLikeLayout()) return false;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 768;
    };

    window.BSA.prefersCompactLayout = function () {
        if (detectPcLikeLayout()) return false;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 1024;
    };

    applyPcLikeLayoutViewport();

    window.addEventListener('orientationchange', function () {
        setTimeout(applyPcLikeLayoutViewport, 120);
    });
    window.addEventListener('resize', function () {
        if (!detectTabletEnvironment()) return;
        applyPcLikeLayoutViewport();
    });
})();
