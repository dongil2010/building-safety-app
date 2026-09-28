#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 한글/PDF 위치 칸 행·열 줄나눔 회귀 테스트
 *  - 칸 폭(cellSz − 여백) ÷ 글자 크기(charPr height) × 0.92 = 한 줄 폭(em)
 *  - 들어가면 한 줄, 넘치면 '/' 뒤(여러 쌍이면 ', ' 뒤 먼저)에서 줄바꿈, 토큰(A1~A2) 중간은 안 자름
 *  - 실 이름은 다음 줄, 빈 줄·중복 줄 없음
 *  - 한글 사진표 위치 칸도 같은 규칙(예전엔 d.location만 읽어서 행·열이 빈칸으로 나옴)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));
const KW = require(path.join(__dirname, '..', 'js', 'shared', 'korean-text-wrap.js'));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

// ---- 폭 계산: 1·2종 상태조사표 위치 칸(4695 폭, 여백 0, 8pt=800) ----
const surveyUnits = G.cellTextUnits({ cellWidth: 4695, marginLeft: 0, marginRight: 0, fontHeight: 800 });
assert.ok(Math.abs(surveyUnits - (4695 / 800) * 0.92) < 1e-9, '칸 폭 ÷ 글자 크기 × 0.92');
assert.strictEqual(G.cellTextUnits({ cellWidth: 0, fontHeight: 800 }), 0, '폭 모르면 0');
assert.strictEqual(G.cellTextUnits({ cellWidth: 4000, fontHeight: 0 }), 0, '글자 크기 모르면 0');
assert.strictEqual(G.cellTextUnits({ cellWidth: 200, marginLeft: 141, marginRight: 141, fontHeight: 800 }), 0, '여백이 폭보다 크면 0');
// 사진표 위치 칸(13828 폭, 표 안쪽 여백 140)
const photoUnits = G.cellTextUnits({ cellWidth: 13828, marginLeft: 140, marginRight: 140, fontHeight: 800 });
assert.ok(photoUnits > 15, '사진표 위치 칸은 넓다');

// ---- 글자 폭 어림 ----
assert.strictEqual(G.gridLocTextEm('가'), 1);
assert.ok(Math.abs(G.gridLocTextEm('A1~/') - (0.62 + 0.55 * 3)) < 1e-9, '대문자 0.62 · 숫자·~·/ 0.55');

// ---- 들어가면 한 줄 ----
assert.deepStrictEqual(G.splitGridLocLines('X1~2/Y3', surveyUnits), ['X1~2/Y3'], '짧으면 한 줄');
assert.deepStrictEqual(G.splitGridLocLines('A1~A2/Y1', surveyUnits), ['A1~A2/Y1']);
assert.deepStrictEqual(G.splitGridLocLines('A1~A2/Y1~Y2', 0), ['A1~A2/Y1~Y2'], '폭 모르면 그대로');
assert.deepStrictEqual(G.splitGridLocLines('', surveyUnits), []);

// ---- 넘치면 '/' 뒤에서 ----
assert.deepStrictEqual(G.splitGridLocLines('A1~A2/Y1~Y2', surveyUnits), ['A1~A2/', 'Y1~Y2'], "넘치면 '/' 뒤에서, '/'는 윗줄 끝");
assert.deepStrictEqual(G.splitGridLocLines('A12~A13/Y10~Y11', surveyUnits), ['A12~A13/', 'Y10~Y11']);
assert.deepStrictEqual(G.splitGridLocLines('~X1/Y5', surveyUnits), ['~X1/Y5'], "바깥 범위 '~X1'도 한 토큰");
// 토큰 하나가 폭보다 길어도 토큰 중간은 안 자름
assert.deepStrictEqual(G.splitGridLocLines('AB12~AB13/Y1', 3), ['AB12~AB13/', 'Y1'], '긴 토큰도 통째로');
assert.deepStrictEqual(G.splitGridLocLines('AB12~AB13', 2), ['AB12~AB13'], "'/' 없으면 나누지 않음");

