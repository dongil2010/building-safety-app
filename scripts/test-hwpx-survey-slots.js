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

testInspectionTypeMapping();
testStripKeepsSharedParaTable();
testStripTitleParaTablesOnly();
testOldBugWouldDeleteKeepPara();
testStripSecPrFromClones();
console.log('test-hwpx-survey-slots.js: ok');
