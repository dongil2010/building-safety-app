// 층 표시 이름 바꾸기: floorCode 유지 · 빈칸/중복 거부 · 두 기기 병합(늦게 바꾼 이름 우선) · 묘비 무변경
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const F = require(path.join(root, 'js', 'core', 'floor-rename.js'));

const mk = () => ({ id: 'B1', floorsList: [{ floorCode: '1F', floorLabel: '지상 1층 (1F)' }, { floorCode: 'B1F', floorLabel: '지하 1층 (B1F)' }],
    deletedDrawingFloorCodes: ['2F'], drawingFloorCodes: ['1F', 'B1F'] });

let b = mk();
assert.strictEqual(F.rename(b, '1F', '   ').ok, false, '빈 이름 거부');
assert.strictEqual(F.rename(b, '1F', '지하 1층').ok, false, '다른 층 이름과 중복 거부(코드 꼬리표 무시)');
assert.strictEqual(F.rename(b, '1F', 'b1f').ok, false, '다른 층 코드와 같은 이름 거부');
let r = F.rename(b, '1F', '  1층  로비 ', { now: 1000 });
assert.ok(r.ok && r.changed);
assert.deepStrictEqual(b.floorsList.map((f) => f.floorCode), ['1F', 'B1F'], '층 코드·순서 그대로');
assert.strictEqual(b.floorsList[0].floorLabel, '1층 로비');
assert.deepStrictEqual(b.deletedDrawingFloorCodes, ['2F'], '묘비 무변경');
assert.deepStrictEqual(b.drawingFloorCodes, ['1F', 'B1F']);
assert.strictEqual(b.floorLabelAt['1F'], 1000);
r = F.rename(b, '1F', '1층 로비 2', { now: 500 });
assert.strictEqual(b.floorLabelAt['1F'], 1001, '시각은 항상 증가');
assert.strictEqual(F.rename(b, '1F', '1층 로비 2').changed, false);

// 두 기기: A가 t=2000에 이름 변경, B는 옛 이름(기록 없음) → 어느 쪽에서 병합해도 A 이름
const A = mk(); F.rename(A, '1F', '로비층', { now: 2000 });
const Bdev = mk();
const merged1 = JSON.parse(JSON.stringify(Bdev)); F.applyLabelMerge(merged1, Bdev, A);
assert.strictEqual(merged1.floorsList[0].floorLabel, '로비층');
const merged2 = JSON.parse(JSON.stringify(A)); merged2.floorsList[0].floorLabel = '지상 1층 (1F)'; F.applyLabelMerge(merged2, A, Bdev);
assert.strictEqual(merged2.floorsList[0].floorLabel, '로비층', '옛 서버 데이터가 덮지 못함');
// 양쪽 다 바꿨으면 늦은 쪽
const B2 = mk(); F.rename(B2, '1F', '필로티', { now: 3000 });
const m3 = JSON.parse(JSON.stringify(A)); F.applyLabelMerge(m3, A, B2);
assert.strictEqual(m3.floorsList[0].floorLabel, '필로티'); assert.strictEqual(m3.floorLabelAt['1F'], 3000);
// 기록 없는 레거시끼리는 손대지 않음
const m4 = mk(); m4.floorsList[0].floorLabel = 'X'; F.applyLabelMerge(m4, mk(), mk()); assert.strictEqual(m4.floorsList[0].floorLabel, 'X');
assert.strictEqual(m4.floorLabelAt, undefined, '레거시 데이터는 다시 쓰지 않음');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/floor-rename.js') > 0 && html.indexOf('js/core/floor-rename.js') < html.indexOf('src="app.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const fn = app.slice(app.indexOf('window.renameFloorDisplayName = async function'), app.indexOf('wireFloorRenameButton'));
assert.ok(fn.length > 100);
assert.ok(!/deletedDrawingFloor|forgetDeletedDrawingFloor|recordDeletedDrawingFloor|deleteExistingFloorDrawing/.test(fn), '이름 변경은 묘비/삭제 로직을 부르지 않음');
assert.ok(app.includes('floorRename.applyLabelMerge(merged, localMatch, b)'));
console.log('test-floor-rename: ok');
