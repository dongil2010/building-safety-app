'use strict';
/** 균열게이지·팁 비교사진을 기기 저장본(localStorage) 밖 IndexedDB로 — js/core/gauge-photo-store.js + app.js 연결 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const gp = require(path.join(__dirname, '..', 'js', 'core', 'gauge-photo-store.js'));

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(500);
const IMG2 = 'data:image/jpeg;base64,' + 'B'.repeat(500);

// 번호
const id = gp.newPhotoId(() => 0.5);
assert.ok(/^cg[0-9a-z]{10}$/.test(id), id);
assert.notStrictEqual(gp.newPhotoId(), gp.newPhotoId());

// 저장본: 확인 전에는 사진을 그대로 둔다
const rec = { id: 'n1', category: '균열모니터', crackGaugeLog: { gaugeNo: 'G-01', prevPhoto: IMG, currPhoto: IMG2, readings: [] } };
let r = gp.stripForLocalSave(rec, () => false);
assert.strictEqual(r.rec, rec);
assert.strictEqual(r.inlineLeft, 2);
assert.strictEqual(gp.migrationTasksOf(rec, () => false).length, 2);

// 번호만 있고 확인 안 됨 → 그대로
rec.crackGaugeLog.prevPhotoId = 'cgaaaa';
r = gp.stripForLocalSave(rec, () => false);
assert.strictEqual(r.rec.crackGaugeLog.prevPhoto, IMG);

// 확인된 것만 뺀다, 원본(메모리)은 안 건드림
r = gp.stripForLocalSave(rec, (p) => p === 'cgaaaa');
assert.strictEqual(r.stripped, 1);
assert.strictEqual(r.inlineLeft, 1);
assert.strictEqual(r.rec.crackGaugeLog.prevPhoto, '');
assert.strictEqual(r.rec.crackGaugeLog.prevPhotoId, 'cgaaaa');
assert.strictEqual(r.rec.crackGaugeLog.hasPrevPhoto, true);
assert.strictEqual(r.rec.crackGaugeLog.currPhoto, IMG2);
assert.strictEqual(rec.crackGaugeLog.prevPhoto, IMG, '메모리 사진은 그대로');
assert.strictEqual(gp.migrationTasksOf(rec, (p) => p === 'cgaaaa').length, 1);

// 불러올 칸
const loaded = { crackTipLog: { prevPhoto: '', prevPhotoId: 'cgbbbb', currPhoto: '' } };
assert.deepStrictEqual(gp.hydrateTasksOf(loaded).map((t) => t.pid), ['cgbbbb']);
assert.deepStrictEqual(gp.photoIdsOf(rec), ['cgaaaa']);

// 원격 병합 뒤 이어 붙이기
assert.strictEqual(gp.canCarryLocalPhoto({ prevPhoto: IMG, prevPhotoId: 'x' }, { prevPhoto: '', prevPhotoId: 'x' }, 'prevPhoto'), true);
assert.strictEqual(gp.canCarryLocalPhoto({ prevPhoto: IMG, prevPhotoId: 'x' }, { prevPhoto: '', prevPhotoId: 'y' }, 'prevPhoto'), false, '번호가 바뀌면 옛 사진 안 붙임');
assert.strictEqual(gp.canCarryLocalPhoto({ prevPhoto: IMG }, { prevPhoto: '', hasPrevPhoto: true }, 'prevPhoto'), true, '옛 기기 규칙');
assert.strictEqual(gp.canCarryLocalPhoto({ prevPhoto: IMG }, { prevPhoto: '', hasPrevPhoto: false }, 'prevPhoto'), false);
assert.strictEqual(gp.isInlineImage('https://x/y.jpg'), false);

// app.js 연결
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(idx.indexOf('js/core/gauge-photo-store.js') > 0 && idx.indexOf('js/core/gauge-photo-store.js') < idx.indexOf('src="app.js'));
assert.ok(/ndtData: sanitizedNdt,/.test(app), '비파괴 저장본도 사진을 뺀 사본');
assert.ok(/return gaugeStripForLocal\(out, gaugeSaveStats\);/.test(app), '결함(예전 게이지 기록) 저장본도');
const mig = app.slice(app.indexOf('async function migrateInlineGaugePhotos'), app.indexOf('window.migrateInlineGaugePhotos ='));
assert.ok(/ensurePreGaugeMigrationBackup\(\)\)\) return 0/.test(mig), '백업이 안 되면 옮기지 않음');
const wIdx = mig.indexOf("await idbSet('photos', docKey, url)");
const rIdx = mig.indexOf("await idbGet('photos', docKey)");
const setIdIdx = mig.indexOf('log[t.slot.idField] = pid');
assert.ok(wIdx > 0 && rIdx > wIdx && setIdIdx > rIdx, '쓰고 → 다시 읽어 확인 → 그 뒤에 번호');
assert.ok(/if \(back !== url\) \{[\s\S]{0,160}continue;/.test(mig), '확인 실패면 건너뜀(사진 그대로)');
assert.ok(/await ensureGaugePhotosLoaded\(bldgId\);\s*\n\s*const crackFloorsData = buildHwpxCrackMonitorFloorsData/.test(app), '한글 내보내기 전에 사진 채움');
assert.ok(/await ensureGaugePhotosLoaded\(currentBldgId\);\s*\n\s*const crackPagesHtml/.test(app), 'PDF 보고서 전에도');
assert.ok(/const gauge = gp \? gp\.photoIdsOf\(item\) : \[\];/.test(app), '삭제 보류·재업로드에 게이지 사진 포함');
assert.ok(/prevPhotoId: crackMonitorUiPhotoId\('gauge', 'prev'\)/.test(app), '창 저장 때 번호 이어 쓰기');
console.log('test-gauge-photo-store: ok');
