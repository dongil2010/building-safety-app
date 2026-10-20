'use strict';
// 2026-10-19 동기화 진행률: 「오프라인 작업에서 사진넣고 마킹 움직이고 결함내용 고치고 했던거 얼마나 서버에 올라갔는지」
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const SP = require(path.join(root, 'js', 'core', 'sync-progress.js'));

function memStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
let clock = 1000;
const now = () => clock;
const store = memStorage();
const mk = () => SP.createTracker({ storage: store, storageKey: () => 'bsa_sync_journal_v1_c1', now });
let t = mk();
const row = (s, k) => s.rows.find((r) => r.kind === k) || { total: 0, done: 0, pending: 0 };

// 오프라인 작업: 사진 2, 이동 2(같은 마킹 두 번 = 1건), 수정 1, 새 마킹(이후 수정해도 1건), 삭제(앞선 이동은 합침)
t.record('photo', 'D1_u1', 'b_1F');
t.record('photo', 'D2_u1', '');
t.record('move', 'D1', 'b_1F');
t.record('move', 'D1', 'b_1F');
t.record('move', 'D3', 'b_1F');
t.record('edit', 'D2', 'b_1F');
t.record('add', 'N1', 'b_2F');
t.record('edit', 'N1', 'b_2F');
t.record('move', 'D9', 'b_2F');
t.record('del', 'D9', 'b_2F');
const dirty = ['b_1F', 'b_2F', 'b_3F'];   // 3F는 일지에 없는 변경(메모 등) → 기타
let s = t.summary({ dirtyFloorKeys: dirty, online: false });
assert.strictEqual(row(s, 'photo').pending, 2);
assert.strictEqual(row(s, 'move').pending, 2, '같은 마킹 여러 번 옮겨도 1건, 지운 마킹 이동은 삭제로 합침');
assert.strictEqual(row(s, 'edit').pending, 1);
assert.strictEqual(row(s, 'add').pending, 1, '새 마킹을 고쳐도 새 마킹 1건');
assert.strictEqual(row(s, 'del').pending, 1);
assert.strictEqual(row(s, 'other').pending, 1, '일지에 없는 층 변경은 기타(층 단위)');
assert.strictEqual(s.pending, 8);
assert.strictEqual(SP.pillText(s), '안 올라간 변경 8건');
assert.ok(SP.renderPanelHtml(s).includes('오프라인'));

// 새로고침해도 남는다(기기 저장)
t = mk();
assert.strictEqual(t.summary({ dirtyFloorKeys: dirty }).pending, 8);

// 다시 연결 → 올리기 시작: 지금 남은 것이 전체
t.startSession(dirty);
s = t.summary({ dirtyFloorKeys: dirty, online: true, syncing: true });
assert.strictEqual(s.total, 8);
assert.strictEqual(s.done, 0);
assert.strictEqual(SP.pillText(s), '서버에 올리는 중 0/8');

