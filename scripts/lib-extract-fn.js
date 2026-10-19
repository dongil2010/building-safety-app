'use strict';
// 테스트용: app.js에서 함수 하나를 잘라 온다(문자열·템플릿·주석 안의 괄호는 건너뜀)
function extractFunction(src, header) {
    const start = src.indexOf(header);
    if (start < 0) throw new Error('not found: ' + header);
    let i = src.indexOf('(', start);
    let depth = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
    }
    i = src.indexOf('{', i);
    const end = matchBrace(src, i);
    return src.slice(start, end + 1);
}
function matchBrace(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        const n = src[i + 1];
        if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
        if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
        if (c === "'" || c === '"') {
            for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
            continue;
        }
        if (c === '`') { i = skipTemplate(src, i + 1); continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    throw new Error('unbalanced');
}
function skipTemplate(src, i) {
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '\\') { i++; continue; }
        if (c === '`') return i;
        if (c === '$' && src[i + 1] === '{') {
            const end = matchBrace(src, i + 1);
            i = end;
        }
    }
    return i;
}
module.exports = { extractFunction };
