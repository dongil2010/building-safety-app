/**
 * 현장 앱: 온라인일 때 나중에 쓸 파일까지 미리 받아 둔다 — 2026-11-06
 *
 * 왜: 앱은 온라인이면 GitHub Pages 최신본을 받아 기기에 저장(net-cache)해 APK 없이 업데이트된다.
 *     그런데 **그때 실제로 요청한 파일만** 저장된다. 한글 양식·별도 화면처럼 눌러야 불리는 파일은
 *     온라인에서 쓴 적이 없으면 오프라인에서 옛 APK 사본이나 빈손이 되어, 최신 기능과 옛 양식이 섞였다.
 * 어떻게: 앱 시작 뒤 잠시 기다렸다가 아래 파일을 한 번씩 요청한다. 요청은 OfflineAwareWebViewClient를 거치며
 *     저장되므로 여기서는 받기만 한다. 안 바뀐 파일은 304로 끝나 데이터를 거의 안 쓴다. 배포 버전마다 한 번.
 * 웹 브라우저에서는 돌지 않는다(서비스 워커가 따로 맡는다).
 */
(function (root) {
    'use strict';

    var FILES = [
        'templates/hwpx_crack_monitor.hwpx',
        'templates/hwpx_grade12_survey_stamp.hwpx',
        'templates/hwpx_grade3_photo_album.hwpx',
        'templates/hwpx_grade3_survey_stamp.hwpx',
        'templates/hwpx_priority_compare_grade3.hwpx',
        'templates/hwpx_report_summary.hwpx',
        'templates/hwpx_survey_template.hwpx',
        'templates/hwpx_survey_template_grade3.hwpx',
        'templates/hwpx_survey_template_grade3_regular.hwpx',
        'templates/hwpx_survey_template_regular.hwpx',
        'js/vendor/pdf.worker.min.js'
    ];
    // 별도 화면: 화면 파일 + 그 화면이 부르는 이 앱의 script·stylesheet
    var PAGES = ['report-summary.html', 'struct-plan.html', 'photo-capture.html', 'offline.html'];
    var STAMP_KEY = 'bsa_offline_precache_version';

    /** HTML에서 이 앱의 파일 주소만 (외부 주소·data: 제외, ?v= 제거) */
    function localAssetsOf(html) {
        var out = [];
        var re = /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi;
        var m;
        while ((m = re.exec(String(html || '')))) {
            var u = m[1];
            if (/^(?:[a-z]+:|\/\/|#)/i.test(u)) continue;
            u = u.split(/[?#]/)[0].replace(/^\.\//, '');
            if (u && out.indexOf(u) < 0) out.push(u);
        }
        return out;
    }

    function isNative() {
        try { return !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()); } catch (_e) { return false; }
    }

    async function run(fetchFn) {
        var get = fetchFn || root.fetch.bind(root);
        var queue = FILES.slice();
        var ok = true;
        for (var i = 0; i < PAGES.length; i++) {
            try {
                var res = await get(PAGES[i], { cache: 'no-store' });
                if (!res.ok) { ok = false; continue; }
                localAssetsOf(await res.text()).forEach(function (a) { if (queue.indexOf(a) < 0) queue.push(a); });
            } catch (_e) { ok = false; }
        }
        await Promise.all([0, 1].map(async function () {
            while (queue.length) {
                var f = queue.shift();
                try {
                    var r = await get(f, { cache: 'no-store' });
                    if (!r.ok) ok = false;
                    await r.arrayBuffer();
                } catch (_e) { ok = false; }
            }
        }));
        return ok;
    }

    function start() {
        if (!isNative() || root.navigator.onLine === false) return;
        var version = String(root.BSA_APP_VERSION || '');
        try { if (version && root.localStorage.getItem(STAMP_KEY) === version) return; } catch (_e) { /* 그래도 받는다 */ }
        run().then(function (ok) {
            // 일부 실패(끊김)면 표시하지 않아 다음 시작 때 다시 받는다
            if (ok) { try { root.localStorage.setItem(STAMP_KEY, version); } catch (_e) { /* ignore */ } }
        }).catch(function () { /* 다음 시작 때 */ });
    }

    var api = { FILES: FILES, PAGES: PAGES, localAssetsOf: localAssetsOf, run: run };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root && root.addEventListener) {
        root.addEventListener('load', function () { setTimeout(start, 8000); });
    }
})(typeof window !== 'undefined' ? window : globalThis);
