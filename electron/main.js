/**
 * PC용 스마트 안전점검 — Electron 창.
 * 화면은 현장 앱과 같은 주소(GitHub Pages)를 연다.
 * 폰·태블릿 설치 파일 업데이트는 Firebase Storage (js/core/mobile-app-update.js).
 *
 * 실행: npm run electron
 * 설치 파일: npm run electron:dist
 */
const { app, BrowserWindow, shell } = require('electron');

const START_URL = process.env.BSA_START_URL || 'https://dongil2010.github.io/building-safety-app/';

function createWindow() {
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

    win.loadURL(START_URL);
    win.webContents.setWindowOpenHandler(function (details) {
        shell.openExternal(details.url);
        return { action: 'deny' };
    });
}

app.whenReady().then(function () {
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
