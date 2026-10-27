#!/usr/bin/env node
'use strict';

/**
 * 2026-10-27 엑셀(표) 가져오기: 위치칸이 공란이면 상세위치도 공란 — 부재명('2F 기둥')이 상세위치로 들어가지 않는다. (합성 예시 데이터)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractFunction(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(src.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

// ---- 코드 모양: 부재명을 위치로 끼워 넣던 대체값이 없어야 한다 ----
assert.ok(!/locationRaw \|\| `\$\{floorCode\} \$\{componentRaw\}`/.test(app), "'2F 기둥' 식 대체값이 남아 있으면 안 됨");
const newLocLines = app.split('\n').filter((l) => /location: locationRaw \|\| composeDefectLocation\('', floorCode\)/.test(l));
assert.strictEqual(newLocLines.length, 2, '새 결함 + 개구부 판별 두 곳 모두 공란 규칙');

// ---- 저장값 → 화면(상세위치·구분칸) ----
function makeCtx(grade, floorLabelMap) {
    const bldg = { facilityGrade: grade, floorsList: [] };
    const ctx = {
        state: { currentBuilding: bldg, currentFloor: '2F' },
        window: {},
        stripFloorCodeSuffix: (s) => String(s),
        isExteriorFloorCode: () => false
    };
    ctx.getFloorLabelFromCode = (fc) => floorLabelMap[fc] || fc;
    ctx.window.getFloorLabelFromCode = ctx.getFloorLabelFromCode;
    vm.createContext(ctx);
    vm.runInContext([
        extractFunction(app, 'function isGrade3Building('),
        extractFunction(app, 'function getGrade3FloorDisplayLabel('),
        extractFunction(app, 'function defectLocationUsesFloor('),
        extractFunction(app, 'function getDefectLocationFloorLabel('),
        extractFunction(app, 'function composeDefectLocation('),
        extractFunction(app, 'function extractDefectLocationDetail('),
        extractFunction(app, 'function grade3LocationDetailOnly('),
        'this.compose = composeDefectLocation; this.extract = extractDefectLocationDetail; this.g3detail = grade3LocationDetailOnly;'
    ].join('\n'), ctx);
    return ctx;
}
const labels = { '2F': '지상2층', '1F': '지상1층' };

// 1·2종: 공란 → '' (표시도 공란)
let c = makeCtx('제2종시설물', labels);
assert.strictEqual(c.compose('', '2F'), '');
assert.strictEqual(c.extract(c.compose('', '2F'), '2F'), '');
// 위치칸에 값이 있으면 그 값이 그대로(대체값은 locationRaw가 비었을 때만)
assert.ok(/location: locationRaw \|\| composeDefectLocation/.test(app));

// 3종: 공란 → 층 이름만, 상세위치칸·구분칸 상세는 공란
c = makeCtx('제3종시설물', labels);
const stored3 = c.compose('', '2F');
assert.strictEqual(stored3, '지상2층');
assert.strictEqual(c.extract(stored3, '2F'), '', '3종 상세위치칸 공란');
assert.strictEqual(c.g3detail(stored3, '2F', '지상2층'), '', '3종 구분칸 상세 공란');
assert.ok(!/기둥/.test(stored3), '부재명이 상세위치에 들어가지 않는다');
// 3종: 직접 입력 위치가 있으면 그대로 위에 층 이름
assert.strictEqual(c.compose('기둥 C1 하부', '2F'), '지상2층 기둥 C1 하부');
assert.strictEqual(c.extract('지상2층 기둥 C1 하부', '2F'), '기둥 C1 하부');

// 옛 값('2F 기둥')은 이 수정으로 바뀌지 않는다(저장된 데이터 불변) — 상세위치로 그대로 보인다
assert.strictEqual(c.extract('2F 기둥', '2F'), '2F 기둥');

// ---- 개구부 판별은 부재명(component)을 따로 받아 계속 동작 ----
const sb = { window: {} };
vm.createContext(sb);
vm.runInContext("const OPENING_POS_NAMES = ['창 상부', '창 하부', '창 측면', '문 상부', '문 측면'];\n"
    + extractFunction(app, 'function findOpeningPosInText(') + '\n'
    + extractFunction(app, 'function detectImportOpeningCrack(') + '\nthis.det = detectImportOpeningCrack;', sb);
assert.strictEqual(sb.det({ location: '', defectType: '균열', component: '개구부 벽체', size: '' }), true, '위치 공란이어도 부재명 개구부면 판별');
assert.strictEqual(sb.det({ location: '지상2층', defectType: '문 상부 수직균열', component: '벽체', size: '' }), true);
assert.strictEqual(sb.det({ location: '', defectType: '수직균열', component: '기둥', size: '' }), false);

console.log('test-import-blank-location OK');