// ---- 여러 쌍: ', ' 뒤 먼저 ----
assert.deepStrictEqual(G.splitGridLocLines('A1~A2/Y1, A3/Y2~', surveyUnits), ['A1~A2/Y1,', 'A3/Y2~'], "쌍 사이(', ') 먼저, 쉼표는 윗줄 끝");
assert.deepStrictEqual(G.splitGridLocLines('A1~A2/Y1~Y2, A3/Y4', surveyUnits), ['A1~A2/', 'Y1~Y2,', 'A3/Y4'], '혼자 넘치는 쌍만 / 뒤에서');
assert.deepStrictEqual(G.splitGridLocLines('A1/Y1, A2/Y2, A3/Y3', 9), ['A1/Y1, A2/Y2,', 'A3/Y3'], '들어가는 만큼 한 줄에');
assert.deepStrictEqual(G.splitGridLocLines('A1/Y1, A2/Y2', photoUnits), ['A1/Y1, A2/Y2'], '넓은 칸은 한 줄');
// 어느 결과에도 빈 줄 없음
['A1~A2/Y1~Y2', 'A1~A2/Y1, A3/Y2~', 'A1/, /Y2', ' A1~A2 / Y1 '].forEach((s) => {
    [1, 3, surveyUnits, 99].forEach((u) => {
        const lines = G.splitGridLocLines(s, u);
        assert.ok(lines.length >= 1 && lines.every((l) => l && l.trim() === l), `빈 줄 없음: ${s} @${u} → ${JSON.stringify(lines)}`);
        assert.strictEqual(lines.join('').replace(/\s/g, ''), s.replace(/\s/g, ''), '글자 빠짐·중복 없음');
    });
});

// ---- 위치 칸 전체(행·열 + 실 이름) ----
const cell = (gridLoc, detail, maxUnits) => G.reportLocationCell({ gridLoc, detail, maxUnits });
assert.strictEqual(cell('X1~2/Y3', '거실', surveyUnits), 'X1~2/Y3\n거실', '한 줄 + 다음 줄 실 이름');
assert.strictEqual(cell('A1~A2/Y1~Y2', '거실', surveyUnits), 'A1~A2/\nY1~Y2\n거실', '넘치면 / 뒤 + 실 이름 다음 줄');
assert.strictEqual(cell('A1~A2/Y1~Y2', '', surveyUnits), 'A1~A2/\nY1~Y2', '실 이름 없음');
assert.strictEqual(cell('', '거실', surveyUnits), '', '실 이름만 → 빈 값(부르는 쪽이 예전 출력)');
assert.strictEqual(cell('A1~A2/Y1~Y2', '거실'), 'A1~A2/Y1~Y2\n거실', '폭을 안 주면 예전과 같음');
assert.strictEqual(G.reportLocationCell({ detail: 'X2, Y3 거실', legacyAuto: 'X2, Y3', maxUnits: surveyUnits }), 'X2, Y3\n거실', '예전 실험 데이터');

// 공용 한글 래퍼(fillCellParas)가 나눈 줄을 다시 쪼개거나 빈 줄을 만들지 않음 — 같은 최소 폭을 넘겨줌
{
    const estimate = Math.max(4, Math.floor(4695 / Math.max(700, Math.round(800 * 0.95))));
    const maxChars = Math.max(estimate, surveyUnits);
    ['A1~A2/\nY1~Y2\n거실', 'A1~A2/Y1,\nA3/Y2~\n거실', 'X1~2/Y3\n거실', 'A1~A2/\nY1~Y2'].forEach((txt) => {
        const out = KW.wrapHwpxCellText(txt, maxChars, KW.defaultCharWidthUnits);
        assert.strictEqual(out, txt, `래퍼가 줄 수를 바꾸지 않음: ${JSON.stringify(txt)} → ${JSON.stringify(out)}`);
    });
}

// ---- PDF(HTML) 위치 칸 첫 줄 ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
assert.strictEqual(G.gridLocBreakableHtml('A1~A2/Y1~Y2', esc), '<span style="display:inline-block;">A1~A2/<wbr>Y1~Y2</span>');
assert.strictEqual(G.gridLocBreakableHtml('A1~A2/Y1, A3/Y2~', esc),
    '<span style="display:inline-block;">A1~A2/<wbr>Y1,</span> <span style="display:inline-block;">A3/<wbr>Y2~</span>');
