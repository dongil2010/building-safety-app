#!/usr/bin/env node
'use strict';

/**
 * 한글(HWPX) 균열게이지 측정표 — 입력 안 한 값이 나오지 않는지, 쪽 번호가 아라비아 숫자인지.
 *
 * 2026-09-29 신고: "입력 안 한 측정값이 튀어나온다". 양식에 다른 건물의 예시 측정값이
 * 들어 있고 앱은 입력한 칸만 덮어써서, 빈 칸에 예시값(2014~2026년 날짜, ↓0.5(초기값),
 * 29.05, 옥탑층 벽체…)이 그대로 나갔다. 같은 날 쪽 번호가 로마 숫자(Ⅰ, Ⅱ)로 나온다는 신고도.
 * 같은 날 새 양식 + 요청: 표에는 년·월만(같은 달은 한 줄, 그 달 가장 늦은 측정), 측정·게이지
 * 수 제한 없음(많으면 글자 줄임), 변화량 = 초기값 − 금회 측정값.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cm = require(path.join(__dirname, '..', 'js', 'shared', 'hwpx-crack-monitor.js'));
const { readZip } = require(path.join(__dirname, 'lib', 'zip-read.js'));

const ROOT = path.join(__dirname, '..');
const TPL = path.join(ROOT, 'templates');

// 앱 포맷 함수 흉내 — 값이 없으면 앱처럼 '-'를 돌려준다
const fmt = {
    header: (s) => 'NO.' + s.col + ' ' + s.name,
    typeLabel: (s) => (s.kind === 'tip' ? '균열팁' : '크랙모니터'),
    gaugeAxis: (axis, v, prev, o) => (v == null || String(v).trim() === '' ? '-' : (axis === 'y' ? '↓ ' : '→ ') + v + (o && o.isInitial ? '(초기값)' : '')),
    tipLength: (v, o) => (v == null || String(v).trim() === '' ? '-' : String(v) + (o && o.isInitial ? '(초기값)' : '')),
    member: (it) => it.name,
    location: (it) => it.loc,
    roundLabels: () => ({ prev: '', curr: '' })
};

// ---------------------------------------------------------------- 템플릿 16줄 표 칸 주소
function sectionXml(file) {
    const z = readZip(path.join(TPL, file));
    return z.text('Contents/section0.xml');
}

/** 맨 위 문단마다 {tables:[{rows,pics,cells:[[r,c,text]]}], text} — 문자열만으로 */
function topParaInfos(xml) {
    const re = /<(\/?)hp:(p|tbl|pic|tc|t|cellAddr)\b([^>]*?)(\/?)>|([^<]+)/g;
    const infos = [];
    let pDepth = 0; let tblDepth = 0; let cur = null; let curTbl = null; let curCell = null; let inT = false;
    let m;
    while ((m = re.exec(xml))) {
        if (m[5] != null) {
            if (inT && cur) { cur.text += m[5]; if (curCell) curCell.text += m[5]; }
            continue;
        }
        const close = m[1] === '/'; const tag = m[2]; const attrs = m[3]; const self = m[4] === '/';
        if (tag === 'p') {
            if (!close) { pDepth += 1; if (pDepth === 1) { cur = { tables: [], text: '' }; infos.push(cur); } }
            else pDepth -= 1;
            if (self) pDepth -= 1;
        } else if (tag === 'tbl') {
            if (!close) {
                tblDepth += 1;
                if (tblDepth === 1 && cur) {
                    curTbl = { rows: parseInt((attrs.match(/rowCnt="(\d+)"/) || [])[1] || '0', 10), pics: 0, cells: [] };
                    cur.tables.push(curTbl);
                }
            } else { tblDepth -= 1; if (tblDepth === 0) curTbl = null; }
        } else if (tag === 'pic' && !close && curTbl) {
            curTbl.pics += 1;
        } else if (tag === 'tc' && tblDepth === 1) {
            if (!close) curCell = { text: '' };
        } else if (tag === 'cellAddr' && tblDepth === 1 && curCell && curTbl) {
            const r = parseInt(attrs.match(/rowAddr="(\d+)"/)[1], 10);
            const c = parseInt(attrs.match(/colAddr="(\d+)"/)[1], 10);
            curTbl.cells.push([r, c, curCell.text]);
            curCell = null;
        } else if (tag === 't') {
            inT = !close && !self;
        }
    }
    return infos;
}

