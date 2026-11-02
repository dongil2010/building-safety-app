/**
 * CAD 벡터 PDF 스냅 엔진
 * - 캐드에서 출력한 벡터 PDF(도면) 안의 선분 좌표를 pdf.js getOperatorList()로 직접 읽어서
 *   결함 핀을 찍을 때 근처 CAD 선/끝점/교차점에 자동으로 달라붙게(snap) 한다.
 * - 좌표계는 floorPlanRef(핀 저장 기준 좌표계)와 동일하게 맞춘다: 같은 targetLongSide로 만든
 *   page.getViewport({scale}) 의 convertToViewportPoint()를 그대로 사용 — 회전/스케일을 따로 계산하지 않는다.
 * - 래스터(JPG/PNG)로 올린 도면은 벡터 데이터가 없으므로 스냅 대상에서 제외된다.
 */
(function () {
  const GRID_CELL = 50;       // floorPlanRef 픽셀 기준 그리드 셀 크기
  const MIN_SEG_LEN = 3;      // 이보다 짧은 선분은 해칭/점선 노이즈로 보고 버림
  const MAX_SEGMENTS = 8000;  // 초과 시 긴 선분 위주로만 남김
  const MAX_CANDIDATES = 300; // 스냅 판정 시 한 번에 볼 후보 선분 수 상한
  const MAX_PAIR_CHECKS = 4000;

  const cache = new Map(); // key(`${bldgId}_${floorCode}`) -> { status, segments, grid, w, h }

  function mulMatrix(m1, m2) {
    return [
      m1[0] * m2[0] + m1[1] * m2[2],
      m1[0] * m2[1] + m1[1] * m2[3],
      m1[2] * m2[0] + m1[3] * m2[2],
      m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
      m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
    ];
  }
  function applyMatrix(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  /** 원본 PDF 콘텐츠 스트림에서 선분(도면 원본 좌표)을 뽑아, viewport 기준 픽셀 좌표로 변환한다 */
  function extractSegments(opList, viewport, OPS) {
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const raw = [];

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      if (fn === OPS.save) {
        stack.push(ctm.slice());
      } else if (fn === OPS.restore) {
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        ctm = mulMatrix(args, ctm);
      } else if (fn === OPS.constructPath) {
        const ops = args[0];
        const coords = args[1];
        let x = 0, y = 0, sx = 0, sy = 0, ci = 0;
        for (let k = 0; k < ops.length; k++) {
          const op = ops[k];
          if (op === OPS.moveTo) {
            x = coords[ci++]; y = coords[ci++];
            sx = x; sy = y;
          } else if (op === OPS.lineTo) {
            const nx = coords[ci++], ny = coords[ci++];
            const p1 = applyMatrix(ctm, x, y), p2 = applyMatrix(ctm, nx, ny);
            raw.push([p1[0], p1[1], p2[0], p2[1]]);
            x = nx; y = ny;
          } else if (op === OPS.curveTo) {
            const x3 = coords[ci + 4], y3 = coords[ci + 5];
            const p1 = applyMatrix(ctm, x, y), p2 = applyMatrix(ctm, x3, y3);
            raw.push([p1[0], p1[1], p2[0], p2[1]]); // 곡선은 시작~끝점 직선으로 근사 (CAD 도면은 대부분 직선)
            ci += 6; x = x3; y = y3;
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            const x2 = coords[ci + 2], y2 = coords[ci + 3];
            const p1 = applyMatrix(ctm, x, y), p2 = applyMatrix(ctm, x2, y2);
            raw.push([p1[0], p1[1], p2[0], p2[1]]);
            ci += 4; x = x2; y = y2;
          } else if (op === OPS.rectangle) {
            const rx = coords[ci++], ry = coords[ci++], rw = coords[ci++], rh = coords[ci++];
            const corners = [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh], [rx, ry]];
            for (let c = 0; c < 4; c++) {
              const p1 = applyMatrix(ctm, corners[c][0], corners[c][1]);
              const p2 = applyMatrix(ctm, corners[c + 1][0], corners[c + 1][1]);
              raw.push([p1[0], p1[1], p2[0], p2[1]]);
            }
            x = rx; y = ry; sx = rx; sy = ry;
          } else if (op === OPS.closePath) {
            const p1 = applyMatrix(ctm, x, y), p2 = applyMatrix(ctm, sx, sy);
            raw.push([p1[0], p1[1], p2[0], p2[1]]);
            x = sx; y = sy;
          }
        }
      }
    }

    return raw;
  }

  function filterAndTransform(rawSegments, viewport) {
    const out = [];
    for (const s of rawSegments) {
      const p1 = viewport.convertToViewportPoint(s[0], s[1]);
      const p2 = viewport.convertToViewportPoint(s[2], s[3]);
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < MIN_SEG_LEN) continue;
      out.push([p1[0], p1[1], p2[0], p2[1], len]);
    }
    if (out.length > MAX_SEGMENTS) {
      out.sort((a, b) => b[4] - a[4]);
      out.length = MAX_SEGMENTS;
    }
    return out.map(s => [s[0], s[1], s[2], s[3]]);
  }

  /**
   * 2026-11-02 행·열 자동 잡기용 자료 — 스냅 선분(상한 8000)과 따로, 수직·수평 선분 전부와 작은 선분(축 번호 모양)을 모은다.
   * 좌표는 스냅과 같은 viewport 픽셀 좌표(= 핀·행열 선 좌표계).
   */
  function buildDetectData(raw, viewport) {
    const L = Math.max(viewport.width, viewport.height, 1);
    const smallMax = L * 0.04;
    const segments = [];
    const small = [];
    for (const s of raw) {
      const p1 = viewport.convertToViewportPoint(s[0], s[1]);
      const p2 = viewport.convertToViewportPoint(s[2], s[3]);
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) continue;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if ((ax <= ay * 0.02 || ay <= ax * 0.02) && segments.length < 80000) segments.push([p1[0], p1[1], p2[0], p2[1]]);
      if (len <= smallMax && small.length < 60000) small.push([p1[0], p1[1], p2[0], p2[1]]);
    }
    return { segments, small, texts: [] };
  }

  /** PDF 글자(있으면) → viewport 픽셀 좌표의 가운데. CAD 글자가 선으로 그려진 PDF는 글자가 없다(그땐 작은 선 모양으로 판정) */
  async function readTexts(page, viewport) {
    const out = [];
    try {
      const tc = await page.getTextContent();
      for (const it of (tc.items || [])) {
        const str = String(it.str || '').trim();
        if (!str || !it.transform) continue;
        const tr = it.transform;
        const len = Math.hypot(tr[0], tr[1]) || 1;
        const w = Number(it.width) || 0;
        const p0 = viewport.convertToViewportPoint(tr[4], tr[5]);
        const p1 = viewport.convertToViewportPoint(tr[4] + (tr[0] / len) * w, tr[5] + (tr[1] / len) * w);
        out.push({ str, x: (p0[0] + p1[0]) / 2, y: (p0[1] + p1[1]) / 2 });
        if (out.length >= 20000) break;
      }
    } catch (_e) { /* 글자 없이도 동작 */ }
    return out;
  }

  function buildGrid(segments) {
    const grid = new Map();
    segments.forEach((s, i) => {
      const minX = Math.min(s[0], s[2]), maxX = Math.max(s[0], s[2]);
      const minY = Math.min(s[1], s[3]), maxY = Math.max(s[1], s[3]);
      const cx0 = Math.floor(minX / GRID_CELL), cx1 = Math.floor(maxX / GRID_CELL);
      const cy0 = Math.floor(minY / GRID_CELL), cy1 = Math.floor(maxY / GRID_CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const key = cx + ',' + cy;
          let arr = grid.get(key);
          if (!arr) { arr = []; grid.set(key, arr); }
          arr.push(i);
        }
      }
    });
    return grid;
  }

  function segIntersect(s1, s2) {
    const x1 = s1[0], y1 = s1[1], x2 = s1[2], y2 = s1[3];
    const x3 = s2[0], y3 = s2[1], x4 = s2[2], y4 = s2[3];
    const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) return null;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }

  async function ensureGeometry(pdfDataUrl, bldgId, floorCode, refDim) {
    if (!pdfDataUrl || !bldgId || !floorCode || typeof pdfjsLib === 'undefined') return false;
    const key = bldgId + '_' + floorCode;
    const existing = cache.get(key);
    if (existing && existing.status === 'ready') return true;
    if (existing && existing.status === 'pending') return existing.promise;

    const entry = { status: 'pending' };
    const task = (async () => {
      try {
        const { page, baseViewport } = await acquirePdfPageFromDataUrl(pdfDataUrl, key);
        const dim = refDim || window.FLOOR_DRAWING_PDF_PREVIEW_DIM || 4000;
        const scale = dim / Math.max(baseViewport.width, baseViewport.height, 1);
        const viewport = page.getViewport({ scale });
        const opList = await page.getOperatorList();
        const raw = extractSegments(opList, viewport, pdfjsLib.OPS);
        const segments = filterAndTransform(raw, viewport);
        entry.segments = segments;
        try {
          entry.detect = buildDetectData(raw, viewport);
          entry.detect.texts = await readTexts(page, viewport);
        } catch (_e) { entry.detect = null; }
        entry.grid = buildGrid(segments);
        entry.w = Math.round(viewport.width);
        entry.h = Math.round(viewport.height);
        entry.status = 'ready';
        return true;
      } catch (e) {
        console.warn('CAD 벡터 스냅 geometry 추출 실패:', e);
        entry.status = 'error';
        return false;
      }
    })();
    entry.promise = task;
    cache.set(key, entry);
    return task;
  }

  function isReady(bldgId, floorCode) {
    const entry = cache.get(bldgId + '_' + floorCode);
    return !!entry && entry.status === 'ready';
  }

  function snap(bldgId, floorCode, x, y, radius) {
    const entry = cache.get(bldgId + '_' + floorCode);
    if (!entry || entry.status !== 'ready' || !radius || radius <= 0) return null;
    const { segments, grid } = entry;

    const cx0 = Math.floor((x - radius) / GRID_CELL), cx1 = Math.floor((x + radius) / GRID_CELL);
    const cy0 = Math.floor((y - radius) / GRID_CELL), cy1 = Math.floor((y + radius) / GRID_CELL);
    const seen = new Set();
    const candIdx = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const arr = grid.get(cx + ',' + cy);
        if (!arr) continue;
        for (const i of arr) {
          if (!seen.has(i)) { seen.add(i); candIdx.push(i); }
        }
      }
    }
    if (!candIdx.length) return null;
    if (candIdx.length > MAX_CANDIDATES) {
      // 예전엔 그리드 순회 순서(좌상단 셀 우선) 그대로 잘라서, 커서 바로 옆 우·하단 선이
      // 후보에서 빠지고 멀리 있는 좌상단 선에 스냅되는 일이 있었다. 커서까지의 실제
      // 거리순으로 추려야 가장 가까운 선이 남는다.
      const scored = candIdx.map((i) => {
        const s = segments[i];
        const sdx = s[2] - s[0], sdy = s[3] - s[1];
        const len2 = sdx * sdx + sdy * sdy;
        let t = len2 > 0 ? ((x - s[0]) * sdx + (y - s[1]) * sdy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = s[0] + sdx * t - x, py = s[1] + sdy * t - y;
        return { i: i, d: px * px + py * py };
      });
      scored.sort((a, b) => a.d - b.d);
      candIdx.length = 0;
      for (let k = 0; k < MAX_CANDIDATES; k++) candIdx.push(scored[k].i);
    }

    let best = null;
    const consider = (px, py, type, weight) => {
      const dx = px - x, dy = py - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) return;
      const eff = dist * weight;
      if (!best || eff < best.eff) best = { x: px, y: py, type, eff };
    };

    for (const i of candIdx) {
      const s = segments[i];
      consider(s[0], s[1], 'endpoint', 0.75);
      consider(s[2], s[3], 'endpoint', 0.75);
      const dx = s[2] - s[0], dy = s[3] - s[1];
      const len2 = dx * dx + dy * dy;
      if (len2 > 0) {
        let t = ((x - s[0]) * dx + (y - s[1]) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        consider(s[0] + dx * t, s[1] + dy * t, 'line', 1.0);
      }
    }

    let pairCount = 0;
    outer:
    for (let a = 0; a < candIdx.length; a++) {
      for (let b = a + 1; b < candIdx.length; b++) {
        if (pairCount++ > MAX_PAIR_CHECKS) break outer;
        const p = segIntersect(segments[candIdx[a]], segments[candIdx[b]]);
        if (p) consider(p[0], p[1], 'intersection', 0.6);
      }
    }

    return best ? { x: best.x, y: best.y, type: best.type } : null;
  }

  /** 행·열 자동 잡기 자료: { segments, small, texts, w, h } 또는 null(캐드 PDF 원본이 없거나 아직 못 읽음) */
  function getDetectionData(bldgId, floorCode) {
    const entry = cache.get(bldgId + '_' + floorCode);
    if (!entry || entry.status !== 'ready' || !entry.detect) return null;
    return { segments: entry.detect.segments, small: entry.detect.small, texts: entry.detect.texts, w: entry.w, h: entry.h };
  }

  window.BSA_PDF_SNAP = { ensureGeometry, isReady, snap, getDetectionData };
})();
