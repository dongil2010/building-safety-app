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
    takeBlock('function evalMergeFloors(', '{', '}'),
    takeBlock('function evalSumTotals(', '{', '}'),
    takeBlock('function evalRowFrom(', '{', '}'),
    takeBlock('function evalFloorRangeLabel(', '{', '}'),
    takeBlock('function buildEvalTableRows(', '{', '}'),
    takeBlock('function evalTableToTsv(', '{', '}')
].join('\n');
const sb = {};
vm.createContext(sb);
vm.runInContext(code + '\nthis.api = { evalFloorRangeLabel, EVAL_MEMBERS, EVAL_COLUMNS, classifyEvalKinds, buildEvalTableRows, evalTableToTsv };', sb);
const A = sb.api;

// 열은 양식 순서
assert.deepStrictEqual(Array.from(A.EVAL_COLUMNS, (c) => c.key), ['lt02', 'lt03', 'lt05', 'ge05', 'peel', 'fall', 'leakTrace', 'efflo', 'leakNow', 'rebar']);
assert.deepStrictEqual(Array.from(A.EVAL_MEMBERS.filter((m) => !m.optional), (m) => m.label), ['기둥', '벽', '큰보', '작은보', '슬래브']);

// 박리·박락은 따로, 뿜칠·내화피복 탈락은 콘크리트 결함이 아니다
const k = (type, component, isLeak) => JSON.parse(JSON.stringify(A.classifyEvalKinds({ defectType: type, component: component || '기둥', isLeak })));
const K = (o) => Object.assign({ peel: false, fall: false, leakNow: false, leakTrace: false, efflo: false, rebar: false }, o);
assert.deepStrictEqual(k('박리'), K({ peel: true }));
assert.deepStrictEqual(k('박락 및 철근노출'), K({ fall: true, rebar: true }));
assert.deepStrictEqual(k('들뜸'), K({ fall: true }));
assert.deepStrictEqual(k('층분리'), K({ fall: true }));
// 2026-11-04 누수 셋으로: 누수중(누수여부 켬·「누수중」) / 누수흔적(그 밖의 누수) / 백태
// 한 결함은 한 칸만: 누수중 > 백태 > 누수흔적
assert.deepStrictEqual(k('누수흔적, 백태'), K({ efflo: true }), '누수흔적 및 백태 = 백태');
assert.deepStrictEqual(k('누수, 백태'), K({ efflo: true }), '누수여부 끔이면 백태');
assert.deepStrictEqual(k('누수, 백태', '슬래브', true), K({ leakNow: true }), '누수여부 켬이면 누수중');
assert.deepStrictEqual(k('누수중 및 백태'), K({ leakNow: true }), '누수중이 들어 있으면 누수중');
assert.deepStrictEqual(k('누수'), K({ leakTrace: true }), '그냥 누수 = 누수흔적');
assert.deepStrictEqual(k('누수 흔적'), K({ leakTrace: true }));
assert.deepStrictEqual(k('누수흔적', '슬래브', true), K({ leakNow: true }), '누수여부를 켜면 누수중(흔적과 겹쳐 세지 않음)');
assert.deepStrictEqual(k('누수中'), K({ leakNow: true }));
assert.deepStrictEqual(k('백태'), K({ efflo: true }));
assert.deepStrictEqual(k('균열', '슬래브', true), K({ leakNow: true }), '균열이어도 누수여부 켬이면 누수중');
assert.deepStrictEqual(k('뿜칠 박락'), K({}));
assert.deepStrictEqual(k('박리', '철골보 내화피복'), K({}));

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
assert.strictEqual(tsv[0], '위치\t부재(개소)\t0.2mm 미만\t0.3mm 미만\t0.5mm 미만\t0.5mm 이상\t콘크리트 박리\t콘크리트 박락\t누수흔적\t백태\t누수중\t철근노출');
assert.strictEqual(tsv[1], '지하2층\t기둥( )\t3\t2\t\t\t1\t\t\t\t\t', '구조 부재 안 그린 층은 괄호 빈칸');
assert.strictEqual(tsv[2], '\t벽( )\t\t\t\t\t\t\t\t\t\t');
assert.strictEqual(tsv.length, 1 + 5 + 6 + 6);

