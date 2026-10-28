#!/usr/bin/env node
'use strict';

/**
 * 변위(부동침하·부재변위·외벽 기울기)의 m / mm / cm 단위.
 *
 * 2026-10-28 사용자 제보: "42.5미터에 변위 35미리면 1/1210쯤(a등급)인데 앱은 1/121로 나온다."
 * 원인: 구역(부동침하·부재변위)의 레벨값을 cm로 읽는데 입력칸 라벨은 "mm"여서 10배 틀어졌다.
 * 정정: 새 구역은 levelUnit:'mm', levelUnit이 없는 옛 구역은 예전대로 cm(저장된 숫자를 임의로 바꾸지 않음).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const grade = require(path.join(root, 'js', 'core', 'ndt-grade.js'));
const stats = require(path.join(root, 'js', 'tabs', 'stats.js'));
const { extractFunction } = require('./lib-extract-fn');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const settle = (extra) => Object.assign({ category: '변위', measureLength: 42.5, points: [{ level: 0 }, { level: 35 }] }, extra);

// 1) 제보 그대로: 높이 42.5m, 변위 35mm → 1/1214 a등급 (새 구역 = mm)
(function reportedCase() {
    const r = grade.calcGroupDisplacement(settle({ levelUnit: 'mm' }));
    assert.strictEqual(r.tiltRatio, '1/1214');
    assert.strictEqual(r.grade, 'a등급');
    assert.strictEqual(r.unit, 'mm');
    assert.strictEqual(r.absDeltaMm, 35);
    // 외벽 기울기 경로(높이·변위 모두 mm)는 처음부터 같은 값
    assert.strictEqual(grade.calcTiltGrade(42500, 35).tiltRatio, '1/1214');
    assert.strictEqual(grade.calcTiltGrade(42500, 35).grade, 'a등급');
})();

// 2) 단위 표기가 없는 옛 구역은 예전과 똑같이 cm로 읽는다(저장 숫자 보존)
(function legacyGroupsKeepCmMeaning() {
    const legacy = grade.calcGroupDisplacement(settle());
    assert.strictEqual(legacy.unit, 'cm');
    assert.strictEqual(legacy.tiltRatio, '1/121');
    assert.strictEqual(legacy.grade, 'e등급');
    assert.strictEqual(legacy.absDelta, 35, '표시용 delta는 구역 단위 그대로');
    assert.strictEqual(legacy.absDeltaMm, 350);
    // 같은 현장값을 cm로 적은 옛 구역(3.5cm = 35mm)은 정상
    const legacy35 = grade.calcGroupDisplacement(settle({ points: [{ level: 0 }, { level: 3.5 }] }));
    assert.strictEqual(legacy35.tiltRatio, '1/1214');
    assert.strictEqual(legacy35.grade, 'a등급');
    // 구역 편집에서 cm를 고른 구역도 같다
    const cm = grade.calcGroupDisplacement(settle({ levelUnit: 'cm', points: [{ level: 0 }, { level: 3.5 }] }));
    assert.strictEqual(cm.tiltRatio, '1/1214');
    assert.strictEqual(grade.levelUnitOf({}), 'cm');
    assert.strictEqual(grade.levelUnitOf({ levelUnit: 'mm' }), 'mm');
    assert.strictEqual(grade.levelUnitOf(null), 'cm');
})();

// 3) 다른 조합: 10m·20mm = 1/500 b, 부재변위 L=6m·처짐 12mm = 1/500 a
(function otherCombos() {
    const a = grade.calcGroupDisplacement({ category: '변위', measureLength: 10, levelUnit: 'mm', points: [{ level: 20 }, { level: 0 }] });
    assert.strictEqual(a.tiltRatio, '1/500');
    assert.strictEqual(a.grade, 'b등급');
    const m = grade.calcGroupDisplacement({
        category: '부재변위', measureLength: 6, levelUnit: 'mm', points: [{ level: 0 }, { level: -12 }, { level: 0 }]
    });
    assert.strictEqual(m.tiltRatio, '1/500');
    assert.strictEqual(m.grade, 'a등급');
    assert.strictEqual(m.absDeltaMm, 12);
    assert.strictEqual(m.deltaMm, 12);
    // 같은 구역을 cm 기준으로 읽으면(옛 구역) 10배 → 1/50
    const mc = grade.calcGroupDisplacement({
        category: '부재변위', measureLength: 6, points: [{ level: 0 }, { level: -12 }, { level: 0 }]
    });
    assert.strictEqual(mc.tiltRatio, '1/50');
    // 미입력이면 unit만 달고 incomplete
    const inc = grade.calcGroupDisplacement({ category: '변위', measureLength: 10, levelUnit: 'mm', points: [{ level: 1 }, { level: '' }] });
    assert.strictEqual(inc.incomplete, true);
    assert.strictEqual(inc.unit, 'mm');
})();

// 4) 통계: mm 구역은 그대로, cm 구역은 ×10 → 항목(mm)과 같은 단위
(function statsUnits() {
    const BLDG = 'b-unit';
    const dg = {};
    dg[BLDG + '_1F'] = [
        settle({ levelUnit: 'mm' }),
        settle({ points: [{ level: 0 }, { level: 3.5 }] })
    ];
    const payload = stats.buildNdtStatsPayload({}, { buildingId: BLDG, floorCodes: ['1F'], displacementGroups: dg });
    const s = payload.floorRows[0].settlement;
    assert.strictEqual(s.deltaMin, 35);
    assert.strictEqual(s.deltaMax, 35);
})();

// 5) 표·내보내기 값: "(mm)" 머리글에는 mm 값, Excel/hwpx 칸은 단위를 붙여서
(function exportFormat() {
    const fn = new Function('return (' + extractFunction(appSrc, 'function formatDispCalcForExport') + ')')();
    const mmGroup = fn(grade.calcGroupDisplacement(settle({ levelUnit: 'mm' })));
    assert.strictEqual(mmGroup.delta, '-35.0');
    assert.strictEqual(mmGroup.deltaCm, '-35.0mm');
    assert.strictEqual(mmGroup.tiltRatio, '1/1214');
    const legacy = fn(grade.calcGroupDisplacement(settle({ points: [{ level: 0 }, { level: 3.5 }] })));
    assert.strictEqual(legacy.delta, '-35.0', '옛 cm 구역도 (mm) 머리글 표에는 mm로 환산해 적는다');
    assert.strictEqual(legacy.deltaCm, '-3.5cm');
    assert.strictEqual(fn(null).delta, '-');
})();

// 6) 외벽 기울기 높이: m로 적으면 mm로 환산, mm·단위없음은 그대로
(function tiltHeightText() {
    const fn = new Function('return (' + extractFunction(appSrc, 'function formatHeightValue') + ')')();
    assert.strictEqual(fn('42.5m'), 'H = 42,500mm');
    assert.strictEqual(fn('42.5 m'), 'H = 42,500mm');
    assert.strictEqual(fn('H = 42.5M'), 'H = 42,500mm');
    assert.strictEqual(fn('L=3.6m'), 'L = 3,600mm');
    assert.strictEqual(fn('42500'), 'H = 42,500mm');
    assert.strictEqual(fn('42,500mm'), 'H = 42,500mm');
    assert.strictEqual(fn('H = 3,000mm'), 'H = 3,000mm');
    assert.strictEqual(fn('3000mm'), 'H = 3,000mm');
    assert.strictEqual(fn(''), '');
})();

// 7) 새 구역은 mm로 만들고, 화면 라벨·소스가 단위를 따라간다
(function sourceWiring() {
    const created = appSrc.split("levelUnit: 'mm'").length - 1;
    assert.ok(created >= 2, '구역을 만드는 두 곳(MARK 모드·모달) 모두 levelUnit mm로 시작해야 한다: ' + created);
    assert.ok(appSrc.includes('group.levelUnit = unitSelSave.value'), '구역 편집 저장이 단위를 저장해야 한다');
    assert.ok(htmlSrc.includes('id="ndtDispEditLevelUnit"'), '구역 편집에 단위 선택이 있어야 한다');
    assert.ok(appSrc.includes("lblLevel.textContent = `📊 레벨값 ("), '단일 지점 모달 라벨이 구역 단위를 따라가야 한다');
    assert.ok(!/value: `\$\{arrow\}\$\{deltaAbs\.toFixed\(1\)\}cm`/.test(appSrc), '결과 이미지에 cm를 하드코딩하면 안 된다');
    const statsSrc = fs.readFileSync(path.join(root, 'js', 'tabs', 'stats.js'), 'utf8');
    assert.ok(statsSrc.includes('calc.absDeltaMm'), '통계는 mm 환산값을 써야 한다');
    // 구역 병합은 레코드 통째 병합이라 levelUnit도 같이 간다
    const sm = require(path.join(root, 'js', 'core', 'sync-merge.js'));
    const merged = sm.mergeNdtRecord(
        { id: 'g', updatedAt: 1, levelUnit: 'cm', points: [] },
        { id: 'g', updatedAt: 2, levelUnit: 'mm', points: [] }
    );
    assert.strictEqual(merged.levelUnit, 'mm');
})();

console.log('test-displacement-units OK');