assert.strictEqual(G.gridLocBreakableHtml('', esc), '');

// ---- 앱 연결(한글 1·2종 내보내기) ----
const t12 = app.slice(app.indexOf('async function exportHwpxSurveyTable12('));
assert.ok(t12.includes('const hwpxCharPrHeightById = {};') && t12.includes("hwpxCharPrHeightById[cpId]"), '칸 글자 크기는 header.xml charPr height');
assert.ok(t12.includes("tc.getAttribute('hasMargin') === '1'") && t12.includes("c.localName === 'inMargin'"), '여백: hasMargin이면 칸 여백, 아니면 표 안쪽 여백');
assert.ok(t12.includes('if (colIdx === 1 && gridLocCellRaw && cellVal === gridLocCellRaw) {'), '상태조사표 위치 칸만 칸 폭으로 나눔');
assert.ok(t12.includes('const fillInfo = fillCellParas(subList, paras, cellVal, tc, cellMinChars);'), '나눈 줄 폭을 래퍼에 넘김');
assert.ok(t12.includes('const maxChars = Math.max(estimateHwpxCellMaxChars(tc, paras), Number(minMaxChars) || 0);'));
// 사진표 위치 칸: 행·열이 있으면 같은 규칙(예전엔 d.location만 읽어서 빈칸)
assert.ok(t12.includes('setHwpxPhotoLocText(capTcs[2], slot1.d, floorCode);') && t12.includes('setHwpxPhotoLocText(capTcs[6], slot2.d, floorCode);'), '사진표 위치 칸 두 곳');
assert.ok(!t12.includes("setTcText(capTcs[2], getSurveyCellText('location'"), '사진표 위치 칸이 d.location만 읽지 않음');
{
    const st = t12.indexOf('const setHwpxPhotoLocText = (tc, d, fc) => {');
    const fn = t12.slice(st, t12.indexOf('};', st) + 2);
    const vm = require('vm');
    const written = [];
    const ctx = {
        HP_NS: 'hp',
        getDefectGridRoomForReport: (d, fc, units) => G.reportLocationCell({ gridLoc: d.gridLoc, detail: String(d.location || '').replace(/^1F\s*/, '').replace(/^1F$/, ''), maxUnits: units }),
        getSurveyCellText: (k, d) => d.location || '',
        hwpxCellTextUnits: () => 3,
        setTcText: (tc, text, minChars) => written.push([text, minChars || 0])
    };
    vm.createContext(ctx);
    vm.runInContext(`${fn}\nthis.f = setHwpxPhotoLocText;`, ctx);
    const tc = { getElementsByTagNameNS: () => [] };
    ctx.f(tc, { location: '', gridLoc: 'A1~A2/Y1~Y2' }, '1F');
    ctx.f(tc, { location: '1F 거실', gridLoc: 'X1/Y2' }, '1F');
    ctx.f(tc, { location: '1F 거실' }, '1F');
    assert.deepStrictEqual(written, [['A1~A2/\nY1~Y2', 3], ['X1/Y2\n거실', 3], ['1F 거실', 0]], '사진표 위치: 행·열(+실 이름), 없으면 예전 위치 그대로');
}
// 3종 사진표는 위치 칸을 쓰지 않음(새 서식에는 칸이 없음) — 그대로
const t3 = app.slice(app.indexOf('async function exportHwpxSurveyTable3('), app.indexOf('async function exportHwpxSurveyTable12('));
assert.ok(t3.includes("if (slot.locationTc) setTcText(slot.locationTc, '');"), '3종 사진표 위치 칸은 예전 그대로');
// PDF 상태조사표 위치 칸
assert.ok(app.includes('(ci === 1 && gridCell && v === gridCell) ? tdGridLoc(v) : td(v)'), 'PDF 1·2종 위치 칸');

console.log('test-grid-loc-report-lines: ok');
