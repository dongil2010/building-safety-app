'use strict';
// 2026-10-19 행·열 패널 「상세위치 전부 지우기」 → 2026-10-31 「상세위치 행·열 지우기」: 상세 위치 글자의 행·열만 지우고 실 이름·위치는 둔다.
// 확인창(개수)·되돌리기·대상 목록은 「실 이름 두고 행·열만 다시 계산」과 같게, 행·열 위치는 그대로,
// 칸 시각(location)으로 다른 기기의 옛 상세 위치보다 지우기가 이긴다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const G = require(path.join(root, 'js', 'shared', 'grid-lines.js'));

// 글자 규칙: 행·열만 빼고 나머지는 그대로
assert.strictEqual(G.stripGridTextFromDetail('X4~X5/Y1~Y2 계단실'), '계단실');
assert.strictEqual(G.stripGridTextFromDetail('계단실 X4/Y1, X5/Y2 앞'), '계단실 앞');
assert.strictEqual(G.stripGridTextFromDetail('X1-Y2'), '');
assert.strictEqual(G.stripGridTextFromDetail('복도(X3/Y1)'), '복도');
assert.strictEqual(G.stripGridTextFromDetail('x1/y2 거실'), '거실', '소문자도');
assert.strictEqual(G.stripGridTextFromDetail('기둥 C1 하부'), '기둥 C1 하부', '다른 머리글자는 그대로');
assert.strictEqual(G.stripGridTextFromDetail('MAX12 배관'), 'MAX12 배관', '낱말 속 글자는 그대로');
assert.strictEqual(G.stripGridTextFromDetail('A1/B2 거실', { prefixes: ['A', 'B'] }), '거실', '층에 정한 머리글자');
assert.strictEqual(G.stripGridTextFromDetail('1-2 거실', { known: ['1-2'] }), '거실', '그 결함의 행·열 값');
// 2026-11-18 짧은 표기(X1~2)·옛 표기와 새 표기가 겹쳐 적힌 글자 — 전에는 「~2」가 남았다
assert.strictEqual(G.stripGridTextFromDetail('X1~2/Y3~4 사무실'), '사무실', '짧은 범위 표기');
assert.strictEqual(G.stripGridTextFromDetail('X1~X2/Y1~Y2 X3~4/Y5~6 복도'), '복도', '두 표기가 겹친 글자');
assert.strictEqual(G.stripGridTextFromDetail('X1~2, Y3 복도'), '복도');
// 선에 직접 붙인 이름(광주글로벌모터스 차체공장: W1~W7 · WA~WG)
const wNames = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'WA', 'WB', 'WC', 'WD', 'WE', 'WF', 'WG'];
assert.strictEqual(G.stripGridTextFromDetail('W5~6/WC~D', { names: wNames }), '', '직접 붙인 이름·짧은 표기');
assert.strictEqual(G.stripGridTextFromDetail('W7~/WD~WC 기둥 C1', { names: wNames }), '기둥 C1', '열린 범위, 다른 글은 그대로');
assert.strictEqual(G.stripGridTextFromDetail('~W1/WA~B 출입구', { names: wNames }), '출입구');
assert.strictEqual(G.stripGridTextFromDetail('W4~5/WA 창고', { names: wNames }), '창고');
assert.strictEqual(G.stripGridTextFromDetail('WALL 균열', { names: wNames }), 'WALL 균열', '낱말 속 이름은 그대로');
assert.strictEqual(G.stripGridTextFromDetail('~C', { names: wNames }), '', '짧은 열린 범위(NO.49)');
assert.strictEqual(G.stripGridTextFromDetail('기둥 C 하부', { names: wNames }), '기둥 C 하부', '~ 없는 짧은 글자는 그대로');

function makeCtx(opts) {
    const calls = [];
    const ctx = {
        calls,
        state: { currentFloor: opts.floor || '1F' },
        composeDefectLocation: (detail, fc) => (opts.grade3 ? ((detail ? `지상1층 ${detail}` : '지상1층')) : (detail || '')),
        gridLib: () => G,
        getFloorMapStyleKey: (b, f) => `${b}_${f}`,
        migrateLegacyGridLocation: (d) => { d.gridLoc = d.gridLoc || 'X1-Y1'; d.location = opts.grade3 ? '지상1층 실' : '실'; delete d.gridLocAuto; return true; },
        filterMapPlacedDefects: (list) => list.filter((d) => d.x != null),
        getCurrentFloorDefects: () => opts.defects,
        pushDefectHistory: () => calls.push('history'),
        touchDefectUpdatedAt: (d) => calls.push('touch:' + d.id),
        afterGridBulkChange: (msg) => calls.push('done:' + msg),
        window: {
            appConfirm: async (msg) => { calls.push('confirm:' + msg); return opts.confirm !== false; },
            showToast: (msg) => calls.push('toast:' + msg)
        }
    };
    vm.createContext(ctx);
    vm.runInContext([
        extractFunction(app, 'function locationWithoutGridText('),
        extractFunction(app, 'function defectHasGridTextInDetail('),
        extractFunction(app, 'function clearDefectDetailLocation('),
        extractFunction(app, 'async function clearDetailLocationForCurrentFloor('),
        'this.run = clearDetailLocationForCurrentFloor;'
    ].join('\n'), ctx);
    return ctx;
}

