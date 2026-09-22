#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 GPT 감사 9번 — 한글 보고서 직전 점검(checkReportData)의 회귀 테스트.
 * 지난 사고 유형: 층이 통째로 빠짐 / 지운 결함이 다시 나옴 / 같은 번호가 두 층에(층 섞임).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const health = require(path.join(root, 'js', 'core', 'data-health.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const kinds = (issues) => issues.map((x) => x.kind).sort();

// 정상: 문제 없음
{
    const issues = health.checkReportData({
        buildingId: 'b1',
        defectsMap: { b1_1F: [{ id: 'a' }, { id: 'b' }], b1_2F: [{ id: 'c' }], b2_1F: [{ id: 'a' }] },
        deletedDefectIds: { b1_1F: ['z'] },
        ndtMap: { b1_1F: [{ id: 'n1' }] },
        dispMap: {},
        reportFloorCodes: ['1F', '2F'],
        reportDefectsByFloor: { '1F': [{ id: 'a' }, { id: 'b' }], '2F': [{ id: 'c' }] }
    });
    assert.deepStrictEqual(issues, [], '정상 데이터는 경고 없음(다른 건물 b2는 보지 않는다)');
}

// 층이 보고서 목록에서 빠짐(묘비만 남은 결함은 세지 않음)
{
    const issues = health.checkReportData({
        buildingId: 'b1',
        defectsMap: { b1_1F: [{ id: 'a' }], b1_B1F: [{ id: 'p' }, { id: 'q' }], b1_3F: [{ id: 'x' }] },
        deletedDefectIds: { b1_3F: ['x'] },
        reportFloorCodes: ['1F'],
        reportDefectsByFloor: { '1F': [{ id: 'a' }] }
    });
    assert.deepStrictEqual(issues, [{ kind: 'missingFloor', floorCode: 'B1F', count: 2 }]);
}

// 지운 결함이 보고서 행에 들어감 + 같은 결함이 두 층에
{
    const issues = health.checkReportData({
        buildingId: 'b1',
        defectsMap: { b1_1F: [{ id: 'a' }, { id: 'dead' }], b1_2F: [{ id: 'a' }] },
        deletedDefectIds: { b1_1F: ['dead'] },
        ndtMap: { b1_1F: [{ id: 'n1' }], b1_2F: [{ id: 'n1' }] },
        dispMap: { b1_1F: [{ id: 'g1' }], b1_B1F: [{ id: 'g1' }] },
        reportFloorCodes: ['1F', '2F'],
        reportDefectsByFloor: { '1F': [{ id: 'a' }, { id: 'dead' }], '2F': [{ id: 'a' }] }
    });
    assert.deepStrictEqual(kinds(issues), ['defectOnTwoFloors', 'deletedInReport', 'ndtOnTwoFloors', 'ndtOnTwoFloors']);
    const lines = health.describeReportIssues(issues, (c) => ({ '1F': '지상1층', '2F': '지상2층', B1F: '지하1층' }[c] || c));
    assert.ok(lines.some((l) => l.includes('지운 결함 1개') && l.includes('지상1층 dead')));
    assert.ok(lines.some((l) => l.includes('같은 결함 1개') && l.includes('지상1층·지상2층')));
    assert.ok(lines.some((l) => l.includes('같은 비파괴 항목 2개')));
}

assert.deepStrictEqual(health.checkReportData(null), []);
assert.deepStrictEqual(health.checkReportData({}), []);

// 연결: 한글 출력이 파일을 만들기 전에 점검하고, 취소하면 멈춘다
const exp = app.slice(app.indexOf('window.exportHwpxSurveyTable = async function() {'), app.indexOf("window.showLoading('한글(hwpx) 상태조사표를 생성하는 중입니다...');"));
assert.ok(exp.includes('health.checkReportData({'), '출력 전에 점검');
assert.ok(/if \(!go\) return;/.test(exp), '취소하면 만들지 않는다');
assert.ok(exp.indexOf('if (!floorsData.length)') < exp.indexOf('health.checkReportData({'), '보고서 행을 모은 뒤 점검');

console.log('test-report-data-check: ok');
