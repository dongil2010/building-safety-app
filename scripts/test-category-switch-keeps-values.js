'use strict';
// 2026-10-28 수정창에서 구조체·비구조체·마감재 버튼을 눌러 분류를 바꿔도 부재 명칭·결함 종류(→ 폭·길이·개수 칸)·발생 원인이 지워지지 않는다.
// 목록(칩)만 새 분류로 바뀌고 입력값은 그대로 남는다. 2026-10-22 「미장 종류 → 비구조체 자동 전환(종류·부재 유지)」 경로는 그대로.
// (실제 화면 동작은 브라우저로 확인: 보·균열·0.35/2.4/3EA 입력 후 비구조체→마감재→구조체 모두 유지)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const at = app.indexOf("defectCategorySelect.addEventListener('change', (e) => {");
assert.ok(at > 0, '분류 change 핸들러를 찾지 못했다');
const end = app.indexOf("const defectComponentSelect = document.getElementById('defectComponent');", at);
const handler = app.slice(at, end);

// 1) 입력 칸을 비우지 않는다
assert.ok(!/compInput\.value\s*=\s*''/.test(handler) && !/typeInput\.value\s*=\s*''/.test(handler), '부재·종류 입력 칸을 비우면 안 된다');
assert.ok(!/populateDefectComponentDropdown\(cat,\s*''\)/.test(handler), '부재 목록을 빈 값으로 다시 만들면 안 된다');
assert.ok(!/updateDefectTypeDropdown\(cat,\s*''\)/.test(handler), '종류 목록을 빈 값으로 다시 만들면 안 된다');

// 2) 현재 값을 읽어 새 분류 목록에 그대로 넘긴다
assert.ok(/const keepComp = getDefectComboValue\(compSel, compInp\)/.test(handler));
assert.ok(/const keepType = getDefectComboValue\(typeSel, typeInp\)/.test(handler));
assert.ok(/populateDefectComponentDropdown\(cat, keepComp\)/.test(handler));
assert.ok(/updateDefectTypeDropdown\(cat, keepType\)/.test(handler));
// 발생 원인도 같은 종류면 유지
assert.ok(/getSelectedCausesFromUi\(\)/.test(handler) && /updateDefectCauseDropdown\(keepType, joinCauseList\(causesBefore\)\)/.test(handler));

// 3) 미장 자동 전환 경로(명시적 preserve)는 그대로
assert.ok(/if \(preserveType\) \{\s*populateDefectComponentDropdown\(cat, preserveComp \|\| ''\);\s*updateDefectTypeDropdown\(cat, preserveType\);/.test(handler));
const maybe = extractFunction(app, 'function maybeReclassifyPlasterCrackToNonStructural(');
assert.ok(/_preserveDefectTypeOnCategoryChange = typeVal/.test(maybe) && /_preserveDefectComponentOnCategoryChange = compVal/.test(maybe));
// 구조체를 눌렀는데 미장 종류가 남아 있으면 저장 때 어차피 비구조체가 되므로 바로 되돌리고 알린다
assert.ok(/if \(cat === '구조체' && typeof maybeReclassifyPlasterCrackToNonStructural === 'function'\)/.test(handler));
assert.ok(/bsaPlasterNonStructCategory/.test(app), '저장 시 미장→비구조체 규칙 그대로');

// 4) 분류 칩 클릭은 같은 change 핸들러를 거친다
const quick = extractFunction(app, 'function refreshDefectQuickPickBar(');
assert.ok(/renderQuickPickChipGroup\('quickCategoryChips', \['구조체', '비구조체', '마감재'\][\s\S]{0,400}categoryEl\.dispatchEvent\(new Event\('change'/.test(quick));

console.log('test-category-switch-keeps-values: OK');
