/**
 * PC용 스마트 안전점검 — Electron 창.
 * 화면은 현장 앱과 같은 주소(GitHub Pages)를 연다.
 * 폰·태블릿 설치 파일 업데이트는 Firebase Storage (js/core/mobile-app-update.js).
 *
 * 실행: npm run electron
 * 설치 파일: npm run electron:dist
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
const { execFileSync } = require('child_process');

const START_URL = process.env.BSA_START_URL || 'https://dongil2010.github.io/building-safety-app/';
let quitConfirmed = false;

/** 설치 파일이 돌고 있으면 종료 질문을 띄우지 않고 바로 닫는다. */
function installerIsRunning() {
    if (process.platform !== 'win32') return false;
    try {
        const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
            windowsHide: true,
            timeout: 4000
        });
        const text = Buffer.isBuffer(out) ? out.toString('latin1') : String(out);
        return /Setup \d+\.\d+/.test(text);
    } catch (err) {
        return false;
    }
}

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

    win.on('close', function (event) {
        if (quitConfirmed) return;
        if (installerIsRunning()) {
            quitConfirmed = true;
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
