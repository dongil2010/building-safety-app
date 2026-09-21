#!/usr/bin/env node
'use strict';

/**
 * 2026-09-21 GPT 감사 2·3단계 — 저장 왕복·삭제 경로에서 찾은 문제들의 회귀 테스트.
 *  - 비파괴 창을 열 때 강도·탄산화 평균 계산이 다른 분류의 변위량 칸을 비웠다(외벽 기울기 값 소실)
 *  - 반발경도 타격 각도 0°가 빈 값이 됐다
 *  - 부동침하·부재처짐 구역 수정, 핀 끌어 옮기기가 수정 시각을 안 올려 다른 기기 옛 값에 졌다
 *  - 사진을 기다리는 사이 다른 결함 창을 열면 옛 창 마무리가 새 창을 덮었다
 *  - 엑셀 가져오기 중 층을 바꾸면 다른 층에 들어갔다
 *  - 도면(층) 삭제 때 변위 구역 묘비가 없어 되살아났다
 *  - 결함 삭제를 되돌려도 묘비가 남아 다음 동기화에서 다시 지워졌다
 *  - 회차(건물) 휴지통 복원이 다른 기기에서 휴지통으로 되돌아갔다(→ 30일 뒤 영구 삭제)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const merge = require(path.join(root, 'js', 'core', 'sync-merge.js'));

/** app.js에서 함수 하나를 중괄호 짝으로 잘라낸다 */
function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