// 2026-11-04 부재 옆 괄호 = 구조 부재 탭 개수: 층·평가단위는 그 층들 합, 합계는 결함 없는 층에 그린 것까지
{
    const T = (c, g, b, s) => ({ column: c, rcWall: 0, bigBeam: g, smallBeam: b, slab: s });
    const bd = {
        floorRows: [
            { floorCode: 'B1F', floorLabel: '지하1층', rowCount: 1, componentEval: { column: { lt02: 1 } }, memberTotals: T(20, 31, 12, 24) },
            { floorCode: '1F', floorLabel: '지상1층', rowCount: 1, componentEval: { slab: { leak: 1 } }, memberTotals: T(18, 27, 10, 20) },
            { floorCode: '2F', floorLabel: '지상2층', rowCount: 0, componentEval: {}, memberTotals: T(18, 27, 10, 20) },
            { floorCode: '3F', floorLabel: '지상3층', rowCount: 1, componentEval: { column: { lt02: 1 } }, memberTotals: null }
        ]
    };
    const total = (row, member) => row.members.find((m) => m.label === member).total;
    const fr = JSON.parse(JSON.stringify(A.buildEvalTableRows(bd)));
    assert.deepStrictEqual(fr.map((r) => r.label), ['지하1층', '지상1층', '지상3층', '합계']);
    assert.strictEqual(total(fr[0], '기둥'), 20);
    assert.strictEqual(total(fr[0], '큰보'), 31, '큰보 = 거더');
    assert.strictEqual(total(fr[0], '작은보'), 12, '작은보 = 빔');
    assert.strictEqual(total(fr[0], '슬래브'), 24);
    assert.strictEqual(total(fr[2], '기둥'), null, '구조 부재 안 그린 층');
    assert.strictEqual(total(fr[3], '기둥'), 56, '합계: 결함 없는 지상2층에 그린 부재도 센다');
    const ur = JSON.parse(JSON.stringify(A.buildEvalTableRows(bd, [['1F', '2F', '3F']])));
    assert.strictEqual(ur[0].label, '지상1층~지상3층');
    assert.strictEqual(total(ur[0], '슬래브'), 40, '평가단위 = 그린 층들의 합(안 그린 3층은 0)');
    assert.strictEqual(A.evalTableToTsv(fr).split('\n')[1], '지하1층\t기둥(20)\t1\t\t\t\t\t\t\t\t\t');
}

// 평가단위: 사용자가 고른 층끼리 묶음. 지하·지상을 넘어도 되고 한 층이 두 단위에 들어가도 된다.
{
    const fl = (code, label, n) => ({
        floorCode: code, floorLabel: label, rowCount: n ? 1 : 0,
        componentEval: n ? { column: { lt02: n } } : {}, componentEvalNos: n ? { column: { lt02: [code] } } : {}
    });
    const building = {
        floorRows: [
            fl('B2F', '지하2층', 2), fl('B1F', '지하1층', 4), fl('1F', '지상1층', 1), fl('2F', '지상2층', 0),
            fl('3F', '지상3층', 1), fl('4F', '지상4층', 1), fl('5F', '지상5층', 0), fl('ROOF', '옥상층', 3)
        ],
        currentFloor: '3F'
    };
    const build = (units) => JSON.parse(JSON.stringify(A.buildEvalTableRows(building, units)));
    // 층별(평가단위 없음): 결함 있는 층만
    assert.deepStrictEqual(build(null).map((r) => r.label), ['지하2층', '지하1층', '지상1층', '지상3층', '지상4층', '옥상층', '합계']);
    // 1평가단위 지하2층~지상2층, 2평가단위 지상2층~지상4층(지상2층 겹침) → 안 든 옥상층은 한 층씩
    const r = build([['B2F', 'B1F', '1F', '2F'], ['2F', '3F', '4F']]);
    assert.deepStrictEqual(r.map((x) => x.unitName || ''), ['1평가단위', '2평가단위', '', '']);
    assert.deepStrictEqual(r.map((x) => x.label), ['지하2층~지상2층', '지상2층~지상4층', '옥상층', '합계']);
    assert.strictEqual(col(r[0], '기둥', 'lt02').n, 7, '2 + 4 + 1');
    assert.deepStrictEqual(col(r[0], '기둥', 'lt02').nos, ['B2F', 'B1F', '1F']);
    assert.strictEqual(col(r[1], '기둥', 'lt02').n, 2);
    assert.strictEqual(col(r[3], '기둥', 'lt02').n, 12, '합계는 겹친 층도 한 번만: 2+4+1+1+1+3');
    assert.deepStrictEqual(r[1].floorCodes, ['2F', '3F', '4F'], '현재 층 강조용');
    // 결함 없는 층만 고른 단위도 줄은 나옴(빈칸), 층을 안 고른 단위는 안 나옴
    const r2 = build([['5F'], []]);
    assert.deepStrictEqual(r2.map((x) => x.label), ['지상5층', '지하2층', '지하1층', '지상1층', '지상3층', '지상4층', '옥상층', '합계']);
    // 떨어진 층은 쉼표, 이어진 층은 물결(건물 층 순서 기준, 고른 순서와 무관)
    assert.strictEqual(A.evalFloorRangeLabel(['4F', 'B2F', 'B1F', 'ROOF'], building.floorRows), '지하2층~지하1층, 지상4층, 옥상층');
    assert.strictEqual(A.evalFloorRangeLabel([], building.floorRows), '');
}
assert.ok(src.includes("var EVAL_UNITS_KEY = 'bsa_stats_eval_units';"), '평가단위 저장(건물별)');
assert.ok(src.includes('data-eval-add>＋ 평가단위 추가</button>'), '평가단위 추가 버튼');
assert.ok(src.includes('renderEvalTable(bldg ? payload : null, ensureEvalMount(), bldg);'));

