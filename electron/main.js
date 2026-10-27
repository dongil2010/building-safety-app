/**
 * PC용 스마트 안전점검 — Electron 창.
 * 로컬 정적 리소스(HTML, JS, CSS, 템플릿 등)를 앱 내부에 완전 내장하여 로컬 서버(127.0.0.1)로 구동.
 * 폰·태블릿 설치 파일 업데이트는 Firebase Storage (js/core/mobile-app-update.js).
 *
 * 실행: npm run electron
 * 설치 파일: npm run electron:dist
 */
const { app, BrowserWindow, dialog, shell, net, session, ipcMain } = require('electron');

const REMOTE_URL = 'https://dongil2010.github.io/building-safety-app/';

/** 배포된 웹 최신판에 닿는지 확인(오프라인이면 내장 파일로 실행). */
function remoteReachable(timeoutMs) {
    return new Promise(function (resolve) {
        let done = false;
        const finish = function (ok) { if (!done) { done = true; resolve(ok); } };
        try {
            const req = net.request({ url: REMOTE_URL + 'web-version.json?t=' + Date.now(), cache: 'no-store' });
            req.on('response', function (res) { finish(res.statusCode >= 200 && res.statusCode < 400); res.on('data', function () {}); });
            req.on('error', function () { finish(false); });
            req.end();
        } catch (_) { finish(false); }
        setTimeout(function () { finish(false); }, timeoutMs);
    });
}
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.hwpx': 'application/octet-stream',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8'
};

let localServer = null;
let quitConfirmed = false;

function startLocalServer(rootDir) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, 'http://127.0.0.1');
            let pathname = decodeURIComponent(parsedUrl.pathname);
            if (pathname === '/' || pathname === '') pathname = '/index.html';

            const filePath = path.normalize(path.join(rootDir, pathname));
            const normRoot = path.normalize(rootDir);
            if (!filePath.startsWith(normRoot)) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.statusCode = 404;
                    res.end('Not Found');
                    return;
                }
                const ext = path.extname(filePath).toLowerCase();
                res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.end(data);
            });
        });

        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            resolve({ server, port, url: `http://127.0.0.1:${port}/index.html` });
        });
        server.on('error', reject);
    });
}

function decodeTasklistOutput(out) {
    const buf = Buffer.isBuffer(out) ? out : Buffer.from(String(out), 'latin1');
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.toString('utf16le');
    let zeros = 0;
    const sample = Math.min(buf.length, 80);
    for (let i = 1; i < sample; i += 2) {
        if (buf[i] === 0) zeros += 1;
    }
    if (sample > 8 && zeros > sample / 4) return buf.toString('utf16le');
    return buf.toString('latin1');
}

/** 설치/제거 프로세스가 있으면 종료 질문을 띄우지 않고 바로 닫는다. */
function installerIsRunning() {
    if (process.platform !== 'win32') return false;
    try {
        const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
            windowsHide: true,
            timeout: 4000
        });
        const text = decodeTasklistOutput(out);
        return /Setup\s*\d+\.\d+/.test(text)
            || /old-uninstaller\.exe/i.test(text)
            || /Uninstall\s/.test(text);
    } catch (err) {
        return false;
    }
}

