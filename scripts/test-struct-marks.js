#!/usr/bin/env node
'use strict';

/**
 * 2026-10-14 구조도 부재 세기(struct-plan.html) — 캐드 구조평면도 PDF의 선 데이터에서 부재 기호를 찾는다.
 * 기호 테두리(알약·네모/마름모·타원) 안의 글자 획을 내장 글자 본(struct-glyphs.js)과 견줘
 * 번호 바로 앞 글자로 종류를 정한다: C 기둥 · W 벽 · G 거더 · B 빔 · S 슬래브.
 * 실제 도면 대조(지상1층 바닥 구조도: 기둥 56 · 거더 107 · 빔 32 · 슬래브 86)는 브라우저에서 했다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SM = require('../js/core/struct-marks.js');
const GLYPHS = require('../js/core/struct-glyphs.js');
const templates = SM.templatesFromStrokes(GLYPHS);
const PAGE = { w: 842, h: 595 };
const F = GLYPHS.romans;

// ---- 가짜 도면 만들기: 내장 글자 획으로 글을 쓰고 테두리를 두른다 ----
const LOWER = { w: 0.68, c: 0.68 };
function writeText(label, x, y, hgt) {
    const paths = [];
    let cx = x;
    label.split('').forEach((ch) => {
        const strokes = F[ch];
        assert.ok(strokes, '글자 본 없음: ' + ch);
        const k = (hgt * (LOWER[ch] || 1)) / 100;
        const top = y + hgt - 100 * k;   // 밑줄 맞춤(소문자는 아래로 붙는다)
        let w = 0;
        strokes.forEach((s) => {
            s.forEach((p) => { if (p[0] > w) w = p[0]; });
            paths.push({ pts: s.map((p) => [cx + p[0] * k, top + p[1] * k]), lines: s.length - 1, curves: 0, closed: false });
        });
        cx += w * k + hgt * 0.28;
    });
    return { paths, width: cx - x - hgt * 0.28 };
}
function pill(x, y, len, thick) {
    const r = thick / 2;
    return [
        { pts: [[x + r, y], [x, y + r], [x + r, y + thick]], lines: 0, curves: 2, closed: false },
        { pts: [[x + len - r, y], [x + len, y + r], [x + len - r, y + thick]], lines: 0, curves: 2, closed: false },
        { pts: [[x + r, y], [x + len - r, y]], lines: 1, curves: 0, closed: false },
        { pts: [[x + r, y + thick], [x + len - r, y + thick]], lines: 1, curves: 0, closed: false }
    ];
}
function box(x, y, w, h) {
    return [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], lines: 4, curves: 0, closed: false }];
}
function diamond(x, y, w, h) {
    return [{ pts: [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2], [x + w / 2, y]], lines: 4, curves: 0, closed: false }];
}
function oval(x, y, w, h) {
    return [{ pts: [[x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2], [x + w / 2, y], [x + w, y + h / 2]], lines: 0, curves: 4, closed: false }];
}
/** 테두리(가운데에 글)를 그린다. kind: pill|box|diamond|oval */
function mark(kind, label, x, y, opts) {
    const o = opts || {};
    const hgt = 2.5;
    const t = writeText(label, 0, 0, hgt);
    let enc, w, h;
    if (kind === 'pill') { w = t.width + 5; h = 4.9; enc = pill(x, y, w, h); }
    else if (kind === 'box') { w = o.w || 6.2; h = o.h || 6.4; enc = box(x, y, w, h); }
    else if (kind === 'diamond') { w = 12; h = 7; enc = diamond(x, y, w, h); }
    else { w = o.w || 10.4; h = o.h || 6.1; enc = oval(x, y, w, h); }
    const ox = x + (w - t.width) / 2, oy = y + (h - hgt) / 2;
    const text = t.paths.map((p) => ({ pts: p.pts.map((q) => [q[0] + ox, q[1] + oy]), lines: p.lines, curves: 0, closed: false }));
    return enc.concat(text);
}
/** 가로로 그린 기호를 왼쪽으로 90° 눕혀(아래에서 위로 읽게) (x,y)에 놓는다 */
function rotated(paths, x, y) {
    return paths.map((p) => ({ pts: p.pts.map((q) => [x + q[1], y - q[0]]), lines: p.lines, curves: p.curves, closed: p.closed }));
}

