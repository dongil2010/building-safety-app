'use strict';
// 오프라인 준비(2026-10-07): 받을 사진 고르기·크기 계산, app.js 연결 확인
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const prep = require('../js/core/offline-prep.js');

const defects = {
    b1_1F: [
        { id: 'd1', photoIds: ['p1', 'p2'], photoUrls: ['https://s/p1', ''], prevRoundPhotoIds: ['p0'] },
        { id: 'd2', photoIds: ['p1'] }
    ],
    b1_2F: [{ id: 'd3', photoIds: ['p3'], photos: ['data:image/jpeg;base64,AAAA'] }],
    b10_1F: [{ id: 'x', photoIds: ['other'] }]
};
const refs = prep.collectDefectPhotoRefs(defects, 'b1', { p2: 'https://s/p2' }, { p0: 'https://s/p0' });
const byKey = Object.fromEntries(refs.map((r) => [r.key, r.url]));
assert.deepStrictEqual(Object.keys(byKey).sort(), ['p0', 'p1', 'p2', 'p3'], '이 건물 사진만, 중복 없이');
assert.strictEqual(byKey.p1, 'https://s/p1');
assert.strictEqual(byKey.p2, 'https://s/p2', '층 묶음 주소 사용');
assert.strictEqual(byKey.p0, 'https://s/p0', '메모리 주소 사용');
assert.strictEqual(byKey.p3, null, 'dataURL은 주소 아님 → 기기 사본 확인');

assert.strictEqual(prep.dataUrlBytes('data:image/jpeg;base64,AAAA'), 3);
assert.strictEqual(prep.formatBytes(1536), '2 KB');
assert.strictEqual(prep.formatBytes(5 * 1024 * 1024), '5.0 MB');
assert.deepStrictEqual(prep.uniqueFloorCodes(['1F', '', '2F', '1F', null]), ['1F', '2F']);
assert.ok(/완료/.test(prep.describeStatus({ complete: true, at: 0, floors: { ok: 2, total: 2 }, drawings: {}, photos: {}, bytes: 0 }, () => 't')));
assert.ok(/아직/.test(prep.describeStatus(null)));

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/js\/core\/offline-prep\.js\?v=/.test(html), 'index.html에 모듈');
assert.ok(html.indexOf('offline-prep.js') < html.indexOf('src="app.js'), 'app.js보다 먼저');
assert.ok(/async function runOfflinePrep\(/.test(app));
assert.ok(/data-action="offline-prep"/.test(app), '홈 건물 줄에 버튼');
// 서버에 쓰지 않는다: 준비 함수 본문에 쓰기 호출이 없어야 함
const body = app.slice(app.indexOf('async function runOfflinePrep('), app.indexOf('window.runOfflinePrep = runOfflinePrep'));
assert.ok(!/writeFloorSyncBundle|syncStateToFirebase|scheduleSyncToFirebase|persistPhotoToCloud|\.set\(\{|\.update\(|\.delete\(\)/.test(body), '읽기만');
// 메모리에 https 주소만 있으면 기기 사본을 먼저 본다
assert.ok(/메모리에 Storage 주소\(https\)만 있으면/.test(app));
console.log('test-offline-prep ok');
