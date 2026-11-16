/**
 * CAD 스냅 선 추출 작업 스레드(2026-11-16)
 * 큰 도면은 PDF 안의 선 수십만 개를 읽고 합치는 데 화면이 멈칫했다 — 그 계산을 다른 코어에서 한다.
 * 계산은 js/pdf-vector-snap.js의 함수를 그대로 쓴다(여기는 불러와서 돌리고 결과만 넘긴다).
 * 화면 쪽(pdf-vector-snap.js computeInWorker)이 주소를 넘겨 준다. 실패하면 화면 쪽이 예전 길로 다시 한다.
 */
/* eslint-env worker */
'use strict';
self.window = self; // 불러오는 파일들이 window.* 로 내보낸다

var ready = null;

function init(urls) {
    // pdf.worker를 같은 스레드에 올려 두면 pdf.js가 스레드를 또 만들지 않고 여기서 바로 읽는다
    importScripts(urls.pdfjs, urls.pdfWorker, urls.gridDetect, urls.snap);
    self.acquirePdfPageFromDataUrl = async function (pdfDataUrl) {
        var b64 = String(pdfDataUrl || '').split(',')[1];
        if (!b64) throw new Error('PDF dataURL 변환 실패');
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var pdf = await self.pdfjsLib.getDocument({ data: bytes, verbosity: 0 }).promise;
        var page = await pdf.getPage(1);
        return { pdf: pdf, page: page, baseViewport: page.getViewport({ scale: 1 }) };
    };
}

self.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.type === 'init') {
        try { init(m.urls); ready = true; } catch (e) { ready = e || new Error('init 실패'); }
        return;
    }
    if (m.type !== 'compute') return;
    (async function () {
        var pdfRef = null;
        try {
            if (ready !== true) throw (ready instanceof Error ? ready : new Error('작업 스레드 준비 안 됨'));
            var S = self.BSA_PDF_SNAP;
            var orig = self.acquirePdfPageFromDataUrl;
            self.acquirePdfPageFromDataUrl = async function (u, k) { var r = await orig(u, k); pdfRef = r.pdf; return r; };
            var geo;
            try { geo = await S._computeGeometry(m.pdfDataUrl, m.key, m.refDim); }
            finally { self.acquirePdfPageFromDataUrl = orig; }
            var packed = S._packGeometry(geo);
            var transfer = [packed.segments.buffer];
            if (packed.detect) transfer.push(packed.detect.segments.buffer, packed.detect.small.buffer);
            self.postMessage({ id: m.id, ok: true, data: packed }, transfer);
        } catch (e) {
            self.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) });
        } finally {
            try { if (pdfRef) pdfRef.destroy(); } catch (_e) { /* ignore */ }
        }
    })();
};
