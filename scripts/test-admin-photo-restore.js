/**
 * 관리자 1회용 「사진 되살리기」(2026-09-30): 누르기 전엔 아무것도 안 하고, 미리보기는 서버를 읽기만,
 * 서버에 없고 결함이 아직 가리키는 사진만 원래 번호로 올리는지 확인.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('    function findDefectRefsForPhotoId(');
const end = app.indexOf('    window.openAdminPhotoRestore = function');
assert.ok(start > 0 && end > start);
const core = app.slice(start, end);
const ui = app.slice(end, app.indexOf('    window.renameCompanyAsAdmin = async function'));
assert.ok(ui.includes("window.state.role !== 'admin'"), '관리자만');
assert.ok(ui.indexOf('await window.appConfirm(') < ui.indexOf('runPhotoRestore(rows'), '확인 뒤에만 올림');
assert.ok(!/runPhotoRestore\(/.test(ui.slice(0, ui.indexOf("$('adminPhotoRestoreGo').onclick"))), '파일 고르기(미리보기)에서는 올리지 않음');
const btn = app.slice(app.indexOf('function setCompanyRenameButtonVisible('), app.indexOf('function setCompanyRenameButtonVisible(') + 2200);
assert.ok(btn.includes("rbtn.style.display = show ? 'inline-flex' : 'none'") && btn.includes("window.openAdminPhotoRestore()"), '관리자 버튼(대표만 보임)');
assert.ok(/storageScopeForPhotoId\(photoId\) \{\s*\/\/[^\n]*\n\s*if \(typeof _photoRestoreScopeOverride !== 'undefined'/.test(app));
assert.ok(/var _photoRestoreScopeOverride = new Map\(\)/.test(app));

const window = { state: { defects: {}, buildings: [] } };
const calls = { get: [], persist: [], idb: [], unmark: [] };
const server = { 'b_2F_0': { storagePath: 'x' } };
const deps = {
    defectPhotoIdList(d, n, kind) {
        const ids = kind === 'prev' ? d.prevRoundPhotoIds : d.photoIds; const out = [];
        for (let i = 0; i < n; i++) out.push((ids && ids[i]) || `${d.id}${kind === 'prev' ? '_prev' : ''}_${i}`);
        return out;
    },
    getBuildingSurveyRoundKey: (b) => b.round,
    getCompanyPhotosCollection: () => ({ doc: (id) => ({ get: async (o) => { calls.get.push([id, o && o.source]); return { exists: !!server[id], data: () => server[id] }; } }) }),
    hasFirebaseStorageMeta: (d) => !!(d && d.storagePath),
    storageScopeFromBuilding: (b) => ({ site: 's', round: b.round }),
    unmarkPhotoOnStorage: (id) => calls.unmark.push(id),
    persistPhotoToCloud: async (id, url, ex) => { calls.persist.push([id, deps._scope(id)]); return true; },
    persistPhotoUrlToIdb: async (id) => { calls.idb.push(id); return true; },
    JSZip: undefined, FileReader: undefined
};
const names = Object.keys(deps).filter((k) => k[0] !== '_');
const factory = new Function('window', ...names, core + '\nreturn { findDefectRefsForPhotoId, parseRestorePhotoName, buildPhotoRestorePreview, runPhotoRestore, _photoRestoreScopeOverride };');
const api = factory(window, ...names.map((k) => deps[k]));
deps._scope = (id) => api._photoRestoreScopeOverride.get(id);

assert.deepStrictEqual(api.parseRestorePhotoName('photos/EXT_NO06_67da268_0.jpg'), { floor: 'EXT', no: '06', photoId: '67da268_0' });
assert.strictEqual(api.parseRestorePhotoName('extracted.json'), null);

window.state.buildings = [{ id: 'bPrev', name: '영일', round: '2026년_상반기' }, { id: 'bCur', name: '영일', round: '2026년_하반기' }];
window.state.defects = {
    bCur_1F: [{ id: 'a', photoIds: ['a_0'] }],
    bPrev_1F: [{ id: 'a', photoIds: ['a_0'] }],
    bPrev_2F: [{ id: 'b', photoIds: ['b_2F_0'] }]
};
(async () => {
    const rows = await api.buildPhotoRestorePreview([
        { floor: '1F', no: '01', photoId: 'a_0', dataUrl: 'data:x' },
        { floor: '2F', no: '01', photoId: 'b_2F_0', dataUrl: 'data:y' },
        { floor: '3F', no: '01', photoId: 'zz_0', dataUrl: 'data:z' }
    ]);
    assert.deepStrictEqual(rows.map((r) => r.action), ['restore', 'skip', 'skip']);
    assert.strictEqual(rows[0].refs[0].bldg.id, 'bPrev', '이른 회차가 원래 주인');
    assert.ok(calls.get.every(([, src]) => src === 'server'));
    assert.strictEqual(calls.persist.length, 0, '미리보기는 올리지 않음');
    const res = await api.runPhotoRestore(rows);
    assert.deepStrictEqual(res, { ok: 1, fail: 0, total: 1 });
    assert.deepStrictEqual(calls.persist, [['a_0', { site: 's', round: '2026년_상반기' }]], '원래 번호·원래 회차 폴더');
    assert.deepStrictEqual(calls.unmark, ['a_0']);
    assert.deepStrictEqual(calls.idb, ['a_0']);
    assert.strictEqual(api._photoRestoreScopeOverride.size, 0);
    console.log('test-admin-photo-restore: ok');
})().catch((e) => { console.error(e); process.exit(1); });
