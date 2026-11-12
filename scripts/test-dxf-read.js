'use strict';
// 캐드 DXF 읽기(2026-11-12): 글자 풀기·파싱·펼치기
const assert = require('assert');
const R = require('../js/core/dxf-read.js');

// 짝 배열 → DXF 글자
function dxf(sections) {
    const out = [];
    const push = (c, v) => { out.push(String(c).padStart(3, ' '), String(v)); };
    sections.forEach((sec) => {
        push(0, 'SECTION');
        push(2, sec.name);
        sec.items.forEach((pair) => push(pair[0], pair[1]));
        push(0, 'ENDSEC');
    });
    push(0, 'EOF');
    return out.join('\r\n') + '\r\n';
}
const ent = (type, pairs) => [[0, type]].concat(pairs);
const flatOf = (sections, opts) => R.flattenDxf(R.parseDxf(dxf(sections)), opts);
const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ` ${a} ≈ ${b}`);
function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
    }
    return { x0, y0, x1, y1 };
}

// LINE + 파서(CRLF·LF·공백)
{
    const s = dxf([{ name: 'ENTITIES', items: ent('LINE', [[8, 'A'], [10, 0], [20, 0], [11, 100], [21, 50]]) }]);
    const lf = s.replace(/\r\n/g, '\n').replace(/^ {2}0/gm, '0   ');
    [s, lf].forEach((txt) => {
        const f = R.flattenDxf(R.parseDxf(txt));
        assert.strictEqual(f.polylines.length, 1);
        assert.deepStrictEqual(Array.from(f.polylines[0].pts), [0, 0, 100, 50]);
        assert.deepStrictEqual(f.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 50 });
        assert.deepStrictEqual(f.layers, [{ name: 'A', count: 1 }]);
    });
    console.log('LINE·파서: ok');
}

// LWPOLYLINE bulge(반원) + 폭
{
    const f = flatOf([{ name: 'ENTITIES', items: ent('LWPOLYLINE', [[8, '0'], [90, 2], [70, 0], [43, 2], [10, 0], [20, 0], [42, 1], [10, 10], [20, 0]]) }]);
    const p = f.polylines[0];
    assert(p.pts.length > 10, '반원이 여러 점으로');
    assert.strictEqual(p.width, 2);
    const b = bbox(p.pts);
    // bulge 1 = 반시계 반원 → 현(0,0)-(10,0) 아래쪽으로 반지름 5
    near(b.y0, -5, 1e-6, '반원 아래 끝');
    near(b.y1, 0, 1e-9);
    near(p.pts[p.pts.length - 2], 10); near(p.pts[p.pts.length - 1], 0);
    // 음수 bulge → 위쪽
    const g = flatOf([{ name: 'ENTITIES', items: ent('LWPOLYLINE', [[90, 2], [70, 0], [10, 0], [20, 0], [42, -1], [10, 10], [20, 0]]) }]);
    near(bbox(g.polylines[0].pts).y1, 5, 1e-6, '시계 반원 위 끝');
    // 반원보다 큰 호(bulge 2): 중심이 반대쪽
    const h = flatOf([{ name: 'ENTITIES', items: ent('LWPOLYLINE', [[90, 2], [70, 0], [10, 0], [20, 0], [42, 2], [10, 10], [20, 0]]) }]);
    const r = 10 / (2 * Math.sin(2 * Math.atan(2)));
    const hb = bbox(h.polylines[0].pts);
    near(hb.x1 - hb.x0, 2 * r, 0.05, '큰 호 폭 = 지름');
    console.log('LWPOLYLINE bulge·폭: ok');
}

