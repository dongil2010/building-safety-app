/**
 * PC 앱 다리(읽기 전용) — 웹 화면이 바탕화면의 cad_defects_import.json 한 파일만 읽을 수 있게 한다(2026-10-20).
 * 다른 파일·쓰기는 열지 않는다.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bsaDesktop', {
    readCadImportJson: function () { return ipcRenderer.invoke('bsa:read-cad-import-json'); }
});
