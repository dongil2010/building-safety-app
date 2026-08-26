/* 모바일 브라우저 "데스크톱 사이트" 요청 시 PC 레이아웃 유지 */
(function () {
    window.BSA = window.BSA || {};

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

    function applyDesktopSiteViewport() {
        if (!detectDesktopSiteMode()) return false;
        document.documentElement.classList.add('layout-desktop');
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
    window.BSA.DESKTOP_LAYOUT_WIDTH = DESKTOP_LAYOUT_WIDTH;

    window.BSA.prefersMobileLayout = function () {
        if (detectDesktopSiteMode()) return false;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 768;
    };

    window.BSA.prefersCompactLayout = function () {
        if (detectDesktopSiteMode()) return false;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 1024;
    };

    applyDesktopSiteViewport();

    window.addEventListener('orientationchange', function () {
        setTimeout(applyDesktopSiteViewport, 120);
    });
})();
