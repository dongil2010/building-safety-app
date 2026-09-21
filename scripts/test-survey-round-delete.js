#!/usr/bin/env node
'use strict';

/**
 * Smoke + pure-logic checks for 회차 삭제 (휴지통).
 * Does not boot the full app; asserts source markers and simulates trash batching.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const appJs = path.join(root, 'app.js');
const stylesCss = path.join(root, 'styles.css');

function read(p) {
    return fs.readFileSync(p, 'utf8');
}

function testSourceMarkers() {
    const app = read(appJs);
    const css = read(stylesCss);
    assert.ok(app.includes('window.deleteSurveyRound = function'), 'deleteSurveyRound exported');
    assert.ok(app.includes('data-action="delete-round"'), 'delete-round action in UI');
    assert.ok(app.includes('moveBuildingToTrash(b, { skipUi: true })'), 'batch trash uses skipUi');
    assert.ok(app.includes('opts.skipUi'), 'moveBuildingToTrash supports skipUi');
    assert.ok(app.includes('mergeBuildingTrashState'), 'trash merge helper still present');
    assert.ok(css.includes('.icon-btn-trash'), 'trash icon style');
    // UTF-8 safety: Korean UI strings present as proper Unicode (not mojibake)
    assert.ok(app.includes('회차를 휴지통으로 옮겼습니다'), 'Korean success toast');
    assert.ok(app.includes('이 회차 삭제(휴지통)'), 'Korean button title');
}

function testNodeSyntax() {
    const r = spawnSync(process.execPath, ['--check', appJs], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr || 'node --check failed');
}

/** Mirrors deleteSurveyRound member selection + trash stamp (no DOM). */
function testTrashBatchLeavesOtherRounds() {
    const buildings = [
        { id: 'a', siteName: '영일', inspectionYear: '2025년', inspectionPeriod: '하반기', trashedAt: null },
        { id: 'b', siteName: '영일', inspectionYear: '2026년', inspectionPeriod: '상반기', trashedAt: null },
        { id: 'c', siteName: '영일', inspectionYear: '2026년', inspectionPeriod: '상반기', dong: '101동', trashedAt: null },
        { id: 'd', siteName: '다른현장', inspectionYear: '2026년', inspectionPeriod: '상반기', trashedAt: null }
    ];
    const roundKey = '2026년_상반기';
    const siteKey = '영일';
    const getKey = (b) => `${b.inspectionYear}_${b.inspectionPeriod}`;
    const members = buildings.filter(
        (b) => b.siteName === siteKey && getKey(b) === roundKey && !b.trashedAt
    );
    assert.strictEqual(members.length, 2);
    const now = '2026-09-21T00:00:00.000Z';
    members.forEach((b) => {
        b.trashedAt = now;
        b._pendingCloudSync = true;
    });
    const activeSameSite = buildings.filter((b) => b.siteName === siteKey && !b.trashedAt);
    assert.strictEqual(activeSameSite.length, 1);
    assert.strictEqual(getKey(activeSameSite[0]), '2025년_하반기');
    const otherSite = buildings.find((b) => b.id === 'd');
    assert.ok(!otherSite.trashedAt, 'other site untouched');
}

function testLastRoundAllowed() {
    const buildings = [
        { id: 'only', siteName: '단독', inspectionYear: '2026년', inspectionPeriod: '하반기' }
    ];
    const roundKey = '2026년_하반기';
    const members = buildings.filter(
        (b) => b.siteName === '단독' && `${b.inspectionYear}_${b.inspectionPeriod}` === roundKey
    );
    const remaining = buildings.filter(
        (b) => b.siteName === '단독' && `${b.inspectionYear}_${b.inspectionPeriod}` !== roundKey
    );
    assert.strictEqual(members.length, 1);
    assert.strictEqual(remaining.length, 0, 'last round may be deleted (empty remaining)');
}

function testIndexHtmlUntouched() {
    // Feature must not rewrite index.html (UTF-8 risk preference)
    const st = spawnSync('git', ['diff', '--name-only', '--', 'index.html'], {
        cwd: root,
        encoding: 'utf8'
    });
    const names = (st.stdout || '').trim();
    assert.strictEqual(names, '', `index.html should be untouched, got: ${names}`);
}

function main() {
    testSourceMarkers();
    testNodeSyntax();
    testTrashBatchLeavesOtherRounds();
    testLastRoundAllowed();
    testIndexHtmlUntouched();
    console.log('OK test-survey-round-delete.js');
}

main();
