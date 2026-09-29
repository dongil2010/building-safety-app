#!/usr/bin/env node
'use strict';

/**
 * 2026-09-29 배포 순서: 테스트 → 규칙 게시 → 사이트.
 * 예전엔 규칙 게시가 테스트보다 먼저 돌아, 테스트가 실패해도 보안 규칙은 운영에 나갔다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy-web.yml'), 'utf8').replace(/\r\n/g, '\n');

function jobBlock(name) {
    const m = new RegExp('\\n  ' + name + ':\\n([\\s\\S]*?)(?=\\n  [a-z][\\w-]*:\\n|$)').exec(yml);
    assert.ok(m, name + ' 작업이 없다');
    return m[1];
}

const test = jobBlock('test');
const rules = jobBlock('rules');
const deploy = jobBlock('deploy');
assert.ok(/run: npm test/.test(test), 'test 작업이 npm test를 돌린다');
assert.ok(/(^|\n)    needs: test\n/.test(rules), '규칙 게시는 테스트가 통과해야 한다');
assert.ok(/(^|\n)    needs: \[test, rules\]\n/.test(deploy), '사이트 배포는 테스트·규칙 게시 뒤');
assert.ok(/firebase-tools@\d+ deploy/.test(rules) && !/firebase-tools@\d+ deploy/.test(test + deploy), '규칙 게시는 rules 작업에서만');

console.log('test-deploy-order: ok');
