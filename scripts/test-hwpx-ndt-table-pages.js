'use strict';
// 2026-11-28 「반발경도 결과표 위치칸 ~~보 ~~기둥 띄어쓰기」·「부재실측 데이터가 한 표에 몰려 쪽을 넘김 → 끊어서」
//  1) 위치 칸은 위치와 부재명을 한 칸 띄워 잇는다(지상 5층 보)
//  2) 채운 결과표(부재실측·내화피복·강도·탄산화)를 쪽 높이에 맞게 여러 표로 끊고, 다음 표는 머리 행을 다시 달고 새 쪽에서 시작한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const ctx = { console, Math, String, Number, Set, Array, Object, HWPX_HP_NS: 'http://www.hancom.co.kr/hwpml/2011/paragraph' };
vm.createContext(ctx);
['function hwpxNdtLocMember(', 'function planHwpxTablePages(', 'function splitHwpxNdtTableToPages(']
    .forEach((h) => vm.runInContext(extractFunction(app, h), ctx));

// ---- 1) 띄어쓰기 ----
assert.strictEqual(ctx.hwpxNdtLocMember('B동 지상 5층', '보(G)'), 'B동 지상 5층 보(G)');
assert.strictEqual(ctx.hwpxNdtLocMember('지하주차장', '기둥'), '지하주차장 기둥');
assert.strictEqual(ctx.hwpxNdtLocMember('지하주차장', ''), '지하주차장');
assert.strictEqual(ctx.hwpxNdtLocMember('', '기둥'), '기둥');
assert.ok(app.indexOf("${memberNameOut(item.component) || ''}`,") < 0, '결과표 위치 칸에 부재명을 붙여 쓰는 곳이 남지 않음');

// ---- 2) 쪽 나눔 계획 ----
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.planHwpxTablePages([10, 10, 10, 10, 10], 25, 30))), [[0, 1], [2, 3, 4]]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.planHwpxTablePages([50, 10], 25, 30))), [[0], [1]], '쪽보다 큰 행도 한 쪽에 하나는 들어감');
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.planHwpxTablePages([5, 5], 25, 30))), [[0, 1]]);