// 사진: 서버(Storage) 확인 때만 올라감. 층 쓰기 전 표시는 아님
assert.strictEqual(t.confirmPhoto('D1_u1'), true);
assert.strictEqual(t.confirmPhoto('없는사진'), false);
// 1F 층 묶음: 순번 표시 → (업로드 중 D1을 또 옮김) → 서버 확인
const seq = t.mark();
clock += 10;
t.record('move', 'D1', 'b_1F');
let r = t.confirmFloor('b_1F', seq, ['D1', 'D2', 'D3']);
assert.strictEqual(r.confirmed, 2, '묶음에 실린 D3 이동·D2 수정만 올라감');
assert.strictEqual(r.remaining, 1, '업로드 중 또 옮긴 D1은 남음 → 층을 다시 올림');
s = t.summary({ dirtyFloorKeys: dirty, online: true, syncing: true });
assert.strictEqual(row(s, 'move').done, 1);
assert.strictEqual(row(s, 'move').pending, 1);
assert.strictEqual(row(s, 'photo').done, 1);
// 실패 기록 → 확인되면 지워짐
t.noteFailure('b_2F', '서버에서 층을 읽지 못함 — 다음 동기화에서 다시');
s = t.summary({ dirtyFloorKeys: dirty, online: true });
assert.strictEqual(s.failures.length, 1);
assert.ok(SP.renderPanelHtml(s, (fk) => fk === 'b_2F' ? '본동 2층' : fk).includes('본동 2층 — 서버에서 층을 읽지 못함'));
// 사진 표시가 서버 주소로 확인되면(ctx.photoState) 올라감, 결함에서 빠진 사진은 1분 뒤 뺌
s = t.summary({ dirtyFloorKeys: dirty, online: true, photoState: (id) => (id === 'D2_u1' ? 'uploaded' : 'pending') });
assert.strictEqual(row(s, 'photo').done, 2);
t.confirmFloor('b_1F', t.mark(), ['D1']);
t.confirmFloor('b_2F', t.mark(), ['N1', 'D9']);
assert.strictEqual(t.summary({ dirtyFloorKeys: ['b_3F'] }).failures.length, 0, '층 확인 뒤 실패 지움');
t.confirmFloor('b_3F', t.mark(), []);
s = t.summary({ dirtyFloorKeys: [], online: true, syncing: false });
assert.strictEqual(s.pending, 0);
assert.strictEqual(s.done, s.total);
assert.strictEqual(row(s, 'other').done, 1, '기타 층도 서버 확인 뒤 올라감');
assert.ok(s.finishedAt > 0 && s.finishedNow);
assert.strictEqual(SP.pillText(s), '모두 서버에 올라감');
assert.ok(SP.renderPanelHtml(s).includes('모두 서버에 올라감'));
// 다음 변경이 오면 새로 센다
t.record('edit', 'D2', 'b_1F');
s = t.summary({ dirtyFloorKeys: ['b_1F'] });
assert.strictEqual(s.total, 1);
assert.strictEqual(s.finishedAt, 0);
// 층이 더는 「올릴 것」이 아니면(층 지움 등) 5초 뒤 일지에서 뺀다(올라감으로 세지 않음)
clock += 6000;
s = t.summary({ dirtyFloorKeys: [] });
assert.strictEqual(s.pending, 0);
assert.strictEqual(s.done, 0);
// 회사별 키
const t2 = SP.createTracker({ storage: store, storageKey: () => 'bsa_sync_journal_v1_c2', now });
assert.strictEqual(t2.summary({ dirtyFloorKeys: [] }).pending, 0, '다른 회사 일지는 따로');
// HTML 이스케이프
t.noteFailure('<b>', '<script>');
assert.ok(!SP.renderPanelHtml(t.summary({ dirtyFloorKeys: [] })).includes('<script>'));

