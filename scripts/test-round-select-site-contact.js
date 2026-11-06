#!/usr/bin/env node
'use strict';

/**
 * 회차선택 화면의 현장 담당자·연락처: 기존 건물 칸만 읽고,
 * 현장 목록과 같은 문구·빈 값 처리를 쓰며 저장 값을 바꾸지 않는다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const HS = require(path.join(root, 'js', 'core', 'home-sites.js'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const homeTab = fs.readFileSync(path.join(root, 'js', 'tabs', 'home.js'), 'utf8');

assert.strictEqual(typeof HS.formatSiteContactLine, 'function');
assert.strictEqual(HS.SITE_CONTACT_EMPTY, '현장 담당자·연락처 미등록');

(function formatLine() {
    assert.strictEqual(
        HS.formatSiteContactLine([{ inspector: '홍길동', contactPhone: '010-1234-5678' }]),
        '현장 담당자 홍길동 · 010-1234-5678'
    );
    assert.strictEqual(
        HS.formatSiteContactLine([{ inspector: '이담당', contactPhone: '' }]),
        '현장 담당자 이담당'
    );
    assert.strictEqual(
        HS.formatSiteContactLine([{ inspector: '  ', contactPhone: '010-0000-0000' }]),
        '현장 담당자 010-0000-0000'
    );
    assert.strictEqual(HS.formatSiteContactLine([{ inspector: '', contactPhone: '' }]), HS.SITE_CONTACT_EMPTY);
    assert.strictEqual(HS.formatSiteContactLine([{ inspector: '   ', contactPhone: '\t' }]), HS.SITE_CONTACT_EMPTY);
    assert.strictEqual(HS.formatSiteContactLine([]), HS.SITE_CONTACT_EMPTY);
    assert.strictEqual(HS.formatSiteContactLine(null), HS.SITE_CONTACT_EMPTY);
    // 여러 동/회차: 비어 있지 않은 첫 칸만 쓴다(현장 목록과 동일)
    assert.strictEqual(
        HS.formatSiteContactLine([
            { inspector: '', contactPhone: '' },
            { inspector: '박현장', contactPhone: '02-111-2222' }
        ]),
        '현장 담당자 박현장 · 02-111-2222'
    );
})();

(function noMutation() {
    const members = [{ inspector: '김', contactPhone: '011-1' }];
    const snap = JSON.stringify(members);
    HS.formatSiteContactLine(members);
    assert.strictEqual(JSON.stringify(members), snap, '표시 함수가 건물 레코드를 바꾸면 안 됨');
})();

(function wiring() {
    assert.ok(html.includes('id="dashboardSiteContact"'), '회차선택 상단 칸');
    assert.ok(html.includes('aria-label="현장 담당자 및 연락처"'));
    assert.ok(app.includes("heroTitle.textContent = '📅 점검 회차 선택'"));
    const fillStart = app.indexOf('회차선택(현장 진입)에는 기존 inspector/contactPhone');
    assert.ok(fillStart > 0, '회차선택 진입에서 담당자 줄을 채움');
    const fillBody = app.slice(fillStart, fillStart + 1600);
    assert.ok(fillBody.includes('formatSiteContactLine(siteMembers)'));
    assert.ok(fillBody.includes('contactEl.textContent = line'));
    assert.ok(fillBody.includes('onRoundSelect'), '회차선택(동 선택 전)일 때만 표시');
    assert.ok(!/\.inspector\s*=/.test(fillBody) && !/\.contactPhone\s*=/.test(fillBody), '기존 연락처 칸을 쓰지 않음');
    assert.ok(!/firebase|collection\(|setDoc|updateDoc/i.test(fillBody));
    // 현장 목록도 같은 함수를 써서 문구가 갈라지지 않는다
    assert.ok(app.includes('HS.formatSiteContactLine(members)'));
    assert.ok(css.includes('.dashboard-site-contact') && css.includes('.dashboard-site-contact.is-empty'));
    assert.ok(css.includes('overflow-wrap: anywhere'));
    assert.ok(/@media \(max-width: 1024px\) \{\s*\.dashboard-site-contact \{/.test(css), '태블릿·폰에서 글자 크기');
    assert.ok(homeTab.includes('회차선택: 현장 목록과 같은 현장 담당자·연락처'));
})();

console.log('test-round-select-site-contact: ok');
