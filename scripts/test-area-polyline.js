'use strict';
// 영역 마킹 「선」(열린 꺾인선) + 일반 마킹 → 다각형/선 변경 + 마킹 모드에서 바로 그리기 (2026-10-26)
// 테스트 데이터만 사용(실데이터 쓰기 없음).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'js', 'pdf-vector-bridge.js'), 'utf8');
const syncMerge = fs.readFileSync(path.join(root, 'js', 'core', 'sync-merge.js'), 'utf8');

function extract(name) {
    const i = app.indexOf(`function ${name}(`);
    assert.ok(i >= 0, name + ' missing');
    let depth = 0;
    const j = app.indexOf('{', i);
    for (let k = j; k < app.length; k++) {
        if (app[k] === '{') depth++;
        else if (app[k] === '}') { depth--; if (depth === 0) return app.slice(i, k + 1); }
    }
    throw new Error('unterminated ' + name);
}

const names = [
    'normalizeAreaShape', 'isPolyPointAreaShape', 'areaPolyMinPoints', 'getAreaShape', 'areaShapeSupportsRotation',
    'getAreaAngleDeg', 'getAreaAabb', 'rotateImgPoint', 'areaLocalToImg', 'areaImgToLocal', 'getAreaWorldCorners',
    'getAreaPolyPoints', 'syncAreaBboxFromPoints', 'pointInPolygonPts', 'distPointToSegment', 'isPointInAreaMark',
    'getAreaEdgeMidpoints', 'getAreaOrientedEdgeCenters', 'projectPointToAreaEdgeCenter', 'projectPointToAreaEdgeCenterDefect',
    'getAreaCenterBorderAttachDefect', 'approxEllipseAreaPoints', 'applyPolylineShapeConversion', 'convertDefectAreaShape',
    'convertDefectPinToArea', 'areaShapeLabelKo', 'areaShapeConvertPhrase', 'beginAreaShapePath', 'paintAreaShapeInterior',
    'getMarkPolyShape', 'getActivePolyCreateShape', 'getPendingPolyShape', 'canFinishPendingPoly', 'addPendingPolyPoint',
    'commitTouchPolygonTap', 'undoTouchPolygonPoint', 'cancelPendingPolyline', 'applyAreaPolygonRedraw', 'startAreaPolygonRedraw',
    'finishPendingAreaPolygon', 'isAreaPolygonRedrawActive', 'discardIncompleteAreaPolygon', 'cancelAreaPolygonRedraw',
    'applyAreaVertexMove'
];

const env = { modal: null, mode: null, toasts: [], saved: 0, floor: [] };
const factory = new Function('env', `
    const state = { mode: 'AREA', areaCreateShape: 'polyline', markCreateShape: 'pin', view: { scale: 1 }, areaFillStyle: 'solid', areaBorderStyle: 'solid', ctx: null };
    const window = { showToast: (m) => env.toasts.push(m), _x: 1 };
    let pendingAreaPoly = null;
    let pendingAreaPolyRedraw = null;
    let selectedDefectIds = new Set();
    let pendingInkPoly = null, isAreaInkDrag = false, areaInkStroke = null;
    function drawCanvas() {}
    function syncAreaPolygonRedrawBanner() {}
    function syncAreaToolPanelUi() {}
    function syncAreaPolyTouchBar() {}
    function updateMapSelectionBar() {}
    function setDrawMode(m) { env.mode = m; state.mode = m; }
    function openAddDefectModal(x, y, a, b, c, area, opts) { env.modal = { x, y, area, opts }; }
    function getCurrentFloorDefects() { return env.floor; }
    function pushDefectHistory() { env.hist = (env.hist || 0) + 1; }
    function saveStateToLocalStorage() { env.saved++; }
    function touchDefectUpdatedAt(d) { d.updatedAt = 1; }
    function touchDefectPositionUpdatedAt(d) { d.posAt = 1; }
    function getDefectStyleKey() { return 'k'; }
    function formatDefectPinLabel(d) { return String(d.no || ''); }
    function getStyleSize() { return { pin: 1, arrow: 1 }; }
    function computePinBoxAboveTarget(tx, ty) { return { boxX: tx, boxY: ty - 50 }; }
    function ensureAreaPinPlacement(d) { if (d.x === undefined) { d.x = 0; d.y = 0; } if (d.targetX === undefined) { d.targetX = 1; d.targetY = 1; } }
    function getActiveMarkingGroup() { return env.group || null; }
    const getAreaFillStyle = (d) => d.areaFillStyle || 'solid';
    function discardStalePendingRemoteAfterLocalPinEdit() {}
    ${names.map(extract).join('\n')}
    return {
        state, window, env,
        get pts() { return pendingAreaPoly; }, set pts(v) { pendingAreaPoly = v; },
        get redraw() { return pendingAreaPolyRedraw; }, set redraw(v) { pendingAreaPolyRedraw = v; },
        fns: { ${names.join(', ')} }
    };
`);
const W = factory(env);
const f = W.fns;

