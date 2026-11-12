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
    version: 'main-10',
    /** PDF 도면: 전체 페이지 티어 교체 대신 뷰포트 고해상도 패치 (벡터 PDF 출력은 별도) */
    useViewportTiles: true,
    /** 핀 번호 글자를 글꼴 없이 선으로 그릴지(기본 끔 — 예전 Helvetica 글자). 글꼴을 못 찾는 변환기에서 깨질 때만 켠다 */
    textAsPaths: false
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
    // 2026-11-12 캐드 DXF: 브라우저에서 벡터 PDF File로 바꾼 뒤 아래 PDF 길을 그대로 탄다(docs/cad-dxf-작업계획.md)
    if (file && /\.dxf$/i.test(file.name || '')) {
      const conv = window.BSA && window.BSA.dxfToPdf;
      if (!conv || typeof conv.dxfFileToPdfFile !== 'function') {
        const msg = 'DXF 변환 모듈이 로드되지 않았습니다. 새로고침(Ctrl+F5) 뒤 다시 해 주세요.';
        const err = new Error(msg);
        err.bsaUserMessage = msg;
        throw err;
      }
      file = await conv.dxfFileToPdfFile(file);
    }
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

  // 층 도면을 PDF 없는 그림으로 바꿨다는 표시(app.js markFloorPdfRemoved). 이 기기에 옛 PDF가 남아 있어도
  // 쓰지 않는다 — 쓰면 핀 좌표 기준을 옛 PDF 크기로 잡아 그 층 핀이 전부 어긋난다(감사 O-05).
  window.isFloorPdfRemoved = function (bldg, floorCode) {
    return Number(bldg && bldg.floorPdfRemovedAt && bldg.floorPdfRemovedAt[floorCode]) > 0;
  };

  window.getFloorPdfDataUrl = function (bldg, floorCode) {
    if (!bldg || !floorCode) return null;
    if (window.isFloorPdfRemoved(bldg, floorCode)) return null;
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
   * 2026-11-02 핀 번호(NO.12·B1-3 …) 글자를 글꼴 없이 선(획)으로 그린다.
   * 예전엔 PDF 안 글꼴(Helvetica, 내장 안 함)로 써서, PDF 뷰어에서는 멀쩡해도 EMF 등으로 바꾸는 변환기가 글꼴을 못 찾아
   * 글자가 윤곽선 조각·찌그러진 모양으로 깨졌다. 선으로 그리면 어떤 변환기에서도 선 그대로 남는다.
   * 좌표: 글자 높이 100, 왼쪽 위가 (0,0), 획 하나 = 점 목록(숫자 0~9는 struct-glyphs.js romans와 같은 획).
   */
  const STROKE_FONT = (function () {
    const G = {
      '0': [[[24,0],[14,5],[5,19],[0,43],[0,57],[5,81],[14,95],[24,100],[33,100],[43,95],[52,81],[57,57],[57,43],[52,19],[43,5],[33,0],[24,0]]],
      '1': [[[0,19],[10,14],[24,0],[24,100]]],
      '2': [[[5,24],[5,19],[10,10],[14,5],[24,0],[38,0],[48,5],[52,10],[57,19],[57,29],[52,38],[43,52],[0,100],[62,100]]],
      '3': [[[10,0],[57,0],[29,38],[43,38],[52,43],[57,48],[62,62],[62,71],[57,86],[48,95],[33,100],[24,100],[10,95],[5,90],[0,81]]],
      '4': [[[43,0],[0,67],[62,67]],[[43,0],[43,100]]],
      '5': [[[48,0],[10,0],[5,43],[10,38],[19,33],[33,33],[48,38],[52,48],[57,62],[57,71],[52,86],[48,95],[33,100],[19,100],[10,95],[5,90],[0,81]]],
      '6': [[[52,14],[48,5],[33,0],[24,0],[14,5],[5,19],[0,43],[0,67],[5,86],[14,95],[24,100],[29,100],[43,95],[52,86],[52,71],[52,67],[52,52],[43,43],[29,38],[24,38],[14,43],[5,52],[0,67]]],
      '7': [[[19,100],[62,0],[0,0]]],
      '8': [[[24,0],[10,5],[5,14],[5,24],[10,33],[19,43],[38,52],[52,62],[57,71],[57,86],[52,95],[38,100],[19,100],[5,95],[0,86],[0,71],[5,62],[19,52],[38,43],[48,33],[52,24],[52,14],[48,5],[33,0],[24,0]]],
      '9': [[[48,33],[43,48],[38,57],[24,62],[10,57],[5,48],[0,33],[0,29],[5,14],[10,5],[24,0],[38,5],[43,14],[48,33],[48,57],[43,81],[38,95],[24,100],[19,100],[5,95],[5,86]]],
      A: [[[0,100],[30,0],[60,100]],[[10,66],[50,66]]],
      B: [[[0,0],[0,100]],[[0,0],[36,0],[50,8],[54,22],[50,36],[36,46],[0,46]],[[0,46],[40,46],[56,56],[60,74],[56,90],[40,100],[0,100]]],
      C: [[[56,18],[44,4],[30,0],[18,4],[6,18],[0,40],[0,60],[6,82],[18,96],[30,100],[44,96],[56,82]]],
      D: [[[0,0],[0,100]],[[0,0],[28,0],[46,10],[58,30],[60,50],[58,70],[46,90],[28,100],[0,100]]],
      E: [[[56,0],[0,0],[0,100],[56,100]],[[0,50],[40,50]]],
      F: [[[56,0],[0,0],[0,100]],[[0,50],[40,50]]],
      G: [[[56,18],[44,4],[30,0],[18,4],[6,18],[0,40],[0,60],[6,82],[18,96],[30,100],[44,96],[56,82],[56,56],[34,56]]],
      H: [[[0,0],[0,100]],[[56,0],[56,100]],[[0,50],[56,50]]],
      I: [[[8,0],[8,100]]],
      J: [[[40,0],[40,76],[34,92],[22,100],[10,96],[2,82]]],
      K: [[[0,0],[0,100]],[[56,0],[2,56]],[[18,40],[56,100]]],
      L: [[[0,0],[0,100],[50,100]]],
      M: [[[0,100],[0,0],[30,60],[60,0],[60,100]]],
      N: [[[0,100],[0,0],[56,100],[56,0]]],
      O: [[[34,0],[17,6],[5,22],[0,50],[5,78],[17,94],[34,100],[51,94],[63,78],[68,50],[63,22],[51,6],[34,0]]], // 숫자 0보다 넓게(NO.와 N0. 구분)
      P: [[[0,100],[0,0],[36,0],[50,6],[56,20],[50,34],[36,42],[0,42]]],
      Q: [[[34,0],[17,6],[5,22],[0,50],[5,78],[17,94],[34,100],[51,94],[63,78],[68,50],[63,22],[51,6],[34,0]],[[40,74],[68,102]]],
      R: [[[0,100],[0,0],[36,0],[50,6],[56,20],[50,34],[36,42],[0,42]],[[28,42],[56,100]]],
      S: [[[56,14],[46,5],[34,0],[22,0],[10,5],[2,14],[2,24],[8,33],[16,38],[40,50],[50,57],[56,66],[56,82],[48,94],[34,100],[22,100],[10,94],[0,84]]],
      T: [[[0,0],[60,0]],[[30,0],[30,100]]],
      U: [[[0,0],[0,70],[6,90],[18,100],[38,100],[50,90],[56,70],[56,0]]],
      V: [[[0,0],[28,100],[56,0]]],
      W: [[[0,0],[16,100],[32,40],[48,100],[64,0]]],
      X: [[[0,0],[56,100]],[[0,100],[56,0]]],
      Y: [[[0,0],[28,48],[56,0]],[[28,48],[28,100]]],
      Z: [[[0,0],[56,0],[0,100],[56,100]]],
      '.': [[[2,92],[2,100]]],
      ',': [[[3,92],[3,100],[0,108]]],
      '-': [[[0,55],[30,55]]],
      '_': [[[0,104],[50,104]]],
      '/': [[[0,100],[30,0]]],
      ':': [[[2,32],[2,40]],[[2,92],[2,100]]],
      '?': [[[0,24],[4,10],[16,2],[28,2],[40,10],[44,24],[40,38],[22,50],[22,66]],[[22,88],[22,96]]],
      '(': [[[16,-6],[6,20],[2,50],[6,80],[16,106]]],
      ')': [[[0,-6],[10,20],[14,50],[10,80],[0,106]]]
    };
    const out = {};
    Object.keys(G).forEach((ch) => {
      let w = 0;
      G[ch].forEach((s) => s.forEach((p) => { if (p[0] > w) w = p[0]; }));
      out[ch] = { strokes: G[ch], w: w };
    });
    return out;
  })();
  const STROKE_GAP = 20;     // 글자 사이
  const STROKE_SPACE = 40;   // 띄어쓰기

  /** 글자 → 선 글자 배치. 선 글꼴에 없는 글자가 있으면 null(Helvetica 글자로 대신) */
  function strokeTextLayout(text) {
    const chars = Array.from(String(text || '').toUpperCase());
    const glyphs = [];
    let x = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ' ') { x += STROKE_SPACE; continue; }
      const g = STROKE_FONT[ch];
      if (!g) return null;
      glyphs.push({ ch: ch, x: x, strokes: g.strokes });
      x += g.w + STROKE_GAP;
    }
    if (!glyphs.length) return null;
    return { glyphs: glyphs, width: x - STROKE_GAP };
  }

  /** 선(획)으로 가운데 정렬해 그린다. 그렸으면 true */
  function drawPdfStrokeText(page, text, cx, cy, size, color, haloW) {
    const lay = strokeTextLayout(text);
    if (!lay) return false;
    const capH = size * 0.72;
    const k = capH / 100;
    const x0 = cx - (lay.width * k) / 2;
    const yTop = cy + capH / 2;
    const thickness = Math.max(0.2, size * 0.1);
    const cap = (PDFLib.LineCapStyle && PDFLib.LineCapStyle.Round !== undefined) ? PDFLib.LineCapStyle.Round : undefined;
    // 흰 윤곽선(haloW > 0): 같은 획을 굵은 흰 선으로 먼저 깔고 그 위에 글자색 선
    const passes = (haloW > 0) ? [{ w: thickness + haloW, c: PDFLib.rgb(1, 1, 1) }, { w: thickness, c: color }] : [{ w: thickness, c: color }];
    passes.forEach((pass) => {
      lay.glyphs.forEach((g) => {
        g.strokes.forEach((stroke) => {
          for (let i = 1; i < stroke.length; i++) {
            const a = stroke[i - 1];
            const b = stroke[i];
            const seg = {
              start: { x: x0 + (g.x + a[0]) * k, y: yTop - a[1] * k },
              end: { x: x0 + (g.x + b[0]) * k, y: yTop - b[1] * k },
              thickness: pass.w,
              color: pass.c
            };
            if (cap !== undefined) seg.lineCap = cap;
            page.drawLine(seg);
          }
        });
      });
    });
    return true;
  }

  // (테스트가 쓰도록 노출: 배치·글꼴·그리기·가운데 정렬 글자·원본 그래픽 상태 격리)
  window.BSA_PDF_VECTOR.strokeText = {
    layout: strokeTextLayout,
    font: STROKE_FONT,
    draw: drawPdfStrokeText,
    drawCentered: drawPdfCenteredText,
    isolate: isolatePageGraphicsState
  };

  /**
   * 한글 등은 StandardFonts로 인코딩 불가 → 캔버스 래스터를 PNG로 임베드.
   * ASCII(핀 번호 등)는 선 글자(글꼴 없음)로, 선 글꼴에 없는 글자만 Helvetica 벡터 텍스트.
   */
  /**
   * opts.halo: 글자 둘레에 흰 윤곽선(화면의 drawOutlinedPinText와 같은 굵기: 글자 크기의 20%, 최대 2.8) —
   * 번호가 도면 선과 겹쳐도 읽히게. 박스 안이 흰색이거나 글자가 흰색인(색 채운 박스) 곳에는 쓰지 않는다.
   */
  async function drawPdfCenteredText(page, pdfDoc, font, text, cx, cy, size, color, opts) {
    const t = String(text || '');
    if (!t || !(size > 0)) return;
    const haloW = (opts && opts.halo) ? Math.max(0.5, Math.min(size * 0.2, 2.8)) : 0;

    if (!needsRasterText(t)) {
      if (window.BSA_PDF_VECTOR.textAsPaths === true && drawPdfStrokeText(page, t, cx, cy, size, color, haloW)) return;
      const tw = font.widthOfTextAtSize(t, size);
      const tx = cx - tw / 2;
      const ty = cy - size * 0.32;
      // 흰 윤곽선용으로 같은 글자를 흰색으로 겹쳐 찍지 않는다 — 캐드로 PDF를 다시 가져오면
      // 글자가 여러 개로 박혀 버린다(2026-11-03). 글자는 항상 한 번만 쓴다.
      page.drawText(t, {
        x: tx,
        y: ty,
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
    if (haloW > 0) {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = haloW * dpr;
      ctx.strokeText(t, canvas.width / 2, canvas.height / 2);
    }
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
    if (window.isFloorPdfRemoved(bldg, floorCode)) return null;
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
    const shape = area.shape === 'ellipse' || area.shape === 'polygon' || area.shape === 'polyline' ? area.shape : 'rect';
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
    if (Array.isArray(area.points) && area.points.length >= (shape === 'polyline' ? 2 : 3)) {
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
    const isLine = area.shape === 'polyline';
    if (outlinePdf.length < (isLine ? 2 : 3)) return;

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

    if (isLine) {
      /* 선: 채우기·해치 없음 */
    } else if (fillStyle === 'solid') {
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

    if (isLine) {
      drawStrokedPolyline(page, outlinePdf, borderW, color); // 열린 선(닫지 않음)
    } else if (axisAlignedRect) {
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
  /**
   * 화면(pdf.js 뷰포트)에 보이는 페이지 크기와, 그 좌표(왼쪽 아래 원점, 위로 +y)를
   * PDF 원래 좌표로 바꾸는 cm 행렬 [a b c d e f]. 회전 0·원점 (0,0)이면 matrix = null.
   */
  window.vectorPdfDisplayFrame = function (page) {
    let box = null;
    try { box = typeof page.getCropBox === 'function' ? page.getCropBox() : null; } catch (_e) { box = null; }
    if (!box || !(box.width > 0) || !(box.height > 0)) {
      const sz = page.getSize();
      box = { x: 0, y: 0, width: sz.width, height: sz.height };
    }
    let rot = 0;
    try { rot = Number(page.getRotation && page.getRotation().angle) || 0; } catch (_e) { rot = 0; }
    rot = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
    const W = box.width;
    const H = box.height;
    const x0 = box.x || 0;
    const y0 = box.y || 0;
    let m;
    if (rot === 90) m = [0, 1, -1, 0, W, 0];
    else if (rot === 180) m = [-1, 0, 0, -1, W, H];
    else if (rot === 270) m = [0, -1, 1, 0, 0, H];
    else m = [1, 0, 0, 1, 0, 0];
    m[4] += x0;
    m[5] += y0;
    const identity = rot === 0 && !x0 && !y0;
    return {
      rotation: rot,
      width: (rot === 90 || rot === 270) ? H : W,
      height: (rot === 90 || rot === 270) ? W : H,
      matrix: identity ? null : m
    };
  };

  /**
   * 원본 페이지 내용 앞에 q, 뒤에 Q를 두어 원본이 남긴 그래픽 상태가 새 마킹에 이어지지 않게 한다.
   * 원본에 짝 안 맞는 q/Q가 있어도 우리 q/Q가 감싸므로 마킹은 늘 기본 상태에서 시작한다. 실패해도 출력은 그대로 진행.
   */
  function isolatePageGraphicsState(pdfDoc, page) {
    try {
      if (!PDFLib || !page || !page.node) return false;
      const node = page.node;
      if (typeof node.normalize === 'function') node.normalize();
      const contents = node.Contents();
      if (!contents || typeof contents.insert !== 'function') return false;
      const qRef = pdfDoc.context.register(pdfDoc.context.stream('q\n'));
      contents.insert(0, qRef);
      page.pushOperators(PDFLib.popGraphicsState());
      return true;
    } catch (e) {
      console.warn('[BSA_PDF_VECTOR] 원본 그래픽 상태 격리 실패(그대로 진행)', e);
      return false;
    }
  }

  /**
   * 결함 목록 → 핀 그리기 계획 목록 (그룹은 대표 1개로 묶음).
   * 벡터 PDF 와 마킹 DXF 내보내기가 같이 쓴다(2026-11-12).
   */
  window.buildVectorPinPlansForDefects = function (defects, measureCtx) {
    if (typeof window.buildVectorPinDrawPlan !== 'function') {
      throw new Error('벡터 핀 계산기가 없습니다. Ctrl+F5로 새로고침 후 다시 시도하세요.');
    }
    const list = (Array.isArray(defects) ? defects : []).filter(d => d && !d.mapUnregistered);
    const seenGroup = new Set();
    const plans = [];
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
    return plans;
  };

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
    // 2026-11-02 원본(캐드) PDF가 그림을 그린 뒤 남긴 그리기 상태(선 모양·점선·글자 모드 …)가 덧그리는 마킹에 새지 않게 q … Q로 가둔다
    isolatePageGraphicsState(outDoc, page);
    // 2026-10-30 페이지 회전(/Rotate 90·180·270)·자르기 상자 원점 반영.
    // 마킹 좌표는 pdf.js가 회전까지 적용해 그린 그림 기준인데, pdf-lib는 회전 전 좌표계에 그려서
    // /Rotate 180 도면은 마킹이 180° 돌아 나왔다 → 화면에 보이는 좌표계로 cm 행렬을 한 번 깔고 그린다.
    const view = window.vectorPdfDisplayFrame(page);
    const width = view.width;
    const height = view.height;
    if (view.matrix && typeof page.pushOperators === 'function' && PDFLib.concatTransformationMatrix) {
      page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.concatTransformationMatrix(...view.matrix));
    }
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
    if (!plans) plans = window.buildVectorPinPlansForDefects(defects, measureCtx);

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
          box.x, box.y, fontSize, p.fill ? rgb(1, 1, 1) : color,
          { halo: !p.fill }
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

    if (view.matrix && typeof page.pushOperators === 'function' && PDFLib.concatTransformationMatrix) {
      page.pushOperators(PDFLib.popGraphicsState());
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

  /** 한 층 결함위치도 벡터 PDF Blob 생성 (다운로드는 호출측) */
  window.buildFloorDefectVectorPdfBlob = async function (bldg, floorCode, buildingId) {
    if (!bldg || !floorCode) throw new Error('층 정보가 없습니다.');
    const pdfDataUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode);
    if (!pdfDataUrl) {
      const err = new Error('NO_PDF');
      err.code = 'NO_PDF';
      throw err;
    }
    const id = buildingId || bldg.id || (window.state && window.state.currentBuildingId) || '';
    const key = `${id}_${floorCode}`;
    // 2026-10-30 전층 출력: 결함에 층·건물 정보가 없으면 핀 방향 계산(층별 도면 회전)이 「지금 보는 층」 회전을 써서
    // 다른 층 마킹이 돌아가 나왔다 → 그 층 코드를 붙인 사본으로 넘긴다(저장 데이터는 안 건드림)
    const defects = ((window.state && window.state.defects && window.state.defects[key]) || []).map((d) => (
      d && (!d.floorCode || !d.buildingId) ? Object.assign({}, d, { floorCode: d.floorCode || floorCode, buildingId: d.buildingId || id }) : d
    ));
    let imgW;
    let imgH;
    const stRef = window.state && window.state.floorPlanRef;
    if (stRef && bldg && stRef.bldgId === bldg.id && stRef.floorCode === floorCode && stRef.w > 0 && stRef.h > 0) {
      imgW = stRef.w;
      imgH = stRef.h;
    } else if (typeof window.getPdfRefPixelSize === 'function') {
      const dim = window.FLOOR_DRAWING_PDF_PREVIEW_DIM || 4000;
      const size = await window.getPdfRefPixelSize(pdfDataUrl, dim, key);
      imgW = size.w;
      imgH = size.h;
    } else {
      const dims = window.getFloorPlanRefDimensions(bldg, floorCode);
      imgW = dims.w;
      imgH = dims.h;
    }
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    const legendPlan = (typeof window.buildVectorLegendDrawPlan === 'function')
      ? window.buildVectorLegendDrawPlan(measureCtx, imgW, imgH, floorCode)
      : null;
    return window.exportFloorPlanVectorPdf(pdfDataUrl, defects, imgW, imgH, { legendPlan });
  };

  /** 건물 층 코드 목록 (드롭다운과 동일 기준) */
  window.listFloorsForVectorPdfExport = function (bldg) {
    if (!bldg) return [];
    let floors = [];
    if (typeof window.getBuildingAvailableFloors === 'function') {
      floors = window.getBuildingAvailableFloors(bldg) || [];
    } else if (Array.isArray(bldg.floorsList)) {
      floors = bldg.floorsList.slice();
    }
    const codes = [];
    const seen = new Set();
    floors.forEach((f) => {
      const code = f && (f.floorCode || f);
      if (!code) return;
      const s = String(code);
      if (seen.has(s)) return;
      seen.add(s);
      codes.push(s);
    });
    return codes;
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
    try {
      const blob = await window.buildFloorDefectVectorPdfBlob(bldg, floorCode, state.currentBuildingId);
      const safeFloor = String(floorCode || 'floor').replace(/[\\/:*?"<>|]/g, '_');
      window.downloadBlobFile(blob, `결함위치도_벡터_${safeFloor}_${Date.now()}.pdf`);
      if (typeof window.showToast === 'function') {
        window.showToast('벡터 PDF 내보내기 완료 (마킹·범례 표 적용)', 'success', 4000);
      }
    } catch (err) {
      console.error(err);
      if (err && err.code === 'NO_PDF') {
        if (typeof window.showToast === 'function') {
          window.showToast('PDF 원본을 서버에서 불러오지 못했습니다. 동기화·로그인 상태를 확인하거나 PC에서 PDF를 다시 등록해 주세요.', 'warning', 6000);
        }
      } else if (typeof window.showToast === 'function') {
        window.showToast(`벡터 PDF 내보내기 실패: ${err.message || err}`, 'error', 6000);
      }
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  /** 각 층 벡터 PDF를 한 파일로 이어 붙임 (층 순서 = 점검층 목록) */
  window.exportAllFloorsVectorPdf = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      if (typeof window.showToast === 'function') window.showToast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    if (typeof PDFLib === 'undefined') {
      if (typeof window.showToast === 'function') window.showToast('pdf-lib가 로드되지 않았습니다.', 'error');
      return;
    }
    const bldg = state.currentBuilding;
    const floorCodes = window.listFloorsForVectorPdfExport(bldg);
    if (!floorCodes.length) {
      if (typeof window.showToast === 'function') window.showToast('내보낼 층이 없습니다.', 'warning');
      return;
    }

    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();
    let ok = 0;
    const skipped = [];

    if (typeof window.showLoading === 'function') {
      window.showLoading(`전층 벡터 PDF 준비 중 (0/${floorCodes.length})...`);
    }
    try {
      for (let i = 0; i < floorCodes.length; i++) {
        const floorCode = floorCodes[i];
        if (typeof window.showLoading === 'function') {
          window.showLoading(`전층 벡터 PDF (${i + 1}/${floorCodes.length}) ${floorCode}...`);
        }
        try {
          const blob = await window.buildFloorDefectVectorPdfBlob(bldg, floorCode, state.currentBuildingId);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const src = await PDFDocument.load(bytes);
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
          ok += 1;
        } catch (e) {
          console.warn('[exportAllFloorsVectorPdf] skip', floorCode, e);
          skipped.push(floorCode);
        }
      }
      if (!ok) {
        if (typeof window.showToast === 'function') {
          window.showToast('PDF 원본이 있는 층이 없어 전층 벡터 PDF를 만들지 못했습니다.', 'warning', 6000);
        }
        return;
      }
      const pdfBytes = await merged.save();
      const outBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const bldgName = String((bldg && (bldg.name || bldg.buildingName)) || state.currentBuildingId || 'building')
        .replace(/[\\/:*?"<>|]/g, '_');
      window.downloadBlobFile(outBlob, `결함위치도_벡터_전층_${bldgName}_${Date.now()}.pdf`);
      if (typeof window.showToast === 'function') {
        const skipMsg = skipped.length ? ` (제외 ${skipped.length}층: PDF 없음 등)` : '';
        window.showToast(`전층 벡터 PDF 완료 — ${ok}층 묶음${skipMsg}`, 'success', 5000);
      }
    } catch (err) {
      console.error(err);
      if (typeof window.showToast === 'function') {
        window.showToast(`전층 벡터 PDF 실패: ${err.message || err}`, 'error', 6000);
      }
    } finally {
      if (typeof window.hideLoading === 'function') window.hideLoading();
    }
  };

  /** 벡터 PDF: 현재 층 / 전층 한 PDF 선택 */
  window.exportVectorPdfWithScopeChoice = async function () {
    const state = window.state;
    if (!state || !state.currentBuildingId) {
      if (typeof window.showToast === 'function') window.showToast('건물을 먼저 선택하세요.', 'warning');
      return;
    }
    const floors = window.listFloorsForVectorPdfExport(state.currentBuilding);
    if (floors.length <= 1) {
      return window.exportCurrentFloorVectorPdf();
    }
    // 2026-10-30 기본 prompt 창은 앱 창(WebView2·안드로이드·대화상자 막힘)에서 안 뜨고 null만 돌려줘서
    // 「버튼 눌러도 아무 일 없음」이 됐다 → 앱 공용 선택 창(appChoose) 사용, 없을 때만 기본 prompt
    if (typeof window.appChoose === 'function') {
      const k = await window.appChoose('벡터 PDF 범위를 고르세요.', [
        { label: '현재 층만', detail: String(state.currentFloor || '-') },
        { label: '각 층 전부 한 PDF로', detail: floors.length + '층' }
      ], { title: '벡터 PDF', okText: '내보내기', defaultIndex: 1 });
      if (k === null || k === undefined) return;
      return k === 1 ? window.exportAllFloorsVectorPdf() : window.exportCurrentFloorVectorPdf();
    }
    const choice = window.prompt(
      '벡터 PDF 범위 선택\n\n1 = 현재 층만 (' + (state.currentFloor || '-') + ')\n2 = 각 층 전부 한 PDF로 (' + floors.length + '층)\n\n숫자 입력 후 확인',
      '2'
    );
    if (choice === null) return;
    const v = String(choice).trim();
    if (v === '2' || v === '전층' || v.toLowerCase() === 'all') {
      return window.exportAllFloorsVectorPdf();
    }
    return window.exportCurrentFloorVectorPdf();
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
