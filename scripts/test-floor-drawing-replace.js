'use strict';
// 2026-10-14 층 도면 교체: 같은 Storage 경로라도 새 파일은 반드시 올린다 / 도면 없는 층이 남지 않게
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function sliceFn(name) {
    const start = app.indexOf(`    async function ${name}(`) >= 0 ? app.indexOf(`    async function ${name}(`) : app.indexOf(`    function ${name}(`);
    assert.ok(start >= 0, name);
    const end = app.indexOf('\n    }\n', start);
    return app.slice(start, end + 6);
}

(async () => {
    // 1) 업로드: 경로가 같아도 data: 새 파일이면 올리고, 이미 그 파일(https)일 때만 건너뛴다
    const src = sliceFn('uploadAssetToFirebaseStorageAndMeta');
    const PATH = 'c/floorDrawings/b1_3F.jpg';
    const run = async (sourceUrl) => {
        const log = { uploaded: 0, deleted: [], meta: null };
        const f = new Function('isFirebaseStorageHttpUrl', 'storagePathFromDownloadURL', 'assetUrlToUploadBlob', 'uploadBlobToFirebaseStorage', 'writeFirestoreStorageMeta', 'deleteFirebaseStoragePath',
            src + '; return uploadAssetToFirebaseStorageAndMeta;')(
            (u) => /^https:\/\/firebasestorage/.test(u), () => PATH,
            async () => ({ blob: {}, contentType: 'image/jpeg' }),
            async (p) => { log.uploaded++; return { storagePath: p, downloadURL: 'https://firebasestorage/new' }; },
            async (_r, up) => { log.meta = up; }, async (p) => { log.deleted.push(p); });
        await f({}, PATH, sourceUrl, { previousStoragePath: PATH });
        return log;
    };
    const replaced = await run('data:image/jpeg;base64,AAAA');
    assert.strictEqual(replaced.uploaded, 1, '교체한 새 도면(data:)은 같은 경로여도 올린다');
    assert.strictEqual(replaced.meta.downloadURL, 'https://firebasestorage/new', '메타가 새 파일 주소를 가리킨다');
    assert.deepStrictEqual(replaced.deleted, [], '방금 올린 같은 경로 파일을 지우지 않는다');
    const same = await run('https://firebasestorage/old');
    assert.strictEqual(same.uploaded, 0, '이미 Storage에 있는 그 파일이면 다시 안 올린다');

    // 2) 층 목록: 빈 마킹 배열·지금 보는 층만으로 층을 되살리지 않는다
    const collect = new Function('window', 'isDeletedDrawingFloor', 'floorMarkingValueHasContent',
        sliceFn('collectKnownFloorCodesForBuilding') + '; return collectKnownFloorCodesForBuilding;');
    const has = new Function(sliceFn('floorMarkingValueHasContent') + '; return floorMarkingValueHasContent;')();
    const win = { state: { defects: { b1_EMPTY: [], b1_5F: [{ id: 'd' }] }, ndtData: { b1_N: [] }, currentBuildingId: 'b1', currentFloor: 'EMPTY' } };
    const codes = collect(win, () => false, has)({ id: 'b1', floorsList: [{ floorCode: '1F' }] });
    assert.ok(codes.has('1F') && codes.has('5F'), '도면 층·마킹 있는 층은 남김');
    assert.ok(!codes.has('EMPTY') && !codes.has('N'), '열어 보기만 한 빈 층은 안 되살림');
    const only = collect({ state: { currentBuildingId: 'b1', currentFloor: '2F' } }, () => false, has)({ id: 'b1' });
    assert.ok(only.has('2F'), '층 목록이 아예 비면 지금 층은 유지(드롭다운 보호)');

    // 3) 연결
    assert.ok(app.includes('removeDrawinglessFloorFromBuilding(bldg, item.floorCode);'), '변환 실패한 새 층은 뺀다');
    assert.ok(app.includes('if (cloud !== false) continue;'), '클라우드 확인을 못 하면 지우지 않는다');
    assert.ok(app.includes('const removable = empty.filter((e) => !e.defects && !e.ndt);'), '마킹 있는 층은 자동 정리 안 함');
    console.log('test-floor-drawing-replace: ok');
})().catch((e) => { console.error(e); process.exit(1); });