// --- 모양 값 ---
assert.strictEqual(f.normalizeAreaShape('polyline'), 'polyline');
assert.strictEqual(f.normalizeAreaShape('weird-future-shape'), 'rect', '모르는 모양은 네모로 안전하게');
assert.strictEqual(f.areaShapeLabelKo('polyline'), '선');
assert.strictEqual(f.areaShapeConvertPhrase('polyline'), '선으로');
assert.strictEqual(f.areaPolyMinPoints('polyline'), 2);
assert.strictEqual(f.areaPolyMinPoints('polygon'), 3);

// --- 기하: 열린 선 ---
const line = { shapeType: 'area', areaShape: 'polyline', areaPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }], areaX1: 0, areaY1: 0, areaX2: 200, areaY2: 100, areaAngle: 0 };
assert.strictEqual(f.getAreaPolyPoints(line).length, 4);
assert.strictEqual(f.areaShapeSupportsRotation(line), false);
assert.strictEqual(f.isPointInAreaMark(line, 50, 0, 0), true, '선 위');
assert.strictEqual(f.isPointInAreaMark(line, 50, 5, 0), true, '선 근처');
assert.strictEqual(f.isPointInAreaMark(line, 50, 50, 0), false, '꺾인선 사이(안쪽)는 맞지 않음');
assert.strictEqual(f.isPointInAreaMark(line, 100, 50, 0), true, '두 번째 선분');
assert.strictEqual(f.isPointInAreaMark(line, 0, 50, 0), false, '마지막 점→첫 점을 잇지 않음(열린 선)');
assert.strictEqual(f.getAreaEdgeMidpoints(line).length, 3, '변 중앙은 n-1개');
// 점 2개짜리 선(점 3개 미만이어도 선으로 유지)
const two = { shapeType: 'area', areaShape: 'polyline', areaPoints: [{ x: 10, y: 10 }, { x: 60, y: 10 }], areaX1: 10, areaY1: 10, areaX2: 60, areaY2: 10, areaAngle: 0 };
assert.strictEqual(f.getAreaPolyPoints(two).length, 2);
assert.strictEqual(f.isPointInAreaMark(two, 30, 12, 0), true);
// 꼭짓점 끌기 → bbox 갱신
f.applyAreaVertexMove(line, 3, 300, 150);
assert.strictEqual(line.areaX2, 300);
assert.strictEqual(line.areaY2, 150);
line.areaPoints[3] = { x: 200, y: 100 }; f.syncAreaBboxFromPoints(line);

// --- 그리기: 닫지 않고 채우지 않음 ---
function mockCtx() {
    const calls = [];
    return { calls, beginPath() { calls.push('begin'); }, moveTo() { calls.push('move'); }, lineTo() { calls.push('line'); }, closePath() { calls.push('close'); },
        save() { calls.push('save'); }, restore() { calls.push('restore'); }, clip() { calls.push('clip'); }, fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); },
        ellipse() { calls.push('ellipse'); } };
}
{
    const c = mockCtx();
    f.beginAreaShapePath(c, line);
    assert.ok(!c.calls.includes('close'), '선은 closePath 없음');
    assert.strictEqual(c.calls.filter((x) => x === 'line').length, 3);
    const c2 = mockCtx();
    f.paintAreaShapeInterior(c2, line, '#f00', 'solid');
    assert.deepStrictEqual(c2.calls, [], '선은 채우기·해치 없음');
    const poly = { ...line, areaShape: 'polygon' };
    const c3 = mockCtx();
    f.beginAreaShapePath(c3, poly);
    assert.ok(c3.calls.includes('close'), '다각형은 그대로 닫힘');
}

