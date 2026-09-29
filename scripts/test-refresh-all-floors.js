#!/usr/bin/env node
'use strict';

/**
 * 2026-09-29 통계·보고서 전에 모든 층을 서버에서 받는다.
 * 사용자 제보: 태블릿 통계에서 가끔 층이 빠짐. 원인: 동기화는 "지금 보는 층 + 이 기기에서 고친 층"만
 * 서버에서 읽어서, 안 열어 본 층은 기기에 없거나 옛 값 → 통계·한글·PDF가 그 층을 빼먹음.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const stats = fs.readFileSync(path.join(root, 'js', 'tabs', 'stats.js'), 'utf8').replace(/\r\n/g, '\n');

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
    throw new Error(header + ' 끝');
}

function device(opts) {
    const o = opts || {};
    const reads = [];
    const merged = [];
    let saved = 0;
    const ctx = {
        db: o.nodb ? null : {},
        window: { state: { companyId: o.nocompany ? '' : 'c1' } },
        navigator: { onLine: o.offline ? false : true },
        console: { warn() {} },
        Map, Date, Promise, setTimeout,
        _syncInFlight: false,
        isRemoteSyncing: false,
        buildingFloorCodesForBackup: () => ['B1', '1F', '2F'],
        readFloorBundleStrict: async (bldg, code) => {
            reads.push(code);
            if ((o.fail || []).includes(code)) throw new Error('저장 중');
            return { markings: { items: [{ id: code + '-d' }] }, ndt: {} };
        },
        mergeFloorBundleIntoState: (bldg, code) => merged.push(code),
        saveStateToLocalStorage: () => { saved++; }
    };
    vm.createContext(ctx);
    vm.runInContext([
        'const _buildingFloorsFreshAt = new Map(); const BUILDING_FLOORS_FRESH_MS = 120000;',
        extractFunction(app, 'async function refreshBuildingFloorsFromServer('),
        'this.run = refreshBuildingFloorsFromServer;'
    ].join('\n'), ctx);
    return { ctx, reads, merged, saved: () => saved };
}

(async () => {
    const bldg = { id: 'b1' };
    {
        const d = device();
        const r = await d.ctx.run(bldg);
        assert.strictEqual(r.ok, true);
        assert.deepStrictEqual(d.reads, ['B1', '1F', '2F'], '모든 층을 서버에서 읽는다');
        assert.deepStrictEqual(d.merged, ['B1', '1F', '2F'], '동기화와 같은 병합으로 합친다(이 기기 수정 유지)');
        assert.strictEqual(d.saved(), 1);
        const again = await d.ctx.run(bldg);
        assert.strictEqual(again.skipped, 'recent', '2분 안에 다시 들어오면 또 읽지 않는다(읽기 과금)');
        assert.strictEqual(d.reads.length, 3);
        const forced = await d.ctx.run(bldg, { force: true });
        assert.strictEqual(forced.ok, true);
        assert.strictEqual(d.reads.length, 6);
    }
    {
        const d = device({ fail: ['1F'] });
        const r = await d.ctx.run(bldg);
        assert.strictEqual(r.ok, false);
        assert.deepStrictEqual(Array.from(r.failed), ['1F'], '못 받은 층을 알려 준다');
        assert.deepStrictEqual(d.merged, ['B1', '2F'], '받은 층은 합친다');
        const again = await d.ctx.run(bldg);
        assert.strictEqual(again.skipped, null, '실패했으면 다음에 다시 시도한다(최근 표시 안 함)');
    }
    assert.strictEqual((await device({ offline: true }).ctx.run(bldg)).skipped, 'offline');
    assert.strictEqual((await device({ nodb: true }).ctx.run(bldg)).skipped, 'nologin');

    // 연결: 한글·PDF 보고서 만들기 전, 통계 탭에 들어올 때
    const hwpx = extractFunction(app, 'window.exportHwpxSurveyTable = async function(');
    assert.ok(/await ensureBuildingFloorsFreshForReport\(bldg, '한글 보고서'\)/.test(hwpx), '한글 보고서 전에 모든 층');
    const preview = extractFunction(app, 'window.openReportPreviewModalFunc = async function(');
    assert.ok(/ensureBuildingFloorsFreshForReport\(window\.state\.currentBuilding, 'PDF 보고서'\)/.test(preview), 'PDF 보고서 전에 모든 층');
    const pdf = extractFunction(app, 'window.exportPDF = async function(');
    assert.ok(/openReportPreviewModalFunc\(\{ skipLoading: true \}\)\)\s*===\s*false/.test(pdf), 'PDF에서 취소하면 멈춘다');
    const enter = stats.slice(stats.indexOf('enter: function () {'));
    assert.ok(/refreshStatsFloorsFromServer\(\);/.test(enter.slice(0, 800)), '통계 탭에 들어오면 모든 층을 받고 다시 그린다');

    console.log('test-refresh-all-floors: ok');
})().catch((e) => { console.error(e); process.exit(1); });
