/* 점검 날짜를 바꾸면 건축물 목록(📅 점검 날짜)에 바로 보인다 (2026-11-04)
 * - 회차 점검일 설정 함수는 목록을 다시 그린다
 * - 현장 정보 수정 창에서 날짜를 바꾸면 같은 현장·같은 회차의 다른 동에도 적용(목록은 최종 회차 동들 중 가장 이른 날짜를 보여 주므로) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const setter = app.slice(app.indexOf('window.setSurveyRoundInspectionDate = function'), app.indexOf('window.syncInspectionRoundDateInput = function'));
assert.ok(/window\.renderDashboard\(\)/.test(setter), '점검일을 정하면 목록을 다시 그린다');
const save = app.slice(app.indexOf('const editRoundDateKey ='), app.indexOf('const editRoundDateKey =') + 6000);
assert.ok(/editRoundDatePrev/.test(save) && /mmEdit\.setRoundDate\(sib, newRoundKey, date\)/.test(save), '수정 창 날짜를 같은 회차 다른 동에도 적용');
assert.ok(/inArr\.roundDates = JSON\.parse/.test(save), '목록의 건물에도 날짜를 복사');
// 데이터 규칙: 회차 날짜가 건물 공통 점검일보다 우선
const mm = require('../js/core/building-meta-merge.js');
const b = { date: '2026-07-01', roundDates: {} };
assert.strictEqual(mm.getRoundDate(b, 'r'), '2026-07-01');
mm.setRoundDate(b, 'r', '2026-11-04');
assert.strictEqual(mm.getRoundDate(b, 'r'), '2026-11-04');
console.log('test-inspection-date-list OK');
