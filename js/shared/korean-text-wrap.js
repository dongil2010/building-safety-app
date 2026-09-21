/**
 * 한글 줄바꿈 (어절 우선 + 금칙 + 긴 어절 음절 Fallback + \n 보존).
 * Canvas / HWPX / PDF 등 measureWidth 만 바꿔 쓰면 된다.
 *
 * 2026-09-21: 이상적 래퍼(행두·행미 금칙, 1.05배 버퍼, 명시적 개행 보존)를
 * 공용으로 두고, 상태조사표 HWPX 칸 채우기가 이를 쓴다.
 */
(function (root) {
    'use strict';

    const LINE_START_PROHIBITED = new Set([")", "]", "}", ">", "!", "?", ",", ".", ":", ";", "%", "~", "°", "”", "’", "»", "，", "。", "、", "》", "〉", "』", "」"]);
    const LINE_END_PROHIBITED = new Set(["(", "[", "{", "<", "$", "₩", "¥", "€", "#", "“", "‘", "«", "《", "〈", "『", "「"]);

    const ASCII_TOKEN_CHAR = /[0-9A-Za-z.:~\/xXmM\-]/
    const JOSA_PREFIX = /^(은|는|이|가|을|를|의|에|에서|에게|으로|로써|로|와|과|도|만|부터|까지|이나|나)/;

    function defaultCharWidthUnits(ch) {
        if (/[\u0020-\u007E\uFF61-\uFF9F]/.test(ch)) return 0.55;
        return 1;
    }

    function measureByUnits(text, charWidthUnits) {
        const fn = charWidthUnits || defaultCharWidthUnits;
        let n = 0;
        const chars = Array.from(String(text == null ? '' : text));
        for (let i = 0; i < chars.length; i++) n += fn(chars[i]);
        return n;
    }

    function isAsciiTokenChar(ch) {
        return ASCII_TOKEN_CHAR.test(ch);
    }

    function wrapLongWord(word, maxWidth, measureWidth) {
        const chars = Array.from(String(word || ''));
        if (!chars.length) return [];
        const out = [];
        let i = 0;
        while (i < chars.length) {
            let partial = '';
            let end = i;
            while (end < chars.length) {
                const next = partial + chars[end];
                if (partial && measureWidth(next) > maxWidth) break;
                partial = next;
                end++;
            }
            if (end >= chars.length) {
                out.push(chars.slice(i).join(''));
                break;
            }
            let cut = end;
            if (end < chars.length && isAsciiTokenChar(chars[end - 1]) && isAsciiTokenChar(chars[end])) {
                let tokenStart = end - 1;
                while (tokenStart > i && isAsciiTokenChar(chars[tokenStart - 1])) tokenStart--;
                if (tokenStart > i) {
                    cut = tokenStart;
                } else {
                    let tokenEnd = end;
                    while (tokenEnd < chars.length && isAsciiTokenChar(chars[tokenEnd])) tokenEnd++;
                    out.push(chars.slice(i, tokenEnd).join(''));
                    i = tokenEnd;
                    continue;
                }
            }
            while (cut < chars.length && LINE_START_PROHIBITED.has(chars[cut])) {
                const trial = chars.slice(i, cut + 1).join('');
                if (measureWidth(trial) > maxWidth * 1.05 && cut > i + 1) break;
                cut++;
            }
            while (cut > i + 1 && LINE_END_PROHIBITED.has(chars[cut - 1])) cut--;
            const rest = chars.slice(cut).join('');
            const jm = rest.match(JOSA_PREFIX);
            if (jm) {
                const trial = chars.slice(i, cut + jm[1].length).join('');
                if (measureWidth(trial) <= maxWidth) cut += jm[1].length;
            }
            if (cut <= i) cut = Math.min(chars.length, i + 1);
            out.push(chars.slice(i, cut).join(''));
            i = cut;
        }
        return out;
    }

    function idealKoreanWrap(text, options) {
        const maxWidth = Math.max(1, Number(options && options.maxWidth) || 1);
        const measureWidth = (options && typeof options.measureWidth === 'function')
            ? options.measureWidth
            : function (s) { return measureByUnits(s, defaultCharWidthUnits); };

        const resultLines = [];
        const paragraphs = String(text == null ? '' : text).replace(/\r\n|\r/g, '\n').split('\n');

        for (let p = 0; p < paragraphs.length; p++) {
            const paragraph = paragraphs[p];
            if (paragraph === '') {
                resultLines.push('');
                continue;
            }

            const rawParts = paragraph.split(/[ \t]+/);
            const tokens = [];
            for (let t = 0; t < rawParts.length; t++) {
                const part = rawParts[t];
                if (!part) continue;
                if (/^-\d+\s*EA$/i.test(part) && tokens.length) {
                    tokens[tokens.length - 1] = tokens[tokens.length - 1] + ' ' + part.replace(/\s+/g, '');
                } else {
                    tokens.push(part);
                }
            }
            if (!tokens.length) {
                resultLines.push('');
                continue;
            }

            let currentLine = '';
            for (let i = 0; i < tokens.length; i++) {
                let token = tokens[i];
                if (!token) continue;

                const startsWithProhibited = LINE_START_PROHIBITED.has(token.charAt(0));

                if (currentLine && LINE_END_PROHIBITED.has(currentLine.slice(-1))) {
                    const lastChar = currentLine.slice(-1);
                    currentLine = currentLine.slice(0, -1).replace(/[ \t]+$/g, '');
                    token = lastChar + token;
                }

                const candidate = currentLine ? (currentLine + ' ' + token) : token;

                if (measureWidth(candidate) <= maxWidth) {
                    currentLine = candidate;
                    continue;
                }

                if (currentLine !== '') {
                    if (startsWithProhibited && measureWidth(currentLine + token.charAt(0)) <= maxWidth * 1.05) {
                        currentLine += token.charAt(0);
                        token = token.slice(1);
                    }
                    resultLines.push(currentLine);
                    currentLine = '';
                }

                if (!token) continue;

                if (measureWidth(token) > maxWidth) {
                    const chunks = wrapLongWord(token, maxWidth, measureWidth);
                    for (let c = 0; c < chunks.length; c++) {
                        if (c < chunks.length - 1) resultLines.push(chunks[c]);
                        else currentLine = chunks[c];
                    }
                } else {
                    currentLine = token;
                }
            }

            if (currentLine) resultLines.push(currentLine);
        }

        return resultLines;
    }

    /** HWPX 칸용 단위 폭 래퍼. 명시적 \n 보존. */
    function wrapHwpxCellText(raw, maxChars, charWidthUnits) {
        const maxUnits = Math.max(4, Number(maxChars) || 16);
        const measure = function (s) {
            return measureByUnits(s, charWidthUnits || defaultCharWidthUnits);
        };
        return idealKoreanWrap(String(raw == null ? '' : raw), {
            maxWidth: maxUnits,
            measureWidth: measure
        }).join('\n');
    }

    const api = {
        LINE_START_PROHIBITED: LINE_START_PROHIBITED,
        LINE_END_PROHIBITED: LINE_END_PROHIBITED,
        defaultCharWidthUnits: defaultCharWidthUnits,
        measureByUnits: measureByUnits,
        wrapLongWord: wrapLongWord,
        idealKoreanWrap: idealKoreanWrap,
        wrapHwpxCellText: wrapHwpxCellText
    };

    root.BSA = root.BSA || {};
    root.BSA.koreanTextWrap = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
