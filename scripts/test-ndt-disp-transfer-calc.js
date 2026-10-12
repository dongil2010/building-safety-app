/* 부동침하 측기 이동 보정 — 계산 전용(2026-10-12 재설계)
 * 적은 레벨은 그대로, 이동 지점별 Va/Vb로 계산만 보정. 순서 없이·나중에 적은 값도 반영.
 * 옛 데이터(적용이 레벨을 고친 것)는 원래 값으로 돌리고 보정이 두 번 빠지지 않는다.
 * 키보드 들어올림이 혼자 왔다 갔다 하지 않게 한 부분도 같이 본다.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const T = require(path.join(root, 'js', 'core', 'ndt-disp-transfer.js'));
const G = require(path.join(root, 'js', 'core', 'ndt-grade.js'));

const mk = (levels) => ({ id: 'g', category: '부동침하', measureLength: 10,
    points: levels.map((l, i) => ({ id: 'p' + i, level: l })) });

// 1) 보정 없음 = 적은 값
assert.deepStrictEqual(T.correctedLevels(mk([1, 2, null])), [1, 2, null]);

// 2) 한 번 이동: (03)에서 Va 14 / Vb 20 → 뒤 번호는 −6
{
    const g = mk([10, 12, 20, 23]);
    T.setTransfer(g, 2, 14, 20);
    assert.deepStrictEqual(g.points.map((p) => p.level), [10, 12, 20, 23]);
    assert.deepStrictEqual(T.correctedLevels(g), [10, 12, 14, 17]);
    // 나중에 적은 값도 바로 보정
    g.points.push({ id: 'p4', level: 30 });
    assert.deepStrictEqual(T.correctedLevels(g), [10, 12, 14, 17, 24]);
    // 이동 지점 레벨이 비어 있어도 Va로 계산
    g.points[2].level = null;
    assert.strictEqual(T.correctedLevels(g)[2], 14);
}

// 3) 여러 번 이동 + 거꾸로 적기: 결과는 순서와 상관없음
{
    const a = mk([0, 1, 5, 6, 2, 3]);
    T.setTransfer(a, 2, 2, 5);   // Δ +3
    T.setTransfer(a, 4, 9, 2);   // 두 번째 측기 기준 Va 9 → Vb 2 (Δ −7)
    const b = mk([0, 1, 5, 6, 2, 3]);
    T.setTransfer(b, 4, 9, 2);
    T.setTransfer(b, 2, 2, 5);
    assert.deepStrictEqual(T.correctedLevels(a), T.correctedLevels(b));
    // (03)=2, (04)=6−3=3, (05)=9−3=6, (06)=3−(3−7)=7
    assert.deepStrictEqual(T.correctedLevels(a), [0, 1, 2, 3, 6, 7]);
    assert.ok(T.clearTransfer(a, 4));
    assert.deepStrictEqual(T.correctedLevels(a), [0, 1, 2, 3, -1, 0]);
}

// 4) 등급 계산이 보정값을 쓴다(모듈이 로드되어 있을 때)
{
    const g = mk([10, 12, 20, 23]);
    T.setTransfer(g, 2, 14, 20);
    assert.deepStrictEqual(G.calcLevels(g), [10, 12, 14, 17]);
    const c = G.calcGroupDisplacement(g);
    assert.ok(!c.incomplete);
    const plain = G.calcGroupDisplacement(mk([10, 12, 14, 17]));
    assert.strictEqual(c.tiltRatio, plain.tiltRatio);
    assert.strictEqual(c.grade, plain.grade);
    // 이동 지점 레벨을 안 적어도 Va가 있으면 채운 것으로 본다
    g.points[2].level = null;
    assert.ok(G.groupLevelsComplete(g));
}

// 5) 옛 데이터 옮기기: levelRaw로 되돌리고 stationTransfers → xfer, 두 번 안 빠짐
{
    // 옛 적용: 처음 [10,12,20,23], (03) Va14/Vb20 → level [10,12,14,17], levelRaw 저장
    const g = mk([10, 12, 14, 17]);
    g.points[2].levelRaw = 20; g.points[2].levelAtA = 14;
    g.points[3].levelRaw = 23;
    g.stationTransfers = [{ hop: 1, overlapPointId: 'p2', overlapIndex: 2, va: 14, vb: 20, delta: 6, before: [] }];
    g.transferOverlapPointId = null;
    const before = T.correctedLevels(g);
    assert.ok(T.migrateLegacyGroup(g));
    assert.deepStrictEqual(g.points.map((p) => p.level), [10, 12, 20, 23], '적은 값 복원');
    assert.deepStrictEqual(T.correctedLevels(g), before, '계산 결과는 그대로(두 번 안 빠짐)');
    assert.ok(!('stationTransfers' in g) && !('levelRaw' in g.points[2]) && !('levelAtA' in g.points[2]));
    assert.ok(!T.migrateLegacyGroup(g), '두 번째는 할 일 없음');
    assert.deepStrictEqual(T.correctedLevels(g), before);
}
// 옛 데이터 없는 구역은 안 건드림
assert.ok(!T.migrateLegacyGroup(mk([1, 2])));

// 6) 키보드: 들어올린 위치가 아니라 원래 위치로 재고, 끄는 중·누르는 중에는 창을 안 옮김
{
    const kb = fs.readFileSync(path.join(root, 'js', 'core', 'mobile-keyboard.js'), 'utf8');
    const auto = kb.slice(kb.indexOf('function computeAutoLift'), kb.indexOf('function computeAutoLift') + 800);
    assert.ok(/appliedPanelLift\(\)/.test(auto), '원래 위치 기준');
    const ul = kb.slice(kb.indexOf('function updateLayout'), kb.indexOf('function updateLayout') + 1500);
    assert.ok(/state\.dragging\s*\|\|\s*\(state\.pointerDown && !forceScroll\)\) return/.test(ul), '끄는 중 정지');
    assert.ok(/forceScroll \|\| kbChanged/.test(ul), '키보드 높이가 바뀔 때만 다시 올림');
}

// 7) index.html이 app.js·ndt-grade.js보다 먼저 보정 모듈을 싣는다
{
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const t = html.indexOf('js/core/ndt-disp-transfer.js');
    assert.ok(t > 0 && t < html.indexOf('js/core/ndt-grade.js') && t < html.indexOf('src="app.js'));
}
console.log('test-ndt-disp-transfer-calc: OK');