const crackXml = sectionXml('hwpx_crack_monitor.hwpx');
const infos = topParaInfos(crackXml);
const plan = cm.planStampParas(infos.map((i) => ({ tables: i.tables.map((t) => ({ rows: t.rows, pics: t.pics })), text: i.text })));
assert.ok(plan, '균열게이지 양식 문단을 못 골랐다');
const measureTbl = infos[plan.data].tables.find((t) => t.rows >= 5);
assert.ok(measureTbl, '균열게이지 양식에 측정표가 없다');
const summaryTbl = infos[plan.summaryProto].tables.find((t) => t.rows === 4);
assert.strictEqual(summaryTbl.pics, 2, '요약표 원본은 사진 2장짜리여야 한다');

// --- 양식 자체에 예시값이 없다 (다른 건물 자료가 새 나가지 않게) ---
(function templateClean() {
    ['옥탑층', '2021. 06. 18', '29.05', '↓ 0.5', 'DSCF', '기독병원', '바닥(균열모니터)', 'A5~6', '변화無', '2025년 하반기', '도면 6-14'].forEach((word) => {
        assert.ok(!crackXml.includes(word), '균열게이지 양식에 예시값 "' + word + '"이 남아 있다');
    });
    const m = infos[plan.data].tables.find((t) => t.rows >= 5);
    const header = m.cells.filter(([r]) => r === 0).map(([, , t]) => t.trim());
    assert.deepStrictEqual(header, ['측정일', '위치/측정값(㎜)', '비고']);
})();

// 칸 주소 → 있어야 할 칸 목록 (행 0: 측정일·게이지 묶음·비고 / 1·2: 게이지 / 나머지: 전부)
function expectedAddrs(layout) {
    const out = ['0,0', '0,1', '0,' + layout.noteCol];
    for (let r = 1; r <= 2; r += 1) for (let c = 1; c <= layout.nSlots; c += 1) out.push(r + ',' + c);
    for (let r = 3; r < layout.rowCnt; r += 1) for (let c = 0; c <= layout.noteCol; c += 1) out.push(r + ',' + c);
    return out;
}
function assertComplete(layout) {
    expectedAddrs(layout).forEach((k) => assert.ok(Object.prototype.hasOwnProperty.call(layout.cells, k), k + ' 칸 값이 없다'));
}
const g = (no, log, name) => ({ no, kind: 'gauge', name: name || ('G' + no), gauge: log });

// --- 달 읽기 ---
(function months() {
    assert.deepStrictEqual(cm.monthOf({ date: '2026-09-28' }).key, '2026. 09');
    assert.deepStrictEqual(cm.monthOf({ date: '2026. 9. 3' }).key, '2026. 09');
    assert.strictEqual(cm.monthOf({ date: '', roundKey: '' }), null);
})();

// --- 같은 달 두 번 → 그 달 가장 늦은 날짜 (입력 순서와 무관), 같은 날이면 나중 입력 ---
(function sameMonth() {
    const slot = g(1, { initialY: '0.3', readings: [
        { date: '2026-09-28', yMm: '0.6' },
        { date: '2026-09-10', yMm: '0.5' },
        { date: '2026-08-01', yMm: '0.4' },
        { date: '2026-08-01', yMm: '0.45' },
        { date: '2026-10-02', yMm: '' } // 값 없음 → 무시
    ] });
    const list = cm.monthlyReadings(slot);
    assert.deepStrictEqual(list.map((e) => e.key), ['2026. 08', '2026. 09']);
    assert.strictEqual(list[0].reading.yMm, '0.45');
    assert.strictEqual(list[1].reading.yMm, '0.6');
    const lay = cm.buildTableLayout([slot], fmt);
    assert.strictEqual(lay.cells['4,0'], '2026. 08');
    assert.strictEqual(lay.cells['5,0'], '2026. 09');
    assert.strictEqual(lay.cells['5,1'], '↓ 0.6');
    assert.strictEqual(lay.rowCnt, 7, '머리글3 + 초기1 + 달2 + 변화량1');
})();

