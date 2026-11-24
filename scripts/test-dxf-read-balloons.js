'use strict';
// 2026-11-24 DXF 행·열 풍선 글자가 도면에 안 들어오던 경우들:
//  다중 지시선(MULTILEADER) 풍선(블록+속성 글자)·글자 / 블록 안 고정 속성(ATTDEF 70&2) / 표(ACAD_TABLE)
const assert = require('assert');
const R = require('../js/core/dxf-read.js');

const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ` ${a} ≈ ${b}`);
const dxf = (pairs) => pairs.map((p) => `${p[0]}\n${p[1]}`).join('\n') + '\n';

function build(blocks, entities) {
    return dxf([[0, 'SECTION'], [2, 'BLOCKS']].concat(blocks).concat([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES']])
        .concat(entities).concat([[0, 'ENDSEC'], [0, 'EOF']]));
}

// 풍선 블록: 원 + 속성 정의(고정 아님, 핸들 A1D) — 블록 레코드 1F0
const bubbleBlock = [
    [0, 'BLOCK'], [5, '1F1'], [330, '1F0'], [8, '0'], [2, 'GRIDBUB'], [70, 2], [10, 0], [20, 0],
    [0, 'CIRCLE'], [5, '1F2'], [8, '0'], [10, 0], [20, 0], [40, 500],
    [0, 'ATTDEF'], [5, 'A1D'], [8, '0'], [10, 0], [20, 0], [40, 400], [1, ''], [3, '번호'], [2, 'NO'], [70, 0], [72, 1], [11, 0], [21, 0], [74, 2],
    [0, 'ENDBLK'], [5, '1F3'], [8, '0']
];

// 1) 다중 지시선 풍선: 블록 내용 + 속성 값 「A1」, 지시선 한 줄
{
    const ml = [
        [0, 'MULTILEADER'], [5, '300'], [8, 'GRID'], [100, 'AcDbMLeader'], [270, 2],
        [300, 'CONTEXT_DATA{'], [40, 1], [10, 1000], [20, 2000], [41, 250], [140, 100], [145, 50], [290, 0], [296, 1],
        [341, '1F0'], [14, 0], [24, 0], [34, 1], [15, 1000], [25, 2000], [35, 0], [16, 1], [26, 1], [36, 1], [46, 0], [93, 0],
        [302, 'LEADER{'], [290, 1], [291, 1], [10, 500], [20, 2000], [11, 1], [21, 0], [90, 0], [40, 0],
        [304, 'LEADER_LINE{'], [10, 0], [20, 0], [91, 0], [305, '}'],
        [303, '}'],
        [301, '}'],
        [340, 'AB'], [170, 1], [172, 1], [344, '1F0'],
        [330, 'A1D'], [177, 1], [44, 0], [302, 'A1']
    ];
    const doc = R.parseDxf(build(bubbleBlock, ml));
    const flat = R.flattenDxf(doc);
    const t = flat.texts.find((x) => x.text === 'A1');
    assert(t, '풍선 속성 글자 A1이 들어와야 함: ' + JSON.stringify(flat.texts));
    near(t.x, 1000); near(t.y, 2000); near(t.h, 400);
    assert.strictEqual(t.hAlign, 1); assert.strictEqual(t.vAlign, 2);
    const circle = flat.polylines.find((p) => p.closed && p.pts.length > 20);
    assert(circle, '풍선 원');
    const cx = circle.pts.filter((_, i) => i % 2 === 0), cy = circle.pts.filter((_, i) => i % 2 === 1);
    near((Math.max(...cx) + Math.min(...cx)) / 2, 1000, 1); near((Math.max(...cy) + Math.min(...cy)) / 2, 2000, 1);
    const leader = flat.polylines.find((p) => !p.closed && !p.fill && p.pts[0] === 0 && p.pts[1] === 0);
    assert(leader, '지시선');
    assert.deepStrictEqual(leader.pts.slice(-2), [500, 2000], '지시선 끝 = 마지막 점');
    assert(flat.polylines.some((p) => p.fill), '화살촉');
    assert.deepStrictEqual(flat.stats.skipped.unsupported, {}, '못 그린 객체 없음');
    assert.strictEqual(R.lastStats, flat.stats, '마지막 결과를 남긴다(올리기 알림용)');
    console.log('다중 지시선 풍선(블록+속성): ok');
}

// 2) 다중 지시선 글자 내용
{
    const ml = [
        [0, 'MULTILEADER'], [5, '301'], [8, 'TXT'], [100, 'AcDbMLeader'],
        [300, 'CONTEXT_DATA{'], [40, 1], [41, 300], [140, 0], [290, 1], [304, '\\fArial;B7'], [12, 50], [22, 80], [42, 0], [171, 1], [296, 0],
        [301, '}'],
        [170, 0]
    ];
    const flat = R.flattenDxf(R.parseDxf(build([], ml)));
    const t = flat.texts.find((x) => x.text === 'B7');
    assert(t, '다중 지시선 글자: ' + JSON.stringify(flat.texts));
    near(t.h, 300);
    near(t.x, 50);
    assert(t.y < 80 && t.y > 80 - 300 - 1e-6, '위 왼쪽 기준 → 첫 줄 기준선은 위치보다 글자 높이만큼 아래');
    assert.strictEqual(flat.polylines.length, 0, '지시선 종류 0 = 안 보이는 선');
    console.log('다중 지시선 글자: ok');
}

// 3) 블록 안 고정 속성(70&2)은 그리고, 고정 아닌 정의는 그리지 않는다
{
    const blk = [
        [0, 'BLOCK'], [5, '2A1'], [330, '2A0'], [8, '0'], [2, 'BUB2'], [70, 2], [10, 0], [20, 0],
        [0, 'CIRCLE'], [8, '0'], [10, 0], [20, 0], [40, 500],
        [0, 'ATTDEF'], [5, '2A2'], [8, '0'], [10, 0], [20, 0], [40, 400], [1, 'X3'], [3, 'p'], [2, 'T'], [70, 2], [72, 1], [11, 0], [21, 0], [74, 2],
        [0, 'ATTDEF'], [5, '2A3'], [8, '0'], [10, 0], [20, 900], [40, 400], [1, 'DEF'], [3, 'p'], [2, 'TAG'], [70, 0],
        [0, 'ENDBLK'], [8, '0']
    ];
    const ins = [[0, 'INSERT'], [8, 'GRID'], [2, 'BUB2'], [10, 7000], [20, 3000]];
    const flat = R.flattenDxf(R.parseDxf(build(blk, ins)));
    const t = flat.texts.find((x) => x.text === 'X3');
    assert(t, '고정 속성 X3');
    near(t.x, 7000); near(t.y, 3000);
    assert(!flat.texts.some((x) => x.text === 'DEF' || x.text === 'TAG'), '고정 아닌 속성 정의는 안 그림');
    // 모형 공간에 남은 속성 정의(블록 밖)는 그리지 않는다
    const flat2 = R.flattenDxf(R.parseDxf(build([], [[0, 'ATTDEF'], [8, '0'], [10, 0], [20, 0], [40, 100], [1, 'Z'], [2, 'TAG'], [70, 2]])));
    assert.strictEqual(flat2.texts.length, 0);
    console.log('고정 속성(ATTDEF): ok');
}

// 4) 표(ACAD_TABLE) — 익명 블록을 넣는다
{
    const blk = [
        [0, 'BLOCK'], [5, '3A1'], [330, '3A0'], [8, '0'], [2, '*T1'], [70, 1], [10, 0], [20, 0],
        [0, 'LINE'], [8, '0'], [10, 0], [20, 0], [11, 100], [21, 0],
        [0, 'MTEXT'], [8, '0'], [10, 5], [20, -5], [40, 20], [71, 1], [1, '실명'],
        [0, 'ENDBLK'], [8, '0']
    ];
    const tbl = [[0, 'ACAD_TABLE'], [8, 'TBL'], [100, 'AcDbBlockReference'], [2, '*T1'], [10, 1000], [20, 500]];
    const flat = R.flattenDxf(R.parseDxf(build(blk, tbl)));
    const ln = flat.polylines[0];
    assert(ln, '표 선');
    near(ln.pts[0], 1000); near(ln.pts[1], 500); near(ln.pts[2], 1100);
    assert(flat.texts.some((x) => x.text === '실명'), '표 글자');
    console.log('표(ACAD_TABLE): ok');
}

console.log('test-dxf-read-balloons: ok');