// 2026-11-04 접합부는 맞닿은 두 부재 줄에 같이(보(G)-슬래브 접합부 누수 = 큰보 + 슬래브), 채움벽 접합부는 제외
{
    const code2 = [
        takeBlock('var EVAL_GROUP_KEYS = ', '[', ']') + ';',
        takeBlock('function classifyMemberGroup(', '{', '}'),
        takeBlock('function evalGroupsFor(', '{', '}')
    ].join('\n');
    const sb2 = {};
    vm.createContext(sb2);
    vm.runInContext(code2 + '\nthis.f = evalGroupsFor;', sb2);
    const g = (name, cg) => JSON.parse(JSON.stringify(sb2.f(name, cg || 'other')));
    assert.deepStrictEqual(g('보(G)-슬래브 접합부'), ['bigBeam', 'slab']);
    assert.deepStrictEqual(g('보(B)-슬래브 접합부'), ['smallBeam', 'slab']);
    assert.deepStrictEqual(g('RC벽체-슬래브 접합부'), ['rcWall', 'slab']);
    assert.deepStrictEqual(g('내력벽 - 슬래브 접합부'), ['rcWall', 'slab']);
    assert.deepStrictEqual(g('기둥-보(G) 접합부'), ['column', 'bigBeam']);
    assert.deepStrictEqual(g('보-보 접합부'), ['upperBeam'], '같은 부재는 한 번');
    assert.deepStrictEqual(g('기둥-벽체 접합부'), [], '채움벽 접합부(이격 등)는 제외');
    assert.deepStrictEqual(g('조적벽체-슬래브 접합부'), []);
    assert.deepStrictEqual(g('철골 보 볼트 접합부'), []);
    assert.deepStrictEqual(g('기둥', 'column'), ['column'], '접합부가 아니면 그 부재 하나');
    // 균열은 기둥-보 접합부면 보 줄만(G/B 미지정 보는 큰보로), 다른 접합부는 그대로
    vm.runInContext(takeBlock('function evalCrackGroupsFor(', '{', '}') + '\nthis.c = evalCrackGroupsFor;', sb2);
    const c = (name) => JSON.parse(JSON.stringify(sb2.c(sb2.f(name, 'other'))));
    assert.deepStrictEqual(c('기둥-보 접합부'), ['bigBeam'], '기둥-보 접합부 균열 = 큰보');
    assert.deepStrictEqual(c('기둥-보(G) 접합부'), ['bigBeam']);
    assert.deepStrictEqual(c('기둥-보(B) 접합부'), ['smallBeam']);
    assert.deepStrictEqual(c('보(G)-슬래브 접합부'), ['bigBeam', 'slab'], '보-슬래브 균열은 두 줄');
    assert.deepStrictEqual(c('보(G)-보(B) 접합부'), ['bigBeam'], '거더-빔 접합부 균열 = 거더(큰보)');
    assert.deepStrictEqual(g('보(G)-보(B) 접합부'), ['bigBeam', 'smallBeam'], '균열 말고는 두 줄');
    assert.deepStrictEqual(g('기둥-보 접합부'), ['column', 'upperBeam'], '균열이 아닌 결함(누수 등)은 두 줄');
}
assert.ok(src.includes('var evalGroups = evalGroupsFor(d.component, compGroup);'), '집계에서 접합부 줄 나누기');
assert.ok(src.includes('addEval(bin, evalCrackGroupsFor(evalGroups));'), '균열 구간은 접합부 균열 규칙으로');

// 집계 연결: 균열 구간은 구조체 부재만(구조체 아닌 부재는 기타로 빠짐), 결과가 층 줄에 실림
assert.ok(/addEval\(bin, /.test(src), '균열폭 구간을 평가 칸에도 더한다');
assert.ok(src.includes("['peel', 'fall', 'leakTrace', 'efflo', 'leakNow', 'rebar'].forEach(function (k) { if (evalKinds[k]) addEval(k); });"));
assert.ok(/var addEval = function \(key, groups\) \{\s*\/\/[^\n]*\n\s*if \(cat !== '구조체'\) return;/.test(src), '평가 표는 구조체 결함만(마감재 누수흔적 제외)');
assert.ok(src.includes('componentEval: floorComponentEval,') && src.includes('componentEvalNos: floorComponentEvalNos,'));
assert.ok(src.includes("[document.getElementById('statsEvalSection'), vis.evalTable],"), '대분류 전환 때 보이기/숨기기');

console.log('test-stats-eval-table: OK');
