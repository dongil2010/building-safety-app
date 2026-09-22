#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 한글 기울기·부동침하·부재변위 결과표(501~503) — 템플릿 XML 속 칸 순서가 0,1,3,4,2,5,6으로
 * 뒤섞여 칸을 누르면 커서가 엉뚱한 칸에서 깜빡이고, 복사해 엑셀에 붙이면 열이 틀어졌다.
 * 출력 때 각 행의 칸을 칸 주소(colAddr) 순서로 다시 놓는다. 1·2종 / 3종 출력 두 곳 모두.
 * (실제 템플릿 DOM 검증은 브라우저에서 수행: 두 템플릿 × 3개 표 모두 정렬·내용 보존·XML 정상)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

// 아주 작은 가짜 DOM — childNodes / localName / appendChild(옮기기) / cellAddr 조회만
function el(localName, attrs, children) {
    const node = { localName, attrs: attrs || {}, childNodes: [], parentNode: null };
    node.getAttribute = (k) => node.attrs[k];
    node.appendChild = (c) => {
        if (c.parentNode) c.parentNode.childNodes.splice(c.parentNode.childNodes.indexOf(c), 1);
        c.parentNode = node;
        node.childNodes.push(c);
        return c;
    };
    node.getElementsByTagNameNS = (_ns, name) => {
        const out = [];
        const walk = (n) => n.childNodes.forEach((c) => { if (c.localName === name) out.push(c); walk(c); });
        walk(node);
        return out;
    };
    (children || []).forEach((c) => node.appendChild(c));
    return node;
}
const tc = (col) => el('tc', {}, [el('subList', {}, []), el('cellAddr', { colAddr: String(col) }, [])]);
const tr = (cols) => el('tr', {}, cols.map(tc));
const order = (row) => row.childNodes.filter((c) => c.localName === 'tc')
    .map((c) => c.getElementsByTagNameNS('', 'cellAddr')[0].getAttribute('colAddr')).join(',');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractFunction('function sortHwpxRowCellsByColAddr(') + '\nthis.sort = sortHwpxRowCellsByColAddr;', ctx);

const header = tr([0, 3, 2, 5, 6]);
const sub = tr([0, 1, 3, 4]);
const data = tr([0, 1, 3, 4, 2, 5, 6]);
const firstDataTc = data.childNodes[0];
const tbl = el('tbl', {}, [el('sz', {}, []), header, sub, data]);
ctx.sort(tbl, 'ns');
assert.strictEqual(order(header), '0,2,3,5,6', '제목행도 칸 주소 순서');
assert.strictEqual(order(sub), '0,1,3,4');
assert.strictEqual(order(data), '0,1,2,3,4,5,6', '데이터행: 높이(2)가 금회(4) 뒤에 있으면 안 된다');
assert.strictEqual(data.childNodes[0], firstDataTc, '칸을 새로 만들지 않고 그대로 옮긴다');
assert.strictEqual(tbl.childNodes[0].localName, 'sz', '행이 아닌 자식은 건드리지 않는다');
ctx.sort(null, 'ns');

// 세 표 × 두 출력 경로 모두 채운 직후 정렬
const calls = app.match(/if \(tbl\) sortHwpxRowCellsByColAddr\(tbl, HP_NS\);/g) || [];
assert.strictEqual(calls.length, 6, '기울기·부동침하·부재변위 × 1·2종/3종 = 6곳');
['TILT_TBL_ID', 'SETTLEMENT_TBL_ID', 'MEMBER_DISP_TBL_ID'].forEach((id) => {
    const re = new RegExp('findTblById\\(' + id + '[\\s\\S]{0,1800}?\\}\\), true\\);\\n\\s*if \\(tbl\\) sortHwpxRowCellsByColAddr', 'g');
    assert.strictEqual((app.match(re) || []).length, 2, id + ' 채운 바로 뒤에 정렬');
});

console.log('test-hwpx-row-cell-order: ok');
