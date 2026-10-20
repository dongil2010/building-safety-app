'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mm = require('../js/core/building-meta-merge.js');

// 회차 날짜 없음 → 건물 공통 점검일
const old = { date: '2026-03-02', inspectionYear: '2026년', inspectionPeriod: '상반기' };
assert.strictEqual(mm.getRoundDate(old, '2026년_상반기'), '2026-03-02');
assert.strictEqual(mm.getRoundDate(old, '2026년_하반기'), '2026-03-02');

// 옛 데이터 옮기기: 시각 0으로 적어 두고 날짜는 그대로
assert.strictEqual(mm.seedRoundDate(old, '2026년_상반기'), true);
assert.deepStrictEqual(old.roundDates['2026년_상반기'], { date: '2026-03-02', at: 0 });
assert.strictEqual(mm.seedRoundDate(old, '2026년_상반기'), false);

// 회차마다 따로
const b = { date: '2026-03-02' };
mm.setRoundDate(b, '2026년_상반기', '2026-03-02', 100);
mm.setRoundDate(b, '2026년_하반기', '2026-09-15', 200);
assert.strictEqual(mm.getRoundDate(b, '2026년_하반기'), '2026-09-15');
assert.strictEqual(mm.getRoundDate(b, '2026년_상반기'), '2026-03-02');
assert.strictEqual(mm.setRoundDate(b, '2026년_하반기', '2026-09-15', 300), false, '같은 값이면 시각 안 찍음');
// 비우면 공통 점검일로
mm.setRoundDate(b, '2026년_하반기', '', 400);
assert.strictEqual(mm.getRoundDate(b, '2026년_하반기'), '2026-03-02');

// 병합: 회차마다 나중에 고친 쪽, 다른 회차를 고친 두 기기가 서로 안 지움
const local = { '2026년_상반기': { date: '2026-03-05', at: 500 }, '2026년_하반기': { date: '2026-09-01', at: 100 } };
const remote = { '2026년_상반기': { date: '2026-03-01', at: 200 }, '2026년_하반기': { date: '2026-09-20', at: 600 }, '2025년_하반기': { date: '2025-10-01', at: 50 } };
const m = mm.mergeRoundDates(local, remote);
assert.strictEqual(m['2026년_상반기'].date, '2026-03-05');
assert.strictEqual(m['2026년_하반기'].date, '2026-09-20');
assert.strictEqual(m['2025년_하반기'].date, '2025-10-01');
// 옛 문자열 값도 읽음, 시각 0 씨앗은 실제 수정에 짐
const m2 = mm.mergeRoundDates({ k: { date: '2026-01-01', at: 0 } }, { k: '2026-02-02' });
assert.strictEqual(m2.k.date, '2026-01-01', '동점이면 로컬');
const m3 = mm.mergeRoundDates({ k: { date: '2026-01-01', at: 0 } }, { k: { date: '2026-02-02', at: 9 } });
assert.strictEqual(m3.k.date, '2026-02-02');

// overlay가 원격 기준 건물에 회차 날짜를 칸별로 합침
const remoteB = { id: 'x', roundDates: remote };
const merged = Object.assign({}, remoteB);
mm.overlay(merged, { id: 'x', roundDates: local }, remoteB);
assert.strictEqual(merged.roundDates['2026년_상반기'].date, '2026-03-05');
assert.strictEqual(merged.roundDates['2026년_하반기'].date, '2026-09-20');

// app.js: 재령일·수정창이 회차 점검일을 쓰는지
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(/getBuildingInspectionDate\(bldg\) \|\| '오늘'/.test(app));
assert.ok(!/bldg\.date \? parseYmdParts\(bldg\.date\)/.test(app), '강도 재령일이 공통 점검일을 직접 읽지 않음');
assert.ok(/applyEditRoundDates\(bldg,/.test(app));
assert.ok(/seedRoundDate\(bldg, fromKey\)/.test(app));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.includes('id="editRoundDatesList"'));
console.log('test-round-inspection-dates ok');