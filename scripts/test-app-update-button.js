/* 「업데이트 받기」: 웹 버전 비교·기기 데이터 보존·캐시 정리·APK 받기(안드로이드만) */
'use strict';
const assert = require('assert');
const g = globalThis;
g.BSA = { syncMerge: require('../js/core/sync-merge.js') };
const upd = require('../js/shared/app-update-button.js');
const mob = require('../js/core/mobile-app-update.js');
g.BSA.mobileAppUpdate = mob;

let log;
let ua = 'Mozilla/5.0 (Windows NT 10.0)';
function setup(o) {
    log = { alerts: [], confirms: [], deleted: [], reloads: 0, flushed: 0, swUpdate: 0, skip: 0, apk: [], opened: [] };
    const answers = (o.answers || []).slice();
    g.BSA_APP_VERSION = o.running || 'b043278';
    g.BSA_APP_BUILD = { versionCode: 12, versionName: '1.3.4' };
    g.location = { hostname: o.host || 'dongil2010.github.io', href: 'x', reload() { log.reloads++; } };
    const waiting = { postMessage(m) { if (m && m.type === 'SKIP_WAITING') log.skip++; } };
    Object.defineProperty(g, 'navigator', { configurable: true, value: {
        onLine: o.offline ? false : true,
        userAgent: o.ua || ua,
        serviceWorker: { getRegistration: async () => ({ update: async () => { log.swUpdate++; }, waiting, installing: null }) }
    } });
    g.caches = { keys: async () => ['building-safety-v20261009_1', 'building-safety-v20261012_2', 'building-safety-shell', 'other'],
        delete: async (k) => { log.deleted.push(k); return true; } };
    g.fetch = async (url) => {
        if (o.fetchFail) throw new Error('net');
        if (String(url).indexOf('web-version.json') === 0) return { ok: true, text: async () => JSON.stringify(o.meta || { sha: 'b043278e75', short: 'b043278' }) };
        if (o.corsBlocked && String(url).indexOf('firebasestorage') >= 0) throw new TypeError('Failed to fetch');
        if (String(url).indexOf('workers.dev') >= 0) { log.proxied = (log.proxied || 0) + 1; return { ok: true, text: async () => JSON.stringify(o.manifest || { versionCode: 12, apkPath: 'releases/building-safety.apk' }) }; }
        if (String(url).indexOf('latest.json') >= 0) return { ok: true, text: async () => JSON.stringify(o.manifest || { versionCode: 12, versionName: '1.3.4', apkPath: 'releases/building-safety.apk' }) };
        return { ok: false };
    };
    g.appAlert = async (m) => { log.alerts.push(m); };
    g.appConfirm = async (m) => { log.confirms.push(m); return answers.length ? answers.shift() : true; };
    g.reloadWebAppFromServer = () => { log.reloads++; };
    g.BSA_appUpdateHooks = { pendingCount: () => o.pending || 0, flushLocal: async () => { log.flushed++; } };
    g.Capacitor = o.native ? { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: o.plugin ? { AppUpdate: {
        getVersion: async () => ({ versionCode: o.installed || 12 }),
        downloadAndInstall: async (a) => { log.apk.push(a.url); }
    } } : {} } : undefined;
    g.open = (u) => { log.opened.push(u); return {}; };
}

