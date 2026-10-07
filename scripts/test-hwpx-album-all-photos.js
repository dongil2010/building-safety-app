#!/usr/bin/env node
'use strict';

/**
 * 한글 사진첩에 결함 사진이 일부만 나오던 문제 (2026-10-07, 광주교회 지하층 식당 NO.11)
 *
 * NO.11은 화살표 2개가 한 번호로 묶인 결함이었고 사진 2장이 대표가 아닌 마킹에 붙어 있었다.
 * 한글 출력은 묶음 줄의 사진을 대표에서만 읽어 0장이 나왔다(층 전체 6장 중 4장만 출력).
 * 묶음을 고쳐도 사진첩이 결함당 첫 장만 넣어 2장 중 1장만 나오게 되어 있었다.
 *
 * 지킬 것:
 *  1. 묶음 줄의 사진은 구성원 전체에서 모은다(대표 먼저, 같은 사진 ID는 한 번).
 *  2. 사진첩은 결함당 전부 넣는다 — 사진마다 번호 하나, 비고는 "사진5~6"처럼 범위로.
 *  3. 여러 장 중 일부만 받아진 결함은 빈 칸만 다시 받는다(한 장 있다고 넘어가지 않는다).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

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

// 서버에 있는 사진(ID → 내용). loadPhotoIdsWithCloudCap이 여기서 꺼내 온다.
const cloud = {};
const loadCalls = [];
const ctx = {
    seedPhotoCacheFromDefect() {},
    async loadPhotoIdsWithCloudCap(ids) {
        loadCalls.push(ids.slice());
        return ids.map((pid) => (pid && cloud[pid]) || null);
    }
};
vm.createContext(ctx);
vm.runInContext([
    extractFunction('async function ensureDefectPhotosLoaded('),
    extractFunction('async function loadHwpxRowPhotoEntries('),
    extractFunction('function formatHwpxPhotoRemark('),
    'this.ensure = ensureDefectPhotosLoaded; this.entries = loadHwpxRowPhotoEntries; this.remark = formatHwpxPhotoRemark;'
].join('\n'), ctx);

const plain = (v) => JSON.parse(JSON.stringify(v));

(async () => {
    // --- 1. 광주교회 NO.11 그대로: 대표는 사진 없음, 다른 마킹에 2장 ---
    {
        cloud.m2_a = 'data:A';
        cloud.m2_b = 'data:B';
        const rep = { id: 'm1', no: 'NO.11', groupId: 'm1', photos: [] };
        const other = { id: 'm2', no: 'NO.11', groupId: 'm1', photoIds: ['m2_a', 'm2_b'], photos: [null, null] };
        const row = Object.assign({}, rep, { _groupMemberIds: ['m1', 'm2'], _groupMembers: [rep, other], _representative: rep });
        assert.deepStrictEqual(plain(await ctx.entries(row)), [
            { src: 'data:A', pid: 'm2_a' },
            { src: 'data:B', pid: 'm2_b' }
        ], '대표가 아닌 마킹의 사진 2장이 모두 나와야 한다');
    }

    // --- 대표 사진이 먼저, 구성원이 같은 사진을 같이 쓰면 한 번만 ---
    {
        const a = { id: 'a', photoIds: ['p1'], photos: ['data:1'] };
        const b = { id: 'b', photoIds: ['p2', 'p1'], photos: ['data:2', 'data:1'] };
        const row = Object.assign({}, b, { _groupMembers: [a, b], _representative: b });
        assert.deepStrictEqual(plain(await ctx.entries(row)).map((e) => e.pid), ['p2', 'p1']);
    }

    // --- 묶음이 아닌 줄: 자기 사진 전부, 빈 칸은 건너뛰되 사진 ID 짝은 유지 ---
    {
        const d = { id: 'd', photoIds: ['x0', 'x1', 'x2'], photos: ['data:0', null, 'data:2'] };
        assert.deepStrictEqual(plain(await ctx.entries(d)), [
            { src: 'data:0', pid: 'x0' },
            { src: 'data:2', pid: 'x2' }
        ]);
        assert.deepStrictEqual(plain(await ctx.entries({ id: 'e', photos: [] })), []);
        assert.deepStrictEqual(plain(await ctx.entries(null)), []);
    }

    // --- 3. 일부만 받아진 결함은 빈 칸만 다시 받는다 ---
    {
        cloud.q1 = 'data:Q1';
        const d = { id: 'q', photoIds: ['q0', 'q1'], photos: ['data:Q0', null] };
        loadCalls.length = 0;
        await ctx.ensure(d);
        assert.deepStrictEqual(plain(loadCalls), [[null, 'q1']], '이미 있는 칸은 다시 받지 않는다');
        assert.deepStrictEqual(plain(d.photos), ['data:Q0', 'data:Q1']);

        // 다 있으면 서버에 묻지 않는다
        loadCalls.length = 0;
        await ctx.ensure(d);
        assert.strictEqual(loadCalls.length, 0);

        // 못 받으면 있던 것을 지우지 않는다
        const keep = { id: 'k', photoIds: ['k0', 'k_없음'], photos: ['data:K0', null] };
        await ctx.ensure(keep);
        assert.deepStrictEqual(plain(keep.photos), ['data:K0', null]);

        // 옛 데이터(빈 칸 없이 당겨진 photos): 이미 있는 사진을 한 번 더 넣지 않는다
        cloud.o0 = 'data:O0';
        cloud.o1 = 'data:O1';
        const old = { id: 'o', photoIds: ['o0', 'o1'], photos: ['data:O1'] };
        await ctx.ensure(old);
        assert.deepStrictEqual(plain(old.photos), ['data:O1', null]);

        // 전차 사진도 같은 규칙
        cloud.pv = 'data:PV';
        const pr = { id: 'p', prevRoundPhotoIds: ['pv'], prevRoundPhotos: [] };
        await ctx.ensure(pr);
        assert.deepStrictEqual(plain(pr.prevRoundPhotos), ['data:PV']);
    }

    // --- 2. 비고 칸 번호 ---
    assert.strictEqual(ctx.remark(5, 0), '');
    assert.strictEqual(ctx.remark(5, 1), '사진5');
    assert.strictEqual(ctx.remark(5, 2), '사진5~6', '좁은 비고 칸에서 두 줄로 꺾이지 않게 범위로');
    assert.strictEqual(ctx.remark(5, 3), '사진5~7');

    // --- 연결: 두 출력 함수 모두 "첫 장만" 쓰는 코드가 없어야 하고, 묶음 줄이 구성원을 넘겨야 한다 ---
    assert.ok(!/outPhotos\[0\]/.test(app), '사진첩이 결함당 첫 장만 쓰는 코드가 다시 들어왔다');
    assert.ok(!/resolveSrcForHwpxEmbed\([^)]*photoIds\[0\]/.test(app), '사진 ID를 항상 첫 칸으로 넘기면 다른 사진과 짝이 틀린다');
    assert.strictEqual((app.match(/loadHwpxRowPhotoEntries\(d\)/g) || []).length, 2, '1·2종과 3종 출력 양쪽에서 불러야 한다');
    assert.ok(extractFunction('function getSurveyRowsForReport(').includes('_groupMembers: members'), '묶음 줄이 구성원을 넘겨야 한다');

    console.log('test-hwpx-album-all-photos: ok');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
