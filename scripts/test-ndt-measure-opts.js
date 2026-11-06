'use strict';
// 2026-10-19 부재실측 — 「이쪽만 측정」 토글, 보 슬래브 두께 합산, 단면적(mm²)은 앱 화면에서만(한글 출력 제외)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const mo = require(path.join(root, 'js', 'core', 'ndt-measure-opts.js'));

function testModule() {
    assert.ok(mo.supportsOneSide('beam') && mo.supportsOneSide('column'));
    assert.ok(!mo.supportsOneSide('thickness') && !mo.supportsOneSide('steel') && !mo.supportsOneSide('circle'));
    assert.ok(mo.supportsSlab('beam') && !mo.supportsSlab('column'));
    assert.strictEqual(mo.normOneSide('thickness', 'primary'), null, '두께 부재는 토글 없음');

    // 양쪽 측정 + 슬래브 합산: 춤 = 실측 450 + 슬래브 150
    const both = mo.resolveRc({ kind: 'beam', designW: 400, designD: 600, rawW: '405', rawD: '450', slabOn: true, slab: '150' });
    assert.deepStrictEqual([both.storeW, both.storeD, both.calcW, both.calcD, both.slab, both.depthBelowSlab], [405, 600, 405, 600, 150, 450]);
    // 슬래브 토글 꺼짐 → 그대로
    const off = mo.resolveRc({ kind: 'beam', designW: 400, designD: 600, rawW: 405, rawD: 590, slabOn: false, slab: 150 });
    assert.deepStrictEqual([off.storeD, off.slab], [590, null]);
    // 기둥엔 슬래브 없음
    assert.strictEqual(mo.resolveRc({ kind: 'column', rawW: 500, rawD: 500, slabOn: true, slab: 150 }).storeD, 500);
    // 폭만 측정: 춤은 저장 안 하고 계산은 설계치수
    const p = mo.resolveRc({ kind: 'beam', designW: 400, designD: 600, rawW: 390, rawD: 999, oneSide: 'primary' });
    assert.deepStrictEqual([p.oneSide, p.storeW, p.storeD, p.calcW, p.calcD], ['primary', 390, null, 390, 600]);
    // 춤만 측정 + 슬래브
    const s = mo.resolveRc({ kind: 'beam', designW: 400, designD: 600, rawW: 1, rawD: 440, oneSide: 'secondary', slabOn: true, slab: 150 });
    assert.deepStrictEqual([s.storeW, s.storeD, s.calcW, s.calcD], [null, 590, 400, 590]);

    assert.deepStrictEqual(mo.measuredForCalc({ measureOneSide: 'primary', measuredWidth: 390, designDepth: 600 }, 'beam'), { w: 390, d: 600 });
    assert.strictEqual(mo.oneSideNote({ measureOneSide: 'primary' }, 'beam'), '폭만 측정');
    assert.strictEqual(mo.oneSideNote({ measureOneSide: 'secondary' }, 'column'), '측면만 측정');
    assert.strictEqual(mo.oneSideNote({ measureOneSide: 'primary' }, 'thickness'), '');
    assert.strictEqual(mo.slabNote({ slabThickness: 150 }, 'beam'), '슬래브 150 포함');
    assert.strictEqual(mo.depthInputValue({ slabThickness: 150, measuredDepthBelowSlab: 450, measuredDepth: 600 }), 450, '다시 열면 슬래브 아래 춤');
    assert.strictEqual(mo.depthInputValue({ slabThickness: 150, measuredDepth: 600 }), 450);

    assert.ok(mo.supportsExcludeSlab('beam') && mo.supportsExcludeInsulation('beam') && !mo.supportsExcludeWall('beam'));
    assert.ok(mo.supportsExcludeWall('column') && mo.supportsExcludeWall('circle'));
    assert.ok(!mo.supportsExcludeSlab('column') && !mo.supportsExcludeInsulation('circle'));

    // 체크만(mm 없음): 실측값 그대로, 주석만
    const flagOnly = mo.resolveRc({ kind: 'beam', designW: 400, designD: 600, rawW: 405, rawD: 590, excludeSlabOn: true });
    assert.deepStrictEqual([flagOnly.storeD, flagOnly.excludeSlabOn, flagOnly.excludeSlabMm], [590, true, null]);
    assert.strictEqual(mo.excludeNote({ excludeSlab: true }, 'beam'), '슬래브 두께 제외');

    // mm 있으면 춤에서 빼고, 다시 열면 입력값
    const beamEx = mo.resolveRc({ kind: 'beam', designW: 400, designD: 600, rawW: 405, rawD: 590, excludeSlabOn: true, excludeSlabMm: 120 });
    assert.deepStrictEqual([beamEx.storeD, beamEx.rawD, beamEx.excludeSlabMm], [470, 590, 120]);
    const again = mo.resolveRc({
        kind: 'beam', designW: 400, designD: 600, rawW: mo.depthInputValue({
            measuredDepth: beamEx.storeD, measuredDepthRaw: beamEx.rawD, excludeSlab: true, excludeSlabThickness: 120
        }), rawD: mo.depthInputValue({
            measuredDepth: beamEx.storeD, measuredDepthRaw: beamEx.rawD, excludeSlab: true, excludeSlabThickness: 120
        }), excludeSlabOn: true, excludeSlabMm: 120
    });
    assert.strictEqual(again.storeD, 470, '다시 저장해도 두 번 빼지 않음');
    assert.strictEqual(mo.depthInputValue({
        measuredDepth: 470, measuredDepthRaw: 590, excludeSlab: true, excludeSlabThickness: 120
    }), 590);
    assert.strictEqual(mo.excludeNote({ excludeSlab: true, excludeSlabThickness: 120 }, 'beam'), '슬래브 120 제외');

    const bothEx = mo.resolveRc({
        kind: 'beam', rawW: 400, rawD: 600, excludeSlabOn: true, excludeSlabMm: 100,
        excludeInsulationOn: true, excludeInsulationMm: 50
    });
    assert.strictEqual(bothEx.storeD, 450);

    // 합산과 슬래브 제외는 같이 못 켬 — 합산이 이김
    const mutex = mo.resolveRc({ kind: 'beam', rawW: 400, rawD: 450, slabOn: true, slab: 150, excludeSlabOn: true, excludeSlabMm: 80 });
    assert.strictEqual(mutex.slab, 150);
    assert.strictEqual(mutex.excludeSlabOn, false);
    assert.strictEqual(mutex.storeD, 600);

    const col = mo.resolveRc({ kind: 'column', rawW: 500, rawD: 600, excludeWallOn: true, excludeWallMm: 40 });
    assert.deepStrictEqual([col.storeW, col.storeD, col.rawW], [460, 600, 500]);
    assert.strictEqual(mo.widthInputValue({
        measuredWidth: 460, measuredWidthRaw: 500, excludeWall: true, excludeWallThickness: 40
    }), 500);
    const colAgain = mo.resolveRc({
        kind: 'column', rawW: mo.widthInputValue({
            measuredWidth: 460, measuredWidthRaw: 500, excludeWall: true, excludeWallThickness: 40
        }), rawD: 600, excludeWallOn: true, excludeWallMm: 40
    });
    assert.strictEqual(colAgain.storeW, 460, '기둥 폭 두 번 빼지 않음');

    const circ = mo.resolveRc({ kind: 'circle', rawW: 600, excludeWallOn: true, excludeWallMm: 20 });
    assert.strictEqual(circ.storeW, 580);
    const circFlag = mo.resolveRc({ kind: 'circle', rawW: 600, excludeWallOn: true });
    assert.strictEqual(circFlag.storeW, 600);
    assert.strictEqual(mo.excludeNote({ excludeWall: true }, 'circle'), '벽체 두께 제외');
}

