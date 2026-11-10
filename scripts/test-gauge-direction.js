'use strict';
// 2026-11-10 「움직인 방향을 입력하는 키 — 게이지는 방향을 알려줘야 해서」
// 게이지 X·Y 값 맨 앞에 방향 글자(← → ↑ ↓). 셈: → · ↓ = +, ← · ↑ = − (방향 없는 예전 값은 그대로).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const cm = require(path.join(root, 'js', 'shared', 'hwpx-crack-monitor.js'));

const names = ['monitorDirectionOf', 'parseMonitorNumber', 'gaugeLogUsesDirection', 'formatMonitorDelta', 'formatGaugeDelta',
    'computeGaugeDeltas', 'computeGaugePrevDeltas', 'formatHwpxGaugeAxisCell'];
const reLine = app.match(/const MONITOR_DIR_RE = [^\n]+\n/)[0];
const f = new Function(reLine + names.map((n) => extractFunction(app, 'function ' + n + '(')).join('\n')
    + '\nreturn {' + names.join(',') + '};')();

// 셈
assert.strictEqual(f.parseMonitorNumber('1.5'), 1.5);
assert.strictEqual(f.parseMonitorNumber('-1.5'), -1.5, '예전 부호 값 그대로');
assert.strictEqual(f.parseMonitorNumber('→1.5'), 1.5);
assert.strictEqual(f.parseMonitorNumber('← 1.5'), -1.5);
assert.strictEqual(f.parseMonitorNumber('↓0.3'), 0.3);
assert.strictEqual(f.parseMonitorNumber('↑0.3'), -0.3);
assert.ok(Object.is(f.parseMonitorNumber('←0'), 0), '-0 아님');
assert.strictEqual(f.parseMonitorNumber('→'), null, '방향만 있으면 값 없음');
assert.strictEqual(f.parseMonitorNumber(''), null);
assert.strictEqual(f.parseMonitorNumber('abc'), null);
assert.strictEqual(f.monitorDirectionOf('↑0.3'), '↑');
assert.strictEqual(f.monitorDirectionOf('0.3'), '');

// 누적·전차 대비: 방향이 바뀌면 움직인 거리가 더해진다
const log = { initialX: '→1.0', initialY: '↓0.2', readings: [{ xMm: '→1.5', yMm: '↓0.2' }, { xMm: '←0.5', yMm: '↑0.3' }] };
assert.deepStrictEqual(f.computeGaugeDeltas(log, log.readings[1]), { dx: -1.5, dy: -0.5 });
assert.deepStrictEqual(f.computeGaugePrevDeltas(log, 1), { dx: -2, dy: -0.5 });
assert.strictEqual(f.formatGaugeDelta('x', -1.5, log), '←1.5');
assert.strictEqual(f.formatGaugeDelta('x', 0.5, log), '→0.5');
assert.strictEqual(f.formatGaugeDelta('y', -0.5, log), '↑0.5');
assert.strictEqual(f.formatGaugeDelta('y', 0.25, log), '↓0.25');
assert.strictEqual(f.formatGaugeDelta('y', 0, log), '0');
assert.strictEqual(f.formatGaugeDelta('x', null, log), '-');
// 방향을 안 쓴 예전 기록은 +/− 그대로. 축마다 따로 본다
const old = { initialX: '1.0', initialY: '0.2', readings: [{ xMm: '1.5', yMm: '↓0.4' }] };
assert.strictEqual(f.formatGaugeDelta('x', 0.5, old), '+0.5');
assert.strictEqual(f.formatGaugeDelta('x', -0.5, old), '-0.5');
assert.strictEqual(f.formatGaugeDelta('y', 0.2, old), '↓0.2');

// 한글 출력 칸: 방향을 적은 값은 그 방향 + 크기, 안 적은 값은 예전 규칙(Y ↓, X →/±)
assert.strictEqual(f.formatHwpxGaugeAxisCell('x', '←1.5', null, {}), '← 1.5');
assert.strictEqual(f.formatHwpxGaugeAxisCell('y', '↑0.3', null, {}), '↑ 0.3');
assert.strictEqual(f.formatHwpxGaugeAxisCell('y', '↓0.3', null, { isInitial: true }), '↓ 0.3');
assert.strictEqual(f.formatHwpxGaugeAxisCell('x', '1.5', null, {}), '→ 1.5', '예전 값 그대로');
assert.strictEqual(f.formatHwpxGaugeAxisCell('x', '-1.5', null, {}), '± 1.5', '예전 값 그대로');
assert.strictEqual(f.formatHwpxGaugeAxisCell('y', '-0.5', null, {}), '↓ -0.5', '예전 값 그대로');
assert.strictEqual(f.formatHwpxGaugeAxisCell('y', '', null, {}), '-');
assert.strictEqual(f.formatHwpxGaugeAxisCell('x', '←1.5', '→0.5', {}), '← 1.5 ←2', '전차와 다르면 달라진 크기');

// 한글 측정 표 모듈도 같은 셈(방향 값이 빈칸으로 빠지지 않는다)
const fmt = { gaugeAxis: f.formatHwpxGaugeAxisCell, tipLength: (v) => String(v || ''), header: () => 'G', typeLabel: () => '크랙모니터', date: (r) => r.date };
const slot = { kind: 'gauge', col: 1, gauge: { initialX: '→1.0', initialY: '↓0.2', readings: [{ date: '2026-10-05', xMm: '←0.5', yMm: '↑0.3' }] } };
const ch = cm.changeOf(slot);
assert.deepStrictEqual(ch.parts.map((p) => [p.axis, Math.round(p.value * 100) / 100]), [['y', 0.5], ['x', 1.5]], '변화량 = 초기값 − 금회, 방향은 부호');
const lay = cm.buildTableLayout([slot], fmt);
assert.ok(Object.keys(lay.cells).some((k) => lay.cells[k] === '↑ 0.3 / ← 0.5'), '측정 칸에 적은 방향 그대로');
assert.ok(Object.keys(lay.cells).some((k) => lay.cells[k] === '↓ 0.2 / → 1'), '초기값 칸');

console.log('test-gauge-direction: ok');