(async () => {
    // 비교·캐시 고르기
    assert.strictEqual(upd.isWebNewer('b043278', { short: 'c111111' }, 'dongil2010.github.io'), true);
    assert.strictEqual(upd.isWebNewer('b043278', { short: 'b043278' }, 'dongil2010.github.io'), false);
    assert.strictEqual(upd.isWebNewer('b043278', { short: 'c111111' }, 'localhost'), false, '로컬 개발은 판단 안 함');
    assert.deepStrictEqual(upd.cachesToDelete(['building-safety-v1', 'building-safety-shell', 'x'], null), ['building-safety-v1'],
        '코드 캐시만 지운다(셸·기타 그대로)');

    // 1) 최신
    setup({});
    let r = await upd.onUpdateButton();
    assert.ok(r.latest);
    assert.ok(/이미 최신/.test(log.alerts[0]) && /b043278/.test(log.alerts[0]));
    assert.strictEqual(log.reloads, 0);

    // 2) 오프라인
    setup({ offline: true });
    r = await upd.onUpdateButton();
    assert.ok(r.offline && /인터넷/.test(log.alerts[0]));
    setup({ fetchFail: true });
    r = await upd.onUpdateButton();
    assert.ok(r.offline, '서버 연결 실패도 안내');

    // 3) 새 웹 버전 + 못 올린 변경 있음 → 경고 후 진행: 기기 저장 → SW 갱신 → 코드 캐시만 삭제 → 새로고침
    setup({ meta: { sha: 'c2222222aa', short: 'c222222' }, pending: 3, answers: [true, true] });
    r = await upd.onUpdateButton();
    assert.ok(r.web && r.web.ok, JSON.stringify(r));
    assert.ok(/지금 b043278 \/ 최신 c222222/.test(log.confirms[0]), '현재·최신 버전 표시');
    assert.ok(/3곳/.test(log.confirms[1]) && /기기에 그대로/.test(log.confirms[1]), '못 올린 변경 경고');
    assert.strictEqual(log.flushed, 1);
    assert.strictEqual(log.swUpdate, 1);
    assert.strictEqual(log.skip, 1);
    assert.deepStrictEqual(log.deleted.sort(), ['building-safety-v20261009_1', 'building-safety-v20261012_2']);
    assert.strictEqual(log.reloads, 1);
    assert.strictEqual(upd._state.web, true, '배지 켜짐');

    // 4) 못 올린 변경 경고에서 "나중에" → 새로고침 안 함
    setup({ meta: { short: 'c222222' }, pending: 2, answers: [true, false] });
    r = await upd.onUpdateButton();
    assert.strictEqual(r.web.reason, 'pending-declined');
    assert.strictEqual(log.reloads, 0);
    assert.strictEqual(log.deleted.length, 0);

    // 5) PC는 APK를 보지 않는다
    setup({ manifest: { versionCode: 99, apkPath: 'releases/a.apk' } });
    r = await upd.onUpdateButton();
    assert.ok(r.latest && !/APK/.test(log.alerts[0]));
    assert.strictEqual(mob.isAndroidDevice(), false);

    // 6) 안드로이드 앱 + 새 APK → 내장 설치 도구로 받기
    setup({ native: true, plugin: true, installed: 12, manifest: { versionCode: 13, versionName: '1.3.5', apkPath: 'releases/building-safety.apk', notes: '버그 수정' } });
    r = await upd.onUpdateButton();
    assert.ok(r.apk && r.apk.ok && r.apk.via === 'plugin', JSON.stringify(r));
    assert.ok(/지금 12 \/ 최신 13 \(1\.3\.5\)/.test(log.confirms[0]) && /버그 수정/.test(log.confirms[0]));
    assert.ok(/releases%2Fbuilding-safety\.apk\?alt=media$/.test(log.apk[0]));
    assert.strictEqual(upd._state.apk, true);

    // 7) 안드로이드 브라우저(앱 아님) → 다운로드 주소를 연다
    setup({ ua: 'Mozilla/5.0 (Linux; Android 14; SM-X710)', manifest: { versionCode: 13, apkPath: 'releases/building-safety.apk' } });
    r = await upd.onUpdateButton();
    assert.ok(r.apk.ok && r.apk.via === 'browser' && log.opened.length === 1);

    // 8) 안드로이드 같은 번호 → 최신, 앱 번호도 표시
    setup({ native: true, plugin: true, installed: 12 });
    r = await upd.onUpdateButton();
    assert.ok(r.latest && /앱\(APK\) 버전: 지금 12 \/ 최신 12/.test(log.alerts[0]));

    // 9) APK 거절 + 웹도 새것 → 웹 업데이트로 이어감
    setup({ native: true, plugin: true, installed: 12, meta: { short: 'c222222' }, manifest: { versionCode: 13, apkPath: 'releases/a.apk' }, answers: [false, true] });
    r = await upd.onUpdateButton();
    assert.ok(r.web && r.web.ok && log.apk.length === 0);

    // 9b) Storage가 CORS로 막혀도 프록시로 매니페스트를 읽는다
    setup({ native: true, plugin: true, installed: 12, corsBlocked: true, manifest: { versionCode: 14, apkPath: 'releases/building-safety.apk' } });
    r = await upd.onUpdateButton();
    assert.ok(log.proxied === 1 && r.apk && r.apk.ok, JSON.stringify(r));

    // 10) app.js 연결
    const fs = require('fs');
    const app = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
    const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(app.includes('window.BSA_appUpdateHooks = {'));
    assert.ok(app.includes("window.BSA.appUpdateButton.setBadge('web', outdated)"));
    assert.ok(/id="btnAppUpdate" data-app-update-btn/.test(html) && html.includes('app-update-dot'));
    assert.ok(html.includes('js/shared/app-update-button.js'));
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'js/shared/app-update-button.js'), 'utf8');
    assert.ok(!/indexedDB|localStorage\.(clear|removeItem)/.test(src), '기기 데이터는 건드리지 않는다');

    console.log('test-app-update-button: OK');
})().catch((e) => { console.error(e); process.exit(1); });
