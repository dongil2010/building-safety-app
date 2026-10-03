/**
 * PC용 스마트 안전점검 — Electron 창.
 * 로컬 정적 리소스(HTML, JS, CSS, 템플릿 등)를 앱 내부에 완전 내장하여 로컬 서버(127.0.0.1)로 구동.
 * 폰·태블릿 설치 파일 업데이트는 Firebase Storage (js/core/mobile-app-update.js).
 *
 * 실행: npm run electron
 * 설치 파일: npm run electron:dist
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
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
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
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

    win.loadURL(startUrl);
    win.webContents.setWindowOpenHandler(function (details) {
        shell.openExternal(details.url);
        return { action: 'deny' };
    });
}

let appStartUrl = null;

app.whenReady().then(async function () {
    let startUrl = process.env.BSA_START_URL;
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
