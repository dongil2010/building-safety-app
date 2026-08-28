/**
 * HWPX(한글) 상태조사표 → 결함 데이터 가져오기
 * - 1·2종: templates/hwpx_survey_template*.hwpx
 * - 3종: templates/hwpx_survey_template_grade3*.hwpx
 */
(function () {
    const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
    const HS_NS = 'http://www.hancom.co.kr/hwpml/2011/section';

    function paraText(p) {
        return Array.from(p.getElementsByTagNameNS(HP_NS, 't')).map((t) => t.textContent || '').join('').trim();
    }

    function cellText(tc) {
        return Array.from(tc.getElementsByTagNameNS(HP_NS, 't')).map((t) => t.textContent || '').join('').trim();
    }

    function tableRows(tbl) {
        const trs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter((tr) => tr.parentNode === tbl);
        return trs.map((tr) => {
            const byCol = {};
            Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                const col = addr ? parseInt(addr.getAttribute('colAddr') || '0', 10) : 0;
                byCol[col] = cellText(tc);
            });
            const maxCol = Math.max(-1, ...Object.keys(byCol).map(Number));
            const arr = [];
            for (let c = 0; c <= maxCol; c++) arr.push(byCol[c] || '');
            return arr;
        });
    }

    function isMarkOn(v) {
        const t = (v || '').trim();
        return t === '○' || t === 'O' || t === 'o';
    }

    function isGrade3Header(row) {
        const joined = row.join('').replace(/\s+/g, '');
        return joined.includes('점검내용') && joined.includes('발생원인')
            && (joined.includes('No') || joined.includes('NO'));
    }

    function isGrade12Header(row) {
        const joined = row.join('').replace(/\s+/g, '');
        if (joined.includes('탄산화') || joined.includes('피복두께') || joined.includes('잔여깊이')) return false;
        return joined.includes('조사내용') && !joined.includes('점검내용')
            && (joined.includes('구분(NO') || joined.includes('위치') || joined.includes('부재종류'));
    }

    function tableFormat(rows, preferGrade3) {
        if (!rows.length) return null;
        const g3 = isGrade3Header(rows[0]);
        const g12 = isGrade12Header(rows[0]);
        if (g3 && !g12) return 'grade3';
        if (g12 && !g3) return 'grade12';
        if (g3 && g12) return preferGrade3 ? 'grade3' : 'grade12';
        return null;
    }

    function isSubHeaderRow(row) {
        const joined = row.join('');
        return joined.includes('구조부재') && joined.includes('비구조');
    }

    function splitInspectionContent(content) {
        const text = (content || '').trim();
        if (!text || text === '-') return { component: '기타', defectType: '기타', size: '' };
        if (text.includes('상태양호')) {
            const m = text.match(/^(.+?)\s*상태양호\s*$/);
            return { component: (m ? m[1] : '기타').trim() || '기타', defectType: '상태양호', size: '' };
        }
        let size = '';
        let body = text;
        const sizeM = text.match(/([\d.*×xX]+(?:\/[\d.*]+)?(?:\(.*?\))?)\s*$/);
        if (sizeM) {
            size = sizeM[1].replace(/×/g, '*');
            body = text.slice(0, text.length - sizeM[0].length).trim();
        }
        const compM = body.match(/^((?:상부|하부|외부|내부|문)?\s*(?:보|벽체|슬래브|기둥|조적벽체|바닥|천장|외벽|콘크리트)[^\s,]*)\s*(.+)$/);
        if (compM) {
            return { component: compM[1].trim(), defectType: compM[2].trim(), size };
        }
        return { component: '기타', defectType: body || '기타', size };
    }

    function parseGrade3Row(cells) {
        const no = (cells[0] || '').trim();
        if (!no || !/[\d]/.test(no)) return null;
        const floorLbl = (cells[1] || '').trim();
        const structMk = cells[2] || '';
        const nonStructMk = cells[3] || '';
        const inspection = (cells[4] || '').trim();
        const cause = (cells[5] || '').trim();
        const remark = (cells[6] || '').trim();
        let category = '구조체';
        if (isMarkOn(nonStructMk) && !isMarkOn(structMk)) category = '비구조체';
        const parsed = splitInspectionContent(inspection);
        const good = parsed.defectType === '상태양호';
        return {
            no,
            location: floorLbl,
            component: parsed.component,
            category,
            defectType: parsed.defectType,
            size: good ? '' : parsed.size,
            cause: cause || (good ? '-' : '건조수축'),
            remark,
            isProgress: false,
            isLeak: inspection.includes('누수'),
        };
    }

    function parseGrade12Row(cells) {
        const no = (cells[0] || '').trim();
        if (!no || !/^\d/.test(no)) return null;
        const location = (cells[1] || '').trim();
        const c2 = (cells[2] || '').trim();
        const c3 = (cells[3] || '').trim();
        const c4 = (cells[4] || '').trim();
        const c5 = cells[5] || '';
        const c6 = cells[6] || '';
        const c7 = cells[7] || '';
        const c8 = cells[8] || '';
        const c9 = (cells[9] || '').trim();

        let component = '기타';
        let defectType = '기타';
        let size = '';
        let category = '구조체';
        let progress = false;
        let leak = false;
        let cause = '';

        // 신규 10열: 번호/위치/조사내용(부재+결함)/크기/구조/비구조/진행/누수/원인/비고
        if (isMarkOn(c4) || isMarkOn(c5) || c4 === '-' || c5 === '-') {
            const parsed = splitInspectionContent(c2);
            component = parsed.component;
            defectType = parsed.defectType;
            size = (c3 || parsed.size || '').trim();
            if (isMarkOn(c5) && !isMarkOn(c4)) category = '비구조체';
            progress = isMarkOn(c6);
            leak = isMarkOn(c7);
            cause = (c8 || '').trim();
        } else {
            // 구형: 부재종류 + 조사내용 분리
            component = c2 || '기타';
            defectType = c3 || '기타';
            size = c4 || '';
            if (isMarkOn(c6) && !isMarkOn(c5)) category = '비구조체';
            progress = isMarkOn(c7);
            leak = isMarkOn(c8);
            cause = (cells[8] || '').trim();
        }

        const good = defectType === '상태양호';
        return {
            no,
            location,
            component,
            category,
            defectType,
            size: good ? '' : size,
            cause: cause || (good ? '-' : '건조수축'),
            remark: c9,
            isProgress: good ? false : progress,
            isLeak: good ? false : leak,
        };
    }

    function detectGrade3FromBuilding(bldg) {
        return !!(bldg && bldg.facilityGrade === '제3종시설물');
    }

    function detectFileGrade3(ps) {
        for (let i = 0; i < ps.length; i++) {
            const tbls = Array.from(ps[i].getElementsByTagNameNS(HP_NS, 'tbl'));
            for (let t = 0; t < tbls.length; t++) {
                const fmt = tableFormat(tableRows(tbls[t]), true);
                if (fmt === 'grade3') return true;
                if (fmt === 'grade12') return false;
            }
        }
        return false;
    }

    function secTopParagraphs(xmlDoc) {
        const root = xmlDoc.documentElement;
        return Array.from(root.childNodes).filter((n) => n.nodeType === 1 && (n.localName === 'p' || n.namespaceURI === HP_NS));
    }

    function extractStatusTablesFromBlock(ps, startIdx, endIdx, preferGrade3) {
        const defects = [];
        let grade3 = !!preferGrade3;
        for (let i = startIdx + 1; i < endIdx; i++) {
            const txt = paraText(ps[i]);
            if (/^사진1/.test(txt)) break;
            const tbls = Array.from(ps[i].getElementsByTagNameNS(HP_NS, 'tbl'));
            tbls.forEach((tbl) => {
                const rows = tableRows(tbl);
                if (!rows.length) return;
                const fmt = tableFormat(rows, preferGrade3);
                if (!fmt) return;
                if (preferGrade3 && fmt !== 'grade3') return;
                if (!preferGrade3 && fmt !== 'grade12') return;
                grade3 = fmt === 'grade3';
                let start = 1;
                if (rows[1] && isSubHeaderRow(rows[1])) start = 2;
                for (let r = start; r < rows.length; r++) {
                    const d = grade3 ? parseGrade3Row(rows[r]) : parseGrade12Row(rows[r]);
                    if (d) defects.push(d);
                }
            });
        }
        return { grade3, defects };
    }

    /**
     * @param {ArrayBuffer} buffer HWPX 파일
     * @param {{ facilityGrade?: string }} opts
     * @returns {Promise<{ grade3: boolean, floors: Array<{ floorLabel: string, defects: object[] }> }>}
     */
    window.parseHwpxSurveyImport = async function (buffer, opts) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리가 없습니다.');
        const zip = await JSZip.loadAsync(buffer);
        const secPath = zip.file('Contents/section1.xml') ? 'Contents/section1.xml' : 'Contents/section0.xml';
        const secFile = zip.file(secPath);
        if (!secFile) throw new Error('HWPX 본문(section0/1)을 찾지 못했습니다.');
        const xmlStr = await secFile.async('string');
        const xmlDoc = new DOMParser().parseFromString(xmlStr, 'text/xml');
        const ps = secTopParagraphs(xmlDoc);
        const floorTitleRe = /^\d+\)\s*(.+)$/;
        const starts = [];
        ps.forEach((p, i) => {
            if (floorTitleRe.test(paraText(p))) starts.push(i);
        });
        if (!starts.length) throw new Error('층 제목(예: 1) 지하1층)을 찾지 못했습니다. 상태조사표 형식인지 확인해 주세요.');

        let preferGrade3 = !!(opts && opts.facilityGrade === '제3종시설물');
        if (opts && opts.facilityGrade && opts.facilityGrade !== '제3종시설물') {
            preferGrade3 = false;
        } else if (!opts || !opts.facilityGrade) {
            preferGrade3 = detectFileGrade3(ps);
        }
        const floors = [];
        for (let idx = 0; idx < starts.length; idx++) {
            const s = starts[idx];
            const e = idx + 1 < starts.length ? starts[idx + 1] : ps.length;
            const floorLabel = paraText(ps[s]).replace(/^\d+\)\s*/, '').trim();
            const block = extractStatusTablesFromBlock(ps, s, e, preferGrade3);
            if (block.defects.length) {
                floors.push({ floorLabel, defects: block.defects, grade3: block.grade3 });
            }
        }
        if (!floors.length) throw new Error('상태조사표 데이터 행을 찾지 못했습니다.');
        const grade3 = preferGrade3 || floors.every((f) => f.grade3);
        return { grade3, floors };
    };

    /** 결함 객체 → 엑셀 가져오기 호환 행 */
    window.hwpxDefectsToImportRows = function (defects) {
        return (defects || []).map((d) => [
            d.no || '',
            d.component || '',
            d.category || '',
            d.defectType || '',
            d.location || '',
            d.size || '',
            '',
            '',
            d.isProgress ? '○' : '-',
            d.isLeak ? '○' : '-',
            d.cause || '',
        ]);
    };

    window.HWPX_IMPORT_HEADERS = ['번호', '부재', '구분', '조사내용', '위치', '크기', '균열폭', '균열길이', '진행', '누수', '원인'];

})();
