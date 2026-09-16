/**
 * 표 칸(한글 HWPX / 화면 조사표 / 보고서) 공통 줄바꿈.
 *
 * 한글 워드프로세서는 칸이 좁으면 글자 단위로 끊고, `~` 앞뒤도 줄바꿈 후보로 본다.
 * 그 결과 `복도X7~8/Y2~3` 이 `복도X7~8/Y` / `2` / `~ 3` 처럼 토큰 중간에서 갈라진다.
 *
 * 이 모듈은 칸 너비(전각 단위)를 넘길 때만 끊되, 아래는 한 덩어리로 붙인다.
 * - 한글 단어(연속 음절)
 * - 좌표·범위 `X10~11`, `Y2~3`, `PH1~지하4층`
 * - 규모 `0.3~0.7/0.5`, `Cw:0.15`
 * 자연 끊김: 공백, 콤마, 좌표 `X…/Y…` 의 `/`, 괄호 뒤.
 */
(function (root) {
    const TILDE_RE = /[~～∼〜]/;
    const HANGUL_RE = /[\uAC00-\uD7A3]/;
    const ASCII_HALF_RE = /[\u0020-\u007E\uFF61-\uFF9F]/;
    const BREAK_PUNCT_RE = /[,|·、，;]/;
    const WORD_JOINER = '\u2060';

    function charWidthUnits(ch) {
        if (ASCII_HALF_RE.test(ch)) return 0.55;
        return 1;
    }

    function isHangul(ch) {
        return HANGUL_RE.test(ch);
    }

    function isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }

    function isAsciiLetter(ch) {
        return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
    }

    function isAlnum(ch) {
        return isDigit(ch) || isAsciiLetter(ch);
    }

    function isTilde(ch) {
        return TILDE_RE.test(ch);
    }

    function isSpace(ch) {
        return ch === ' ' || ch === '\t';
    }

    function skipDotsBack(chars, i) {
        let j = i;
        while (j >= 0 && chars[j] === '.') j--;
        return j;
    }

    function skipDotsForward(chars, i) {
        let j = i;
        while (j < chars.length && chars[j] === '.') j++;
        return j;
    }

    function isMeasureSlashOrJoin(chars, i) {
        const ch = chars[i];
        if (ch !== '/' && ch !== 'x' && ch !== 'X' && ch !== '*') return false;
        const prev = skipDotsBack(chars, i - 1);
        const next = skipDotsForward(chars, i + 1);
        return prev >= 0 && isDigit(chars[prev]) && next < chars.length && isDigit(chars[next]);
    }

    /**
     * glue[i] === true 이면 chars[i] 와 chars[i+1] 사이를 끊지 않는다.
     */
    function buildGlue(chars) {
        const n = chars.length;
        const glue = new Array(n).fill(false);
        for (let i = 0; i < n - 1; i++) {
            const a = chars[i];
            const b = chars[i + 1];

            if (isSpace(a) || isSpace(b)) continue;
            if (BREAK_PUNCT_RE.test(a) || BREAK_PUNCT_RE.test(b)) continue;

            if (isHangul(a) && isHangul(b)) {
                glue[i] = true;
                continue;
            }
            if (isDigit(a) && isDigit(b)) {
                glue[i] = true;
                continue;
            }
            if (a === '.' && i > 0 && isDigit(chars[i - 1]) && isDigit(b)) {
                glue[i] = true;
                continue;
            }
            if (b === '.' && isDigit(a) && i + 2 < n && isDigit(chars[i + 2])) {
                glue[i] = true;
                continue;
            }
            if (isAsciiLetter(a) && isAsciiLetter(b)) {
                glue[i] = true;
                continue;
            }
            if (isAsciiLetter(a) && isDigit(b)) {
                glue[i] = true;
                continue;
            }
            if (isDigit(a) && isAsciiLetter(b)) {
                glue[i] = true;
                continue;
            }
            if ((isHangul(a) && isDigit(b)) || (isDigit(a) && isHangul(b))) {
                glue[i] = true;
                continue;
            }
            if (isTilde(a) && (isAlnum(b) || isHangul(b) || b === '.')) {
                glue[i] = true;
                continue;
            }
            if (isTilde(b) && (isAlnum(a) || isHangul(a) || a === '.')) {
                glue[i] = true;
                continue;
            }
            if (a === '-' && isDigit(b)) {
                glue[i] = true;
                continue;
            }
            if (a === ':' && isAsciiLetter(chars[i - 1]) && (isDigit(b) || b === '.')) {
                glue[i] = true;
                continue;
            }
            if (b === ':' && isAsciiLetter(a) && i + 2 < n && (isDigit(chars[i + 2]) || chars[i + 2] === '.')) {
                glue[i] = true;
                continue;
            }
            if (isMeasureSlashOrJoin(chars, i) || isMeasureSlashOrJoin(chars, i + 1)) {
                glue[i] = true;
                continue;
            }
            if ((a === '(' || a === '[' || a === '{') && i > 0 && (isHangul(chars[i - 1]) || isAlnum(chars[i - 1]))) {
                glue[i - 1] = true;
            }
            if ((b === ')' || b === ']' || b === '}') && (isHangul(a) || isAlnum(a))) {
                glue[i] = true;
            }
        }
        return glue;
    }

    function consumeUnbreakableRun(chars, glue, start) {
        let end = start + 1;
        while (end < chars.length && glue[end - 1]) end++;
        return end;
    }

    /**
     * @param {string} line
     * @param {number} maxChars 전각 대략 글자 수 (칸 너비)
     * @param {function(string): number} [widthFn]
     * @returns {string} `\n` 으로 이은 줄들. 토큰 중간은 끊지 않음.
     */
    function wrapLine(line, maxChars, widthFn) {
        const s = String(line == null ? '' : line);
        const chars = Array.from(s);
        if (!chars.length) return '';
        const maxUnits = Math.max(4, Number(maxChars) || 16);
        const width = typeof widthFn === 'function' ? widthFn : charWidthUnits;
        const glue = buildGlue(chars);
        const lines = [];
        let i = 0;

        while (i < chars.length) {
            while (i < chars.length && isSpace(chars[i])) i++;
            if (i >= chars.length) break;

            let units = 0;
            let end = i;
            let lastBreak = -1;

            while (end < chars.length) {
                const ch = chars[end];
                const w = width(ch);
                if (units + w > maxUnits && end > i) break;
                units += w;
                end++;
                const canBreakAfter = end >= chars.length || !glue[end - 1];
                if (canBreakAfter) {
                    if (isSpace(ch)) {
                        const after = chars.slice(end).join('');
                        if (!/^-\d+\s*EA\b/i.test(after)) lastBreak = end;
                    } else {
                        lastBreak = end;
                    }
                }
            }

            if (end >= chars.length) {
                lines.push(chars.slice(i).join(''));
                break;
            }

            if (!(lastBreak > i)) {
                const tokenEnd = consumeUnbreakableRun(chars, glue, i);
                lines.push(chars.slice(i, tokenEnd).join(''));
                i = tokenEnd;
                continue;
            }

            let cut = lastBreak;
            if (cut > i && isSpace(chars[cut - 1])) {
                lines.push(chars.slice(i, cut - 1).join(''));
                i = cut;
            } else {
                lines.push(chars.slice(i, cut).join(''));
                i = cut;
            }
            if (!lines[lines.length - 1]) lines.pop();
        }

        return lines.length ? lines.join('\n') : s;
    }

    /**
     * HWPX wrapHwpxCellText 와 같은 평탄화 후 줄바꿈.
     * eaBreakFn 이 있으면 CR/LF 평탄화 뒤에 갯수 접미사 문단 분리를 적용한다.
     */
    function wrapText(raw, maxChars, options) {
        const opts = options || {};
        const widthFn = opts.widthFn || charWidthUnits;
        const normalize = opts.normalize || (function (v) { return v; });
        const eaBreak = opts.eaBreak;
        const flat = String(normalize(raw == null ? '' : raw))
            .replace(/\r\n|\r|\n/g, ' ')
            .replace(/[ \t]{2,}/g, ' ');
        const withEa = typeof eaBreak === 'function' ? eaBreak(flat) : flat;
        return String(withEa)
            .split('\n')
            .map((line) => wrapLine(line, maxChars, widthFn))
            .join('\n');
    }

    /** HTML/CSS 줄바꿈이 `~`·한글 단어를 쪼개지 않게 붙임 문자 삽입. HWPX 텍스트에는 쓰지 말 것. */
    function insertKeepTogether(text) {
        const chars = Array.from(String(text == null ? '' : text));
        if (!chars.length) return '';
        const glue = buildGlue(chars);
        let out = '';
        for (let i = 0; i < chars.length; i++) {
            out += chars[i];
            if (i < chars.length - 1 && glue[i]) out += WORD_JOINER;
        }
        return out;
    }

    const api = {
        charWidthUnits,
        buildGlue,
        wrapLine,
        wrapText,
        insertKeepTogether,
        WORD_JOINER
    };

    root.BSA = root.BSA || { tabs: {}, shared: {} };
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.koreanCellWrap = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
