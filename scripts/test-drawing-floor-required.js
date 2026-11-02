'use strict';
// 2026-11-02 도면 파일 이름이 층 이름·번호가 되던 문제
//  1) 층을 못 찾은 파일(matched === false)은 층을 고르기 전에는 저장하지 않는다(새 건물·도면 수정 둘 다)
//  2) 3종 번호 접두사: 층 코드가 파일 이름이어도 층 이름(지상N층)이 있으면 N, 층을 알 수 없는 긴 파일 이름은 「?」 — 파일 이름이 번호가 되지 않는다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const stateSrc = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');

(async () => {
    // ---- 1) 저장 막기 ----
    const calls = { alert: [], toast: [] };
    const win = {
        appAlert: async (msg, opts) => { calls.alert.push({ msg, opts }); },
        showToast: (m) => calls.toast.push(m)
    };
    const ctx = { window: win };
    vm.createContext(ctx);
    vm.runInContext(extractFunction(app, 'async function blockSaveForUnassignedDrawingFloors(') + '\nthis.block = blockSaveForUnassignedDrawingFloors;', ctx);

    assert.strictEqual(await ctx.block([]), false, '파일 없음');
    assert.strictEqual(await ctx.block(undefined), false);
    assert.strictEqual(await ctx.block([{ fileName: '1F.pdf', matched: true }, { fileName: 'B1F.pdf' }]), false, '층을 찾았거나 matched 표시가 없는 것은 통과');
    assert.strictEqual(calls.alert.length, 0);

    const items = [{ fileName: '2025년 하반기 빛고을국악전수관 결함위치도외_003.pdf', matched: false, floorCode: '2025년 하반기 빛고을국악전수관 결함위치도외_003' }, { fileName: '1F.pdf', matched: true }];
    assert.strictEqual(await ctx.block(items), true, '층 못 찾은 파일이 있으면 막음');
    assert.strictEqual(calls.alert.length, 1);
    assert.ok(calls.alert[0].msg.includes('결함위치도외_003.pdf') && /층을 못 찾은 도면이 1개/.test(calls.alert[0].msg), '파일 이름과 개수를 보여 줌');
    // 층을 고르면(applyFloorSelectValue가 matched = true) 통과
    items[0].matched = true;
    assert.strictEqual(await ctx.block(items), false);
    // 많으면 6개까지만 보이고 나머지는 개수
    const many = Array.from({ length: 9 }, (_, i) => ({ fileName: `f${i}.pdf`, matched: false }));
    calls.alert.length = 0;
    assert.strictEqual(await ctx.block(many), true);
    assert.ok(/외 3개/.test(calls.alert[0].msg));
    // 알림 창이 없으면 안내 토스트
    win.appAlert = undefined;
    assert.strictEqual(await ctx.block(many), true);
    assert.strictEqual(calls.toast.length, 1);

    // 저장 단추 두 곳 모두 맨 앞에서 확인
    assert.ok(/btnSaveBuilding\.addEventListener\('click', async \(\) => \{\s*if \(await blockSaveForUnassignedDrawingFloors\(window\.selectedUploadedDrawings\)\) return;/.test(app), '새 건물 저장');
    assert.ok(/const bldg = window\.currentEditingBuilding;\s*if \(!bldg\) return;\s*if \(await blockSaveForUnassignedDrawingFloors\(window\.selectedEditUploadedDrawings\)\) return;/.test(app), '도면 수정 저장');

    // ---- 2) 3종 번호 접두사 ----
    const FILE = '2025년 하반기 빛고을국악전수관 결함위치도외_003';
    const labels = { [FILE]: '지상1층', FILE_B: '지상 2층 (2F)', FILE_C: '필로티', Z9: '2층' };
    const pctx = { window: { getFloorLabelFromCode: (c) => labels[c] || c, isExteriorFloorCode: () => false } };
    vm.createContext(pctx);
    vm.runInContext(extractFunction(stateSrc, 'window.parseRooftopIndex = function(') + ';\n'
        + extractFunction(app, 'function getGrade3RoofPrefix(') + '\n'
        + extractFunction(app, 'function getGrade3FloorPrefix(') + '\nthis.p = getGrade3FloorPrefix;', pctx);
    const p = (c) => pctx.p(c);
    assert.strictEqual(p(FILE), '1', '층 코드가 파일 이름이어도 층 이름이 지상1층이면 1');
    assert.strictEqual(p('FILE_B'), '2', '「지상 2층 (2F)」 → 2');
    assert.strictEqual(p('Z9'), '2', '층 이름 「2층」 → 2');
    // 층 이름도 파일 이름이면(바르게 못 고른 상태) 파일 이름 대신 「?」
    const labels2 = {};
    const pctx2 = { window: { getFloorLabelFromCode: (c) => labels2[c] || c, isExteriorFloorCode: () => false } };
    vm.createContext(pctx2);
    vm.runInContext(extractFunction(stateSrc, 'window.parseRooftopIndex = function(') + ';\n'
        + extractFunction(app, 'function getGrade3RoofPrefix(') + '\n'
        + extractFunction(app, 'function getGrade3FloorPrefix(') + '\nthis.p = getGrade3FloorPrefix;', pctx2);
    assert.strictEqual(pctx2.p(FILE), '?', '층을 알 수 없는 긴 파일 이름은 번호에 쓰지 않는다');
    assert.strictEqual(pctx2.p('2024 최종 도면_수정본 01'), '?');
    // 기존 규칙은 그대로
    ['1F', 'B1F'].forEach((c) => assert.ok(pctx2.p(c) === (c === '1F' ? '1' : 'B1')));
    assert.strictEqual(pctx2.p('지상2층'), '지상2층', '코드 자체가 「지상2층」인 예전 방식은 그대로');
    assert.strictEqual(pctx2.p('Pump room'), 'Pump room', '짧은 이름은 그대로');

    console.log('test-drawing-floor-required: ok');
})().catch((e) => { console.error(e); process.exit(1); });
