// @@app-part 14-extras.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // ==========================================================================
    // 🛠️ 6대 추천 개선 및 신규 기능 모듈 (100% 한글 주석 & 독립 보조엔진)
    // ==========================================================================

    // --- 2. 도면 손상 유형별 필터링 선택 이벤트 ---
    const filterDamageTypeSel = document.getElementById('filterDamageType');
    if (filterDamageTypeSel) {
        filterDamageTypeSel.addEventListener('change', (e) => {
            window.state.damageTypeFilter = e.target.value; if (typeof window.pruneHiddenDefectSelection === "function") window.pruneHiddenDefectSelection();
            if (typeof drawCanvas === 'function') drawCanvas();
        });
    }

    // --- 2-1. ⭐ 중요 결함만 보기 필터 ---
    const filterOnlyBookmarkEl = document.getElementById('filterOnlyBookmark');
    if (filterOnlyBookmarkEl) {
        filterOnlyBookmarkEl.addEventListener('change', (e) => {
            window.state.bookmarkOnlyFilter = e.target.checked; if (typeof window.pruneHiddenDefectSelection === "function") window.pruneHiddenDefectSelection();
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        });
    }

    // --- 2-2. 부재 분류(기둥·벽체/보·슬래브/비구조체/마감재) 필터 ---
    window.state.categoryFilter = { columnWall: true, beamSlab: true, nonStructural: true, finishing: true };
    if (window.state.showOpeningCracks === undefined) window.state.showOpeningCracks = true;
    const catFilterMap = [
        ['filterCatColumnWall', 'columnWall'],
        ['filterCatBeamSlab', 'beamSlab'],
        ['filterCatNonStructural', 'nonStructural'],
        ['filterCatFinishing', 'finishing']
    ];
    catFilterMap.forEach(([elId, stateKey]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.addEventListener('change', (e) => {
            window.state.categoryFilter[stateKey] = e.target.checked;
            if (typeof window.pruneHiddenDefectSelection === "function") window.pruneHiddenDefectSelection();
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        });
    });

    // --- 2-2-1. 점검 차수 필터 ---
    window.state.periodFilter = { '2026년_하반기': true, '2026년_상반기': true, '2025년_하반기': false };
    const periodFilterMap = [
        ['filterPeriod2026H2', '2026년_하반기'],
        ['filterPeriod2026H1', '2026년_상반기'],
        ['filterPeriod2025H2', '2025년_하반기']
    ];
    periodFilterMap.forEach(([elId, roundKey]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        window.state.periodFilter[roundKey] = el.checked;
        el.addEventListener('change', (e) => {
            window.state.periodFilter[roundKey] = e.target.checked; if (typeof window.pruneHiddenDefectSelection === "function") window.pruneHiddenDefectSelection();
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        });
    });

    // --- 2-3. ◆ 중점관리만 보기 필터 ---
    const filterOnlyPriorityManageEl = document.getElementById('filterOnlyPriorityManage');
    if (filterOnlyPriorityManageEl) {
        filterOnlyPriorityManageEl.addEventListener('change', (e) => {
            window.state.priorityManageOnlyFilter = e.target.checked; if (typeof window.pruneHiddenDefectSelection === "function") window.pruneHiddenDefectSelection();
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        });
    }

    // --- 3. 현장 사진 2차 주석(드로잉) 모달 엔진 ---
    let annotationCanvas = null;
    let annotationCtx = null;
    let currentAnnotationTool = 'pen';
    let annotationHistory = [];
    let isDrawingAnnotation = false;
    let startX = 0, startY = 0;
    let tempCanvasState = null;
    let basePhotoImg = null;
    let targetPhotoCallback = null;

    window.openPhotoAnnotationModal = function(photoDataUrl, callback) {
        targetPhotoCallback = callback;
        const modal = document.getElementById('photoAnnotationModal');
        if (!modal) return;

        modal.style.display = 'flex';
        modal.classList.add('open');

        annotationCanvas = document.getElementById('annotationCanvas');
        if (!annotationCanvas) return;
        annotationCtx = annotationCanvas.getContext('2d');

        basePhotoImg = new Image();
        basePhotoImg.onload = function() {
            let w = basePhotoImg.width;
            let h = basePhotoImg.height;
            const maxW = 860, maxH = 550;
            if (w > maxW || h > maxH) {
                const ratio = Math.min(maxW / w, maxH / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            annotationCanvas.width = w;
            annotationCanvas.height = h;

            redrawAnnotationCanvas();
            annotationHistory = [];
            saveAnnotationHistory();
        };
        basePhotoImg.src = photoDataUrl;
    };

    function saveAnnotationHistory() {
        if (!annotationCanvas) return;
        if (annotationHistory.length > 20) annotationHistory.shift();
        annotationHistory.push(annotationCanvas.toDataURL());
    }

    function redrawAnnotationCanvas() {
        if (!annotationCtx || !basePhotoImg) return;
        annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        annotationCtx.drawImage(basePhotoImg, 0, 0, annotationCanvas.width, annotationCanvas.height);
    }

    function initPhotoAnnotationEvents() {
        const canvas = document.getElementById('annotationCanvas');
        if (!canvas) return;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) * (canvas.width / rect.width),
                y: (clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        const startDraw = (e) => {
            isDrawingAnnotation = true;
            const pos = getPos(e);
            startX = pos.x;
            startY = pos.y;
            tempCanvasState = annotationCtx.getImageData(0, 0, canvas.width, canvas.height);

            if (currentAnnotationTool === 'pen') {
                annotationCtx.beginPath();
                annotationCtx.moveTo(startX, startY);
            }
        };

        const moveDraw = (e) => {
            if (!isDrawingAnnotation) return;
            const pos = getPos(e);
            const color = document.getElementById('annotationColorPicker')?.value || '#ef4444';
            const lineWidth = parseInt(document.getElementById('annotationLineWidth')?.value || '4');

            annotationCtx.strokeStyle = color;
            annotationCtx.fillStyle = color;
            annotationCtx.lineWidth = lineWidth;
            annotationCtx.lineCap = 'round';
            annotationCtx.lineJoin = 'round';

            if (currentAnnotationTool === 'pen') {
                annotationCtx.lineTo(pos.x, pos.y);
                annotationCtx.stroke();
            } else if (currentAnnotationTool === 'arrow') {
                annotationCtx.putImageData(tempCanvasState, 0, 0);
                drawArrowOnCtx(annotationCtx, startX, startY, pos.x, pos.y, lineWidth, color);
            } else if (currentAnnotationTool === 'circle') {
                annotationCtx.putImageData(tempCanvasState, 0, 0);
                const radius = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2));
                annotationCtx.beginPath();
                annotationCtx.arc(startX, startY, radius, 0, 2 * Math.PI);
                annotationCtx.stroke();
            }
        };

        const endDraw = async (e) => {
            if (!isDrawingAnnotation) return;
            isDrawingAnnotation = false;
            if (currentAnnotationTool === 'text') {
                const pos = getPos(e);
                const text = await window.appPrompt('사진 위에 입력할 결함 설명 문구를 입력하세요:', '손상 부위');
                if (text) {
                    const color = document.getElementById('annotationColorPicker')?.value || '#ef4444';
                    const fontSize = parseInt(document.getElementById('annotationLineWidth')?.value || '4') * 3 + 12;
                    annotationCtx.font = `bold ${fontSize}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
                    annotationCtx.fillStyle = color;
                    annotationCtx.strokeStyle = '#000000';
                    annotationCtx.lineWidth = 3;
                    annotationCtx.strokeText(text, pos.x, pos.y);
                    annotationCtx.fillText(text, pos.x, pos.y);
                }
            }
            saveAnnotationHistory();
        };

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', moveDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: true });
        canvas.addEventListener('touchmove', moveDraw, { passive: true });
        canvas.addEventListener('touchend', endDraw);

        document.querySelectorAll('.annotation-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.annotation-tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentAnnotationTool = btn.dataset.tool || 'pen';
            });
        });

        document.getElementById('btnUndoAnnotation')?.addEventListener('click', () => {
            if (annotationHistory.length > 1) {
                annotationHistory.pop();
                const prevState = annotationHistory[annotationHistory.length - 1];
                const img = new Image();
                img.onload = () => {
                    annotationCtx.clearRect(0, 0, canvas.width, canvas.height);
                    annotationCtx.drawImage(img, 0, 0);
                };
                img.src = prevState;
            } else {
                redrawAnnotationCanvas();
            }
        });

        document.getElementById('btnClearAnnotation')?.addEventListener('click', async () => {
            if (!await window.confirmDelete('사진 위 마킹을 모두 지울까요?')) return;
            redrawAnnotationCanvas();
            saveAnnotationHistory();
        });

        const closeBtn = document.getElementById('btnClosePhotoAnnotationModal');
        const cancelBtn = document.getElementById('btnCancelPhotoAnnotation');
        const saveBtn = document.getElementById('btnSavePhotoAnnotation');

        const closeModal = () => {
            const modal = document.getElementById('photoAnnotationModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('open');
            }
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (annotationCanvas && typeof targetPhotoCallback === 'function') {
                    const annotatedDataUrl = annotationCanvas.toDataURL('image/jpeg', 0.85);
                    targetPhotoCallback(annotatedDataUrl);
                }
                closeModal();
            });
        }
    }

    function drawArrowOnCtx(ctx, fromX, fromY, toX, toY, width, color) {
        const headLength = width * 3 + 6;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    initPhotoAnnotationEvents();

    // --- 5. 현장 음성 인식 (Speech-to-Text) 이벤트 핸들러 ---
    window.startSpeechRecognition = function(inputId, btnElement) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            window.showToast('해당 브라우저에서는 음성 인식을 지원하지 않습니다. 구글 크롬(Chrome) 또는 마이크로소프트 엣지(Edge) 브라우저를 이용해 주세요.', 'warning', 5000);
            return;
        }

        const inputField = document.getElementById(inputId);
        if (!inputField) return;

        try {
            const recognition = new SpeechRecognition();
            recognition.lang = 'ko-KR';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            if (btnElement) {
                btnElement.style.background = '#ef4444';
                btnElement.style.color = '#ffffff';
                btnElement.innerHTML = '<i class="fa-solid fa-microphone"></i> 🔴 듣는 중...';
            }

            recognition.start();

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                if (transcript) {
                    if (inputField.value) {
                        inputField.value += ' ' + transcript;
                    } else {
                        inputField.value = transcript;
                    }
                }
            };

            recognition.onspeechend = function() {
                recognition.stop();
                if (btnElement) {
                    btnElement.style.background = '';
                    btnElement.style.color = '#6b6b6b';
                    btnElement.innerHTML = '<i class="fa-solid fa-microphone"></i> 🎤 음성입력';
                }
            };

            recognition.onerror = function(event) {
                window.showToast('음성 인식 감지 오류: ' + event.error, 'error');
                if (btnElement) {
                    btnElement.style.background = '';
                    btnElement.style.color = '#6b6b6b';
                    btnElement.innerHTML = '<i class="fa-solid fa-microphone"></i> 🎤 음성입력';
                }
            };
        } catch (e) {
            window.showToast('음성 인식 시작 실패: ' + e.message, 'error');
        }
    };

    const btnSpeechLocation = document.getElementById('btnSpeechLocation');
    if (btnSpeechLocation) {
        btnSpeechLocation.addEventListener('click', () => window.startSpeechRecognition('defectLocation', btnSpeechLocation));
    }

    const btnSpeechSize = document.getElementById('btnSpeechSize');
    if (btnSpeechSize) {
        btnSpeechSize.addEventListener('click', () => window.startSpeechRecognition('defectSize', btnSpeechSize));
    }

    // --- 6. Excel 상태조사표 다운로드 엔진 ---
    window.exportToExcel = function() {
        try {
            const bldg = window.state.currentBuilding;
            if (!bldg) {
                window.showToast('선택된 건축물이 없습니다.', 'warning');
                return;
            }

            const rawDefects = getCurrentFloorDefects();
            if (!rawDefects || rawDefects.length === 0) {
                window.showToast('현재 층에 등록된 결함 데이터가 없습니다.', 'warning');
                return;
            }
            // 마킹 추가는 한 행, 「번호 부여」(surveyExtra)만 N-1… 별도 행
            const defects = getSurveyRowsForReport(rawDefects);

            const floorCode = window.state.currentFloor;
            const activeColumns = getActiveSurveyColumns();

            // 화면 표와 동일한 사진 라벨(비고) 계산 — raw(합치기 전) 결함 기준
            const defectPhotoLabels = {};
            let pCounter = 0;
            rawDefects.forEach((d, dIdx) => {
                const defectKey = d.id || `idx_${dIdx}`;
                defectPhotoLabels[defectKey] = [];
                getDefectOutputPhotos(d).forEach(() => {
                    pCounter++;
                    const pNumStr = pCounter < 10 ? `0${pCounter}` : `${pCounter}`;
                    defectPhotoLabels[defectKey].push(`사진${pNumStr}`);
                });
            });

            let tableHtml = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head>
                    <meta charset="utf-8">
                    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
                    <x:Name>${window.state.currentFloor || '상태조사표'}</x:Name>
                    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
                    <style>
                        td, th { border: 1px solid #cccccc; text-align: center; vertical-align: middle; padding: 6px; }
                        th { background-color: #1e293b; color: #ffffff; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h2>[스마트 건축물 안전점검] ${bldg.name} (${window.state.currentFloor}) 상태조사표</h2>
                    <table>
                        <thead>
                            <tr>
                                ${activeColumns.map(c => `<th>${c.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
            `;

            defects.forEach((d, dIdx) => {
                const memberIds = (d._groupMemberIds && d._groupMemberIds.length)
                    ? d._groupMemberIds
                    : [d.id || `idx_${dIdx}`];
                const labels = memberIds.flatMap((mid) => defectPhotoLabels[mid] || []);
                const pRemark = labels.length > 0 ? labels.join(' ') : '-';
                const grade3 = isGrade3Building(bldg);
                const cellCtx = {
                    floorCode,
                    photoRemark: pRemark,
                    surveyReportNo: formatSurveyReportNo(d, grade3, floorCode)
                };
                if (grade3) {
                    cellCtx.gradeNo = cellCtx.surveyReportNo;
                    cellCtx.floorDisplayLabel = getGrade3FloorDisplayLabel(floorCode, bldg);
                }
                tableHtml += `
                    <tr>
                        ${activeColumns.map(c => `<td style="${getSurveyCellColorStyle(c.key, d, cellCtx)};mso-number-format:\\@">${getSurveyCellText(c.key, d, cellCtx).replace(/\n/g, '<br>')}</td>`).join('')}
                    </tr>
                `;
            });

            tableHtml += `
                        </tbody>
                    </table>
                </body>
                </html>
            `;

            const blob = new Blob(['\ufeff' + tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const filename = `${bldg.name}_${window.state.currentFloor}_상태조사표.xls`;

            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            window.showToast('엑셀 내보내기 중 오류가 발생했습니다: ' + e.message, 'error', 5000);
        }
    };

    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', window.exportToExcel);
    }

    /**
     * 2026-10-20 「상태조사표 엑셀 전체층 다 탭으로 묶어서 한 파일로」.
     * 한 층 엑셀과 같은 열·글자·색으로, 층마다 시트 하나(지하 → 지상 → 옥상·옥탑 → 외부 순).
     * 안 열어 본 층도 빠지지 않게 한글 보고서처럼 모든 층을 서버에서 먼저 받는다.
     */
    function buildSurveyExcelSheetForFloor(bldg, floorCode, rawDefects, activeColumns) {
        const defects = getSurveyRowsForReport(rawDefects);
        if (!defects.length) return null;
        const defectPhotoLabels = {};
        let pCounter = 0;
        rawDefects.forEach((d, dIdx) => {
            const defectKey = d.id || `idx_${dIdx}`;
            defectPhotoLabels[defectKey] = [];
            getDefectOutputPhotos(d).forEach(() => {
                pCounter++;
                defectPhotoLabels[defectKey].push(`사진${pCounter < 10 ? '0' + pCounter : pCounter}`);
            });
        });
        const grade3 = isGrade3Building(bldg);
        const rows = defects.map((d, dIdx) => {
            const memberIds = (d._groupMemberIds && d._groupMemberIds.length) ? d._groupMemberIds : [d.id || `idx_${dIdx}`];
            const labels = memberIds.flatMap((mid) => defectPhotoLabels[mid] || []);
            const cellCtx = {
                floorCode,
                photoRemark: labels.length > 0 ? labels.join(' ') : '-',
                surveyReportNo: formatSurveyReportNo(d, grade3, floorCode)
            };
            if (grade3) {
                cellCtx.gradeNo = cellCtx.surveyReportNo;
                cellCtx.floorDisplayLabel = getGrade3FloorDisplayLabel(floorCode, bldg);
            }
            return activeColumns.map((c) => ({
                text: String(getSurveyCellText(c.key, d, cellCtx) == null ? '' : getSurveyCellText(c.key, d, cellCtx)),
                style: getSurveyCellColorStyle(c.key, d, cellCtx)
            }));
        });
        return { header: activeColumns.map((c) => c.label), rows };
    }

    window.exportSurveyExcelAllFloors = async function () {
        const bldg = window.state.currentBuilding;
        const bldgId = (bldg && bldg.id) || window.state.currentBuildingId;
        if (!bldg || !bldgId) { window.showToast('선택된 건축물이 없습니다.', 'warning'); return; }
        const xl = window.BSA && window.BSA.surveyXlsx;
        if (!xl || !window.JSZip) { window.showToast('엑셀 만들기 도구를 불러오지 못했습니다. 새로고침 후 다시 해 주세요.', 'error'); return; }
        const btn = document.getElementById('btnExportExcelAll');
        if (btn) btn.disabled = true;
        if (typeof window.showLoading === 'function') window.showLoading('전체 층 상태조사표 엑셀 만드는 중…');
        try {
            if (!(await ensureBuildingFloorsFreshForReport(bldg, '전체 층 엑셀'))) return;
            let floors = [];
            if (typeof listNdtFloorCodesForBuilding === 'function') floors = listNdtFloorCodesForBuilding(bldgId) || [];
            else if (bldg.floorsList) floors = bldg.floorsList.map((f) => f.floorCode);
            if (!floors.length && window.state.currentFloor) floors = [window.state.currentFloor];
            const ordered = xl.orderFloorCodes(floors,
                (fc) => typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(fc),
                (list) => (typeof window.sortFloorsLowToHigh === 'function' ? window.sortFloorsLowToHigh(list) : list));
            const getFloorLabel = (floorCode) => {
                const fromList = (bldg.floorsList || []).find((f) => f.floorCode === floorCode);
                const raw = fromList ? fromList.floorLabel
                    : (typeof window.getFloorLabelFromCode === 'function' ? window.getFloorLabelFromCode(floorCode, bldg) : floorCode);
                return stripFloorCodeSuffix(raw || floorCode).replace(/\s+(?=\d)/g, '') || floorCode;
            };
            const activeColumns = getActiveSurveyColumns();
            const used = new Set();
            const sheets = [];
            ordered.inner.concat(ordered.exterior).forEach((fc) => {
                const key = `${bldgId}_${fc}`;
                const raw = window.state.defects[key] || (window.state.currentFloor === fc ? getCurrentFloorDefects() : []);
                if (!raw || !raw.length) return;
                const sh = buildSurveyExcelSheetForFloor(bldg, fc, raw, activeColumns);
                if (!sh) return;
                const label = getFloorLabel(fc);
                sh.name = xl.sheetName(label, used);
                sh.title = `[스마트 건축물 안전점검] ${bldg.name} (${label}) 상태조사표`;
                sheets.push(sh);
            });
            if (!sheets.length) { window.showToast('등록된 결함이 있는 층이 없습니다.', 'warning'); return; }
            const blob = await xl.buildXlsxBlob(sheets, window.JSZip);
            const safeName = String(bldg.name || '건물').replace(/[\\/:*?"<>|]/g, '_');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeName}_전체층_상태조사표.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            window.showToast(`전체 ${sheets.length}개 층을 한 파일(층마다 탭)로 저장했습니다.`, 'success', 4000);
        } catch (e) {
            window.showToast('전체 층 엑셀 저장 중 오류: ' + (e && e.message ? e.message : e), 'error', 5000);
        } finally {
            if (typeof window.hideLoading === 'function') window.hideLoading();
            if (btn) btn.disabled = false;
        }
    };
    const btnExportExcelAll = document.getElementById('btnExportExcelAll');
    if (btnExportExcelAll) btnExportExcelAll.addEventListener('click', () => window.exportSurveyExcelAllFloors());

    // --- 7. 외부(엑셀) 결함표 가져오기 엔진 ---
    // 이미 엑셀로 결함조사표를 작성해오던 점검자들이 그대로 파일만 올리면 되도록,
    // 엑셀/CSV의 헤더를 자동 인식해 매칭해주고 사용자가 확인/보정할 수 있는 화면을 띄운다.
    // 엑셀에는 도면상 위치(x,y) 정보가 없으므로, 가져온 결함은 도면 좌측 상단부터 격자로
    // 임시 배치하고 사용자가 직접 도면 위 정확한 위치로 드래그하도록 안내한다.
    const IMPORT_DEFECT_FIELD_DEFS = [
        { key: 'no', label: '결함번호', aliases: ['결함번호', '번호', 'no', 'no.'] },
        { key: 'component', label: '부재명칭', aliases: ['부재명칭', '부재', '부재명'] },
        { key: 'category', label: '구분(구조체/비구조체/마감재)', aliases: ['구분', '구조체여부', '대분류', '카테고리'] },
        { key: 'defectType', label: '결함종류(조사내용)', aliases: ['조사내용', '결함종류', '결함유형', '종류'] },
        { key: 'location', label: '위치', aliases: ['위치', '상세위치'] },
        { key: 'size', label: '결함크기(규모)', aliases: ['결함크기', '규모', '크기', '규모 및 상태'] },
        { key: 'crackWidth', label: '균열폭', aliases: ['균열폭'] },
        { key: 'crackLength', label: '균열길이', aliases: ['균열길이'] },
        // 2026-09-28 '진행'·'누수' 추가 — 한글 가져오기 머리글(HWPX_IMPORT_HEADERS)이 이 이름이라 여부가 빠지고 있었다
        { key: 'progress', label: '진행여부', aliases: ['진행여부', '진행중', '진행'] },
        { key: 'leak', label: '누수여부', aliases: ['누수여부', '누수중', '누수'] },
        { key: 'cause', label: '결함원인추정', aliases: ['결함원인추정', '결함원인', '원인'] }
    ];

    const IMPORT_NEGATIVE_FLAG_VALUES = ['-', 'x', '아니오', '아니요', 'no', 'n', '0', '없음', '',
        // 2026-09-28: '미진행'·'해당없음' 등이 켜짐으로 들어가던 것
        '×', '✕', '✗', '–', '—', '－', 'false', 'none', 'n/a', 'na', '무', '해당없음', '미해당', '비해당', '정지', '안정'];
    const IMPORT_NEGATIVE_FLAG_PATTERNS = [/^(?:미|비|무)(?:진행|누수)$/, /^(?:진행|누수)(?:없음|아님|안함|x|×)$/, /^없/];

    function guessImportColumnForField(headers, aliases) {
        const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
        for (const alias of aliases) {
            const idx = headers.findIndex(h => norm(h) === norm(alias));
            if (idx !== -1) return idx;
        }
        for (const alias of aliases) {
            const idx = headers.findIndex(h => norm(h).includes(norm(alias)));
            if (idx !== -1) return idx;
        }
        return -1;
    }

    // 엑셀 시트 이름 ↔ 건축물의 실제 층(floorCode/floorLabel) 자동 매칭
    // 주의: "1층"이 "지하 1층"·"1층외부" 라벨에 부분일치로 빨려 들어가지 않게 점수화한다.
    function parseSheetFloorStoryHint(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        let m = raw.match(/지하\s*([0-9]{1,2})\s*층/);
        if (m) return { basement: true, num: parseInt(m[1], 10) };
        m = raw.match(/B\s*([0-9]{1,2})\s*F\b/i);
        if (m) return { basement: true, num: parseInt(m[1], 10) };
        m = raw.match(/지상\s*([0-9]{1,2})\s*층/);
        if (m) return { basement: false, num: parseInt(m[1], 10) };
        m = raw.match(/(?:^|[^A-Za-z0-9])([0-9]{1,2})\s*F\b/i);
        if (m) return { basement: false, num: parseInt(m[1], 10) };
        m = raw.match(/(?:^|[^0-9])([0-9]{1,2})\s*층/);
        if (m) return { basement: false, num: parseInt(m[1], 10) };
        return null;
    }

    function sheetNameLooksExterior(text) {
        const raw = String(text || '');
        const n = raw.toLowerCase();
        return /외부|입면|외벽|파사드|facade|elevation|exterior/.test(raw)
            || /(?:^|[^a-z0-9])ext(?:[^a-z0-9]|$)/i.test(n);
    }

    function guessFloorForSheetName(sheetName, floors) {
        const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/[\s()]/g, '');
        const n = norm(sheetName);
        if (!n || !floors || !floors.length) return null;

        let match = floors.find(f => norm(f.floorLabel) === n || norm(f.floorCode) === n);
        if (match) return match.floorCode;

        // 2026-10-16 「옥탑층, 옥탑1층 이런 층들도 있다」: 옥상·옥탑·지붕 시트는 옥상·옥탑 층끼리만 맞춘다.
        // 예전엔 「옥탑1층」이 숫자 1 때문에 1F로, 없는 「12층」이 아무 층(B1F)으로 갔다.
        const roofOf = (t) => (typeof window.resolveRoofFloorFromText === 'function' ? window.resolveRoofFloorFromText(String(t || '')) : null);
        const roofIdx = (t) => (typeof window.parseRooftopIndex === 'function' ? window.parseRooftopIndex(String(t || '')) : null);
        const floorRoof = (f) => roofOf(f.floorCode) || roofOf(f.floorLabel);
        const floorRoofIdx = (f) => roofIdx(f.floorCode) || roofIdx(f.floorLabel);
        // 2026-10-16 「지붕층하고 옥상층은 다른 거」: 지붕층은 앱의 지붕층에만(옥상층·옥탑 지붕층으로 안 감)
        const deckOf = (t) => (typeof window.isStandaloneRoofDeckText === 'function' && window.isStandaloneRoofDeckText(String(t || '')));
        if (deckOf(sheetName)) {
            const deck = floors.find((f) => f && f.floorCode && (deckOf(f.floorCode) || deckOf(f.floorLabel)));
            return deck ? deck.floorCode : null;
        }
        // 「옥상지붕층이랑 옥탑지붕층도 다른거」: 옥상지붕층은 앱의 옥상지붕층에만
        const topDeckOf = (t) => (typeof window.isRoofTopDeckText === 'function' && window.isRoofTopDeckText(String(t || '')));
        if (topDeckOf(sheetName)) {
            const td = floors.find((f) => f && f.floorCode && (topDeckOf(f.floorCode) || topDeckOf(f.floorLabel)));
            return td ? td.floorCode : null;
        }
        const sheetRoof = roofOf(sheetName);
        if (sheetRoof) {
            const same = floors.filter((f) => f && f.floorCode && floorRoof(f) && floorRoof(f).code === sheetRoof.code);
            const si = sheetRoof.code === 'PH' ? roofIdx(sheetName) : null;
            const byIdx = same.find((f) => floorRoofIdx(f) === si);   // 번호까지 같음(옥탑2층 ↔ PH2)
            if (byIdx) return byIdx.floorCode;
            // 번호 없는 옥탑층 하나뿐이면 옥탑1층·PH1은 거기로. 옥탑2층 이상은 맞는 층이 없으면 직접 선택
            if (si === 1 || si == null) {
                const plain = same.find((f) => floorRoofIdx(f) == null);
                if (plain) return plain.floorCode;
            }
            return null;
        }

        const sheetStory = parseSheetFloorStoryHint(sheetName);
        const sheetExt = sheetNameLooksExterior(sheetName);
        let best = null;
        let bestScore = 0;

        floors.forEach((f) => {
            if (!f || !f.floorCode) return;
            if (floorRoof(f) || deckOf(f.floorCode) || deckOf(f.floorLabel)
                || (typeof window.isRoofTopDeckText === 'function' && (window.isRoofTopDeckText(f.floorCode) || window.isRoofTopDeckText(f.floorLabel)))) return;   // 「1층」 시트가 「옥탑1층」으로 가지 않게
            const fc = norm(f.floorCode);
            const fl = norm(f.floorLabel);
            const floorExt = (typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(f.floorCode))
                || sheetNameLooksExterior(f.floorLabel)
                || sheetNameLooksExterior(f.floorCode);
            let score = 0;

            // 코드가 시트명에 포함 (단, "1"처럼 한 글자 코드는 "1층"에 오매칭되므로 제외)
            if (fc && fc.length >= 2 && n.includes(fc)) score += 55;
            if (fl && fl.length >= 2) {
                if (n.includes(fl)) score += 35;
                if (fl.includes(n)) score += 25;
            }

            const floorStory = parseSheetFloorStoryHint(`${f.floorCode} ${f.floorLabel || ''}`);
            if (sheetStory && floorStory
                && sheetStory.num === floorStory.num
                && sheetStory.basement === floorStory.basement) {
                score += floorExt ? 15 : 90;
            }

            // 시트명이 순수 층(1층/2F)인데 후보가 외부(1층외부·EXT)면 감점 — 1F 시트가 EXT 미마킹으로 새는 주원인
            if (sheetStory && !sheetExt && floorExt) score -= 60;
            if (sheetExt && floorExt) score += 45;
            if (sheetExt && !floorExt) score -= 25;
            // 내부 층 가산점은 이름·번호가 이미 맞을 때만 (없는 층 「12층」이 첫 층으로 가던 것)
            if (score > 0 && sheetStory && !sheetExt && isInteriorFloorDrawingCode(f.floorCode)) score += 20;

            if (score > bestScore) {
                bestScore = score;
                best = f;
            }
        });

        return (best && bestScore > 0) ? best.floorCode : null;
    }

    window.handleImportDefectExcelFile = function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            window.showToast('엑셀 파싱 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인 후 다시 시도해주세요.', 'error', 5000);
            event.target.value = '';
            return;
        }
        if (!state.currentBuildingId) {
            window.showToast('가져올 건축물이 선택되지 않았습니다.', 'warning');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const floors = state.currentBuilding ? window.getBuildingAvailableFloors(state.currentBuilding) : [];

                const sheetInfos = workbook.SheetNames.map(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
                    if (!rows || rows.length < 1) return null;
                    const headers = (rows[0] || []).map(h => (h || '').toString().trim());
                    const dataRows = rows.slice(1).filter(r => r.some(cell => cell !== '' && cell !== null && cell !== undefined));
                    if (dataRows.length === 0) return null;
                    return {
                        sheetName,
                        headers,
                        rows: dataRows,
                        guessedFloorCode: guessFloorForSheetName(sheetName, floors)
                    };
                }).filter(Boolean);

                if (sheetInfos.length === 0) {
                    window.showToast('엑셀 파일에서 가져올 데이터를 찾지 못했습니다. 각 시트의 첫 행은 헤더, 둘째 행부터 데이터여야 합니다.', 'warning', 5000);
                    event.target.value = '';
                    return;
                }

                window._importExcelSheets = sheetInfos;
                window._importExcelFloors = floors;
                openImportDefectExcelModal();
            } catch (err) {
                window.showToast('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message, 'error', 5000);
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    function updateImportDefectExcelHelpText() {
        const helpEl = document.getElementById('importDefectExcelHelpText');
        const prevRound = document.getElementById('importDefectExcelPrevRound')?.checked === true;
        if (!helpEl) return;
        if (prevRound) {
            helpEl.innerHTML = '엑셀로 가져온 결함은 <b>전차(전회차) 조사내용</b>으로 등록됩니다. 도면에는 자동 배치되지 않습니다.<br>좌측 <b>「전차 미등록」</b> 목록에서 결함을 클릭한 뒤, 도면에서 마킹 위치를 직접 지정하세요.';
        } else {
            helpEl.innerHTML = '엑셀로 가져온 결함은 <b>전차(전회차) 조사내용</b>으로 등록됩니다.<br>도면 좌측 상단에 임시 배치되므로, 좌측 목록에서 각 결함을 클릭해 정확한 위치로 <b>직접 드래그</b>해주세요.';
        }
    }

    function openImportDefectExcelModal() {
        const sheets = window._importExcelSheets || [];
        const floors = window._importExcelFloors || [];
        const refHeaders = (sheets[0] && sheets[0].headers) || [];
        const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
        const fromHwpx = !!window._importFromHwpx;

        const titleEl = document.getElementById('importDefectExcelModalTitle');
        if (titleEl) {
            titleEl.innerHTML = fromHwpx
                ? '<i class="fa-solid fa-file-lines"></i> 📥 한글(HWPX) 상태조사표 가져오기'
                : '<i class="fa-solid fa-file-import"></i> 📥 외부 엑셀 결함표 가져오기';
        }

        const summaryEl = document.getElementById('importDefectExcelSummary');
        if (summaryEl) {
            summaryEl.textContent = fromHwpx
                ? `한글 문서 ${sheets.length}개 층 블록, 결함 ${totalRows}건 감지됨 (${window._importHwpxGradeLabel || '상태조사표'}).`
                : `시트 ${sheets.length}개, 데이터 ${totalRows}행 감지됨.`;
        }

        const sheetMapTitle = document.getElementById('importDefectExcelSheetMapTitle');
        if (sheetMapTitle) {
            sheetMapTitle.textContent = fromHwpx
                ? '한글 문서 층 블록 ↔ 점검 층 배정 (층 이름으로 자동 추정, 다르면 직접 선택하세요)'
                : '시트 ↔ 층 배정 (시트 이름으로 자동 추정, 다르면 직접 선택하세요)';
        }

        const sheetMapBody = document.getElementById('importDefectExcelSheetMapBody');
        if (sheetMapBody) {
            if (floors.length === 0) {
                sheetMapBody.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted);">선택된 건축물의 층 정보를 찾지 못해 모든 시트를 현재 층(${state.currentFloor || ''})으로 가져옵니다.</div>`;
            } else {
                sheetMapBody.innerHTML = sheets.map(s => {
                    // 2026-10-16 앱에 맞는 층이 없으면 조용히 「가져오지 않음」이 아니라 눈에 띄게 알린다
                    const noMatch = !s.guessedFloorCode;
                    const options = ['<option value="">(가져오지 않음)</option>']
                        .concat(floors.map(f => `<option value="${escapeHtml(f.floorCode)}" ${f.floorCode === s.guessedFloorCode ? 'selected' : ''}>${escapeHtml(f.floorLabel)}</option>`));
                    return `
                        <div style="display:flex; align-items:center; gap:0.6rem;">
                            <span style="flex:1; min-width:0; font-size:0.82rem; font-weight:700; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(s.sheetName)}">
                                ${escapeHtml(s.sheetName)} <span style="color:var(--text-muted); font-weight:400;">(${s.rows.length}행)</span>
                                ${noMatch ? '<span class="import-floor-nomatch" style="display:block; color:#b45309; font-weight:600; font-size:0.75rem; white-space:normal;">⚠ 앱에 맞는 층이 없음 — 층을 직접 고르거나 건축물 정보에서 층을 먼저 추가하세요</span>' : ''}
                            </span>
                            <select class="form-select import-defect-sheet-floor-map" data-sheet="${escapeHtml(s.sheetName)}" style="width:200px; flex-shrink:0;">${options.join('')}</select>
                        </div>
                    `;
                }).join('');
            }
        }

        const mappingTitle = document.getElementById('importDefectExcelMappingTitle');
        const mappingBody = document.getElementById('importDefectExcelMappingBody');
        if (mappingTitle) mappingTitle.style.display = fromHwpx ? 'none' : '';
        if (mappingBody) {
            mappingBody.style.display = fromHwpx ? 'none' : '';
            mappingBody.innerHTML = IMPORT_DEFECT_FIELD_DEFS.map(field => {
                const guessIdx = guessImportColumnForField(refHeaders, field.aliases);
                const options = ['<option value="-1">(사용 안 함)</option>']
                    .concat(refHeaders.map((h, i) => `<option value="${i}" ${i === guessIdx ? 'selected' : ''}>${h ? escapeHtml(h) : `(이름없음 컬럼 ${i + 1})`}</option>`));
                return `
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <span style="width:190px; flex-shrink:0; font-size:0.82rem; font-weight:700; color:var(--text-secondary);">${field.label}</span>
                        <select class="form-select import-defect-field-map" data-field="${field.key}" style="flex:1;">${options.join('')}</select>
                    </div>
                `;
            }).join('');
            if (fromHwpx) {
                const HWPX_FIELD_COL = { no: 0, component: 1, category: 2, defectType: 3, location: 4, size: 5, crackWidth: 6, crackLength: 7, progress: 8, leak: 9, cause: 10 };
                mappingBody.querySelectorAll('.import-defect-field-map').forEach((sel) => {
                    const idx = HWPX_FIELD_COL[sel.dataset.field];
                    if (idx !== undefined) sel.value = String(idx);
                    sel.disabled = true;
                });
            }
        }

        const previewTable = document.getElementById('importDefectExcelPreviewTable');
        if (previewTable) {
            const previewRows = ((sheets[0] && sheets[0].rows) || []).slice(0, 5);
            previewTable.innerHTML = `
                <thead><tr>${refHeaders.map(h => `<th style="border:1px solid var(--border-color); background:var(--bg-primary); padding:0.35rem 0.5rem; text-align:left;">${h ? escapeHtml(h) : '-'}</th>`).join('')}</tr></thead>
                <tbody>${previewRows.map(r => `<tr>${refHeaders.map((h, i) => `<td style="border:1px solid var(--border-color); padding:0.35rem 0.5rem;">${escapeHtml(r[i] !== undefined ? r[i] : '')}</td>`).join('')}</tr>`).join('')}</tbody>
            `;
        }

        const modal = document.getElementById('importDefectExcelModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
        }
        updateImportDefectExcelHelpText();
    }

    function closeImportDefectExcelModal() {
        const modal = document.getElementById('importDefectExcelModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
        document.querySelectorAll('.import-defect-field-map').forEach((sel) => { sel.disabled = false; });
        window._importExcelSheets = null;
        window._importExcelFloors = null;
        window._importFromHwpx = false;
        window._importHwpxGradeLabel = null;
    }

    window.handleImportDefectHwpxFile = async function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        event.target.value = '';

        if (typeof window.parseHwpxSurveyImport !== 'function') {
            window.showToast('한글 가져오기 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error', 5000);
            return;
        }
        if (!state.currentBuildingId) {
            window.showToast('가져올 건축물이 선택되지 않았습니다.', 'warning');
            return;
        }

        try {
            if (typeof window.showLoading === 'function') window.showLoading('한글(HWPX) 상태조사표 분석 중...');
            const buffer = await file.arrayBuffer();
            const parsed = await window.parseHwpxSurveyImport(buffer, {
                facilityGrade: state.currentBuilding && state.currentBuilding.facilityGrade
            });
            const floors = state.currentBuilding ? window.getBuildingAvailableFloors(state.currentBuilding) : [];
            const bldgGrade3 = isGrade3Building();
            if (parsed.grade3 !== bldgGrade3) {
                window.showToast(
                    `파일은 ${parsed.grade3 ? '3종(칠산타워)' : '1·2종(신가병원)'} 서식, 선택 건물은 ${bldgGrade3 ? '3종' : '1·2종'}입니다. 내용은 그대로 가져오되 표 컬럼은 건물 종별에 맞게 표시됩니다.`,
                    'warning',
                    7000
                );
            }
            const headers = window.HWPX_IMPORT_HEADERS || ['번호', '부재', '구분', '조사내용', '위치', '크기', '균열폭', '균열길이', '진행', '누수', '원인'];
            const sheetInfos = parsed.floors.map((f) => ({
                sheetName: f.floorLabel,
                headers,
                rows: (typeof window.hwpxDefectsToImportRows === 'function')
                    ? window.hwpxDefectsToImportRows(f.defects)
                    : [],
                guessedFloorCode: guessFloorForSheetName(f.floorLabel, floors)
            })).filter((s) => s.rows.length > 0);

            if (sheetInfos.length === 0) {
                window.showToast('한글 파일에서 가져올 결함 행을 찾지 못했습니다.', 'warning', 5000);
                return;
            }

            window._importFromHwpx = true;
            window._importHwpxGradeLabel = parsed.grade3 ? '3종 칠산타워' : '1·2종 신가병원';
            window._importExcelSheets = sheetInfos;
            window._importExcelFloors = floors;
            openImportDefectExcelModal();
        } catch (err) {
            console.error('HWPX 가져오기 실패:', err);
            window.showToast('한글 파일을 읽는 중 오류: ' + err.message, 'error', 6000);
        } finally {
            if (typeof window.hideLoading === 'function') window.hideLoading();
        }
    };

    // 구조체여부만 ○/-로 표기된 표는 비구조체/마감재 세부구분이 불가능해 '-'는 비구조체로 간주
    // 마감재 오타·약어(마감제/마김제/마감ㅈ 등)도 마감재로 인식
    function looksLikeFinishMaterialText(raw) {
        const t = (raw || '').toString().trim().replace(/\s+/g, '');
        if (!t) return false;
        if (/마감재|마감제|마김재|마김제|마감ㅈ|마김ㅈ|마감젯|마김젯/.test(t)) return true;
        // 마 + (감|김) + (재|제|ㅈ) 근처 — 중간 1글자 오타 허용
        if (/마.?[감김].?[재제ㅈ]/.test(t)) return true;
        return false;
    }

    function resolveImportCategory(raw) {
        const v = (raw || '').toString().trim();
        if (!v) return '구조체';
        if (v.includes('비구조체')) return '비구조체';
        if (looksLikeFinishMaterialText(v) || v.includes('마감재')) return '마감재';
        if (v.includes('구조체')) return '구조체';
        if (v === '○' || v.toLowerCase() === 'o') return '구조체';
        if (v === '-') return '비구조체';
        return '구조체';
    }

    // 구분 칸이 비었거나 구조체로만 잡혀도, 결함내용·부재명에 마감재(오타 포함)가 있으면 마감재로 승격
    function resolveImportCategoryWithContent(categoryRaw, defectTypeRaw, componentRaw) {
        const fromCol = resolveImportCategory(categoryRaw);
        if (fromCol === '마감재') return '마감재';
        if (looksLikeFinishMaterialText(defectTypeRaw) || looksLikeFinishMaterialText(componentRaw)) {
            return '마감재';
        }
        return (window.bsaPlasterNonStructCategory ? window.bsaPlasterNonStructCategory(fromCol, defectTypeRaw, { force: true }) : fromCol);
    }

    function resolveImportFlag(raw) {
        const v = (raw || '').toString().trim().toLowerCase();
        if (v === '' || IMPORT_NEGATIVE_FLAG_VALUES.includes(v)) return false;
        const compact = v.replace(/\s+/g, '');
        if (IMPORT_NEGATIVE_FLAG_VALUES.includes(compact)) return false;
        return !IMPORT_NEGATIVE_FLAG_PATTERNS.some((re) => re.test(compact));
    }

    /**
     * 2026-10-27 엑셀/한글 가져오기: 부재명칭 칸에 개구부 말(문 상부·문 측면·창 상부·창 하부·창 측면 — 띄어쓰기 무관, 개구부 주위, 개구부)이 있으면
     * 그 말을 부재명칭에서 지우고 { found, pos(창 상부 …, 종류를 알 수 있을 때), component(남은 부재명) }로 돌려준다. 없으면 found=false, component는 원문 그대로.
     * 「출입문 상부」처럼 한글에 바로 붙은 「문」은 다른 낱말의 일부라 글은 지우지 않고 종류만 알아 둔다.
     */
    function extractOpeningFromMemberName(raw) {
        const orig = String(raw == null ? '' : raw);
        const out = { found: false, pos: '', component: orig.trim() };
        if (!orig.trim()) return out;
        let work = orig;
        // 2026-11-10 개구부 상부·개구부 하부도 위치로 — 「개구부」만 지우면 「상부 벽체」가 남는다
        work = work.replace(/(개구부|창|문)[\s\u3000]*(상부|하부|측면)/g, (m, a, b, off, all) => {
            const name = `${a} ${b}`;
            if (OPENING_POS_NAMES.indexOf(name) < 0) return m;
            out.found = true;
            if (!out.pos) out.pos = name;
            return (a !== '개구부' && off > 0 && /[가-힣]/.test(all.charAt(off - 1))) ? m : ' ';
        });
        work = work.replace(/개구부[\s\u3000]*주위|개구부/g, () => { out.found = true; return ' '; });
        if (!out.found) return out;
        work = work.replace(/[(（]\s*[)）]|\[\s*\]/g, ' ')
            .replace(/^[\s\u3000,;:·ㆍ\/\-_()（）\[\]]+|[\s\u3000,;:·ㆍ\/\-_()（）\[\]]+$/g, '')
            .replace(/[\s\u3000]{2,}/g, ' ')
            .trim();
        out.component = work;
        return out;
    }

    /** 엑셀/한글 가져오기: 문상부·창하부·창측면 등 개구부 위치·내용이면 개구부 균열 체크 */
    function detectImportOpeningCrack(fields) {
        if (!fields || fields.isGood) return false;
        if (fields.openingFromMember) return true; // 부재명칭에서 개구부 말을 찾아 지운 경우
        const compact = [fields.location, fields.defectType, fields.component, fields.size]
            .map((s) => String(s || ''))
            .join(' ')
            .replace(/\s+/g, '');
        if (!compact) return false;
        if (/개구부/.test(compact)) return true;
        if (findOpeningPosInText(compact)) return true; // 창 상부·창 하부·창 측면·문 상부·문 측면
        // 문상부, 창하부, 창측면, 문측면, 창좌측 등
        if (/(?:문|창)(?:상부|하부|측면|좌측|우측|주위|틀)/.test(compact)) return true;
        if (/(?:문|창)측/.test(compact)) return true;
        return false;
    }

    // 결함 변경 직전 특정 층 키의 되돌리기 스냅샷을 저장 (pushDefectHistory는 항상 현재 층 기준이라
    // 현재 화면에 없는 다른 층으로 가져올 때를 위해 층을 직접 지정해서 저장)
    function pushDefectHistoryForKey(key) {
        if (!defectHistory[key]) defectHistory[key] = { undo: [], redo: [] };
        const h = defectHistory[key];
        h.undo.push(JSON.stringify(state.defects[key] || []));
        if (h.undo.length > 30) h.undo.shift();
        h.redo = [];
    }

    window.confirmImportDefectExcel = async function() {
        if (!state.currentBuildingId) {
            window.showToast('가져올 건축물이 선택되지 않았습니다.', 'warning');
            return;
        }
        const sheets = window._importExcelSheets || [];
        if (sheets.length === 0) return;

        const sheetSelects = document.querySelectorAll('.import-defect-sheet-floor-map');
        const floorBySheetName = {};
        sheetSelects.forEach(sel => { floorBySheetName[sel.dataset.sheet] = sel.value; });
        // 층 정보가 아예 없는 건축물은 매칭 UI 자체가 없으므로 모든 시트를 현재 층으로 간주
        const noFloorInfo = (window._importExcelFloors || []).length === 0;

        const keysToSnap = [];
        sheets.forEach((sheetInfo) => {
            const floorCode = noFloorInfo ? state.currentFloor : floorBySheetName[sheetInfo.sheetName];
            if (!floorCode) return;
            const key = `${state.currentBuildingId}_${floorCode}`;
            if (keysToSnap.indexOf(key) < 0) keysToSnap.push(key);
        });
        if (!keysToSnap.length) {
            window.showToast('가져올 시트가 선택되지 않았습니다. 시트별 층 배정을 확인해주세요.', 'warning', 5000);
            return;
        }
        // 화면 선택값(열 매칭·병합 옵션)은 백업을 기다리기 **전에** 읽는다 — 기다리는 사이 창이
        // 바뀌어도 사용자가 누른 순간의 값으로 가져온다(일괄 수정에서 실제로 겪은 문제와 같은 원리).
        const mapSelects = document.querySelectorAll('.import-defect-field-map');
        const colIdxByField = {};
        mapSelects.forEach(sel => {
            colIdxByField[sel.dataset.field] = parseInt(sel.value, 10);
        });
        const getCell = (row, field) => {
            const idx = colIdxByField[field];
            if (idx === undefined || idx === -1) return '';
            const cellVal = (row[idx] !== undefined && row[idx] !== null) ? row[idx].toString().trim() : '';
            // 2026-09-28 부재 명칭 정리('상부' 삭제, 큰보→보(G) 등)는 가져올 때부터 적용
            return field === 'component' ? (memberNameOut(cellVal) || '') : cellVal;
        };

        const mergeByNo = document.getElementById('importDefectExcelMergeByNo')?.checked !== false;
        const importPrevRound = document.getElementById('importDefectExcelPrevRound')?.checked === true;

        // 적용 직전에 배정된 층만 기기에 남긴다. 실패해도 가져오기는 막지 않는다.
        // 누른 순간의 건물·층 — 백업을 기다리는 사이 층을 바꿔도 가져오기가 다른 층에 들어가지 않게(2026-09-21 감사)
        const importBuildingAtClick = state.currentBuildingId;
        const importFloorAtClick = state.currentFloor;
        let excelImportSnaps = [];
        if (typeof snapshotBeforeBulkOp === 'function') {
            excelImportSnaps = await snapshotBeforeBulkOp('조사표 가져오기', keysToSnap);
        }

        let totalImported = 0;
        let totalMatched = 0;
        let totalUnregistered = 0;
        let floorsTouched = 0;
        // 가져온 칸이 비어 있어 기존 내용을 지키기만 한 횟수(부재·결함·원인 칸 단위).
        // 0이 아니면 헤더가 안 맞거나 내용 칸이 빈 시트일 수 있어 사용자에게 알린다.
        let keptExistingOnImport = 0;

        sheets.forEach(sheetInfo => {
            const floorCode = noFloorInfo ? importFloorAtClick : floorBySheetName[sheetInfo.sheetName];
            if (!floorCode) return; // "(가져오지 않음)"으로 지정된 시트는 건너뜀

            const key = `${importBuildingAtClick}_${floorCode}`;
            if (!state.defects[key]) state.defects[key] = [];
            pushDefectHistoryForKey(key);

            // 기존 결함번호 중 가장 큰 숫자를 이어서 번호 매기기 (엑셀 결함번호 칸이 비어있는 행용)
            let seq = state.defects[key].reduce((max, d) => {
                const n = getDefectSortNo(d);
                return n === Number.MAX_SAFE_INTEGER ? max : Math.max(max, n);
            }, 0);

            // 도면 크기는 현재 화면에 열려있는 층일 때만 실제 이미지 크기를 알 수 있고,
            // 그 외 층은 도면이 로드되어 있지 않으므로 기본 캔버스 크기로 배치한다
            const img = (importBuildingAtClick === state.currentBuildingId && floorCode === state.currentFloor) ? state.bgImage : null;
            const imgW = img ? (img.naturalWidth || img.width || 1200) : 1200;
            const imgH = img ? (img.naturalHeight || img.height || 700) : 700;
            const marginX = Math.max(80, imgW * 0.06);
            const marginY = Math.max(80, imgH * 0.06);
            const gridCols = 8;
            const stepX = Math.max(60, (imgW - marginX * 2) / gridCols);
            const stepY = Math.max(60, stepX * 0.7);

            let importedThisFloor = 0;
            let matchedThisFloor = 0;
            sheetInfo.rows.forEach((row, i) => {
                const noRaw = getCell(row, 'no');
                let defectTypeRaw = getCell(row, 'defectType');
                // 2026-10-27 부재명칭 칸의 개구부 말(문 상부·창 하부·개구부 주위 …)은 지우고 「개구부 결함」 체크 + 개구부 종류로 옮긴다.
                // 다 지워져 비면 개구부는 벽에 나는 것이라 「벽체」(그 밖의 빈 칸은 예전처럼 「기타」)
                const componentCellRaw = getCell(row, 'component');
                const openingFromMember = extractOpeningFromMemberName(componentCellRaw);
                let componentCellClean = openingFromMember.found ? (openingFromMember.component || '벽체') : componentCellRaw;
                let componentRaw = componentCellClean || '기타';
                const categoryRaw = getCell(row, 'category');
                const locationRaw = getCell(row, 'location');
                const sizeRaw = getCell(row, 'size');
                let causeRaw = getCell(row, 'cause');
                let crackWidthRaw = getCell(row, 'crackWidth');
                let crackLengthRaw = getCell(row, 'crackLength');
                const progressRaw = getCell(row, 'progress');
                const leakRaw = getCell(row, 'leak');

                const category = resolveImportCategoryWithContent(categoryRaw, defectTypeRaw, componentRaw);
                // 2026-10-30 회사 결함표 형식: 비구조체·마감재는 「부재 벽체 + 조사내용 타일 파손」→ 부재 「벽체 타일」 + 결함 「파손」.
                // 원인은 띄어쓰기·표기 변형을 표준 표기로(js/core/company-vocab.js). 구조체는 원인 표기만.
                const companyVocab = window.BSA && window.BSA.companyVocab;
                if (companyVocab) {
                    const cv = companyVocab.convertImportRow({ component: componentCellClean, defectType: defectTypeRaw, cause: causeRaw, category });
                    if (cv.split) {
                        componentCellClean = memberNameOut(cv.component) || cv.component;
                        componentRaw = componentCellClean || '기타';
                    }
                    defectTypeRaw = cv.defectType;
                    causeRaw = cv.cause;
                }
                const defectType = defectTypeRaw || '기타';
                const isGood = isGoodDefectType(defectType);

                // 규모칸에 "0.3/3.00.2/3.0", "0.3/2.00.3*0.3"처럼 여러 폭·길이가 붙어 있으면
                // crackMeasures 행으로 분리 ( / → 슬래시, *·x → x 조인 )
                let parsedMeasures = [];
                if (!isGood && sizeRaw) {
                    parsedMeasures = parseSizeTextToCrackMeasures(sizeRaw, { defectType });
                }
                const hasParsedPairs = parsedMeasures.some((m) => m && m.width && m.length);
                const typeHasCrack = /균열/.test(defectType);
                if (hasParsedPairs || (typeHasCrack && parsedMeasures.length && !crackWidthRaw && !crackLengthRaw)) {
                    if (!crackWidthRaw && !crackLengthRaw) {
                        crackWidthRaw = parsedMeasures.map((m) => m.width).filter(Boolean).join(' / ');
                        crackLengthRaw = parsedMeasures.map((m) => m.length).filter(Boolean).join(' / ');
                    }
                } else {
                    parsedMeasures = [];
                }

                const noRawTrimmed = (noRaw || '').trim();
                // 번호가 같은 기존 핀이 있으면 위치는 그대로 두고 내용만 채운다.
                // 외부 입면(정·배·좌·우 또는 정배/좌우)은 같은 동·같은 이름 면들 전체를 본다.
                // 본관/신관처럼 이름이 다르거나 다른 동은 섞지 않는다.
                const elevationCodes = elevationSiblingFloorCodes(importBuildingAtClick, floorCode);
                const matchPool = elevationCodes.length > 1
                    ? elevationCodes.reduce((acc, fc) => {
                        const list = state.defects[`${importBuildingAtClick}_${fc}`];
                        if (list) acc.push.apply(acc, list);
                        return acc;
                    }, [])
                    : state.defects[key];
                const existing = (mergeByNo && noRawTrimmed)
                    ? ((window.BSA && window.BSA.shared && window.BSA.shared.cadUnmarkedPlace
                        && typeof window.BSA.shared.cadUnmarkedPlace.findDefectByNormalizedNo === 'function')
                        ? window.BSA.shared.cadUnmarkedPlace.findDefectByNormalizedNo(matchPool, noRawTrimmed)
                        : (matchPool || []).find(d => (d.no || '').trim() === noRawTrimmed))
                    : null;

                if (existing) {
                    // 가져온 칸이 비었다고 기본값('기타'·'건조수축')으로 덮어쓰면 현장에서
                    // 작성한 내용이 사라진다. 값이 있을 때만 덮어쓴다.
                    // (2026-09-21 지하1층 주차장-1 NO.01~10 사고)
                    const importMerge = (window.BSA && window.BSA.syncMerge) || null;
                    const pick = (incoming, current, fallback) => (importMerge && typeof importMerge.pickImportedText === 'function'
                        ? importMerge.pickImportedText(incoming, current, fallback)
                        : (String(incoming || '').trim() || String(current || '').trim() || String(fallback || '').trim()));
                    if (importMerge && typeof importMerge.countKeptExistingOnImport === 'function') {
                        keptExistingOnImport += importMerge.countKeptExistingOnImport([
                            { incoming: componentCellClean, existing: existing.component },
                            { incoming: defectTypeRaw, existing: existing.defectType },
                            { incoming: causeRaw, existing: existing.cause }
                        ]);
                    }
                    existing.category = category;
                    existing.component = pick(componentCellClean, existing.component, '기타');
                    if (locationRaw) existing.location = locationRaw;
                    existing.defectType = pick(defectTypeRaw, existing.defectType, '기타');
                    // 합친 결과로 다시 판정한다 — 빈 가져오기 값으로 '기타'가 되어 있으면 안 된다
                    const isGoodMerged = isGoodDefectType(existing.defectType);
                    existing.cause = isGoodMerged ? '-' : pick(causeRaw, existing.cause, '');
                    existing.size = isGoodMerged ? '' : pick(sizeRaw, existing.size, '');
                    existing.crackWidth = isGoodMerged ? '' : pick(crackWidthRaw, existing.crackWidth, '');
                    existing.crackLength = isGoodMerged ? '' : pick(crackLengthRaw, existing.crackLength, '');
                    if (!isGoodMerged && parsedMeasures.length) {
                        applyParsedCrackMeasuresToDefect(existing, parsedMeasures, sizeRaw);
                    } else if (isGoodMerged) {
                        existing.crackMeasures = [];
                    }
                    existing.isProgress = isGoodMerged ? false : resolveImportFlag(progressRaw);
                    existing.isLeak = isGoodMerged ? false : resolveImportFlag(leakRaw);
                    existing.isOpeningCrack = isGoodMerged
                        ? false
                        : detectImportOpeningCrack({
                            location: locationRaw || existing.location,
                            defectType: existing.defectType,
                            component: existing.component,
                            size: existing.size,
                            isGood: isGoodMerged,
                            openingFromMember: openingFromMember.found
                        });
                    // 부재명칭에서 찾은 개구부 종류를 칩(openingPos)으로 — 가져온 부재명칭이 우선, 없으면 비어 있을 때만 결함 내용·위치 글에서
                    if (!isGoodMerged) {
                        const opPosM = openingFromMember.pos
                            || (existing.openingPos ? '' : (findOpeningPosInText(existing.defectType) || findOpeningPosInText(locationRaw)));
                        if (opPosM) existing.openingPos = opPosM;
                    }
                    // 엑셀 가져오기는 항상 전차(전회차) 조사내용으로 분류
                    existing.isCarriedOver = true;
                    // 위치 칸 '외부'만으로 외부 시트로 보내지 않음 — 시트↔층 배정(floorCode)만 본다.
                    const importToExteriorExisting = !isInteriorFloorDrawingCode(floorCode)
                        && typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(floorCode);
                    existing._importFloorCode = floorCode;
                    if (importPrevRound || importToExteriorExisting) {
                        const hasMapCoords = existing.x !== undefined && existing.y !== undefined;
                        // 외부는 좌표가 있어도 「미등록」으로 두지 않음 — 이미 배치된 핀은 유지
                        if (importToExteriorExisting && hasMapCoords && !existing.mapUnregistered) {
                            /* keep placed */
                        } else {
                            existing.mapUnregistered = !hasMapCoords;
                        }
                    } else if (existing.mapUnregistered) {
                        existing.mapUnregistered = false;
                    }
                    // 가져온 내용이 동기화에서 이기도록 수정 시각을 올린다 — 병합은 시각이 같으면 서버를 따른다
                    touchDefectUpdatedAt(existing);
                    if (elevationCodes.length > 1 && typeof markFloorKeyDirty === 'function') {
                        elevationCodes.forEach((fc) => {
                            const ownerKey = `${importBuildingAtClick}_${fc}`;
                            const ownerList = state.defects[ownerKey];
                            if (ownerList && ownerList.indexOf(existing) >= 0) markFloorKeyDirty(ownerKey);
                        });
                    }
                    matchedThisFloor++;
                    return;
                }

                seq += 1;
                const seqStr = seq < 10 ? `0${seq}` : `${seq}`;
                const no = noRawTrimmed || `NO.${seqStr}`;

                const newDefect = {
                    id: generateDefectUniqueId(`${importBuildingAtClick}_${floorCode}`),
                    no,
                    category,
                    component: componentRaw,
                    // 2026-10-27 위치칸이 공란이면 상세위치도 공란(1·2종 '' · 3종 층 이름만 = 상세위치 공란). 예전엔 '2F 기둥'처럼 부재명이 상세위치로 들어갔다
                    location: locationRaw || composeDefectLocation('', floorCode),
                    defectType,
                    cause: isGood ? '-' : (causeRaw || ''), // 2026-10-30 원인을 안 적으면 빈칸(예전 「건조수축」)
                    size: isGood ? '' : sizeRaw,
                    crackWidth: isGood ? '' : crackWidthRaw,
                    crackLength: isGood ? '' : crackLengthRaw,
                    isProgress: isGood ? false : resolveImportFlag(progressRaw),
                    isLeak: isGood ? false : resolveImportFlag(leakRaw),
                    isOpeningCrack: isGood
                        ? false
                        : detectImportOpeningCrack({
                            location: locationRaw || composeDefectLocation('', floorCode),
                            defectType,
                            component: componentRaw,
                            size: sizeRaw,
                            isGood,
                            openingFromMember: openingFromMember.found
                        }),
                    // 2026-10-27 새로 가져온 개구부 결함의 위치(창 상부…)는 부재명칭·결함 내용·위치 글에서 찾아 둔다(이미 있는 결함은 건드리지 않음)
                    ...(isGood ? {} : (() => {
                        const op = openingFromMember.pos || findOpeningPosInText(defectType) || findOpeningPosInText(locationRaw) || findOpeningPosInText(componentRaw);
                        return op ? { openingPos: op } : {};
                    })()),
                    photos: [],
                    inspectorName: window.state.userName || ''
                };
                if (!isGood && parsedMeasures.length) {
                    applyParsedCrackMeasuresToDefect(newDefect, parsedMeasures, sizeRaw);
                }

                // 1F 등 내부 층 시트는 위치 '외부'여도 외부 공유 미마킹으로 넣지 않음
                const importToExterior = !isInteriorFloorDrawingCode(floorCode)
                    && typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(floorCode);
                newDefect._importFloorCode = floorCode;
                // 외부(입면·평면도)는 어느 도면에서나 「전차 미등록」으로 보이게 좌표 없이 등록.
                // 배치할 때 보고 있는 외부 도면으로 옮긴다.
                if (importPrevRound || importToExterior) {
                    newDefect.isCarriedOver = true;
                    newDefect.mapUnregistered = true;
                    totalUnregistered++;
                } else {
                    const col = i % gridCols;
                    const rowIdx = Math.floor(i / gridCols);
                    const boxX = marginX + col * stepX;
                    const boxY = marginY + rowIdx * stepY;
                    newDefect.isCarriedOver = true;
                    newDefect.mapUnregistered = false;
                    newDefect.x = boxX;
                    newDefect.y = boxY;
                    newDefect.targetX = boxX - 35;
                    newDefect.targetY = boxY + 35;
                }
                state.defects[key].push(newDefect);
                importedThisFloor++;
            });

            if (importedThisFloor > 0 || matchedThisFloor > 0) {
                // 지금 보고 있지 않은 층에 넣은 것도 서버에 올라가게 — 저장은 현재 층만 dirty로 표시한다
                if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
                totalImported += importedThisFloor;
                totalMatched += matchedThisFloor;
                floorsTouched++;
            }
            if (elevationSiblingFloorCodes(importBuildingAtClick, floorCode).length > 1) {
                pruneElevationUnregisteredTwins(importBuildingAtClick, floorCode);
            }
        });

        if (totalImported === 0 && totalMatched === 0) {
            window.showToast('가져올 시트가 선택되지 않았습니다. 시트별 층 배정을 확인해주세요.', 'warning', 5000);
            return;
        }

        updateUndoRedoButtons();
        saveStateToLocalStorage();
        // 가져오기 직후 상태 — 되살리기가 "이 가져오기가 바꾼 행"만 고르는 기준
        if (typeof recordAfterBulkOp === 'function') recordAfterBulkOp(excelImportSnaps);
        renderSurveyTable();
        drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        closeImportDefectExcelModal();

        const parts = [];
        if (totalMatched > 0) parts.push(`같은 번호 핀 ${totalMatched}건은 위치 유지하고 전차 조사내용만 업데이트`);
        if (totalUnregistered > 0) {
            parts.push(`전차 ${totalUnregistered}건은 「전차 미등록」 목록에 추가(외부는 모든 입면·평면도에서 보임, 좌측에서 클릭 후 마킹)`);
        } else if (totalImported > 0) {
            parts.push(`전차 조사내용 ${totalImported}건 신규 등록(도면 좌측 상단 임시 배치, 직접 드래그 필요)`);
        }
        window.showToast(`${floorsTouched}개 층 반영 완료 — ${parts.join(' / ')}`, 'success', 8000);
        if (keptExistingOnImport > 0) {
            // 예전에는 이 경우 '기타'·'건조수축'으로 덮어써서 작성한 내용이 사라졌다.
            window.showToast(
                `가져온 파일에 부재·결함·원인이 비어 있는 칸이 ${keptExistingOnImport}개 있어 기존 내용을 그대로 두었습니다. `
                + '파일의 열 제목이 맞는지 확인해 주세요.',
                'warning', 10000
            );
            console.warn('[가져오기] 빈 칸으로 기존 내용을 덮어쓰지 않았습니다:', keptExistingOnImport);
        }
    };

    /**
     * 가져오기 중복 실행 방지.
     * 백업을 기다리게 바뀌면서, 그 사이 「가져오기」를 한 번 더 누르면 두 번 돌 수 있었다
     * (번호가 안 맞는 행은 결함이 두 번 생김). 진행 중이면 두 번째 누름은 무시한다.
     */
    (function guardConfirmImportDefectExcel() {
        const run = window.confirmImportDefectExcel;
        if (typeof run !== 'function' || run._bsaGuarded) return;
        let inFlight = false;
        const guarded = async function (...args) {
            if (inFlight) {
                window.showToast?.('가져오기를 진행하고 있습니다. 잠시만 기다려 주세요.', 'info', 2500);
                return undefined;
            }
            inFlight = true;
            try {
                return await run.apply(this, args);
            } finally {
                inFlight = false;
            }
        };
        guarded._bsaGuarded = true;
        window.confirmImportDefectExcel = guarded;
    })();

    const btnImportDefectExcel = document.getElementById('btnImportDefectExcel');
    const inputImportDefectExcel = document.getElementById('inputImportDefectExcel');
    if (btnImportDefectExcel && inputImportDefectExcel) {
        btnImportDefectExcel.addEventListener('click', () => inputImportDefectExcel.click());
        inputImportDefectExcel.addEventListener('change', window.handleImportDefectExcelFile);
    }
    const btnImportDefectHwpx = document.getElementById('btnImportDefectHwpx');
    const inputImportDefectHwpx = document.getElementById('inputImportDefectHwpx');
    if (btnImportDefectHwpx && inputImportDefectHwpx) {
        btnImportDefectHwpx.addEventListener('click', () => inputImportDefectHwpx.click());
        inputImportDefectHwpx.addEventListener('change', window.handleImportDefectHwpxFile);
    }
    const btnCloseImportDefectExcelModal = document.getElementById('btnCloseImportDefectExcelModal');
    if (btnCloseImportDefectExcelModal) btnCloseImportDefectExcelModal.addEventListener('click', closeImportDefectExcelModal);
    const btnCancelImportDefectExcel = document.getElementById('btnCancelImportDefectExcel');
    if (btnCancelImportDefectExcel) btnCancelImportDefectExcel.addEventListener('click', closeImportDefectExcelModal);
    const btnConfirmImportDefectExcel = document.getElementById('btnConfirmImportDefectExcel');
    if (btnConfirmImportDefectExcel) btnConfirmImportDefectExcel.addEventListener('click', window.confirmImportDefectExcel);
    const importPrevRoundCheckbox = document.getElementById('importDefectExcelPrevRound');
    if (importPrevRoundCheckbox) importPrevRoundCheckbox.addEventListener('change', updateImportDefectExcelHelpText);

    // 엑셀 시트 이름으로 쓸 수 없는 문자를 제거하고 31자로 자르며, 중복되면 뒤에 번호를 붙인다
    function sanitizeSheetName(name, usedNames) {
        let clean = (name || '시트').replace(/[:\\/?*\[\]]/g, '').trim().slice(0, 31) || '시트';
        let finalName = clean;
        let suffix = 2;
        while (usedNames.has(finalName)) {
            finalName = `${clean.slice(0, 28)}(${suffix})`;
            suffix++;
        }
        usedNames.add(finalName);
        return finalName;
    }

    // 결함표 가져오기 양식(빈 엑셀 템플릿) 다운로드 — 건축물의 실제 층마다 시트를 하나씩 만들어서
    // 각 층 결함을 해당 시트에 나눠 적으면 가져오기 때 시트 이름으로 층이 자동 배정되도록 함.
    // 헤더는 IMPORT_DEFECT_FIELD_DEFS와 항상 일치하도록 그대로 재사용.
    window.downloadImportDefectExcelTemplate = function() {
        if (typeof XLSX === 'undefined') {
            window.showToast('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인 후 다시 시도해주세요.', 'error', 5000);
            return;
        }
        const headerRow = IMPORT_DEFECT_FIELD_DEFS.map(f => f.aliases[0]);
        const exampleRows = [
            ['NO.01', '기둥', '구조체', '균열', '(예시) 101동 1F 기둥 C1 하부', '0.15/1.2', '0.15', '1.2', '진행중', '-', '건조수축'],
            ['NO.02', '슬래브', '구조체', '상태양호', '(예시) 101동 1F 슬래브 중앙', '', '', '', '', '', ''],
            ['NO.03', '조적벽', '비구조체', '조적벽체 균열', '(예시) 2F 조적벽', 'W=0.3mm', '', '', '-', '누수중', '부등침하']
        ];
        const colWidths = [10, 14, 14, 18, 30, 14, 10, 10, 10, 10, 18].map(w => ({ wch: w }));

        const bldg = state.currentBuilding;
        const floors = bldg ? window.getBuildingAvailableFloors(bldg) : [];
        const wb = XLSX.utils.book_new();
        const usedNames = new Set();

        if (floors.length > 0) {
            floors.forEach((f, idx) => {
                const aoa = idx === 0 ? [headerRow, ...exampleRows] : [headerRow];
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                ws['!cols'] = colWidths;
                XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(f.floorLabel, usedNames));
            });
        } else {
            const ws = XLSX.utils.aoa_to_sheet([headerRow, ...exampleRows]);
            ws['!cols'] = colWidths;
            XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName('결함목록', usedNames));
        }

        const notes = [
            ['[스마트 건축물 안전점검] 결함표 가져오기 양식 작성 안내'],
            [''],
            [floors.length > 0
                ? "1. 시트가 층별로 나뉘어 있습니다. 각 시트 이름이 곧 층 이름이니, 해당 층의 결함만 그 시트에 적으세요. 쓰지 않는 층 시트는 그냥 비워두거나 삭제해도 됩니다."
                : "1. 건축물의 층 정보가 없어 시트가 하나로 되어 있습니다. '결함목록' 시트 하나에 모두 적으세요."],
            ["2. 각 시트 2~4행(예시 행, 위치 칸에 '(예시)' 표시)은 형식을 보여주기 위한 것입니다. 실제 데이터 입력 전 삭제하세요."],
            ["3. 첫 행(헤더)의 열 이름은 그대로 두는 것을 권장합니다. 이름을 바꿔도 앱에서 가져올 때 직접 매칭할 수 있지만, 그대로 두면 자동으로 인식됩니다."],
            ["4. '결함번호' 칸을 비워두면 앱에서 가져올 때 자동으로 순번(NO.01, NO.02…)을 매깁니다. 기존 번호 체계를 유지하려면 직접 입력하세요."],
            ["5. '구분' 칸은 반드시 '구조체' / '비구조체' / '마감재' 중 하나로 입력하세요. 비워두면 '구조체'로 처리됩니다."],
            ["6. '조사내용'은 결함 종류입니다 (예: 균열, 누수, 백태, 철근노출, 조적벽체 균열 등). 상태가 양호한 항목은 '상태양호'라고 입력하면 결함크기·균열폭·균열길이·결함원인추정 칸은 비워도 자동으로 무시됩니다."],
            ["7. '결함크기'는 자유 텍스트입니다. 균열의 경우 균열폭/균열길이를 별도 칸에 나눠 적거나, 결함크기 칸에 '0.15/1.2'처럼 슬래시로 합쳐 적어도 자동으로 나뉘어 인식됩니다."],
            ["8. '진행여부' / '누수여부'는 해당되면 '진행중' / '누수중'처럼 아무 문자나 입력하고, 해당 없으면 '-' 또는 빈 칸으로 두세요."],
            ["9. 작성이 끝나면 이 파일을 저장한 뒤, 이 화면의 '📥 외부 엑셀 결함표 가져오기' 버튼으로 업로드하세요. 가져오기 화면에서 시트 ↔ 층 배정이 시트 이름으로 자동 추정되며, 다르면 직접 바꿀 수 있습니다."],
            ["10. 엑셀에는 도면 위 위치(좌표) 정보가 없어, 가져온 결함은 각 층 도면 좌측 상단에 임시로 배치됩니다. 가져오기 후 좌측 결함 목록에서 각 항목을 도면 위 정확한 위치로 직접 드래그해주세요."]
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(notes);
        ws2['!cols'] = [{ wch: 100 }];
        XLSX.utils.book_append_sheet(wb, ws2, sanitizeSheetName('작성안내', usedNames));

        const fileLabel = bldg && bldg.name ? bldg.name.replace(/[:\\/?*\[\]]/g, '') : '결함표';
        XLSX.writeFile(wb, `${fileLabel}_가져오기_양식.xlsx`);
    };

    const btnDownloadImportTemplate = document.getElementById('btnDownloadImportTemplate');
    if (btnDownloadImportTemplate) {
        btnDownloadImportTemplate.addEventListener('click', window.downloadImportDefectExcelTemplate);
    }