// --- 모양 변환(번호·사진 유지) ---
{
    const d = { id: 'a1', no: 'NO.07', photos: ['p1', 'p2'], memo: '균열', shapeType: 'area', areaShape: 'polygon',
        areaPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }], areaX1: 0, areaY1: 0, areaX2: 100, areaY2: 80, areaAngle: 0, x: 50, y: -50, targetX: 50, targetY: 0 };
    assert.strictEqual(f.convertDefectAreaShape(d, 'polyline'), true);
    assert.strictEqual(d.areaShape, 'polyline');
    assert.strictEqual(d.areaPoints.length, 5, '다각형→선: 윤곽이 그대로 보이게 첫 점으로 되돌아옴');
    assert.deepStrictEqual(d.areaPoints[4], d.areaPoints[0]);
    assert.strictEqual(d.no, 'NO.07'); assert.deepStrictEqual(d.photos, ['p1', 'p2']); assert.strictEqual(d.memo, '균열');
    assert.strictEqual(f.convertDefectAreaShape(d, 'polygon'), true);
    assert.strictEqual(d.areaShape, 'polygon');
    assert.strictEqual(d.areaPoints.length, 4, '선→다각형: 되돌아온 마지막 점은 빠짐');
    f.convertDefectAreaShape(d, 'polyline');
    assert.strictEqual(f.convertDefectAreaShape(d, 'rect'), true);
    assert.strictEqual(d.areaShape, 'rect');
    assert.strictEqual(d.areaPoints, undefined);
    assert.ok(d.areaX2 - d.areaX1 >= 40 && d.areaY2 - d.areaY1 >= 40);
}
{
    // 일직선 선 → 다각형/네모: 납작하지 않게 최소 크기 확보
    const d = { id: 'a2', shapeType: 'area', areaShape: 'polyline', areaPoints: [{ x: 10, y: 10 }, { x: 110, y: 10 }], areaX1: 10, areaY1: 10, areaX2: 110, areaY2: 10, areaAngle: 0, x: 0, y: 0, targetX: 1, targetY: 1 };
    f.convertDefectAreaShape(d, 'polygon');
    assert.strictEqual(d.areaPoints.length, 4);
    assert.ok(d.areaY2 - d.areaY1 >= 40);
}

// --- 점 찍기: 중복 점 방지·되돌리기·완료 최소 점수 ---
{
    W.state.mode = 'AREA'; W.state.areaCreateShape = 'polyline'; W.pts = null;
    assert.strictEqual(f.getActivePolyCreateShape(), 'polyline');
    assert.strictEqual(f.canFinishPendingPoly(), false);
    f.addPendingPolyPoint(10, 10);
    assert.strictEqual(f.canFinishPendingPoly(), false, '점 1개는 완료 불가');
    assert.strictEqual(f.addPendingPolyPoint(11, 10), false, '더블클릭(같은 자리 연타)은 점 중복 없음');
    f.addPendingPolyPoint(100, 10);
    assert.strictEqual(f.canFinishPendingPoly(), true, '선은 점 2개부터 완료');
    f.addPendingPolyPoint(100, 90);
    f.addPendingPolyPoint(200, 90);
    assert.strictEqual(W.pts.length, 4);
    f.undoTouchPolygonPoint();
    assert.strictEqual(W.pts.length, 3, '되돌리기는 마지막 점만');
    // 터치 탭: 다각형처럼 첫 점 근처 탭해도 닫지 않고 점만 추가
    f.commitTouchPolygonTap({ x: 12, y: 12 });
    assert.strictEqual(W.pts.length, 4);
    assert.strictEqual(env.modal, null);
    // 완료 → 등록창에 areaShape polyline + 점 그대로 + bbox
    assert.strictEqual(f.finishPendingAreaPolygon(), true);
    assert.strictEqual(env.modal.area.areaShape, 'polyline');
    assert.strictEqual(env.modal.area.areaPoints.length, 4);
    assert.strictEqual(env.mode, 'PAN');
    assert.strictEqual(W.pts, null);
    // 취소(Esc): 점 버림, 모드 유지
    env.modal = null; W.state.mode = 'AREA'; W.pts = [{ x: 1, y: 1 }, { x: 50, y: 50 }];
    f.cancelPendingPolyline();
    assert.strictEqual(W.pts, null);
    assert.strictEqual(env.modal, null);
    // 점 1개로 완료 시도 → 저장 안 됨
    W.pts = [{ x: 1, y: 1 }];
    assert.strictEqual(f.finishPendingAreaPolygon(), false);
    assert.strictEqual(env.modal, null);
    // 다각형은 3점 규칙 그대로
    W.state.areaCreateShape = 'polygon'; W.pts = [{ x: 1, y: 1 }, { x: 50, y: 50 }];
    assert.strictEqual(f.canFinishPendingPoly(), false);
}

