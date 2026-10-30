'use strict';
// 2026-10-30: 지시선 2~3개 — 마킹 점 중심에 가까운 박스 모서리 한 곳에서 모두 나감(가로지르면 그 점만 자기 모서리)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function grab(name) {
    const s = app.indexOf('function ' + name + '(');
    assert.ok(s > 0, name);
    const e = app.indexOf('\n    }\n', s);
    return app.slice(s, e + 6);
}
const src = ['getRectCornerAnchorLocal', 'getPinLeaderBoxAnchorFromPoint', 'collectLeaderTipPoints', 'getGroupLeaderBoxAnchor'].map(grab).join('\n');
const L = new Function('intersectRayWithEllipse', 'intersectRayWithRoundedRect', 'getPinBoxCornerRadius',
    src + '\nreturn { getGroupLeaderBoxAnchor, getPinLeaderBoxAnchorFromPoint, collectLeaderTipPoints };')(() => ({ x: 0, y: 0 }), () => ({ x: 0, y: 0 }), () => 0);
const R = { shape: 'rect' };
const box = { x: 100, y: 100, w: 40, h: 20 };
const A = (tx, ty, tips, opts) => L.getGroupLeaderBoxAnchor(box.x, box.y, tx, ty, tips, box.w, box.h, 0, opts || R);
// 두 점이 박스 오른쪽 위·오른쪽 아래(애매) → 예전엔 위/아래 다른 모서리, 이제 중심(오른쪽) 쪽 모서리 하나
const tips = [{ x: 200, y: 40 }, { x: 210, y: 130 }];
const old1 = L.getPinLeaderBoxAnchorFromPoint(box.x, box.y, 200, 40, box.w, box.h, 0, R);
const old2 = L.getPinLeaderBoxAnchorFromPoint(box.x, box.y, 210, 130, box.w, box.h, 0, R);
assert.notDeepStrictEqual(old1, old2, '예전: 점마다 다른 모서리');
const n1 = A(200, 40, tips);
const n2 = A(210, 130, tips);
assert.deepStrictEqual(n1, n2, '이제: 같은 모서리');
// 점 1개는 예전 그대로
assert.deepStrictEqual(A(200, 40, [{ x: 200, y: 40 }]), old1);
// 동그라미/둥근 박스는 예전 그대로
assert.deepStrictEqual(L.getGroupLeaderBoxAnchor(100, 100, 200, 40, tips, 40, 20, 0, { shape: 'circle' }).x, 0 * 1 + 100);
// 박스 반대편 점: 공용 모서리에서 가면 박스를 가로지름 → 자기 모서리
const tips2 = [{ x: 220, y: 60 }, { x: 230, y: 110 }, { x: 0, y: 140 }];
const far = A(0, 140, tips2);
const farOwn = L.getPinLeaderBoxAnchorFromPoint(100, 100, 0, 140, 40, 20, 0, R);
assert.deepStrictEqual(far, farOwn, '가로지르면 자기 모서리');
assert.deepStrictEqual(A(220, 60, tips2), A(230, 110, tips2), '나머지는 공용 모서리');
// 다른 마킹 점 위를 지나가면 자기 모서리
const tips3 = [{ x: 160, y: 120 }, { x: 220, y: 150 }, { x: 100, y: 300 }];
const via = A(220, 150, tips3);
assert.ok(via && Number.isFinite(via.x));
assert.strictEqual(L.collectLeaderTipPoints([{ targetX: 1, targetY: 2 }, { targetX: undefined }]).length, 1);
// 화면·래스터(PDF·한글)·벡터 PDF 세 곳 모두 사용
assert.strictEqual((app.match(/= getGroupLeaderBoxAnchor\(boxX, boxY/g) || []).length, 3);
console.log('test-leader-group-corner: ok');