// CIRCLE·ARC
{
    const f = flatOf([{ name: 'ENTITIES', items: []
        .concat(ent('CIRCLE', [[10, 50], [20, 50], [40, 10]]))
        .concat(ent('ARC', [[10, 0], [20, 0], [40, 10], [50, 0], [51, 90]])) }]);
    const c = f.polylines[0], a = f.polylines[1];
    assert(c.closed && !a.closed);
    for (let i = 0; i < c.pts.length; i += 2) near(Math.hypot(c.pts[i] - 50, c.pts[i + 1] - 50), 10, 1e-9);
    const cb = bbox(c.pts);
    near(cb.x0, 40, 1e-9); near(cb.x1, 60, 1e-9);
    near(a.pts[0], 10); near(a.pts[1], 0);
    near(a.pts[a.pts.length - 2], 0, 1e-9); near(a.pts[a.pts.length - 1], 10, 1e-9);
    // 350° → 10° : 0°를 지나는 짧은 호
    const g = flatOf([{ name: 'ENTITIES', items: ent('ARC', [[10, 0], [20, 0], [40, 10], [50, 350], [51, 10]]) }]);
    const gb = bbox(g.polylines[0].pts);
    assert(gb.x0 > 9.8, '짧은 호');
    // 2026-11-12 시작각 = 끝각(길이 0인 호)은 그리지 않는다 — 예전엔 온 원이 생겼다(농협광주 지상2층 R=25000)
    const z = flatOf([{ name: 'ENTITIES', items: []
        .concat(ent('ARC', [[10, 0], [20, 0], [40, 25000], [50, 71.47095217354884], [51, 71.47095217354884]]))
        .concat(ent('LINE', [[10, 0], [20, 0], [11, 1], [21, 1]])) }]);
    assert.strictEqual(z.polylines.length, 1, '길이 0 호는 빠짐');
    assert.strictEqual(z.stats.skipped.zeroArc, 1);
    // 0° → 360°는 그대로 온 원
    const full = flatOf([{ name: 'ENTITIES', items: ent('ARC', [[10, 0], [20, 0], [40, 10], [50, 0], [51, 360]]) }]);
    const fb = bbox(full.polylines[0].pts);
    near(fb.x0, -10, 1e-6); near(fb.x1, 10, 1e-6);
    console.log('CIRCLE·ARC: ok');
}

// 중첩 INSERT(배율·회전·기준점) + 0 레이어 물려받기 + ATTRIB
{
    const blocks = { name: 'BLOCKS', items: []
        .concat([[0, 'BLOCK'], [8, '0'], [2, 'INNER'], [70, 0], [10, 0], [20, 0]])
        .concat(ent('LINE', [[8, '0'], [10, 0], [20, 0], [11, 1], [21, 0]]))
        .concat([[0, 'ENDBLK'], [8, '0']])
        .concat([[0, 'BLOCK'], [8, '0'], [2, 'OUTER'], [70, 0], [10, 5], [20, 5]])
        .concat(ent('INSERT', [[8, '0'], [2, 'INNER'], [10, 5], [20, 5], [41, 10], [42, 10]]))
        .concat(ent('ATTDEF', [[8, '0'], [10, 0], [20, 0], [40, 1], [1, 'X'], [2, 'TAG']]))
        .concat([[0, 'ENDBLK'], [8, '0']])
    };
    const tables = { name: 'TABLES', items: []
        .concat([[0, 'TABLE'], [2, 'LAYER'], [70, 2]])
        .concat([[0, 'LAYER'], [2, 'OFFL'], [70, 0], [62, -7]])
        .concat([[0, 'LAYER'], [2, 'ON'], [70, 0], [62, 3]])
        .concat([[0, 'ENDTAB']])
    };
    const entities = { name: 'ENTITIES', items: []
        .concat(ent('INSERT', [[8, 'ON'], [66, 1], [2, 'OUTER'], [10, 100], [20, 100], [41, 2], [42, 2], [50, 90]]))
        .concat(ent('ATTRIB', [[8, '0'], [10, 100], [20, 90], [40, 2.5], [1, 'A-1'], [2, 'TAG'], [70, 0]]))
        .concat(ent('SEQEND', [[8, 'ON']]))
        .concat(ent('INSERT', [[8, 'OFFL'], [2, 'OUTER'], [10, 0], [20, 0]]))
    };
    const f = flatOf([tables, blocks, entities]);
    // 꺼진 레이어의 INSERT: 0 레이어 자식은 물려받아 숨는다
    assert.strictEqual(f.polylines.length, 1, '보이는 선 하나');
    const p = f.polylines[0];
    assert.strictEqual(p.layer, 'ON', '0 레이어는 INSERT 레이어');
    // INNER 선 (0,0)-(1,0) → ×10 → +5 → OUTER 기준점(5,5) 빼기 → (0,0)-(10,0) → ×2 → 90° → +100
    near(p.pts[0], 100); near(p.pts[1], 100);
    near(p.pts[2], 100, 1e-9); near(p.pts[3], 120, 1e-9);
    assert.strictEqual(f.texts.length, 1, 'ATTRIB만 글자(ATTDEF 빼기)');
    assert.strictEqual(f.texts[0].text, 'A-1');
    near(f.texts[0].x, 100); near(f.texts[0].y, 90);
    assert.strictEqual(f.stats.skipped.attdef, 1);
    console.log('중첩 INSERT·ATTRIB·꺼진 레이어: ok');
}

