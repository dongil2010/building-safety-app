'use strict';
// 2026-11-28 비파괴 번호: 지우면 뒤 번호 당기기 / 결과표 번호순 정렬 / 출력 번호표(동 이어 붙임, 외벽기울기는 동마다 1부터)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const load = (names, pre) => {
    const src = (pre || '') + names.map((n) => extractFunction(app, `function ${n}(`)).join('\n')
        + `\nreturn { ${names.join(', ')} };`;
    return new Function(src)();
};

// ---- 지우면 당기기 ----
const P = load(['ndtNumberWithMain', 'ndtNumberMain', 'planNdtPullAfterDelete']);
const pool = (nos) => nos.map((no, i) => ({ key: i < 3 ? 'b_1F' : 'b_2F', rec: { id: 'r' + no, no } }));
let ch = P.planNdtPullAfterDelete(pool(['NO.01', 'NO.02', 'NO.04', 'NO.05', 'NO.06', 'NO.07']), ['NO.03'], 'no');
assert.deepStrictEqual(ch.map((c) => c.from + '>' + c.to), ['NO.04>NO.03', 'NO.05>NO.04', 'NO.06>NO.05', 'NO.07>NO.06']);
assert.strictEqual(ch[2].key, 'b_2F', '다른 층도 같이 당김');
ch = P.planNdtPullAfterDelete(pool(['NO.01', 'NO.04', 'NO.05']), ['NO.02', 'NO.03'], 'no');
assert.deepStrictEqual(ch.map((c) => c.to), ['NO.02', 'NO.03'], '여러 개 지우면 그만큼');
assert.deepStrictEqual(P.planNdtPullAfterDelete(pool(['NO.01', 'NO.03', 'NO.04']), ['NO.03'], 'no'), [], '겹친 번호를 지운 건 당기지 않음');
assert.deepStrictEqual(P.planNdtPullAfterDelete(pool(['NO.01', 'NO.02']), ['NO.03'], 'no'), [], '마지막 번호를 지우면 그대로');
ch = P.planNdtPullAfterDelete([{ key: 'k', rec: { id: 'g', groupNo: 'NO.05-1' } }], ['NO.02'], 'groupNo');
assert.deepStrictEqual(ch.map((c) => c.to), ['NO.04-1'], '꼬리 유지');

// ---- 정렬 ----
const S = load(['sortNdtItemsByNo']);
const sorted = S.sortNdtItemsByNo([
    { id: 'a', no: 'NO.03', _ndtFloorCode: '1F' }, { id: 'b', no: 'NO.01', _ndtFloorCode: '1F' },
    { id: 'c', no: 'NO.04', _ndtFloorCode: '2F' }, { id: 'd', no: 'NO.02', _ndtFloorCode: '2F' }
]);
assert.deepStrictEqual(sorted.map((x) => x.id), ['b', 'a', 'd', 'c'], '층 순서 유지, 층 안에서 번호순');

// ---- 출력 번호표 ----
const O = load(['sortNdtItemsByNo', 'hwpxNoRestartPerDong', 'buildNdtOutputNoMap'], "const HWPX_DONG_FC_SEP = '@@';\n");
const it = (id, cat, no, fc, extra) => Object.assign({ id, category: cat, no, _ndtFloorCode: fc }, extra || {});
const map = O.buildNdtOutputNoMap([
    it('m1', '실측', 'NO.02', '1F@@0'), it('m2', '실측', 'NO.01', '1F@@0'), it('m3', '실측', 'NO.01', '1F@@1'),
    it('t1', '기울기', 'NO.01', 'EXT@@0'), it('t2', '기울기', 'NO.02', 'EXT@@0'), it('t3', '기울기', 'NO.01', 'EXT@@1'),
    it('s1', '강도', 'NO.01', '1F@@0', { strengthSlots: [{}, {}] }), it('s2', '강도', 'NO.01', '1F@@1')
], [{ id: 'g1' }, { id: 'g2', category: '부재변위' }, { id: 'g3', category: '변위' }]);
assert.strictEqual(map.get('m2'), 'NO.01');
assert.strictEqual(map.get('m1'), 'NO.02');
assert.strictEqual(map.get('m3'), 'NO.03', '다음 동은 이어서');
assert.strictEqual(map.get('t3'), 'NO.01', '외벽기울기는 동마다 1부터');
assert.strictEqual(map.get('s2'), 'NO.03', '강도는 위치 슬롯마다 한 행');
assert.strictEqual(map.get('g3'), 'NO.02');
assert.strictEqual(map.get('g2'), 'NO.01');

console.log('test-ndt-number-pull-output: ok');
