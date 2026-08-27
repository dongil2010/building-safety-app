/**
 * PDF 벡터 브리지
 * - 업로드 시 PDF 원본은 floorDrawingPdfs에 보관하고, 표시용은 일반(4000)·고해상도(8000)·초고해상도(16000) JPEG로 미리 렌더
 * - PC·현장 화면 표시는 그 레스터만 사용 (PDF 원본은 벡터 내보내기·재등록 시에만 로드)
 * - 화면/핀은 래스터(bgImage) 좌표계 사용
 * - 내보내기는 drawPinSafe와 동일한 비율/지시선/화살표/방향지정으로 벡터 합성
 */
(function () {
  const PDF_PREFIX = 'data:application/pdf;base64,';

  window.BSA_PDF_VECTOR = {
    enabled: true,
    version: 'main-9',
    /** PDF 도면: 전체 페이지 티어 교체 대신 뷰포트 고해상도 패치 (벡터 PDF 출력은 별도) */
    useViewportTiles: true
  };

  /** 핀·벡터 PDF 출력용 고정 좌표계 (4000px 미리보기 기준, 표시 타일과 분리) */
  window.getFloorPlanRefDimensions = function (bldg, floorCode) {
    const st = window.state;
    const ref = st && st.floorPlanRef;
    if (ref && bldg && ref.bldgId === bldg.id && ref.floorCode === floorCode && ref.w > 0 && ref.h > 0) {
      return { w: ref.w, h: ref.h };
    }
    const img = st && st.bgImage;
    return {
      w: img ? (img.naturalWidth || img.width || 1) : 1,
      h: img ? (img.naturalHeight || img.height || 1) : 1
    };
  };

  function isPdfDataUrl(url) {
    return typeof url === 'string' && (
      url.startsWith(PDF_PREFIX) ||
      url.startsWith('data:application/pdf')
    );
  }

  window.isPdfDrawingDataUrl = isPdfDataUrl;

  window.fileToPdfDataUrl = function (file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('PDF dataURL 변환 실패'));
      reader.readAsDataURL(file);
    });
  };

  window.dataUrlToUint8Array = function (dataUrl) {
    const base64 = String(dataUrl || '').split(',')[1];
    if (!base64) return null;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  window.ensureFloorDrawingPdfs = function (bldg) {
    if (!bldg) return null;
    if (!bldg.floorDrawingPdfs || typeof bldg.floorDrawingPdfs !== 'object') {
      bldg.floorDrawingPdfs = {};
    }
    return bldg.floorDrawingPdfs;
  };

  window.prepareFloorDrawingUpload = async function (file) {
    const isPdf = !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
    if (!isPdf) {
      const readFull = () => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('이미지 파일 읽기 실패'));
        reader.readAsDataURL(file);
      });
      const raw = await readFull();
      const sourceDataUrl = (typeof window.resizeDataUrlToMaxDim === 'function')
        ? await window.resizeDataUrlToMaxDim(raw, 16000)
        : raw;
      const tiers = (typeof window.buildFloorDrawingTiersFromDataUrl === 'function')
        ? await window.buildFloorDrawingTiersFromDataUrl(sourceDataUrl)
        : null;
      const rasterDataUrl = (tiers && tiers['4000'])
        || ((typeof window.resizeDataUrlToMaxDim === 'function')
          ? await window.resizeDataUrlToMaxDim(sourceDataUrl, 4000)
          : await window.compressDrawingImage(file));
      return { rasterDataUrl, sourceDataUrl, tiers, pdfDataUrl: null, isPdf: false };
    }
    const pdfDataUrl = await window.fileToPdfDataUrl(file);
    const cacheKey = file && file.name ? String(file.name) : 'upload-pdf';
    const tiers = (typeof window.buildFloorDrawingTiersFromPdf === 'function')
      ? await window.buildFloorDrawingTiersFromPdf(pdfDataUrl, cacheKey)
      : null;
    const rasterDataUrl = (tiers && tiers['4000'])
      || await window.renderPdfFileToImage(file, 4000, 1400000);
    return { rasterDataUrl, tiers, pdfDataUrl, isPdf: true };
  };

  window.getFloorPdfDataUrl = function (bldg, floorCode) {
    if (!bldg || !floorCode) return null;
    const map = bldg.floorDrawingPdfs;
    if (map && map[floorCode]) return map[floorCode];
    const drawing = bldg.floorDrawings && bldg.floorDrawings[floorCode];
    if (isPdfDataUrl(drawing)) return drawing;
    return null;
  };

  function hexToPdfRgb(rgbFn, hex) {
    const clean = String(hex || '#ef4444').replace('#', '');
    const n = parseInt(clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean, 16);
    if (Number.isNaN(n)) return rgbFn(0.94, 0.27, 0.27);
    return rgbFn(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  /** Helvetica(WinAnsi)로 그릴 수 없는 문자(한글 등) 포함 여부 */
  function needsRasterText(text) {
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) > 255) return true;
    }
    return false;
  }

  function pdfRgbToCss(color) {
    if (!color) return '#111111';
    const r = Math.round(((color.red != null ? color.red : 0) || 0) * 255);
    const g = Math.round(((color.green != null ? color.green : 0) || 0) * 255);
    const b = Math.round(((color.blue != null ? color.blue : 0) || 0) * 255);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * 한글 등은 StandardFonts로 인코딩 불가 → 캔버스 래스터를 PNG로 임베드.
   * ASCII(핀 번호 등)는 Helvetica 벡터 텍스트 유지.
   */
  async function drawPdfCenteredText(page, pdfDoc, font, text, cx, cy, size, color) {
    const t = String(text || '');
    if (!t || !(size > 0)) return;

    if (!needsRasterText(t)) {
      const tw = font.widthOfTextAtSize(t, size);
      page.drawText(t, {
        x: cx - tw / 2,
        y: cy - size * 0.32,
        size,
        font,
        color
      });
      return;
    }

    const dpr = 3;
    const fontCss = 'bold ' + (size * dpr) + 'px "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = fontCss;
    const textW = measure.measureText(t).width;
    const padX = Math.ceil(size * dpr * 0.12);
    const padY = Math.ceil(size * dpr * 0.2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(textW) + padX * 2);
    canvas.height = Math.max(1, Math.ceil(size * dpr * 1.25) + padY * 2);
    const ctx = canvas.getContext('2d');
    ctx.font = fontCss;
    ctx.fillStyle = pdfRgbToCss(color);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(t, canvas.width / 2, canvas.height / 2);

    const dataUrl = canvas.toDataURL('image/png');
    const bytes = window.dataUrlToUint8Array(dataUrl);
    if (!bytes) return;
    const img = await pdfDoc.embedPng(bytes);
    const drawW = canvas.width / dpr;
    const drawH = canvas.height / dpr;
    page.drawImage(img, {
      x: cx - drawW / 2,
      y: cy - drawH / 2,
      width: drawW,
      height: drawH
    });
  }

  /** 메모리 → IndexedDB → Firestore floorDrawingPdfs·siteDrawingVault 순 PDF 원본 조회 */
  window.resolveFloorPdfDataUrlAsync = async function (bldg, floorCode) {
    if (!bldg || !floorCode) return null;
    let pdfDataUrl = window.getFloorPdfDataUrl(bldg, floorCode);
    if (pdfDataUrl) return pdfDataUrl;
    if (typeof idbGet === 'function') {
      try {
        const cached = await idbGet('floorDrawingPdfs', `${bldg.id}_${floorCode}`);
        if (cached) {
          window.ensureFloorDrawingPdfs(bldg);
          bldg.floorDrawingPdfs[floorCode] = cached;
          return cached;
        }
      } catch (e) {
        console.warn('[BSA_PDF_VECTOR] IDB PDF lookup failed', e);
      }
    }
    if (typeof window.resolveBuildingFloorPdf === 'function') {
      return window.resolveBuildingFloorPdf(bldg, floorCode, { forceCloud: true });
    }
    return null;
  };

  /** pdf-lib drawSvgPath는 Y축을 한 번 더 뒤집어 화살표가 사라지므로, PDF 연산자로 삼각형을 채운다 */
  function drawFilledTriangle(page, x0, y0, x1, y1, x2, y2, color) {
    const {
      pushGraphicsState,
      popGraphicsState,
      setFillingColor,
      moveTo,
      lineTo,
      closePath,
      fill
    } = PDFLib;

    if (typeof page.pushOperators === 'function' && moveTo && fill && setFillingColor) {
      page.pushOperators(
        pushGraphicsState(),
        setFillingColor(color),
        moveTo(x0, y0),
        lineTo(x1, y1),
        lineTo(x2, y2),
        closePath(),
        fill(),
        popGraphicsState()
      );
      return;
    }

    // fallback: 세 변 + 중앙에서 꼭짓점으로 선 (최소한 화살표 형태는 보이게)
    page.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: 1.2, color });
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.2, color });
    page.drawLine({ start: { x: x2, y: y2 }, end: { x: x0, y: y0 }, thickness: 1.2, color });
  }

  /**
   * 지시선(직선·90° 꺾임)을 한 경로로 스트로크.
   * 구간별 drawLine이면 모서리에서 끊겨 꺾인 선이 더 얇아 보이므로, 캔버스와 같이 연속 stroke 한다.
   */
  function drawStrokedPolyline(page, points, thickness, color) {
    if (!points || points.length < 2) return;
    const thick = Math.max(0.2, thickness || 1);
    const {
      pushGraphicsState,
      popGraphicsState,
      setStrokingColor,
      setLineWidth,
      setLineJoin,
      setLineCap,
      moveTo,
      lineTo,
      stroke,
      LineJoinStyle,
      LineCapStyle
    } = PDFLib;

    if (typeof page.pushOperators === 'function' && moveTo && lineTo && stroke && setLineWidth) {
      const joinRound = (LineJoinStyle && LineJoinStyle.Round != null) ? LineJoinStyle.Round : 1;
      const capButt = (LineCapStyle && LineCapStyle.Butt != null) ? LineCapStyle.Butt : 0;
      const ops = [
        pushGraphicsState(),
        setStrokingColor(color),
        setLineWidth(thick)
      ];
      if (typeof setLineJoin === 'function') ops.push(setLineJoin(joinRound));
      if (typeof setLineCap === 'function') ops.push(setLineCap(capButt));
      ops.push(moveTo(points[0].x, points[0].y));
      for (let i = 1; i < points.length; i++) {
        ops.push(lineTo(points[i].x, points[i].y));
      }
      ops.push(stroke(), popGraphicsState());
      page.pushOperators(...ops);
      return;
    }

    for (let i = 1; i < points.length; i++) {
      page.drawLine({
        start: points[i - 1],
        end: points[i],
        thickness: thick,
        color
      });
    }
  }

  /** Liang-Barsky: 선분을 AABB로 잘라 교점이 있으면 {x1,y1,x2,y2} */
  function clipLineToRect(x0, y0, x1, y1, minX, minY, maxX, maxY) {
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-9) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    if (!clip(-dx, x0 - minX)) return null;
    if (!clip(dx, maxX - x0)) return null;
    if (!clip(-dy, y0 - minY)) return null;
    if (!clip(dy, maxY - y0)) return null;
    if (t0 > t1) return null;
    return {
      x1: x0 + t0 * dx,
      y1: y0 + t0 * dy,
      x2: x0 + t1 * dx,
      y2: y0 + t1 * dy
    };
  }

  function pdfPtsFromImg(points, imgToPdf) {
    return (points || []).map((p) => imgToPdf(p.x, p.y));
  }

  function ellipsePolyImg(cx, cy, rx, ry, angleDeg, segments) {
    const n = Math.max(16, segments || 48);
    const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const lx = Math.cos(t) * rx;
      const ly = Math.sin(t) * ry;
      pts.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
    }
    return pts;
  }

  function areaOutlineImgPoints(area) {
    const shape = area.shape === 'ellipse' || area.shape === 'polygon' ? area.shape : 'rect';
    const ix1 = Math.min(area.x1, area.x2);
    const iy1 = Math.min(area.y1, area.y2);
    const ix2 = Math.max(area.x1, area.x2);
    const iy2 = Math.max(area.y1, area.y2);
    const cx = (ix1 + ix2) / 2;
    const cy = (iy1 + iy2) / 2;
    const hw = (ix2 - ix1) / 2;
    const hh = (iy2 - iy1) / 2;
    const ang = Number(area.angle) || 0;
    if (shape === 'ellipse') {
      return ellipsePolyImg(cx, cy, Math.max(hw, 0.5), Math.max(hh, 0.5), ang, 56);
    }
    if (Array.isArray(area.points) && area.points.length >= 3) {
      return area.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
    }
    const rad = (ang * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [
      { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
    ].map((p) => ({
      x: cx + p.x * c - p.y * s,
      y: cy + p.x * s + p.y * c
    }));
  }

  function drawFilledPolygonPdf(page, pdfPts, color) {
    if (!pdfPts || pdfPts.length < 3) return;
    const {
      pushGraphicsState,
      popGraphicsState,
      setFillingColor,
      moveTo,
      lineTo,
      closePath,
      fill
    } = PDFLib;
    if (typeof page.pushOperators !== 'function' || !moveTo || !fill || !setFillingColor) return;
    page.pushOperators(
      pushGraphicsState(),
      setFillingColor(color),
      moveTo(pdfPts[0].x, pdfPts[0].y),
      ...pdfPts.slice(1).map((p) => lineTo(p.x, p.y)),
      closePath(),
      fill(),
      popGraphicsState()
    );
  }

  function drawStrokedPolygonPdf(page, pdfPts, thickness, color, dashed) {
    if (!pdfPts || pdfPts.length < 2) return;
    const thick = Math.max(0.2, thickness || 1);
    const {
      pushGraphicsState,
      popGraphicsState,
      setStrokingColor,
      setLineWidth,
      setDashPattern,
      moveTo,
      lineTo,
      closePath,
      stroke
    } = PDFLib;
    if (typeof page.pushOperators === 'function' && moveTo && stroke) {
      const ops = [
        pushGraphicsState(),
        setStrokingColor(color),
        setLineWidth(thick)
      ];
      if (dashed && typeof setDashPattern === 'function') {
        ops.push(setDashPattern([Math.max(2, 5 * thick), Math.max(1.5, 4 * thick)], 0));
      }
      ops.push(moveTo(pdfPts[0].x, pdfPts[0].y));
      for (let i = 1; i < pdfPts.length; i++) ops.push(lineTo(pdfPts[i].x, pdfPts[i].y));
      ops.push(closePath(), stroke(), popGraphicsState());
      page.pushOperators(...ops);
      return;
    }
    drawStrokedPolyline(page, pdfPts.concat([pdfPts[0]]), thick, color);
  }

  function drawVectorAreaMark(page, area, color, imgToPdf, sx, sy, pageH, sAvg) {
    if (!area) return;
    const outlineImg = areaOutlineImgPoints(area);
    const outlinePdf = pdfPtsFromImg(outlineImg, imgToPdf);
    if (outlinePdf.length < 3) return;

    const fillStyle = area.fillStyle === 'hatch' || area.fillStyle === 'none' ? area.fillStyle : 'solid';
    const borderStyle = area.borderStyle === 'dashed' ? 'dashed' : 'solid';
    const borderW = Math.max(0.35, 1.1 * sAvg);

    let minX = outlinePdf[0].x, maxX = outlinePdf[0].x, minY = outlinePdf[0].y, maxY = outlinePdf[0].y;
    outlinePdf.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const rw = maxX - minX;
    const rh = maxY - minY;
    const shape = area.shape || 'rect';
    const ang = Math.abs(Number(area.angle) || 0);
    const axisAlignedRect = shape === 'rect' && ang < 0.01;

    if (fillStyle === 'solid') {
      if (axisAlignedRect) {
        page.drawRectangle({
          x: minX, y: minY, width: rw, height: rh,
          color, opacity: 0.28, borderWidth: 0
        });
      } else {
        drawFilledPolygonPdf(page, outlinePdf, color);
      }
    } else if (fillStyle === 'hatch') {
      const step = Math.max(4, 9 * sAvg);
      const hatchW = Math.max(0.35, 0.9 * sAvg);
      for (let i = -rh; i <= rw + rh; i += step) {
        const seg = clipLineToRect(
          minX + i, minY + rh,
          minX + i + rh, minY,
          minX, minY, maxX, maxY
        );
        if (!seg) continue;
        page.drawLine({
          start: { x: seg.x1, y: seg.y1 },
          end: { x: seg.x2, y: seg.y2 },
          thickness: hatchW,
          color,
          opacity: 0.7
        });
      }
    }

    if (axisAlignedRect) {
      const borderOpts = {
        x: minX, y: minY, width: rw, height: rh,
        borderColor: color, borderWidth: borderW
      };
      if (borderStyle === 'dashed') {
        borderOpts.borderDashArray = [Math.max(2, 5 * sAvg), Math.max(1.5, 4 * sAvg)];
      }
      page.drawRectangle(borderOpts);
    } else {
      drawStrokedPolygonPdf(page, outlinePdf, borderW, color, borderStyle === 'dashed');
    }

    const drawings = Array.isArray(area.drawings) ? area.drawings : [];
    const inkW = Math.max(0.4, 1.5 * sAvg);
    drawings.forEach((st) => {
      const pts = st.points || [];
      if (pts.length < 1) return;
      const type = st.type || 'path';
      if (type === 'rect' && pts.length >= 2) {
        const x1 = Math.min(pts[0].x, pts[1].x);
        const y1 = Math.min(pts[0].y, pts[1].y);
        const x2 = Math.max(pts[0].x, pts[1].x);
        const y2 = Math.max(pts[0].y, pts[1].y);
        drawStrokedPolygonPdf(page, pdfPtsFromImg([
          { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }
        ], imgToPdf), inkW, color, false);
      } else if (type === 'ellipse' && pts.length >= 2) {
        const x1 = Math.min(pts[0].x, pts[1].x);
        const y1 = Math.min(pts[0].y, pts[1].y);
        const x2 = Math.max(pts[0].x, pts[1].x);
        const y2 = Math.max(pts[0].y, pts[1].y);
        drawStrokedPolygonPdf(page, pdfPtsFromImg(
          ellipsePolyImg((x1 + x2) / 2, (y1 + y2) / 2, Math.max((x2 - x1) / 2, 0.5), Math.max((y2 - y1) / 2, 0.5), 0, 40),
          imgToPdf
        ), inkW, color, false);
      } else {
        const pPdf = pdfPtsFromImg(pts, imgToPdf);
        if (type === 'polygon' && pPdf.length >= 3) drawStrokedPolygonPdf(page, pPdf, inkW, color, false);
        else drawStrokedPolyline(page, pPdf, inkW, color);
      }
    });
  }

  /**
   * 본앱 drawPinSafe와 같은 이미지-픽셀 비율로 PDF에 벡터 마킹
   * @param {object} [options] { plans } — 있으면 defects 대신 사전 계산 플랜 사용(NDT 등)
   */
  window.exportFloorPlanVectorPdf = async function (pdfDataUrl, defects, imgW, imgH, options) {
    if (typeof PDFLib === 'undefined') {
      throw new Error('pdf-lib가 로드되지 않았습니다.');
    }
    const opts = (typeof options === 'object' && options) ? options : {};

    const bytes = window.dataUrlToUint8Array(pdfDataUrl);
    if (!bytes) throw new Error('PDF 원본 데이터가 없습니다.');

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const outDoc = await PDFDocument.load(bytes);
    const page = outDoc.getPages()[0];
    const { width, height } = page.getSize();
    const font = await outDoc.embedFont(StandardFonts.HelveticaBold);

    const iw = Math.max(1, imgW || width);
    const ih = Math.max(1, imgH || height);
    const sx = width / iw;
    const sy = height / ih;
    const sAvg = (sx + sy) / 2;

    const imgToPdf = (ix, iy) => ({
      x: Number(ix) * sx,
      y: height - Number(iy) * sy
    });

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');

    let plans = Array.isArray(opts.plans) ? opts.plans.filter(Boolean) : null;
    if (!plans) {
      if (typeof window.buildVectorPinDrawPlan !== 'function') {
        throw new Error('벡터 핀 계산기가 없습니다. Ctrl+F5로 새로고침 후 다시 시도하세요.');
      }
      const list = (Array.isArray(defects) ? defects : []).filter(d => d && !d.mapUnregistered);
      const seenGroup = new Set();
      plans = [];
      list.forEach((d) => {
        if (d.groupId) {
          if (seenGroup.has(d.groupId)) return;
          seenGroup.add(d.groupId);
          const members = list.filter(m => m.groupId === d.groupId && !m.surveyExtra);
          const arrows = members
            .filter(m => m.targetX !== undefined && m.targetY !== undefined)
            .map(m => ({
              targetX: m.targetX,
              targetY: m.targetY,
              forceArrowDir: m.forceArrowDir,
              arrowOctant: m.arrowOctant,
              areaSource: (m.shapeType === 'area' && m.areaX1 !== undefined) ? m : null
            }));
          const representative = members.slice().sort((a, b) => {
            const sa = String(a.no || '');
            const sb = String(b.no || '');
            return sa.localeCompare(sb, undefined, { numeric: true });
          })[0] || d;
          const plan = window.buildVectorPinDrawPlan(representative, arrows, measureCtx);
          if (plan) plans.push(plan);
          return;
        }
        const plan = window.buildVectorPinDrawPlan(d, null, measureCtx);
        if (plan) plans.push(plan);
      });
    }

    for (const p of plans) {
      const color = hexToPdfRgb(rgb, p.color);
      const fontSize = Math.max(0.5, p.fontSize * sAvg);
      const borderW = Math.max(0.2, p.borderW * sAvg);
      const lineW = Math.max(0.2, p.lineW * sAvg);
      const boxW = p.boxW * sx;
      const boxH = p.boxH * sy;
      const box = imgToPdf(p.boxX, p.boxY);

      // 영역 마킹(면적) — 번호칸/지시선보다 먼저 그려 아래에 깔림 (그룹이면 여러 영역)
      const areaList = (Array.isArray(p.areas) && p.areas.length)
        ? p.areas
        : (p.area ? [p.area] : []);
      areaList.forEach((areaMark) => {
        drawVectorAreaMark(page, areaMark, color, imgToPdf, sx, sy, height, sAvg);
      });

      (p.leaders || []).forEach((L) => {
        const routePdf = (L.route || []).map(pt => imgToPdf(pt.x, pt.y));
        drawStrokedPolyline(page, routePdf, lineW, color);

        if (L.skipArrowHead) return;
        const tip = imgToPdf(L.tipX, L.tipY);

        if (L.useCircleTip) {
          const r = Math.max(0.6, 4.5 * sAvg * ((L.headLen || 11) / 11));
          page.drawCircle({ x: tip.x, y: tip.y, size: r, color });
          return;
        }

        // PDF 좌표에서 화살표 방향 계산 (stem 끝 → tip)
        const stemEnd = routePdf.length ? routePdf[routePdf.length - 1] : tip;
        let ang = Math.atan2(tip.y - stemEnd.y, tip.x - stemEnd.x);
        if (!Number.isFinite(ang) || (Math.abs(tip.x - stemEnd.x) < 1e-6 && Math.abs(tip.y - stemEnd.y) < 1e-6)) {
          // fallback: 이미지 벡터를 PDF 스케일로
          ang = Math.atan2(-(L.uy || 0) * sy, (L.ux || 1) * sx);
        }
        const headLen = Math.max(2.5, (L.headLen || 11) * sAvg);
        const x1 = tip.x - headLen * Math.cos(ang - Math.PI / 6);
        const y1 = tip.y - headLen * Math.sin(ang - Math.PI / 6);
        const x2 = tip.x - headLen * Math.cos(ang + Math.PI / 6);
        const y2 = tip.y - headLen * Math.sin(ang + Math.PI / 6);

        // drawSvgPath는 SVG Y↓ 변환을 또 적용해서 화살표가 사라짐 → PDF 연산자로 직접 채움
        drawFilledTriangle(page, tip.x, tip.y, x1, y1, x2, y2, color);
      });

      // 본앱 fill:false → 채우기 없이 테두리만 / typeCallout은 흰 배경
      const rect = {
        x: box.x - boxW / 2,
        y: box.y - boxH / 2,
        width: boxW,
        height: boxH,
        borderColor: color,
        borderWidth: borderW
      };
      if (p.fill) {
        rect.color = color;
      } else if (p.typeCallout) {
        rect.color = rgb(1, 1, 1);
      }
      page.drawRectangle(rect);

      if (p.typeCallout && p.typeLabel) {
        const c1 = (p.col1W != null ? p.col1W : boxW * 0.28) * sx;
        page.drawLine({
          start: { x: box.x - boxW / 2 + c1, y: box.y - boxH / 2 },
          end: { x: box.x - boxW / 2 + c1, y: box.y + boxH / 2 },
          thickness: borderW,
          color
        });
        await drawPdfCenteredText(
          page, outDoc, font, String(p.label || 'NO.01'),
          box.x - boxW / 2 + c1 / 2, box.y, fontSize, color
        );
        await drawPdfCenteredText(
          page, outDoc, font, String(p.typeLabel),
          box.x - boxW / 2 + c1 + (boxW - c1) / 2, box.y, fontSize, color
        );
      } else {
        await drawPdfCenteredText(
          page, outDoc, font, String(p.label || 'NO.01'),
          box.x, box.y, fontSize, p.fill ? rgb(1, 1, 1) : color
        );
      }
    }

    // 결함위치도 범례 표 (크기조절 scale 반영) — 한글은 래스터 텍스트
    const legendPlan = opts.legendPlan || null;
    if (legendPlan && legendPlan.items && legendPlan.items.length) {
      const lx0 = legendPlan.boxX * sx;
      const lyTop = height - legendPlan.boxY * sy;
      const lw = legendPlan.boxW * sx;
      const lh = legendPlan.boxH * sy;
      const ly0 = lyTop - lh;
      const lineW = Math.max(0.3, (legendPlan.lineW || 1) * sAvg);
      const borderGray = rgb(0.64, 0.64, 0.64);
      const headerGray = rgb(0.39, 0.45, 0.55);

      page.drawRectangle({
        x: lx0,
        y: ly0,
        width: lw,
        height: lh,
        color: rgb(1, 1, 1),
        borderColor: borderGray,
        borderWidth: lineW
      });

      const col1W = legendPlan.col1W * sx;
      page.drawLine({
        start: { x: lx0 + col1W, y: ly0 },
        end: { x: lx0 + col1W, y: ly0 + lh },
        thickness: lineW,
        color: borderGray
      });

      const headerH = legendPlan.headerRowH * sy;
      page.drawLine({
        start: { x: lx0, y: ly0 + lh - headerH },
        end: { x: lx0 + lw, y: ly0 + lh - headerH },
        thickness: lineW,
        color: borderGray
      });

      const rowH = legendPlan.rowH * sy;
      for (let i = 1; i < legendPlan.items.length; i++) {
        const y = ly0 + lh - headerH - i * rowH;
        page.drawLine({
          start: { x: lx0, y },
          end: { x: lx0 + lw, y },
          thickness: lineW,
          color: borderGray
        });
      }

      const fs = Math.max(4, legendPlan.fontSize * sAvg);
      await drawPdfCenteredText(page, outDoc, font, '구분', lx0 + col1W / 2, ly0 + lh - headerH / 2, fs, headerGray);
      await drawPdfCenteredText(
        page, outDoc, font, '내 용',
        lx0 + col1W + (legendPlan.col2W * sx) / 2, ly0 + lh - headerH / 2, fs, headerGray
      );

      for (let i = 0; i < legendPlan.items.length; i++) {
        const item = legendPlan.items[i];
        const cy = ly0 + lh - headerH - i * rowH - rowH / 2;
        const itemColor = hexToPdfRgb(rgb, item.color);
        await drawPdfCenteredText(page, outDoc, font, item.colorName, lx0 + col1W / 2, cy, fs, itemColor);
        await drawPdfCenteredText(
          page, outDoc, font, item.label,
          lx0 + col1W + (legendPlan.col2W * sx) / 2, cy, fs, itemColor
        );
      }
    }

    const pdfBytes = await outDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  };

  window.downloadBlobFile = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  window.exportCurrentFloorVectorPdf = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      if (typeof window.showToast === 'function') window.showToast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const bldg = state.currentBuilding;
    const floorCode = state.currentFloor;
    if (typeof window.showLoading === 'function') window.showLoading('서버에서 PDF 원본 불러오는 중...');
    let pdfDataUrl = null;
    try {
      pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
    if (!pdfDataUrl) {
      if (typeof window.showToast === 'function') {
        window.showToast('PDF 원본을 서버에서 불러오지 못했습니다. 동기화·로그인 상태를 확인하거나 PC에서 PDF를 다시 등록해 주세요.', 'warning', 6000);
      }
      return;
    }

    const key = `${state.currentBuildingId}_${floorCode}`;
    const defects = (state.defects && state.defects[key]) || [];
    const { w: imgW, h: imgH } = window.getFloorPlanRefDimensions(bldg, floorCode);

    if (typeof window.showLoading === 'function') window.showLoading('벡터 PDF 합성 중...');
    try {
      const measureCanvas = document.createElement('canvas');
      const measureCtx = measureCanvas.getContext('2d');
      const legendPlan = (typeof window.buildVectorLegendDrawPlan === 'function')
        ? window.buildVectorLegendDrawPlan(measureCtx, imgW, imgH)
        : null;
      const blob = await window.exportFloorPlanVectorPdf(pdfDataUrl, defects, imgW, imgH, { legendPlan });
      const safeFloor = String(floorCode || 'floor').replace(/[\\/:*?"<>|]/g, '_');
      window.downloadBlobFile(blob, `결함위치도_벡터_${safeFloor}_${Date.now()}.pdf`);
      if (typeof window.showToast === 'function') {
        window.showToast('벡터 PDF 내보내기 완료 (마킹·범례 표 적용)', 'success', 4000);
      }
    } catch (err) {
      console.error(err);
      if (typeof window.showToast === 'function') {
        window.showToast(`벡터 PDF 내보내기 실패: ${err.message || err}`, 'error', 6000);
      }
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  /** NDT 마킹을 결함위치도와 동일 핀 스타일로 벡터 PDF 출력 */
  window.exportCurrentFloorNdtVectorPdf = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      if (typeof window.showToast === 'function') window.showToast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const bldg = state.currentBuilding;
    const floorCode = state.currentFloor;
    if (typeof window.showLoading === 'function') window.showLoading('서버에서 PDF 원본 불러오는 중...');
    let pdfDataUrl = null;
    try {
      pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode);
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
    if (!pdfDataUrl) {
      if (typeof window.showToast === 'function') {
        window.showToast('PDF 원본을 서버에서 불러오지 못했습니다. 동기화·로그인 상태를 확인하거나 PC에서 PDF를 다시 등록해 주세요.', 'warning', 6000);
      }
      return;
    }
    if (typeof window.buildVectorNdtPinDrawPlan !== 'function') {
      if (typeof window.showToast === 'function') {
        window.showToast('벡터 핀 계산기가 없습니다. Ctrl+F5로 새로고침 후 다시 시도하세요.', 'error');
      }
      return;
    }

    const key = `${state.currentBuildingId}_${floorCode}`;
    const items = (state.ndtData && state.ndtData[key]) || [];
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    const plans = items
      .map((item) => window.buildVectorNdtPinDrawPlan(item, measureCtx, items))
      .filter(Boolean);

    const { w: imgW, h: imgH } = window.getFloorPlanRefDimensions(bldg, floorCode);

    if (typeof window.showLoading === 'function') window.showLoading('NDT 벡터 PDF 합성 중...');
    try {
      const blob = await window.exportFloorPlanVectorPdf(pdfDataUrl, [], imgW, imgH, { plans });
      const safeFloor = String(floorCode || 'floor').replace(/[\\/:*?"<>|]/g, '_');
      window.downloadBlobFile(blob, `비파괴조사_벡터_${safeFloor}_${Date.now()}.pdf`);
      if (typeof window.showToast === 'function') {
        window.showToast('NDT 벡터 PDF 내보내기 완료', 'success', 4000);
      }
    } catch (err) {
      console.error(err);
      if (typeof window.showToast === 'function') {
        window.showToast(`NDT 벡터 PDF 실패: ${err.message || err}`, 'error', 6000);
      }
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  console.info('[BSA_PDF_VECTOR] bridge loaded', window.BSA_PDF_VECTOR.version);
})();
