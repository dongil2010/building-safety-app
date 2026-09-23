#!/usr/bin/env node
'use strict';

/**
 * 사진 고유 ID 전환 2단계 (2026-09-23) — 옛 사진 방식 앱은 클라우드 사진을 건드리지 않는다.
 *
 * 3단계에서 새 사진이 고유 ID를 받으면, 업데이트 안 된 태블릿(자리 번호 방식)은 가운데 사진을
 * 지울 때 뒤 사진을 앞 번호로 "이사"시키며 클라우드에 올리고 지운다. 새 방식에서는 옛 번호
 * (결함id_1 등)도 계속 쓰이는 사진 이름이라, 그 이사가 멀쩡한 사진을 덮어쓰거나 지운다.
 *
 * 09-21 차단 장치는 결함 동기화만 막고 사진 올리기·지우기는 막지 않았다. 그렇다고 지금 그냥
 * 막으면 안 된다 — 3단계 전에는 옛 방식이 정상이라, 기기 안 이사는 되는데 클라우드 이사만
 * 막혀 지운 사진이 되살아난다. 그래서 "배포본 사진 방식 번호 > 이 코드의 번호"일 때만 막는다.
 * 3단계 전에는 둘 다 1이라 아무것도 막지 않는다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const pages = fs.readFileSync(path.join(ROOT, 'scripts', 'prepare-pages.py'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const open = app.indexOf('{', app.indexOf(')', at));
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

// --- 배포 스크립트가 app.js의 방식 번호를 제대로 읽는다 (로컬엔 Python이 없어 CI에서 처음 돈다) ---
(function prepareReadsScheme() {
    const pyRe = pages.match(/re\.search\(r"([^"]+)", app_text\)/);
    assert.ok(pyRe, 'prepare-pages.py가 PHOTO_ID_SCHEME을 읽지 않는다');
    const re = new RegExp(pyRe[1], 'g');
    const found = app.match(re) || [];
    assert.strictEqual(found.length, 1, 'app.js의 PHOTO_ID_SCHEME 선언은 정확히 하나여야 한다 — 배포 스크립트 정규식이 못 찾으면 배포가 선다');
    assert.match(pages, /raise SystemExit\(\s*"\[prepare-pages\] app\.js에서 PHOTO_ID_SCHEME을 못 찾았다/, '못 찾으면 배포를 세워야 한다');
    assert.match(pages, /"photoIdScheme": photo_id_scheme/, 'web-version.json에 적어야 태블릿이 읽는다');
})();

// --- 2단계는 아직 옛 방식(1)이다. 3단계에서 2로 올린다 ---
(function schemeStillOne() {
    assert.match(app, /const PHOTO_ID_SCHEME = 1;/, '3단계 전에는 1이어야 한다 — 올리는 순간 옛 앱의 사진 쓰기가 멈춘다');
})();

// --- 클라우드 사진을 쓰는 입구·지우는 입구 모두 먼저 확인한다 ---
(function gatesAtBothDoors() {
    const persist = extractFunction('async function persistPhotoToCloud(');
    const gateAt = persist.indexOf('await isCloudPhotoWriteBlocked()');
    assert.ok(gateAt > 0, 'persistPhotoToCloud가 방식 번호를 안 본다');
    ['_photoPersistInflight[photoId] = ', 'companyPhotos.doc(', 'runPhotoStorageUpload('].forEach((w) => {
        const at = persist.indexOf(w);
        if (at >= 0) assert.ok(gateAt < at, '확인보다 먼저 쓰는 곳이 있다: ' + w);
    });

    const del = extractFunction('async function deleteCloudPhoto(');
    const dGate = del.indexOf('await isCloudPhotoWriteBlocked()');
    assert.ok(dGate > 0, 'deleteCloudPhoto가 방식 번호를 안 본다');
    assert.ok(dGate < del.indexOf('unmarkPhotoOnStorage('), '막힐 때는 "클라우드에 있음" 표시도 건드리지 않는다');
    assert.ok(dGate < del.indexOf('deleteCloudAssetDoc('));
})();

// --- 실제로 돌려 본다: 가짜 web-version.json 응답으로 ---
function makeGate(opts) {
    const calls = { fetch: 0, banner: [] };
    const ctx = {
        console: { warn() {} },
        AbortController: undefined,
        window: {
            BSA_APP_VERSION: opts.running,
            location: { hostname: 'dongil2010.github.io' },
            setTimeout, clearTimeout,
            BSA: { syncMerge: { isOutdatedBuild: (running, meta) => !!(meta && meta.short && meta.short !== running) } }
        },
        fetch: async () => {
            calls.fetch += 1;
            if (opts.offline) throw new Error('offline');
            if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
            return { ok: true, text: async () => JSON.stringify(opts.deployed) };
        },
        renderOutdatedAppBanner: (show) => calls.banner.push(show)
    };
    vm.createContext(ctx);
    vm.runInContext([
        'const APP_VERSION_GATE_TTL_MS = 60000;',
        'let _appOutdatedForSync = false;',
        'let _appVersionGateCheckedAt = 0;',
        'let _appVersionGateInflight = null;',
        'const PHOTO_ID_SCHEME = ' + (opts.localScheme || 1) + ';',
        'let _deployedPhotoIdScheme = PHOTO_ID_SCHEME;',
        extractFunction('async function refreshAppVersionGate('),
        extractFunction('async function checkAppVersionGateNow('),
        extractFunction('async function isCloudPhotoWriteBlocked('),
        'this.blocked = isCloudPhotoWriteBlocked; this.gate = refreshAppVersionGate;'
    ].join('\n'), ctx);
    return { ctx, calls };
}

(async function behaviour() {
    // 3단계 전: 배포본도 1 → 막지 않는다 (지금 막으면 지운 사진이 되살아난다)
    {
        const { ctx } = makeGate({ running: 'aaa1111', deployed: { short: 'aaa1111', photoIdScheme: 1 } });
        assert.strictEqual(await ctx.blocked(), false);
    }
    // 2단계 전 배포본(번호 없음)도 1로 본다
    {
        const { ctx } = makeGate({ running: 'aaa1111', deployed: { short: 'bbb2222' } });
        assert.strictEqual(await ctx.blocked(), false, '번호가 없는 배포본 때문에 사진 쓰기가 멈추면 안 된다');
        assert.strictEqual(await ctx.gate(true), true, '버전이 다르면 결함 동기화는 여전히 막는다(09-21 차단)');
    }
    // 3단계 배포 후 옛 코드(1): 막는다
    {
        const { ctx } = makeGate({ running: 'aaa1111', deployed: { short: 'ccc3333', photoIdScheme: 2 } });
        assert.strictEqual(await ctx.blocked(), true, '옛 방식 앱이 새 방식 배포본 옆에서 사진을 쓰면 안 된다');
    }
    // 3단계 코드(2)가 3단계 배포본(2)을 만나면 막지 않는다
    {
        const { ctx } = makeGate({ running: 'ccc3333', deployed: { short: 'ccc3333', photoIdScheme: 2 }, localScheme: 2 });
        assert.strictEqual(await ctx.blocked(), false);
    }
    // 사진 여러 장을 동시에 올려도 확인은 한 번, 그리고 전부 최신 판단을 받는다
    {
        const { ctx, calls } = makeGate({ running: 'aaa1111', deployed: { short: 'ccc3333', photoIdScheme: 2 }, delayMs: 20 });
        const results = await Promise.all([1, 2, 3, 4, 5].map(() => ctx.blocked()));
        assert.deepStrictEqual(results, [true, true, true, true, true],
            '첫 확인이 끝나기 전에 들어온 업로드가 "막지 않음"을 받으면 한 장이 새 나간다');
        assert.strictEqual(calls.fetch, 1, '동시에 물어도 web-version.json은 한 번만 받는다');
    }
    // 오프라인이면 이전 판단을 유지한다(첫 판단은 막지 않음 — 어차피 오프라인이라 못 올린다)
    {
        const { ctx } = makeGate({ running: 'aaa1111', offline: true });
        assert.strictEqual(await ctx.blocked(), false);
    }

    console.log('test-photo-scheme-gate: ok');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
