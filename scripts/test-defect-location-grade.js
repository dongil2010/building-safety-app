#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 (실험 exp/grid-lines) 결함 위치칸 — 3종 시설물만 층을 자동으로 넣고, 1·2종은 공란.
 *  - 1·2종: 실 이름을 적으면 그 값만, 안 적으면 ''. 행·열(gridLoc)은 따로(한글/PDF 위치 칸 첫 줄).
 *  - 3종: 지금처럼 「지상1층」 / 「지상1층 거실」.
 *  - 상태조사표·사진 캡션에서 위치가 비었을 때 「층 + 부재」로 채우는 것도 3종만.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const takeFn = (name) => {
    const st = app.indexOf(`function ${name}(`);
    if (st < 0) throw new Error(`missing ${name}`);
    let depth = 0;
    for (let i = app.indexOf('{', st); i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) return app.slice(st, i + 1); }
    }
    throw new Error(name);
};

const sb = {
    state: { currentBuilding: { facilityGrade: '제1종시설물' }, currentFloor: '1F' },
    getGrade3FloorDisplayLabel: (fc) => ({ '1F': '지상1층', B1F: '지하1층' }[fc] || fc)
};
vm.createContext(sb);
vm.runInContext(['isGrade3Building', 'defectLocationUsesFloor', 'getDefectLocationFloorLabel', 'composeDefectLocation', 'extractDefectLocationDetail']
    .map(takeFn).join('\n') + '\nthis.compose = composeDefectLocation; this.extract = extractDefectLocationDetail;', sb);

['제1종시설물', '제2종시설물', '', '1종'].forEach((g) => {
    sb.state.currentBuilding.facilityGrade = g;
    assert.strictEqual(sb.compose(''), '', `1·2종(${g || '미지정'}): 비우면 공란`);
    assert.strictEqual(sb.compose('  거실 '), '거실', `1·2종(${g || '미지정'}): 실 이름만`);
    assert.strictEqual(sb.compose('거실', 'B1F'), '거실', '다른 층이어도 층 안 붙임');
    assert.strictEqual(sb.compose('지상1층 거실'), '지상1층 거실', '직접 쓴 층은 그대로');
});
sb.state.currentBuilding.facilityGrade = '제3종시설물';
assert.strictEqual(sb.compose(''), '지상1층', '3종: 비우면 층');
assert.strictEqual(sb.compose('거실'), '지상1층 거실', '3종: 층 + 실 이름');
assert.strictEqual(sb.compose('거실', 'B1F'), '지하1층 거실');
assert.strictEqual(sb.compose('지상1층 거실'), '지상1층 거실', '3종: 층 두 번 안 붙임');
// 수정창에 보여 줄 상세 위치(층 떼기)는 그대로 — 예전 1·2종 데이터 「지상1층 거실」도 창에는 「거실」
sb.state.currentBuilding.facilityGrade = '제1종시설물';
assert.strictEqual(sb.extract('지상1층 거실'), '거실');
assert.strictEqual(sb.extract('지상1층'), '');
assert.strictEqual(sb.extract('거실'), '거실');

// 층을 대신 채우던 곳: 3종만
const cellFn = takeFn('getSurveyCellText');
const locCase = cellFn.slice(cellFn.indexOf("case 'location':"), cellFn.indexOf("case 'component':"));
assert.ok(locCase.includes('if (d.location) return d.location;'), '적은 위치는 그대로');
assert.ok(/defectLocationUsesFloor\(\) \? \(\(ctx\.floorCode \|\| state\.currentFloor\) \+ ' ' \+ \(memberNameOut\(d\.component\) \|\| '기둥'\)\) : ''/.test(locCase), '비었을 때 층+부재는 3종만');
assert.ok(app.includes("location: d.location || (defectLocationUsesFloor() ? `${floorDisplayLabel} ${memberNameOut(d.component) || ''}` : ''),"), '사진대지 위치도 3종만 층');
assert.ok(app.includes("location: defectLocationUsesFloor() ? state.currentFloor : '',"), 'CAD 번호 가져오기도 3종만 층');
assert.ok(!/location:\s*state\.currentFloor,/.test(app), '층 코드를 위치에 바로 넣는 곳 없음');
// 새 마킹·마킹 추가·일괄 수정은 composeDefectLocation을 거침
assert.ok(app.includes("location: composeDefectLocation(document.getElementById('defectLocation')?.value || '')"), '수정창/일괄 수정 저장');
assert.ok(app.includes("location: src.location || composeDefectLocation(''),"), '마킹 추가 화살표');
// 1·2종 한글/PDF 위치 칸: 행·열 첫 줄 + 실 이름 둘째 줄 구조는 그대로
assert.ok(takeFn('getReportSurveyRowValues').includes('const gridLocCell = '), '행·열 두 줄 구조 유지');

console.log('test-defect-location-grade: OK');
