'use strict';
// 2026-10-28 「내용 비우기」 → 이 층만 / 전체 층 / 취소 (앱 모달 appChoose). 전체 층 = 확인·백업 뒤 목록 재읽기 → 한 번의 되돌리기.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');
const C = require('../js/core/defect-content-clear.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const names = ['function planClearContentsForAllFloors(', 'function applyDefectContentClearTo(', 'function describeBuildingForClear(',
    'async function clearDefectContentsForAllFloors(', 'async function clearDefectContentsChooseScope(', 'async function clearDefectContentsOnFloor('];
const constLine = app.match(/const DEFECT_CONTENT_CLEAR_FIELDS_TEXT = '[^']*';/)[0];
const src = constLine + '\n' + names.map((n) => extractFunction(app, n)).join('\n');

// --- 소스 연결 ---
assert(/clearDefectContentsChooseScope\(\)\.catch/.test(app), '버튼은 범위 선택 함수를 부른다');
assert(!/btnClearDefectContents'\)\?\.addEventListener\('click', \(\) => \{\s*clearDefectContentsOnFloor\(\)/.test(app), '버튼이 곧바로 이 층만을 부르면 안 된다');
assert(!/\bconfirm\(/.test(src.replace(/appConfirm\(/g, '')), '기본 confirm 금지');
assert(/window\.appChoose\(/.test(src) && /window\.appConfirm\(/.test(src));
const allBody = extractFunction(app, 'async function clearDefectContentsForAllFloors(');
assert(/pushDefectHistory\(hit\.filter/.test(allBody), '한 번의 되돌리기(다른 층 키 포함)');
assert(/snapshotBeforeBulkOp\('내용 비우기\(전체 층\)'/.test(allBody) && /recordAfterBulkOp\(snaps\)/.test(allBody));
assert(allBody.indexOf('planClearContentsForAllFloors(bId)', allBody.indexOf('snapshotBeforeBulkOp')) > allBody.indexOf('snapshotBeforeBulkOp'), '백업 뒤 목록 재읽기');
assert(/markFloorKeyDirty\(f\.key\)/.test(allBody));
assert(/DEFECT_CONTENT_CLEAR_FIELDS_TEXT/.test(app) && /종류·부재·원인·크기·폭·길이·개수·비고·진행 표시/.test(app), '비우는 칸 안내');
assert(/id="btnClearDefectContents"/.test(idx));

// --- 동작(샌드박스) ---
function mk(withSwap) {
    const mkd = (id, extra) => Object.assign({ id, category: '구조체', component: '기둥', defectType: '균열', crackWidth: '0.3', x: 10, y: 20, no: 'NO.1', location: '3F X1', photos: [], photoIds: [] }, extra || {});
    const state = {
        currentBuildingId: 'B1', currentFloor: '1F', currentBuilding: { id: 'B1', name: '🏢 A동' },
        buildings: [{ id: 'B1', name: '🏢 A동', floorsList: [{ floorCode: '1F', floorLabel: '1층' }, { floorCode: '2F', floorLabel: '2층' }, { floorCode: '3F', floorLabel: '3층' }] }],
        defects: { B1_1F: [mkd('a'), mkd('b', { defectType: '' , component: '' , crackWidth: '', location: '' })], B1_2F: [mkd('c'), mkd('d')], B1_3F: [mkd('e', { component: '', defectType: '', crackWidth: '', location: '' })], B2_1F: [mkd('z')] }
    };
    const log = { choose: [], confirm: [], history: [], dirty: [], snaps: [], toasts: [], after: 0 };
    const sb = {
        window: { BSA: { defectContentClear: C }, showToast: (m) => log.toasts.push(m), getFloorLabelFromCode: (c) => ({ '1F': '1층', '2F': '2층', '3F': '3층' }[c] || c) },
        state, console, log,
        composeDefectLocation: () => '', // 1·2종: 상세위치 비우면 공란
        planClearDetailForAllFloors: (id) => ({ floors: ['1F', '2F', '3F'].map((fc) => ({ fc, key: `${id}_${fc}`, label: fc.replace('F', '층') })), floorCount: 3 }),
        getBuildingDongLabel: () => '', defectPhotoIdList: (d, n) => d.photoIds.slice(0, n), touchDefectUpdatedAt: (d) => { d.updatedAt = 9; },
        recordDefectPhotoState: () => {}, stampDefectPhotosChangedIfSafe: () => {}, bsaStampAfter: (x) => x,
        pushDefectHistory: (extra) => log.history.push(extra || null), markFloorKeyDirty: (k) => log.dirty.push(k),
        saveStateToLocalStorage: () => {}, recordAfterBulkOp: (s) => { log.after++; }, refreshAfterDefectNumberChange: () => {},
        snapshotBeforeBulkOp: async (op, keys) => { log.snaps.push([op, keys]); if (withSwap) { for (const k of keys) state.defects[k] = JSON.parse(JSON.stringify(state.defects[k])); } return keys.map((k) => ({ floorKey: k })); }
    };
    sb.window.appChoose = async (msg, ch, o) => { log.choose.push({ msg, ch, o }); return sb.__pick; };
    sb.window.appConfirm = async (msg, o) => { log.confirm.push({ msg, o }); return sb.__ok !== false; };
    sb.window.state = state;
    vm.createContext(sb);
    vm.runInContext(src + '\nthis.f={choose:clearDefectContentsChooseScope, all:clearDefectContentsForAllFloors, plan:planClearContentsForAllFloors};', sb);
    return sb;
}
const J = (x) => JSON.parse(JSON.stringify(x));
const filled = (d) => !!(d.component || d.defectType || d.crackWidth);

(async () => {
    // 계획: 층 3개 확인, 내용 있는 마킹 a(1F) c·d(2F) = 3개 · 2개 층, 다른 건물 키(B2)는 제외
    let sb = mk();
    const plan = sb.f.plan('B1');
    assert.strictEqual(plan.floorCount, 3); assert.strictEqual(plan.targetCount, 3); assert.strictEqual(plan.targetFloors, 2);

    // 이 층만
    sb.__pick = 0; await sb.f.choose();
    assert.strictEqual(sb.log.choose.length, 1);
    assert.deepStrictEqual(J(sb.log.choose[0].ch.map((c) => c.label)), ['이 층만 (1층)', '전체 층 (3개 층 확인)']);
    assert(/마킹 1개/.test(sb.log.choose[0].ch[0].detail) && /마킹 3개 · 2개 층/.test(sb.log.choose[0].ch[1].detail), '개수');
    assert(/A동/.test(sb.log.choose[0].msg) && /종류·부재·원인/.test(sb.log.choose[0].msg), '건물·비우는 칸 표시');
    assert.strictEqual(sb.log.confirm.length, 1, '이 층만 확인');
    assert(!filled(sb.state.defects.B1_1F[0]), '이 층 비움');
    assert(filled(sb.state.defects.B1_2F[0]) && filled(sb.state.defects.B2_1F[0]), '다른 층·다른 건물은 그대로');
    assert.deepStrictEqual(J(sb.log.history), [null]);

    // 전체 층 (동기화가 확인 중 목록을 바꿔 끼워도 적용)
    sb = mk(true); sb.__pick = 1; await sb.f.choose();
    assert.strictEqual(sb.log.confirm.length, 1);
    assert(/3개 층 확인/.test(sb.log.confirm[0].msg) && /마킹 3개 · 2개 층/.test(sb.log.confirm[0].msg) && /1층: 1개/.test(sb.log.confirm[0].msg) && /2층: 2개/.test(sb.log.confirm[0].msg), '전체 확인 문구');
    ['B1_1F', 'B1_2F', 'B1_3F'].forEach((k) => sb.state.defects[k].forEach((d) => assert(!filled(d), k)));
    assert(filled(sb.state.defects.B2_1F[0]), '다른 건물 그대로');
    sb.state.defects.B1_2F.forEach((d) => { assert.strictEqual(d.x, 10); assert.strictEqual(d.no, 'NO.1'); assert.strictEqual(d.location, '', '상세위치도 비움'); });
    assert.strictEqual(sb.log.history.length, 1, '되돌리기 한 번');
    assert.deepStrictEqual(J(sb.log.history[0]), ['B1_2F'], '다른 층 키도 같은 기록에');
    assert.deepStrictEqual(J(sb.log.dirty.sort()), ['B1_1F', 'B1_2F']);
    assert.strictEqual(sb.log.after, 1);
    assert.strictEqual(sb.log.snaps.length, 1);

    // 취소 (선택창·확인창)
    sb = mk(); sb.__pick = null; await sb.f.choose();
    assert(filled(sb.state.defects.B1_1F[0]) && sb.log.confirm.length === 0 && sb.log.history.length === 0, '선택 취소 = 변화 없음');
    sb = mk(); sb.__pick = 1; sb.__ok = false; await sb.f.choose();
    assert(filled(sb.state.defects.B1_2F[0]) && sb.log.history.length === 0 && sb.log.snaps.length === 0, '확인 취소 = 변화·백업 없음');

    // 다른 층에만 내용이 있을 때: 선택지는 전체 층 하나
    sb = mk(); sb.state.defects.B1_1F = []; sb.__pick = 0; await sb.f.choose();
    assert.strictEqual(sb.log.choose[0].ch.length, 1); assert(/^전체 층/.test(sb.log.choose[0].ch[0].label)); assert(/비울 내용이 없습니다/.test(sb.log.choose[0].msg));
    assert(!filled(sb.state.defects.B1_2F[0]));

    // 이 층에만 내용이 있으면 묻지 않고 이 층만(기존 흐름)
    sb = mk(); sb.state.defects.B1_2F = []; sb.__pick = 0; await sb.f.choose();
    assert.strictEqual(sb.log.choose.length, 0); assert.strictEqual(sb.log.confirm.length, 1); assert(!filled(sb.state.defects.B1_1F[0]));

    // 아무 데도 없으면 알림만
    sb = mk(); ['B1_1F', 'B1_2F', 'B1_3F'].forEach((k) => { sb.state.defects[k] = []; }); await sb.f.choose();
    assert.strictEqual(sb.log.choose.length, 0); assert(sb.log.toasts.some((t) => /비울 결함 내용이 없습니다/.test(t)));
    console.log('test-defect-content-clear-scope: ok');
})().catch((e) => { console.error(e); process.exit(1); });