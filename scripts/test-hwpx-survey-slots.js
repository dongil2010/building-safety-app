#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const slots = require(path.join(__dirname, '..', 'js', 'shared', 'hwpx-survey-slots.js'));

function testInspectionTypeMapping() {
    assert.strictEqual(slots.isPreciseInspectionForHwpx('정밀안전점검'), true);
    assert.strictEqual(slots.isPreciseInspectionForHwpx('정밀안전진단'), true);
    assert.strictEqual(slots.isPreciseInspectionForHwpx('정기안전점검'), false);
    assert.strictEqual(slots.isPreciseInspectionForHwpx(undefined), true);
    assert.strictEqual(slots.isPreciseInspectionForHwpx(''), true);
}

function makePara(id) {
    const para = {
        localName: 'p',
        parentNode: null,
        childNodes: [],
        id
    };
    return para;
}

function attach(parent, child) {
    child.parentNode = parent;
    parent.childNodes = parent.childNodes || [];
    parent.childNodes.push(child);
    parent.removeChild = function (node) {
        parent.childNodes = parent.childNodes.filter((c) => c !== node);
        if (node.parentNode === parent) node.parentNode = null;
    };
    return child;
}

function makeTable(id, para, runParent) {
    const run = runParent || attach(para, { localName: 'run', childNodes: [], parentNode: para });
    if (!run.removeChild) {
        run.removeChild = function (node) {
            run.childNodes = run.childNodes.filter((c) => c !== node);
            if (node.parentNode === run) node.parentNode = null;
        };
    }
    const tbl = { localName: 'tbl', id, parentNode: run };
    attach(run, tbl);
    return tbl;
}

function testStripKeepsSharedParaTable() {
    const sec = { localName: 'sec', childNodes: [] };
    const title = attach(sec, makePara('title'));
    const body = attach(sec, makePara('body'));
    const keep = makeTable('keep', body);
    const extraSamePara = makeTable('extra-same', body);
    const page2 = attach(sec, makePara('page2'));
    const extraPage = makeTable('extra-page', page2);

    const slot = {
        titlePara: title,
        statusTbls: [keep, extraSamePara, extraPage]
    };
    slots.stripExcessStampStatusTables(slot);

    assert.ok(keep.parentNode, 'keep table must stay attached');
    assert.ok(body.parentNode, 'keep paragraph must not be deleted');
    assert.strictEqual(extraSamePara.parentNode, null, 'extra table in keep para is removed');
    assert.strictEqual(page2.parentNode, null, 'later sample page paragraph is removed');
    assert.strictEqual(slot.statusTbls.length, 1);
    assert.strictEqual(slot.statusTbls[0], keep);
}

function testStripTitleParaTablesOnly() {
    const sec = { localName: 'sec', childNodes: [] };
    const title = attach(sec, makePara('title'));
    const keep = makeTable('keep', title);
    const extra = makeTable('extra', title);
    const laterPara = attach(sec, makePara('later'));
    const later = makeTable('later', laterPara);

    const slot = { titlePara: title, statusTbls: [keep, extra, later] };
    slots.stripExcessStampStatusTables(slot);

    assert.ok(keep.parentNode);
    assert.ok(title.parentNode);
    assert.strictEqual(extra.parentNode, null);
    assert.strictEqual(laterPara.parentNode, null);
    assert.strictEqual(slot.statusTbls[0], keep);
}

function testOldBugWouldDeleteKeepPara() {
    // Documents the pre-fix behaviour: deleting the whole non-title para
    // that held both keep + extra also detached keep.
    const sec = { localName: 'sec', childNodes: [] };
    const title = attach(sec, makePara('title'));
    const body = attach(sec, makePara('body'));
    const keep = makeTable('keep', body);
    const extra = makeTable('extra', body);
    const p = body;
    // old logic: extra is not in titlePara → removeChild(p)
    if (p && p.parentNode) p.parentNode.removeChild(p);
    assert.strictEqual(body.parentNode, null,
        'old path detaches the whole body paragraph (and keep with it)');
}

function testStripSecPrFromClones() {
    const hpNs = slots.HP_NS;
    const para = {
        localName: 'p',
        childNodes: []
    };
    const secRun = {
        nodeType: 1,
        localName: 'run',
        parentNode: para,
        getElementsByTagNameNS(ns, name) {
            if (name === 'secPr') return [{}];
            return [];
        }
    };
    const tableRun = {
        nodeType: 1,
        localName: 'run',
        parentNode: para,
        getElementsByTagNameNS(ns, name) {
            if (name === 'tbl') return [{}];
            return [];
        }
    };
    para.childNodes.push(secRun, tableRun);
    para.removeChild = function (node) {
        para.childNodes = para.childNodes.filter((c) => c !== node);
        if (node.parentNode === para) node.parentNode = null;
    };
    slots.stripSecPrRunsFromClonedParas([para], hpNs);
    assert.strictEqual(secRun.parentNode, null, 'secPr-only run is stripped from clones');
    assert.strictEqual(tableRun.parentNode, para, 'table run is kept');
}

function testCjkWrapsInsteadOfFitText() {
    const longKo = '슬래브하부균열및박리탈락과누수흔적';
    const wrapped = slots.wrapHwpxCellLine(longKo, 8);
    const lines = wrapped.split('\n');
    assert.ok(lines.length >= 3, 'CJK text must wrap at cell width, not dump as one line');
    assert.strictEqual(lines.join(''), longKo, 'wrap must not drop or reorder Hangul syllables');
    lines.forEach((line) => {
        assert.ok(Array.from(line).length <= 8, `wrapped line too long: ${line}`);
    });
}

function testAsciiMeasureTokenStaysIntact() {
    assert.strictEqual(slots.wrapHwpxCellLine('Cw:0.15', 4), 'Cw:0.15');
    assert.strictEqual(slots.wrapHwpxCellLine('0.15/1.5', 4), '0.15/1.5');
    assert.strictEqual(slots.wrapHwpxCellLine('0.3~0.7/0.5', 4), '0.3~0.7/0.5');
    const mixed = slots.wrapHwpxCellLine('슬래브하부균열및박리 Cw:0.15', 8);
    assert.ok(mixed.includes('Cw:0.15'), 'measurement token must stay on one line');
    assert.ok(!mixed.includes('Cw:0.\n'), 'must not split Cw:0.15 at the decimal');
}

function testEaSuffixStillOwnLine() {
    const out = slots.wrapHwpxCellText('0.3~0.7/0.5 -12EA', 16, (s) =>
        String(s).replace(/([^\s\n])[ \t]*-(\d+)\s*EA\b/gi, '$1 -$2EA'));
    assert.strictEqual(out, '0.3~0.7/0.5\n-12EA');
}

function testOldBugDumpedRestAsOneLine() {
    const longKo = '슬래브하부균열및박리탈락과누수흔적추가설명문장';
    const oldDump = longKo; // pre-fix: no lastBreak → push rest, break
    const fixed = slots.wrapHwpxCellLine(longKo, 8);
    assert.notStrictEqual(fixed, oldDump, 'old path left the whole Korean run on one line');
    assert.ok(fixed.split('\n').length > 1);
}

testInspectionTypeMapping();
testStripKeepsSharedParaTable();
testStripTitleParaTablesOnly();
testOldBugWouldDeleteKeepPara();
testStripSecPrFromClones();
testCjkWrapsInsteadOfFitText();
testAsciiMeasureTokenStaysIntact();
testEaSuffixStillOwnLine();
testOldBugDumpedRestAsOneLine();
console.log('test-hwpx-survey-slots.js: ok');
