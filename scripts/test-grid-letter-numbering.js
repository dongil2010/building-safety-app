/**
 * 행·열 선 번호 방식(2026-09-30): 숫자(예전 그대로) / 대문자 A,B,C / 소문자 a,b,c (z 다음 aa).
 * 위치 자동 입력·다른 층 복사·구역·지문·패널 연결 확인. 숫자 그룹은 데이터 모양·지문이 예전과 같아야 함.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const W = 4000; const H = 3000; const ctx = { rot: 0, w: W, h: H };
const vline = (x) => ({ id: `v${x}`, pts: [{ x, y: 0 }, { x, y: H }] });
const hline = (y) => ({ id: `h${y}`, pts: [{ x: 0, y }, { x: W, y }] });

// 글자 이어짐
assert.deepStrictEqual([1, 2, 26, 27, 28, 52, 53, 702, 703].map((n) => G.seqToLetters(n, true)), ['a', 'b', 'z', 'aa', 'ab', 'az', 'ba', 'zz', 'aaa']);
assert.strictEqual(G.seqToLetters(27, false), 'AA');
assert.strictEqual(G.groupSeqLabel({ prefix: 'X', numbering: 'lower' }, 3), 'Xc');
assert.strictEqual(G.groupSeqLabel({ prefix: 'X' }, 3), 'X3');

// 예전 데이터 그대로: 숫자 그룹엔 numbering 키 없음, 지문 같음
const oldRaw = { groups: [{ id: 'g1', axis: 'col', prefix: 'X', start: 1, angle: 0, band: 20, lines: [vline(1000), vline(2000)] }] };
const oldNorm = G.normalizeGrid(oldRaw);
assert.ok(!('numbering' in oldNorm.groups[0]));
assert.ok(!('numbering' in G.createGroup('col', { numbering: 'num' })));
assert.strictEqual(G.gridSignature(oldRaw), G.gridSignature(JSON.parse(JSON.stringify(oldNorm))));
const lowerRaw = JSON.parse(JSON.stringify(oldRaw)); lowerRaw.groups[0].numbering = 'lower';
assert.notStrictEqual(G.gridSignature(lowerRaw), G.gridSignature(oldRaw), '번호 방식 바꾸면 위치 다시 계산');
assert.strictEqual(G.normalizeGrid({ groups: [{ axis: 'row', numbering: 'weird', lines: [] }] }).groups[0].numbering, undefined);

// 위치 자동 입력: 열 1,2,3 / 행 a,b
const g = G.normalizeGrid({ groups: [
    G.createGroup('col', { prefix: '', band: 20, lines: [vline(1000), vline(2000), vline(3000)] }),
    G.createGroup('row', { prefix: '', numbering: 'lower', band: 20, lines: [hline(500), hline(1500)] })
] });
assert.strictEqual(G.computeGridLocation(g, [{ x: 1500, y: 1000 }], ctx), '1~2/a~b');
assert.strictEqual(G.computeGridLocation(g, [{ x: 2005, y: 1495 }], ctx), '2/b');
assert.strictEqual(G.computeGridLocation(g, [{ x: 1500, y: 100 }], ctx), '1~2/~a');
// 많은 선: 27번째 = aa
const many = G.normalizeGrid({ groups: [G.createGroup('row', { prefix: '', numbering: 'lower', band: 2, lines: Array.from({ length: 28 }, (_, i) => hline(50 + i * 100)) })] });
const names = G.orderedLines(many.groups[0], ctx).items.map((it) => it.name);
assert.deepStrictEqual([names[0], names[25], names[26], names[27]], ['a', 'z', 'aa', 'ab']);
// 시작 번호 3 = c, 대문자 머리글
const up = G.normalizeGrid({ groups: [G.createGroup('col', { prefix: 'W', numbering: 'upper', start: 3, band: 20, lines: [vline(1000), vline(2000)] })] });
assert.deepStrictEqual(G.orderedLines(up.groups[0], ctx).items.map((it) => it.name), ['WC', 'WD']);
// 선 이름을 직접 쓰면 그 이름
const lab = G.normalizeGrid({ groups: [G.createGroup('col', { prefix: '', numbering: 'lower', lines: [Object.assign(vline(1000), { label: 'k' })] })] });
assert.strictEqual(G.orderedLines(lab.groups[0], ctx).items[0].name, 'k');

// 다른 층 복사: 번호 방식 따라감
const cl = G.cloneGridForFloor(g, {});
assert.strictEqual(cl.groups[1].numbering, 'lower');
assert.ok(!('numbering' in cl.groups[0]));

// 구역마다 따로: 구역 그룹도 1부터 a
const zg = G.normalizeGrid({
    zones: [{ id: 'z1', name: '2층', rect: { x1: 2500, y1: 0, x2: 4000, y2: 3000 } }],
    groups: [
        G.createGroup('row', { prefix: '', numbering: 'lower', band: 20, lines: [hline(500), hline(1500)] }),
        G.createGroup('row', { prefix: '', numbering: 'lower', band: 20, zoneId: 'z1', lines: [hline(800), hline(1800)] })
    ]
});
assert.strictEqual(G.computeGridLocation(zg, [{ x: 3000, y: 805 }], ctx), 'a');
assert.strictEqual(G.computeGridLocation(zg, [{ x: 1000, y: 1505 }], ctx), 'b');

// 패널·이름 목록·새 구역 그룹 연결
assert.ok(app.includes('<select data-f="numbering"') && app.includes('>소문자 a, b, c</option>'));
assert.ok(app.includes("case 'numbering': {"));
assert.ok(app.includes('G.groupSeqLabel(g, g.start)'), '그룹 목록 이름');
const ens = app.slice(app.indexOf('function gridEnsureGroup('), app.indexOf('function gridAddLineAt('));
assert.ok(ens.includes('numbering: tpl.numbering, prefix: tpl.prefix'), '새 구역 그룹이 글자 번호 이어받음');
assert.ok(G.gridLocTextEm('a~b') > 0);
console.log('test-grid-letter-numbering: ok');
