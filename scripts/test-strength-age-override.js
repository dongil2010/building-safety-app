'use strict';
// 2026-10-19 강도 재령일 — 준공일·점검일 자동(DAYS360) + 직접 입력(이 항목 > 건물 공통), 비우면 자동으로
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sa = require(path.join(root, 'js', 'core', 'strength-age.js'));

function testModule() {
    assert.strictEqual(sa.parseOverride(''), null);
    assert.strictEqual(sa.parseOverride(null), null);
    assert.strictEqual(sa.parseOverride('  3650 '), 3650);
    assert.strictEqual(sa.parseOverride('3650.6'), 3651);
    assert.strictEqual(sa.parseOverride('-3'), null);
    assert.strictEqual(sa.parseOverride('abc'), null);
    assert.strictEqual(sa.parseOverride(sa.MAX_DAYS + 1), null);
    const auto = sa.resolve({}, {}, 9000);
    assert.deepStrictEqual([auto.days, auto.source], [9000, 'auto']);
    const b = sa.resolve({}, { strengthAgeOverride: 3000 }, 9000);
    assert.deepStrictEqual([b.days, b.source, b.autoDays], [3000, 'building', 9000]);
    const it = sa.resolve({ strengthAgeOverride: 1000 }, { strengthAgeOverride: 3000 }, 9000);
    assert.deepStrictEqual([it.days, it.source], [1000, 'item'], '항목 직접 입력이 먼저');
    const cleared = sa.resolve({ strengthAgeOverride: null }, { strengthAgeOverride: '' }, 9000);
    assert.deepStrictEqual([cleared.days, cleared.source], [9000, 'auto'], '비우면 자동');
    assert.strictEqual(sa.resolve(null, null, null).days, null);
}

function loadApp() {
    const ctx = { window: { state: { currentBuilding: null }, BSA: { strengthAge: sa } }, console };
    vm.createContext(ctx);
    const names = [
        'excelRoundHalfUp', 'parseYmdParts', 'excelDays360', 'getConcreteStrengthAgeDays', 'strengthAgeApi',
        'resolveStrengthAgeInfo'
    ];
    const src = names.map((n) => {
        try { return extractFunction(app, 'function ' + n + '('); } catch (_e) { return ''; }
    }).join('\n');
    vm.runInContext(src + '\nthis.resolve = resolveStrengthAgeInfo; this.auto = getConcreteStrengthAgeDays;', ctx);
    return ctx;
}

function testAppResolve() {
    const ctx = loadApp();
    const bldg = { completionDate: '2000-06-15', date: '2026-09-22' };
    const autoDays = ctx.auto(bldg);
    assert.strictEqual(autoDays, 9457, '준공일이 바뀌면 그대로 따라가는 자동 재령');
    assert.strictEqual(ctx.resolve({}, bldg).days, 9457);
    assert.strictEqual(ctx.resolve({}, Object.assign({}, bldg, { completionDate: '2010-06-15' })).days, ctx.auto({ completionDate: '2010-06-15', date: '2026-09-22' }));
    assert.strictEqual(ctx.resolve({}, Object.assign({ strengthAgeOverride: 5000 }, bldg)).days, 5000);
    assert.strictEqual(ctx.resolve({ strengthAgeOverride: 800 }, Object.assign({ strengthAgeOverride: 5000 }, bldg)).days, 800);
    assert.strictEqual(ctx.resolve({ strengthAgeOverride: 800 }, {}).days, 800, '준공일 없어도 직접 입력이면 계산');
}

function testWiring() {
    const refresh = extractFunction(app, 'function refreshStrengthItemResults(');
    assert.ok(/resolveStrengthAgeInfo\(item, bldg\)\.days/.test(refresh), '목록·통계·평가 탭·엑셀·한글이 쓰는 재계산이 직접 입력을 따른다');
    assert.strictEqual((app.match(/resolveStrengthAgeInfo\(pt\.item, bldg\)\.days/g) || []).length, 2, '성능평가(한글 성과표) 2곳');
    assert.ok(/strengthAgeOverride: strengthAgeFormItem/.test(app) || /strengthAgeOverride:/.test(app), '항목에 저장');
    assert.ok(/id="ndtStrengthAgeBldg"/.test(app) && /id="ndtStrengthAgeItem"/.test(app), '입력칸 2개(건물 공통·이 항목)');
    assert.ok(/markBuildingMetaDirty\(/.test(extractFunction(app, 'function applyStrengthAgeInputToBuilding(')), '건물 공통은 건물 정보 동기화로');
    const merge = fs.readFileSync(path.join(root, 'js', 'core', 'building-meta-merge.js'), 'utf8');
    assert.ok(/'strengthAgeOverride'/.test(merge), '건물 정보 병합 키');
    assert.ok(/'strengthAgeOverride'/.test(app), 'app.js 예비 키 목록');
    const sm = fs.readFileSync(path.join(root, 'js', 'core', 'safetyman-export.js'), 'utf8');
    assert.ok(/refreshStrengthItemResults/.test(sm), 'SafetyMan 엑셀은 같은 재계산 사용');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/js\/core\/strength-age\.js\?v=/.test(html));
    assert.ok(html.indexOf('js/core/strength-age.js') < html.indexOf('src="app.js'), 'app.js보다 먼저');
}

[testModule, testAppResolve, testWiring].forEach((t) => { t(); console.log('ok -', t.name); });
console.log('test-strength-age-override: ok');
