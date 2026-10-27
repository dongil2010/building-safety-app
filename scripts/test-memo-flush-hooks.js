#!/usr/bin/env node
'use strict';

/**
 * 2026-10-27 손글씨·주석 메모(계정별 문서 MEMOS_BY_uid)가 일반 올리기와 같은 시점(온라인 복귀·지금 다시 올리기)에 같이 올라가는지,
 * 응답 없는 통신에서 「올리는 중」이 영영 안 풀리지 않는지.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractFunction(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(src.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

// ---- 연결 지점 ----
assert.ok(/window\.bsaUnparkSync = function \(\) \{[\s\S]{0,700}bsaQueueAndFlushMemos\('manual'\)/.test(app), '지금 다시 올리기에 메모 올리기 포함');
assert.ok(/addEventListener\('online', \(\) => \{ _memoRetryN = 0; queueAndFlushMyMemos\('online'\)/.test(app), '메모 자체 online 핸들러가 기기에 남은 메모를 다시 잡는다');
assert.ok(/memoWithTimeout\(pushMemosForBuilding\(bldg\), 45000/.test(app), '건물당 올리기 시간 제한');
assert.ok(/_memoPushBusySince > 120000|Date\.now\(\) - _memoPushBusySince > 120000/.test(app), '올리는 중 상태 워치독');

// ---- memoWithTimeout ----
const sb = { setTimeout, clearTimeout, Promise };
vm.createContext(sb);
vm.runInContext(extractFunction(app, 'function memoWithTimeout(') + '\nthis.t = memoWithTimeout;', sb);
(async () => {
    assert.strictEqual(await sb.t(Promise.resolve(7), 1000, 'a'), 7);
    await assert.rejects(sb.t(new Promise(() => {}), 30, 'b'), /시간 초과 b/);
    await assert.rejects(sb.t(Promise.reject(new Error('x')), 1000, 'c'), /x/);

    // ---- queueAndFlushMyMemos ----
    const calls = [];
    const ctx = {
        console, window: {}, _memoRetryN: 5,
        queueAllMyLocalMemos: () => ctx.nQueued,
        scheduleMemoAuthorPush: (ms) => calls.push(['schedule', ms]),
        renderMemoPendingBadge: () => calls.push(['badge']),
        nQueued: 2
    };
    vm.createContext(ctx);
    vm.runInContext(extractFunction(app, 'function queueAndFlushMyMemos(') + '\nthis.q = queueAndFlushMyMemos;', ctx);
    assert.strictEqual(ctx.q('online'), 2);
    assert.deepStrictEqual(calls, [['schedule', 500]]);
    calls.length = 0; ctx.nQueued = 0;
    assert.strictEqual(ctx.q('boot'), 0);
    assert.deepStrictEqual(calls, [['badge']]);
    console.log('test-memo-flush-hooks OK');
})().catch((e) => { console.error(e); process.exit(1); });