/* 레이아웃 모드
 * - 태블릿·현장 터치기기: 모바일 터치 UI (device-width)
 * - 폰에서 "데스크톱 사이트" 요청: PC 레이아웃(viewport 1280)
 * - 일반 PC: 기본 레이아웃
 */
(function () {
    window.BSA = window.BSA || {};
    if (!window.BSA.tabs) window.BSA.tabs = {};
    if (!window.BSA.shared) window.BSA.shared = {};

    var DESKTOP_LAYOUT_WIDTH = 1280;
    var MOBILE_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';

    function detectTabletEnvironment() {
        if (document.documentElement.classList.contains('layout-tablet')) return true;
        var ua = navigator.userAgent || '';
        if (/iPad/i.test(ua)) return true;
        if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
        if (/Tablet|PlayBook|Silk/i.test(ua)) return true;
        // iPadOS 13+ desktop UA (Macintosh + touch)
        if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
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

    /** 폰 브라우저의 "데스크톱 사이트" 요청 (태블릿 제외) */
    function detectDesktopSiteMode() {
        if (detectTabletEnvironment()) return false;
        if (document.documentElement.classList.contains('layout-desktop')
            && !document.documentElement.classList.contains('layout-tablet')) {
            return true;
        }
        var ua = navigator.userAgent || '';
        // Android Chrome — Desktop site (폰만; 태블릿은 위에서 제외)
        if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
        if (/Linux x86_64|CrOS/i.test(ua) && navigator.maxTouchPoints > 0) return true;
        return false;
    }

    /** PC형 레이아웃 — 태블릿은 터치 모바일 UI를 쓰므로 false */
    function detectPcLikeLayout() {
        if (detectTabletEnvironment()) return false;
        return detectDesktopSiteMode();
    }

    function setViewportContent(content) {
        var vp = document.getElementById('viewportMeta') || document.querySelector('meta[name="viewport"]');
        if (vp) vp.setAttribute('content', content);
    }

    function applyLayoutMode() {
        var root = document.documentElement;
        if (detectTabletEnvironment()) {
            root.classList.add('layout-tablet');
            root.classList.remove('layout-desktop');
            setViewportContent(MOBILE_VIEWPORT);
            return 'tablet';
        }
        if (detectDesktopSiteMode()) {
            root.classList.add('layout-desktop');
            root.classList.remove('layout-tablet');
            setViewportContent(
                'width=' + DESKTOP_LAYOUT_WIDTH + ', initial-scale=1.0, minimum-scale=0.25, maximum-scale=5.0, user-scalable=yes'
            );
            return 'desktop-site';
        }
        root.classList.remove('layout-tablet');
        // PC 브라우저는 layout-desktop 없이 기본 와이드 CSS 사용
        return 'default';
    }

    window.BSA.isDesktopSiteMode = detectDesktopSiteMode;
    window.BSA.isTabletEnvironment = detectTabletEnvironment;
    window.BSA.isPcLikeLayout = detectPcLikeLayout;
    window.BSA.DESKTOP_LAYOUT_WIDTH = DESKTOP_LAYOUT_WIDTH;
    window.BSA.applyLayoutMode = applyLayoutMode;

    window.BSA.prefersMobileLayout = function () {
        if (detectTabletEnvironment()) return true;
        if (detectPcLikeLayout()) return false;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 768;
    };

    window.BSA.prefersCompactLayout = function () {
        if (detectTabletEnvironment()) return true;
        if (detectPcLikeLayout()) return false;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 1024;
    };

    applyLayoutMode();

    window.addEventListener('orientationchange', function () {
        setTimeout(applyLayoutMode, 120);
    });
    window.addEventListener('resize', function () {
        if (!detectTabletEnvironment() && !document.documentElement.classList.contains('layout-tablet')) return;
        applyLayoutMode();
    });
})();