function testNdtAvgOnlyForOwnCategory() {
    const strength = extractFunction('function recalcStrengthSlot(');
    assert.ok(/isStrengthCat\s*=\s*\(document\.getElementById\('ndtCategory'\)/.test(strength));
    const strengthWrites = strength.match(/avgEl\.value\s*=/g) || [];
    const strengthGuarded = strength.match(/isStrengthCat\)\s*avgEl\.value\s*=/g) || [];
    assert.ok(strengthWrites.length >= 2 && strengthWrites.length === strengthGuarded.length,
        '강도 평균은 분류가 강도일 때만 평균값 칸에 써야 한다(기울기 변위량이 지워졌음)');

    const carb = extractFunction('function recalcNdtCarbonation(');
    assert.ok(/isCarbCat\s*=\s*\(document\.getElementById\('ndtCategory'\)/.test(carb));
    const carbWrites = carb.match(/avgElCarb\.value\s*=/g) || [];
    assert.ok(carbWrites.length >= 2, '탄산화 평균 쓰기를 찾지 못했다');
    assert.ok(/avgElCarb && isCarbCat\) avgElCarb\.value = ''/.test(carb)
        && /if \(avgElCarb && isCarbCat\) \{/.test(carb),
        '탄산화 평균은 분류가 탄산화일 때만 평균값 칸에 써야 한다');
}

function testStrengthAngleZeroKept() {
    assert.ok(app.indexOf('strengthAngle: Number.isFinite(parseFloat(strengthAngle)) ? parseFloat(strengthAngle) : null') > 0,
        '타격 각도 0°는 빈 값이 되면 안 된다');
    assert.ok(!/strengthAngle:\s*parseFloat\(strengthAngle\)\s*\|\|\s*null/.test(app));
}

function testNdtEditsBumpUpdatedAt() {
    const group = extractFunction('function touchNdtDispGroup(');
    assert.ok(/group\.updatedAt = Date\.now\(\)/.test(group));
    assert.ok(/markFloorKeyDirty\(key\)/.test(group), '구역 수정은 층을 동기화 대상에 넣어야 한다');
    const moved = extractFunction('function touchMovedNdtItems(');
    assert.ok(/touchNdtUpdatedAt\(single\)/.test(moved) && /selectedNdtIds\.has\(g\.id\)\) g\.updatedAt/.test(moved));

    const dispCalls = (app.match(/touchNdtDispGroup\(/g) || []).length - 1;
    assert.ok(dispCalls >= 8, `구역 수정 경로(추가 3·정보 저장·측기 보정 2·끌기 2)가 시각을 올려야 한다 — ${dispCalls}곳`);
    const movedCalls = (app.match(/touchMovedNdtItems\(/g) || []).length - 1;
    assert.ok(movedCalls >= 5, `핀 끌기 끝(단일 3·여럿 2)이 시각을 올려야 한다 — ${movedCalls}곳`);

    const commitDisp = extractFunction('function commitNdtDisplacement(');
    assert.ok((commitDisp.match(/touchNdtDispGroup\(group\)/g) || []).length >= 3,
        '구역 새로 만들기·지점 추가·지점 수정 모두 시각을 올려야 한다');
}

function testDefectModalStaleOpenGuard() {
    const open = extractFunction('function openAddDefectModal(');
    assert.ok(/const defectModalOpenSeq = \(window\._defectModalOpenSeq = \(window\._defectModalOpenSeq \|\| 0\) \+ 1\)/.test(open));
    const guards = open.match(/if \(defectModalOpenSeq !== window\._defectModalOpenSeq\) return;/g) || [];
    assert.ok(guards.length >= 2, '그림 뒤 콜백과 사진 기다린 뒤 두 곳 모두 옛 창인지 확인해야 한다');
    const afterHydrate = open.indexOf('await photoHydratePromise');
    assert.ok(afterHydrate > 0);
    const nextGuard = open.indexOf('defectModalOpenSeq !== window._defectModalOpenSeq', afterHydrate);
    assert.ok(nextGuard > afterHydrate && nextGuard - afterHydrate < 800, '사진을 기다린 직후 확인해야 한다');
}

function testImportUsesFloorAtClick() {
    const fn = extractFunction('window.confirmImportDefectExcel = ');
    const capture = fn.indexOf('const importFloorAtClick = state.currentFloor');
    const firstAwait = fn.indexOf('await ');
    assert.ok(capture > 0 && firstAwait > capture, '첫 await 전에 건물·층을 잡아야 한다');
    // 지금 화면 도면 크기를 쓸지 판단하는 비교만 예외(가져오는 건물·층이 지금 화면일 때만 도면 크기 사용)
    const bgCheck = 'importBuildingAtClick === state.currentBuildingId && floorCode === state.currentFloor';
    assert.ok(fn.indexOf(bgCheck) > 0, '도면 크기는 가져오는 건물·층이 지금 화면일 때만 써야 한다');
    const afterAwait = fn.slice(firstAwait).split(bgCheck).join('');
    assert.ok(!/state\.currentFloor\b/.test(afterAwait), '백업을 기다린 뒤에는 지금 층(state.currentFloor)을 쓰면 안 된다');
    assert.ok(!/`\$\{state\.currentBuildingId\}_/.test(afterAwait), '백업을 기다린 뒤에는 지금 건물로 키를 만들면 안 된다');
}

function testFloorDeleteTombstonesDispGroups() {
    const fn = extractFunction('window.deleteExistingFloorDrawing = async function');
    const tomb = fn.indexOf('trackNdtDeletion(floorKey, g.id)');
    const del = fn.indexOf('delete window.state.ndtDisplacementGroups[floorKey]');
    assert.ok(tomb > 0 && del > tomb, '구역을 지우기 전에 묘비를 남겨야 한다');
}

async function testUndoRedoReconcile() {
    const src = extractFunction('function restoreDefectPhotosAfterUndo(') + '\n' + extractFunction('function reconcileDefectHistoryJump(');
    const log = [];
    const dataOf = (ch) => 'data:image/jpeg;base64,' + ch.repeat(40);
    let releaseDelete;
    const pendingDelete = new Promise((r) => { releaseDelete = r; });
    const window = {
        // B의 사진은 클라우드 주소만 캐시에 있다(이미 지워진 파일) → 복원 불가로 세야 한다
        _photoCache: { B_0: 'https://firebasestorage.googleapis.com/v0/b/x/o/B_0.jpg?alt=media&token=abc', A_prev_0: dataOf('P') },
        _defectPhotoDeleteJobs: new Map([['A', pendingDelete]]),
        showToast: (m) => log.push(['toast', m])
    };
    const fn = new Function('window', 'untrackDefectDeletion', 'trackDefectDeletion', 'touchDefectUpdatedAt',
        'touchDefectPositionUpdatedAt', 'uploadDefectPhotos', 'deleteAllPhotosForDefect', 'markFloorKeyDirty',
        'getPhotoDocId', 'persistPhotoUrlToIdb',
        src + '\nreturn reconcileDefectHistoryJump;')(
        window,
        (k, id) => log.push(['untrack', k, id]),
        (k, id) => log.push(['track', k, id]),
        (d) => { d.updatedAt = 999; },
        (d) => { d.positionUpdatedAt = 999; },
        (id, srcs, kind) => { log.push(['upload', id, kind || '', srcs.filter(Boolean).length]); return Promise.resolve(); },
        (d) => { log.push(['delPhotos', d.id]); return Promise.resolve(); },
        (k) => log.push(['dirty', k]),
        (id, i, kind) => (kind === 'prev' ? `${id}_prev_${i}` : `${id}_${i}`),
        (key) => { log.push(['idb', key]); return Promise.resolve(true); }
    );
    const tick = () => new Promise((r) => setTimeout(r, 0));

    // 되돌리기: 삭제된 결함 A(사진 1장은 기록에, 이전회차 1장은 캐시에)·B(클라우드 주소뿐)가 되살아남
    const a = { id: 'A', photoIds: ['A_0'], photos: [dataOf('A')], prevRoundPhotoIds: ['A_prev_0'], prevRoundPhotos: [], updatedAt: 1 };
    const b = { id: 'B', photoIds: ['B_0'], photos: ['https://firebasestorage.googleapis.com/x'], updatedAt: 1 };
    const c = { id: 'C', text: 'old', updatedAt: 1 };
    const c2 = { id: 'C', text: 'new', updatedAt: 1 };
    fn('k1', [c], [a, b, c2]);
    assert.deepStrictEqual(log.filter((x) => x[0] === 'untrack').map((x) => x[2]).sort(), ['A', 'B'],
        '되살린 결함의 묘비를 풀어야 다음 동기화에서 다시 안 지워진다');
    assert.strictEqual(a.updatedAt, 999, '되살린 결함은 수정 시각을 지금으로(서버 옛 값에 지지 않게)');
    assert.strictEqual(a.positionUpdatedAt, 999);
    assert.strictEqual(c2.updatedAt, 999, '내용이 바뀐 결함도 시각을 올린다');
    assert.ok(log.some((x) => x[0] === 'toast' && /1장/.test(x[1])), '복원 못 한 사진 수(클라우드 주소뿐인 B 1장)를 알려야 한다');
    assert.ok(log.some((x) => x[0] === 'dirty' && x[1] === 'k1'));
    assert.ok(!log.some((x) => x[0] === 'track'), '되돌리기에서 묘비를 새로 남기면 안 된다');

    await tick();
    assert.ok(!log.some((x) => x[0] === 'upload' && x[1] === 'A'),
        '앞선 삭제가 끝나기 전에 올리면 뒤이어 도는 삭제가 지운다 — 기다려야 한다');
    releaseDelete(0);
    await tick(); await tick(); await tick();
    assert.ok(log.some((x) => x[0] === 'upload' && x[1] === 'A' && x[2] === '' && x[3] === 1), '이번 회차 사진을 다시 올린다');
    assert.ok(log.some((x) => x[0] === 'upload' && x[1] === 'A' && x[2] === 'prev' && x[3] === 1), '이전 회차 사진도 다시 올린다');
    assert.ok(log.some((x) => x[0] === 'idb' && x[1] === 'A_0') && log.some((x) => x[0] === 'idb' && x[1] === 'A_prev_0'),
        '기기(IndexedDB)에도 다시 저장해야 오프라인에서 보인다');
    assert.ok(!log.some((x) => x[0] === 'upload' && x[1] === 'B'), '클라우드 주소(지워진 파일)는 올리지 않는다');

    // 다시 실행: A가 다시 사라짐 → 처음 삭제와 같게 묘비 + 사진 삭제
    log.length = 0;
    fn('k1', [a, c2], [c2]);
    assert.ok(log.some((x) => x[0] === 'track' && x[2] === 'A'));
    assert.ok(log.some((x) => x[0] === 'delPhotos' && x[1] === 'A'));
    assert.ok(!log.some((x) => x[0] === 'untrack'));

    for (const name of ['function undoDefectChange(', 'function redoDefectChange(']) {
        const body = extractFunction(name);
        assert.ok(/reconcileDefectHistoryJump\(key, before, state\.defects\[key\]\)/.test(body),
            name + ' 는 동기화 기록을 맞춰야 한다');
    }
    const del = extractFunction('function deleteAllPhotosForDefect(');
    assert.ok(/jobs\.set\(d\.id, job\)/.test(del), '진행 중인 사진 삭제를 기록해야 되돌리기가 기다릴 수 있다');
}

function testBuildingTrashRestoreWins() {
    const r = merge.resolveBuildingTrashState;
    const T1 = '2026-09-01T00:00:00.000Z';
    const T2 = '2026-09-05T00:00:00.000Z';
    const T3 = '2026-09-10T00:00:00.000Z';

    // 다른 기기(B)는 휴지통 상태를 들고 있고, 서버에는 A가 복원한 기록이 있다 → 복원을 따른다
    assert.deepStrictEqual(r({ trashedAt: T1 }, { trashRestoredAt: T2 }), { trashedAt: null, trashRestoredAt: T2 },
        '복원한 기기의 기록이 다른 기기의 옛 휴지통 상태를 이겨야 한다');
    // 복원한 기기 자신(로컬 표시만 있는 경우)
    assert.strictEqual(r({ _trashRestoredAt: T2 }, { trashedAt: T1 }).trashedAt, null);
    // 복원 뒤 다시 휴지통으로 → 휴지통
    assert.deepStrictEqual(r({ trashedAt: T3 }, { trashRestoredAt: T2 }), { trashedAt: T3, trashRestoredAt: T2 });
    assert.strictEqual(r({ trashRestoredAt: T2 }, { trashedAt: T3 }).trashedAt, T3, '서버 쪽에서 나중에 버린 것도 따른다');
    // 기본
    assert.strictEqual(r({ trashedAt: T1 }, {}).trashedAt, T1);
    assert.strictEqual(r({}, { trashedAt: T1 }).trashedAt, T1);
    assert.strictEqual(r({}, {}).trashedAt, null);
    assert.strictEqual(r(null, null).trashedAt, null);
    assert.strictEqual(r({ trashedAt: T1 }, { trashedAt: T2 }).trashedAt, T2);
    // 같은 시각이면 복원(예전 동작 >=)
    assert.strictEqual(r({ trashedAt: T2 }, { trashRestoredAt: T2 }).trashedAt, null);

    const restore = extractFunction('window.restoreBuildingFromTrash = function');
    assert.ok(/bldg\.trashRestoredAt = bldg\._trashRestoredAt/.test(restore),
        '복원 시각은 서버에 올라가는 필드(trashRestoredAt)에도 남겨야 한다');
    const sanitize = extractFunction('function sanitizeBuildingMetaForFirestore(');
    assert.ok(!/[^_]trashRestoredAt/.test(sanitize.replace(/_trashRestoredAt/g, '')),
        '업로드 때 trashRestoredAt을 지우면 안 된다');
    const mergeFn = extractFunction('function mergeBuildingTrashState(');
    assert.ok(/resolveBuildingTrashState\(localMatch, remoteB\)/.test(mergeFn));
}

testNdtAvgOnlyForOwnCategory();
testStrengthAngleZeroKept();
testNdtEditsBumpUpdatedAt();
testDefectModalStaleOpenGuard();
testImportUsesFloorAtClick();
testFloorDeleteTombstonesDispGroups();
testBuildingTrashRestoreWins();
testUndoRedoReconcile().then(
    () => console.log('test-deletion-sync-audit: ok'),
    (e) => { console.error(e); process.exit(1); }
);
