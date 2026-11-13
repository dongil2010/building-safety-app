/* 마킹 DXF 쓰기 시험 — node scripts/test-dxf-write.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../js/core/dxf-write.js');

/* ---- 아주 작은 DXF 읽개: 그룹 코드 쌍 → 섹션/엔티티 ---- */
function parse(text) {
  assert.ok(text.indexOf('\r\n') > 0, 'CRLF');
  assert.ok(!/[^\x20-\x7e\r\n]/.test(text), '순수 ASCII');
  const lines = text.split('\r\n');
  if (lines[lines.length - 1] === '') lines.pop();
  assert.strictEqual(lines.length % 2, 0, '코드/값 줄이 짝수');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    assert.ok(/^\s*-?\d+$/.test(lines[i]), '코드 줄: ' + lines[i]);
    pairs.push([parseInt(lines[i], 10), lines[i + 1]]);
  }
  assert.deepStrictEqual(pairs[pairs.length - 1], [0, 'EOF']);
  assert.ok(/0\r\nEOF\r\n$/.test(text), '끝 0 EOF + 줄바꿈');
  const sections = {};
  const order = [];
  let i = 0;
  while (i < pairs.length) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'EOF') break;
    assert.deepStrictEqual(pairs[i], [0, 'SECTION']);
    const name = pairs[i + 1][1];
    assert.strictEqual(pairs[i + 1][0], 2);
    order.push(name);
    let j = i + 2;
    const body = [];
    while (!(pairs[j][0] === 0 && pairs[j][1] === 'ENDSEC')) { body.push(pairs[j]); j++; }
    sections[name] = body;
    i = j + 1;
  }
  // 엔티티 묶기
  const ents = [];
  let cur = null;
  (sections.ENTITIES || []).forEach((p) => {
    if (p[0] === 0) { cur = { type: p[1], g: [] }; ents.push(cur); } else cur.g.push(p);
  });
  ents.forEach((e) => {
    e.get = (c) => { const f = e.g.find((x) => x[0] === c); return f ? f[1] : undefined; };
    e.all = (c) => e.g.filter((x) => x[0] === c).map((x) => x[1]);
    e.pt = (c) => ({ x: parseFloat(e.get(c)), y: parseFloat(e.get(c + 10)) });
  });
  return { pairs, sections, order, ents };
}
const count = (d, type, layer) => d.ents.filter((e) => e.type === type && (!layer || e.get(8) === layer)).length;
const polys = (d, layer) => {
  const out = [];
  let cur = null;
  d.ents.forEach((e) => {
    if (e.type === 'POLYLINE' && (!layer || e.get(8) === layer)) { cur = { e, v: [], closed: (parseInt(e.get(70), 10) & 1) === 1 }; out.push(cur); }
    else if (e.type === 'VERTEX' && cur) cur.v.push(e.pt(10));
    else if (e.type === 'SEQEND') cur = null;
  });
  return out;
};

// 알려진 변환: 그림 (ix, iy) → 세계 (2*ix+100, 500-2*iy), 픽셀 1칸 = 2
const toWorld = (ix, iy) => ({ x: 2 * ix + 100, y: 500 - 2 * iy });
const W = { unitPerPx: 2, toWorld };

/* ---- 색 ---- */
assert.strictEqual(api.hexToAci('#ff0000'), 1);
assert.strictEqual(api.hexToAci('#ffff00'), 2);
assert.strictEqual(api.hexToAci('#00ff00'), 3);
assert.strictEqual(api.hexToAci('#00ffff'), 4);
assert.strictEqual(api.hexToAci('#0000ff'), 5);
assert.strictEqual(api.hexToAci('#ff00ff'), 6);
assert.strictEqual(api.hexToAci('#ffffff'), 7);
assert.strictEqual(api.hexToAci('#000000'), 7);
assert.strictEqual(api.hexToAci('#808080'), 8);
assert.strictEqual(api.hexToAci('#c0c0c0'), 9);
assert.strictEqual(api.hexToAci('#f00'), 1);
['#ef4444', '#1e293b', '#3b82f6', '#16a34a', 'zzz', '', null, undefined, '#f97316'].forEach((h) => {
  const a = api.hexToAci(h);
  assert.ok(Number.isInteger(a) && a >= 1 && a <= 255, 'ACI 범위 ' + h + '->' + a);
});
{ const a = api.hexToAci('#ef4444'); assert.ok(a === 1 || (a >= 10 && a <= 29) || a >= 230 && a <= 249, '빨강 계열 ' + a); }