// --- 마킹 모드에서 바로 그리기(핀 + 다각형/선) ---
{
    W.state.mode = 'MARK'; W.state.markCreateShape = 'pin'; W.pts = null;
    assert.strictEqual(f.getActivePolyCreateShape(), null, '핀이면 기존 흐름');
    W.state.markCreateShape = 'polygon';
    assert.strictEqual(f.getActivePolyCreateShape(), 'polygon');
    W.state.markCreateShape = 'polyline';
    assert.strictEqual(f.getActivePolyCreateShape(), 'polyline');
    env.group = { groupId: 'g1' };
    assert.strictEqual(f.getActivePolyCreateShape(), null, '통합(그룹) 마킹 추가 중에는 핀 흐름 유지');
    env.group = null;
    f.addPendingPolyPoint(0, 0); f.addPendingPolyPoint(100, 0);
    f.finishPendingAreaPolygon({ skipModeSwitch: true });
    assert.strictEqual(env.modal.area.areaShape, 'polyline');
    W.state.mode = 'MARK'; W.state.markCreateShape = 'polygon'; W.pts = null;
    [[0, 0], [100, 0], [100, 100]].forEach(([x, y]) => f.addPendingPolyPoint(x, y));
    f.finishPendingAreaPolygon({ skipModeSwitch: true });
    assert.strictEqual(env.modal.area.areaShape, 'polygon');
    assert.strictEqual(env.modal.area.areaPoints.length, 3);
}

