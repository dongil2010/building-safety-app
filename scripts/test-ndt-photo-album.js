#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 비파괴 장비조사 현장 사진 + 한글 "비파괴 장비조사 사진첩"
 *  1) 사진첩 소제목 순서·사진 번호·위치/내용 글자 (hwpx-ndt-maps buildPhotoAlbumSections)
 *  2) 현장 사진(item.photoIds·group.photoIds)이 측정지 사진과 같은 정리 길을 탄다
 *     — 지운 항목·구역의 사진만 클라우드 정리, 남은 구역이 쓰는 사진은 안 지움
 *  3) 동기화가 기기에 남은 현장 사진을 다시 올린다(항목·구역 모두, 실패하면 그 층 재시도)
 *  4) 건물 백업이 현장 사진을 "쓰는 사진"으로 잡는다 — 안 잡으면 백업 뒤 사진을 지울 때 클라우드에서 사라진다
 *  5) 입력창의 사진 버튼이 실제로 연결돼 있다(예전엔 화면에만 있고 눌러도 아무 일도 없었다)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const maps = require(path.join(root, 'js', 'shared', 'hwpx-ndt-maps.js'));
const health = require(path.join(root, 'js', 'core', 'data-health.js'));

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

// ---- 1) 사진첩 구성 ----
{
    const items = [
        { id: 'a', category: '강도', no: 'NO.01', location: '지하1층 C3', component: '기둥', photoIds: ['s1'] },
        { id: 'b', category: '실측', no: 'NO.01', location: '지하1층 보(1G1)', component: '보', photoIds: ['m1', 'm2', ''] },
        { id: 'c', category: '실측', no: 'NO.02', location: '지상1층', component: '', photoIds: [] },
        { id: 'd', category: '탄산화', no: 'NO.01', location: '', component: '벽체', photoIds: ['c1'] },
        { id: 'e', category: '내화피복', no: 'NO.03', location: '지상7층 상부 보', photoIds: ['f1'] }
    ];
    const groups = [
        { id: 'g1', groupNo: 'NO.01', locationType: '바닥', _ndtFloorLabel: '지하1층', photoIds: ['z1'] },   // 옛 구역: category 없음 = 부동침하
        { id: 'g2', category: '부재변위', groupNo: 'NO.01', locationType: '보', _ndtFloorLabel: '지상2층', photoIds: ['z2'] },
        { id: 'g3', category: '변위', groupNo: 'NO.02', locationType: '바닥', _ndtFloorLabel: '지하1층' }
    ];
    const secs = maps.buildPhotoAlbumSections(items, groups);
    assert.deepStrictEqual(secs.map((s) => s.title),
        ['부재실측', '콘크리트 강도', '콘크리트 탄산화', '내화피복 두께', '바닥 부동침하', '부재 처짐(변위)'],
        '정해진 순서, 사진 없는 항목(외벽 기울기 등)은 소제목도 없다');
    assert.deepStrictEqual(secs[0].entries, [
        { photoId: 'm1', label: '사진1', location: '지하1층 보(1G1)', content: '부재실측 NO.01' },
        { photoId: 'm2', label: '사진2', location: '지하1층 보(1G1)', content: '부재실측 NO.01' }
    ], '빈 사진 id는 빼고, 위치에 이미 부재 이름이 있으면 다시 붙이지 않는다');
    assert.deepStrictEqual(secs[1].entries[0], { photoId: 's1', label: '사진3', location: '지하1층 C3 기둥', content: '콘크리트 강도 NO.01' },
        '사진 번호는 사진첩 전체에 이어진다, 부재 이름이 위치에 없으면 붙인다');
    assert.strictEqual(secs[2].entries[0].location, '벽체', '위치가 비면 부재 이름만');
    assert.deepStrictEqual(secs[4].entries[0], { photoId: 'z1', label: '사진6', location: '지하1층 바닥', content: '바닥 부동침하 NO.01' });
    assert.strictEqual(secs[5].entries[0].content, '부재 처짐(변위) NO.01');
    assert.deepStrictEqual(maps.buildPhotoAlbumSections([], []), []);
    assert.deepStrictEqual(maps.buildPhotoAlbumSections(null, undefined), []);
}

// ---- 2) 정리 ----
function device(ndtData, ndtDisplacementGroups) {
    const calls = [];
    const ctx = {
        window: { state: { ndtData, ndtDisplacementGroups } },
        console: { warn() {} },
        Set, Array,
        deleteStrengthPhotoStorage: (bldgId, pid, opts) => { calls.push({ pid, keepLocal: !!(opts && opts.keepLocal) }); return Promise.resolve(); }
    };
    vm.createContext(ctx);
    vm.runInContext([
        extractFunction('function ndtFieldPhotoIdsOf('),
        extractFunction('function strengthPhotoIdsOfItem('),
        extractFunction('function collectStrengthPhotoIdsInBuilding('),
        extractFunction('function releaseStrengthPhotosOfItems('),
        'this.release = releaseStrengthPhotosOfItems;',
        'this.idsOf = strengthPhotoIdsOfItem;'
    ].join('\n'), ctx);
    return { ctx, calls };
}
{
    const d = device({}, {});
    assert.deepStrictEqual(Array.from(d.ctx.idsOf({ strengthSlots: [{ photoId: 'r1' }], photoIds: ['f1', null, 'f2'] })), ['r1', 'f1', 'f2'],
        '측정지 사진과 현장 사진을 함께');
}
{
    // 지운 구역 g9가 f1·f2를 쓰는데, 남은 구역 g1이 f2를 같이 쓴다(층 섞임 복제 등)
    const d = device(
        { b1_1F: [{ id: 'n1', photoIds: ['f3'] }] },
        { b1_1F: [{ id: 'g1', photoIds: ['f2'] }] }
    );
    d.ctx.release('b1', [{ id: 'g9', photoIds: ['f1', 'f2', 'f3'] }], { keepLocal: true });
    assert.deepStrictEqual(d.calls, [{ pid: 'f1', keepLocal: true }], '남은 항목·구역이 쓰는 사진은 안 지운다');
}
{
    // 입력창에서 사진 한 장을 뺄 때 쓰는 모양({ photoIds: [pid] })
    const d = device({ b1_1F: [{ id: 'n1', photoIds: ['f2'] }] }, {});
    d.ctx.release('b1', [{ photoIds: ['f1'] }], { keepLocal: true });
    assert.deepStrictEqual(d.calls, [{ pid: 'f1', keepLocal: true }]);
}

