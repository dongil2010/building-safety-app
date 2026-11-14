#!/usr/bin/env node
'use strict';
/** 2026-11-06 도장 박리로 적었는데 원인 세팅이 콘크리트 박리로 뜨던 문제 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const a = app.indexOf('const defectCausePreset = {');
const seg = app.slice(a, app.indexOf('\n    };', a));
const preset = {};
for (const m of seg.matchAll(/^\s*'([^']+)':/gm)) preset[m[1]] = [];
const ctx = { defectCausePreset: preset, isRcStructuralCrackKind: () => false, parseDefectTypeList: (r) => String(r).split(/[,，]+/).map((s) => s.trim()).filter(Boolean) };
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function getCauseKey(') + ';this.f = getCauseKey;', ctx);
const f = ctx.f;
assert.strictEqual(f('도장 박리'), '도장 박리');
assert.strictEqual(f('도장박리'), '도장 박리', '띄어쓰기 없어도');
assert.strictEqual(f('박리'), '박리/박락', '짧게 적으면 일반 종류, 콘크리트 박리 아님');
assert.strictEqual(f('콘크리트 박리'), '콘크리트 박리');
assert.strictEqual(f('콘크리트 박리 및 철근노출'), '콘크리트 박리', '긴 이름 안의 가장 구체적인 종류');
assert.strictEqual(f(''), '기타');
assert.strictEqual(f('처음 보는 결함'), '기타');
assert.ok(app.includes('const lastGroup = causeGroups[causeGroups.length - 1];'), '여러 종류면 마지막에 고른 종류');
assert.ok(/\.dqg-finish-bases \{[^}]*repeat\(2,/.test(css), '기둥·벽체·보·슬래브 2×2');
console.log('test-cause-key-match: ok');
