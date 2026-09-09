/* 탭: 통계 — 층별·전체·층묶음 결함 종류 집계 */
window.BSA = window.BSA || { tabs: {}, shared: {} };

(function () {
    var statsView = 'floor';
    var statsBound = false;
    var selectedComponentGroup = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseDefectTypeList(raw) {
        return String(raw == null ? '' : raw)
            .split(/[,，]+/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
    }

    // 경사균열/수직균열/수평균열/망상균열/U자형균열은 통계에서 "균열"로 통합 집계
    var CRACK_KIND_SET = { '수직균열': true, '수평균열': true, '경사균열': true, '망상균열': true, 'U자형균열': true };
    function normalizeTypeLabel(t) {
        return CRACK_KIND_SET[t] ? '균열' : t;
    }

    var COMPONENT_GROUP_ORDER = [
        { key: 'column', label: '기둥', sort: 1 },
        { key: 'bigBeam', label: '큰보', sort: 2 },
        { key: 'smallBeam', label: '작은보', sort: 3 },
        { key: 'upperBeam', label: '상부 보', sort: 4 },
        { key: 'slab', label: '슬래브', sort: 5 },
        { key: 'rcWall', label: 'RC벽체', sort: 6 },
        { key: 'masonryWall', label: '조적벽체', sort: 7 },
        { key: 'other', label: '기타 부재', sort: 99 }
    ];
    function classifyComponentGroup(component) {
        var key = String(component || '').replace(/\s+/g, '');
        if (!key) return 'other';
        if (key.indexOf('접합') >= 0) return 'other';
        if (key.indexOf('조적') >= 0) return 'masonryWall';
        if (key.indexOf('상부보') >= 0) return 'upperBeam';
        if (key.indexOf('큰보') >= 0) return 'bigBeam';
        if (key.indexOf('작은보') >= 0) return 'smallBeam';
        if (key.indexOf('슬래브') >= 0) return 'slab';
        if (key === 'RC벽체' || key === '벽체' || key === '내력벽') return 'rcWall';
        if (key.indexOf('기둥') >= 0) return 'column';
        return 'other';
    }

    /** 균열폭/길이 자유텍스트 한 조각에서 "폭"에 해당하는 숫자만 뽑는다.
     * 지원 표기: "Cw:0.4"(폭 라벨), "0.4mm"(단위 명시), "1.0/4.5"(폭/길이, 앞이 폭) */
    function extractWidthFromSegment(seg) {
        if (!seg) return null;
        var cwMatch = seg.match(/cw\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
        if (cwMatch) return parseFloat(cwMatch[1]);
        var mmMatch = seg.match(/(\d+(?:\.\d+)?)\s*(?:mm|㎜)/i);
        if (mmMatch) return parseFloat(mmMatch[1]);
        var slashMatch = seg.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
        if (slashMatch) return parseFloat(slashMatch[1]);
        var bareMatch = seg.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
        if (bareMatch) return parseFloat(bareMatch[1]);
        return null;
    }

    /** 균열폭 값 추출. crackWidth("0.15 / 0.20"처럼 여러 측정점의 폭을 슬래시로 이어붙인 값)가
     * 있으면 그대로 쓰고, 비어 있으면 균열폭/길이 분리 입력 이전 구버전 데이터(자유텍스트 size:
     * "Cw:0.4", "0.4mm", "1.0/4.5"(앞이 폭·뒤가 길이) 등)에서 폭만 뽑아본다. */
    function getCrackWidthNumbers(d) {
        var raw = String(d && d.crackWidth != null ? d.crackWidth : '').trim();
        if (raw) {
            return raw.split(/\s*[\/,]\s*/).map(function (part) {
                var n = parseFloat(String(part).replace(/[^\d.\-]/g, ''));
                return isNaN(n) ? null : n;
            }).filter(function (n) { return n != null; });
        }
        var sizeRaw = String(d && d.size != null ? d.size : '').trim();
        if (!sizeRaw) return [];
        return sizeRaw.split(/\s*,\s*/).map(extractWidthFromSegment).filter(function (n) {
            return n != null && !isNaN(n);
        });
    }

    function getSurveyRows(defects) {
        if (typeof window.getSurveyRowsForReport === 'function') {
            return window.getSurveyRowsForReport(defects || []);
        }
        var seen = {};
        return (defects || []).filter(function (d) {
            if (!d) return false;
            if (d.groupId) {
                if (seen[d.groupId]) return false;
                seen[d.groupId] = true;
            }
            return true;
        });
    }

    function shouldIncludeDefect(d, opts) {
        if (!d) return false;
        if (opts.excludeGood) {
            var types = parseDefectTypeList(d.defectType);
            // "접합부 상태양호"처럼 부재명과 붙여 쓴 경우도 상태양호로 인식해 제외한다
            if (!types.length || (types.length === 1 && String(types[0] || '').indexOf('상태양호') !== -1)) return false;
        }
        if (opts.currentRoundOnly && typeof window.isPreviousRoundDefect === 'function') {
            if (window.isPreviousRoundDefect(d)) return false;
        }
        return true;
    }

    function collectTypeCounts(rows) {
        var counts = {};
        rows.forEach(function (d) {
            var types = parseDefectTypeList(d.defectType);
            if (!types.length) {
                counts['(미입력)'] = (counts['(미입력)'] || 0) + 1;
                return;
            }
            types.forEach(function (t) {
                if (!t) return;
                var label = normalizeTypeLabel(t);
                counts[label] = (counts[label] || 0) + 1;
            });
        });
        return counts;
    }

    function sortedTypeKeys(allCounts) {
        var keys = Object.keys(allCounts);
        keys.sort(function (a, b) {
            var diff = (allCounts[b] || 0) - (allCounts[a] || 0);
            if (diff !== 0) return diff;
            return a.localeCompare(b, 'ko');
        });
        return keys;
    }

    function classifyFloorGroup(floorCode) {
        var c = String(floorCode || '').toUpperCase().trim();
        var raw = String(floorCode || '');
        if (/^B\d+F$/i.test(c) || raw.indexOf('지하') >= 0) {
            return { key: 'basement', label: '지하층', sort: 100 };
        }
        if (c === 'ROOF' || raw.indexOf('옥상') >= 0) {
            return { key: 'roof', label: '옥상층', sort: 9000 };
        }
        if (c === 'PH' || c === 'PH_ROOF' || raw.indexOf('옥탑') >= 0) {
            return { key: 'penthouse', label: '옥탑층', sort: 9100 };
        }
        if (c.indexOf('EXT') === 0 || raw.indexOf('외부') >= 0 || raw.indexOf('부대') >= 0) {
            return { key: 'external', label: '부대·외부', sort: 9200 };
        }
        var m = c.match(/^(\d+)F$/);
        if (m) {
            return { key: 'ground', label: '지상층', sort: 1000 + parseInt(m[1], 10), sub: m[1] + 'F' };
        }
        return { key: 'other', label: '기타', sort: 8000 };
    }

    function getCoarseFloorGroup(floorCode) {
        var info = classifyFloorGroup(floorCode);
        if (info.key === 'ground') return { key: 'ground_all', label: '지상층', sort: 2000 };
        if (info.key === 'basement') return { key: 'basement_all', label: '지하층', sort: 100 };
        if (info.key === 'roof' || info.key === 'penthouse') return { key: 'roof_all', label: '옥상·옥탑', sort: 9000 };
        if (info.key === 'external') return { key: 'external_all', label: '부대·외부', sort: 9100 };
        return { key: 'other_all', label: '기타', sort: 8000 };
    }

    function getFloorLabel(floorCode, bldg) {
        if (typeof window.getFloorLabelFromCode === 'function') {
            var floors = typeof window.getBuildingAvailableFloors === 'function'
                ? window.getBuildingAvailableFloors(bldg) : [];
            var hit = floors.find(function (f) { return f.floorCode === floorCode; });
            if (hit && hit.floorLabel) return hit.floorLabel;
            return window.getFloorLabelFromCode(floorCode);
        }
        return floorCode;
    }

    function buildStatsPayload(bldg, opts) {
        opts = opts || {};
        if (!bldg || !bldg.id) return null;
        var prefix = bldg.id + '_';
        var floorRows = [];
        var overallCounts = {};
        var totalRows = 0;
        var categoryCounts = { structural: 0, nonStructural: 0, finishing: 0, other: 0 };
        var componentCounts = {};

        var floors = typeof window.getBuildingAvailableFloors === 'function'
            ? window.getBuildingAvailableFloors(bldg) : [];
        if (typeof window.sortFloorsLowToHigh === 'function') {
            floors = window.sortFloorsLowToHigh(floors);
        }

        var floorCodes = floors.map(function (f) { return f.floorCode; });
        Object.keys(window.state.defects || {}).forEach(function (key) {
            if (key.indexOf(prefix) !== 0) return;
            var code = key.slice(prefix.length);
            if (floorCodes.indexOf(code) < 0) floorCodes.push(code);
        });
        if (typeof window.sortFloorsLowToHigh === 'function') {
            floorCodes = window.sortFloorsLowToHigh(floorCodes.map(function (c) {
                return { floorCode: c, floorLabel: getFloorLabel(c, bldg) };
            })).map(function (f) { return f.floorCode; });
        }

        floorCodes.forEach(function (floorCode) {
            var raw = window.state.defects[prefix + floorCode] || [];
            var rows = getSurveyRows(raw).filter(function (d) { return shouldIncludeDefect(d, opts); });
            var typeCounts = collectTypeCounts(rows);
            Object.keys(typeCounts).forEach(function (t) {
                overallCounts[t] = (overallCounts[t] || 0) + typeCounts[t];
            });
            var floorComponentCounts = {};
            var floorComponentCrackMax = {};
            rows.forEach(function (d) {
                var cat = d.category || '구조체';
                if (cat === '비구조체') categoryCounts.nonStructural += 1;
                else if (cat === '마감재') categoryCounts.finishing += 1;
                else if (cat === '구조체') categoryCounts.structural += 1;
                else categoryCounts.other += 1;
                var compGroup = classifyComponentGroup(d.component);
                componentCounts[compGroup] = (componentCounts[compGroup] || 0) + 1;
                floorComponentCounts[compGroup] = (floorComponentCounts[compGroup] || 0) + 1;
                getCrackWidthNumbers(d).forEach(function (w) {
                    var cur = floorComponentCrackMax[compGroup];
                    if (!cur || w > cur.value) {
                        floorComponentCrackMax[compGroup] = { value: w, id: d.id || '', no: d.no || d.groupNo || '' };
                    }
                });
            });
            totalRows += rows.length;
            floorRows.push({
                floorCode: floorCode,
                floorLabel: getFloorLabel(floorCode, bldg),
                rowCount: rows.length,
                typeCounts: typeCounts,
                componentCounts: floorComponentCounts,
                componentCrackMax: floorComponentCrackMax,
                coarseGroup: getCoarseFloorGroup(floorCode),
                zoneInfo: classifyFloorGroup(floorCode)
            });
        });

        var groupMap = {};
        floorRows.forEach(function (fr) {
            var g = fr.coarseGroup;
            if (!groupMap[g.key]) {
                groupMap[g.key] = {
                    key: g.key,
                    label: g.label,
                    sort: g.sort,
                    rowCount: 0,
                    typeCounts: {},
                    floors: []
                };
            }
            var bucket = groupMap[g.key];
            bucket.rowCount += fr.rowCount;
            bucket.floors.push(fr.floorLabel);
            Object.keys(fr.typeCounts).forEach(function (t) {
                bucket.typeCounts[t] = (bucket.typeCounts[t] || 0) + fr.typeCounts[t];
            });
        });

        var groupRows = Object.keys(groupMap).map(function (k) { return groupMap[k]; });
        groupRows.sort(function (a, b) { return a.sort - b.sort; });

        return {
            bldg: bldg,
            floorRows: floorRows,
            groupRows: groupRows,
            overallCounts: overallCounts,
            typeKeys: sortedTypeKeys(overallCounts),
            totalRows: totalRows,
            categoryCounts: categoryCounts,
            componentCounts: componentCounts,
            currentFloor: window.state.currentFloor
        };
    }

    function renderSummaryCards(payload, root) {
        if (!root || !payload) return;
        var cc = payload.categoryCounts;
        root.innerHTML = [
            { label: '조사 행 합계', value: payload.totalRows, cls: 'stats-card-total' },
            { label: '결함 종류', value: payload.typeKeys.length, cls: 'stats-card-types' },
            { label: '구조체', value: cc.structural, cls: 'stats-card-struct' },
            { label: '비구조체', value: cc.nonStructural, cls: 'stats-card-nonstruct' },
            { label: '마감재', value: cc.finishing, cls: 'stats-card-finish' }
        ].map(function (card) {
            return '<div class="stats-summary-card ' + card.cls + '"><span class="stats-summary-value">' + esc(card.value) + '</span><span class="stats-summary-label">' + esc(card.label) + '</span></div>';
        }).join('');
    }

    function renderMatrixTable(payload, view) {
        var head = document.getElementById('statsMatrixHead');
        var body = document.getElementById('statsMatrixBody');
        var title = document.getElementById('statsPanelTitle');
        if (!head || !body || !payload) return;

        var typeKeys = payload.typeKeys.slice(0, 16);
        var rowLabel = view === 'group' ? '층묶음' : (view === 'overall' ? '전체' : '층');
        if (title) {
            title.textContent = view === 'floor' ? '층별 결함 종류' : (view === 'group' ? '층묶음별 결함 종류' : '전체 결함 종류');
        }

        if (!typeKeys.length) {
            head.innerHTML = '<tr><th>' + esc(rowLabel) + '</th><th>건수</th></tr>';
            body.innerHTML = '<tr><td colspan="2" class="stats-empty">표시할 결함 데이터가 없습니다.</td></tr>';
            return;
        }

        head.innerHTML = '<tr><th>' + esc(rowLabel) + '</th><th>합계</th>' + typeKeys.map(function (t) {
            return '<th>' + esc(t) + '</th>';
        }).join('') + '</tr>';

        var rows = [];
        if (view === 'floor') rows = payload.floorRows;
        else if (view === 'group') rows = payload.groupRows;
        else {
            rows = [{
                label: '전체',
                rowCount: payload.totalRows,
                typeCounts: payload.overallCounts
            }];
        }

        body.innerHTML = rows.map(function (row) {
            var label = row.floorLabel || row.label;
            if (view === 'group' && row.floors && row.floors.length) {
                label = row.label + ' (' + row.floors.join(', ') + ')';
            }
            var isCurrent = view === 'floor' && row.floorCode === payload.currentFloor;
            var trCls = isCurrent ? ' class="stats-row-current"' : '';
            var cells = typeKeys.map(function (t) {
                var n = row.typeCounts[t] || 0;
                return '<td class="' + (n ? 'stats-cell-hit' : 'stats-cell-zero') + '">' + (n || '-') + '</td>';
            }).join('');
            return '<tr' + trCls + '><th scope="row">' + esc(label) + '</th><td class="stats-cell-sum">' + esc(row.rowCount) + '</td>' + cells + '</tr>';
        }).join('');
    }

    function renderComponentCrackPanel(payload, root) {
        if (!root || !payload) return;
        var counts = payload.componentCounts || {};
        var groups = COMPONENT_GROUP_ORDER;
        if (!selectedComponentGroup || !groups.some(function (g) { return g.key === selectedComponentGroup; })) {
            selectedComponentGroup = groups[0].key;
        }

        var chipsHtml = '<div class="chips-container stats-component-chips">' + groups.map(function (g) {
            var active = g.key === selectedComponentGroup ? ' active' : '';
            return '<button type="button" class="chip' + active + '" data-component-group="' + esc(g.key) + '">' + esc(g.label) + ' (' + (counts[g.key] || 0) + ')</button>';
        }).join('') + '</div>';

        var activeLabel = groups.filter(function (g) { return g.key === selectedComponentGroup; }).map(function (g) { return g.label; })[0] || '';
        var floorsWithData = payload.floorRows.filter(function (fr) {
            return (fr.componentCounts[selectedComponentGroup] || 0) > 0;
        });

        var tableHtml;
        if (!floorsWithData.length) {
            tableHtml = '<p class="stats-empty">' + esc(activeLabel) + ' 결함 데이터가 없습니다.</p>';
        } else {
            tableHtml = '<div class="table-responsive stats-table-wrap"><table class="data-table stats-component-crack-table"><thead><tr><th>층</th><th>최대 균열폭(mm)</th><th>결함 번호</th><th>건수</th></tr></thead><tbody>' +
                floorsWithData.map(function (fr) {
                    var info = fr.componentCrackMax[selectedComponentGroup];
                    var isCurrent = fr.floorCode === payload.currentFloor;
                    var trCls = isCurrent ? ' class="stats-row-current"' : '';
                    var widthCell = (info && info.value != null) ? info.value : '-';
                    var noCell = '-';
                    if (info && info.id) {
                        var noLabel = info.no ? String(info.no) : '보기';
                        noCell = '<button type="button" class="stats-defect-no-link" data-defect-id="' + esc(info.id) + '" data-floor-code="' + esc(fr.floorCode) + '">' + esc(noLabel) + '</button>';
                    }
                    return '<tr' + trCls + '><th scope="row">' + esc(fr.floorLabel) + '</th><td class="stats-cell-sum">' + widthCell + '</td><td>' + noCell + '</td><td class="' + (fr.componentCounts[selectedComponentGroup] ? 'stats-cell-hit' : 'stats-cell-zero') + '">' + (fr.componentCounts[selectedComponentGroup] || 0) + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        }

        root.innerHTML = '<h4 class="stats-bar-title">구조 부재별 층별 최대 균열폭</h4>' + chipsHtml + tableHtml;

        root.querySelectorAll('[data-component-group]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectedComponentGroup = btn.getAttribute('data-component-group');
                if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
            });
        });
        root.querySelectorAll('[data-defect-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                goToDefectOnMap(btn.getAttribute('data-floor-code'), btn.getAttribute('data-defect-id'));
            });
        });
    }

    /** 통계탭의 특정 결함을 결함위치도 작성 화면으로 이동해 선택 표시한다 */
    function goToDefectOnMap(floorCode, defectId) {
        if (!floorCode || !defectId || !window.state) return;
        if (window.state.currentFloor !== floorCode && typeof window.loadFloorDrawing === 'function') {
            window.loadFloorDrawing(floorCode);
        }
        if (typeof window.viewDefectOnMapFromSurvey === 'function') {
            window.viewDefectOnMapFromSurvey(defectId);
        } else if (typeof window.switchTab === 'function') {
            window.switchTab('tab-map');
        }
    }

    function updateHint(view, bldg) {
        var hint = document.getElementById('statsViewHint');
        if (!hint) return;
        var isPrecise = bldg && bldg.inspectionType === '정밀안전점검';
        if (view === 'group') {
            hint.textContent = isPrecise
                ? '정밀안전점검: 지하·지상·옥상·부대 등 층 구역별로 결함 종류를 묶어 봅니다.'
                : '층을 구역(지하·지상·옥상·부대)별로 묶어 결함 종류를 집계합니다.';
        } else if (view === 'floor') {
            hint.textContent = '각 층별 결함 종류 건수입니다. 현재 선택 층은 강조 표시됩니다.';
        } else {
            hint.textContent = '건물 전체 결함 종류 합계입니다.';
        }
    }

    function getStatsOptions() {
        return {
            excludeGood: !!document.getElementById('statsExcludeGood')?.checked,
            currentRoundOnly: !!document.getElementById('statsCurrentRoundOnly')?.checked
        };
    }

    window.renderDefectStatsTab = function () {
        var bldg = window.state.currentBuilding;
        var titleEl = document.getElementById('statsBuildingTitle');
        var metaEl = document.getElementById('statsBuildingMeta');
        if (titleEl) titleEl.textContent = bldg ? (bldg.name || '결함 통계') : '결함 통계';
        if (metaEl) {
            if (!bldg) metaEl.textContent = '건물을 선택하면 층별·전체 결함 통계를 볼 수 있습니다.';
            else {
                var parts = [bldg.facilityGrade, bldg.inspectionType, bldg.inspectionYear, bldg.inspectionPeriod].filter(Boolean);
                metaEl.textContent = parts.join(' · ');
            }
        }

        var payload = buildStatsPayload(bldg, getStatsOptions());
        renderSummaryCards(payload, document.getElementById('statsSummaryCards'));
        renderComponentCrackPanel(payload, document.getElementById('statsComponentSection'));
        renderMatrixTable(payload, statsView);
        updateHint(statsView, bldg);
    };

    function bindStatsControlsOnce() {
        if (statsBound) return;
        statsBound = true;
        document.querySelectorAll('[data-stats-view]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                statsView = btn.getAttribute('data-stats-view') || 'floor';
                document.querySelectorAll('[data-stats-view]').forEach(function (b) {
                    var on = b === btn;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                window.renderDefectStatsTab();
            });
        });
        ['statsExcludeGood', 'statsCurrentRoundOnly'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', function () { window.renderDefectStatsTab(); });
        });
    }

    window.BSA.tabs['tab-stats'] = {
        id: 'tab-stats',
        title: '통계',
        features: [
            '건물 전체 결함 종류 집계',
            '층별 결함 종류 표 (현재 선택 층 강조)',
            '층묶음 보기: 지하·지상·옥상·부대 구역별 집계',
            '전체 보기: 건물 합산 결함 종류',
            '정밀안전점검 시 층 구역 묶음 분석',
            '상태양호 제외 · 금회차만 필터',
            '구조체/비구조체/마감재 요약 카드',
            '구조 부재(기둥·큰보·작은보·상부 보·슬래브·RC벽체·조적벽체) 클릭 시 층별 최대 균열폭 표시',
            '경사·수직·수평균열은 "균열"로 통합 집계'
        ],
        ownerHint: 'js/tabs/stats.js',
        enter: function () {
            bindStatsControlsOnce();
            if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
            setTimeout(function () {
                if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
            }, 120);
        }
    };

    document.addEventListener('DOMContentLoaded', bindStatsControlsOnce);
})();
