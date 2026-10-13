#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 한글 콘크리트 반발경도 성과표 — NO.마다 따로 떠 있던 그림(글자처럼 취급 아님)을
 * 한 쪽에 들어가는 NO.끼리 그림 한 장으로 이어 붙여 "글자처럼 취급"(insertImageParaAfter)으로 넣는다.
 * 1·2종 / 3종 출력 두 경로 모두. (브라우저 확인: 본문 64836에 5개 = 61770, 7개면 2장, 순서·여백 정상)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractFunction('function getStrengthPerfPerPage(') + '\nthis.f = getStrengthPerfPerPage;', ctx);
const BODY = 83340 - 5669 - 4252 - 4331 - 4252; // 템플릿 쪽 본문 높이
assert.strictEqual(ctx.f(BODY, 42520, 2200, 620, 24), 5, 'A4 본문에 성과표 NO. 5개');
assert.ok(5 * (42520 * 620 / 2200) + 4 * (42520 * 24 / 2200) <= BODY - 1500, '5개가 실제로 한 쪽에 들어가야 한다');
assert.strictEqual(ctx.f(20000, 42520, 2200, 620, 24), 1, '한 개도 안 들어가도 최소 1개');
assert.strictEqual(ctx.f(0, 42520, 2200, 620, 24), 1);

// 두 출력 경로: NO.별 그림을 모아서 쪽 단위로 이어 붙이고, 글자처럼 취급 그림 문단으로 넣는다
// 마지막 쪽은 밑에 적용 추정식 줄이 붙으므로 본문 높이를 넘지 않게 높이를 제한한다(2026-10-14)
const perfCalls = app.match(/perfAnchor = await insertImageParaAfter\(perfAnchor, pageCanvas\.toDataURL\('image\/png'\), 'strengthPerfAuto', PERF_IMG_W, isLastPage \? bodyH - 1500 : 999999999\);/g) || [];
assert.strictEqual(perfCalls.length, 2, '두 출력 경로 모두 쪽 단위 한 장');
assert.strictEqual((app.match(/if \(isLastPage\) pageParts\.push\(renderStrengthPerfLegendCanvas\(perfEnabledNames\)\);/g) || []).length, 2, '두 출력 경로 모두 마지막 쪽 밑에 적용 추정식');

// 적용 추정식 줄 — 고른 식만, 번호는 전체 식 순서(성과표 압축강도 칸의 1식/2식/3식과 같다)
const legendCtx = {};
vm.createContext(legendCtx);
const formulasAt = app.indexOf('const CONCRETE_STRENGTH_FORMULAS = [');
vm.runInContext(app.slice(formulasAt, app.indexOf('];', formulasAt) + 2)
    + '\n' + extractFunction('function getStrengthFormulaLegendLines(')
    + '\nthis.lines = getStrengthFormulaLegendLines;', legendCtx);
assert.deepStrictEqual(Array.from(legendCtx.lines(['일본재료학회식', '일본건축학회 제안식'])), [
    '1식  일본재료학회식 : Fc = (13Ro - 184) × 0.1 (MPa)',
    '2식  일본건축학회 제안식 : Fc = (7.3Ro + 100) × 0.1 (MPa)'
]);
// 적어 둔 식 문구(expr)를 그대로 계산하면 실제 계산(calc)과 같아야 한다 — 문구만 따로 틀리는 것 방지
vm.runInContext('this.formulas = CONCRETE_STRENGTH_FORMULAS;', legendCtx);
assert.strictEqual(legendCtx.formulas.length, 3);
Array.from(legendCtx.formulas).forEach((f) => {
    assert.ok(/^Fc = [0-9Ro .()+\-×]+$/.test(f.expr), f.name + ' 식 문구 형식');
    const js = f.expr.replace(/^Fc = /, '').replace(/([0-9.]+)Ro/g, '$1 * ro').replace(/×/g, '*');
    const fromText = new Function('ro', 'return ' + js + ';');
    for (let ro = 10; ro <= 80; ro += 0.1) {
        assert.ok(Math.abs(fromText(ro) - f.calc(ro)) < 1e-9, f.name + ' 문구와 계산이 다르다 (Ro=' + ro.toFixed(1) + ')');
    }
});

assert.deepStrictEqual(Array.from(legendCtx.lines(['일본재료학회식', '과학기술부식'])), [
    '1식  일본재료학회식 : Fc = (13Ro - 184) × 0.1 (MPa)',
    '3식  과학기술부식 : Fc = (15.2Ro - 112.8) × 0.1 (MPa)'
]);
assert.strictEqual((app.match(/perfCanvases\.push\(renderStrengthPerfPointCanvas\(/g) || []).length, 2);
assert.ok(!app.includes('const picParaTemplate = picParas[0].cloneNode(true);'), 'NO.마다 템플릿 그림 문단을 복제하던 방식은 없어야 한다');
// insertImageParaAfter가 쓰는 그림은 글자처럼 취급
const picTpl = app.match(/const PIC_TEMPLATE_XML = '[^']*'/g) || [];
assert.ok(picTpl.length >= 2 && picTpl.every((t) => t.includes('treatAsChar="1"')), '삽입 그림은 글자처럼 취급');

console.log('test-hwpx-strength-perf-page-group: ok');
