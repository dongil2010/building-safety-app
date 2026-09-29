/**
 * 전차 사진 가져오기 (2026-09-30)
 * - js/core/prev-round-photo-match.js 맞추기 규칙(번호 → 위치, 덮어쓰지 않음, 한 결함에 하나)
 * - app.js 연결: 미리보기 → 확인(앱 창) 뒤에만 바꿈, 전차 사진 칸에만 넣음, 새 ID 복사, 못 불러온 사진 보고
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const M = require(path.join(root, 'js/core/prev-round-photo-match.js'));

const D = (id, no, x, y, extra) => Object.assign({ id, no: 'NO.' + no, groupNo: String(no).padStart(2, '0'), x, y, targetX: x, targetY: y + 100 }, extra || {});
const P = ['data:image/jpeg;base64,AAAA'];

// 번호 키
assert.strictEqual(M.noKey({ no: 'NO.01' }), '1');
assert.strictEqual(M.noKey({ groupNo: '03', no: 'NO.03-2', surveyExtra: true }), '3-2', '통합 행은 자기 번호');
assert.strictEqual(M.photoCount({ photoIds: ['a', 'b'], photos: ['x'] }), 2);
assert.strictEqual(M.photoCount({ prevRoundPhotoIds: ['a'] }, 'prev'), 1);

{
    const src = {
        '1F': [
            D('s1', 1, 100, 100, { photos: P.concat(P) }),
            D('s2', 2, 300, 100, { photos: P }),
            D('s3', 3, 500, 100, { photos: P }),        // 현차에선 5번(번호 바뀜) → 위치
            D('s5', 9, 2000, 2000, { photos: P }),      // 못 찾음
            D('s6', 6, 900, 100)                        // 사진 없음 → 계획에서 빠짐
        ],
        '2F': [D('s7', 1, 100, 100, { photos: P })]
    };
    const tgt = {
        '1F': [
            D('t1', 1, 102, 101),
            D('t2', 2, 300, 100, { prevRoundPhotoIds: ['keep'] }),
            D('t3', 5, 505, 98),
            D('t6', 6, 900, 100)
        ]
    };
    const plan = M.plan(src, tgt, { maxDist: 120 });
    assert.deepStrictEqual(plan.matches.map((m) => [m.src.id, m.tgt.id, m.by]), [['s1', 't1', 'no'], ['s3', 't3', 'pos']]);
    assert.strictEqual(plan.photoTotal, 3);
    assert.deepStrictEqual(plan.skippedHasPrev.map((m) => m.tgt.id), ['t2'], '이미 전차 사진 → 건너뜀');
    assert.deepStrictEqual(plan.unmatched.map((u) => u.src.id).sort(), ['s5', 's7']);
    assert.ok(plan.unmatched.find((u) => u.src.id === 's7').reason.includes('층'), '현차에 없는 층');
    // 입력은 건드리지 않음
    assert.strictEqual(tgt['1F'][0].prevRoundPhotoIds, undefined);
}
{
    // 위치 맞춤이 번호 짝을 뺏지 않음: s9(번호 없음)가 t1 바로 옆이어도 t1은 s1 차지
    const plan = M.plan(
        { '1F': [D('s9', 77, 101, 100, { photos: P }), D('s1', 1, 400, 400, { photos: P })] },
        { '1F': [D('t1', 1, 100, 100)] },
        { maxDist: 120 }
    );
    assert.deepStrictEqual(plan.matches.map((m) => [m.src.id, m.tgt.id]), [['s1', 't1']]);
    assert.strictEqual(plan.unmatched[0].src.id, 's9');
}
{
    // 비슷하게 가까운 후보 둘 → 맞추지 않음
    const plan = M.plan(
        { '1F': [D('s1', 50, 200, 200, { photos: P })] },
        { '1F': [D('a', 1, 240, 200), D('b', 2, 160, 200)] },
        { maxDist: 120 }
    );
    assert.strictEqual(plan.matches.length, 0);
    assert.ok(plan.unmatched[0].reason.includes('여러'));
}
{
    // 같은 번호 둘 → 가까운 쪽, 비슷하면 보고
    const two = [D('a', 1, 100, 100), D('b', 1, 1000, 100)];
    assert.strictEqual(M.plan({ '1F': [D('s', 1, 990, 100, { photos: P })] }, { '1F': two }).matches[0].tgt.id, 'b');
    const close = [D('a', 1, 100, 100), D('b', 1, 110, 100)];
    assert.strictEqual(M.plan({ '1F': [D('s', 1, 105, 100, { photos: P })] }, { '1F': close }).matches.length, 0);
}

// app.js 연결
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const at = app.indexOf('window.openPrevRoundPhotoImport = async function(');
assert.ok(at > 0);
const fn = app.slice(at, app.indexOf('function ensurePrevRoundPhotoImportSection(', at));
const confirmAt = fn.indexOf('if (!await window.appConfirm(msg,');
assert.ok(confirmAt > 0, '미리보기 확인(앱 창)');
assert.ok(fn.indexOf('t.prevRoundPhotos = got.urls.slice();') > confirmAt, '확인 뒤에만 바꿈');
assert.ok(fn.indexOf('assignDefectPhotoIds(t.id, got.urls, null, \'prev\')') > confirmAt, '새 전차 사진 ID');
assert.ok(fn.indexOf("uploadDefectPhotos(t.id, got.urls, 'prev', ids)") > confirmAt, 'Storage 새로 복사');
assert.ok(!/t\.photos\s*=|t\.photoIds\s*=/.test(fn), '현차 사진 칸은 건드리지 않음');
assert.ok((fn.match(/if \(api\.photoCount\(t, 'prev'\) > 0\) continue;/g) || []).length === 2, '복사 직전에도 덮어쓰기 확인');
assert.ok(fn.includes('loadFailed.push(') && fn.includes('불러오지 못한 사진'), '못 불러온 사진 보고');
assert.ok(fn.includes('markFloorKeyDirty(key)') && fn.includes('touchDefectUpdatedAt(t)'), '동기화 표시');
assert.ok(app.includes('if (typeof ensurePrevRoundPhotoImportSection === \'function\') ensurePrevRoundPhotoImportSection();'), '건물 수정 창에 버튼');
const iMatch = html.indexOf('js/core/prev-round-photo-match.js');
assert.ok(iMatch > 0 && iMatch < html.indexOf('<script src="app.js'), 'app.js 앞에서 읽음');

console.log('test-prev-round-photo-import: ok');
