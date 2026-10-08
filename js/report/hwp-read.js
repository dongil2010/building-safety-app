/**
 * HWP(한글 5.x 바이너리) 문서에서 표만 읽는다. (report-summary.html 전용, 읽기 전용)
 *
 * 전회차 보고서는 .hwp로 보관돼 있어서, 거기 실린 「주요 점검결과」를 금회차와 견주려면
 * 이 형식을 직접 읽어야 한다. 서식·그림은 보지 않고 표의 칸 글자만 꺼낸다.
 *
 * 구조: OLE 복합문서(CFB) 안의 BodyText/SectionN 스트림(raw deflate) → 레코드 나열.
 * 압축 풀기는 밖에서 받는다(브라우저 DecompressionStream / node zlib).
 */
(function (root) {
    'use strict';

    const END = 0xfffffffe;
    const FREE = 0xffffffff;

    const TAG_PARA_TEXT = 67;
    const TAG_LIST_HEADER = 72;
    const TAG_TABLE = 77;

    function u16(b, o) { return b[o] | (b[o + 1] << 8); }
    function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

    function concat(parts, size) {
        let total = 0;
        parts.forEach((p) => { total += p.length; });
        const out = new Uint8Array(total);
        let o = 0;
        parts.forEach((p) => { out.set(p, o); o += p.length; });
        return size == null ? out : out.subarray(0, size);
    }

    /** OLE 복합문서에서 이름으로 스트림을 꺼내는 함수를 돌려준다 */
    function openCfb(bytes) {
        if (bytes.length < 512 || u32(bytes, 0) !== 0xe011cfd0 || u32(bytes, 4) !== 0xe11ab1a1) {
            throw new Error('한글(.hwp) 파일이 아닙니다.');
        }
        const secSize = 1 << u16(bytes, 0x1e);
        const miniSize = 1 << u16(bytes, 0x20);
        const nFat = u32(bytes, 0x2c);
        const dirStart = u32(bytes, 0x30);
        const miniCutoff = u32(bytes, 0x38);
        const miniFatStart = u32(bytes, 0x3c);
        const secOff = (n) => (n + 1) * secSize;

        const difat = [];
        for (let i = 0; i < 109; i++) difat.push(u32(bytes, 0x4c + i * 4));
        let difatSec = u32(bytes, 0x44);
        let guard = 0;
        while (difatSec !== END && difatSec !== FREE && guard++ < 100000) {
            const o = secOff(difatSec);
            for (let i = 0; i < secSize / 4 - 1; i++) difat.push(u32(bytes, o + i * 4));
            difatSec = u32(bytes, o + secSize - 4);
        }
        const fat = [];
        difat.slice(0, nFat).forEach((s) => {
            if (s === FREE || s === END) return;
            const o = secOff(s);
            for (let i = 0; i < secSize / 4; i++) fat.push(u32(bytes, o + i * 4));
        });
        const chain = (start, table) => {
            const r = [];
            let s = start;
            let n = 0;
            while (s !== END && s !== FREE && s < table.length && n++ < 5000000) { r.push(s); s = table[s]; }
            return r;
        };
        const readBig = (start, size) => concat(chain(start, fat).map((s) => bytes.subarray(secOff(s), secOff(s) + secSize)), size);

        const dir = readBig(dirStart);
        const entries = [];
        for (let o = 0; o + 128 <= dir.length; o += 128) {
            const nameLen = u16(dir, o + 0x40);
            let name = '';
            for (let i = 0; i + 2 < nameLen; i += 2) name += String.fromCharCode(u16(dir, o + i));
            entries.push({
                name: name, type: dir[o + 0x42],
                left: u32(dir, o + 0x44), right: u32(dir, o + 0x48), child: u32(dir, o + 0x4c),
                start: u32(dir, o + 0x74), size: u32(dir, o + 0x78)
            });
        }
        const rootEntry = entries[0];
        const miniStream = readBig(rootEntry.start, rootEntry.size);
        const miniFat = [];
        if (miniFatStart !== END && miniFatStart !== FREE) {
            const mf = readBig(miniFatStart);
            for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
        }
        const paths = {};
        const walk = (idx, prefix, depth) => {
            if (idx === FREE || idx >= entries.length || depth > 4096) return;
            const e = entries[idx];
            walk(e.left, prefix, depth + 1);
            paths[prefix + e.name] = e;
            if (e.type === 1) walk(e.child, prefix + e.name + '/', depth + 1);
            walk(e.right, prefix, depth + 1);
        };
        walk(rootEntry.child, '', 0);

        return {
            names: Object.keys(paths),
            read(name) {
                const e = paths[name];
                if (!e) return null;
                if (e.size >= miniCutoff) return readBig(e.start, e.size);
                return concat(chain(e.start, miniFat).map((s) => miniStream.subarray(s * miniSize, (s + 1) * miniSize)), e.size);
            }
        };
    }

    // 문단 글자 속 제어문자: 8글자 자리를 차지하는 것들은 건너뛴다
    const WIDE_CTRL = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 11: 1, 12: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 23: 1 };

    function paraText(d) {
        let s = '';
        for (let i = 0; i + 2 <= d.length; i += 2) {
            const c = u16(d, i);
            if (c >= 32) { s += String.fromCharCode(c); continue; }
            if (WIDE_CTRL[c]) { if (c === 9) s += ' '; i += 14; continue; }
            if (c === 10) s += ' ';
        }
        return s;
    }

    /**
     * 구역 레코드에서 표를 뽑는다. 표 안의 표는 따로 한 개로 나오고, 바깥 칸 글자에는 섞이지 않는다.
     * @returns {Array<{rows: number, cols: number, cells: Array<{row: number, col: number, lines: string[]}>}>}
     */
    function tablesFromSection(sec) {
        const tables = [];
        const stack = [];
        let o = 0;
        while (o + 4 <= sec.length) {
            const h = u32(sec, o);
            o += 4;
            const tag = h & 0x3ff;
            const level = (h >>> 10) & 0x3ff;
            let size = h >>> 20;
            if (size === 0xfff) { size = u32(sec, o); o += 4; }
            const data = sec.subarray(o, o + size);
            o += size;

            while (stack.length && level < stack[stack.length - 1].level) stack.pop();
            const top = stack[stack.length - 1];

            if (tag === TAG_TABLE && data.length >= 8) {
                const t = { level: level, rows: u16(data, 4), cols: u16(data, 6), cells: [], cur: null };
                tables.push(t);
                stack.push(t);
            } else if (tag === TAG_LIST_HEADER && top && level === top.level && data.length >= 16) {
                top.cur = { col: u16(data, 8), row: u16(data, 10), lines: [] };
                top.cells.push(top.cur);
            } else if (tag === TAG_PARA_TEXT && top && top.cur && level > top.level) {
                const t = paraText(data).replace(/\s+/g, ' ').trim();
                if (t) top.cur.lines.push(t);
            }
        }
        return tables.map((t) => ({ rows: t.rows, cols: t.cols, cells: t.cells }));
    }

    /**
     * @param {ArrayBuffer|Uint8Array} input .hwp 파일
     * @param {(bytes: Uint8Array) => Promise<Uint8Array>|Uint8Array} inflateRaw raw deflate 풀기
     */
    async function readHwpTables(input, inflateRaw) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        const cfb = openCfb(bytes);
        const fh = cfb.read('FileHeader');
        if (!fh || fh.length < 40) throw new Error('한글(.hwp) 파일 머리 정보를 읽지 못했습니다.');
        const flags = u32(fh, 36);
        if (flags & 2) throw new Error('암호가 걸린 한글 파일은 읽을 수 없습니다.');
        const compressed = !!(flags & 1);
        const secNames = cfb.names.filter((n) => /^BodyText\/Section\d+$/.test(n))
            .sort((a, b) => parseInt(a.match(/\d+$/)[0], 10) - parseInt(b.match(/\d+$/)[0], 10));
        if (!secNames.length) throw new Error('한글 파일에서 본문을 찾지 못했습니다.');
        let tables = [];
        for (const name of secNames) {
            let sec = cfb.read(name);
            if (compressed) sec = await inflateRaw(sec);
            tables = tables.concat(tablesFromSection(sec instanceof Uint8Array ? sec : new Uint8Array(sec)));
        }
        return tables;
    }

    const api = { readHwpTables: readHwpTables, tablesFromSection: tablesFromSection, openCfb: openCfb };

    root.BSA = root.BSA || {};
    root.BSA.hwpRead = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
