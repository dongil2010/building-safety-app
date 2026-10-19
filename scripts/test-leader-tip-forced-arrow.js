'use strict';
// 2026-10-19 「지시선 동그라미가 기본인데 방향 지정 했으면 화살표로」
// 기본(동그라미)이어도 그 지시선에 화살표 방향 지정(forceArrowDir)을 했으면 화살촉. 화면·보고서/PDF/한글 그림·벡터 PDF 같게.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const ctx = { state: { tipShape: 'circle' } };
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function leaderTipIsCircle(') + '\nthis.f = leaderTipIsCircle;', ctx);

assert.strictEqual(ctx.f({ enabled: false }), true, '기본 동그라미');
assert.strictEqual(ctx.f(null), true);
assert.strictEqual(ctx.f({ enabled: true, octant: 2 }), false, '방향 지정 → 화살표');
ctx.state.tipShape = 'arrow';
assert.strictEqual(ctx.f({ enabled: false }), false, '화살표를 고른 기기는 모두 화살표');
assert.strictEqual(ctx.f({ enabled: true }), false);

// 결함 마킹을 그리는 세 곳(화면 drawPinBody · 보고서/PDF/한글 drawPinSafe · 벡터 PDF buildVectorPinDrawPlan)
const sites = [
    { name: '화면', re: /const forcedDir = tipIsArea \? \{ enabled: false \} : resolveForcedArrowDirection\(t, defect, state\.rotationAngle \|\| 0\);\n\s*const tipCircle = useCircleTip && leaderTipIsCircle\(forcedDir\);\n\s*const stemInset = tipCircle/ },
    { name: '보고서', re: /resolveForcedArrowDirection\(t, defect, floorRotSafe\);\n\s*const tipCircleSafe = useCircleTipSafe && leaderTipIsCircle\(forcedDir\);\n\s*const stemInset = tipCircleSafe/ },
    { name: '벡터 PDF', re: /resolveForcedArrowDirection\(t, defect, floorRot\);\n\s*const tipCircle = useCircleTip && leaderTipIsCircle\(forcedDir\);\n\s*const stemInset = tipCircle/ }
];
sites.forEach((s) => assert.ok(s.re.test(app), s.name));
assert.strictEqual((app.match(/&& leaderTipIsCircle\(forcedDir\)/g) || []).length, 3);
assert.ok(/ctx\.fillStyle = lineColor;\n\s*if \(tipCircle\) \{/.test(app), '화면 끝 모양');
assert.ok(/ctx\.fillStyle = color;\n\s*if \(tipCircleSafe\) \{/.test(app), '보고서 끝 모양');
assert.ok(/headLen,\n\s*useCircleTip: tipCircle,/.test(app), '벡터 PDF는 지시선마다');
const bridge = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
assert.ok(/if \(L\.useCircleTip\) \{/.test(bridge), '벡터 PDF는 지시선별 값으로 그린다');
// 옛 방식(지시선마다가 아니라 기기 설정만 보고 그리기)이 남지 않음
const pinSafe = extractFunction(app, 'function drawPinSafe(');
assert.ok(!/if \(useCircleTipSafe\) \{/.test(pinSafe));
console.log('test-leader-tip-forced-arrow: ok');
