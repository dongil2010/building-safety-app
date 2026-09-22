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
const perfCalls = app.match(/perfAnchor = await insertImageParaAfter\(perfAnchor, pageCanvas\.toDataURL\('image\/png'\), 'strengthPerfAuto', PERF_IMG_W, 999999999\);/g) || [];
assert.strictEqual(perfCalls.length, 2, '두 출력 경로 모두 쪽 단위 한 장');
assert.strictEqual((app.match(/perfCanvases\.push\(renderStrengthPerfPointCanvas\(/g) || []).length, 2);
assert.ok(!app.includes('const picParaTemplate = picParas[0].cloneNode(true);'), 'NO.마다 템플릿 그림 문단을 복제하던 방식은 없어야 한다');
// insertImageParaAfter가 쓰는 그림은 글자처럼 취급
const picTpl = app.match(/const PIC_TEMPLATE_XML = '[^']*'/g) || [];
assert.ok(picTpl.length >= 2 && picTpl.every((t) => t.includes('treatAsChar="1"')), '삽입 그림은 글자처럼 취급');

console.log('test-hwpx-strength-perf-page-group: ok');
