'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mm = require('../js/core/building-meta-merge.js');

// 점검 설정(고급 필터) 칸 + 회차 목록 칸
assert.ok(html.includes('id="inputInspectionRoundDate"'), '점검 설정에 회차 점검일 칸');
assert.ok(html.indexOf('id="inputInspectionRoundDate"') < html.indexOf('id="btnStartNextSurveyRound"'), '다음 회차 시작 버튼 위');
assert.ok(/data-action="round-date"/.test(app), '회차 목록 행에 점검일 칸');
assert.ok(/\$\{dateInput\}\s*\$\{typeSelect\}/.test(app), '단일·여러 동 행 모두');
assert.strictEqual((app.match(/\$\{dateInput\}/g) || []).length, 2);
assert.ok(/metaHint = `점검일 \$\{roundDate\}/.test(app), '회차 목록에 날짜 표시');
assert.ok(/window\.setSurveyRoundInspectionDate\(site, round, el\.value/.test(app));
assert.ok(/getCurrentSurveyRoundKey\(\), t\.value/.test(app), '점검 설정 칸은 지금 회차로 저장');

// 저장 함수: 같은 회차 동 모두, 같은 roundDates 필드, 다른 회차는 그대로
const start = app.indexOf('window.setSurveyRoundInspectionDate = function');
const end = app.indexOf('window.syncInspectionRoundDateInput = function');
const src = app.slice(start, end);
const dirty = [];
const ctx = {
    window: { BSA: { buildingMetaMerge: mm }, state: { currentBuilding: null, deletedBuildingIds: [] }, showToast() {} },
};
const b1 = { id: 'a', siteName: 'S', inspectionYear: '2026년', inspectionPeriod: '하반기', date: '2026-03-01' };
const b2 = { id: 'b', siteName: 'S', inspectionYear: '2026년', inspectionPeriod: '하반기' };
const b3 = { id: 'c', siteName: 'S', inspectionYear: '2026년', inspectionPeriod: '상반기', date: '2026-03-01' };
ctx.window.state.buildings = [b1, b2, b3];
const fn = new Function('window', 'filterActiveBuildings', 'getBuildingSiteName', 'getBuildingSurveyRoundKey', 'markBuildingMetaDirty', 'saveStateToLocalStorage', 'formatSurveyRoundLabel',
    src + '; return window.setSurveyRoundInspectionDate;')(
    ctx.window, (l) => l, (b) => b.siteName, (b) => `${b.inspectionYear}_${b.inspectionPeriod}`, (b) => dirty.push(b.id), () => {}, (k) => k);
assert.strictEqual(fn('S', '2026년_하반기', '2026-09-15'), 2);
assert.deepStrictEqual(dirty.sort(), ['a', 'b']);
assert.strictEqual(mm.getRoundDate(b1, '2026년_하반기'), '2026-09-15');
assert.strictEqual(mm.getRoundDate(b2, '2026년_하반기'), '2026-09-15');
assert.strictEqual(mm.getRoundDate(b3, '2026년_상반기'), '2026-03-01', '다른 회차는 그대로');
assert.strictEqual(fn('S', '2026년_하반기', '2026-09-15'), 0, '같은 값이면 저장 안 함');
console.log('test-round-date-in-round-ui ok');