function createWindow(startUrl) {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: '스마트 안전점검',
        icon: path.join(__dirname, '..', 'branding', 'icon.png'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.on('close', function (event) {
        if (quitConfirmed) return;
        if (installerIsRunning()) {
            quitConfirmed = true;
            app.exit(0);
            return;
        }
        event.preventDefault();
        const choice = dialog.showMessageBoxSync(win, {
            type: 'warning',
            buttons: ['종료', '취소'],
            defaultId: 1,
            cancelId: 1,
            noLink: true,
            title: '스마트 안전점검',
            message: '프로그램을 종료할까요?',
            detail: '저장이 끝나지 않았으면 취소를 누르고 잠시 기다리세요.'
        });
        if (choice === 0) {
            quitConfirmed = true;
            win.close();
        }
    });

    win.webContents.on('did-fail-load', function (e, code, desc, url, isMainFrame) {
        if (!isMainFrame || startUrl !== REMOTE_URL || code === -3) return;
        startLocalServer(path.resolve(__dirname, '..')).then(function (res) {
            localServer = res.server;
            appStartUrl = res.url;
            win.loadURL(res.url);
        }).catch(function () {});
    });
    win.loadURL(startUrl);
    win.webContents.setWindowOpenHandler(function (details) {
        shell.openExternal(details.url);
        return { action: 'deny' };
    });
}

let appStartUrl = null;

/**
 * CAD 핀: 바탕화면 cad_defects_import.json 읽기(읽기 전용, 이 파일 이름만).
 * 바탕화면·OneDrive 바탕 화면 중 가장 최근에 저장된 것. 우리 앱 화면(배포 주소·내장 서버)에서 온 요청만.
 */
function cadImportCandidates() {
    const env = process.env;
    const home = env.USERPROFILE || require('os').homedir();
    const name = 'cad_defects_import.json';
    const ones = [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial, home && path.join(home, 'OneDrive')].filter(Boolean);
    const out = [];
    try { out.push(path.join(app.getPath('desktop'), name)); } catch (_) { /* ignore */ }
    // 2026-10-21 레지스트리 User Shell Folders「Desktop」(바탕화면을 옮긴 경우·OneDrive 백업)
    registryDesktopDirs().forEach(function (d) { out.push(path.join(d, name)); });
    if (home) out.push(path.join(home, 'Desktop', name), path.join(home, '바탕 화면', name));
    ones.forEach(function (od) { out.push(path.join(od, '바탕 화면', name), path.join(od, 'Desktop', name)); });
    return out.filter(function (p, i) { return out.indexOf(p) === i; });
}
function registryDesktopDirs() {
    if (process.platform !== 'win32') return [];
    const out = [];
    ['User Shell Folders', 'Shell Folders'].forEach(function (key) {
        try {
            const txt = require('child_process').execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\' + key, '/v', 'Desktop'],
                { encoding: 'utf8', windowsHide: true, timeout: 3000 });
            const m = /Desktop\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(txt);
            if (m) out.push(m[1].trim().replace(/%([^%]+)%/g, function (all, v) { return process.env[v] || all; }));
        } catch (_) { /* 없음 */ }
    });
    return out;
}
/** 우리 창의 맨 위 화면에서 온 요청만 — 배포 주소·내장 서버·실제로 연 주소(appStartUrl)의 출처 */
function trustedSender(event) {
    try {
        if (event.senderFrame && event.sender && event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame) return false;
        const u = new URL(event.senderFrame ? event.senderFrame.url : event.sender.getURL());
        const ok = [REMOTE_URL, appStartUrl].filter(Boolean).map(function (x) { try { return new URL(x).origin; } catch (_) { return null; } });
        if (ok.indexOf(u.origin) >= 0) return true;
        if (/^https:$/.test(u.protocol) && /(^|\.)github\.io$/i.test(u.hostname) && u.pathname.indexOf('/building-safety-app') === 0) return true;
        return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
    } catch (_) { return false; }
}
ipcMain.handle('bsa:read-cad-import-json', async function (event) {
    if (!trustedSender(event)) return { found: false, error: 'untrusted' };
    let best = null;
    for (const p of cadImportCandidates()) {
        try {
            const st = fs.statSync(p);
            if (!st.isFile() || st.size > 30 * 1024 * 1024) continue;
            if (!best || st.mtimeMs > best.mtime) best = { path: p, mtime: st.mtimeMs };
        } catch (_) { /* 없음 */ }
    }
    if (!best) return { found: false };
    return { found: true, path: best.path, mtime: best.mtime, text: fs.readFileSync(best.path, 'utf8') };
});

app.whenReady().then(async function () {
    let startUrl = process.env.BSA_START_URL;
    if (!startUrl && process.env.BSA_OFFLINE !== '1') {
        // 설치본 내장 파일은 설치 시점에 고정되므로, 온라인이면 배포된 최신 웹을 연다.
        try { await session.defaultSession.clearCache(); } catch (_) {}
        if (await remoteReachable(5000)) startUrl = REMOTE_URL;
    }
    if (!startUrl) {
        try {
            const rootDir = path.resolve(__dirname, '..');
            const res = await startLocalServer(rootDir);
            localServer = res.server;
            startUrl = res.url;
        } catch (err) {
            console.error('Failed to start local server, fallback to GitHub Pages:', err);
            startUrl = 'https://dongil2010.github.io/building-safety-app/';
        }
    }
    appStartUrl = startUrl;
    createWindow(appStartUrl);
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(appStartUrl);
    });
});

app.on('window-all-closed', function () {
    if (localServer) {
        try { localServer.close(); } catch (_) {}
    }
    if (process.platform !== 'darwin') app.quit();
});