// --- 변화량 = 초기값 − 금회 측정값, 성분별, 없으면 빈칸 ---
(function change() {
    const a = cm.changeOf(g(1, { initialY: '0.3', initialX: '0.1', readings: [{ date: '2026-01-05', yMm: '0.5', xMm: '0.4' }] }));
    assert.strictEqual(a.text, '↓ -0.2mm / → -0.3mm');
    const b = cm.changeOf(g(1, { initialY: '0.3', initialX: '', readings: [{ date: '2026-01-05', yMm: '0.1', xMm: '0.2' }] }));
    assert.strictEqual(b.text, '↓ 0.2mm', 'X 초기값이 없으면 X 변화량은 빼야 한다');
    const c = cm.changeOf(g(1, { initialY: '', initialX: '', readings: [{ date: '2026-01-05', yMm: '0.1' }] }));
    assert.strictEqual(c.text, '');
    const d = cm.changeOf({ no: 1, kind: 'tip', tip: { initialLengthMm: '29.05', readings: [{ date: '2026-01-05', lengthMm: '29.12' }] } });
    assert.strictEqual(d.text, '-0.07mm');
    const e = cm.changeOf(g(1, { initialY: '0.3', readings: [{ date: '2026-01-05', yMm: '0.3' }] }));
    assert.strictEqual(e.allZero, true);
    const sum = cm.buildSummaryCells(g(1, { initialY: '0.3', readings: [{ date: '2026-01-05', yMm: '0.3' }] }), 1,
        Object.assign({}, fmt, { member: () => '벽체', location: () => '1층' }));
    assert.strictEqual(sum['1,4'], '↓ 0.3');
    assert.strictEqual(sum['1,5'], '변화無');
})();

// --- 양식 크기(게이지 3, 달 11)면 양식 격자와 똑같고, 양식 칸 전부를 앱이 정한다 ---
(function templateSize() {
    const readings = [];
    for (let i = 1; i <= 11; i += 1) readings.push({ date: '2025-' + String(i).padStart(2, '0') + '-15', yMm: String(i / 10) });
    const lay = cm.buildTableLayout([g(1, { readings }), g(2, { readings }), g(3, { readings })], fmt);
    assert.strictEqual(lay.rowCnt, measureTbl.rows);
    assert.strictEqual(lay.colCnt, 5);
    assert.strictEqual(lay.scale, 1);
    measureTbl.cells.forEach(([r, c]) => assert.ok(Object.prototype.hasOwnProperty.call(lay.cells, r + ',' + c), '양식 ' + r + ',' + c + ' 칸을 앱이 안 덮는다'));
    assertComplete(lay);
})();

// --- 많을 때: 줄·열이 늘고 글자가 줄어든다 ---
(function many() {
    const readings = [];
    for (let i = 0; i < 20; i += 1) readings.push({ date: (2024 + Math.floor(i / 12)) + '-' + String((i % 12) + 1).padStart(2, '0') + '-10', yMm: '0.' + i });
    const slots = [1, 2, 3, 4, 5].map((no) => g(no, { initialY: '0.1', readings }));
    const lay = cm.buildTableLayout(slots, fmt);
    assert.strictEqual(lay.rowCnt, 3 + 1 + 20 + 1);
    assert.strictEqual(lay.colCnt, 7);
    assert.ok(lay.scale < 1 && lay.scale >= 0.6, 'scale ' + lay.scale);
    assertComplete(lay);
    assert.strictEqual(cm.fontScale(3, 11), 1);
    assert.strictEqual(cm.fontScale(4, 14), 0.75);
    assert.strictEqual(cm.fontScale(6, 40), 0.6, '최소 배율 0.6');
    assert.deepStrictEqual(cm.groupSlots([1, 2, 3, 4, 5, 6, 7]).map((x) => x.length), [4, 3]);
    assert.deepStrictEqual(cm.groupSlots([1, 2, 3, 4, 5, 6]).map((x) => x.length), [6]);
    assert.deepStrictEqual(cm.groupSlots(new Array(13).fill(0)).map((x) => x.length), [5, 5, 3]);
})();

