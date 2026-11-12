/**
 * 마킹 DXF 내보내기 (2026-11-12) — 브라우저 연결
 * 벡터 PDF 내보내기(js/pdf-vector-bridge.js)와 같은 핀·영역·범례 계획을 DXF 로 쓴다. 순수 변환은 js/core/dxf-write.js.
 * 좌표: DXF 로 올린 층 = 원래 캐드 좌표 / 일반 PDF 층 = 종이 mm / 그림만 있는 층 = 그림 픽셀(y 뒤집음)
 */
(function () {
  'use strict';

  function toast(msg, type, ms) {
    if (typeof window.showToast === 'function') window.showToast(msg, type, ms);
  }

  function safeName(s) {
    return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '_');
  }

  /** DXF 로 올릴 때 PDF 안에 적어 둔 변환값. 모듈이 없거나 못 읽으면 null */
  async function readDxfMeta(pdfDataUrl) {
    try {
      const api = window.BSA && window.BSA.dxfToPdf;
      if (!api || typeof api.readMetaFromPdfDataUrl !== 'function') return null;
      const meta = await api.readMetaFromPdfDataUrl(pdfDataUrl);
      if (!meta || !(Number(meta.s) > 0) || !isFinite(Number(meta.s))) return null;
      if (!isFinite(Number(meta.ox)) || !isFinite(Number(meta.oy))) return null;
      return meta;
    } catch (_e) {
      return null;
    }
  }

  /** PDF 첫 쪽의 화면 크기(점). 실패하면 null */
  async function readPdfPageSize(pdfDataUrl) {
    try {
      if (typeof PDFLib === 'undefined') return null;
      const bytes = window.dataUrlToUint8Array(pdfDataUrl);
      if (!bytes) return null;
      const doc = await PDFLib.PDFDocument.load(bytes);
      const page = doc.getPages()[0];
      const view = window.vectorPdfDisplayFrame(page);
      if (!(view.width > 0) || !(view.height > 0)) return null;
      return { w: view.width, h: view.height };
    } catch (e) {
      console.warn('[BSA_DXF] PDF 쪽 크기 읽기 실패', e);
      return null;
    }
  }

  /**
   * 한 층의 DXF 글자와 정보를 만든다.
   * @returns {Promise<{text:string, system:'cad'|'paper'|'pixel', count:number, floorCode:string}>}
   */
  window.buildFloorMarkingDxfInfo = async function (bldg, floorCode, buildingId) {
    if (!bldg || !floorCode) throw new Error('층 정보가 없습니다.');
    const api = window.BSA && window.BSA.dxfWrite;
    if (!api || typeof api.buildMarkingDxf !== 'function') {
      throw new Error('DXF 쓰기 모듈이 없습니다. Ctrl+F5로 새로고침 후 다시 시도하세요.');
    }
    const id = buildingId || bldg.id || (window.state && window.state.currentBuildingId) || '';
    const key = `${id}_${floorCode}`;
    // 전층 출력 때 다른 층 결함에도 층·건물 정보를 붙인 사본으로(핀 방향 계산이 지금 층 회전을 안 쓰게)
    const defects = ((window.state && window.state.defects && window.state.defects[key]) || []).map((d) => (
      d && (!d.floorCode || !d.buildingId) ? Object.assign({}, d, { floorCode: d.floorCode || floorCode, buildingId: d.buildingId || id }) : d
    ));

    let pdfDataUrl = null;
    try {
      pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode);
    } catch (e) {
      console.warn('[BSA_DXF] PDF 원본 확인 실패(그림 기준으로 진행)', e);
    }

    // 기준 그림 크기
    let imgW;
    let imgH;
    const stRef = window.state && window.state.floorPlanRef;
    if (stRef && stRef.bldgId === bldg.id && stRef.floorCode === floorCode && stRef.w > 0 && stRef.h > 0) {
      imgW = stRef.w;
      imgH = stRef.h;
    } else if (pdfDataUrl && typeof window.getPdfRefPixelSize === 'function') {
      const dim = window.FLOOR_DRAWING_PDF_PREVIEW_DIM || 4000;
      const size = await window.getPdfRefPixelSize(pdfDataUrl, dim, key);
      imgW = size.w;
      imgH = size.h;
    } else {
      const dims = window.getFloorPlanRefDimensions(bldg, floorCode);
      imgW = dims.w;
      imgH = dims.h;
    }
    imgW = Math.max(1, Number(imgW) || 1);
    imgH = Math.max(1, Number(imgH) || 1);

    const measureCtx = document.createElement('canvas').getContext('2d');
    const plans = window.buildVectorPinPlansForDefects(defects, measureCtx);
    const legendPlan = (typeof window.buildVectorLegendDrawPlan === 'function')
      ? window.buildVectorLegendDrawPlan(measureCtx, imgW, imgH, floorCode)
      : null;

    // 좌표 변환 정하기
    let system = 'pixel';
    let toWorld = (ix, iy) => ({ x: ix, y: imgH - iy });
    let unitPerPx = 1;
    let refSegments = null;

    const size = pdfDataUrl ? await readPdfPageSize(pdfDataUrl) : null;
    if (size) {
      const meta = await readDxfMeta(pdfDataUrl);
      const sxPt = size.w / imgW;
      const syPt = size.h / imgH;
      if (meta) {
        const s = Number(meta.s);
        const ox = Number(meta.ox);
        const oy = Number(meta.oy);
        system = 'cad';
        toWorld = (ix, iy) => ({ x: (ix * sxPt) / s + ox, y: (size.h - iy * syPt) / s + oy });
        unitPerPx = ((sxPt + syPt) / 2) / s;
      } else {
        const mm = 25.4 / 72;
        system = 'paper';
        toWorld = (ix, iy) => ({ x: ix * sxPt * mm, y: (size.h - iy * syPt) * mm });
        unitPerPx = ((sxPt + syPt) / 2) * mm;
        // 일반 PDF 층: 원본 도면 선을 참고선으로(있을 때만) — 캐드에서 맞추기 쉽게
        refSegments = await collectRefSegments(pdfDataUrl, id, floorCode, imgW, imgH, plans.length > 0);
      }
    }

    const text = api.buildMarkingDxf({ plans, legendPlan, refSegments: refSegments || [], toWorld, unitPerPx });
    return { text, system, count: plans.length, floorCode: String(floorCode) };
  };

  /** 스냅용 선분(수직·수평) → 그림 픽셀 좌표 선분. 못 읽으면 빈 배열 */
  async function collectRefSegments(pdfDataUrl, bldgId, floorCode, imgW, imgH, wanted) {
    if (!wanted) return [];
    try {
      const snap = window.BSA_PDF_SNAP;
      if (!snap || typeof snap.ensureGeometry !== 'function' || typeof snap.getDetectionData !== 'function') return [];
      await snap.ensureGeometry(pdfDataUrl, bldgId, floorCode, window.FLOOR_DRAWING_PDF_PREVIEW_DIM || 4000);
      const data = snap.getDetectionData(bldgId, floorCode);
      if (!data || !Array.isArray(data.segments) || !data.segments.length || !(data.w > 0) || !(data.h > 0)) return [];
      const fx = imgW / data.w;
      const fy = imgH / data.h;
      const out = [];
      const max = 40000;
      for (let i = 0; i < data.segments.length && out.length < max; i++) {
        const s = data.segments[i];
        if (!s) continue;
        out.push({ x1: s[0] * fx, y1: s[1] * fy, x2: s[2] * fx, y2: s[3] * fy });
      }
      return out;
    } catch (e) {
      console.warn('[BSA_DXF] 참고선 만들기 건너뜀', e);
      return [];
    }
  }

  /** 한 층 DXF 글자 */
  window.buildFloorMarkingDxfText = async function (bldg, floorCode, buildingId) {
    const info = await window.buildFloorMarkingDxfInfo(bldg, floorCode, buildingId);
    return info.text;
  };

  function systemLabel(system) {
    if (system === 'cad') return '원래 캐드 좌표';
    if (system === 'paper') return '종이 mm';
    return '그림 픽셀';
  }

  function makeDxfBlob(text) {
    return new Blob([text], { type: 'application/dxf' });
  }

  window.exportCurrentFloorMarkingDxf = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const bldg = state.currentBuilding;
    const floorCode = state.currentFloor;
    if (typeof window.showLoading === 'function') window.showLoading('마킹 DXF 만드는 중...');
    try {
      const info = await window.buildFloorMarkingDxfInfo(bldg, floorCode, state.currentBuildingId);
      if (!info.count) {
        toast('이 층에는 내보낼 마킹이 없습니다.', 'warning', 5000);
        return;
      }
      window.downloadBlobFile(makeDxfBlob(info.text), `결함위치도_마킹_${safeName(floorCode || 'floor')}_${Date.now()}.dxf`);
      toast(`마킹 DXF 내보내기 완료 (좌표: ${systemLabel(info.system)})`, 'success', 5000);
    } catch (err) {
      console.error(err);
      toast(`마킹 DXF 내보내기 실패: ${err.message || err}`, 'error', 6000);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  /** 각 층 DXF 를 한 zip 으로 */
  async function exportAllFloorsMarkingDxf() {
    const state = window.state;
    const bldg = state.currentBuilding;
    const floorCodes = typeof window.listFloorsForVectorPdfExport === 'function'
      ? window.listFloorsForVectorPdfExport(bldg)
      : [];
    if (!floorCodes.length) {
      toast('내보낼 층이 없습니다.', 'warning');
      return;
    }
    if (typeof JSZip === 'undefined') {
      toast('zip 도구가 없어 현재 층만 내보냅니다.', 'warning');
      return window.exportCurrentFloorMarkingDxf();
    }
    const zip = new JSZip();
    let ok = 0;
    const skipped = [];
    const systems = new Set();
    const stamp = Date.now();
    if (typeof window.showLoading === 'function') window.showLoading(`전층 마킹 DXF 준비 중 (0/${floorCodes.length})...`);
    try {
      for (let i = 0; i < floorCodes.length; i++) {
        const floorCode = floorCodes[i];
        if (typeof window.showLoading === 'function') window.showLoading(`전층 마킹 DXF (${i + 1}/${floorCodes.length}) ${floorCode}...`);
        try {
          const info = await window.buildFloorMarkingDxfInfo(bldg, floorCode, state.currentBuildingId);
          if (!info.count) { skipped.push(floorCode); continue; }
          zip.file(`결함위치도_마킹_${safeName(floorCode)}.dxf`, info.text);
          systems.add(info.system);
          ok += 1;
        } catch (e) {
          console.warn('[exportAllFloorsMarkingDxf] skip', floorCode, e);
          skipped.push(floorCode);
        }
      }
      if (!ok) {
        toast('마킹이 있는 층이 없어 DXF를 만들지 못했습니다.', 'warning', 6000);
        return;
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const bldgName = safeName((bldg && (bldg.name || bldg.buildingName)) || state.currentBuildingId || 'building');
      window.downloadBlobFile(blob, `결함위치도_마킹_전층_${bldgName}_${stamp}.zip`);
      const sys = Array.from(systems).map(systemLabel).join('·');
      const skipMsg = skipped.length ? ` (마킹 없는 ${skipped.length}층 제외)` : '';
      toast(`전층 마킹 DXF 완료 — ${ok}층 zip 묶음, 좌표: ${sys}${skipMsg}`, 'success', 6000);
    } catch (err) {
      console.error(err);
      toast(`전층 마킹 DXF 실패: ${err.message || err}`, 'error', 6000);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  }
  window.exportAllFloorsMarkingDxf = exportAllFloorsMarkingDxf;

  /** 마킹 DXF: 현재 층 / 전층 zip 선택 */
  window.exportMarkingDxfWithScopeChoice = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const floors = typeof window.listFloorsForVectorPdfExport === 'function'
      ? window.listFloorsForVectorPdfExport(state.currentBuilding)
      : [];
    if (floors.length <= 1 || typeof JSZip === 'undefined') {
      return window.exportCurrentFloorMarkingDxf();
    }
    if (typeof window.appChoose === 'function') {
      const k = await window.appChoose('마킹 DXF 범위를 고르세요.', [
        { label: '현재 층만', detail: String(state.currentFloor || '-') },
        { label: '각 층 전부 (층마다 DXF, zip 묶음)', detail: floors.length + '층' }
      ], { title: '마킹 DXF', okText: '내보내기', defaultIndex: 0 });
      if (k === null || k === undefined) return;
      return k === 1 ? exportAllFloorsMarkingDxf() : window.exportCurrentFloorMarkingDxf();
    }
    const choice = window.prompt(
      '마킹 DXF 범위 선택\n\n1 = 현재 층만 (' + (state.currentFloor || '-') + ')\n2 = 각 층 전부 zip (' + floors.length + '층)\n\n숫자 입력 후 확인',
      '1'
    );
    if (choice === null) return;
    const v = String(choice).trim();
    if (v === '2' || v === '전층' || v.toLowerCase() === 'all') return exportAllFloorsMarkingDxf();
    return window.exportCurrentFloorMarkingDxf();
  };
})();
