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

    // PC 앱 판별: UA가 아니라 preload 다리
    assert.strictEqual(C.hasDesktopBridge({}), false, '웹·Chrome·모바일');
    assert.strictEqual(C.hasDesktopBridge({ navigator: { userAgent: 'Electron/30' } }), false, 'UA만으로는 PC 앱이 아니다');
    assert.strictEqual(C.hasDesktopBridge({ bsaDesktop: { readCadImportJson: async () => ({}) } }), true);
    assert(!C.readFromDirHandle && !C.supportsDirPicker, '웹 폴더 손잡이 흐름 없음');

    // 앱 연결: 버튼 → 바탕화면 먼저, 파일 창은 대비책. 파일 고르기와 같은 처리 함수
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert(/btnImportCadPins\.addEventListener\('click', \(\) => \{ cadImportFromDesktop\(\)/.test(app));
    assert(/reader\.onload = function \(e\) \{\s*try \{ processCadJsonText\(e\.target\.result\)/.test(app), '파일 고르기도 같은 처리');
    assert(/cadLoadDesktopText\(res\.text, res\.mtime/.test(app), 'PC 앱은 확인창 없이 바로');
    assert(!/cadConfirmDesktopFile/.test(app), '확인창 없음');
    const fnBody = app.slice(app.indexOf('async function cadImportFromDesktop'), app.indexOf('window.cadImportFromDesktop ='));
    assert(!/appChoose/.test(fnBody), '추가 창 없음');
    assert(/if \(C && C\.hasDesktopBridge\(window\)\)/.test(fnBody), 'PC 앱은 다리로 판별');
    assert(/!res \|\| !res\.found\) \{ cadPickFileFallback/.test(fnBody), 'PC 앱에서 파일 없으면 파일 창');
    assert(/웹·Chrome·모바일[^\n]*\n\s*cadPickFileFallback\(\);\s*\}/.test(fnBody), '웹은 곧바로 파일 창');
    assert(!/showDirectoryPicker|requestPermission|localBackupGet\(CAD_DESKTOP_DIR_KEY|localBackupPut\(CAD_DESKTOP_DIR_KEY/.test(app), '웹 폴더 고르기·권한·손잡이 기억 없음');
    assert(/localBackupDelete\(CAD_DESKTOP_DIR_KEY\)/.test(app), '남은 폴더 손잡이는 지운다');
    assert(/startCad2PointCalibration\(parsed\.data, floorKey, bldg\)/.test(app), '지금 층 기준점 단계 그대로');
    const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(/js\/core\/cad-desktop-import\.js/.test(idx));

    // PC 앱 다리: 읽기 전용 한 파일, 우리 화면에서만
    const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
    const pre = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
    assert(/preload: path\.join\(__dirname, 'preload\.js'\)/.test(main));
    assert(/ipcMain\.handle\('bsa:read-cad-import-json'[\s\S]{0,120}trustedSender\(event\)/.test(main));
    assert(!/writeFile/.test(pre) && /readCadImportJson/.test(pre));
    assert(/registryDesktopDirs\(\)/.test(main) && /User Shell Folders/.test(main) && /app\.getPath\('desktop'\)/.test(main), '바탕화면: getPath + 레지스트리 + OneDrive');
    assert(/\[REMOTE_URL, appStartUrl\]/.test(main), '실제로 연 주소의 출처도 믿는다');
    console.log('test-cad-desktop-import: ok');
})().catch((e) => { console.error(e); process.exit(1); });
