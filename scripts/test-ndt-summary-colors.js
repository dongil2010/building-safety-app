#!/usr/bin/env node
'use strict';

/**
 * 2026-09-21: 외벽 기울기·부동침하 측정결과표에서 변위량이 안 보였다.
 * 값은 들어 있었는데 글자색이 예전 어두운 화면용 #f8fafc(거의 흰색)라 흰 바탕에 묻혔다
 * (실측 대비 1.04:1). 결과표 칸에 이런 밝은 글자색이 다시 들어오지 않게 막는다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function testNoNearWhiteTextInNdtSummary() {
    const start = app.indexOf('function renderNdtSummaryTable()');
    const end = app.indexOf('window.editNdtDisplacementGroup = function', start);
    assert.ok(start > 0 && end > start, '비파괴 결과표 렌더 구간을 찾지 못했다');
    const block = app.slice(start, end);
    assert.ok(!/<td[^>]*color:\s*#f8fafc/i.test(block),
        '결과표 칸 글자색이 #f8fafc(거의 흰색)면 흰 바탕에서 값이 안 보인다');
    assert.ok(!/<td[^>]*color:\s*#c084fc/i.test(block),
        '연보라 #c084fc도 흰 바탕에서 흐리다 — ndt-col-disp-ratio 클래스를 쓴다');
    const valueCells = (block.match(/class="ndt-col-disp-value"/g) || []).length;
    assert.ok(valueCells >= 2, '외벽 기울기·부동침하 두 표 모두 변위량 칸에 클래스를 써야 한다');
}

function testDisplacementCellColorsAreDark() {
    const valueRule = css.match(/td\.ndt-col-disp-value\s*\{[^}]*color:\s*(#[0-9a-f]{6})/i);
    const ratioRule = css.match(/td\.ndt-col-disp-ratio\s*\{[^}]*color:\s*(#[0-9a-f]{6})/i);
    assert.ok(valueRule && ratioRule, '변위량·기울기 칸 글자색 규칙이 있어야 한다');
    const lum = (hex) => {
        const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
    };
    const contrastOnWhite = (hex) => (1.05) / (lum(hex) + 0.05);
    assert.ok(contrastOnWhite(valueRule[1]) >= 4.5, '변위량 글자는 흰 바탕 대비 4.5:1 이상이어야 한다');
    assert.ok(contrastOnWhite(ratioRule[1]) >= 4.5, '기울기 글자는 흰 바탕 대비 4.5:1 이상이어야 한다');
}

testNoNearWhiteTextInNdtSummary();
testDisplacementCellColorsAreDark();
console.log('test-ndt-summary-colors: ok');