let paths = [];
paths = paths.concat(mark('pill', 'fG1', 100, 100));
paths = paths.concat(mark('pill', '1B2A', 150, 100));
paths = paths.concat(mark('pill', 'fB1B', 200, 100));      // 꼬리 B가 붙어도 종류 글자는 앞의 B
paths = paths.concat(mark('pill', 'wG1', 250, 100));       // 머리글 소문자 w는 벽(W)이 아니다
paths = paths.concat(mark('box', 'C1', 100, 150));         // 세로가 조금 긴 네모(6.2×6.4)도 가로 글
paths = paths.concat(mark('box', 'C12', 150, 150, { w: 9 }));
paths = paths.concat(mark('oval', 'fS1', 200, 150));
paths = paths.concat(mark('diamond', 'W1', 250, 150));
paths = paths.concat(mark('oval', 'X1', 300, 150, { w: 8, h: 8 }));   // 통심 번호 — 부재 아님
paths = paths.concat(mark('oval', 'ST1', 350, 150));                 // 계단 — 부재 아님
paths = paths.concat(rotated(mark('pill', '1G6', 0, 0), 400, 200));  // 세로로 누운 알약
// 획이 겹쳐 못 읽는 알약(글자 위로 사선이 지나감)
const messy = mark('pill', '1G3', 100, 220);
messy.push({ pts: [[102.3, 222.1], [104.5, 222.9], [106.7, 222.1]], lines: 2, curves: 0, closed: false });
paths = paths.concat(messy);
// 도면의 다른 선들(벽선·치수선) — 기호가 아니다
paths.push({ pts: [[50, 50], [800, 50]], lines: 1, curves: 0, closed: false });
paths.push({ pts: [[60, 60], [60, 500], [700, 500], [700, 60], [60, 60]], lines: 4, curves: 0, closed: false });

const res = SM.detect({ paths, page: PAGE, templates });
const byLabel = {};
res.members.forEach((m) => { byLabel[m.label] = m; });

assert.strictEqual(byLabel.fG1 && byLabel.fG1.type, '거더');
assert.strictEqual(byLabel['1B2A'] && byLabel['1B2A'].type, '빔');
assert.strictEqual(byLabel.fB1B && byLabel.fB1B.type, '빔', '꼬리 B가 있어도 번호 앞 글자로 정한다');
assert.strictEqual(byLabel.wG1 && byLabel.wG1.type, '거더', '머리글 소문자 w를 벽으로 읽지 않는다');
assert.strictEqual(byLabel.C1 && byLabel.C1.type, '기둥', '세로가 조금 긴 네모도 가로 글로 읽는다');
assert.strictEqual(byLabel.C12 && byLabel.C12.type, '기둥');
assert.strictEqual(byLabel.fS1 && byLabel.fS1.type, '슬래브');
assert.strictEqual(byLabel.W1 && byLabel.W1.type, '벽', '마름모 안의 W');
assert.strictEqual(byLabel['1G6'] && byLabel['1G6'].type, '거더', '세로로 누운 알약');
assert.strictEqual(res.members.length, 9, '부재 9개(통심 번호·계단·못 읽은 것 제외): ' + res.members.map((m) => m.label).join(' '));
assert.deepStrictEqual(Object.assign({}, SM.countsByType(res.members)), { '기둥': 2, '벽': 1, '거더': 3, '빔': 2, '슬래브': 1 });
// 못 읽은 알약은 사람이 넣을 수 있게 남기고, 다 읽었는데 부재가 아닌 것(X1, ST1)은 남기지 않는다
assert.strictEqual(res.unread.length, 1, '못 읽은 기호 1개');
assert.strictEqual(res.unread[0].shape, 'pill');
// 기호 가운데 좌표
assert.ok(Math.abs(byLabel.C1.x - 103.1) < 0.2 && Math.abs(byLabel.C1.y - 153.2) < 0.2, '기호 가운데 좌표');

