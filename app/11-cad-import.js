// @@app-part 11-cad-import.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 9-1. CAD Defect Pins 2-Point Calibration Engine (v2.0) ---
    window.cadCalibrationState = null;

    function handleCadCalibrationClick(clientX, clientY) {
        if (!window.cadCalibrationState || !elements.planCanvas) return;
        const rect = elements.planCanvas.getBoundingClientRect();
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        const imgPt = canvasCssToImgCoords(cx, cy);

        if (window.cadCalibrationState.step === 1) {
            window.cadCalibrationState.pt1 = imgPt;
            window.cadCalibrationState.step = 2;

            const hintEl = document.getElementById('canvasHintText');
            if (hintEl) {
                hintEl.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <strong>[캐드 보정 2/2단계]</strong> 캐드에서 찍으셨던 <strong>두 번째 기준점(기둥 중심)</strong>을 도면에서 클릭하세요. <button id="btnCancelCadCalib" style="margin-left:8px;padding:2px 8px;border-radius:4px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-weight:700;">취소</button>`;
                const btnCancel = document.getElementById('btnCancelCadCalib');
                if (btnCancel) {
                    btnCancel.onclick = (e) => {
                        e.stopPropagation();
                        cancelCadCalibration();
                    };
                }
            }
            window.showToast?.('📍 [1/2] 1번 기준점 등록 완료! 이어서 2번 기준점을 클릭해 주세요.', 'info', 3500);
            drawCanvas();
            return;
        }

        if (window.cadCalibrationState.step === 2) {
            window.cadCalibrationState.pt2 = imgPt;
            finishCad2PointCalibration();
        }
    }

    function cancelCadCalibration() {
        window.cadCalibrationState = null;
        const hintEl = document.getElementById('canvasHintText');
        if (hintEl) {
            hintEl.style.background = '';
            hintEl.style.color = '';
            hintEl.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> <span>[✋ 화면 이동 모드] 도면 이동 및 확대 | 핀을 찍으려면 <strong>📍[결함 위치 마킹]</strong> 버튼 클릭</span>`;
        }
        drawCanvas();
    }

    async function finishCad2PointCalibration() {
        const calib = window.cadCalibrationState;
        if (!calib) return;

        const cadP1 = calib.data.refPoint1;
        const cadP2 = calib.data.refPoint2;
        const appP1 = calib.pt1;
        const appP2 = calib.pt2;
        const floorKey = calib.floorKey;

        // 비결함 텍스트 필터링
        const NON_DEFECT_WORDS = ['관리실', '창고', '평면도', '결함발생', '상태양호', '구분', '내용', '적색', '청색', '주차장'];
        const cadPlaceApi = (window.BSA && window.BSA.shared && window.BSA.shared.cadUnmarkedPlace) || null;
        const unmarkedList = cadPlaceApi
            ? cadPlaceApi.collectUnmarkedDefects(state.defects[floorKey] || [])
            : (state.defects[floorKey] || []).filter((d) => d && d.mapUnregistered);
        const includeUnlabeledCad = unmarkedList.length > 0;
        const validDefects = (calib.data.defects || []).filter(item => {
            const no = String(item.no || '').trim();
            if (!Number.isFinite(Number(item.cadBoxX)) || !Number.isFinite(Number(item.cadBoxY))) return false;
            if (!no) return includeUnlabeledCad;
            return !NON_DEFECT_WORDS.some(w => no.includes(w));
        });

        if (validDefects.length === 0) {
            alert('가져올 유효한 결함 데이터가 없습니다.');
            cancelCadCalibration();
            return;
        }

        const dims = (typeof getFloorPlanDisplayDims === 'function')
            ? getFloorPlanDisplayDims()
            : { w: 2000, h: 1500 };
        const imgW = dims.w || 2000;
        const imgH = dims.h || 1500;

        // 변환 엔진 생성기 (정방향, 180도 반전, 거울반사)
        function createSimilarityTransform(p1_cad, p2_cad, p1_app, p2_app, isMirror = false) {
            const dx_c = p2_cad.x - p1_cad.x;
            const dy_c = p2_cad.y - p1_cad.y;
            const dist_cad = Math.hypot(dx_c, dy_c);

            const du_a = p2_app.x - p1_app.x;
            const dv_a = p2_app.y - p1_app.y;
            const dist_app = Math.hypot(du_a, dv_a);

            if (dist_cad < 1.0 || dist_app < 1.0) return null;

            const S = dist_app / dist_cad;
            const phi_cad = Math.atan2(-dy_c, dx_c);
            const phi_app = Math.atan2(dv_a, du_a);
            // 거울 대칭(반사) 모드는 회전각 부호를 반대로 잡아야 기준점2도 appP2에 정확히 정합된다.
            // (그렇지 않으면 기준점1만 맞고 기준점2는 어긋난 채로 전체 결함이 잘못된 방향으로 퍼진다)
            const dphi = isMirror ? (phi_app + phi_cad) : (phi_app - phi_cad);
            const cosA = Math.cos(dphi);
            const sinA = Math.sin(dphi);

            return function (cx, cy) {
                const dx_prime = cx - p1_cad.x;
                let dy_prime = -(cy - p1_cad.y);
                if (isMirror) {
                    dy_prime = -dy_prime; // 반사(거울 대칭) 보정
                }
                const rx = S * (dx_prime * cosA - dy_prime * sinA);
                const ry = S * (dx_prime * sinA + dy_prime * cosA);
                return {
                    x: p1_app.x + rx,
                    y: p1_app.y + ry
                };
            };
        }

        // 자동 선택 후보군: 정상 정렬 / 두 기준점을 반대 순서로 클릭했을 때의 보정.
        // 거울(반사) 모드는 일부러 뺐다 — 캐드 PDF와 도면 좌표계는 원래 거울반사가 필요 없는
        // 관계라(둘 다 같은 원본에서 나와 방향이 보존됨), 후보에 넣으면 건물 형태에 따라
        // 정상 모드와 완전히 동점이 나오는 경우가 있어 자동선택이 불안정해진다.
        // 정말 거울반사가 필요한 예외 상황은 가져오기 직후 뜨는 "좌우/상하 반전" 툴바로 바로잡으면 된다.
        const candidateModes = [
            { name: '정상 정렬', fn: createSimilarityTransform(cadP1, cadP2, appP1, appP2, false) },
            { name: '180도 뒤집힘 자동교정', fn: createSimilarityTransform(cadP1, cadP2, appP2, appP1, false) }
        ].filter(m => m.fn !== null);

        // 캐드에서 기준점1/기준점2에 각각 가장 가까운 결함 검출 (방향 일치 검증용).
        // 두 기준점을 모두 확인해야 좌우/상하 대칭에 가까운 건물에서 거울 모드가
        // 우연히 동점으로 뽑히는 걸 막을 수 있다.
        function findNearestDefect(cadPt) {
            let best = validDefects[0];
            let bestDist = Infinity;
            validDefects.forEach(d => {
                const dist = Math.hypot(Number(d.cadBoxX) - cadPt.x, Number(d.cadBoxY) - cadPt.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = d;
                }
            });
            return best;
        }
        const defectNearCadP1 = findNearestDefect(cadP1);
        const defectNearCadP2 = findNearestDefect(cadP2);

        // 최적 모드 자동 선별
        let bestMode = candidateModes[0];
        let maxScore = -Infinity;

        candidateModes.forEach(mode => {
            let score = 0;
            // 1. 결함들이 도면 경계 범위 내에 몇 개나 안착되는지 검사
            let inBounds = 0;
            validDefects.forEach(d => {
                const pt = mode.fn(Number(d.cadBoxX), Number(d.cadBoxY));
                if (pt.x >= -imgW * 0.15 && pt.x <= imgW * 1.15 && pt.y >= -imgH * 0.15 && pt.y <= imgH * 1.15) {
                    inBounds++;
                }
            });
            score += inBounds * 100;

            // 2. 기준점1 근처 결함은 appP1에, 기준점2 근처 결함은 appP2에 더 가까워야 한다.
            //    고정 보너스(+-5000) 대신 거리 차이를 그대로 점수로 써서, 두 모드가 우연히
            //    똑같은 점수로 동점 나는 상황 자체를 원천적으로 막는다.
            const p1Pt = mode.fn(Number(defectNearCadP1.cadBoxX), Number(defectNearCadP1.cadBoxY));
            const p2Pt = mode.fn(Number(defectNearCadP2.cadBoxX), Number(defectNearCadP2.cadBoxY));
            const d1to1 = Math.hypot(p1Pt.x - appP1.x, p1Pt.y - appP1.y);
            const d1to2 = Math.hypot(p1Pt.x - appP2.x, p1Pt.y - appP2.y);
            const d2to1 = Math.hypot(p2Pt.x - appP1.x, p2Pt.y - appP1.y);
            const d2to2 = Math.hypot(p2Pt.x - appP2.x, p2Pt.y - appP2.y);
            score += (d1to2 - d1to1) * 2;
            score += (d2to1 - d2to2) * 2;

            if (score > maxScore) {
                maxScore = score;
                bestMode = mode;
            }
        });

        const cadToApp = bestMode.fn;

        const existingCount = (state.defects[floorKey] || []).length;
        const placedOnlyCount = existingCount - unmarkedList.length;
        let replaceMode = false;
        let historyPushed = false;
        const ensureCadImportHistory = () => {
            if (historyPushed) return;
            if (typeof pushDefectHistory === 'function') pushDefectHistory();
            historyPushed = true;
        };

        // 미표기(전차 미등록)가 있으면 조사내용은 유지하고 캐드 위치만 붙인다.
        // 전체 교체 확인을 띄우면 미표기 데이터가 지워진다.
        if (unmarkedList.length === 0 && existingCount > 0) {
            replaceMode = await window.appConfirm(
                `현재 층(${state.currentFloor})에 이미 ${existingCount}개의 결함이 등록되어 있습니다.\n\n` +
                `[모두 교체] : 기존 결함을 모두 비우고 캐드 핀으로 새로 교체\n` +
                `[기존 유지] : 기존은 두고, 조사내용은 유지하고, 같은 번호는 캐드 위치로 옮김(엑셀 먼저 불러온 경우 포함). 새 번호만 추가`,
                { title: 'CAD 가져오기', okText: '모두 교체', cancelText: '기존 유지', danger: true }
            );
        } else if (unmarkedList.length > 0 && placedOnlyCount > 0) {
            window.showToast?.(
                `미표기 ${unmarkedList.length}건은 캐드 위치에 붙이고, 이미 그려진 마킹 ${placedOnlyCount}건은 유지합니다.`,
                'info',
                4000
            );
        }

        let cadImportSnaps = [];
        if (typeof snapshotBeforeBulkOp === 'function') {
            cadImportSnaps = await snapshotBeforeBulkOp('CAD 가져오기', [floorKey]);
        }

        if (replaceMode) {
            const toClear = (state.defects[floorKey] || []).slice();
            ensureCadImportHistory();
            toClear.forEach((d) => {
                if (!d || !d.id) return;
                if (typeof removeSingleDefectRecord === 'function') {
                    removeSingleDefectRecord(floorKey, d.id, { skipRenumber: true });
                }
            });
            if (!state.defects[floorKey]) state.defects[floorKey] = [];
            if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
                discardStalePendingRemoteAfterLocalPinEdit();
            }
        }

        const currentDefects = state.defects[floorKey];
        let addedCount = 0;
        let skippedDupCount = 0;
        let placedUnmarkedCount = 0;
        const newDefectsList = [];

        const normalizeCadNoKey = (cadPlaceApi && cadPlaceApi.normalizeCadNoKey)
            ? cadPlaceApi.normalizeCadNoKey
            : (no) => {
                const raw = String(no || '').replace(/^NO\.?\s*/i, '').trim();
                const m = raw.match(/(\d+)(?:-(\d+))?/);
                if (!m) return raw.toLowerCase();
                return m[2] ? (m[1] + '-' + m[2]) : m[1];
            };

        let cadItemsToCreate = validDefects;
        if (!replaceMode && unmarkedList.length > 0 && cadPlaceApi) {
            const match = cadPlaceApi.matchUnmarkedToCadItems(unmarkedList, validDefects);
            if (match.pairs.length) ensureCadImportHistory();
            match.pairs.forEach(({ defect, cad }) => {
                if (!defect || !cad) return;
                const box = cadToApp(Number(cad.cadBoxX), Number(cad.cadBoxY));
                const tip = cadToApp(Number(cad.cadTipX), Number(cad.cadTipY));
                defect.x = Math.round(box.x);
                defect.y = Math.round(box.y);
                defect.targetX = Math.round(tip.x);
                defect.targetY = Math.round(tip.y);
                defect.mapUnregistered = false;
                defect.mapMarkedAt = Date.now();
                defect.isCadImported = true;
                const rawCadNo = String(cad.no || '').trim();
                if (rawCadNo) defect.cadNo = rawCadNo;
                if (rawCadNo && !String(defect.no || '').trim()) {
                    defect.no = rawCadNo;
                    defect.groupNo = rawCadNo;
                }
                if (typeof touchDefectPositionUpdatedAt === 'function') {
                    touchDefectPositionUpdatedAt(defect);
                }
                defect.updatedAt = Date.now();
                newDefectsList.push(defect);
                placedUnmarkedCount++;
            });
            cadItemsToCreate = cadPlaceApi.leftoverNumberedCad(match.leftoverCad);
        }

        // 엑셀 먼저(임시 격자 배치·미표기 아님) → 캐드 나중: 같은 번호면 조사내용 유지하고 캐드 좌표만 덮어씀
        if (!replaceMode && cadPlaceApi && typeof cadPlaceApi.matchNumberedDefectsToCadItems === 'function' && cadItemsToCreate.length) {
            const alreadyPlacedIds = new Set(newDefectsList.map((d) => d && d.id).filter(Boolean));
            const relocatable = (currentDefects || []).filter((d) => {
                if (!d || !d.id || d.surveyExtra) return false;
                if (alreadyPlacedIds.has(d.id)) return false;
                return true;
            });
            if (relocatable.length) {
                const matchPlaced = cadPlaceApi.matchNumberedDefectsToCadItems(relocatable, cadItemsToCreate);
                if (matchPlaced.pairs.length) ensureCadImportHistory();
                matchPlaced.pairs.forEach(({ defect, cad }) => {
                    if (!defect || !cad) return;
                    const box = cadToApp(Number(cad.cadBoxX), Number(cad.cadBoxY));
                    const tip = cadToApp(Number(cad.cadTipX), Number(cad.cadTipY));
                    defect.x = Math.round(box.x);
                    defect.y = Math.round(box.y);
                    defect.targetX = Math.round(tip.x);
                    defect.targetY = Math.round(tip.y);
                    defect.mapUnregistered = false;
                    defect.mapMarkedAt = Date.now();
                    defect.isCadImported = true;
                    const rawCadNo = String(cad.no || '').trim();
                    if (rawCadNo) defect.cadNo = rawCadNo;
                    if (rawCadNo && !String(defect.no || '').trim()) {
                        defect.no = rawCadNo;
                        defect.groupNo = rawCadNo;
                    }
                    if (typeof touchDefectPositionUpdatedAt === 'function') {
                        touchDefectPositionUpdatedAt(defect);
                    }
                    defect.updatedAt = Date.now();
                    newDefectsList.push(defect);
                    placedUnmarkedCount++;
                });
                cadItemsToCreate = cadPlaceApi.leftoverNumberedCad(matchPlaced.leftoverCad);
            }
        }

        // 외부 도면끼리 번호가 겹치지 않도록, 외부면 전체 외부 번호 풀을 본다.
        const poolForCadNos = (typeof getFloorDefectsForNumbering === 'function')
            ? getFloorDefectsForNumbering(floorKey)
            : (currentDefects || []);
        const existingNoKeys = new Set(
            (poolForCadNos || []).map((d) => normalizeCadNoKey(d.cadNo || d.no || d.groupNo || ''))
                .filter(Boolean)
        );

        cadItemsToCreate.forEach((cadItem, idx) => {
            // 캐드에 적혀 있던 결함 번호 원본 100% 보존
            const rawNo = String(cadItem.no || '').trim() || String(currentDefects.length + 1);
            const noKey = normalizeCadNoKey(rawNo);
            // 같은 JSON 재가져오기 시 번호 중복 핀 방지 (병합 모드)
            if (!replaceMode && noKey && existingNoKeys.has(noKey)) {
                skippedDupCount++;
                return;
            }
            if (noKey) existingNoKeys.add(noKey);
            const box = cadToApp(Number(cadItem.cadBoxX), Number(cadItem.cadBoxY));
            const tip = cadToApp(Number(cadItem.cadTipX), Number(cadItem.cadTipY));

            const newId = (typeof generateDefectUniqueId === 'function')
                ? generateDefectUniqueId(floorKey)
                : ('cad_' + Date.now() + '_' + idx);

            const newDefect = {
                id: newId,
                no: rawNo,
                groupNo: rawNo,
                cadNo: rawNo,
                isCadImported: true,
                category: (window.bsaPlasterNonStructCategory ? window.bsaPlasterNonStructCategory((cadItem.category || '구조체'), (cadItem.defectType || '균열'), { force: true }) : (cadItem.category || '구조체')),
                component: memberNameOut(cadItem.component) || '',
                location: defectLocationUsesFloor() ? state.currentFloor : '',
                defectType: cadItem.defectType || '균열',
                cause: cadItem.cause || '', // 2026-10-30 안 적으면 빈칸(예전 「건조수축」)
                size: cadItem.size || '',
                crackWidth: cadItem.crackWidth || '',
                crackLength: cadItem.crackLength || '',
                crackMeasures: [],
                itemCount: '',
                isProgress: false,
                isLeak: false,
                isOpeningCrack: false,
                isCarriedOver: true,
                isBookmark: false,
                isPriorityManage: false,
                forceArrowDir: false,
                arrowOctant: 0,
                surveyRound: (typeof getCurrentSurveyRoundKey === 'function') ? getCurrentSurveyRoundKey() : '2026년_하반기',
                mapMarkedAt: Date.now(),
                mapUnregistered: false,
                updatedAt: Date.now(),
                photos: [],
                prevRoundPhotos: [],
                inspectorName: state.userName || '',
                x: Math.round(box.x),
                y: Math.round(box.y),
                targetX: Math.round(tip.x),
                targetY: Math.round(tip.y)
            };

            if (typeof touchDefectPositionUpdatedAt === 'function') {
                touchDefectPositionUpdatedAt(newDefect);
            }

            if (!historyPushed) ensureCadImportHistory();
            currentDefects.push(newDefect);
            newDefectsList.push(newDefect);
            addedCount++;
        });

        // 캐드 원본 번호 유지를 위해 번호 재정렬(normalize)은 호출하지 않음
        if (placedUnmarkedCount > 0 && typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
            discardStalePendingRemoteAfterLocalPinEdit();
        }

        saveStateToLocalStorage();
        if (typeof recordAfterBulkOp === 'function') recordAfterBulkOp(cadImportSnaps);
        cancelCadCalibration();
        drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function' && state.currentTab === 'tab-survey') renderSurveyTable();

        if (addedCount === 0 && placedUnmarkedCount === 0 && skippedDupCount > 0) {
            window.showToast?.(`같은 번호 캐드 핀 ${skippedDupCount}개는 이미 있어 추가하지 않았습니다.`, 'info', 4500);
            return;
        }
        const parts = [];
        if (placedUnmarkedCount > 0) parts.push(`미표기 ${placedUnmarkedCount}건을 캐드 위치에 배치`);
        if (addedCount > 0) parts.push(`새 캐드 핀 ${addedCount}개`);
        const skipMsg = skippedDupCount > 0 ? ` (같은 번호 ${skippedDupCount}개 건너뜀)` : '';
        window.showToast?.(
            `🎉 ${parts.join(' · ') || '캐드 핀 배치 완료'}!${skipMsg} 상단 조정 바로 좌우 반전 및 위치를 맞춰보세요.`,
            'success',
            6000
        );
        if (newDefectsList.length) showCadPinAdjustToolbar(newDefectsList, floorKey);
    }

    function showCadPinAdjustToolbar(importedDefects, floorKey) {
        const oldBar = document.getElementById('cadPinAdjustBar');
        if (oldBar) oldBar.remove();

        const bar = document.createElement('div');
        bar.id = 'cadPinAdjustBar';
        bar.style.cssText = `
            position: fixed;
            top: 75px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 100000;
            background: rgba(15, 23, 42, 0.96);
            color: #ffffff;
            padding: 9px 16px;
            border-radius: 12px;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 13px;
            font-weight: 700;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(56, 189, 248, 0.4);
            flex-wrap: wrap;
            justify-content: center;
        `;

        const importedIds = new Set(importedDefects.map(d => d.id));
        const getTargets = () => (state.defects[floorKey] || []).filter(d => importedIds.has(d.id));

        function getCenter() {
            const targets = getTargets();
            if (!targets.length) return { cx: 0, cy: 0 };
            let sx = 0, sy = 0;
            targets.forEach(d => { sx += d.x; sy += d.y; });
            return { cx: sx / targets.length, cy: sy / targets.length };
        }

        bar.innerHTML = `
            <span style="color:#38bdf8;margin-right:2px;"><i class="fa-solid fa-arrows-to-dot"></i> [캐드 핀 위치 맞춤]</span>
            <button id="btnCadBarFlipH" title="좌우가 뒤집혔을 때 누르세요" style="background:#0284c7;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">🔄 좌우 반전</button>
            <button id="btnCadBarFlipV" title="상하가 뒤집혔을 때 누르세요" style="background:#0284c7;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">🔄 상하 반전</button>
            <button id="btnCadBarRot180" title="180도 회전" style="background:#6366f1;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">🔄 180° 회전</button>
            <span style="color:#64748b;margin:0 2px;">|</span>
            <span style="font-size:12px;color:#cbd5e1;">위치이동:</span>
            <button id="btnCadBarUp" style="background:#334155;color:#fff;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;">⬆️</button>
            <button id="btnCadBarDown" style="background:#334155;color:#fff;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;">⬇️</button>
            <button id="btnCadBarLeft" style="background:#334155;color:#fff;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;">⬅️</button>
            <button id="btnCadBarRight" style="background:#334155;color:#fff;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;">➡️</button>
            <span style="color:#64748b;margin:0 2px;">|</span>
            <span style="font-size:12px;color:#cbd5e1;">간격:</span>
            <button id="btnCadBarScaleUp" style="background:#334155;color:#fff;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;">➕</button>
            <button id="btnCadBarScaleDown" style="background:#334155;color:#fff;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;">➖</button>
            <span style="color:#64748b;margin:0 4px;">|</span>
            <button id="btnCadBarConfirm" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:800;">✅ 이 위치로 확정</button>
        `;

        document.body.appendChild(bar);

        const stepMove = 25;

        // 1. 좌우 반전
        document.getElementById('btnCadBarFlipH').onclick = () => {
            const { cx } = getCenter();
            getTargets().forEach(d => {
                d.x = Math.round(cx - (d.x - cx));
                if (d.targetX !== undefined) d.targetX = Math.round(cx - (d.targetX - cx));
            });
            drawCanvas();
        };

        // 2. 상하 반전
        document.getElementById('btnCadBarFlipV').onclick = () => {
            const { cy } = getCenter();
            getTargets().forEach(d => {
                d.y = Math.round(cy - (d.y - cy));
                if (d.targetY !== undefined) d.targetY = Math.round(cy - (d.targetY - cy));
            });
            drawCanvas();
        };

        // 3. 180도 회전
        document.getElementById('btnCadBarRot180').onclick = () => {
            const { cx, cy } = getCenter();
            getTargets().forEach(d => {
                d.x = Math.round(2 * cx - d.x);
                d.y = Math.round(2 * cy - d.y);
                if (d.targetX !== undefined) d.targetX = Math.round(2 * cx - d.targetX);
                if (d.targetY !== undefined) d.targetY = Math.round(2 * cy - d.targetY);
            });
            drawCanvas();
        };

        // 4. 상하좌우 이동
        document.getElementById('btnCadBarUp').onclick = () => {
            getTargets().forEach(d => { d.y -= stepMove; if (d.targetY !== undefined) d.targetY -= stepMove; });
            drawCanvas();
        };
        document.getElementById('btnCadBarDown').onclick = () => {
            getTargets().forEach(d => { d.y += stepMove; if (d.targetY !== undefined) d.targetY += stepMove; });
            drawCanvas();
        };
        document.getElementById('btnCadBarLeft').onclick = () => {
            getTargets().forEach(d => { d.x -= stepMove; if (d.targetX !== undefined) d.targetX -= stepMove; });
            drawCanvas();
        };
        document.getElementById('btnCadBarRight').onclick = () => {
            getTargets().forEach(d => { d.x += stepMove; if (d.targetX !== undefined) d.targetX += stepMove; });
            drawCanvas();
        };

        // 5. 간격 확대/축소
        document.getElementById('btnCadBarScaleUp').onclick = () => {
            const { cx, cy } = getCenter();
            const factor = 1.02;
            getTargets().forEach(d => {
                d.x = Math.round(cx + (d.x - cx) * factor);
                d.y = Math.round(cy + (d.y - cy) * factor);
                if (d.targetX !== undefined) d.targetX = Math.round(cx + (d.targetX - cx) * factor);
                if (d.targetY !== undefined) d.targetY = Math.round(cy + (d.targetY - cy) * factor);
            });
            drawCanvas();
        };
        document.getElementById('btnCadBarScaleDown').onclick = () => {
            const { cx, cy } = getCenter();
            const factor = 0.98;
            getTargets().forEach(d => {
                d.x = Math.round(cx + (d.x - cx) * factor);
                d.y = Math.round(cy + (d.y - cy) * factor);
                if (d.targetX !== undefined) d.targetX = Math.round(cx + (d.targetX - cx) * factor);
                if (d.targetY !== undefined) d.targetY = Math.round(cy + (d.targetY - cy) * factor);
            });
            drawCanvas();
        };

        // 6. 확정
        document.getElementById('btnCadBarConfirm').onclick = () => {
            saveStateToLocalStorage();
            bar.remove();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            if (typeof renderSurveyTable === 'function' && state.currentTab === 'tab-survey') renderSurveyTable();
            window.showToast?.('🎉 캐드 핀 위치가 최종 확정되어 안전하게 저장되었습니다!', 'success', 3500);
        };
    }

    function startCad2PointCalibration(data, floorKey, bldg) {
        window.cadCalibrationState = {
            data: data,
            floorKey: floorKey,
            bldg: bldg,
            step: 1,
            pt1: null,
            pt2: null
        };

        const hintEl = document.getElementById('canvasHintText');
        if (hintEl) {
            hintEl.style.background = 'rgba(2, 132, 199, 0.95)';
            hintEl.style.color = '#ffffff';
            hintEl.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <strong>[캐드 보정 1/2단계]</strong> 캐드에서 찍으셨던 <strong>첫 번째 기준점(예: 도면 좌상단 기둥)</strong>을 클릭하세요. <button id="btnCancelCadCalib" style="margin-left:8px;padding:2px 8px;border-radius:4px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-weight:700;">취소</button> <label id="lblCadAutoDetect" title="도면 가장 바깥 테두리 모서리를 찾아 기준점으로 제안" style="margin-left:8px;cursor:pointer;font-weight:700;white-space:nowrap;"><input type="checkbox" id="chkCadAutoDetect" style="vertical-align:middle;margin-right:3px;cursor:pointer;"${isCadAutoDetectOn() ? ' checked' : ''}>자동 인식</label>`;
            const chkAuto = document.getElementById('chkCadAutoDetect');
            if (chkAuto) {
                chkAuto.onclick = (e) => { e.stopPropagation(); };
                chkAuto.onchange = (e) => {
                    e.stopPropagation();
                    setCadAutoDetectOn(!!chkAuto.checked);
                    const cur = window.cadCalibrationState;
                    if (chkAuto.checked && cur && cur.step === 1 && !cur.pt1) {
                        proposeCadFrameCorners().catch((err) => console.warn('[CAD] 테두리 자동 찾기 실패', err));
                    }
                };
            }
            const lblAuto = document.getElementById('lblCadAutoDetect');
            if (lblAuto) lblAuto.onclick = (e) => { e.stopPropagation(); };
            const btnCancel = document.getElementById('btnCancelCadCalib');
            if (btnCancel) {
                btnCancel.onclick = (e) => {
                    e.stopPropagation();
                    cancelCadCalibration();
                };
            }
        }
        window.showToast?.('📍 [1/2] 캐드에서 찍은 첫 번째 기준점(예: 좌상단 기둥)을 도면에서 클릭해 주세요.', 'info', 5000);
        // 2026-10-31 기준점은 늘 도면 테두리(가장 바깥 사각형) 모서리 — 그림에서 찾아 제안(확인 후에만 적용)
        if (isCadAutoDetectOn()) setTimeout(() => { proposeCadFrameCorners().catch((e) => console.warn('[CAD] 테두리 자동 찾기 실패', e)); }, 0);
    }

    /** 캐드 보정 「자동 인식」 켜짐 여부(기본 켬, 이 기기에 기억) */
    function isCadAutoDetectOn() {
        try { return localStorage.getItem('bsa.cadAutoDetect') !== '0'; } catch (_) { return true; }
    }
    function setCadAutoDetectOn(on) {
        try { localStorage.setItem('bsa.cadAutoDetect', on ? '1' : '0'); } catch (_) { /* ignore */ }
    }

    /** 지금 층 도면 그림에서 테두리 사각형을 찾는다(그림 좌표). 못 찾으면 null */
    function detectCadFrameOnCurrentFloor() {
        const det = window.BSA && window.BSA.shared && window.BSA.shared.cadFrameDetect;
        const img = state.bgImage;
        if (!det || !img) return null;
        const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
        if (!(nw > 0 && nh > 0)) return null;
        // 2026-11-03 테두리가 PDF의 아주 가는 선(두께 0)이라 1600px로 줄이면 선이 끊기거나 사라져 한쪽 모서리가 어긋났다 →
        // 원래 크기에 가깝게(긴 변 4600px까지) 그대로 읽는다. 검출은 한 번만 하므로 느려도 괜찮다.
        const k = Math.min(1, 4600 / Math.max(nw, nh));
        const w = Math.max(16, Math.round(nw * k)), h = Math.max(16, Math.round(nh * k));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        let data;
        try { data = cx.getImageData(0, 0, w, h).data; } catch (_e) { return null; }
        const f = (det.detectOuterFrameRobust || det.detectOuterFrame)(det.toGray(data, w, h), w, h);
        if (!f) return null;
        const dims = getFloorPlanDisplayDims();
        const sx = (dims.w || nw) / w, sy = (dims.h || nh) / h;
        // 선 두께 바깥쪽 끝을 그림 좌표로
        return Object.assign({}, f, { left: f.left * sx, right: (f.right + 1) * sx, top: f.top * sy, bottom: (f.bottom + 1) * sy });
    }

    async function proposeCadFrameCorners() {
        const calib = window.cadCalibrationState;
        if (!calib || calib.step !== 1 || calib.pt1) return;
        const det = window.BSA && window.BSA.shared && window.BSA.shared.cadFrameDetect;
        const frame = detectCadFrameOnCurrentFloor();
        if (!frame || !det) {
            window.showToast?.('도면 테두리를 자동으로 찾지 못했습니다. 기준점 두 곳을 직접 클릭해 주세요.', 'info', 4000);
            return;
        }
        const pair = det.matchCadRefsToFrame(frame, calib.data && calib.data.refPoint1, calib.data && calib.data.refPoint2);
        if (!pair) return;
        calib.proposal = pair;
        drawCanvas();
        const pick = await window.appChoose(
            `도면 테두리(가장 바깥 사각형) 모서리를 찾았습니다(신뢰도 ${Math.round(frame.confidence * 100)}%).\n`
            + '화면의 주황 표시 두 곳이 캐드 기준점 1·2와 같은 자리면 「이 자리로」를 누르세요.\n'
            + '다르면 「직접 찍기」로 두 곳을 클릭하면 됩니다. 들인 뒤에도 아래 막대로 위치를 다듬을 수 있습니다.',
            [
                { label: '이 자리로', detail: '기준점 1 → 2 순서로 테두리 모서리 사용' },
                { label: '직접 찍기', detail: '도면에서 두 곳을 클릭' }
            ],
            { title: '캐드 기준점 자동 찾기', okText: '선택', defaultIndex: 0 }
        );
        const cur = window.cadCalibrationState;
        if (!cur || cur !== calib) return;
        cur.proposal = null;
        if (pick === 0 && cur.step === 1 && !cur.pt1) {
            cur.pt1 = pair[0];
            cur.pt2 = pair[1];
            cur.step = 2;
            finishCad2PointCalibration();
            return;
        }
        drawCanvas();
    }

    /** CAD JSON 글을 지금 층에 불러오기 — 파일 고르기·바탕화면 바로 읽기가 같은 검사·흐름을 쓴다 */
    function processCadJsonText(text) {
        if (!state.currentBuildingId || !state.currentFloor) {
            window.showToast?.('먼저 점검할 대상 건축물과 층을 선택해 주세요.', 'warning', 3500);
            return false;
        }
        const bldg = state.currentBuilding || (state.buildings || []).find(b => b.id === state.currentBuildingId);
        const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.defects) state.defects = {};
        if (!state.defects[floorKey]) state.defects[floorKey] = [];
        const parsed = window.BSA.cadDesktopImport.parseCadJson(text);
        if (!parsed.ok) { alert(parsed.error); return false; }
        try {
            startCad2PointCalibration(parsed.data, floorKey, bldg);
        } catch (err) {
            console.error('[importCadPinsJson Error]', err);
            alert('캐드 JSON 파일을 불러오는 중 오류가 발생했습니다:\n' + err.message);
            return false;
        }
        return true;
    }

    window.importCadPinsJson = function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (!state.currentBuildingId || !state.currentFloor) {
            window.showToast?.('먼저 점검할 대상 건축물과 층을 선택해 주세요.', 'warning', 3500);
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            try { processCadJsonText(e.target.result); } finally { event.target.value = ''; }
        };
        reader.readAsText(file);
    };

    // ── 바탕화면 cad_defects_import.json 바로 불러오기(2026-10-20) ──────────────
    // 2026-10-21 웹에서 쓰던 바탕화면 폴더 손잡이(File System Access)는 더 쓰지 않는다 — 남은 것을 지운다
    const CAD_DESKTOP_DIR_KEY = 'cadDesktopDirHandle';
    try { Promise.resolve(localBackupDelete(CAD_DESKTOP_DIR_KEY)).catch(() => {}); } catch (_e) { /* ignore */ }
    function cadPickFileFallback(msg) {
        if (msg) window.showToast?.(msg, 'info', 5000);
        const inp = document.getElementById('inputImportCadPins');
        if (inp) inp.click();
    }
    function cadTargetLabel() {
        const bldg = state.currentBuilding || (state.buildings || []).find(b => b.id === state.currentBuildingId);
        const name = String((bldg && bldg.name) || '').replace(/^🏢\s*/, '');
        const fl = (typeof window.getFloorLabelFromCode === 'function') ? window.getFloorLabelFromCode(state.currentFloor) : state.currentFloor;
        return `${name} · ${fl}`;
    }
    /** 읽은 파일을 바로 불러오고, 저장 시각·개수는 작은 알림으로만(2026-10-20 「더 번거로워졌어」 → 확인창 없앰) */
    function cadLoadDesktopText(text, mtime, where) {
        const parsed = window.BSA.cadDesktopImport.parseCadJson(text);
        if (!parsed.ok) { alert(parsed.error); return; }
        const when = mtime ? new Date(mtime).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        window.showToast?.(`📐 ${where} cad_defects_import.json${when ? ` (${when})` : ''} · 결함 ${parsed.count}개`, 'info', 3500);
        processCadJsonText(text);
    }
    async function cadImportFromDesktop() {
        if (!state.currentBuildingId || !state.currentFloor) {
            window.showToast?.('먼저 점검할 대상 건축물과 층을 선택해 주세요.', 'warning', 3500);
            return;
        }
        const C = window.BSA && window.BSA.cadDesktopImport;
        // 1) PC 앱(Electron, preload 다리로 판별) — 바탕화면을 바로 읽는다(권한 묻기 없음)
        if (C && C.hasDesktopBridge(window)) {
            let res = null;
            try { res = await window.bsaDesktop.readCadImportJson(); } catch (e) { console.warn('[CAD] 바탕화면 읽기 실패', e); }
            if (!res || !res.found) { cadPickFileFallback('바탕화면에 cad_defects_import.json이 없어 파일 창을 엽니다.'); return; }
            cadLoadDesktopText(res.text, res.mtime, '바탕화면');
            return;
        }
        // 2) 웹·Chrome·모바일(2026-10-21): 바탕화면 바로 읽기는 PC 앱에서만 — 지금처럼 파일 창
        cadPickFileFallback();
    }
    window.cadImportFromDesktop = cadImportFromDesktop;

    const btnImportCadPins = document.getElementById('btnImportCadPins');
    const inputImportCadPins = document.getElementById('inputImportCadPins');
    
    /**
     * 「내용 비우기 (핀 위치 유지)」(2026-10-20): 지금 층(이 동·이번 회차) 마킹의 결함 내용만 비운다.
     * 핀·박스·지시선·번호·영역은 그대로. 이번 회차 사진은 떼기만(파일은 남김 — 되돌리기로 다시 붙음).
     * 칸 시각(fieldAt)·사진 기록(photoState)을 찍어 서버의 옛 내용이 동기화로 되돌아오지 않게 한다.
     */
    async function clearDefectContentsOnFloor() {
        if (!state.currentBuildingId || !state.currentFloor) {
            window.showToast?.('먼저 점검할 대상 건축물과 층을 선택해 주세요.', 'warning', 3500);
            return;
        }
        const C = window.BSA && window.BSA.defectContentClear;
        if (!C) return;
        const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
        const list = (state.defects && state.defects[floorKey]) || [];
        const clearOpts = { emptyLocation: composeDefectLocation('', state.currentFloor) };
        const targets = list.filter((d) => d && C.hasContent(d, clearOpts));
        if (!targets.length) { window.showToast?.('이 층에는 비울 결함 내용이 없습니다.', 'info', 3000); return; }
        const photoN = targets.reduce((s, d) => s + C.currentPhotoCount(d), 0);
        const bldg = state.currentBuilding || (state.buildings || []).find((b) => b.id === state.currentBuildingId);
        const fl = (typeof window.getFloorLabelFromCode === 'function') ? window.getFloorLabelFromCode(state.currentFloor) : state.currentFloor;
        const name = String((bldg && bldg.name) || '').replace(/^🏢\s*/, '');
        const ok = await window.appConfirm(
            `${name} · ${fl}\n마킹 ${targets.length}개의 결함 내용을 비웁니다.\n` +
            `(종류·부재·원인·크기·개수·비고·진행 표시·상세위치${photoN ? ` · 이번 회차 사진 ${photoN}장 떼기` : ''})\n\n` +
            '핀·박스·지시선·번호·행·열 위치는 그대로이고, 이전 회차 사진·다른 층·다른 동은 건드리지 않습니다.\n되돌리기(Ctrl+Z)로 돌아갈 수 있습니다.',
            { title: '내용 비우기 (핀 위치 유지)', okText: `${targets.length}개 비우기`, danger: true }
        );
        if (!ok) return;
        let snaps = [];
        if (typeof snapshotBeforeBulkOp === 'function') {
            try { snaps = await snapshotBeforeBulkOp('내용 비우기', [floorKey]); } catch (_e) { snaps = []; }
        }
        pushDefectHistory();
        let n = 0;
        targets.forEach((d) => {
            const photoCount = C.currentPhotoCount(d);
            const beforeIds = photoCount ? defectPhotoIdList(d, photoCount) : [];
            const changed = C.clearContentFields(d, clearOpts);
            if (changed) touchDefectUpdatedAt(d);
            if (photoCount) {
                C.unlinkCurrentPhotos(d, beforeIds);
                recordDefectPhotoState(d, beforeIds, []);
                stampDefectPhotosChangedIfSafe(d);
                if (!changed) d.updatedAt = bsaStampAfter(d.updatedAt);
            }
            n++;
        });
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
        saveStateToLocalStorage();
        if (typeof recordAfterBulkOp === 'function') recordAfterBulkOp(snaps);
        refreshAfterDefectNumberChange();
        window.showToast?.(`마킹 ${n}개의 내용을 비웠습니다(핀 위치 유지). 되돌리기: Ctrl+Z`, 'success', 5000);
    }
    window.clearDefectContentsOnFloor = clearDefectContentsOnFloor;

    // ---- 2026-10-28 「내용 비우기」 → 이 층만 / 전체 층 / 취소 선택 ----
    // 버튼은 먼저 범위를 묻는다(앱 모달 appChoose, 취소 = 아무것도 안 함). 이 층만 = 위 clearDefectContentsOnFloor 그대로.
    // 전체 층 = 이 건물(이번 회차·이 동)의 모든 층(층 목록은 「전체층 상세위치 지우기」와 같은 계획 함수를 재사용 —
    // 건물 층 목록 ∪ 기기 메모리의 이 건물 키). 서버를 따로 읽지 않는다. 확인창을 기다리는 사이 동기화가 목록을
    // 새 객체로 바꿔 끼울 수 있어 확인·백업 뒤에 목록을 다시 읽어 적용하고, 되돌리기는 한 번에 모든 층이 돌아간다.
    // 비우는 칸·보존하는 것은 「이 층만」과 같다(핀·박스·지시선·번호·이전 회차 사진·위치 칸은 그대로).
    const DEFECT_CONTENT_CLEAR_FIELDS_TEXT = '종류·부재·원인·크기·폭·길이·개수·비고·진행 표시·상세위치';

    /** 읽기만 하는 계획: 층마다 { fc, key, label, total, targets, photoN } + 합계 */
    function planClearContentsForAllFloors(bldgId) {
        const C = window.BSA && window.BSA.defectContentClear;
        const id = bldgId || state.currentBuildingId;
        const out = { bldgId: id, floors: [], floorCount: 0, targetFloors: 0, targetCount: 0, photoCount: 0 };
        if (!id || !C) return out;
        const base = planClearDetailForAllFloors(id); // 층 목록만 빌려 쓴다(대상 판정은 아래에서 내용 기준으로 다시)
        base.floors.forEach((f) => {
            const list = Array.isArray(state.defects && state.defects[f.key]) ? state.defects[f.key] : [];
            const targets = list.filter((d) => d && C.hasContent(d, { emptyLocation: composeDefectLocation('', f.fc) }));
            const photoN = targets.reduce((s, d) => s + C.currentPhotoCount(d), 0);
            out.floors.push({ fc: f.fc, key: f.key, label: f.label, total: list.length, targets, photoN });
            if (targets.length) { out.targetFloors += 1; out.targetCount += targets.length; out.photoCount += photoN; }
        });
        out.floorCount = out.floors.length;
        return out;
    }

    /** 한 마킹의 내용 비우기(이 층만과 같은 처리) */
    function applyDefectContentClearTo(d, C, fc) {
        const photoCount = C.currentPhotoCount(d);
        const beforeIds = photoCount ? defectPhotoIdList(d, photoCount) : [];
        const changed = C.clearContentFields(d, { emptyLocation: composeDefectLocation('', fc) });
        if (changed) touchDefectUpdatedAt(d);
        if (photoCount) {
            C.unlinkCurrentPhotos(d, beforeIds);
            recordDefectPhotoState(d, beforeIds, []);
            stampDefectPhotosChangedIfSafe(d);
            if (!changed) d.updatedAt = bsaStampAfter(d.updatedAt);
        }
    }

    function describeBuildingForClear(bldgId) {
        const bldg = (state.buildings || []).find((b) => b && b.id === bldgId) || state.currentBuilding;
        const dong = (bldg && typeof getBuildingDongLabel === 'function') ? String(getBuildingDongLabel(bldg) || '').trim() : '';
        const nm = String((bldg && bldg.name) || '이 건물').replace(/^🏢\s*/, '');
        return `${nm}${dong && nm.indexOf(dong) < 0 ? ` ${dong}` : ''}`;
    }

    async function clearDefectContentsForAllFloors(bId) {
        const C = window.BSA && window.BSA.defectContentClear;
        if (!C) return;
        const plan0 = planClearContentsForAllFloors(bId);
        if (!plan0.targetCount) { window.showToast?.(`비울 결함 내용이 없습니다. (${plan0.floorCount}개 층 확인)`, 'info', 3000); return; }
        const shown = plan0.floors.filter((f) => f.targets.length);
        const lines = shown.slice(0, 8).map((f) => `  · ${f.label}: ${f.targets.length}개`).join('\n') + (shown.length > 8 ? `\n  · 외 ${shown.length - 8}개 층` : '');
        const ok = await window.appConfirm(
            `「${describeBuildingForClear(bId)}」 건물의 모든 층(${plan0.floorCount}개 층 확인)에서\n` +
            `마킹 ${plan0.targetCount}개 · ${plan0.targetFloors}개 층의 결함 내용을 비웁니다.\n${lines}\n\n` +
            `(${DEFECT_CONTENT_CLEAR_FIELDS_TEXT}${plan0.photoCount ? ` · 이번 회차 사진 ${plan0.photoCount}장 떼기` : ''})\n\n` +
            '핀·박스·지시선·번호·행·열 위치는 그대로이고, 이전 회차 사진·다른 동은 건드리지 않습니다.\n' +
            '이 층 화면에서 되돌리기(Ctrl+Z) 한 번으로 전체 층을 취소할 수 있습니다.',
            { title: '내용 비우기 — 전체 층', okText: `전체 ${plan0.targetCount}개 비우기`, danger: true }
        );
        if (!ok) return;
        if (state.currentBuildingId !== bId) { window.showToast?.('건물이 바뀌어 비우지 않았습니다. 다시 시도하세요.', 'warning', 3000); return; }
        // 작업 전 자동 백업(층마다) — 확인 뒤 목록을 다시 읽어 그 층들로
        const keys0 = planClearContentsForAllFloors(bId).floors.filter((f) => f.targets.length).map((f) => f.key);
        let snaps = [];
        if (typeof snapshotBeforeBulkOp === 'function' && keys0.length) {
            try { snaps = await snapshotBeforeBulkOp('내용 비우기(전체 층)', keys0); } catch (_e) { snaps = []; }
        }
        if (state.currentBuildingId !== bId) { window.showToast?.('건물이 바뀌어 비우지 않았습니다. 다시 시도하세요.', 'warning', 3000); return; }
        // 확인창·백업을 기다리는 사이 동기화가 층 결함을 새 객체로 바꿔 끼울 수 있다 — 적용 직전에 다시 읽는다
        const plan = planClearContentsForAllFloors(bId);
        if (!plan.targetCount) { window.showToast?.('비울 결함 내용이 이미 없습니다.', 'info', 2500); return; }
        const curKey = `${bId}_${state.currentFloor}`;
        const hit = plan.floors.filter((f) => f.targets.length);
        pushDefectHistory(hit.filter((f) => f.key !== curKey).map((f) => f.key)); // 한 번에 모든 층 되돌리기
        let n = 0;
        hit.forEach((f) => { f.targets.forEach((d) => { applyDefectContentClearTo(d, C, f.fc); n++; }); });
        if (typeof markFloorKeyDirty === 'function') hit.forEach((f) => markFloorKeyDirty(f.key));
        saveStateToLocalStorage();
        if (typeof recordAfterBulkOp === 'function') recordAfterBulkOp(snaps);
        refreshAfterDefectNumberChange();
        window.showToast?.(`전체 ${hit.length}개 층 마킹 ${n}개의 내용을 비웠습니다(핀 위치 유지). 되돌리기: Ctrl+Z`, 'success', 5000);
    }
    window.clearDefectContentsForAllFloors = clearDefectContentsForAllFloors;

    /** 「내용 비우기」 버튼: 범위(이 층만 / 전체 층 / 취소)를 묻고 그 동작을 한다 */
    async function clearDefectContentsChooseScope() {
        if (!state.currentBuildingId || !state.currentFloor) {
            window.showToast?.('먼저 점검할 대상 건축물과 층을 선택해 주세요.', 'warning', 3500);
            return;
        }
        const C = window.BSA && window.BSA.defectContentClear;
        if (!C) return;
        const bId = state.currentBuildingId;
        const floorKey = `${bId}_${state.currentFloor}`;
        const here = ((state.defects && state.defects[floorKey]) || []).filter((d) => d && C.hasContent(d, { emptyLocation: composeDefectLocation('', state.currentFloor) }));
        const all = planClearContentsForAllFloors(bId);
        if (!here.length && !all.targetCount) { window.showToast?.(`비울 결함 내용이 없습니다. (${all.floorCount || 1}개 층 확인)`, 'info', 3000); return; }
        // 다른 층에는 비울 것이 없으면 물을 필요가 없다 → 이 층만 (기존 흐름)
        if (here.length && all.targetCount === here.length) { await clearDefectContentsOnFloor(); return; }
        const fl = String((typeof window.getFloorLabelFromCode === 'function') ? window.getFloorLabelFromCode(state.currentFloor) : state.currentFloor).replace(/\s*\([^)]*\)\s*$/, '');
        const choices = [];
        if (here.length) choices.push({ key: 'floor', label: `이 층만 (${fl})`, detail: `마킹 ${here.length}개` });
        choices.push({ key: 'all', label: `전체 층 (${all.floorCount}개 층 확인)`, detail: `마킹 ${all.targetCount}개 · ${all.targetFloors}개 층` });
        const idx = await window.appChoose(
            `「${describeBuildingForClear(bId)}」\n내용을 비울 범위를 고르세요.\n` +
            `비우는 칸: ${DEFECT_CONTENT_CLEAR_FIELDS_TEXT} (이번 회차 사진은 떼기만)\n` +
            '핀·박스·지시선·번호·위치 칸은 그대로입니다.' + (here.length ? '' : `\n(이 층 ${fl}에는 비울 내용이 없습니다)`),
            choices.map((c) => ({ label: c.label, detail: c.detail })),
            { title: '내용 비우기 (핀 위치 유지)', okText: '다음', defaultIndex: 0 }
        );
        if (idx == null || !choices[idx]) return;
        if (choices[idx].key === 'floor') await clearDefectContentsOnFloor();
        else await clearDefectContentsForAllFloors(bId);
    }
    window.clearDefectContentsChooseScope = clearDefectContentsChooseScope;
    document.getElementById('btnClearDefectContents')?.addEventListener('click', () => {
        clearDefectContentsChooseScope().catch((e) => { console.warn('[내용 비우기] 실패', e); window.showToast?.('내용 비우기에 실패했습니다: ' + (e && e.message), 'error', 5000); });
    });

    // 2026-10-23 당긴 직후 진행 중이던 동기화가 옛 번호를 다시 얹으면 빈 칸이 되살아나 여러 번 눌러야 했다 —
    // 잠시 뒤 같은 층에 빈 칸이 다시 보이면 조용히 한 번 더 당긴다(최대 3번).
    function scheduleCompactGapsRecheck(key) {
        [1200, 3500, 8000].forEach((ms) => setTimeout(() => {
            try {
                if (key !== `${state.currentBuildingId}_${state.currentFloor}`) return;
                const list = getFloorDefectsForNumbering(key);
                if (!list.length || !findDefectMarkingNumberGaps(list).length) return;
                const poolKeys = Object.keys(state.defects || {}).filter((k) => {
                    const arr = state.defects[k];
                    return Array.isArray(arr) && arr.some((d) => list.indexOf(d) >= 0);
                });
                const r = compactDefectMarkingNumberGaps(list);
                if (!r || (!r.moved && !r.healed)) return;
                poolKeys.concat([key]).forEach((k) => {
                    const arr = state.defects[k] || [];
                    if (arr.some((d) => d && d._numberChanged) && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(k);
                    arr.forEach((d) => {
                        if (d && d._numberChanged) {
                            delete d._numberChanged;
                            if (typeof journalDefectChange === 'function') journalDefectChange('edit', d, k);
                        }
                    });
                });
                saveStateToLocalStorage();
                refreshAfterDefectNumberChange();
            } catch (e) { console.warn('[빈칸 당기기] 재확인 실패', e); }
        }, ms));
    }

    const btnCompactMarkingGaps = document.getElementById('btnCompactMarkingGaps');
    if (btnCompactMarkingGaps) {
        btnCompactMarkingGaps.addEventListener('click', async () => {
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            let list = getFloorDefectsForNumbering(key);
            const exteriorPool = (typeof isExteriorFloorCode === 'function')
                ? isExteriorFloorCode(state.currentFloor)
                : (typeof window.isExteriorFloorCode === 'function' && window.isExteriorFloorCode(state.currentFloor));
            if (!list.length) {
                if (typeof window.showToast === 'function') window.showToast(exteriorPool ? '외부 입면에 마킹이 없습니다.' : '현재 층에 마킹이 없습니다.', 'warning');
                return;
            }
            const confirmMsg = exteriorPool
                ? '외부 도면(외부1·2·…) 전체를 한 번호로 보고 빈 칸을 뒤에서부터 앞으로 땡길까요?\n(한 도면의 빈 번호는 다른 외부 도면에 있을 수 있습니다.)'
                : '현재 층의 마킹번호 빈 칸을 뒤에서부터 앞으로 땡길까요?\n(예: 1번 삭제 후 2,3,4 → 1,2,3 / 14,15,17,18 → 14,15,16,17)';
            if (!await window.appConfirm(confirmMsg)) return;
            // 2026-10-23 확인창을 기다리는 사이 동기화가 층 결함을 새 객체로 바꿔 끼우면, 확인 전에 잡아 둔 목록을 고쳐도
            // 화면·저장에 안 남아 두세 번 눌러야 됐다 — 확인 뒤 목록을 다시 읽는다.
            list = getFloorDefectsForNumbering(key);
            // 외부 입면처럼 여러 도면이 한 번호 공간이면 그 층들을 모두 한 되돌리기 기록에 담는다
            const poolKeys = Object.keys(state.defects || {}).filter((k) => {
                const arr = state.defects[k];
                return Array.isArray(arr) && arr.some((d) => list.indexOf(d) >= 0);
            });
            if (typeof pushDefectHistory === 'function') pushDefectHistory(poolKeys);
            const result = compactDefectMarkingNumberGaps(list);
            if (!result || (!result.moved && !result.healed)) {
                if (typeof window.showToast === 'function') window.showToast('채울 빈 번호가 없습니다.', 'info');
                return;
            }
            poolKeys.concat([key]).forEach((k) => {
                const arr = state.defects[k] || [];
                if (arr.some((d) => d && d._numberChanged) && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(k);
                arr.forEach((d) => {
                    if (d && d._numberChanged) {
                        delete d._numberChanged;
                        if (typeof journalDefectChange === 'function') journalDefectChange('edit', d, k);
                    }
                });
            });
            if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
                discardStalePendingRemoteAfterLocalPinEdit();
            }
            saveStateToLocalStorage();
            refreshAfterDefectNumberChange();
            scheduleCompactGapsRecheck(key);
            if (typeof window.showToast === 'function') {
                window.showToast(result.moved
                    ? `마킹번호 ${result.moved}개 이동: ${result.before} → ${result.after}`
                    : `도면 번호 ${result.healed}개를 표 번호에 맞췄습니다.`, 'success', 4500);
            }
        });
    }

    const btnConvertDefectShape = document.getElementById('btnConvertDefectShape');
    if (btnConvertDefectShape) {
        btnConvertDefectShape.addEventListener('click', async () => {
            const pinId = document.getElementById('defectPinId')?.value;
            if (!pinId || !state.currentBuildingId) {
                window.showToast?.('저장된 마킹만 형태를 바꿀 수 있습니다.', 'warning');
                return;
            }
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            const list = (state.defects && state.defects[key]) || [];
            const defect = list.find((d) => d && d.id === pinId);
            if (!defect) {
                window.showToast?.('마킹을 찾을 수 없습니다.', 'warning');
                return;
            }
            const mode = btnConvertDefectShape.dataset.mode || 'to-area';
            const toArea = mode === 'to-area';
            const msg = toArea
                ? '이 핀 마킹을 영역(사각형) 마킹으로 바꿀까요?\n(중심 tip 기준으로 기본 영역이 생깁니다. 이후 크기·위치는 도면에서 조절하세요.)'
                : '이 영역 마킹을 핀(화살표) 마킹으로 바꿀까요?\n(영역 중심이 tip이 됩니다.)';
            if (!await window.appConfirm(msg)) return;
            if (typeof pushDefectHistory === 'function') pushDefectHistory();
            const ok = toArea ? convertDefectPinToArea(defect) : convertDefectAreaToPin(defect);
            if (!ok) {
                window.showToast?.('형태 변경에 실패했습니다.', 'error');
                return;
            }
            if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
                discardStalePendingRemoteAfterLocalPinEdit();
            }
            // 모달 pending 좌표/영역 동기화
            if (toArea) {
                window._pendingAreaRect = {
                    x1: defect.areaX1, y1: defect.areaY1,
                    x2: defect.areaX2, y2: defect.areaY2,
                    areaShape: defect.areaShape || 'rect',
                    areaAngle: defect.areaAngle || 0,
                    areaPoints: defect.areaPoints
                };
            } else {
                window._pendingAreaRect = null;
            }
            window._pendingPinCoords = {
                x: defect.x, y: defect.y,
                targetX: defect.targetX, targetY: defect.targetY
            };
            saveStateToLocalStorage();
            if (typeof setDefectAreaStylePanelVisible === 'function') {
                setDefectAreaStylePanelVisible(!!toArea, defect);
            }
            if (toArea && typeof syncDefectAreaStyleUi === 'function') {
                syncDefectAreaStyleUi(defect.areaFillStyle || 'solid', defect.areaBorderStyle || 'solid');
            }
            const titleEl2 = document.getElementById('defectModalTitle');
            if (titleEl2) titleEl2.textContent = toArea ? '⬚ 결함 영역 수정' : '📍 결함 핀 수정';
            syncDefectShapeConvertButton(defect);
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderSurveyTable === 'function') renderSurveyTable();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            window.showToast?.(toArea ? '영역 마킹으로 변경했습니다.' : '핀 마킹으로 변경했습니다.', 'success');
        });
    }

    document.querySelectorAll('[data-area-shape-convert]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            const targetShape = btn.getAttribute('data-area-shape-convert');
            const pinId = document.getElementById('defectPinId')?.value;
            if (!pinId || !state.currentBuildingId) {
                window.showToast?.('저장된 마킹만 모양을 바꿀 수 있습니다.', 'warning');
                return;
            }
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            const list = (state.defects && state.defects[key]) || [];
            const defect = list.find((d) => d && d.id === pinId);
            if (!defect) {
                window.showToast?.('마킹을 찾을 수 없습니다.', 'warning');
                return;
            }
            const wasArea = defect.shapeType === 'area' && defect.areaX1 !== undefined;
            const wantShape = normalizeAreaShape(targetShape);
            if (!wasArea && isPolyPointAreaShape(wantShape)) {
                // 일반(핀) 마킹 → 다각형·선: 입력창 내용을 저장하고 도면에 점을 찍어 그린다(번호·사진·내용 유지)
                if (window._defectAutoApplyTimer) {
                    window.clearTimeout(window._defectAutoApplyTimer);
                    window._defectAutoApplyTimer = null;
                }
                if (typeof commitDefectFromForm === 'function' && isDefectModalOpen()) {
                    try {
                        await commitDefectFromForm({
                            pushHistory: !window._defectEditSessionHistoryPushed,
                            uploadPhotos: !!window._defectPhotosDirty
                        });
                        window._defectEditSessionHistoryPushed = true;
                    } catch (_e) { /* 그리기는 계속 */ }
                }
                closeDefectModal({ discardPending: true });
                startAreaPolygonRedraw(defect, wantShape, { fromPin: true });
                return;
            }
            if (typeof pushDefectHistory === 'function') pushDefectHistory();
            let ok;
            if (!wasArea) {
                // 핀 → 네모/타원 영역
                ok = convertDefectPinToArea(defect);
                if (ok && wantShape !== 'rect') ok = convertDefectAreaShape(defect, wantShape);
            } else {
                ok = convertDefectAreaShape(defect, targetShape);
            }
            if (!ok) {
                window.showToast?.('모양 변경에 실패했습니다.', 'error');
                return;
            }
            if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
                discardStalePendingRemoteAfterLocalPinEdit();
            }
            window._pendingAreaRect = {
                x1: defect.areaX1, y1: defect.areaY1,
                x2: defect.areaX2, y2: defect.areaY2,
                areaShape: defect.areaShape || 'rect',
                areaAngle: defect.areaAngle || 0,
                areaPoints: defect.areaPoints
            };
            window._pendingPinCoords = {
                x: defect.x, y: defect.y,
                targetX: defect.targetX, targetY: defect.targetY
            };
            saveStateToLocalStorage();
            if (typeof setDefectAreaStylePanelVisible === 'function') {
                setDefectAreaStylePanelVisible(true, defect);
            }
            const angEl = document.getElementById('defectAreaAngle');
            if (angEl) angEl.value = String(Math.round(Number(defect.areaAngle) || 0));
            if (!wasArea) {
                if (typeof syncDefectAreaStyleUi === 'function') syncDefectAreaStyleUi(defect.areaFillStyle || 'solid', defect.areaBorderStyle || 'solid');
                const titleElConv = document.getElementById('defectModalTitle');
                if (titleElConv) titleElConv.textContent = '⬚ 결함 영역 수정';
            }
            syncDefectShapeConvertButton(defect);
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderSurveyTable === 'function') renderSurveyTable();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            window.showToast?.(`${areaShapeConvertPhrase(targetShape)} 변경했습니다.`, 'success');
        });
    });

    const btnRedrawDefectPolygon = document.getElementById('btnRedrawDefectPolygon');
    if (btnRedrawDefectPolygon) {
        btnRedrawDefectPolygon.addEventListener('click', async () => {
            const pinId = document.getElementById('defectPinId')?.value;
            if (!pinId || !state.currentBuildingId) {
                window.showToast?.('저장된 영역 마킹만 다시 그릴 수 있습니다.', 'warning');
                return;
            }
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            const list = (state.defects && state.defects[key]) || [];
            const defect = list.find((d) => d && d.id === pinId);
            if (!defect || !(defect.shapeType === 'area' && defect.areaX1 !== undefined)) {
                window.showToast?.('영역 마킹만 다각형을 다시 그릴 수 있습니다.', 'warning');
                return;
            }
            if (window._defectAutoApplyTimer) {
                window.clearTimeout(window._defectAutoApplyTimer);
                window._defectAutoApplyTimer = null;
            }
            if (typeof commitDefectFromForm === 'function' && isDefectModalOpen()) {
                try {
                    await commitDefectFromForm({
                        pushHistory: !window._defectEditSessionHistoryPushed,
                        uploadPhotos: !!window._defectPhotosDirty
                    });
                    window._defectEditSessionHistoryPushed = true;
                } catch (_e) { /* 기하 다시그리기는 계속 */ }
            }
            closeDefectModal({ discardPending: true });
            startAreaPolygonRedraw(defect, getAreaShape(defect) === 'polyline' ? 'polyline' : 'polygon');
        });
    }

    if (btnImportCadPins && inputImportCadPins) {
        // 바탕화면 cad_defects_import.json 이 있으면 파일 창 없이 바로(없거나 못 읽으면 지금처럼 파일 창)
        btnImportCadPins.addEventListener('click', () => { cadImportFromDesktop().catch((e) => { console.warn('[CAD] 바탕화면 불러오기 실패', e); inputImportCadPins.click(); }); });
        inputImportCadPins.addEventListener('change', window.importCadPinsJson);
    }

