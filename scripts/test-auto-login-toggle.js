#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

assert.ok(html.includes('id="btnAutoLogin"'), '로그인 화면 스위치');
assert.ok(html.includes('id="btnAutoLoginAccount"'), '로그인 후 스위치');
assert.ok(css.includes('.auto-login-toggle[aria-pressed="true"]'));
assert.ok(app.includes("localStorage.getItem(AUTO_LOGIN_KEY) === '1'"), '기본은 꺼짐');
assert.ok(app.includes('firebase.auth.Auth.Persistence.NONE'));
assert.ok(app.includes('firebase.auth.Auth.Persistence.LOCAL'));
assert.ok(app.includes('!isAutoLoginOn() && !window._explicitAuth'));

console.log('test-auto-login-toggle: ok');