// --- 입력 안 한 게이지 → 값 칸 전부 빈칸 ---
(function emptyGauge() {
    const lay = cm.buildTableLayout([g(1, { gaugeNo: 'G-1', readings: [{ date: '', roundKey: '', yMm: '' }] }), g(2, { initialY: '0.2', readings: [{ date: '2026-02-02', yMm: '0.3' }] })], fmt);
    for (let r = 3; r < lay.rowCnt; r += 1) assert.strictEqual(lay.cells[r + ',1'], '', r + ',1 칸이 비어야 한다');
    assert.strictEqual(lay.cells['4,2'], '↓ 0.3');
    const sum = cm.buildSummaryCells(g(1, { readings: [] }), 1, Object.assign({}, fmt, { member: () => '', location: () => '' }));
    assert.strictEqual(sum['1,4'], '');
    assert.strictEqual(sum['1,5'], '');
})();

// --- 양식 문단: 예시 위치도는 안 쓰고 맺음말만 ---
(function planTail() {
    plan.tail.forEach((i) => assert.strictEqual(infos[i].tables.length, 0, '맺음말 뒤에 표가 붙으면 안 된다: 문단 ' + i));
    assert.ok(plan.tail.some((i) => infos[i].text.includes('균열게이지')), '맺음말 문단이 빠졌다');
})();

// --- app.js 연결 ---
(function appWiring() {
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.ok(app.includes('cmPlanApi.buildTableLayout(group'), '측정표를 공용 규칙으로 만들지 않는다');
    assert.ok(app.includes('cmPlanApi.groupSlots(slots)'), '게이지가 많을 때 표를 나누지 않는다');
    assert.ok(app.includes('reshapeHwpxCrackMonitorTable(tbl, layout)'), '측정표 줄·열을 바꾸지 않는다');
    assert.ok(app.includes('ensureHwpxScaledCharPr(hwpxHeaderState'), '많을 때 글자를 줄이지 않는다');
    assert.ok(app.includes('cmApi.buildSummaryCells(item'), '요약표를 공용 규칙으로 채우지 않는다');
    assert.ok(!app.includes('gaugeItems.slice(0, 2)'), '게이지 3개 제한이 남아 있다');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const mine = html.indexOf('js/shared/hwpx-crack-monitor.js');
    assert.ok(mine > 0, 'index.html에 hwpx-crack-monitor.js가 없다');
    assert.ok(mine < html.indexOf('src="app.js'), 'hwpx-crack-monitor.js는 app.js보다 먼저 읽어야 한다');
})();

// --- 쪽 번호: 아라비아 숫자 ---
(function pageNumbers() {
    const files = fs.readdirSync(TPL).filter((n) => n.endsWith('.hwpx'));
    assert.ok(files.length >= 4);
    let pageNums = 0;
    files.forEach((file) => {
        const z = readZip(path.join(TPL, file));
        z.names().filter((n) => /^Contents\/.*\.xml$/.test(n)).forEach((name) => {
            const xml = z.text(name);
            (xml.match(/<hp:pageNum\b[^>]*>/g) || []).forEach((tag) => {
                pageNums += 1;
                assert.ok(/formatType="DIGIT"/.test(tag), file + ' ' + name + ' 쪽 번호가 아라비아 숫자가 아니다: ' + tag);
            });
        });
        // zip 규칙: mimetype이 맨 앞, 압축 안 함 (양식을 다시 묶을 때 깨지기 쉽다)
        assert.strictEqual(z.names()[0], 'mimetype', file + ' mimetype이 맨 앞이 아니다');
    });
    assert.ok(pageNums >= 4, '본문 양식의 쪽 번호를 못 찾았다');
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const forced = (app.match(/newXml = forceHwpxArabicPageNumbers\(newXml\);\r?\n\s*zip\.file\(sectionPath, newXml\);/g) || []).length;
    assert.strictEqual(forced, 2, '두 한글 내보내기 모두 쪽 번호를 아라비아 숫자로 바로잡아야 한다');
})();

console.log('hwpx crack monitor + page number tests ok');
