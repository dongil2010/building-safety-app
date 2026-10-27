#!/usr/bin/env node
'use strict';

/**
 * 2026-10-27 행·열 툴바 「전체층 상세위치 지우기」 — 합성 데이터로 확인(실제 데이터 아님)
 *  - 이 건물 모든 층(외부 포함)의 상세위치만 composeDefectLocation('', 층)으로: 1·2종 '' · 3종 층 이름
 *  - 행·열(gridLoc)·좌표·사진·번호는 그대로, 도면에 안 놓인 결함·다른 건물은 건드리지 않음
 *  - 확인창 뒤에 목록을 다시 읽음, 취소하면 아무것도 안 바뀜, 되돌리기 한 번에 모든 층 복원, 바뀐 층만 dirty
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

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

// ---- 화면 조각 ----
assert.ok(/data-act="clearDetailAll" class="danger-all"[^>]*>전체층 상세위치 지우기<\/button>/.test(app), '툴바 버튼 라벨');
assert.ok(/if \(act === 'clearDetailAll'\) \{\s*clearDetailLocationForAllFloors\(\);/.test(app), '클릭 연결');
assert.ok(/button\.danger-all \{[^}]*background: #b91c1c/.test(css), '위험 스타일');
assert.ok(/button\.danger-all \{[^}]*flex: 1 1 100%/.test(css), '좁은 화면에서도 한 줄 전체 폭');

function makeEnv(grade, opts) {
    opts = opts || {};
    const bldg = { id: 'B1', name: '테스트관', facilityGrade: grade, floorsList: [
        { floorCode: '1F', floorLabel: '지상1층' }, { floorCode: '2F', floorLabel: '지상2층' }
    ] };
    const other = { id: 'B1_X', name: '다른 건물', facilityGrade: grade, floorsList: [] };
    const mk = (id, loc, extra) => Object.assign({ id, no: id, location: loc, gridLoc: 'X1/Y2', x: 10, y: 20, photoIds: ['p_' + id], component: '기둥', defectType: '균열', contentUpdatedAt: 1 }, extra || {});
    const state = {
        currentBuildingId: 'B1', currentFloor: '2F', currentBuilding: bldg, buildings: [bldg, other],
        defects: {
            B1_1F: [mk('a1', '지상1층 기둥 C1'), mk('a2', '회의실'), mk('a3', typeof grade === 'string' ? '지상1층' : '')],
            B1_2F: [mk('b1', '지상2층 복도'), mk('b2', '창고', { mapUnregistered: true })],
            B1_EXT_A: [mk('e1', '정면')],
            B1_ROUND_SKETCH_MEMO: [mk('s1', '메모')],
            B1_X_1F: [mk('o1', '다른건물 위치')]
        }
    };
    const log = { dirty: [], touched: [], toasts: [], confirm: [], hist: [] };
    const ctx = {
        console, JSON, Array, Object, Map, Set, String, Number, Promise,
        state, window: {},
        getBuildingAvailableFloors: null,
        findBuildingForFloorKey: (k) => [other, bldg].find((b) => String(k).indexOf(b.id + '_') === 0) || null,
        isDefectMapUnregistered: (d) => !!(d && d.mapUnregistered),
        stripFloorCodeSuffix: (s) => String(s),
        isExteriorFloorCode: () => false,
        migrateLegacyGridLocation: () => false,
        touchDefectUpdatedAt: (d) => { log.touched.push(d.id); d.contentUpdatedAt = 99; },
        markFloorKeyDirty: (k) => log.dirty.push(k),
        afterGridBulkChange: (msg) => log.toasts.push(msg),
        getBuildingDongLabel: () => '',
        reconcileDefectHistoryJump: () => {},
        updateUndoRedoButtons: () => {},
        saveStateToLocalStorage: () => {}
    };
    ctx.window.getBuildingAvailableFloors = (b) => b.floorsList.concat([{ floorCode: 'EXT_A', floorLabel: '정면' }]);
    ctx.window.showToast = (m) => log.toasts.push('toast:' + m);
    ctx.window.appConfirm = async (m) => { log.confirm.push(m); if (opts.onConfirm) opts.onConfirm(state); return opts.answer !== false; };
    ctx.window.getFloorLabelFromCode = (fc) => ({ '1F': '지상1층', '2F': '지상2층', EXT_A: '정면' }[fc] || fc);
    vm.createContext(ctx);
    ctx.window.window = ctx.window;
    vm.runInContext([
        'const defectHistory = {};',
        extractFunction(app, 'function isGrade3Building('),
        extractFunction(app, 'function getGrade3FloorDisplayLabel('),
        extractFunction(app, 'function defectLocationUsesFloor('),
        extractFunction(app, 'function getDefectLocationFloorLabel('),
        extractFunction(app, 'function composeDefectLocation('),
        extractFunction(app, 'function extractDefectLocationDetail('),
        extractFunction(app, 'function filterMapPlacedDefects('),
        extractFunction(app, 'function clearDefectDetailLocation('),
        extractFunction(app, 'function getDefectHistoryKey('),
        extractFunction(app, 'function snapshotDefectHistoryEntry('),
        extractFunction(app, 'function applyDefectHistoryEntry('),
        extractFunction(app, 'function pushDefectHistory('),
        extractFunction(app, 'function planClearDetailForAllFloors('),
        extractFunction(app, 'async function clearDetailLocationForAllFloors('),
        'this.plan = planClearDetailForAllFloors; this.run = clearDetailLocationForAllFloors; this.history = defectHistory; this.apply = applyDefectHistoryEntry; this.hkey = getDefectHistoryKey;'
    ].join('\n'), ctx);
    return { ctx, state, log };
}

const snap = (o) => JSON.stringify(o);

(async () => {
    // ---- 1·2종 ----
    let e = makeEnv(2);
    const before = snap(e.state.defects);
    const plan = e.ctx.plan('B1');
    assert.strictEqual(JSON.stringify(plan.floors.map((f) => f.fc)), JSON.stringify(['1F', '2F', 'EXT_A']), '층 목록 = 건물 층 + 외부, 메모 자리·다른 건물 제외');
    assert.strictEqual(plan.targetCount, 4, 'a1 a2 b1 e1 (a3은 이미 공란, b2는 도면에 안 놓임)');
    assert.strictEqual(plan.skippedUnplaced, 1);
    assert.strictEqual(snap(e.state.defects), before, '계획은 읽기만');

    await e.ctx.run();
    const D = e.state.defects;
    ['a1', 'a2', 'a3'].forEach((id, i) => assert.strictEqual(D.B1_1F[i].location, '', id + ' 1·2종 공란'));
    assert.strictEqual(D.B1_2F[0].location, '');
    assert.strictEqual(D.B1_2F[1].location, '창고', '도면에 안 놓인 결함은 그대로');
    assert.strictEqual(D.B1_EXT_A[0].location, '', '외부 층 포함');
    assert.strictEqual(D.B1_ROUND_SKETCH_MEMO[0].location, '메모');
    assert.strictEqual(D.B1_X_1F[0].location, '다른건물 위치', '다른 건물은 그대로');
    [].concat(D.B1_1F, D.B1_2F, D.B1_EXT_A).forEach((d) => {
        assert.strictEqual(d.gridLoc, 'X1/Y2', '행·열 그대로');
        assert.strictEqual(d.x, 10); assert.strictEqual(d.y, 20);
        assert.strictEqual(JSON.stringify(d.photoIds), JSON.stringify(['p_' + d.id])); assert.strictEqual(d.component, '기둥'); assert.strictEqual(d.defectType, '균열');
    });
    assert.strictEqual(JSON.stringify(e.log.touched.slice().sort()), JSON.stringify(['a1', 'a2', 'b1', 'e1']), '바뀐 것만 수정 시각');
    assert.strictEqual(JSON.stringify(e.log.dirty.slice().sort()), JSON.stringify(['B1_1F', 'B1_2F', 'B1_EXT_A']), '바뀐 층만 동기화 표시');
    assert.ok(/4개/.test(e.log.confirm[0]) && /3개 층/.test(e.log.confirm[0]) && /1개/.test(e.log.confirm[0]) && /되돌리기/.test(e.log.confirm[0]), '확인창에 범위·수·안 놓인 결함·되돌리기 안내');
    assert.ok(e.log.toasts.some((m) => /전체 3개 층 마킹 4개/.test(m) && /1개 제외/.test(m)), '결과 개수 안내');

    // 되돌리기 한 번 → 모든 층 복원(현재 층 2F 기록에 모두 담김)
    const h = e.ctx.history[e.ctx.hkey()];
    assert.strictEqual(h.undo.length, 1);
    e.ctx.apply(e.ctx.hkey(), h.undo.pop());
    assert.strictEqual(e.state.defects.B1_1F[0].location, '지상1층 기둥 C1');
    assert.strictEqual(e.state.defects.B1_1F[1].location, '회의실');
    assert.strictEqual(e.state.defects.B1_2F[0].location, '지상2층 복도');
    assert.strictEqual(e.state.defects.B1_EXT_A[0].location, '정면');
    assert.strictEqual(e.state.defects.B1_X_1F[0].location, '다른건물 위치');

    // 취소하면 아무것도 안 바뀜
    e = makeEnv(2, { answer: false });
    const b2 = snap(e.state.defects);
    await e.ctx.run();
    assert.strictEqual(snap(e.state.defects), b2);
    assert.strictEqual(e.log.dirty.length, 0);
    assert.strictEqual(Object.keys(e.ctx.history).length, 0, '취소하면 되돌리기 기록도 안 쌓임');

    // 확인창 사이에 동기화가 목록을 새 객체로 바꿔 끼워도 새 목록에 적용(오래된 목록 버그 방지)
    e = makeEnv(2, { onConfirm: (st) => { Object.keys(st.defects).forEach((k) => { st.defects[k] = JSON.parse(JSON.stringify(st.defects[k])); }); } });
    await e.ctx.run();
    assert.strictEqual(e.state.defects.B1_1F[0].location, '', '확인 뒤 새로 읽은 목록에 적용');
    assert.strictEqual(e.state.defects.B1_EXT_A[0].location, '');

    // 확인창 사이에 건물이 바뀌면 중단
    e = makeEnv(2, { onConfirm: (st) => { st.currentBuildingId = 'B1_X'; } });
    const b3 = snap(e.state.defects);
    await e.ctx.run();
    assert.strictEqual(snap(e.state.defects), b3);

    // 지울 것이 없으면 확인창 없이 안내
    e = makeEnv(2);
    await e.ctx.run();
    e.log.confirm.length = 0;
    await e.ctx.run();
    assert.strictEqual(e.log.confirm.length, 0);
    assert.ok(e.log.toasts.some((m) => /지울 상세 위치가 없습니다/.test(m)));

    // ---- 3종: 층 이름만 ----
    e = makeEnv('제3종시설물');
    await e.ctx.run();
    const D3 = e.state.defects;
    assert.strictEqual(D3.B1_1F[0].location, '지상1층');
    assert.strictEqual(D3.B1_1F[1].location, '지상1층');
    assert.strictEqual(D3.B1_2F[0].location, '지상2층');
    assert.strictEqual(D3.B1_EXT_A[0].location, '정면', '외부 입면 도면은 그 도면 이름만');
    assert.strictEqual(D3.B1_2F[1].location, '창고');
    assert.ok(/층 이름만/.test(e.log.confirm[0]));
    assert.ok(!e.log.touched.includes('a3'), '이미 층 이름만인 것은 안 건드림');

    console.log('test-clear-detail-all-floors OK');
})().catch((err) => { console.error(err); process.exit(1); });