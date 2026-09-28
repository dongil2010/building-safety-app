#!/usr/bin/env node
/* 2026-09-28 진행여부·누수여부는 사용자가 정한 값만 — 조사내용 글자(누수·백태)로 켜지 않음 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const app = read('app.js');
const hwpx = read('js/shared/hwpx-import.js');

function extractFn(src, name) {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start >= 0, 'function ' + name);
    const open = src.indexOf('{', src.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error('unterminated ' + name);
}

// ---- 한글(HWPX) 가져오기 ----
const hsb = { window: {}, console };
vm.createContext(hsb);
vm.runInContext(['isMarkOn', 'isFlagCellOn', 'extractProgressLeakMarkers', 'normalizeImportedMember',
    'splitInspectionContent', 'parseGrade3Row', 'parseGrade12Row'].map((n) => extractFn(hwpx, n)).join('\n')
    + '\n;this.__h = { isFlagCellOn, extractProgressLeakMarkers, parseGrade3Row, parseGrade12Row };', hsb);
const h = hsb.__h;

// 3종: '누수 흔적'·'백태' 글자만으로는 누수여부/진행여부가 켜지지 않는다
let r = h.parseGrade3Row(['1', '1F', '○', '', '슬래브 누수흔적', '결함부위 수분유입', '']);
assert.strictEqual(r.isLeak, false, '누수흔적 글자만으로 누수 켜지 않음');
assert.strictEqual(r.isProgress, false);
r = h.parseGrade3Row(['2', '1F', '○', '', '벽체 백태 및 누수 0.3x0.5', '결함부위 수분유입', '']);
assert.strictEqual(r.isLeak, false);
assert.strictEqual(r.isProgress, false);
// 이 앱이 출력한 표기(진행中·누수中)는 여부로 읽고 조사내용에서는 뗀다
r = h.parseGrade3Row(['3', '1F', '○', '', '슬래브 균열 0.3/1.2 진행中 누수中', '건조수축', '']);
assert.strictEqual(r.isProgress, true);
assert.strictEqual(r.isLeak, true);
assert.ok(!/中/.test(r.defectType) && !/中/.test(r.size), 'markers stripped: ' + r.defectType + ' ' + r.size);
r = h.parseGrade3Row(['4', '1F', '○', '', '벽체 누수흔적 누수中', '수분유입', '']);
assert.strictEqual(r.isLeak, true);
assert.strictEqual(r.isProgress, false, '누수中만 있으면 진행여부는 꺼짐');
assert.strictEqual(r.defectType, '누수흔적');
r = h.parseGrade3Row(['5', '1F', '○', '', '벽체 상태양호 진행中', '', '']);
assert.strictEqual(r.isProgress, false, '상태양호는 여부 없음');

const mk = h.extractProgressLeakMarkers('기둥 균열 진행 中');
assert.strictEqual(mk.progress, true);
assert.strictEqual(mk.text, '기둥 균열');
assert.strictEqual(h.extractProgressLeakMarkers('누수흔적').leak, false);

// 1·2종: ○ 와 진행中 / 진행\n中 / 누수中 모두 켜짐, '-'·빈칸은 꺼짐
assert.strictEqual(h.isFlagCellOn('○', '진행'), true);
assert.strictEqual(h.isFlagCellOn('진행\n中', '진행'), true);
assert.strictEqual(h.isFlagCellOn('진행中', '진행'), true);
assert.strictEqual(h.isFlagCellOn('누수 中', '누수'), true);
assert.strictEqual(h.isFlagCellOn('-', '진행'), false);
assert.strictEqual(h.isFlagCellOn('누수中', '진행'), false, '다른 칸 표기는 아님');
r = h.parseGrade12Row(['1', '1F 복도', '벽체 누수흔적', '', '○', '', '-', '누수\n中', '수분유입', '']);
assert.strictEqual(r.isProgress, false, '누수 조사내용이라도 진행 칸이 - 면 진행 아님');
assert.strictEqual(r.isLeak, true);
r = h.parseGrade12Row(['2', '1F 복도', '벽체 백태', '', '○', '', '-', '-', '수분유입', '']);
assert.strictEqual(r.isProgress, false);
assert.strictEqual(r.isLeak, false);
r = h.parseGrade12Row(['3', '1F', '기둥 균열', '0.3/1.2', '○', '', '진행\n中', '-', '건조수축', '']);
assert.strictEqual(r.isProgress, true);
assert.ok(!/inspection\.includes\('누수'\)/.test(hwpx), 'no keyword rule');

// ---- 엑셀/한글 가져오기 공통 ----
const asb = { console };
vm.createContext(asb);
const defsStart = app.indexOf('    const IMPORT_DEFECT_FIELD_DEFS = [');
const defsEnd = app.indexOf('    function guessImportColumnForField(');
vm.runInContext(app.slice(defsStart, defsEnd) + extractFn(app, 'guessImportColumnForField') + '\n' + extractFn(app, 'resolveImportFlag')
    + '\n;this.__a = { IMPORT_DEFECT_FIELD_DEFS, guessImportColumnForField, resolveImportFlag };', asb);
const a = asb.__a;
['○', 'O', '진행중', '진행中', '누수중', 'Y', '1', '예'].forEach((v) => assert.strictEqual(a.resolveImportFlag(v), true, 'on ' + v));
['', '-', 'x', 'X', '×', '없음', '해당없음', '해당 없음', '미진행', '비진행', '무', '진행없음', '누수 없음', 'no', 'N', '0', 'none']
    .forEach((v) => assert.strictEqual(a.resolveImportFlag(v), false, 'off ' + v));
// 한글 가져오기 머리글 '진행'·'누수'가 진행여부·누수여부로 연결
const hwpxHeaders = ['번호', '부재', '구분', '조사내용', '위치', '크기', '균열폭', '균열길이', '진행', '누수', '원인'];
const field = (k) => a.IMPORT_DEFECT_FIELD_DEFS.find((f) => f.key === k);
assert.strictEqual(a.guessImportColumnForField(hwpxHeaders, field('progress').aliases), 8);
assert.strictEqual(a.guessImportColumnForField(hwpxHeaders, field('leak').aliases), 9);
assert.strictEqual(a.guessImportColumnForField(hwpxHeaders, field('defectType').aliases), 3);
const xlsHeaders = ['번호', '부재명칭', '구분', '조사내용', '위치', '결함크기', '균열폭', '균열길이', '진행여부', '누수여부', '결함원인추정'];
assert.strictEqual(a.guessImportColumnForField(xlsHeaders, field('progress').aliases), 8);
assert.strictEqual(a.guessImportColumnForField(xlsHeaders, field('leak').aliases), 9);

// ---- 출력: 저장된 여부만 따른다 ----
const osb = { console };
vm.createContext(osb);
vm.runInContext(extractFn(app, 'appendGrade3ProgressLeakToContent') + '\n;this.f = appendGrade3ProgressLeakToContent;', osb);
assert.strictEqual(osb.f('벽체 누수흔적', { isProgress: false, isLeak: false }), '벽체 누수흔적');
assert.strictEqual(osb.f('벽체 백태', {}), '벽체 백태');
assert.strictEqual(osb.f('벽체 누수흔적', { isLeak: true }), '벽체 누수흔적 누수中');
assert.strictEqual(osb.f('기둥 균열 0.3/1.2', { isProgress: true }), '기둥 균열 0.3/1.2 진행中');
assert.strictEqual(osb.f('벽체 누수흔적 누수中', { isLeak: true }), '벽체 누수흔적 누수中', '두 번 붙이지 않음');
assert.ok(app.includes("const progress = d.isProgress ? '진행\\n中' : '-';"), '1·2종 표 진행 칸은 isProgress만');
assert.ok(app.includes("case 'progress': return d.isProgress ? getSurveyProgressLabel(isGrade3Building()) : '-';"));

// 새 결함은 진행·누수 꺼진 채로 시작, 저장은 체크박스 값
assert.ok(/if \(progCheckEl\) progCheckEl\.checked = false;/.test(app));
assert.ok(app.includes("const isProgress = document.getElementById('defectProgressCheck')?.checked || false;"));
// 결함 종류·원인 글자로 진행/누수를 켜는 코드가 없어야 한다
const autoRule = /(isProgress|isLeak|defectProgressCheck|defectLeakCheck|progCheckEl|leakCheckEl)[^;\n]*(누수|백태)[^;\n]*(includes|test|match)/;
assert.ok(!autoRule.test(app), 'no keyword → flag rule in app.js');

// 조사표 토글: 그룹 줄은 보이는 값(멤버 중 하나라도) 기준으로 다음 값
const toggle = app.slice(app.indexOf('window.toggleSurveyInlineFlag = function'), app.indexOf('window.updateSurveyInlineField = function'));
assert.ok(toggle.includes('consolidateDefectGroups(list)') && toggle.includes("next = cur.isProgress ? '0' : '1';"));
console.log('test-progress-flags: OK');