// --- 일반(핀) 마킹 → 다각형/선: 번호·사진·내용 유지, 완료해야 바뀌고 취소하면 핀 그대로 ---
{
    const pin = { id: 'p1', no: 'NO.12', photos: ['a.jpg'], memo: '누수', defectType: '균열', category: '구조체', x: 300, y: 200, targetX: 320, targetY: 260, groupId: undefined };
    env.floor = [pin];
    W.state.mode = 'PAN'; W.pts = null; W.redraw = null;
    assert.strictEqual(f.startAreaPolygonRedraw(pin, 'polyline', { fromPin: true }), true);
    assert.strictEqual(pin.shapeType, undefined, '그리는 동안은 아직 핀');
    assert.strictEqual(W.redraw.shape, 'polyline');
    assert.strictEqual(W.redraw.fromPin, true);
    assert.strictEqual(f.getPendingPolyShape(), 'polyline');
    f.addPendingPolyPoint(300, 300); f.addPendingPolyPoint(400, 300); f.addPendingPolyPoint(400, 380);
    f.finishPendingAreaPolygon();
    assert.strictEqual(pin.shapeType, 'area');
    assert.strictEqual(pin.areaShape, 'polyline');
    assert.strictEqual(pin.areaPoints.length, 3);
    assert.strictEqual(pin.no, 'NO.12'); assert.deepStrictEqual(pin.photos, ['a.jpg']); assert.strictEqual(pin.memo, '누수');
    assert.strictEqual(pin.id, 'p1');
    assert.ok(pin.areaX1 === 300 && pin.areaX2 === 400 && pin.areaY2 === 380, 'bbox 갱신');
    assert.ok(env.saved > 0);
    // 화살표 끝이 새 선 위(변 중앙 중 하나)에 붙음
    const mids = f.getAreaEdgeMidpoints(pin).map((m) => `${m.x},${m.y}`);
    assert.ok(mids.includes(`${pin.targetX},${pin.targetY}`), 'tip이 선 위로 다시 붙음');
    // 취소하면 핀 그대로
    const pin2 = { id: 'p2', no: 'NO.13', x: 10, y: 10, targetX: 20, targetY: 20 };
    env.floor = [pin2];
    W.redraw = null; W.pts = null;
    f.startAreaPolygonRedraw(pin2, 'polygon', { fromPin: true });
    f.addPendingPolyPoint(0, 0);
    f.cancelAreaPolygonRedraw({ keepMode: true });
    assert.strictEqual(pin2.shapeType, undefined);
    assert.strictEqual(W.redraw, null);
    // 영역 마킹 다시그리기(선)도 유지
    const area = { id: 'r1', no: 'NO.20', shapeType: 'area', areaShape: 'rect', areaX1: 0, areaY1: 0, areaX2: 50, areaY2: 50, areaAngle: 0, x: 1, y: 1, targetX: 25, targetY: 0 };
    env.floor = [area];
    f.startAreaPolygonRedraw(area, 'polyline');
    f.addPendingPolyPoint(5, 5); f.addPendingPolyPoint(60, 40);
    f.finishPendingAreaPolygon();
    assert.strictEqual(area.areaShape, 'polyline');
    assert.strictEqual(area.no, 'NO.20');
}
// 핀 → 네모(영역) 변환은 기존 함수 그대로 번호 유지
{
    const pin = { id: 'p3', no: 'NO.30', photos: ['z'], x: 100, y: 50, targetX: 120, targetY: 100 };
    assert.strictEqual(f.convertDefectPinToArea(pin), true);
    assert.strictEqual(pin.areaShape, 'rect'); assert.strictEqual(pin.no, 'NO.30'); assert.deepStrictEqual(pin.photos, ['z']);
    f.convertDefectAreaShape(pin, 'polyline');
    assert.strictEqual(pin.areaShape, 'polyline');
}

// --- 배선 ---
assert.ok(html.includes('data-area-create="polyline"'), '영역 모양 패널에 선 버튼');
assert.ok(html.includes('data-area-shape-convert="polyline"'), '모양 변경 줄에 선');
assert.ok(html.includes('id="markShapeBar"') && html.includes('data-mark-create="polygon"') && html.includes('data-mark-create="polyline"'), '마킹 모드 모양 고르기');
assert.ok(/id="btnAreaPolyTouchUndo"[^>]*>되돌리기/.test(html), '되돌리기 버튼');
assert.ok(/key === 'Backspace'[\s\S]{0,260}undoTouchPolygonPoint/.test(app) || /e\.key === 'Backspace' && !typing && pendingAreaPoly/.test(app), 'Backspace = 마지막 점');
assert.ok(/getPendingPolyShape\(\) === 'polyline'\) \{\s*cancelPendingPolyline/.test(app), 'Esc = 선 취소');
assert.ok(/if \(canFinishPendingPoly\(\)\) \{\s*finishPendingAreaPolygon\(\);\s*return;\s*\}\s*if \(pendingInkPoly/.test(app), '더블클릭 완료');
assert.ok(/convertDefectPinToArea\(defect\)/.test(app) && /startAreaPolygonRedraw\(defect, wantShape, \{ fromPin: true \}\)/.test(app), '핀 → 다각형/선 변경');
assert.ok(/state\.mode === 'MARK' && !getMarkPolyShape\(\)/.test(app), '마킹 모드 다각형/선은 점 찍기 흐름');
assert.ok(/isPolyPointAreaShape\(getAreaShape\(src\)\)\s*\?\s*getAreaPolyPoints\(src\)/.test(app), 'PDF 벡터 입력에 선 점 전달');
assert.ok(bridge.includes("area.shape === 'polyline'") && /drawStrokedPolyline\(page, outlinePdf, borderW, color\)/.test(bridge), 'PDF 벡터: 열린 선');
// 동기화: 영역 필드 화이트리스트(모양·점)는 그대로 쓰이고 새 필드는 없음
assert.ok(/'areaShape'/.test(syncMerge) && /'areaPoints'/.test(syncMerge));
console.log('test-area-polyline: ok');
