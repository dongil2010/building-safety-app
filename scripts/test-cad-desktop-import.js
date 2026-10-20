'use strict';
// CAD 핀: 바탕화면 cad_defects_import.json 바로 불러오기(2026-10-20)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../js/core/cad-desktop-import.js');

(async () => {
    // 같은 검사 규칙
    const good = JSON.stringify({ refPoint1: { x: 0, y: 0 }, refPoint2: { x: 1, y: 1 }, defects: [{ x: 1 }, { x: 2 }] });
    let r = C.parseCadJson('\uFEFF' + good);
    assert(r.ok && r.count === 2, 'BOM 있어도 읽음');
    assert(!C.parseCadJson('{"defects":[]}').ok && /defects 배열/.test(C.parseCadJson('{"defects":[]}').error));
    assert(/구버전/.test(C.parseCadJson('{"defects":[{"x":1}]}').error));
    assert(/오류/.test(C.parseCadJson('{oops').error));

    // 바탕화면 후보: 내 바탕화면 + OneDrive 바탕 화면/Desktop
    const c = C.desktopCandidates({ USERPROFILE: 'C:\\Users\\a', OneDrive: 'C:\\Users\\a\\OneDrive' });
    assert(c.includes('C:\\Users\\a\\Desktop\\cad_defects_import.json'));
    assert(c.includes('C:\\Users\\a\\OneDrive\\바탕 화면\\cad_defects_import.json'));
    assert(c.includes('C:\\Users\\a\\OneDrive\\Desktop\\cad_defects_import.json'));
    assert.strictEqual(new Set(c).size, c.length, '중복 없음');

    // Chrome 폴더 손잡이
    const file = { name: C.FILE_NAME, lastModified: 123, text: async () => good };
    const mkDir = (perm, opts) => ({
        name: 'Desktop',
        queryPermission: async () => perm.q,
        requestPermission: async () => { perm.asked = true; return perm.r; },
        getFileHandle: async (n) => {
            assert.strictEqual(n, C.FILE_NAME);
            if (opts && opts.missing) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; }
            return { getFile: async () => file };
        }
    });
    r = await C.readFromDirHandle(mkDir({ q: 'granted' }), false);
    assert(r.status === 'ok' && r.text === good && r.lastModified === 123);
    const p1 = { q: 'prompt', r: 'granted' };
    r = await C.readFromDirHandle(mkDir(p1), true);
    assert(r.status === 'ok' && p1.asked, '권한은 버튼 누를 때 한 번 묻는다');
    r = await C.readFromDirHandle(mkDir({ q: 'prompt', r: 'denied' }), true);
    assert.strictEqual(r.status, 'no-permission');
    r = await C.readFromDirHandle(mkDir({ q: 'granted' }, { missing: true }), true);
    assert.strictEqual(r.status, 'missing');
    assert.strictEqual(C.supportsDirPicker({}), false, '모바일 등은 파일 창으로');

    // 앱 연결: 버튼 → 바탕화면 먼저, 파일 창은 대비책. 파일 고르기와 같은 처리 함수
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert(/btnImportCadPins\.addEventListener\('click', \(\) => \{ cadImportFromDesktop\(\)/.test(app));
    assert(/reader\.onload = function \(e\) \{\s*try \{ processCadJsonText\(e\.target\.result\)/.test(app), '파일 고르기도 같은 처리');
    assert(/pick === 0\) processCadJsonText\(res\.text\)/.test(app) && /pick === 0\) processCadJsonText\(r\.text\)/.test(app), '확인 뒤에만 불러옴');
    assert(/startCad2PointCalibration\(parsed\.data, floorKey, bldg\)/.test(app), '지금 층 기준점 단계 그대로');
    assert(/localBackupPut\(CAD_DESKTOP_DIR_KEY, dir\)/.test(app), '고른 폴더 기억');
    const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(/js\/core\/cad-desktop-import\.js/.test(idx));

    // PC 앱 다리: 읽기 전용 한 파일, 우리 화면에서만
    const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
    const pre = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
    assert(/preload: path\.join\(__dirname, 'preload\.js'\)/.test(main));
    assert(/ipcMain\.handle\('bsa:read-cad-import-json'[\s\S]{0,120}trustedSender\(event\)/.test(main));
    assert(!/writeFile/.test(pre) && /readCadImportJson/.test(pre));
    console.log('test-cad-desktop-import: ok');
})().catch((e) => { console.error(e); process.exit(1); });