// 뺀 기호는 세지 않는다 · 기호별 묶음
byLabel.fG1.excluded = true;
assert.strictEqual(SM.countsByType(res.members)['거더'], 2);
const groups = SM.labelGroups(res.members);
assert.ok(!groups.some((g) => g.label === 'fG1') && groups.some((g) => g.label === 'wG1' && g.count === 1));
assert.strictEqual(groups[0].type, '기둥', '기둥 → 벽 → 거더 → 빔 → 슬래브 순서');

// 글꼴로 들어 있는 글자(진짜 글자)도 읽는다: 번호 바로 앞 글자가 종류
assert.strictEqual(SM.parseText('2G1').type, '거더');
assert.strictEqual(SM.parseText('fB1B').type, '빔');
assert.strictEqual(SM.parseText('C 12').type, '기둥');
assert.strictEqual(SM.parseText('X1'), null);
assert.strictEqual(SM.parseText('ST1'), null);
assert.strictEqual(SM.parseText('관리실'), null);
const withText = SM.detect({ paths: box(100, 100, 12, 6), page: PAGE, templates, texts: [{ str: 'G3', x: 106, y: 103 }, { str: 'RB2', x: 300, y: 300 }] });
assert.deepStrictEqual(withText.members.map((m) => m.label + ':' + m.type).sort(), ['G3:거더', 'RB2:빔']);

// 모르는 글꼴(본이 없음)이면 틀리게 읽지 않고 못 읽은 것으로 둔다
const noTpl = SM.detect({ paths: mark('pill', 'fG1', 100, 100), page: PAGE, templates: {} });
assert.strictEqual(noTpl.members.length, 0);
assert.strictEqual(noTpl.unread.length, 1);

// 내장 본: 종류 글자와 숫자가 모두 있어야 한다
'CWGBS0123456789'.split('').forEach((ch) => assert.ok(F[ch], '글자 본 ' + ch));

// 페이지 배선: 별도 페이지로 두고(앱 화면에 싣지 않음) 배포·동기화 목록에 들어 있다
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'struct-plan.html'), 'utf8');
assert.ok(/js\/core\/struct-glyphs\.js/.test(html) && /js\/core\/struct-marks\.js/.test(html) && /js\/struct-plan-page\.js/.test(html));
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(!/struct-marks\.js|struct-glyphs\.js|struct-plan-page\.js/.test(index), '앱 화면(index.html)은 구조도 스크립트를 싣지 않는다');
assert.ok(/struct-plan\.html/.test(index), '앱에서 여는 버튼');
// onclick 속성 안에서 URL 은 document.URL(글자)이라 new URL(...)이 "URL is not a constructor"로 죽는다(눌러도 반응 없음, 2026-10-14)
assert.ok(!/onclick="[^"]*new URL\(/.test(index), 'onclick 속성에서 new URL 금지');
const prep = fs.readFileSync(path.join(root, 'scripts', 'prepare-pages.py'), 'utf8');
assert.ok(/"struct-plan\.html"/.test(prep), '배포 목록');
// 2026-10-14: 옛 HTML(캐시) + 새 스크립트가 섞여 PDF를 못 열었다 — 스크립트에 배포 버전, 스크립트는 없는 칸을 건너뛴다
const pageScripts = html.match(/<script src="js\/[^"]+"/g) || [];
assert.ok(pageScripts.length >= 4 && pageScripts.every((t) => /\?v=[^"]+"$/.test(t)), '구조도 페이지 스크립트마다 ?v=');
assert.ok(prep.includes(`retoken(text, r'(src="js/[^"]+\\.js)\\?v=[^"]+"', r'\\g<1>?v=' + SHORT + '"', "struct-plan.html 스크립트")`), '배포 때 버전 붙이기');
const pageJsSrc = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
assert.ok(!/\$\('zoomLabel'\)\.textContent/.test(pageJsSrc), '배율 칸은 있을 때만 쓴다');
assert.ok(/struct-plan\.html/.test(fs.readFileSync(path.join(root, 'scripts', 'git-sync.ps1'), 'utf8')), '동기화 목록');
assert.ok(/"struct-plan\.html"/.test(fs.readFileSync(path.join(root, 'package.json'), 'utf8')), 'PC 설치본 목록');

console.log('test-struct-marks: ok');
