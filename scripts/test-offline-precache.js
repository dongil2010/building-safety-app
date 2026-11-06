#!/usr/bin/env node
'use strict';
/** 2026-11-06 현장 앱: 눌러야 불리는 파일도 온라인일 때 미리 받아 오프라인에서 최신 기능·양식을 쓴다. 받기 속도 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const P = require('../js/core/offline-precache.js');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

// 양식 파일은 빠짐없이
const onDisk = fs.readdirSync(path.join(root, 'templates')).filter((f) => f.endsWith('.hwpx')).map((f) => 'templates/' + f);
onDisk.forEach((f) => assert.ok(P.FILES.includes(f), '미리 받기에 없음: ' + f));
P.FILES.concat(P.PAGES).forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), '없는 파일: ' + f));
assert.deepStrictEqual(P.localAssetsOf('<script src="js/a.js?v=1"></script><link href="./s.css?v=2"><script src="https://x/y.js"></script><link href="data:x">'), ['js/a.js', 's.css']);

(async () => {
    const asked = [];
    const fake = async (u) => { asked.push(u); return { ok: true, text: async () => '<script src="js/page.js?v=9"></script>', arrayBuffer: async () => new ArrayBuffer(0) }; };
    assert.strictEqual(await P.run(fake), true);
    assert.ok(asked.includes('js/page.js') && asked.includes('templates/hwpx_survey_template_grade3.hwpx'), '화면 파일과 양식을 받음');
    const bad = async () => { throw new Error('끊김'); };
    assert.strictEqual(await P.run(bad), false, '끊기면 완료로 표시 안 함');

    // 받기 속도: 층을 동시에, 지난번 받은 사진은 통째로 안 읽음, 서버 확인에서 읽은 층 재사용
    assert.ok(app.includes('await runPool(floorCodes, FLOOR_READ_CONCURRENCY,'));
    assert.ok(app.includes('await runPool(codesAll, FLOOR_READ_CONCURRENCY,'));
    assert.ok(app.indexOf("prevPhotoOk.has(job.key) && await idbHas('photos', job.key)") < app.indexOf("const local = await idbGet('photos', job.key);"));
    assert.ok(app.includes('_floorBundleMemo = new Map();') && app.includes('_floorBundleMemo = null;'));
    console.log('test-offline-precache: ok');
})().catch((e) => { console.error(e); process.exit(1); });
