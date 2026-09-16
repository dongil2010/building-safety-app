#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const wrap = require(path.join(__dirname, '..', 'js', 'shared', 'korean-cell-wrap.js'));

function assertNoMidToken(text, maxChars, mustStayTogether) {
    const out = wrap.wrapLine(text, maxChars);
    mustStayTogether.forEach((token) => {
        const compact = out.replace(/\n/g, '');
        assert.ok(compact.includes(token.replace(/\n/g, '')), `lost token ${token} in ${out}`);
        const broken = token.split('').some((_, i) => {
            if (i === 0) return false;
            const left = token.slice(0, i);
            const right = token.slice(i);
            return out.includes(`${left}\n${right}`);
        });
        assert.ok(!broken, `token ${token} was split in:\n${out}`);
    });
}

function testScreenshotLocations() {
    assert.strictEqual(wrap.wrapLine('복도X7~8/Y2~3', 5), '복도X7~8/\nY2~3');
    assert.strictEqual(wrap.wrapLine('X12~13/Y1~2', 5), 'X12~13/\nY1~2');
    assert.strictEqual(wrap.wrapLine('X10~11/Y5~6', 5), 'X10~11/\nY5~6');
}

function testKoreanWordAndFloorRange() {
    assert.strictEqual(wrap.wrapLine('슬래브(주차장 포함)', 6), '슬래브(\n주차장\n포함)');
    assert.strictEqual(wrap.wrapLine('슬래브(주차장 포함)', 8), '슬래브(주차장\n포함)');

    const floor = wrap.wrapLine('전 층(PH1~지하4층)', 8);
    assert.strictEqual(floor, '전 층(\nPH1~지하4층)');
    assert.ok(!floor.includes('PH1~\n'), floor);
}

function testMeasureTokensStayTogether() {
    assert.strictEqual(wrap.wrapLine('0.3~0.7/0.5', 4), '0.3~0.7/0.5');
    assert.strictEqual(wrap.wrapLine('Cw:0.15', 4), 'Cw:0.15');
    assert.strictEqual(wrap.wrapLine('0.3x0.5', 4), '0.3x0.5');
}

function testSpaceAndCommaStillWrap() {
    assert.strictEqual(wrap.wrapLine('슬래브 균열', 4), '슬래브\n균열');
    const multi = wrap.wrapLine('0.3/0.5, 0.2/1.0', 8);
    assert.ok(multi.includes(','), multi);
    assert.ok(!multi.includes('0.3/\n'), multi);
}

function testFitsOnOneLine() {
    assert.strictEqual(wrap.wrapLine('복도X7~8/Y2~3', 16), '복도X7~8/Y2~3');
    assert.strictEqual(wrap.wrapLine('X12~13/Y1~2', 16), 'X12~13/Y1~2');
}

function testKeepTogetherHtml() {
    const protectedLoc = wrap.insertKeepTogether('Y2~3');
    assert.ok(protectedLoc.includes(wrap.WORD_JOINER), protectedLoc);
    assert.strictEqual(protectedLoc.replace(new RegExp(wrap.WORD_JOINER, 'g'), ''), 'Y2~3');
    const parking = wrap.insertKeepTogether('주차장');
    assert.strictEqual(parking.split(wrap.WORD_JOINER).join(''), '주차장');
    assert.ok(parking.includes(wrap.WORD_JOINER));
}

function testUnbreakableHangulWord() {
    assert.strictEqual(wrap.wrapLine('주차장', 2), '주차장');
}

function testEaSpaceNotPreferred() {
    const out = wrap.wrapLine('0.3/0.5 -12EA', 16);
    assert.strictEqual(out, '0.3/0.5 -12EA');
}

testScreenshotLocations();
testKoreanWordAndFloorRange();
testMeasureTokensStayTogether();
testSpaceAndCommaStillWrap();
testFitsOnOneLine();
testKeepTogetherHtml();
testUnbreakableHangulWord();
testEaSpaceNotPreferred();
assertNoMidToken('복도X7~8/Y2~3', 5, ['Y2~3', 'X7~8']);
assertNoMidToken('슬래브(주차장 포함)', 6, ['주차장', '슬래브']);
assertNoMidToken('전 층(PH1~지하4층)', 8, ['PH1~지하4층']);

console.log('test-korean-cell-wrap: ok');