// INSERT 배열(열·행) + 자기 참조 블록
{
    const blocks = { name: 'BLOCKS', items: []
        .concat([[0, 'BLOCK'], [2, 'B'], [70, 0], [10, 0], [20, 0]])
        .concat(ent('LINE', [[8, 'L'], [10, 0], [20, 0], [11, 1], [21, 0]]))
        .concat(ent('INSERT', [[8, 'L'], [2, 'B'], [10, 0], [20, 0]]))
        .concat([[0, 'ENDBLK']])
    };
    const f = flatOf([blocks, { name: 'ENTITIES', items: ent('INSERT', [[8, 'L'], [2, 'B'], [10, 0], [20, 0], [70, 3], [71, 2], [44, 10], [45, 20]]) }]);
    assert.strictEqual(f.polylines.length, 6, '3열×2행, 자기 참조는 멈춤');
    assert(f.stats.recursionStops > 0);
    const xs = f.polylines.map((p) => p.pts[0]).sort((a, b) => a - b);
    assert.deepStrictEqual(xs, [0, 0, 10, 10, 20, 20]);
    console.log('INSERT 배열·자기 참조: ok');
}

// TEXT·MTEXT 글자 풀기
{
    assert.strictEqual(R.decodeTextValue('%%c100 %%d %%p1 %%uA%%u'), '\u00D8100 ° ±1 A');
    assert.strictEqual(R.decodeTextValue('\\U+AC00\\U+B098'), '가나');
    assert.deepStrictEqual(R.mtextToLines('{\\fArial|b0;\\H2.5;\\C1;첫줄}\\P\\U+D55C\\L둘\\l째 \\S1/2;\\~끝'), ['첫줄', '한둘째 1/2 끝']);
    assert.deepStrictEqual(R.mtextToLines('a\\\\b\\{c\\}'), ['a\\b{c}']);
    assert.deepStrictEqual(R.mtextToLines('\\A1;x\\S3^4;'), ['x3/4']);
    const f = flatOf([{ name: 'ENTITIES', items: []
        .concat(ent('TEXT', [[8, 'T'], [10, 0], [20, 0], [40, 3], [1, 'X1'], [72, 1], [73, 2], [11, 50], [21, 60]]))
        .concat(ent('TEXT', [[8, 'T'], [10, 5], [20, 6], [40, 3], [50, 30], [1, '%%c25']]))
        .concat(ent('MTEXT', [[8, 'T'], [10, 0], [20, 100], [40, 2], [71, 1], [3, '첫'], [1, '줄\\P둘째']])) }]);
    const t = f.texts;
    assert.strictEqual(t.length, 4);
    assert.deepStrictEqual([t[0].text, t[0].x, t[0].y, t[0].hAlign, t[0].vAlign], ['X1', 50, 60, 1, 2], '맞춤점 11 사용');
    assert.deepStrictEqual([t[1].text, t[1].x, t[1].y, t[1].hAlign], ['\u00D825', 5, 6, 0]);
    near(t[1].rot, 30);
    assert.strictEqual(t[2].text, '첫줄');
    near(t[2].y, 98, 1e-9, 'MTEXT 위 맞춤 첫 줄 기준선 = 위 - 높이');
    assert.strictEqual(t[3].text, '둘째');
    near(t[3].y, 98 - 2 * 5 / 3, 1e-9, '둘째 줄');
    assert(f.bounds.maxX > 52 && f.bounds.maxY >= 99.9, '범위에 글자 상자까지');
    console.log('TEXT·MTEXT: ok');
}

