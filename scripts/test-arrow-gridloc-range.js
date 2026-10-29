/**
 * 화살표 추가(같은 groupId, 한 결함에 위치 여러 개) 행·열 위치 — 위치마다 나열하지 않고 큰 범위 하나 (2026-10-28)
 * - 계산: 모든 점(영역은 네 모서리)을 한 번에 grid-lines computeGridLocation에 넣어 기존 범위 표기(X1~X3/Y1~Y2)로
 * - app.js의 그룹 도우미(getGridGroupMembers 등)를 소스에서 꺼내 목(mock)으로 실행해 확인
 * - 서버 읽기 추가 없음
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const W = 4000, H = 3000, ctx0 = { rot: 0, w: W, h: H };
const vline = (x) => ({ id: `v${x}`, pts: [{ x, y: 0 }, { x, y: H }] });
const hline = (y) => ({ id: `h${y}`, pts: [{ x: 0, y }, { x: W, y }] });
const grid = G.normalizeGrid({ groups: [
    G.createGroup('col', { band: 20, lines: [vline(1000), vline(2000), vline(3000), vline(3500)] }),
    G.createGroup('row', { band: 20, lines: [hline(500), hline(1500), hline(2500)] })
] });
const loc = (pts, opts) => G.computeGridLocation(grid, pts, ctx0, opts);

// ---- 계산: 위치별 따로 vs 전체를 감싸는 범위 ----
const pA = { x: 1000, y: 500 };   // X1/Y1 (선 위)
const pB = { x: 3000, y: 1500 };  // X3/Y2
const pC = { x: 3500, y: 2500 };  // X4/Y3
assert.strictEqual(loc([pA]), 'X1/Y1');
assert.strictEqual(loc([pB]), 'X3/Y2');
assert.strictEqual(loc([pA, pB]), 'X1~X3/Y1~Y2', '두 위치 → 큰 범위 하나');
assert.strictEqual(loc([pA, pB, pC]), 'X1~X4/Y1~Y3', '세 위치 → 전체를 감싸는 범위');
assert.strictEqual(loc([pA, pA]), 'X1/Y1', '같은 칸 두 번이면 그 칸 하나');
assert.strictEqual(loc([pB, pA]), loc([pA, pB]), '순서 무관');
// 칸 사이(폭 밖) 점도 포함
assert.strictEqual(loc([{ x: 1500, y: 1000 }, pC]), 'X1~X4/Y1~Y3');
// 끝 선 밖 점만 있으면 ~X1 / X4~, 안쪽 점과 섞이면 기존 영역 규칙대로 안쪽 끝 선까지(기존 labelForPositions 동작 그대로)
assert.strictEqual(loc([{ x: 500, y: 500 }, { x: 300, y: 500 }]), '~X1/Y1', '모두 맨 앞 선 밖 → ~X1');
assert.strictEqual(loc([pA, { x: 500, y: 500 }]), 'X1/Y1', '끝 선 밖 + X1 → 기존 규칙(X1)');
// 영역(네 모서리)과 핀 섞기
const area = [{ x: 1000, y: 500 }, { x: 2000, y: 500 }, { x: 1000, y: 1500 }, { x: 2000, y: 1500 }];
assert.strictEqual(loc(area), 'X1~X2/Y1~Y2');
assert.strictEqual(loc(area.concat([pC])), 'X1~X4/Y1~Y3');
// 선이 하나도 없는 축은 그 축만 빠짐(행만 있음/열만 있음)
const rowsOnly = G.normalizeGrid({ groups: [G.createGroup('row', { band: 20, lines: [hline(500), hline(1500)] })] });
assert.strictEqual(G.computeGridLocation(rowsOnly, [pA, pB], ctx0), 'Y1~Y2', '행만 있음');
const colsOnly = G.normalizeGrid({ groups: [G.createGroup('col', { band: 20, lines: [vline(1000), vline(3000)] })] });
assert.strictEqual(G.computeGridLocation(colsOnly, [pA, pB], ctx0), 'X1~X2', '열만 있음');
assert.strictEqual(G.computeGridLocation(G.normalizeGrid({}), [pA, pB], ctx0), '', '선 없음 → 빈 값');

// ---- 번호가 거꾸로·글자 방식이어도 작은 번호 먼저 ----
const lettered = G.normalizeGrid({ groups: [
    G.createGroup('col', { band: 20, numbering: 'upper', lines: [vline(3000), vline(1000), vline(2000)] })
] });
const lt = G.computeGridLocation(lettered, [{ x: 1000, y: 9 }, { x: 3000, y: 9 }], ctx0);
assert.strictEqual(lt, 'XA~XB', '글자 번호(그은 순서 XA·XB·XC) 범위, 작은 번호 먼저');

// ---- app.js 도우미를 꺼내 목으로 실행 ----
function extract(name) {
    const i = app.indexOf(`function ${name}(`);
    assert.ok(i > 0, `${name} 없음`);
    let j = app.indexOf('{', i), depth = 0, k = j;
    for (; k < app.length; k++) {
        const c = app[k];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
    }
    return app.slice(i, k + 1);
}
let floorList = [];
const src = ['gridNum', 'getDefectGridPoints', 'getGridGroupMembers', 'getDefectGridPointsForLoc', 'getDefectGridMemberForLoc'].map(extract).join('\n');
const make = new Function('floorListRef', 'filterMapPlacedDefects', 'getCurrentFloorDefects', 'markingMembersForGroupRow', 'pickDefectGroupRepresentative',
    `${src}\nreturn { getGridGroupMembers, getDefectGridPointsForLoc, getDefectGridMemberForLoc };`);
const api = make({}, (l) => (l || []).filter((d) => !d.mapUnregistered), () => floorList, (list, ms) => ms.filter((m) => !m.linkedRow),
    (ms) => ms.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]);

const pin = (id, x, y, extra) => Object.assign({ id, x, y, targetX: x, targetY: y, groupId: 'g1', component: '슬래브' }, extra || {});
const m1 = pin('a', pA.x, pA.y), m2 = pin('b', pB.x, pB.y), m3 = pin('c', pC.x, pC.y, { component: '벽체' });
const solo = pin('s', 2000, 1500, { groupId: '' });
const other = pin('o', 100, 100, { groupId: 'g2' });
floorList = [m1, m2, m3, solo, other, pin('x', 9, 9, { surveyExtra: true }), pin('u', 1, 1, { mapUnregistered: true })];

assert.deepStrictEqual(api.getGridGroupMembers(m1).map((m) => m.id), ['a', 'b', 'c'], '같은 그룹 멤버(결함표 추가·미배치·다른 그룹 제외)');
assert.deepStrictEqual(api.getDefectGridPointsForLoc(m1).length, 3, '그룹이면 모든 점');
assert.strictEqual(loc(api.getDefectGridPointsForLoc(m2)), 'X1~X4/Y1~Y3', '어느 멤버에서 계산해도 같은 범위');
assert.strictEqual(loc(api.getDefectGridPointsForLoc(m3)), loc(api.getDefectGridPointsForLoc(m1)));
assert.strictEqual(api.getDefectGridMemberForLoc(m2), api.getDefectGridMemberForLoc(m3), '부재 규칙도 대표 기준으로 모두 같게');
assert.deepStrictEqual(api.getDefectGridPointsForLoc(solo), [{ x: 2000, y: 1500 }], '그룹 아니면 자기 점');
assert.deepStrictEqual(api.getDefectGridPointsForLoc(other).length, 1, '멤버가 하나뿐인 그룹 = 예전과 같음');
// 영역 멤버: 네 모서리
const ar = pin('r', 0, 0, { groupId: 'g3', shapeType: 'area', areaX1: 1000, areaY1: 500, areaX2: 2000, areaY2: 1500, targetX: undefined, targetY: undefined });
floorList = [ar, pin('q', pC.x, pC.y, { groupId: 'g3' })];
assert.strictEqual(api.getDefectGridPointsForLoc(ar).length, 5, '영역 4 + 핀 1');
assert.strictEqual(loc(api.getDefectGridPointsForLoc(ar)), 'X1~X4/Y1~Y3');
// 다른 층(현재 층 목록에 없음)의 결함은 자기 점만
floorList = [m1, m2];
assert.deepStrictEqual(api.getGridGroupMembers(m3).map((m) => m.id), ['c'], '현재 층 목록에 없으면 자기 것만');
// 통합 결함표 행이 따로 있는 화살표는 묶음 범위에서 제외 → 자기 점만
floorList = [m1, m2, Object.assign({}, m3, { linkedRow: true })];
assert.deepStrictEqual(api.getGridGroupMembers(floorList[2]).map((m) => m.id), ['c']);
assert.deepStrictEqual(api.getGridGroupMembers(m1).map((m) => m.id), ['a', 'b']);


// ---- 앱 흐름(같은 함수): 화살표 추가 묶음 → 모든 멤버에 같은 큰 범위, 옮기면 다시 계산 ----
{
    const vm = require('vm');
    const floorDefects = [];
    const flow = {
        G,
        state: { currentBuildingId: 'b1', currentFloor: '1F', rotationAngle: 0, currentTab: 'tab-map',
            floorGridLines: { b1_1F: { groups: [
                { axis: 'col', prefix: 'A', start: 1, band: 20, lines: [vline(1000), vline(2000), vline(3000), vline(3500)] },
                { axis: 'row', prefix: 'Y', start: 1, band: 20, lines: [hline(500), hline(1500), hline(2500)] } ] } } },
        window: { BSA: { gridLines: G } },
        document: { getElementById: () => null },
        elements: { defectModal: null },
        console, WeakMap,
        getFloorMapStyleKey: (b, f) => b + '_' + f,
        getFloorPlanDisplayDims: () => ({ w: W, h: H }),
        extractDefectLocationDetail: (l) => String(l || '').replace(/^1F\s*/, ''),
        composeDefectLocation: (room) => ('1F ' + room).trim(),
        touchDefectUpdatedAt: (d) => { d.updatedAt = (d.updatedAt || 0) + 1; },
        touchDefectGridLocAuto: (d) => { d.fieldAt = d.fieldAt || {}; d.fieldAt.gridLoc = (d.fieldAt.gridLoc || 0) + 1; },
        filterMapPlacedDefects: (l) => l,
        getCurrentFloorDefects: () => floorDefects,
        saveStateToLocalStorage: () => {},
        setTimeout: () => 0,
        isDraggingPin: false, isDraggingPinGroup: false
    };
    vm.createContext(flow);
    const names = ['gridLib', 'getMemberNameApi', 'memberNameOut', 'getGridFloorKey', 'getGridCtx', 'getCurrentFloorGrid', 'gridHasLines',
        'currentGridHasLines', 'gridMemberName', 'computeGridAutoLocationForPoints', 'gridNum', 'getDefectGridPoints', 'getGridGroupMembers',
        'getDefectGridPointsForLoc', 'getDefectGridMemberForLoc', 'applyGridAutoLocationToGroup', 'migrateLegacyGridLocation',
        'refreshGridLocHintInModal', 'applyGridAutoLocationToDefect', 'gridLocStampOf', 'scheduleGridLocFreshness',
        'refreshStaleGridLocForCurrentFloor', 'applyGridAutoLocationAfterDrag'];
    vm.runInContext('const gridLocStampMap = new WeakMap();\n' + names.map(extract).join('\n')
        + '\nthis.api = { applyGridAutoLocationToGroup, applyGridAutoLocationAfterDrag, refreshStaleGridLocForCurrentFloor };', flow);
    const A = flow.api;
    const mk = (id, x, y, extra) => Object.assign({ id, x, y, targetX: x, targetY: y, groupId: 'G', component: '슬래브', location: '1F 거실' }, extra || {});
    const g1 = mk('g1a', 1000, 500);
    floorDefects.push(g1);
    A.applyGridAutoLocationToGroup(g1);
    assert.strictEqual(g1.gridLoc, 'A1/Y1', '위치 하나: 예전과 같음');
    const g2 = mk('g1b', 3000, 1500);
    floorDefects.push(g2);
    A.applyGridAutoLocationToGroup(g2); // 화살표 추가 후 저장
    assert.strictEqual(g2.gridLoc, 'A1~A3/Y1~Y2', '새 화살표: 두 위치를 감싸는 범위');
    assert.strictEqual(g1.gridLoc, 'A1~A3/Y1~Y2', '기존 멤버도 같은 범위');
    assert.strictEqual(g1.location, '1F 거실', '상세 위치는 그대로');
    const g3 = mk('g1c', 3500, 2500);
    floorDefects.push(g3);
    A.applyGridAutoLocationToGroup(g3);
    assert.deepStrictEqual([g1.gridLoc, g2.gridLoc, g3.gridLoc], ['A1~A4/Y1~Y3', 'A1~A4/Y1~Y3', 'A1~A4/Y1~Y3'], '세 위치 → 하나의 큰 범위');
    assert.strictEqual(A.refreshStaleGridLocForCurrentFloor(), 0, '방금 계산한 값은 다시 안 바꿈');
    g3.targetX = 2000; g3.targetY = 500; g3.x = 2000; g3.y = 500;
    assert.ok(A.applyGridAutoLocationAfterDrag([g3]) >= 1);
    assert.deepStrictEqual([g1.gridLoc, g2.gridLoc, g3.gridLoc], ['A1~A3/Y1~Y2', 'A1~A3/Y1~Y2', 'A1~A3/Y1~Y2'], '옮긴 뒤 범위 재계산(형제 포함)');
    floorDefects.splice(floorDefects.indexOf(g2), 1);
    assert.ok(A.refreshStaleGridLocForCurrentFloor() >= 1);
    assert.deepStrictEqual([g1.gridLoc, g3.gridLoc], ['A1~A2/Y1', 'A1~A2/Y1'], '삭제 뒤 남은 위치만 감싸는 범위');
    const solo = { id: 's', x: 2000, y: 1500, targetX: 2000, targetY: 1500, component: '슬래브' };
    floorDefects.push(solo);
    A.applyGridAutoLocationToGroup(solo);
    assert.strictEqual(solo.gridLoc, 'A2/Y2', '그룹이 아니면 영향 없음');
    flow.state.floorGridLines.b1_1F = { groups: [] };
    const free = mk('f', 1, 1, { groupId: 'F' });
    floorDefects.push(free, mk('f2', 2, 2, { groupId: 'F' }));
    A.applyGridAutoLocationToGroup(free);
    assert.strictEqual(free.gridLoc, undefined, '행·열 선 없음 → 위치 안 만듦(폴백 그대로)');
}

