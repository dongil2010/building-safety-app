// @@app-part 13-report-export.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- REPORT PREVIEW MODAL (Instant Modal Open & Pure White Paper Theme) ---
    window.openReportPreviewModalFunc = async function(opts) {
        const manageLoading = !(opts && opts.skipLoading);
        try {
            const modal = document.getElementById('reportPreviewModal');
            const container = document.getElementById('modalReportPreviewBody');
            if (!modal || !container) return;

            // 1. OPEN MODAL INSTANTLY ON CLICK! (Zero-delay visual feedback)
            modal.style.display = 'flex';
            modal.classList.add('open');
            if (manageLoading && typeof window.showLoading === 'function') {
                window.showLoading('보고서 미리보기를 생성하는 중입니다...');
            }

            // 안 열어 본 층이 빠지거나 옛 값으로 나가지 않게 모든 층을 서버에서 먼저 받는다(2026-09-29)
            if (window.state.currentBuilding && !(await ensureBuildingFloorsFreshForReport(window.state.currentBuilding, 'PDF 보고서'))) {
                modal.classList.remove('open');
                modal.style.display = 'none';
                if (manageLoading && typeof window.hideLoading === 'function') window.hideLoading();
                return false;
            }
            const bldg = window.state.currentBuilding || { id: 'default', name: '건축물', address: '서울특별시 강남구', inspector: '홍길동', date: '2026-07-29' };
            const currentBldgId = bldg.id || state.currentBuildingId || 'default';

            const compName = window.state.companyName || localStorage.getItem('building_company_name') || bldg.companyName || '(주)한국안전진단기술원';
            const iType = (document.getElementById('selectInspectionType') ? document.getElementById('selectInspectionType').value : null) || bldg.inspectionType || '정밀안전점검';
            const iYear = (document.getElementById('selectInspectionYear') ? document.getElementById('selectInspectionYear').value : null) || bldg.inspectionYear || '2026년';
            const iPeriod = (document.getElementById('selectInspectionPeriod') ? document.getElementById('selectInspectionPeriod').value : null) || bldg.inspectionPeriod || '하반기';

            const cleanBldgName = bldg.name.replace(/^🏢\s*/,'');
            const reportTitleHeader = `${cleanBldgName} ${iYear} ${iPeriod} ${iType}`;

            // 2. Preload all floor drawing images asynchronously BEFORE rendering report pages!
            await preloadFloorDrawings(bldg);

            let availableFloors = [];
            if (bldg && bldg.id && typeof listNdtFloorCodesForBuilding === 'function') {
                availableFloors = listNdtFloorCodesForBuilding(bldg.id);
            } else if (typeof window.getBuildingAvailableFloors === 'function') {
                availableFloors = (window.getBuildingAvailableFloors(bldg) || []).map((f) => f && f.floorCode).filter(Boolean);
            } else if (bldg.floorsList && bldg.floorsList.length > 0) {
                availableFloors = bldg.floorsList.map(f => f.floorCode);
            } else if (bldg.floorDrawings && Object.keys(bldg.floorDrawings).length > 0) {
                availableFloors = Object.keys(bldg.floorDrawings);
            } else {
                availableFloors = [window.state.currentFloor || '1F'];
            }

            container.innerHTML = `<div id="printableReportArea" style="width:100%; max-width: 210mm; margin: 0 auto; display: flex; flex-direction: column; align-items: center;"></div>`;
            const reportArea = document.getElementById('printableReportArea');
            let reportPagesHtml = '';

            const exteriorFloorCodesForReport = collectExteriorFloorCodes(availableFloors, bldg);
            const exteriorFloorSetForReport = new Set(exteriorFloorCodesForReport);
            let exteriorSurveyEmitted = false;
            // 2026-10-28 외부 도면 사진도 상태조사표처럼 한 묶음 — 첫 외부 도면 자리에 한 번만, 나머지 외부 도면은 사진첩 없이 위치도만
            let exteriorAlbumEmitted = false;
            const exteriorPhotoEntries = exteriorFloorCodesForReport.length
                ? buildCombinedExteriorPhotoEntries(currentBldgId, exteriorFloorCodesForReport,
                    (efc) => state.defects[`${currentBldgId}_${efc}`] || (state.currentFloor === efc ? getCurrentFloorDefects() : []))
                : [];

            // 비파괴조사 결과표(데이터 목록)는 층별로 따로 만들지 않고 건물 전체를 미리 한 번에
            // 모아둔다 — 표는 해당 카테고리 항목이 있는 첫 층에서 한 번만(ndtTableEmitted.*) 내고,
            // 위치도(도면 이미지)는 그대로 층마다(각 층 자기 데이터 기준으로) 계속 낸다.
            const ndtCombinedForReport = buildCombinedNdtDataForReport(currentBldgId);
            const measureNdtItemsCombined = ndtCombinedForReport.allItems.filter(item => item.category === '실측');
            const strengthNdtItemsCombined = ndtCombinedForReport.allItems.filter(item => item.category === '강도');
            const carbNdtItemsCombined = ndtCombinedForReport.allItems.filter(item => item.category === '탄산화');
            const tiltNdtItemsCombined = ndtCombinedForReport.allItems.filter(item => item.category === '기울기');
            const settlementGroupsCombined = ndtCombinedForReport.allDispGroups.filter(g => !g.category || g.category === '변위');
            const memberDispGroupsCombined = ndtCombinedForReport.allDispGroups.filter(g => g.category === '부재변위');
            const ndtTableEmitted = { measure: false, 강도: false, 탄산화: false, tilt: false, settlement: false, memberDisp: false };
            // 2026-10-20 한글과 같은 「N) 층」 제목 번호·[도면 N-M] 번호
            let hwpxSurveyTitleNo = 0;
            let hwpxFigNo = 0;
            const hwpxFigChapter = hwpxFigureChapterNo(bldg.inspectionType, { grade3: isGrade3Building(bldg) });

            for (let floorIdx = 0; floorIdx < availableFloors.length; floorIdx++) {
                const floorCode = availableFloors[floorIdx];
                const htmlBefore = reportPagesHtml.length;
                if (typeof window.updateLoadingText === 'function') {
                    window.updateLoadingText(`보고서 미리보기 생성 중... (${floorIdx + 1}/${availableFloors.length} 층)`);
                }
                // 보고서에는 "B1F" 같은 코드 대신 "지하 1층"처럼 사람이 읽는 층 이름을 표시
                const floorDisplayLabel = stripFloorCodeSuffix(window.getFloorLabelFromCode(floorCode));
                const key = `${currentBldgId}_${floorCode}`;
                const defects = state.defects[key] || (state.currentFloor === floorCode ? getCurrentFloorDefects() : []);

                // Pre-calculate sequential photo labels (사진01, 사진02, 사진03...) and filter valid photos only!
                const defectPhotoLabels = {};
                const photoItems = [];
                let pCounter = 0;

                defects.forEach((d, dIdx) => {
                    const defectKey = d.id || `idx_${dIdx}`;
                    defectPhotoLabels[defectKey] = [];

                    getDefectOutputPhotos(d).forEach(src => {
                        pCounter++;
                        const pNumStr = pCounter < 10 ? `0${pCounter}` : `${pCounter}`;
                        const label = `사진${pNumStr}`;
                        defectPhotoLabels[defectKey].push(label);

                        const componentDefectTitle = `${d.no ? d.no + ' ' : ''}${memberNameOut(d.component) || '부재'} ${d.defectType || '결함'}`;
                        photoItems.push({
                            label: label,
                            title: componentDefectTitle,
                            defectNo: d.no,
                            location: d.location || (defectLocationUsesFloor() ? `${floorDisplayLabel} ${memberNameOut(d.component) || ''}` : ''),
                            cause: isGoodDefectType(d.defectType) ? '-' : (d.cause || ''),
                            size: isGoodDefectType(d.defectType) ? '-' : ((d.size && String(d.size).trim()) || '-'),
                            src: src
                        });
                    });
                });

                // --- 1. 상태조사표 (신가병원 1·2종 / 칠산타워 3종 서식)
                //     기본 15행, 결함표 추가(n-n)가 있으면 최대 17행. 본번호는 가능하면 15·30·45에서 끝낸다.
                //     마킹 추가 그룹은 한 행으로 합치고, 결함표 추가(surveyExtra)만 별도 행으로 둔다.
                //     외부(EXT / EXT_1·2…)는 도면별 표를 나누지 않고 한 표로 합치며, 위치에 방향 라벨이 있으면 넣는다. ---
                const grade3Report = isGrade3Building(bldg);
                const isExtFloor = exteriorFloorSetForReport.has(floorCode);
                let surveyDefects;
                let surveyFloorLabel = floorDisplayLabel;
                let surveyFloorCode = floorCode;
                let surveyPhotoLabels = defectPhotoLabels;
                if (isExtFloor) {
                    if (exteriorSurveyEmitted) {
                        surveyDefects = null;
                    } else {
                        exteriorSurveyEmitted = true;
                        surveyDefects = buildCombinedExteriorSurveyDefects(currentBldgId, exteriorFloorCodesForReport);
                        surveyFloorLabel = '건축물 외부';
                        surveyFloorCode = 'EXT';
                        // 합쳐진 표의 비고(사진번호)도 전체 외부 층 기준으로 다시 매긴다
                        // (사진첩과 같은 묶음·같은 순서 — 결함 번호 순)
                        surveyPhotoLabels = {};
                        exteriorFloorCodesForReport.forEach((efc) => {
                            ((state.defects[`${currentBldgId}_${efc}`]) || (state.currentFloor === efc ? getCurrentFloorDefects() : [])).forEach((d, dIdx) => {
                                if (d) surveyPhotoLabels[d.id || (`idx_${efc}_${dIdx}`)] = [];
                            });
                        });
                        exteriorPhotoEntries.forEach((e) => { (surveyPhotoLabels[e.defectKey] = surveyPhotoLabels[e.defectKey] || []).push(e.label); });
                    }
                } else {
                    surveyDefects = getSurveyRowsForReport(defects);
                }

                if (surveyDefects) {
                    const surveyPages = paginateSurveyDefects(surveyDefects);
                    hwpxSurveyTitleNo++;
                    const hwpxTitleFloor = isExtFloor ? '건축물 외부' : reportHwpxFloorLabel(bldg, floorCode);
                    // 한글 상태조사표 쪽과 같게: 첫 쪽만 「N) 층」 제목(3종은 「N) 층 상태조사표」), 다음 쪽은 표만
                    const hwpxTitleText = grade3Report
                        ? `${hwpxSurveyTitleNo}) ${hwpxTitleFloor} 상태조사표`
                        : `${hwpxSurveyTitleNo}) ${hwpxTitleFloor}`;
                    surveyPages.forEach((sDefects, sPageIdx) => {
                        const hasTitle = sPageIdx === 0;
                        const surveyTableHtml = buildReportSurveyTableHtml(sDefects, (d, dSubIdx) => {
                            const memberIds = d._groupMemberIds || [d.id || ('idx_' + dSubIdx)];
                            const labels = memberIds.flatMap(mid => surveyPhotoLabels[mid] || []);
                            const pRemark = labels.length > 0 ? labels.join(' ') : '-';
                            return { floorCode: surveyFloorCode, photoRemark: pRemark, floorDisplayLabel: surveyFloorLabel };
                        }, grade3Report, { hasTitle });
                        reportPagesHtml += reportHwpxPageOpen(`data-role="survey-page" data-floor="${escapeReportHtml(surveyFloorCode)}"`, reportTitleHeader)
                            + (hasTitle ? `<div class="report-hwpx-title" style="height:${hwpxUnitToMm(REPORT_HWPX_LAYOUT.titleH)}mm; flex:0 0 auto; display:flex; align-items:center; font-size:12pt; font-weight:700; color:#000;">${escapeReportHtml(hwpxTitleText)}</div>` : '')
                            + surveyTableHtml
                            + reportHwpxPageClose(compName);
                    });
                }

                // --- 2. 현장 사진첩 (A4 1페이지당 정확히 6개 배치 및 4:3 비율 규격) ---
                // 외부 도면은 사진첩도 한 묶음(건축물 외부): 첫 외부 도면 자리에 합친 사진을 한 번만 내고 나머지 외부 도면은 건너뛴다
                let albumItems = photoItems;
                let albumFloorLabel = floorDisplayLabel;
                let skipAlbum = false;
                if (isExtFloor) {
                    if (exteriorAlbumEmitted) {
                        skipAlbum = true;
                    } else {
                        exteriorAlbumEmitted = true;
                        albumFloorLabel = '건축물 외부';
                        albumItems = exteriorPhotoEntries.map((e) => {
                            const d = e.d;
                            const good = isGoodDefectType(d.defectType);
                            return {
                                label: e.label,
                                title: `${d.no ? d.no + ' ' : ''}${memberNameOut(d.component) || '부재'} ${d.defectType || '결함'}`,
                                defectNo: d.no,
                                location: enrichExteriorLocationForReport(d.location, e.floorCode),
                                cause: good ? '-' : (d.cause || ''),
                                size: good ? '-' : ((d.size && String(d.size).trim()) || '-'),
                                src: e.src
                            };
                        });
                    }
                }
                const photoPages = [];
                if (skipAlbum) {
                    // 이 외부 도면의 사진은 위(첫 외부 도면)의 합친 사진첩에 있다
                } else if (albumItems.length > 0) {
                    for (let i = 0; i < albumItems.length; i += 6) {
                        photoPages.push(albumItems.slice(i, i + 6));
                    }
                } else {
                    photoPages.push([]);
                }

                photoPages.forEach((pagePhotos, pPageIdx) => {
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
                                <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin:0;">
                                    2. ${albumFloorLabel} 현장 결함 사진첩 (총 ${albumItems.length}개 사진)
                                </h2>
                                <span style="font-size:0.78rem; background:#e0f2fe; color:#1f1f1f; font-weight:700; padding:0.15rem 0.5rem; border-radius:12px;">
                                    사진첩 페이지 ${pPageIdx + 1} / ${photoPages.length} (규격 6개 배치)
                                </span>
                            </div>

                            ${pagePhotos.length > 0 ? `
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-bottom: 0.4rem; flex: 1; align-content: start;">
                                    ${pagePhotos.map(p => `
                                        <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #fafafa; box-sizing: border-box;">
                                            <div style="position: relative; width: 100%; padding-bottom: 75%; background: #e2e8f0; overflow: hidden;">
                                                <img src="${p.src}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; object-position: center;">
                                            </div>
                                            <div style="padding: 0.3rem; text-align: center;">
                                                <div style="font-size:0.84rem; font-weight:800; color:#1f1f1f;">
                                                    ${p.label}. ${p.title}
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div style="width: 100%; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 4rem 2rem; background: #f8fafc; text-align: center; color: #64748b; font-weight: 700; font-size: 1.05rem; margin-top: 2rem;">
                                    <i class="fa-solid fa-camera" style="font-size: 2.8rem; color: #a3a3a3; margin-bottom: 0.8rem; display: block;"></i>
                                    📷 ${albumFloorLabel}에 첨부된 현장 결함 사진이 없습니다.
                                </div>
                            `}

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                });

                // --- 3. 결함 위치도 (A4 세로 222mm 딱 맞게 렌더링) ---
                const drawingDataUrl = renderFloorPlanCanvasDataUrl(floorCode);

                // 한글 위치도와 같게: 그림 칸 + 캡션 칸 「[도면 N-M] 층 상태조사위치도」(번호는 위치도 쪽 순서)
                hwpxFigNo++;
                const mapEmptyHtml = `<div style="color:#64748b; font-weight:700; font-size:10pt; text-align:center;">📍 ${escapeReportHtml(floorDisplayLabel)} 등록된 평면도 도면이 없습니다.<br><span style="font-size:8pt; font-weight:500;">(층별 도면 점검 탭에서 평면도 이미지를 등록하시면 결함 위치도가 자동으로 완성됩니다)</span></div>`;
                reportPagesHtml += reportHwpxPageOpen(`data-role="location-map-page" data-floor="${escapeReportHtml(floorCode)}"`, reportTitleHeader)
                    + buildReportHwpxMapHtml(drawingDataUrl, `[도면 ${hwpxFigChapter}-${hwpxFigNo}] ${reportHwpxFloorLabel(bldg, floorCode)} 상태조사위치도`, mapEmptyHtml)
                    + reportHwpxPageClose(compName);

                // --- 비파괴 및 변위/기울기 보고서 섹션 번호 관리 ---
                const ndtKey = `${currentBldgId}_${floorCode}`;
                const allNdtItems = state.ndtData ? (state.ndtData[ndtKey] || []) : [];
                const allDispGroups = state.ndtDisplacementGroups ? (state.ndtDisplacementGroups[ndtKey] || []) : [];

                const measureNdtItems = allNdtItems.filter(item => item.category === '실측');
                const strengthNdtItems = allNdtItems.filter(item => item.category === '강도');
                const carbNdtItems = allNdtItems.filter(item => item.category === '탄산화');
                const tiltNdtItems = allNdtItems.filter(item => item.category === '기울기');
                const settlementGroups = allDispGroups.filter(g => !g.category || g.category === '변위');
                const memberDispGroups = allDispGroups.filter(g => g.category === '부재변위');

                let sectionNo = 4;

                // 정기안전점검은 상태조사표/사진첩/결함위치도(1~3)까지만 보고서에 넣고, 비파괴조사
                // 섹션(4~7: 부재실측/강도·탄산화/외벽기울기/부동침하/부재처짐)은 정밀안전점검일 때만 넣는다.
                if (iType === '정밀안전점검') {

                // --- 4. 📏 부재 실측 결과표 및 측정 위치도 (강도·탄산화와 별도 도면) ---
                if (measureNdtItems.length > 0 || (!ndtTableEmitted.measure && measureNdtItemsCombined.length > 0)) {
                    // 결과표는 건물 전체를 모아 첫 층에서 한 번만 낸다(ndtTableEmitted.measure) —
                    // 위치도는 아래에서 그대로 층별로 계속 낸다.
                    if (!ndtTableEmitted.measure && measureNdtItemsCombined.length > 0) {
                    ndtTableEmitted.measure = true;
                    const measurePages = paginateNdtReportItems(measureNdtItemsCombined, NDT_MEASURE_ROWS_PER_PAGE);
                    measurePages.forEach((pageItems, pageIdx) => {
                    const curSecNo1 = sectionNo++;
                    const pageNote = measurePages.length > 1 ? ` (${pageIdx + 1}/${measurePages.length})` : '';
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo1}. 비파괴 장비 조사 (부재 실측) 결과표${pageNote}
                            </h2>

                            <table style="width: 100%; border-collapse: collapse; font-size: 0.81rem; text-align: center; margin-bottom: 0.4rem;">
                                <thead>
                                    <tr style="background: #f8fafc; color: #1e293b; border-bottom: 2px solid #cbd5e1;">
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">관리번호</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정위치</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">부재명</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">설계치수(mm)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">실측치수(mm)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">마감상태</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">평가(c%)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">비고(등급)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${pageItems.length > 0 ? pageItems.map(item => {
                                        const designText = formatNdtMeasureDimForOutput(item, 'design', ' × ', '<br>');
                                        const measuredText = formatNdtMeasureDimForOutput(item, 'measured', ' × ', '<br>');
                                        const ratioText = (item.sectionRatio !== undefined && item.sectionRatio !== null) ? `${item.sectionRatio.toFixed(1)}%` : '-';
                                        return `
                                        <tr>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#2a2a2a;">${item.no || 'NO.01'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0;">${item.location || '위치미지정'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0;">${memberNameOut(item.component) || ''}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-family:monospace;">${designText}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-family:monospace;">${measuredText}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0;">${item.finishState || '-'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#16a34a;">${ratioText}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800;">${item.sectionGrade || '-'}</td>
                                        </tr>
                                    `;
                                    }).join('') : `
                                        <tr><td colspan="8" style="padding: 2rem; color: #a3a3a3;">등록된 비파괴 조사 측정 데이터가 없습니다.</td></tr>
                                    `}
                                </tbody>
                            </table>

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                    });
                    }

                    if (measureNdtItems.length > 0) {
                    const measureDrawingUrl = await renderNdtFloorPlanCanvasDataUrlAsync(floorCode, '실측');
                    const curSecNo2 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo2}. ${floorDisplayLabel} 비파괴 장비 조사 (부재 실측) 위치도
                            </h2>

                            ${measureDrawingUrl ? `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px solid #2a2a2a; border-radius: 6px; overflow: hidden; background: #ffffff; text-align: center; padding: 2px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                                    <img src="${measureDrawingUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                                </div>
                            ` : `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 4rem 2rem; background: #f8fafc; text-align: center; color: #64748b; font-weight: 700; font-size: 1.05rem; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                    <i class="fa-solid fa-ruler" style="font-size: 2.8rem; color: #a3a3a3; margin-bottom: 0.8rem; display: block;"></i>
                                    📍 부재 실측 마킹 데이터가 첨부되지 않았습니다.
                                </div>
                            `}

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                    }
                }

                // --- 4-1. 🔬 콘크리트 강도 결과표 (표만 분리, 위치도는 탄산화와 공통) ---
                // --- 4-2. 🔬 탄산화 결과표 ---
                [
                    { items: strengthNdtItemsCombined, catLabel: '강도' },
                    { items: carbNdtItemsCombined, catLabel: '탄산화' }
                ].forEach(({ items: stdItems, catLabel }) => {
                    if (stdItems.length === 0 || ndtTableEmitted[catLabel]) return;
                    ndtTableEmitted[catLabel] = true;
                    const curSecNo1 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo1}. 비파괴 장비 조사 (${catLabel}) 결과표
                            </h2>

                            <table style="width: 100%; border-collapse: collapse; font-size: 0.81rem; text-align: center; margin-bottom: 0.4rem;">
                                <thead>
                                    <tr style="background: #f8fafc; color: #1e293b; border-bottom: 2px solid #cbd5e1;">
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">관리번호</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정위치</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">부재명</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정수치</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">평균결과</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">상태판정</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stdItems.map(item => `
                                        <tr>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#2a2a2a;">${item.no || 'NO.01'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0;">${item.location || '위치미지정'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0;">${memberNameOut(item.component) || ''}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-family:monospace;">${item.valuesText || '-'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#16a34a;">${item.avgValue || '-'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:700;">${item.status || '양호'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                });

                // --- 4-3. 🔬 강도·탄산화 공통 측정 위치도 (표만 분리하고 위치도는 하나로 유지) ---
                if (strengthNdtItems.length > 0 || carbNdtItems.length > 0) {
                    const stdDrawingUrl = await renderNdtFloorPlanCanvasDataUrlAsync(floorCode, '일반비파괴');
                    const curSecNo2 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo2}. ${floorDisplayLabel} 비파괴 장비 조사 (강도·탄산화) 위치도
                            </h2>

                            ${stdDrawingUrl ? `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px solid #2a2a2a; border-radius: 6px; overflow: hidden; background: #ffffff; text-align: center; padding: 2px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                                    <img src="${stdDrawingUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                                </div>
                            ` : `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 4rem 2rem; background: #f8fafc; text-align: center; color: #64748b; font-weight: 700; font-size: 1.05rem; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                    <i class="fa-solid fa-microscope" style="font-size: 2.8rem; color: #a3a3a3; margin-bottom: 0.8rem; display: block;"></i>
                                    📍 강도/탄산화 마킹 데이터가 첨부되지 않았습니다.
                                </div>
                            `}

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                }

                // --- 5. 📐 외벽 기울기 전용 결과표 및 독립 위치도 ---
                if (tiltNdtItems.length > 0 || (!ndtTableEmitted.tilt && tiltNdtItemsCombined.length > 0)) {
                    if (!ndtTableEmitted.tilt && tiltNdtItemsCombined.length > 0) {
                    ndtTableEmitted.tilt = true;
                    const curSecNo1 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo1}. 외벽 기울기 측정 결과표
                            </h2>

                            <table style="width: 100%; border-collapse: collapse; font-size: 0.81rem; text-align: center; margin-bottom: 0.4rem;">
                                <thead>
                                    <tr style="background: #f8fafc; color: #1e293b; border-bottom: 2px solid #cbd5e1;">
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">관리번호</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정위치</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정높이(H)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">변위량(mm)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">기울기(1/H)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">기울기 등급</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tiltNdtItemsCombined.map(item => {
                                        const fmtH = formatHeightValue(item.height) || '-';
                                        const hDigits = (fmtH || '').replace(/[^0-9.]/g, '');
                                        const avgDigits = (item.avgValue || '').replace(/[^0-9.-]/g, '');
                                        const h = parseFloat(hDigits);
                                        const delta = Math.abs(parseFloat(avgDigits) || 0);
                                        const calc = (Number.isFinite(h) && h > 0 && delta > 0)
                                            ? calcTiltGrade(h, delta)
                                            : { tiltRatio: '', grade: '' };
                                        const gradeLabel = item.grade || calc.grade || '-';
                                        const gradeColor = gradeLabel === 'a등급' ? '#16a34a' : (gradeLabel === 'b등급' ? '#2a2a2a' : (gradeLabel === 'c등급' ? '#ca8a04' : '#dc2626'));
                                        return `
                                        <tr>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#2a2a2a;">${item.no || 'NO.01'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0;">${item.location || '-'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:700; color:#2a2a2a;">${fmtH}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#16a34a;">${item.avgValue || '-'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#9333ea;">${item.tiltRatio || calc.tiltRatio || '-'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:${gradeColor};">${gradeLabel}</td>
                                        </tr>
                                    `;}).join('')}
                                </tbody>
                            </table>

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                    }

                    if (tiltNdtItems.length > 0) {
                    const tiltDrawingUrl = await renderNdtFloorPlanCanvasDataUrlAsync(floorCode, '기울기');
                    const curSecNo2 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo2}. ${floorDisplayLabel} 외벽 기울기 측정 위치도
                            </h2>

                            ${tiltDrawingUrl ? `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px solid #2a2a2a; border-radius: 6px; overflow: hidden; background: #ffffff; text-align: center; padding: 2px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                                    <img src="${tiltDrawingUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                                </div>
                            ` : `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 4rem 2rem; background: #f8fafc; text-align: center; color: #64748b; font-weight: 700; font-size: 1.05rem; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                    <i class="fa-solid fa-compass-drafting" style="font-size: 2.8rem; color: #a3a3a3; margin-bottom: 0.8rem; display: block;"></i>
                                    📍 외벽 기울기 마킹 데이터가 첨부되지 않았습니다.
                                </div>
                            `}

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                    }
                }

                // --- 6. 📉 부동침하 기울기 전용 결과표 + 위치도 + 꺾은선 그래프 ---
                if (settlementGroups.length > 0 || (!ndtTableEmitted.settlement && settlementGroupsCombined.length > 0)) {
                    if (!ndtTableEmitted.settlement && settlementGroupsCombined.length > 0) {
                    ndtTableEmitted.settlement = true;
                    const curSecNo1 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo1}. 부동침하 기울기 측정 결과표
                            </h2>

                            <table style="width: 100%; border-collapse: collapse; font-size: 0.81rem; text-align: center; margin-bottom: 0.4rem;">
                                <thead>
                                    <tr style="background: #f8fafc; color: #1e293b; border-bottom: 2px solid #cbd5e1;">
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">조사번호</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정위치</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정길이(m)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">변위량(mm)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">기울기(1/L)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">안전 등급</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${settlementGroupsCombined.map(group => {
                                        const calc = calcGroupDisplacement(group);
                                        const fmt = formatDispCalcForExport(calc);
                                        const gradeColor = calc.incomplete ? '#64748b' : (calc.grade === 'a등급' ? '#16a34a' : (calc.grade === 'b등급' ? '#2a2a2a' : (calc.grade === 'c등급' ? '#ca8a04' : '#dc2626')));
                                        return `
                                        <tr>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#2a2a2a;">${group.groupNo}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:700;">${group._ndtFloorLabel ? group._ndtFloorLabel + ' ' : ''}${group.locationType || '보'} (${group.points.length}개 지점)</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:700; color:#2a2a2a;">${group.measureLength || '—'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#16a34a;">${fmt.delta}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#9333ea;">${fmt.tiltRatio}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:${gradeColor};">${fmt.grade}</td>
                                        </tr>
                                    `;}).join('')}
                                </tbody>
                            </table>

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;

                    settlementGroupsCombined.forEach(group => {
                        const chartDataUrl = renderNdtDisplacementChartDataUrl(group, group._ndtFloorCode || floorCode);
                        const curGraphNo = sectionNo++;
                        reportPagesHtml += `
                            <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                                <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                    <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                                </div>

                                <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                    ${curGraphNo}. ${group._ndtFloorLabel || floorDisplayLabel} 부동침하 기울기 그래프 (${group.groupNo})
                                </h2>

                                ${chartDataUrl ? `
                                    <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px solid #2a2a2a; border-radius: 6px; overflow: hidden; background: #ffffff; text-align: center; padding: 2px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                                        <img src="${chartDataUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                                    </div>
                                ` : ''}

                                <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                    <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                    <span>📄 스마트 건축물 안전점검 시스템</span>
                                </div>
                            </div>
                        `;
                    });
                    }

                    if (settlementGroups.length > 0) {
                    const settlementDrawingUrl = await renderNdtFloorPlanCanvasDataUrlAsync(floorCode, '변위');
                    const curSecNo2 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo2}. ${floorDisplayLabel} 부동침하 기울기 측정 위치도
                            </h2>

                            ${settlementDrawingUrl ? `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px solid #2a2a2a; border-radius: 6px; overflow: hidden; background: #ffffff; text-align: center; padding: 2px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                                    <img src="${settlementDrawingUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                                </div>
                            ` : ''}

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                    }
                }

                // --- 7. 🏗️ 부재처짐 (부재변위) 전용 결과표 + 위치도 + 꺾은선 그래프 ---
                if (memberDispGroups.length > 0 || (!ndtTableEmitted.memberDisp && memberDispGroupsCombined.length > 0)) {
                    if (!ndtTableEmitted.memberDisp && memberDispGroupsCombined.length > 0) {
                    ndtTableEmitted.memberDisp = true;
                    const curSecNo1 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo1}. 부재처짐 (부재변위) 측정 결과표
                            </h2>

                            <table style="width: 100%; border-collapse: collapse; font-size: 0.81rem; text-align: center; margin-bottom: 0.4rem;">
                                <thead>
                                    <tr style="background: #f8fafc; color: #1e293b; border-bottom: 2px solid #cbd5e1;">
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">조사번호</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">측정위치</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">부재길이(m)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">처짐량(mm)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">처짐비(1/L)</th>
                                        <th style="padding: 0.45rem 0.3rem; border: 1px solid #cbd5e1;">처짐 등급</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${memberDispGroupsCombined.map(group => {
                                        const calc = calcGroupDisplacement(group);
                                        const fmt = formatDispCalcForExport(calc);
                                        const gradeColor = calc.incomplete ? '#64748b' : (calc.grade === 'a등급' ? '#16a34a' : (calc.grade === 'b등급' ? '#2a2a2a' : (calc.grade === 'c등급' ? '#ca8a04' : '#dc2626')));
                                        return `
                                        <tr>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#2a2a2a;">${group.groupNo}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:700;">${group._ndtFloorLabel ? group._ndtFloorLabel + ' ' : ''}${group.locationType || '보'} (${group.points.length}개 지점)</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:700; color:#2a2a2a;">${group.measureLength || '—'}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#16a34a;">${fmt.delta}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:#9333ea;">${fmt.tiltRatio}</td>
                                            <td style="padding:0.4rem 0.3rem; border:1px solid #e2e8f0; font-weight:800; color:${gradeColor};">${fmt.grade}</td>
                                        </tr>
                                    `;}).join('')}
                                </tbody>
                            </table>

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;

                    memberDispGroupsCombined.forEach(group => {
                        const chartDataUrl = renderNdtDisplacementChartDataUrl(group, group._ndtFloorCode || floorCode);
                        const curGraphNo = sectionNo++;
                        reportPagesHtml += `
                            <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                                <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                    <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                                </div>

                                <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                    ${curGraphNo}. ${group._ndtFloorLabel || floorDisplayLabel} 부재처짐 그래프 (${group.groupNo})
                                </h2>

                                ${chartDataUrl ? `
                                    <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px solid #2a2a2a; border-radius: 6px; overflow: hidden; background: #ffffff; text-align: center; padding: 2px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                                        <img src="${chartDataUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                                    </div>
                                ` : ''}

                                <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                    <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                    <span>📄 스마트 건축물 안전점검 시스템</span>
                                </div>
                            </div>
                        `;
                    });
                    }

                    if (memberDispGroups.length > 0) {
                    const memberDispDrawingUrl = await renderNdtFloorPlanCanvasDataUrlAsync(floorCode, '부재변위');
                    const curSecNo2 = sectionNo++;
                    reportPagesHtml += `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>

                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">
                                ${curSecNo2}. ${floorDisplayLabel} 부재처짐 (부재변위) 측정 위치도
                            </h2>

                            ${memberDispDrawingUrl ? `
                                <div style="width: 100%; height: 222mm; max-height: 222mm; border: 2px solid #2a2a2a; border-radius: 6px; overflow: hidden; background: #ffffff; text-align: center; padding: 2px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                                    <img src="${memberDispDrawingUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                                </div>
                            ` : ''}

                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>
                    `;
                    }
                }

                } // iType === '정밀안전점검'
                if (reportArea) reportArea.insertAdjacentHTML('beforeend', reportPagesHtml.slice(htmlBefore));
                await yieldToUi();
            }

            // --- 균열 게이지·팁 누적 측정 (정밀·정기·진단, 1·2·3종 모두 — 기록이 있을 때만, 한글과 같이 맨 뒤) ---
            try {
                if (typeof ensureGaugePhotosLoaded === 'function') await ensureGaugePhotosLoaded(currentBldgId);
                const crackPagesHtml = buildReportCrackMonitorPagesHtml(bldg, currentBldgId, reportTitleHeader, compName);
                if (crackPagesHtml) {
                    reportPagesHtml += crackPagesHtml;
                    if (reportArea) reportArea.insertAdjacentHTML('beforeend', crackPagesHtml);
                }
            } catch (crackPdfErr) {
                console.error('균열 게이지·팁 보고서 섹션 생성 실패(나머지는 유지):', crackPdfErr);
            }

            // 상태조사표는 15/17행·15배수 마감 규칙을 유지한다. 높이 넘침으로 행을 다음 페이지로
            // 흘리면 끝 번호가 15·30에서 어긋나므로 재배치는 하지 않는다.
        } catch (err) {
            console.error('Error in openReportPreviewModalFunc:', err);
            const modal = document.getElementById('reportPreviewModal');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('open');
            }
            if (typeof window.showToast === 'function') {
                window.showToast('보고서 미리보기 생성 중 오류가 발생했습니다.', 'error', 4500);
            }
        } finally {
            if (manageLoading && typeof window.hideLoading === 'function') window.hideLoading();
        }
    };

    // --- PDF EXPORT ENGINE (비동기 A4 풀다운로드 & 반응 즉시 활성화) ---
    window.exportPDF = async function() {
        window.showLoading('PDF 보고서를 생성하는 중입니다...');
        try {
            // 1. Ensure report preview content is fully generated and preloaded
            if ((await window.openReportPreviewModalFunc({ skipLoading: true })) === false) {
                if (typeof window.hideLoading === 'function') window.hideLoading();
                return;
            }
            await new Promise(r => setTimeout(r, 250));

            const bldg = window.state.currentBuilding || { name: '건축물_점검보고서' };
            const bldgName = (bldg.name || '건축물').replace(/^🏢\s*/, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `${bldgName}_정밀안전점검_보고서_${dateStr}.pdf`;

            const element = document.getElementById('printableReportArea') || document.getElementById('modalReportPreviewBody');
            if (!element) {
                window.print();
                return;
            }

            // Temporarily set margin-bottom to 0 for strict 1:1 A4 PDF rendering
            const pageBlocks = Array.from(element.querySelectorAll('.report-page-block'));
            pageBlocks.forEach(b => {
                b.style.marginBottom = '0';
                b.style.boxShadow = 'none';
            });

            try {
                if (pageBlocks.length > 0 && typeof html2canvas !== 'undefined' && typeof window.jspdf !== 'undefined') {
                    // 보고서 전체를 한 장의 거대한 캔버스로 렌더링하면(예전 html2pdf 한방 방식) 페이지가
                    // 많을 때(수십 페이지) 캔버스 높이가 브라우저 한계를 넘어서서 전부 빈 종이로 나오는
                    // 문제가 있었다. 페이지(.report-page-block) 하나씩 따로 캡처해서 jsPDF에 이어붙이면
                    // 캔버스 크기가 항상 A4 한 장 크기로 작게 유지되어 페이지 수와 무관하게 안전하다.
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
                    const pageW = pdf.internal.pageSize.getWidth();
                    const pageH = pdf.internal.pageSize.getHeight();

                    const loadingTextEl = document.querySelector('#globalLoadingOverlay .loading-text');
                    let failedPages = 0;
                    for (let i = 0; i < pageBlocks.length; i++) {
                        // showLoading()을 반복 호출하면 내부 카운터(_loadingDepth)가 계속 올라가
                        // 끝나고 hideLoading()을 한 번만 불러선 로딩창이 영영 안 사라지므로,
                        // 진행률 텍스트만 직접 갱신한다.
                        if (loadingTextEl) loadingTextEl.textContent = `PDF 보고서를 생성하는 중입니다... (${i + 1}/${pageBlocks.length} 페이지)`;
                        const block = pageBlocks[i];
                        try {
                            const canvas = await html2canvas(block, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
                            const imgData = canvas.toDataURL('image/jpeg', 0.95);
                            const imgHeight = Math.min(pageH, (canvas.height * pageW) / canvas.width);
                            if (i > 0) pdf.addPage();
                            pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgHeight);
                        } catch (pageErr) {
                            failedPages++;
                            console.error(`PDF page ${i + 1} render error:`, pageErr);
                        }
                    }

                    pdf.save(filename);
                    if (failedPages && typeof window.showToast === 'function') {
                        window.showToast(`PDF ${failedPages}개 페이지 캡처에 실패했습니다. 파일을 확인해 주세요.`, 'warning', 5000);
                    }
                } else {
                    window.print();
                }
            } finally {
                // Restore screen preview margins
                pageBlocks.forEach(b => {
                    b.style.marginBottom = '2rem';
                    b.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
                });
            }
        } catch(err) {
            console.error('PDF export error:', err);
            window.showToast('PDF 생성 중 오류가 발생하여 인쇄 화면으로 대신 전환합니다.', 'warning', 4500);
            window.print();
        } finally {
            window.hideLoading();
        }
    };

    // --- HWPX 균열 게이지·팁 측정결과 (templates/hwpx_crack_monitor.hwpx) ---
    const HWPX_HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
    const HWPX_HC_NS = 'http://www.hancom.co.kr/hwpml/2011/core';

    // 위치도 캡션에 [도면 7-N] 번호를 매기기 위한 임시 표시. 캡션을 채울 때 앞에 붙여 두고,
    // 문서를 다 만든 뒤 numberHwpxFigureCaptions가 문서 순서대로 실제 번호로 바꾼다.
    // (채워 넣는 순서 ≠ 최종 문서 순서라서 — 3종은 결함위치도를 맨 뒤로 몰아넣는다 — 번호를
    //  그때그때 매기면 뒤엉킨다. 반드시 마지막에 한 번에 매겨야 한다.)
    const HWPX_FIG_MARK = '␟';
    // 2026-10-30 3종 여러 동: 동이 바뀌는 첫 위치도 캡션에 붙여 도면 번호를 1부터 다시 매긴다(MARK 바로 뒤)
    const HWPX_FIG_RESET = '␞';

    /**
     * 도면 번호의 앞자리(보고서 장 번호) — 1·2종: 정기안전점검은 6, 정밀안전점검(그 밖의 점검 포함)은 7.
     * 정기점검 보고서는 비파괴 장이 없어 위치도가 한 장 앞에 온다(2026-10-07 사용자 지정).
     * 3종시설물은 점검 종류와 상관없이 5(2026-10-19 사용자 지정 「3종은 도면 번호가 5- 이렇게」).
     */
    function hwpxFigureChapterNo(inspectionType, opts) {
        if (opts && opts.grade3) return 5;
        return (inspectionType || '정밀안전점검') === '정기안전점검' ? 6 : 7;
    }

    /** 표시가 붙은 위치도 캡션에 문서 순서대로 [도면 7-1], [도면 7-2] … 를 매긴다(정기점검 [도면 6-N], 3종 [도면 5-N]). */
    function numberHwpxFigureCaptions(xmlDoc, inspectionType, opts) {
        const chapterNo = hwpxFigureChapterNo(inspectionType, opts);
        let figNo = 0;
        Array.from(xmlDoc.getElementsByTagNameNS(HWPX_HP_NS, 't')).forEach((t) => {
            const txt = t.textContent || '';
            if (txt.indexOf(HWPX_FIG_MARK) !== 0) return;
            let rest = txt.slice(HWPX_FIG_MARK.length);
            const figReset = '\u241E'; // = HWPX_FIG_RESET (함수만 떼어 쓰는 테스트에서도 동작하게 글자로)
            if (rest.indexOf(figReset) === 0) {
                figNo = 0;
                rest = rest.slice(figReset.length);
            }
            figNo++;
            t.textContent = `[도면 ${chapterNo}-${figNo}] ${rest}`;
        });
        return figNo;
    }

    // 중점관리 비교표 스탬프도 사진첩과 같이 paraPr/charPr/border를 본문 header에 합친다.
    // border만 옮기면 스탬프 charPrIDRef(0/10 등)가 정밀·정기 템플릿의 다른 글꼴·크기로 해석된다
    // (정기 템플릿 charPr 10 = 2700/굴림체 → 회차 라벨·범례가 비정상적으로 커짐).
    const mergeGrade3CompareStampHeader = (mainHdr, stampHdr, stampParas) => {
        return mergeGrade3PhotoAlbumStampHeader(mainHdr, stampHdr, stampParas);
    };

    // 사진첩 스탬프는 border뿐 아니라 문단/글자 모양(가운데정렬·굴림·8pt)도 본문 header에
    // 합쳐야 한다. ID만 남기면 정밀/정기 템플릿마다 다른 의미로 해석된다.
    const mergeGrade3PhotoAlbumStampHeader = (mainHdr, stampHdr, stampParas) => {
        const ser = new XMLSerializer();
        let fragmentXml = '';
        (stampParas || []).forEach((p) => { if (p) fragmentXml += ser.serializeToString(p); });
        if (!fragmentXml || !stampHdr) return { header: mainHdr, remapAttrs: null };

        const borderIds = new Set([...fragmentXml.matchAll(/borderFillIDRef="(\d+)"/g)].map(m => m[1]));
        const paraIds = new Set([...fragmentXml.matchAll(/paraPrIDRef="(\d+)"/g)].map(m => m[1]));
        const charIds = new Set([...fragmentXml.matchAll(/charPrIDRef="(\d+)"/g)].map(m => m[1]));
        // 글자/문단 모양 안의 borderFill도 같이 가져와야 한다(표 셀에 안 나온 id 포함).
        const collectInnerBorders = (tag, ids) => {
            ids.forEach((id) => {
                const re = new RegExp(`<hh:${tag} id="${id}"[\\s\\S]*?</hh:${tag}>`);
                const m = stampHdr.match(re);
                if (!m) return;
                for (const bm of m[0].matchAll(/borderFillIDRef="(\d+)"/g)) borderIds.add(bm[1]);
            });
        };
        collectInnerBorders('paraPr', paraIds);
        collectInnerBorders('charPr', charIds);

        const tagBlock = (hdr, tag, id) => {
            const re = new RegExp(`<hh:${tag} id="${id}"[\\s\\S]*?</hh:${tag}>`);
            const m = hdr.match(re);
            return m ? m[0] : null;
        };
        const maxId = (hdr, tag) => {
            const ids = [...hdr.matchAll(new RegExp(`<hh:${tag} id="(\\d+)"`, 'g'))].map(x => parseInt(x[1], 10));
            return ids.length ? Math.max(...ids) : 0;
        };
        const hangulFonts = (hdr) => {
            const faces = {};
            const m = hdr.match(/<hh:fontface\b[^>]*lang="HANGUL"[^>]*>([\s\S]*?)<\/hh:fontface>/i);
            if (!m) return faces;
            for (const fm of m[1].matchAll(/<hh:font\b([^>]*)>/g)) {
                const id = (fm[1].match(/\bid="(\d+)"/) || [])[1];
                const face = (fm[1].match(/\bface="([^"]*)"/) || [])[1];
                if (id && face) faces[id] = face;
            }
            return faces;
        };
        const stampFontById = hangulFonts(stampHdr);
        const mainFaceToId = {};
        Object.entries(hangulFonts(mainHdr)).forEach(([id, face]) => {
            if (!(face in mainFaceToId)) mainFaceToId[face] = id;
        });
        const mapFontRef = (stampFontId) => {
            const face = stampFontById[String(stampFontId)];
            if (face && mainFaceToId[face] != null) return String(mainFaceToId[face]);
            if (mainFaceToId['굴림'] != null) return String(mainFaceToId['굴림']);
            return String(stampFontId);
        };

        let outHdr = mainHdr;
        const borderMap = {};
        let nxtBf = maxId(outHdr, 'borderFill') + 1;
        [...borderIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((id) => {
            borderMap[id] = String(nxtBf++);
        });
        [...borderIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((bid) => {
            let b = tagBlock(stampHdr, 'borderFill', bid);
            if (!b) return;
            b = b.replace(/^<hh:borderFill id="\d+"/, `<hh:borderFill id="${borderMap[bid]}"`);
            outHdr = outHdr.replace('</hh:borderFills>', b + '</hh:borderFills>');
        });
        if (borderIds.size) {
            const bfCnt = (outHdr.match(/<hh:borderFill id="/g) || []).length;
            outHdr = outHdr.replace(/(<hh:borderFills[^>]*itemCnt=")(\d+)(")/, `$1${bfCnt}$3`);
        }

        const remapInnerBorders = (xml) => xml.replace(/borderFillIDRef="(\d+)"/g, (_, id) => (
            `borderFillIDRef="${borderMap[id] || id}"`
        ));

        const paraMap = {};
        let nxtPara = maxId(outHdr, 'paraPr') + 1;
        [...paraIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((id) => {
            paraMap[id] = String(nxtPara++);
        });
        [...paraIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((pid) => {
            let b = tagBlock(stampHdr, 'paraPr', pid);
            if (!b) return;
            b = b.replace(/^<hh:paraPr id="\d+"/, `<hh:paraPr id="${paraMap[pid]}"`);
            b = remapInnerBorders(b);
            outHdr = outHdr.replace('</hh:paraProperties>', b + '</hh:paraProperties>');
        });
        if (paraIds.size) {
            const cnt = (outHdr.match(/<hh:paraPr id="/g) || []).length;
            outHdr = outHdr.replace(/(<hh:paraProperties[^>]*itemCnt=")(\d+)(")/, `$1${cnt}$3`);
        }

        const charMap = {};
        let nxtChar = maxId(outHdr, 'charPr') + 1;
        [...charIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((id) => {
            charMap[id] = String(nxtChar++);
        });
        [...charIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((cid) => {
            let b = tagBlock(stampHdr, 'charPr', cid);
            if (!b) return;
            b = b.replace(/^<hh:charPr id="\d+"/, `<hh:charPr id="${charMap[cid]}"`);
            b = remapInnerBorders(b);
            b = b.replace(
                /<hh:fontRef\b([^>]*)\/>/,
                (full, attrs) => {
                    let a = attrs;
                    ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].forEach((n) => {
                        const m = a.match(new RegExp('\\b' + n + '="(\\d+)"'));
                        if (m) a = a.replace(new RegExp('\\b' + n + '="' + m[1] + '"'), n + '="' + mapFontRef(m[1]) + '"');
                    });
                    return `<hh:fontRef${a}/>`;
                }
            );
            outHdr = outHdr.replace('</hh:charProperties>', b + '</hh:charProperties>');
        });
        if (charIds.size) {
            const cnt = (outHdr.match(/<hh:charPr id="/g) || []).length;
            outHdr = outHdr.replace(/(<hh:charProperties[^>]*itemCnt=")(\d+)(")/, `$1${cnt}$3`);
        }

        return {
            header: outHdr,
            remapAttrs: {
                borderFillIDRef: borderMap,
                paraPrIDRef: paraMap,
                charPrIDRef: charMap
            }
        };
    };

    const stripHwpxParaRunBorderFill = (node) => {
        if (!node) return node;
        const walk = (el) => {
            if (!el || el.nodeType !== 1) return;
            if (el.localName === 'p' || el.localName === 'run') {
                el.removeAttribute('borderFillIDRef');
            }
            Array.from(el.children || []).forEach(walk);
        };
        walk(node);
        return node;
    };
    const remapHwpxCompareNode = (node, remapAttrs) => {
        if (!node || !remapAttrs) return stripHwpxParaRunBorderFill(node);
        const borderMap = remapAttrs.borderFillIDRef;
        const paraMap = remapAttrs.paraPrIDRef;
        const charMap = remapAttrs.charPrIDRef;
        const walk = (el) => {
            if (!el || el.nodeType !== 1) return;
            if (el.localName === 'tbl' || el.localName === 'tc') {
                const v = el.getAttribute('borderFillIDRef');
                if (v && borderMap && borderMap[v]) el.setAttribute('borderFillIDRef', borderMap[v]);
            }
            if (el.localName === 'p') {
                el.removeAttribute('borderFillIDRef');
                const pv = el.getAttribute('paraPrIDRef');
                if (pv && paraMap && paraMap[pv]) el.setAttribute('paraPrIDRef', paraMap[pv]);
            }
            if (el.localName === 'run') {
                el.removeAttribute('borderFillIDRef');
                const cv = el.getAttribute('charPrIDRef');
                if (cv && charMap && charMap[cv]) el.setAttribute('charPrIDRef', charMap[cv]);
            }
            Array.from(el.children || []).forEach(walk);
        };
        walk(node);
        return node;
    };

    function extractHwpxSecTopLevelParas(secEl) {
        if (!secEl) return [];
        return Array.from(secEl.childNodes).filter((n) => n.nodeType === 1 && (n.localName === 'p' || n.nodeName === 'hp:p'));
    }

    /**
     * 제목 문단(stamp)의 서식을 그대로 두고 글자만 바꾼 새 문단. 표·그림·조판 부호는 떼고, 첫 글자 칸 하나만 남긴다.
     * (템플릿 제목을 복제해 쓰므로 개요 번호·글꼴이 템플릿과 같다 — 새 서식 id를 만들지 않는다)
     */
    function makeHwpxTextParaFromStamp(stamp, text, hpNs, pageBreak) {
        const p = stamp.cloneNode(true);
        p.setAttribute('pageBreak', pageBreak ? '1' : '0');
        ['tbl', 'pic', 'ctrl', 'secPr', 'container', 'rect', 'line', 'equation'].forEach((tag) => {
            Array.from(p.getElementsByTagNameNS(hpNs, tag)).forEach((el) => { if (el.parentNode) el.parentNode.removeChild(el); });
        });
        const runs = Array.from(p.children).filter((c) => c.localName === 'run');
        let keepRun = runs.find((r) => r.getElementsByTagNameNS(hpNs, 't').length > 0) || runs[0] || null;
        runs.forEach((r) => { if (r !== keepRun && r.parentNode) r.parentNode.removeChild(r); });
        if (!keepRun) {
            keepRun = p.ownerDocument.createElementNS(hpNs, 'hp:run');
            keepRun.setAttribute('charPrIDRef', '0');
            p.insertBefore(keepRun, p.firstChild);
        }
        const ts = Array.from(keepRun.getElementsByTagNameNS(hpNs, 't'));
        let t = ts[0];
        ts.slice(1).forEach((x) => { if (x.parentNode) x.parentNode.removeChild(x); });
        if (!t) {
            t = p.ownerDocument.createElementNS(hpNs, 'hp:t');
            keepRun.appendChild(t);
        }
        while (t.firstChild) t.removeChild(t.firstChild);
        t.textContent = text;
        // 줄 배치 정보는 첫 줄만 남긴다(한글이 열 때 다시 잡는다) — 옛 글자 수에 맞춘 줄이 남으면 겹쳐 보인다
        const segArr = Array.from(p.children).find((c) => c.localName === 'linesegarray');
        if (segArr) {
            const segs = Array.from(segArr.children).filter((c) => c.localName === 'lineseg');
            segs.slice(1).forEach((s) => segArr.removeChild(s));
            if (segs[0]) {
                segs[0].setAttribute('textpos', '0');
                segs[0].setAttribute('vertpos', '0');
            }
        }
        return p;
    }

    /**
     * 한글 보고서 "비파괴 장비조사 사진첩" (2026-09-28) — 1·2종/3종 공용 뼈대.
     * anchorPara 뒤에 제목 → "1) 부재실측" 소제목 → 사진표(표 1개 = 사진 2장) … 순서로 넣는다.
     * - 소제목마다 새 쪽에서 시작한다(첫 소제목은 제목과 같은 쪽). 소제목이 있는 쪽은 표 2개(사진 4장),
     *   이어지는 쪽은 표 3개(사진 6장) — 결함 사진첩과 같은 표 크기라 제목까지 3개는 한 쪽을 넘는다.
     * - ctx.buildPairTbl(e1, e2 | null) → 채운 hp:tbl (못 만들면 null). 사진 파일·목록 등록은 부르는 쪽이 한다.
     * 반환: { titlePara, lastPara } (아무것도 못 넣었으면 null — 넣었던 제목도 걷어낸다).
     * titlePara는 부르는 쪽의 "표본 사진첩 지우기" 정리가 우리 사진첩을 지우지 않게 알려 주는 데 쓴다.
     */
    async function insertHwpxNdtPhotoAlbum(ctx) {
        const { hpNs, sections, anchorPara, headingStamp, subHeadingStamp, photoParaStamp, buildPairTbl, ensureTblTreatAsChar } = ctx;
        if (!anchorPara || !anchorPara.parentNode || !headingStamp || !subHeadingStamp || !photoParaStamp) return null;
        if (!Array.isArray(sections) || !sections.length) return null;
        const TABLES_FIRST_PAGE = 2;
        const TABLES_PER_PAGE = 3;
        const inserted = [];
        let cursor = anchorPara;
        const putAfterCursor = (node) => {
            cursor.parentNode.insertBefore(node, cursor.nextSibling);
            cursor = node;
            inserted.push(node);
        };
        const newPhotoPara = (pageBreak) => {
            const p = photoParaStamp.cloneNode(true);
            Array.from(p.getElementsByTagNameNS(hpNs, 'tbl')).forEach((t) => { if (t.parentNode) t.parentNode.removeChild(t); });
            p.setAttribute('pageBreak', pageBreak ? '1' : '0');
            const run = Array.from(p.children).find((c) => c.localName === 'run') || p.getElementsByTagNameNS(hpNs, 'run')[0];
            return { p, run };
        };

        const titlePara = makeHwpxTextParaFromStamp(headingStamp, '비파괴 장비조사 사진첩', hpNs, true);
        putAfterCursor(titlePara);
        let tableCount = 0;
        let secNo = 0;
        for (const sec of sections) {
            const entries = (sec && Array.isArray(sec.entries)) ? sec.entries : [];
            if (!entries.length) continue;
            secNo += 1;
            const cursorBeforeSection = cursor;
            const sub = makeHwpxTextParaFromStamp(subHeadingStamp, `${secNo}) ${sec.title}`, hpNs, secNo > 1);
            putAfterCursor(sub);
            let holder = null;
            let onPage = 0;
            let cap = TABLES_FIRST_PAGE;
            let tablesInSection = 0;
            for (let i = 0; i < entries.length; i += 2) {
                const tbl = await buildPairTbl(entries[i], entries[i + 1] || null);
                if (!tbl) continue;
                if (!holder || onPage >= cap) {
                    if (holder) cap = TABLES_PER_PAGE;
                    holder = newPhotoPara(!!(holder));
                    if (!holder.run) {
                        inserted.forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
                        throw new Error('사진첩 문단 틀에 글자 칸(hp:run)이 없습니다.');
                    }
                    putAfterCursor(holder.p);
                    onPage = 0;
                }
                if (typeof ensureTblTreatAsChar === 'function') ensureTblTreatAsChar(tbl);
                const trail = Array.from(holder.run.children).find((c) => c.localName === 't') || null;
                if (trail) holder.run.insertBefore(tbl, trail);
                else holder.run.appendChild(tbl);
                onPage += 1;
                tablesInSection += 1;
                tableCount += 1;
            }
            // 사진을 한 장도 못 넣은 소제목은 걷어낸다(번호는 다음 소제목이 이어받게 되돌린다)
            if (!tablesInSection) {
                if (sub.parentNode) sub.parentNode.removeChild(sub);
                inserted.splice(inserted.indexOf(sub), 1);
                cursor = cursorBeforeSection;
                secNo -= 1;
            }
        }
        if (!tableCount) {
            inserted.forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
            return null;
        }
        // 사진첩 다음 내용(상태조사표 등)은 새 쪽에서 — 마지막 쪽이 덜 차도 이어 붙지 않게
        let next = cursor.nextElementSibling;
        while (next && next.localName === 'p'
            && !next.getElementsByTagNameNS(hpNs, 'tbl').length
            && !next.getElementsByTagNameNS(hpNs, 'pic').length
            && !Array.from(next.getElementsByTagNameNS(hpNs, 't')).map((t) => t.textContent || '').join('').trim()) {
            next = next.nextElementSibling;
        }
        if (next && next.localName === 'p') next.setAttribute('pageBreak', '1');
        return { titlePara, lastPara: cursor };
    }

    function formatHwpxCrackMonitorDate(dateStr) {
        const s = String(dateStr || '').trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}. ${m[2]}. ${m[3]}`;
        return s;
    }

    function formatHwpxGaugeAxisCell(axis, val, prevVal, opts) {
        opts = opts || {};
        if (val == null || String(val).trim() === '') return '-';
        const n = parseMonitorNumber(val);
        if (n == null) return String(val);
        let prefix = axis === 'y' ? '↓ ' : (n > 0 ? '→ ' : '± ');
        if (axis === 'x' && n === 0) prefix = '± ';
        let s = prefix + (axis === 'y' ? n : Math.abs(n));
        // 초기값 칸에 붙던 「(초기값)」 문구는 뺌 — 줄 이름(초기 부착 data)으로 충분 (2026-10-23 요청)
        if (!opts.isInitial && prevVal != null && String(prevVal).trim() !== '') {
            const pn = parseMonitorNumber(prevVal);
            if (pn != null && pn !== n) {
                const d = Math.round(Math.abs(n - pn) * 100) / 100;
                if (d > 0) s += ` ←${d}`;
            }
        }
        return s;
    }

    function formatHwpxTipLengthCell(val, opts) {
        opts = opts || {};
        if (val == null || String(val).trim() === '') return '-';
        return String(val).trim();
    }

    function formatHwpxCrackChangeSummary(slot) {
        if (!slot) return '-';
        if (slot.kind === 'tip') {
            const log = slot.tip;
            const lastIdx = (log.readings || []).length - 1;
            if (lastIdx < 0) return '-';
            const cum = computeTipCumulative(log, lastIdx);
            if (cum == null || !Number.isFinite(cum)) return '-';
            return `${Math.abs(Math.round(cum * 100) / 100)}mm`;
        }
        const log = slot.gauge;
        const last = log.readings && log.readings.length ? log.readings[log.readings.length - 1] : null;
        if (!last) return '-';
        const d = computeGaugeDeltas(log, last);
        const parts = [];
        if (d.dy != null && Number.isFinite(d.dy)) parts.push(`↓ ${Math.abs(Math.round(d.dy * 10) / 10)}mm`);
        if (d.dx != null && Number.isFinite(d.dx)) parts.push(`${d.dx >= 0 ? '→' : '±'} ${Math.abs(Math.round(d.dx * 10) / 10)}mm`);
        return parts.length ? parts.join(' ') : '-';
    }

    function formatHwpxCrackSummaryChangeText(slot) {
        if (!slot) return '-';
        if (slot.kind === 'tip') return formatHwpxCrackChangeSummary(slot);
        const log = slot.gauge;
        const last = log.readings && log.readings.length ? log.readings[log.readings.length - 1] : null;
        if (!last) return '-';
        const d = computeGaugeDeltas(log, last);
        const parts = [];
        if (d.dx != null && Number.isFinite(d.dx)) parts.push(`${d.dx >= 0 ? '→' : '↓'}${Math.abs(Math.round(d.dx * 10) / 10)}mm`);
        if (d.dy != null && Number.isFinite(d.dy)) parts.push(`${d.dy >= 0 ? '↓' : '↑'}${Math.abs(Math.round(d.dy * 10) / 10)}mm`);
        return parts.length ? parts.join('/') : '-';
    }

    function buildHwpxCrackMonitorFloorsData(bldg, bldgId) {
        // 보고서 본문과 같은 층 목록(추가 도면 층·비파괴에만 있는 층 포함) — floorsList만 보면 빠지는 층이 있다
        let floorCodes = [];
        if (bldgId && typeof listNdtFloorCodesForBuilding === 'function') {
            floorCodes = listNdtFloorCodesForBuilding(bldgId);
        }
        if (!floorCodes.length) {
            if (bldg.floorsList && bldg.floorsList.length) {
                floorCodes = bldg.floorsList.map((f) => f.floorCode);
            } else if (window.state.currentFloor) {
                floorCodes = [window.state.currentFloor];
            }
        }
        const seen = new Set();
        return floorCodes.filter((fc) => {
            if (!fc || seen.has(fc)) return false;
            seen.add(fc);
            return true;
        }).map((floorCode) => {
            const key = `${bldgId}_${floorCode}`;
            const pageDefects = window.state.defects[key] || (window.state.currentFloor === floorCode ? getCurrentFloorDefects() : []);
            const gaugeMarks = ((window.state.ndtData && window.state.ndtData[key]) || []).filter(isCrackGaugeNdtItem);
            return { floorCode, pageDefects, gaugeMarks };
        }).filter((row) => (row.pageDefects && row.pageDefects.length) || (row.gaugeMarks && row.gaugeMarks.length));
    }

    /** 게이지 마킹(비파괴 항목)을 내보내기용 결함 모양으로 — 부재·위치는 마킹 자신의 값 */
    function crackGaugeMarkAsExportDefect(item) {
        return {
            id: item.id,
            no: getCrackGaugeMarkDisplayNo(item),
            component: memberNameOut(item.component) || '',
            locationDetail: item.location || '',
            defectType: '균열',
            _crackGaugeMark: true
        };
    }

    function getCrackMonitorItemRoundLabels(item, bldg) {
        if (item && item.defect && !item.defect._crackGaugeMark && typeof getDefectHwpxCompareRoundLabelsFull === 'function') {
            return getDefectHwpxCompareRoundLabelsFull(item.defect, bldg);
        }
        const currKey = (typeof getBuildingSurveyRoundKey === 'function') ? getBuildingSurveyRoundKey(bldg) : '';
        const prevKey = currKey && typeof getPreviousSurveyRoundKey === 'function' ? getPreviousSurveyRoundKey(currKey) : '';
        const fmt = (k) => (k && typeof formatSurveyRoundLabelHwpxCompare === 'function') ? formatSurveyRoundLabelHwpxCompare(k) : '';
        return { prev: fmt(prevKey), curr: fmt(currKey) };
    }

    // 한글에 낼 값이 있는지 — 측정 줄은 회차·날짜가 미리 채워져 저장되므로 줄 수가 아니라
    // 초기값·측정값·사진으로 본다. 게이지 번호만 있는 빈 항목은 한글에서 뺀다.
    function crackGaugeLogHasHwpxData(g) {
        return !!(g.initialX || g.initialY || g.prevPhoto || g.currPhoto || g.prevPhotoId || g.currPhotoId
            || (g.readings || []).some((r) => String(r.xMm || '').trim() || String(r.yMm || '').trim()));
    }

    function crackTipLogHasHwpxData(t) {
        return !!(t.initialLengthMm || t.prevPhoto || t.currPhoto || t.prevPhotoId || t.currPhotoId
            || (t.readings || []).some((r) => String(r.lengthMm || '').trim()));
    }

    function collectHwpxCrackMonitorExportItems(bldg, bldgId, floorsData, getFloorLabel) {
        const items = [];
        (floorsData || []).forEach(({ floorCode, pageDefects, gaugeMarks }) => {
            // 예전 방식: 균열 결함에 붙은 기록 (위치 정보는 연결된 균열 결함) — 기존 출력 순서 유지를 위해 먼저
            (pageDefects || []).forEach((defect) => {
                if (!defectNeedsCrackMonitorUi(defect)) return;
                const gauge = normalizeCrackGaugeLog(defect.crackGaugeLog);
                const tip = normalizeCrackTipLog(defect.crackTipLog);
                const hasGauge = crackGaugeLogHasHwpxData(gauge);
                const hasTip = crackTipLogHasHwpxData(tip);
                if (!hasGauge && !hasTip) return;
                items.push({
                    defect,
                    floorCode,
                    floorLabel: getFloorLabel(floorCode),
                    gauge,
                    tip,
                    hasGauge,
                    hasTip
                });
            });
            // 도면에 직접 찍은 게이지 (위치 정보는 게이지 마킹 자신의 부재·위치·층)
            (gaugeMarks || []).forEach((mark) => {
                const gauge = normalizeCrackGaugeLog(mark.crackGaugeLog);
                const tip = normalizeCrackTipLog(mark.crackTipLog);
                const hasGauge = crackGaugeLogHasHwpxData(gauge);
                const hasTip = crackTipLogHasHwpxData(tip);
                if (!hasGauge && !hasTip) return;
                items.push({
                    defect: crackGaugeMarkAsExportDefect(mark),
                    floorCode,
                    floorLabel: getFloorLabel(floorCode),
                    gauge,
                    tip,
                    hasGauge,
                    hasTip
                });
            });
        });
        // 게이지·팁 전부 (2026-09-29 전엔 3개까지만). 게이지 먼저, 팁은 뒤 — 양식 순서.
        // no = 표·사진의 NO. 번호, col = 예전 16줄 표 칸 번호(공용 규칙이 없을 때만 씀)
        // 게이지 번호는 건물 전체에서 이어지므로 층과 상관없이 번호 순 (번호 없는 것은 원래 순서로 뒤에)
        const sortedItems = sortCrackGaugesByNo(items, (it) => (it.gauge && it.gauge.gaugeNo) || (it.defect && it.defect._crackGaugeMark ? it.defect.no : ''));
        items.length = 0;
        sortedItems.forEach((it) => items.push(it));
        // 열 순서 = 번호 순. 같은 번호에 게이지·팁이 다 있으면 게이지 바로 뒤에 팁
        // (예전엔 게이지 전부 → 팁 전부라 크랙모니터·균열팁이 따로 몰려 나왔다, 2026-10-23)
        const slots = [];
        items.forEach((item) => {
            if (item.hasGauge) slots.push({ ...item, kind: 'gauge' });
            if (item.hasTip) slots.push({ ...item, kind: 'tip' });
        });
        slots.forEach((slot, idx) => { slot.no = idx + 1; slot.col = idx + 1; });
        return { items, slots };
    }

    function getHwpxTblCellByAddr(tbl, rowAddr, colAddr) {
        if (!tbl) return null;
        const trs = Array.from(tbl.getElementsByTagNameNS(HWPX_HP_NS, 'tr'));
        for (let i = 0; i < trs.length; i += 1) {
            const tcs = Array.from(trs[i].getElementsByTagNameNS(HWPX_HP_NS, 'tc'));
            for (let j = 0; j < tcs.length; j += 1) {
                const addr = tcs[j].getElementsByTagNameNS(HWPX_HP_NS, 'cellAddr')[0];
                if (!addr) continue;
                if (parseInt(addr.getAttribute('rowAddr'), 10) === rowAddr && parseInt(addr.getAttribute('colAddr'), 10) === colAddr) {
                    return tcs[j];
                }
            }
        }
        return null;
    }

    function findHwpxTblByRowCount(root, rowCnt) {
        const tbls = Array.from(root.getElementsByTagNameNS(HWPX_HP_NS, 'tbl'));
        return tbls.find((tbl) => parseInt(tbl.getAttribute('rowCnt') || '0', 10) === rowCnt) || null;
    }

    function getHwpxCrackMonitorApi() {
        return (window.BSA && window.BSA.hwpxCrackMonitor) || null;
    }

    function hwpxCrackMonitorFormatters(bldg) {
        return {
            // 'NO.1' 뒤에 띄어쓰기 — 층 이름이 숫자로 시작하면 'NO.11층'처럼 붙어 읽혔다
            header: (slot) => `NO.${slot.no || slot.col} ${slot.floorLabel || ''} ${memberNameOut(slot.defect.component) || ''}`.replace(/\s+/g, ' ').trim(),
            typeLabel: (slot) => (slot.kind === 'tip' ? '균열팁' : '크랙모니터'),
            gaugeAxis: formatHwpxGaugeAxisCell,
            tipLength: formatHwpxTipLengthCell,
            change: formatHwpxCrackChangeSummary,
            summaryChange: formatHwpxCrackSummaryChangeText,
            date: (r) => formatHwpxCrackMonitorDate(r && r.date) || (r && r.roundKey) || '',
            member: (item) => memberNameOut(item.defect.component) || '',
            // 게이지 위치에 층이 이미 들어 있으면(행·열 자동 입력) 층을 또 붙이지 않는다
            location: (item) => {
                const fl = String(item.floorLabel || '').trim();
                const detail = String(item.defect.locationDetail || '').trim();
                return (fl && detail.startsWith(fl) ? detail : `${fl} ${detail}`).trim();
            },
            roundLabels: (item) => getCrackMonitorItemRoundLabels(item, bldg)
        };
    }

    /** 표 칸 값 묶음("행,열" → 글자)을 표에 넣는다 */
    function applyHwpxCellMap(tbl, cells, setTcText) {
        Object.keys(cells || {}).forEach((key) => {
            const parts = key.split(',');
            const tc = getHwpxTblCellByAddr(tbl, parseInt(parts[0], 10), parseInt(parts[1], 10));
            if (tc) setTcText(tc, cells[key]);
        });
    }

    /**
     * 측정표를 게이지 수(열)·측정 달 수(줄)에 맞게 다시 짠다. 양식 줄을 원본으로 쓴다:
     * 0~2줄 머리글, 3줄 초기값, 4줄 측정(달마다 복제), 마지막 줄 변화량.
     * 게이지 열 너비는 양식의 게이지 칸 전체 너비를 나눠 쓰고, 측정일·비고 열은 그대로.
     * 글자를 줄이면(layout.scale<1) 줄 높이도 같은 비율로 줄인다.
     */
    function reshapeHwpxCrackMonitorTable(tbl, layout) {
        const HP = HWPX_HP_NS;
        const trs = Array.from(tbl.children).filter((c) => c.localName === 'tr');
        if (trs.length < 6) return false;
        const tcsOf = (tr) => Array.from(tr.children).filter((c) => c.localName === 'tc');
        const child = (tc, name) => Array.from(tc.children).find((c) => c.localName === name);
        const colOf = (tc) => parseInt(child(tc, 'cellAddr').getAttribute('colAddr'), 10);
        const byCol = (tr, c) => tcsOf(tr).find((tc) => colOf(tc) === c) || null;
        const szOf = (tc) => child(tc, 'cellSz');
        const tplNote = parseInt(tbl.getAttribute('colCnt') || '5', 10) - 1;
        const head0 = trs[0]; const head1 = trs[1]; const head2 = trs[2];
        const initRow = trs[3]; const dataRow = trs[4]; const changeRow = trs[trs.length - 1];
        const need = [byCol(head0, 0), byCol(head0, 1), byCol(head0, tplNote), byCol(head1, 1), byCol(head2, 1),
            byCol(initRow, 0), byCol(initRow, 1), byCol(initRow, tplNote), byCol(dataRow, 0), byCol(dataRow, 1), byCol(dataRow, tplNote),
            byCol(changeRow, 0), byCol(changeRow, 1), byCol(changeRow, tplNote)];
        if (need.some((x) => !x || !szOf(x) || !child(x, 'cellAddr'))) return false;
        const W = (tc) => parseInt(szOf(tc).getAttribute('width'), 10) || 0;
        const H = (tc) => parseInt(szOf(tc).getAttribute('height'), 10) || 0;
        const n = layout.nSlots;
        const noteCol = n + 1;
        const dateW = W(byCol(initRow, 0));
        const noteW = W(byCol(initRow, tplNote));
        const slotTotal = W(byCol(head0, 1));
        const baseSlotW = Math.floor(slotTotal / n);
        const slotW = (i) => (i < n - 1 ? baseSlotW : slotTotal - baseSlotW * (n - 1));
        const scale = layout.scale || 1;
        const rowH = (tr) => Math.max(1, Math.round(H(byCol(tr, 1)) * scale));
        const place = (tc, r, c, width, height, colSpan) => {
            const a = child(tc, 'cellAddr');
            a.setAttribute('rowAddr', String(r));
            a.setAttribute('colAddr', String(c));
            if (width != null) szOf(tc).setAttribute('width', String(width));
            if (height != null) szOf(tc).setAttribute('height', String(height));
            if (colSpan != null) child(tc, 'cellSpan').setAttribute('colSpan', String(colSpan));
            return tc;
        };
        const header = (tc) => { tc.setAttribute('header', '1'); return tc; }; // 쪽이 넘어가면 머리글 반복
        const out = [];
        // 0줄
        const r0 = head0.cloneNode(false);
        r0.appendChild(header(place(byCol(head0, 0).cloneNode(true), 0, 0, null, null)));
        r0.appendChild(header(place(byCol(head0, 1).cloneNode(true), 0, 1, slotTotal, null, n)));
        r0.appendChild(header(place(byCol(head0, tplNote).cloneNode(true), 0, noteCol, null, null)));
        out.push(r0);
        // 1·2줄 (게이지 이름·종류)
        [head1, head2].forEach((proto, k) => {
            const tr = proto.cloneNode(false);
            for (let i = 0; i < n; i += 1) tr.appendChild(header(place(byCol(proto, 1).cloneNode(true), k + 1, i + 1, slotW(i), null)));
            out.push(tr);
        });
        const fullRow = (proto, r) => {
            const tr = proto.cloneNode(false);
            const h = rowH(proto);
            tr.appendChild(place(byCol(proto, 0).cloneNode(true), r, 0, dateW, h));
            for (let i = 0; i < n; i += 1) tr.appendChild(place(byCol(proto, 1).cloneNode(true), r, i + 1, slotW(i), h));
            tr.appendChild(place(byCol(proto, tplNote).cloneNode(true), r, noteCol, noteW, h));
            return tr;
        };
        out.push(fullRow(initRow, 3));
        for (let k = 0; k < layout.dataRows; k += 1) out.push(fullRow(dataRow, 4 + k));
        out.push(fullRow(changeRow, layout.changeRow));
        trs.forEach((tr) => tbl.removeChild(tr));
        out.forEach((tr) => tbl.appendChild(tr));
        tbl.setAttribute('rowCnt', String(layout.rowCnt));
        tbl.setAttribute('colCnt', String(layout.colCnt));
        const headH = H(byCol(head0, 0));
        const total = headH + rowH(initRow) + rowH(dataRow) * layout.dataRows + rowH(changeRow);
        const sz = child(tbl, 'sz');
        if (sz) sz.setAttribute('height', String(total));
        return true;
    }

    /** 글자 줄이기: 기준 글자 모양(charPr)을 복제해 크기만 바꾼 새 id (같은 크기는 재사용) */
    // 2026-10-28 균열게이지 글자 크기: 측정표 7.5pt, 비교사진 표 9pt (한글 charPr height = pt × 100)
    const HWPX_CRACK_MEASURE_HEIGHT = 750;
    const HWPX_CRACK_SUMMARY_HEIGHT = 900;

    function hwpxCharPrHeight(headerText, id) {
        const m = String(headerText || '').match(new RegExp(`<hh:charPr id="${id}"[^>]*\\bheight="(\\d+)"`));
        return m ? parseInt(m[1], 10) : 0;
    }

    /** baseId 글자 모양을 복제해 크기만 height로 바꾼 글자 모양 id(같은 크기는 한 번만 만든다) */
    function ensureHwpxSizedCharPr(hwpxHeaderState, baseId, height) {
        if (!hwpxHeaderState || !hwpxHeaderState.text || !baseId || !(height > 0)) return null;
        hwpxHeaderState.sizedCharPr = hwpxHeaderState.sizedCharPr || {};
        const cacheKey = `${baseId}@${height}`;
        if (hwpxHeaderState.sizedCharPr[cacheKey]) return hwpxHeaderState.sizedCharPr[cacheKey];
        let hdr = hwpxHeaderState.text;
        const m = hdr.match(new RegExp(`<hh:charPr id="${baseId}"[^>]*>[\\s\\S]*?</hh:charPr>`));
        if (!m) return null;
        const ids = [...hdr.matchAll(/<hh:charPr id="(\d+)"/g)].map((x) => parseInt(x[1], 10));
        const newId = String((ids.length ? Math.max(...ids) : 0) + 1);
        const block = m[0].replace(/^<hh:charPr id="\d+"/, `<hh:charPr id="${newId}"`)
            .replace(/(<hh:charPr[^>]*\bheight=")(\d+)(")/, (all, a, h, b) => `${a}${height}${b}`);
        if (!hdr.includes('</hh:charProperties>')) return null;
        hdr = hdr.replace('</hh:charProperties>', block + '</hh:charProperties>');
        const cnt = (hdr.match(/<hh:charPr id="/g) || []).length;
        hdr = hdr.replace(/(<hh:charProperties[^>]*itemCnt=")(\d+)(")/, `$1${cnt}$3`);
        hwpxHeaderState.text = hdr;
        hwpxHeaderState.dirty = true;
        hwpxHeaderState.sizedCharPr[cacheKey] = newId;
        return newId;
    }

    /** 표 안 글자를 height 크기로(줄 정보 lineseg는 원래 글자 크기와의 비율만큼) */
    function setHwpxCrackTableTextHeight(tbl, hwpxHeaderState, baseId, height) {
        const sizedId = ensureHwpxSizedCharPr(hwpxHeaderState, baseId, height);
        if (!sizedId) return;
        const baseH = hwpxCharPrHeight(hwpxHeaderState.text, baseId) || height;
        scaleHwpxTableText(tbl, sizedId, height / baseH);
    }

    function scaleHwpxTableText(tbl, charPrId, scale) {
        if (!tbl || !charPrId) return;
        Array.from(tbl.getElementsByTagNameNS(HWPX_HP_NS, 'run')).forEach((run) => run.setAttribute('charPrIDRef', charPrId));
        Array.from(tbl.getElementsByTagNameNS(HWPX_HP_NS, 'lineseg')).forEach((seg) => {
            ['vertpos', 'vertsize', 'textheight', 'baseline', 'spacing'].forEach((k) => {
                const v = parseInt(seg.getAttribute(k) || '', 10);
                if (Number.isFinite(v)) seg.setAttribute(k, String(Math.round(v * scale)));
            });
        });
    }

    // 2026-09-29 입력 안 한 측정값이 튀어나오던 문제: 양식 속 다른 건물 예시값이 남지 않게
    // 모든 칸을 먼저 비우고 입력한 값만 넣는다 (규칙은 js/shared/hwpx-crack-monitor.js, 테스트 있음)
    function fillHwpxCrackMonitorCurrentTable(tbl, slots, setTcText, bldg) {
        if (!tbl || !slots || !slots.length) return;
        const api = getHwpxCrackMonitorApi();
        if (api && api.buildCurrentTableCells) {
            applyHwpxCellMap(tbl, api.buildCurrentTableCells(slots, hwpxCrackMonitorFormatters(bldg)), setTcText);
            return;
        }
        console.warn('hwpx-crack-monitor.js가 없어 예전 방식으로 균열게이지 표를 채웁니다.');
        slots.forEach((slot) => {
            const col = slot.col;
            const header = `NO.${slot.col}${slot.floorLabel || ''} ${memberNameOut(slot.defect.component) || ''}`.trim();
            setTcText(getHwpxTblCellByAddr(tbl, 1, col), header);
            setTcText(getHwpxTblCellByAddr(tbl, 2, col), slot.kind === 'tip' ? '균열팁' : '크랙모니터');
            if (slot.kind === 'tip') {
                setTcText(getHwpxTblCellByAddr(tbl, 3, col), formatHwpxTipLengthCell(slot.tip.initialLengthMm, { isInitial: true }));
            } else {
                setTcText(getHwpxTblCellByAddr(tbl, 3, col), formatHwpxGaugeAxisCell('y', slot.gauge.initialY, null, { isInitial: true }));
                // col is single cell per slot; combine X/Y on initial row if both exist
                const xInit = slot.gauge.initialX;
                if (xInit) {
                    const tc = getHwpxTblCellByAddr(tbl, 3, col);
                    const cur = formatHwpxGaugeAxisCell('y', slot.gauge.initialY, null, { isInitial: true });
                    setTcText(tc, `${cur} / ${formatHwpxGaugeAxisCell('x', xInit, null, { isInitial: true })}`);
                }
            }
        });
        const dateKeys = [];
        const dateMap = {};
        slots.forEach((slot) => {
            const readings = slot.kind === 'tip' ? (slot.tip.readings || []) : (slot.gauge.readings || []);
            readings.forEach((r) => {
                const key = formatHwpxCrackMonitorDate(r.date) || r.roundKey || '';
                if (!key) return;
                if (!dateMap[key]) {
                    dateMap[key] = {};
                    dateKeys.push(key);
                }
                dateMap[key][slot.col] = { slot, reading: r };
            });
        });
        let dataRow = 4;
        const maxDataRow = 14;
        dateKeys.forEach((dk, idx) => {
            if (dataRow > maxDataRow) return;
            setTcText(getHwpxTblCellByAddr(tbl, dataRow, 0), dk);
            slots.forEach((slot) => {
                const hit = dateMap[dk] && dateMap[dk][slot.col];
                if (!hit) {
                    setTcText(getHwpxTblCellByAddr(tbl, dataRow, slot.col), '-');
                    return;
                }
                const readings = hit.slot.kind === 'tip' ? (hit.slot.tip.readings || []) : (hit.slot.gauge.readings || []);
                const rIdx = readings.indexOf(hit.reading);
                const prev = rIdx > 0 ? readings[rIdx - 1] : null;
                if (hit.slot.kind === 'tip') {
                    setTcText(getHwpxTblCellByAddr(tbl, dataRow, slot.col), formatHwpxTipLengthCell(hit.reading.lengthMm, {}));
                } else {
                    const yTxt = formatHwpxGaugeAxisCell('y', hit.reading.yMm, prev && prev.yMm, {});
                    const xTxt = hit.reading.xMm ? formatHwpxGaugeAxisCell('x', hit.reading.xMm, prev && prev.xMm, {}) : '';
                    setTcText(getHwpxTblCellByAddr(tbl, dataRow, slot.col), xTxt ? `${yTxt} / ${xTxt}` : yTxt);
                }
            });
            setTcText(getHwpxTblCellByAddr(tbl, dataRow, 4), '-');
            dataRow += 1;
        });
        for (let r = dataRow; r <= maxDataRow; r += 1) {
            for (let c = 0; c <= 4; c += 1) setTcText(getHwpxTblCellByAddr(tbl, r, c), c === 0 && r === maxDataRow ? '금회 측정' : '-');
        }
        setTcText(getHwpxTblCellByAddr(tbl, 15, 0), '변화량(금회측정-초기값)');
        slots.forEach((slot) => {
            setTcText(getHwpxTblCellByAddr(tbl, 15, slot.col), formatHwpxCrackChangeSummary(slot));
        });
        setTcText(getHwpxTblCellByAddr(tbl, 15, 4), '-');
    }

    function hwpxIsLightPurpleColor(hex) {
        if (!hex) return false;
        const s = String(hex).replace(/^#/, '').toUpperCase();
        if (s.length !== 6) return false;
        if (s === 'CCC0DA' || s === 'E2D5F1' || s === 'D8C8E8' || s === 'BFA5D4') return true;
        const r = parseInt(s.slice(0, 2), 16);
        const g = parseInt(s.slice(2, 4), 16);
        const b = parseInt(s.slice(4, 6), 16);
        // light purple-ish: blue & red high, green a bit lower
        return b >= 180 && r >= 150 && g >= 130 && b >= g && r >= g - 10 && (b - g) >= 15;
    }

    function ensureHwpxCrackMonitorStyleIds(hwpxHeaderState) {
        if (!hwpxHeaderState || !hwpxHeaderState.text) return { transparentBfId: null, gulimCharPrId: null };
        let hdr = hwpxHeaderState.text;
        const maxId = (tag) => {
            const ids = [...hdr.matchAll(new RegExp(`<hh:${tag} id="(\\d+)"`, 'g'))].map((x) => parseInt(x[1], 10));
            return ids.length ? Math.max(...ids) : 0;
        };
        let transparentBfId = null;
        // Prefer an existing transparent winBrush fill
        const bfRe = /<hh:borderFill id="(\d+)"[\s\S]*?<\/hh:borderFill>/g;
        let m;
        while ((m = bfRe.exec(hdr))) {
            const block = m[0];
            const faces = [...block.matchAll(/faceColor="([^"]+)"/g)].map((x) => x[1]);
            const solids = [...block.matchAll(/value="#([0-9A-Fa-f]{6})"/g)].map((x) => x[1].toUpperCase());
            if (faces.includes('none') && !solids.some(hwpxIsLightPurpleColor)) {
                transparentBfId = m[1];
                break;
            }
        }
        if (!transparentBfId) {
            transparentBfId = String(maxId('borderFill') + 1);
            const bfXml = `<hh:borderFill id="${transparentBfId}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush></hh:borderFill>`;
            if (hdr.includes('</hh:borderFills>')) {
                hdr = hdr.replace('</hh:borderFills>', bfXml + '</hh:borderFills>');
                const bfCnt = (hdr.match(/<hh:borderFill id="/g) || []).length;
                hdr = hdr.replace(/(<hh:borderFills[^>]*itemCnt=")(\d+)(")/, `$1${bfCnt}$3`);
            }
            hwpxHeaderState.dirty = true;
        }

        // Find Gulim font id in hangul fontface (first face="굴림")
        let gulimFontId = null;
        const fontFace = [...hdr.matchAll(/<hh:font id="(\d+)"[^>]*face="굴림"/g)];
        if (fontFace.length) gulimFontId = fontFace[0][1];
        if (!gulimFontId) gulimFontId = '1';

        let gulimCharPrId = null;
        const charRe = /<hh:charPr id="(\d+)"([^>]*)>([\s\S]*?)<\/hh:charPr>/g;
        while ((m = charRe.exec(hdr))) {
            const attrs = m[2] || '';
            const body = m[3] || '';
            const shade = (attrs.match(/shadeColor="([^"]+)"/) || [])[1] || 'none';
            const hangul = (body.match(/hangul="(\d+)"/) || [])[1];
            if (shade === 'none' && hangul === gulimFontId && !hwpxIsLightPurpleColor((attrs.match(/textColor="#([^"]+)"/) || [])[1])) {
                gulimCharPrId = m[1];
                break;
            }
        }
        if (!gulimCharPrId) {
            gulimCharPrId = String(maxId('charPr') + 1);
            const proto = hdr.match(/<hh:charPr id="\d+"[\s\S]*?<\/hh:charPr>/);
            let bodyInner = '<hh:fontRef hangul="FONT" latin="FONT" hanja="FONT" japanese="FONT" other="FONT" symbol="FONT" user="FONT"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>';
            if (proto) {
                const inner = proto[0].replace(/^<hh:charPr[^>]*>/, '').replace(/<\/hh:charPr>$/, '');
                bodyInner = inner.replace(/hangul="\d+"/g, `hangul="${gulimFontId}"`)
                    .replace(/latin="\d+"/g, `latin="${gulimFontId}"`)
                    .replace(/hanja="\d+"/g, `hanja="${gulimFontId}"`)
                    .replace(/japanese="\d+"/g, `japanese="${gulimFontId}"`)
                    .replace(/other="\d+"/g, `other="${gulimFontId}"`)
                    .replace(/symbol="\d+"/g, `symbol="${gulimFontId}"`)
                    .replace(/user="\d+"/g, `user="${gulimFontId}"`);
            } else {
                bodyInner = bodyInner.replace(/FONT/g, gulimFontId);
            }
            const charXml = `<hh:charPr id="${gulimCharPrId}" height="850" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="${transparentBfId}">${bodyInner}</hh:charPr>`;
            if (hdr.includes('</hh:charProperties>')) {
                hdr = hdr.replace('</hh:charProperties>', charXml + '</hh:charProperties>');
                const cpCnt = (hdr.match(/<hh:charPr id="/g) || []).length;
                hdr = hdr.replace(/(<hh:charProperties[^>]*itemCnt=")(\d+)(")/, `$1${cpCnt}$3`);
            }
            hwpxHeaderState.dirty = true;
        }

        hwpxHeaderState.text = hdr;
        return { transparentBfId, gulimCharPrId };
    }


    function polishHwpxCrackMonitorNode(root, styleIds, purpleBfIds) {
        if (!root || !styleIds) return root;
        const transparentBfId = styleIds.transparentBfId;
        const gulimCharPrId = styleIds.gulimCharPrId;
        const purpleSet = purpleBfIds instanceof Set ? purpleBfIds : new Set(purpleBfIds || []);
        const walk = (el) => {
            if (!el || el.nodeType !== 1) return;
            if ((el.localName === 'tc' || el.localName === 'tbl') && transparentBfId) {
                const bf = el.getAttribute('borderFillIDRef');
                // Only remap cells that still point at a purple fill (ID collision with main template)
                if (bf && purpleSet.has(String(bf))) el.setAttribute('borderFillIDRef', transparentBfId);
            }
            if ((el.localName === 'run' || el.localName === 'p') && gulimCharPrId) {
                if (el.localName === 'run') el.setAttribute('charPrIDRef', gulimCharPrId);
                el.removeAttribute('borderFillIDRef');
            }
            Array.from(el.children || []).forEach(walk);
        };
        walk(root);
        return root;
    }

    function collectHwpxPurpleBorderFillIds(headerText) {
        const ids = new Set();
        if (!headerText) return ids;
        const re = /<hh:borderFill id="(\d+)"[\s\S]*?<\/hh:borderFill>/g;
        let m;
        while ((m = re.exec(headerText))) {
            const block = m[0];
            const faces = [...block.matchAll(/faceColor="([^"]+)"/g)].map((x) => String(x[1]).replace(/^#/, ''));
            const vals = [...block.matchAll(/value="#([0-9A-Fa-f]{6})"/g)].map((x) => x[1]);
            if (faces.some(hwpxIsLightPurpleColor) || vals.some(hwpxIsLightPurpleColor)) ids.add(m[1]);
        }
        return ids;
    }

    function getCrackMonitorComparePhotos(slot) {
        if (!slot) return { prev: '', curr: '' };
        if (slot.kind === 'tip') {
            const tip = slot.tip || {};
            return { prev: tip.prevPhoto || '', curr: tip.currPhoto || '' };
        }
        const gauge = slot.gauge || {};
        return { prev: gauge.prevPhoto || '', curr: gauge.currPhoto || '' };
    }

    async function loadHwpxCrackMonitorStampTemplate() {
        try {
            const resp = await fetch('./templates/hwpx_crack_monitor.hwpx', { cache: 'no-store' });
            if (!resp.ok) return null;
            const stampZip = await JSZip.loadAsync(await resp.arrayBuffer());
            const sectionPath = stampZip.file('Contents/section1.xml') ? 'Contents/section1.xml' : 'Contents/section0.xml';
            const sectionXml = await stampZip.file(sectionPath).async('string');
            const stampDoc = new DOMParser().parseFromString(sectionXml, 'application/xml');
            const stampSec = stampDoc.getElementsByTagName('hs:sec')[0];
            if (!stampSec) return null;
            const topParas = extractHwpxSecTopLevelParas(stampSec);
            const headerText = stampZip.file('Contents/header.xml') ? await stampZip.file('Contents/header.xml').async('string') : null;
            return { stampZip, topParas, headerText };
        } catch (e) {
            console.warn('균열게이지 HWPX 양식 로드 실패:', e);
            return null;
        }
    }

    async function appendHwpxCrackMonitorSectionEnd(ctx) {
        const {
            bldg, bldgId, getFloorLabel, sec, xmlDoc, zip,
            setTcText, ensureTblTreatAsChar, dataUrlToBytes, loadImageSize, setPicImage,
            ensureDefectPhotosLoaded, manifestAdds, counters,
            mergeStampHeader, remapStampNode, hwpxHeaderState
        } = ctx;
        // 여러 동 한글 출력(ctx.dongParts): 동 순서대로 이어 붙이고 NO. 번호도 동을 넘어 이어서 매긴다
        const crackOwners = ctx.dongParts
            ? ctx.dongParts.map((p) => ({ b: p.bldg, id: p.bldgId, label: p.getFloorLabel }))
            : [{ b: bldg, id: bldgId, label: getFloorLabel }];
        const items = [];
        const slots = [];
        const mapFloors = []; // 균열게이지 위치도를 낼 층(동·층 순서)
        for (const owner of crackOwners) {
            // 비교사진은 IndexedDB·클라우드에 있다 — 한글에 넣기 전에 메모리로 채운다
            if (typeof ensureGaugePhotosLoaded === 'function') await ensureGaugePhotosLoaded(owner.id);
            const crackFloorsData = buildHwpxCrackMonitorFloorsData(owner.b, owner.id);
            const one = collectHwpxCrackMonitorExportItems(owner.b, owner.id, crackFloorsData, owner.label);
            one.items.forEach((it) => items.push(it));
            one.slots.forEach((s) => slots.push(s));
            const itemFloors = new Set(one.items.map((it) => it.floorCode));
            crackFloorsData.forEach((row) => { if (itemFloors.has(row.floorCode)) mapFloors.push({ owner, floorCode: row.floorCode }); });
        }
        if (crackOwners.length > 1) slots.forEach((slot, idx) => { slot.no = idx + 1; slot.col = idx + 1; });
        if (!items.length || !slots.length) return;

        const stamp = await loadHwpxCrackMonitorStampTemplate();
        if (!stamp || !stamp.topParas || !stamp.topParas.length) {
            window.showToast('균열게이지·팁 양식(templates/hwpx_crack_monitor.hwpx)을 찾지 못했습니다.', 'warning', 5000);
            return;
        }

        let remapAttrs = null;
        if (mergeStampHeader && stamp.headerText && hwpxHeaderState) {
            if (!hwpxHeaderState.text && zip.file('Contents/header.xml')) {
                hwpxHeaderState.text = await zip.file('Contents/header.xml').async('string');
            }
            const merged = mergeStampHeader(hwpxHeaderState.text, stamp.headerText, stamp.topParas);
            if (merged && merged.header) {
                hwpxHeaderState.text = merged.header;
                hwpxHeaderState.dirty = true;
                remapAttrs = merged.remapAttrs;
            }
        }

        // Ensure destination header is loaded before style injection / purple detection
        if (hwpxHeaderState && !hwpxHeaderState.text && zip.file('Contents/header.xml')) {
            hwpxHeaderState.text = await zip.file('Contents/header.xml').async('string');
        }
        const purpleBfIds = collectHwpxPurpleBorderFillIds(hwpxHeaderState && hwpxHeaderState.text);
        const crackStyleIds = ensureHwpxCrackMonitorStyleIds(hwpxHeaderState || { text: null, dirty: false });

        const cloneStampPara = (proto) => {
            if (!proto) return null;
            let node = proto.cloneNode(true);
            if (remapStampNode) node = remapStampNode(node, remapAttrs);
            node = polishHwpxCrackMonitorNode(node, crackStyleIds, purpleBfIds);
            return xmlDoc.importNode(node, true);
        };

        const reassignStampIds = (para) => {
            Array.from(para.getElementsByTagNameNS(HWPX_HP_NS, 'tbl')).forEach((tbl) => {
                counters.cloneIdSeq += 1;
                tbl.setAttribute('id', String(10700000 + counters.cloneIdSeq));
            });
            Array.from(para.getElementsByTagNameNS(HWPX_HP_NS, 'pic')).forEach((pic) => {
                counters.cloneIdSeq += 1;
                pic.setAttribute('id', String(10800000 + counters.cloneIdSeq));
                pic.setAttribute('instid', String(10900000 + counters.cloneIdSeq));
            });
        };

        const copyStampBinary = async (oldId, ext, mime) => {
            const path = `BinData/${oldId}.${ext}`;
            const file = stamp.stampZip.file(path);
            if (!file) return null;
            counters.imgCounter += 1;
            const newId = `crackMonImg${counters.imgCounter}`;
            const bytes = await file.async('uint8array');
            zip.file(`BinData/${newId}.${ext}`, bytes);
            manifestAdds.push(`<opf:item id="${newId}" href="BinData/${newId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
            return newId;
        };

        const remapEmbeddedStampImages = async (root) => {
            const map = {
                image1: ['jpg', 'image/jpg'],
                image2: ['jpg', 'image/jpg'],
                image3: ['jpg', 'image/jpg'],
                image4: ['jpg', 'image/jpg'],
                image5: ['jpg', 'image/jpg'],
                image6: ['emf', 'image/emf']
            };
            const refs = new Set();
            Array.from(root.getElementsByTagNameNS(HWPX_HC_NS, 'img')).forEach((imgEl) => {
                const ref = imgEl.getAttribute('binaryItemIDRef');
                if (ref) refs.add(ref);
            });
            const idMap = {};
            for (const ref of refs) {
                const spec = map[ref];
                if (!spec) continue;
                const newId = await copyStampBinary(ref, spec[0], spec[1]);
                if (newId) idMap[ref] = newId;
            }
            Array.from(root.getElementsByTagNameNS(HWPX_HC_NS, 'img')).forEach((imgEl) => {
                const ref = imgEl.getAttribute('binaryItemIDRef');
                if (ref && idMap[ref]) imgEl.setAttribute('binaryItemIDRef', idMap[ref]);
            });
        };

        const fillSummaryPhotoTable = async (tbl, item, photoNo) => {
            if (!tbl || !item) return;
            const d = item.defect;
            // 양식 사진에 붙은 원본 파일 이름(다른 건물 사진 이름) 설명은 지운다
            Array.from(tbl.getElementsByTagNameNS(HWPX_HP_NS, 'shapeComment')).forEach((el) => { el.textContent = ''; });
            // 균열 게이지/팁 전용 비교사진 (결함 일반 사진 슬롯에 넣지 않음)
            const cmpPhotos = getCrackMonitorComparePhotos(item);
            const prevSrc = cmpPhotos.prev || '';
            const currSrc = cmpPhotos.curr || '';
            const roundLabels = getCrackMonitorItemRoundLabels(item, bldg);
            const cmApi = getHwpxCrackMonitorApi();
            if (cmApi) {
                applyHwpxCellMap(tbl, cmApi.buildSummaryCells(item, photoNo, hwpxCrackMonitorFormatters(bldg)), setTcText);
            } else {
                setTcText(getHwpxTblCellByAddr(tbl, 1, 0), String(photoNo));
                setTcText(getHwpxTblCellByAddr(tbl, 1, 1), memberNameOut(d.component) || '');
                setTcText(getHwpxTblCellByAddr(tbl, 1, 2), `${item.floorLabel || ''} ${d.locationDetail || ''}`.trim());
                setTcText(getHwpxTblCellByAddr(tbl, 1, 4), formatHwpxCrackSummaryChangeText(item));
                setTcText(getHwpxTblCellByAddr(tbl, 1, 5), '-');
            }
            const pics = Array.from(tbl.getElementsByTagNameNS(HWPX_HP_NS, 'pic'));
            const stampPic = pics[0];
            const maxW = stampPic ? parseInt(stampPic.getElementsByTagNameNS(HWPX_HP_NS, 'curSz')[0]?.getAttribute('width') || '0', 10) : 0;
            const maxH = stampPic ? parseInt(stampPic.getElementsByTagNameNS(HWPX_HP_NS, 'curSz')[0]?.getAttribute('height') || '0', 10) : 0;
            const fillPic = async (pic, src) => {
                if (!pic) return;
                if (!src) {
                    const imgEl = pic.getElementsByTagNameNS(HWPX_HC_NS, 'img')[0];
                    if (imgEl) imgEl.setAttribute('binaryItemIDRef', '');
                    return;
                }
                counters.imgCounter += 1;
                const pack = await dataUrlToBytes(src);
                const size = await loadImageNaturalSizeFromBytes(pack.bytes, pack.mime);
                const imgId = `crackMonPhoto${counters.imgCounter}`;
                zip.file(`BinData/${imgId}.${pack.ext}`, pack.bytes);
                manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${pack.ext}" media-type="${pack.mime}" isEmbeded="1"/>`);
                setPicImage(pic, imgId, size.w, size.h, maxW || undefined, maxH || undefined);
            };
            await fillPic(pics[0], prevSrc);
            await fillPic(pics[1], currSrc);
            if (!cmApi) {
                setTcText(getHwpxTblCellByAddr(tbl, 3, 0), roundLabels.prev || '전회 측정');
                setTcText(getHwpxTblCellByAddr(tbl, 3, 3), roundLabels.curr || '금회 측정');
            }
        };

        // 균열게이지 위치도(2026-10-28): 게이지가 있는 층마다 한 장. 표 틀은 이 문서에 이미 들어간
        // 결함 위치도 표(그림 칸 + 캡션 칸)를 복제한다 — 정밀·정기·1·2종·3종 양식마다 스타일 번호가 달라도 맞는다.
        const findLocationMapProto = () => Array.from(sec.children).find((p) => {
            if (p.localName !== 'p') return false;
            const tbl = p.getElementsByTagNameNS(HWPX_HP_NS, 'tbl')[0];
            if (!tbl || tbl.getAttribute('rowCnt') !== '2' || !tbl.getElementsByTagNameNS(HWPX_HP_NS, 'pic').length) return false;
            return Array.from(tbl.getElementsByTagNameNS(HWPX_HP_NS, 't'))
                .some((t) => (t.textContent || '').indexOf(HWPX_FIG_MARK) === 0 && /상태조사위치도/.test(t.textContent));
        });
        const appendCrackGaugeLocationMaps = async () => {
            if (!mapFloors.length) return;
            const proto = findLocationMapProto();
            if (!proto) {
                console.warn('균열게이지 위치도: 복제할 결함 위치도 표가 없어 뺍니다(도면 미등록).');
                return;
            }
            for (const { owner, floorCode } of mapFloors) {
                const prevOverride = _hwpxRenderBldgOverride;
                _hwpxRenderBldgOverride = owner.b;
                let mapUrl = null;
                try {
                    mapUrl = await renderNdtFloorPlanCanvasDataUrlAsync(floorCode, '균열모니터');
                } catch (e) {
                    console.warn('균열게이지 위치도 렌더 실패:', floorCode, e);
                } finally {
                    _hwpxRenderBldgOverride = prevOverride;
                }
                if (!mapUrl) continue;
                const para = proto.cloneNode(true);
                para.setAttribute('pageBreak', '1');
                reassignStampIds(para);
                const tbl = para.getElementsByTagNameNS(HWPX_HP_NS, 'tbl')[0];
                const tcs = Array.from(tbl.getElementsByTagNameNS(HWPX_HP_NS, 'tc'));
                const pic = tcs[0] && tcs[0].getElementsByTagNameNS(HWPX_HP_NS, 'pic')[0];
                if (!pic) continue;
                const cellSz = tcs[0].getElementsByTagNameNS(HWPX_HP_NS, 'cellSz')[0];
                const cellMargin = tcs[0].getElementsByTagNameNS(HWPX_HP_NS, 'cellMargin')[0];
                const margin = (k) => (cellMargin ? parseInt(cellMargin.getAttribute(k) || '0', 10) : 0);
                const maxW = cellSz ? parseInt(cellSz.getAttribute('width'), 10) - margin('left') - margin('right') : undefined;
                const maxH = cellSz ? parseInt(cellSz.getAttribute('height'), 10) - margin('top') - margin('bottom') : undefined;
                const { bytes, mime, ext } = await dataUrlToBytes(mapUrl);
                const size = await loadImageSize(mapUrl);
                counters.imgCounter += 1;
                const imgId = `crackGaugeMap${counters.imgCounter}`;
                zip.file(`BinData/${imgId}.${ext}`, bytes);
                manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                setPicImage(pic, imgId, size.w, size.h, maxW, maxH);
                const captionT = tcs[1] && tcs[1].getElementsByTagNameNS(HWPX_HP_NS, 't')[0];
                if (captionT) captionT.textContent = `${HWPX_FIG_MARK}${owner.label(floorCode)} 균열게이지 위치도`;
                sec.appendChild(para);
            }
        };

        // 문단 안의 맨 바깥 표만 (칸 속 표 제외)
        const topTablesOfPara = (para) => Array.from(para.getElementsByTagNameNS(HWPX_HP_NS, 'tbl')).filter((tbl) => {
            let n = tbl.parentNode;
            while (n && n.localName !== 'p') n = n.parentNode;
            return n === para;
        });
        const cmPlanApi = getHwpxCrackMonitorApi();
        const stampPlan = cmPlanApi ? cmPlanApi.planStampParas(stamp.topParas.map((para) => ({
            tables: topTablesOfPara(para).map((tbl) => ({
                rows: parseInt(tbl.getAttribute('rowCnt') || '0', 10),
                pics: tbl.getElementsByTagNameNS(HWPX_HP_NS, 'pic').length
            })),
            text: para.textContent || ''
        }))) : null;

        try {
            const titlePara = cloneStampPara(stamp.topParas[0]);
            if (titlePara) {
                titlePara.setAttribute('pageBreak', '1');
                reassignStampIds(titlePara);
                sec.appendChild(titlePara);
            }

            const tableGroups = cmPlanApi ? cmPlanApi.groupSlots(slots) : [];
            if (stampPlan && cmPlanApi && tableGroups.length) {
                const cmFmt = hwpxCrackMonitorFormatters(bldg);
                tableGroups.forEach((group) => {
                    const para = cloneStampPara(stamp.topParas[stampPlan.data]);
                    if (!para) return;
                    reassignStampIds(para);
                    const tops = topTablesOfPara(para);
                    const tbl = tops.find((t) => parseInt(t.getAttribute('rowCnt') || '0', 10) >= 5);
                    if (!tbl) return;
                    // 같은 문단의 다른 표(예전 양식의 예시 이력표)는 지운다
                    tops.forEach((t) => { if (t !== tbl && t.parentNode) t.parentNode.removeChild(t); });
                    const layout = cmPlanApi.buildTableLayout(group, cmFmt);
                    if (!reshapeHwpxCrackMonitorTable(tbl, layout)) {
                        console.warn('균열게이지 측정표 모양을 알아보지 못했습니다(양식 확인 필요).');
                        return;
                    }
                    applyHwpxCellMap(tbl, layout.cells, setTcText);
                    polishHwpxCrackMonitorNode(tbl, crackStyleIds, purpleBfIds);
                    // 글자 7.5pt — 측정 줄이 양식보다 많으면 줄 높이와 같이 줄인다(최소 4pt)
                    const measureH = Math.max(400, Math.round(HWPX_CRACK_MEASURE_HEIGHT * (layout.scale || 1) / 10) * 10);
                    setHwpxCrackTableTextHeight(tbl, hwpxHeaderState, crackStyleIds.gulimCharPrId, measureH);
                    ensureTblTreatAsChar(tbl);
                    sec.appendChild(para);
                });
            }
            const dataPara = (stampPlan && cmPlanApi) ? null : cloneStampPara(stamp.topParas[1]);
            if (dataPara) {
                reassignStampIds(dataPara);
                const currentTbl = findHwpxTblByRowCount(dataPara, 16);
                if (currentTbl && stampPlan) {
                    // 같은 문단의 다른 표(2014~2020 예시 이력표, 채우는 코드 없음)는 지운다
                    topTablesOfPara(dataPara).forEach((tbl) => {
                        if (tbl !== currentTbl && tbl.parentNode) tbl.parentNode.removeChild(tbl);
                    });
                }
                if (currentTbl) {
                    fillHwpxCrackMonitorCurrentTable(currentTbl, slots, setTcText, bldg);
                    polishHwpxCrackMonitorNode(currentTbl, crackStyleIds, purpleBfIds);
                    ensureTblTreatAsChar(currentTbl);
                }
                sec.appendChild(dataPara);
            }

            // 측정표 뒤, 비교사진 앞에 층별 균열게이지 위치도
            try {
                await appendCrackGaugeLocationMaps();
            } catch (mapErr) {
                console.error('균열게이지 위치도 삽입 실패(나머지는 유지):', mapErr);
            }

            // 요약 사진표는 모든 게이지에 같은 원본(사진 2장짜리)을 쓴다. 예전엔 [2,3,4]번 문단을 골랐는데
            // 3번은 빈 문단이라 두 번째 게이지 표가 빠지고, 채우지 않은 예시 요약표(5번)가 따로 붙었다.
            const summaryProtos = stampPlan
                ? [stamp.topParas[stampPlan.summaryProto]]
                : [stamp.topParas[2], stamp.topParas[3], stamp.topParas[4]].filter(Boolean);
            for (let si = 0; si < slots.length; si += 1) {
                const proto = summaryProtos[si] || summaryProtos[summaryProtos.length - 1];
                const sumPara = cloneStampPara(proto);
                if (!sumPara) continue;
                if (stampPlan) sumPara.setAttribute('pageBreak', si % 2 === 0 ? '1' : '0');
                reassignStampIds(sumPara);
                const sumTbl = sumPara.getElementsByTagNameNS(HWPX_HP_NS, 'tbl')[0];
                if (sumTbl) {
                    await fillSummaryPhotoTable(sumTbl, slots[si], si + 1);
                    polishHwpxCrackMonitorNode(sumTbl, crackStyleIds, purpleBfIds);
                    // 비교사진 표 글자는 모두 9pt (2026-10-28)
                    setHwpxCrackTableTextHeight(sumTbl, hwpxHeaderState, crackStyleIds.gulimCharPrId, HWPX_CRACK_SUMMARY_HEIGHT);
                    ensureTblTreatAsChar(sumTbl);
                }
                sec.appendChild(sumPara);
            }

            (stampPlan ? stampPlan.tail.map((i) => stamp.topParas[i]) : [stamp.topParas[5], stamp.topParas[6], stamp.topParas[7]]).forEach((proto) => {
                const p = cloneStampPara(proto);
                if (!p) return;
                reassignStampIds(p);
                sec.appendChild(p);
            });

            const installPara = sec.lastElementChild;
            if (installPara) await remapEmbeddedStampImages(installPara);
        } catch (crackErr) {
            console.error('균열게이지·팁 HWPX 삽입 실패(나머지는 유지):', crackErr);
            window.showToast('균열게이지·팁 양식 삽입 중 오류가 있어 해당 섹션은 제외합니다.', 'warning', 5000);
        }
    }

    // --- HWPX(한글) 상태조사표 내보내기 (전체 층, 건수/사진 매수 제한 없음) ---
    // 번들 템플릿(templates/hwpx_survey_template.hwpx, 정기점검은 _regular.hwpx)에 이미 있는
    // "N) 층명" 블록(상태조사표+사진첩+위치도)을 표 ID 하드코딩 대신 문단 구조로 자동 탐지해
    // 건물에 등록된 층 수만큼 채우고, 남는 표본 블록은 뒤에서 지운다.
    // 슬롯 정리/정밀·정기 판별은 js/shared/hwpx-survey-slots.js (PWA에서 스크립트 누락 대비 폴백).
    // 방금 만든 한글 파일의 표 구조를 검사해서 문제가 있으면 현장 오류 기록에 남긴다.
    // 2026-09-22 501~503 칸 순서처럼 "한글은 열리는데 구조가 틀린" 문제를 몇 주 몰랐다.
    // 읽기만 한다 — 검사가 실패하든 문제가 나오든 출력은 그대로 나간다.
    // 쪽 번호는 아라비아 숫자(1, 2, 3). 2026-09-29 본문 양식 4개가 로마 숫자(Ⅰ, Ⅱ, Ⅲ)로
    // 되어 있었다. 양식을 고쳤고, 혹시 캐시에 남은 옛 양식도 여기서 바로잡는다.
    function forceHwpxArabicPageNumbers(xml) {
        return String(xml).replace(/(<hp:pageNum\b[^>]*\bformatType=")[A-Z_]+(")/g, '$1DIGIT$2');
    }

    async function reportHwpxStructure(zip, sectionPath, sectionXml, bldg) {
        const api = window.BSA && window.BSA.hwpxValidate;
        if (!api) return;
        try {
            const hpf = zip.file('Contents/content.hpf');
            api.reportGeneratedHwpx({
                sectionXml,
                hpfText: hpf ? await hpf.async('string') : null,
                fileNames: Object.keys(zip.files),
                label: `한글 출력(${isGrade3Building(bldg) ? '3종' : '1·2종'}) ${sectionPath}`
            });
        } catch (_e) { /* 검사 실패로 출력을 막지 않는다 */ }
    }

    const _hwpxTemplateBuf = Object.create(null);
    async function loadHwpxZipFromPath(templatePath) {
        if (!_hwpxTemplateBuf[templatePath]) {
            const v = (typeof window.BSA_APP_VERSION === 'string' && window.BSA_APP_VERSION)
                ? `?v=${encodeURIComponent(window.BSA_APP_VERSION)}`
                : '';
            const resp = await fetch(templatePath + v, { cache: 'force-cache' });
            if (!resp.ok) throw new Error('템플릿 파일을 불러오지 못했습니다.');
            _hwpxTemplateBuf[templatePath] = await resp.arrayBuffer();
        }
        return JSZip.loadAsync(_hwpxTemplateBuf[templatePath]);
    }
    const getHwpxSlotApi = () => (window.BSA && window.BSA.shared && window.BSA.shared.hwpxSurveySlots) || {
        isPreciseInspectionForHwpx: (t) => (t || '정밀안전점검') !== '정기안전점검',
        stripExcessStampStatusTables: (stampSlot) => {
            if (!stampSlot || !stampSlot.statusTbls || stampSlot.statusTbls.length <= 1) return stampSlot;
            const titlePara = stampSlot.titlePara;
            const keep = stampSlot.statusTbls[0];
            const keepPara = (() => {
                let p = keep;
                while (p && p.localName !== 'p') p = p.parentNode;
                return p;
            })();
            stampSlot.statusTbls.slice(1).forEach((tbl) => {
                if (!tbl || !tbl.parentNode) return;
                let p = tbl;
                while (p && p.localName !== 'p') p = p.parentNode;
                if (p && ((keepPara && p === keepPara) || (titlePara && p === titlePara))) {
                    tbl.parentNode.removeChild(tbl);
                    return;
                }
                if (p && p.parentNode) p.parentNode.removeChild(p);
                else if (tbl.parentNode) tbl.parentNode.removeChild(tbl);
            });
            stampSlot.statusTbls = (keep && keep.parentNode)
                ? [keep]
                : stampSlot.statusTbls.filter((t) => t && t.parentNode).slice(0, 1);
            return stampSlot;
        },
        stripSecPrRunsFromClonedParas: (paragraphs, hpNs) => {
            if (!paragraphs) return;
            Array.from(paragraphs).forEach((p) => {
                Array.from(p.childNodes || []).forEach((ch) => {
                    if (!ch || ch.nodeType !== 1 || ch.localName !== 'run') return;
                    const hasSecPr = ch.getElementsByTagNameNS(hpNs, 'secPr').length > 0;
                    const hasTbl = ch.getElementsByTagNameNS(hpNs, 'tbl').length > 0;
                    const hasPic = ch.getElementsByTagNameNS(hpNs, 'pic').length > 0;
                    if (hasSecPr && !hasTbl && !hasPic && ch.parentNode) ch.parentNode.removeChild(ch);
                });
            });
        }
    };
    // 2026-10-20 「N) 층」 제목 문단: 표본 문서 앞쪽에 27pt 빈 글자(run)가 남아 있어 그 줄이 27pt 높이로 잡혔다
    // (12pt 제목인데 한 줄이 27pt+줄 간격 만큼 자리를 먹어 표가 밀림). 글자 없는 run은 제목 글자 크기로 맞추고,
    // 줄 배치(lineseg)도 제목 글자 크기로 다시 적는다. 표·그림·글자가 든 run은 건드리지 않는다.
    const _hwpxCharPrHeightsByZip = new WeakMap();
    async function hwpxCharPrHeightsFromZip(zip) {
        if (!zip) return {};
        if (_hwpxCharPrHeightsByZip.has(zip)) return _hwpxCharPrHeightsByZip.get(zip);
        const map = {};
        try {
            const f = zip.file('Contents/header.xml');
            const hdr = f ? await f.async('string') : '';
            const re = /<hh:charPr\b[^>]*>/g;
            let m;
            while ((m = re.exec(hdr))) {
                const idM = /\bid="(\d+)"/.exec(m[0]);
                const hM = /\bheight="(\d+)"/.exec(m[0]);
                if (idM && hM) map[idM[1]] = parseInt(hM[1], 10) || 0;
            }
        } catch (_e) { /* 없으면 줄 배치만 그대로 */ }
        _hwpxCharPrHeightsByZip.set(zip, map);
        return map;
    }
    function normalizeHwpxTitleParaFont(titlePara, textT, charHeights) {
        if (!titlePara || !textT || !charHeights) return false;
        let textRun = textT.parentNode;
        while (textRun && textRun.localName !== 'run') textRun = textRun.parentNode;
        if (!textRun || textRun.parentNode !== titlePara) return false;
        const cp = textRun.getAttribute('charPrIDRef');
        const H = charHeights[cp] || 0;
        if (!H) return false;
        let changed = false;
        Array.from(titlePara.children).forEach((r) => {
            if (r.localName !== 'run' || r === textRun) return;
            const hasBody = Array.from(r.getElementsByTagName('*')).some((el) => el.localName === 'tbl' || el.localName === 'pic'
                || (el.localName === 't' && String(el.textContent || '').trim()));
            if (hasBody) return;
            const h = charHeights[r.getAttribute('charPrIDRef')] || 0;
            if (h > H) { r.setAttribute('charPrIDRef', cp); changed = true; }
        });
        const arr = Array.from(titlePara.children).find((c) => c.localName === 'linesegarray');
        const segs = arr ? Array.from(arr.children).filter((c) => c.localName === 'lineseg') : [];
        const seg = segs[0];
        const vs = seg ? (parseInt(seg.getAttribute('vertsize'), 10) || 0) : 0;
        // 첫 줄이 제목 글자보다 크고, 표 줄(수만 단위)이 아닐 때만
        if (seg && vs > H && vs < H * 4) {
            const sp = parseInt(seg.getAttribute('spacing'), 10) || 0;
            const newSp = Math.round(sp * H / vs);
            const delta = (vs + sp) - (H + newSp);
            seg.setAttribute('vertsize', String(H));
            seg.setAttribute('textheight', String(H));
            seg.setAttribute('baseline', String(Math.round(H * 0.85)));
            seg.setAttribute('spacing', String(newSp));
            segs.slice(1).forEach((sg) => {
                const vp = parseInt(sg.getAttribute('vertpos'), 10) || 0;
                if (vp >= delta) sg.setAttribute('vertpos', String(vp - delta));
            });
            changed = true;
        }
        return changed;
    }

    /**
     * 2026-10-20 1·2종 상태조사표 한 쪽 행 높이(3종과 같은 규칙, js/shared/hwpx-survey-row-fit.js):
     * 기본은 15행 + 1행쯤 여유(모든 쪽 같은 높이), 16·17행이면 그 쪽에 다 들어가게 줄인다. 예전엔 양식 3809 고정이라
     * 15행이 딱 맞고 16·17행은 다음 쪽으로 넘쳤다.
     */
    function fitHwpxSurveyTablePage12(destTbl, pageRows, env) {
        const fit = window.BSA && window.BSA.shared && window.BSA.shared.hwpxSurveyRowFit;
        if (!fit || !destTbl || !pageRows.length) return null;
        const HP = env.HP_NS;
        const kids = (el, name) => Array.from(el.children).filter((c) => c.localName === name);
        const segsOf = (p) => {
            const arr = kids(p, 'linesegarray')[0];
            return arr ? kids(arr, 'lineseg').map((sg) => ({
                vertpos: parseInt(sg.getAttribute('vertpos'), 10) || 0,
                vertsize: parseInt(sg.getAttribute('vertsize'), 10) || 0,
                spacing: parseInt(sg.getAttribute('spacing'), 10) || 0
            })) : [];
        };
        let p = destTbl.parentNode;
        while (p && p.localName !== 'p') p = p.parentNode;
        let reserve = 0;
        if (p) {
            const ownText = kids(p, 'run').some((r) => !r.getElementsByTagNameNS(HP, 'tbl').length && String(r.textContent || '').trim());
            if (ownText) {
                // 같은 문단 안 제목 줄: 표 줄의 시작 위치(vertpos)가 곧 제목 높이
                const segs = segsOf(p);
                const tblSeg = segs.find((sg) => sg.vertsize > 20000);
                reserve += tblSeg && tblSeg.vertpos > 0 ? tblSeg.vertpos : fit.STD_RESERVE_H;
            } else {
                // 다음 쪽(제목 글자를 지운 복제 문단): 남은 제목 줄 배치를 지우고 표 줄을 맨 위(0)로
                const arr = kids(p, 'linesegarray')[0];
                const sgs = arr ? kids(arr, 'lineseg') : [];
                const tblIdx = sgs.findIndex((sg) => (parseInt(sg.getAttribute('vertsize'), 10) || 0) > 20000);
                if (tblIdx > 0) {
                    sgs.slice(0, tblIdx).forEach((sg) => arr.removeChild(sg));
                    sgs.slice(tblIdx).forEach((sg) => { sg.setAttribute('vertpos', '0'); sg.setAttribute('textpos', '0'); });
                }
            }
            if (p.getAttribute('pageBreak') !== '1') {
                let q = p.previousElementSibling;
                let guard = 0;
                while (q && q.localName === 'p' && guard++ < 12) {
                    if (q.getElementsByTagNameNS(HP, 'tbl').length || q.getElementsByTagNameNS(HP, 'pic').length) break;
                    reserve += fit.paraHeight(segsOf(q)) || 1500;
                    if (q.getAttribute('pageBreak') === '1') break;
                    q = q.previousElementSibling;
                }
            }
        }
        const trs = kids(destTbl, 'tr').slice(0, env.HEADER_ROW_COUNT);
        let headerH = 0;
        let spanMax = 0;
        trs.forEach((tr, ri) => {
            let m = 0;
            Array.from(tr.getElementsByTagNameNS(HP, 'tc')).forEach((tc) => {
                const span = tc.getElementsByTagNameNS(HP, 'cellSpan')[0];
                const rs = span ? (parseInt(span.getAttribute('rowSpan'), 10) || 1) : 1;
                const sz = tc.getElementsByTagNameNS(HP, 'cellSz')[0];
                const h = sz ? (parseInt(sz.getAttribute('height'), 10) || 0) : 0;
                if (rs === 1) m = Math.max(m, h);
                else if (ri === 0 && rs >= env.HEADER_ROW_COUNT) spanMax = Math.max(spanMax, h);
            });
            headerH += m;
        });
        headerH = Math.max(headerH, spanMax);
        const outM = kids(destTbl, 'outMargin')[0];
        const tableMarginV = outM ? (parseInt(outM.getAttribute('top'), 10) || 0) + (parseInt(outM.getAttribute('bottom'), 10) || 0) : 280;
        const pagePrEl = env.xmlDoc.getElementsByTagNameNS(HP, 'pagePr')[0];
        const marginEl = pagePrEl ? kids(pagePrEl, 'margin')[0] : null;
        const n = (el, k) => { const v = el ? parseInt(el.getAttribute(k), 10) : NaN; return Number.isFinite(v) ? v : undefined; };
        const bodyH = fit.bodyHeight({ height: n(pagePrEl, 'height'), top: n(marginEl, 'top'), bottom: n(marginEl, 'bottom'), header: n(marginEl, 'header'), footer: n(marginEl, 'footer') });
        const plan = fit.planRows({ bodyH, reserveH: reserve, headerH, tableMarginV, stdReserveH: fit.STD_RESERVE_H, needs: pageRows.map((r) => r.need) });
        if (!plan.fits) console.warn(`${env.floorCode} 상태조사표: 줄이 많은 행 때문에 한 쪽을 넘을 수 있습니다(필요 ${plan.total}, 쪽 ${plan.area}).`);
        pageRows.forEach((r, i) => {
            Array.from(r.row.getElementsByTagNameNS(HP, 'tc')).forEach((tc) => {
                const span = tc.getElementsByTagNameNS(HP, 'cellSpan')[0];
                if (span && parseInt(span.getAttribute('rowSpan'), 10) > 1) return;
                const sz = tc.getElementsByTagNameNS(HP, 'cellSz')[0];
                if (sz) sz.setAttribute('height', String(plan.heights[i]));
            });
            Array.from(r.row.getElementsByTagNameNS(HP, 'tc')).forEach(env.centerCellContent);
        });
        const tblSz = kids(destTbl, 'sz')[0];
        if (tblSz) tblSz.setAttribute('height', String(headerH + plan.total));
        // 표를 담은 문단의 표 줄 높이도 새 표 높이로
        if (p) {
            const arr = kids(p, 'linesegarray')[0];
            (arr ? kids(arr, 'lineseg') : []).forEach((sg) => {
                const vs = parseInt(sg.getAttribute('vertsize'), 10) || 0;
                if (vs > 20000) {
                    const tH = headerH + plan.total + tableMarginV;
                    sg.setAttribute('vertsize', String(tH));
                    sg.setAttribute('textheight', String(tH));
                    sg.setAttribute('baseline', String(Math.round(tH * 0.85)));
                }
            });
        }
        return plan;
    }

    // 2026-10-20 「손글씨 메모 했던거 한글 출력할때 전경사진 뒤에 오게」 — 건물의 손글씨 메모(층마다 여러 장)를
    // 흰 바탕 그림으로 그려 전경사진 뒤에 한 장씩 넣는다(전경사진과 같은 틀, 쪽 폭에 맞추고 가로세로 비율 유지). 메모 없으면 안 넣음.
    const HWPX_SKETCH_TBL_PARA_XML = '<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:tbl id="TBL_ID" zOrder="11" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="1" rowCnt="2" colCnt="1" cellSpacing="0" borderFillIDRef="5" noAdjust="0"><hp:sz width="41821" widthRelTo="ABSOLUTE" height="64087" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="140" right="140" top="140" bottom="140"/><hp:inMargin left="140" right="140" top="140" bottom="140"/><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="15"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="6"><hp:pic id="PIC_ID" zOrder="36" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" thumbnailBinIDRef="" href="" groupLevel="0" instid="PIC_INSTID" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="768540" height="969540"/><hp:curSz width="41541" height="52405"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="20770" centerY="26202" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.054052" e2="0" e3="0" e4="0" e5="0.054051" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="768540" y="0"/><hc:pt2 x="768540" y="969540"/><hc:pt3 x="0" y="969540"/></hp:imgRect><hp:imgClip left="0" right="648540" top="0" bottom="818100"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="648540" dimheight="818100"/><hp:effects/><hp:sz width="41541" widthRelTo="ABSOLUTE" height="52405" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="1320" horzpos="0" horzsize="0" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="60813"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="16"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="1" styleIDRef="16" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="43"><hp:t>CAPTION</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="3274"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="64367" textheight="64367" baseline="54712" spacing="960" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>';
    /** 이 건물의 손글씨 메모 목록 — 층 순서(floorsList)대로, 층 안에서는 만든 순서 */
    function collectBuildingSketchMemos(st, bldg) {
        // 2026-10-20 층 구분 없이 건물 전체 · 계정(작성자)별 「홍길동 메모-1」, 작성자 모름은 「이전 메모-1」
        const api = window.BSA && window.BSA.sketchMemo;
        if (!api || !st || !bldg || !bldg.id) return [];
        if (st === window.state) migrateSketchMemosForBuilding(bldg.id);
        return api.outputGroups(st, bldg.id);
    }
    /** 메모 한 장 → 흰 바탕 PNG(지우개 획은 투명 층에서 지운 뒤 흰 종이 위에 얹는다) */
    function renderSketchMemoPng(rec, maxSide) {
        const api = window.BSA && window.BSA.sketchMemo;
        const w = Math.max(1, Number(rec.w) || 1200), h = Math.max(1, Number(rec.h) || 800);
        const k = Math.min(1, (maxSide || 2000) / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        const layer = document.createElement('canvas');
        layer.width = cw; layer.height = ch;
        const lctx = layer.getContext('2d');
        (rec.strokes || []).forEach((st) => { if (st && st.p) api.drawStroke(lctx, st, k); });
        const out = document.createElement('canvas');
        out.width = cw; out.height = ch;
        const octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, cw, ch);
        octx.drawImage(layer, 0, 0);
        return { dataUrl: out.toDataURL('image/png'), w: cw, h: ch };
    }
    /** 한글 문서 끝(전경사진 뒤)에 「손글씨 메모」 제목 + 메모 한 장씩. 반환: 늘어난 imgCounter */
    async function appendHwpxSketchMemoSection(o) {
        // 여러 동 한글 출력(o.dongParts)이면 동 순서대로 모으고 메모 이름 앞에 동 이름
        const owners = o.dongParts ? o.dongParts.map((p) => ({ b: p.bldg, pre: `${p.dongLabel} ` })) : [{ b: o.bldg, pre: '' }];
        const memos = [];
        for (const owner of owners) {
            await pullRoundSketchMemos(owner.b);   // 이 회차의 모든 계정 메모
            collectBuildingSketchMemos(window.state, owner.b).forEach((m) => {
                memos.push(owner.pre ? Object.assign({}, m, { label: owner.pre + m.label }) : m);
            });
        }
        let imgCounter = o.imgCounter;
        if (!memos.length) return imgCounter;
        const HP = o.HP_NS, HC = o.HC_NS;
        const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const parse = (xml) => o.xmlDoc.importNode(new DOMParser().parseFromString(`<root xmlns:hp="${HP}" xmlns:hc="${HC}">${xml}</root>`, 'application/xml').documentElement.firstChild, true);
        o.sec.appendChild(parse('<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:t>손글씨 메모</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p>'));
        const MAX_W = 41821 - 141 - 141;
        const MAX_H = 60813 - 141 - 141;
        for (let i = 0; i < memos.length; i++) {
            const { rec, label } = memos[i];
            const caption = `${label}${rec.title ? ` (${rec.title})` : ''}`;
            const png = renderSketchMemoPng(rec, 2000);
            imgCounter++;
            const para = parse(HWPX_SKETCH_TBL_PARA_XML
                .replace('TBL_ID', String(8930000 + imgCounter))
                .replace('PIC_ID', String(8940000 + imgCounter))
                .replace('PIC_INSTID', String(8950000 + imgCounter))
                .replace('CAPTION', esc(caption)));
            para.setAttribute('pageBreak', i === 0 ? '0' : '1');
            o.sec.appendChild(para);
            const pic = para.getElementsByTagNameNS(HP, 'pic')[0];
            const { bytes, mime, ext } = await o.dataUrlToBytes(png.dataUrl);
            const imgId = `sketchMemo${imgCounter}`;
            o.zip.file(`BinData/${imgId}.${ext}`, bytes);
            o.manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
            o.setPicImage(pic, imgId, png.w, png.h, MAX_W, MAX_H);
            o.ensureTblTreatAsChar(para.getElementsByTagNameNS(HP, 'tbl')[0]);
        }
        return imgCounter;
    }

    // ---- 여러 동을 한글 한 파일로 (2026-10-23) ----
    // 같은 현장·같은 회차에 동이 둘 이상이면 동을 고르게 한다. 고른 동의 층을 동 순서대로 이어 붙여
    // 「1) A동 지하1층 … 6) B동 지하1층」처럼 층 머리글 번호·[도면 N-M]·사진 번호가 동을 넘어 이어진다.
    // 한 동만 고르면(지금 연 동) 예전 출력 그대로.
    async function pickHwpxDongBuildings(bldg) {
        const siteKey = getBuildingSiteName(bldg);
        const roundKey = getBuildingSurveyRoundKey(bldg);
        if (!isSiteMultiDong(siteKey)) return [bldg];
        const dongs = getSiteBuildingsSorted(siteKey).filter((b) => getBuildingSurveyRoundKey(b) === roundKey);
        if (dongs.length < 2) return [bldg];
        const picked = await window.appChooseMany(
            '한글 한 파일에 넣을 동을 고르세요.\n층 머리글 번호·도면 번호는 아래 순서대로 이어집니다.',
            dongs.map((b) => ({ label: formatDongRowLabel(b), detail: b.id === bldg.id ? '지금 연 동' : '' })),
            { title: '한글로 저장 — 동 선택', okText: '한글로 저장' }
        );
        if (picked == null) return null;
        if (!picked.length) { window.showToast('동을 하나 이상 고르세요.', 'warning'); return null; }
        return picked.slice().sort((a, b) => a - b).map((i) => dongs[i]);
    }

    /** 한글 층 이름(「지하 1층」→「지하1층」) — 동마다 그 동의 층 목록으로 */
    function makeHwpxFloorLabelFn(bldg) {
        return (floorCode) => {
            const fromList = (bldg.floorsList || []).find(f => f.floorCode === floorCode);
            const raw = fromList
                ? fromList.floorLabel
                : (typeof window.getFloorLabelFromCode === 'function'
                    ? window.getFloorLabelFromCode(floorCode, bldg)
                    : floorCode);
            return stripFloorCodeSuffix(raw || floorCode).replace(/\s+(?=\d)/g, '');
        };
    }

    /** 한 동의 출력 층(외부는 한 장으로 합침)과 층별 결함 */
    function collectHwpxDongFloors(bldg) {
        const bldgId = bldg.id;
        const availableFloors = listNdtFloorCodesForBuilding(bldgId);
        const floorsData = [];
        const exteriorCodes = collectExteriorFloorCodes(availableFloors, bldg);
        const exteriorSet = new Set(exteriorCodes);
        let exteriorMerged = false;
        availableFloors.forEach(fc => {
            if (exteriorSet.has(fc)) {
                if (exteriorMerged) return;
                exteriorMerged = true;
                const defects = buildCombinedExteriorSurveyDefects(bldgId, exteriorCodes);
                if (!defects.length) return;
                floorsData.push({ floorCode: 'EXT', pageDefects: defects, exteriorCombined: true, exteriorFloorCodes: exteriorCodes.slice() });
                return;
            }
            const defects = getSurveyRowsForReport(window.state.defects[`${bldgId}_${fc}`] || []);
            if (!defects.length) return;
            floorsData.push({ floorCode: fc, pageDefects: defects });
        });
        return { availableFloors, floorsData };
    }

    async function exportHwpxSurveyTableDongs(dongBuildings, homeBldg) {
        const parts = [];
        for (const b of dongBuildings) {
            if (!(await ensureBuildingFloorsFreshForReport(b, `한글 보고서(${formatDongRowLabel(b)})`))) return;
            const one = collectHwpxDongFloors(b);
            parts.push({
                bldg: b, bldgId: b.id, dongLabel: getBuildingDongLabel(b) || formatDongRowLabel(b),
                rawLabel: makeHwpxFloorLabelFn(b), availableFloors: one.availableFloors, floorsData: one.floorsData
            });
        }
        // 층 이름 앞에 동 이름: 「A동 지하1층」
        parts.forEach((p) => { p.getFloorLabel = (fc) => `${p.dongLabel} ${p.rawLabel(fc)}`; });
        const home = parts.find((p) => p.bldgId === homeBldg.id) || parts[0];
        const cur = { part: home };
        const getFloorLabel = (fc) => cur.part.getFloorLabel(fc);

        const floorsData = [];
        parts.forEach((p) => p.floorsData.forEach((f) => floorsData.push(Object.assign({}, f, { dongPart: p }))));
        if (!floorsData.length) { window.showToast('고른 동에 등록된 결함이 없습니다.', 'warning'); return; }

        const grade3 = isGrade3Building(home.bldg);
        const mixed = parts.filter((p) => isGrade3Building(p.bldg) !== grade3 || p.bldg.inspectionType !== home.bldg.inspectionType);
        if (mixed.length) {
            const go = await window.appConfirm(`시설물 종류나 점검 종류가 다른 동이 있습니다: ${mixed.map((p) => p.dongLabel).join(', ')}\n\n`
                + `${home.dongLabel} 기준(${grade3 ? '3종' : '1·2종'} · ${home.bldg.inspectionType || '-'}) 양식으로 만들까요?`);
            if (!go) return;
        }

        // 보고서 직전 점검 — 동마다 보고 한 번에 알린다(한 동 출력과 같은 점검)
        const health = window.BSA && window.BSA.dataHealth;
        if (health && typeof health.checkReportData === 'function') {
            const lines = [];
            parts.forEach((p) => {
                const reportDefectsByFloor = {};
                p.floorsData.forEach((f) => { if (!f.exteriorCombined) reportDefectsByFloor[f.floorCode] = f.pageDefects; });
                const issues = health.checkReportData({
                    buildingId: p.bldgId,
                    defectsMap: window.state.defects,
                    deletedDefectIds: window.state.deletedDefectIds,
                    ndtMap: window.state.ndtData,
                    dispMap: window.state.ndtDisplacementGroups,
                    reportFloorCodes: p.availableFloors,
                    reportDefectsByFloor
                });
                if (issues.length) {
                    console.warn(`[보고서 점검] ${p.dongLabel}`, issues);
                    health.describeReportIssues(issues, p.getFloorLabel).forEach((ln) => lines.push(ln));
                }
            });
            if (lines.length) {
                const go = await window.appConfirm('보고서를 만들기 전에 확인이 필요한 데이터가 있습니다.\n\n'
                    + lines.join('\n')
                    + '\n\n그래도 한글 파일을 만들까요?\n(취소하면 만들지 않습니다)');
                if (!go) return;
            }
        }

        const siteName = getBuildingSiteName(home.bldg);
        const dongOpts = {
            parts,
            setCurrent: (p) => { cur.part = p || home; },
            fileName: `${siteName}_${parts.map((p) => p.dongLabel).join('_')}`
        };
        window.showLoading(`한글(hwpx) 상태조사표를 생성하는 중입니다... (${parts.length}개 동)`);
        try {
            if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리를 불러오지 못했습니다.');
            if (grade3) {
                await exportHwpxSurveyTable3(home.bldg, home.bldgId, floorsData, getFloorLabel, dongOpts);
            } else {
                await exportHwpxSurveyTable12(home.bldg, home.bldgId, floorsData, getFloorLabel, dongOpts);
            }
        } catch (err) {
            console.error('HWPX export error:', err);
            window.showToast('hwpx 생성 중 오류가 발생했습니다: ' + err.message, 'error', 5000);
        } finally {
            _hwpxRenderBldgOverride = null;
            window.hideLoading();
        }
    }

    /** 여러 동 출력용: 동 이름을 붙인 비파괴 자료. 층 코드는 「층@@동순번」으로 바꿔
     * 두 동에 같은 층(지하1층)이 있어도 위치도가 동마다 따로 나오게 한다. */
    const HWPX_DONG_FC_SEP = '@@';
    function buildHwpxDongNdtData(parts) {
        const allItems = [];
        const allDispGroups = [];
        parts.forEach((p, pi) => {
            const r = buildCombinedNdtDataForReport(p.bldgId, p.bldg);
            const pre = `${p.dongLabel} `;
            const tag = (rec) => Object.assign(rec, {
                _ndtFloorLabel: pre + rec._ndtFloorLabel,
                _ndtRealFloorCode: rec._ndtFloorCode,
                _ndtFloorCode: `${rec._ndtFloorCode}${HWPX_DONG_FC_SEP}${pi}`,
                _ndtBldgId: p.bldgId
            });
            r.allItems.forEach((it) => allItems.push(tag(Object.assign(it, { location: pre + it.location }))));
            r.allDispGroups.forEach((g) => {
                const rec = tag(g);
                // 부동침하 그래프 제목의 층(그래프 그림 안 글자)
                rec._hwpxFloorTitle = pre + (window.getFloorLabelFromCode(rec._ndtRealFloorCode, p.bldg) || rec._ndtRealFloorCode);
                allDispGroups.push(rec);
            });
        });
        return { allItems, allDispGroups };
    }
    /** 「층@@동순번」 → { floorCode, part } (여러 동이 아니거나 표시가 없으면 그대로) */
    function splitHwpxDongFloorCode(code, parts) {
        const s = String(code || '');
        const at = s.lastIndexOf(HWPX_DONG_FC_SEP);
        if (!parts || at < 0) return { floorCode: code, part: null };
        return { floorCode: s.slice(0, at), part: parts[parseInt(s.slice(at + HWPX_DONG_FC_SEP.length), 10)] || null };
    }

    window.exportHwpxSurveyTable = async function() {
        const bldg = window.state.currentBuilding;
        const bldgId = (bldg && bldg.id) || window.state.currentBuildingId;
        if (!bldg || !bldgId) { window.showToast('건축물을 먼저 선택해주세요.', 'warning'); return; }
        const dongBuildings = await pickHwpxDongBuildings(bldg);
        if (!dongBuildings) return;
        if (dongBuildings.length > 1 || dongBuildings[0].id !== bldg.id) {
            await exportHwpxSurveyTableDongs(dongBuildings, bldg);
            return;
        }
        // 안 열어 본 층이 빠지거나 옛 값으로 나가지 않게 모든 층을 서버에서 먼저 받는다(2026-09-29)
        if (!(await ensureBuildingFloorsFreshForReport(bldg, '한글 보고서'))) return;

        const getFloorLabel = (floorCode) => {
            const fromList = (bldg.floorsList || []).find(f => f.floorCode === floorCode);
            const raw = fromList
                ? fromList.floorLabel
                : (typeof window.getFloorLabelFromCode === 'function'
                    ? window.getFloorLabelFromCode(floorCode, bldg)
                    : floorCode);
            // "지하 1층"처럼 "지하/지상"과 숫자 사이에 띄어쓰기가 들어간 라벨을 표본 문서와 같은
            // "지하1층" 붙여쓰기 형식으로 맞춘다.
            return stripFloorCodeSuffix(raw || floorCode).replace(/\s+(?=\d)/g, '');
        };

        // PDF 보고서와 동일하게, 현재 층 하나가 아니라 건물에 등록된 모든 층을 대상으로 한다.
        let availableFloors = [];
        if (bldg && bldg.id && typeof listNdtFloorCodesForBuilding === 'function') {
            availableFloors = listNdtFloorCodesForBuilding(bldg.id);
        } else if (typeof window.getBuildingAvailableFloors === 'function') {
            availableFloors = (window.getBuildingAvailableFloors(bldg) || []).map((f) => f && f.floorCode).filter(Boolean);
        } else if (bldg.floorsList && bldg.floorsList.length > 0) {
            availableFloors = bldg.floorsList.map(f => f.floorCode);
        } else if (window.state.currentFloor) {
            availableFloors = [window.state.currentFloor];
        }

        // 등록된 결함/사진은 개수 제한 없이 전부 반영한다. 표 행이 많아지면 한글 워드프로세서가
        // 자동으로 다음 페이지까지 이어 그려주므로, 결함 개수만큼 그대로 행을 추가한다.
        const floorsData = [];
        const exteriorCodes = collectExteriorFloorCodes(availableFloors, bldg);
        const exteriorSet = new Set(exteriorCodes);
        let exteriorMerged = false;
        availableFloors.forEach(fc => {
            if (exteriorSet.has(fc)) {
                if (exteriorMerged) return;
                exteriorMerged = true;
                const defects = buildCombinedExteriorSurveyDefects(bldgId, exteriorCodes);
                if (!defects.length) return;
                floorsData.push({ floorCode: 'EXT', pageDefects: defects, exteriorCombined: true, exteriorFloorCodes: exteriorCodes.slice() });
                return;
            }
            const key = `${bldgId}_${fc}`;
            const rawDefects = window.state.defects[key] || (window.state.currentFloor === fc ? getCurrentFloorDefects() : []);
            const defects = getSurveyRowsForReport(rawDefects);
            if (!defects.length) return;
            floorsData.push({ floorCode: fc, pageDefects: defects });
        });
        if (!floorsData.length) { window.showToast('등록된 결함이 없습니다.', 'warning'); return; }

        // 보고서 직전 점검(GPT 감사 9번, 2026-09-22): 빠지는 층·지운 결함·두 층에 있는 번호를 먼저 알린다.
        // 조용히 이상한 보고서가 나가는 것보다, 만들기 전에 한 번 멈추는 게 낫다(취소하면 고친 뒤 다시 출력).
        const health = window.BSA && window.BSA.dataHealth;
        if (health && typeof health.checkReportData === 'function') {
            const reportDefectsByFloor = {};
            floorsData.forEach((f) => { if (!f.exteriorCombined) reportDefectsByFloor[f.floorCode] = f.pageDefects; });
            const reportIssues = health.checkReportData({
                buildingId: bldgId,
                defectsMap: window.state.defects,
                deletedDefectIds: window.state.deletedDefectIds,
                ndtMap: window.state.ndtData,
                dispMap: window.state.ndtDisplacementGroups,
                reportFloorCodes: availableFloors,
                reportDefectsByFloor
            });
            if (reportIssues.length) {
                console.warn('[보고서 점검]', reportIssues);
                const lines = health.describeReportIssues(reportIssues, getFloorLabel);
                const go = await window.appConfirm('보고서를 만들기 전에 확인이 필요한 데이터가 있습니다.\n\n'
                    + lines.join('\n')
                    + '\n\n그래도 한글 파일을 만들까요?\n(취소하면 만들지 않습니다)');
                if (!go) return;
            }
        }

        window.showLoading('한글(hwpx) 상태조사표를 생성하는 중입니다...');
        try {
            if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리를 불러오지 못했습니다.');

            // 3종/1,2종은 완전히 분리된 함수로 처리한다 (공유 로직 수정이 다른 등급까지
            // 깨뜨린 사고가 반복되어, 표 생성 로직 자체를 등급별로 독립시켰다).
            if (isGrade3Building(bldg)) {
                await exportHwpxSurveyTable3(bldg, bldgId, floorsData, getFloorLabel);
            } else {
                await exportHwpxSurveyTable12(bldg, bldgId, floorsData, getFloorLabel);
            }
        } catch (err) {
            console.error('HWPX export error:', err);
            window.showToast('hwpx 생성 중 오류가 발생했습니다: ' + err.message, 'error', 5000);
        } finally {
            window.hideLoading();
        }
    };

    async function exportHwpxSurveyTable3(bldg, bldgId, floorsData, getFloorLabel, dongOpts) {
            // 여러 동 한 파일(dongOpts, 2026-10-23): 층 하나를 채우기 전에 useDongOf(그 층)로
            // bldg·bldgId·위치도 기준 건물·층 이름의 동을 바꾸고, 층 다음 부분(비파괴·전경 등)은 useDongOf(null)로 되돌린다.
            const dongParts = (dongOpts && dongOpts.parts) || null;
            const homeBldg = bldg, homeBldgId = bldgId;
            let curDongPart = null;
            const useDongOf = (entry) => {
                if (!dongParts) return;
                curDongPart = (entry && entry.dongPart) || null;
                bldg = curDongPart ? curDongPart.bldg : homeBldg;
                bldgId = curDongPart ? curDongPart.bldgId : homeBldgId;
                _hwpxRenderBldgOverride = curDongPart ? curDongPart.bldg : null;
                dongOpts.setCurrent(curDongPart);
            };
            // 표 안 칸(3종 구분 「층」 등)은 동 이름 없이 — 표 위 「N) A동 지하1층」 머리글에만 동
            const rowFloorLabel = (fc) => (curDongPart ? curDongPart.rawLabel(fc) : getFloorLabel(fc));
            const dongTitlePrefix = () => (curDongPart ? `${curDongPart.dongLabel} ` : '');
            const ndtBldgOf = (rec) => {
                const p = dongParts && rec && rec._ndtBldgId && dongParts.find((x) => x.bldgId === rec._ndtBldgId);
                return p ? p.bldg : bldg;
            };
            const renderHwpxNdtMap = async (fc, category) => {
                const sp = splitHwpxDongFloorCode(fc, dongParts);
                if (!sp.part) return renderNdtFloorPlanCanvasDataUrlAsync(fc, category);
                _hwpxRenderBldgOverride = sp.part.bldg;
                try {
                    return await renderNdtFloorPlanCanvasDataUrlAsync(sp.floorCode, category);
                } finally {
                    _hwpxRenderBldgOverride = null;
                }
            };
            // 직전 보고서의 이미지 바이트가 계속 남아 사진이 많을수록 메모리가 누적된다
            _hwpxBytesByUrl.clear();
            // 정기안전점검은 비파괴 장비조사 섹션(DATA·결과표/위치도/사진첩)이 통째로 빠진 전용
            // 템플릿을 쓴다. 프로그램으로 표/제목 문단을 골라 지우는 방식은 목차 번호·캡션·이미지
            // 슬롯이 얽혀있어 완전히 지우기가 어려워서(제목만 빈 채로 남는 문제 있었음), 애초에
            // 한글에서 해당 섹션을 다 들어낸 별도 템플릿 파일을 만들어 분리했다.
            const hwpxSlotApi = getHwpxSlotApi();
            const isPreciseInspectionForTemplate = hwpxSlotApi.isPreciseInspectionForHwpx(bldg.inspectionType);
            const isGrade3 = true; // exportHwpxSurveyTable3: always grade3
            // 3종시설물은 칠산타워 서식(No./구분/부재 분류/점검내용/발생원인/비고, 구조·비구조
            // 2행 헤더)을 쓰고, 비파괴 장비조사 섹션 유무는 1,2종과 똑같이 정밀/정기 여부로
            // 결정한다(정밀에 체크된 경우에만 비파괴장비조사 포함).
            const templatePath = isPreciseInspectionForTemplate
                ? './templates/hwpx_survey_template_grade3.hwpx'
                : './templates/hwpx_survey_template_grade3_regular.hwpx';

            // 템플릿은 세션 메모리 + ?v= 로 받고, 같은 내보내기에서 다시 받지 않는다.
            const zip = await loadHwpxZipFromPath(templatePath);

            // 3종 결함조사표 스타일은 템플릿에 고정되어 있다(scripts/build-grade3-template-from-stamp.py로
            // 스탬프 표·스타일을 템플릿에 미리 병합). 예전에는 여기서 hwpx 생성마다 스탬프를 런타임
            // 병합·ID 리맵·검증했는데, 그 위에 테두리 패치가 여러 겹 쌓여 하나 고치면 다른 게 깨지는
            // 원인이 됐다. 이제 1·2종(exportHwpxSurveyTable12)과 똑같이 템플릿 표본 행만 복제한다.

            const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
            const HC_NS = 'http://www.hancom.co.kr/hwpml/2011/core';
            // 한글에서 템플릿을 직접 열어 저장하면 섹션을 하나로 합치면서 section1.xml이 사라지고
            // section0.xml 하나에 전체 내용이 들어가는 경우가 있다(실제로 겪음). 층별 조사표가 들어있는
            // 실제 섹션 파일을 그때그때 찾는다.
            const sectionPath = zip.file('Contents/section1.xml') ? 'Contents/section1.xml' : 'Contents/section0.xml';
            const xmlText = await zip.file(sectionPath).async('string');
            const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
            if (xmlDoc.querySelector('parsererror')) throw new Error('템플릿 ' + sectionPath + ' 파싱에 실패했습니다.');

            const sec = xmlDoc.getElementsByTagName('hs:sec')[0];
            if (!sec) throw new Error('템플릿 문서 구조(hs:sec)를 찾지 못했습니다.');
            const paraText = (p) => Array.from(p.getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent).join('');
            const secChildren = () => Array.from(sec.children).filter(c => c.localName === 'p');

            // 비교표 스탬프 border/paraPr/charPr를 본문 header에 합친다(사진첩과 동일 — ID 충돌 방지).
            let hwpxHeaderText = null;
            let hwpxHeaderDirty = false;

            // 3종 중점관리 전·금회차 비교사진 — 칠산타워 표 양식(templates/hwpx_priority_compare_grade3.hwpx)
            let grade3CompareTableStamp = null;
            let grade3CompareHeaderText = null;
                try {
                    const cmpResp = await fetch('./templates/hwpx_priority_compare_grade3.hwpx', { cache: 'no-store' });
                    if (cmpResp.ok) {
                        const cmpZip = await JSZip.loadAsync(await cmpResp.arrayBuffer());
                        if (cmpZip.file('Contents/header.xml')) {
                            grade3CompareHeaderText = await cmpZip.file('Contents/header.xml').async('string');
                        }
                        const cmpSectionPath = cmpZip.file('Contents/section1.xml')
                            ? 'Contents/section1.xml'
                            : 'Contents/section0.xml';
                        const cmpXml = await cmpZip.file(cmpSectionPath).async('string');
                        const cmpDoc = new DOMParser().parseFromString(cmpXml, 'application/xml');
                        const cmpSec = cmpDoc.getElementsByTagName('hs:sec')[0];
                        if (cmpSec) {
                            const cmpParas = Array.from(cmpSec.children).filter(c => c.localName === 'p');
                            const cmpParaText = (p) => Array.from(p.getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent).join('');
                            cmpParas.forEach((p) => {
                                const txt = cmpParaText(p).trim();
                                if (txt.startsWith('※')) {
                                    if (!grade3CompareTableStamp) grade3CompareTableStamp = {};
                                    grade3CompareTableStamp.legendPara = p.cloneNode(true);
                                    return;
                                }
                                Array.from(p.getElementsByTagNameNS(HP_NS, 'tbl')).forEach((tbl) => {
                                    const rowCnt = parseInt(tbl.getAttribute('rowCnt') || '0', 10);
                                    const colCnt = parseInt(tbl.getAttribute('colCnt') || '0', 10);
                                    const picCount = tbl.getElementsByTagNameNS(HP_NS, 'pic').length;
                                    if (rowCnt === 2 && colCnt === 5 && picCount >= 2) {
                                        if (!grade3CompareTableStamp) grade3CompareTableStamp = {};
                                        if (!grade3CompareTableStamp.compareTblPara) {
                                            grade3CompareTableStamp.compareTblPara = p.cloneNode(true);
                                            grade3CompareTableStamp.compareTbl = tbl.cloneNode(true);
                                        }
                                    } else if (rowCnt === 1 && colCnt === 1 && (txt.includes('사진') || txt.includes('외관') || txt.includes('중점'))) {
                                        if (!grade3CompareTableStamp) grade3CompareTableStamp = {};
                                        grade3CompareTableStamp.titlePara = p.cloneNode(true);
                                    }
                                });
                            });
                        }
                    }
                } catch (cmpLoadErr) {
                    console.warn('중점관리 비교표 템플릿 로드 실패:', cmpLoadErr);
                }
            // 3종 결함사진첩: 신규 템플릿은 footer에 [사진N|점검내용]만 있고 위치/내용 행이 없다.
            // 구형(사진N|위치|… + 내용 행)도 슬롯으로 해석하되, 위치 칸에는 절대 쓰지 않는다.
            // 3종 결함 사진첩 전용 양식 (첨부 2열·사진N+내용) — 1·2종 3x7(위치/내용)과 분리
            let grade3PhotoAlbumHeaderText = null;
            let grade3PhotoAlbumTblStamp = null;
            let grade3PhotoAlbumParaStamp = null;
            let grade3PhotoAlbumRemap = null;
            try {
                const albumResp = await fetch('./templates/hwpx_grade3_photo_album.hwpx', { cache: 'no-store' });
                if (albumResp.ok) {
                    const albumZip = await JSZip.loadAsync(await albumResp.arrayBuffer());
                    if (albumZip.file('Contents/header.xml')) {
                        grade3PhotoAlbumHeaderText = await albumZip.file('Contents/header.xml').async('string');
                    }
                    const albumSectionPath = albumZip.file('Contents/section1.xml')
                        ? 'Contents/section1.xml'
                        : 'Contents/section0.xml';
                    const albumXml = await albumZip.file(albumSectionPath).async('string');
                    const albumDoc = new DOMParser().parseFromString(albumXml, 'application/xml');
                    const albumSec = albumDoc.getElementsByTagName('hs:sec')[0];
                    if (albumSec) {
                        const albumParas = Array.from(albumSec.children).filter(c => c.localName === 'p');
                        for (const p of albumParas) {
                            const tbls = Array.from(p.getElementsByTagNameNS(HP_NS, 'tbl'));
                            for (const tbl of tbls) {
                                const rowCnt = parseInt(tbl.getAttribute('rowCnt') || '0', 10);
                                const colCnt = parseInt(tbl.getAttribute('colCnt') || '0', 10);
                                const joined = Array.from(tbl.getElementsByTagNameNS(HP_NS, 't'))
                                    .map(t => t.textContent || '').join('');
                                if (rowCnt === 2 && colCnt === 5 && /사진\s*1/.test(joined)) {
                                    grade3PhotoAlbumTblStamp = tbl.cloneNode(true);
                                    grade3PhotoAlbumParaStamp = p.cloneNode(true);
                                    Array.from(grade3PhotoAlbumParaStamp.getElementsByTagNameNS(HP_NS, 'tbl'))
                                        .forEach((t, ti) => {
                                            if (ti > 0 && t.parentNode) t.parentNode.removeChild(t);
                                        });
                                    break;
                                }
                            }
                            if (grade3PhotoAlbumTblStamp) break;
                        }
                    }
                }
            } catch (albumLoadErr) {
                console.warn('3종 사진첩 양식 템플릿 로드 실패:', albumLoadErr);
            }

            const hwpxPhotoCellText = (tc) => Array.from(tc.getElementsByTagNameNS(HP_NS, 't'))
                .map(t => t.textContent || '').join('').replace(/\s+/g, ' ').trim();
            const hwpxPhotoCellWidth = (tc) => {
                const sz = tc && tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                return sz ? (parseInt(sz.getAttribute('width'), 10) || 0) : 0;
            };
            const resolveHwpxPhotoGalleryRows = (tbl) => {
                const trs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl);
                const rowJoinedText = (tr) => Array.from(tr.getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent || '').join('');
                const capRow = trs.find(tr => !tr.getElementsByTagNameNS(HP_NS, 'pic').length && /사진|위치/.test(rowJoinedText(tr)))
                    || trs[1] || null;
                const descRow = trs.find(tr => !tr.getElementsByTagNameNS(HP_NS, 'pic').length && /내\s*용/.test(rowJoinedText(tr)))
                    || null;
                return {
                    capTcs: capRow ? Array.from(capRow.getElementsByTagNameNS(HP_NS, 'tc')) : [],
                    descTcs: descRow ? Array.from(descRow.getElementsByTagNameNS(HP_NS, 'tc')) : []
                };
            };
            const resolveGrade3HwpxPhotoAlbumSlots = (tbl) => {
                const trs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl);
                const footerRow = trs.find(tr => Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc'))
                    .some(tc => /^사진\s*\d/.test(hwpxPhotoCellText(tc)))) || null;
                const descRow = trs.find(tr => {
                    if (tr === footerRow) return false;
                    if (tr.getElementsByTagNameNS(HP_NS, 'pic').length) return false;
                    return /내\s*용/.test(Array.from(tr.getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent || '').join(''));
                }) || null;
                const imageRow = trs.find(tr => tr.getElementsByTagNameNS(HP_NS, 'pic').length > 0)
                    || (footerRow ? trs[Math.max(0, trs.indexOf(footerRow) - 1)] : trs[0])
                    || trs[0]
                    || null;
                const slots = [];
                if (!footerRow) {
                    return { slots, imageRow, footerRow, descRow, legacy: !!descRow };
                }
                const footerTcs = Array.from(footerRow.getElementsByTagNameNS(HP_NS, 'tc'));
                const imageTcs = imageRow
                    ? Array.from(imageRow.getElementsByTagNameNS(HP_NS, 'tc')).filter(tc => {
                        if (tc.getElementsByTagNameNS(HP_NS, 'pic').length) return true;
                        return hwpxPhotoCellWidth(tc) > 1000;
                    })
                    : [];
                const labelIndices = [];
                footerTcs.forEach((tc, idx) => {
                    if (/^사진\s*\d/.test(hwpxPhotoCellText(tc))) labelIndices.push(idx);
                });
                const descContentTcs = descRow
                    ? Array.from(descRow.getElementsByTagNameNS(HP_NS, 'tc'))
                        .filter(tc => !/내\s*용/.test(hwpxPhotoCellText(tc)))
                    : [];
                labelIndices.forEach((labelIdx, slotIdx) => {
                    const labelTc = footerTcs[labelIdx];
                    let contentTc = null;
                    let locationTc = null;
                    if (descRow) {
                        contentTc = descContentTcs[slotIdx] || null;
                        if (footerTcs[labelIdx + 1] && /위치/.test(hwpxPhotoCellText(footerTcs[labelIdx + 1]))) {
                            locationTc = footerTcs[labelIdx + 2] || null;
                        }
                    } else {
                        let j = labelIdx + 1;
                        while (j < footerTcs.length && /^(위치|내\s*용)$/.test(hwpxPhotoCellText(footerTcs[j]))) j++;
                        if (j < footerTcs.length && !/^사진\s*\d/.test(hwpxPhotoCellText(footerTcs[j]))) {
                            const c1 = footerTcs[j];
                            const c1w = hwpxPhotoCellWidth(c1);
                            if (c1w > 0 && c1w < 1000 && j + 1 < footerTcs.length
                                && !/^사진\s*\d/.test(hwpxPhotoCellText(footerTcs[j + 1]))) {
                                contentTc = footerTcs[j + 1];
                            } else {
                                contentTc = c1;
                            }
                        }
                    }
                    const imageTc = imageTcs[slotIdx] || null;
                    slots.push({
                        labelTc,
                        contentTc,
                        locationTc,
                        imageTc,
                        pic: imageTc ? (imageTc.getElementsByTagNameNS(HP_NS, 'pic')[0] || null) : null
                    });
                });
                return { slots, imageRow, footerRow, descRow, legacy: !!descRow };
            };
            // grade3LocMapStampPara / grade3GlobalPhotoTblStamp는 아래쪽에서 채워진다.
            // 호출 시점(전역 앨범 삽입)에는 이미 준비되어 있다.
            const findGrade3PhotoDonorPic = () => {
                // 호출은 grade3LocMapStampPara / grade3GlobalPhotoTblStamp 할당 이후에만 한다.
                const fromLoc = grade3LocMapStampPara
                    ? grade3LocMapStampPara.getElementsByTagNameNS(HP_NS, 'pic')[0]
                    : null;
                if (fromLoc) return fromLoc;
                const fromStamp = grade3GlobalPhotoTblStamp
                    ? grade3GlobalPhotoTblStamp.getElementsByTagNameNS(HP_NS, 'pic')[0]
                    : null;
                if (fromStamp) return fromStamp;
                return xmlDoc.getElementsByTagNameNS(HP_NS, 'pic')[0] || null;
            };
            const ensureGrade3PhotoPicsInTbl = (tbl, slots, donorPic) => {
                let maxW = 0;
                let maxH = 0;
                slots.forEach((slot) => {
                    if (slot.pic) {
                        const cur = slot.pic.getElementsByTagNameNS(HP_NS, 'curSz')[0];
                        if (cur) {
                            maxW = Math.max(maxW, parseInt(cur.getAttribute('width'), 10) || 0);
                            maxH = Math.max(maxH, parseInt(cur.getAttribute('height'), 10) || 0);
                        }
                        return;
                    }
                    if (!slot.imageTc || !donorPic) return;
                    const subList = slot.imageTc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                    if (!subList) return;
                    let para = Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).find(p => p.parentNode === subList);
                    if (!para) {
                        para = xmlDoc.createElementNS(HP_NS, 'hp:p');
                        para.setAttribute('id', '2147483648');
                        para.setAttribute('paraPrIDRef', '0');
                        para.setAttribute('styleIDRef', '0');
                        para.setAttribute('pageBreak', '0');
                        para.setAttribute('columnBreak', '0');
                        para.setAttribute('merged', '0');
                        subList.appendChild(para);
                    }
                    let run = Array.from(para.children).find(c => c.localName === 'run')
                        || para.getElementsByTagNameNS(HP_NS, 'run')[0];
                    if (!run) {
                        run = xmlDoc.createElementNS(HP_NS, 'hp:run');
                        run.setAttribute('charPrIDRef', '13');
                        para.insertBefore(run, para.firstChild);
                    }
                    const pic = donorPic.cloneNode(true);
                    const img = pic.getElementsByTagNameNS(HC_NS, 'img')[0];
                    if (img) img.setAttribute('binaryItemIDRef', '');
                    pic.removeAttribute('thumbnailBinIDRef');
                    const csz = slot.imageTc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const cellW = csz ? (parseInt(csz.getAttribute('width'), 10) || 20000) : 20000;
                    const cellH = csz ? (parseInt(csz.getAttribute('height'), 10) || 15000) : 15000;
                    const boxW = Math.max(1000, cellW - 282);
                    const boxH = Math.max(1000, cellH - 282);
                    const cur = pic.getElementsByTagNameNS(HP_NS, 'curSz')[0];
                    if (cur) {
                        cur.setAttribute('width', String(boxW));
                        cur.setAttribute('height', String(boxH));
                    }
                    Array.from(pic.children).filter(c => c.localName === 'sz').forEach((sz) => {
                        sz.setAttribute('width', String(boxW));
                        sz.setAttribute('height', String(boxH));
                    });
                    const trail = Array.from(run.children).find(c => c.localName === 't') || null;
                    if (trail) run.insertBefore(pic, trail);
                    else run.appendChild(pic);
                    slot.pic = pic;
                    maxW = Math.max(maxW, boxW);
                    maxH = Math.max(maxH, boxH);
                });
                if (!maxW || !maxH) {
                    maxW = maxW || 20000;
                    maxH = maxH || 15000;
                }
                return { maxW, maxH };
            };
            const stripGrade3UnusedPhotoSlots = (tbl, keepCount) => {
                const resolved = resolveGrade3HwpxPhotoAlbumSlots(tbl);
                if (!resolved.slots.length || resolved.slots.length <= keepCount) {
                    if (keepCount === 1) stripPhotoTblRightHalf(tbl);
                    return;
                }
                const keepCols = new Set();
                const markTcCols = (tc) => {
                    if (!tc) return;
                    const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                    if (!addr) return;
                    const c0 = parseInt(addr.getAttribute('colAddr') || '0', 10) || 0;
                    const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                    const cs = span ? (parseInt(span.getAttribute('colSpan') || '1', 10) || 1) : 1;
                    for (let c = c0; c < c0 + cs; c++) keepCols.add(c);
                };
                resolved.slots.slice(0, keepCount).forEach((s) => {
                    markTcCols(s.labelTc);
                    markTcCols(s.contentTc);
                    markTcCols(s.locationTc);
                    markTcCols(s.imageTc);
                });
                if (!keepCols.size) {
                    stripPhotoTblRightHalf(tbl);
                    return;
                }
                Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl).forEach((tr) => {
                    Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        const col = addr ? (parseInt(addr.getAttribute('colAddr') || '0', 10) || 0) : 0;
                        if (!keepCols.has(col) && tc.parentNode) tc.parentNode.removeChild(tc);
                    });
                });
                const maxCol = Math.max(...keepCols);
                tbl.setAttribute('colCnt', String(maxCol + 1));
                const firstRow = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).find(tr => tr.parentNode === tbl);
                let width = 0;
                if (firstRow) {
                    Array.from(firstRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                        width += hwpxPhotoCellWidth(tc);
                    });
                }
                const sz = Array.from(tbl.children).find(c => c.localName === 'sz');
                if (sz && width > 0) sz.setAttribute('width', String(width));
            };
            // 한글에서 표에 새 칸을 추가만 하고 한 번도 안 채운 셀은 문단/run은 있어도 hp:t(실제 글자
            // 요소)가 아예 없는 경우가 있다. 없으면 만들어서 항상 값을 넣을 자리를 보장한다.
            const ensureCellTextNode = (para) => {
                let run = para.getElementsByTagNameNS(HP_NS, 'run')[0];
                if (!run) {
                    run = xmlDoc.createElementNS(HP_NS, 'hp:run');
                    para.appendChild(run);
                }
                let t = run.getElementsByTagNameNS(HP_NS, 't')[0];
                if (!t) {
                    t = xmlDoc.createElementNS(HP_NS, 'hp:t');
                    run.appendChild(t);
                }
                return t;
            };
            // 표 칸에 값을 2줄 이상(줄바꿈 \n) 채울 때, 첫 문단을 복제해 다음 줄로 이어붙이는 곳마다
            // 복제본이 원본과 똑같은 vertpos(보통 0)를 그대로 들고 나가서 여러 줄이 같은 자리에
            // 겹쳐 보이는 버그가 있었다("변위량" 글자가 사라진 것처럼, 또는 엔터 친 것처럼 보이던 원인).
            // 문서에서 이미 정상적으로 2줄인 칸들의 규칙(다음 줄 vertpos = 이전 vertpos + vertsize +
            // spacing)을 그대로 적용해 복제된 줄마다 세로 위치를 다시 계산해준다.
            const fixClonedParaVertpos = (clonedPara, lineIndex, baseVertsize, baseSpacing) => {
                const seg = clonedPara.getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                if (seg) seg.setAttribute('vertpos', String(lineIndex * (baseVertsize + baseSpacing)));
            };
            // 한글 셀: charPr 자간 속성은 건드리지 않는다(템플릿 값 유지).
            // 줄바꿈은 BSA.koreanTextWrap(어절·금칙·1.05 버퍼·\\n 보존). 한 문단이면 자간 압축을 막기 위해 문단 분리.
            // 행 높이는 템플릿을 유지하다가 4줄 이상일 때만 내용에 맞게 확장한다.
            const HWPX_CELL_EXPAND_FROM_LINES = 4;
            /** 한글 칸 줄바꿈: js/shared/korean-text-wrap.js (어절·금칙·\\n 보존). */
            const hwpxCharWidthUnits = (ch) => {
                const api = window.BSA && window.BSA.koreanTextWrap;
                if (api && typeof api.defaultCharWidthUnits === 'function') {
                    return api.defaultCharWidthUnits(ch);
                }
                if (/[\u0020-\u007E\uFF61-\uFF9F]/.test(ch)) return 0.55;
                return 1;
            };
            const estimateHwpxCellMaxChars = (tc, paras) => {
                const DEFAULT_MAX = 16;
                if (!tc) return DEFAULT_MAX;
                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                const cellW = sz ? parseInt(sz.getAttribute('width'), 10) || 0 : 0;
                if (!cellW) return DEFAULT_MAX;
                const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                const ml = marginEl ? (parseInt(marginEl.getAttribute('left'), 10) || 0) : 141;
                const mr = marginEl ? (parseInt(marginEl.getAttribute('right'), 10) || 0) : 141;
                const seg = paras && paras[0] ? paras[0].getElementsByTagNameNS(HP_NS, 'lineseg')[0] : null;
                const vertsize = seg ? (parseInt(seg.getAttribute('vertsize'), 10) || 1000) : 1000;
                const charW = Math.max(700, Math.round(vertsize * 0.95));
                const usable = Math.max(charW, cellW - ml - mr);
                return Math.max(4, Math.floor(usable / charW));
            };
            const wrapHwpxCellText = (raw, maxChars = 16) => {
                // -nEA 앞만 문단 분리한 뒤, 공용 래퍼가 어절·금칙·명시적 \\n을 처리한다.
                // (예전처럼 입력 \\n을 공백으로 평탄화하지 않는다 — 진행\\n中 등 의도적 2줄 유지)
                const prepared = insertHwpxEaCountLineBreaks(
                    String(normalizeEaSpacingInText(raw == null ? '' : raw))
                        .replace(/\r\n|\r/g, '\n')
                );
                const api = window.BSA && window.BSA.koreanTextWrap;
                if (api && typeof api.wrapHwpxCellText === 'function') {
                    return api.wrapHwpxCellText(prepared, maxChars, hwpxCharWidthUnits);
                }
                // 모듈 미로드 시 최소 Fallback: 명시 개행만 유지
                return prepared;
            };

            // rawVal의 실제 줄 수(lines.length)를 반환한다 — 호출부에서 행 높이를 실제 줄 수에
            // 맞춰 다시 계산하는 데 쓴다(표본 행이 다른 칸의 샘플 2줄 데이터 기준 키를 물려받아,
            // 1줄로 줄어든 칸의 글자가 위로 뜬 것처럼 보이던 문제 — 한글에서 직접 확인됨).
            const fillCellParas = (subList, paras, rawVal, tc) => {
                const maxChars = estimateHwpxCellMaxChars(tc, paras);
                const lines = wrapHwpxCellText(rawVal, maxChars).split('\n');
                const baseSeg = paras[0].getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                const baseVertsize = baseSeg ? parseInt(baseSeg.getAttribute('vertsize'), 10) || 0 : 0;
                const baseSpacing = baseSeg ? parseInt(baseSeg.getAttribute('spacing'), 10) || 0 : 0;
                ensureCellTextNode(paras[0]).textContent = lines[0];
                if (baseSeg) baseSeg.setAttribute('vertpos', '0');
                for (let i = paras.length - 1; i >= 1; i--) subList.removeChild(paras[i]);
                let refNode = paras[0];
                for (let i = 1; i < lines.length; i++) {
                    const clonedPara = paras[0].cloneNode(true);
                    ensureCellTextNode(clonedPara).textContent = lines[i];
                    fixClonedParaVertpos(clonedPara, i, baseVertsize, baseSpacing);
                    subList.insertBefore(clonedPara, refNode.nextSibling);
                    refNode = clonedPara;
                }
                return { lineCount: lines.length, vertsize: baseVertsize, spacing: baseSpacing };
            };
            // 템플릿 행 높이를 기본으로 유지한다. 줄이거나 미리 키우지 않고,
            // 4줄 이상으로 넘어갈 때만 해당 행(칸들)을 내용 높이에 맞게 확장한다.
            // 세로 병합(rowSpan>1) 칸은 여러 행에 걸친 높이라 건드리지 않는다.
            const applyRowHeightFromLines = (row, rowMaxLines, rowLineMetric, minRowHeight) => {
                if (!row || !rowLineMetric) return 0;
                let templateHeight = 0;
                Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                    const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                    if (span && parseInt(span.getAttribute('rowSpan'), 10) > 1) return;
                    const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const h = sz ? parseInt(sz.getAttribute('height'), 10) || 0 : 0;
                    if (h > templateHeight) templateHeight = h;
                });
                const contentHeight = rowLineMetric.marginV + rowLineMetric.vertsize
                    + (rowMaxLines - 1) * (rowLineMetric.vertsize + rowLineMetric.spacing)
                    + Math.round(rowLineMetric.vertsize * 0.2);
                let neededHeight = templateHeight;
                if (rowMaxLines >= HWPX_CELL_EXPAND_FROM_LINES) {
                    neededHeight = Math.max(templateHeight, contentHeight);
                    if (minRowHeight) {
                        const floorH = minRowHeight
                            + (rowMaxLines - 1) * (rowLineMetric.vertsize + rowLineMetric.spacing);
                        neededHeight = Math.max(neededHeight, floorH);
                    }
                }
                // 템플릿보다 줄이지 않음. 확장할 때만 기록.
                if (neededHeight > templateHeight) {
                    Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                        const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                        if (span && parseInt(span.getAttribute('rowSpan'), 10) > 1) return;
                        const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                        if (sz) sz.setAttribute('height', String(neededHeight));
                    });
                }
                return neededHeight || templateHeight;
            };
            // 한글은 subList의 vertAlign="CENTER"만으로 셀 안 글자를 자동으로 세로 가운데 정렬해
            // 주지 않는다 — 저장된 vertpos를 셀 위쪽 여백부터의 절대 오프셋으로 그대로 쓴다. 그래서
            // 지금까지 vertpos=0으로만 채워온 칸들은 셀 높이가 넉넉할수록 글자가 위로 붙어 보였다
            // (사용자가 결과표 헤더에서 직접 확인). 셀의 최종 높이가 정해진 뒤 이 함수로 한 번 더
            // 훑어서, 실제 줄 수만큼의 콘텐츠 높이를 셀 안에서 정확히 가운데로 오는 vertpos로
            // 다시 계산해 넣는다.
            const centerCellContent = (tc) => {
                if (!tc) return;
                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                const cellHeight = sz ? parseInt(sz.getAttribute('height'), 10) : 0;
                if (!cellHeight) return;
                const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                if (!subList) return;
                const paras = Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList);
                if (paras.length === 0) return;
                const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                const marginTop = marginEl ? (parseInt(marginEl.getAttribute('top'), 10) || 0) : 141;
                const marginBottom = marginEl ? (parseInt(marginEl.getAttribute('bottom'), 10) || 0) : 141;
                const firstSeg = paras[0].getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                if (!firstSeg) return;
                const vertsize = parseInt(firstSeg.getAttribute('vertsize'), 10) || 0;
                const spacing = parseInt(firstSeg.getAttribute('spacing'), 10) || 0;
                if (!vertsize) return;
                const contentHeight = vertsize + (paras.length - 1) * (vertsize + spacing);
                const available = cellHeight - marginTop - marginBottom;
                const offset = Math.max(0, Math.round((available - contentHeight) / 2));
                paras.forEach((p, i) => {
                    const seg = p.getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                    if (seg) seg.setAttribute('vertpos', String(offset + i * (vertsize + spacing)));
                });
            };
            const setTcText = (tc, rawVal) => {
                if (!tc) return;
                const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                const paras = subList
                    ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList)
                    : [];
                if (paras.length > 0) fillCellParas(subList, paras, rawVal, tc);
                else {
                    const t = tc.getElementsByTagNameNS(HP_NS, 't')[0];
                    if (t) t.textContent = wrapHwpxCellText(rawVal).split('\n').join(' ');
                }
            };
            const ensureTblTreatAsChar = (tbl) => {
                if (!tbl) return;
                let pos = Array.from(tbl.children).find(c => c.localName === 'pos');
                if (!pos) {
                    pos = xmlDoc.createElementNS(HP_NS, 'hp:pos');
                    const sz = Array.from(tbl.children).find(c => c.localName === 'sz');
                    if (sz && sz.nextSibling) tbl.insertBefore(pos, sz.nextSibling);
                    else tbl.appendChild(pos);
                }
                pos.setAttribute('treatAsChar', '1');
                pos.setAttribute('affectLSpacing', '0');
                pos.setAttribute('flowWithText', '1');
                pos.setAttribute('allowOverlap', '0');
                pos.setAttribute('holdAnchorAndSO', '0');
                pos.setAttribute('vertRelTo', 'PARA');
                pos.setAttribute('horzRelTo', 'PARA');
                pos.setAttribute('vertAlign', 'TOP');
                pos.setAttribute('horzAlign', 'LEFT');
                pos.setAttribute('vertOffset', '0');
                pos.setAttribute('horzOffset', '0');
            };
            const copyRowCellSizesFromTemplate = (row, templateRow) => {
                if (!row || !templateRow) return;
                const srcTcs = Array.from(templateRow.getElementsByTagNameNS(HP_NS, 'tc'));
                const dstTcs = Array.from(row.getElementsByTagNameNS(HP_NS, 'tc'));
                dstTcs.forEach((tc, i) => {
                    const srcSz = srcTcs[i]?.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const dstSz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    if (srcSz && dstSz) {
                        const w = srcSz.getAttribute('width');
                        const h = srcSz.getAttribute('height');
                        if (w) dstSz.setAttribute('width', w);
                        if (h) dstSz.setAttribute('height', h);
                    }
                });
            };
            const syncStatusTblLayoutFromTemplate = (destTbl, srcTbl, headerRowCount, templateDataRow) => {
                if (!destTbl || !srcTbl) return;
                const srcTblSz = Array.from(srcTbl.children).find(c => c.localName === 'sz');
                const destTblSz = Array.from(destTbl.children).find(c => c.localName === 'sz');
                if (srcTblSz && destTblSz) {
                    ['width', 'height', 'widthRelTo', 'heightRelTo'].forEach(attr => {
                        const v = srcTblSz.getAttribute(attr);
                        if (v != null) destTblSz.setAttribute(attr, v);
                    });
                }
                if (srcTbl.getAttribute('colCnt')) destTbl.setAttribute('colCnt', srcTbl.getAttribute('colCnt'));
                if (srcTbl.getAttribute('rowCnt')) destTbl.setAttribute('rowCnt', srcTbl.getAttribute('rowCnt'));
                const srcRows = Array.from(srcTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === srcTbl);
                const destRows = Array.from(destTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === destTbl);
                srcRows.forEach((srcRow, i) => {
                    if (!destRows[i]) return;
                    copyRowCellSizesFromTemplate(destRows[i], srcRow);
                });
                if (templateDataRow) {
                    destRows.slice(headerRowCount).forEach(row => copyRowCellSizesFromTemplate(row, templateDataRow));
                }
            };
            const stripPhotoTblRightHalf = (tbl) => {
                Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl).forEach(tr => {
                    Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        const col = addr ? parseInt(addr.getAttribute('colAddr') || '0', 10) : 0;
                        if (col >= 3 && tc.parentNode) tc.parentNode.removeChild(tc);
                    });
                });
                tbl.setAttribute('colCnt', '3');
                const firstRow = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).find(tr => tr.parentNode === tbl);
                let width = 0;
                if (firstRow) {
                    Array.from(firstRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                        const csz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                        if (csz) width += parseInt(csz.getAttribute('width') || '0', 10) || 0;
                    });
                }
                const sz = Array.from(tbl.children).find(c => c.localName === 'sz');
                if (sz && width > 0) sz.setAttribute('width', String(width));
            };
            const removeParaRange = (fromP, toP) => {
                const all = secChildren();
                const start = all.indexOf(fromP);
                const end = toP ? all.indexOf(toP) : all.length;
                if (start < 0 || end < 0 || end <= start) return;
                for (let i = end - 1; i >= start; i--) sec.removeChild(all[i]);
            };

            // 사진/위치도 이미지 삽입에 공용으로 쓰는 헬퍼들 (한 곳에서만 관리해 여러 층에서
            // 다르게 어긋나지 않게 한다). Storage URL(https)도 dataURL과 같이 처리한다.
            const dataUrlToBytes = (src) => imageSrcToBytes(src);
            const loadImageSize = (src) => loadImageNaturalSize(src);
            // 사진 1장을 표 안의 hp:pic 하나에 앉히는 작업. curSz/scaMatrix가 서로 어긋나면 비율이
            // 깨져 보이는 걸 검증 과정에서 확인해서, orgSz/curSz/scaMatrix를 전부 일치시켜 계산한다.
            // maxW/maxH는 그 hp:pic이 원래 차지하던 표시 박스 크기(넘지 않게 fit)다.
            const setPicImage = (pic, imgId, pxW, pxH, maxW, maxH) => {
                pic.getElementsByTagNameNS(HC_NS, 'img')[0].setAttribute('binaryItemIDRef', imgId);
                pic.removeAttribute('thumbnailBinIDRef');
                const orgW = pxW * 100, orgH = pxH * 100;
                pic.getElementsByTagNameNS(HP_NS, 'orgSz')[0].setAttribute('width', String(orgW));
                pic.getElementsByTagNameNS(HP_NS, 'orgSz')[0].setAttribute('height', String(orgH));
                const aspect = pxW / pxH;
                const boxAspect = maxW / maxH;
                let curW, curH;
                if (aspect >= boxAspect) { curW = maxW; curH = Math.round(maxW / aspect); }
                else { curH = maxH; curW = Math.round(maxH * aspect); }
                pic.getElementsByTagNameNS(HP_NS, 'curSz')[0].setAttribute('width', String(curW));
                pic.getElementsByTagNameNS(HP_NS, 'curSz')[0].setAttribute('height', String(curH));
                Array.from(pic.children).filter(c => c.localName === 'sz').forEach(sz => {
                    sz.setAttribute('width', String(curW));
                    sz.setAttribute('height', String(curH));
                });
                const rect = pic.getElementsByTagNameNS(HP_NS, 'imgRect')[0];
                rect.getElementsByTagNameNS(HC_NS, 'pt1')[0].setAttribute('x', String(orgW));
                const pt2 = rect.getElementsByTagNameNS(HC_NS, 'pt2')[0];
                pt2.setAttribute('x', String(orgW)); pt2.setAttribute('y', String(orgH));
                rect.getElementsByTagNameNS(HC_NS, 'pt3')[0].setAttribute('y', String(orgH));
                const dimW = Math.round(orgW * 0.2095), dimH = Math.round(orgH * 0.2090);
                const clip = pic.getElementsByTagNameNS(HP_NS, 'imgClip')[0];
                clip.setAttribute('right', String(dimW)); clip.setAttribute('bottom', String(dimH));
                const dim = pic.getElementsByTagNameNS(HP_NS, 'imgDim')[0];
                dim.setAttribute('dimwidth', String(dimW)); dim.setAttribute('dimheight', String(dimH));
                const cmt = pic.getElementsByTagNameNS(HP_NS, 'shapeComment')[0];
                if (cmt) cmt.textContent = '';
                const sca = pic.getElementsByTagNameNS(HC_NS, 'scaMatrix')[0];
                sca.setAttribute('e1', String(curW / orgW));
                sca.setAttribute('e5', String(curH / orgH));
                const rot = pic.getElementsByTagNameNS(HP_NS, 'rotationInfo')[0];
                if (rot) { rot.setAttribute('centerX', String(Math.round(curW / 2))); rot.setAttribute('centerY', String(Math.round(curH / 2))); }
            };

            // 사진 갤러리와 위치도가 새로 추가하는 이미지의 매니페스트 항목을 여기에 같이 모았다가
            // 마지막에 한 번만 content.hpf에 반영한다.
            const manifestAdds = [];
            // 여러 층에 걸쳐 이미지/표를 새로 만들 때 id가 서로 겹치지 않도록 함수 전체에서 카운터를 공유한다.
            let imgCounter = 0;
            let photoTblCounter = 0;

            // ---- 템플릿에 있는 "N) 층명" 블록(상태조사표+사진첩+위치도) 찾기 ----
            // 템플릿에는 이 블록이 표본으로 1개만 들어있다(여러 개 남아있어도 첫 번째만 "틀"로 쓰고
            // 나머지는 지운다). 이 틀을 실제 건물의 층 수만큼 복제해서 채우므로, 표본 문서에 층이 몇
            // 개 있었는지와 무관하게 건물에 등록된 층 수만큼 그대로 내보낼 수 있다. 표 ID를 하드코딩
            // 하는 대신 구조(제목 문단 → 상태조사표 → "사진1위치..."로 시작하는 사진첩 → pic 1개짜리
            // 위치도)로 찾아서, 표본 문서가 조금 바뀌어도 잘 깨지지 않게 한다.
            const floorTitleRe = /^\d+\)\s*.+층/;
            // 표본 문서는 원본 건물의 그 층 결함이 많았으면 상태조사표가 애초에 표 여러 개(이어지는
            // 페이지)로 나뉘어 있을 수 있다. 사진첩이 나오기 전까지 등장하는 현재 서식 표를
            // statusTbls로 모은다. 1·2종은 신가병원 서식(조사내용/크기/부재 분류), 3종은 칠산타워
            // 서식(No./구분/부재 분류/점검내용). 옛 "부재종류" 10칸 표·1·2종 잔여 표는 버린다.
            const isCurrentStatusTable = (tbl) => {
                const firstRow = tbl.getElementsByTagNameNS(HP_NS, 'tr')[0];
                if (!firstRow) return false;
                const headerJoined = Array.from(firstRow.getElementsByTagNameNS(HP_NS, 't'))
                    .map(t => t.textContent || '').join('').replace(/\s+/g, '');
                    return headerJoined.includes('점검내용') && headerJoined.includes('발생원인');
            };
            const discoverFloorSlots = () => {
                const ps = secChildren();
                const starts = [];
                ps.forEach((p, i) => { if (floorTitleRe.test(paraText(p).trim())) starts.push(i); });
                const slots = [];
                for (let idx = 0; idx < starts.length; idx++) {
                    const s = starts[idx];
                    const e = idx + 1 < starts.length ? starts[idx + 1] : ps.length;
                    const statusTbls = [];
                    let photoTbl = null, photoParaStamp = null, locationMapTbl = null;
                    for (let i = s; i < e; i++) {
                        const txt = paraText(ps[i]).trim();
                        const tbls = Array.from(ps[i].getElementsByTagNameNS(HP_NS, 'tbl'));
                        if (tbls.length === 0) continue;
                        // 제목 문단(i===s): 상태조사표만 수집. 사진 판정은 하지 않음.
                        if (i === s) {
                            tbls.forEach((tbl) => {
                                if (isCurrentStatusTable(tbl)) statusTbls.push(tbl);
                            });
                            continue;
                        }
                        if (!photoTbl && /^사진1/.test(txt)) {
                            photoTbl = tbls[0];
                            photoParaStamp = ps[i].cloneNode(true);
                            continue;
                        }
                        if (!photoTbl) {
                            // 한 문단 안에 표가 여러 개 겹쳐 들어있는 경우가 있다(옛 포맷을 새 포맷으로
                            // 바꿀 때 지우지 않고 그 옆/위에 새로 붙여넣은 흔적으로 보임). 예전에는
                            // tbls[0]만 보고 판단해서, 같은 문단의 두 번째/세 번째 표(대개 옛 포맷 잔여
                            // 표)는 아예 검사조차 안 되고 영구히 남아 있었다 — 그 결과 층마다 옛 표가
                            // 그대로 복제되어 "16~45번" 같은 표본 잔여 표가 문서 곳곳에 반복해서 끼어
                            // 나오는 문제가 있었다. 문단 안의 표를 전부 하나씩 검사해서, 새 포맷이면
                            // statusTbls에 담고 옛 포맷이면 그 표만 지운다. 표를 담은 hp:run을 통째로
                            // 지우면 안 되는데(사진 갤러리처럼 표 여러 개가 같은 hp:run 안에 나란히
                            // 들어있는 경우가 있어서, run을 지우면 그 안에 같이 있던 정상 표까지
                            // 같이 사라진다 — 실제로 이 버그로 정상 표까지 날아간 적 있었음), 그래서
                            // tbl 엘리먼트 자체만 그 부모에서 떼어낸다. 그 문단에 남는 표가 하나도
                            // 없게 되면(옛 포맷 표만 혼자 문단을 차지하고 있던 경우) 문단 자체를
                            // 통째로 지운다 — 안 지우면 그 문단이 갖고 있던 pageBreak="1" 속성이
                            // 빈 문단인 채로 그대로 남아서, 표 다음에 빈 페이지가 하나 끼어 들어가는
                            // 문제가 있었다.
                            let keptAnyInPara = false;
                            tbls.forEach(tbl => {
                                if (isCurrentStatusTable(tbl)) {
                                    statusTbls.push(tbl);
                                    keptAnyInPara = true;
                                } else if (tbl.parentNode) {
                                    tbl.parentNode.removeChild(tbl);
                                }
                            });
                            if (!keptAnyInPara && ps[i].parentNode) ps[i].parentNode.removeChild(ps[i]);
                        }
                    }
                    for (let i = e - 1; i > s; i--) {
                        const tbls = Array.from(ps[i].getElementsByTagNameNS(HP_NS, 'tbl'));
                        if (tbls.length === 1 && tbls[0].getElementsByTagNameNS(HP_NS, 'pic').length === 1) { locationMapTbl = tbls[0]; break; }
                    }
                    // 3종시설물은 위치도를 층 블록에서 미리 떼어내 별도로 마지막에 몰아서 넣으므로,
                    // 층 블록 자체에는 위치도가 없어도(locationMapTbl === null) 유효한 슬롯으로 본다.
                    if (statusTbls.length > 0 && photoTbl) {
                        slots.push({
                            titlePara: ps[s],
                            statusTbls,
                            photoTbl,
                            photoTblStamp: photoTbl.cloneNode(true),
                            photoParaStamp,
                            locationMapTbl
                        });
                    }
                }
                return slots;
            };
            // 표본 블록이 여러 개 남아있어도(예: 아직 안 줄인 옛 템플릿) 첫 번째만 "틀"로 쓰고 나머지는
            // 지운다 — 이 시점부터 문서 끝까지가 그 "틀" 블록 하나만 남는다(층 블록이 문서의 마지막
            // 섹션이라 안전하게 지울 수 있다). discoverFloorSlots()가 인식한 "유효한" 슬롯 개수
            // (floorSlots.length)만 보고 판단하면, 두 번째 이후 블록이 옛 포맷 표라 isCurrentStatusTable을
            // 통과 못해 slot 자체가 무효 처리되는 경우(그 표만 stale로 지워지고 사진첩/위치도는 남음) 이
            // "여러 개 남음"을 놓쳐서 정리가 아예 안 되고, 그 뒤의 옛 표본 블록들이 통째로 "틀"에 딸려
            // 들어가 실제 층 수만큼 복제되는 사고가 있었다(내보낸 문서에 표본 사진/표가 몇 배로 불어나
            // 뒤섞여 나오고, 정작 뒤쪽 실제 층의 상태조사표는 밀려서 안 채워짐). 그래서 슬롯 유효성과
            // 무관하게, "N) 층명" 형식 문단이 원문에 몇 개 있었는지(rawFloorTitleParas)부터 먼저 보고
            // 두 번째 문단부터는 무조건 지운다.
            const rawFloorTitleParas = secChildren().filter(p => floorTitleRe.test(paraText(p).trim()));
            if (rawFloorTitleParas.length > 1) {
                removeParaRange(rawFloorTitleParas[1], null);
            }
            let floorSlots = discoverFloorSlots();
            if (!floorSlots.length) throw new Error('템플릿에서 상태조사표 블록을 찾지 못했습니다.');
            // 비파괴 장비조사 사진첩(2026-09-28) 소제목 틀 — "1) 층" 제목 문단을 채우기 전에 떠 둔다
            // (사진 표·문단은 3종 결함 사진첩과 같은 grade3GlobalPhoto*Stamp를 쓴다)
            const ndtAlbumSubHeadingStamp = floorSlots[0].titlePara.cloneNode(true);
            let ndtAlbumTitlePara = null;   // 우리가 넣은 사진첩 제목 — 아래 "표본 사진첩 지우기"가 건드리지 않게

            // 신가병원/칠산타워 서식은 칸 너비가 이미 맞춰져 있어, 옛 10칸(부재종류/결함크기)용
            // 폭 재배분은 적용하지 않는다.

            // "틀" 블록(첫 번째 층 블록, 제목 문단부터 문서 끝까지)을 실제 층 수만큼 복제한다. 복제한
            // 표/사진 안의 hp:tbl·hp:pic id가 원본과 겹치면 한글이 문서 구조를 제대로 못 읽어 열람 중
            // 멈추거나 먹통이 될 수 있어서, 복제할 때마다 새 id를 부여한다.
            let cloneIdSeq = 0;
            const reassignClonedIds = (paragraphs) => {
                paragraphs.forEach(p => {
                    Array.from(p.getElementsByTagNameNS(HP_NS, 'tbl')).forEach(tbl => {
                        cloneIdSeq++;
                        tbl.setAttribute('id', String(8300000 + cloneIdSeq));
                    });
                    Array.from(p.getElementsByTagNameNS(HP_NS, 'pic')).forEach(pic => {
                        cloneIdSeq++;
                        pic.setAttribute('id', String(8400000 + cloneIdSeq));
                        pic.setAttribute('instid', String(8500000 + cloneIdSeq));
                    });
                });
            };
            // 3종시설물은 위치도를 층별 표 옆이 아니라 모든 층 상태조사표·전역 사진첩·중점관리 비교가 끝난 뒤에 몰아서
            // 마지막에 넣는다. "틀" 블록(title~문서 끝)을 통째로 복제하면 위치도까지 층마다 끼어
            // 들어가버리므로, 위치도 문단을 먼저 떼어내 따로 보관해두고 "틀"에서 제외한다 — 실제
            // 위치도 삽입은 아래 본 루프가 전부 끝난 뒤 별도로 한다.
            let grade3LocMapStampPara = null;
            if (floorSlots[0].locationMapTbl) {
                let node = floorSlots[0].locationMapTbl.parentNode;
                while (node && node.localName !== 'p') node = node.parentNode;
                grade3LocMapStampPara = node;
                if (grade3LocMapStampPara && grade3LocMapStampPara.parentNode) {
                    grade3LocMapStampPara.parentNode.removeChild(grade3LocMapStampPara);
                }
            }
            // 여분 샘플 상태조사표(NO.16/31/46…)만 제거. 첫 장(statusTbls[0])은 유지.
            // keep 표가 들어 있는 문단은 통째로 지우지 않는다 — 1·2종 정밀은 1번 표가
            // 제목 다음 문단에 있고 같은 문단에 여분 샘플 표가 더 있다.
            hwpxSlotApi.stripExcessStampStatusTables(floorSlots[0]);

            const stampChildren = secChildren();
            const stampParas = stampChildren.slice(stampChildren.indexOf(floorSlots[0].titlePara));
            for (let c = 1; c < floorsData.length; c++) {
                const cloned = stampParas.map(p => p.cloneNode(true));
                reassignClonedIds(cloned);
                hwpxSlotApi.stripSecPrRunsFromClonedParas(cloned, HP_NS);
                cloned[0].setAttribute('pageBreak', '1'); // 층마다 새 페이지에서 시작(사진 밑 남는 공간에 다음 층이 이어붙지 않도록)
                cloned.forEach(p => sec.appendChild(p));
            }
            floorSlots = discoverFloorSlots();
            if (!floorSlots.length) {
                throw new Error('템플릿에서 상태조사표 블록을 찾지 못했습니다. (표본 표 정리 후 슬롯이 사라졌습니다)');
            }
            if (floorsData.length > floorSlots.length) {
                console.error(`층 블록 복제 결과(${floorSlots.length}개)가 필요한 층 수(${floorsData.length}개)보다 적습니다.`);
                floorsData.length = floorSlots.length;
            }

            // 사진은 로컬(IndexedDB)에도, 온라인 동기화 중이면 클라우드(Firestore)에도 있을 수 있는데,
            // 층 진입 직후 곧바로 내보내면 아직 photos 배열이 안 채워졌을 수 있다. 여기서 한 번 더
            // 직접 확인해서 photoIds는 있는데 photos가 비어있는 결함은 그 자리에서 채워 넣는다.
            // (로컬에 없으면 클라우드에서도 찾아본다 — hydrateDefectPhotos와 같은 방식)
            const companyPhotosCol = (db && window.state.companyId)
                ? db.collection('safety_app').doc(getCompanyDocId()).collection('photos')
                : null;
            if (!window._photoCache) window._photoCache = {};
            if (typeof window.updateLoadingText === 'function') {
                window.updateLoadingText('한글(hwpx) 위치도 도면 준비 중...');
            }
            if (dongParts) {
                for (const p of dongParts) await preloadFloorDrawings(p.bldg);
            } else {
                await preloadFloorDrawings(window.state.currentBuilding || bldg);
            }

            // 도면에 결함 핀이 찍힌 위치도 이미지를 만들어 locationMapTbl 한 칸에 채워 넣는다. 1,2종은
            // 층 블록 안에서(아래 본 루프에서) 바로 호출하고, 3종은 모든 층 처리가 끝난 뒤 별도로 몰아서
            // 호출한다(fillLocationMapForFloor 자체는 어느 쪽이든 동일).
            // 도면이 없어 못 넣었으면 false를 돌려준다(외부처럼 면이 여러 개일 때 빈 칸 정리용).
            const fillLocationMapForFloor = async (locationMapTbl, floorCode, imgSeq, opts) => {
                try {
                    const bldgForMap = hwpxRenderBuilding();

                    // getFloorDrawingSrc()는 정확한 층 코드로 도면을 못 찾으면 "층 코드에 포함된
                    // 숫자가 비슷한 다른 층 도면"까지 갖다 쓰는 폴백이 있어(예: 지하1층 "B1F"가
                    // 지상1층 "1F" 도면과 섞여버림), 위치도만큼은 그 폴백을 타지 않도록 정확히
                    // 일치하는 도면이 있는지 직접 먼저 확인한다. 못 찾으면 그냥 위치도를 뺀다.
                    if (!bldgForMap.floorDrawings) bldgForMap.floorDrawings = {};
                    // 층별 래스터를 IDB/클라우드에서 정확히 채운 뒤, 오염된 캐시는 버린다.
                    if (typeof hydrateFloorDrawingFromCloud === 'function') {
                        try {
                            await hydrateFloorDrawingFromCloud(bldgForMap, floorCode, { localOnly: false });
                        } catch (e) { /* 도면 없음 */ }
                    } else if (!bldgForMap.floorDrawings[floorCode]) {
                        const idbDrawing = await idbGet('floorDrawings', `${bldgForMap.id}_${floorCode}`);
                        if (idbDrawing) bldgForMap.floorDrawings[floorCode] = idbDrawing;
                    }
                    const cacheKey = `${bldgForMap.id}_${floorCode}`;
                    if (state.floorImageCache) delete state.floorImageCache[cacheKey];
                    const hasExactDrawing = (typeof isUsableRasterDrawingUrl === 'function')
                        ? isUsableRasterDrawingUrl(bldgForMap.floorDrawings[floorCode])
                        : !!bldgForMap.floorDrawings[floorCode];

                    let mapDataUrl = null;
                    if (hasExactDrawing) {
                        mapDataUrl = renderFloorPlanCanvasDataUrl(floorCode);
                        if (!mapDataUrl) {
                            const src = bldgForMap.floorDrawings[floorCode];
                            await new Promise((resolve) => {
                                const img = new Image();
                                img.onload = () => {
                                    if (!state.floorImageCache) state.floorImageCache = {};
                                    state.floorImageCache[cacheKey] = img;
                                    resolve();
                                };
                                img.onerror = () => resolve();
                                img.src = src;
                            });
                            mapDataUrl = renderFloorPlanCanvasDataUrl(floorCode);
                        }
                    }
                    if (mapDataUrl) {
                        const mapPic = locationMapTbl.getElementsByTagNameNS(HP_NS, 'pic')[0];
                        // 기존에는 표본 그림 자체의 curSz(표본 도면 비율에 맞춰 이미 안쪽으로 줄어들어
                        // 있던 크기)를 그대로 "박스"로 썼다. 그 표본 그림이 이 칸(cell)보다 작게
                        // 앉혀져 있던 경우, 우리 도면도 그 작은 박스 안에서만 맞춰져서 칸 여백이
                        // 실제보다 훨씬 크게 남았다. 칸 자체의 실제 여유 공간(셀 크기 - 안쪽 여백)을
                        // 박스로 써서 도면이 칸을 최대한 꽉 채우도록 한다(비율은 그대로 유지, 잘리지
                        // 않게 안쪽에 맞추는 것만 동일).
                        let mapCell = mapPic.parentNode;
                        while (mapCell && mapCell.localName !== 'tc') mapCell = mapCell.parentNode;
                        const cellSz = mapCell && mapCell.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                        const cellMargin = mapCell && mapCell.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                        const picCurSz = mapPic.getElementsByTagNameNS(HP_NS, 'curSz')[0];
                        let mapMaxW = parseInt(picCurSz.getAttribute('width'), 10);
                        let mapMaxH = parseInt(picCurSz.getAttribute('height'), 10);
                        if (cellSz) {
                            const marginL = cellMargin ? parseInt(cellMargin.getAttribute('left'), 10) : 0;
                            const marginR = cellMargin ? parseInt(cellMargin.getAttribute('right'), 10) : 0;
                            const marginT = cellMargin ? parseInt(cellMargin.getAttribute('top'), 10) : 0;
                            const marginB = cellMargin ? parseInt(cellMargin.getAttribute('bottom'), 10) : 0;
                            mapMaxW = parseInt(cellSz.getAttribute('width'), 10) - marginL - marginR;
                            mapMaxH = parseInt(cellSz.getAttribute('height'), 10) - marginT - marginB;
                        }
                        const { bytes, mime, ext } = await dataUrlToBytes(mapDataUrl);
                        const size = await loadImageSize(mapDataUrl);
                        const mapImgId = `locationMapAuto${imgSeq}`;
                        zip.file(`BinData/${mapImgId}.${ext}`, bytes);
                        manifestAdds.push(`<opf:item id="${mapImgId}" href="BinData/${mapImgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                        setPicImage(mapPic, mapImgId, size.w, size.h, mapMaxW, mapMaxH);

                        const captionTc = locationMapTbl.getElementsByTagNameNS(HP_NS, 'tc')[1];
                        const captionT = captionTc.getElementsByTagNameNS(HP_NS, 't')[0];
                        if (captionT) captionT.textContent = `${HWPX_FIG_MARK}${getFloorLabel(floorCode)} 상태조사위치도`;
                        return true;
                    }
                    if (!(opts && opts.silent)) {
                        window.showToast(`${getFloorLabel(floorCode)}에 등록된 도면이 없어 위치도는 제외하고 만듭니다.`, 'info', 4000);
                    }
                    return false;
                } catch (mapErr) {
                    console.error(`${floorCode} 위치도 삽입 실패(나머지는 계속 진행):`, mapErr);
                    window.showToast(`${getFloorLabel(floorCode)} 위치도 삽입 중 오류가 있어 위치도는 제외하고 만듭니다.`, 'warning', 4000);
                    return false;
                }
            };

            /** 건축물 외부는 배치도 한 장이든 입면도 여러 장이든, 핀이 있는 도면마다 위치도를 넣는다. */
            const locationMapCodesForPage = (entry, fallbackCode) => {
                if (!entry || !entry.exteriorCombined) return [fallbackCode];
                const fi = window.BSA && window.BSA.floorIdentity;
                const hasDefects = (code) => {
                    const arr = (window.state.defects || {})[`${bldgId}_${code}`];
                    return Array.isArray(arr) && arr.length > 0;
                };
                const codes = (fi && typeof fi.exteriorLocationMapCodes === 'function')
                    ? fi.exteriorLocationMapCodes(fallbackCode, entry.exteriorFloorCodes, hasDefects)
                    : [fallbackCode];
                return codes.length ? codes : [fallbackCode];
            };

            let grade3HwpxCompareAnchorPara = null;

            // 3종: 층별 사진첩을 층 루프에서 빼서, 모든 층 상태조사표 다음에 전역 번호(사진1…)로 한 번에 넣는다.
            // 표 비고(photoRemark)와 사진첩 캡션이 같은 전역 번호를 쓰도록 사전 패스에서 Map을 만든다.
            const globalPhotoLabelByDefect = new Map();
            const globalPhotoEntries = []; // { d, floorCode } — 층 순서·층 내 결함 순서
            let grade3GlobalPhotoTblStamp = floorSlots[0]
                ? (floorSlots[0].photoTblStamp || (floorSlots[0].photoTbl && floorSlots[0].photoTbl.cloneNode(true)))
                : null;
            let grade3GlobalPhotoParaStamp = floorSlots[0] ? floorSlots[0].photoParaStamp : null;
            if (!grade3GlobalPhotoParaStamp && floorSlots[0] && floorSlots[0].photoTbl) {
                let node = floorSlots[0].photoTbl.parentNode;
                while (node && node.localName !== 'p') node = node.parentNode;
                if (node) grade3GlobalPhotoParaStamp = node.cloneNode(true);
            }

            // 첨부 양식(hwpx_grade3_photo_album.hwpx)이 있으면 템플릿 내장 사진표를 덮어쓴다.
            if (grade3PhotoAlbumTblStamp) {
                try {
                    if (grade3PhotoAlbumHeaderText) {
                        if (!hwpxHeaderText) hwpxHeaderText = await zip.file('Contents/header.xml').async('string');
                        const mergedAlbumHdr = mergeGrade3PhotoAlbumStampHeader(
                            hwpxHeaderText,
                            grade3PhotoAlbumHeaderText,
                            [grade3PhotoAlbumParaStamp]
                        );
                        hwpxHeaderText = mergedAlbumHdr.header;
                        grade3PhotoAlbumRemap = mergedAlbumHdr.remapAttrs;
                        hwpxHeaderDirty = true;
                    }
                    grade3GlobalPhotoTblStamp = remapHwpxCompareNode(
                        grade3PhotoAlbumTblStamp.cloneNode(true),
                        grade3PhotoAlbumRemap
                    );
                    if (grade3PhotoAlbumParaStamp) {
                        grade3GlobalPhotoParaStamp = remapHwpxCompareNode(
                            grade3PhotoAlbumParaStamp.cloneNode(true),
                            grade3PhotoAlbumRemap
                        );
                    }
                } catch (albumApplyErr) {
                    console.warn('3종 사진첩 양식 적용 실패, 템플릿 내장 표 사용:', albumApplyErr);
                }
            }

            // 2026-10-30 여러 동: 사진 번호를 동마다 사진1부터 다시(비고도 같은 번호). 한 동은 예전처럼 이어서.
            const photoNoByDong = !!(dongParts && dongParts.length > 1);
            let photoNoDong;
            let photoNoBase = 0;
            for (let preIdx = 0; preIdx < floorsData.length; preIdx++) {
                const { floorCode: preFloorCode, pageDefects: preDefects, dongPart: preDongPart } = floorsData[preIdx];
                if (photoNoByDong && (preDongPart || null) !== photoNoDong) {
                    photoNoDong = preDongPart || null;
                    photoNoBase = globalPhotoEntries.length;
                }
                await Promise.all(preDefects.map(async (d) => {
                    await ensureDefectPhotosLoaded(d);
                }));
                // 결함 한 줄에 사진이 여러 장이면 전부 넣는다(묶음은 구성원 전체) — 사진마다 번호 하나.
                const prePhotoLists = await Promise.all(preDefects.map((d) => loadHwpxRowPhotoEntries(d)));
                preDefects.forEach((d, dIdx) => {
                    const photoList = prePhotoLists[dIdx];
                    if (!photoList.length) return;
                    const firstNo = globalPhotoEntries.length - photoNoBase + 1;
                    photoList.forEach((p) => {
                        globalPhotoEntries.push({
                            d, floorCode: preFloorCode, src: p.src, pid: p.pid, dongPart: preDongPart || null,
                            label: `사진${globalPhotoEntries.length - photoNoBase + 1}`
                        });
                    });
                    globalPhotoLabelByDefect.set(d, formatHwpxPhotoRemark(firstNo, photoList.length));
                });
            }

            for (let slotIdx = 0; slotIdx < floorsData.length; slotIdx++) {
                const { floorCode, pageDefects } = floorsData[slotIdx];
                useDongOf(floorsData[slotIdx]);
                const slot = floorSlots[slotIdx];
                if (typeof window.updateLoadingText === 'function') {
                    window.updateLoadingText(`한글(hwpx) 상태조사표 생성 중... (${slotIdx + 1}/${floorsData.length} 층)`);
                }
                if (typeof yieldToUi === 'function') await yieldToUi();

                // 표 바로 위에는 원본 표본 문서의 "1) 지하1층" 같은 고정 텍스트 문단이 그대로
                // 남아있었다. 실제 층 이름으로 바꾸되, 표본 문서와 같은 "N) 층명" 형식을 유지하도록
                // 건물에 등록된 층 순서를 그대로 번호로 붙인다(1)부터 slotIdx+1).
                {
                    const t = slot.titlePara.getElementsByTagNameNS(HP_NS, 't')[0];
                    if (t) {
                        const extCombined = !!(floorsData[slotIdx] && floorsData[slotIdx].exteriorCombined);
                        const titleFloor = extCombined ? `${dongTitlePrefix()}건축물 외부` : getFloorLabel(floorCode);
                        t.textContent = `${slotIdx + 1}) ${titleFloor} 상태조사표 `; // 제목 글자와 표 사이 스페이스 1
                        normalizeHwpxTitleParaFont(slot.titlePara, t, await hwpxCharPrHeightsFromZip(zip));
                    }
                    if (slotIdx === 0) {
                        // 첫 페이지 표 제목 바로 위에 표본 문서의 "A동" 같은 동 이름 문단 + 빈 문단
                        // 여러 개가 그대로 남아있어서 엔터를 여러 번 친 것처럼 빈 줄이 생겼다. 동 이름
                        // 문단은 글자만 지우고(이 표는 동 구분이 없어 라벨 자체가 불필요), 그렇게 빈
                        // 문단이 된 것부터 위로 훑어 내용 없는 문단은 통째로 지운다 — 글자만 지우면
                        // 문단 자체의 줄 높이가 그대로 남기 때문. 표/그림이 든 문단이나 실제 텍스트가
                        // 남은 문단을 만나면 멈춘다.
                        const dongPara = slot.titlePara.previousElementSibling;
                        if (dongPara && dongPara.localName === 'p') {
                            const dt = dongPara.getElementsByTagNameNS(HP_NS, 't')[0];
                            if (dt) dt.textContent = '';
                        }
                    }
                }

                // ---- 상태조사표 ----
                // slot.statusTbls는 이 층 블록에 "지금 실제로 존재하는" 상태조사표 페이지들이다(표본
                // 문서가 원래 그 층에 여러 페이지를 갖고 있었다면 여러 개, 아니면 1개). 결함 개수에
                // 맞는 페이지 수(15건당 1페이지)와 비교해서 모자라면 복제로 늘리고, 남으면 지운다 —
                // 표본 페이지를 그대로 남겨두면 실제 데이터 사이에 표본 데이터가 섞여 나온다.
                const targetTbl = slot.statusTbls[0];
                const headerRow1Text = (() => {
                    const trs = Array.from(targetTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === targetTbl);
                    if (trs.length < 2) return '';
                    return Array.from(trs[1].getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent || '').join('');
                })();
                const HEADER_ROW_COUNT = (headerRow1Text.includes('구조부재') || headerRow1Text.includes('비구조부재')) ? 2 : 1;
                const allTrs = Array.from(targetTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === targetTbl);
                const dataRows = allTrs.slice(HEADER_ROW_COUNT);
                if (dataRows.length < 1) {
                    console.error(`${floorCode}: 템플릿 표의 데이터 행 스타일을 판별할 수 없어 이 층은 건너뜁니다.`);
                    continue;
                }

                const firstRowTpl = dataRows[0].cloneNode(true);
                const normalRowTpl = (dataRows[Math.min(1, dataRows.length - 1)] || dataRows[0]).cloneNode(true);
                const lastRowTpl = dataRows[dataRows.length - 1].cloneNode(true);
                // 1·2종과 동일: 템플릿 표본 행(첫/중간/마지막)의 칸별 borderFill을 그대로 읽어 쓴다.
                // 표본 행과 header.xml은 템플릿 빌드 단계에서 이미 맞춰져 있으므로 런타임 리맵이 없다.
                const borderStyleByCol = (row) => {
                    const map = {};
                    Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        if (addr) map[addr.getAttribute('colAddr')] = tc.getAttribute('borderFillIDRef');
                    });
                    return map;
                };
                const styleMaps = {
                    first: borderStyleByCol(firstRowTpl),
                    normal: borderStyleByCol(normalRowTpl),
                    last: borderStyleByCol(lastRowTpl)
                };
                // 데이터 행 한 줄 높이를 2800으로 통일(헤더 행은 손대지 않음) — 사용자 요청.
                const DATA_ROW_HEIGHT = 3500;
                [firstRowTpl, normalRowTpl, lastRowTpl].forEach((rowTpl) => {
                    Array.from(rowTpl.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                        const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                        if (span && parseInt(span.getAttribute('rowSpan'), 10) > 1) return;
                        const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                        if (sz) sz.setAttribute('height', String(DATA_ROW_HEIGHT));
                    });
                });

                // 2026-10-19 행 높이(js/shared/hwpx-survey-row-fit.js): 한 쪽에 15행 + 1행쯤 남게 키우고,
                // 16·17행이 찬 쪽은 그 쪽에 다 들어가게 줄인다. 줄 많은 행은 그 높이를 지키고 나머지를 줄여 쪽을 넘지 않게.
                const rowFitApi = window.BSA && window.BSA.shared && window.BSA.shared.hwpxSurveyRowFit;
                const directSegsOf = (p) => {
                    const arr = Array.from(p.children).find((c) => c.localName === 'linesegarray');
                    if (!arr) return [];
                    return Array.from(arr.children).filter((c) => c.localName === 'lineseg').map((s) => ({
                        vertpos: parseInt(s.getAttribute('vertpos'), 10) || 0,
                        vertsize: parseInt(s.getAttribute('vertsize'), 10) || 0,
                        spacing: parseInt(s.getAttribute('spacing'), 10) || 0
                    }));
                };
                /** 이 쪽에서 표 위에 오는 글(층 제목 등) 높이 — 쪽 나눔 문단까지 거슬러 더한다 */
                const surveyReserveAbove = (tbl) => {
                    let p = tbl && tbl.parentNode;
                    while (p && p.localName !== 'p') p = p.parentNode;
                    if (!p) return 0;
                    let reserve = 0;
                    const ownText = Array.from(p.children).some((c) => c.localName === 'run'
                        && !c.getElementsByTagNameNS(HP_NS, 'tbl').length && String(c.textContent || '').trim());
                    if (ownText) reserve += 3000;
                    if (p.getAttribute('pageBreak') === '1') return reserve;
                    let q = p.previousElementSibling;
                    let guard = 0;
                    while (q && q.localName === 'p' && guard++ < 12) {
                        if (q.getElementsByTagNameNS(HP_NS, 'tbl').length || q.getElementsByTagNameNS(HP_NS, 'pic').length) break;
                        reserve += rowFitApi.paraHeight(directSegsOf(q)) || 1500;
                        if (q.getAttribute('pageBreak') === '1') break;
                        q = q.previousElementSibling;
                    }
                    return reserve;
                };
                const surveyHeaderHeight = (tbl) => {
                    const trs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter((tr) => tr.parentNode === tbl).slice(0, HEADER_ROW_COUNT);
                    let sum = 0;
                    let spanMax = 0;
                    trs.forEach((tr, ri) => {
                        let m = 0;
                        Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                            const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                            const rs = span ? (parseInt(span.getAttribute('rowSpan'), 10) || 1) : 1;
                            const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                            const h = sz ? (parseInt(sz.getAttribute('height'), 10) || 0) : 0;
                            if (rs === 1) m = Math.max(m, h);
                            else if (ri === 0 && rs >= HEADER_ROW_COUNT) spanMax = Math.max(spanMax, h);
                        });
                        sum += m;
                    });
                    return Math.max(sum, spanMax);
                };
                const surveyPageBodyH = (() => {
                    const pagePrEl = xmlDoc.getElementsByTagNameNS(HP_NS, 'pagePr')[0];
                    const marginEl = pagePrEl ? Array.from(pagePrEl.children).find((c) => c.localName === 'margin') : null;
                    const n = (el, k) => { const v = el ? parseInt(el.getAttribute(k), 10) : NaN; return Number.isFinite(v) ? v : undefined; };
                    return rowFitApi ? rowFitApi.bodyHeight({
                        height: n(pagePrEl, 'height'), top: n(marginEl, 'top'), bottom: n(marginEl, 'bottom'),
                        header: n(marginEl, 'header'), footer: n(marginEl, 'footer')
                    }) : 0;
                })();
                /** 한 쪽(표 하나)의 데이터 행 높이를 정해 넣는다 */
                const fitSurveyPageRows = (destTbl, pageRows) => {
                    const outM = Array.from(destTbl.children).find((c) => c.localName === 'outMargin');
                    const tableMarginV = outM ? (parseInt(outM.getAttribute('top'), 10) || 0) + (parseInt(outM.getAttribute('bottom'), 10) || 0) : 280;
                    const headerH = surveyHeaderHeight(destTbl);
                    const plan = rowFitApi.planRows({
                        bodyH: surveyPageBodyH,
                        reserveH: surveyReserveAbove(destTbl),
                        headerH,
                        tableMarginV,
                        stdReserveH: rowFitApi.STD_RESERVE_H,
                        needs: pageRows.map((r) => r.need)
                    });
                    if (!plan.fits) console.warn(`${floorCode} 상태조사표: 줄이 많은 행 때문에 한 쪽을 넘을 수 있습니다(필요 ${plan.total}, 쪽 ${plan.area}).`);
                    pageRows.forEach((r, i) => {
                        Array.from(r.row.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                            const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                            if (span && parseInt(span.getAttribute('rowSpan'), 10) > 1) return;
                            const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                            if (sz) sz.setAttribute('height', String(plan.heights[i]));
                        });
                        Array.from(r.row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);
                    });
                    const tblSz = Array.from(destTbl.children).find((c) => c.localName === 'sz');
                    if (tblSz) tblSz.setAttribute('height', String(headerH + plan.total));
                    return plan;
                };

                // 기존에 있던 페이지(targetTbl 포함 전부)의 표본 데이터 행을 지운다.
                slot.statusTbls.forEach(tbl => {
                    Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl).slice(HEADER_ROW_COUNT).forEach(tr => tbl.removeChild(tr));
                });

                // 표 하나에 행을 전부 몰아넣으면 한글에서 다음 페이지로 안 넘어가거나 열람 중
                // 멈추는 문제가 있었다. 15행(최대 17, n-n 추가분)마다 표를 나누고, 가능하면
                // 본번호가 15·30·45에서 끝나게 한다.
                const surveyPages = paginateSurveyDefects(pageDefects);
                const neededPages = Math.max(1, surveyPages.length);

                let pageTbls = slot.statusTbls.slice();
                if (pageTbls.length > neededPages) {
                    pageTbls.slice(neededPages).forEach(tbl => {
                        const p = tbl.parentNode.parentNode;
                        if (p.parentNode) p.parentNode.removeChild(p);
                    });
                    pageTbls = pageTbls.slice(0, neededPages);
                } else if (pageTbls.length < neededPages) {
                    let insertAfterNode = (() => {
                        let p = pageTbls[pageTbls.length - 1];
                        while (p && p.localName !== 'p') p = p.parentNode;
                        return p || pageTbls[pageTbls.length - 1].parentNode;
                    })();
                    for (let n = pageTbls.length; n < neededPages; n++) {
                        const clonedPara = insertAfterNode.cloneNode(true);
                        clonedPara.setAttribute('pageBreak', '1');
                        if (insertAfterNode === slot.titlePara) {
                            Array.from(clonedPara.childNodes).forEach((ch) => {
                                if (ch.nodeType !== 1) return;
                                if ((ch.localName === 'run' || ch.nodeName === 'hp:run') &&
                                    !ch.getElementsByTagNameNS(HP_NS, 'tbl').length &&
                                    ch.parentNode) {
                                    ch.parentNode.removeChild(ch);
                                }
                            });
                        }
                        const clonedTbl = clonedPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
                        cloneIdSeq++;
                        clonedTbl.setAttribute('id', String(8600000 + cloneIdSeq));
                        insertAfterNode.parentNode.insertBefore(clonedPara, insertAfterNode.nextSibling);
                        insertAfterNode = clonedPara;
                        pageTbls.push(clonedTbl);
                        syncStatusTblLayoutFromTemplate(clonedTbl, targetTbl, HEADER_ROW_COUNT, normalRowTpl);
                    }
                }
                pageTbls.forEach((tbl, i) => {
                    if (i > 0) {
                        tbl.parentNode.parentNode.setAttribute('pageBreak', '1');
                        syncStatusTblLayoutFromTemplate(tbl, targetTbl, HEADER_ROW_COUNT, normalRowTpl);
                    }
                });

                surveyPages.forEach((pageItems, pageIdx) => {
                    const destTbl = pageTbls[pageIdx];
                    const fitRows = [];
                    pageItems.forEach((d, localIdx) => {
                        const isLastOnPage = localIdx === pageItems.length - 1;
                        const rowCtx = {
                            floorCode,
                            photoRemark: globalPhotoLabelByDefect.get(d) || '-',
                            floorDisplayLabel: rowFloorLabel(floorCode)
                        };
                        const colCount = Array.from(normalRowTpl.getElementsByTagNameNS(HP_NS, 'tc')).length;
                        const values = getReportSurveyRowValues(d, Object.assign({ hwpxUnits: true }, rowCtx), isGrade3, colCount);
                        // 첫 데이터 행: 헤더 직하 DOUBLE_SLIM 상단선(first). 마지막 행: 페이지 하단 테두리(last).
                        const rowTpl = localIdx === 0 ? firstRowTpl : (isLastOnPage ? lastRowTpl : normalRowTpl);
                        const styleMap = localIdx === 0 ? styleMaps.first : (isLastOnPage ? styleMaps.last : styleMaps.normal);

                        const newRow = rowTpl.cloneNode(true);
                        copyRowCellSizesFromTemplate(newRow, rowTpl);
                        let rowMaxLines = 1;
                        let rowLineMetric = null;
                        Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            const colAddr = addr ? parseInt(addr.getAttribute('colAddr'), 10) : NaN;
                            if (addr) {
                                addr.setAttribute('rowAddr', String(HEADER_ROW_COUNT + localIdx));
                                const bf = styleMap[addr.getAttribute('colAddr')];
                                if (bf !== undefined) tc.setAttribute('borderFillIDRef', bf);
                            }
                            if (!Number.isFinite(colAddr) || colAddr < 0 || colAddr >= values.length) return;
                            const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                            const paras = subList ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList) : [];
                            if (paras.length > 0) {
                                const fillInfo = fillCellParas(subList, paras, values[colAddr] !== undefined ? values[colAddr] : '', tc);
                                if (fillInfo.lineCount > rowMaxLines) rowMaxLines = fillInfo.lineCount;
                                if (!rowLineMetric && fillInfo.vertsize) {
                                    const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                                    const marginV = marginEl
                                        ? (parseInt(marginEl.getAttribute('top'), 10) || 0) + (parseInt(marginEl.getAttribute('bottom'), 10) || 0)
                                        : 282;
                                    rowLineMetric = { vertsize: fillInfo.vertsize, spacing: fillInfo.spacing, marginV };
                                }
                            }
                        });
                        if (rowFitApi && surveyPageBodyH > 0) {
                            // 높이는 쪽 단위로 아래 fitSurveyPageRows가 정한다(이 행에 필요한 최소 높이만 적어 둔다)
                            const need = rowLineMetric
                                ? rowFitApi.lineNeed(rowMaxLines, rowLineMetric.vertsize, rowLineMetric.spacing, rowLineMetric.marginV)
                                : 0;
                            fitRows.push({ row: newRow, need });
                        } else {
                            // 템플릿 행 높이 유지. 4줄 이상일 때만 확장(자간·줄나눔·상하 강제 축소/확대 없음).
                            applyRowHeightFromLines(newRow, rowMaxLines, rowLineMetric, DATA_ROW_HEIGHT);
                            Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);
                        }
                        destTbl.appendChild(newRow);
                    });
                    destTbl.setAttribute('rowCnt', String(HEADER_ROW_COUNT + pageItems.length));
                    if (fitRows.length) fitSurveyPageRows(destTbl, fitRows);
                });

                // ---- 층별 사진첩 제거(전역 앨범으로 이동) ----
                // 표본 사진 표는 항상 지운다. 빈 사진 문단(pageBreak)이 층 사이에 남지 않도록 문단도 제거.
                try {
                    const photoTbl = slot.photoTbl;
                    if (photoTbl && photoTbl.parentNode) {
                        const photoRun = photoTbl.parentNode;
                        Array.from(photoRun.children).filter(c => c.localName === 'tbl').forEach(t => photoRun.removeChild(t));
                        let photoPara = photoRun;
                        while (photoPara && photoPara.localName !== 'p') photoPara = photoPara.parentNode;
                        if (photoPara && photoPara.parentNode) photoPara.parentNode.removeChild(photoPara);
                    }
                } catch (photoStripErr) {
                    console.error(`${floorCode} 층별 사진첩 제거 실패(나머지는 계속 진행):`, photoStripErr);
                }

                // 중점관리 비교사진 삽입 앵커 폴백: 이 층 마지막 상태조사표 문단(전역 앨범이 덮어씀)
                {
                    let lastTblPara = null;
                    pageTbls.forEach((tbl) => {
                        let p = tbl.parentNode;
                        while (p && p.localName !== 'p') p = p.parentNode;
                        if (p) lastTblPara = p;
                    });
                    if (lastTblPara) grade3HwpxCompareAnchorPara = lastTblPara;
                }

                // ---- 결함위치도 ----
                // 3종시설물은 위치도를 층 블록에서 바로 넣지 않고, 모든 층 처리가 끝난 뒤 별도로
                // 몰아서 넣는다(아래 본 루프 밖의 grade3LocMapStampPara 처리 참고).
            }

            // ---- 전 층 결함 사진첩 (사진1… 전역 이어번호) ----
            // 모든 층 상태조사표 뒤에 한 번만 삽입. 중점관리 비교사진은 이 앨범 끝 다음에 붙는다.
            try {
                if (globalPhotoEntries.length > 0 && grade3GlobalPhotoTblStamp && grade3GlobalPhotoParaStamp) {
                    if (typeof window.updateLoadingText === 'function') {
                        window.updateLoadingText('한글(hwpx) 결함 사진첩 생성 중...');
                    }
                    const photoTblStamp = grade3GlobalPhotoTblStamp;
                    const PHOTOS_PER_PAGE = 6;
                    const donorPic = findGrade3PhotoDonorPic();
                    const stampSlotsProbe = resolveGrade3HwpxPhotoAlbumSlots(photoTblStamp);
                    let maxW = 0;
                    let maxH = 0;
                    {
                        const tplPics = photoTblStamp.getElementsByTagNameNS(HP_NS, 'pic');
                        if (tplPics.length) {
                            maxW = parseInt(tplPics[0].getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('width'), 10) || 0;
                            maxH = parseInt(tplPics[0].getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('height'), 10) || 0;
                        } else if (stampSlotsProbe.slots.length) {
                            const probe = stampSlotsProbe.slots.map(s => s.imageTc).filter(Boolean);
                            probe.forEach((tc) => {
                                maxW = Math.max(maxW, Math.max(1000, hwpxPhotoCellWidth(tc) - 282));
                                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                                const h = sz ? (parseInt(sz.getAttribute('height'), 10) || 0) : 0;
                                maxH = Math.max(maxH, Math.max(1000, h - 282));
                            });
                        }
                        if (!maxW || !maxH) {
                            maxW = maxW || 20000;
                            maxH = maxH || 15000;
                        }
                        if (!tplPics.length && !donorPic) {
                            throw new Error('사진첩 템플릿에 hp:pic이 없고 복제할 사진 노드도 없습니다.');
                        }
                    }

                    const decoded = (await mapLimit(globalPhotoEntries, 6, async (entry) => {
                        const d = entry.d;
                        const floorCode = entry.floorCode;
                        const src0 = entry.src;
                        if (!src0) return null;
                        try {
                            const src = await resolveSrcForHwpxEmbed(src0, entry.pid);
                            const { bytes, mime, ext } = await dataUrlToBytes(src);
                            const size = await loadImageNaturalSizeFromBytes(bytes, mime);
                            return { d, floorCode, dongPart: entry.dongPart || null, label: entry.label, bytes, mime, ext, w: size.w, h: size.h };
                        } catch (onePhotoErr) {
                            console.warn('사진 1장 임베드 실패(해당 컷만 생략):', d && d.id, onePhotoErr);
                            return null;
                        }
                    })).filter(Boolean);
                    if (!decoded.length) {
                        throw new Error('임베드 가능한 사진이 없습니다. (Storage URL/권한/CORS 확인)');
                    }

                    let insertPara = grade3GlobalPhotoParaStamp.cloneNode(true);
                    Array.from(insertPara.getElementsByTagNameNS(HP_NS, 'tbl')).forEach((t) => {
                        if (t.parentNode) t.parentNode.removeChild(t);
                    });
                    insertPara.setAttribute('pageBreak', '1');
                    const insertAfter = grade3HwpxCompareAnchorPara;
                    if (insertAfter && insertAfter.parentNode) {
                        insertAfter.parentNode.insertBefore(insertPara, insertAfter.nextSibling);
                    } else {
                        sec.appendChild(insertPara);
                    }
                    const emptyPhotoPara = insertPara.cloneNode(true);
                    emptyPhotoPara.setAttribute('pageBreak', '1');
                    let insertRun = Array.from(insertPara.children).find(c => c.localName === 'run')
                        || insertPara.getElementsByTagNameNS(HP_NS, 'run')[0];
                    let photosOnPage = 0;

                    const appendPhotoTbl = (tbl) => {
                        ensureTblTreatAsChar(tbl);
                        const trail = Array.from(insertRun.children).find(c => c.localName === 't') || null;
                        if (trail) insertRun.insertBefore(tbl, trail);
                        else insertRun.appendChild(tbl);
                    };
                    const startNextPhotoPage = () => {
                        if (!emptyPhotoPara || !insertPara || !insertPara.parentNode) return;
                        const newPara = emptyPhotoPara.cloneNode(true);
                        newPara.setAttribute('pageBreak', '1');
                        insertPara.parentNode.insertBefore(newPara, insertPara.nextSibling);
                        insertPara = newPara;
                        insertRun = Array.from(newPara.children).find(c => c.localName === 'run') || newPara.getElementsByTagNameNS(HP_NS, 'run')[0];
                        photosOnPage = 0;
                    };

                    // 2026-10-30 여러 동: 사진첩을 동마다 새 쪽 + 「A동 결함사진」 소제목으로 나눈다(사진 번호는 비고와 맞게 이어감).
                    // 한 표(사진 2장)에 두 동 사진이 섞이지 않게 동이 바뀌면 왼쪽 칸부터 다시.
                    const splitAlbumByDong = !!(dongParts && dongParts.length > 1);
                    let albumDong;
                    let albumGroupCount = 0;
                    for (let i = 0; i < decoded.length; i += (decoded[i + 1] && (!splitAlbumByDong || decoded[i + 1].dongPart === decoded[i].dongPart)) ? 2 : 1) {
                        const slot1 = decoded[i];
                        const slot2 = (decoded[i + 1] && (!splitAlbumByDong || decoded[i + 1].dongPart === slot1.dongPart)) ? decoded[i + 1] : null;
                        const pairCount = slot2 ? 2 : 1;
                        if (splitAlbumByDong && slot1.dongPart !== albumDong) {
                            if (albumGroupCount > 0) startNextPhotoPage();
                            albumDong = slot1.dongPart;
                            albumGroupCount++;
                            const dl = albumDong && albumDong.dongLabel;
                            if (dl && ndtAlbumSubHeadingStamp && insertPara && insertPara.parentNode) {
                                const head = makeHwpxTextParaFromStamp(ndtAlbumSubHeadingStamp, `${dl} 결함사진`, HP_NS, true);
                                if (head) {
                                    insertPara.parentNode.insertBefore(head, insertPara);
                                    insertPara.setAttribute('pageBreak', '0');
                                }
                            }
                        } else if (photosOnPage > 0 && photosOnPage + pairCount > PHOTOS_PER_PAGE) {
                            startNextPhotoPage();
                        }

                        photoTblCounter++;
                        const newTbl = photoTblStamp.cloneNode(true);
                        newTbl.setAttribute('id', String(9500000 + photoTblCounter));
                        let album = resolveGrade3HwpxPhotoAlbumSlots(newTbl);
                        if (!album.slots.length) {
                            throw new Error('사진첩 템플릿에서 사진N 라벨 셀을 찾지 못했습니다.');
                        }
                        const sizeInfo = ensureGrade3PhotoPicsInTbl(newTbl, album.slots, donorPic);
                        const fitW = sizeInfo.maxW || maxW;
                        const fitH = sizeInfo.maxH || maxH;
                        album = resolveGrade3HwpxPhotoAlbumSlots(newTbl);
                        const pics = album.slots.map(s => s.pic).filter(Boolean);
                        pics.forEach((p, pIdx) => {
                            p.setAttribute('id', String(9600000 + photoTblCounter * 2 + pIdx));
                            p.setAttribute('instid', String(9700000 + photoTblCounter * 2 + pIdx));
                        });
                        if (!album.slots[0] || !album.slots[0].pic) {
                            throw new Error('사진첩 템플릿 표에 hp:pic 슬롯이 없습니다.');
                        }

                        const fillGrade3PhotoSlot = (slot, entry) => {
                            if (!slot || !entry) return;
                            const inspectionContent = appendGrade3ProgressLeakToContent(
                                getSurveyCellText('inspectionContent', entry.d, { floorCode: entry.floorCode }),
                                entry.d
                            );
                            if (slot.labelTc) {
                                setTcText(slot.labelTc, entry.label);
                                centerCellContent(slot.labelTc);
                            }
                            // 위치 칸에는 절대 쓰지 않는다(신규 템플릿에는 없음). 구형 스탬프 샘플 위치 문구만 비운다.
                            if (slot.locationTc) setTcText(slot.locationTc, '');
                            if (slot.contentTc) {
                                setTcText(slot.contentTc, inspectionContent);
                                centerCellContent(slot.contentTc);
                            }
                        };

                        imgCounter++;
                        const imgId1 = `photoAuto${imgCounter}`;
                        zip.file(`BinData/${imgId1}.${slot1.ext}`, slot1.bytes);
                        manifestAdds.push(`<opf:item id="${imgId1}" href="BinData/${imgId1}.${slot1.ext}" media-type="${slot1.mime}" isEmbeded="1"/>`);
                        setPicImage(album.slots[0].pic, imgId1, slot1.w, slot1.h, fitW, fitH);
                        fillGrade3PhotoSlot(album.slots[0], slot1);

                        if (slot2) {
                            if (!album.slots[1] || !album.slots[1].pic) {
                                throw new Error('사진첩 템플릿에 오른쪽 사진 슬롯이 없습니다.');
                            }
                            imgCounter++;
                            const imgId2 = `photoAuto${imgCounter}`;
                            zip.file(`BinData/${imgId2}.${slot2.ext}`, slot2.bytes);
                            manifestAdds.push(`<opf:item id="${imgId2}" href="BinData/${imgId2}.${slot2.ext}" media-type="${slot2.mime}" isEmbeded="1"/>`);
                            setPicImage(album.slots[1].pic, imgId2, slot2.w, slot2.h, fitW, fitH);
                            fillGrade3PhotoSlot(album.slots[1], slot2);
                        } else {
                            stripGrade3UnusedPhotoSlots(newTbl, 1);
                        }

                        appendPhotoTbl(newTbl);
                        photosOnPage += pairCount;
                    }
                    if (insertPara) grade3HwpxCompareAnchorPara = insertPara;
                }
            } catch (photoErr) {
                console.error('전 층 결함 사진 갤러리 삽입 실패(나머지는 계속 진행):', photoErr);
                window.showToast('결함 사진 삽입 중 오류가 있어 사진은 제외하고 만듭니다.', 'warning', 5000);
            }

            // 실제로 채운 블록 다음에 남은 표본 층 블록은 (비파괴조사 섹션 정리와 함께) 뒤에서 지운다.
            const unusedFloorSlotStart = floorSlots.length > floorsData.length ? floorSlots[floorsData.length].titlePara : null;

            // 비파괴조사(NDT) 섹션은 아직 여러 층을 지원하지 않아 지금 화면에 보고 있는 층 기준으로만 채운다.
            const floorCode = window.state.currentFloor || (floorsData[0] && floorsData[0].floorCode);
            useDongOf(null);

            // ---- 비파괴조사(NDT) 5개 섹션: 콘크리트 강도/탄산화/외벽기울기/부동침하/부재처짐 ----
            // 정기안전점검용 템플릿(hwpx_survey_template_regular.hwpx)에는 이 섹션들이 애초에 없으므로
            // 정밀안전점검일 때만 실행해서 앱에 등록된 실측 데이터로 채운다. 표 데이터 행 교체 로직
            // (테두리 스타일 3종 판별 → 기존 행 삭제 → clone해서 채우기)은 위 상태조사표와 완전히
            // 동일한 패턴이라 fillNdtTable로 뽑아 재사용한다. 실패해도 이미 만들어둔 상태조사표/사진/
            // 결함위치도는 살려서 내보내야 하므로 전체를 try/catch로 감싼다.
            try { if (isPreciseInspectionForTemplate) {
                const ndtBldg = dongParts ? bldg : (window.state.currentBuilding || {});
                const ndtBldgId = ndtBldg.id || window.state.currentBuildingId;
                // 결과표는 건물 전체 층을 합쳐 채운다. 위치도는 작성한 항목·층만 비동기로
                // 렌더해서 7.1.8부터 캡션을 붙여 넣는다(미작성 항목 제목/표는 제거).
                const { allItems: allNdtItemsForHwpx, allDispGroups: allDispGroupsForHwpx } = (dongParts ? buildHwpxDongNdtData(dongParts) : buildCombinedNdtDataForReport(ndtBldgId));

                const measureItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '실측');
                const fireproofItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '내화피복');
                const strengthItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '강도')
                    .map(item => refreshStrengthItemResults(item, ndtBldgOf(item)));
                const carbItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '탄산화')
                    .map(item => refreshCarbItemResults(item, ndtBldgOf(item)));
                const tiltItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '기울기');
                const settlementGroupsHwpx = allDispGroupsForHwpx.filter(g => !g.category || g.category === '변위');
                const memberDispGroupsHwpx = allDispGroupsForHwpx.filter(g => g.category === '부재변위');

                const findTblById = (tblId, fallbackTextMarkers) => {
                    const all = xmlDoc.getElementsByTagNameNS(HP_NS, 'tbl');
                    for (let i = 0; i < all.length; i++) {
                        if (all[i].getAttribute('id') === tblId) return all[i];
                    }
                    // 한글에서 템플릿을 직접 열어 저장하면 표 id가 바뀌는 경우가 있어(실제로 겪음),
                    // id로 못 찾으면 표 헤더 글자 조합으로 구조 매칭해 찾는다.
                    if (fallbackTextMarkers && fallbackTextMarkers.length) {
                        for (let i = 0; i < all.length; i++) {
                            const txt = Array.from(all[i].getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent).join('');
                            if (fallbackTextMarkers.every(m => txt.includes(m))) return all[i];
                        }
                    }
                    return null;
                };
                // 표를 통째로 지울 때는 바로 위 제목 문단까지 같이 뗀다(작성 안 한 항목이
                // 제목만 빈 채로 남는 것을 막음).
                const removeNdtTableById = (tblId) => {
                    const tbl = findTblById(tblId);
                    if (!tbl) return;
                    let tblPara = tbl;
                    while (tblPara && tblPara.localName !== 'p') tblPara = tblPara.parentNode;
                    let heading = tblPara && tblPara.previousElementSibling;
                    while (heading && heading.localName === 'p') {
                        const hasTbl = heading.getElementsByTagNameNS(HP_NS, 'tbl').length > 0;
                        const hasPic = heading.getElementsByTagNameNS(HP_NS, 'pic').length > 0;
                        const t = paraText(heading).trim();
                        if (hasTbl || hasPic) break;
                        if (t) {
                            if (heading.parentNode) heading.parentNode.removeChild(heading);
                            break;
                        }
                        const empty = heading;
                        heading = heading.previousElementSibling;
                        if (empty.parentNode) empty.parentNode.removeChild(empty);
                    }
                    let next = tblPara && tblPara.nextElementSibling;
                    if (tblPara && tblPara.parentNode) tblPara.parentNode.removeChild(tblPara);
                    while (next && next.localName === 'p') {
                        const hasTblN = next.getElementsByTagNameNS(HP_NS, 'tbl').length > 0;
                        const hasPicN = next.getElementsByTagNameNS(HP_NS, 'pic').length > 0;
                        const tn = paraText(next).trim();
                        if (hasTblN) break;
                        if (tn && !hasPicN) break;
                        const cur = next;
                        next = next.nextElementSibling;
                        if (cur.parentNode) cur.parentNode.removeChild(cur);
                    }
                };

                // 데이터 행 채우기 (상태조사표의 행 clone 패턴 재사용). headerRowCount개 행은 그대로
                // 두고 그 다음부터 표 끝까지가 데이터 행이다. rowsValues[i]는 colAddr=1번 칸부터 순서대로
                // 들어갈 값 배열이다(0번 칸은 세로로 병합된 표 왼쪽 라벨 칸이라 건드리지 않는다).
                const fillNdtTable = (tbl, headerRowCount, rowsValues, includeCol0 = false) => {
                    const allTrs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl);
                    const oldDataRows = allTrs.slice(headerRowCount);
                    if (oldDataRows.length < 1) return;
                    const borderStyleByColLocal = (row) => {
                        const map = {};
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (addr) map[addr.getAttribute('colAddr')] = tc.getAttribute('borderFillIDRef');
                        });
                        return map;
                    };
                    const firstStyleRow = oldDataRows[0];
                    const normalStyleRow = oldDataRows.length > 2 ? oldDataRows[1] : oldDataRows[0];
                    const lastStyleRow = oldDataRows[oldDataRows.length - 1];
                    const styleMaps = {
                        first: borderStyleByColLocal(firstStyleRow),
                        normal: borderStyleByColLocal(normalStyleRow),
                        last: borderStyleByColLocal(lastStyleRow)
                    };
                    const findCol0 = (row) => Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).find(tc => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        return addr && addr.getAttribute('colAddr') === '0';
                    });
                    // 강도/탄산화 표는 첫 데이터 행에만 세로 병합(rowSpan)된 숨은 0번 칸(예: 회사명
                    // 라벨)이 있고 그 아래 행들엔 그 칸이 아예 없다. 예전엔 첫 행까지 통째로 지우고
                    // normalStyleRow(0번 칸 없음)로만 다시 채워서, 표 전체에 0번 칸이 하나도 안 남는
                    // "구멍 뚫린" 구조가 됐다 — 한글이 이런 표를 열다가 그대로 죽는 원인이었다. 새로
                    // 만드는 첫 행에 그 칸을 그대로 옮겨 붙이고 rowSpan만 실제 데이터 행 수에 맞춘다.
                    const firstCol0 = findCol0(firstStyleRow);
                    const normalHasCol0 = !!findCol0(normalStyleRow);
                    // 0번 칸의 원래 높이는 표본 문서의 원래 행 수(예: 16행) 전체를 합친 값이라, rowSpan만
                    // 실제 행 수로 줄이고 높이를 그대로 두면 남은 행들이 그 큰 높이를 채우려고 줄이 통째로
                    // 늘어난다. 일반 행 하나의 높이 × 실제 행 수로 다시 계산해서 자연스러운 줄 높이가
                    // 되게 한다.
                    const normalRowCellSz = normalStyleRow.getElementsByTagNameNS(HP_NS, 'tc')[0]
                        ?.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const normalRowHeight = normalRowCellSz ? parseInt(normalRowCellSz.getAttribute('height'), 10) : null;
                    oldDataRows.forEach(tr => tbl.removeChild(tr));
                    rowsValues.forEach((values, idx) => {
                        const styleMap = idx === 0 ? styleMaps.first : (idx === rowsValues.length - 1 ? styleMaps.last : styleMaps.normal);
                        const newRow = normalStyleRow.cloneNode(true);
                        if (idx === 0 && firstCol0 && !normalHasCol0) {
                            const col0Clone = firstCol0.cloneNode(true);
                            const span = col0Clone.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                            if (span) span.setAttribute('rowSpan', String(rowsValues.length));
                            const col0Addr = col0Clone.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (col0Addr) col0Addr.setAttribute('rowAddr', String(headerRowCount));
                            if (normalRowHeight) {
                                const col0Sz = col0Clone.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                                if (col0Sz) col0Sz.setAttribute('height', String(normalRowHeight * rowsValues.length));
                            }
                            // 표본 문서에 남아있던 회사명 등 샘플 글자(세로 병합 칸이라 한 글자씩
                            // 위아래로 쪼개져 나온다) — 우리 데이터로 채우는 칸이 아니라 그대로 지운다.
                            Array.from(col0Clone.getElementsByTagNameNS(HP_NS, 't')).forEach(t => { t.textContent = ''; });
                            newRow.insertBefore(col0Clone, newRow.firstChild);
                        }
                        let rowMaxLines = 1;
                        let rowLineMetric = null;
                        Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (!addr) return;
                            const colAddr = addr.getAttribute('colAddr');
                            addr.setAttribute('rowAddr', String(headerRowCount + idx));
                            const bf = styleMap[colAddr];
                            if (bf !== undefined) tc.setAttribute('borderFillIDRef', bf);
                            if (colAddr === '0' && !includeCol0) return;
                            const colIdx = includeCol0 ? parseInt(colAddr, 10) : parseInt(colAddr, 10) - 1;
                            const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                            const paras = subList ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList) : [];
                            if (paras.length > 0 && values[colIdx] !== undefined) {
                                const fillInfo = fillCellParas(subList, paras, values[colIdx], tc);
                                if (fillInfo.lineCount > rowMaxLines) rowMaxLines = fillInfo.lineCount;
                                if (!rowLineMetric && fillInfo.vertsize) {
                                    const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                                    const marginV = marginEl ? (parseInt(marginEl.getAttribute('top'), 10) || 0) + (parseInt(marginEl.getAttribute('bottom'), 10) || 0) : 282;
                                    rowLineMetric = { vertsize: fillInfo.vertsize, spacing: fillInfo.spacing, marginV };
                                }
                            }
                        });
                        applyRowHeightFromLines(newRow, rowMaxLines, rowLineMetric);
                        Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);
                        tbl.appendChild(newRow);
                    });
                    tbl.setAttribute('rowCnt', String(headerRowCount + rowsValues.length));
                };

                // 부동침하/부재변위 결과표 밑에 그룹별 요약박스+그래프 이미지를 순서대로 이어붙이는 도우미.
                // 문서에 이미 있는 hp:pic 하나(콘크리트 강도/탄산화 위치도용)의 XML을 그대로 문자열
                // 템플릿으로 써서 매번 새 문단으로 파싱해 넣는다 — 반발경도 성과표 섹션이 기존 그림
                // 문단을 clone해서 재사용하는 것과 같은 발상이며, id/이미지 참조만 매번 새로 갈아끼운다.
                const PIC_TEMPLATE_XML = '<hp:pic id="ID_PLACEHOLDER" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" thumbnailBinIDRef="" href="" groupLevel="0" instid="0" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="685500" height="864780"/><hp:curSz width="41824" height="52763"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="20912" centerY="26381" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.061012" e2="0" e3="0" e4="0" e5="0.061013" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="image6" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="685500" y="0"/><hc:pt2 x="685500" y="864780"/><hc:pt3 x="0" y="864780"/></hp:imgRect><hp:imgClip left="0" right="578460" top="0" bottom="729780"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="578460" dimheight="729780"/><hp:effects/><hp:sz width="41824" widthRelTo="ABSOLUTE" height="52763" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>';

                const insertImageParaAfter = async (afterPara, dataUrl, imgIdPrefix, maxW = 42520, maxH = 999999999) => {
                    if (!afterPara || !dataUrl) return afterPara;
                    const { bytes, mime, ext } = await dataUrlToBytes(dataUrl);
                    const size = await loadImageSize(dataUrl);
                    const seq = imgCounter++;
                    const imgId = `${imgIdPrefix}${seq}`;
                    zip.file(`BinData/${imgId}.${ext}`, bytes);
                    manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);

                    const picXml = PIC_TEMPLATE_XML.replace('id="ID_PLACEHOLDER"', `id="${900000000 + seq}"`);
                    const picDoc = new DOMParser().parseFromString(
                        `<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${picXml}</root>`, 'application/xml');
                    const picNode = xmlDoc.importNode(picDoc.documentElement.firstChild, true);

                    const newPara = xmlDoc.createElementNS(HP_NS, 'hp:p');
                    newPara.setAttribute('id', '0');
                    newPara.setAttribute('paraPrIDRef', '18');
                    newPara.setAttribute('styleIDRef', '3');
                    newPara.setAttribute('pageBreak', '0');
                    newPara.setAttribute('columnBreak', '0');
                    newPara.setAttribute('merged', '0');
                    const run = xmlDoc.createElementNS(HP_NS, 'hp:run');
                    run.setAttribute('charPrIDRef', '37');
                    run.appendChild(picNode);
                    newPara.appendChild(run);
                    const lineseg = xmlDoc.createElementNS(HP_NS, 'hp:linesegarray');
                    const seg = xmlDoc.createElementNS(HP_NS, 'hp:lineseg');
                    seg.setAttribute('textpos', '0'); seg.setAttribute('vertpos', '0');
                    seg.setAttribute('vertsize', '1300'); seg.setAttribute('textheight', '1300');
                    seg.setAttribute('baseline', '1105'); seg.setAttribute('spacing', '1560');
                    seg.setAttribute('horzpos', '0'); seg.setAttribute('horzsize', '42520');
                    seg.setAttribute('flags', '393216');
                    lineseg.appendChild(seg);
                    newPara.appendChild(lineseg);

                    afterPara.parentNode.insertBefore(newPara, afterPara.nextSibling);
                    setPicImage(picNode, imgId, size.w, size.h, maxW, maxH);
                    return newPara;
                };

                // 결과표(tbl)가 들어있는 문단 바로 다음 자리부터, 그룹마다 요약박스+그래프를 합친
                // 그림 한 장씩 이어붙인다. 박스와 그래프를 따로 넣으면 표 중간에서 페이지가 갈릴 때
                // 각각 다른 페이지로 쪼개질 수 있어서, 한 장(같은 테두리)으로 합쳐 그 문제를 막는다.
                // 높이를 27000(≈95mm)으로 제한해서 페이지 하나에 두 장이 들어가도록(사용자 요청) 맞췄다.
                const GROUP_IMG_MAX_H = 27000;
                const insertGroupResultImages = async (tbl, groups) => {
                    if (!tbl) return;
                    let anchorPara = tbl.parentNode && tbl.parentNode.parentNode; // hp:pic|hp:tbl -> hp:run -> hp:p
                    if (!anchorPara || anchorPara.localName !== 'p') return;
                    for (let i = 0; i < groups.length; i++) {
                        const group = groups[i];
                        // 그래프 제목의 층은 그 그룹이 조사된 층 — 예전엔 지금 화면에 연 층(currentFloor)이 찍혀
                        // 지상1층 부동침하가 "지하1층 주차장"으로 나왔다(2026-09-22)
                        const combinedUrl = renderNdtDisplacementCombinedCanvas(group, group._ndtRealFloorCode || group._ndtFloorCode || floorCode, i + 1);
                        anchorPara = await insertImageParaAfter(anchorPara, combinedUrl, 'ndtDispResultAuto', 42520, GROUP_IMG_MAX_H);
                    }
                };


                // 내화피복 두께 결과표(부재당 플렌지/웨브 2행짜리) — 표 열 구성이 단순 1행/항목이
                // 아니라서(항목 하나 = NO./구분/설계치가 두 행에 걸쳐 세로병합) fillNdtTable을
                // 그대로 못 쓰고 전용 채움 함수를 따로 둔다. 원본 표는 2026-08-24 신설.
                const FIREPROOF_TBL_ID = '504', FIREPROOF_HEADER_ROWS = 1;
                const FIREPROOF_DATA_ROW_H = 2776;
                const fillFireproofTable = (tbl, items) => {
                    const allTrs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl);
                    const oldDataRows = allTrs.slice(FIREPROOF_HEADER_ROWS);
                    if (oldDataRows.length < 2) return;

                    const rowHasCol0 = (tr) => Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).some(tc => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        return addr && addr.getAttribute('colAddr') === '0';
                    });
                    const oldPairs = [];
                    for (let i = 0; i < oldDataRows.length - 1; i++) {
                        if (rowHasCol0(oldDataRows[i])) oldPairs.push([oldDataRows[i], oldDataRows[i + 1]]);
                    }
                    if (oldPairs.length === 0) return;
                    const firstPair = oldPairs[0];
                    const normalPair = oldPairs.length > 2 ? oldPairs[1] : oldPairs[0];
                    const lastPair = oldPairs[oldPairs.length - 1];

                    const borderStyleByColLocal = (row) => {
                        const map = {};
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (addr) map[addr.getAttribute('colAddr')] = tc.getAttribute('borderFillIDRef');
                        });
                        return map;
                    };
                    const styleMapsA = { first: borderStyleByColLocal(firstPair[0]), normal: borderStyleByColLocal(normalPair[0]), last: borderStyleByColLocal(lastPair[0]) };
                    const styleMapsB = { first: borderStyleByColLocal(firstPair[1]), normal: borderStyleByColLocal(normalPair[1]), last: borderStyleByColLocal(lastPair[1]) };

                    const setRowAddr = (row, rowAddr) => {
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (addr) addr.setAttribute('rowAddr', String(rowAddr));
                        });
                    };
                    // 칸이 좁아 넘치면 자간을 줄이지 않고, 넘어가는 위치부터 다음 줄로 넘긴다.
                    const setCellText = (row, colAddr, text) => {
                        const tc = Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).find(t => {
                            const addr = t.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            return addr && addr.getAttribute('colAddr') === String(colAddr);
                        });
                        if (!tc) return null;
                        const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                        const paras = subList ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList) : [];
                        if (paras.length === 0) return null;
                        const fillInfo = fillCellParas(subList, paras, text, tc);
                        return { fillInfo, tc };
                    };
                    // 플렌지/웨브 행(newA/newB)도 다른 NDT 표와 마찬가지로, 표본 행이 물려받은 샘플용
                    // 높이 대신 실제 채워지는 줄 수 기준으로 다시 계산한다(내화피복 표도 같은 문제 보고됨).
                    const fillRowCells = (row, entries) => {
                        let rowMaxLines = 1, rowLineMetric = null;
                        entries.forEach(([colAddr, text]) => {
                            const result = setCellText(row, colAddr, text);
                            if (!result) return;
                            const { fillInfo, tc } = result;
                            if (fillInfo.lineCount > rowMaxLines) rowMaxLines = fillInfo.lineCount;
                            if (!rowLineMetric && fillInfo.vertsize) {
                                const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                                const marginV = marginEl ? (parseInt(marginEl.getAttribute('top'), 10) || 0) + (parseInt(marginEl.getAttribute('bottom'), 10) || 0) : 282;
                                rowLineMetric = { vertsize: fillInfo.vertsize, spacing: fillInfo.spacing, marginV };
                            }
                        });
                        return applyRowHeightFromLines(row, rowMaxLines, rowLineMetric);
                    };
                    const applyBorder = (row, styleMap) => {
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (!addr) return;
                            const bf = styleMap[addr.getAttribute('colAddr')];
                            if (bf !== undefined) tc.setAttribute('borderFillIDRef', bf);
                        });
                    };

                    oldDataRows.forEach(tr => tbl.removeChild(tr));

                    items.forEach((item, idx) => {
                        const which = idx === 0 ? 'first' : (idx === items.length - 1 ? 'last' : 'normal');
                        const [templateA, templateB] = which === 'first' ? firstPair : (which === 'last' ? lastPair : normalPair);
                        const newA = templateA.cloneNode(true);
                        const newB = templateB.cloneNode(true);
                        const rowAddrA = FIREPROOF_HEADER_ROWS + idx * 2;
                        setRowAddr(newA, rowAddrA);
                        setRowAddr(newB, rowAddrA + 1);
                        applyBorder(newA, styleMapsA[which]);
                        applyBorder(newB, styleMapsB[which]);

                        // 템플릿 데이터 행 높이(6559, 약 2.3cm)가 한 줄 글자에 비해 너무 커서 부재 몇 개만 넣어도
                        // 표가 한 쪽을 넘었다(2026-09-22). 다른 결과표(기울기·부재실측, 2776)와 같은 높이로 먼저
                        // 줄여 두고, 글자가 넘치면 fillRowCells가 필요한 만큼 늘린다. 병합 칸은 아래 mergedHeight가 맞춘다.
                        [newA, newB].forEach(row => Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                            if (sz) sz.setAttribute('height', String(FIREPROOF_DATA_ROW_H));
                        }));

                        const fl = item.fpFlange || {};
                        const web = item.fpWeb || {};
                        const flVal = (i) => fl.unavailable ? '-' : ((fl.readings && fl.readings[i] !== undefined) ? fl.readings[i] : '-');
                        const webVal = (i) => web.unavailable ? '-' : ((web.readings && web.readings[i] !== undefined) ? web.readings[i] : '-');
                        const memberAvg = (window.BSA && window.BSA.ndtStats && typeof window.BSA.ndtStats.fireproofMemberAvg === 'function')
                            ? window.BSA.ndtStats.fireproofMemberAvg(item)
                            : (item.fpAvg != null ? item.fpAvg : null);
                        const avgText = (memberAvg == null || !Number.isFinite(Number(memberAvg))) ? '-' : Number(Number(memberAvg).toFixed(2));

                        const heightA = fillRowCells(newA, [
                            [0, item.no || String(idx + 1)],
                            [1, item.location || '-'],
                            [2, '플렌지'],
                            [3, item.fireproofDesign || '-'],
                            [4, flVal(0)],
                            [5, flVal(1)],
                            [6, flVal(2)],
                            [7, avgText],
                            [8, fl.unavailable ? '측정불가' : '-']
                        ]);

                        const heightB = fillRowCells(newB, [
                            [2, '웨브'],
                            [4, webVal(0)],
                            [5, webVal(1)],
                            [6, webVal(2)],
                            [7, avgText],
                            [8, web.unavailable ? '측정불가' : '-']
                        ]);

                        // 평균값은 부재 하나(플렌지·웨브 최대 6개소)의 평균이라 두 행에 같은 값이 찍혔다 —
                        // 설계치 칸처럼 두 행을 한 칸으로 세로 병합한다(2026-09-22 사용자 요청).
                        // 테두리는 같은 쌍의 병합 칸(설계치, 3번 열) 것을 따른다 — 마지막 부재의 굵은 아랫선 포함.
                        const tcAtCol = (row, col) => Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).find(t => {
                            const addr = t.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            return addr && addr.getAttribute('colAddr') === String(col);
                        });
                        const avgTcA = tcAtCol(newA, 7);
                        const avgTcB = tcAtCol(newB, 7);
                        const avgSpanA = avgTcA && avgTcA.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                        if (avgTcA && avgSpanA && avgTcB) {
                            avgSpanA.setAttribute('rowSpan', '2');
                            const designTcA = tcAtCol(newA, 3);
                            if (designTcA && designTcA.getAttribute('borderFillIDRef')) {
                                avgTcA.setAttribute('borderFillIDRef', designTcA.getAttribute('borderFillIDRef'));
                            }
                            newB.removeChild(avgTcB);
                        }

                        // NO./위치/설계치 칸은 플렌지·웨브 두 행에 걸쳐 세로 병합(rowSpan=2)돼 있어
                        // applyRowHeightFromLines가 건드리지 않는다 — 두 행 높이를 합친 값으로 따로
                        // 맞춰줘야 병합 칸만 예전 높이 그대로 남아 두 행을 도로 벌리는 걸 막는다.
                        const mergedHeight = (heightA || 0) + (heightB || 0);
                        if (mergedHeight > 0) {
                            Array.from(newA.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                                const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                                if (!span || parseInt(span.getAttribute('rowSpan'), 10) <= 1) return;
                                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                                if (sz) sz.setAttribute('height', String(mergedHeight));
                            });
                        }

                        Array.from(newA.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);
                        Array.from(newB.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);

                        tbl.appendChild(newA);
                        tbl.appendChild(newB);
                    });
                    tbl.setAttribute('rowCnt', String(FIREPROOF_HEADER_ROWS + items.length * 2));
                };

                const MEASURE_TBL_ID = '2137459237', MEASURE_HEADER_ROWS = 2;
                const STRENGTH_TBL_ID = '2119329126', STRENGTH_HEADER_ROWS = 1;
                const CARB_TBL_ID = '2119328135', CARB_HEADER_ROWS = 1;
                // 외벽기울기/부동침하/부재변위 결과표 3종 — 2026-08-24 템플릿에 새로 추가.
                // 표 열 구성이 3개 다 동일: NO. / 위치 / 전회(기존, 항상 '-') / 금회(측정값) / 길이(또는 높이) / 비율 / 등급.
                const TILT_TBL_ID = '501', TILT_HEADER_ROWS = 2;
                const SETTLEMENT_TBL_ID = '502', SETTLEMENT_HEADER_ROWS = 2;
                const MEMBER_DISP_TBL_ID = '503', MEMBER_DISP_HEADER_ROWS = 2;

                {
                    // 부재실측(단면 규격) 결과표 — 템플릿 표 열 구성: NO. / 위치(+부재명) / 설계치 / 실측치 / 마감상태 / 평가(c%) / 비고(등급).
                    if (measureItemsHwpx.length > 0) {
                        const tbl = findTblById(MEASURE_TBL_ID, ['마감상태', '설계', '실측']);
                        if (tbl) fillNdtTable(tbl, MEASURE_HEADER_ROWS, measureItemsHwpx.map((item, i) => {
                            const designText = formatNdtMeasureDimForOutput(item, 'design', '×');
                            const measuredText = formatNdtMeasureDimForOutput(item, 'measured', '×');
                            const ratioText = (item.sectionRatio !== undefined && item.sectionRatio !== null) ? item.sectionRatio.toFixed(1) + '%' : '-';
                            return [
                                item.no || (i + 1),
                                `${item.location || '위치미지정'}\n(${memberNameOut(item.component) || ''})`,
                                designText,
                                measuredText,
                                item.finishState || '-',
                                ratioText,
                                item.sectionGrade || '-'
                            ];
                        }), true);
                    } else {
                        removeNdtTableById(MEASURE_TBL_ID);
                    }

                    // 내화피복 두께 결과표 — NO./구분/설계치가 플렌지·웨브 두 행에 걸쳐 세로병합.
                    if (fireproofItemsHwpx.length > 0) {
                        const tbl = findTblById(FIREPROOF_TBL_ID, ['부  위', '설계치', '검토결과']);
                        if (tbl) fillFireproofTable(tbl, fireproofItemsHwpx);
                    } else {
                        removeNdtTableById(FIREPROOF_TBL_ID);
                    }

                    if (strengthItemsHwpx.length > 0) {
                        const tbl = findTblById(STRENGTH_TBL_ID);
                        // strengthGrade는 내부 코드값('a_or_b' 등)이라 그대로 찍으면 표에 글자가
                        // 깨진 것처럼 보인다 — 표시용 문구로 바꿔서 넣는다.
                        const strengthGradeDisplay = (code) => code === 'a_or_b' ? 'a/b' : (code || '-');
                        // 강도 항목 하나에 위치 슬롯이 여러 개(최대 3개) 붙을 수 있는데, 예전엔
                        // item.strengthFinal 등 첫 슬롯 결과만 내보내서 2번째/3번째 위치 측정값이
                        // 통째로 표에서 빠졌다 — 슬롯 단위로 행을 펼쳐서 채운다.
                        const strengthRows = [];
                        strengthItemsHwpx.forEach(item => {
                            const slots = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 0
                                ? item.strengthSlots
                                : [{ location: item.location, finalStrength: item.strengthFinal, ratio: item.strengthRatio, grade: item.strengthGrade }];
                            // 슬롯 자체에 계산 결과가 없는(예전 형식) 데이터는 항목(item) 최상위에
                            // 남아있는 첫 슬롯 계산값으로라도 채운다 — 그냥 '-'로 비워두면 실제로는
                            // 측정값이 있는데도 표에는 아무것도 없는 것처럼 보인다.
                            slots.forEach(slot => {
                                const finalStrength = typeof slot.finalStrength === 'number' ? slot.finalStrength : item.strengthFinal;
                                const ratio = slot.ratio != null ? slot.ratio : item.strengthRatio;
                                const grade = slot.grade != null ? slot.grade : item.strengthGrade;
                                strengthRows.push([
                                    strengthRows.length + 1,
                                    `${slot.location || item.location || ''}${memberNameOut(item.component) || ''}`,
                                    item.designStrength != null ? item.designStrength : '-',
                                    typeof finalStrength === 'number' ? finalStrength.toFixed(1) : (finalStrength || '-'),
                                    ratio != null ? `${Math.round(ratio)}%` : '-',
                                    strengthGradeDisplay(grade),
                                    item.damageStatus === '균열발생' ? '균열발생' : '-'
                                ]);
                            });
                        });
                        // 2026-08-24: 템플릿에 남아있던 다른 병원 이름표 칸(NO. 왼쪽의 빈 병합 칸)을
                        // 제거해서 이제 NO.가 표의 실제 0번 칸이 됨 — includeCol0=true로 채운다.
                        if (tbl) fillNdtTable(tbl, STRENGTH_HEADER_ROWS, strengthRows, true);
                    } else {
                        removeNdtTableById(STRENGTH_TBL_ID);
                    }

                    // --- 콘크리트 반발경도 측정 DATA — 표본 문서엔 이 절이 제목만 있고 내용이
                    // 통째로 비어 있었다. 2026-09-04부터: 사용자가 R값 스캔에 쓴 실제 측정지 사진을
                    // (전경사진과 같은 방식으로 IndexedDB/클라우드에 저장해두었다가) 참고 양식처럼
                    // 위치(NO.) 최대 3개를 한 표에 가로로 나란히 넣는다. 사진을 아직 저장 안 해둔
                    // (이 기능 이전에 입력한) 위치만 원시 R값을 캔버스로 그려 사진 대신 넣는다.
                    {
                        const allParasForData = secChildren();
                        const dataHeadingPara = allParasForData.find(p => paraText(p).includes('반발경도 측정 DATA'));
                        const dataStopPara = allParasForData.find(p => paraText(p).includes('반발경도 성과표'));
                        if (dataHeadingPara && dataStopPara) {
                            const headingIdx = allParasForData.indexOf(dataHeadingPara);
                            const dataPoints = [];
                            strengthItemsHwpx.forEach(item => {
                                const slots = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 0
                                    ? item.strengthSlots
                                    : [{ location: item.location, readings: [], photoId: null }];
                                slots.forEach(slot => {
                                    const readings = (slot.readings || []).filter(v => v !== '' && v !== null && v !== undefined);
                                    if (readings.length === 0 && !slot.photoId) return;
                                    dataPoints.push({
                                        location: slot.location || item.location || '',
                                        component: memberNameOut(item.component) || '',
                                        readings,
                                        photoId: slot.photoId || null,
                                        bldgId: item._ndtBldgId
                                    });
                                });
                            });
                            if (dataPoints.length > 0) {
                                dataPoints.forEach((pt, i) => { pt.seq = i + 1; });
                                if (allParasForData.indexOf(dataStopPara) > headingIdx + 1) {
                                    removeParaRange(allParasForData[headingIdx + 1], dataStopPara);
                                }

                                // 위치(NO.) 최대 3개를 한 표에 담는다(라벨칸 1 + (NO.칸+사진칸) × 최대
                                // 3쌍 = 최대 7칸, 사용자가 직접 한글로 만들어 보내준 정상 예시와 동일한
                                // 구조). 4개 이상이면 표를 새로 만들어 바로 아래에 이어붙이되, 그 예시처럼
                                // 표 사이에 강제 페이지분할을 넣지 않아 공간이 되면 한 페이지에 이어진다.
                                const PHOTO_W = 7787, TOTAL_H = 9365 * 3;
                                const photoMaxW = PHOTO_W - 141 - 141;
                                const photoMaxH = TOTAL_H - 141 - 141;
                                const boxAspect = photoMaxW / photoMaxH;
                                // 각 포인트의 "사진"을 미리 준비한다 — 실제 저장된 측정지 사진이
                                // 있으면 그걸, 없으면 원시 R값 캔버스를(칸 비율에 맞춰) 대신 그려서
                                // 똑같이 사진 취급으로 표 안에 넣는다.
                                for (const pt of dataPoints) {
                                    const photoUrl = pt.photoId ? await loadStrengthPhotoDataUrl(pt.bldgId || bldg.id, pt.photoId) : null;
                                    if (photoUrl) {
                                        const size = await loadImageSize(photoUrl);
                                        pt._imgUrl = photoUrl;
                                        pt._imgW = size.w;
                                        pt._imgH = size.h;
                                    } else {
                                        const canvas = renderStrengthDataRowCanvas(pt, boxAspect);
                                        pt._imgUrl = canvas.toDataURL('image/png');
                                        pt._imgW = canvas.width;
                                        pt._imgH = canvas.height;
                                    }
                                    const nums = pt.readings.map(v => parseFloat(v)).filter(v => !isNaN(v));
                                    pt._avgText = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '-';
                                    imgCounter++;
                                    pt._picId = String(9110000 + imgCounter);
                                    pt._picInstId = String(9120000 + imgCounter);
                                    pt._imgId = `strengthDataImg${imgCounter}`;
                                }

                                // 이 표 전용 테두리 스타일(굵은 가장자리+라벨 그라데이션)을 header.xml에
                                // 한 번만 추가하고, 이후 표들은 전부 이 id들을 재사용한다.
                                if (!hwpxHeaderText) hwpxHeaderText = await zip.file('Contents/header.xml').async('string');
                                const strengthBorders = injectStrengthDataBorderFills(hwpxHeaderText);
                                hwpxHeaderText = strengthBorders.header;
                                hwpxHeaderDirty = true;
                                const strengthBorderIds = strengthBorders.ids;

                                let dataAnchor = dataHeadingPara;
                                for (let i = 0; i < dataPoints.length; i += 3) {
                                    const group = dataPoints.slice(i, i + 3);
                                    imgCounter++;
                                    const tblId = String(9100000 + imgCounter);
                                    const xml = buildStrengthPhotoRowGroupXml(group, tblId, strengthBorderIds);
                                    const doc = new DOMParser().parseFromString(`<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${xml}</root>`, 'application/xml');
                                    const newPara = xmlDoc.importNode(doc.documentElement.firstChild, true);
                                    dataAnchor.parentNode.insertBefore(newPara, dataAnchor.nextSibling);
                                    dataAnchor = newPara;

                                    // 라벨(구분/위치/평균경도)·NO./위치/평균경도 텍스트를 채우고,
                                    // 사진(또는 대체 캔버스)들을 순서대로 이 표의 hp:pic들에 꽂는다.
                                    const tbl = newPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
                                    const pics = newPara.getElementsByTagNameNS(HP_NS, 'pic');
                                    setTcText(tcAtAddr(tbl, 0, 0), '구  분');
                                    setTcText(tcAtAddr(tbl, 0, 1), '위  치');
                                    setTcText(tcAtAddr(tbl, 0, 2), '평균 경도');
                                    for (let idx = 0; idx < group.length; idx++) {
                                        const pt = group[idx];
                                        try {
                                            const noCol = 1 + idx * 2;
                                            setTcText(tcAtAddr(tbl, noCol, 0), `NO. ${pt.seq}`);
                                            setTcText(tcAtAddr(tbl, noCol, 1), [pt.location, memberNameOut(pt.component)].filter(Boolean).join(' ') || '-');
                                            setTcText(tcAtAddr(tbl, noCol, 2), pt._avgText);
                                            const pic = pics[idx];
                                            const { bytes, mime, ext } = await dataUrlToBytes(pt._imgUrl);
                                            zip.file(`BinData/${pt._imgId}.${ext}`, bytes);
                                            manifestAdds.push(`<opf:item id="${pt._imgId}" href="BinData/${pt._imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                                            setPicImage(pic, pt._imgId, pt._imgW, pt._imgH, photoMaxW, photoMaxH);
                                        } catch (e) {
                                            console.error('반발경도 측정 DATA 표 채우기 실패 (NO.' + pt.seq + '):', e);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // --- 콘크리트 반발경도 성과표(7.1.2.3) — 표본 문서엔 다른 회사의 실측 데이터를
                    // 찍은 정적 그림(WMF)이 그대로 박혀 있어서, 그동안 어느 건물을 내보내든 항상 그
                    // 남의 데이터가 그대로 나갔다. 제목 문단 바로 다음에 이어지는 그림 문단들을 전부
                    // 걷어내고, NO.(위치 슬롯)별로 반발치·보정·압축강도·막대그래프를 캔버스로 그려
                    // 그 자리에 하나씩 새로 넣는다.
                    {
                        const allParasForPerf = secChildren();
                        const perfHeadingPara = allParasForPerf.find(p => paraText(p).includes('반발경도 성과표'));
                        if (perfHeadingPara) {
                            const headingIdx = allParasForPerf.indexOf(perfHeadingPara);
                            const picParas = [];
                            for (let i = headingIdx + 1; i < allParasForPerf.length; i++) {
                                if (allParasForPerf[i].getElementsByTagNameNS(HP_NS, 'pic').length > 0) {
                                    picParas.push(allParasForPerf[i]);
                                } else {
                                    break;
                                }
                            }
                            if (picParas.length > 0) {
                                const stopNode = allParasForPerf[headingIdx + 1 + picParas.length] || null;
                                removeParaRange(picParas[0], stopNode);

                                const perfPoints = [];
                                strengthItemsHwpx.forEach(item => {
                                    const slots = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 0
                                        ? item.strengthSlots
                                        : [{ location: item.location, readings: [] }];
                                    slots.forEach(slot => perfPoints.push({ item, slot }));
                                });

                                // 재령일은 항목마다(이 항목 직접 입력 > 건물 공통 > 준공일 자동) — resolveStrengthAgeInfo
                                const perfCanvases = [];
                                const perfEnabledNames = getEnabledStrengthFormulaNames(bldg);
                                for (let seq = 0; seq < perfPoints.length; seq++) {
                                    const pt = perfPoints[seq];
                                    const readings = (pt.slot.readings || []).filter(v => v !== '' && v !== null && v !== undefined);
                                    if (readings.length === 0) continue;
                                    const calc = calcConcreteStrength(readings, parseFloat(pt.item.strengthAngle), resolveStrengthAgeInfo(pt.item, ndtBldgOf(pt.item)).days, perfEnabledNames, getStrengthAnvilAvg(bldg));
                                    if (!calc) continue;
                                    perfCanvases.push(renderStrengthPerfPointCanvas(seq + 1, pt.item, pt.slot, readings, calc));
                                }

                                // 2026-09-22 사용자 요청: NO.마다 따로 떠 있던 그림(글자처럼 취급 아님)을, 한 쪽에 들어가는
                                // NO.끼리 그림 한 장으로 이어 붙여 "글자처럼 취급"으로 넣는다(쪽마다 한 덩어리).
                                // 한 쪽 개수 = 문서 본문 높이(쪽 높이 - 위·아래·머리말·꼬리말 여백) ÷ NO. 한 칸 높이.
                                const PERF_IMG_W = 42520;
                                const PERF_GAP_PX = 24;
                                const pagePrEl = xmlDoc.getElementsByTagNameNS(HP_NS, 'pagePr')[0];
                                const marginEl = xmlDoc.getElementsByTagNameNS(HP_NS, 'margin')[0];
                                const attrNum = (el, k, d) => { const v = el ? parseInt(el.getAttribute(k), 10) : NaN; return Number.isFinite(v) ? v : d; };
                                const bodyH = attrNum(pagePrEl, 'height', 83340)
                                    - attrNum(marginEl, 'top', 5669) - attrNum(marginEl, 'bottom', 4252)
                                    - attrNum(marginEl, 'header', 4331) - attrNum(marginEl, 'footer', 4252);
                                const perPage = perfCanvases.length
                                    ? getStrengthPerfPerPage(bodyH, PERF_IMG_W, perfCanvases[0].width, perfCanvases[0].height, PERF_GAP_PX)
                                    : 1;
                                let perfAnchor = perfHeadingPara;
                                // 마지막 쪽 그림 맨 밑에 적용 추정식(1식/2식…)을 붙인다. 그 쪽이 꽉 차 있으면 넘치지
                                // 않게 본문 높이에 맞춰 그 장만 조금 줄어든다(2026-10-14 사용자 요청).
                                for (let i = 0; i < perfCanvases.length; i += perPage) {
                                    const isLastPage = i + perPage >= perfCanvases.length;
                                    const pageParts = perfCanvases.slice(i, i + perPage);
                                    if (isLastPage) pageParts.push(renderStrengthPerfLegendCanvas(perfEnabledNames));
                                    const pageCanvas = stackCanvasesVertically(pageParts, PERF_GAP_PX);
                                    perfAnchor = await insertImageParaAfter(perfAnchor, pageCanvas.toDataURL('image/png'), 'strengthPerfAuto', PERF_IMG_W, isLastPage ? bodyH - 1500 : 999999999);
                                }
                            }
                        }
                    }

                    if (strengthItemsHwpx.length === 0) {
                        const parasStrip = secChildren();
                        const dataH = parasStrip.find(p => paraText(p).includes('반발경도 측정 DATA'));
                        const perfH = parasStrip.find(p => paraText(p).includes('반발경도 성과표'));
                        const start = dataH || perfH;
                        if (start) {
                            const startIdx = parasStrip.indexOf(start);
                            let endIdx = startIdx + 1;
                            while (endIdx < parasStrip.length) {
                                const p = parasStrip[endIdx];
                                const t = paraText(p).trim();
                                const hasPic = p.getElementsByTagNameNS(HP_NS, 'pic').length > 0;
                                const hasTbl = p.getElementsByTagNameNS(HP_NS, 'tbl').length > 0;
                                if (!hasPic && !hasTbl && t && t.indexOf('반발경도') < 0) break;
                                endIdx++;
                            }
                            removeParaRange(start, parasStrip[endIdx] || null);
                        }
                    }

                    if (carbItemsHwpx.length > 0) {
                        const tbl = findTblById(CARB_TBL_ID);
                        if (tbl) fillNdtTable(tbl, CARB_HEADER_ROWS, carbItemsHwpx.map((item, i) => [
                            item.no || (i + 1),
                            `${item.location || ''}${memberNameOut(item.component) || ''}`,
                            item.carbDepth != null ? item.carbDepth : '-',
                            item.carbCover != null ? item.carbCover : '-',
                            typeof item.carbRemainMm === 'number' ? item.carbRemainMm.toFixed(2) : '-',
                            typeof item.carbRate === 'number' ? item.carbRate.toFixed(2) : '-',
                            typeof item.carbLifeYears === 'number' ? Math.round(item.carbLifeYears) : '-',
                            typeof item.carbRemainingLifeYears === 'number' ? Math.round(item.carbRemainingLifeYears) : '-',
                            item.carbAgeDays != null ? `약 ${Math.round(item.carbAgeDays / 365)}년` : '-',
                            '-'
                        ]), true);
                    } else {
                        removeNdtTableById(CARB_TBL_ID);
                    }

                    // 3개 표 모두 열 순서 동일(2026-08-24 사용자 요청으로 재배치):
                    // NO. / 위치 / 길이·높이 / 전회(항상 '-') / 금회 / 비율 / 등급. 단위는 전부 mm로 통일.
                    if (tiltItemsHwpx.length > 0) {
                        const tbl = findTblById(TILT_TBL_ID, ['높   이(H)', '전   회']);
                        if (tbl) fillNdtTable(tbl, TILT_HEADER_ROWS, tiltItemsHwpx.map((item, i) => {
                            const hDigits = String(item.height || '').replace(/[^0-9.]/g, '');
                            const hNum = parseFloat(hDigits);
                            const heightText = Number.isFinite(hNum) ? `${hNum.toLocaleString()}mm` : '-';
                            const avgDigits = (item.avgValue || '').toString().replace(/[^0-9.-]/g, '');
                            const avgNum = parseFloat(avgDigits);
                            const avgText = Number.isFinite(avgNum) ? `${avgNum}mm` : '-';
                            const delta = Math.abs(avgNum || 0);
                            const calc = (Number.isFinite(hNum) && hNum > 0 && delta > 0)
                                ? calcTiltGrade(hNum, delta)
                                : { tiltRatio: '', grade: '' };
                            return [item.no || (i + 1), item.location || '-', heightText, '-', avgText, item.tiltRatio || calc.tiltRatio || '-', item.grade || calc.grade || '-'];
                        }), true);
                        if (tbl) sortHwpxRowCellsByColAddr(tbl, HP_NS);
                    } else {
                        removeNdtTableById(TILT_TBL_ID);
                    }

                    // 부동침하/부재변위는 2026-08-24부터 템플릿에 별도 표 2개로 분리 — 이전엔 표가
                    // 하나뿐이라 두 그룹을 합쳐서 한 표에 담았지만, 이제 각자 자기 표에 채운다.
                    if (settlementGroupsHwpx.length > 0) {
                        const tbl = findTblById(SETTLEMENT_TBL_ID, ['변  위  량', '기   존']);
                        if (tbl) fillNdtTable(tbl, SETTLEMENT_HEADER_ROWS, settlementGroupsHwpx.map((group, i) => {
                            const calc = calcGroupDisplacement(group);
                            const fmt = formatDispCalcForExport(calc);
                            const lengthMmText = group.measureLength ? `${(group.measureLength * 1000).toLocaleString()}mm` : '-';
                            return [i + 1, group.locationType || '-', lengthMmText, '-', fmt.deltaCm, fmt.tiltRatio, fmt.grade];
                        }), true);
                        if (tbl) sortHwpxRowCellsByColAddr(tbl, HP_NS);
                        // 2026-08-24: 결과표 밑에 그룹별 요약박스+꺾은선 그래프를 한 쌍씩 이어붙임(사용자 요청).
                        if (tbl) await insertGroupResultImages(tbl, settlementGroupsHwpx);
                    } else {
                        removeNdtTableById(SETTLEMENT_TBL_ID);
                    }

                    if (memberDispGroupsHwpx.length > 0) {
                        const tbl = findTblById(MEMBER_DISP_TBL_ID, ['처  짐  량', '기   존']);
                        if (tbl) fillNdtTable(tbl, MEMBER_DISP_HEADER_ROWS, memberDispGroupsHwpx.map((group, i) => {
                            const calc = calcGroupDisplacement(group);
                            const fmt = formatDispCalcForExport(calc);
                            const lengthMmText = group.measureLength ? `${(group.measureLength * 1000).toLocaleString()}mm` : '-';
                            return [i + 1, group.locationType || '-', lengthMmText, '-', fmt.deltaCm, fmt.tiltRatio, fmt.grade];
                        }), true);
                        if (tbl) sortHwpxRowCellsByColAddr(tbl, HP_NS);
                        if (tbl) await insertGroupResultImages(tbl, memberDispGroupsHwpx);
                    } else {
                        removeNdtTableById(MEMBER_DISP_TBL_ID);
                    }

                    // ---- 위치도 일괄 삽입 ----
                    // "비파괴 장비조사 위치도" 섹션의 표본 내용(다른 병원 위치도, 못 채우던 부재실측/
                    // 내화피복 위치도 등)을 통째로 비우고, 실제로 채운 위치도만 사용자가 요청한 순서
                    // (부재실측 → 강도/탄산화 → 내화피복 → 외벽기울기 → 부동침하 → 부재변위)로 모든
                    // 비파괴조사 결과표가 다 끝난 이 자리에 새로 만들어 넣는다. 2026-08-25부터: 결과표
                    // 바로 옆(표마다 따로)이 아니라 전부 이렇게 한곳에 모아서 넣는 방식으로 바뀜.
                    {
                        // "비파괴 장비조사 위치도"(상위 섹션 제목)와 "비파괴 장비조사 사진첩" 문단은
                        // 과거 어느 시점(한글 재저장/KS병원 잔재 정리 등)에 이미 삭제되고 없다 —
                        // 처음에 이 코드는 그 두 문단을 기준으로 구간을 찾으려 했는데 실제로는 항상
                        // 못 찾아 조용히 아무 일도 안 하고 있었다(위치도가 하나도 안 나오던 원인).
                        // 대신 실제로 남아있는 걸 직접 확인한 항목들 — 부재실측/내화피복/변위조사
                        // 소제목 3개, 정체불명의 "부재실측" 단독 문단, 강도·탄산화용 옛 위치도 표
                        // (id=2137459495, 우리가 더는 안 씀) — 을 문단 참조로 직접 찾아서 지운다.
                        const all = secChildren();
                        const ndtMapsApi = (window.BSA && window.BSA.shared && window.BSA.shared.hwpxNdtMaps) || null;
                        const headingHas = (p, needle) => {
                            if (!p || p.getElementsByTagNameNS(HP_NS, 'tbl').length > 0) return false;
                            const t = paraText(p).trim();
                            if (ndtMapsApi && typeof ndtMapsApi.headingContains === 'function') {
                                return ndtMapsApi.headingContains(t, needle);
                            }
                            return t === needle || t.indexOf(needle) >= 0;
                        };
                        const findHeading = (text) => all.find(p => headingHas(p, text));
                        const measureHeadingPara = findHeading('부재실측 위치도');
                        const strengthCarbHeadingPara = all.find(p => headingHas(p, '비파괴 장비조사 위치도'));
                        const fireproofHeadingPara = findHeading('내화피복 측정 위치도');
                        const dispHeadingPara = findHeading('변위조사 위치도') || findHeading('변위측정 위치도');
                        const bareMeasurePara = all.find(p => paraText(p).replace(/\s+/g, '') === '부재실측');
                        // "내화피복 측정 위치도"/"변위조사 위치도" 바로 뒤에, 옛 문서 구조에서 쓰던
                        // "콘크리트 강도측정"/"콘크리트 탄산화 시험"/"변위측정" 소제목 3개가 내용 없이
                        // 문단만 그대로 남아있었다(사용자가 실제 한글에서 열어 확인) — 위 5개와 같은
                        // 방식으로 찾아서 같이 지운다.
                        // 이 잔재 3개는 부분일치로 찾으면 안 된다 — 공백을 무시하고 보면
                        // '콘크리트강도측정'이 '비파괴장비조사위치도(콘크리트강도측정및탄산화측정)'
                        // 안에 들어있어서, 살려 써야 할 위치도 제목이 잡힌다. 정확히 같은 문단만 찾는다.
                        const findExactPara = (text) => {
                            const want = String(text).replace(/\s+/g, '');
                            return all.find(p => p.getElementsByTagNameNS(HP_NS, 'tbl').length === 0
                                && paraText(p).replace(/\s+/g, '') === want);
                        };
                        const strengthBareHeadingPara = findExactPara('콘크리트 강도측정');
                        const carbBareHeadingPara = findExactPara('콘크리트 탄산화 시험');
                        const dispBareHeadingPara = findExactPara('변위측정');
                        const oldStrengthCarbTbl = findTblById('2137459495');
                        let oldStrengthCarbTblPara = oldStrengthCarbTbl;
                        while (oldStrengthCarbTblPara && oldStrengthCarbTblPara.localName !== 'p') oldStrengthCarbTblPara = oldStrengthCarbTblPara.parentNode;

                        // 삽입 지점: 원래 이 소제목들이 있던 바로 그 자리(부재실측 위치도 바로 앞
                        // 문단)를 그대로 이어받는다 — 지우기 전에 먼저 찾아둬야 한다.
                        const mapHeadingCandidates = [
                            measureHeadingPara, strengthCarbHeadingPara, fireproofHeadingPara, dispHeadingPara
                        ].filter(Boolean);
                        // 위 4개는 템플릿의 개요번호 제목 문단이라 한글이 "7.1.6. 부재실측 위치도"처럼
                        // 번호를 자동으로 붙여 준다. 지우지 말고 살려서 그 아래에 위치도를 넣는다.
                        // (위치도가 하나도 안 들어간 제목만 나중에 개별적으로 지운다)
                        const headingsToRemove = [
                            oldStrengthCarbTblPara, bareMeasurePara,
                            strengthBareHeadingPara, carbBareHeadingPara, dispBareHeadingPara
                        ].filter(p => p && mapHeadingCandidates.indexOf(p) < 0);
                        let mapInsertAfter = null;
                        if (mapHeadingCandidates.length > 0) {
                            const first = mapHeadingCandidates.reduce((a, b) => {
                                const ia = all.indexOf(a);
                                const ib = all.indexOf(b);
                                return (ia >= 0 && (ib < 0 || ia < ib)) ? a : b;
                            });
                            mapInsertAfter = first ? first.previousElementSibling : null;
                            while (mapInsertAfter && headingsToRemove.indexOf(mapInsertAfter) >= 0) {
                                mapInsertAfter = mapInsertAfter.previousElementSibling;
                            }
                        }
                        const albumOrSurvey = all.find(p => {
                            const t = paraText(p).trim();
                            return t.indexOf('비파괴 장비조사 사진첩') >= 0 || /^주요 상태조사표/.test(t);
                        });
                        if (!mapInsertAfter && albumOrSurvey) {
                            mapInsertAfter = albumOrSurvey.previousElementSibling;
                            while (mapInsertAfter && headingsToRemove.indexOf(mapInsertAfter) >= 0) {
                                mapInsertAfter = mapInsertAfter.previousElementSibling;
                            }
                        }
                        if (!mapInsertAfter) {
                            const tbls = xmlDoc.getElementsByTagNameNS(HP_NS, 'tbl');
                            const albumIdx = albumOrSurvey ? all.indexOf(albumOrSurvey) : -1;
                            for (let i = 0; i < tbls.length; i++) {
                                let p = tbls[i];
                                while (p && p.localName !== 'p') p = p.parentNode;
                                if (!(p && p.parentNode === sec)) continue;
                                if (albumIdx >= 0) {
                                    const pi = all.indexOf(p);
                                    if (pi < 0 || pi >= albumIdx) continue;
                                }
                                mapInsertAfter = p;
                            }
                        }

                        headingsToRemove.forEach(p => { if (p && p.parentNode) p.parentNode.removeChild(p); });

                        const mapFlags = {
                            measure: measureItemsHwpx.length > 0,
                            strength: strengthItemsHwpx.length > 0,
                            strengthCarb: strengthItemsHwpx.length > 0 || carbItemsHwpx.length > 0,
                            carb: carbItemsHwpx.length > 0,
                            fireproof: fireproofItemsHwpx.length > 0,
                            tilt: tiltItemsHwpx.length > 0,
                            settlement: settlementGroupsHwpx.length > 0,
                            memberDisp: memberDispGroupsHwpx.length > 0
                        };
                        if (ndtMapsApi && typeof ndtMapsApi.shouldDropEmptyHeading === 'function') {
                            secChildren().slice().forEach(p => {
                                if (!p || p === mapInsertAfter || p === albumOrSurvey) return;
                                if (p.getElementsByTagNameNS(HP_NS, 'tbl').length > 0) return;
                                if (p.getElementsByTagNameNS(HP_NS, 'pic').length > 0) return;
                                const t = paraText(p).trim();
                                if (!t) return;
                                if (ndtMapsApi.shouldDropEmptyHeading(t, mapFlags) && p.parentNode) {
                                    p.parentNode.removeChild(p);
                                }
                            });
                        }

                        {
                            // 결함위치도(fillLocationMapForFloor)와 똑같이 표(2행짜리: 위=그림칸,
                            // 아래=캡션칸) 안에 그림을 넣는다 — 헤딩 문단 따로 + 그림 따로가 아니라
                            // 표 하나가 그림+캡션을 같이 들고 있어서 테두리가 있고 칸을 꽉 채운다.
                            // XML은 실제 결함위치도 표(id=1122472099)를 그대로 본떴다.
                            const LOC_MAP_TBL_PARA_XML = '<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:tbl id="TBL_ID" zOrder="11" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="1" rowCnt="2" colCnt="1" cellSpacing="0" borderFillIDRef="5" noAdjust="0"><hp:sz width="41821" widthRelTo="ABSOLUTE" height="64087" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="140" right="140" top="140" bottom="140"/><hp:inMargin left="140" right="140" top="140" bottom="140"/><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="15"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="6"><hp:pic id="PIC_ID" zOrder="36" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" thumbnailBinIDRef="" href="" groupLevel="0" instid="PIC_INSTID" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="768540" height="969540"/><hp:curSz width="41541" height="52405"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="20770" centerY="26202" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.054052" e2="0" e3="0" e4="0" e5="0.054051" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="768540" y="0"/><hc:pt2 x="768540" y="969540"/><hc:pt3 x="0" y="969540"/></hp:imgRect><hp:imgClip left="0" right="648540" top="0" bottom="818100"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="648540" dimheight="818100"/><hp:effects/><hp:sz width="41541" widthRelTo="ABSOLUTE" height="52405" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="1320" horzpos="0" horzsize="0" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="60813"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="16"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="1" styleIDRef="16" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="43"><hp:t>CAPTION</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="3274"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="64367" textheight="64367" baseline="54712" spacing="960" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>';
                            // 표 칸(cellSz) - 안쪽 여백(cellMargin) = 그림이 실제로 채울 수 있는 최대
                            // 크기(fillLocationMapForFloor와 동일한 계산, 표를 고정 크기로 새로 만들기
                            // 때문에 매번 다시 계산할 필요 없이 미리 값을 넣어둠).
                            const LOC_MAP_MAX_W = 41821 - 141 - 141;
                            const LOC_MAP_MAX_H = 60813 - 141 - 141;

                            let mapAnchor = mapInsertAfter;
                            const mapInsertBefore = (!mapAnchor && albumOrSurvey) ? albumOrSurvey : null;
                            const escapeHwpxText = (s) => String(s || '')
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;');
                            // anchorOverride: 이 위치도가 붙을 제목 문단(또는 같은 제목 아래 앞 위치도).
                            // keepWithAnchor: 표 높이가 거의 한 쪽이라, 제목 바로 아래 첫 장만 쪽 나눔을
                            // 끄고 제목과 같은 쪽에 붙인다(제목만 앞 쪽에 남는 것 방지).
                            const appendLocationMap = async (label, category, imgIdPrefix, floorForMap, anchorOverride, keepWithAnchor) => {
                                const mapDataUrl = await renderHwpxNdtMap(floorForMap, category);
                                if (!mapDataUrl) {
                                    console.warn('NDT 위치도 렌더 실패:', floorForMap, category);
                                    return null;
                                }
                                imgCounter++;
                                const xml = LOC_MAP_TBL_PARA_XML
                                    .replace('TBL_ID', String(8600000 + imgCounter))
                                    .replace('PIC_ID', String(8700000 + imgCounter))
                                    .replace('PIC_INSTID', String(8800000 + imgCounter))
                                    .replace('CAPTION', escapeHwpxText(label));
                                const doc = new DOMParser().parseFromString(`<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${xml}</root>`, 'application/xml');
                                const newPara = xmlDoc.importNode(doc.documentElement.firstChild, true);
                                newPara.setAttribute('pageBreak', keepWithAnchor ? '0' : '1');
                                const anchor = (anchorOverride && anchorOverride.parentNode) ? anchorOverride : mapAnchor;
                                if (anchor && anchor.parentNode) {
                                    anchor.parentNode.insertBefore(newPara, anchor.nextSibling);
                                } else if (mapInsertBefore && mapInsertBefore.parentNode) {
                                    mapInsertBefore.parentNode.insertBefore(newPara, mapInsertBefore);
                                } else if (sec) {
                                    sec.appendChild(newPara);
                                } else {
                                    return null;
                                }
                                mapAnchor = newPara;

                                const pic = newPara.getElementsByTagNameNS(HP_NS, 'pic')[0];
                                const { bytes, mime, ext } = await dataUrlToBytes(mapDataUrl);
                                const size = await loadImageSize(mapDataUrl);
                                const imgId = `${imgIdPrefix}${imgCounter}`;
                                zip.file(`BinData/${imgId}.${ext}`, bytes);
                                manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                                setPicImage(pic, imgId, size.w, size.h, LOC_MAP_MAX_W, LOC_MAP_MAX_H);
                                return newPara;
                            };

                            const locMapInserts = (ndtMapsApi && typeof ndtMapsApi.expandLocationMapInserts === 'function')
                                ? ndtMapsApi.expandLocationMapInserts(
                                    mapFlags,
                                    allNdtItemsForHwpx,
                                    allDispGroupsForHwpx,
                                    floorCode,
                                    (fc) => {
                                        try { return stripFloorCodeSuffix(getFloorLabel(fc)); } catch (_e) { return fc; }
                                    }
                                )
                                : [];
                            if (locMapInserts.length === 0) {
                                // 모듈을 못 불러온 경우의 대비책. 번호는 아래에서 [도면 7-N]으로 매기므로
                                // 여기서는 제목만 넣는다(캡션에 7.1.8 같은 번호를 미리 박지 않는다).
                                if (mapFlags.measure) locMapInserts.push({ title: '부재실측 위치도', category: '실측', imgIdPrefix: 'ndtLocMapMeasure', floorCode });
                                if (mapFlags.strengthCarb) locMapInserts.push({ title: '비파괴장비조사 위치도', category: '일반비파괴', imgIdPrefix: 'ndtLocMapStrengthCarb', floorCode });
                                if (mapFlags.fireproof) locMapInserts.push({ title: '내화피복 측정 위치도', category: '내화피복', imgIdPrefix: 'ndtLocMapFireproof', floorCode });
                                if (mapFlags.tilt) locMapInserts.push({ title: '외벽 기울기 측정 위치도', category: '기울기', imgIdPrefix: 'ndtLocMapTilt', floorCode });
                                if (mapFlags.settlement) locMapInserts.push({ title: '부동침하 기울기 측정 위치도', category: '변위', imgIdPrefix: 'ndtLocMapSettlement', floorCode });
                                if (mapFlags.memberDisp) locMapInserts.push({ title: '변위측정 위치도', category: '부재변위', imgIdPrefix: 'ndtLocMapMemberDisp', floorCode });
                            }
                            // 위치도를 템플릿 제목 문단별로 나눠 각 제목 바로 아래에 넣는다.
                            // 번호는 캡션에 직접 쓰지 않고 표시만 붙여 두었다가, 문서를 다 만든 뒤
                            // numberHwpxFigureCaptions가 결함위치도와 이어서 [도면 7-N]으로 매긴다.
                            const headingForCategory = (cat) => {
                                if (cat === '실측') return measureHeadingPara;
                                if (cat === '일반비파괴') return strengthCarbHeadingPara;
                                if (cat === '내화피복') return fireproofHeadingPara;
                                return dispHeadingPara; // 기울기·부동침하·부재변위는 "변위조사 위치도" 아래로
                            };
                            const lastParaUnderHeading = new Map();
                            for (const job of locMapInserts) {
                                const heading = headingForCategory(job.category);
                                const usable = (heading && heading.parentNode) ? heading : null;
                                const prev = usable ? lastParaUnderHeading.get(usable) : null;
                                const title = job.title || job.caption || '';
                                const label = (job.manyFloors && job.floorLabel)
                                    ? `${job.floorLabel} ${title}`
                                    : title;
                                const inserted = await appendLocationMap(
                                    HWPX_FIG_MARK + label,
                                    job.category,
                                    job.imgIdPrefix,
                                    job.floorCode || floorCode,
                                    prev || usable,
                                    // 제목 바로 아래 첫 장만 제목과 같은 쪽에 붙인다
                                    !!(usable && !prev)
                                );
                                if (inserted && usable) lastParaUnderHeading.set(usable, inserted);
                            }
                            // ---- 비파괴 장비조사 사진첩 (2026-09-28) ----
                            // 위치도 묶음 바로 뒤에. 3종 사진 표(사진N + 내용)는 위치 칸이 없어 내용 칸에
                            // "위치 · 항목"을 같이 적는다. 표·문단 틀은 3종 결함 사진첩과 같은 것을 쓴다.
                            try {
                                const albumSections = (ndtMapsApi && typeof ndtMapsApi.buildPhotoAlbumSections === 'function')
                                    ? ndtMapsApi.buildPhotoAlbumSections(allNdtItemsForHwpx, allDispGroupsForHwpx)
                                    : [];
                                const albumHeadingSrc = measureHeadingPara || strengthCarbHeadingPara || fireproofHeadingPara || dispHeadingPara;
                                if (albumSections.length && albumHeadingSrc && grade3GlobalPhotoTblStamp && grade3GlobalPhotoParaStamp) {
                                    if (typeof window.updateLoadingText === 'function') {
                                        window.updateLoadingText('한글(hwpx) 비파괴 장비조사 사진첩 생성 중...');
                                    }
                                    const albumDonorPic = findGrade3PhotoDonorPic();
                                    let albumMaxW = 0;
                                    let albumMaxH = 0;
                                    const tplPics = grade3GlobalPhotoTblStamp.getElementsByTagNameNS(HP_NS, 'pic');
                                    if (tplPics.length) {
                                        albumMaxW = parseInt(tplPics[0].getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('width'), 10) || 0;
                                        albumMaxH = parseInt(tplPics[0].getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('height'), 10) || 0;
                                    }
                                    if (!tplPics.length && !albumDonorPic) throw new Error('사진첩 표에 사진 칸이 없고 복제할 사진도 없습니다.');
                                    const decodeAlbumPhoto = async (entry) => {
                                        if (!entry) return null;
                                        try {
                                            const url = await loadStrengthPhotoDataUrl(entry.bldgId || ndtBldgId, entry.photoId);
                                            if (!url) return null;
                                            const { bytes, mime, ext } = await dataUrlToBytes(url);
                                            const size = await loadImageNaturalSizeFromBytes(bytes, mime);
                                            return { entry, bytes, mime, ext, w: size.w, h: size.h };
                                        } catch (onePhotoErr) {
                                            console.warn('비파괴 사진 1장 임베드 실패(해당 컷만 생략):', entry.photoId, onePhotoErr);
                                            return null;
                                        }
                                    };
                                    const album = await insertHwpxNdtPhotoAlbum({
                                        hpNs: HP_NS,
                                        sections: albumSections,
                                        anchorPara: (mapAnchor && mapAnchor.parentNode) ? mapAnchor
                                            : (mapInsertBefore ? mapInsertBefore.previousElementSibling : null),
                                        headingStamp: albumHeadingSrc,
                                        subHeadingStamp: ndtAlbumSubHeadingStamp,
                                        photoParaStamp: grade3GlobalPhotoParaStamp,
                                        ensureTblTreatAsChar,
                                        buildPairTbl: async (e1, e2) => {
                                            let s1 = await decodeAlbumPhoto(e1);
                                            let s2 = await decodeAlbumPhoto(e2);
                                            if (!s1) { s1 = s2; s2 = null; }
                                            if (!s1) return null;
                                            photoTblCounter++;
                                            const newTbl = grade3GlobalPhotoTblStamp.cloneNode(true);
                                            newTbl.setAttribute('id', String(9500000 + photoTblCounter));
                                            let slots = resolveGrade3HwpxPhotoAlbumSlots(newTbl);
                                            if (!slots.slots.length) throw new Error('사진첩 표에서 사진N 칸을 찾지 못했습니다.');
                                            const sizeInfo = ensureGrade3PhotoPicsInTbl(newTbl, slots.slots, albumDonorPic);
                                            const fitW = sizeInfo.maxW || albumMaxW || 20000;
                                            const fitH = sizeInfo.maxH || albumMaxH || 15000;
                                            slots = resolveGrade3HwpxPhotoAlbumSlots(newTbl);
                                            slots.slots.map(s => s.pic).filter(Boolean).forEach((p, pIdx) => {
                                                p.setAttribute('id', String(9600000 + photoTblCounter * 2 + pIdx));
                                                p.setAttribute('instid', String(9700000 + photoTblCounter * 2 + pIdx));
                                            });
                                            const place = (slot, s) => {
                                                if (!slot || !slot.pic) throw new Error('사진첩 표에 사진 칸이 모자랍니다.');
                                                imgCounter++;
                                                const imgId = `ndtAlbum${imgCounter}`;
                                                zip.file(`BinData/${imgId}.${s.ext}`, s.bytes);
                                                manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${s.ext}" media-type="${s.mime}" isEmbeded="1"/>`);
                                                setPicImage(slot.pic, imgId, s.w, s.h, fitW, fitH);
                                                if (slot.labelTc) {
                                                    setTcText(slot.labelTc, s.entry.label);
                                                    centerCellContent(slot.labelTc);
                                                }
                                                if (slot.locationTc) setTcText(slot.locationTc, '');
                                                if (slot.contentTc) {
                                                    const loc = s.entry.location && s.entry.location !== '-' ? s.entry.location : '';
                                                    setTcText(slot.contentTc, loc ? `${loc} · ${s.entry.content}` : s.entry.content);
                                                    centerCellContent(slot.contentTc);
                                                }
                                            };
                                            place(slots.slots[0], s1);
                                            if (s2) place(slots.slots[1], s2);
                                            else stripGrade3UnusedPhotoSlots(newTbl, 1);
                                            return newTbl;
                                        }
                                    });
                                    if (album) ndtAlbumTitlePara = album.titlePara;
                                }
                            } catch (albumErr) {
                                console.error('비파괴 장비조사 사진첩 삽입 실패(나머지는 계속 진행):', albumErr);
                                window.showToast('비파괴 장비조사 사진첩을 넣지 못했습니다: ' + albumErr.message, 'warning', 5000);
                            }
                            // 위치도가 하나도 안 들어간 제목은 빈 제목만 남으므로 지운다.
                            // 들어간 제목은 쪽 나눔을 켜서 위치도 묶음이 새 쪽에서 시작하게 한다.
                            mapHeadingCandidates.forEach((p) => {
                                if (!p || !p.parentNode) return;
                                if (lastParaUnderHeading.has(p)) p.setAttribute('pageBreak', '1');
                                else p.parentNode.removeChild(p);
                            });
                        }
                    }
                }
            } } catch (ndtErr) {
                console.error('비파괴조사 섹션 삽입 실패(나머지는 계속 진행):', ndtErr);
                window.showToast('비파괴조사 섹션 삽입 중 오류가 있어 해당 부분은 제외하고 만듭니다: ' + ndtErr.message, 'warning', 5000);
            }

            // ---- 표본 템플릿 잔여 내용 정리 ----
            // 템플릿은 완성된 표본 보고서 원본이라, 위에서 실제로 채운 층 블록/비파괴조사 5개 섹션
            // 말고는 표본 데이터가 그대로 남아있다 — 다른 층들의 상태조사표/사진첩/위치도 전체와,
            // 표본 건물의 "비파괴 장비조사 사진첩"이 대표적이다. 이걸 지우지 않으면 실제 결함 사진과
            // 무관한 표본 사진이 내보낸 문서에 섞여 나온다. 정기점검용 템플릿에는 이 마커들이 애초에
            // 없어서 아래 find()가 전부 못 찾고 조용히 넘어간다(해로울 게 없음). 실패해도 이미 만든
            // 상태조사표/사진/위치도는 살려서 내보내야 하므로 전체를 try/catch로 감싼다.
            try {
                // 1) 실제로 채운 층 블록들 다음에 남은 표본 층 블록(있다면)은 통째로 삭제한다.
                if (unusedFloorSlotStart) removeParaRange(unusedFloorSlotStart, null);

                // "비파괴 장비조사 사진첩"(표본 NDT 사진, 우리 코드가 다루지 않음) 섹션의 경계를
                // 찾아둔다. "비파괴 장비조사 위치도" 섹션 자체는 NDT try 블록 끝에서 이미 정리·
                // 재구성했으므로(모든 결과표 뒤에 위치도를 한꺼번에 모아 넣는 단계) 여기서는
                // 사진첩만 처리한다.
                const albumStart = secChildren().find(p => p !== ndtAlbumTitlePara && /^비파괴 장비조사 사진첩/.test(paraText(p).trim()));
                const surveyHeading = secChildren().find(p => /^주요 상태조사표, 사진 및 위치도/.test(paraText(p).trim()));

                // 2) "비파괴 장비조사 사진첩" 섹션 전체 삭제
                if (albumStart) removeParaRange(albumStart, surveyHeading || null);
                // 3) 첫 페이지 상태조사표 제목 바로 위 빈 문단 정리. 비파괴조사 섹션 정리(위 NDT
                // try 블록)가 데이터 없는 항목의 표/제목을 지우면서 그 자리에 붙어있던 빈 문단들이
                // 이제야 상태조사표 제목 바로 위로 올라와 엔터를 여러 번 친 것처럼 빈 줄이 남는다 —
                // 그래서 이 정리는 NDT 처리가 다 끝난 뒤인 여기서 해야 한다. 표/그림이 든 문단이나
                // 실제 텍스트가 남은 문단을 만나면 멈춘다.
                if (floorSlots[0] && floorSlots[0].titlePara) {
                    let emptyPara = floorSlots[0].titlePara.previousElementSibling;
                    while (emptyPara && emptyPara.localName === 'p') {
                        const hasTbl = emptyPara.getElementsByTagNameNS(HP_NS, 'tbl').length > 0;
                        const hasPic = emptyPara.getElementsByTagNameNS(HP_NS, 'pic').length > 0;
                        const text = Array.from(emptyPara.getElementsByTagNameNS(HP_NS, 't')).map(x => x.textContent || '').join('').trim();
                        if (hasTbl || hasPic || text) break;
                        const prev = emptyPara.previousElementSibling;
                        if (emptyPara.parentNode) emptyPara.parentNode.removeChild(emptyPara);
                        emptyPara = prev;
                    }
                    // 문서 맨 처음(1번째 층) 제목 문단이 표본 문서에서는 원래 그 앞에 다른 내용이
                    // 있던 위치였어서 vertpos가 0이 아닌 큰 값으로 남아있는 경우가 있다 — 페이지
                    // 맨 위인데도 그 값만큼 빈 공간이 생긴다. 문서의 실제 첫 문단이 됐으니 0으로
                    // 되돌린다.
                    const firstSeg = floorSlots[0].titlePara.getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                    if (firstSeg) firstSeg.setAttribute('vertpos', '0');
                }
            } catch (cleanupErr) {
                console.error('표본 템플릿 잔여 내용 정리 실패(나머지는 유지):', cleanupErr);
            }

            // ---- 3종 중점관리: 전·금회차 비교사진 (hwpx_priority_compare_grade3.hwpx — 좌=전차/우=현차 큰 비교표) ----
            const allPriorityCompareEntries = [];
            for (let fi = 0; fi < floorsData.length; fi++) {
                const { floorCode: fc, pageDefects: defs } = floorsData[fi];
                defs.filter(d => d.isPriorityManage)
                    .forEach(d => allPriorityCompareEntries.push({ d, floorCode: fc, entry: floorsData[fi] }));
            }
            if (allPriorityCompareEntries.length > 0) {
                try {
                    await Promise.all(allPriorityCompareEntries.map(({ d }) => ensureDefectPhotosLoaded(d)));
                    if (!grade3CompareTableStamp || !grade3CompareTableStamp.compareTblPara) {
                        window.showToast('중점관리 비교사진 양식(templates/hwpx_priority_compare_grade3.hwpx)을 찾지 못했습니다.', 'warning', 6000);
                    } else {
                        let compareInsertAnchor = grade3HwpxCompareAnchorPara;
                        let compareRemapAttrs = null;
                        if (grade3CompareHeaderText) {
                            if (!hwpxHeaderText) hwpxHeaderText = await zip.file('Contents/header.xml').async('string');
                            const mergedHdr = mergeGrade3CompareStampHeader(hwpxHeaderText, grade3CompareHeaderText, [
                                grade3CompareTableStamp.compareTblPara,
                                grade3CompareTableStamp.legendPara,
                                grade3CompareTableStamp.titlePara
                            ]);
                            hwpxHeaderText = mergedHdr.header;
                            compareRemapAttrs = mergedHdr.remapAttrs;
                            hwpxHeaderDirty = true;
                        }
                        const cloneCompareStampPara = (proto) => {
                            if (!proto) return null;
                            const cloned = remapHwpxCompareNode(proto.cloneNode(true), compareRemapAttrs);
                            return xmlDoc.importNode(cloned, true);
                        };
                        const reassignCompareParaIds = (para) => {
                            Array.from(para.getElementsByTagNameNS(HP_NS, 'tbl')).forEach(tbl => {
                                cloneIdSeq++;
                                tbl.setAttribute('id', String(10400000 + cloneIdSeq));
                            });
                            Array.from(para.getElementsByTagNameNS(HP_NS, 'pic')).forEach(pic => {
                                cloneIdSeq++;
                                pic.setAttribute('id', String(10500000 + cloneIdSeq));
                                pic.setAttribute('instid', String(10600000 + cloneIdSeq));
                            });
                        };
                        const appendComparePara = (para) => {
                            if (!para) return;
                            reassignCompareParaIds(para);
                            if (compareInsertAnchor && compareInsertAnchor.parentNode) {
                                compareInsertAnchor.parentNode.insertBefore(para, compareInsertAnchor.nextSibling);
                                compareInsertAnchor = para;
                            } else {
                                sec.appendChild(para);
                                compareInsertAnchor = para;
                            }
                        };

                        const stampPic = grade3CompareTableStamp.compareTbl.getElementsByTagNameNS(HP_NS, 'pic')[0];
                        const cmpMaxW = parseInt(stampPic.getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('width'), 10);
                        const cmpMaxH = parseInt(stampPic.getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('height'), 10);

                        const refTbl = floorSlots[0].statusTbls[0];
                        const refTrs = Array.from(refTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === refTbl);
                        const refHeaderText = refTrs.length >= 2
                            ? Array.from(refTrs[1].getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent || '').join('')
                            : '';
                        const refHeaderRowCount = (refHeaderText.includes('구조부재') || refHeaderText.includes('비구조부재')) ? 2 : 1;
                        const refDataRows = refTrs.slice(refHeaderRowCount);
                        const refNormalRowTpl = (refDataRows[Math.min(1, refDataRows.length - 1)] || refDataRows[0]);
                        const refColCount = refNormalRowTpl
                            ? Array.from(refNormalRowTpl.getElementsByTagNameNS(HP_NS, 'tc')).length
                            : 8;

                        const COMPARE_DEFECTS_PER_PAGE = 2;

                        const clearHwpxPicImage = (pic) => {
                            if (!pic) return;
                            const imgEl = pic.getElementsByTagNameNS(HC_NS, 'img')[0];
                            if (imgEl) imgEl.setAttribute('binaryItemIDRef', '');
                            pic.removeAttribute('thumbnailBinIDRef');
                        };
                        const fillComparePicSlot = async (pic, src) => {
                            if (!pic) return;
                            if (!src) {
                                clearHwpxPicImage(pic);
                                return;
                            }
                            imgCounter++;
                            const imgId = `photoAuto${imgCounter}`;
                            const pack = await dataUrlToBytes(src);
                            const size = await loadImageNaturalSizeFromBytes(pack.bytes, pack.mime);
                            zip.file(`BinData/${imgId}.${pack.ext}`, pack.bytes);
                            manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${pack.ext}" media-type="${pack.mime}" isEmbeded="1"/>`);
                            setPicImage(pic, imgId, size.w, size.h, cmpMaxW, cmpMaxH);
                        };

                        // 제목은 compare 템플릿(분홍 바 '외관조사 사진첩')이 아니라, 본문 소제목(1.2. 중점관리 항목) 형식
                        if (floorSlots[0] && floorSlots[0].titlePara) {
                            const titleP = floorSlots[0].titlePara.cloneNode(true);
                            titleP.setAttribute('pageBreak', '1');
                            const t = titleP.getElementsByTagNameNS(HP_NS, 't')[0];
                            if (t) t.textContent = '1.2. 중점관리 항목';
                            appendComparePara(titleP);
                        } else if (grade3CompareTableStamp.titlePara) {
                            const titleP = cloneCompareStampPara(grade3CompareTableStamp.titlePara);
                            if (titleP) {
                                titleP.setAttribute('pageBreak', '1');
                                Array.from(titleP.getElementsByTagNameNS(HP_NS, 't')).forEach(t => {
                                    const txt = (t.textContent || '').trim();
                                    if (txt.includes('사진') || txt.includes('외관') || txt.includes('중점')) {
                                        t.textContent = '1.2. 중점관리 항목';
                                    }
                                });
                                appendComparePara(titleP);
                            }
                        }

                        let compareDefectsOnPage = 0;
                        let comparePairIndex = 0;
                        const compareLegendItems = []; // 범례: 실제로 찍힌 표의 층 접두사
                        // 2026-10-30 여러 동: 중점관리도 동마다 「A동 중점관리 항목」 소제목(새 쪽)으로 나눈다
                        const splitPriorityByDong = !!(dongParts && dongParts.length > 1);
                        let priorityDong;
                        let priorityDongCount = 0;
                        for (let ci = 0; ci < allPriorityCompareEntries.length; ci++) {
                            const { d, floorCode: cmpFloorCode } = allPriorityCompareEntries[ci];
                            useDongOf(allPriorityCompareEntries[ci].entry);
                            const prevSrc = getDefectPrevOutputPhotos(d)[0];
                            // 2026-10-20 보수완료 사진을 고른 중점관리 항목은 금회차 칸에 그 사진
                            const repairSrc = getDefectRepairPhotoSrc(d);
                            const currSrc = repairSrc || getDefectOutputPhotos(d)[0];
                            if (!prevSrc && !currSrc) continue;
                            let priorityDongHead = false;
                            const entryDong = allPriorityCompareEntries[ci].entry && allPriorityCompareEntries[ci].entry.dongPart;
                            if (splitPriorityByDong && entryDong !== priorityDong) {
                                priorityDong = entryDong;
                                const dl = priorityDong && priorityDong.dongLabel;
                                if (dl && ndtAlbumSubHeadingStamp) {
                                    // 첫 동은 「1.2. 중점관리 항목」 제목 바로 아래, 다음 동부터 새 쪽
                                    const head = makeHwpxTextParaFromStamp(ndtAlbumSubHeadingStamp, `${dl} 중점관리 항목`, HP_NS, priorityDongCount > 0);
                                    if (head) {
                                        appendComparePara(head);
                                        priorityDongHead = true;
                                    }
                                }
                                priorityDongCount++;
                                compareDefectsOnPage = 0;
                            }

                            if (compareDefectsOnPage > 0 && compareDefectsOnPage >= COMPARE_DEFECTS_PER_PAGE) {
                                compareDefectsOnPage = 0;
                            }

                            const rowCtx = {
                                floorCode: cmpFloorCode,
                                floorDisplayLabel: rowFloorLabel(cmpFloorCode)
                            };
                            const values = getReportSurveyRowValues(d, Object.assign({ hwpxUnits: true }, rowCtx), isGrade3, refColCount);
                            const defectNo = values[0] || getSurveyCellText('no', d, rowCtx) || (d.no || '').replace(/^NO\.?\s*/i, '');
                            const roundLabels = getDefectHwpxCompareRoundLabelsFull(d, bldg);

                            const tblPara = cloneCompareStampPara(grade3CompareTableStamp.compareTblPara);
                            if (!tblPara) continue;
                            if (compareDefectsOnPage === 0 && comparePairIndex > 0 && !priorityDongHead) {
                                tblPara.setAttribute('pageBreak', '1');
                            }
                            if (priorityDongHead) tblPara.setAttribute('pageBreak', '0');
                            const tbl = tblPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
                            ensureTblTreatAsChar(tbl);
                            const pics = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'pic'));

                            await fillComparePicSlot(pics[0], prevSrc);
                            await fillComparePicSlot(pics[1], currSrc);

                            const trs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl);
                            if (trs.length >= 2) {
                                Array.from(trs[1].getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                                    const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                                    const col = addr ? addr.getAttribute('colAddr') : '';
                                    if (col === '0' || col === '3') setTcText(tc, defectNo);
                                    else if (col === '1') setTcText(tc, prevSrc ? roundLabels.prev : '');
                                    else if (col === '4') setTcText(tc, currSrc ? (repairSrc ? `${roundLabels.curr} (보수완료)` : roundLabels.curr) : '');
                                });
                            }

                            appendComparePara(tblPara);
                            compareLegendItems.push({ prefix: getGrade3FloorPrefix(cmpFloorCode), label: getFloorLabel(cmpFloorCode) });
                            compareDefectsOnPage++;
                            comparePairIndex++;
                        }

                        if (grade3CompareTableStamp.legendPara) {
                            const legendP = cloneCompareStampPara(grade3CompareTableStamp.legendPara);
                            const legendText = buildGrade3PrefixLegendText(compareLegendItems);
                            if (legendP && legendText) {
                                // 양식 글자(표본 건물 층) 대신 이 건물 표에 찍힌 번호로
                                const ts = Array.from(legendP.getElementsByTagNameNS(HP_NS, 't'));
                                ts.forEach((t, i) => { t.textContent = i === 0 ? legendText : ''; });
                                Array.from(legendP.getElementsByTagNameNS(HP_NS, 'linesegarray')).forEach((la) => {
                                    Array.from(la.getElementsByTagNameNS(HP_NS, 'lineseg')).slice(1).forEach((x) => la.removeChild(x));
                                });
                                appendComparePara(legendP);
                            }
                        }
                    }
                } catch (cmpErr) {
                    console.error('중점관리 비교사진 삽입 실패:', cmpErr);
                    window.showToast('중점관리 비교사진 삽입 중 오류가 있어 해당 사진은 제외합니다.', 'warning', 5000);
                }
            }

            // ---- 3종시설물 위치도 일괄 삽입 ----
            // 모든 층의 상태조사표/사진첩이 다 채워지고 표본 잔여 정리까지 끝난 뒤, 떼어뒀던 위치도
            // "틀" 문단을 층 수만큼 복제해 문서 맨 뒤에 순서대로 붙이고 채운다.
            if (grade3LocMapStampPara) {
                // 2026-10-30 여러 동: 위치도도 동마다 「A동 상태조사위치도」 소제목(새 쪽)으로 나눈다
                const splitMapsByDong = !!(dongParts && dongParts.length > 1);
                let mapDong;
                for (let i = 0; i < floorsData.length; i++) {
                    const { floorCode } = floorsData[i];
                    useDongOf(floorsData[i]);
                    // 외부는 배치도 한 장일 수도, 입면도 여러 장일 수도 있다 — 도면마다 한 장씩.
                    const mapCodes = locationMapCodesForPage(floorsData[i], floorCode);
                    let mapSeq = 0;
                    let dongHead = null;
                    let resetFigNo = false;
                    if (splitMapsByDong && floorsData[i].dongPart !== mapDong && mapCodes.length) {
                        resetFigNo = true;
                        mapDong = floorsData[i].dongPart;
                        const dl = mapDong && mapDong.dongLabel;
                        if (dl && ndtAlbumSubHeadingStamp) {
                            dongHead = makeHwpxTextParaFromStamp(ndtAlbumSubHeadingStamp, `${dl} 상태조사위치도`, HP_NS, true);
                            if (dongHead) sec.appendChild(dongHead);
                        }
                    }
                    for (const mapCode of mapCodes) {
                        const clonedPara = grade3LocMapStampPara.cloneNode(true);
                        clonedPara.setAttribute('pageBreak', dongHead ? '0' : '1');
                        dongHead = null;
                        reassignClonedIds([clonedPara]);
                        sec.appendChild(clonedPara);
                        const locationMapTbl = clonedPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
                        mapSeq += 1;
                        const ok = await fillLocationMapForFloor(
                            locationMapTbl, mapCode, `${i + 1}_${mapSeq}`,
                            { silent: mapCodes.length > 1 }
                        );
                        // 도면이 없는 면은 빈 틀을 남기지 않는다
                        if (!ok && clonedPara.parentNode) clonedPara.parentNode.removeChild(clonedPara);
                        // 2026-10-30 여러 동: 동마다 도면 번호를 [도면 5-1]부터 다시
                        if (ok && resetFigNo) {
                            const capT = Array.from(locationMapTbl.getElementsByTagNameNS(HP_NS, 't'))
                                .find((t) => (t.textContent || '').indexOf(HWPX_FIG_MARK) === 0);
                            if (capT) capT.textContent = HWPX_FIG_MARK + HWPX_FIG_RESET + capT.textContent.slice(HWPX_FIG_MARK.length);
                            resetFigNo = false;
                        }
                    }
                }
            }

            useDongOf(null);
            // ---- 전경사진 (문서 맨 마지막) ----
            try {
                // 여러 동이면 동 순서대로, 캡션 앞에 동 이름
                const overviewOwners = dongParts
                    ? dongParts.map((p) => ({ b: p.bldg, pre: `${p.dongLabel} ` }))
                    : [{ b: bldg, pre: '' }];
                const overviewReady = [];
                for (const owner of overviewOwners) {
                    await hydrateBuildingOverviewPhotos(owner.b);
                    const overviewList = (getBuildingOverviewPhotos(owner.b) || []).filter((p) => p && (p.dataUrl || p.id));
                    for (const p of overviewList) {
                        let src = p.dataUrl;
                        if (!src && p.id) src = await loadOverviewPhotoDataUrl(owner.b.id, p.id);
                        if (!src) continue;
                        overviewReady.push({
                            caption: owner.pre + ((p.caption != null && String(p.caption).trim()) ? String(p.caption).trim() : '전경사진'),
                            dataUrl: src
                        });
                    }
                }
                if (overviewReady.length > 0) {
                    const OV_HEADING_XML = `<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:t>전경사진</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p>`;
                    const OV_PHOTO_TBL_PARA_XML = '<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:tbl id="TBL_ID" zOrder="11" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="1" rowCnt="2" colCnt="1" cellSpacing="0" borderFillIDRef="5" noAdjust="0"><hp:sz width="41821" widthRelTo="ABSOLUTE" height="64087" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="140" right="140" top="140" bottom="140"/><hp:inMargin left="140" right="140" top="140" bottom="140"/><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="15"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="6"><hp:pic id="PIC_ID" zOrder="36" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" thumbnailBinIDRef="" href="" groupLevel="0" instid="PIC_INSTID" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="768540" height="969540"/><hp:curSz width="41541" height="52405"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="20770" centerY="26202" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.054052" e2="0" e3="0" e4="0" e5="0.054051" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="768540" y="0"/><hc:pt2 x="768540" y="969540"/><hc:pt3 x="0" y="969540"/></hp:imgRect><hp:imgClip left="0" right="648540" top="0" bottom="818100"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="648540" dimheight="818100"/><hp:effects/><hp:sz width="41541" widthRelTo="ABSOLUTE" height="52405" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="1320" horzpos="0" horzsize="0" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="60813"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="16"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="1" styleIDRef="16" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="43"><hp:t>CAPTION</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="3274"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="64367" textheight="64367" baseline="54712" spacing="960" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>';
                    const OV_MAX_W = 41821 - 141 - 141;
                    const OV_MAX_H = 60813 - 141 - 141;
                    const escapeXmlText = (s) => String(s || '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');

                    const headingDoc = new DOMParser().parseFromString(
                        `<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${OV_HEADING_XML}</root>`,
                        'application/xml'
                    );
                    sec.appendChild(xmlDoc.importNode(headingDoc.documentElement.firstChild, true));

                    for (let oi = 0; oi < overviewReady.length; oi++) {
                        const item = overviewReady[oi];
                        imgCounter++;
                        const xml = OV_PHOTO_TBL_PARA_XML
                            .replace('TBL_ID', String(8900000 + imgCounter))
                            .replace('PIC_ID', String(8910000 + imgCounter))
                            .replace('PIC_INSTID', String(8920000 + imgCounter))
                            .replace('CAPTION', escapeXmlText(item.caption));
                        const docOv = new DOMParser().parseFromString(
                            `<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${xml}</root>`,
                            'application/xml'
                        );
                        const newPara = xmlDoc.importNode(docOv.documentElement.firstChild, true);
                        if (oi === 0) newPara.setAttribute('pageBreak', '0');
                        else newPara.setAttribute('pageBreak', '1');
                        sec.appendChild(newPara);
                        const pic = newPara.getElementsByTagNameNS(HP_NS, 'pic')[0];
                        const { bytes, mime, ext } = await dataUrlToBytes(item.dataUrl);
                        const size = await loadImageSize(item.dataUrl);
                        const imgId = `overviewPhoto${imgCounter}`;
                        zip.file(`BinData/${imgId}.${ext}`, bytes);
                        manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                        setPicImage(pic, imgId, size.w, size.h, OV_MAX_W, OV_MAX_H);
                        ensureTblTreatAsChar(newPara.getElementsByTagNameNS(HP_NS, 'tbl')[0]);
                    }
                }
            } catch (ovErr) {
                console.error('전경사진 HWPX 삽입 실패(나머지는 유지):', ovErr);
            }

            // ---- 손글씨 메모 (전경사진 바로 뒤) ----
            try {
                imgCounter = await appendHwpxSketchMemoSection({
                    bldg, sec, xmlDoc, zip, HP_NS, HC_NS, getFloorLabel, imgCounter, dongParts,
                    dataUrlToBytes, setPicImage, ensureTblTreatAsChar, manifestAdds
                });
            } catch (skErr) {
                console.error('손글씨 메모 HWPX 삽입 실패(나머지는 유지):', skErr);
            }

            // ---- 균열게이지·균열팁 (문서 맨 마지막 — 전경사진 뒤) ----
            try {
                const crackHdrState = { text: hwpxHeaderText, dirty: hwpxHeaderDirty };
                await appendHwpxCrackMonitorSectionEnd({
                    bldg, bldgId, getFloorLabel, sec, xmlDoc, zip, dongParts,
                    setTcText, ensureTblTreatAsChar, dataUrlToBytes, loadImageSize, setPicImage,
                    ensureDefectPhotosLoaded, manifestAdds,
                    counters: { imgCounter, cloneIdSeq },
                    mergeStampHeader: mergeGrade3CompareStampHeader,
                    remapStampNode: remapHwpxCompareNode,
                    hwpxHeaderState: crackHdrState
                });
                hwpxHeaderText = crackHdrState.text;
                hwpxHeaderDirty = crackHdrState.dirty;
            } catch (crackAppendErr) {
                console.error('균열게이지·팁 HWPX 섹션 추가 실패(나머지는 유지):', crackAppendErr);
            }

            Array.from(xmlDoc.getElementsByTagNameNS(HP_NS, 'tbl')).forEach(ensureTblTreatAsChar);

            // 결함위치도·비파괴 장비조사 위치도 캡션에 [도면 5-N](3종)을 하나로 이어서 매긴다.
            // 문서가 완성된 뒤라야 최종 배치 순서대로 번호가 맞는다.
            numberHwpxFigureCaptions(xmlDoc, bldg.inspectionType, { grade3: true });

            if (hwpxHeaderDirty && hwpxHeaderText) {
                zip.file('Contents/header.xml', hwpxHeaderText);
            }

            if (manifestAdds.length > 0) {
                let hpfText = await zip.file('Contents/content.hpf').async('string');
                // 실제 쓰인 섹션 파일(section1 또는 section0)의 매니페스트 항목 앞에 새 이미지 항목들을 끼워 넣는다.
                const sectionItemId = sectionPath.replace('Contents/', '').replace('.xml', '');
                const manifestMarker = `<opf:item id="${sectionItemId}"`;
                if (hpfText.indexOf(manifestMarker) < 0) throw new Error('매니페스트 삽입 위치를 찾지 못했습니다.');
                hpfText = hpfText.replace(manifestMarker, manifestAdds.join('') + manifestMarker);
                zip.file('Contents/content.hpf', hpfText);
            }

            let newXml = new XMLSerializer().serializeToString(xmlDoc);
            if (!newXml.startsWith('<?xml')) {
                newXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + newXml;
            }
            newXml = forceHwpxArabicPageNumbers(newXml);
            // 2026-10-19 8.5pt로 들어가던 글자는 전부 8pt(js/shared/hwpx-font-8pt.js) — 본문 줄·글자 모양 모두
            const font8pt = window.BSA && window.BSA.shared && window.BSA.shared.hwpxFont8pt;
            if (font8pt) {
                newXml = font8pt.sectionTo8pt(newXml);
                await font8pt.applyHeaderToZip(zip);
            }
            zip.file(sectionPath, newXml);

            // 원본처럼 mimetype/version.xml은 무압축(Store)으로 유지
            zip.file('mimetype', await zip.file('mimetype').async('string'), { compression: 'STORE' });
            zip.file('version.xml', await zip.file('version.xml').async('string'), { compression: 'STORE' });

            // JSZip이 중첩 경로(Contents/section1.xml) 파일을 다시 쓸 때 원본에는 없던 빈 폴더
            // 항목(예: "Contents/")을 자동으로 끼워 넣는 경우가 있어 원본과 항목 구성을 동일하게
            // 맞춘다. zip.remove()는 폴더 지정 시 그 안의 파일까지 재귀적으로 지워버리므로 절대
            // 쓰면 안 되고, 내부 맵(zip.files)에서 그 폴더 키 하나만 직접 지운다.
            Object.keys(zip.files).forEach(name => { if (zip.files[name].dir) delete zip.files[name]; });

            await reportHwpxStructure(zip, sectionPath, newXml, bldg);

            if (typeof window.updateLoadingText === 'function') {
                window.updateLoadingText('한글(hwpx) 파일 압축 중...');
            }
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 1 },
                mimeType: 'application/hwp+zip'
            });

            const bldgName = ((dongOpts && dongOpts.fileName) || bldg.name || '건축물').replace(/^🏢\s*/, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `${bldgName}_상태조사표_전체층_${dateStr}.hwpx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const totalDefectCount = floorsData.reduce((sum, f) => sum + f.pageDefects.length, 0);
            window.showToast(`hwpx 파일을 생성했습니다 (${floorsData.length}개 층, 총 ${totalDefectCount}건 반영).`, 'success', 4000);
    }

    async function exportHwpxSurveyTable12(bldg, bldgId, floorsData, getFloorLabel, dongOpts) {
            // 여러 동 한 파일(dongOpts, 2026-10-23) — exportHwpxSurveyTable3과 같은 방식
            const dongParts = (dongOpts && dongOpts.parts) || null;
            const homeBldg = bldg, homeBldgId = bldgId;
            let curDongPart = null;
            const useDongOf = (entry) => {
                if (!dongParts) return;
                curDongPart = (entry && entry.dongPart) || null;
                bldg = curDongPart ? curDongPart.bldg : homeBldg;
                bldgId = curDongPart ? curDongPart.bldgId : homeBldgId;
                _hwpxRenderBldgOverride = curDongPart ? curDongPart.bldg : null;
                dongOpts.setCurrent(curDongPart);
            };
            const rowFloorLabel = (fc) => (curDongPart ? curDongPart.rawLabel(fc) : getFloorLabel(fc));
            const dongTitlePrefix = () => (curDongPart ? `${curDongPart.dongLabel} ` : '');
            const ndtBldgOf = (rec) => {
                const p = dongParts && rec && rec._ndtBldgId && dongParts.find((x) => x.bldgId === rec._ndtBldgId);
                return p ? p.bldg : bldg;
            };
            const renderHwpxNdtMap = async (fc, category) => {
                const sp = splitHwpxDongFloorCode(fc, dongParts);
                if (!sp.part) return renderNdtFloorPlanCanvasDataUrlAsync(fc, category);
                _hwpxRenderBldgOverride = sp.part.bldg;
                try {
                    return await renderNdtFloorPlanCanvasDataUrlAsync(sp.floorCode, category);
                } finally {
                    _hwpxRenderBldgOverride = null;
                }
            };
            // 직전 보고서의 이미지 바이트가 계속 남아 사진이 많을수록 메모리가 누적된다
            _hwpxBytesByUrl.clear();
            // 정기안전점검은 비파괴 장비조사 섹션(DATA·결과표/위치도/사진첩)이 통째로 빠진 전용
            // 템플릿을 쓴다. 프로그램으로 표/제목 문단을 골라 지우는 방식은 목차 번호·캡션·이미지
            // 슬롯이 얽혀있어 완전히 지우기가 어려워서(제목만 빈 채로 남는 문제 있었음), 애초에
            // 한글에서 해당 섹션을 다 들어낸 별도 템플릿 파일을 만들어 분리했다.
            const hwpxSlotApi = getHwpxSlotApi();
            const isPreciseInspectionForTemplate = hwpxSlotApi.isPreciseInspectionForHwpx(bldg.inspectionType);
            const isGrade3 = false; // exportHwpxSurveyTable12: always grade1/2
            // 3종시설물은 칠산타워 서식(No./구분/부재 분류/점검내용/발생원인/비고, 구조·비구조
            // 2행 헤더)을 쓰고, 비파괴 장비조사 섹션 유무는 1,2종과 똑같이 정밀/정기 여부로
            // 결정한다(정밀에 체크된 경우에만 비파괴장비조사 포함).
            const templatePath = isPreciseInspectionForTemplate
                ? './templates/hwpx_survey_template.hwpx'
                : './templates/hwpx_survey_template_regular.hwpx';

            // 템플릿은 세션 메모리 + ?v= 로 받고, 같은 내보내기에서 다시 받지 않는다.
            const zip = await loadHwpxZipFromPath(templatePath);
            let hwpxHeaderText = null;
            let hwpxHeaderDirty = false;

            const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
            const HC_NS = 'http://www.hancom.co.kr/hwpml/2011/core';
            // 한글에서 템플릿을 직접 열어 저장하면 섹션을 하나로 합치면서 section1.xml이 사라지고
            // section0.xml 하나에 전체 내용이 들어가는 경우가 있다(실제로 겪음). 층별 조사표가 들어있는
            // 실제 섹션 파일을 그때그때 찾는다.
            const sectionPath = zip.file('Contents/section1.xml') ? 'Contents/section1.xml' : 'Contents/section0.xml';
            const xmlText = await zip.file(sectionPath).async('string');
            const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
            if (xmlDoc.querySelector('parsererror')) throw new Error('템플릿 ' + sectionPath + ' 파싱에 실패했습니다.');
            // 칸 글자 크기(charPr height, HWPUNIT) — 위치 칸(행·열) 줄바꿈 폭 계산용
            const hwpxCharPrHeightById = {};
            try {
                const hdrForSize = await zip.file('Contents/header.xml').async('string');
                const reCharPr = /<hh:charPr\b[^>]*>/g;
                let mCharPr;
                while ((mCharPr = reCharPr.exec(hdrForSize))) {
                    const idM = /\bid="(\d+)"/.exec(mCharPr[0]);
                    const hM = /\bheight="(\d+)"/.exec(mCharPr[0]);
                    if (idM && hM) hwpxCharPrHeightById[idM[1]] = parseInt(hM[1], 10) || 0;
                }
            } catch (_charPrErr) { /* 없으면 줄 높이(lineseg)로 어림 */ }

            const sec = xmlDoc.getElementsByTagName('hs:sec')[0];
            if (!sec) throw new Error('템플릿 문서 구조(hs:sec)를 찾지 못했습니다.');
            const paraText = (p) => Array.from(p.getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent).join('');
            const secChildren = () => Array.from(sec.children).filter(c => c.localName === 'p');

            // 한글에서 표에 새 칸을 추가만 하고 한 번도 안 채운 셀은 문단/run은 있어도 hp:t(실제 글자
            // 요소)가 아예 없는 경우가 있다. 없으면 만들어서 항상 값을 넣을 자리를 보장한다.
            const ensureCellTextNode = (para) => {
                let run = para.getElementsByTagNameNS(HP_NS, 'run')[0];
                if (!run) {
                    run = xmlDoc.createElementNS(HP_NS, 'hp:run');
                    para.appendChild(run);
                }
                let t = run.getElementsByTagNameNS(HP_NS, 't')[0];
                if (!t) {
                    t = xmlDoc.createElementNS(HP_NS, 'hp:t');
                    run.appendChild(t);
                }
                return t;
            };
            // 표 칸에 값을 2줄 이상(줄바꿈 \n) 채울 때, 첫 문단을 복제해 다음 줄로 이어붙이는 곳마다
            // 복제본이 원본과 똑같은 vertpos(보통 0)를 그대로 들고 나가서 여러 줄이 같은 자리에
            // 겹쳐 보이는 버그가 있었다("변위량" 글자가 사라진 것처럼, 또는 엔터 친 것처럼 보이던 원인).
            // 문서에서 이미 정상적으로 2줄인 칸들의 규칙(다음 줄 vertpos = 이전 vertpos + vertsize +
            // spacing)을 그대로 적용해 복제된 줄마다 세로 위치를 다시 계산해준다.
            const fixClonedParaVertpos = (clonedPara, lineIndex, baseVertsize, baseSpacing) => {
                const seg = clonedPara.getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                if (seg) seg.setAttribute('vertpos', String(lineIndex * (baseVertsize + baseSpacing)));
            };
            // 한글 셀: charPr 자간 속성은 건드리지 않는다(템플릿 값 유지).
            // 줄바꿈은 BSA.koreanTextWrap(어절·금칙·1.05 버퍼·\\n 보존). 한 문단이면 자간 압축을 막기 위해 문단 분리.
            // 행 높이는 템플릿을 유지하다가 4줄 이상일 때만 내용에 맞게 확장한다.
            const HWPX_CELL_EXPAND_FROM_LINES = 4;
            /** 한글 칸 줄바꿈: js/shared/korean-text-wrap.js (어절·금칙·\\n 보존). */
            const hwpxCharWidthUnits = (ch) => {
                const api = window.BSA && window.BSA.koreanTextWrap;
                if (api && typeof api.defaultCharWidthUnits === 'function') {
                    return api.defaultCharWidthUnits(ch);
                }
                if (/[\u0020-\u007E\uFF61-\uFF9F]/.test(ch)) return 0.55;
                return 1;
            };
            const estimateHwpxCellMaxChars = (tc, paras) => {
                const DEFAULT_MAX = 16;
                if (!tc) return DEFAULT_MAX;
                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                const cellW = sz ? parseInt(sz.getAttribute('width'), 10) || 0 : 0;
                if (!cellW) return DEFAULT_MAX;
                const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                const ml = marginEl ? (parseInt(marginEl.getAttribute('left'), 10) || 0) : 141;
                const mr = marginEl ? (parseInt(marginEl.getAttribute('right'), 10) || 0) : 141;
                const seg = paras && paras[0] ? paras[0].getElementsByTagNameNS(HP_NS, 'lineseg')[0] : null;
                const vertsize = seg ? (parseInt(seg.getAttribute('vertsize'), 10) || 1000) : 1000;
                const charW = Math.max(700, Math.round(vertsize * 0.95));
                const usable = Math.max(charW, cellW - ml - mr);
                return Math.max(4, Math.floor(usable / charW));
            };
            const wrapHwpxCellText = (raw, maxChars = 16) => {
                // -nEA 앞만 문단 분리한 뒤, 공용 래퍼가 어절·금칙·명시적 \\n을 처리한다.
                // (예전처럼 입력 \\n을 공백으로 평탄화하지 않는다 — 진행\\n中 등 의도적 2줄 유지)
                const prepared = insertHwpxEaCountLineBreaks(
                    String(normalizeEaSpacingInText(raw == null ? '' : raw))
                        .replace(/\r\n|\r/g, '\n')
                );
                const api = window.BSA && window.BSA.koreanTextWrap;
                if (api && typeof api.wrapHwpxCellText === 'function') {
                    return api.wrapHwpxCellText(prepared, maxChars, hwpxCharWidthUnits);
                }
                // 모듈 미로드 시 최소 Fallback: 명시 개행만 유지
                return prepared;
            };

            // rawVal의 실제 줄 수(lines.length)를 반환한다 — 호출부에서 행 높이를 실제 줄 수에
            // 맞춰 다시 계산하는 데 쓴다(표본 행이 다른 칸의 샘플 2줄 데이터 기준 키를 물려받아,
            // 1줄로 줄어든 칸의 글자가 위로 뜬 것처럼 보이던 문제 — 한글에서 직접 확인됨).
            // minMaxChars: 이미 칸 폭에 맞춰 나눈 줄(위치 칸 행·열)을 공용 래퍼가 다시 쪼개지 않게 하는 최소 폭
            const fillCellParas = (subList, paras, rawVal, tc, minMaxChars) => {
                const maxChars = Math.max(estimateHwpxCellMaxChars(tc, paras), Number(minMaxChars) || 0);
                const lines = wrapHwpxCellText(rawVal, maxChars).split('\n');
                const baseSeg = paras[0].getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                const baseVertsize = baseSeg ? parseInt(baseSeg.getAttribute('vertsize'), 10) || 0 : 0;
                const baseSpacing = baseSeg ? parseInt(baseSeg.getAttribute('spacing'), 10) || 0 : 0;
                ensureCellTextNode(paras[0]).textContent = lines[0];
                if (baseSeg) baseSeg.setAttribute('vertpos', '0');
                for (let i = paras.length - 1; i >= 1; i--) subList.removeChild(paras[i]);
                let refNode = paras[0];
                for (let i = 1; i < lines.length; i++) {
                    const clonedPara = paras[0].cloneNode(true);
                    ensureCellTextNode(clonedPara).textContent = lines[i];
                    fixClonedParaVertpos(clonedPara, i, baseVertsize, baseSpacing);
                    subList.insertBefore(clonedPara, refNode.nextSibling);
                    refNode = clonedPara;
                }
                return { lineCount: lines.length, vertsize: baseVertsize, spacing: baseSpacing };
            };
            // 템플릿 행 높이를 기본으로 유지한다. 줄이거나 미리 키우지 않고,
            // 4줄 이상으로 넘어갈 때만 해당 행(칸들)을 내용 높이에 맞게 확장한다.
            // 세로 병합(rowSpan>1) 칸은 여러 행에 걸친 높이라 건드리지 않는다.
            const applyRowHeightFromLines = (row, rowMaxLines, rowLineMetric, minRowHeight) => {
                if (!row || !rowLineMetric) return 0;
                let templateHeight = 0;
                Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                    const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                    if (span && parseInt(span.getAttribute('rowSpan'), 10) > 1) return;
                    const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const h = sz ? parseInt(sz.getAttribute('height'), 10) || 0 : 0;
                    if (h > templateHeight) templateHeight = h;
                });
                const contentHeight = rowLineMetric.marginV + rowLineMetric.vertsize
                    + (rowMaxLines - 1) * (rowLineMetric.vertsize + rowLineMetric.spacing)
                    + Math.round(rowLineMetric.vertsize * 0.2);
                let neededHeight = templateHeight;
                if (rowMaxLines >= HWPX_CELL_EXPAND_FROM_LINES) {
                    neededHeight = Math.max(templateHeight, contentHeight);
                    if (minRowHeight) {
                        const floorH = minRowHeight
                            + (rowMaxLines - 1) * (rowLineMetric.vertsize + rowLineMetric.spacing);
                        neededHeight = Math.max(neededHeight, floorH);
                    }
                }
                // 템플릿보다 줄이지 않음. 확장할 때만 기록.
                if (neededHeight > templateHeight) {
                    Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
                        const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                        if (span && parseInt(span.getAttribute('rowSpan'), 10) > 1) return;
                        const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                        if (sz) sz.setAttribute('height', String(neededHeight));
                    });
                }
                return neededHeight || templateHeight;
            };
            // 한글은 subList의 vertAlign="CENTER"만으로 셀 안 글자를 자동으로 세로 가운데 정렬해
            // 주지 않는다 — 저장된 vertpos를 셀 위쪽 여백부터의 절대 오프셋으로 그대로 쓴다. 그래서
            // 지금까지 vertpos=0으로만 채워온 칸들은 셀 높이가 넉넉할수록 글자가 위로 붙어 보였다
            // (사용자가 결과표 헤더에서 직접 확인). 셀의 최종 높이가 정해진 뒤 이 함수로 한 번 더
            // 훑어서, 실제 줄 수만큼의 콘텐츠 높이를 셀 안에서 정확히 가운데로 오는 vertpos로
            // 다시 계산해 넣는다.
            const centerCellContent = (tc) => {
                if (!tc) return;
                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                const cellHeight = sz ? parseInt(sz.getAttribute('height'), 10) : 0;
                if (!cellHeight) return;
                const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                if (!subList) return;
                const paras = Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList);
                if (paras.length === 0) return;
                const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                const marginTop = marginEl ? (parseInt(marginEl.getAttribute('top'), 10) || 0) : 141;
                const marginBottom = marginEl ? (parseInt(marginEl.getAttribute('bottom'), 10) || 0) : 141;
                const firstSeg = paras[0].getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                if (!firstSeg) return;
                const vertsize = parseInt(firstSeg.getAttribute('vertsize'), 10) || 0;
                const spacing = parseInt(firstSeg.getAttribute('spacing'), 10) || 0;
                if (!vertsize) return;
                const contentHeight = vertsize + (paras.length - 1) * (vertsize + spacing);
                const available = cellHeight - marginTop - marginBottom;
                const offset = Math.max(0, Math.round((available - contentHeight) / 2));
                paras.forEach((p, i) => {
                    const seg = p.getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                    if (seg) seg.setAttribute('vertpos', String(offset + i * (vertsize + spacing)));
                });
            };
            const setTcText = (tc, rawVal, minMaxChars) => {
                if (!tc) return;
                const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                const paras = subList
                    ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList)
                    : [];
                if (paras.length > 0) fillCellParas(subList, paras, rawVal, tc, minMaxChars);
                else {
                    const t = tc.getElementsByTagNameNS(HP_NS, 't')[0];
                    if (t) t.textContent = wrapHwpxCellText(rawVal).split('\n').join(' ');
                }
            };
            /**
             * 한글 칸 한 줄 폭(em): (cellSz 폭 − 좌우 여백) ÷ 칸 글자 크기(charPr height) × 안전 여유.
             * 여백은 hasMargin="1"이면 칸의 cellMargin, 아니면 표의 inMargin. 알 수 없으면 0
             */
            const hwpxCellTextUnits = (tc, paras) => {
                const G = window.BSA && window.BSA.gridLines;
                if (!tc || !G || typeof G.cellTextUnits !== 'function') return 0;
                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                const cellWidth = sz ? (parseInt(sz.getAttribute('width'), 10) || 0) : 0;
                let marginEl = null;
                if (tc.getAttribute('hasMargin') === '1') {
                    marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0] || null;
                } else {
                    let tblEl = tc.parentNode;
                    while (tblEl && tblEl.localName !== 'tbl') tblEl = tblEl.parentNode;
                    marginEl = tblEl ? (Array.from(tblEl.children).find(c => c.localName === 'inMargin') || null) : null;
                }
                const ml = marginEl ? (parseInt(marginEl.getAttribute('left'), 10) || 0) : 141;
                const mr = marginEl ? (parseInt(marginEl.getAttribute('right'), 10) || 0) : 141;
                const p0 = paras && paras[0];
                const run = p0 ? p0.getElementsByTagNameNS(HP_NS, 'run')[0] : null;
                const cpId = run ? run.getAttribute('charPrIDRef') : null;
                let fontHeight = cpId != null ? (hwpxCharPrHeightById[cpId] || 0) : 0;
                if (!fontHeight && p0) {
                    const seg = p0.getElementsByTagNameNS(HP_NS, 'lineseg')[0];
                    fontHeight = seg ? (parseInt(seg.getAttribute('textheight'), 10) || parseInt(seg.getAttribute('vertsize'), 10) || 0) : 0;
                }
                return G.cellTextUnits({ cellWidth, marginLeft: ml, marginRight: mr, fontHeight });
            };
            // 2026-10-31 1·2종 상태조사표: 행·열(X4~X5/Y1~Y2)이 위치 칸에 한 줄로 들어가게 위치 칸(1번)을 넓히고 그만큼 조사내용 칸(2번)을 줄인다.
            // 양식 파일은 그대로 두고 출력할 때만 바꾼다(표 전체 폭 불변, 여러 번 불려도 같은 결과).
            const HWPX_G12_LOCATION_COL_WIDTH = 6200;
            const widenGrade12SurveyLocationCol = (tbl) => {
                Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl).forEach((tr) => {
                    const cellAt = (col) => Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).find((tc) => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                        return addr && addr.getAttribute('colAddr') === String(col) && (!span || span.getAttribute('colSpan') === '1');
                    });
                    const locSz = cellAt(1)?.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const contentSz = cellAt(2)?.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    if (!locSz || !contentSz) return;
                    const diff = HWPX_G12_LOCATION_COL_WIDTH - (parseInt(locSz.getAttribute('width'), 10) || 0);
                    if (diff <= 0) return;
                    locSz.setAttribute('width', String(HWPX_G12_LOCATION_COL_WIDTH));
                    contentSz.setAttribute('width', String((parseInt(contentSz.getAttribute('width'), 10) || 0) - diff));
                });
            };
            /** 사진표 위치 칸: 행·열이 있으면 상태조사표 위치 칸과 같은 규칙(행·열 → 다음 줄 실 이름), 없으면 예전 그대로 */
            const setHwpxPhotoLocText = (tc, d, fc) => {
                if (!tc) return;
                const raw = getDefectGridRoomForReport(d, fc, undefined, { roomFirst: true });
                if (!raw) {
                    setTcText(tc, getSurveyCellText('location', d, { floorCode: fc }) || hwpxAnnexEmptyLocationText(fc));
                    return;
                }
                const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                const paras = subList ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList) : [];
                const units = hwpxCellTextUnits(tc, paras);
                setTcText(tc, units > 0 ? (getDefectGridRoomForReport(d, fc, units, { roomFirst: true }) || raw) : raw, units);
            };
            const ensureTblTreatAsChar = (tbl) => {
                if (!tbl) return;
                let pos = Array.from(tbl.children).find(c => c.localName === 'pos');
                if (!pos) {
                    pos = xmlDoc.createElementNS(HP_NS, 'hp:pos');
                    const sz = Array.from(tbl.children).find(c => c.localName === 'sz');
                    if (sz && sz.nextSibling) tbl.insertBefore(pos, sz.nextSibling);
                    else tbl.appendChild(pos);
                }
                pos.setAttribute('treatAsChar', '1');
                pos.setAttribute('affectLSpacing', '0');
                pos.setAttribute('flowWithText', '1');
                pos.setAttribute('allowOverlap', '0');
                pos.setAttribute('holdAnchorAndSO', '0');
                pos.setAttribute('vertRelTo', 'PARA');
                pos.setAttribute('horzRelTo', 'PARA');
                pos.setAttribute('vertAlign', 'TOP');
                pos.setAttribute('horzAlign', 'LEFT');
                pos.setAttribute('vertOffset', '0');
                pos.setAttribute('horzOffset', '0');
            };
            const copyRowCellSizesFromTemplate = (row, templateRow) => {
                if (!row || !templateRow) return;
                const srcTcs = Array.from(templateRow.getElementsByTagNameNS(HP_NS, 'tc'));
                const dstTcs = Array.from(row.getElementsByTagNameNS(HP_NS, 'tc'));
                dstTcs.forEach((tc, i) => {
                    const srcSz = srcTcs[i]?.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const dstSz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    if (srcSz && dstSz) {
                        const w = srcSz.getAttribute('width');
                        const h = srcSz.getAttribute('height');
                        if (w) dstSz.setAttribute('width', w);
                        if (h) dstSz.setAttribute('height', h);
                    }
                });
            };
            const syncStatusTblLayoutFromTemplate = (destTbl, srcTbl, headerRowCount, templateDataRow) => {
                if (!destTbl || !srcTbl) return;
                const srcTblSz = Array.from(srcTbl.children).find(c => c.localName === 'sz');
                const destTblSz = Array.from(destTbl.children).find(c => c.localName === 'sz');
                if (srcTblSz && destTblSz) {
                    ['width', 'height', 'widthRelTo', 'heightRelTo'].forEach(attr => {
                        const v = srcTblSz.getAttribute(attr);
                        if (v != null) destTblSz.setAttribute(attr, v);
                    });
                }
                if (srcTbl.getAttribute('colCnt')) destTbl.setAttribute('colCnt', srcTbl.getAttribute('colCnt'));
                if (srcTbl.getAttribute('rowCnt')) destTbl.setAttribute('rowCnt', srcTbl.getAttribute('rowCnt'));
                const srcRows = Array.from(srcTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === srcTbl);
                const destRows = Array.from(destTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === destTbl);
                srcRows.forEach((srcRow, i) => {
                    if (!destRows[i]) return;
                    copyRowCellSizesFromTemplate(destRows[i], srcRow);
                });
                if (templateDataRow) {
                    destRows.slice(headerRowCount).forEach(row => copyRowCellSizesFromTemplate(row, templateDataRow));
                }
            };
            const stripPhotoTblRightHalf = (tbl) => {
                Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl).forEach(tr => {
                    Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        const col = addr ? parseInt(addr.getAttribute('colAddr') || '0', 10) : 0;
                        if (col >= 3 && tc.parentNode) tc.parentNode.removeChild(tc);
                    });
                });
                tbl.setAttribute('colCnt', '3');
                const firstRow = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).find(tr => tr.parentNode === tbl);
                let width = 0;
                if (firstRow) {
                    Array.from(firstRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                        const csz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                        if (csz) width += parseInt(csz.getAttribute('width') || '0', 10) || 0;
                    });
                }
                const sz = Array.from(tbl.children).find(c => c.localName === 'sz');
                if (sz && width > 0) sz.setAttribute('width', String(width));
            };
            const removeParaRange = (fromP, toP) => {
                const all = secChildren();
                const start = all.indexOf(fromP);
                const end = toP ? all.indexOf(toP) : all.length;
                if (start < 0 || end < 0 || end <= start) return;
                for (let i = end - 1; i >= start; i--) sec.removeChild(all[i]);
            };

            // 사진/위치도 이미지 삽입에 공용으로 쓰는 헬퍼들 (한 곳에서만 관리해 여러 층에서
            // 다르게 어긋나지 않게 한다). Storage URL(https)도 dataURL과 같이 처리한다.
            const dataUrlToBytes = (src) => imageSrcToBytes(src);
            const loadImageSize = (src) => loadImageNaturalSize(src);
            // 사진 1장을 표 안의 hp:pic 하나에 앉히는 작업. curSz/scaMatrix가 서로 어긋나면 비율이
            // 깨져 보이는 걸 검증 과정에서 확인해서, orgSz/curSz/scaMatrix를 전부 일치시켜 계산한다.
            // maxW/maxH는 그 hp:pic이 원래 차지하던 표시 박스 크기(넘지 않게 fit)다.
            const setPicImage = (pic, imgId, pxW, pxH, maxW, maxH) => {
                pic.getElementsByTagNameNS(HC_NS, 'img')[0].setAttribute('binaryItemIDRef', imgId);
                pic.removeAttribute('thumbnailBinIDRef');
                const orgW = pxW * 100, orgH = pxH * 100;
                pic.getElementsByTagNameNS(HP_NS, 'orgSz')[0].setAttribute('width', String(orgW));
                pic.getElementsByTagNameNS(HP_NS, 'orgSz')[0].setAttribute('height', String(orgH));
                const aspect = pxW / pxH;
                const boxAspect = maxW / maxH;
                let curW, curH;
                if (aspect >= boxAspect) { curW = maxW; curH = Math.round(maxW / aspect); }
                else { curH = maxH; curW = Math.round(maxH * aspect); }
                pic.getElementsByTagNameNS(HP_NS, 'curSz')[0].setAttribute('width', String(curW));
                pic.getElementsByTagNameNS(HP_NS, 'curSz')[0].setAttribute('height', String(curH));
                Array.from(pic.children).filter(c => c.localName === 'sz').forEach(sz => {
                    sz.setAttribute('width', String(curW));
                    sz.setAttribute('height', String(curH));
                });
                const rect = pic.getElementsByTagNameNS(HP_NS, 'imgRect')[0];
                rect.getElementsByTagNameNS(HC_NS, 'pt1')[0].setAttribute('x', String(orgW));
                const pt2 = rect.getElementsByTagNameNS(HC_NS, 'pt2')[0];
                pt2.setAttribute('x', String(orgW)); pt2.setAttribute('y', String(orgH));
                rect.getElementsByTagNameNS(HC_NS, 'pt3')[0].setAttribute('y', String(orgH));
                const dimW = Math.round(orgW * 0.2095), dimH = Math.round(orgH * 0.2090);
                const clip = pic.getElementsByTagNameNS(HP_NS, 'imgClip')[0];
                clip.setAttribute('right', String(dimW)); clip.setAttribute('bottom', String(dimH));
                const dim = pic.getElementsByTagNameNS(HP_NS, 'imgDim')[0];
                dim.setAttribute('dimwidth', String(dimW)); dim.setAttribute('dimheight', String(dimH));
                const cmt = pic.getElementsByTagNameNS(HP_NS, 'shapeComment')[0];
                if (cmt) cmt.textContent = '';
                const sca = pic.getElementsByTagNameNS(HC_NS, 'scaMatrix')[0];
                sca.setAttribute('e1', String(curW / orgW));
                sca.setAttribute('e5', String(curH / orgH));
                const rot = pic.getElementsByTagNameNS(HP_NS, 'rotationInfo')[0];
                if (rot) { rot.setAttribute('centerX', String(Math.round(curW / 2))); rot.setAttribute('centerY', String(Math.round(curH / 2))); }
            };

            // 사진 갤러리와 위치도가 새로 추가하는 이미지의 매니페스트 항목을 여기에 같이 모았다가
            // 마지막에 한 번만 content.hpf에 반영한다.
            const manifestAdds = [];
            // 여러 층에 걸쳐 이미지/표를 새로 만들 때 id가 서로 겹치지 않도록 함수 전체에서 카운터를 공유한다.
            let imgCounter = 0;
            let photoTblCounter = 0;

            // ---- 템플릿에 있는 "N) 층명" 블록(상태조사표+사진첩+위치도) 찾기 ----
            // 템플릿에는 이 블록이 표본으로 1개만 들어있다(여러 개 남아있어도 첫 번째만 "틀"로 쓰고
            // 나머지는 지운다). 이 틀을 실제 건물의 층 수만큼 복제해서 채우므로, 표본 문서에 층이 몇
            // 개 있었는지와 무관하게 건물에 등록된 층 수만큼 그대로 내보낼 수 있다. 표 ID를 하드코딩
            // 하는 대신 구조(제목 문단 → 상태조사표 → "사진1위치..."로 시작하는 사진첩 → pic 1개짜리
            // 위치도)로 찾아서, 표본 문서가 조금 바뀌어도 잘 깨지지 않게 한다.
            const floorTitleRe = /^\d+\)\s*.+층/;
            // 표본 문서는 원본 건물의 그 층 결함이 많았으면 상태조사표가 애초에 표 여러 개(이어지는
            // 페이지)로 나뉘어 있을 수 있다. 사진첩이 나오기 전까지 등장하는 현재 서식 표를
            // statusTbls로 모은다. 1·2종은 신가병원 서식(조사내용/크기/부재 분류), 3종은 칠산타워
            // 서식(No./구분/부재 분류/점검내용). 옛 "부재종류" 10칸 표·1·2종 잔여 표는 버린다.
            const isCurrentStatusTable = (tbl) => {
                const firstRow = tbl.getElementsByTagNameNS(HP_NS, 'tr')[0];
                if (!firstRow) return false;
                const headerJoined = Array.from(firstRow.getElementsByTagNameNS(HP_NS, 't'))
                    .map(t => t.textContent || '').join('').replace(/\s+/g, '');
                return headerJoined.includes('구분(NO') && headerJoined.includes('조사내용')
                    && (headerJoined.includes('크기(mm') || headerJoined.includes('크기'))
                    && !headerJoined.includes('부재종류');
            };
            const discoverFloorSlots = () => {
                const ps = secChildren();
                const starts = [];
                ps.forEach((p, i) => { if (floorTitleRe.test(paraText(p).trim())) starts.push(i); });
                const slots = [];
                for (let idx = 0; idx < starts.length; idx++) {
                    const s = starts[idx];
                    const e = idx + 1 < starts.length ? starts[idx + 1] : ps.length;
                    const statusTbls = [];
                    let photoTbl = null, locationMapTbl = null;
                    for (let i = s; i < e; i++) {
                        const txt = paraText(ps[i]).trim();
                        const tbls = Array.from(ps[i].getElementsByTagNameNS(HP_NS, 'tbl'));
                        if (tbls.length === 0) continue;
                        // 제목 문단(i===s): 상태조사표만 수집. 사진 판정은 하지 않음.
                        if (i === s) {
                            tbls.forEach((tbl) => {
                                if (isCurrentStatusTable(tbl)) statusTbls.push(tbl);
                            });
                            continue;
                        }
                        if (!photoTbl && /^사진1/.test(txt)) { photoTbl = tbls[0]; continue; }
                        if (!photoTbl) {
                            // 한 문단 안에 표가 여러 개 겹쳐 들어있는 경우가 있다(옛 포맷을 새 포맷으로
                            // 바꿀 때 지우지 않고 그 옆/위에 새로 붙여넣은 흔적으로 보임). 예전에는
                            // tbls[0]만 보고 판단해서, 같은 문단의 두 번째/세 번째 표(대개 옛 포맷 잔여
                            // 표)는 아예 검사조차 안 되고 영구히 남아 있었다 — 그 결과 층마다 옛 표가
                            // 그대로 복제되어 "16~45번" 같은 표본 잔여 표가 문서 곳곳에 반복해서 끼어
                            // 나오는 문제가 있었다. 문단 안의 표를 전부 하나씩 검사해서, 새 포맷이면
                            // statusTbls에 담고 옛 포맷이면 그 표만 지운다. 표를 담은 hp:run을 통째로
                            // 지우면 안 되는데(사진 갤러리처럼 표 여러 개가 같은 hp:run 안에 나란히
                            // 들어있는 경우가 있어서, run을 지우면 그 안에 같이 있던 정상 표까지
                            // 같이 사라진다 — 실제로 이 버그로 정상 표까지 날아간 적 있었음), 그래서
                            // tbl 엘리먼트 자체만 그 부모에서 떼어낸다. 그 문단에 남는 표가 하나도
                            // 없게 되면(옛 포맷 표만 혼자 문단을 차지하고 있던 경우) 문단 자체를
                            // 통째로 지운다 — 안 지우면 그 문단이 갖고 있던 pageBreak="1" 속성이
                            // 빈 문단인 채로 그대로 남아서, 표 다음에 빈 페이지가 하나 끼어 들어가는
                            // 문제가 있었다.
                            let keptAnyInPara = false;
                            tbls.forEach(tbl => {
                                if (isCurrentStatusTable(tbl)) {
                                    statusTbls.push(tbl);
                                    keptAnyInPara = true;
                                } else if (tbl.parentNode) {
                                    tbl.parentNode.removeChild(tbl);
                                }
                            });
                            if (!keptAnyInPara && ps[i].parentNode) ps[i].parentNode.removeChild(ps[i]);
                        }
                    }
                    for (let i = e - 1; i > s; i--) {
                        const tbls = Array.from(ps[i].getElementsByTagNameNS(HP_NS, 'tbl'));
                        if (tbls.length === 1 && tbls[0].getElementsByTagNameNS(HP_NS, 'pic').length === 1) { locationMapTbl = tbls[0]; break; }
                    }
                    if (statusTbls.length > 0 && photoTbl && (locationMapTbl)) {
                        slots.push({ titlePara: ps[s], statusTbls, photoTbl, locationMapTbl });
                    }
                }
                return slots;
            };
            // 표본 블록이 여러 개 남아있어도(예: 아직 안 줄인 옛 템플릿) 첫 번째만 "틀"로 쓰고 나머지는
            // 지운다 — 이 시점부터 문서 끝까지가 그 "틀" 블록 하나만 남는다(층 블록이 문서의 마지막
            // 섹션이라 안전하게 지울 수 있다). discoverFloorSlots()가 인식한 "유효한" 슬롯 개수
            // (floorSlots.length)만 보고 판단하면, 두 번째 이후 블록이 옛 포맷 표라 isCurrentStatusTable을
            // 통과 못해 slot 자체가 무효 처리되는 경우(그 표만 stale로 지워지고 사진첩/위치도는 남음) 이
            // "여러 개 남음"을 놓쳐서 정리가 아예 안 되고, 그 뒤의 옛 표본 블록들이 통째로 "틀"에 딸려
            // 들어가 실제 층 수만큼 복제되는 사고가 있었다(내보낸 문서에 표본 사진/표가 몇 배로 불어나
            // 뒤섞여 나오고, 정작 뒤쪽 실제 층의 상태조사표는 밀려서 안 채워짐). 그래서 슬롯 유효성과
            // 무관하게, "N) 층명" 형식 문단이 원문에 몇 개 있었는지(rawFloorTitleParas)부터 먼저 보고
            // 두 번째 문단부터는 무조건 지운다.
            const rawFloorTitleParas = secChildren().filter(p => floorTitleRe.test(paraText(p).trim()));
            if (rawFloorTitleParas.length > 1) {
                removeParaRange(rawFloorTitleParas[1], null);
            }
            let floorSlots = discoverFloorSlots();
            if (!floorSlots.length) throw new Error('템플릿에서 상태조사표 블록을 찾지 못했습니다.');
            // 비파괴 장비조사 사진첩(2026-09-28)의 틀 — 층 블록을 채우기 전에 떠 둔다
            // (소제목 = "1) 층" 제목 문단, 사진 표·문단 = 결함 사진첩의 사진 2장짜리 표)
            const ndtAlbumSubHeadingStamp = floorSlots[0].titlePara.cloneNode(true);
            const ndtAlbumPhotoTblStamp = floorSlots[0].photoTbl ? floorSlots[0].photoTbl.cloneNode(true) : null;
            let ndtAlbumPhotoParaStamp = floorSlots[0].photoTbl ? floorSlots[0].photoTbl.parentNode : null;
            while (ndtAlbumPhotoParaStamp && ndtAlbumPhotoParaStamp.localName !== 'p') ndtAlbumPhotoParaStamp = ndtAlbumPhotoParaStamp.parentNode;
            if (ndtAlbumPhotoParaStamp) ndtAlbumPhotoParaStamp = ndtAlbumPhotoParaStamp.cloneNode(true);
            let ndtAlbumTitlePara = null;   // 우리가 넣은 사진첩 제목 — 아래 "표본 사진첩 지우기"가 건드리지 않게

            // 신가병원/칠산타워 서식은 칸 너비가 이미 맞춰져 있어, 옛 10칸(부재종류/결함크기)용
            // 폭 재배분은 적용하지 않는다.

            // "틀" 블록(첫 번째 층 블록, 제목 문단부터 문서 끝까지)을 실제 층 수만큼 복제한다. 복제한
            // 표/사진 안의 hp:tbl·hp:pic id가 원본과 겹치면 한글이 문서 구조를 제대로 못 읽어 열람 중
            // 멈추거나 먹통이 될 수 있어서, 복제할 때마다 새 id를 부여한다.
            let cloneIdSeq = 0;
            const reassignClonedIds = (paragraphs) => {
                paragraphs.forEach(p => {
                    Array.from(p.getElementsByTagNameNS(HP_NS, 'tbl')).forEach(tbl => {
                        cloneIdSeq++;
                        tbl.setAttribute('id', String(8300000 + cloneIdSeq));
                    });
                    Array.from(p.getElementsByTagNameNS(HP_NS, 'pic')).forEach(pic => {
                        cloneIdSeq++;
                        pic.setAttribute('id', String(8400000 + cloneIdSeq));
                        pic.setAttribute('instid', String(8500000 + cloneIdSeq));
                    });
                });
            };
            // 여분 샘플 상태조사표(NO.16/31/46…)만 제거. 첫 장(statusTbls[0])은 유지.
            // keep 표가 들어 있는 문단은 통째로 지우지 않는다 — 1·2종 정밀은 1번 표가
            // 제목 다음 문단에 있고 같은 문단에 여분 샘플 표가 더 있다.
            hwpxSlotApi.stripExcessStampStatusTables(floorSlots[0]);

            const stampChildren = secChildren();
            const stampParas = stampChildren.slice(stampChildren.indexOf(floorSlots[0].titlePara));
            for (let c = 1; c < floorsData.length; c++) {
                const cloned = stampParas.map(p => p.cloneNode(true));
                reassignClonedIds(cloned);
                hwpxSlotApi.stripSecPrRunsFromClonedParas(cloned, HP_NS);
                cloned.forEach(p => sec.appendChild(p));
            }
            floorSlots = discoverFloorSlots();
            if (!floorSlots.length) {
                throw new Error('템플릿에서 상태조사표 블록을 찾지 못했습니다. (표본 표 정리 후 슬롯이 사라졌습니다)');
            }
            if (floorsData.length > floorSlots.length) {
                console.error(`층 블록 복제 결과(${floorSlots.length}개)가 필요한 층 수(${floorsData.length}개)보다 적습니다.`);
                floorsData.length = floorSlots.length;
            }

            // 사진은 로컬(IndexedDB)에도, 온라인 동기화 중이면 클라우드(Firestore)에도 있을 수 있는데,
            // 층 진입 직후 곧바로 내보내면 아직 photos 배열이 안 채워졌을 수 있다. 여기서 한 번 더
            // 직접 확인해서 photoIds는 있는데 photos가 비어있는 결함은 그 자리에서 채워 넣는다.
            // (로컬에 없으면 클라우드에서도 찾아본다 — hydrateDefectPhotos와 같은 방식)
            const companyPhotosCol = (db && window.state.companyId)
                ? db.collection('safety_app').doc(getCompanyDocId()).collection('photos')
                : null;
            if (!window._photoCache) window._photoCache = {};
            if (typeof window.updateLoadingText === 'function') {
                window.updateLoadingText('한글(hwpx) 위치도 도면 준비 중...');
            }
            if (dongParts) {
                for (const p of dongParts) await preloadFloorDrawings(p.bldg);
            } else {
                await preloadFloorDrawings(window.state.currentBuilding || bldg);
            }

            // 도면에 결함 핀이 찍힌 위치도 이미지를 만들어 locationMapTbl 한 칸에 채워 넣는다. 1,2종은
            // 층 블록 안에서(아래 본 루프에서) 바로 호출하고, 3종은 모든 층 처리가 끝난 뒤 별도로 몰아서
            // 호출한다(fillLocationMapForFloor 자체는 어느 쪽이든 동일).
            // 도면이 없어 못 넣었으면 false를 돌려준다(외부처럼 면이 여러 개일 때 빈 칸 정리용).
            const fillLocationMapForFloor = async (locationMapTbl, floorCode, imgSeq, opts) => {
                try {
                    const bldgForMap = hwpxRenderBuilding();

                    // getFloorDrawingSrc()는 정확한 층 코드로 도면을 못 찾으면 "층 코드에 포함된
                    // 숫자가 비슷한 다른 층 도면"까지 갖다 쓰는 폴백이 있어(예: 지하1층 "B1F"가
                    // 지상1층 "1F" 도면과 섞여버림), 위치도만큼은 그 폴백을 타지 않도록 정확히
                    // 일치하는 도면이 있는지 직접 먼저 확인한다. 못 찾으면 그냥 위치도를 뺀다.
                    if (!bldgForMap.floorDrawings) bldgForMap.floorDrawings = {};
                    // 층별 래스터를 IDB/클라우드에서 정확히 채운 뒤, 오염된 캐시는 버린다.
                    if (typeof hydrateFloorDrawingFromCloud === 'function') {
                        try {
                            await hydrateFloorDrawingFromCloud(bldgForMap, floorCode, { localOnly: false });
                        } catch (e) { /* 도면 없음 */ }
                    } else if (!bldgForMap.floorDrawings[floorCode]) {
                        const idbDrawing = await idbGet('floorDrawings', `${bldgForMap.id}_${floorCode}`);
                        if (idbDrawing) bldgForMap.floorDrawings[floorCode] = idbDrawing;
                    }
                    const cacheKey = `${bldgForMap.id}_${floorCode}`;
                    if (state.floorImageCache) delete state.floorImageCache[cacheKey];
                    const hasExactDrawing = (typeof isUsableRasterDrawingUrl === 'function')
                        ? isUsableRasterDrawingUrl(bldgForMap.floorDrawings[floorCode])
                        : !!bldgForMap.floorDrawings[floorCode];

                    let mapDataUrl = null;
                    if (hasExactDrawing) {
                        mapDataUrl = renderFloorPlanCanvasDataUrl(floorCode);
                        if (!mapDataUrl) {
                            const src = bldgForMap.floorDrawings[floorCode];
                            await new Promise((resolve) => {
                                const img = new Image();
                                img.onload = () => {
                                    if (!state.floorImageCache) state.floorImageCache = {};
                                    state.floorImageCache[cacheKey] = img;
                                    resolve();
                                };
                                img.onerror = () => resolve();
                                img.src = src;
                            });
                            mapDataUrl = renderFloorPlanCanvasDataUrl(floorCode);
                        }
                    }
                    if (mapDataUrl) {
                        const mapPic = locationMapTbl.getElementsByTagNameNS(HP_NS, 'pic')[0];
                        // 기존에는 표본 그림 자체의 curSz(표본 도면 비율에 맞춰 이미 안쪽으로 줄어들어
                        // 있던 크기)를 그대로 "박스"로 썼다. 그 표본 그림이 이 칸(cell)보다 작게
                        // 앉혀져 있던 경우, 우리 도면도 그 작은 박스 안에서만 맞춰져서 칸 여백이
                        // 실제보다 훨씬 크게 남았다. 칸 자체의 실제 여유 공간(셀 크기 - 안쪽 여백)을
                        // 박스로 써서 도면이 칸을 최대한 꽉 채우도록 한다(비율은 그대로 유지, 잘리지
                        // 않게 안쪽에 맞추는 것만 동일).
                        let mapCell = mapPic.parentNode;
                        while (mapCell && mapCell.localName !== 'tc') mapCell = mapCell.parentNode;
                        const cellSz = mapCell && mapCell.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                        const cellMargin = mapCell && mapCell.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                        const picCurSz = mapPic.getElementsByTagNameNS(HP_NS, 'curSz')[0];
                        let mapMaxW = parseInt(picCurSz.getAttribute('width'), 10);
                        let mapMaxH = parseInt(picCurSz.getAttribute('height'), 10);
                        if (cellSz) {
                            const marginL = cellMargin ? parseInt(cellMargin.getAttribute('left'), 10) : 0;
                            const marginR = cellMargin ? parseInt(cellMargin.getAttribute('right'), 10) : 0;
                            const marginT = cellMargin ? parseInt(cellMargin.getAttribute('top'), 10) : 0;
                            const marginB = cellMargin ? parseInt(cellMargin.getAttribute('bottom'), 10) : 0;
                            mapMaxW = parseInt(cellSz.getAttribute('width'), 10) - marginL - marginR;
                            mapMaxH = parseInt(cellSz.getAttribute('height'), 10) - marginT - marginB;
                        }
                        const { bytes, mime, ext } = await dataUrlToBytes(mapDataUrl);
                        const size = await loadImageSize(mapDataUrl);
                        const mapImgId = `locationMapAuto${imgSeq}`;
                        zip.file(`BinData/${mapImgId}.${ext}`, bytes);
                        manifestAdds.push(`<opf:item id="${mapImgId}" href="BinData/${mapImgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                        setPicImage(mapPic, mapImgId, size.w, size.h, mapMaxW, mapMaxH);

                        const captionTc = locationMapTbl.getElementsByTagNameNS(HP_NS, 'tc')[1];
                        const captionT = captionTc.getElementsByTagNameNS(HP_NS, 't')[0];
                        if (captionT) captionT.textContent = `${HWPX_FIG_MARK}${getFloorLabel(floorCode)} 상태조사위치도`;
                        return true;
                    }
                    if (!(opts && opts.silent)) {
                        window.showToast(`${getFloorLabel(floorCode)}에 등록된 도면이 없어 위치도는 제외하고 만듭니다.`, 'info', 4000);
                    }
                    return false;
                } catch (mapErr) {
                    console.error(`${floorCode} 위치도 삽입 실패(나머지는 계속 진행):`, mapErr);
                    window.showToast(`${getFloorLabel(floorCode)} 위치도 삽입 중 오류가 있어 위치도는 제외하고 만듭니다.`, 'warning', 4000);
                    return false;
                }
            };

            /**
             * 이 페이지에 넣을 위치도의 층 코드들.
             *
             * 건축물 외부는 상태조사표가 하나(EXT)지만 도면은 현장마다 다르게 쓴다.
             *  - 배치도 한 장에 몰아서 찍는 경우 → 핀이 EXT에 있다
             *  - 입면도(정면·배면·좌측·우측)에 나눠 찍는 경우 → 핀이 EXT_S·EXT_BACK… 에 있다
             * 그런데 위치도는 층 코드 하나로만 도면을 찾아서, EXT에 도면이 없으면 외부
             * 위치도가 통째로 빠졌다. 두 방식 모두 되도록 **핀이 있는 코드마다** 넣는다.
             * (2026-09-21)
             */
            const locationMapCodesForPage = (entry, fallbackCode) => {
                if (!entry || !entry.exteriorCombined) return [fallbackCode];
                const fi = window.BSA && window.BSA.floorIdentity;
                const hasDefects = (code) => {
                    const arr = (window.state.defects || {})[`${bldgId}_${code}`];
                    return Array.isArray(arr) && arr.length > 0;
                };
                const codes = (fi && typeof fi.exteriorLocationMapCodes === 'function')
                    ? fi.exteriorLocationMapCodes(fallbackCode, entry.exteriorFloorCodes, hasDefects)
                    : [fallbackCode];
                return codes.length ? codes : [fallbackCode];
            };

            for (let slotIdx = 0; slotIdx < floorsData.length; slotIdx++) {
                const { floorCode, pageDefects } = floorsData[slotIdx];
                useDongOf(floorsData[slotIdx]);
                const slot = floorSlots[slotIdx];
                if (typeof window.updateLoadingText === 'function') {
                    window.updateLoadingText(`한글(hwpx) 상태조사표 생성 중... (${slotIdx + 1}/${floorsData.length} 층)`);
                }
                if (typeof yieldToUi === 'function') await yieldToUi();

                // 표 바로 위에는 원본 표본 문서의 "1) 지하1층" 같은 고정 텍스트 문단이 그대로
                // 남아있었다. 실제 층 이름으로 바꾸되, 표본 문서와 같은 "N) 층명" 형식을 유지하도록
                // 건물에 등록된 층 순서를 그대로 번호로 붙인다(1)부터 slotIdx+1).
                {
                    const t = slot.titlePara.getElementsByTagNameNS(HP_NS, 't')[0];
                    if (t) {
                        const extCombined = !!(floorsData[slotIdx] && floorsData[slotIdx].exteriorCombined);
                        const titleFloor = extCombined ? `${dongTitlePrefix()}건축물 외부` : getFloorLabel(floorCode);
                        t.textContent = `${slotIdx + 1}) ${titleFloor} `; // 제목 글자와 표 사이 스페이스 1
                        normalizeHwpxTitleParaFont(slot.titlePara, t, await hwpxCharPrHeightsFromZip(zip));
                    }
                    if (slotIdx === 0) {
                        const dongPara = slot.titlePara.previousElementSibling;
                        if (dongPara && dongPara.localName === 'p') {
                            const dt = dongPara.getElementsByTagNameNS(HP_NS, 't')[0];
                            if (dt) dt.textContent = '';
                        }
                    }
                }

                // ---- 상태조사표 ----
                // slot.statusTbls는 이 층 블록에 "지금 실제로 존재하는" 상태조사표 페이지들이다(표본
                // 문서가 원래 그 층에 여러 페이지를 갖고 있었다면 여러 개, 아니면 1개). 결함 개수에
                // 맞는 페이지 수(15건당 1페이지)와 비교해서 모자라면 복제로 늘리고, 남으면 지운다 —
                // 표본 페이지를 그대로 남겨두면 실제 데이터 사이에 표본 데이터가 섞여 나온다.
                slot.statusTbls.forEach(widenGrade12SurveyLocationCol);
                const targetTbl = slot.statusTbls[0];
                const headerRow1Text = (() => {
                    const trs = Array.from(targetTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === targetTbl);
                    if (trs.length < 2) return '';
                    return Array.from(trs[1].getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent || '').join('');
                })();
                const HEADER_ROW_COUNT = (headerRow1Text.includes('구조부재') || headerRow1Text.includes('비구조부재')) ? 2 : 1;
                const allTrs = Array.from(targetTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === targetTbl);
                const dataRows = allTrs.slice(HEADER_ROW_COUNT);
                if (dataRows.length < 1) {
                    console.error(`${floorCode}: 템플릿 표의 데이터 행 스타일을 판별할 수 없어 이 층은 건너뜁니다.`);
                    continue;
                }

                const borderStyleByCol = (row) => {
                    const map = {};
                    Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        if (addr) map[addr.getAttribute('colAddr')] = tc.getAttribute('borderFillIDRef');
                    });
                    return map;
                };
                const firstStyleRow = dataRows[0];
                const normalStyleRow = dataRows[Math.min(1, dataRows.length - 1)];
                const styleMaps = {
                    first: borderStyleByCol(firstStyleRow),
                    normal: borderStyleByCol(normalStyleRow),
                    last: borderStyleByCol(dataRows[dataRows.length - 1])
                };

                // 기존에 있던 페이지(targetTbl 포함 전부)의 표본 데이터 행을 지운다.
                slot.statusTbls.forEach(tbl => {
                    Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl).slice(HEADER_ROW_COUNT).forEach(tr => tbl.removeChild(tr));
                });

                // 표 하나에 행을 전부 몰아넣으면 한글에서 다음 페이지로 안 넘어가거나 열람 중
                // 멈추는 문제가 있었다. 15행(최대 17, n-n 추가분)마다 표를 나누고, 가능하면
                // 본번호가 15·30·45에서 끝나게 한다.
                const surveyPages = paginateSurveyDefects(pageDefects);
                const neededPages = Math.max(1, surveyPages.length);

                let pageTbls = slot.statusTbls.slice();
                if (pageTbls.length > neededPages) {
                    pageTbls.slice(neededPages).forEach(tbl => {
                        const p = tbl.parentNode.parentNode;
                        if (p.parentNode) p.parentNode.removeChild(p);
                    });
                    pageTbls = pageTbls.slice(0, neededPages);
                } else if (pageTbls.length < neededPages) {
                    let insertAfterNode = (() => {
                        let p = pageTbls[pageTbls.length - 1];
                        while (p && p.localName !== 'p') p = p.parentNode;
                        return p || pageTbls[pageTbls.length - 1].parentNode;
                    })();
                    for (let n = pageTbls.length; n < neededPages; n++) {
                        const clonedPara = insertAfterNode.cloneNode(true);
                        clonedPara.setAttribute('pageBreak', '1');
                        if (insertAfterNode === slot.titlePara) {
                            Array.from(clonedPara.childNodes).forEach((ch) => {
                                if (ch.nodeType !== 1) return;
                                if ((ch.localName === 'run' || ch.nodeName === 'hp:run') &&
                                    !ch.getElementsByTagNameNS(HP_NS, 'tbl').length &&
                                    ch.parentNode) {
                                    ch.parentNode.removeChild(ch);
                                }
                            });
                        }
                        const clonedTbl = clonedPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
                        cloneIdSeq++;
                        clonedTbl.setAttribute('id', String(8600000 + cloneIdSeq));
                        insertAfterNode.parentNode.insertBefore(clonedPara, insertAfterNode.nextSibling);
                        insertAfterNode = clonedPara;
                        pageTbls.push(clonedTbl);
                        syncStatusTblLayoutFromTemplate(clonedTbl, targetTbl, HEADER_ROW_COUNT, normalStyleRow);
                    }
                }
                pageTbls.forEach((tbl, i) => {
                    if (i > 0) {
                        tbl.parentNode.parentNode.setAttribute('pageBreak', '1');
                        syncStatusTblLayoutFromTemplate(tbl, targetTbl, HEADER_ROW_COUNT, normalStyleRow);
                    }
                });

                await Promise.all(pageDefects.map(async (d) => {
                    await ensureDefectPhotosLoaded(d);
                }));
                const priorityCompareDefects = [];
                // 결함 한 줄에 사진이 여러 장이면 전부 넣는다(묶음은 구성원 전체) — 사진마다 번호 하나.
                const pagePhotoLists = await Promise.all(pageDefects.map((d) => loadHwpxRowPhotoEntries(d)));
                const photoItems = []; // { d, src, pid, label } — 사진첩 한 칸
                const photoLabelByDefect = new Map();
                pageDefects.forEach((d, dIdx) => {
                    const photoList = pagePhotoLists[dIdx];
                    if (!photoList.length) return;
                    const firstNo = photoItems.length + 1;
                    photoList.forEach((p) => {
                        photoItems.push({ d, src: p.src, pid: p.pid, label: `사진${photoItems.length + 1}` });
                    });
                    photoLabelByDefect.set(d, formatHwpxPhotoRemark(firstNo, photoList.length));
                });

                surveyPages.forEach((pageItems, pageIdx) => {
                    const destTbl = pageTbls[pageIdx];
                    const fitRows12 = [];
                    const canFit12 = !!(window.BSA && window.BSA.shared && window.BSA.shared.hwpxSurveyRowFit);
                    pageItems.forEach((d, localIdx) => {
                        const isLastOnPage = localIdx === pageItems.length - 1;
                        const rowCtx = {
                            floorCode,
                            photoRemark: photoLabelByDefect.get(d) || '-',
                            floorDisplayLabel: rowFloorLabel(floorCode)
                        };
                        const colCount = Array.from(normalStyleRow.getElementsByTagNameNS(HP_NS, 'tc')).length;
                        const values = getReportSurveyRowValues(d, Object.assign({ hwpxUnits: true }, rowCtx), isGrade3, colCount);
                        const gridLocCellRaw = getDefectGridRoomForReport(d, floorCode);
                        const styleMap = localIdx === 0 ? styleMaps.first : (isLastOnPage ? styleMaps.last : styleMaps.normal);

                        const newRow = normalStyleRow.cloneNode(true);
                        copyRowCellSizesFromTemplate(newRow, normalStyleRow);
                        let rowMaxLines = 1;
                        let rowLineMetric = null;
                        Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc, colIdx) => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (addr) {
                                addr.setAttribute('rowAddr', String(HEADER_ROW_COUNT + localIdx));
                                const bf = styleMap[addr.getAttribute('colAddr')];
                                if (bf !== undefined) tc.setAttribute('borderFillIDRef', bf);
                            }
                            const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                            const paras = subList ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList) : [];
                            if (paras.length > 0) {
                                let cellVal = values[colIdx] !== undefined ? values[colIdx] : '';
                                let cellMinChars = 0;
                                // 1·2종 위치 칸(행·열): 칸 폭에 들어가면 한 줄, 넘치면 '/' 뒤에서 줄바꿈 → 다음 줄 실 이름
                                if (colIdx === 1 && gridLocCellRaw && cellVal === gridLocCellRaw) {
                                    // 2026-10-30 1·2종 한글: 실 이름 먼저, 다음 줄 행·열
                                    cellVal = getDefectGridRoomForReport(d, floorCode, undefined, { roomFirst: true }) || cellVal;
                                    const locUnits = hwpxCellTextUnits(tc, paras);
                                    if (locUnits > 0) {
                                        cellVal = getDefectGridRoomForReport(d, floorCode, locUnits, { roomFirst: true }) || cellVal;
                                        cellMinChars = locUnits;
                                    }
                                }
                                const fillInfo = fillCellParas(subList, paras, cellVal, tc, cellMinChars);
                                if (fillInfo.lineCount > rowMaxLines) rowMaxLines = fillInfo.lineCount;
                                if (!rowLineMetric && fillInfo.vertsize) {
                                    const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                                    const marginV = marginEl
                                        ? (parseInt(marginEl.getAttribute('top'), 10) || 0) + (parseInt(marginEl.getAttribute('bottom'), 10) || 0)
                                        : 282;
                                    rowLineMetric = { vertsize: fillInfo.vertsize, spacing: fillInfo.spacing, marginV };
                                }
                            }
                        });
                        if (canFit12) {
                            // 높이는 쪽 단위로 fitHwpxSurveyTablePage12가 정한다(이 행에 필요한 최소 높이만 적어 둔다)
                            const fitApi = window.BSA.shared.hwpxSurveyRowFit;
                            const need = rowLineMetric
                                ? fitApi.lineNeed(rowMaxLines, rowLineMetric.vertsize, rowLineMetric.spacing, rowLineMetric.marginV)
                                : 0;
                            fitRows12.push({ row: newRow, need });
                        } else {
                            // 템플릿 행 높이 유지. 4줄 이상일 때만 확장(자간·줄나눔·상하 강제 축소/확대 없음).
                            applyRowHeightFromLines(newRow, rowMaxLines, rowLineMetric, 2800);
                            Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);
                        }
                        destTbl.appendChild(newRow);
                    });
                    destTbl.setAttribute('rowCnt', String(HEADER_ROW_COUNT + pageItems.length));
                    if (fitRows12.length) fitHwpxSurveyTablePage12(destTbl, fitRows12, { xmlDoc, HP_NS, HEADER_ROW_COUNT, centerCellContent, floorCode });
                });

                // ---- 결함 사진 갤러리 ----
                // 템플릿에는 사진 2장씩 짝지은 표가 같은 hp:run 안에 여러 개 나란히 들어있다. 이걸 전부
                // 지우고, 사진이 있는 결함 개수만큼 이 표를 복제해 다시 채운다. 이 표본 표 제거는 사진이
                // 있을 때만 하면 안 된다 — 사진을 한 장도 안 찍은 층은 photoItems.length가 0이라 이
                // 블록 자체가 통째로 안 돌아서, 표본 건물의 원래 사진이 그대로 남아 나오는 문제가
                // 있었다(우리 결함 사진이 아니라 템플릿 표본 사진이 나옴). 그래서 표본 표 제거는 사진
                // 개수와 무관하게 항상 먼저 하고, 새 표로 채우는 부분만 사진이 있을 때로 한정한다.
                try {
                    const photoTblStamp = slot.photoTblStamp || slot.photoTbl.cloneNode(true);
                    const photoTbl = slot.photoTbl;
                    const photoRun = photoTbl.parentNode; // 사진첩 표 여러 개가 같은 hp:run 안에 나란히 들어있다
                    const existingPhotoTables = Array.from(photoRun.children).filter(c => c.localName === 'tbl');
                    existingPhotoTables.forEach(t => photoRun.removeChild(t));

                    if (photoItems.length > 0) {
                    const items = photoItems;
                    const PHOTOS_PER_PAGE = 6;

                    const tplPics = photoTblStamp.getElementsByTagNameNS(HP_NS, 'pic');
                    if (!tplPics.length) throw new Error('사진첩 템플릿 표에 hp:pic 슬롯이 없습니다.');
                    const maxW = parseInt(tplPics[0].getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('width'), 10);
                    const maxH = parseInt(tplPics[0].getElementsByTagNameNS(HP_NS, 'curSz')[0].getAttribute('height'), 10);

                    const decoded = (await mapLimit(items, 6, async (item) => {
                        const d = item.d;
                        const src0 = item.src;
                        if (!src0) return null;
                        try {
                            const src = await resolveSrcForHwpxEmbed(src0, item.pid);
                            const { bytes, mime, ext } = await dataUrlToBytes(src);
                            const size = await loadImageNaturalSizeFromBytes(bytes, mime);
                            return { d, label: item.label, bytes, mime, ext, w: size.w, h: size.h };
                        } catch (onePhotoErr) {
                            console.warn('사진 1장 임베드 실패(해당 컷만 생략):', d && d.id, onePhotoErr);
                            return null;
                        }
                    })).filter(Boolean);
                    if (!decoded.length) {
                        throw new Error('임베드 가능한 사진이 없습니다. (Storage URL/권한/CORS 확인)');
                    }

                    let photoPara = photoRun.parentNode;
                    while (photoPara && photoPara.localName !== 'p') photoPara = photoPara.parentNode;
                    if (photoPara) photoPara.setAttribute('pageBreak', '1');
                    const emptyPhotoPara = photoPara ? photoPara.cloneNode(true) : null;
                    if (emptyPhotoPara) emptyPhotoPara.setAttribute('pageBreak', '1');

                    let insertRun = photoRun;
                    let insertPara = photoPara;
                    let photosOnPage = 0;

                    const appendPhotoTbl = (tbl) => {
                        ensureTblTreatAsChar(tbl);
                        const trail = Array.from(insertRun.children).find(c => c.localName === 't') || null;
                        if (trail) insertRun.insertBefore(tbl, trail);
                        else insertRun.appendChild(tbl);
                    };
                    const startNextPhotoPage = () => {
                        if (!emptyPhotoPara || !insertPara || !insertPara.parentNode) return;
                        const newPara = emptyPhotoPara.cloneNode(true);
                        newPara.setAttribute('pageBreak', '1');
                        insertPara.parentNode.insertBefore(newPara, insertPara.nextSibling);
                        insertPara = newPara;
                        insertRun = Array.from(newPara.children).find(c => c.localName === 'run') || newPara.getElementsByTagNameNS(HP_NS, 'run')[0];
                        photosOnPage = 0;
                    };

                    for (let i = 0; i < decoded.length; i += 2) {
                        const slot1 = decoded[i];
                        const slot2 = decoded[i + 1] || null;
                        const pairCount = slot2 ? 2 : 1;
                        if (photosOnPage > 0 && photosOnPage + pairCount > PHOTOS_PER_PAGE) {
                            startNextPhotoPage();
                        }

                        photoTblCounter++;
                        const newTbl = photoTblStamp.cloneNode(true);
                        newTbl.setAttribute('id', String(9500000 + photoTblCounter));
                        const pics = Array.from(newTbl.getElementsByTagNameNS(HP_NS, 'pic'));
                        pics.forEach((p, pIdx) => {
                            p.setAttribute('id', String(9600000 + photoTblCounter * 2 + pIdx));
                            p.setAttribute('instid', String(9700000 + photoTblCounter * 2 + pIdx));
                        });

                        const trs2 = Array.from(newTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === newTbl);
                        const capTcs = trs2[1].getElementsByTagNameNS(HP_NS, 'tc');
                        const descTcs = trs2[2].getElementsByTagNameNS(HP_NS, 'tc');

                        imgCounter++;
                        const imgId1 = `photoAuto${imgCounter}`;
                        zip.file(`BinData/${imgId1}.${slot1.ext}`, slot1.bytes);
                        manifestAdds.push(`<opf:item id="${imgId1}" href="BinData/${imgId1}.${slot1.ext}" media-type="${slot1.mime}" isEmbeded="1"/>`);
                        setPicImage(pics[0], imgId1, slot1.w, slot1.h, maxW, maxH);
                        setTcText(capTcs[0], slot1.label);
                        setHwpxPhotoLocText(capTcs[2], slot1.d, floorCode);
                        setTcText(descTcs[1], [surveyContentComponentText(slot1.d), getSurveyCellText('defectType', slot1.d)].map(t => (t || '').trim()).filter(t => t && t !== '-').join(' ') || '-');

                        if (slot2) {
                            imgCounter++;
                            const imgId2 = `photoAuto${imgCounter}`;
                            zip.file(`BinData/${imgId2}.${slot2.ext}`, slot2.bytes);
                            manifestAdds.push(`<opf:item id="${imgId2}" href="BinData/${imgId2}.${slot2.ext}" media-type="${slot2.mime}" isEmbeded="1"/>`);
                            setPicImage(pics[1], imgId2, slot2.w, slot2.h, maxW, maxH);
                            setTcText(capTcs[4], slot2.label);
                            setHwpxPhotoLocText(capTcs[6], slot2.d, floorCode);
                            setTcText(descTcs[3], [surveyContentComponentText(slot2.d), getSurveyCellText('defectType', slot2.d)].map(t => (t || '').trim()).filter(t => t && t !== '-').join(' ') || '-');
                        } else {
                            stripPhotoTblRightHalf(newTbl);
                        }

                        appendPhotoTbl(newTbl);
                        photosOnPage += pairCount;
                    }
                    }
                } catch (photoErr) {
                    console.error(`${floorCode} 사진 갤러리 삽입 실패(나머지는 계속 진행):`, photoErr);
                    window.showToast(`${getFloorLabel(floorCode)} 사진 삽입 중 오류가 있어 사진은 제외하고 만듭니다.`, 'warning', 5000);
                }


                // ---- 결함위치도 ----
                // 3종시설물은 위치도를 층 블록에서 바로 넣지 않고, 모든 층 처리가 끝난 뒤 별도로
                // 몰아서 넣는다(아래 본 루프 밖의 grade3LocMapStampPara 처리 참고).
                    let locPara = slot.locationMapTbl && slot.locationMapTbl.parentNode;
                    while (locPara && locPara.localName !== 'p') locPara = locPara.parentNode;
                    if (locPara) locPara.setAttribute('pageBreak', '1');
                    // 건축물 외부는 면(정면·배면·좌측·우측)마다 도면이 따로 있어 위치도도 면마다 넣는다.
                    // 도면이 없는 면은 복제한 틀째로 걷어내 빈 위치도가 남지 않게 한다.
                    const mapCodes = locationMapCodesForPage(floorsData[slotIdx], floorCode);
                    let mapSeq = 0;
                    let baseUsed = false;
                    for (const mapCode of mapCodes) {
                        const isBase = !baseUsed;
                        let targetPara = locPara;
                        let targetTbl = slot.locationMapTbl;
                        if (!isBase) {
                            if (!locPara || !locPara.parentNode) break;
                            targetPara = locPara.cloneNode(true);
                            reassignClonedIds([targetPara]);
                            locPara.parentNode.insertBefore(targetPara, locPara.nextSibling);
                            targetTbl = targetPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
                            if (!targetTbl) {
                                targetPara.parentNode.removeChild(targetPara);
                                continue;
                            }
                        }
                        mapSeq += 1;
                        const ok = await fillLocationMapForFloor(
                            targetTbl, mapCode, `${slotIdx + 1}_${mapSeq}`,
                            // 외부는 면이 여러 개라 없는 면마다 안내를 띄우면 시끄럽다
                            { silent: mapCodes.length > 1 }
                        );
                        if (ok) {
                            baseUsed = true;
                            if (!isBase) locPara = targetPara;   // 다음 면은 이 뒤에 붙인다
                        } else if (!isBase) {
                            targetPara.parentNode.removeChild(targetPara);
                        }
                    }
            }

            // 실제로 채운 블록 다음에 남은 표본 층 블록은 (비파괴조사 섹션 정리와 함께) 뒤에서 지운다.
            const unusedFloorSlotStart = floorSlots.length > floorsData.length ? floorSlots[floorsData.length].titlePara : null;

            // 비파괴조사(NDT) 섹션은 아직 여러 층을 지원하지 않아 지금 화면에 보고 있는 층 기준으로만 채운다.
            const floorCode = window.state.currentFloor || (floorsData[0] && floorsData[0].floorCode);
            useDongOf(null);

            // ---- 비파괴조사(NDT) 5개 섹션: 콘크리트 강도/탄산화/외벽기울기/부동침하/부재처짐 ----
            // 정기안전점검용 템플릿(hwpx_survey_template_regular.hwpx)에는 이 섹션들이 애초에 없으므로
            // 정밀안전점검일 때만 실행해서 앱에 등록된 실측 데이터로 채운다. 표 데이터 행 교체 로직
            // (테두리 스타일 3종 판별 → 기존 행 삭제 → clone해서 채우기)은 위 상태조사표와 완전히
            // 동일한 패턴이라 fillNdtTable로 뽑아 재사용한다. 실패해도 이미 만들어둔 상태조사표/사진/
            // 결함위치도는 살려서 내보내야 하므로 전체를 try/catch로 감싼다.
            try { if (isPreciseInspectionForTemplate) {
                const ndtBldg = dongParts ? bldg : (window.state.currentBuilding || {});
                const ndtBldgId = ndtBldg.id || window.state.currentBuildingId;
                // 결과표는 건물 전체 층을 합쳐 채운다. 위치도는 작성한 항목·층만 비동기로
                // 렌더해서 7.1.8부터 캡션을 붙여 넣는다(미작성 항목 제목/표는 제거).
                const { allItems: allNdtItemsForHwpx, allDispGroups: allDispGroupsForHwpx } = (dongParts ? buildHwpxDongNdtData(dongParts) : buildCombinedNdtDataForReport(ndtBldgId));

                const measureItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '실측');
                const fireproofItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '내화피복');
                const strengthItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '강도')
                    .map(item => refreshStrengthItemResults(item, ndtBldgOf(item)));
                const carbItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '탄산화')
                    .map(item => refreshCarbItemResults(item, ndtBldgOf(item)));
                const tiltItemsHwpx = allNdtItemsForHwpx.filter(item => item.category === '기울기');
                const settlementGroupsHwpx = allDispGroupsForHwpx.filter(g => !g.category || g.category === '변위');
                const memberDispGroupsHwpx = allDispGroupsForHwpx.filter(g => g.category === '부재변위');

                const findTblById = (tblId, fallbackTextMarkers) => {
                    const all = xmlDoc.getElementsByTagNameNS(HP_NS, 'tbl');
                    for (let i = 0; i < all.length; i++) {
                        if (all[i].getAttribute('id') === tblId) return all[i];
                    }
                    // 한글에서 템플릿을 직접 열어 저장하면 표 id가 바뀌는 경우가 있어(실제로 겪음),
                    // id로 못 찾으면 표 헤더 글자 조합으로 구조 매칭해 찾는다.
                    if (fallbackTextMarkers && fallbackTextMarkers.length) {
                        for (let i = 0; i < all.length; i++) {
                            const txt = Array.from(all[i].getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent).join('');
                            if (fallbackTextMarkers.every(m => txt.includes(m))) return all[i];
                        }
                    }
                    return null;
                };
                // 표를 통째로 지울 때는 바로 위 제목 문단까지 같이 뗀다(작성 안 한 항목이
                // 제목만 빈 채로 남는 것을 막음).
                const removeNdtTableById = (tblId) => {
                    const tbl = findTblById(tblId);
                    if (!tbl) return;
                    let tblPara = tbl;
                    while (tblPara && tblPara.localName !== 'p') tblPara = tblPara.parentNode;
                    let heading = tblPara && tblPara.previousElementSibling;
                    while (heading && heading.localName === 'p') {
                        const hasTbl = heading.getElementsByTagNameNS(HP_NS, 'tbl').length > 0;
                        const hasPic = heading.getElementsByTagNameNS(HP_NS, 'pic').length > 0;
                        const t = paraText(heading).trim();
                        if (hasTbl || hasPic) break;
                        if (t) {
                            if (heading.parentNode) heading.parentNode.removeChild(heading);
                            break;
                        }
                        const empty = heading;
                        heading = heading.previousElementSibling;
                        if (empty.parentNode) empty.parentNode.removeChild(empty);
                    }
                    let next = tblPara && tblPara.nextElementSibling;
                    if (tblPara && tblPara.parentNode) tblPara.parentNode.removeChild(tblPara);
                    while (next && next.localName === 'p') {
                        const hasTblN = next.getElementsByTagNameNS(HP_NS, 'tbl').length > 0;
                        const hasPicN = next.getElementsByTagNameNS(HP_NS, 'pic').length > 0;
                        const tn = paraText(next).trim();
                        if (hasTblN) break;
                        if (tn && !hasPicN) break;
                        const cur = next;
                        next = next.nextElementSibling;
                        if (cur.parentNode) cur.parentNode.removeChild(cur);
                    }
                };

                // 데이터 행 채우기 (상태조사표의 행 clone 패턴 재사용). headerRowCount개 행은 그대로
                // 두고 그 다음부터 표 끝까지가 데이터 행이다. rowsValues[i]는 colAddr=1번 칸부터 순서대로
                // 들어갈 값 배열이다(0번 칸은 세로로 병합된 표 왼쪽 라벨 칸이라 건드리지 않는다).
                const fillNdtTable = (tbl, headerRowCount, rowsValues, includeCol0 = false) => {
                    const allTrs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl);
                    const oldDataRows = allTrs.slice(headerRowCount);
                    if (oldDataRows.length < 1) return;
                    const borderStyleByColLocal = (row) => {
                        const map = {};
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (addr) map[addr.getAttribute('colAddr')] = tc.getAttribute('borderFillIDRef');
                        });
                        return map;
                    };
                    const firstStyleRow = oldDataRows[0];
                    const normalStyleRow = oldDataRows.length > 2 ? oldDataRows[1] : oldDataRows[0];
                    const lastStyleRow = oldDataRows[oldDataRows.length - 1];
                    const styleMaps = {
                        first: borderStyleByColLocal(firstStyleRow),
                        normal: borderStyleByColLocal(normalStyleRow),
                        last: borderStyleByColLocal(lastStyleRow)
                    };
                    const findCol0 = (row) => Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).find(tc => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        return addr && addr.getAttribute('colAddr') === '0';
                    });
                    // 강도/탄산화/기울기/변위 표는 첫 데이터 행에만 세로 병합(rowSpan)된 숨은 0번 칸
                    // (예: 회사명 라벨)이 있고 그 아래 행들엔 그 칸이 아예 없다. 예전엔 첫 행까지
                    // 통째로 지우고 normalStyleRow(0번 칸 없음)로만 다시 채워서, 표 전체에 0번 칸이
                    // 하나도 안 남는 "구멍 뚫린" 구조가 됐다 — 한글이 이런 표를 열다가 그대로 죽는
                    // 원인이었다. 새로 만드는 행마다 그 칸을 하나씩 옮겨 붙이되 rowSpan은 항상 1로
                    // 둔다 — 여러 행에 걸친 병합 칸 하나로 만들면 그 칸의 높이를 "일반 행 높이 ×
                    // 행 수"로 미리 계산해둬야 하는데, 위치/부재명이 길어 줄바꿈되는 행이 하나라도
                    // 있으면 실제 필요한 높이보다 모자라져서 줄 간격이 들쭉날쭉해진다. 행마다 독립된
                    // 칸으로 두면 각 행이 내용에 맞게 알아서 늘어나도 서로 영향을 안 준다.
                    const firstCol0 = findCol0(firstStyleRow);
                    const normalHasCol0 = !!findCol0(normalStyleRow);
                    const normalRowCellSz = normalStyleRow.getElementsByTagNameNS(HP_NS, 'tc')[0]
                        ?.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                    const normalRowHeight = normalRowCellSz ? parseInt(normalRowCellSz.getAttribute('height'), 10) : null;
                    oldDataRows.forEach(tr => tbl.removeChild(tr));
                    rowsValues.forEach((values, idx) => {
                        const styleMap = idx === 0 ? styleMaps.first : (idx === rowsValues.length - 1 ? styleMaps.last : styleMaps.normal);
                        const newRow = normalStyleRow.cloneNode(true);
                        if (firstCol0 && !normalHasCol0) {
                            const col0Clone = firstCol0.cloneNode(true);
                            const span = col0Clone.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                            if (span) span.setAttribute('rowSpan', '1');
                            const col0Addr = col0Clone.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (col0Addr) col0Addr.setAttribute('rowAddr', String(headerRowCount + idx));
                            if (normalRowHeight) {
                                const col0Sz = col0Clone.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                                if (col0Sz) col0Sz.setAttribute('height', String(normalRowHeight));
                            }
                            // 표본 문서에 남아있던 회사명 등 샘플 글자(세로 병합 칸이라 한 글자씩
                            // 위아래로 쪼개져 나온다) — 우리 데이터로 채우는 칸이 아니라 그대로 지운다.
                            Array.from(col0Clone.getElementsByTagNameNS(HP_NS, 't')).forEach(t => { t.textContent = ''; });
                            newRow.insertBefore(col0Clone, newRow.firstChild);
                        }
                        let rowMaxLines = 1;
                        let rowLineMetric = null;
                        Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (!addr) return;
                            const colAddr = addr.getAttribute('colAddr');
                            addr.setAttribute('rowAddr', String(headerRowCount + idx));
                            const bf = styleMap[colAddr];
                            if (bf !== undefined) tc.setAttribute('borderFillIDRef', bf);
                            if (colAddr === '0' && !includeCol0) return;
                            const colIdx = includeCol0 ? parseInt(colAddr, 10) : parseInt(colAddr, 10) - 1;
                            const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                            const paras = subList ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList) : [];
                            if (paras.length > 0 && values[colIdx] !== undefined) {
                                const fillInfo = fillCellParas(subList, paras, values[colIdx], tc);
                                if (fillInfo.lineCount > rowMaxLines) rowMaxLines = fillInfo.lineCount;
                                if (!rowLineMetric && fillInfo.vertsize) {
                                    const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                                    const marginV = marginEl ? (parseInt(marginEl.getAttribute('top'), 10) || 0) + (parseInt(marginEl.getAttribute('bottom'), 10) || 0) : 282;
                                    rowLineMetric = { vertsize: fillInfo.vertsize, spacing: fillInfo.spacing, marginV };
                                }
                            }
                        });
                        applyRowHeightFromLines(newRow, rowMaxLines, rowLineMetric);
                        Array.from(newRow.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);
                        tbl.appendChild(newRow);
                    });
                    tbl.setAttribute('rowCnt', String(headerRowCount + rowsValues.length));
                };

                // 부동침하/부재변위 결과표 밑에 그룹별 요약박스+그래프 이미지를 순서대로 이어붙이는 도우미.
                // 문서에 이미 있는 hp:pic 하나(콘크리트 강도/탄산화 위치도용)의 XML을 그대로 문자열
                // 템플릿으로 써서 매번 새 문단으로 파싱해 넣는다 — 반발경도 성과표 섹션이 기존 그림
                // 문단을 clone해서 재사용하는 것과 같은 발상이며, id/이미지 참조만 매번 새로 갈아끼운다.
                const PIC_TEMPLATE_XML = '<hp:pic id="ID_PLACEHOLDER" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" thumbnailBinIDRef="" href="" groupLevel="0" instid="0" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="685500" height="864780"/><hp:curSz width="41824" height="52763"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="20912" centerY="26381" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.061012" e2="0" e3="0" e4="0" e5="0.061013" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="image6" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="685500" y="0"/><hc:pt2 x="685500" y="864780"/><hc:pt3 x="0" y="864780"/></hp:imgRect><hp:imgClip left="0" right="578460" top="0" bottom="729780"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="578460" dimheight="729780"/><hp:effects/><hp:sz width="41824" widthRelTo="ABSOLUTE" height="52763" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>';

                const insertImageParaAfter = async (afterPara, dataUrl, imgIdPrefix, maxW = 42520, maxH = 999999999) => {
                    if (!afterPara || !dataUrl) return afterPara;
                    const { bytes, mime, ext } = await dataUrlToBytes(dataUrl);
                    const size = await loadImageSize(dataUrl);
                    const seq = imgCounter++;
                    const imgId = `${imgIdPrefix}${seq}`;
                    zip.file(`BinData/${imgId}.${ext}`, bytes);
                    manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);

                    const picXml = PIC_TEMPLATE_XML.replace('id="ID_PLACEHOLDER"', `id="${900000000 + seq}"`);
                    const picDoc = new DOMParser().parseFromString(
                        `<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${picXml}</root>`, 'application/xml');
                    const picNode = xmlDoc.importNode(picDoc.documentElement.firstChild, true);

                    const newPara = xmlDoc.createElementNS(HP_NS, 'hp:p');
                    newPara.setAttribute('id', '0');
                    newPara.setAttribute('paraPrIDRef', '18');
                    newPara.setAttribute('styleIDRef', '3');
                    newPara.setAttribute('pageBreak', '0');
                    newPara.setAttribute('columnBreak', '0');
                    newPara.setAttribute('merged', '0');
                    const run = xmlDoc.createElementNS(HP_NS, 'hp:run');
                    run.setAttribute('charPrIDRef', '37');
                    run.appendChild(picNode);
                    newPara.appendChild(run);
                    const lineseg = xmlDoc.createElementNS(HP_NS, 'hp:linesegarray');
                    const seg = xmlDoc.createElementNS(HP_NS, 'hp:lineseg');
                    seg.setAttribute('textpos', '0'); seg.setAttribute('vertpos', '0');
                    seg.setAttribute('vertsize', '1300'); seg.setAttribute('textheight', '1300');
                    seg.setAttribute('baseline', '1105'); seg.setAttribute('spacing', '1560');
                    seg.setAttribute('horzpos', '0'); seg.setAttribute('horzsize', '42520');
                    seg.setAttribute('flags', '393216');
                    lineseg.appendChild(seg);
                    newPara.appendChild(lineseg);

                    afterPara.parentNode.insertBefore(newPara, afterPara.nextSibling);
                    setPicImage(picNode, imgId, size.w, size.h, maxW, maxH);
                    return newPara;
                };

                // 결과표(tbl)가 들어있는 문단 바로 다음 자리부터, 그룹마다 요약박스+그래프를 합친
                // 그림 한 장씩 이어붙인다. 박스와 그래프를 따로 넣으면 표 중간에서 페이지가 갈릴 때
                // 각각 다른 페이지로 쪼개질 수 있어서, 한 장(같은 테두리)으로 합쳐 그 문제를 막는다.
                // 높이를 27000(≈95mm)으로 제한해서 페이지 하나에 두 장이 들어가도록(사용자 요청) 맞췄다.
                const GROUP_IMG_MAX_H = 27000;
                const insertGroupResultImages = async (tbl, groups) => {
                    if (!tbl) return;
                    let anchorPara = tbl.parentNode && tbl.parentNode.parentNode; // hp:pic|hp:tbl -> hp:run -> hp:p
                    if (!anchorPara || anchorPara.localName !== 'p') return;
                    for (let i = 0; i < groups.length; i++) {
                        const group = groups[i];
                        // 그래프 제목의 층은 그 그룹이 조사된 층 — 예전엔 지금 화면에 연 층(currentFloor)이 찍혀
                        // 지상1층 부동침하가 "지하1층 주차장"으로 나왔다(2026-09-22)
                        const combinedUrl = renderNdtDisplacementCombinedCanvas(group, group._ndtRealFloorCode || group._ndtFloorCode || floorCode, i + 1);
                        anchorPara = await insertImageParaAfter(anchorPara, combinedUrl, 'ndtDispResultAuto', 42520, GROUP_IMG_MAX_H);
                    }
                };


                // 내화피복 두께 결과표(부재당 플렌지/웨브 2행짜리) — 표 열 구성이 단순 1행/항목이
                // 아니라서(항목 하나 = NO./구분/설계치가 두 행에 걸쳐 세로병합) fillNdtTable을
                // 그대로 못 쓰고 전용 채움 함수를 따로 둔다. 원본 표는 2026-08-24 신설.
                const FIREPROOF_TBL_ID = '504', FIREPROOF_HEADER_ROWS = 1;
                const FIREPROOF_DATA_ROW_H = 2776;
                const fillFireproofTable = (tbl, items) => {
                    const allTrs = Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === tbl);
                    const oldDataRows = allTrs.slice(FIREPROOF_HEADER_ROWS);
                    if (oldDataRows.length < 2) return;

                    const rowHasCol0 = (tr) => Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).some(tc => {
                        const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                        return addr && addr.getAttribute('colAddr') === '0';
                    });
                    const oldPairs = [];
                    for (let i = 0; i < oldDataRows.length - 1; i++) {
                        if (rowHasCol0(oldDataRows[i])) oldPairs.push([oldDataRows[i], oldDataRows[i + 1]]);
                    }
                    if (oldPairs.length === 0) return;
                    const firstPair = oldPairs[0];
                    const normalPair = oldPairs.length > 2 ? oldPairs[1] : oldPairs[0];
                    const lastPair = oldPairs[oldPairs.length - 1];

                    const borderStyleByColLocal = (row) => {
                        const map = {};
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (addr) map[addr.getAttribute('colAddr')] = tc.getAttribute('borderFillIDRef');
                        });
                        return map;
                    };
                    const styleMapsA = { first: borderStyleByColLocal(firstPair[0]), normal: borderStyleByColLocal(normalPair[0]), last: borderStyleByColLocal(lastPair[0]) };
                    const styleMapsB = { first: borderStyleByColLocal(firstPair[1]), normal: borderStyleByColLocal(normalPair[1]), last: borderStyleByColLocal(lastPair[1]) };

                    const setRowAddr = (row, rowAddr) => {
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (addr) addr.setAttribute('rowAddr', String(rowAddr));
                        });
                    };
                    // 칸이 좁아 넘치면 자간을 줄이지 않고, 넘어가는 위치부터 다음 줄로 넘긴다.
                    const setCellText = (row, colAddr, text) => {
                        const tc = Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).find(t => {
                            const addr = t.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            return addr && addr.getAttribute('colAddr') === String(colAddr);
                        });
                        if (!tc) return null;
                        const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
                        const paras = subList ? Array.from(subList.getElementsByTagNameNS(HP_NS, 'p')).filter(p => p.parentNode === subList) : [];
                        if (paras.length === 0) return null;
                        const fillInfo = fillCellParas(subList, paras, text, tc);
                        return { fillInfo, tc };
                    };
                    // 플렌지/웨브 행(newA/newB)도 다른 NDT 표와 마찬가지로, 표본 행이 물려받은 샘플용
                    // 높이 대신 실제 채워지는 줄 수 기준으로 다시 계산한다(내화피복 표도 같은 문제 보고됨).
                    const fillRowCells = (row, entries) => {
                        let rowMaxLines = 1, rowLineMetric = null;
                        entries.forEach(([colAddr, text]) => {
                            const result = setCellText(row, colAddr, text);
                            if (!result) return;
                            const { fillInfo, tc } = result;
                            if (fillInfo.lineCount > rowMaxLines) rowMaxLines = fillInfo.lineCount;
                            if (!rowLineMetric && fillInfo.vertsize) {
                                const marginEl = tc.getElementsByTagNameNS(HP_NS, 'cellMargin')[0];
                                const marginV = marginEl ? (parseInt(marginEl.getAttribute('top'), 10) || 0) + (parseInt(marginEl.getAttribute('bottom'), 10) || 0) : 282;
                                rowLineMetric = { vertsize: fillInfo.vertsize, spacing: fillInfo.spacing, marginV };
                            }
                        });
                        return applyRowHeightFromLines(row, rowMaxLines, rowLineMetric);
                    };
                    const applyBorder = (row, styleMap) => {
                        Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const addr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            if (!addr) return;
                            const bf = styleMap[addr.getAttribute('colAddr')];
                            if (bf !== undefined) tc.setAttribute('borderFillIDRef', bf);
                        });
                    };

                    oldDataRows.forEach(tr => tbl.removeChild(tr));

                    items.forEach((item, idx) => {
                        const which = idx === 0 ? 'first' : (idx === items.length - 1 ? 'last' : 'normal');
                        const [templateA, templateB] = which === 'first' ? firstPair : (which === 'last' ? lastPair : normalPair);
                        const newA = templateA.cloneNode(true);
                        const newB = templateB.cloneNode(true);
                        const rowAddrA = FIREPROOF_HEADER_ROWS + idx * 2;
                        setRowAddr(newA, rowAddrA);
                        setRowAddr(newB, rowAddrA + 1);
                        applyBorder(newA, styleMapsA[which]);
                        applyBorder(newB, styleMapsB[which]);

                        // 템플릿 데이터 행 높이(6559, 약 2.3cm)가 한 줄 글자에 비해 너무 커서 부재 몇 개만 넣어도
                        // 표가 한 쪽을 넘었다(2026-09-22). 다른 결과표(기울기·부재실측, 2776)와 같은 높이로 먼저
                        // 줄여 두고, 글자가 넘치면 fillRowCells가 필요한 만큼 늘린다. 병합 칸은 아래 mergedHeight가 맞춘다.
                        [newA, newB].forEach(row => Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                            const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                            if (sz) sz.setAttribute('height', String(FIREPROOF_DATA_ROW_H));
                        }));

                        const fl = item.fpFlange || {};
                        const web = item.fpWeb || {};
                        const flVal = (i) => fl.unavailable ? '-' : ((fl.readings && fl.readings[i] !== undefined) ? fl.readings[i] : '-');
                        const webVal = (i) => web.unavailable ? '-' : ((web.readings && web.readings[i] !== undefined) ? web.readings[i] : '-');
                        const memberAvg = (window.BSA && window.BSA.ndtStats && typeof window.BSA.ndtStats.fireproofMemberAvg === 'function')
                            ? window.BSA.ndtStats.fireproofMemberAvg(item)
                            : (item.fpAvg != null ? item.fpAvg : null);
                        const avgText = (memberAvg == null || !Number.isFinite(Number(memberAvg))) ? '-' : Number(Number(memberAvg).toFixed(2));

                        const heightA = fillRowCells(newA, [
                            [0, item.no || String(idx + 1)],
                            [1, item.location || '-'],
                            [2, '플렌지'],
                            [3, item.fireproofDesign || '-'],
                            [4, flVal(0)],
                            [5, flVal(1)],
                            [6, flVal(2)],
                            [7, avgText],
                            [8, fl.unavailable ? '측정불가' : '-']
                        ]);

                        const heightB = fillRowCells(newB, [
                            [2, '웨브'],
                            [4, webVal(0)],
                            [5, webVal(1)],
                            [6, webVal(2)],
                            [7, avgText],
                            [8, web.unavailable ? '측정불가' : '-']
                        ]);

                        // 평균값은 부재 하나(플렌지·웨브 최대 6개소)의 평균이라 두 행에 같은 값이 찍혔다 —
                        // 설계치 칸처럼 두 행을 한 칸으로 세로 병합한다(2026-09-22 사용자 요청).
                        // 테두리는 같은 쌍의 병합 칸(설계치, 3번 열) 것을 따른다 — 마지막 부재의 굵은 아랫선 포함.
                        const tcAtCol = (row, col) => Array.from(row.getElementsByTagNameNS(HP_NS, 'tc')).find(t => {
                            const addr = t.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
                            return addr && addr.getAttribute('colAddr') === String(col);
                        });
                        const avgTcA = tcAtCol(newA, 7);
                        const avgTcB = tcAtCol(newB, 7);
                        const avgSpanA = avgTcA && avgTcA.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                        if (avgTcA && avgSpanA && avgTcB) {
                            avgSpanA.setAttribute('rowSpan', '2');
                            const designTcA = tcAtCol(newA, 3);
                            if (designTcA && designTcA.getAttribute('borderFillIDRef')) {
                                avgTcA.setAttribute('borderFillIDRef', designTcA.getAttribute('borderFillIDRef'));
                            }
                            newB.removeChild(avgTcB);
                        }

                        // NO./위치/설계치 칸은 플렌지·웨브 두 행에 걸쳐 세로 병합(rowSpan=2)돼 있어
                        // applyRowHeightFromLines가 건드리지 않는다 — 두 행 높이를 합친 값으로 따로
                        // 맞춰줘야 병합 칸만 예전 높이 그대로 남아 두 행을 도로 벌리는 걸 막는다.
                        const mergedHeight = (heightA || 0) + (heightB || 0);
                        if (mergedHeight > 0) {
                            Array.from(newA.getElementsByTagNameNS(HP_NS, 'tc')).forEach(tc => {
                                const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
                                if (!span || parseInt(span.getAttribute('rowSpan'), 10) <= 1) return;
                                const sz = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
                                if (sz) sz.setAttribute('height', String(mergedHeight));
                            });
                        }

                        Array.from(newA.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);
                        Array.from(newB.getElementsByTagNameNS(HP_NS, 'tc')).forEach(centerCellContent);

                        tbl.appendChild(newA);
                        tbl.appendChild(newB);
                    });
                    tbl.setAttribute('rowCnt', String(FIREPROOF_HEADER_ROWS + items.length * 2));
                };

                const MEASURE_TBL_ID = '2137459237', MEASURE_HEADER_ROWS = 2;
                const STRENGTH_TBL_ID = '2119329126', STRENGTH_HEADER_ROWS = 1;
                const CARB_TBL_ID = '2119328135', CARB_HEADER_ROWS = 1;
                // 외벽기울기/부동침하/부재변위 결과표 3종 — 2026-08-24 템플릿에 새로 추가.
                // 표 열 구성이 3개 다 동일: NO. / 위치 / 전회(기존, 항상 '-') / 금회(측정값) / 길이(또는 높이) / 비율 / 등급.
                const TILT_TBL_ID = '501', TILT_HEADER_ROWS = 2;
                const SETTLEMENT_TBL_ID = '502', SETTLEMENT_HEADER_ROWS = 2;
                const MEMBER_DISP_TBL_ID = '503', MEMBER_DISP_HEADER_ROWS = 2;

                {
                    // 부재실측(단면 규격) 결과표 — 템플릿 표 열 구성: NO. / 위치(+부재명) / 설계치 / 실측치 / 마감상태 / 평가(c%) / 비고(등급).
                    if (measureItemsHwpx.length > 0) {
                        const tbl = findTblById(MEASURE_TBL_ID, ['마감상태', '설계', '실측']);
                        if (tbl) fillNdtTable(tbl, MEASURE_HEADER_ROWS, measureItemsHwpx.map((item, i) => {
                            const designText = formatNdtMeasureDimForOutput(item, 'design', '×');
                            const measuredText = formatNdtMeasureDimForOutput(item, 'measured', '×');
                            const ratioText = (item.sectionRatio !== undefined && item.sectionRatio !== null) ? item.sectionRatio.toFixed(1) + '%' : '-';
                            return [
                                item.no || (i + 1),
                                `${item.location || '위치미지정'}\n(${memberNameOut(item.component) || ''})`,
                                designText,
                                measuredText,
                                item.finishState || '-',
                                ratioText,
                                item.sectionGrade || '-'
                            ];
                        }), true);
                    } else {
                        removeNdtTableById(MEASURE_TBL_ID);
                    }

                    // 내화피복 두께 결과표 — NO./구분/설계치가 플렌지·웨브 두 행에 걸쳐 세로병합.
                    if (fireproofItemsHwpx.length > 0) {
                        const tbl = findTblById(FIREPROOF_TBL_ID, ['부  위', '설계치', '검토결과']);
                        if (tbl) fillFireproofTable(tbl, fireproofItemsHwpx);
                    } else {
                        removeNdtTableById(FIREPROOF_TBL_ID);
                    }

                    if (strengthItemsHwpx.length > 0) {
                        const tbl = findTblById(STRENGTH_TBL_ID);
                        // strengthGrade는 내부 코드값('a_or_b' 등)이라 그대로 찍으면 표에 글자가
                        // 깨진 것처럼 보인다 — 표시용 문구로 바꿔서 넣는다.
                        const strengthGradeDisplay = (code) => code === 'a_or_b' ? 'a/b' : (code || '-');
                        // 강도 항목 하나에 위치 슬롯이 여러 개(최대 3개) 붙을 수 있는데, 예전엔
                        // item.strengthFinal 등 첫 슬롯 결과만 내보내서 2번째/3번째 위치 측정값이
                        // 통째로 표에서 빠졌다 — 슬롯 단위로 행을 펼쳐서 채운다.
                        const strengthRows = [];
                        strengthItemsHwpx.forEach(item => {
                            const slots = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 0
                                ? item.strengthSlots
                                : [{ location: item.location, finalStrength: item.strengthFinal, ratio: item.strengthRatio, grade: item.strengthGrade }];
                            // 슬롯 자체에 계산 결과가 없는(예전 형식) 데이터는 항목(item) 최상위에
                            // 남아있는 첫 슬롯 계산값으로라도 채운다 — 그냥 '-'로 비워두면 실제로는
                            // 측정값이 있는데도 표에는 아무것도 없는 것처럼 보인다.
                            slots.forEach(slot => {
                                const finalStrength = typeof slot.finalStrength === 'number' ? slot.finalStrength : item.strengthFinal;
                                const ratio = slot.ratio != null ? slot.ratio : item.strengthRatio;
                                const grade = slot.grade != null ? slot.grade : item.strengthGrade;
                                strengthRows.push([
                                    strengthRows.length + 1,
                                    `${slot.location || item.location || ''}${memberNameOut(item.component) || ''}`,
                                    item.designStrength != null ? item.designStrength : '-',
                                    typeof finalStrength === 'number' ? finalStrength.toFixed(1) : (finalStrength || '-'),
                                    ratio != null ? `${Math.round(ratio)}%` : '-',
                                    strengthGradeDisplay(grade),
                                    item.damageStatus === '균열발생' ? '균열발생' : '-'
                                ]);
                            });
                        });
                        // 2026-08-24: 템플릿에 남아있던 다른 병원 이름표 칸(NO. 왼쪽의 빈 병합 칸)을
                        // 제거해서 이제 NO.가 표의 실제 0번 칸이 됨 — includeCol0=true로 채운다.
                        if (tbl) fillNdtTable(tbl, STRENGTH_HEADER_ROWS, strengthRows, true);
                    } else {
                        removeNdtTableById(STRENGTH_TBL_ID);
                    }

                    // --- 콘크리트 반발경도 측정 DATA — 표본 문서엔 이 절이 제목만 있고 내용이
                    // 통째로 비어 있었다. 2026-09-04부터: 사용자가 R값 스캔에 쓴 실제 측정지 사진을
                    // (전경사진과 같은 방식으로 IndexedDB/클라우드에 저장해두었다가) 참고 양식처럼
                    // 위치(NO.) 최대 3개를 한 표에 가로로 나란히 넣는다. 사진을 아직 저장 안 해둔
                    // (이 기능 이전에 입력한) 위치만 원시 R값을 캔버스로 그려 사진 대신 넣는다.
                    {
                        const allParasForData = secChildren();
                        const dataHeadingPara = allParasForData.find(p => paraText(p).includes('반발경도 측정 DATA'));
                        const dataStopPara = allParasForData.find(p => paraText(p).includes('반발경도 성과표'));
                        if (dataHeadingPara && dataStopPara) {
                            const headingIdx = allParasForData.indexOf(dataHeadingPara);
                            const dataPoints = [];
                            strengthItemsHwpx.forEach(item => {
                                const slots = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 0
                                    ? item.strengthSlots
                                    : [{ location: item.location, readings: [], photoId: null }];
                                slots.forEach(slot => {
                                    const readings = (slot.readings || []).filter(v => v !== '' && v !== null && v !== undefined);
                                    if (readings.length === 0 && !slot.photoId) return;
                                    dataPoints.push({
                                        location: slot.location || item.location || '',
                                        component: memberNameOut(item.component) || '',
                                        readings,
                                        photoId: slot.photoId || null,
                                        bldgId: item._ndtBldgId
                                    });
                                });
                            });
                            if (dataPoints.length > 0) {
                                dataPoints.forEach((pt, i) => { pt.seq = i + 1; });
                                if (allParasForData.indexOf(dataStopPara) > headingIdx + 1) {
                                    removeParaRange(allParasForData[headingIdx + 1], dataStopPara);
                                }

                                // 위치(NO.) 최대 3개를 한 표에 담는다(라벨칸 1 + (NO.칸+사진칸) × 최대
                                // 3쌍 = 최대 7칸, 사용자가 직접 한글로 만들어 보내준 정상 예시와 동일한
                                // 구조). 4개 이상이면 표를 새로 만들어 바로 아래에 이어붙이되, 그 예시처럼
                                // 표 사이에 강제 페이지분할을 넣지 않아 공간이 되면 한 페이지에 이어진다.
                                const PHOTO_W = 7787, TOTAL_H = 9365 * 3;
                                const photoMaxW = PHOTO_W - 141 - 141;
                                const photoMaxH = TOTAL_H - 141 - 141;
                                const boxAspect = photoMaxW / photoMaxH;
                                // 각 포인트의 "사진"을 미리 준비한다 — 실제 저장된 측정지 사진이
                                // 있으면 그걸, 없으면 원시 R값 캔버스를(칸 비율에 맞춰) 대신 그려서
                                // 똑같이 사진 취급으로 표 안에 넣는다.
                                for (const pt of dataPoints) {
                                    const photoUrl = pt.photoId ? await loadStrengthPhotoDataUrl(pt.bldgId || bldg.id, pt.photoId) : null;
                                    if (photoUrl) {
                                        const size = await loadImageSize(photoUrl);
                                        pt._imgUrl = photoUrl;
                                        pt._imgW = size.w;
                                        pt._imgH = size.h;
                                    } else {
                                        const canvas = renderStrengthDataRowCanvas(pt, boxAspect);
                                        pt._imgUrl = canvas.toDataURL('image/png');
                                        pt._imgW = canvas.width;
                                        pt._imgH = canvas.height;
                                    }
                                    const nums = pt.readings.map(v => parseFloat(v)).filter(v => !isNaN(v));
                                    pt._avgText = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '-';
                                    imgCounter++;
                                    pt._picId = String(9110000 + imgCounter);
                                    pt._picInstId = String(9120000 + imgCounter);
                                    pt._imgId = `strengthDataImg${imgCounter}`;
                                }

                                // 이 표 전용 테두리 스타일(굵은 가장자리+라벨 그라데이션)을 header.xml에
                                // 한 번만 추가하고, 이후 표들은 전부 이 id들을 재사용한다.
                                if (!hwpxHeaderText) hwpxHeaderText = await zip.file('Contents/header.xml').async('string');
                                const strengthBorders = injectStrengthDataBorderFills(hwpxHeaderText);
                                hwpxHeaderText = strengthBorders.header;
                                hwpxHeaderDirty = true;
                                const strengthBorderIds = strengthBorders.ids;

                                let dataAnchor = dataHeadingPara;
                                for (let i = 0; i < dataPoints.length; i += 3) {
                                    const group = dataPoints.slice(i, i + 3);
                                    imgCounter++;
                                    const tblId = String(9100000 + imgCounter);
                                    const xml = buildStrengthPhotoRowGroupXml(group, tblId, strengthBorderIds);
                                    const doc = new DOMParser().parseFromString(`<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${xml}</root>`, 'application/xml');
                                    const newPara = xmlDoc.importNode(doc.documentElement.firstChild, true);
                                    dataAnchor.parentNode.insertBefore(newPara, dataAnchor.nextSibling);
                                    dataAnchor = newPara;

                                    // 라벨(구분/위치/평균경도)·NO./위치/평균경도 텍스트를 채우고,
                                    // 사진(또는 대체 캔버스)들을 순서대로 이 표의 hp:pic들에 꽂는다.
                                    const tbl = newPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
                                    const pics = newPara.getElementsByTagNameNS(HP_NS, 'pic');
                                    setTcText(tcAtAddr(tbl, 0, 0), '구  분');
                                    setTcText(tcAtAddr(tbl, 0, 1), '위  치');
                                    setTcText(tcAtAddr(tbl, 0, 2), '평균 경도');
                                    for (let idx = 0; idx < group.length; idx++) {
                                        const pt = group[idx];
                                        try {
                                            const noCol = 1 + idx * 2;
                                            setTcText(tcAtAddr(tbl, noCol, 0), `NO. ${pt.seq}`);
                                            setTcText(tcAtAddr(tbl, noCol, 1), [pt.location, memberNameOut(pt.component)].filter(Boolean).join(' ') || '-');
                                            setTcText(tcAtAddr(tbl, noCol, 2), pt._avgText);
                                            const pic = pics[idx];
                                            const { bytes, mime, ext } = await dataUrlToBytes(pt._imgUrl);
                                            zip.file(`BinData/${pt._imgId}.${ext}`, bytes);
                                            manifestAdds.push(`<opf:item id="${pt._imgId}" href="BinData/${pt._imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                                            setPicImage(pic, pt._imgId, pt._imgW, pt._imgH, photoMaxW, photoMaxH);
                                        } catch (e) {
                                            console.error('반발경도 측정 DATA 표 채우기 실패 (NO.' + pt.seq + '):', e);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // --- 콘크리트 반발경도 성과표(7.1.2.3) — 표본 문서엔 다른 회사의 실측 데이터를
                    // 찍은 정적 그림(WMF)이 그대로 박혀 있어서, 그동안 어느 건물을 내보내든 항상 그
                    // 남의 데이터가 그대로 나갔다. 제목 문단 바로 다음에 이어지는 그림 문단들을 전부
                    // 걷어내고, NO.(위치 슬롯)별로 반발치·보정·압축강도·막대그래프를 캔버스로 그려
                    // 그 자리에 하나씩 새로 넣는다.
                    {
                        const allParasForPerf = secChildren();
                        const perfHeadingPara = allParasForPerf.find(p => paraText(p).includes('반발경도 성과표'));
                        if (perfHeadingPara) {
                            const headingIdx = allParasForPerf.indexOf(perfHeadingPara);
                            const picParas = [];
                            for (let i = headingIdx + 1; i < allParasForPerf.length; i++) {
                                if (allParasForPerf[i].getElementsByTagNameNS(HP_NS, 'pic').length > 0) {
                                    picParas.push(allParasForPerf[i]);
                                } else {
                                    break;
                                }
                            }
                            if (picParas.length > 0) {
                                const stopNode = allParasForPerf[headingIdx + 1 + picParas.length] || null;
                                removeParaRange(picParas[0], stopNode);

                                const perfPoints = [];
                                strengthItemsHwpx.forEach(item => {
                                    const slots = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 0
                                        ? item.strengthSlots
                                        : [{ location: item.location, readings: [] }];
                                    slots.forEach(slot => perfPoints.push({ item, slot }));
                                });

                                // 재령일은 항목마다(이 항목 직접 입력 > 건물 공통 > 준공일 자동) — resolveStrengthAgeInfo
                                const perfCanvases = [];
                                const perfEnabledNames = getEnabledStrengthFormulaNames(bldg);
                                for (let seq = 0; seq < perfPoints.length; seq++) {
                                    const pt = perfPoints[seq];
                                    const readings = (pt.slot.readings || []).filter(v => v !== '' && v !== null && v !== undefined);
                                    if (readings.length === 0) continue;
                                    const calc = calcConcreteStrength(readings, parseFloat(pt.item.strengthAngle), resolveStrengthAgeInfo(pt.item, ndtBldgOf(pt.item)).days, perfEnabledNames, getStrengthAnvilAvg(bldg));
                                    if (!calc) continue;
                                    perfCanvases.push(renderStrengthPerfPointCanvas(seq + 1, pt.item, pt.slot, readings, calc));
                                }

                                // 2026-09-22 사용자 요청: NO.마다 따로 떠 있던 그림(글자처럼 취급 아님)을, 한 쪽에 들어가는
                                // NO.끼리 그림 한 장으로 이어 붙여 "글자처럼 취급"으로 넣는다(쪽마다 한 덩어리).
                                // 한 쪽 개수 = 문서 본문 높이(쪽 높이 - 위·아래·머리말·꼬리말 여백) ÷ NO. 한 칸 높이.
                                const PERF_IMG_W = 42520;
                                const PERF_GAP_PX = 24;
                                const pagePrEl = xmlDoc.getElementsByTagNameNS(HP_NS, 'pagePr')[0];
                                const marginEl = xmlDoc.getElementsByTagNameNS(HP_NS, 'margin')[0];
                                const attrNum = (el, k, d) => { const v = el ? parseInt(el.getAttribute(k), 10) : NaN; return Number.isFinite(v) ? v : d; };
                                const bodyH = attrNum(pagePrEl, 'height', 83340)
                                    - attrNum(marginEl, 'top', 5669) - attrNum(marginEl, 'bottom', 4252)
                                    - attrNum(marginEl, 'header', 4331) - attrNum(marginEl, 'footer', 4252);
                                const perPage = perfCanvases.length
                                    ? getStrengthPerfPerPage(bodyH, PERF_IMG_W, perfCanvases[0].width, perfCanvases[0].height, PERF_GAP_PX)
                                    : 1;
                                let perfAnchor = perfHeadingPara;
                                // 마지막 쪽 그림 맨 밑에 적용 추정식(1식/2식…)을 붙인다. 그 쪽이 꽉 차 있으면 넘치지
                                // 않게 본문 높이에 맞춰 그 장만 조금 줄어든다(2026-10-14 사용자 요청).
                                for (let i = 0; i < perfCanvases.length; i += perPage) {
                                    const isLastPage = i + perPage >= perfCanvases.length;
                                    const pageParts = perfCanvases.slice(i, i + perPage);
                                    if (isLastPage) pageParts.push(renderStrengthPerfLegendCanvas(perfEnabledNames));
                                    const pageCanvas = stackCanvasesVertically(pageParts, PERF_GAP_PX);
                                    perfAnchor = await insertImageParaAfter(perfAnchor, pageCanvas.toDataURL('image/png'), 'strengthPerfAuto', PERF_IMG_W, isLastPage ? bodyH - 1500 : 999999999);
                                }
                            }
                        }
                    }

                    if (strengthItemsHwpx.length === 0) {
                        const parasStrip = secChildren();
                        const dataH = parasStrip.find(p => paraText(p).includes('반발경도 측정 DATA'));
                        const perfH = parasStrip.find(p => paraText(p).includes('반발경도 성과표'));
                        const start = dataH || perfH;
                        if (start) {
                            const startIdx = parasStrip.indexOf(start);
                            let endIdx = startIdx + 1;
                            while (endIdx < parasStrip.length) {
                                const p = parasStrip[endIdx];
                                const t = paraText(p).trim();
                                const hasPic = p.getElementsByTagNameNS(HP_NS, 'pic').length > 0;
                                const hasTbl = p.getElementsByTagNameNS(HP_NS, 'tbl').length > 0;
                                if (!hasPic && !hasTbl && t && t.indexOf('반발경도') < 0) break;
                                endIdx++;
                            }
                            removeParaRange(start, parasStrip[endIdx] || null);
                        }
                    }

                    if (carbItemsHwpx.length > 0) {
                        const tbl = findTblById(CARB_TBL_ID);
                        if (tbl) fillNdtTable(tbl, CARB_HEADER_ROWS, carbItemsHwpx.map((item, i) => [
                            item.no || (i + 1),
                            `${item.location || ''}${memberNameOut(item.component) || ''}`,
                            item.carbDepth != null ? item.carbDepth : '-',
                            item.carbCover != null ? item.carbCover : '-',
                            typeof item.carbRemainMm === 'number' ? item.carbRemainMm.toFixed(2) : '-',
                            typeof item.carbRate === 'number' ? item.carbRate.toFixed(2) : '-',
                            typeof item.carbLifeYears === 'number' ? Math.round(item.carbLifeYears) : '-',
                            typeof item.carbRemainingLifeYears === 'number' ? Math.round(item.carbRemainingLifeYears) : '-',
                            item.carbAgeDays != null ? `약 ${Math.round(item.carbAgeDays / 365)}년` : '-',
                            '-'
                        ]), true);
                    } else {
                        removeNdtTableById(CARB_TBL_ID);
                    }

                    // 3개 표 모두 열 순서 동일(2026-08-24 사용자 요청으로 재배치):
                    // NO. / 위치 / 길이·높이 / 전회(항상 '-') / 금회 / 비율 / 등급. 단위는 전부 mm로 통일.
                    if (tiltItemsHwpx.length > 0) {
                        const tbl = findTblById(TILT_TBL_ID, ['높   이(H)', '전   회']);
                        if (tbl) fillNdtTable(tbl, TILT_HEADER_ROWS, tiltItemsHwpx.map((item, i) => {
                            const hDigits = String(item.height || '').replace(/[^0-9.]/g, '');
                            const hNum = parseFloat(hDigits);
                            const heightText = Number.isFinite(hNum) ? `${hNum.toLocaleString()}mm` : '-';
                            const avgDigits = (item.avgValue || '').toString().replace(/[^0-9.-]/g, '');
                            const avgNum = parseFloat(avgDigits);
                            const avgText = Number.isFinite(avgNum) ? `${avgNum}mm` : '-';
                            const delta = Math.abs(avgNum || 0);
                            const calc = (Number.isFinite(hNum) && hNum > 0 && delta > 0)
                                ? calcTiltGrade(hNum, delta)
                                : { tiltRatio: '', grade: '' };
                            return [item.no || (i + 1), item.location || '-', heightText, '-', avgText, item.tiltRatio || calc.tiltRatio || '-', item.grade || calc.grade || '-'];
                        }), true);
                        if (tbl) sortHwpxRowCellsByColAddr(tbl, HP_NS);
                    } else {
                        removeNdtTableById(TILT_TBL_ID);
                    }

                    // 부동침하/부재변위는 2026-08-24부터 템플릿에 별도 표 2개로 분리 — 이전엔 표가
                    // 하나뿐이라 두 그룹을 합쳐서 한 표에 담았지만, 이제 각자 자기 표에 채운다.
                    if (settlementGroupsHwpx.length > 0) {
                        const tbl = findTblById(SETTLEMENT_TBL_ID, ['변  위  량', '기   존']);
                        if (tbl) fillNdtTable(tbl, SETTLEMENT_HEADER_ROWS, settlementGroupsHwpx.map((group, i) => {
                            const calc = calcGroupDisplacement(group);
                            const fmt = formatDispCalcForExport(calc);
                            const lengthMmText = group.measureLength ? `${(group.measureLength * 1000).toLocaleString()}mm` : '-';
                            return [i + 1, group.locationType || '-', lengthMmText, '-', fmt.deltaCm, fmt.tiltRatio, fmt.grade];
                        }), true);
                        if (tbl) sortHwpxRowCellsByColAddr(tbl, HP_NS);
                        // 2026-08-24: 결과표 밑에 그룹별 요약박스+꺾은선 그래프를 한 쌍씩 이어붙임(사용자 요청).
                        if (tbl) await insertGroupResultImages(tbl, settlementGroupsHwpx);
                    } else {
                        removeNdtTableById(SETTLEMENT_TBL_ID);
                    }

                    if (memberDispGroupsHwpx.length > 0) {
                        const tbl = findTblById(MEMBER_DISP_TBL_ID, ['처  짐  량', '기   존']);
                        if (tbl) fillNdtTable(tbl, MEMBER_DISP_HEADER_ROWS, memberDispGroupsHwpx.map((group, i) => {
                            const calc = calcGroupDisplacement(group);
                            const fmt = formatDispCalcForExport(calc);
                            const lengthMmText = group.measureLength ? `${(group.measureLength * 1000).toLocaleString()}mm` : '-';
                            return [i + 1, group.locationType || '-', lengthMmText, '-', fmt.deltaCm, fmt.tiltRatio, fmt.grade];
                        }), true);
                        if (tbl) sortHwpxRowCellsByColAddr(tbl, HP_NS);
                        if (tbl) await insertGroupResultImages(tbl, memberDispGroupsHwpx);
                    } else {
                        removeNdtTableById(MEMBER_DISP_TBL_ID);
                    }

                    // ---- 위치도 일괄 삽입 ----
                    // "비파괴 장비조사 위치도" 섹션의 표본 내용(다른 병원 위치도, 못 채우던 부재실측/
                    // 내화피복 위치도 등)을 통째로 비우고, 실제로 채운 위치도만 사용자가 요청한 순서
                    // (부재실측 → 강도/탄산화 → 내화피복 → 외벽기울기 → 부동침하 → 부재변위)로 모든
                    // 비파괴조사 결과표가 다 끝난 이 자리에 새로 만들어 넣는다. 2026-08-25부터: 결과표
                    // 바로 옆(표마다 따로)이 아니라 전부 이렇게 한곳에 모아서 넣는 방식으로 바뀜.
                    {
                        // "비파괴 장비조사 위치도"(상위 섹션 제목)와 "비파괴 장비조사 사진첩" 문단은
                        // 과거 어느 시점(한글 재저장/KS병원 잔재 정리 등)에 이미 삭제되고 없다 —
                        // 처음에 이 코드는 그 두 문단을 기준으로 구간을 찾으려 했는데 실제로는 항상
                        // 못 찾아 조용히 아무 일도 안 하고 있었다(위치도가 하나도 안 나오던 원인).
                        // 대신 실제로 남아있는 걸 직접 확인한 항목들 — 부재실측/내화피복/변위조사
                        // 소제목 3개, 정체불명의 "부재실측" 단독 문단, 강도·탄산화용 옛 위치도 표
                        // (id=2137459495, 우리가 더는 안 씀) — 을 문단 참조로 직접 찾아서 지운다.
                        const all = secChildren();
                        const ndtMapsApi = (window.BSA && window.BSA.shared && window.BSA.shared.hwpxNdtMaps) || null;
                        const headingHas = (p, needle) => {
                            if (!p || p.getElementsByTagNameNS(HP_NS, 'tbl').length > 0) return false;
                            const t = paraText(p).trim();
                            if (ndtMapsApi && typeof ndtMapsApi.headingContains === 'function') {
                                return ndtMapsApi.headingContains(t, needle);
                            }
                            return t === needle || t.indexOf(needle) >= 0;
                        };
                        const findHeading = (text) => all.find(p => headingHas(p, text));
                        const measureHeadingPara = findHeading('부재실측 위치도');
                        const strengthCarbHeadingPara = all.find(p => headingHas(p, '비파괴 장비조사 위치도'));
                        const fireproofHeadingPara = findHeading('내화피복 측정 위치도');
                        const dispHeadingPara = findHeading('변위조사 위치도') || findHeading('변위측정 위치도');
                        const bareMeasurePara = all.find(p => paraText(p).replace(/\s+/g, '') === '부재실측');
                        // "내화피복 측정 위치도"/"변위조사 위치도" 바로 뒤에, 옛 문서 구조에서 쓰던
                        // "콘크리트 강도측정"/"콘크리트 탄산화 시험"/"변위측정" 소제목 3개가 내용 없이
                        // 문단만 그대로 남아있었다(사용자가 실제 한글에서 열어 확인) — 위 5개와 같은
                        // 방식으로 찾아서 같이 지운다.
                        // 이 잔재 3개는 부분일치로 찾으면 안 된다 — 공백을 무시하고 보면
                        // '콘크리트강도측정'이 '비파괴장비조사위치도(콘크리트강도측정및탄산화측정)'
                        // 안에 들어있어서, 살려 써야 할 위치도 제목이 잡힌다. 정확히 같은 문단만 찾는다.
                        const findExactPara = (text) => {
                            const want = String(text).replace(/\s+/g, '');
                            return all.find(p => p.getElementsByTagNameNS(HP_NS, 'tbl').length === 0
                                && paraText(p).replace(/\s+/g, '') === want);
                        };
                        const strengthBareHeadingPara = findExactPara('콘크리트 강도측정');
                        const carbBareHeadingPara = findExactPara('콘크리트 탄산화 시험');
                        const dispBareHeadingPara = findExactPara('변위측정');
                        const oldStrengthCarbTbl = findTblById('2137459495');
                        let oldStrengthCarbTblPara = oldStrengthCarbTbl;
                        while (oldStrengthCarbTblPara && oldStrengthCarbTblPara.localName !== 'p') oldStrengthCarbTblPara = oldStrengthCarbTblPara.parentNode;

                        // 삽입 지점: 원래 이 소제목들이 있던 바로 그 자리(부재실측 위치도 바로 앞
                        // 문단)를 그대로 이어받는다 — 지우기 전에 먼저 찾아둬야 한다.
                        const mapHeadingCandidates = [
                            measureHeadingPara, strengthCarbHeadingPara, fireproofHeadingPara, dispHeadingPara
                        ].filter(Boolean);
                        // 위 4개는 템플릿의 개요번호 제목 문단이라 한글이 "7.1.6. 부재실측 위치도"처럼
                        // 번호를 자동으로 붙여 준다. 지우지 말고 살려서 그 아래에 위치도를 넣는다.
                        // (위치도가 하나도 안 들어간 제목만 나중에 개별적으로 지운다)
                        const headingsToRemove = [
                            oldStrengthCarbTblPara, bareMeasurePara,
                            strengthBareHeadingPara, carbBareHeadingPara, dispBareHeadingPara
                        ].filter(p => p && mapHeadingCandidates.indexOf(p) < 0);
                        let mapInsertAfter = null;
                        if (mapHeadingCandidates.length > 0) {
                            const first = mapHeadingCandidates.reduce((a, b) => {
                                const ia = all.indexOf(a);
                                const ib = all.indexOf(b);
                                return (ia >= 0 && (ib < 0 || ia < ib)) ? a : b;
                            });
                            mapInsertAfter = first ? first.previousElementSibling : null;
                            while (mapInsertAfter && headingsToRemove.indexOf(mapInsertAfter) >= 0) {
                                mapInsertAfter = mapInsertAfter.previousElementSibling;
                            }
                        }
                        const albumOrSurvey = all.find(p => {
                            const t = paraText(p).trim();
                            return t.indexOf('비파괴 장비조사 사진첩') >= 0 || /^주요 상태조사표/.test(t);
                        });
                        if (!mapInsertAfter && albumOrSurvey) {
                            mapInsertAfter = albumOrSurvey.previousElementSibling;
                            while (mapInsertAfter && headingsToRemove.indexOf(mapInsertAfter) >= 0) {
                                mapInsertAfter = mapInsertAfter.previousElementSibling;
                            }
                        }
                        if (!mapInsertAfter) {
                            const tbls = xmlDoc.getElementsByTagNameNS(HP_NS, 'tbl');
                            const albumIdx = albumOrSurvey ? all.indexOf(albumOrSurvey) : -1;
                            for (let i = 0; i < tbls.length; i++) {
                                let p = tbls[i];
                                while (p && p.localName !== 'p') p = p.parentNode;
                                if (!(p && p.parentNode === sec)) continue;
                                if (albumIdx >= 0) {
                                    const pi = all.indexOf(p);
                                    if (pi < 0 || pi >= albumIdx) continue;
                                }
                                mapInsertAfter = p;
                            }
                        }

                        headingsToRemove.forEach(p => { if (p && p.parentNode) p.parentNode.removeChild(p); });

                        const mapFlags = {
                            measure: measureItemsHwpx.length > 0,
                            strength: strengthItemsHwpx.length > 0,
                            strengthCarb: strengthItemsHwpx.length > 0 || carbItemsHwpx.length > 0,
                            carb: carbItemsHwpx.length > 0,
                            fireproof: fireproofItemsHwpx.length > 0,
                            tilt: tiltItemsHwpx.length > 0,
                            settlement: settlementGroupsHwpx.length > 0,
                            memberDisp: memberDispGroupsHwpx.length > 0
                        };
                        if (ndtMapsApi && typeof ndtMapsApi.shouldDropEmptyHeading === 'function') {
                            secChildren().slice().forEach(p => {
                                if (!p || p === mapInsertAfter || p === albumOrSurvey) return;
                                if (p.getElementsByTagNameNS(HP_NS, 'tbl').length > 0) return;
                                if (p.getElementsByTagNameNS(HP_NS, 'pic').length > 0) return;
                                const t = paraText(p).trim();
                                if (!t) return;
                                if (ndtMapsApi.shouldDropEmptyHeading(t, mapFlags) && p.parentNode) {
                                    p.parentNode.removeChild(p);
                                }
                            });
                        }

                        {
                            // 결함위치도(fillLocationMapForFloor)와 똑같이 표(2행짜리: 위=그림칸,
                            // 아래=캡션칸) 안에 그림을 넣는다 — 헤딩 문단 따로 + 그림 따로가 아니라
                            // 표 하나가 그림+캡션을 같이 들고 있어서 테두리가 있고 칸을 꽉 채운다.
                            // XML은 실제 결함위치도 표(id=1122472099)를 그대로 본떴다.
                            const LOC_MAP_TBL_PARA_XML = '<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:tbl id="TBL_ID" zOrder="11" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="1" rowCnt="2" colCnt="1" cellSpacing="0" borderFillIDRef="5" noAdjust="0"><hp:sz width="41821" widthRelTo="ABSOLUTE" height="64087" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="140" right="140" top="140" bottom="140"/><hp:inMargin left="140" right="140" top="140" bottom="140"/><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="15"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="6"><hp:pic id="PIC_ID" zOrder="36" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" thumbnailBinIDRef="" href="" groupLevel="0" instid="PIC_INSTID" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="768540" height="969540"/><hp:curSz width="41541" height="52405"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="20770" centerY="26202" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.054052" e2="0" e3="0" e4="0" e5="0.054051" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="768540" y="0"/><hc:pt2 x="768540" y="969540"/><hc:pt3 x="0" y="969540"/></hp:imgRect><hp:imgClip left="0" right="648540" top="0" bottom="818100"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="648540" dimheight="818100"/><hp:effects/><hp:sz width="41541" widthRelTo="ABSOLUTE" height="52405" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="1320" horzpos="0" horzsize="0" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="60813"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="16"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="1" styleIDRef="16" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="43"><hp:t>CAPTION</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="3274"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="64367" textheight="64367" baseline="54712" spacing="960" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>';
                            // 표 칸(cellSz) - 안쪽 여백(cellMargin) = 그림이 실제로 채울 수 있는 최대
                            // 크기(fillLocationMapForFloor와 동일한 계산, 표를 고정 크기로 새로 만들기
                            // 때문에 매번 다시 계산할 필요 없이 미리 값을 넣어둠).
                            const LOC_MAP_MAX_W = 41821 - 141 - 141;
                            const LOC_MAP_MAX_H = 60813 - 141 - 141;

                            let mapAnchor = mapInsertAfter;
                            const mapInsertBefore = (!mapAnchor && albumOrSurvey) ? albumOrSurvey : null;
                            const escapeHwpxText = (s) => String(s || '')
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;');
                            // anchorOverride: 이 위치도가 붙을 제목 문단(또는 같은 제목 아래 앞 위치도).
                            // keepWithAnchor: 표 높이가 거의 한 쪽이라, 제목 바로 아래 첫 장만 쪽 나눔을
                            // 끄고 제목과 같은 쪽에 붙인다(제목만 앞 쪽에 남는 것 방지).
                            const appendLocationMap = async (label, category, imgIdPrefix, floorForMap, anchorOverride, keepWithAnchor) => {
                                const mapDataUrl = await renderHwpxNdtMap(floorForMap, category);
                                if (!mapDataUrl) {
                                    console.warn('NDT 위치도 렌더 실패:', floorForMap, category);
                                    return null;
                                }
                                imgCounter++;
                                const xml = LOC_MAP_TBL_PARA_XML
                                    .replace('TBL_ID', String(8600000 + imgCounter))
                                    .replace('PIC_ID', String(8700000 + imgCounter))
                                    .replace('PIC_INSTID', String(8800000 + imgCounter))
                                    .replace('CAPTION', escapeHwpxText(label));
                                const doc = new DOMParser().parseFromString(`<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${xml}</root>`, 'application/xml');
                                const newPara = xmlDoc.importNode(doc.documentElement.firstChild, true);
                                newPara.setAttribute('pageBreak', keepWithAnchor ? '0' : '1');
                                const anchor = (anchorOverride && anchorOverride.parentNode) ? anchorOverride : mapAnchor;
                                if (anchor && anchor.parentNode) {
                                    anchor.parentNode.insertBefore(newPara, anchor.nextSibling);
                                } else if (mapInsertBefore && mapInsertBefore.parentNode) {
                                    mapInsertBefore.parentNode.insertBefore(newPara, mapInsertBefore);
                                } else if (sec) {
                                    sec.appendChild(newPara);
                                } else {
                                    return null;
                                }
                                mapAnchor = newPara;

                                const pic = newPara.getElementsByTagNameNS(HP_NS, 'pic')[0];
                                const { bytes, mime, ext } = await dataUrlToBytes(mapDataUrl);
                                const size = await loadImageSize(mapDataUrl);
                                const imgId = `${imgIdPrefix}${imgCounter}`;
                                zip.file(`BinData/${imgId}.${ext}`, bytes);
                                manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                                setPicImage(pic, imgId, size.w, size.h, LOC_MAP_MAX_W, LOC_MAP_MAX_H);
                                return newPara;
                            };

                            const locMapInserts = (ndtMapsApi && typeof ndtMapsApi.expandLocationMapInserts === 'function')
                                ? ndtMapsApi.expandLocationMapInserts(
                                    mapFlags,
                                    allNdtItemsForHwpx,
                                    allDispGroupsForHwpx,
                                    floorCode,
                                    (fc) => {
                                        try { return stripFloorCodeSuffix(getFloorLabel(fc)); } catch (_e) { return fc; }
                                    }
                                )
                                : [];
                            if (locMapInserts.length === 0) {
                                // 모듈을 못 불러온 경우의 대비책. 번호는 아래에서 [도면 7-N]으로 매기므로
                                // 여기서는 제목만 넣는다(캡션에 7.1.8 같은 번호를 미리 박지 않는다).
                                if (mapFlags.measure) locMapInserts.push({ title: '부재실측 위치도', category: '실측', imgIdPrefix: 'ndtLocMapMeasure', floorCode });
                                if (mapFlags.strengthCarb) locMapInserts.push({ title: '비파괴장비조사 위치도', category: '일반비파괴', imgIdPrefix: 'ndtLocMapStrengthCarb', floorCode });
                                if (mapFlags.fireproof) locMapInserts.push({ title: '내화피복 측정 위치도', category: '내화피복', imgIdPrefix: 'ndtLocMapFireproof', floorCode });
                                if (mapFlags.tilt) locMapInserts.push({ title: '외벽 기울기 측정 위치도', category: '기울기', imgIdPrefix: 'ndtLocMapTilt', floorCode });
                                if (mapFlags.settlement) locMapInserts.push({ title: '부동침하 기울기 측정 위치도', category: '변위', imgIdPrefix: 'ndtLocMapSettlement', floorCode });
                                if (mapFlags.memberDisp) locMapInserts.push({ title: '변위측정 위치도', category: '부재변위', imgIdPrefix: 'ndtLocMapMemberDisp', floorCode });
                            }
                            // 위치도를 템플릿 제목 문단별로 나눠 각 제목 바로 아래에 넣는다.
                            // 번호는 캡션에 직접 쓰지 않고 표시만 붙여 두었다가, 문서를 다 만든 뒤
                            // numberHwpxFigureCaptions가 결함위치도와 이어서 [도면 7-N]으로 매긴다.
                            const headingForCategory = (cat) => {
                                if (cat === '실측') return measureHeadingPara;
                                if (cat === '일반비파괴') return strengthCarbHeadingPara;
                                if (cat === '내화피복') return fireproofHeadingPara;
                                return dispHeadingPara; // 기울기·부동침하·부재변위는 "변위조사 위치도" 아래로
                            };
                            const lastParaUnderHeading = new Map();
                            for (const job of locMapInserts) {
                                const heading = headingForCategory(job.category);
                                const usable = (heading && heading.parentNode) ? heading : null;
                                const prev = usable ? lastParaUnderHeading.get(usable) : null;
                                const title = job.title || job.caption || '';
                                const label = (job.manyFloors && job.floorLabel)
                                    ? `${job.floorLabel} ${title}`
                                    : title;
                                const inserted = await appendLocationMap(
                                    HWPX_FIG_MARK + label,
                                    job.category,
                                    job.imgIdPrefix,
                                    job.floorCode || floorCode,
                                    prev || usable,
                                    // 제목 바로 아래 첫 장만 제목과 같은 쪽에 붙인다
                                    !!(usable && !prev)
                                );
                                if (inserted && usable) lastParaUnderHeading.set(usable, inserted);
                            }
                            // ---- 비파괴 장비조사 사진첩 (2026-09-28) ----
                            // 위치도 묶음 바로 뒤에. 제목은 위치도 제목(개요 7.N.)을, 소제목은 "1) 층" 제목을,
                            // 사진 표는 결함 사진첩의 사진 2장짜리 표(사진N·위치·내용)를 복제해 쓴다.
                            try {
                                const albumSections = (ndtMapsApi && typeof ndtMapsApi.buildPhotoAlbumSections === 'function')
                                    ? ndtMapsApi.buildPhotoAlbumSections(allNdtItemsForHwpx, allDispGroupsForHwpx)
                                    : [];
                                const albumHeadingSrc = measureHeadingPara || strengthCarbHeadingPara || fireproofHeadingPara || dispHeadingPara;
                                if (albumSections.length && albumHeadingSrc && ndtAlbumPhotoTblStamp && ndtAlbumPhotoParaStamp) {
                                    if (typeof window.updateLoadingText === 'function') {
                                        window.updateLoadingText('한글(hwpx) 비파괴 장비조사 사진첩 생성 중...');
                                    }
                                    const tplPic = ndtAlbumPhotoTblStamp.getElementsByTagNameNS(HP_NS, 'pic')[0];
                                    const tplCur = tplPic && tplPic.getElementsByTagNameNS(HP_NS, 'curSz')[0];
                                    const albumMaxW = tplCur ? parseInt(tplCur.getAttribute('width'), 10) : 0;
                                    const albumMaxH = tplCur ? parseInt(tplCur.getAttribute('height'), 10) : 0;
                                    if (!albumMaxW || !albumMaxH) throw new Error('사진첩 표에 사진 칸이 없습니다.');
                                    const decodeAlbumPhoto = async (entry) => {
                                        if (!entry) return null;
                                        try {
                                            const url = await loadStrengthPhotoDataUrl(entry.bldgId || ndtBldgId, entry.photoId);
                                            if (!url) return null;
                                            const { bytes, mime, ext } = await dataUrlToBytes(url);
                                            const size = await loadImageNaturalSizeFromBytes(bytes, mime);
                                            return { entry, bytes, mime, ext, w: size.w, h: size.h };
                                        } catch (onePhotoErr) {
                                            console.warn('비파괴 사진 1장 임베드 실패(해당 컷만 생략):', entry.photoId, onePhotoErr);
                                            return null;
                                        }
                                    };
                                    const album = await insertHwpxNdtPhotoAlbum({
                                        hpNs: HP_NS,
                                        sections: albumSections,
                                        anchorPara: (mapAnchor && mapAnchor.parentNode) ? mapAnchor
                                            : (mapInsertBefore ? mapInsertBefore.previousElementSibling : null),
                                        headingStamp: albumHeadingSrc,
                                        subHeadingStamp: ndtAlbumSubHeadingStamp,
                                        photoParaStamp: ndtAlbumPhotoParaStamp,
                                        ensureTblTreatAsChar,
                                        buildPairTbl: async (e1, e2) => {
                                            let s1 = await decodeAlbumPhoto(e1);
                                            let s2 = await decodeAlbumPhoto(e2);
                                            if (!s1) { s1 = s2; s2 = null; }
                                            if (!s1) return null;
                                            photoTblCounter++;
                                            const newTbl = ndtAlbumPhotoTblStamp.cloneNode(true);
                                            newTbl.setAttribute('id', String(9500000 + photoTblCounter));
                                            const pics = Array.from(newTbl.getElementsByTagNameNS(HP_NS, 'pic'));
                                            pics.forEach((p, pIdx) => {
                                                p.setAttribute('id', String(9600000 + photoTblCounter * 2 + pIdx));
                                                p.setAttribute('instid', String(9700000 + photoTblCounter * 2 + pIdx));
                                            });
                                            const rows = Array.from(newTbl.getElementsByTagNameNS(HP_NS, 'tr')).filter(tr => tr.parentNode === newTbl);
                                            const capTcs = rows[1] ? rows[1].getElementsByTagNameNS(HP_NS, 'tc') : [];
                                            const descTcs = rows[2] ? rows[2].getElementsByTagNameNS(HP_NS, 'tc') : [];
                                            if (pics.length < 2 || capTcs.length < 7 || descTcs.length < 4) {
                                                throw new Error('사진첩 표 모양이 예상(사진 2장·사진N/위치/내용)과 다릅니다.');
                                            }
                                            const place = (slot, pic, labelTc, locTc, descTc) => {
                                                imgCounter++;
                                                const imgId = `ndtAlbum${imgCounter}`;
                                                zip.file(`BinData/${imgId}.${slot.ext}`, slot.bytes);
                                                manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${slot.ext}" media-type="${slot.mime}" isEmbeded="1"/>`);
                                                setPicImage(pic, imgId, slot.w, slot.h, albumMaxW, albumMaxH);
                                                setTcText(labelTc, slot.entry.label);
                                                setTcText(locTc, slot.entry.location);
                                                setTcText(descTc, slot.entry.content);
                                            };
                                            place(s1, pics[0], capTcs[0], capTcs[2], descTcs[1]);
                                            if (s2) place(s2, pics[1], capTcs[4], capTcs[6], descTcs[3]);
                                            else stripPhotoTblRightHalf(newTbl);
                                            return newTbl;
                                        }
                                    });
                                    if (album) ndtAlbumTitlePara = album.titlePara;
                                }
                            } catch (albumErr) {
                                console.error('비파괴 장비조사 사진첩 삽입 실패(나머지는 계속 진행):', albumErr);
                                window.showToast('비파괴 장비조사 사진첩을 넣지 못했습니다: ' + albumErr.message, 'warning', 5000);
                            }
                            // 위치도가 하나도 안 들어간 제목은 빈 제목만 남으므로 지운다.
                            // 들어간 제목은 쪽 나눔을 켜서 위치도 묶음이 새 쪽에서 시작하게 한다.
                            mapHeadingCandidates.forEach((p) => {
                                if (!p || !p.parentNode) return;
                                if (lastParaUnderHeading.has(p)) p.setAttribute('pageBreak', '1');
                                else p.parentNode.removeChild(p);
                            });
                        }
                    }
                }
            } } catch (ndtErr) {
                console.error('비파괴조사 섹션 삽입 실패(나머지는 계속 진행):', ndtErr);
                window.showToast('비파괴조사 섹션 삽입 중 오류가 있어 해당 부분은 제외하고 만듭니다: ' + ndtErr.message, 'warning', 5000);
            }

            // ---- 표본 템플릿 잔여 내용 정리 ----
            // 템플릿은 완성된 표본 보고서 원본이라, 위에서 실제로 채운 층 블록/비파괴조사 5개 섹션
            // 말고는 표본 데이터가 그대로 남아있다 — 다른 층들의 상태조사표/사진첩/위치도 전체와,
            // 표본 건물의 "비파괴 장비조사 사진첩"이 대표적이다. 이걸 지우지 않으면 실제 결함 사진과
            // 무관한 표본 사진이 내보낸 문서에 섞여 나온다. 정기점검용 템플릿에는 이 마커들이 애초에
            // 없어서 아래 find()가 전부 못 찾고 조용히 넘어간다(해로울 게 없음). 실패해도 이미 만든
            // 상태조사표/사진/위치도는 살려서 내보내야 하므로 전체를 try/catch로 감싼다.
            try {
                // 1) 실제로 채운 층 블록들 다음에 남은 표본 층 블록(있다면)은 통째로 삭제한다.
                if (unusedFloorSlotStart) removeParaRange(unusedFloorSlotStart, null);

                // "비파괴 장비조사 사진첩"(표본 NDT 사진, 우리 코드가 다루지 않음) 섹션의 경계를
                // 찾아둔다. "비파괴 장비조사 위치도" 섹션 자체는 NDT try 블록 끝에서 이미 정리·
                // 재구성했으므로(모든 결과표 뒤에 위치도를 한꺼번에 모아 넣는 단계) 여기서는
                // 사진첩만 처리한다.
                const albumStart = secChildren().find(p => p !== ndtAlbumTitlePara && /^비파괴 장비조사 사진첩/.test(paraText(p).trim()));
                const surveyHeading = secChildren().find(p => /^주요 상태조사표, 사진 및 위치도/.test(paraText(p).trim()));

                // 2) "비파괴 장비조사 사진첩" 섹션 전체 삭제
                if (albumStart) removeParaRange(albumStart, surveyHeading || null);
            } catch (cleanupErr) {
                console.error('표본 템플릿 잔여 내용 정리 실패(나머지는 유지):', cleanupErr);
            }


            useDongOf(null);
            // ---- 전경사진 (문서 맨 마지막) ----
            try {
                // 여러 동이면 동 순서대로, 캡션 앞에 동 이름
                const overviewOwners = dongParts
                    ? dongParts.map((p) => ({ b: p.bldg, pre: `${p.dongLabel} ` }))
                    : [{ b: bldg, pre: '' }];
                const overviewReady = [];
                for (const owner of overviewOwners) {
                    await hydrateBuildingOverviewPhotos(owner.b);
                    const overviewList = (getBuildingOverviewPhotos(owner.b) || []).filter((p) => p && (p.dataUrl || p.id));
                    for (const p of overviewList) {
                        let src = p.dataUrl;
                        if (!src && p.id) src = await loadOverviewPhotoDataUrl(owner.b.id, p.id);
                        if (!src) continue;
                        overviewReady.push({
                            caption: owner.pre + ((p.caption != null && String(p.caption).trim()) ? String(p.caption).trim() : '전경사진'),
                            dataUrl: src
                        });
                    }
                }
                if (overviewReady.length > 0) {
                    const OV_HEADING_XML = `<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:t>전경사진</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p>`;
                    const OV_PHOTO_TBL_PARA_XML = '<hp:p id="0" paraPrIDRef="13" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="53"><hp:tbl id="TBL_ID" zOrder="11" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="1" rowCnt="2" colCnt="1" cellSpacing="0" borderFillIDRef="5" noAdjust="0"><hp:sz width="41821" widthRelTo="ABSOLUTE" height="64087" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="140" right="140" top="140" bottom="140"/><hp:inMargin left="140" right="140" top="140" bottom="140"/><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="15"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="6"><hp:pic id="PIC_ID" zOrder="36" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" thumbnailBinIDRef="" href="" groupLevel="0" instid="PIC_INSTID" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="768540" height="969540"/><hp:curSz width="41541" height="52405"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="20770" centerY="26202" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.054052" e2="0" e3="0" e4="0" e5="0.054051" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="768540" y="0"/><hc:pt2 x="768540" y="969540"/><hc:pt3 x="0" y="969540"/></hp:imgRect><hp:imgClip left="0" right="648540" top="0" bottom="818100"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="648540" dimheight="818100"/><hp:effects/><hp:sz width="41541" widthRelTo="ABSOLUTE" height="52405" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="1320" horzpos="0" horzsize="0" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="60813"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="16"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="1" styleIDRef="16" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="43"><hp:t>CAPTION</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="41540" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="41821" height="3274"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="64367" textheight="64367" baseline="54712" spacing="960" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>';
                    const OV_MAX_W = 41821 - 141 - 141;
                    const OV_MAX_H = 60813 - 141 - 141;
                    const escapeXmlText = (s) => String(s || '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');

                    const headingDoc = new DOMParser().parseFromString(
                        `<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${OV_HEADING_XML}</root>`,
                        'application/xml'
                    );
                    sec.appendChild(xmlDoc.importNode(headingDoc.documentElement.firstChild, true));

                    for (let oi = 0; oi < overviewReady.length; oi++) {
                        const item = overviewReady[oi];
                        imgCounter++;
                        const xml = OV_PHOTO_TBL_PARA_XML
                            .replace('TBL_ID', String(8900000 + imgCounter))
                            .replace('PIC_ID', String(8910000 + imgCounter))
                            .replace('PIC_INSTID', String(8920000 + imgCounter))
                            .replace('CAPTION', escapeXmlText(item.caption));
                        const docOv = new DOMParser().parseFromString(
                            `<root xmlns:hp="${HP_NS}" xmlns:hc="${HC_NS}">${xml}</root>`,
                            'application/xml'
                        );
                        const newPara = xmlDoc.importNode(docOv.documentElement.firstChild, true);
                        if (oi === 0) newPara.setAttribute('pageBreak', '0');
                        else newPara.setAttribute('pageBreak', '1');
                        sec.appendChild(newPara);
                        const pic = newPara.getElementsByTagNameNS(HP_NS, 'pic')[0];
                        const { bytes, mime, ext } = await dataUrlToBytes(item.dataUrl);
                        const size = await loadImageSize(item.dataUrl);
                        const imgId = `overviewPhoto${imgCounter}`;
                        zip.file(`BinData/${imgId}.${ext}`, bytes);
                        manifestAdds.push(`<opf:item id="${imgId}" href="BinData/${imgId}.${ext}" media-type="${mime}" isEmbeded="1"/>`);
                        setPicImage(pic, imgId, size.w, size.h, OV_MAX_W, OV_MAX_H);
                        ensureTblTreatAsChar(newPara.getElementsByTagNameNS(HP_NS, 'tbl')[0]);
                    }
                }
            } catch (ovErr) {
                console.error('전경사진 HWPX 삽입 실패(나머지는 유지):', ovErr);
            }

            // ---- 손글씨 메모 (전경사진 바로 뒤) ----
            try {
                imgCounter = await appendHwpxSketchMemoSection({
                    bldg, sec, xmlDoc, zip, HP_NS, HC_NS, getFloorLabel, imgCounter, dongParts,
                    dataUrlToBytes, setPicImage, ensureTblTreatAsChar, manifestAdds
                });
            } catch (skErr) {
                console.error('손글씨 메모 HWPX 삽입 실패(나머지는 유지):', skErr);
            }

            // ---- 균열게이지·균열팁 (문서 맨 마지막 — 전경사진 뒤) ----
            try {
                const crackHdrState = { text: hwpxHeaderText, dirty: hwpxHeaderDirty };
                await appendHwpxCrackMonitorSectionEnd({
                    bldg, bldgId, getFloorLabel, sec, xmlDoc, zip, dongParts,
                    setTcText, ensureTblTreatAsChar, dataUrlToBytes, loadImageSize, setPicImage,
                    ensureDefectPhotosLoaded, manifestAdds,
                    counters: { imgCounter, cloneIdSeq },
                    mergeStampHeader: mergeGrade3CompareStampHeader,
                    remapStampNode: remapHwpxCompareNode,
                    hwpxHeaderState: crackHdrState
                });
                hwpxHeaderText = crackHdrState.text;
                hwpxHeaderDirty = crackHdrState.dirty;
            } catch (crackAppendErr) {
                console.error('균열게이지·팁 HWPX 섹션 추가 실패(나머지는 유지):', crackAppendErr);
            }

            Array.from(xmlDoc.getElementsByTagNameNS(HP_NS, 'tbl')).forEach(ensureTblTreatAsChar);

            // 결함위치도·비파괴 장비조사 위치도 캡션에 [도면 7-N]을 하나로 이어서 매긴다.
            // 문서가 완성된 뒤라야 최종 배치 순서대로 번호가 맞는다.
            numberHwpxFigureCaptions(xmlDoc, bldg.inspectionType);

            if (hwpxHeaderDirty && hwpxHeaderText) {
                zip.file('Contents/header.xml', hwpxHeaderText);
            }

            if (manifestAdds.length > 0) {
                let hpfText = await zip.file('Contents/content.hpf').async('string');
                // 실제 쓰인 섹션 파일(section1 또는 section0)의 매니페스트 항목 앞에 새 이미지 항목들을 끼워 넣는다.
                const sectionItemId = sectionPath.replace('Contents/', '').replace('.xml', '');
                const manifestMarker = `<opf:item id="${sectionItemId}"`;
                if (hpfText.indexOf(manifestMarker) < 0) throw new Error('매니페스트 삽입 위치를 찾지 못했습니다.');
                hpfText = hpfText.replace(manifestMarker, manifestAdds.join('') + manifestMarker);
                zip.file('Contents/content.hpf', hpfText);
            }

            let newXml = new XMLSerializer().serializeToString(xmlDoc);
            if (!newXml.startsWith('<?xml')) {
                newXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + newXml;
            }
            newXml = forceHwpxArabicPageNumbers(newXml);
            // 2026-10-19 8.5pt로 들어가던 글자는 전부 8pt(js/shared/hwpx-font-8pt.js) — 본문 줄·글자 모양 모두
            const font8pt = window.BSA && window.BSA.shared && window.BSA.shared.hwpxFont8pt;
            if (font8pt) {
                newXml = font8pt.sectionTo8pt(newXml);
                await font8pt.applyHeaderToZip(zip);
            }
            zip.file(sectionPath, newXml);

            // 원본처럼 mimetype/version.xml은 무압축(Store)으로 유지
            zip.file('mimetype', await zip.file('mimetype').async('string'), { compression: 'STORE' });
            zip.file('version.xml', await zip.file('version.xml').async('string'), { compression: 'STORE' });

            // JSZip이 중첩 경로(Contents/section1.xml) 파일을 다시 쓸 때 원본에는 없던 빈 폴더
            // 항목(예: "Contents/")을 자동으로 끼워 넣는 경우가 있어 원본과 항목 구성을 동일하게
            // 맞춘다. zip.remove()는 폴더 지정 시 그 안의 파일까지 재귀적으로 지워버리므로 절대
            // 쓰면 안 되고, 내부 맵(zip.files)에서 그 폴더 키 하나만 직접 지운다.
            Object.keys(zip.files).forEach(name => { if (zip.files[name].dir) delete zip.files[name]; });

            await reportHwpxStructure(zip, sectionPath, newXml, bldg);

            if (typeof window.updateLoadingText === 'function') {
                window.updateLoadingText('한글(hwpx) 파일 압축 중...');
            }
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 1 },
                mimeType: 'application/hwp+zip'
            });

            const bldgName = ((dongOpts && dongOpts.fileName) || bldg.name || '건축물').replace(/^🏢\s*/, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `${bldgName}_상태조사표_전체층_${dateStr}.hwpx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const totalDefectCount = floorsData.reduce((sum, f) => sum + f.pageDefects.length, 0);
            window.showToast(`hwpx 파일을 생성했습니다 (${floorsData.length}개 층, 총 ${totalDefectCount}건 반영).`, 'success', 4000);
    }

    // Binding All Header & Survey Report Action Buttons
    const btnPreviewReport = document.getElementById('btnPreviewReport');
    if (btnPreviewReport) {
        btnPreviewReport.addEventListener('click', window.openReportPreviewModalFunc);
    }

    const btnOpenReportPreview = document.getElementById('btnOpenReportPreview');
    if (btnOpenReportPreview) {
        btnOpenReportPreview.addEventListener('click', window.openReportPreviewModalFunc);
    }

    const btnExportPDF = document.getElementById('btnExportPDF');
    if (btnExportPDF) {
        btnExportPDF.addEventListener('click', window.exportPDF);
    }

    const btnModalExportPdf = document.getElementById('btnModalExportPdf');
    if (btnModalExportPdf) {
        btnModalExportPdf.addEventListener('click', window.exportPDF);
    }

    // Theme Toggle Handler (Default Pure Light White Theme)
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
        btnThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        btnThemeToggle.title = "다크/라이트 모드 전환 (현재: 화이트 톤)";
        btnThemeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.contains('theme-light');
            if (isLight) {
                document.body.classList.remove('theme-light');
                document.body.classList.add('theme-dark');
                btnThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
                localStorage.setItem('building_theme', 'dark');
            } else {
                document.body.classList.remove('theme-dark');
                document.body.classList.add('theme-light');
                btnThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
                localStorage.setItem('building_theme', 'light');
            }
        });
    }

    const btnPrintReport = document.getElementById('btnPrintReport');
    if (btnPrintReport) {
        btnPrintReport.addEventListener('click', () => {
            window.openReportPreviewModalFunc();
            setTimeout(() => window.print(), 300);
        });
    }

    const btnModalPrint = document.getElementById('btnModalPrint');
    if (btnModalPrint) {
        btnModalPrint.addEventListener('click', () => window.print());
    }

    const btnCloseReportPreviewModal = document.getElementById('btnCloseReportPreviewModal');
    if (btnCloseReportPreviewModal) {
        btnCloseReportPreviewModal.addEventListener('click', () => {
            const modal = document.getElementById('reportPreviewModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('open');
            }
        });
    }

    // 결함 레코드 1건을 사진 삭제 포함해서 제거 (저장/재렌더링은 호출부 책임 — 그룹 일괄삭제 시 중복 저장 방지)
    function removeSingleDefectRecord(key, id, options) {
        const skipRenumber = !!(options && options.skipRenumber);
        const target = state.defects[key].find(d => d.id === id);
        const affectedGroupId = target && target.groupId ? target.groupId : null;
        const groupIdsBefore = affectedGroupId
            ? new Set(state.defects[key].filter((d) => d && d.groupId === affectedGroupId && d.id !== id).map((d) => d.id))
            : null;
        if (target) {
            trackDefectDeletion(key, id, target);
            deleteAllPhotosForDefect(target, { deferCloudFloorKey: key }).then(failCount => {
                if (failCount > 0) {
                    window.showToast(`사진 ${failCount}건 삭제에 실패했습니다. 네트워크 상태를 확인해 주세요.`, 'warning', 5000);
                }
            });
        }
        // 결함 통합 화살표를 지우면 그 화살표의 결함표 행(X-k)도 함께 지운다(행 내용·사진은 화살표 쪽)
        const mergeApiDel = defectMergeApi();
        const linkedMergeExtras = (target && mergeApiDel && mergeApiDel.isMergedArrow(target))
            ? state.defects[key].filter((e) => e && e.surveyExtra && e.mergeSourceId === id && e.groupId === target.groupId)
            : [];
        linkedMergeExtras.forEach((e) => {
            trackDefectDeletion(key, e.id, e);
            deleteAllPhotosForDefect(e, { deferCloudFloorKey: key }).catch(() => {});
        });
        const linkedMergeExtraIds = new Set(linkedMergeExtras.map((e) => e.id));
        state.defects[key] = state.defects[key].filter(d => d.id !== id && !linkedMergeExtraIds.has(d.id));
        // 같은 그룹 남은 마킹의 -2,-3… 접미사를 앞으로 당김 (2 삭제 → 옛 3이 2가 됨)
        if (affectedGroupId) {
            normalizeDefectGroupNos(state.defects[key], affectedGroupId);
        }
        collapseSingletonDefectGroups(state.defects[key]);
        stampDefectsLeftGroup(state.defects[key], affectedGroupId, groupIdsBefore);
        // 삭제 후 층 전체 재부여(renumberFloorDefects)는 하지 않는다.
        // CAD 최대번호 다음으로 수동 마킹을 밀어 기존 번호가 공란이 되고
        // 마지막 번호가 +1 되는 버그가 난다. 남은 마킹 번호는 유지하고,
        // 다음 신규 번호는 getNextDefectMainNumber(max+1)로 자연스럽게 이어간다.
        // (빈 칸 채우기는 사용자가 '마킹번호 빈칸 땡기기'로 수행)
        if (!skipRenumber && affectedGroupId) {
            normalizeDefectGroupNos(state.defects[key], affectedGroupId);
        }
    }

    /* ---------------- 한글 출력 전 규칙 검토(2026-10-20) ----------------
     * 미리보기 「검토」 → 모든 층 상태조사표 행(getSurveyRowsForReport, 한글과 같은 행)을 js/core/report-review.js 로 훑어
     * 원인 빠짐·균열폭 단위·같은 말 두 번·빈칸·복사 중복 등을 목록으로 보여 준다. 고치지는 않고, 줄을 누르면 그 결함으로 간다. */
    function reportReviewFloorCodes(bldg) {
        if (bldg && bldg.id && typeof listNdtFloorCodesForBuilding === 'function') return listNdtFloorCodesForBuilding(bldg.id);
        if (typeof window.getBuildingAvailableFloors === 'function') return (window.getBuildingAvailableFloors(bldg) || []).map((f) => f && f.floorCode).filter(Boolean);
        return [state.currentFloor].filter(Boolean);
    }
    function collectReportReviewRows() {
        const bldg = state.currentBuilding;
        if (!bldg) return [];
        const bId = bldg.id || state.currentBuildingId;
        const rows = [];
        // 2026-10-28 행·열을 설정해 둔 층은 위치를 행·열로 보므로 위치 빈칸을 안 잡는다(행·열 없는 층은 그대로 잡음)
        const G = gridLib();
        reportReviewFloorCodes(bldg).forEach((fc) => {
            const defects = state.defects[`${bId}_${fc}`] || (state.currentFloor === fc ? getCurrentFloorDefects() : []);
            if (!defects.length) return;
            const rawGrid = G && state.floorGridLines && state.floorGridLines[getFloorMapStyleKey(bId, fc)];
            const gridSet = !!rawGrid && gridHasLines(rawGrid.__gridNorm ? rawGrid : G.normalizeGrid(rawGrid));
            const floorLabel = stripFloorCodeSuffix(window.getFloorLabelFromCode(fc));
            getSurveyRowsForReport(defects).forEach((d) => {
                const ms = Array.isArray(d.crackMeasures) && d.crackMeasures.length ? d.crackMeasures : null;
                rows.push({
                    id: d.id,
                    floorCode: fc,
                    floorLabel,
                    no: d.no,
                    good: isGoodDefectType(d.defectType),
                    // 위치는 한글에 나가는 글자로(3종은 비면 층·부재를 채운다)
                    location: getSurveyCellText('location', d, { floorCode: fc }),
                    gridSet,
                    component: d.component || '',
                    defectType: d.defectType || '',
                    cause: d.cause || '',
                    // 2026-11-08 「구조 부재인데 비구조체」 검토용 — 필드 없는 옛 데이터는 구조체(조사표 기본값)
                    category: d.category == null ? '구조체' : String(d.category),
                    widths: getDefectCrackWidthParts(d),
                    crackLength: ms ? ms.map((m) => (m && m.length != null ? m.length : '')).filter((v) => String(v).trim()).join('/') : (d.crackLength || ''),
                    itemCount: ms ? ms.map((m) => (m && m.count != null ? m.count : '')).filter((v) => String(v).trim()).join('/') : (d.itemCount || ''),
                    sizeText: d.size || ''
                });
            });
        });
        return rows;
    }
    // 2026-10-20 「미리보기를 닫아야 검토를 할 수 있다」 → 결과는 미리보기 밖에 떠 있는 창. 줄을 눌러 결함으로 가도 창은 남고,
    // 다 본 줄은 체크(건물별로 기억), 고친 뒤 「다시 검사」, 「미리보기」로 다시 열기. 미리보기가 열려 있으면 그 위, 아니면 다른 창들 아래.
    const RR_CHECK_KEY = 'bsa_report_review_checked:';
    let rrIssues = [];
    let rrRowCount = 0;
    let rrActiveKey = '';
    const rrKey = (it) => [it.rule, it.floorCode, it.id, it.msg].join('|');
    function rrCheckedSet() {
        try { return new Set(JSON.parse(localStorage.getItem(RR_CHECK_KEY + (state.currentBuildingId || '')) || '[]')); } catch (_e) { return new Set(); }
    }
    function rrSaveChecked(set) {
        // 지금 목록에 없는 체크는 버린다(고쳐서 사라진 것)
        const live = new Set(rrIssues.map(rrKey));
        try { localStorage.setItem(RR_CHECK_KEY + (state.currentBuildingId || ''), JSON.stringify([...set].filter((k) => live.has(k)))); } catch (_e) { /* ignore */ }
    }
    function syncReportReviewLayer() {
        const panel = document.getElementById('reportReviewPanel');
        const modal = document.getElementById('reportPreviewModal');
        if (panel) panel.classList.toggle('is-over-modal', !!(modal && modal.classList.contains('open')));
    }
    function runReportReview() {
        const R = window.BsaReportReview;
        if (!R) return;
        const rows = collectReportReviewRows();
        const issues = R.reviewRows(rows);
        // 층(보고서 순서)·번호 순으로 묶어 보여 준다
        const floorOrder = [];
        rows.forEach((r) => { if (floorOrder.indexOf(r.floorCode) < 0) floorOrder.push(r.floorCode); });
        const noKey = (n) => { const m = String(n || '').match(/^(\d+)(?:-(\d+))?/); return m ? (+m[1]) * 1000 + (+(m[2] || 0)) : 1e9; };
        issues.sort((a, b) => (floorOrder.indexOf(a.floorCode) - floorOrder.indexOf(b.floorCode)) || (noKey(a.no) - noKey(b.no)));
        rrIssues = issues;
        rrRowCount = rows.length;
        drawReportReview();
    }
    function drawReportReview() {
        const panel = document.getElementById('reportReviewPanel');
        if (!panel) return;
        const checked = rrCheckedSet();
        const cnt = { error: 0, warn: 0, info: 0 };
        let left = 0;
        rrIssues.forEach((it) => { cnt[it.level]++; if (!checked.has(rrKey(it))) left++; });
        const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const icon = { error: '⛔', warn: '⚠️', info: 'ℹ️' };
        const modalOpen = !!document.querySelector('#reportPreviewModal.open');
        let html = '<div class="report-review-head" data-rr-drag title="끌어서 옮기기"><b>검토 결과</b> <span>조사표 ' + rrRowCount + '행</span>'
            + (rrIssues.length ? ' · <span class="rr-error">확인 필요 ' + cnt.error + '</span> · <span class="rr-warn">주의 ' + cnt.warn + '</span> · <span class="rr-info">참고 ' + cnt.info + '</span> · <span class="rr-left">남음 ' + left + '</span>' : ' · <span class="rr-ok">이상한 곳을 찾지 못했습니다</span>')
            + '<span class="report-review-tools">'
            + '<button type="button" data-rr-act="rerun" title="고친 뒤 다시 훑기(체크는 그대로)">↻ 다시 검사</button>'
            + (modalOpen ? '' : '<button type="button" data-rr-act="preview" title="보고서 미리보기 다시 열기">미리보기</button>')
            + '<button type="button" data-rr-act="fold" title="접기·펴기">' + (panel.classList.contains('is-folded') ? '▢' : '—') + '</button>'
            + '<button type="button" data-rr-act="close" title="닫기">✕</button></span></div>';
        if (rrIssues.length) {
            html += '<ul class="report-review-list">' + rrIssues.map((it) => {
                const k = rrKey(it), done = checked.has(k);
                return '<li class="rr-' + it.level + (done ? ' is-done' : '') + (k === rrActiveKey ? ' is-active' : '') + '">'
                    + '<label class="rr-check" title="다 봤으면 체크"><input type="checkbox" data-rr-check="' + esc(k) + '"' + (done ? ' checked' : '') + '></label>'
                    + '<button type="button" data-rr-id="' + esc(it.id) + '" data-rr-key="' + esc(k) + '" title="결함위치도에서 이 결함 보기(이 창은 그대로)">'
                    + '<span class="rr-icon">' + icon[it.level] + '</span><span class="rr-where">' + esc(it.floorLabel) + ' ' + esc(it.no) + (it.no ? '번' : '') + '</span>'
                    + '<span class="rr-msg">' + esc(it.msg) + '</span></button></li>';
            }).join('') + '</ul>';
        }
        html += '<div class="report-review-foot">규칙으로만 훑습니다(오타·문맥은 못 잡음). 상태양호·보수완료 행은 원인·균열폭 검사에서 뺍니다. 줄을 누르면 그 결함으로 가고 이 창은 남습니다 — 고친 뒤 「다시 검사」.</div>';
        panel.innerHTML = html;
        panel.hidden = false;
        syncReportReviewLayer();
        const btn = document.getElementById('btnModalReportReview');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-list-check"></i> 검토' + (cnt.error + cnt.warn ? ' <b class="rr-badge">' + (cnt.error + cnt.warn) + '</b>' : '');
    }
    (function bindReportReview() {
        const btn = document.getElementById('btnModalReportReview');
        const panel = document.getElementById('reportReviewPanel');
        if (!btn || !panel) return;
        const safeRun = () => { try { runReportReview(); } catch (err) { window.showToast?.('검토하지 못했습니다: ' + (err && err.message ? err.message : err), 'error', 4000); } };
        btn.addEventListener('click', () => { panel.classList.remove('is-folded'); safeRun(); });
        // 미리보기가 열리고 닫힐 때 창 높이(겹침 순서)를 맞춘다
        const modal = document.getElementById('reportPreviewModal');
        if (modal && typeof MutationObserver === 'function') {
            new MutationObserver(() => { syncReportReviewLayer(); if (!panel.hidden) drawReportReview(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
        panel.addEventListener('change', (e) => {
            const cb = e.target.closest('[data-rr-check]');
            if (!cb) return;
            const set = rrCheckedSet();
            if (cb.checked) set.add(cb.dataset.rrCheck); else set.delete(cb.dataset.rrCheck);
            rrSaveChecked(set);
            drawReportReview();
        });
        panel.addEventListener('click', (e) => {
            const act = e.target.closest('[data-rr-act]');
            if (act) {
                const a = act.dataset.rrAct;
                if (a === 'close') panel.hidden = true;
                else if (a === 'rerun') safeRun();
                else if (a === 'fold') { panel.classList.toggle('is-folded'); drawReportReview(); }
                else if (a === 'preview' && typeof window.openReportPreviewModalFunc === 'function') window.openReportPreviewModalFunc();
                return;
            }
            const b = e.target.closest('[data-rr-id]');
            if (!b || !b.dataset.rrId) return;
            rrActiveKey = b.dataset.rrKey || '';
            const m = document.getElementById('reportPreviewModal');
            if (m) { m.style.display = 'none'; m.classList.remove('open'); }
            if (typeof window.viewDefectOnMapFromSurvey === 'function') window.viewDefectOnMapFromSurvey(b.dataset.rrId);
            drawReportReview();
        });
        // 머리를 끌어 옮기기(지도·수정창을 가리지 않게)
        panel.addEventListener('pointerdown', (e) => {
            const head = e.target.closest('[data-rr-drag]');
            if (!head || e.target.closest('button') || e.button > 0) return;
            const r = panel.getBoundingClientRect();
            const ox = e.clientX - r.left, oy = e.clientY - r.top;
            const move = (ev) => {
                const x = Math.min(Math.max(0, ev.clientX - ox), window.innerWidth - 80);
                const y = Math.min(Math.max(0, ev.clientY - oy), window.innerHeight - 40);
                panel.style.left = x + 'px'; panel.style.top = y + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
            };
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            e.preventDefault();
        });
    })();

    window.deleteDefectById = async function(id, options) {
        if (!options?.skipConfirm && !await window.confirmDelete('이 결함을 삭제할까요?')) return false;
        if (!id || !state.currentBuildingId) return false;
        const located = (typeof findDefectFloorKeyById === 'function') ? findDefectFloorKeyById(id) : null;
        const key = located
            ? located.floorKey
            : `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.defects[key]) return false;
        const exists = (state.defects[key] || []).some((d) => d && d.id === id);
        if (!exists) return false;
        pushDefectHistory();
        removeSingleDefectRecord(key, id);
        if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') discardStalePendingRemoteAfterLocalPinEdit();
        if (typeof selectedDefectIds !== 'undefined') {
            selectedDefectIds.delete(id);
        }
        saveStateToLocalStorage();
        renderSurveyTable();
        drawCanvas();
        if (typeof updateMapSelectionBar === 'function') {
            updateMapSelectionBar({ scrollToSelection: false });
        } else if (typeof renderDefectListPanel === 'function') {
            renderDefectListPanel();
        }
        return true;
    };

    // "마킹 추가"로 여러 위치에 묶인 결함 그룹 전체를 삭제
    window.deleteDefectGroup = async function(groupId, options) {
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!options?.skipConfirm) {
            const count = (state.defects[key] || []).filter(d => d.groupId === groupId).length;
            const msg = count > 1
                ? `묶인 결함 ${count}개 위치를 모두 삭제할까요?`
                : '이 결함을 삭제할까요?';
            if (!await window.confirmDelete(msg)) return;
        }
        if (state.defects[key]) {
            pushDefectHistory();
            const memberIds = state.defects[key].filter(d => d.groupId === groupId).map(d => d.id);
            memberIds.forEach(id => removeSingleDefectRecord(key, id, { skipRenumber: true }));
            if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') discardStalePendingRemoteAfterLocalPinEdit();
            // 그룹 전체 삭제 시에도 다른 마킹 번호는 건드리지 않음
            normalizeAllDefectGroupNos(state.defects[key]);
            collapseSingletonDefectGroups(state.defects[key]);
            saveStateToLocalStorage();
            renderSurveyTable();
            drawCanvas();
        }
    };

    // Company Name Save Button (Home Dashboard)
    const btnSaveHomeCompany = document.getElementById('btnSaveHomeCompanyName');
    if (btnSaveHomeCompany) {
        btnSaveHomeCompany.addEventListener('click', () => {
            const val = (document.getElementById('inputHomeCompanyName')?.value || '').trim() || '(주)한국안전진단기술원';
            window.state.companyName = val;
            localStorage.setItem('building_company_name', val);
            window.showToast(`점검 수행회사명이 '${val}'(으)로 저장되었습니다.`, 'success');
        });
    }

    const btnPurgeDeletedCodes = document.getElementById('btnPurgeDeletedCodes');
    if (btnPurgeDeletedCodes) {
        btnPurgeDeletedCodes.addEventListener('click', async () => {
            if (!await window.appConfirm('전원(5명 이상 포함)이 온라인 동기화를 끝낸 뒤에만 실행하세요.\n\n아직 동기화하지 않은 기기가 있으면, 정리된 코드로 옛 결함이 다시 살아날 수 있습니다.\n삭제된 고유코드를 비워 재사용 가능하게 할까요?')) return;
            const n = typeof window.purgeDeletedDefectCodes === 'function'
                ? window.purgeDeletedDefectCodes()
                : (typeof window.purgeConfirmedDeletedDefectCodes === 'function'
                    ? window.purgeConfirmedDeletedDefectCodes()
                    : 0);
            window.showToast(n > 0 ? `삭제 코드 ${n}건을 정리했습니다. 이제 재사용 가능합니다.` : '정리할 삭제 코드가 없습니다.', n > 0 ? 'success' : 'info');
        });
    }

    const btnOpenBuildingTrash = document.getElementById('btnOpenBuildingTrash');
    if (btnOpenBuildingTrash) {
        btnOpenBuildingTrash.addEventListener('click', () => {
            if (typeof window.openBuildingTrashModal === 'function') window.openBuildingTrashModal();
        });
    }
    const btnCloseBuildingTrashModal = document.getElementById('btnCloseBuildingTrashModal');
    if (btnCloseBuildingTrashModal) {
        btnCloseBuildingTrashModal.addEventListener('click', () => window.closeBuildingTrashModal?.());
    }
    const btnCloseBuildingTrashFooter = document.getElementById('btnCloseBuildingTrashFooter');
    if (btnCloseBuildingTrashFooter) {
        btnCloseBuildingTrashFooter.addEventListener('click', () => window.closeBuildingTrashModal?.());
    }
    const buildingTrashModal = document.getElementById('buildingTrashModal');
    if (buildingTrashModal) {
        buildingTrashModal.addEventListener('click', (e) => {
            if (e.target === buildingTrashModal) window.closeBuildingTrashModal?.();
        });
    }

    const btnReloadWebApp = document.getElementById('btnReloadWebApp');
    if (btnReloadWebApp) {
        btnReloadWebApp.addEventListener('click', () => {
            window.reloadWebAppFromServer?.();
        });
    }

    const btnTogglePerfMode = document.getElementById('btnTogglePerfMode');
    if (btnTogglePerfMode) {
        btnTogglePerfMode.addEventListener('click', () => {
            if (!window.BSA?.performance?.cycleMode) return;
            const next = window.BSA.performance.cycleMode();
            const label = window.BSA.performance.getModeLabel(next);
            window.showToast?.('성능 모드: ' + label, 'info');
            if ((state.currentTab === 'tab-map')) {
                if (typeof resizeCanvas === 'function') resizeCanvas();
                drawCanvas({ immediate: true });
            } else if (state.currentTab === 'tab-ndt') {
                if (typeof resizeNdtCanvas === 'function') resizeNdtCanvas();
                if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            }
        });
    }

    const btnClearPdfCache = document.getElementById('btnClearPdfCache');
    if (btnClearPdfCache) {
        btnClearPdfCache.addEventListener('click', async () => {
            if (!await window.appConfirm(
                '기기에 저장된 도면 PDF 원본 캐시를 지울까요?\n\n'
                + '· 서버(Firestore)에 있는 PDF는 그대로입니다.\n'
                + '· 화면용 4000px 도면·결함 데이터는 유지됩니다.\n'
                + '· 확대(HD)·벡터 PDF 등 필요할 때 서버에서 다시 받습니다.'
            )) return;
            btnClearPdfCache.disabled = true;
            try {
                const n = typeof window.clearLocalFloorPdfCache === 'function'
                    ? await window.clearLocalFloorPdfCache()
                    : 0;
                window.showToast(
                    n > 0 ? `PDF 캐시 ${n}건을 지웠습니다.` : '지울 PDF 캐시가 없습니다.',
                    n > 0 ? 'success' : 'info'
                );
                if ((window.state.currentTab === 'tab-map') && window.state.currentFloor && typeof loadFloorDrawing === 'function') {
                    loadFloorDrawing(window.state.currentFloor, { preserveView: true });
                }
            } catch (e) {
                console.warn('PDF 캐시 삭제 실패:', e);
                window.showToast('PDF 캐시 삭제 중 오류가 발생했습니다.', 'error');
            } finally {
                btnClearPdfCache.disabled = false;
            }
        });
    }

    const btnClearImageCache = document.getElementById('btnClearImageCache');
    if (btnClearImageCache) {
        btnClearImageCache.addEventListener('click', async () => {
            if (!await window.appConfirm(
                '이 기기에 받아 둔 도면 그림 캐시를 지울까요?\n\n'
                + '· 서버에 올라간 도면은 그대로입니다. 필요할 때 서버에서 다시 받습니다.\n'
                + '· 아직 서버에 못 올린 도면(업로드 대기)과 서버 확인이 안 된 층은 지우지 않습니다.\n'
                + '· 결함·마킹 데이터는 건드리지 않습니다.\n'
                + '· 인터넷에 연결된 상태에서 눌러 주세요(지운 뒤 다시 받아야 합니다).'
            )) return;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                window.showToast('오프라인에서는 지우지 않습니다. 인터넷에 연결한 뒤 다시 눌러 주세요.', 'warning', 4000);
                return;
            }
            btnClearImageCache.disabled = true;
            try {
                const r = await clearLocalFloorImageCache();
                const kept = r.keptPending + r.keptUnverified;
                window.showToast(
                    `도면 이미지 캐시 ${r.cleared}개 층을 지웠습니다.` + (kept ? ` (서버 미확인·업로드 대기 ${kept}개 층은 남김)` : ''),
                    r.cleared > 0 ? 'success' : 'info',
                    4500
                );
                if ((window.state.currentTab === 'tab-map') && window.state.currentFloor && typeof loadFloorDrawing === 'function') {
                    loadFloorDrawing(window.state.currentFloor, { forceClear: true });
                }
            } catch (e) {
                console.warn('도면 이미지 캐시 삭제 실패:', e);
                window.showToast('도면 이미지 캐시 삭제 중 오류가 발생했습니다.', 'error');
            } finally {
                btnClearImageCache.disabled = false;
            }
        });
    }

    // Inspection Settings Toolbar Selects Change Handlers
    syncInspectionTypeSelectOptionLabels();
    window.addEventListener('resize', () => syncInspectionTypeSelectOptionLabels());
    ['selectInspectionType', 'selectInspectionYear', 'selectInspectionPeriod'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            sel.addEventListener('change', () => {
                if (window.state.currentBuilding) {
                    if (id === 'selectInspectionType') window.state.currentBuilding.inspectionType = sel.value;
                    if (id === 'selectInspectionYear') window.state.currentBuilding.inspectionYear = sel.value;
                    if (id === 'selectInspectionPeriod') window.state.currentBuilding.inspectionPeriod = sel.value;
                    markBuildingMetaDirty(window.state.currentBuilding);
                    // ⚠️ 여기서 "최신 회차" 기준점(latestSurveyRoundKey)을 전진시키지 않는다.
                    // 이 드롭다운은 보고서 미리보기 등으로도 잠깐씩 바뀌는데, 예전엔 change
                    // 이벤트마다 advanceLatestSurveyRound를 호출해서 미리보기로 미래 회차를
                    // 잠깐만 봐도 기준점이 그쪽으로 전진해버려 실제 금회차 결함이 전회차로
                    // 잘못 뒤집히는 버그가 있었다. 기준점 전진은 오직 실제 결함이 등록/가져오기
                    // 되는 시점에만 일어난다(해당 코드에서 advanceLatestSurveyRound 호출).
                    saveStateToLocalStorage();
                }
            });
        }
    });