// 동결 레이어·종이 공간·Defpoints·숨김 건너뛰기
{
    const tables = { name: 'TABLES', items: []
        .concat([[0, 'TABLE'], [2, 'LAYER']])
        .concat([[0, 'LAYER'], [2, 'FRZ'], [70, 1], [62, 7]])
        .concat([[0, 'ENDTAB']]) };
    const f = flatOf([tables, { name: 'ENTITIES', items: []
        .concat(ent('LINE', [[8, 'FRZ'], [10, 0], [20, 0], [11, 1], [21, 1]]))
        .concat(ent('LINE', [[8, 'A'], [67, 1], [10, 0], [20, 0], [11, 1], [21, 1]]))
        .concat(ent('LINE', [[8, 'Defpoints'], [10, 0], [20, 0], [11, 1], [21, 1]]))
        .concat(ent('LINE', [[8, 'A'], [60, 1], [10, 0], [20, 0], [11, 1], [21, 1]]))
        .concat(ent('LINE', [[8, 'A'], [10, 0], [20, 0], [11, 2], [21, 2]])) }]);
    assert.strictEqual(f.polylines.length, 1);
    assert.strictEqual(f.stats.skipped.paperSpace, 1);
    assert.strictEqual(f.stats.skipped.hiddenLayer, 2);
    assert.strictEqual(f.stats.skipped.invisible, 1);
    console.log('동결·종이 공간·Defpoints: ok');
}

// 돌출 방향 (0,0,-1) → X 뒤집힘
{
    const f = flatOf([{ name: 'ENTITIES', items: []
        .concat(ent('ARC', [[10, 10], [20, 0], [40, 5], [50, 0], [51, 90], [210, 0], [220, 0], [230, -1]]))
        .concat(ent('LINE', [[10, 1], [20, 1], [11, 2], [21, 2], [230, -1]])) }]);
    const a = f.polylines[0].pts;
    // OCS 중심 (10,0) → WCS (-10,0). 0°→(-5,0)+... 시작점 (-15,0), 끝점 (-10,5)
    near(a[0], -15); near(a[1], 0);
    near(a[a.length - 2], -10, 1e-9); near(a[a.length - 1], 5, 1e-9);
    assert.deepStrictEqual(Array.from(f.polylines[1].pts), [1, 1, 2, 2], 'LINE은 WCS 그대로');
    console.log('돌출 뒤집힘: ok');
}

// 멀리 떨어진 쓰레기 → 범위 걸러냄
{
    const items = [];
    for (let i = 0; i < 100; i++) items.push(...ent('LINE', [[8, 'A'], [10, i], [20, 0], [11, i], [21, 100]]));
    items.push(...ent('LINE', [[8, 'A'], [10, 1e7], [20, 1e7], [11, 1e7 + 1], [21, 1e7]]));
    const f = flatOf([{ name: 'ENTITIES', items }]);
    assert(f.stats.trimmed, '걸러냄 표시');
    assert.strictEqual(f.stats.droppedPolylines, 1);
    assert.strictEqual(f.polylines.length, 100);
    assert(f.bounds.maxX < 1000 && f.bounds.maxY <= 100 + 1e-9, '범위는 본 도면만');
    // 고르게 퍼진 도면은 그대로
    const g = flatOf([{ name: 'ENTITIES', items: items.slice(0, -10 * 2) }]);
    assert(!g.stats.trimmed);
    console.log('바깥 쓰레기 걸러내기: ok');
}

