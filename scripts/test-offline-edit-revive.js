'use strict';
// 2026-10-21 오프라인 내용 수정은 나중 삭제를 이긴다(온라인 수정·위치만 옮긴 것은 지금처럼 삭제가 이김)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SM = require('../js/core/sync-merge.js');
const K = 'B1_3F';
const clone = (o) => JSON.parse(JSON.stringify(o));
const base = { id: 'd1', no: 'NO.01', defectType: '균열', x: 10, y: 20, contentUpdatedAt: 100, updatedAt: 100, positionUpdatedAt: 100 };
// 한 번 합치기: server(서버 묶음) + local(이 기기)
function merge(server, local) {
    return SM.mergeDefectsMaps(
        { [K]: server.items }, { [K]: local.items },
        { [K]: server.del || [] }, { [K]: local.del || [] },
        { [K]: server.delAt || {} }, { [K]: local.delAt || {} }, {}
    );
}
const alive = (r) => (r.defects[K] || []).some((d) => d.id === 'd1');
const stripOffline = (items) => items.map((d) => { const c = clone(d); delete c.offlineEditAt; return c; });

// 1) 오프라인 내용 수정 vs 나중 삭제(층 삭제처럼 벽시계 묘비) → 살아남고, 되살린 시각이 묘비보다 나중
const offEdit = Object.assign(clone(base), { defectType: '누수', contentUpdatedAt: 200, offlineEditAt: 200 });
const serverDeleted = { items: [], del: ['d1'], delAt: { d1: 500 } };
let r = merge(serverDeleted, { items: [offEdit] });
assert(alive(r), '오프라인 내용 수정이 삭제를 이김');
let rec = r.defects[K][0];
assert.strictEqual(rec.defectType, '누수');
assert(rec.revivedAt > 500, '되살린 시각 > 묘비');
assert(!(r.deletedDefectIds[K] || []).includes('d1'), '이 결함의 묘비는 빠짐');
// 서버에 올라감(오프라인 표시는 빼고) → 지운 기기 B가 받으면 옛 묘비가 있어도 살아 있음
const serverNow = { items: stripOffline(r.defects[K]), del: r.deletedDefectIds[K] || [], delAt: r.deletedDefectAt[K] || {} };
const B = { items: [], del: ['d1'], delAt: { d1: 500 } };
r = merge(serverNow, B);
assert(alive(r), '다른 기기의 옛 묘비가 다시 지우지 않음');
assert(!(r.deletedDefectIds[K] || []).includes('d1'));
// B가 다시 지우면(본 것 기준 묘비) 지우기가 이긴다
const seen = r.defects[K][0];
const reDel = { items: [], del: ['d1'], delAt: { d1: SM.tombstoneStampFor(seen, 'pin') } };
const A2 = { items: stripOffline([rec]) };   // A는 올린 뒤라 오프라인 표시 없음
r = merge(reDel, A2);
assert(!alive(r), '되살린 뒤 다시 지우면 삭제가 이김');
// 반대 순서(이 기기가 서버 쪽, 지운 기기가 로컬 쪽)도 같다
r = merge({ items: [offEdit] }, serverDeleted);
assert(alive(r), '순서 바꿔도 오프라인 수정이 이김');

// 2) 온라인 내용 수정(오프라인 표시 없음) vs 나중 삭제 → 삭제가 이김(지금 규칙)
const onEdit = Object.assign(clone(base), { defectType: '누수', contentUpdatedAt: 200 });
assert(!alive(merge(serverDeleted, { items: [onEdit] })), '온라인 수정은 나중 삭제에 짐');
assert(!alive(merge({ items: [onEdit] }, serverDeleted)), '순서 바꿔도');

// 3) 오프라인에서 위치만 옮김(내용 수정 아님 → 표시 없음) vs 삭제 → 삭제가 이김
const offMove = Object.assign(clone(base), { x: 99, y: 88, positionUpdatedAt: 300 });
assert(!alive(merge(serverDeleted, { items: [offMove] })), '위치만 옮긴 것은 삭제에 짐');

// 4) 아무 수정 없음 → 삭제
assert(!alive(merge(serverDeleted, { items: [clone(base)] })));

// 5) 지운 묘비가 먼저 올라갔고, 그걸 못 받은 기기가 오프라인에서 내용 수정 → 살아남음
const later = Object.assign(clone(base), { cause: '건조수축', contentUpdatedAt: 900, offlineEditAt: 900 });
assert(alive(merge({ items: [], del: ['d1'], delAt: { d1: 100 } }, { items: [later] })));

// 앱: 오프라인일 때만 표시, 서버 사본엔 안 실림, 올린 뒤 지움
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert(/if \(journalContentChanged && typeof isEditingOffline === .function. && isEditingOffline\(\)\) defect\.offlineEditAt = defect\.contentUpdatedAt;/.test(app));
assert(/navigator\.onLine === false\) return true;[\s\S]{0,120}isSyncParked\(\)\) return true;/.test(app));
assert(/const \{ offlineEditAt, \.\.\.rest \} = d;/.test(app), '서버 사본엔 오프라인 표시 없음');
assert(/delete d\.offlineEditAt;/.test(app), '올린 뒤 표시 지움');
assert(!SM.isDefectContentField('offlineEditAt') && !SM.isDefectContentField('revivedAt'), '내용 칸 아님');
console.log('test-offline-edit-revive: ok');
