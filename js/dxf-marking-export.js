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

  /**
   * 파일 이름용 층 이름 — 층 고르기 목록에 보이는 이름(floorLabel). 끝의 「(1F)」 같은 코드 꼬리는 뗀다.
   * 층 코드가 도면 파일 이름인 현장도 있어서(예: 「…결함위치도_006」) 코드를 그대로 쓰지 않는다.
   */
  function floorFileName(bldg, floorCode) {
    let label = '';
    const fi = window.BSA && window.BSA.floorIdentity;
    if (fi && typeof fi.lookupFloorLabel === 'function') {
      label = fi.lookupFloorLabel(floorCode, bldg);
    } else {
      const f = bldg && (bldg.floorsList || []).find((x) => x && String(x.floorCode) === String(floorCode));
      label = (f && f.floorLabel) || '';
    }
    label = String(label || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || String(floorCode || 'floor');
    return safeName(label).trim() || 'floor';
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
    let drawing = null;

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
        // DXF로 올린 층: 원본 도면 선·글자도 같이 넣는다(BSA_DRAWING 레이어) — 파일 하나로 열어도 도면이 보이게
        try {
          const view = window.BSA && window.BSA.dxfView;
          const model = (view && typeof view.ensureModel === 'function') ? await view.ensureModel(key, pdfDataUrl) : null;
          if (model) drawing = { model, toWorld: (px, py) => ({ x: px / s + ox, y: py / s + oy }), unitPerPt: 1 / s };
        } catch (e) {
          console.warn('[BSA_DXF] 원본 도면 넣기 건너뜀(마킹만 내보냄)', e);
        }
      } else {
        const mm = 25.4 / 72;
        system = 'paper';
        toWorld = (ix, iy) => ({ x: ix * sxPt * mm, y: (size.h - iy * syPt) * mm });
        unitPerPx = ((sxPt + syPt) / 2) * mm;
        // 일반 PDF 층: 원본 도면 선을 참고선으로(있을 때만) — 캐드에서 맞추기 쉽게
        refSegments = await collectRefSegments(pdfDataUrl, id, floorCode, imgW, imgH, plans.length > 0);
      }
    }

    const text = api.buildMarkingDxf({ plans, legendPlan, refSegments: refSegments || [], toWorld, unitPerPx, drawing });
    return { text, system, count: plans.length, floorCode: String(floorCode), withDrawing: !!drawing };
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

  // ---- 2026-11-19 「SVG 파일로 도면 출력」 (js/core/svg-write.js) ----
  // 좌표 = 그림 픽셀. DXF 로 올린 층 = 원본 도면 선·글자까지 벡터 / PDF 로 올린 층 = PDF 쪽을 선명한 그림으로 / 그림 층 = 그 그림.
  // 마킹(박스·지시선·영역·범례)은 어느 층이든 벡터.

  /** 마킹 좌표의 기준 그림 크기(DXF 출력과 같은 규칙) */
  async function floorRefImageSize(bldg, floorCode, key, pdfDataUrl) {
    let w;
    let h;
    const stRef = window.state && window.state.floorPlanRef;
    if (stRef && stRef.bldgId === bldg.id && stRef.floorCode === floorCode && stRef.w > 0 && stRef.h > 0) {
      w = stRef.w;
      h = stRef.h;
    } else if (pdfDataUrl && typeof window.getPdfRefPixelSize === 'function') {
      const dim = window.FLOOR_DRAWING_PDF_PREVIEW_DIM || 4000;
      const size = await window.getPdfRefPixelSize(pdfDataUrl, dim, key);
      w = size.w;
      h = size.h;
    } else {
      const dims = window.getFloorPlanRefDimensions(bldg, floorCode);
      w = dims.w;
      h = dims.h;
    }
    return { w: Math.max(1, Number(w) || 1), h: Math.max(1, Number(h) || 1) };
  }

  /** PDF 첫 쪽 → JPEG data URL (긴 변 longPx). pdf.js 가 없거나 실패하면 null */
  async function renderPdfPageDataUrl(pdfDataUrl, longPx) {
    if (typeof pdfjsLib === 'undefined') return null;
    let pdf = null;
    try {
      const bytes = window.dataUrlToUint8Array(pdfDataUrl);
      if (!bytes) return null;
      pdf = await pdfjsLib.getDocument({ data: bytes, verbosity: 0 }).promise;
      const page = await pdf.getPage(1);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = longPx / Math.max(vp1.width, vp1.height);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const url = c.toDataURL('image/jpeg', 0.9);
      c.width = 1;
      c.height = 1;
      return url;
    } catch (e) {
      console.warn('[BSA_SVG] PDF 그림 만들기 실패', e);
      return null;
    } finally {
      try { if (pdf) pdf.destroy(); } catch (_e) { /* ignore */ }
    }
  }

  /** 도면 그림(img) → JPEG data URL. 못 읽으면 null */
  function imageToDataUrl(img) {
    try {
      if (!img) return null;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!(w > 0) || !(h > 0)) return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.92);
    } catch (e) {
      console.warn('[BSA_SVG] 화면 도면 그림 읽기 실패', e);
      return null;
    }
  }

  /** 지금 화면의 도면 그림(그림만 있는 층) → data URL. 다른 층이거나 못 읽으면 null */
  function currentBgImageDataUrl(bldg, floorCode) {
    const st = window.state;
    if (!st || !st.bgImage || st.currentFloor !== floorCode || (st.currentBuilding && bldg && st.currentBuilding.id !== bldg.id)) return null;
    return imageToDataUrl(st.bgImage);
  }

  /**
   * 한 층 SVG 글자와 정보.
   * opts(한글 위치도용, 선택): { size:{w,h}(마킹 좌표의 그림 크기), page(svg-write page), legendPlan(null = 범례 없음), backgroundImage(그림 층 바탕) }
   * @returns {Promise<{text:string, count:number, floorCode:string, background:'vector'|'pdf-image'|'image'|'none'}>}
   */
  window.buildFloorMarkingSvgInfo = async function (bldg, floorCode, buildingId, opts) {
    opts = opts || {};
    if (!bldg || !floorCode) throw new Error('층 정보가 없습니다.');
    const api = window.BSA && window.BSA.svgWrite;
    if (!api || typeof api.buildMarkingSvg !== 'function') {
      throw new Error('SVG 쓰기 모듈이 없습니다. Ctrl+F5로 새로고침 후 다시 시도하세요.');
    }
    const id = buildingId || bldg.id || (window.state && window.state.currentBuildingId) || '';
    const key = `${id}_${floorCode}`;
    const defects = ((window.state && window.state.defects && window.state.defects[key]) || []).map((d) => (
      d && (!d.floorCode || !d.buildingId) ? Object.assign({}, d, { floorCode: d.floorCode || floorCode, buildingId: d.buildingId || id }) : d
    ));
    let pdfDataUrl = null;
    try {
      pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode);
    } catch (e) {
      console.warn('[BSA_SVG] PDF 원본 확인 실패(그림 기준으로 진행)', e);
    }
    const size = (opts.size && opts.size.w > 0 && opts.size.h > 0)
      ? { w: Number(opts.size.w), h: Number(opts.size.h) }
      : await floorRefImageSize(bldg, floorCode, key, pdfDataUrl);
    const measureCtx = document.createElement('canvas').getContext('2d');
    const plans = window.buildVectorPinPlansForDefects(defects, measureCtx);
    const legendPlan = opts.legendPlan !== undefined
      ? opts.legendPlan
      : ((typeof window.buildVectorLegendDrawPlan === 'function')
        ? window.buildVectorLegendDrawPlan(measureCtx, size.w, size.h, floorCode)
        : null);

    let drawing = null;
    let background = null;
    let kind = 'none';
    if (pdfDataUrl) {
      const meta = await readDxfMeta(pdfDataUrl);
      if (meta) {
        try {
          const view = window.BSA && window.BSA.dxfView;
          const model = (view && typeof view.ensureModel === 'function') ? await view.ensureModel(key, pdfDataUrl) : null;
          if (model) { drawing = { model }; kind = 'vector'; }
        } catch (e) {
          console.warn('[BSA_SVG] 원본 도면 벡터 읽기 실패(그림으로 넣음)', e);
        }
      }
      if (!drawing) {
        // 기준 그림의 1.5배(최대 긴 변 8000) — 확대해도 읽을 만하게
        const longPx = Math.min(8000, Math.max(3000, Math.round(Math.max(size.w, size.h) * 1.5)));
        const href = await renderPdfPageDataUrl(pdfDataUrl, longPx);
        if (href) { background = { href, x: 0, y: 0, w: size.w, h: size.h }; kind = 'pdf-image'; }
      }
    }
    if (!drawing && !background) {
      const href = (opts.backgroundImage && imageToDataUrl(opts.backgroundImage)) || currentBgImageDataUrl(bldg, floorCode);
      if (href) { background = { href, x: 0, y: 0, w: size.w, h: size.h }; kind = 'image'; }
    }
    const text = api.buildMarkingSvg({
      width: size.w,
      height: size.h,
      plans,
      legendPlan,
      drawing,
      background,
      page: opts.page || null,
      title: `${floorFileName(bldg, floorCode)} 결함위치도`
    });
    return { text, count: plans.length, floorCode: String(floorCode), background: kind };
  };

  function makeSvgBlob(text) {
    return new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
  }

  function svgBackgroundLabel(kind) {
    if (kind === 'vector') return '도면까지 벡터';
    if (kind === 'pdf-image') return '도면은 그림(PDF 층), 마킹은 벡터';
    if (kind === 'image') return '도면은 그림, 마킹은 벡터';
    return '도면 없이 마킹만';
  }

  window.exportCurrentFloorMarkingSvg = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const bldg = state.currentBuilding;
    const floorCode = state.currentFloor;
    if (typeof window.showLoading === 'function') window.showLoading('SVG 만드는 중...');
    try {
      const info = await window.buildFloorMarkingSvgInfo(bldg, floorCode, state.currentBuildingId);
      if (!info.count && info.background === 'none') {
        toast('이 층에는 도면도 마킹도 없어 SVG를 만들지 않았습니다.', 'warning', 5000);
        return;
      }
      window.downloadBlobFile(makeSvgBlob(info.text), `${floorFileName(bldg, floorCode)}.svg`);
      toast(`SVG 출력 완료 — 마킹 ${info.count}개 (${svgBackgroundLabel(info.background)})`, 'success', 6000);
    } catch (err) {
      console.error(err);
      toast(`SVG 출력 실패: ${err.message || err}`, 'error', 6000);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  /** 각 층 SVG → zip (층마다 파일 하나). 도면도 마킹도 없는 층은 건너뜀 */
  async function exportAllFloorsMarkingSvg() {
    const state = window.state;
    const bldg = state.currentBuilding;
    const id = state.currentBuildingId;
    const floorCodes = typeof window.listFloorsForVectorPdfExport === 'function'
      ? window.listFloorsForVectorPdfExport(bldg)
      : [];
    if (!floorCodes.length) {
      toast('내보낼 층이 없습니다.', 'warning');
      return;
    }
    if (typeof JSZip === 'undefined') {
      toast('zip 도구가 없어 현재 층만 내보냅니다.', 'warning');
      return window.exportCurrentFloorMarkingSvg();
    }
    const zip = new JSZip();
    const used = new Set();
    const skipped = [];
    let ok = 0;
    try {
      for (let i = 0; i < floorCodes.length; i++) {
        const fc = floorCodes[i];
        if (typeof window.showLoading === 'function') window.showLoading(`전층 SVG (${i + 1}/${floorCodes.length}) ${floorFileName(bldg, fc)}...`);
        try {
          const info = await window.buildFloorMarkingSvgInfo(bldg, fc, id);
          if (!info.count && info.background === 'none') { skipped.push(fc); continue; }
          const base = floorFileName(bldg, fc);
          let name = base;
          for (let n = 2; used.has(`${name}.svg`.toLowerCase()); n++) name = `${base} (${n})`;
          used.add(`${name}.svg`.toLowerCase());
          zip.file(`${name}.svg`, info.text);
          ok += 1;
        } catch (e) {
          console.warn('[exportAllFloorsMarkingSvg] skip', fc, e);
          skipped.push(fc);
        }
      }
      if (!ok) {
        toast('SVG로 만들 층이 없습니다(도면·마킹 없음).', 'warning', 6000);
        return;
      }
      if (typeof window.showLoading === 'function') window.showLoading('zip 묶는 중...');
      const blob = await zip.generateAsync({ type: 'blob' });
      const bldgName = safeName((bldg && (bldg.name || bldg.buildingName)) || id || 'building');
      window.downloadBlobFile(blob, `결함위치도_SVG_전층_${bldgName}_${Date.now()}.zip`);
      toast(`전층 SVG 완료 — ${ok}층 zip 묶음${skipped.length ? ` (제외 ${skipped.length}층: 도면·마킹 없음 등)` : ''}`, 'success', 6000);
    } catch (err) {
      console.error(err);
      toast(`전층 SVG 실패: ${err.message || err}`, 'error', 6000);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  }
  window.exportAllFloorsMarkingSvg = exportAllFloorsMarkingSvg;

  /** 「SVG 출력」 버튼: 현재 층 / 각 층 전부(zip) */
  window.exportMarkingSvgWithScopeChoice = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const floors = typeof window.listFloorsForVectorPdfExport === 'function'
      ? window.listFloorsForVectorPdfExport(state.currentBuilding)
      : [];
    if (floors.length <= 1 || typeof JSZip === 'undefined' || typeof window.appChoose !== 'function') {
      return window.exportCurrentFloorMarkingSvg();
    }
    const k = await window.appChoose('결함위치도를 SVG(벡터 그림)로 내보냅니다.\nDXF로 올린 층은 도면까지 벡터, PDF·그림으로 올린 층은 도면을 그림으로 넣고 마킹만 벡터입니다.', [
      { label: '현재 층만', detail: state.currentFloor ? floorFileName(state.currentBuilding, state.currentFloor) + '.svg' : '-' },
      { label: '각 층 전부 (층마다 SVG, zip 묶음)', detail: floors.length + '층' }
    ], { title: 'SVG 출력', okText: '내보내기', defaultIndex: 0 });
    if (k === null || k === undefined) return;
    return k === 1 ? exportAllFloorsMarkingSvg() : window.exportCurrentFloorMarkingSvg();
  };

  /** DXF 로 올린 층의 원본 도면 모델(js/core/dxf-view.js). DXF 층이 아니거나 못 읽으면 null — 비파괴 SVG·DXF 가 쓴다 */
  window.getFloorDxfDrawingModel = async function (bldg, floorCode, buildingId) {
    const id = buildingId || (bldg && bldg.id) || '';
    let pdfDataUrl = null;
    try { pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode); } catch (_e) { return null; }
    if (!pdfDataUrl || !(await readDxfMeta(pdfDataUrl))) return null;
    const view = window.BSA && window.BSA.dxfView;
    if (!view || typeof view.ensureModel !== 'function') return null;
    try { return await view.ensureModel(`${id}_${floorCode}`, pdfDataUrl); } catch (_e) { return null; }
  };

  // ---- 2026-11-19 「비파괴도 dxf 출력」 ----
  // 비파괴 탭 화면 그리기(drawNdtPin·변위 묶음 …)를 벡터 기록 캔버스(js/core/vector-canvas.js)로 돌려 BSA_NDT 레이어에 쓴다.
  // 좌표는 결함 마킹 DXF 와 같은 규칙: DXF 층 = 원래 캐드 좌표(원본 도면 포함) / PDF 층 = 종이 mm / 그림 층·비파괴 전용 도면 = 그림 픽셀.
  window.buildFloorNdtDxfInfo = async function (bldg, floorCode, buildingId) {
    const api = window.BSA && window.BSA.dxfWrite;
    if (!api || typeof api.buildMarkingDxf !== 'function' || typeof window.recordNdtFloorMap !== 'function') {
      throw new Error('DXF 모듈이 없습니다. Ctrl+F5로 새로고침 후 다시 시도하세요.');
    }
    const id = buildingId || bldg.id || '';
    const rec = await window.recordNdtFloorMap(floorCode, null, 'image');
    if (!rec) return { text: '', count: 0, system: 'pixel', floorCode: String(floorCode) };
    const imgW = rec.imgW;
    const imgH = rec.imgH;
    let system = 'pixel';
    let toWorld = (ix, iy) => ({ x: ix, y: imgH - iy });
    let unitPerPx = 1;
    let drawing = null;
    // 비파괴 전용 도면(따로 올린 그림)은 층 도면과 좌표가 달라 그림 픽셀 그대로
    let pdfDataUrl = null;
    if (!rec.custom) {
      try { pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode); } catch (_e) { pdfDataUrl = null; }
    }
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
        if (rec.model) drawing = { model: rec.model, toWorld: (px, py) => ({ x: px / s + ox, y: py / s + oy }), unitPerPt: 1 / s };
      } else {
        const mm = 25.4 / 72;
        system = 'paper';
        toWorld = (ix, iy) => ({ x: ix * sxPt * mm, y: (size.h - iy * syPt) * mm });
        unitPerPx = ((sxPt + syPt) / 2) * mm;
      }
    }
    const text = api.buildMarkingDxf({ plans: [], legendPlan: null, vectorOps: rec.ops, toWorld, unitPerPx, drawing });
    return { text, count: rec.count, system, floorCode: String(floorCode), withDrawing: !!drawing };
  };

  window.exportCurrentFloorNdtDxf = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const bldg = state.currentBuilding;
    const floorCode = state.currentFloor;
    if (typeof window.showLoading === 'function') window.showLoading('비파괴 DXF 만드는 중...');
    try {
      const info = await window.buildFloorNdtDxfInfo(bldg, floorCode, state.currentBuildingId);
      if (!info.count) {
        toast('이 층에는 내보낼 비파괴 마킹이 없습니다(또는 도면을 못 읽음).', 'warning', 5000);
        return;
      }
      window.downloadBlobFile(makeDxfBlob(info.text), `${floorFileName(bldg, floorCode)}_비파괴.dxf`);
      toast(`비파괴 DXF 내보내기 완료 — 마킹 ${info.count}개 (좌표: ${systemLabel(info.system)}${info.withDrawing ? ', 원본 도면 포함' : ''})`, 'success', 6000);
    } catch (err) {
      console.error(err);
      toast(`비파괴 DXF 내보내기 실패: ${err.message || err}`, 'error', 6000);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

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
      window.downloadBlobFile(makeDxfBlob(info.text), `${floorFileName(bldg, floorCode)}.dxf`);
      toast(`마킹 DXF 내보내기 완료 (좌표: ${systemLabel(info.system)}${info.withDrawing ? ', 원본 도면 포함' : ', 마킹만 — 캐드에서 원본 도면에 겹쳐 쓰세요'})`, 'success', 6000);
    } catch (err) {
      console.error(err);
      toast(`마킹 DXF 내보내기 실패: ${err.message || err}`, 'error', 6000);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  /**
   * 여러 층 마킹 DXF 를 zip 에 넣는다(층마다 파일 하나). 마킹 없는 층은 건너뜀.
   * usedNames: zip 안 파일 이름 겹침 막기(소문자로 담음)
   * @returns {Promise<{ok:number, skipped:string[], systems:Set<string>}>}
   */
  async function addFloorsMarkingDxfToZip(zip, bldg, floorCodes, buildingId, loadingLabel, usedNames) {
    let ok = 0;
    const skipped = [];
    const systems = new Set();
    for (let i = 0; i < floorCodes.length; i++) {
      const floorCode = floorCodes[i];
      if (typeof window.showLoading === 'function') window.showLoading(`${loadingLabel} (${i + 1}/${floorCodes.length}) ${floorCode}...`);
      try {
        const info = await window.buildFloorMarkingDxfInfo(bldg, floorCode, buildingId);
        if (!info.count) { skipped.push(floorCode); continue; }
        const base = floorFileName(bldg, floorCode);
        let name = base;
        for (let n = 2; usedNames.has(`${name}.dxf`.toLowerCase()); n++) name = `${base} (${n})`;
        usedNames.add(`${name}.dxf`.toLowerCase());
        zip.file(`${name}.dxf`, info.text);
        systems.add(info.system);
        ok += 1;
      } catch (e) {
        console.warn('[addFloorsMarkingDxfToZip] skip', floorCode, e);
        skipped.push(floorCode);
      }
    }
    return { ok, skipped, systems };
  }

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
    const stamp = Date.now();
    if (typeof window.showLoading === 'function') window.showLoading(`전층 마킹 DXF 준비 중 (0/${floorCodes.length})...`);
    try {
      const res = await addFloorsMarkingDxfToZip(zip, bldg, floorCodes, state.currentBuildingId, '전층 마킹 DXF', new Set());
      const ok = res.ok;
      const skipped = res.skipped;
      const systems = res.systems;
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
        { label: '현재 층만', detail: state.currentFloor ? floorFileName(state.currentBuilding, state.currentFloor) + '.dxf' : '-' },
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

  // ---- 2026-11-17 「DXF·PDF 출력」 — 벡터 PDF 와 마킹 DXF 를 버튼 하나로 ----
  // DXF 로 올린 층 = 마킹 DXF(원래 캐드 좌표·원본 도면 포함) / PDF 로 올린 층 = 벡터 PDF
  // 도면 원본이 없는 층(그림만·못 받음)은 전층에서 빼고, 현재 층이면 벡터 PDF 쪽 안내(원본 못 받음)를 그대로 보여 준다.

  /** 층 도면을 무엇으로 올렸나: 'dxf' | 'pdf' | 'none' (DXF 는 올릴 때 PDF 로 바뀌며 안에 캐드 변환값을 적어 둔다) */
  window.detectFloorDrawingKind = async function (bldg, floorCode) {
    let pdfDataUrl = null;
    try {
      pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode);
    } catch (e) {
      console.warn('[BSA_EXPORT] 도면 원본 확인 실패', floorCode, e);
    }
    if (!pdfDataUrl) return 'none';
    return (await readDxfMeta(pdfDataUrl)) ? 'dxf' : 'pdf';
  };

  /** (순수) [{floorCode, kind}] → { dxf: [...], pdf: [...], none: [...] } — 층 순서 유지 */
  function splitFloorsByDrawingKind(list) {
    const out = { dxf: [], pdf: [], none: [] };
    (list || []).forEach((it) => {
      if (!it || it.floorCode == null || it.floorCode === '') return;
      const k = it.kind === 'dxf' || it.kind === 'pdf' ? it.kind : 'none';
      out[k].push(String(it.floorCode));
    });
    return out;
  }

  /** (순수) 전층 출력 모양: 'pdf' = PDF 한 파일 / 'dxf-zip' = 층마다 DXF zip / 'mixed-zip' = DXF 들 + PDF 한 파일을 zip 하나로 / 'nothing' */
  function planAllFloorsDrawingExport(split) {
    const hasDxf = !!(split && split.dxf && split.dxf.length);
    const hasPdf = !!(split && split.pdf && split.pdf.length);
    if (hasDxf && hasPdf) return 'mixed-zip';
    if (hasDxf) return 'dxf-zip';
    if (hasPdf) return 'pdf';
    return 'nothing';
  }

  /** (순수) 현재 층: DXF 층이면 'dxf', 아니면 'pdf' */
  function pickCurrentFloorExport(kind) {
    return kind === 'dxf' ? 'dxf' : 'pdf';
  }

  window.BSA = window.BSA || {};
  window.BSA.drawingExport = { splitFloorsByDrawingKind, planAllFloorsDrawingExport, pickCurrentFloorExport };

  window.exportCurrentFloorDrawing = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    if (typeof window.showLoading === 'function') window.showLoading('도면 종류 확인 중...');
    let kind = 'none';
    try {
      kind = await window.detectFloorDrawingKind(state.currentBuilding, state.currentFloor);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
    return pickCurrentFloorExport(kind) === 'dxf'
      ? window.exportCurrentFloorMarkingDxf()
      : window.exportCurrentFloorVectorPdf();
  };

  window.exportAllFloorsDrawing = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const bldg = state.currentBuilding;
    const id = state.currentBuildingId;
    const floorCodes = typeof window.listFloorsForVectorPdfExport === 'function'
      ? window.listFloorsForVectorPdfExport(bldg)
      : [];
    if (!floorCodes.length) {
      toast('내보낼 층이 없습니다.', 'warning');
      return;
    }
    const stamp = Date.now();
    const bldgName = safeName((bldg && (bldg.name || bldg.buildingName)) || id || 'building');
    const show = (msg) => { if (typeof window.showLoading === 'function') window.showLoading(msg); };
    show(`도면 종류 확인 중 (0/${floorCodes.length})...`);
    try {
      const kinds = [];
      for (let i = 0; i < floorCodes.length; i++) {
        show(`도면 종류 확인 (${i + 1}/${floorCodes.length}) ${floorCodes[i]}...`);
        kinds.push({ floorCode: floorCodes[i], kind: await window.detectFloorDrawingKind(bldg, floorCodes[i]) });
      }
      const split = splitFloorsByDrawingKind(kinds);
      const plan = planAllFloorsDrawingExport(split);
      if (plan === 'nothing') {
        toast('PDF·DXF 도면 원본이 있는 층이 없어 내보내지 못했습니다. 동기화·로그인 상태를 확인하세요.', 'warning', 6000);
        return;
      }
      if (split.pdf.length && typeof PDFLib === 'undefined') {
        toast('pdf-lib가 로드되지 않았습니다. Ctrl+F5로 새로고침 후 다시 시도하세요.', 'error', 6000);
        return;
      }
      if (plan === 'pdf') {
        const res = await window.buildMergedFloorsVectorPdfBlob(bldg, split.pdf, id, '전층 벡터 PDF');
        if (!res.blob) {
          toast('PDF 원본이 있는 층이 없어 전층 벡터 PDF를 만들지 못했습니다.', 'warning', 6000);
          return;
        }
        window.downloadBlobFile(res.blob, `결함위치도_벡터_전층_${bldgName}_${stamp}.pdf`);
        const skip = res.skipped.length + split.none.length;
        toast(`전층 벡터 PDF 완료 — ${res.ok}층 묶음${skip ? ` (제외 ${skip}층: PDF 없음 등)` : ''}`, 'success', 6000);
        return;
      }
      if (typeof JSZip === 'undefined') {
        toast('zip 도구가 없어 현재 층만 내보냅니다.', 'warning');
        return window.exportCurrentFloorDrawing();
      }
      const zip = new JSZip();
      const used = new Set();
      const dxfRes = await addFloorsMarkingDxfToZip(zip, bldg, split.dxf, id, '마킹 DXF', used);
      let pdfOk = 0;
      let pdfSkipped = [];
      if (split.pdf.length) {
        const res = await window.buildMergedFloorsVectorPdfBlob(bldg, split.pdf, id, '벡터 PDF');
        pdfOk = res.ok;
        pdfSkipped = res.skipped;
        if (res.blob) zip.file(`결함위치도_벡터_PDF층_${bldgName}.pdf`, res.blob);
      }
      if (!dxfRes.ok && !pdfOk) {
        toast('마킹이 있는 층이 없어 내보내지 못했습니다.', 'warning', 6000);
        return;
      }
      show('zip 묶는 중...');
      const blob = await zip.generateAsync({ type: 'blob' });
      window.downloadBlobFile(blob, `결함위치도_전층_${bldgName}_${stamp}.zip`);
      const parts = [];
      if (dxfRes.ok) parts.push(`DXF ${dxfRes.ok}층`);
      if (pdfOk) parts.push(`벡터 PDF ${pdfOk}층(한 파일)`);
      const skip = dxfRes.skipped.length + pdfSkipped.length + split.none.length;
      toast(`전층 출력 완료 — ${parts.join(' + ')} zip 묶음${skip ? ` (제외 ${skip}층: 마킹·도면 없음 등)` : ''}`, 'success', 7000);
    } catch (err) {
      console.error(err);
      toast(`전층 출력 실패: ${err.message || err}`, 'error', 6000);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  /** 「DXF·PDF 출력」 버튼: 현재 층 / 각 층 전부 */
  window.exportFloorDrawingWithScopeChoice = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      toast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const floors = typeof window.listFloorsForVectorPdfExport === 'function'
      ? window.listFloorsForVectorPdfExport(state.currentBuilding)
      : [];
    if (floors.length <= 1) return window.exportCurrentFloorDrawing();
    if (typeof window.appChoose === 'function') {
      const k = await window.appChoose('DXF로 올린 층은 마킹 DXF, PDF로 올린 층은 벡터 PDF로 내보냅니다. 범위를 고르세요.', [
        { label: '현재 층만', detail: state.currentFloor ? floorFileName(state.currentBuilding, state.currentFloor) : '-' },
        { label: '각 층 전부', detail: floors.length + '층 (PDF 층은 한 PDF로, DXF 층은 층마다 DXF — 섞이면 zip 하나)' }
      ], { title: 'DXF·PDF 출력', okText: '내보내기', defaultIndex: 1 });
      if (k === null || k === undefined) return;
      return k === 1 ? window.exportAllFloorsDrawing() : window.exportCurrentFloorDrawing();
    }
    const choice = window.prompt(
      'DXF·PDF 출력 범위 선택\n\n1 = 현재 층만 (' + (state.currentFloor || '-') + ')\n2 = 각 층 전부 (' + floors.length + '층)\n\n숫자 입력 후 확인',
      '2'
    );
    if (choice === null) return;
    const v = String(choice).trim();
    if (v === '2' || v === '전층' || v.toLowerCase() === 'all') return window.exportAllFloorsDrawing();
    return window.exportCurrentFloorDrawing();
  };
})();