function loadFormat() {
    const ctx = { isNdtSteelComponent: (t) => /철골|H형/.test(t), window: { BSA: { ndtMeasureOpts: mo } } };
    vm.createContext(ctx);
    vm.runInContext([
        'getNdtMeasureDimKind', 'calcSteelSectionArea', 'resolveNdtSteelMeasuredDims', 'resolveNdtSteelMeasuredFromItem',
        'formatNdtSteelDimText', 'formatNdtMeasureDimText', 'calcNdtMeasureSectionArea', 'formatNdtMeasureAreaText',
        'formatNdtMeasureNotes', 'formatNdtMeasureDimWithArea', 'formatNdtMeasureDimForOutput'
    ].map((n) => extractFunction(app, 'function ' + n + '(')).join('\n')
        + '\nthis.screen = formatNdtMeasureDimWithArea; this.out = formatNdtMeasureDimForOutput; this.area = calcNdtMeasureSectionArea;', ctx);
    return ctx;
}

function testFormat() {
    const c = loadFormat();
    const col = { component: '기둥', designWidth: 700, designDepth: 800, measuredWidth: 710, measuredDepth: 810 };
    assert.strictEqual(c.out(col, 'design', '×'), '700×800', '한글 출력엔 단면적 없음');
    assert.strictEqual(c.out(col, 'measured', '×'), '710×810');
    assert.strictEqual(c.screen(col, 'measured', '×'), '710×810\n(575,100mm²)', '앱 화면엔 단면적');

    const beamP = { component: '보', designWidth: 400, designDepth: 600, measuredWidth: 390, measuredDepth: null, measureOneSide: 'primary' };
    assert.strictEqual(c.out(beamP, 'measured', '×'), '390×-\n(폭만 측정)');
    assert.strictEqual(c.area(beamP, 'measured'), 390 * 600, '안 잰 춤은 설계치수로 면적');
    assert.strictEqual(c.screen(beamP, 'measured', ' × ', '<br>'), '390 × -<br>(234,000mm²)<br>(폭만 측정)');

    const beamSlab = { component: '보', designWidth: 400, designDepth: 600, measuredWidth: 405, measuredDepth: 600, slabThickness: 150, measuredDepthBelowSlab: 450 };
    assert.strictEqual(c.out(beamSlab, 'measured', '×'), '405×600', '합산 춤으로 출력');
    assert.ok(/슬래브 150 포함/.test(c.screen(beamSlab, 'measured', '×')), '앱 화면엔 슬래브 합산 표시');

    const beamExOut = {
        component: '보', designWidth: 400, designDepth: 600, measuredWidth: 405, measuredDepth: 470,
        excludeSlab: true, excludeSlabThickness: 120, measuredDepthRaw: 590
    };
    assert.strictEqual(c.out(beamExOut, 'measured', '×'), '405×470\n(슬래브 120 제외)', '출력 칸에 제외 주석·빼 둔 춤');
    const colExOut = {
        component: '기둥', measureDimMode: 'column', designWidth: 500, designDepth: 600,
        measuredWidth: 460, measuredDepth: 600, excludeWall: true, excludeWallThickness: 40, measuredWidthRaw: 500
    };
    assert.ok(/벽체 40 제외/.test(c.out(colExOut, 'measured', '×')));
}

