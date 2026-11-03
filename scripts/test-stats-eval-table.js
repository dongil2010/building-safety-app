#!/usr/bin/env node
'use strict';

/**
 * 2026-11-03 통계 「평가」 표 — 층 × 기둥·벽·큰보·작은보·슬래브, 균열폭 4구간 + 박리·박락·누수·철근노출.
 * stats.js에서 함수를 잘라 vm으로 돌린다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'tabs', 'stats.js'), 'utf8').replace(/\r\n/g, '\n');

function takeBlock(header, open, close) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, header + ' 없음');
    let depth = 0;
    for (let i = src.indexOf(open, at); i < src.length; i++) {
        if (src[i] === open) depth++;
        else if (src[i] === close) {
            depth--;
            if (depth === 0) return src.slice(at, i + 1);
        }
    }
    throw new Error(header);
}

const code = [
    takeBlock('var EVAL_MEMBERS = ', '[', ']') + ';',
    takeBlock('var EVAL_COLUMNS = ', '[', ']') + ';',
    takeBlock('function classifyEvalKinds(', '{', '}'),
    takeBlock('function evalMembersFor(', '{', '}'),
    takeBlock('function buildEvalTableRows(', '{', '}'),
    takeBlock('function evalTableToTsv(', '{', '}')
].join('\n');
const sb = {};
vm.createContext(sb);
vm.runInContext(code + '\nthis.api = { EVAL_MEMBERS, EVAL_COLUMNS, classifyEvalKinds, buildEvalTableRows, evalTableToTsv };', sb);
const A = sb.api;

// 열은 양식 순서
assert.deepStrictEqual(Array.from(A.EVAL_COLUMNS, (c) => c.key), ['lt02', 'lt03', 'lt05', 'ge05', 'peel', 'fall', 'leak', 'rebar']);
assert.deepStrictEqual(Array.from(A.EVAL_MEMBERS.filter((m) => !m.optional), (m) => m.label), ['기둥', '벽', '큰보', '작은보', '슬래브']);

// 박리·박락은 따로, 뿜칠·내화피복 탈락은 콘크리트 결함이 아니다
const k = (type, component) => JSON.parse(JSON.stringify(A.classifyEvalKinds({ defectType: type, component: component || '기둥' })));
assert.deepStrictEqual(k('박리'), { peel: true, fall: false, leak: false, rebar: false });
assert.deepStrictEqual(k('박락 및 철근노출'), { peel: false, fall: true, leak: false, rebar: true });
assert.deepStrictEqual(k('들뜸'), { peel: true, fall: false, leak: false, rebar: false });
assert.deepStrictEqual(k('누수흔적, 백태'), { peel: false, fall: false, leak: true, rebar: false });
assert.deepStrictEqual(k('뿜칠 박락'), { peel: false, fall: false, leak: false, rebar: false });
assert.deepStrictEqual(k('박리', '철골보 내화피복'), { peel: false, fall: false, leak: false, rebar: false });

// 표 줄: 결함 있는 층만, 층마다 기본 5부재 + G/B 미지정 보는 있을 때만, 맨 아래 합계
const payload = {
    floorRows: [
        {
            floorCode: 'B2F', floorLabel: '지하2층', rowCount: 3,
            componentEval: { column: { lt02: 3, lt03: 2, peel: 1 }, other: { lt02: 9 } },
            componentEvalNos: { column: { lt02: ['3', '1', '2'] } }
        },
        { floorCode: 'B1F', floorLabel: '지하1층', rowCount: 0, componentEval: {} },
        {
            floorCode: '1F', floorLabel: '지상1층', rowCount: 2,
            componentEval: { column: { lt02: 1 }, upperBeam: { ge05: 1 } },
            componentEvalNos: {}
        }
    ]
};
const rows = JSON.parse(JSON.stringify(A.buildEvalTableRows(payload)));
assert.deepStrictEqual(rows.map((r) => r.label), ['지하2층', '지상1층', '합계'], '결함 없는 층 빼고 합계');
assert.deepStrictEqual(rows[0].members.map((m) => m.label), ['기둥', '벽', '큰보', '작은보', '슬래브'], '기타 부재는 표에 없음');
assert.deepStrictEqual(rows[1].members.map((m) => m.label), ['기둥', '벽', '큰보', '작은보', '슬래브', '보(G/B 미지정)']);
const col = (row, member, key) => row.members.find((m) => m.label === member).cells.find((c) => c.key === key);
assert.strictEqual(col(rows[0], '기둥', 'lt02').n, 3);
assert.deepStrictEqual(Array.from(col(rows[0], '기둥', 'lt02').nos), ['3', '1', '2']);
assert.strictEqual(col(rows[0], '기둥', 'peel').n, 1);
assert.strictEqual(col(rows[2], '기둥', 'lt02').n, 4, '합계');
assert.strictEqual(col(rows[2], '보(G/B 미지정)', 'ge05').n, 1);
assert.ok(rows[2].isTotal);

// 표 복사: 탭 구분, 층 이름은 첫 줄에만, 0은 빈칸
const tsv = A.evalTableToTsv(rows).split('\n');
assert.strictEqual(tsv[0], '위치\t부재\t0.2mm 미만\t0.3mm 미만\t0.5mm 미만\t0.5mm 이상\t콘크리트 박리\t콘크리트 박락\t누수·백태\t철근노출');
assert.strictEqual(tsv[1], '지하2층\t기둥\t3\t2\t\t\t1\t\t\t');
assert.strictEqual(tsv[2], '\t벽\t\t\t\t\t\t\t\t');
assert.strictEqual(tsv.length, 1 + 5 + 6 + 6);

// 집계 연결: 균열 구간은 구조체 부재만(구조체 아닌 부재는 기타로 빠짐), 결과가 층 줄에 실림
assert.ok(/addEval\(bin\);/.test(src), '균열폭 구간을 평가 칸에도 더한다');
assert.ok(src.includes("['peel', 'fall', 'leak', 'rebar'].forEach(function (k) { if (evalKinds[k]) addEval(k); });"));
assert.ok(src.includes('componentEval: floorComponentEval,') && src.includes('componentEvalNos: floorComponentEvalNos,'));
assert.ok(src.includes("[document.getElementById('statsEvalSection'), vis.evalTable],"), '대분류 전환 때 보이기/숨기기');
assert.ok(src.includes('renderEvalTable(bldg ? payload : null, ensureEvalMount());'));

console.log('test-stats-eval-table: OK');
