/**
 * 결함 데이터 건강 점검.
 *
 * 2026-09-20: 광주겨자씨교회 「지하1층 주차장-2」의 결함 15개가 전부 부재=기둥,
 * 결함=균열, 크기·폭 없음인 껍데기 상태로 남아 있는 것을 우연히 발견했다.
 * 하루 전 복구 작업 때 개수(15개)만 맞는지 보고 "복구 완료"로 판단해서, 내용이
 * 비어 있다는 걸 아무도 몰랐다.
 *
 * 데이터가 망가지는 것보다 **망가진 걸 며칠 모르는 것**이 더 나쁘다. 그래서
 * 사람이 눈으로 훑지 않아도 껍데기 층을 바로 짚어내게 한다.
 *
 * 판정 기준(둘 다여야 의심):
 *   - 부재와 결함이 각각 딱 한 종류뿐이다 (진짜 점검이면 층마다 여러 종류가 나온다)
 *   - 크기·균열폭이 하나도 없다
 * 결함이 2개 이하인 층은 원래 종류가 적을 수 있어 의심하지 않는다.
 */
(function (root) {
    'use strict';

    /** 결함이 이보다 적으면 종류가 하나여도 이상하지 않다 */
    const MIN_DEFECTS_TO_JUDGE = 3;

    function textOf(value) {
        return value == null ? '' : String(value).trim();
    }

    function uniqueNonEmpty(list) {
        const seen = Object.create(null);
        const out = [];
        (list || []).forEach(function (v) {
            const s = textOf(v);
            if (!s || seen[s]) return;
            seen[s] = true;
            out.push(s);
        });
        return out;
    }

    /** 이 결함에 실측값이 하나라도 있나 */
    function hasMeasurement(d) {
        if (!d) return false;
        return !!(textOf(d.size) || textOf(d.crackWidth) || textOf(d.crackLength));
    }

    /**
     * 부재나 조사내용이 비어 있는 결함인가.
     * 현장에서 위치만 찍고 내용을 빠뜨린 행 — 보고서에 빈 줄로 나간다.
     * 조사표 화면 표시(renderSurveyTable)와 checkDataHealth()가 같은 기준을 쓴다.
     */
    function isBlankContentDefect(d) {
        if (!d) return false;
        return !textOf(d.component) || !textOf(d.defectType);
    }

    /** 비어 있는 칸 이름들 ('component' / 'defectType') — 화면에서 그 칸만 짚어주려고 */
    function blankContentFields(d) {
        const out = [];
        if (!d) return out;
        if (!textOf(d.component)) out.push('component');
        if (!textOf(d.defectType)) out.push('defectType');
        return out;
    }

    function analyzeFloor(floorCode, defects) {
        const arr = Array.isArray(defects) ? defects.filter(Boolean) : [];
        const components = uniqueNonEmpty(arr.map(function (d) { return d.component; }));
        const defectTypes = uniqueNonEmpty(arr.map(function (d) { return d.defectType; }));
        const withMeasure = arr.filter(hasMeasurement).length;
        const blankContent = arr.filter(isBlankContentDefect).length;

        const row = {
            floorCode: floorCode,
            count: arr.length,
            components: components,
            defectTypes: defectTypes,
            withMeasure: withMeasure,
            blankContent: blankContent,
            suspicious: false,
            reason: ''
        };

        if (arr.length === 0) return row;

        if (blankContent > 0) {
            row.suspicious = true;
            row.reason = '부재·결함이 비어 있는 결함 ' + blankContent + '개';
            return row;
        }

        if (arr.length >= MIN_DEFECTS_TO_JUDGE
            && components.length === 1
            && defectTypes.length === 1
            && withMeasure === 0) {
            row.suspicious = true;
            row.reason = '전부 ' + components[0] + '/' + defectTypes[0]
                + ' 한 종류인데 크기·폭이 하나도 없음 (껍데기로 보임)';
        }
        return row;
    }

    /**
     * 건물 하나의 층별 상태.
     * defectsMap: window.state.defects ({ '<건물id>_<층코드>': [결함…] })
     */
    function analyzeBuilding(defectsMap, buildingId) {
        const out = [];
        const id = textOf(buildingId);
        if (!defectsMap || !id) return out;
        const prefix = id + '_';
        Object.keys(defectsMap).forEach(function (key) {
            if (String(key).indexOf(prefix) !== 0) return;
            out.push(analyzeFloor(String(key).slice(prefix.length), defectsMap[key]));
        });
        return out;
    }

    /**
     * 같은 번호(id)가 여러 층에 들어가 있는지 찾는다.
     *
     * 2026-09-21: 광주겨자씨교회에서 지상1층 비파괴 20건이 「지하1층 주차장-2」에
     * 같은 id로 통째 복사돼 있었다. 앱은 한 번에 한 층만 보여줘서 아무도 몰랐고,
     * 모든 층을 합쳐 찍는 한글 보고서에서야 같은 측정이 두 번 나와 드러났다.
     * (9/19 층 섞임 사고가 남긴 자국. 섞임 자체는 9/20에 막았다)
     *
     * recordsMap: { '<건물id>_<층코드>': [ {id…} … ] }
     * returns [{ id, floorCodes: [...] }]
     */
    function crossFloorDuplicateIds(recordsMap, buildingId) {
        const id = textOf(buildingId);
        const out = [];
        if (!recordsMap || !id) return out;
        const prefix = id + '_';
        const floorsById = Object.create(null);
        Object.keys(recordsMap).forEach(function (key) {
            if (String(key).indexOf(prefix) !== 0) return;
            const floorCode = String(key).slice(prefix.length);
            const arr = Array.isArray(recordsMap[key]) ? recordsMap[key] : [];
            arr.forEach(function (rec) {
                const rid = rec && textOf(rec.id);
                if (!rid) return;
                if (!floorsById[rid]) floorsById[rid] = [];
                if (floorsById[rid].indexOf(floorCode) < 0) floorsById[rid].push(floorCode);
            });
        });
        Object.keys(floorsById).forEach(function (rid) {
            if (floorsById[rid].length < 2) return;
            out.push({ id: rid, floorCodes: floorsById[rid] });
        });
        return out;
    }

    /**
     * 한 층에서 "다른 층에도 있는" 번호만 골라낸다(정리 대상 후보).
     * 그 층에만 있는 항목은 절대 고르지 않는다 — 지우면 안 되는 데이터다.
     */
    function duplicatedRecordsOnFloor(recordsMap, buildingId, floorCode) {
        const code = textOf(floorCode);
        const dups = crossFloorDuplicateIds(recordsMap, buildingId);
        const onFloor = Object.create(null);
        dups.forEach(function (d) {
            if (d.floorCodes.indexOf(code) >= 0) onFloor[d.id] = d.floorCodes;
        });
        const key = textOf(buildingId) + '_' + code;
        const arr = Array.isArray(recordsMap && recordsMap[key]) ? recordsMap[key] : [];
        return arr.filter(function (rec) {
            return rec && onFloor[textOf(rec.id)];
        });
    }

    /**
     * 여러 층을 합쳐 보고서에 넣을 때, 같은 번호(id)는 처음 만난 층에서 한 번만 가져온다.
     *
     * 층 섞임으로 같은 항목이 두 층에 들어가 있으면 결과표에 같은 측정이 두 번 나온다.
     * 어느 층이 맞는지는 여기서 알 수 없으므로, 중복은 duplicates로 따로 알려서
     * 사람이 데이터를 고치게 한다(cleanDuplicateNdt).
     *
     * returns { kept: [{ floorCode, record }], duplicates: [{ id, floorCode, firstFloorCode }] }
     */
    function collectFirstByIdAcrossFloors(recordsMap, buildingId, floorCodes) {
        const id = textOf(buildingId);
        const kept = [];
        const duplicates = [];
        if (!recordsMap || !id) return { kept: kept, duplicates: duplicates };
        const firstFloorById = Object.create(null);
        const seenFloors = Object.create(null);
        (floorCodes || []).forEach(function (fc) {
            const floorCode = textOf(fc);
            if (!floorCode || seenFloors[floorCode]) return;
            seenFloors[floorCode] = true;
            const arr = recordsMap[id + '_' + floorCode];
            if (!Array.isArray(arr)) return;
            arr.forEach(function (rec) {
                if (!rec) return;
                const rid = textOf(rec.id);
                if (rid) {
                    if (firstFloorById[rid]) {
                        duplicates.push({
                            id: rid,
                            floorCode: floorCode,
                            firstFloorCode: firstFloorById[rid]
                        });
                        return;
                    }
                    firstFloorById[rid] = floorCode;
                }
                kept.push({ floorCode: floorCode, record: rec });
            });
        });
        return { kept: kept, duplicates: duplicates };
    }

    function suspiciousFloors(defectsMap, buildingId) {
        return analyzeBuilding(defectsMap, buildingId).filter(function (r) {
            return r.suspicious;
        });
    }

    /* ------------------------------------------------------------------
     * 일괄 작업 전 층 스냅샷 (기기 영구 저장)
     *
     * 2026-09-21 광주겨자씨교회: 조사표 가져오기가 NO.01~10을 덮어썼는데
     * 서버에는 이전 값이 없어, 동기화 안 된 기기를 비행기모드로 열어
     * 되살려야 했다. 한 번에 많이 바꾸기 직전에 그 층만 기기에 남겨 둔다.
     *
     * RAM 되돌리기(pushDefectHistory)와 별개. 사진은 photoIds/URL만 남기고
     * dataURL은 넣지 않는다. IndexedDB 기존 DB(building_safety_local_images)
     * 버전은 올리지 않고, 아래 별도 DB를 쓴다.
     * ------------------------------------------------------------------ */
    const BULK_SNAPSHOT_MAX_PER_FLOOR = 5;
    const BULK_SNAPSHOT_DB_NAME = 'building_safety_bulk_snapshots';
    const BULK_SNAPSHOT_DB_VERSION = 1;
    const BULK_SNAPSHOT_STORE = 'snapshots';

    const DEFECT_COMPARE_FIELDS = [
        'component', 'defectType', 'cause', 'size',
        'crackWidth', 'crackLength', 'location'
    ];
    const DEFECT_POSITION_FIELDS = ['x', 'y', 'targetX', 'targetY'];

    function isDataUrl(value) {
        if (typeof value !== 'string') return false;
        const s = value.trim();
        return s.length >= 5 && s.slice(0, 5).toLowerCase() === 'data:';
    }

    function hasDataUrlAnywhere(value) {
        if (value == null) return false;
        if (typeof value === 'string') return isDataUrl(value);
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i += 1) {
                if (hasDataUrlAnywhere(value[i])) return true;
            }
            return false;
        }
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            for (let i = 0; i < keys.length; i += 1) {
                if (hasDataUrlAnywhere(value[keys[i]])) return true;
            }
        }
        return false;
    }

    /**
     * dataURL을 빼고 복제한다. JSON.stringify 전에 걸러야 용량이 안 터진다.
     * photos 배열의 dataURL 칸은 버리고, photoIds·http(s) URL은 남긴다.
     */
    function cloneWithoutDataUrls(value) {
        if (value == null) return value;
        const t = typeof value;
        if (t === 'string') return isDataUrl(value) ? '' : value;
        if (t === 'number' || t === 'boolean') return value;
        if (t === 'function') return undefined;
        if (Array.isArray(value)) {
            const out = [];
            for (let i = 0; i < value.length; i += 1) {
                const src = value[i];
                if (typeof src === 'string' && isDataUrl(src)) continue;
                const cloned = cloneWithoutDataUrls(src);
                if (cloned === undefined) continue;
                out.push(cloned);
            }
            return out;
        }
        if (t === 'object') {
            const out = {};
            Object.keys(value).forEach(function (k) {
                const src = value[k];
                if (typeof src === 'string' && isDataUrl(src)) return;
                const cloned = cloneWithoutDataUrls(src);
                if (cloned === undefined) return;
                out[k] = cloned;
            });
            return out;
        }
        return undefined;
    }

    function uniqueKeys(keys) {
        const seen = Object.create(null);
        const out = [];
        (keys || []).forEach(function (k) {
            const s = textOf(k);
            if (!s || seen[s]) return;
            seen[s] = true;
            out.push(s);
        });
        return out;
    }

    /**
     * 지금 state에 데이터가 있는 층 키. JSON 백업 불러오기처럼 건물 전체를
     * 바꾸기 전에, 기기에 남아 있는 층을 모두 저장할 때 쓴다.
     */
    function collectFloorKeysFromState(state) {
        const st = state || {};
        return uniqueKeys([].concat(
            Object.keys(st.defects || {}),
            Object.keys(st.ndtData || {}),
            Object.keys(st.ndtDisplacementGroups || {}),
            Object.keys(st.deletedDefectIds || {}),
            Object.keys(st.deletedNdtIds || {})
        ));
    }

    function splitFloorKey(floorKey, buildingId) {
        const key = textOf(floorKey);
        const bid = textOf(buildingId);
        if (bid && key.indexOf(bid + '_') === 0) {
            return { buildingId: bid, floorCode: key.slice(bid.length + 1) };
        }
        const i = key.indexOf('_');
        if (i < 0) return { buildingId: '', floorCode: key };
        return { buildingId: key.slice(0, i), floorCode: key.slice(i + 1) };
    }

    function cloneIdList(list) {
        return Array.isArray(list) ? list.map(function (id) { return id; }) : [];
    }

    function cloneAtMap(map) {
        const out = {};
        if (!map || typeof map !== 'object') return out;
        Object.keys(map).forEach(function (k) {
            out[k] = map[k];
        });
        return out;
    }

    function indexById(list) {
        const out = Object.create(null);
        (Array.isArray(list) ? list : []).forEach(function (rec) {
            if (!rec) return;
            const id = textOf(rec.id);
            if (!id) return;
            out[id] = rec;
        });
        return out;
    }

    function fieldText(value) {
        return value == null ? '' : String(value).trim();
    }

    function positionValue(value) {
        if (value == null || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : String(value);
    }

    function defectsDiffer(a, b) {
        if (!a && !b) return false;
        if (!a || !b) return true;
        let i;
        for (i = 0; i < DEFECT_COMPARE_FIELDS.length; i += 1) {
            const f = DEFECT_COMPARE_FIELDS[i];
            if (fieldText(a[f]) !== fieldText(b[f])) return true;
        }
        for (i = 0; i < DEFECT_POSITION_FIELDS.length; i += 1) {
            const f = DEFECT_POSITION_FIELDS[i];
            if (positionValue(a[f]) !== positionValue(b[f])) return true;
        }
        return false;
    }

    function newSnapshotId(now, seq) {
        const n = now || Date.now();
        const extra = seq == null ? Math.random().toString(36).slice(2, 8) : String(seq);
        return 'bs_' + n + '_' + extra;
    }

    function arrayLen(v) {
        return Array.isArray(v) ? v.length : 0;
    }

    /**
     * 층 키 하나의 스냅샷. state는 window.state와 같은 모양이면 된다.
     */
    function buildFloorSnapshot(state, floorKey, opName, now) {
        const st = state || {};
        const key = textOf(floorKey);
        const parts = splitFloorKey(key, st.currentBuildingId);
        const ts = now || Date.now();
        const defects = cloneWithoutDataUrls(st.defects && st.defects[key] ? st.defects[key] : []);
        const ndtData = cloneWithoutDataUrls(st.ndtData && st.ndtData[key] ? st.ndtData[key] : []);
        const ndtDisplacementGroups = cloneWithoutDataUrls(
            st.ndtDisplacementGroups && st.ndtDisplacementGroups[key]
                ? st.ndtDisplacementGroups[key]
                : []
        );
        const deletedDefectIds = cloneIdList(st.deletedDefectIds && st.deletedDefectIds[key]);
        const deletedDefectAt = cloneAtMap(st.deletedDefectAt && st.deletedDefectAt[key]);
        const deletedNdtIds = cloneIdList(st.deletedNdtIds && st.deletedNdtIds[key]);
        const deletedNdtAt = cloneAtMap(st.deletedNdtAt && st.deletedNdtAt[key]);
        return {
            id: newSnapshotId(ts),
            floorKey: key,
            buildingId: parts.buildingId,
            floorCode: parts.floorCode,
            opName: textOf(opName) || '일괄 작업',
            createdAt: ts,
            defectCount: arrayLen(defects),
            ndtCount: arrayLen(ndtData) + arrayLen(ndtDisplacementGroups),
            defects: Array.isArray(defects) ? defects : [],
            ndtData: Array.isArray(ndtData) ? ndtData : [],
            ndtDisplacementGroups: Array.isArray(ndtDisplacementGroups) ? ndtDisplacementGroups : [],
            deletedDefectIds: deletedDefectIds,
            deletedDefectAt: deletedDefectAt,
            deletedNdtIds: deletedNdtIds,
            deletedNdtAt: deletedNdtAt
        };
    }

    /**
     * 스냅샷 vs 현재를 결함 id 기준으로 비교.
     * changed: 부재·조사내용·원인·크기·균열·위치가 다른 행
     * deletedAfter: 스냅샷에는 있는데 지금은 없음 (이후 지워진 것)
     * addedAfter: 스냅샷 이후 새로 생긴 것 (되살리기가 지우지 않음)
     */
    function compareDefects(snapshotDefects, currentDefects) {
        const snapBy = indexById(snapshotDefects);
        const curBy = indexById(currentDefects);
        const changed = [];
        const deletedAfter = [];
        const addedAfter = [];
        const unchanged = [];
        Object.keys(snapBy).forEach(function (id) {
            if (!curBy[id]) {
                deletedAfter.push({
                    id: id,
                    kind: 'deleted',
                    snapshot: snapBy[id],
                    current: null
                });
                return;
            }
            if (defectsDiffer(snapBy[id], curBy[id])) {
                changed.push({
                    id: id,
                    kind: 'changed',
                    snapshot: snapBy[id],
                    current: curBy[id]
                });
            } else {
                unchanged.push({
                    id: id,
                    kind: 'unchanged',
                    snapshot: snapBy[id],
                    current: curBy[id]
                });
            }
        });
        Object.keys(curBy).forEach(function (id) {
            if (snapBy[id]) return;
            addedAfter.push({
                id: id,
                kind: 'added',
                snapshot: null,
                current: curBy[id]
            });
        });
        return {
            changed: changed,
            deletedAfter: deletedAfter,
            addedAfter: addedAfter,
            unchanged: unchanged
        };
    }

    function defaultSelectedIds(diff) {
        const out = [];
        if (!diff) return out;
        (diff.changed || []).forEach(function (r) { out.push(r.id); });
        (diff.deletedAfter || []).forEach(function (r) { out.push(r.id); });
        return out;
    }

    function untrackOnFloorSlice(slice, idListKey, atMapKey, id) {
        const ids = Array.isArray(slice[idListKey]) ? slice[idListKey] : [];
        slice[idListKey] = ids.filter(function (x) { return x !== id; });
        const at = slice[atMapKey] && typeof slice[atMapKey] === 'object' ? slice[atMapKey] : {};
        if (Object.prototype.hasOwnProperty.call(at, id)) delete at[id];
        slice[atMapKey] = at;
    }

    function replaceOrInsertById(list, rec) {
        const arr = Array.isArray(list) ? list : [];
        const id = rec && textOf(rec.id);
        if (!id) {
            arr.push(rec);
            return arr;
        }
        let found = false;
        for (let i = 0; i < arr.length; i += 1) {
            if (arr[i] && textOf(arr[i].id) === id) {
                arr[i] = rec;
                found = true;
                break;
            }
        }
        if (!found) arr.push(rec);
        return arr;
    }

    function stampRestoredDefect(rec, now) {
        if (!rec) return rec;
        const ts = now || Date.now();
        rec.updatedAt = ts;
        rec.contentUpdatedAt = ts;
        rec.positionUpdatedAt = ts;
        return rec;
    }

    function stampRestoredNdt(rec, now) {
        if (!rec) return rec;
        rec.updatedAt = now || Date.now();
        return rec;
    }

    /**
     * 고른 결함 id만 스냅샷 값으로 덮어쓴다.
     * - 스냅샷에 없는(이후에 생긴) 결함은 지우지 않는다
     * - 되살린 id는 묘비 목록에서 뺀다
     * - 시각은 지금으로 찍어서 서버의 망가진 값보다 늦게 만든다
     */
    function applyRestoreToFloor(floorSlice, snapshot, opts) {
        const options = opts || {};
        const now = options.now || Date.now();
        const slice = floorSlice || {};
        if (!Array.isArray(slice.defects)) slice.defects = [];
        if (!Array.isArray(slice.ndtData)) slice.ndtData = [];
        if (!Array.isArray(slice.ndtDisplacementGroups)) slice.ndtDisplacementGroups = [];
        if (!Array.isArray(slice.deletedDefectIds)) slice.deletedDefectIds = [];
        if (!slice.deletedDefectAt) slice.deletedDefectAt = {};
        if (!Array.isArray(slice.deletedNdtIds)) slice.deletedNdtIds = [];
        if (!slice.deletedNdtAt) slice.deletedNdtAt = {};

        const snap = snapshot || {};
        const snapBy = indexById(snap.defects);
        const selected = Array.isArray(options.ids)
            ? options.ids.map(textOf).filter(Boolean)
            : defaultSelectedIds(compareDefects(snap.defects, slice.defects));

        const restored = [];
        const skipped = [];
        selected.forEach(function (id) {
            const src = snapBy[id];
            if (!src) {
                skipped.push(id);
                return;
            }
            const rec = cloneWithoutDataUrls(src);
            stampRestoredDefect(rec, now);
            slice.defects = replaceOrInsertById(slice.defects, rec);
            untrackOnFloorSlice(slice, 'deletedDefectIds', 'deletedDefectAt', id);
            restored.push(rec);
        });

        const restoredNdt = [];
        const ndtBy = indexById(snap.ndtData);
        const groupBy = indexById(snap.ndtDisplacementGroups);
        const curNdtBy = indexById(slice.ndtData);
        const curGroupBy = indexById(slice.ndtDisplacementGroups);
        let ndtIds;
        if (Array.isArray(options.ndtIds)) {
            ndtIds = options.ndtIds.map(textOf).filter(Boolean);
        } else if (options.restoreNdt) {
            ndtIds = Object.keys(ndtBy).concat(Object.keys(groupBy));
        } else {
            // 층 도면 삭제·중복 정리처럼 스냅샷 이후 사라진 비파괴만 되살린다.
            // 조사표 가져오기처럼 비파괴를 안 건드린 작업은 기존 값을 덮지 않는다.
            ndtIds = [];
            Object.keys(ndtBy).forEach(function (id) {
                if (!curNdtBy[id]) ndtIds.push(id);
            });
            Object.keys(groupBy).forEach(function (id) {
                if (!curGroupBy[id]) ndtIds.push(id);
            });
        }
        ndtIds.forEach(function (id) {
            if (ndtBy[id]) {
                const rec = cloneWithoutDataUrls(ndtBy[id]);
                stampRestoredNdt(rec, now);
                slice.ndtData = replaceOrInsertById(slice.ndtData, rec);
                untrackOnFloorSlice(slice, 'deletedNdtIds', 'deletedNdtAt', id);
                restoredNdt.push(rec);
            } else if (groupBy[id]) {
                const rec = cloneWithoutDataUrls(groupBy[id]);
                stampRestoredNdt(rec, now);
                slice.ndtDisplacementGroups = replaceOrInsertById(slice.ndtDisplacementGroups, rec);
                untrackOnFloorSlice(slice, 'deletedNdtIds', 'deletedNdtAt', id);
                restoredNdt.push(rec);
            }
        });

        return {
            restored: restored,
            restoredNdt: restoredNdt,
            skipped: skipped,
            restoredIds: restored.map(function (d) { return d.id; }),
            restoredNdtIds: restoredNdt.map(function (d) { return d.id; })
        };
    }

    /**
     * 같은 층 스냅샷을 새것부터 max개만 남기고, 버릴 id를 돌려준다.
     */
    function pruneSnapshots(list, maxPerFloor) {
        const max = maxPerFloor == null ? BULK_SNAPSHOT_MAX_PER_FLOOR : maxPerFloor;
        const grouped = Object.create(null);
        (list || []).forEach(function (s) {
            if (!s) return;
            const k = textOf(s.floorKey) || '_';
            if (!grouped[k]) grouped[k] = [];
            grouped[k].push(s);
        });
        const drop = [];
        Object.keys(grouped).forEach(function (k) {
            const arr = grouped[k].slice().sort(function (a, b) {
                return (b.createdAt || 0) - (a.createdAt || 0);
            });
            arr.slice(max).forEach(function (s) { drop.push(s); });
        });
        return drop;
    }

    function createMemorySnapshotStore() {
        const map = Object.create(null);
        return {
            put: function (snap) {
                if (!snap || !snap.id) return Promise.resolve(false);
                map[snap.id] = snap;
                return Promise.resolve(true);
            },
            get: function (id) {
                return Promise.resolve(map[id] || null);
            },
            delete: function (id) {
                delete map[id];
                return Promise.resolve(true);
            },
            getAll: function () {
                return Promise.resolve(Object.keys(map).map(function (k) { return map[k]; }));
            },
            listByFloor: function (floorKey) {
                const key = textOf(floorKey);
                const out = [];
                Object.keys(map).forEach(function (k) {
                    if (map[k] && map[k].floorKey === key) out.push(map[k]);
                });
                return Promise.resolve(out);
            }
        };
    }

    let _bulkSnapDbPromise = null;

    function openBulkSnapshotDb() {
        if (typeof indexedDB === 'undefined') {
            return Promise.reject(new Error('이 환경은 IndexedDB를 지원하지 않습니다.'));
        }
        if (_bulkSnapDbPromise) return _bulkSnapDbPromise;
        _bulkSnapDbPromise = new Promise(function (resolve, reject) {
            const req = indexedDB.open(BULK_SNAPSHOT_DB_NAME, BULK_SNAPSHOT_DB_VERSION);
            req.onupgradeneeded = function () {
                const db = req.result;
                if (!db.objectStoreNames.contains(BULK_SNAPSHOT_STORE)) {
                    const store = db.createObjectStore(BULK_SNAPSHOT_STORE, { keyPath: 'id' });
                    store.createIndex('floorKey', 'floorKey', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () {
                _bulkSnapDbPromise = null;
                reject(req.error);
            };
        });
        return _bulkSnapDbPromise;
    }

    function createIdbSnapshotStore() {
        function withStore(mode, fn) {
            return openBulkSnapshotDb().then(function (db) {
                return new Promise(function (resolve, reject) {
                    const tx = db.transaction(BULK_SNAPSHOT_STORE, mode);
                    const store = tx.objectStore(BULK_SNAPSHOT_STORE);
                    let req;
                    try {
                        req = fn(store);
                    } catch (e) {
                        reject(e);
                        return;
                    }
                    tx.onerror = function () { reject(tx.error); };
                    req.onsuccess = function () { resolve(req.result); };
                    req.onerror = function () { reject(req.error); };
                });
            });
        }
        return {
            put: function (snap) {
                return withStore('readwrite', function (store) { return store.put(snap); })
                    .then(function () { return true; });
            },
            get: function (id) {
                return withStore('readonly', function (store) { return store.get(id); })
                    .then(function (v) { return v || null; });
            },
            delete: function (id) {
                return withStore('readwrite', function (store) { return store.delete(id); })
                    .then(function () { return true; });
            },
            getAll: function () {
                return withStore('readonly', function (store) { return store.getAll(); })
                    .then(function (v) { return Array.isArray(v) ? v : []; });
            },
            listByFloor: function (floorKey) {
                return withStore('readonly', function (store) {
                    if (store.indexNames && store.indexNames.contains('floorKey')) {
                        return store.index('floorKey').getAll(floorKey);
                    }
                    return store.getAll();
                }).then(function (v) {
                    const arr = Array.isArray(v) ? v : [];
                    const key = textOf(floorKey);
                    return arr.filter(function (s) { return s && s.floorKey === key; });
                });
            }
        };
    }

    function saveSnapshotsWithStore(state, opName, floorKeys, store, now, maxPerFloor) {
        const keys = uniqueKeys(floorKeys);
        const ts = now || Date.now();
        const max = maxPerFloor == null ? BULK_SNAPSHOT_MAX_PER_FLOOR : maxPerFloor;
        const saved = [];
        let chain = Promise.resolve();
        keys.forEach(function (key, idx) {
            chain = chain.then(function () {
                const snap = buildFloorSnapshot(state, key, opName, ts + idx);
                snap.id = newSnapshotId(ts, idx + '_' + Math.random().toString(36).slice(2, 6));
                return store.put(snap).then(function () {
                    return store.listByFloor(key);
                }).then(function (existing) {
                    const drop = pruneSnapshots(existing, max);
                    let del = Promise.resolve();
                    drop.forEach(function (s) {
                        if (!s || s.id === snap.id) return;
                        del = del.then(function () { return store.delete(s.id); });
                    });
                    return del.then(function () {
                        saved.push(snap);
                    });
                });
            });
        });
        return chain.then(function () { return saved; });
    }

    const api = {
        MIN_DEFECTS_TO_JUDGE: MIN_DEFECTS_TO_JUDGE,
        hasMeasurement: hasMeasurement,
        isBlankContentDefect: isBlankContentDefect,
        blankContentFields: blankContentFields,
        analyzeFloor: analyzeFloor,
        analyzeBuilding: analyzeBuilding,
        suspiciousFloors: suspiciousFloors,
        crossFloorDuplicateIds: crossFloorDuplicateIds,
        collectFirstByIdAcrossFloors: collectFirstByIdAcrossFloors,
        duplicatedRecordsOnFloor: duplicatedRecordsOnFloor,
        BULK_SNAPSHOT_MAX_PER_FLOOR: BULK_SNAPSHOT_MAX_PER_FLOOR,
        BULK_SNAPSHOT_DB_NAME: BULK_SNAPSHOT_DB_NAME,
        isDataUrl: isDataUrl,
        hasDataUrlAnywhere: hasDataUrlAnywhere,
        cloneWithoutDataUrls: cloneWithoutDataUrls,
        splitFloorKey: splitFloorKey,
        buildFloorSnapshot: buildFloorSnapshot,
        compareDefects: compareDefects,
        defaultSelectedIds: defaultSelectedIds,
        applyRestoreToFloor: applyRestoreToFloor,
        pruneSnapshots: pruneSnapshots,
        collectFloorKeysFromState: collectFloorKeysFromState,
        createMemorySnapshotStore: createMemorySnapshotStore,
        createIdbSnapshotStore: createIdbSnapshotStore,
        saveSnapshotsWithStore: saveSnapshotsWithStore
    };

    root.BSA = root.BSA || {};
    root.BSA.dataHealth = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