function testWiring() {
    assert.strictEqual((app.match(/formatNdtMeasureDimWithArea\(/g) || []).length, 3, '정의 1 + 앱 결과표(설계·실측) 2 — 한글·보고서엔 없음');
    assert.ok(/id="ndtMeasureOptsRow"|ndtMeasureOptsRow/.test(app), '토글 줄');
    assert.ok(/ndtSlabThickness/.test(app), '슬래브 두께 칸');
    assert.ok(/measureOneSide/.test(extractFunction(app, 'function resolveNdtMeasureOptsFromForm(')) || /resolveRc\(/.test(extractFunction(app, 'function resolveNdtMeasureOptsFromForm(')));
    assert.ok(/slabThickness/.test(app) && /measuredDepthBelowSlab/.test(app), '저장 필드');
    assert.ok(/excludeSlab/.test(app) && /excludeInsulation/.test(app) && /excludeWall/.test(app));
    assert.ok(/ndtExcludeSlabMm/.test(app) && /ndtExcludeWallMm/.test(app));
    assert.ok(!/keypad.?dock|measure-keypad-dock/i.test(extractFunction(app, 'function ensureNdtMeasureOptsRow(')), '키패드 도킹 변경 없음');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/js\/core\/ndt-measure-opts\.js\?v=/.test(html));
    assert.ok(html.indexOf('js/core/ndt-measure-opts.js') < html.indexOf('src="app.js'));
}

[testModule, testFormat, testWiring].forEach((t) => { t(); console.log('ok -', t.name); });
console.log('test-ndt-measure-opts: ok');