// SPLINE·ELLIPSE·SOLID·HATCH·POLYLINE·DIMENSION·LEADER
{
    const blocks = { name: 'BLOCKS', items: []
        .concat([[0, 'BLOCK'], [2, '*D1'], [70, 1], [10, 0], [20, 0]])
        .concat(ent('LINE', [[8, '0'], [10, 0], [20, 0], [11, 30], [21, 0]]))
        .concat([[0, 'ENDBLK']]) };
    const f = flatOf([blocks, { name: 'ENTITIES', items: []
        // 2차 베지어와 같은 B-스플라인: (0,0)(5,10)(10,0)
        .concat(ent('SPLINE', [[8, 'S'], [70, 8], [71, 2], [72, 6], [73, 3], [40, 0], [40, 0], [40, 0], [40, 1], [40, 1], [40, 1],
            [10, 0], [20, 0], [30, 0], [10, 5], [20, 10], [30, 0], [10, 10], [20, 0], [30, 0]]))
        .concat(ent('ELLIPSE', [[8, 'S'], [10, 0], [20, 0], [11, 10], [21, 0], [40, 0.5], [41, 0], [42, Math.PI * 2]]))
        .concat(ent('SOLID', [[8, 'S'], [10, 0], [20, 0], [11, 1], [21, 0], [12, 0], [22, 1], [13, 1], [23, 1]]))
        .concat(ent('HATCH', [[8, 'S'], [10, 0], [20, 0], [2, 'SOLID'], [70, 1], [71, 0], [91, 1],
            [92, 2], [72, 0], [73, 1], [93, 3], [10, 0], [20, 0], [10, 4], [20, 0], [10, 4], [20, 4], [97, 0],
            [75, 0], [76, 1], [98, 0]]))
        .concat(ent('HATCH', [[8, 'S'], [2, 'ANSI31'], [70, 0], [91, 0]]))
        .concat(ent('POLYLINE', [[8, 'S'], [66, 1], [70, 1]]))
        .concat(ent('VERTEX', [[8, 'S'], [10, 0], [20, 0]]))
        .concat(ent('VERTEX', [[8, 'S'], [10, 5], [20, 0]]))
        .concat(ent('VERTEX', [[8, 'S'], [10, 5], [20, 5]]))
        .concat(ent('SEQEND', [[8, 'S']]))
        .concat(ent('DIMENSION', [[8, 'DIM'], [2, '*D1'], [10, 0], [20, 0]]))
        .concat(ent('LEADER', [[8, 'S'], [71, 0], [76, 2], [10, 0], [20, 0], [10, 10], [20, 10]])) }]);
    const byType = f.stats.entities;
    ['SPLINE', 'ELLIPSE', 'SOLID', 'HATCH', 'POLYLINE', 'DIMENSION', 'LEADER'].forEach((k) => assert(byType[k] >= 1, k));
    const sp = f.polylines[0].pts;
    near(sp[0], 0); near(sp[1], 0); near(sp[sp.length - 2], 10, 1e-6);
    near(bbox(sp).y1, 5, 1e-6, '베지어 꼭대기 = 5');
    const el = bbox(f.polylines[1].pts);
    near(el.x1, 10, 1e-9); near(el.y1, 5, 1e-3);
    const solid = f.polylines[2];
    assert(solid.fill);
    assert.deepStrictEqual(Array.from(solid.pts), [0, 0, 1, 0, 1, 1, 0, 1], 'SOLID 넷째·셋째 순서');
    const hatch = f.polylines[3];
    assert(hatch.fill && hatch.pts.length === 6, '솔리드 해치만');
    assert.strictEqual(f.stats.skipped.patternHatch, 1);
    const pl = f.polylines[4];
    assert(pl.closed && pl.pts.length === 6);
    const dim = f.polylines[5];
    assert.strictEqual(dim.layer, 'DIM', '치수 블록 0 레이어 → 치수 레이어');
    assert.deepStrictEqual(Array.from(dim.pts), [0, 0, 30, 0]);
    assert.deepStrictEqual(Array.from(f.polylines[6].pts), [0, 0, 10, 10]);
    console.log('SPLINE·ELLIPSE·SOLID·HATCH·POLYLINE·DIMENSION·LEADER: ok');
}

