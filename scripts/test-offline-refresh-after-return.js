#!/usr/bin/env node
'use strict';
/**
 * 2026-10-19 「온라인 연결될 때마다 오프라인 상태에서 업데이트되어서 그게 다시 오프라인이 되어야」
 *  - 다 올리고 서버 확인이 끝나면 → 오프라인 준비한 건물의 모든 층(다른 사람이 고친 층 포함)을 서버 최신으로 다시 받아 기기에 저장
 *  - 오프라인 준비 창에서 건물마다: 올라간/전체(종류별)·실패·다시 올리기 + 「다시 받는 중 n/m층」·「오프라인 준비 완료 (시각)」·「최신으로 다시 받기」
 *  - 배지·알약은 그 창의 동기화 칸으로 바로 간다
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sp = require(path.join(root, 'js', 'core', 'sync-progress.js'));
const { extractFunction } = require('./lib-extract-fn');

// --- 진행률: 건물마다 따로 센다 ---
{
    const mem = new Map();
    let t = 1000;
    const tr = sp.createTracker({ storage: { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, v) }, now: () => t });
    tr.record('move', 'dA1', 'A_1F');
    tr.record('edit', 'dA2', 'A_2F');
    tr.record('photo', 'pA1', 'A_1F');
    tr.record('move', 'dB1', 'B_1F');
    tr.startSession(['A_1F', 'A_2F', 'B_1F', 'A_3F']);
    tr.confirmFloor('A_1F', tr.mark());
    tr.confirmPhoto('pA1');
    const ctx = { dirtyFloorKeys: ['A_2F', 'B_1F', 'A_3F'], online: true, syncing: true, photoState: () => 'pending' };
    const a = tr.summaryFor(ctx, 'A_');
    const b = tr.summaryFor(ctx, 'B_');
    const row = (s, k) => s.rows.find((r) => r.kind === k) || null;
    assert.deepStrictEqual([row(a, 'move').done, row(a, 'move').total], [1, 1], 'A 마킹 이동 1/1');
    assert.deepStrictEqual([row(a, 'photo').done, row(a, 'photo').total], [1, 1], 'A 사진 1/1');
    assert.deepStrictEqual([row(a, 'edit').done, row(a, 'edit').total], [0, 1], 'A 결함 수정 0/1');
    assert.deepStrictEqual([row(a, 'other').pending], [1], 'A 3층(일지 없는 변경)');
    assert.strictEqual(a.pending, 2);
    assert.strictEqual(b.pending, 1, 'B는 B 것만');
    assert.ok(!row(b, 'photo'), 'B에 A 사진이 섞이지 않음');
    tr.noteFailure('A_2F', '서버 동기화 실패');
    tr.noteFailure('B_1F', '실패');
    assert.deepStrictEqual(tr.summaryFor(ctx, 'A_').failures.map((f) => f.where), ['A_2F'], '실패도 건물마다');
    const html = sp.renderPanelHtml(a, (fk) => fk);
    assert.ok(/올라감/.test(html) && /남음 2/.test(html));
}

// --- 다시 받기 상태 글자 ---
{
    const fmt = (ts) => `T${ts}`;
    assert.strictEqual(sp.refreshStatusText({ running: true, phase: 'floors', done: 3, total: 12 }, null, fmt), '다시 받는 중 3/12층');
    assert.strictEqual(sp.refreshStatusText({ running: true, phase: 'photos', done: 5, total: 40 }, null, fmt), '다시 받는 중 · 사진 5/40');
    assert.strictEqual(sp.refreshStatusText({ at: 77, ok: true, kind: 'prep' }, null, fmt), '오프라인 준비 완료 (T77)');
    assert.strictEqual(sp.refreshStatusText(null, { at: 55, complete: true }, fmt), '오프라인 준비 완료 (T55)');
    assert.ok(/일부만 받음 \(층 2개 못 받음\)/.test(sp.refreshStatusText({ at: 9, ok: false, failed: ['1F', '2F'] }, null, fmt)));
    assert.strictEqual(sp.refreshStatusText(null, null, fmt), '오프라인 준비 안 함');
}

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

// --- 복귀 흐름: 올리기 → 확인 → (다 맞으면) 최신 다시 받기. 비울지 묻지 않음 ---
{
    const ret = extractFunction(app, 'async function runOfflineReturnSync(');
    const verifyAt = ret.indexOf('await verifyBuildingOnServer(b)');
    const failReturn = ret.indexOf('if (failed.length) {', verifyAt);
    const refreshAt = ret.indexOf('await refreshOfflineBuildingsAfterReturn(bldgs)');
    assert.ok(verifyAt > 0 && failReturn > verifyAt && refreshAt > failReturn, '확인이 다 맞은 뒤에만 다시 받기');
    assert.ok(!/appConfirm\(`오프라인에서 작업한 내용이 모두/.test(ret) && !/await clearOfflinePrep\(bldgs\)/.test(ret), '복귀 때 「비울까요?」를 묻고 비우지 않음');
    assert.ok(/refreshRecentBuildingsAfterReturn\(new Set\(\)\)/.test(ret), '오프라인 준비 안 한 경우 최근 연 건물 층을 최신으로');
}
// --- 다시 받기: 준비한 건물은 runOfflinePrep(모든 층·도면·새 사진), 아니면 층만. 읽기만 ---
{
    const fn = extractFunction(app, 'async function refreshOfflineBuildingNow(');
    assert.ok(/await runOfflinePrep\(bldg, \{ hiRes: !!\(prevRec && prevRec\.hiRes\), onProgress \}\)/.test(fn));
    assert.ok(/await refreshBuildingFloorsFromServer\(bldg, \{\n\s+force: true,/.test(fn));
    assert.ok(/if \(o\.manual && [^\n]+\) \{\n\s+await flushBuildingEditsToServer\(bldg\);/.test(fn), '버튼: 안 올린 수정이 있으면 먼저 올림');
    const writesServer = /writeFloorSyncBundle|writeChunked|docRef|\.set\(\{|\.update\(/;
    assert.ok(!writesServer.test(fn), '서버에 쓰지 않음(올리기는 평소 동기화 경로만)');
    const prep = extractFunction(app, 'async function runOfflinePrep(');
    assert.ok(!writesServer.test(prep), '오프라인 준비도 서버에 쓰지 않음');
    const all = extractFunction(app, 'async function refreshBuildingFloorsFromServer(');
    assert.ok(/tellProgress\(codeIdx\+\+\)/.test(all) && /saveStateToLocalStorage\(\)/.test(all), '층마다 진행 알림 + 기기 저장');
    const prepAll = extractFunction(app, 'async function runOfflinePrep(');
    assert.ok(/buildingFloorCodesForBackup\(bldg\)\.concat/.test(prepAll), '모든 층(안 연 층 포함)');
}
// --- 오프라인 준비 창 ---
{
    assert.ok(/<div class="offline-prep-sync" id="offlinePrepSync" aria-live="polite"><\/div>/.test(app), '창 맨 위 동기화 칸');
    const sec = extractFunction(app, 'async function renderOfflinePrepSyncSection(');
    assert.ok(/syncProgressSummaryForBuilding\(b\.id\)/.test(sec), '건물마다 진행률');
    assert.ok(/sp\.refreshStatusText\(rs, rec, fmt\)/.test(sec));
    assert.ok(/지금 다시 올리기/.test(sec) && /최신으로 다시 받기/.test(sec));
    assert.ok(/sp\.renderPanelHtml\(bsum, syncProgressFloorLabel\)/.test(sec), '종류별 올라감/전체·실패');
    const open = extractFunction(app, 'function openSyncProgressPanel(');
    assert.ok(/window\.openOfflinePrepModal\(target, \{ focusSync: true \}\)/.test(open), '배지·알약 → 오프라인 준비 창');
    assert.ok(/sec\.scrollIntoView\(/.test(app), '동기화 칸으로 스크롤');
    const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
    assert.ok(css.includes('.op-sync-bldg') && css.includes('@media (max-width: 600px)'), 'PC·휴대폰 모양');
}

console.log('test-offline-refresh-after-return: ok');