/* ---- 글자 ---- */
assert.strictEqual(api.encodeText('NO.01'), 'NO.01');
assert.strictEqual(api.encodeText('구분'), '\\U+AD6C\\U+BD84');
assert.strictEqual(api.encodeText('균열 A'), '\\U+ADE0\\U+C5F4 A');
assert.strictEqual(api.encodeText('a\u{1F600}b'), 'a?b');
assert.strictEqual(api.encodeText('x\ny'), 'x y');

/* ---- 박스 + 일반 지시선(화살촉) + 원 지시선 ---- */
const plans = [
  {
    boxX: 50, boxY: 40, boxW: 40, boxH: 20, label: 'NO.01', fontSize: 10, color: '#ef4444',
    borderW: 2, lineW: 2, fill: false,
    leaders: [{ route: [{ x: 50, y: 50 }, { x: 80, y: 80 }], tipX: 100, tipY: 100, headLen: 11, ux: 1, uy: 1 }]
  },
  {
    boxX: 200, boxY: 40, boxW: 100, boxH: 20, label: 'NO.02', typeLabel: '균열', typeCallout: true, col1W: 30,
    fontSize: 10, color: '#0000ff', borderW: 2, lineW: 2,
    leaders: [
      { route: [{ x: 200, y: 50 }, { x: 220, y: 90 }], tipX: 220, tipY: 90, useCircleTip: true, headLen: 11 },
      { route: [{ x: 200, y: 50 }, { x: 230, y: 90 }], tipX: 230, tipY: 90, skipArrowHead: true }
    ]
  }
];
let d = parse(api.buildMarkingDxf(Object.assign({ plans }, W)));
assert.deepStrictEqual(d.order, ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']);
assert.strictEqual(d.sections.BLOCKS.length, 0);
assert.ok(d.sections.HEADER.some((p) => p[0] === 1 && p[1] === 'AC1009'));
// 테이블
const tbl = d.sections.TABLES;
['LTYPE', 'LAYER', 'STYLE'].forEach((n) => assert.ok(tbl.some((p) => p[0] === 2 && p[1] === n), 'TABLE ' + n));
assert.ok(tbl.some((p) => p[0] === 2 && p[1] === 'CONTINUOUS'));
assert.ok(tbl.some((p) => p[0] === 2 && p[1] === 'DASHED'));
assert.ok(tbl.some((p) => p[0] === 3 && p[1] === 'malgun.ttf'));
assert.ok(tbl.some((p) => p[0] === 2 && p[1] === 'BSA_KR'));
api.LAYERS.forEach((n) => assert.ok(tbl.some((p) => p[0] === 2 && p[1] === n), '레이어 ' + n));
// 레이어 개수 = 70 값
const layerCount = tbl.findIndex((p, k) => p[0] === 2 && p[1] === 'LAYER' && tbl[k - 1][1] === 'TABLE');
assert.strictEqual(parseInt(tbl[layerCount + 1][1], 10), tbl.filter((p, k) => p[0] === 0 && p[1] === 'LAYER').length);

// 박스 폴리선(닫힘, 사각형 4점) + 변환 좌표
const boxes = polys(d, 'BSA_PIN_BOX');
assert.strictEqual(boxes.length, 2);
assert.ok(boxes.every((b) => b.closed && b.v.length === 4));
// 박스1: x 30..70, y 30..50 → 세계 x 160..240, y(500-2y) 440..400
const xs = boxes[0].v.map((v) => v.x), ys = boxes[0].v.map((v) => v.y);
assert.strictEqual(Math.min(...xs), 160); assert.strictEqual(Math.max(...xs), 240);
assert.strictEqual(Math.min(...ys), 400); assert.strictEqual(Math.max(...ys), 440);
// y 뒤집힘: 이미지에서 위(작은 y)가 세계에서 위(큰 y)
assert.ok(toWorld(0, 0).y > toWorld(0, 10).y);
// 구분선(callout) 1개: x = 150+30 → 세계 100+2*(150+30)=460
const dividers = d.ents.filter((e) => e.type === 'LINE' && e.get(8) === 'BSA_PIN_BOX');
assert.strictEqual(dividers.length, 1);
assert.strictEqual(parseFloat(dividers[0].get(10)), 460);
assert.strictEqual(parseFloat(dividers[0].get(11)), 460);
// 텍스트: 박스1 1개 + 박스2 2개
const texts = d.ents.filter((e) => e.type === 'TEXT');
assert.strictEqual(texts.length, 3);
assert.ok(texts.every((t) => t.get(8) === 'BSA_PIN_TEXT' && t.get(72) === '1' && t.get(73) === '2' && t.get(7) === 'BSA_KR'));
assert.ok(texts.every((t) => t.get(11) !== undefined && t.get(21) !== undefined && t.get(10) === t.get(11)));
assert.strictEqual(texts[0].get(1), 'NO.01');
assert.strictEqual(texts[0].get(62), String(api.hexToAci('#ef4444')));
assert.strictEqual(parseFloat(texts[0].get(10)), 100 + 2 * 50);
assert.strictEqual(parseFloat(texts[0].get(20)), 500 - 2 * 40);
assert.ok(Math.abs(parseFloat(texts[0].get(40)) - 14.4) < 1e-9); // 10px × 2 × 0.72(대문자 높이) — 박스 안에 들어가는 크기
assert.strictEqual(texts[0].get(41), undefined, '칸에 들어가면 폭 비율 없음');
assert.strictEqual(texts[2].get(1), '\\U+ADE0\\U+C5F4');
assert.strictEqual(texts[2].get(62), '5');
// typeCallout 글자 위치: 번호칸 가운데 150+15, 종류칸 가운데 150+30+35
assert.strictEqual(parseFloat(texts[1].get(10)), 100 + 2 * 165);
assert.strictEqual(parseFloat(texts[2].get(10)), 100 + 2 * 215);
// 지시선: 폴리선 3개(열림), 화살촉 SOLID 1개(원·skip 제외), 끝 원 1개(속을 채운 도넛 폴리선)
const leaderPolys = polys(d, 'BSA_LEADER');
const leaders = leaderPolys.filter((l) => !l.closed);
assert.strictEqual(leaders.length, 3);
assert.ok(leaders.every((l) => l.v.length === 2));
assert.strictEqual(count(d, 'SOLID', 'BSA_LEADER'), 1);
assert.strictEqual(count(d, 'CIRCLE', 'BSA_LEADER'), 0, '빈 원 대신 채운 원');
const disks = leaderPolys.filter((l) => l.closed);
assert.strictEqual(disks.length, 1);
assert.strictEqual(disks[0].v.length, 2);
// 가운데 (220, 90)px → 세계 (540, 320), 반지름 4.5px × 2 = 9 → 꼭짓점은 가운데 ± 4.5, 폭 9, 반원(bulge 1) 둘
const dxs = disks[0].v.map((v) => v.x).sort((p, q) => p - q);
assert.ok(Math.abs(dxs[0] - 535.5) < 1e-9 && Math.abs(dxs[1] - 544.5) < 1e-9, "도넛 꼭짓점 x");
assert.ok(disks[0].v.every((v) => Math.abs(v.y - 320) < 1e-9));
assert.strictEqual(parseFloat(disks[0].e.get(40)), 9, "폭 = 반지름");
assert.strictEqual(parseFloat(disks[0].e.get(41)), 9);
// 화살촉: 꼭짓점 = 끝점, 길이 11px×2 = 22, 30도 반각
const solid = d.ents.find((e) => e.type === 'SOLID');
const tip = solid.pt(10), p1 = solid.pt(11), p2 = solid.pt(12);
assert.strictEqual(tip.x, 100 + 2 * 100); assert.strictEqual(tip.y, 500 - 2 * 100);
assert.ok(Math.abs(Math.hypot(p1.x - tip.x, p1.y - tip.y) - 22) < 1e-4);
assert.ok(Math.abs(Math.hypot(p2.x - tip.x, p2.y - tip.y) - 22) < 1e-4);
const a1 = Math.atan2(p1.y - tip.y, p1.x - tip.x), a2 = Math.atan2(p2.y - tip.y, p2.x - tip.x);
let da = Math.abs(a1 - a2); if (da > Math.PI) da = 2 * Math.PI - da;
assert.ok(Math.abs(da - Math.PI / 3) < 1e-4, '벌어진 각 60도');
// 화살촉은 줄기 방향(마지막 경로점→끝점) 반대쪽으로 열린다: 두 밑점이 줄기 쪽
const stem = { x: 100 + 2 * 80, y: 500 - 2 * 80 };
assert.ok(Math.hypot(p1.x - stem.x, p1.y - stem.y) < Math.hypot(tip.x - stem.x, tip.y - stem.y));

/* ---- 영역들 ---- */
function areaDxf(area, color) {
  return parse(api.buildMarkingDxf(Object.assign({ plans: [{ boxX: 5, boxY: 5, boxW: 10, boxH: 10, label: 'A', fontSize: 8, color: color || '#ff0000', area }] }, W)));
}
// 사각형
d = areaDxf({ shape: 'rect', x1: 10, y1: 20, x2: 60, y2: 50 });
let ar = polys(d, 'BSA_AREA');
assert.strictEqual(ar.length, 1); assert.ok(ar[0].closed); assert.strictEqual(ar[0].v.length, 4);
assert.ok(!ar[0].e.get(6), '실선은 선종류 지정 없음');
assert.strictEqual(count(d, 'LINE', 'BSA_AREA'), 0);
// 회전 사각형(90도): 폭·높이 바뀜
d = areaDxf({ shape: 'rect', x1: 0, y1: 0, x2: 40, y2: 20, angle: 90 });
ar = polys(d, 'BSA_AREA')[0].v;
const rx = ar.map((v) => v.x), ry = ar.map((v) => v.y);
assert.ok(Math.abs((Math.max(...rx) - Math.min(...rx)) - 2 * 20) < 1e-3);
assert.ok(Math.abs((Math.max(...ry) - Math.min(...ry)) - 2 * 40) < 1e-3);
// 타원
d = areaDxf({ shape: 'ellipse', x1: 0, y1: 0, x2: 40, y2: 20 });
ar = polys(d, 'BSA_AREA');
assert.strictEqual(ar[0].v.length, 56); assert.ok(ar[0].closed);
// 다각형(points)
d = areaDxf({ shape: 'polygon', x1: 0, y1: 0, x2: 10, y2: 10, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }] });
ar = polys(d, 'BSA_AREA');
assert.strictEqual(ar[0].v.length, 3); assert.ok(ar[0].closed);
assert.deepStrictEqual(ar[0].v[2], { x: 110, y: 484 });
// 선(polyline): 열림
d = areaDxf({ shape: 'polyline', x1: 0, y1: 0, x2: 10, y2: 10, points: [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }], fillStyle: 'hatch' });
ar = polys(d, 'BSA_AREA');
assert.strictEqual(ar[0].v.length, 3); assert.ok(!ar[0].closed);
assert.strictEqual(count(d, 'LINE', 'BSA_AREA'), 0, '선에는 해치 없음');
// 빗금 + 점선
d = areaDxf({ shape: 'rect', x1: 0, y1: 0, x2: 50, y2: 30, fillStyle: 'hatch', borderStyle: 'dashed' });
const hl = d.ents.filter((e) => e.type === 'LINE' && e.get(8) === 'BSA_AREA');
assert.ok(hl.length > 5, '빗금 선 ' + hl.length);
hl.forEach((e) => {
  const a = e.pt(10), b = e.pt(11);
  // 모두 사각형(세계 x 100..200, y 440..500) 안, 방향은 같은 대각
  [a, b].forEach((q) => { assert.ok(q.x >= 100 - 1e-6 && q.x <= 200 + 1e-6 && q.y >= 440 - 1e-6 && q.y <= 500 + 1e-6); });
  assert.ok(Math.abs(Math.abs(b.x - a.x) - Math.abs(b.y - a.y)) < 1e-4, '45도');
});
assert.strictEqual(polys(d, 'BSA_AREA')[0].e.get(6), 'DASHED');
// 해치 줄 수 상한
d = areaDxf({ shape: 'rect', x1: 0, y1: 0, x2: 20000, y2: 20000, fillStyle: 'hatch' });
assert.ok(count(d, 'LINE', 'BSA_AREA') < 1600);
// 손그림
d = areaDxf({
  shape: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, fillStyle: 'none',
  drawings: [
    { type: 'path', points: [{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 1 }] },
    { type: 'rect', points: [{ x: 1, y: 1 }, { x: 5, y: 4 }] },
    { type: 'ellipse', points: [{ x: 0, y: 0 }, { x: 8, y: 6 }] },
    { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }] }
  ]
});
ar = polys(d, 'BSA_AREA');
assert.strictEqual(ar.length, 5);
assert.ok(!ar[1].closed && ar[1].v.length === 3);
assert.ok(ar[2].closed && ar[2].v.length === 4);
assert.ok(ar[3].closed && ar[3].v.length === 40);
assert.ok(ar[4].closed && ar[4].v.length === 3);
// 그룹 areas 배열
d = parse(api.buildMarkingDxf(Object.assign({
  plans: [{ boxX: 5, boxY: 5, boxW: 10, boxH: 10, label: 'G', fontSize: 8, color: '#ff0000',
    areas: [{ shape: 'rect', x1: 0, y1: 0, x2: 5, y2: 5 }, { shape: 'rect', x1: 10, y1: 10, x2: 15, y2: 15 }] }]
}, W)));
assert.strictEqual(polys(d, 'BSA_AREA').length, 2);