(async () => {
    // 1·2종: 행·열 글자만 지우고 실 이름·행·열 위치 칸은 그대로, 도면에 없는 마킹은 건드리지 않는다
    {
        const defects = [
            { id: 'a', x: 1, location: '계단실 X1-Y2', gridLoc: 'X1-Y2' },
            { id: 'b', x: 2, location: '', gridLoc: 'X2-Y2' },
            { id: 'c', x: 3, location: 'X3/Y1 복도 끝' },
            { id: 'd', x: 4, location: '기둥 C1 하부' },
            { id: 'z', location: 'X9/Y9 도면에 없음' }
        ];
        const ctx = makeCtx({ defects });
        await ctx.run();
        assert.deepStrictEqual(defects.map((d) => d.location), ['계단실', '', '복도 끝', '기둥 C1 하부', 'X9/Y9 도면에 없음']);
        assert.strictEqual(defects[0].gridLoc, 'X1-Y2', '행·열 위치 유지');
        const confirm = ctx.calls.find((c) => c.startsWith('confirm:'));
        assert.ok(/마킹 4개 중 상세 위치에 행·열이 적힌 2개/.test(confirm), confirm);
        assert.ok(/되돌리기/.test(confirm));
        const hi = ctx.calls.indexOf('history');
        assert.ok(hi >= 0 && hi < ctx.calls.indexOf('touch:a'), '되돌리기 기록 먼저');
        assert.deepStrictEqual(ctx.calls.filter((c) => c.startsWith('touch:')), ['touch:a', 'touch:c'], '바뀐 것만 칸 시각');
        assert.ok(ctx.calls.some((c) => c === 'done:마킹 2개의 상세 위치에서 행·열을 지웠습니다.'));
    }
    // 취소하면 아무것도 안 바뀐다
    {
        const defects = [{ id: 'a', x: 1, location: 'X1/Y1 계단실' }];
        const ctx = makeCtx({ defects, confirm: false });
        await ctx.run();
        assert.strictEqual(defects[0].location, 'X1/Y1 계단실');
        assert.ok(!ctx.calls.includes('history') && !ctx.calls.some((c) => c.startsWith('touch:')));
    }
    // 지울 게 없으면 확인창 없이 안내
    {
        const ctx = makeCtx({ defects: [{ id: 'a', x: 1, location: '계단실' }] });
        await ctx.run();
        assert.ok(!ctx.calls.some((c) => c.startsWith('confirm:')) && ctx.calls.includes('toast:상세 위치에 지울 행·열이 없습니다.'));
    }
    // 3종: 층 이름 유지 / 예전 실험 데이터는 행·열 위치로 옮긴다
    {
        const defects = [
            { id: 'a', x: 1, location: '지상1층 X1/Y2 정면 창호', gridLoc: 'X1/Y2' },
            { id: 'b', x: 2, location: '지상1층' },
            { id: 'c', x: 3, location: '지상1층 X3-Y1 실', gridLocAuto: 'X3-Y1' }
        ];
        const ctx = makeCtx({ defects, grade3: true });
        await ctx.run();
        assert.deepStrictEqual(defects.map((d) => d.location), ['지상1층 정면 창호', '지상1층', '지상1층 실']);
        assert.strictEqual(defects[2].gridLoc, 'X1-Y1');
        assert.ok(!('gridLocAuto' in defects[2]));
    }

    // 연결: 행·열 패널 버튼 · 클릭 처리 · 같은 대상 목록
    assert.ok(/<button type="button" data-act="clearDetail" class="danger"[^>]*>상세위치 행·열 지우기<\/button>/.test(app) && app.includes('data-act="recalcGrid"'), '「지우기」 묶음의 버튼(2026-11-04 패널 정리: 다시 계산은 「마킹 위치」 묶음)');
    assert.ok(/if \(act === 'clearDetail'\) \{\n\s*clearDetailLocationForCurrentFloor\(\);/.test(app));
    const reset = extractFunction(app, 'async function recalcGridLocationForCurrentFloor(');
    const clear = extractFunction(app, 'async function clearDetailLocationForCurrentFloor(');
    const listExpr = 'const list = filterMapPlacedDefects(getCurrentFloorDefects());';
    assert.ok(reset.includes(listExpr) && clear.includes(listExpr), '다시 채우기와 같은 대상');
    assert.ok(clear.includes('pushDefectHistory()') && clear.includes('touchDefectUpdatedAt(d)') && clear.includes('afterGridBulkChange('));

    // 동기화: 칸별 병합에서 나중에 지운 상세 위치가 옛 값을 이긴다(다른 칸은 각자 시각대로)
    const sm = require(path.join(root, 'js', 'core', 'sync-merge.js'));
    const base = { id: 'a', contentBaseAt: 500 };
    const local = { ...base, location: '', component: '보', updatedAt: 2000, fieldAt: { location: 2000 }, fieldAtThrough: 2000 };
    const server = { ...base, location: '옛 위치', component: '기둥', updatedAt: 1500, fieldAt: { location: 1000, component: 1500 }, fieldAtThrough: 1500 };
    const m = sm.mergeDefectRecord(server, local, {});
    assert.strictEqual(m.location, '', '지우기가 이긴다');
    assert.strictEqual(m.component, '기둥', '다른 기기가 나중에 고친 다른 칸은 그대로');
    const later = { ...server, location: '새로 적음', updatedAt: 3000, fieldAt: { location: 3000, component: 1500 }, fieldAtThrough: 3000 };
    assert.strictEqual(sm.mergeDefectRecord(later, local, {}).location, '새로 적음', '지운 뒤 다시 적은 것은 그것대로');
    console.log('test-grid-clear-detail-location: ok');
})().catch((e) => { console.error(e); process.exit(1); });
