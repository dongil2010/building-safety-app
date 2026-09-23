#!/usr/bin/env node
'use strict';

/**
 * 사진 고유 ID 전환 1단계 (2026-09-23) — "i번째 사진 ID"는 결함의 목록에서 읽는다.
 *
 * 결함 사진 ID가 자리 번호(결함id_0, _1 …)라서, 가운데 사진을 지우면 뒤 사진이 앞 ID를
 * 물려받고 네 저장소(IndexedDB·Firestore·Storage·캐시)가 전부 따라 바뀌어야 했다.
 * 하나라도 늦으면 다른 기기에 지운 사진이 보였다(09-21 6e6fa27·1db0c51, 09-22 e30aa81).
 *
 * 1단계는 동작을 바꾸지 않는다. 지금은 목록 자체가 자리 번호라 읽는 값이 같다.
 * 대신 3단계에서 새 사진에 고유 ID를 주면, 목록을 읽는 곳은 손대지 않아도 따라간다.
 * 그래서 **자리 번호로 ID를 만드는 곳을 정해진 몇 곳으로 묶어 두는 것**이 이 테스트의 목적이다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const open = app.indexOf('{', app.indexOf(')', at));
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

const ctx = {};
vm.createContext(ctx);
vm.runInContext([
    extractFunction('function getPhotoDocId('),
    extractFunction('function defectPhotoIdAt('),
    extractFunction('function defectPhotoIdList('),
    'this.getPhotoDocId = getPhotoDocId; this.at = defectPhotoIdAt; this.list = defectPhotoIdList;'
].join('\n'), ctx);

// --- 목록이 없으면(옛 데이터) 예전처럼 자리 번호 ---
(function fallsBackToPosition() {
    const d = { id: 'D1' };
    assert.strictEqual(ctx.at(d, 0), 'D1_0');
    assert.strictEqual(ctx.at(d, 2), 'D1_2');
    assert.strictEqual(ctx.at(d, 1, 'prev'), 'D1_prev_1');
})();

// --- 목록이 있으면 목록을 따른다 (3단계에서 고유 ID가 여기로 들어온다) ---
(function followsStoredList() {
    const d = { id: 'D1', photoIds: ['D1_0', 'ph_abc', 'D1_2'], prevRoundPhotoIds: ['ph_old'] };
    assert.strictEqual(ctx.at(d, 1), 'ph_abc', '가운데를 지워도 뒤 사진이 ID를 물려받지 않아야 한다');
    assert.strictEqual(ctx.at(d, 0, 'prev'), 'ph_old');
    // 전회차와 현회차 목록을 섞지 않는다
    assert.strictEqual(ctx.at(d, 1, 'prev'), 'D1_prev_1');
    assert.strictEqual(ctx.at(d, 0, ''), 'D1_0', "kind ''는 현회차");
})();

// --- 목록보다 많이 달라고 하면 뒷부분만 자리 번호 ---
(function listShorterThanCount() {
    const d = { id: 'D1', photoIds: ['ph_a'] };
    assert.deepStrictEqual(Array.from(ctx.list(d, 3)), ['ph_a', 'D1_1', 'D1_2']);
    assert.deepStrictEqual(Array.from(ctx.list(d, 0)), []);
})();

// --- 1단계가 동작을 안 바꾸는 이유: 지금 목록은 자리 번호로 매겨진다 ---
(function neutralForTodaysData() {
    const photos = ['a', 'b', 'c'];
    const d = { id: 'bldg_1F_x', photoIds: photos.map((_, i) => ctx.getPhotoDocId('bldg_1F_x', i)) };
    photos.forEach((_, i) => {
        assert.strictEqual(ctx.at(d, i), ctx.getPhotoDocId(d.id, i), i + '번째가 예전 값과 다르다');
    });
})();

// --- 자리 번호로 ID를 직접 만드는 곳은 정해진 곳뿐 ---
/**
 * 여기 있는 함수 말고 다른 곳에서 getPhotoDocId를 부르면 실패한다.
 * 이미 있는 사진의 ID가 필요하면 defectPhotoIdAt / defectPhotoIdList를 쓸 것.
 */
const ALLOWED = {
    // 새로 매기기 — 3단계에서 고유 ID로 바뀔 곳
    syncDefectPhotoRefs: '저장할 때 목록 매기기',
    cloneDefectPhotosForNewId: '결함 복제 시 새 결함 기준으로 매기기',
    applyImportedCarryOverPhotos: '가져오기 전회차 표시 시 전회차 목록 매기기',
    // 자리 번호 꼬리 지우기 — 3단계에서 "빠진 ID만 지우기"로 바뀔 곳
    pruneExtraDefectPhotos: '줄어든 개수 뒤쪽 슬롯 지우기',
    // 옛 데이터 복구 — 자리 번호로 찔러보는 게 목적
    repairMissingPhotoIds: '목록 없는 옛 결함의 클라우드 사진 찾기',
    // 목록부터 쓰고 자리 번호는 보조(덜 내려온 목록 대비 쓸어내기)
    dropStaleDefectPhotoSlotCache: '다른 기기가 바꾼 사진 캐시 비우기',
    purgeBuildingIndexedDbAssets: '건물 삭제 시 쓸어내기',
    uploadDefectPhotos: '목록이 없을 때만',
    uploadInlineDefectPhotosForSync: '목록이 없을 때만',
    deletePhotosForDefect: '목록 + 자리 번호 쓸어내기',
    defectPhotoIdAt: '목록이 없을 때만'
};

(function directUsesAreContained() {
    const re = /getPhotoDocId\(/g;
    const offenders = [];
    let m;
    while ((m = re.exec(app)) !== null) {
        if (app.slice(m.index - 9, m.index) === 'function ') continue; // 정의
        const before = app.slice(0, m.index);
        const fns = [...before.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(|window\.([A-Za-z0-9_]+)\s*=\s*async\s+function/g)];
        const last = fns[fns.length - 1];
        const name = last ? (last[1] || last[2]) : '?';
        if (!ALLOWED[name]) offenders.push(name + ' (' + before.split('\n').length + '번째 줄)');
    }
    assert.deepStrictEqual(offenders, [],
        '자리 번호로 사진 ID를 만드는 곳이 늘었다 — 이미 있는 사진은 defectPhotoIdAt으로 읽을 것:\n  ' + offenders.join('\n  '));
})();

// --- 올리기·지우기는 결함의 목록을 넘긴다 (안 넘기면 3단계에서 고유 ID 사진이 엉뚱한 이름으로 올라간다) ---
(function uploadsAndDeletesPassIds() {
    const uploads = [...app.matchAll(/(?<!function )uploadDefectPhotos\(([^;]*?)\)(?:\.catch|;)/g)].map((m) => m[1]);
    assert.ok(uploads.length >= 6, '업로드 호출을 못 찾았다: ' + uploads.length);
    uploads.forEach((args) => {
        const parts = args.split(',').length;
        assert.ok(parts >= 4, 'ID 목록 없이 올리는 곳: uploadDefectPhotos(' + args + ')');
    });

    const deletes = [...app.matchAll(/(?<!function )deletePhotosForDefect\(([^;]*?)\);/g)].map((m) => m[1]);
    assert.ok(deletes.length >= 2);
    deletes.forEach((args) => {
        assert.ok(args.split(',').length >= 4, 'ID 목록 없이 지우는 곳: deletePhotosForDefect(' + args + ')');
    });
})();

console.log('test-photo-id-read-path: ok');
