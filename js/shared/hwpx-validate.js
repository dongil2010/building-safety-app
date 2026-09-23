/**
 * 한글(HWPX) 파일 구조 검사.
 *
 * 한글 출력은 사고가 잦았는데 대부분 "파일은 열리는데 구조가 틀린" 종류였다.
 * 2026-09-22 기울기·부동침하·부재변위 결과표(501~503)는 템플릿 XML 속 칸 순서가
 * 0,1,3,4,2,5,6으로 뒤섞여 있어서, 칸을 누르면 커서가 엉뚱한 곳에서 깜빡이고
 * 엑셀에 붙이면 열이 틀어졌다. 한글이 파일을 열어 주니 **몇 주 동안 아무도 몰랐다.**
 * 그동안 실제 파일 구조는 사람이 브라우저에서 손으로 확인했다.
 *
 * 그래서 표 구조를 기계가 본다. 문자열만 읽고 DOM을 쓰지 않으므로 Node 테스트와
 * 브라우저 양쪽에서 같은 코드가 돈다.
 *
 * 칸(hp:tc) 안에 표가 또 들어갈 수 있어서(중첩 표) 태그를 스택으로 따라간다.
 * hp:cellAddr / hp:cellSpan은 칸의 내용(hp:subList)이 닫힌 **뒤에** 나오므로,
 * 그 시점의 스택 꼭대기가 곧 그 칸이다.
 */
