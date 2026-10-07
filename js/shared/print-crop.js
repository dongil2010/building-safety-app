/**
 * 위치도 출력 범위 — 순수 계산 모듈 (DOM 없음, 2026-10-07)
 *
 * 도면에 여백이 많으면 한글·PDF 위치도에서 결함 박스가 작게 나온다. 층마다 "출력 범위"(도면 이미지
 * 좌표의 사각형)를 정해 두면 그 부분만 종이에 꽉 차게 넣는다. 범위가 없는 층은 예전처럼 도면 전체.
 *
 * - normalizeCrop: 저장값을 도면 안으로 맞추고, 너무 작거나 도면 전체와 같으면 null(= 기본).
 * - inkBounds: 그림에서 "내용이 있는 범위". 도면 가장자리의 테두리선(도곽)은 내용으로 치지 않는다 —
 *   테두리선을 내용으로 치면 여백이 하나도 안 잘린다.
 * - fitCrop: 범위를 세로 종이에 넣을 때의 회전 여부·배율·그림 크기.
 * - legendOriginInCrop 등은 app.js 가 범례를 범위 안 같은 구석에 다시 놓을 때 쓴다.
 */
(function (root) {
    'use strict';

    const MIN_SIDE_RATIO = 0.05;   // 도면 한 변의 5%보다 작은 범위는 실수로 본다
    const FULL_TOLERANCE = 0.005;  // 도면 전체와 0.5% 이내로 같으면 "기본"과 같다

    function num(v) {
        const n = Number(v);
        return isFinite(n) ? n : NaN;
    }

    /** { x, y, w, h } (이미지 좌표) → 도면 안으로 자른 값. 쓸 수 없으면 null. */
    function normalizeCrop(crop, imgW, imgH) {
        if (!crop || typeof crop !== 'object') return null;
        const W = num(imgW);
        const H = num(imgH);
        if (!(W > 0) || !(H > 0)) return null;
        let x = num(crop.x);
        let y = num(crop.y);
        let w = num(crop.w);
        let h = num(crop.h);
        if ([x, y, w, h].some((v) => isNaN(v))) return null;
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        const x2 = Math.min(W, x + w);
        const y2 = Math.min(H, y + h);
        x = Math.max(0, x);
        y = Math.max(0, y);
        w = x2 - x;
        h = y2 - y;
        if (w < W * MIN_SIDE_RATIO || h < H * MIN_SIDE_RATIO) return null;
        if (x <= W * FULL_TOLERANCE && y <= H * FULL_TOLERANCE
            && w >= W * (1 - 2 * FULL_TOLERANCE) && h >= H * (1 - 2 * FULL_TOLERANCE)) return null;
        const out = { x, y, w, h };
        const lc = validCorner(crop.lc);
        if (lc) out.lc = lc;   // 범례를 놓을 구석(없으면 도면 전체에서의 상대 위치 그대로)
        return out;
    }

    const CORNERS = ['tl', 'tr', 'bl', 'br'];
    function validCorner(c) {
        return CORNERS.indexOf(c) >= 0 ? c : null;
    }

    /** 범위(cw × ch) 안에서 그 구석에 범례(boxW × boxH)를 놓을 때의 왼쪽 위 좌표(범위 기준) */
    function cornerOrigin(corner, cw, ch, boxW, boxH, margin) {
        const m = margin || 0;
        const right = corner === 'tr' || corner === 'br';
        const bottom = corner === 'bl' || corner === 'br';
        return {
            x: right ? Math.max(0, cw - boxW - m) : m,
            y: bottom ? Math.max(0, ch - boxH - m) : m
        };
    }

    /** 사각형 안의 "내용" 픽셀 수 — 범례를 놓아도 도면을 가리지 않는 구석을 고를 때 쓴다 */
    function inkCount(data, w, h, rect, darkBelow) {
        if (!data || !rect) return 0;
        const th = darkBelow != null ? darkBelow : 235;
        const x1 = Math.max(0, Math.floor(rect.x));
        const y1 = Math.max(0, Math.floor(rect.y));
        const x2 = Math.min(w, Math.ceil(rect.x + rect.w));
        const y2 = Math.min(h, Math.ceil(rect.y + rect.h));
        let n = 0;
        for (let y = y1; y < y2; y++) {
            for (let x = x1; x < x2; x++) {
                const i = (y * w + x) * 4;
                if (data[i + 3] < 16) continue;
                if ((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000 < th) n++;
            }
        }
        return n;
    }

    /**
     * 저장용: 도면 크기에 대한 비율(0~1)로 바꾼다. 도면을 같은 비율의 더 선명한 파일로 바꿔도 범위가 유지된다.
     * 저장 형태 { nx, ny, nw, nh }.
     */
    function toStored(crop, imgW, imgH) {
        const c = normalizeCrop(crop, imgW, imgH);
        if (!c) return null;
        const r = (v) => Math.round(v * 1e5) / 1e5;
        const out = { nx: r(c.x / imgW), ny: r(c.y / imgH), nw: r(c.w / imgW), nh: r(c.h / imgH) };
        if (c.lc) out.lc = c.lc;
        return out;
    }

    function fromStored(stored, imgW, imgH) {
        if (!stored || typeof stored !== 'object') return null;
        const vals = [stored.nx, stored.ny, stored.nw, stored.nh].map(num);
        if (vals.some((v) => isNaN(v))) return null;
        return normalizeCrop({
            x: vals[0] * imgW, y: vals[1] * imgH, w: vals[2] * imgW, h: vals[3] * imgH, lc: stored.lc
        }, imgW, imgH);
    }

    /**
     * 그림에서 내용이 있는 범위를 찾는다.
     * data: RGBA 바이트 배열(ImageData.data), w·h: 그 크기.
     * opts.darkBelow: 이 밝기보다 어두우면 "내용"(기본 235 — 옅은 회색 선도 잡는다)
     * opts.frameBand: 가장자리에서 이 비율 안에 있고(기본 0.08) 한 줄의 opts.frameCover(기본 0.6) 이상이
     *                 채워진 줄은 테두리선으로 보고 뺀다.
     * 반환 { x, y, w, h } (data 와 같은 좌표). 내용이 없으면 null.
     */
    function inkBounds(data, w, h, opts) {
        const o = opts || {};
        const darkBelow = o.darkBelow != null ? o.darkBelow : 235;
        const frameBand = o.frameBand != null ? o.frameBand : 0.08;
        const frameCover = o.frameCover != null ? o.frameCover : 0.6;
        if (!data || !(w > 0) || !(h > 0)) return null;

        const dark = new Uint8Array(w * h);
        const rowCount = new Int32Array(h);
        const colCount = new Int32Array(w);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                if (data[i + 3] < 16) continue;                       // 투명
                const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
                if (lum < darkBelow) {
                    dark[y * w + x] = 1;
                    rowCount[y]++;
                    colCount[x]++;
                }
            }
        }

        // 테두리선: 가장자리 띠 안에 있으면서 거의 한 줄을 다 채운 행·열
        const frameRow = new Uint8Array(h);
        const frameCol = new Uint8Array(w);
        const bandY = Math.max(1, Math.round(h * frameBand));
        const bandX = Math.max(1, Math.round(w * frameBand));
        for (let y = 0; y < h; y++) {
            if ((y < bandY || y >= h - bandY) && rowCount[y] >= w * frameCover) frameRow[y] = 1;
        }
        for (let x = 0; x < w; x++) {
            if ((x < bandX || x >= w - bandX) && colCount[x] >= h * frameCover) frameCol[x] = 1;
        }
        // 테두리선은 안티에일리어싱으로 옆 줄까지 번진다 — 양옆 한 줄씩 같이 뺀다
        const widen = (flags) => {
            const out = new Uint8Array(flags.length);
            for (let i = 0; i < flags.length; i++) {
                if (flags[i] || (i > 0 && flags[i - 1]) || (i + 1 < flags.length && flags[i + 1])) out[i] = 1;
            }
            return out;
        };
        const fRow = widen(frameRow);
        const fCol = widen(frameCol);

        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y++) {
            if (fRow[y]) continue;
            for (let x = 0; x < w; x++) {
                if (fCol[x] || !dark[y * w + x]) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) return null;
        return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    /** 사각형에 여유(pad, 같은 좌표 단위)를 두르고 [0,W]×[0,H] 안으로 자른다. */
    function padRect(rect, pad, W, H) {
        if (!rect) return null;
        const x1 = Math.max(0, rect.x - pad);
        const y1 = Math.max(0, rect.y - pad);
        const x2 = Math.min(W, rect.x + rect.w + pad);
        const y2 = Math.min(H, rect.y + rect.h + pad);
        return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
    }

    /** 작은 미리보기 좌표의 사각형을 도면 좌표로 */
    function scaleRect(rect, sx, sy) {
        if (!rect) return null;
        return { x: rect.x * sx, y: rect.y * sy, w: rect.w * sx, h: rect.h * sy };
    }

    /**
     * 범위(가로 cw × 세로 ch)를 세로 종이(maxW × maxH)에 넣는다.
     * 가로로 긴 범위는 왼쪽으로 90° 돌려 세운다(도면 전체를 넣을 때와 같은 방향).
     * 단, 돌려서 얻는 이득이 10%도 안 되면(정사각에 가까운 범위) 똑바로 둔다 — 읽기 편한 쪽이 낫다.
     * 반환 { rotate, scale, canvasW, canvasH } — 그림은 여백 없이 범위에 딱 맞는 크기.
     */
    function fitCrop(cw, ch, maxW, maxH) {
        const upright = Math.min(maxW / cw, maxH / ch);
        const turned = Math.min(maxW / ch, maxH / cw);
        const rotate = turned > upright * 1.1;
        const w = rotate ? ch : cw;
        const h = rotate ? cw : ch;
        const scale = rotate ? turned : upright;
        return {
            rotate,
            scale,
            canvasW: Math.max(1, Math.round(w * scale)),
            canvasH: Math.max(1, Math.round(h * scale))
        };
    }

    const api = {
        normalizeCrop, toStored, fromStored, inkBounds, inkCount, padRect, scaleRect, fitCrop,
        cornerOrigin, validCorner, CORNERS, MIN_SIDE_RATIO, FULL_TOLERANCE
    };
    root.BSA = root.BSA || {};
    root.BSA.printCrop = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
