#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29: 「통합한 개체는 왜 네모박스 드래그하면 통짜로 움직이냐」
 * 결함 통합 직후(또는 조사표에서 묶음 행을 누르면) 묶음 전체가 선택돼 있어서, NO.박스를 끌면
 * 「여러 마킹 선택 → 통째 이동」으로 처리돼 박스·화살표 끝·영역이 모두 같이 움직였다.
 * 이제: NO.박스 = 공유 박스만, 화살표 끝·영역 = 그 결함만. 서로 다른 마킹을 여러 개 고른 경우만 통째 이동.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const asn = require(path.join(__dirname, '..', 'js', 'shared', 'arrow-survey-number.js'));

const list = [
    { id: 'a', groupId: 'g', x: 100, y: 50, targetX: 120, targetY: 200 },
    { id: 'b', groupId: 'g', x: 100, y: 50, targetX: 300, targetY: 220, mergedFrom: { no: 'NO.05', order: 1 } },
    { id: 'c', groupId: 'g', x: 100, y: 50, shapeType: 'area', areaX1: 400, areaY1: 300, areaX2: 460, areaY2: 360, mergedFrom: { no: 'NO.07', order: 2 } },
    { id: 'e1', groupId: 'g', surveyExtra: true, mergeSourceId: 'b' },
    { id: 's', x: 600, y: 50, targetX: 620, targetY: 200 },
    { id: 's2', x: 700, y: 50, targetX: 720, targetY: 200 }
];
const byId = (id) => list.find((d) => d.id === id);
const hit = (id, part) => ({ defect: byId(id), part });

// 통합 직후 선택 = 묶음의 마킹 전부
const mergedSel = new Set(['a', 'b', 'c']);
assert.strictEqual(asn.isSelectionWithinMarkingGroup(list, 'g', mergedSel), true);
assert.strictEqual(asn.pinDragMode(hit('a', 'BOX'), mergedSel, list), 'BOX', 'NO.박스 → 공유 박스만');
assert.strictEqual(asn.pinDragMode(hit('b', 'BOX'), mergedSel, list), 'BOX', '순환으로 -2를 골라도 박스만');
assert.strictEqual(asn.pinDragMode(hit('b', 'TIP'), mergedSel, list), 'TIP', '화살표 끝 → 그 결함만');
assert.strictEqual(asn.pinDragMode(hit('c', 'AREA_MOVE'), mergedSel, list), 'AREA_MOVE', '영역 → 그 영역만');
// 결함표 행(X-k)까지 선택에 섞여 있어도 한 묶음
assert.strictEqual(asn.pinDragMode(hit('a', 'BOX'), new Set(['a', 'b', 'c', 'e1']), list), 'BOX');
// 화살표 추가 묶음(통합 아님)도 같은 규칙
assert.strictEqual(asn.pinDragMode(hit('a', 'BOX'), new Set(['a', 'b']), list), 'BOX');

// 서로 다른 마킹을 여러 개 고르면 예전처럼 통째 이동
assert.strictEqual(asn.pinDragMode(hit('s', 'BOX'), new Set(['s', 's2']), list), 'GROUP');
assert.strictEqual(asn.pinDragMode(hit('a', 'BOX'), new Set(['a', 'b', 's']), list), 'GROUP', '묶음 + 다른 마킹');
assert.strictEqual(asn.pinDragMode(hit('s', 'TIP'), new Set(['s', 's2']), list), 'GROUP');
// 크기·회전·꼭짓점은 늘 그 결함만
assert.strictEqual(asn.pinDragMode(hit('s', 'AREA_RESIZE'), new Set(['s', 's2']), list), 'AREA_RESIZE');
// 하나만 선택 / 선택 밖을 끌면 그 부분
assert.strictEqual(asn.pinDragMode(hit('s', 'TIP'), new Set(['s']), list), 'TIP');
assert.strictEqual(asn.pinDragMode(hit('s', 'BOX'), new Set(['s2', 'a']), list), 'BOX');
assert.strictEqual(asn.pinDragMode({ defect: byId('s') }, new Set(), list), 'BOX');
// 배열도 받음
assert.strictEqual(asn.pinDragMode(hit('a', 'BOX'), ['a', 'b', 'c'], list), 'BOX');

// 화살표 끝: 혼자인 마킹은 박스와 함께(예전 그대로), 묶음은 끝만
assert.strictEqual(asn.tipDragMovesSharedBox(list, byId('s')), true);
assert.strictEqual(asn.tipDragMovesSharedBox(list, byId('b')), false);
assert.strictEqual(asn.tipDragMovesSharedBox([{ id: 'z', groupId: 'solo' }], { id: 'z', groupId: 'solo' }), true, '구성원 하나뿐인 묶음');

// ---- app.js 연결 (드래그 코드가 공용 규칙을 쓰는지)
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const move = app.slice(app.indexOf('function handleDragMove('), app.indexOf('function clientToImgCoords('));
assert.ok(/asnDrag\.pinDragMode\(pendingDragHit\.hitInfo, selectedDefectIds, getCurrentFloorDefects\(\)\) === 'GROUP'/.test(move), '통째 이동 판정은 pinDragMode');
assert.ok(/tipDragMovesSharedBox\(getCurrentFloorDefects\(\), activeDragPin\)/.test(move), '화살표 끝 규칙');
assert.ok(/activeDragPin\.targetX = newTipX;\s*activeDragPin\.targetY = newTipY;/.test(move), '묶음 화살표 끝은 target만');
assert.ok(/activeDragPin\.x = newX;\s*activeDragPin\.y = newY;\s*syncSharedMarkingGroupBox\(activeDragPin\);/.test(move), 'NO.박스는 공유 박스만(target 그대로)');
const end = app.slice(app.indexOf('function handleDragEnd('), app.indexOf('function handleDragEnd(') + 6000);
assert.ok(/d\.groupId === gidMoved[\s\S]{0,120}touchDefectPositionUpdatedAt\(d\)/.test(end), '박스를 옮긴 묶음 전원 위치 시각 갱신(동기화)');
assert.ok(/pushDefectHistory\(\);\s*const hitDefect = pendingDragHit\.hitInfo\.defect;/.test(move), '끌기 전에 되돌리기 기록');

// ---- 드래그 시뮬레이션: 박스를 끌어도 화살표 끝·영역은 제자리
function simulateBoxDrag(defects, grabbed, dx, dy) {
    grabbed.x += dx; grabbed.y += dy;
    defects.forEach((d) => { if (d.groupId === grabbed.groupId && d.id !== grabbed.id) { d.x = grabbed.x; d.y = grabbed.y; } });
}
const copy = JSON.parse(JSON.stringify(list));
const before = JSON.parse(JSON.stringify(copy));
simulateBoxDrag(copy, copy[1], 40, -10);
copy.filter((d) => d.groupId === 'g' && !d.surveyExtra).forEach((d, i) => {
    assert.strictEqual(d.x, 140); assert.strictEqual(d.y, 40);
    assert.strictEqual(d.targetX, before[i].targetX); assert.strictEqual(d.targetY, before[i].targetY);
    assert.strictEqual(d.areaX1, before[i].areaX1);
});
console.log('test-merged-box-drag: ok');
