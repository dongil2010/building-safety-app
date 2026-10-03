'use strict';
// 폰·태블릿 영역 마킹: 모양 고르기(다각형·타원·사각형) + 터치 다각형(손 뗄 때 점, 끌면 이동, 두 손가락이면 점 없음)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extract(name) {
    const i = app.indexOf(`function ${name}(`);
    assert.ok(i >= 0, name + ' missing');
    let depth = 0, j = app.indexOf('{', i);
    for (let k = j; k < app.length; k++) {
        if (app[k] === '{') depth++;
        else if (app[k] === '}') { depth--; if (depth === 0) return app.slice(i, k + 1); }
    }
    throw new Error('unterminated ' + name);
}

// 모양 선택지: PC와 같은 데이터 값(rect/ellipse/polygon)
const choices = new Function(extract('areaShapeChoices') + '; return areaShapeChoices();')();
assert.deepStrictEqual(choices.map((c) => c.shape).sort(), ['ellipse', 'polygon', 'rect']);

// 터치 다각형 점 찍기: 첫 점 근처(화면 28px 안)면 완료, 아니면 점 추가
const env = { pendingAreaPoly: null, finished: 0 };
const commit = new Function('env', `
    let pendingAreaPoly = null;
    const state = { mode: 'AREA', areaCreateShape: 'polygon', view: { scale: 2 } };
    function finishPendingAreaPolygon() { env.finished++; pendingAreaPoly = null; }
    function syncAreaPolygonRedrawBanner() {}
    function drawCanvas() {}
    ${extract('commitTouchPolygonTap')}
    return { tap: (x, y) => commitTouchPolygonTap({ x, y }), pts: () => pendingAreaPoly, state };
`)(env);
commit.tap(0, 0); commit.tap(100, 0); commit.tap(100, 100);
assert.strictEqual(commit.pts().length, 3);
commit.tap(30, 0); // 화면 60px — 첫 점과 멀다 → 점 추가
assert.strictEqual(commit.pts().length, 4);
commit.tap(5, 5); // 화면 ~14px → 완료
assert.strictEqual(env.finished, 1);
commit.state.areaCreateShape = 'rect';
commit.tap(1, 1);
assert.strictEqual(commit.pts(), null, '다각형 모드가 아니면 점 없음');

// 배선: 두 손가락이면 대기 중 탭 버림, 손 뗄 때만 점, 레일 버튼은 모양 고르기
assert.ok(/touchPolyTap = null;[\s\S]{0,200}isAreaInkDrag = false;[\s\S]{0,600}isPinching = true;/.test(app), 'pinch clears pending tap');
assert.ok(/if \(touchPolyTap\) \{[\s\S]{0,600}commitTouchPolygonTap\(tap\)/.test(app));
assert.ok(/mobileBtnModeArea[\s\S]{0,400}openAreaShapePicker/.test(app), 'rail button opens picker');
assert.ok(app.includes("localStorage.getItem('bsa_area_shape_pref") || /readAreaShapePref/.test(app));
for (const id of ['areaPolyTouchBar', 'btnAreaPolyTouchDone', 'btnAreaPolyTouchUndo', 'btnAreaPolyTouchCancel']) {
    assert.ok(html.includes(`id="${id}"`), id);
}

// 깨끗한 탭 규칙(2026-10-03 실기기 버그): 8px·500ms 미만, 두 번째 손가락 없음
{
    const src = app.slice(app.indexOf('const TOUCH_TAP_MAX_MOVE_PX'), app.indexOf('window.__bsaTouchTapRule'));
    const rule = new Function(src + '; return isCleanTouchTap;')();
    const now = 10000;
    assert.strictEqual(rule({ downAt: now - 100, maxMove: 3 }, now), true, '짧고 가만히 = 탭');
    assert.strictEqual(rule({ downAt: now - 100, maxMove: 8 }, now), false, '8px 이상 움직이면 이동');
    assert.strictEqual(rule({ downAt: now - 600, maxMove: 0 }, now), false, '500ms 넘게 누르면 탭 아님');
    assert.strictEqual(rule({ downAt: now - 50, maxMove: 0, multi: true }, now), false, '두 손가락이 닿았으면 탭 아님');
    assert.ok(/touchMultiActive \|\| Date\.now\(\) < touchCooldownUntil\) return;/.test(app), '두 손가락 뒤 모두 뗄 때까지 + 250ms 무시');
    assert.ok(/touchMultiActive && e\.touches\.length === 0[\s\S]{0,120}TOUCH_MULTI_COOLDOWN_MS/.test(app));
    assert.ok(/touchPolyTap\.maxMove = Math\.max/.test(app), '움직인 최대 거리로 판단(되돌아와도 이동)');
}
console.log('test-area-shape-touch: ok');
