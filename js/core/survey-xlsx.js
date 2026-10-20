/**
 * 2026-10-20 상태조사표 엑셀 — 전체 층을 한 .xlsx 파일에 층마다 탭(시트)으로.
 * 순수 함수(브라우저·node 공용). JSZip으로 xlsx(OOXML)를 직접 조립해 글자 굵기·색·테두리·머리글 배경을
 * 기존 한 층 엑셀(.xls HTML)과 같게 유지한다.
 */
(function (root) {
    'use strict';
    var INVALID = /[:\\\/?*\[\]]/g;

    function sheetName(label, used) {
        var base = String(label == null ? '' : label).replace(INVALID, ' ').replace(/\s+/g, ' ').trim();
        base = base.replace(/^'+|'+$/g, '').trim();
        if (!base) base = '시트';
        if (base.length > 31) base = base.slice(0, 31).trim();
        var set = used || new Set();
        var name = base;
        var n = 2;
        var lower = function (s) { return s.toLowerCase(); };
        var has = function (s) { var l = lower(s); var hit = false; set.forEach(function (x) { if (lower(x) === l) hit = true; }); return hit; };
        while (has(name)) {
            var suf = '(' + n++ + ')';
            name = base.slice(0, 31 - suf.length).trim() + suf;
        }
        set.add(name);
        return name;
    }

    /** 지하 → 지상 → 옥상·옥탑(sortLowToHigh) 순서, 외부(입면) 층은 맨 뒤 */
    function orderFloorCodes(codes, isExterior, sortLowToHigh) {
        var list = (codes || []).filter(Boolean);
        var ext = list.filter(function (c) { return isExterior && isExterior(c); });
        var inner = list.filter(function (c) { return !(isExterior && isExterior(c)); });
        if (typeof sortLowToHigh === 'function') inner = sortLowToHigh(inner.slice());
        return { inner: inner, exterior: ext };
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function colName(i) {
        var s = '';
        i += 1;
        while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
        return s;
    }

    /** "font-weight:700; color:#ef4444;" → { bold, color: 'FFEF4444' } */
    function parseCellStyle(css) {
        var t = String(css || '');
        var w = /font-weight\s*:\s*(\d+|bold)/i.exec(t);
        var c = /(?:^|;|\s)color\s*:\s*#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(t);
        var hex = c ? c[1] : '';
        if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join('');
        return { bold: !!(w && (w[1] === 'bold' || Number(w[1]) >= 600)), color: hex ? ('FF' + hex.toUpperCase()) : '' };
    }

    /**
     * sheets: [{ name, title, header: [text], rows: [[{ text, style }]] }]
     * 반환: { 경로: 내용 } — JSZip에 그대로 넣으면 .xlsx
     */
    function buildXlsxParts(sheets) {
        var fonts = ['<font><sz val="11"/><name val="맑은 고딕"/></font>',
            '<font><b/><sz val="14"/><name val="맑은 고딕"/></font>',
            '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>'];
        var fontKey = {};
        var xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
            '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'];
        var xfByFont = {};
        function cellXf(style) {
            var p = parseCellStyle(style);
            var k = (p.bold ? 'b' : '') + '|' + p.color;
            if (xfByFont[k] != null) return xfByFont[k];
            var fid = fontKey[k];
            if (fid == null) {
                fid = fonts.length;
                fonts.push('<font>' + (p.bold ? '<b/>' : '') + '<sz val="11"/>' + (p.color ? '<color rgb="' + p.color + '"/>' : '') + '<name val="맑은 고딕"/></font>');
                fontKey[k] = fid;
            }
            xfByFont[k] = xfs.length;
            xfs.push('<xf numFmtId="0" fontId="' + fid + '" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>');
            return xfByFont[k];
        }
        var strings = [];
        var strIdx = {};
        function si(text) {
            var s = String(text == null ? '' : text);
            if (strIdx[s] == null) { strIdx[s] = strings.length; strings.push(s); }
            return strIdx[s];
        }
        function cell(ref, text, xf) {
            return '<c r="' + ref + '" t="s" s="' + xf + '"><v>' + si(text) + '</v></c>';
        }
        var parts = {};
        var sheetXml = [];
        (sheets || []).forEach(function (sh, si0) {
            var header = sh.header || [];
            var rows = sh.rows || [];
            var ncol = Math.max(1, header.length);
            var widths = header.map(function (h, ci) {
                var w = String(h || '').length * 2 + 4;
                rows.forEach(function (r) {
                    var t = String((r[ci] && r[ci].text) || '');
                    t.split('\n').forEach(function (line) { w = Math.max(w, line.length * 1.8 + 3); });
                });
                return Math.min(60, Math.max(8, Math.round(w)));
            });
            var x = [];
            x.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
            x.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
            x.push('<sheetViews><sheetView workbookViewId="0"' + (si0 === 0 ? ' tabSelected="1"' : '') + '/></sheetViews>');
            x.push('<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>');
            x.push('<sheetData>');
            x.push('<row r="1">' + cell('A1', sh.title || '', 1) + '</row>');
            x.push('<row r="2">' + header.map(function (h, i) { return cell(colName(i) + '2', h, 2); }).join('') + '</row>');
            rows.forEach(function (r, ri) {
                var rn = ri + 3;
                var cells = [];
                for (var ci = 0; ci < ncol; ci++) {
                    var c = r[ci] || { text: '' };
                    cells.push(cell(colName(ci) + rn, c.text, cellXf(c.style)));
                }
                x.push('<row r="' + rn + '">' + cells.join('') + '</row>');
            });
            x.push('</sheetData>');
            if (ncol > 1) x.push('<mergeCells count="1"><mergeCell ref="A1:' + colName(ncol - 1) + '1"/></mergeCells>');
            x.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
            x.push('</worksheet>');
            parts['xl/worksheets/sheet' + (si0 + 1) + '.xml'] = x.join('');
            sheetXml.push(sh.name);
        });
        var n = sheetXml.length;
        var seq = []; for (var i = 1; i <= n; i++) seq.push(i);
        parts['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + seq.map(function (k) { return '<Override PartName="/xl/worksheets/sheet' + k + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')
            + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>';
        parts['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
        parts['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'
            + sheetXml.map(function (nm, k) { return '<sheet name="' + esc(nm) + '" sheetId="' + (k + 1) + '" r:id="rId' + (k + 1) + '"/>'; }).join('')
            + '</sheets></workbook>';
        parts['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + seq.map(function (k) { return '<Relationship Id="rId' + k + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + k + '.xml"/>'; }).join('')
            + '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId' + (n + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
        parts['xl/styles.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>'
            + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill></fills>'
            + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right><top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border></borders>'
            + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            + '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>'
            + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
        parts['xl/sharedStrings.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strings.length + '" uniqueCount="' + strings.length + '">'
            + strings.map(function (s) { return '<si><t xml:space="preserve">' + esc(s) + '</t></si>'; }).join('') + '</sst>';
        return parts;
    }

    async function buildXlsxBlob(sheets, JSZipCtor) {
        var Z = JSZipCtor || root.JSZip;
        if (!Z) throw new Error('JSZip이 없습니다.');
        var zip = new Z();
        var parts = buildXlsxParts(sheets);
        Object.keys(parts).forEach(function (p) { zip.file(p, parts[p]); });
        return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
    }

    var api = { sheetName: sheetName, orderFloorCodes: orderFloorCodes, parseCellStyle: parseCellStyle, buildXlsxParts: buildXlsxParts, buildXlsxBlob: buildXlsxBlob };
    root.BSA = root.BSA || {};
    root.BSA.surveyXlsx = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);