#!/usr/bin/env node
'use strict';
/** 2026-11-06 스르륵 업데이트: 쓰는 화면은 안 건드리고, 안 보는 순간에만 바꾼다 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('../js/core/silent-update.js');
const P = require('../js/core/offline-precache.js');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function make(o) {
    const c = { t: 1000, applied: 0, fetched: 0, busy: false, online: true, ok: true };
    const ctl = S.createController({
        now: () => c.t,
        prefetch: async () => { c.fetched += 1; if (o && o.onFetch) o.onFetch(c, ctl2()); return c.ok; },
        apply: () => { c.applied += 1; },
        isBusy: () => c.busy,
        isOnline: () => c.online
    });
    function ctl2() { return ctl; }
    return { c, ctl };
}

(async () => {
    let { c, ctl } = make();
    await ctl.noteNewVersion('a');
    assert.strictEqual(c.fetched, 1, '뒤에서 받음');
    assert.strictEqual(c.applied, 0, '쓰는 중엔 안 바꿈');
    await ctl.noteNewVersion('a');
    assert.strictEqual(c.fetched, 1, '같은 버전은 또 안 받음');
    ctl.onHidden();
    assert.strictEqual(c.applied, 1, '앱을 내리면 바꿈');
    ctl.onHidden();
    assert.strictEqual(c.applied, 1, '한 번만');

    ({ c, ctl } = make());
    await ctl.noteNewVersion('a');
    c.busy = true;
    ctl.onHidden();
    assert.strictEqual(c.applied, 0, '입력·저장·올리기 중이면 안 바꿈');
    c.busy = false;
    c.t += 5000;
    ctl.onVisible();
    assert.strictEqual(c.applied, 0, '잠깐 내렸다 돌아오면 안 바꿈');
    c.busy = true;
    ctl.onHidden();
    c.t += S.RETURN_APPLY_MS;
    ctl.onVisible();
    assert.strictEqual(c.applied, 0, '돌아왔어도 바쁘면 안 바꿈');
    c.busy = false;
    ctl.onHidden();
    assert.strictEqual(c.applied, 1, '다음 기회에 바꿈');

    ({ c, ctl } = make());
    c.ok = false;
    await ctl.noteNewVersion('a');
    ctl.onHidden();
    assert.strictEqual(c.applied, 0, '받기가 끊겼으면 안 바꿈');
    c.ok = true;
    await ctl.noteNewVersion('a');
    assert.strictEqual(c.fetched, 2, '다시 받음');
    assert.strictEqual(c.applied, 1, '내려가 있는 동안 다 받으면 바로 바꿈');

    ({ c, ctl } = make());
    await ctl.noteNewVersion('a');
    c.online = false;
    ctl.onHidden();
    assert.strictEqual(c.applied, 0, '오프라인이면 안 바꿈');

    const asked = [];
    const ok = await P.prefetchApp(async (u) => { asked.push(u); return { ok: true, text: async () => '<script src="app.js?v=1"></script><link href="styles.css?v=1">', arrayBuffer: async () => new ArrayBuffer(0) }; });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(asked, ['index.html', 'app.js', 'styles.css'], '앱 본체를 받음');
    assert.strictEqual(await P.prefetchApp(async () => ({ ok: false })), false);

    // 연결: 쓰는 중 45초 확인·창 복귀에서 곧장 새로고침하지 않는다
    const at = app.indexOf('async function checkRemoteWebVersion(');
    const body = app.slice(at, app.indexOf('function isSilentUpdateBusy()', at));
    assert.ok(!/visibilityState === 'hidden'\) window\.reloadWebAppFromServer/.test(body) || body.includes('silentUpdate.noteNewVersion(sha)'));
    assert.ok(body.includes('silentUpdate.noteNewVersion(sha)'));
    assert.ok(app.includes('silentUpdate.onHidden()') && app.includes('saveSilentResumeView();'));
    assert.ok(html.indexOf('js/core/silent-update.js') > 0 && html.indexOf('js/core/silent-update.js') < html.indexOf('src="app.js'));
    console.log('test-silent-update: ok');
})().catch((e) => { console.error(e); process.exit(1); });