// 너무 큰 도면 → 분명한 오류
{
    const items = [];
    for (let i = 0; i < 50; i++) items.push(...ent('LINE', [[10, i], [20, 0], [11, i], [21, 1]]));
    assert.throws(() => flatOf([{ name: 'ENTITIES', items }], { maxVertices: 40 }), (e) => /너무 큽니다/.test(e.message) && !!e.bsaUserMessage);
    console.log('크기 제한: ok');
}

// 글자 풀기(인코딩): cp949·UTF-8·DWG·바이너리
{
    const head = (cp) => '  0\r\nSECTION\r\n  2\r\nHEADER\r\n  9\r\n$ACADVER\r\n  1\r\nAC1015\r\n  9\r\n$DWGCODEPAGE\r\n  3\r\n' + cp + '\r\n  0\r\nENDSEC\r\n';
    const body = '  0\r\nSECTION\r\n  2\r\nENTITIES\r\n  0\r\nTEXT\r\n  8\r\n0\r\n 10\r\n0\r\n 20\r\n0\r\n 40\r\n1\r\n  1\r\n';
    const tail = '\r\n  0\r\nENDSEC\r\n  0\r\nEOF\r\n';
    // '한글' cp949 = C7 D1 B1 DB
    const bytes = Buffer.concat([Buffer.from(head('ANSI_949') + body, 'latin1'), Buffer.from([0xC7, 0xD1, 0xB1, 0xDB]), Buffer.from(tail, 'latin1')]);
    const txt = R.decodeDxfBytes(new Uint8Array(bytes));
    const f = R.flattenDxf(R.parseDxf(txt));
    assert.strictEqual(f.texts[0].text, '한글', 'cp949');
    // 코드 페이지가 없어도 한국어 앱이라 cp949로
    const noCp = Buffer.concat([Buffer.from(body, 'latin1'), Buffer.from([0xC7, 0xD1, 0xB1, 0xDB]), Buffer.from(tail, 'latin1')]);
    assert(/한글/.test(R.decodeDxfBytes(new Uint8Array(noCp))));
    // UTF-8(BOM·2007 이상)
    const u8 = Buffer.from('\uFEFF' + body + '한글' + tail, 'utf8');
    assert(/TEXT[\s\S]*한글/.test(R.decodeDxfBytes(new Uint8Array(u8))));
    const v2018 = Buffer.from(head('ANSI_949').replace('AC1015', 'AC1032') + body + '가' + tail, 'utf8');
    assert(/가/.test(R.decodeDxfBytes(new Uint8Array(v2018))));
    // DWG·바이너리 DXF는 안내와 함께 거절
    const dwg = new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x33, 0x32, 0, 0, 0, 0, 0, 0x06, 1, 0, 0, 0]);
    assert.throws(() => R.decodeDxfBytes(dwg), (e) => /DWG/.test(e.message) && /DXF\(ASCII\)/.test(e.message));
    const bin = new Uint8Array(Buffer.concat([Buffer.from('AutoCAD Binary DXF\r\n\x1a\x00', 'latin1'), Buffer.from([0, 1, 2])]));
    assert.throws(() => R.decodeDxfBytes(bin), (e) => /바이너리/.test(e.message));
    assert.throws(() => R.decodeDxfBytes(new Uint8Array(0)), /빈 파일/);
    console.log('인코딩·DWG·바이너리: ok');
}

console.log('test-dxf-read: ok');