// ---- 연결(wiring) ----
assert.ok(/G\.gridLocStamp\(sig, getDefectGridPointsForLoc\(d\), gridMemberName\(getDefectGridMemberForLoc\(d\)\)\)/.test(app), '지문도 그룹 점으로');
assert.ok(/const next = computeGridAutoLocationForPoints\(getDefectGridPointsForLoc\(d\), getDefectGridMemberForLoc\(d\)\);/.test(app), '자동 계산이 그룹 점 사용');
assert.ok(/function applyGridAutoLocationAfterDrag[\s\S]{0,400}applyGridAutoLocationToGroup\(d\)/.test(app), '옮기기 후 형제도 갱신');
assert.ok(/function syncGridAutoFlagOnCommit[\s\S]{0,200}applyGridAutoLocationToGroup\(defect\)/.test(app), '저장 때 형제도 갱신');
assert.ok(/window\._gridModalPts = getDefectGridPointsForLoc\(existingPin\)/.test(app), '결함 창 힌트도 그룹 범위');
// 서버 읽기 추가 없음: 도우미 구간에 fetch/Firestore 호출 없음
const helperBlock = app.slice(app.indexOf('function getGridGroupMembers'), app.indexOf('function mergeGroupGridLocProp'));
assert.ok(!/fetch\(|firestore|\.get\(\)|getDoc|onSnapshot/i.test(helperBlock), '서버 읽기 없음');
// 목록·보고서의 묶음 행 합치기는 그대로(값이 모두 같으면 하나만 남는다)
assert.ok(/uniq\.join\(', '\)/.test(app.slice(app.indexOf('function mergeGroupGridLocProp'), app.indexOf('function mergeGroupGridLocProp') + 500)));
console.log('test-arrow-gridloc-range OK');