// ---- 3) 동기화 재업로드 ----
(async () => {
    const tried = [];
    const ctx = {
        db: {},
        window: {
            state: {
                companyId: 'c',
                buildings: [{ id: 'bld' }],
                ndtData: { bld_1F: [{ id: 'n1', photoIds: ['f1'] }], other_1F: [{ id: 'x', photoIds: ['fx'] }] },
                ndtDisplacementGroups: { bld_2F: [{ id: 'g1', photoIds: ['f2'] }] }
            }
        },
        console: { warn() {} },
        getPhotoDocId: (id, i) => `${id}_${i}`,
        getOverviewPhotoDocId: () => '',
        getStrengthPhotoDocId: (b, p) => `str_${b}_${p}`,
        ensurePhotoPersistedToStorage: async (pid) => { tried.push(pid); return pid !== 'str_bld_f2'; },
        runPhotoJobsInBatches: async (items, worker) => { for (const it of items) await worker(it); }
    };
    vm.createContext(ctx);
    vm.runInContext([
        'const PHOTO_SYNC_UPLOAD_MAX_RETRY = 5; const _photoSyncUploadFailCount = new Map();',
        extractFunction('async function uploadInlineDefectPhotosForSync('),
        'this.run = uploadInlineDefectPhotosForSync;'
    ].join('\n'), ctx);
    const failed = await ctx.run({});
    assert.deepStrictEqual(tried.sort(), ['str_bld_f1', 'str_bld_f2'], '이 건물의 항목·구역 사진만');
    assert.deepStrictEqual(Array.from(failed), ['bld_2F'], '못 올린 구역의 층을 다시 올릴 것으로');
})().catch((e) => { console.error(e); process.exit(1); });

// ---- 4) 백업이 쓰는 사진 ----
{
    const b = health.buildBuildingBackup('bld', [{
        floorCode: '1F',
        bundle: {
            markings: { items: [] },
            ndt: {
                items: [{ id: 'n1', category: '실측', photoIds: ['f1'], strengthSlots: [{ photoId: 'r1' }] }],
                displacementGroups: [{ id: 'g1', photoIds: ['f2'] }]
            }
        }
    }], 1000);
    assert.deepStrictEqual(b.photoIds.slice().sort(), ['str_bld_f1', 'str_bld_f2', 'str_bld_r1']);
}

// ---- 5) 화면 연결 ----
{
    ['btnTriggerNdtCamera', 'btnTriggerNdtGallery', 'inputNdtPhoto', 'inputNdtCamera', 'ndtPhotoPreviewList',
        'btnNdtDispEditCamera', 'btnNdtDispEditGallery', 'inputNdtDispEditPhoto', 'inputNdtDispEditCamera', 'ndtDispEditPhotoList']
        .forEach((id) => {
            assert.ok(html.indexOf(`id="${id}"`) >= 0, `index.html에 ${id}`);
            assert.ok(app.indexOf(`'${id}'`) >= 0, `app.js가 ${id}를 쓴다`);
        });
    const open = extractFunction('function openNdtModal(');
    assert.ok(/bindNdtItemPhotoInputs\(\)/.test(open) && /renderNdtItemPhotoList\(\)/.test(open), '입력창을 열 때 사진 버튼·목록을 붙인다');
    const commit = extractFunction('function commitNdtFromForm(');
    assert.strictEqual((commit.match(/photoIds: ndtItemPhotoIds\.slice\(\)/g) || []).length, 2, '수정·새 항목 둘 다 사진 목록을 저장');
    const groupOpen = extractFunction('function openNdtDisplacementGroupEditModal(');
    assert.ok(/renderNdtDispGroupPhotoList\(group\.id\)/.test(groupOpen), '구역 정보 창을 열 때 사진 목록');
}

// ---- 6) 한글 출력: 표본 사진첩 정리가 우리 사진첩을 지우지 않는다(둘 다 문서 끝까지 지우는 코드다) ----
{
    const hits = app.match(/const albumStart = secChildren\(\)\.find\(p => p !== ndtAlbumTitlePara && /g) || [];
    assert.strictEqual(hits.length, 2, '1·2종·3종 둘 다');
    assert.strictEqual((app.match(/await insertHwpxNdtPhotoAlbum\(/g) || []).length, 2, '1·2종·3종 둘 다 사진첩을 넣는다');
}

console.log('test-ndt-photo-album: ok');
