'use strict';
// 2026-10-19 결함 수정창 사진 칸 끌어다 놓기 — 여러 장, 기존 사진 추가와 같은 길(handleSelectedPhotoFile)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const pd = require(path.join(root, 'js', 'shared', 'photo-drop.js'));

const file = (name, type) => ({ name, type });
const dt = (types, files, data) => ({ types, files: files || [], getData: (k) => (data || {})[k] || '' });

assert.ok(pd.looksLikeImageDrag(dt(['Files'])));
assert.ok(pd.looksLikeImageDrag(dt(['text/uri-list', 'text/html'])));
assert.ok(!pd.looksLikeImageDrag(dt(['text/plain'])), '글자 끌기는 무시');
assert.ok(!pd.looksLikeImageDrag(null));

const picked = pd.pickImageFiles(dt(['Files'], [file('a.jpg', 'image/jpeg'), file('b.txt', 'text/plain'), file('c.PNG', ''), file('d.heic', 'image/heic')]));
assert.deepStrictEqual(picked.map((f) => f.name), ['a.jpg', 'c.PNG', 'd.heic'], '그림만, 순서 그대로, 여러 장');
assert.deepStrictEqual(pd.pickImageFiles(dt(['Files'], [file('x.pdf', 'application/pdf')])), []);

assert.strictEqual(pd.extractImageUrl(dt(['text/uri-list'], [], { 'text/uri-list': '#c\ndata:image/jpeg;base64,AAA' })), 'data:image/jpeg;base64,AAA');
assert.strictEqual(pd.extractImageUrl(dt(['text/uri-list'], [], { 'text/uri-list': 'blob:https://x/1' })), 'blob:https://x/1');
assert.strictEqual(pd.extractImageUrl(dt(['text/uri-list'], [], { 'text/uri-list': 'https://evil.example/a.jpg' })), '', '바깥 주소는 받지 않는다');

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const bind = extractFunction(app, 'function bindDefectPhotoDrop(');
assert.ok(/#defectModal \.defect-photo-block/.test(bind));
assert.ok(/handleSelectedPhotoFile\(f, 'curr', photoTarget\)/.test(bind), '추가 단추와 같은 처리(줄이기·IndexedDB·동기화)');
assert.ok(/for \(const f of sources\)/.test(bind) && /await handleSelectedPhotoFile/.test(bind), '여러 장을 순서대로');
assert.ok(/defect-photo-drop-hot/.test(bind), '놓을 곳 표시');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => assert.ok(bind.includes(`'${ev}'`), ev));
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(/\.defect-photo-drop-hot/.test(css));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/js\/shared\/photo-drop\.js\?v=/.test(html) && html.indexOf('js/shared/photo-drop.js') < html.indexOf('src="app.js'));
console.log('test-defect-photo-drop: ok');
