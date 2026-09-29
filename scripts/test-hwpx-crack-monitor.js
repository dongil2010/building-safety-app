#!/usr/bin/env node
'use strict';

/**
 * 한글(HWPX) 균열게이지 측정표 — 입력 안 한 값이 나오지 않는지, 쪽 번호가 아라비아 숫자인지.
 *
 * 2026-09-29 신고: "입력 안 한 측정값이 튀어나온다". 양식에 다른 건물의 예시 측정값이
 * 들어 있고 앱은 입력한 칸만 덮어써서, 빈 칸에 예시값(2014~2026년 날짜, ↓0.5(초기값),
 * 29.05, 옥탑층 벽체…)이 그대로 나갔다. 같은 날 쪽 번호가 로마 숫자(Ⅰ, Ⅱ)로 나온다는 신고도.
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
    change: (s) => {
        const list = (s.kind === 'tip' ? s.tip : s.gauge).readings;
        return list.length ? 'CHG' + list.length : '-';
    },
    summaryChange: (s) => {
        const list = (s.kind === 'tip' ? s.tip : s.gauge).readings;
        return list.length ? 'SUM' + list.length : '-';
    },
    date: (r) => r.date || r.roundKey || '',
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
const currentTbl = infos.map((i) => i.tables.find((t) => t.rows === 16)).find(Boolean);
assert.ok(currentTbl, '균열게이지 양식에 16줄 현재표가 없다');
const summaryTbl = infos.map((i) => i.tables.find((t) => t.rows === 4 && t.pics === 2)).find(Boolean);
assert.ok(summaryTbl, '균열게이지 양식에 사진 2장짜리 요약표가 없다');

// 양식 칸 중 1행 이하(머리글 0행 제외)는 전부 앱이 값을 정해야 예시값이 안 남는다
function assertCoversTemplate(cells, tbl, label) {
    tbl.cells.filter(([r]) => r >= 1).forEach(([r, c, text]) => {
        assert.ok(Object.prototype.hasOwnProperty.call(cells, r + ',' + c),
            label + ' ' + r + ',' + c + ' 칸(양식 예시 "' + text.trim().slice(0, 20) + '")을 앱이 안 덮는다');
    });
}

// --- 게이지 하나, 초기값 Y만, 측정 둘 + 날짜만 있고 값이 빈 행 하나 ---
(function oneGauge() {
    const slot = {
        col: 1, kind: 'gauge', name: '1층 벽체',
        gauge: { initialY: '0.4', initialX: '', readings: [
            { date: '2026. 03. 02', yMm: '0.5', xMm: '' },
            { date: '2026. 09. 01', yMm: '0.6', xMm: '0.1' },
            { date: '2026. 09. 20', yMm: '', xMm: '' }
        ] }
    };
    const cells = cm.buildCurrentTableCells([slot], fmt);
    assertCoversTemplate(cells, currentTbl, '현재표');
    assert.strictEqual(cells['1,1'], 'NO.1 1층 벽체');
    assert.strictEqual(cells['2,1'], '크랙모니터');
    assert.strictEqual(cells['3,1'], '↓ 0.4(초기값)', 'X 초기값이 없으면 "- / →"가 붙으면 안 된다');
    assert.strictEqual(cells['4,0'], '2026. 03. 02');
    assert.strictEqual(cells['4,1'], '↓ 0.5');
    assert.strictEqual(cells['5,1'], '↓ 0.6 / → 0.1');
    // 값을 안 넣은 측정 행은 줄로 나오지 않는다
    assert.strictEqual(cells['6,0'], '');
    assert.strictEqual(cells['6,1'], '');
    // 쓰지 않는 2·3번 열과 남는 줄은 빈칸 (예시값도 '-'도 아님)
    [2, 3].forEach((c) => {
        for (let r = 1; r <= 15; r += 1) assert.strictEqual(cells[r + ',' + c], '', r + ',' + c + ' 칸이 비어야 한다');
    });
    for (let r = 6; r <= 14; r += 1) {
        for (let c = 0; c <= 4; c += 1) assert.strictEqual(cells[r + ',' + c], '', r + ',' + c + ' 칸이 비어야 한다');
    }
    assert.strictEqual(cells['3,0'], '초기 부착 data');
    assert.strictEqual(cells['15,0'], '변화량(금회측정-초기값)');
    assert.strictEqual(cells['15,1'], 'CHG2', '변화량은 값 있는 측정 행만 본다');
})();

// --- 아무것도 입력 안 한 게이지(번호만) → 값 칸이 전부 빈칸 ---
(function emptyGauge() {
    const slot = { col: 1, kind: 'gauge', name: '2층 기둥', gauge: { gaugeNo: 'G-1', readings: [{ date: '', roundKey: '2026-2', yMm: '', xMm: '' }] } };
    const cells = cm.buildCurrentTableCells([slot], fmt);
    for (let r = 3; r <= 15; r += 1) {
        [1, 2, 3, 4].forEach((c) => assert.strictEqual(cells[r + ',' + c], '', r + ',' + c + ' 칸이 비어야 한다'));
    }
    const sum = cm.buildSummaryCells(slot, 1, fmt);
    assert.strictEqual(sum['1,4'], '', '측정값이 없으면 요약표 변화량도 빈칸');
    assertCoversTemplate(Object.assign({ '2,0': '', '2,3': '' }, sum), summaryTbl, '요약표');
})();

// --- 게이지 둘 + 팁 하나, 날짜가 겹치고 어긋남 ---
(function threeSlots() {
    const slots = [
        { col: 1, kind: 'gauge', name: 'A', gauge: { initialY: '0.2', initialX: '0.1', readings: [{ date: 'd1', yMm: '0.3' }] } },
        { col: 2, kind: 'gauge', name: 'B', gauge: { initialY: '', initialX: '', readings: [{ date: 'd2', yMm: '0.1' }] } },
        { col: 3, kind: 'tip', name: 'C', tip: { initialLengthMm: '30', readings: [{ date: 'd1', lengthMm: '31' }] } }
    ];
    const cells = cm.buildCurrentTableCells(slots, fmt);
    assert.strictEqual(cells['3,1'], '↓ 0.2(초기값) / → 0.1(초기값)');
    assert.strictEqual(cells['3,2'], '', '초기값을 안 넣으면 빈칸');
    assert.strictEqual(cells['3,3'], '30(초기값)');
    assert.strictEqual(cells['2,3'], '균열팁');
    assert.strictEqual(cells['4,0'], 'd1');
    assert.strictEqual(cells['4,2'], '', 'd1에 B는 측정 안 함 → 빈칸');
    assert.strictEqual(cells['4,3'], '31');
    assert.strictEqual(cells['5,0'], 'd2');
    assert.strictEqual(cells['5,1'], '');
    assert.strictEqual(cells['5,2'], '↓ 0.1');
})();

// --- 측정이 11번을 넘으면 최근 것을 남긴다 (금회 측정이 잘리지 않게) ---
(function manyReadings() {
    const readings = [];
    for (let i = 1; i <= 13; i += 1) readings.push({ date: 'r' + String(i).padStart(2, '0'), yMm: String(i) });
    const cells = cm.buildCurrentTableCells([{ col: 1, kind: 'gauge', name: 'A', gauge: { readings } }], fmt);
    assert.strictEqual(cells['4,0'], 'r03');
    assert.strictEqual(cells['14,0'], 'r13');
})();

// --- 양식 문단 고르기: 예시 이력표·예시 요약표·예시 위치도는 안 쓴다 ---
(function plan() {
    const plan = cm.planStampParas(infos.map((i) => ({ tables: i.tables.map((t) => ({ rows: t.rows, pics: t.pics })), text: i.text })));
    assert.ok(plan, '양식 문단을 못 골랐다');
    const dataTables = infos[plan.data].tables.map((t) => t.rows).sort((a, b) => a - b);
    assert.ok(dataTables.includes(16));
    const summary = infos[plan.summaryProto].tables.find((t) => t.rows === 4);
    assert.strictEqual(summary.pics, 2, '요약표 원본은 사진 2장짜리여야 한다');
    plan.tail.forEach((i) => {
        assert.strictEqual(infos[i].tables.length, 0, '맺음말 뒤에 표(예시 요약표·위치도)가 붙으면 안 된다: 문단 ' + i);
    });
    assert.ok(plan.tail.some((i) => infos[i].text.includes('균열게이지')), '맺음말 문단이 빠졌다');
})();

// --- app.js가 공용 규칙을 쓰고, 예시 이력표를 지운다 ---
(function appWiring() {
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.ok(app.includes('api.buildCurrentTableCells(slots'), '현재표를 공용 규칙으로 채우지 않는다');
    assert.ok(app.includes('cmApi.buildSummaryCells(item'), '요약표를 공용 규칙으로 채우지 않는다');
    assert.ok(app.includes('planStampParas('), '양식 문단을 공용 규칙으로 고르지 않는다');
    assert.ok(/tbl !== currentTbl && tbl\.parentNode\) tbl\.parentNode\.removeChild\(tbl\)/.test(app), '예시 이력표를 지우지 않는다');
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
