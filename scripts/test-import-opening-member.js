#!/usr/bin/env node
'use strict';

/**
 * 2026-10-27 엑셀 가져오기: 부재명칭 칸의 개구부 말(문 상부·문 측면·창 상부·창 하부·창 측면 — 띄어쓰기 무관, 개구부 주위, 개구부)을
 * 지우고 → 개구부 결함 체크 + 개구부 종류 칩(openingPos) 저장, 한글 조사내용은 「창 상부 벽체 수직균열」. (합성 예시 데이터)
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

// ---- 가져오기 연결 ----
const imp = app.slice(app.indexOf('window.confirmImportDefectExcel = async'));
assert.ok(/const openingFromMember = extractOpeningFromMemberName\(componentCellRaw\);/.test(imp), '부재명칭에서 개구부 말 찾기');
assert.ok(/(?:const|let) componentRaw = componentCellClean \|\| '기타';/.test(imp), '지운 부재명 사용');
assert.ok(/pick\(componentCellClean, existing\.component, '기타'\)/.test(imp), '기존 결함 합치기도 지운 부재명');
assert.strictEqual((imp.match(/openingFromMember: openingFromMember\.found/g) || []).length, 2, '새 결함·기존 결함 모두 개구부 체크 판정에 반영');
assert.ok(/openingFromMember\.pos \|\| findOpeningPosInText\(defectType\)/.test(imp), '새 결함 개구부 종류: 부재명칭 우선');
assert.ok(/if \(opPosM\) existing\.openingPos = opPosM;/.test(imp), '기존 결함에도 종류 저장');

const sb = { window: {} };
vm.createContext(sb);
vm.runInContext([
    "const OPENING_POS_NAMES = ['창 상부', '창 하부', '창 측면', '문 상부', '문 측면'];",
    extractFunction(app, 'function findOpeningPosInText('),
    extractFunction(app, 'function stripOpeningPosPrefix('),
    extractFunction(app, 'function parseDefectTypeList('),
    extractFunction(app, 'function joinDefectTypeList('),
    extractFunction(app, 'function formatOpeningAwareDefectType('),
    extractFunction(app, 'function extractOpeningFromMemberName('),
    extractFunction(app, 'function detectImportOpeningCrack('),
    extractFunction(app, 'function surveyContentComponentText('),
    'function isGoodDefectType(t) { return t === "상태양호"; }',
    'function memberNameOut(v) { return v; }',
    "function getSurveyCellText(col, d) { return col === 'component' ? (memberNameOut(d.component) || '기둥') : (col === 'defectType' ? formatOpeningAwareDefectType(d) : ''); }",
    'this.ext = extractOpeningFromMemberName; this.det = detectImportOpeningCrack; this.fmt = formatOpeningAwareDefectType; this.cc = surveyContentComponentText;',
    'this.content = function (d) { return [surveyContentComponentText(d), getSurveyCellText("defectType", d)].map((s) => (s || "").trim()).filter((s) => s && s !== "-").join(" "); };'
].join('\n'), sb);

const E = (s) => { const r = sb.ext(s); return `${r.found}|${r.pos}|${r.component}`; };

// ---- 부재명칭에서 찾아 지우기 ----
assert.strictEqual(E('문 상부 벽체'), 'true|문 상부|벽체');
assert.strictEqual(E('문상부 벽체'), 'true|문 상부|벽체');
assert.strictEqual(E('문 측면 벽체'), 'true|문 측면|벽체');
assert.strictEqual(E('문측면'), 'true|문 측면|');
assert.strictEqual(E('창 상부'), 'true|창 상부|');
assert.strictEqual(E('창상부'), 'true|창 상부|');
assert.strictEqual(E('창 하부 벽체'), 'true|창 하부|벽체');
assert.strictEqual(E('창하부'), 'true|창 하부|');
assert.strictEqual(E('창 측면 벽체'), 'true|창 측면|벽체');
assert.strictEqual(E('창측면'), 'true|창 측면|');
assert.strictEqual(E('창   상부   벽체'), 'true|창 상부|벽체', '띄어쓰기 여러 칸');
assert.strictEqual(E('벽체(창 하부)'), 'true|창 하부|벽체', '괄호 안 키워드');
assert.strictEqual(E('벽체 / 문 상부'), 'true|문 상부|벽체', '구분자 정리');
assert.strictEqual(E('(창 상부) 벽체'), 'true|창 상부|벽체');
assert.strictEqual(E('개구부 주위 벽체'), 'true||벽체', '종류 없음');
assert.strictEqual(E('개구부주위 벽체'), 'true||벽체');
assert.strictEqual(E('개구부'), 'true||', '개구부만');
assert.strictEqual(E('개구부 벽체'), 'true||벽체');
assert.strictEqual(E('벽체'), 'false||벽체', '키워드 없으면 그대로');
assert.strictEqual(E('기둥'), 'false||기둥');
assert.strictEqual(E(''), 'false||');
assert.strictEqual(E('문 하부 벽체'), 'false||문 하부 벽체', '목록에 없는 조합은 그대로');
assert.strictEqual(E('출입문 상부'), 'true|문 상부|출입문 상부', '낱말에 붙은 「문」은 글을 지우지 않고 종류만');

// ---- 개구부 결함 체크 판정 ----
assert.strictEqual(sb.det({ location: '', defectType: '수직균열', component: '벽체', size: '', openingFromMember: true }), true, '부재명칭에서 찾으면 체크');
assert.strictEqual(sb.det({ location: '', defectType: '수직균열', component: '벽체', size: '', openingFromMember: false }), false);
assert.strictEqual(sb.det({ location: '', defectType: '상태양호', component: '벽체', size: '', isGood: true, openingFromMember: true }), false, '상태양호는 체크 안 함');
assert.strictEqual(sb.det({ location: '', defectType: '창 상부 균열', component: '벽체', size: '' }), true, '결함 내용에서 인식하던 기존 판정 유지');

// ---- 한글 출력 ----
assert.strictEqual(sb.fmt({ defectType: '수직균열', openingPos: '창 상부', isOpeningCrack: true }), '창 상부 벽체 수직균열');
assert.strictEqual(sb.fmt({ defectType: '수직균열', openingPos: '문 상부', isOpeningCrack: true }), '문 상부 벽체 수직균열');
// 조사내용 전체(부재 + 결함 내용): 「벽체」가 겹치지 않는다
assert.strictEqual(sb.content({ component: '벽체', defectType: '수직균열', openingPos: '창 상부', isOpeningCrack: true }), '창 상부 벽체 수직균열');
assert.strictEqual(sb.content({ component: '벽체', defectType: '균열', openingPos: '문 측면', isOpeningCrack: true }), '문 측면 벽체 균열');
assert.strictEqual(sb.content({ component: '벽체', defectType: '수직균열, 누수', openingPos: '창 하부', isOpeningCrack: true }), '창 하부 벽체 수직균열, 창 하부 벽체 누수');
assert.strictEqual(sb.content({ component: '기둥', defectType: '수직균열', openingPos: '창 상부', isOpeningCrack: true }), '기둥 창 상부 벽체 수직균열', '다른 부재는 그대로 앞에');
assert.strictEqual(sb.content({ component: '벽체', defectType: '수직균열', isOpeningCrack: true }), '벽체 개구부 주위 수직균열', '종류를 모르면 예전 표기');
assert.strictEqual(sb.content({ component: '벽체', defectType: '수직균열' }), '벽체 수직균열', '개구부 아닌 결함은 그대로');
// 가져온 값(부재명칭 '창 상부 벽체' → 벽체 + 종류)이 결함 내용에서 읽은 값과 같은 결과
const r = sb.ext('창상부 벽체');
assert.strictEqual(sb.content({ component: r.component, defectType: '수직균열', openingPos: r.pos, isOpeningCrack: true }),
    sb.content({ component: '벽체', defectType: '창상부 수직균열', isOpeningCrack: true }), '부재명칭에서 얻은 것 = 결함 내용에서 얻은 것');

// 조사내용을 만드는 곳은 모두 중복 방지 도우미를 쓴다
['const headParts = [surveyContentComponentText(d, ctx),', 'const content = [surveyContentComponentText(d),',
    '[surveyContentComponentText(slot1.d),', '[surveyContentComponentText(slot2.d),'].forEach((s) => assert.ok(app.includes(s), s));

console.log('test-import-opening-member OK');