/* ---- 범례 ---- */
const legend = {
  boxX: 10, boxY: 10, boxW: 100, boxH: 60, col1W: 40, col2W: 60, rowH: 15, headerRowH: 15, fontSize: 9, lineW: 1,
  items: [{ colorName: '빨강', label: '균열', color: '#ff0000' }, { colorName: '파랑', label: '누수', color: '#0000ff' }, { colorName: '초록', label: 'OK', color: '#00ff00' }]
};
d = parse(api.buildMarkingDxf(Object.assign({ plans: [], legendPlan: legend }, W)));
assert.strictEqual(polys(d, 'BSA_LEGEND').length, 1);
// 세로 구분선 1 + 머리줄 1 + 행 사이 줄 2 = 4
const ll = d.ents.filter((e) => e.type === 'LINE' && e.get(8) === 'BSA_LEGEND');
assert.strictEqual(ll.length, 4);
assert.strictEqual(parseFloat(ll[0].get(10)), 100 + 2 * 50);
assert.strictEqual(parseFloat(ll[1].get(20)), 500 - 2 * 25); // 머리줄 iy=10+15
const lt = d.ents.filter((e) => e.type === 'TEXT');
assert.strictEqual(lt.length, 2 + 6);
assert.strictEqual(lt[0].get(1), '\\U+AD6C\\U+BD84');
assert.strictEqual(lt[2].get(62), '1'); // 빨강
assert.strictEqual(lt[4].get(62), '5');
assert.strictEqual(parseFloat(lt[2].get(20)), 500 - 2 * (10 + 15 + 7.5));
// 범례만 있어도 유효, 범례 없음/빈 항목은 건너뜀
d = parse(api.buildMarkingDxf(Object.assign({ plans: [], legendPlan: { items: [] } }, W)));
assert.strictEqual(d.ents.length, 0);

