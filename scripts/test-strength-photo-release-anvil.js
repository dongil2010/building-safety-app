#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22
 *  4) 반발경도 측정지 사진(str_건물_사진) — 비파괴 항목·층·건물을 지워도 클라우드에 고아로 남던 것을 정리한다.
 *     항목·층 삭제는 되돌리기·일괄 복원 대비로 이 기기 사본을 남기고 클라우드만, 건물 영구 삭제는 전부.
 *     남은 다른 항목(층 섞임 복제 등)이 같은 사진을 쓰면 지우지 않는다.
 *  5) 앤빌 장비평균(기준 82)은 건물 설정 strengthAnvilAvg — 동기화 병합에서 로컬 수정이 서버 옛 값에 안 덮이게.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const metaMerge = require(path.join(root, 'js', 'core', 'building-meta-merge.js'));

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

// ---- 4) 사진 정리 ----
function device(ndtData) {
    const calls = [];
    const ctx = {
        window: { state: { ndtData } },
        console: { warn() {} },
        Set, Array,
        deleteStrengthPhotoStorage: (bldgId, pid, opts) => { calls.push({ bldgId, pid, keepLocal: !!(opts && opts.keepLocal) }); return Promise.resolve(); }
    };
    vm.createContext(ctx);
    vm.runInContext([
        extractFunction('function strengthPhotoIdsOfItem('),
        extractFunction('function collectStrengthPhotoIdsInBuilding('),
        extractFunction('function releaseStrengthPhotosOfItems('),
        'this.release = releaseStrengthPhotosOfItems;'
    ].join('\n'), ctx);
    return { ctx, calls };
}

{
    // 1F에서 n1(사진 p1·p2)을 지웠다. 2F에는 층 섞임으로 복제된 n1'이 p2를 같이 쓴다.
    const removed = { id: 'n1', strengthSlots: [{ photoId: 'p1' }, { photoId: 'p2' }, { photoId: null }] };
    const d = device({
        b1_1F: [{ id: 'n9', strengthSlots: [{ photoId: 'p9' }] }],
        b1_2F: [{ id: 'n1', strengthSlots: [{ photoId: 'p2' }] }],
        b2_1F: [{ id: 'x', strengthSlots: [{ photoId: 'p1' }] }]
    });
    const n = d.ctx.release('b1', [removed], { keepLocal: true });
    assert.strictEqual(n, 1);
    assert.deepStrictEqual(d.calls, [{ bldgId: 'b1', pid: 'p1', keepLocal: true }],
        'p1만 정리(p2는 남은 항목이 씀, 다른 건물 b2의 같은 번호는 상관없음), 이 기기 사본은 남김');
}
{
    const d = device({});
    d.ctx.release('b1', [{ id: 'n1', strengthSlots: [{ photoId: 'p1' }] }], { keepLocal: false });
    assert.deepStrictEqual(d.calls, [{ bldgId: 'b1', pid: 'p1', keepLocal: false }], '영구 삭제는 사본까지');
    assert.strictEqual(device({}).ctx.release('b1', [], {}), 0);
    assert.strictEqual(device({}).ctx.release('b1', [{ id: 'n', category: '탄산화' }], {}), 0);
}

// 삭제 함수: keepLocal이면 메모리·IndexedDB는 안 지우고 클라우드만
{
    const fn = extractFunction('async function deleteStrengthPhotoStorage(');
    assert.ok(/if \(!\(opts && opts\.keepLocal\)\) \{[\s\S]*?idbDelete\('photos', key\);[\s\S]*?\}\s*try \{\s*await deleteCloudPhoto\(key\);/.test(fn),
        'keepLocal이면 로컬 삭제를 건너뛰고 클라우드는 항상 지운다');
}

// 세 삭제 경로 연결 — 항목을 state에서 뺀 뒤에 부른다
{
    const del = extractFunction('window.deleteNdtItem = function(');
    assert.ok(del.indexOf('releaseStrengthPhotosOfItems(state.currentBuildingId, removedNdt, { keepLocal: true })')
        > del.indexOf("state.ndtData[key] = (state.ndtData[key] || []).filter(x => x.id !== id);"), '항목 삭제: 뺀 뒤 정리, 사본 유지');
    assert.ok(/delete window\.state\.ndtData\[floorKey\];\n\s*\/\/[^\n]*\n\s*releaseStrengthPhotosOfItems\(bldg\.id, ndtItems\.slice\(\), \{ keepLocal: true \}\);/.test(app), '층 삭제: 사본 유지');
    const perm = extractFunction('window.permanentlyDeleteBuilding = async function(');
    assert.ok(perm.includes('releaseStrengthPhotosOfItems(bldg.id, removedNdtItems, { keepLocal: false })'), '건물 영구 삭제: 전부');
}

// ---- 5) 앤빌 ----
assert.ok(metaMerge.KEYS.includes('strengthAnvilAvg'), '앤빌 장비평균은 건물 병합에서 로컬 값을 지킨다');
assert.ok(/'enabledStrengthFormulas', 'strengthAnvilAvg'\n\s*\];/.test(app), 'app.js 예비 키 목록에도');
{
    const local = { id: 'b1', strengthAnvilAvg: 80 };
    metaMerge.markDirty(local, 2000);
    const remote = { id: 'b1', metaUpdatedAt: 1000 };
    assert.strictEqual(metaMerge.overlay(Object.assign({}, remote), local, remote).strengthAnvilAvg, 80);
}
const apply = extractFunction('function applyAnvilInputToBuilding(');
assert.ok(apply.indexOf('markBuildingMetaDirty(bldg)') > 0 && apply.indexOf('markBuildingMetaDirty(bldg)') < apply.indexOf('saveStateToLocalStorage()'),
    '앤빌을 바꾸면 수정 표시 후 저장');
// 입력칸은 index.html을 손대지 않고(규칙) JS로 설계강도 줄 아래에 만든다
{
    const ensure = extractFunction('function ensureAnvilInputRow(');
    assert.ok(ensure.includes('id="ndtAnvilAvg"') && ensure.includes("input.addEventListener('change', applyAnvilInputToBuilding)"), '입력칸 생성·연결');
    assert.ok(ensure.includes("document.getElementById('ndtDesignStrength')"), '설계강도 줄 아래');
    assert.ok(/ensureAnvilInputRow\(\);/.test(app), '화면 준비 때 만든다');
}
assert.strictEqual((app.match(/perfEnabledNames, getStrengthAnvilAvg\(bldg\)\)/g) || []).length, 2, '한글 성과표도 앤빌 반영');
assert.ok(/anvilAvg: getStrengthAnvilAvg\(bldg\),/.test(app), '목록·통계 재계산도 앤빌 반영');
assert.ok(/anvilAvg: getStrengthAnvilAvg\(window\.state\.currentBuilding\),/.test(app), '저장도 앤빌 반영');

console.log('test-strength-photo-release-anvil: ok');