(function (root) {
    'use strict';

    var ATTR_RE = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;

    function parseAttrs(text) {
        var out = {};
        var m;
        ATTR_RE.lastIndex = 0;
        while ((m = ATTR_RE.exec(text || '')) !== null) out[m[1]] = m[2];
        return out;
    }

    function toInt(v) {
        var n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    }

    /**
     * XML이 제대로 닫혀 있는지 — 잘림·태그 어긋남을 잡는다.
     * 완전한 XML 검증은 아니지만, 한글 파일이 깨지는 흔한 경우(중간에 잘림, 여는/닫는
     * 태그 짝 안 맞음)는 여기서 걸린다.
     */
    function checkWellFormed(xml) {
        var re = /<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>/g;
        var stack = [];
        var m;
        while ((m = re.exec(xml)) !== null) {
            if (!m[2]) continue; // 주석·선언·CDATA
            var closing = m[1] === '/';
            var selfClosing = m[4] === '/';
            var name = m[2];
            if (selfClosing) continue;
            if (!closing) {
                stack.push({ name: name, at: m.index });
                continue;
            }
            var top = stack.pop();
            if (!top) return { ok: false, message: '여는 태그 없이 닫힘: </' + name + '>', at: m.index };
            if (top.name !== name) {
                return { ok: false, message: '태그 짝 안 맞음: <' + top.name + '> ... </' + name + '>', at: m.index };
            }
        }
        if (stack.length) {
            var open = stack[stack.length - 1];
            return { ok: false, message: '안 닫힌 태그: <' + open.name + '> (파일이 잘렸을 수 있다)', at: open.at };
        }
        return { ok: true };
    }

    /**
     * 섹션 XML에서 표를 전부 뽑는다 (중첩 표 포함).
     * 각 표: { id, rowCnt, colCnt, depth, rows: [[{colAddr,rowAddr,colSpan,rowSpan}...]...] }
     */
    function extractTables(xml) {
        var re = /<(\/?)(hp:tbl|hp:tr|hp:tc|hp:cellAddr|hp:cellSpan)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
        var tables = [];
        var stack = []; // { kind: 'tbl'|'tr'|'tc', ref }
        var m;
        function top(kind) {
            for (var i = stack.length - 1; i >= 0; i -= 1) {
                if (stack[i].kind === kind) return stack[i].ref;
            }
            return null;
        }
        while ((m = re.exec(xml)) !== null) {
            var closing = m[1] === '/';
            var tag = m[2];
            var selfClosing = m[4] === '/';
            if (tag === 'hp:cellAddr' || tag === 'hp:cellSpan') {
                var cell = stack.length && stack[stack.length - 1].kind === 'tc' ? stack[stack.length - 1].ref : null;
                if (!cell) continue;
                var a = parseAttrs(m[3]);
                if (tag === 'hp:cellAddr') {
                    cell.colAddr = toInt(a.colAddr);
                    cell.rowAddr = toInt(a.rowAddr);
                } else {
                    cell.colSpan = toInt(a.colSpan);
                    cell.rowSpan = toInt(a.rowSpan);
                }
                continue;
            }
            var kind = tag.slice(3); // tbl | tr | tc
            if (closing) {
                // 같은 종류가 나올 때까지 꺼낸다 (짝이 맞으면 바로 위다)
                while (stack.length) {
                    var popped = stack.pop();
                    if (popped.kind === kind) break;
                }
                continue;
            }
            if (selfClosing) continue;
            if (kind === 'tbl') {
                var at = parseAttrs(m[3]);
                var tbl = {
                    id: at.id || '',
                    rowCnt: toInt(at.rowCnt),
                    colCnt: toInt(at.colCnt),
                    depth: stack.filter(function (s) { return s.kind === 'tbl'; }).length,
                    at: m.index,
                    rows: []
                };
                tables.push(tbl);
                stack.push({ kind: 'tbl', ref: tbl });
            } else if (kind === 'tr') {
                var owner = top('tbl');
                var row = [];
                if (owner) owner.rows.push(row);
                stack.push({ kind: 'tr', ref: row });
            } else if (kind === 'tc') {
                var rowRef = top('tr');
                var c = { colAddr: null, rowAddr: null, colSpan: 1, rowSpan: 1 };
                if (rowRef) rowRef.push(c);
                stack.push({ kind: 'tc', ref: c });
            }
        }
        return tables;
    }

    /**
     * 표 하나의 구조 문제를 찾는다. 빈 배열이면 정상.
     * 문제마다 { code, message } — code로 테스트가 종류를 구분한다.
     */
    function checkTable(tbl) {
        var problems = [];
        function add(code, message) { problems.push({ code: code, message: message }); }

        if (tbl.rowCnt == null || tbl.colCnt == null) {
            add('dims-missing', 'rowCnt/colCnt 속성이 없다');
            return problems;
        }
        if (tbl.rows.length !== tbl.rowCnt) {
            add('row-count', 'rowCnt=' + tbl.rowCnt + '인데 행(hp:tr)이 ' + tbl.rows.length + '개');
        }

        // 격자 채우기: 모든 칸이 정확히 한 번씩 덮여야 한다 (겹침·구멍 없음)
        var grid = [];
        for (var r = 0; r < tbl.rowCnt; r += 1) {
            grid.push(new Array(tbl.colCnt).fill(0));
        }
        tbl.rows.forEach(function (row, ri) {
            var prevCol = -1;
            row.forEach(function (cell) {
                if (cell.colAddr == null || cell.rowAddr == null) {
                    add('addr-missing', ri + '행: 칸 주소(cellAddr)가 없다');
                    return;
                }
                if (cell.rowAddr !== ri) {
                    add('row-addr', ri + '번째 행의 칸이 rowAddr=' + cell.rowAddr + '라고 적혀 있다');
                }
                // 501~503 사고: 같은 행 안의 칸이 colAddr 순서가 아니면 커서·복사가 엉킨다
                if (cell.colAddr <= prevCol) {
                    add('col-order', ri + '행: 칸 순서가 뒤섞였다 (colAddr ' + prevCol + ' 다음에 ' + cell.colAddr + ')');
                }
                prevCol = cell.colAddr;
                var cs = cell.colSpan || 1;
                var rs = cell.rowSpan || 1;
                if (cell.colAddr + cs > tbl.colCnt || cell.rowAddr + rs > tbl.rowCnt) {
                    add('out-of-bounds', ri + '행 ' + cell.colAddr + '열 칸이 표 밖으로 나간다 (span ' + cs + 'x' + rs + ')');
                    return;
                }
                for (var y = cell.rowAddr; y < cell.rowAddr + rs; y += 1) {
                    for (var x = cell.colAddr; x < cell.colAddr + cs; x += 1) grid[y][x] += 1;
                }
            });
        });
        var holes = 0;
        var overlaps = 0;
        grid.forEach(function (line) {
            line.forEach(function (n) {
                if (n === 0) holes += 1;
                else if (n > 1) overlaps += 1;
            });
        });
        if (holes) add('grid-hole', '어느 칸에도 덮이지 않은 자리가 ' + holes + '개');
        if (overlaps) add('grid-overlap', '두 칸 이상이 겹친 자리가 ' + overlaps + '개');
        return problems;
    }

    /** 섹션 XML 하나 전체 검사 */
    function validateSection(xml, opts) {
        opts = opts || {};
        var ignore = opts.ignoreCodes || [];
        var report = { ok: true, wellFormed: null, tables: 0, problems: [] };
        report.wellFormed = checkWellFormed(xml);
        if (!report.wellFormed.ok) {
            report.ok = false;
            report.problems.push({ code: 'xml', table: null, message: report.wellFormed.message });
            return report; // 태그가 깨졌으면 표 검사는 의미 없다
        }
        var tables = extractTables(xml);
        report.tables = tables.length;
        tables.forEach(function (tbl, index) {
            checkTable(tbl).forEach(function (p) {
                if (ignore.indexOf(p.code) >= 0) return;
                report.problems.push({
                    code: p.code,
                    table: { index: index, id: tbl.id, depth: tbl.depth, rowCnt: tbl.rowCnt, colCnt: tbl.colCnt },
                    message: p.message
                });
            });
        });
        report.ok = report.problems.length === 0;
        return report;
    }

    /**
     * 패키지 목록(content.hpf)에 적힌 파일이 zip 안에 실제로 있는지.
     * 2026-08 "죽은 manifest 참조" 사고 — 한글에서 템플릿을 손으로 고쳤다가 지운 그림의
     * 항목이 목록에 남아 한글이 파일을 못 열었다.
     */
    function checkManifest(hpfXml, fileNames) {
        var names = {};
        (fileNames || []).forEach(function (n) { names[n] = true; });
        var missing = [];
        var re = /<opf:item\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
        var m;
        while ((m = re.exec(hpfXml || '')) !== null) {
            var a = parseAttrs(m[1]);
            if (!a.href) continue;
            if (!names[a.href]) missing.push(a.href);
        }
        return missing;
    }

    /**
     * 방금 만든 한글 파일을 검사해서, 문제가 있으면 현장 오류 기록(errorLogs)에 남긴다.
     *
     * 사용자가 내보낼 때마다 실제 데이터로 만든 실제 파일을 본다 — 템플릿 검사로는 못 잡는
     * "채우다가 구조를 망가뜨린" 경우를 여기서 잡는다. 501~503처럼 몇 주 몰랐던 일이
     * 다음 출력 한 번에 드러나게 하는 게 목적이다.
     *
     * **절대 출력을 막거나 바꾸지 않는다.** 읽기만 하고, 검사 자체가 실패해도 조용히 넘어간다.
     */
    function reportGeneratedHwpx(input) {
        try {
            input = input || {};
            var label = String(input.label || '한글 출력');
            var report = validateSection(String(input.sectionXml || ''));
            var missing = input.hpfText != null ? checkManifest(input.hpfText, input.fileNames || []) : [];
            if (report.ok && !missing.length) return { ok: true, report: report, missing: missing };

            var lines = report.problems.slice(0, 5).map(function (p) {
                return (p.table ? '표 id=' + p.table.id + ' ' : '') + p.message;
            });
            missing.slice(0, 3).forEach(function (href) { lines.push('목록에 있는데 파일이 없음: ' + href); });
            var total = report.problems.length + missing.length;
            var message = label + ' 구조 문제 ' + total + '건: ' + lines.join(' | ');

            if (root.console && typeof root.console.warn === 'function') {
                root.console.warn('[한글 구조 검사]', message, report.problems, missing);
            }
            var errorLog = root.BSA && root.BSA.errorLog;
            if (errorLog && typeof errorLog.record === 'function') {
                errorLog.record({ kind: 'hwpx-structure', message: message, source: label });
            }
            return { ok: false, report: report, missing: missing, message: message };
        } catch (_e) {
            return { ok: true, skipped: true };
        }
    }

    var api = {
        parseAttrs: parseAttrs,
        checkWellFormed: checkWellFormed,
        extractTables: extractTables,
        checkTable: checkTable,
        validateSection: validateSection,
        checkManifest: checkManifest,
        reportGeneratedHwpx: reportGeneratedHwpx
    };

    root.BSA = root.BSA || {};
    root.BSA.hwpxValidate = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