// ---- 3) 실제 양식의 부재실측 표를 25행으로 채워 나누기 ----
let xmldom = null;
try { xmldom = require('@xmldom/xmldom'); } catch (e) { /* 없으면 이 부분만 건너뜀 */ }
const tplPath = path.join(root, 'templates', 'hwpx_survey_template.hwpx');
// 의존성 없이 zip 안 Contents/section0.xml 만 읽는다(중앙 디렉터리)
function readSection0(p) {
    const buf = fs.readFileSync(p);
    const zlib = require('zlib');
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let off = buf.readUInt32LE(eocd + 16);
    const n = buf.readUInt16LE(eocd + 10);
    for (let i = 0; i < n; i++) {
        const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
        const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
        const local = buf.readUInt32LE(off + 42);
        if (buf.slice(off + 46, off + 46 + nl).toString() === 'Contents/section0.xml') {
            const ds = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
            const data = buf.slice(ds, ds + csize);
            return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
        }
        off += 46 + nl + el + cl;
    }
    return null;
}
if (!xmldom) {
    console.log('test-hwpx-ndt-table-pages: ok (DOM 검사 건너뜀)');
} else {
    (async () => {
        const xml = readSection0(tplPath);
        const doc = new xmldom.DOMParser().parseFromString(xml, 'text/xml');
        const HP = ctx.HWPX_HP_NS;
        // xmldom에 children이 없으면 채워 준다
        const proto = Object.getPrototypeOf(doc.documentElement);
        if (!('children' in proto)) {
            Object.defineProperty(proto, 'children', { get() { return Array.from(this.childNodes).filter((n) => n.nodeType === 1); } });
        }
        const tbls = doc.getElementsByTagNameNS(HP, 'tbl');
        let tbl = null;
        for (let i = 0; i < tbls.length; i++) if (tbls[i].getAttribute('id') === '2137459237') tbl = tbls[i];
        assert.ok(tbl, '양식에 부재실측 표');
        const kids = (el, n) => Array.from(el.childNodes).filter((c) => c.nodeType === 1 && c.localName === n);
        const HEAD = 2;
        const rows = kids(tbl, 'tr');
        const sample = rows[HEAD + 1];
        rows.slice(HEAD).forEach((tr) => tbl.removeChild(tr));
        for (let i = 0; i < 25; i++) {
            const tr = sample.cloneNode(true);
            kids(tr, 'tc').forEach((tc) => {
                tc.getElementsByTagNameNS(HP, 'cellAddr')[0].setAttribute('rowAddr', String(HEAD + i));
                tc.getElementsByTagNameNS(HP, 'cellSz')[0].setAttribute('height', '3600'); // 3줄짜리 행
            });
            tbl.appendChild(tr);
        }
        let para = tbl.parentNode;
        while (para.localName !== 'p') para = para.parentNode;
        const parent = para.parentNode;
        const n = ctx.splitHwpxNdtTableToPages(tbl, HEAD);
        assert.ok(n >= 2, '25행(3줄)은 한 쪽에 안 들어가 나뉨: ' + n);
        const paras = [];
        let p = para;
        for (let i = 0; i < n; i++) { paras.push(p); p = p.nextSibling; while (p && p.nodeType !== 1) p = p.nextSibling; }
        let total = 0;
        paras.forEach((pp, i) => {
            assert.strictEqual(pp.parentNode, parent);
            const t = pp.getElementsByTagNameNS(HP, 'tbl')[0];
            assert.ok(t, i + '번째 표');
            const trs = kids(t, 'tr');
            assert.strictEqual(Number(t.getAttribute('rowCnt')), trs.length);
            const head = trs.slice(0, HEAD).map((tr) => tr.textContent.replace(/\s+/g, ''));
            assert.ok(head[1].includes('NO.') && head[0].includes('마감상태'), '머리 행을 다시 담');
            trs.slice(HEAD).forEach((tr, j) => kids(tr, 'tc').forEach((tc) => {
                assert.strictEqual(tc.getElementsByTagNameNS(HP, 'cellAddr')[0].getAttribute('rowAddr'), String(HEAD + j));
            }));
            total += trs.length - HEAD;
            if (i > 0) assert.strictEqual(pp.getAttribute('pageBreak'), '1', '다음 표는 새 쪽');
            assert.ok(Number(kids(t, 'sz')[0].getAttribute('height')) < 66000, '한 쪽 안 높이');
        });
        assert.strictEqual(total, 25, '행이 빠지거나 겹치지 않음');
        const ids = paras.map((pp) => pp.getElementsByTagNameNS(HP, 'tbl')[0].getAttribute('id'));
        assert.strictEqual(new Set(ids).size, ids.length, '표 id가 겹치지 않음');

        // ---- 4) 내화피복: 플렌지·웨브 두 행(세로 병합) 묶음은 쪽 사이에서 갈라지지 않음 ----
        let fp = null;
        for (let i = 0; i < tbls.length; i++) if (tbls[i].getAttribute('id') === '504') fp = tbls[i];
        assert.ok(fp, '양식에 내화피복 표');
        const fpRows = kids(fp, 'tr');
        const pairA = fpRows[1], pairB = fpRows[2];
        fpRows.slice(1).forEach((tr) => fp.removeChild(tr));
        const FP_PAIRS = 20;
        for (let i = 0; i < FP_PAIRS; i++) {
            [pairA, pairB].forEach((src, k) => {
                const tr = src.cloneNode(true);
                kids(tr, 'tc').forEach((tc) => {
                    tc.getElementsByTagNameNS(HP, 'cellAddr')[0].setAttribute('rowAddr', String(1 + i * 2 + k));
                    const span = Number(tc.getElementsByTagNameNS(HP, 'cellSpan')[0].getAttribute('rowSpan'));
                    tc.getElementsByTagNameNS(HP, 'cellSz')[0].setAttribute('height', String(2776 * span));
                });
                fp.appendChild(tr);
            });
        }
        let fpPara = fp.parentNode;
        while (fpPara.localName !== 'p') fpPara = fpPara.parentNode;
        const fn = ctx.splitHwpxNdtTableToPages(fp, 1);
        assert.ok(fn >= 2, '내화피복 20개(40행)는 나뉨: ' + fn);
        let fpTotal = 0;
        let q = fpPara;
        for (let i = 0; i < fn; i++) {
            const t = q.getElementsByTagNameNS(HP, 'tbl')[0];
            const data = kids(t, 'tr').slice(1);
            assert.strictEqual(data.length % 2, 0, i + '번째 표: 플렌지·웨브 짝이 갈라지지 않음');
            data.forEach((tr, j) => {
                const spans = kids(tr, 'tc').map((tc) => Number(tc.getElementsByTagNameNS(HP, 'cellSpan')[0].getAttribute('rowSpan')));
                assert.strictEqual(spans.some((v) => v === 2), j % 2 === 0, '짝의 첫 행만 병합 칸');
            });
            assert.ok(kids(t, 'tr')[0].textContent.includes('NO.'), '머리 행');
            assert.ok(Number(kids(t, 'sz')[0].getAttribute('height')) < 66000, '한 쪽 안 높이');
            fpTotal += data.length;
            q = q.nextSibling; while (q && q.nodeType !== 1) q = q.nextSibling;
        }
        assert.strictEqual(fpTotal, FP_PAIRS * 2);
        console.log('test-hwpx-ndt-table-pages: ok (부재실측 ' + n + '쪽, 내화피복 ' + fn + '쪽)');
    })().catch((e) => { console.error(e); process.exit(1); });
}
