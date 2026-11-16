/**
 * DXF 화면 벡터 읽기 작업 스레드(2026-11-16)
 * PDF(base64) 풀기 → 표시된 스트림 압축 풀기 → 선 자료 만들기를 다른 코어에서 한다(큰 도면에서 화면이 멈칫하던 것).
 * 계산은 dxf-to-pdf.js · dxf-view.js 함수를 그대로 쓴다. 실패하면 화면 쪽(dxf-view.js ensureModel)이 예전 길로 다시 한다.
 */
/* eslint-env worker */
'use strict';
var ready = null;

self.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.type === 'init') {
        try { importScripts(m.urls.toPdf, m.urls.view); ready = true; } catch (e) { ready = e || new Error('init 실패'); }
        return;
    }
    if (m.type !== 'model') return;
    (async function () {
        try {
            if (ready !== true) throw (ready instanceof Error ? ready : new Error('작업 스레드 준비 안 됨'));
            var model = await self.BSA.dxfView.modelFromDataUrl(m.pdfDataUrl);
            if (!model) { self.postMessage({ id: m.id, ok: true, model: null }); return; }
            // 넉넉히 잡아 둔 버퍼의 앞부분만 쓰고 있으므로 딱 맞게 잘라서(복사 1번) 버퍼째 넘긴다
            var transfer = [];
            ['coords', 'start', 'count', 'flags', 'width', 'group', 'bbox'].forEach(function (k) {
                if (model[k] && model[k].buffer) { model[k] = model[k].slice(); transfer.push(model[k].buffer); }
            });
            self.postMessage({ id: m.id, ok: true, model: model }, transfer);
        } catch (e) {
            self.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) });
        }
    })();
};
