/* 행·열(통심) 선 패널 정리 (2026-11-04): 선택한 선 카드 맨 위 · 폭은 선마다 하나씩(−/+ · 이전/다음 선) · 나머지는 접는 묶음 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

const st = app.indexOf('function renderGridPanel()');
const fn = app.slice(st, app.indexOf('async function onGridPanelClick(e)'));

// 패널 순서: 도구 → 힌트 → 선택한 선 카드 → 접는 묶음들
const order = ['grid-panel-tools', '${hint}', '${selHtml}', "sec('group'", "sec('zone'", "sec('auto'", "sec('loc'", "sec('danger'"].map((k) => fn.lastIndexOf(k));
order.forEach((v, i) => assert.ok(v > 0, `패널 구성 요소 ${i}`));
for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `패널 순서 ${i}`);

// 폭: 선마다 − / + 단추, 이웃 선 고르기, 기본으로, 그룹 전체에 이 폭
['bandStep', 'selPrev', 'selNext', 'bandReset', 'bandAll'].forEach((a) => {
    assert.ok(fn.includes(`data-act="${a}"`), `단추 ${a}`);
    assert.ok(app.includes(`act === '${a}'`) || app.includes(`(act === '${a.replace('Next', 'Prev')}' || act === '${a}')`), `처리 ${a}`);
});
assert.ok(fn.includes('data-f="lband"'), '폭 입력칸(직접 입력)은 그대로');
assert.ok(fn.includes('data-f="gband"'), '그룹 기본 폭은 그룹 설정에 그대로');

// 기능 빠짐 없음: 예전 패널의 모든 단추·칸이 그대로 있다
['data-act="autoDetect"', 'data-act="autoApply"', 'data-act="autoCancel"', 'data-act="zoneAdd"', 'data-act="zoneRedraw"', 'data-act="zoneDel"',
    'data-act="addGroup-col"', 'data-act="addGroup-row"', 'data-act="delGroup"', 'data-act="reverseOrder"', 'data-act="undoOrder"', 'data-act="renumber"',
    'data-act="bulkNames"', 'data-act="angleAll"', 'data-act="bend"', 'data-act="delVertex"', 'data-act="delLine"', 'data-act="splitGroup"',
    'data-act="copyFloors"', 'data-act="fillExisting"', 'data-act="recalcGrid"', 'data-act="clearDetail"', 'data-act="wipeDetail"', 'data-act="clearAll"',
    'data-act="clearDetailAll"', 'data-act="wipeDetailAll"', 'data-act="collapse"', 'data-act="close"',
    'data-f="zone"', 'data-f="zname"', 'data-f="zfloor"', 'data-f="group"', 'data-f="prefix"', 'data-f="start"', 'data-f="numbering"', 'data-f="gorder"', 'data-f="gskip"',
    'data-f="bulkNames"', 'data-f="gangle"', 'data-f="label"', 'data-f="langle"', 'data-f="lnum"', 'data-f="auto"', 'data-f="autoSens"', 'data-f="autoOuter"', 'data-f="autoAxes"',
].forEach((k) => assert.ok(fn.includes(k), `기능 유지 ${k}`));

// 접힘 상태 기억 + 스타일
assert.ok(/panel\.addEventListener\('toggle'/.test(app) && /ge\.sections/.test(app), '묶음 열림 상태 기억');
assert.ok(css.includes('.grid-lines-panel .grid-sel-card') && css.includes('.grid-lines-panel .grid-sec > summary'), '스타일');
console.log('test-grid-panel-layout OK');
