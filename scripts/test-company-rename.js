#!/usr/bin/env node
'use strict';

/**
 * 2026-09-21: 회사 이름(아인테크 → (주)동일구조)을 바꾸고 싶다는 요청.
 * 이름이 회사 정보(companies/{id}.name)·직원별 사용자 정보(users/{uid}.companyName)·
 * 가입 코드(joinCodes)에 복사돼 있어, 한 곳만 바꾸면 직원마다 옛 이름이 남았다.
 *  - 기준은 회사 정보. 로그인 때 그 이름으로 화면을 맞추고 본인 사용자 정보를 고친다.
 *  - 관리자 전용 「회사 이름」 버튼이 회사 정보를 바꾼다.
 * 점검 데이터는 companyId(고유 번호)로 연결돼 이름을 바꿔도 끊기지 않는다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function slice(startNeedle, span) {
    const at = app.indexOf(startNeedle);
    assert.ok(at > 0, startNeedle + ' 를 찾지 못했다');
    return app.slice(at, at + span);
}

function testLoginUsesCompanyDocName() {
    const enter = slice('async function enterAppAsUser(profile)', 5000);
    assert.ok(enter.indexOf('applyCompanyNameFromCompanyDoc(profile, companyDocData.name)') > 0,
        '관리자는 이미 읽는 회사 정보에서 이름을 가져와야 한다(읽기 한 번으로)');
    assert.ok(/db\.collection\('companies'\)\.doc\(profile\.companyId\)\.get\(\)\s*\n\s*\.then\(/.test(enter),
        '직원은 로그인을 늦추지 않게 기다리지 않고(then) 회사 이름을 읽어야 한다');
    assert.ok(enter.indexOf('setCompanyRenameButtonVisible(profile.role === \'admin\')') > 0,
        '「회사 이름」 버튼은 관리자에게만 보여야 한다');
}

function testSelfHealOwnUserDocOnly() {
    const fn = slice('function applyCompanyNameFromCompanyDoc(profile, companyDocName)', 1600);
    assert.ok(fn.indexOf('window.state.companyId !== profile.companyId') > 0,
        '읽는 사이 회사를 나가거나 바꿨으면 손대지 않아야 한다');
    assert.ok(fn.indexOf("db.collection('users').doc(profile.uid).update({ companyName: next })") > 0,
        '본인 사용자 정보의 옛 이름을 고쳐야 다음부터 바로 새 이름이 뜬다');
    assert.ok(fn.indexOf('auth.currentUser.uid === profile.uid') > 0,
        '다른 사람 문서는 고치지 않는다(규칙상 막힐 수 있음)');
    assert.ok(fn.indexOf('stored !== next') > 0, '이미 같은 이름이면 쓰지 않는다(쓰기 비용)');
}

function testAdminRename() {
    const fn = slice('window.renameCompanyAsAdmin = async function', 2600);
    assert.ok(fn.indexOf("window.state.role !== 'admin'") > 0, '관리자만 바꿀 수 있어야 한다');
    assert.ok(fn.indexOf('if (!next)') > 0, '빈 이름은 막아야 한다');
    assert.ok(fn.indexOf("db.collection('companies').doc(window.state.companyId).update({ name: next })") > 0,
        '기준인 회사 정보의 이름을 바꿔야 한다');
    assert.ok(fn.indexOf("db.collection('users').doc(window.state.uid).update({ companyName: next })") > 0);
    assert.ok(fn.indexOf('applyCompanyNameLocally(next)') > 0, '바꾼 즉시 화면·보고서 값도 맞춰야 한다');
    assert.ok(fn.indexOf('window.confirm(') > 0, '바꾸기 전에 확인해야 한다');
}

function testButtonNotInIndexHtml() {
    assert.ok(index.indexOf('btnRenameCompany') < 0,
        'index.html은 건드리지 않는다(test-survey-round-delete) — 버튼은 JS로 만든다');
}

/** 이 기능이 기대는 보안 규칙이 바뀌면 알려준다 */
function testRulesStillAllowIt() {
    assert.ok(/match \/companies\/\{companyId\}[\s\S]{0,400}allow update, delete: if isCompanyAdmin\(companyId\);/.test(rules),
        '관리자가 회사 정보(companies)를 고칠 수 있어야 한다');
    assert.ok(/membershipFieldsOnly\(\)\s*\{[\s\S]{0,200}'companyName'/.test(rules),
        '본인이 사용자 정보의 companyName을 고칠 수 있어야 한다');
    assert.ok(/request\.auth\.uid == uid && membershipFieldsOnly\(\)/.test(rules));
}

testLoginUsesCompanyDocName();
testSelfHealOwnUserDocOnly();
testAdminRename();
testButtonNotInIndexHtml();
testRulesStillAllowIt();
console.log('test-company-rename: ok');