/* ---- 참고선 ---- */
d = parse(api.buildMarkingDxf(Object.assign({ plans: [], refSegments: [{ x1: 0, y1: 0, x2: 10, y2: 0 }, { x1: NaN, y1: 0, x2: 1, y2: 1 }, [0, 0, 5, 5]] }, W)));
const rl = d.ents.filter((e) => e.type === 'LINE' && e.get(8) === 'BSA_REF');
assert.strictEqual(rl.length, 2);
assert.strictEqual(rl[0].get(62), '8');
assert.deepStrictEqual(rl[0].pt(10), { x: 100, y: 500 });

/* ---- NaN 방어, 범위 ---- */
const raw = api.buildMarkingDxf(Object.assign({
  plans: [
    { boxX: NaN, boxY: 1, boxW: 1, boxH: 1, label: 'X', fontSize: 5, color: '#f00', leaders: [{ route: [{ x: 0, y: 0 }, { x: Infinity, y: 1 }], tipX: 1, tipY: NaN }] },
    plans[0]
  ]
}, W));
assert.ok(!/NaN|Infinity|e[+-]\d/i.test(raw.replace(/BSA|DASHED|CONTINUOUS|SECTION|ENDSEC|ENDTAB|TABLE|EOF|HEADER|ENTITIES|BLOCKS|STYLE|LAYER|LTYPE|VERTEX|SEQEND|POLYLINE|TEXT|SOLID|CIRCLE|LINE|Solid line|Dashed/g, '')), 'NaN/지수 없음');
parse(raw);
// EXTMIN/EXTMAX = 실제 도형 범위 (박스 하나 + 지시선, 화살촉, 글자 포함)
d = parse(api.buildMarkingDxf(Object.assign({ plans: [plans[0]] }, W)));
const H = d.sections.HEADER;
const at = (name, code) => { const k = H.findIndex((p) => p[1] === name); return parseFloat(H.slice(k, k + 5).find((p) => p[0] === code)[1]); };
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
d.ents.forEach((e) => {
  if (e.type === 'VERTEX' || e.type === 'LINE' || e.type === 'SOLID' || e.type === 'TEXT') {
    [10, 11, 12, 13].forEach((c) => {
      if (e.get(c) === undefined) return;
      const p = e.pt(c); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
  }
});
assert.ok(Math.abs(at('$EXTMIN', 10) - minX) < 1e-6 && Math.abs(at('$EXTMIN', 20) - minY) < 1e-6);
assert.ok(Math.abs(at('$EXTMAX', 10) - maxX) < 1e-6 && Math.abs(at('$EXTMAX', 20) - maxY) < 1e-6);
// 아무것도 없어도 유효
d = parse(api.buildMarkingDxf({ plans: [], toWorld, unitPerPx: 1 }));
assert.strictEqual(d.ents.length, 0);
parse(api.buildMarkingDxf());

/* ---- pdf-vector-bridge 구조 확인 ---- */
const bridge = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
assert.ok(/window\.buildVectorPinPlansForDefects\s*=\s*function\s*\(defects,\s*measureCtx\)/.test(bridge), '추출 함수 정의');
assert.ok(/plans\s*=\s*window\.buildVectorPinPlansForDefects\(defects,\s*measureCtx\)/.test(bridge), 'PDF 내보내기가 사용');
const glue = fs.readFileSync(path.join(__dirname, '..', 'js', 'dxf-marking-export.js'), 'utf8');
assert.ok(/window\.buildVectorPinPlansForDefects\(/.test(glue), 'DXF 연결이 같은 함수 사용');

console.log('test-dxf-write: ok');

// 2026-11-12 처음 화면(VPORT) + 원본 도면 같이 넣기(BSA_DRAWING) — 우리 DXF 읽기로 다시 읽어 확인
(function () {
    const R = require('../js/core/dxf-read.js');
    const model = {
        n: 3,
        coords: new Float32Array([0, 0, 100, 0, /**/ 10, 10, 50, 10, 50, 40, /**/ 60, 60, 80, 60, 80, 80, 60, 80]),
        start: new Uint32Array([0, 2, 5]), count: new Uint32Array([2, 3, 4]), flags: new Uint8Array([0, 0, 1]),
        texts: [[20, 30, 5, 90, 1, 2, 'X1'], [5, 5, 4, 0, 0, 0, '계단실']]
    };
    const text = api.buildMarkingDxf({
        plans: [], legendPlan: null, unitPerPx: 1,
        drawing: { model, toWorld: (px, py) => ({ x: px * 10 + 1000, y: py * 10 + 2000 }), unitPerPt: 10 }
    });
    const lines = text.split('\r\n');
    const at = lines.indexOf('VPORT');
    assert.ok(at > 0 && lines.indexOf('*ACTIVE') > at, '처음 화면 표(VPORT *ACTIVE)');
    const i12 = lines.indexOf('12', lines.indexOf('*ACTIVE'));
    assert.ok(Math.abs(Number(lines[i12 + 1]) - 1500) < 1e-6, '화면 가운데 x = 내용 가운데');
    const i40 = lines.indexOf('40', lines.indexOf('*ACTIVE'));
    assert.ok(Number(lines[i40 + 1]) >= 800, '화면 높이가 내용을 다 담는다');
    const doc = R.parseDxf(text);
    const flat = R.flattenDxf(doc);
    assert.strictEqual(flat.polylines.length, 3, '선 3개가 다시 읽힌다');
    assert.strictEqual(flat.texts.length, 2);
    const t1 = flat.texts.find((t) => t.text === 'X1');
    assert.ok(t1 && Math.abs(t1.x - 1200) < 1e-6 && Math.abs(t1.y - 2300) < 1e-6 && Math.abs(t1.h - 50) < 1e-6 && Math.abs(t1.rot - 90) < 1e-6, '글자 위치·높이·회전');
    assert.ok(flat.texts.some((t) => t.text === '계단실'), '한글 글자');
    assert.ok(Math.abs(flat.bounds.minX - 1000) < 60 && Math.abs(flat.bounds.maxX - 2000) < 60, '원래 좌표 그대로');
    console.log('처음 화면 + 원본 도면 넣기: ok');
})();

// 2026-11-12 좁은 칸에 긴 글자: 폭 비율(41)을 줄여 칸 안에 넣는다
(function () {
    const t = api.buildMarkingDxf({
        plans: [{ color: '#ef4444', fontSize: 10, boxX: 50, boxY: 50, boxW: 30, boxH: 14, label: 'NO.123-45', leaders: [] }],
        unitPerPx: 1
    });
    const L = t.split(String.fromCharCode(13, 10));
    const i = L.indexOf('NO.123-45');
    assert.ok(i > 0);
    assert.strictEqual(L[i + 1], '41', '폭 비율이 적힌다');
    const wf = Number(L[i + 2]);
    assert.ok(wf >= 0.6 && wf < 1, '폭 비율 0.6~1');
    console.log('긴 글자 칸 맞춤: ok');
})();