// ---- app.js 연결 ----
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const fnBody = (sig) => {
    const i = app.indexOf(sig);
    assert.ok(i >= 0, 'missing ' + sig);
    let j = app.indexOf(') {', i) + 2, d = 0;
    for (let k = j; k < app.length; k++) {
        if (app[k] === '{') d++;
        else if (app[k] === '}') { d--; if (d === 0) return app.slice(i, k + 1); }
    }
    throw new Error('unterminated ' + sig);
};
assert.ok(/journalDefectChange\('edit', defect\)/.test(fnBody('function touchDefectUpdatedAt(')), '결함 내용 수정 기록');
assert.ok(/journalContentChanged = !snap \|\| diff\.changed\.length > 0/.test(app), '내용 칸이 바뀐 것만');
assert.ok(/journalDefectChange\('move', defect\)/.test(fnBody('function touchDefectPositionUpdatedAt(')), '마킹 이동 기록');
assert.ok(/journalRecord\('del', defectId, floorKey\)/.test(fnBody('function trackDefectDeletion(')), '삭제 기록');
assert.ok(/journalRecord\('photo', photoId/.test(fnBody('function createDefectPhotoId(')), '새 사진 기록');
assert.ok(/j\.confirmPhoto\(photoId\)/.test(fnBody('function markPhotoOnStorage(')), '사진은 Storage 표시 때 올라감');
const w = fnBody('async function writeFloorSyncBundle(');
const markAt = w.indexOf('syncJournal().mark()');
const writeAt = w.indexOf('await writeChunkedPdfToDocRef(');
const confAt = w.indexOf('j.confirmFloor(floorKey, journalSeq, ids)');
assert.ok(markAt > 0 && markAt < w.indexOf('sanitizeDefectsForFirestore('), '묶음 만들기 전에 순번');
assert.ok(writeAt > 0 && confAt > writeAt, '서버 쓰기가 끝난 뒤에만 올라감');
assert.ok(/if \(res && res\.remaining\) \{/.test(w) && /if \(n <= 2\) markFloorKeyDirty\(floorKey\)/.test(w), '업로드 중 고친 것은 다시 올림(1분에 2번까지 — 끝없는 다시 올리기 방지)');
const sync = fnBody('async function syncStateToFirebase(');
assert.ok(sync.includes("syncProgressFail(floorKey, '서버에서 층을 읽지 못함"), '읽기 실패 표시');
assert.ok(sync.includes("syncProgressFail(floorKey, '다른 기기가 같은 층을"), 'rev 충돌 표시');
assert.ok(sync.includes("syncProgressFail(k, '사진 업로드 실패"), '사진 실패 표시');
assert.ok(sync.includes("syncProgressFail('sync'"), '동기화 오류 표시');
assert.ok(sync.indexOf('syncProgressBegin()') > sync.indexOf('_syncInFlight = true;'));
// 기존 안전장치 그대로(읽고 합친 뒤 rev 확인하고 쓰기)
assert.ok(sync.indexOf('readFloorBundleForSync(') < sync.indexOf('guard.confirmRevBeforeWrite(') && sync.indexOf('guard.confirmRevBeforeWrite(') < sync.indexOf('await writeFloorSyncBundle('));
// 비우기 규칙: 서버 확인 안 된 이 기기 변경이 있으면 비우지 않음
assert.ok(/이 기기 변경 \$\{n\}건 서버 확인 안 됨/.test(fnBody('async function verifyBuildingOnServer(')));
assert.ok(/syncProgressBegin\(\);\n\s*\/\/ ① 올리기/.test(app), '오프라인 복귀 올리기 시작');
// 어디서나 열기: 오프라인 배지·온라인 배지·알약
assert.ok(/badge\.addEventListener\('click', \(\) => openSyncProgressPanel\(\)\)/.test(app));
assert.ok(/hb\.addEventListener\('click', \(\) => openSyncProgressPanel\(\)\)/.test(app));
assert.ok(/pill\.addEventListener\('click', \(\) => openSyncProgressPanel\(\)\)/.test(app));
assert.ok(app.indexOf('let _syncProgressRenderTimer') < app.indexOf('    updateOfflineBadge();\n'), '처음 부르기 전에 선언(TDZ 방지)');
// 서버 쓰기 없음: 진행률 코드는 Firestore를 부르지 않는다
const block = app.slice(app.indexOf('// ---- 2026-10-19 동기화 진행률(js/core/sync-progress.js) ----'), app.indexOf('    updateOfflineBadge();\n'));
assert.ok(!/db\.|\.collection\(|firebase\./.test(block), '진행률 코드는 서버를 안 씀');
const libSrc = fs.readFileSync(path.join(root, 'js', 'core', 'sync-progress.js'), 'utf8');
assert.ok(!/firebase|firestore|fetch\(/i.test(libSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '모듈도 서버 안 씀');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/sync-progress.js') > 0 && html.indexOf('js/core/sync-progress.js') < html.indexOf('src="app.js'), 'app.js 전에 싣기');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(/\.sync-progress-pill/.test(css) && /@media \(max-width: 600px\)[\s\S]{0,200}\.bsp-overlay \{ align-items: flex-end/.test(css), '폰은 아래에서 올라오는 창');

console.log('test-sync-progress: ok');
