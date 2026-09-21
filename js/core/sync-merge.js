/**
 * 다기기 동기화: 결함/NDT 고유코드 병합 + 삭제 묘비(tombstone).
 * DOM·Firebase는 쓰지 않는다. 사진 캐시는 호출 측에서 넘긴다.
 */
(function (root) {
    'use strict';

    var DEFECT_POSITION_FIELDS = [
        'x', 'y', 'targetX', 'targetY', 'mapMarkedAt', 'mapUnregistered',
        'vertices', 'points', 'areaAngle', 'width', 'height', 'rotation',
        'shapeType', 'areaX1', 'areaY1', 'areaX2', 'areaY2', 'areaShape',
        'areaPoints', 'areaDrawings', 'areaFillStyle', 'areaBorderStyle'
    ];

    function getRecordUpdatedAt(rec, kind) {
        if (!rec) return 0;
        if (rec.updatedAt) return Number(rec.updatedAt) || 0;
        var id = rec.id || '';
        if (kind === 'pin') {
            var pm = /^pin-(\d+)/.exec(id);
            if (pm) return Number(pm[1]) || 0;
        }
        if (kind === 'ndt') {
            var nm = /^(?:ndt_|ndtg_|ndtp_)(\d+)/.exec(id);
            if (nm) return Number(nm[1]) || 0;
        }
        return 0;
    }

    function getDefectContentUpdatedAt(rec) {
        if (!rec) return 0;
        if (rec.contentUpdatedAt) return Number(rec.contentUpdatedAt) || 0;
        return getRecordUpdatedAt(rec, 'pin');
    }

    function getDefectPositionUpdatedAt(rec) {
        if (!rec) return 0;
        return Number(rec.positionUpdatedAt) || 0;
    }

    /**
     * 조사표 가져오기(엑셀/한글) — 번호가 같은 기존 결함에 내용을 채울 때의 규칙.
     *
     * 2026-09-21 사고: 「지하1층 주차장-1」 NO.01~NO.10이 부재·결함 '기타',
     * 원인 '건조수축'으로 한꺼번에 바뀌었다. 가져오기가 번호로 기존 결함을 찾아 내용을
     * 채우는데, **가져온 칸이 비어 있어도 기본값으로 덮어썼기** 때문이다
     * (`componentRaw || '기타'`, `causeRaw || '건조수축'`). 헤더가 안 맞거나 번호만 있는
     * 시트를 불러오면 현장에서 작성한 내용이 통째로 사라진다.
     *
     * 규칙: **가져온 값이 있을 때만 덮어쓴다.** 비어 있으면 기존 내용을 그대로 두고,
     * 기존도 비어 있을 때만 기본값을 쓴다(새로 만드는 행과 같아짐).
     */
    function pickImportedText(incoming, existing, fallback) {
        var inc = incoming == null ? '' : String(incoming).trim();
        if (inc) return inc;
        var cur = existing == null ? '' : String(existing).trim();
        if (cur) return cur;
        return fallback == null ? '' : String(fallback).trim();
    }

    /**
     * 가져온 빈 칸이 기존 내용을 지울 뻔한 횟수.
     * 0이 아니면 헤더 불일치·내용 없는 시트일 수 있어 사용자에게 알린다.
     * pairs: [{ incoming, existing }, …]
     */
    function countKeptExistingOnImport(pairs) {
        var n = 0;
        (pairs || []).forEach(function (p) {
            if (!p) return;
            var inc = p.incoming == null ? '' : String(p.incoming).trim();
            var cur = p.existing == null ? '' : String(p.existing).trim();
            if (!inc && cur) n += 1;
        });
        return n;
    }

    /**
     * 결함 수정 폼 저장 — 사용자가 안 건드린 칸은 저장된 원래 값을 그대로 쓴다.
     *
     * 2026-09-21: 폼은 값 하나만 바꿔도(또는 창을 닫거나 페이지를 떠나도) 모든 칸을 다시
     * 저장한다. 그런데 조사내용·원인은 화면 칩에서 다시 조립되면서 값이 샜다.
     *  - '경사,수직균열' → '수직균열' ('경사'가 칩 목록에 없어 버려짐)
     *  - '철근의 부식·팽창에 의한 …' → '철근의 부식, 팽창에 의한 …' (구분자 바뀜)
     * 둘 다 실제 「지하1층 주차장-1」 값이다. 조립 규칙을 하나씩 고치면 또 다른 값에서 샌다.
     *
     * 규칙: 폼을 열었을 때 화면이 보여준 값(baseline)과 지금 화면 값이 같으면 사용자가
     * 안 바꾼 것이므로 저장값(stored)을 쓴다. 다르면 사용자가 바꾼 것이므로 화면 값을 쓴다.
     * baseline을 모르면(새 핀 등) 화면 값을 쓴다 — 예전 동작 그대로라 안전하다.
     */
    function keepStoredIfUntouched(uiValue, baselineValue, storedValue) {
        if (baselineValue === undefined) return uiValue;
        if (uiValue !== baselineValue) return uiValue;
        return storedValue == null ? uiValue : storedValue;
    }

    /**
     * 지금 돌고 있는 코드가 배포된 최신본과 다른가 — 다르면 클라우드에 쓰면 안 된다.
     *
     * 2026-09-21: 지운 층이 되살아나고, 옛 데이터가 새 데이터를 덮은 사고들은 모두
     * **업데이트 안 된 기기**가 옛 코드로 동기화하면서 생겼다. 고친 코드를 배포해도 그
     * 기기에서 새로고침하기 전까지는 옛 규칙으로 계속 쓴다.
     *
     * running: window.BSA_APP_VERSION (배포 때 prepare-pages.py가 커밋 짧은 해시로 박는다)
     * deployed: web-version.json 내용 ({ sha, short })
     * host: location.hostname
     *
     * **확실할 때만 true.** 오프라인·로컬 개발·값을 모름·형식이 달라 비교 불가 → false.
     * 잘못 막으면 전원의 동기화가 멈추므로, 애매하면 막지 않는 쪽으로 둔다.
     */
    function isOutdatedBuild(running, deployed, host) {
        var h = host == null ? '' : String(host).toLowerCase();
        if (!h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false;
        if (!deployed || typeof deployed !== 'object') return false;
        var short = deployed.short == null ? '' : String(deployed.short).trim().toLowerCase();
        var sha = deployed.sha == null ? '' : String(deployed.sha).trim().toLowerCase();
        if (!short && !sha) return false;
        if (short === 'local' || sha === 'local') return false;
        var run = running == null ? '' : String(running).trim().toLowerCase();
        if (!run) return false;
        var HEX = /^[0-9a-f]{7,40}$/;
        // 둘 다 커밋 해시 모양일 때만 비교한다. 한쪽이 시각 라벨(20260921_111044) 같은
        // 다른 형식이면 배포 경로가 바뀐 것이므로 판단하지 않는다(전원 차단 방지).
        if (!HEX.test(run)) return false;
        if (short && HEX.test(short)) {
            if (run === short) return false;
            if (short.indexOf(run) === 0 || run.indexOf(short) === 0) return false;
        }
        if (sha && HEX.test(sha)) {
            if (sha.indexOf(run) === 0) return false;
        }
        if (!(short && HEX.test(short)) && !(sha && HEX.test(sha))) return false;
        return true;
    }

    function mergeDeletedIdsMaps(serverMap, localMap) {
        var out = Object.assign({}, serverMap || {});
        Object.entries(localMap || {}).forEach(function (entry) {
            var key = entry[0];
            var ids = entry[1];
            var set = new Set([].concat(out[key] || [], ids || []));
            if (set.size > 0) out[key] = Array.from(set);
        });
        return out;
    }

    function mergeDeletedAtMaps(serverMap, localMap) {
        var out = {};
        var keys = new Set([].concat(
            Object.keys(serverMap || {}),
            Object.keys(localMap || {})
        ));
        keys.forEach(function (key) {
            var sm = (serverMap && serverMap[key]) || {};
            var lm = (localMap && localMap[key]) || {};
            var ids = new Set([].concat(Object.keys(sm), Object.keys(lm)));
            var merged = {};
            ids.forEach(function (id) {
                var t = Math.max(Number(sm[id]) || 0, Number(lm[id]) || 0);
                if (t > 0) merged[id] = t;
            });
            if (Object.keys(merged).length) out[key] = merged;
        });
        return out;
    }

    function recordSurvivesDelete(rec, deletedAt, kind) {
        if (!rec || !rec.id) return false;
        var ts = Number(deletedAt) || 0;
        if (ts <= 0) return false;
        if (kind === 'ndt') return getRecordUpdatedAt(rec, 'ndt') > ts;
        return getDefectContentUpdatedAt(rec) > ts;
    }

    function mergePhotoArrays(primaryArr, secondaryArr) {
        var seen = new Set();
        var out = [];
        function add(p) {
            if (!p) return;
            var key = String(p);
            if (seen.has(key)) return;
            seen.add(key);
            out.push(p);
        }
        (primaryArr || []).forEach(add);
        (secondaryArr || []).forEach(add);
        return out;
    }

    function collectPhotoSrcById(ids, photos, urls, photoCache) {
        var map = {};
        if (!Array.isArray(ids) || !ids.length) return map;
        ids.forEach(function (pid, i) {
            if (!pid) return;
            var key = String(pid);
            var cands = [
                Array.isArray(urls) ? urls[i] : null,
                Array.isArray(photos) ? photos[i] : null,
                photoCache && photoCache[pid]
            ];
            for (var c = 0; c < cands.length; c++) {
                if (cands[c]) { map[key] = cands[c]; break; }
            }
        });
        return map;
    }

    function alignPhotoSrcArrayToIds(ids, srcById) {
        if (!Array.isArray(ids) || !ids.length) return [];
        return ids.map(function (pid) {
            return (pid && srcById && srcById[String(pid)]) || null;
        });
    }

    function isLightweightCloudPhotoRef(src) {
        var t = String(src || '').trim();
        if (!t || t.length < 12 || t.length > 4096) return false;
        if (t.indexOf('data:') === 0) return false;
        return /^https?:\/\//i.test(t) || /^gs:\/\//i.test(t);
    }

    function collectPackedPhotoUrlMap(ids, urls, photos, photoCache) {
        var map = {};
        var n = Math.max(
            Array.isArray(ids) ? ids.length : 0,
            Array.isArray(urls) ? urls.length : 0,
            Array.isArray(photos) ? photos.length : 0
        );
        for (var i = 0; i < n; i++) {
            var pid = ids && ids[i];
            var cands = [
                urls && urls[i],
                photos && photos[i],
                pid && photoCache && photoCache[pid]
            ];
            var picked = '';
            for (var c = 0; c < cands.length; c++) {
                if (isLightweightCloudPhotoRef(cands[c])) {
                    picked = String(cands[c]).trim();
                    break;
                }
            }
            if (pid && picked) map[String(pid)] = picked;
        }
        return map;
    }

    /**
     * 사진 목록을 어느 쪽에서 통째로 가져올지 정한다. 'server' | 'local' | null(합집합).
     *
     * 2026-09-21: 사진은 서버·기기 photoIds의 **합집합**으로 병합돼, 지운 사진이 되살아났다.
     * 옛 기기뿐 아니라 **같은 기기에서도** — 동기화는 "서버+기기"를 합친 뒤 올리는데,
     * 지운 직후엔 서버에 아직 그 사진이 있기 때문이다.
     *
     * 사진 번호는 사진 고유 번호가 아니라 **자리 번호**(결함id_0, _1, …)라서 가운데를 지우면
     * 뒤 사진이 당겨진다. 그래서 번호별 삭제 기록은 맞지 않는다(다시 추가한 사진이 같은 자리를
     * 써서 막힘). 대신 사용자가 사진을 바꿀 때 photosUpdatedAt을 찍고, 나중에 바꾼 쪽 목록을
     * 통째로 따른다.
     *
     * - 둘 다 찍힘 → 나중 쪽
     * - 한쪽만 찍힘 → 반대쪽이 그 뒤에 따로 바뀐 게 없을 때만 찍힌 쪽. 반대쪽이 더 나중에
     *   바뀌었으면 사진이 추가됐을 수 있어 합집합(사진을 잃는 것보다 되살아나는 게 덜 나쁘다)
     * - 둘 다 없음(옛 데이터) → 합집합(예전 동작)
     */
    function pickPhotoListSide(serverRec, localRec) {
        var sp = Number(serverRec && serverRec.photosUpdatedAt) || 0;
        var lp = Number(localRec && localRec.photosUpdatedAt) || 0;
        if (!sp && !lp) return null;
        if (sp && lp) return lp >= sp ? 'local' : 'server';
        if (lp) return getDefectContentUpdatedAt(serverRec) > lp ? null : 'local';
        return getDefectContentUpdatedAt(localRec) > sp ? null : 'server';
    }

    function extractInlinePhotos(defect, kind) {
        if (!defect) return [];
        if (kind === 'prev') {
            return (Array.isArray(defect.prevRoundPhotos) ? defect.prevRoundPhotos : []).filter(Boolean);
        }
        return (Array.isArray(defect.photos) ? defect.photos : []).filter(Boolean);
    }

    function mergeDefectRecord(serverRec, localRec, photoCache) {
        if (!serverRec) return localRec ? Object.assign({}, localRec) : null;
        if (!localRec) return Object.assign({}, serverRec);

        var serverContentTs = getDefectContentUpdatedAt(serverRec);
        var localContentTs = getDefectContentUpdatedAt(localRec);
        var contentNewer = localContentTs >= serverContentTs ? localRec : serverRec;
        var contentOlder = localContentTs >= serverContentTs ? serverRec : localRec;
        var merged = Object.assign({}, contentOlder, contentNewer);

        var serverPosTs = getDefectPositionUpdatedAt(serverRec);
        var localPosTs = getDefectPositionUpdatedAt(localRec);
        if (serverPosTs > 0 || localPosTs > 0) {
            var posNewer = localPosTs >= serverPosTs ? localRec : serverRec;
            DEFECT_POSITION_FIELDS.forEach(function (field) {
                if (posNewer[field] !== undefined) merged[field] = posNewer[field];
            });
        }

        var serverNoTs = Math.max(serverContentTs, Number(serverRec.updatedAt) || 0);
        var localNoTs = Math.max(localContentTs, Number(localRec.updatedAt) || 0);
        var noSource = localNoTs >= serverNoTs ? localRec : serverRec;
        if (noSource.no != null && noSource.no !== '') merged.no = noSource.no;
        else if (serverRec.no) merged.no = serverRec.no;
        else if (localRec.no) merged.no = localRec.no;
        if (noSource.groupNo != null && noSource.groupNo !== '') merged.groupNo = noSource.groupNo;
        else if (serverRec.groupNo) merged.groupNo = serverRec.groupNo;
        else if (localRec.groupNo) merged.groupNo = localRec.groupNo;
        if (noSource.cadNo != null && noSource.cadNo !== '') merged.cadNo = noSource.cadNo;
        if (noSource.isCadImported != null) merged.isCadImported = noSource.isCadImported;
        if (serverRec.groupId) merged.groupId = serverRec.groupId;
        else if (localRec.groupId) merged.groupId = localRec.groupId;
        if (serverRec.surveyExtra || localRec.surveyExtra) merged.surveyExtra = true;
        if (Object.prototype.hasOwnProperty.call(noSource, 'surveyNumbered')) {
            merged.surveyNumbered = !!noSource.surveyNumbered;
        } else if (localRec.surveyNumbered === false || serverRec.surveyNumbered === false) {
            merged.surveyNumbered = false;
        }

        var serverPhotoIds = Array.isArray(serverRec.photoIds) ? serverRec.photoIds : [];
        var localPhotoIds = Array.isArray(localRec.photoIds) ? localRec.photoIds : [];
        var photoSide = pickPhotoListSide(serverRec, localRec);
        if (photoSide) {
            // 나중에 사진을 바꾼 쪽 목록을 통째로 따른다. 이미지·URL도 **그쪽 것만** 쓴다 —
            // 자리 번호라 반대쪽의 같은 번호는 다른 사진일 수 있다(가운데 삭제로 당겨졌을 때).
            var src = photoSide === 'local' ? localRec : serverRec;
            var srcIds = Array.isArray(src.photoIds) ? src.photoIds.slice() : [];
            merged.photosUpdatedAt = Math.max(
                Number(serverRec.photosUpdatedAt) || 0,
                Number(localRec.photosUpdatedAt) || 0
            );
            if (srcIds.length) {
                merged.photoIds = srcIds;
                var sideSrcById = collectPhotoSrcById(srcIds, src.photos, src.photoUrls, photoCache);
                var sidePhotos = alignPhotoSrcArrayToIds(srcIds, sideSrcById);
                if (sidePhotos.some(Boolean)) merged.photos = sidePhotos;
                else delete merged.photos;
                var sideUrlMap = collectPackedPhotoUrlMap(srcIds, src.photoUrls, extractInlinePhotos(src), photoCache);
                var sideUrls = srcIds.map(function (pid) { return (pid && sideUrlMap[String(pid)]) || ''; });
                if (sideUrls.some(Boolean)) merged.photoUrls = sideUrls;
                else delete merged.photoUrls;
            } else {
                var inline = extractInlinePhotos(src);
                if (inline.length) merged.photos = inline.slice();
                else delete merged.photos;
                delete merged.photoIds;
                delete merged.photoUrls;
            }
        }
        var mergedPhotoIds = photoSide ? [] : mergePhotoArrays(serverPhotoIds, localPhotoIds);
        if (photoSide) {
            // 위에서 처리함
        } else if (mergedPhotoIds.length) {
            merged.photoIds = mergedPhotoIds;
            var srcById = Object.assign(
                {},
                collectPhotoSrcById(serverPhotoIds, serverRec.photos, serverRec.photoUrls, photoCache),
                collectPhotoSrcById(localPhotoIds, localRec.photos, localRec.photoUrls, photoCache)
            );
            var alignedPhotos = alignPhotoSrcArrayToIds(mergedPhotoIds, srcById);
            if (alignedPhotos.some(Boolean)) merged.photos = alignedPhotos;
            else delete merged.photos;
            var packedUrlMap = Object.assign(
                {},
                collectPackedPhotoUrlMap(serverPhotoIds, serverRec.photoUrls, extractInlinePhotos(serverRec), photoCache),
                collectPackedPhotoUrlMap(localPhotoIds, localRec.photoUrls, extractInlinePhotos(localRec), photoCache)
            );
            var packedUrls = mergedPhotoIds.map(function (pid) {
                return (pid && packedUrlMap[String(pid)]) || '';
            });
            if (packedUrls.some(Boolean)) merged.photoUrls = packedUrls;
            else delete merged.photoUrls;
        } else {
            merged.photos = mergePhotoArrays(
                extractInlinePhotos(serverRec),
                extractInlinePhotos(localRec)
            );
            delete merged.photoIds;
            delete merged.photoUrls;
        }

        var serverPrevPhotoIds = Array.isArray(serverRec.prevRoundPhotoIds) ? serverRec.prevRoundPhotoIds : [];
        var localPrevPhotoIds = Array.isArray(localRec.prevRoundPhotoIds) ? localRec.prevRoundPhotoIds : [];
        var mergedPrevPhotoIds = mergePhotoArrays(serverPrevPhotoIds, localPrevPhotoIds);
        if (mergedPrevPhotoIds.length) {
            merged.prevRoundPhotoIds = mergedPrevPhotoIds;
            var prevSrcById = Object.assign(
                {},
                collectPhotoSrcById(serverPrevPhotoIds, serverRec.prevRoundPhotos, serverRec.prevRoundPhotoUrls, photoCache),
                collectPhotoSrcById(localPrevPhotoIds, localRec.prevRoundPhotos, localRec.prevRoundPhotoUrls, photoCache)
            );
            var alignedPrev = alignPhotoSrcArrayToIds(mergedPrevPhotoIds, prevSrcById);
            if (alignedPrev.some(Boolean)) merged.prevRoundPhotos = alignedPrev;
            else delete merged.prevRoundPhotos;
            var packedPrevMap = Object.assign(
                {},
                collectPackedPhotoUrlMap(serverPrevPhotoIds, serverRec.prevRoundPhotoUrls, extractInlinePhotos(serverRec, 'prev'), photoCache),
                collectPackedPhotoUrlMap(localPrevPhotoIds, localRec.prevRoundPhotoUrls, extractInlinePhotos(localRec, 'prev'), photoCache)
            );
            var packedPrev = mergedPrevPhotoIds.map(function (pid) {
                return (pid && packedPrevMap[String(pid)]) || '';
            });
            if (packedPrev.some(Boolean)) merged.prevRoundPhotoUrls = packedPrev;
            else delete merged.prevRoundPhotoUrls;
        } else {
            merged.prevRoundPhotos = mergePhotoArrays(
                extractInlinePhotos(serverRec, 'prev'),
                extractInlinePhotos(localRec, 'prev')
            );
            delete merged.prevRoundPhotoIds;
            delete merged.prevRoundPhotoUrls;
        }

        merged.contentUpdatedAt = Math.max(serverContentTs, localContentTs, Number(merged.contentUpdatedAt) || 0);
        merged.positionUpdatedAt = Math.max(serverPosTs, localPosTs, Number(merged.positionUpdatedAt) || 0);
        merged.updatedAt = Math.max(
            getRecordUpdatedAt(serverRec, 'pin'),
            getRecordUpdatedAt(localRec, 'pin'),
            merged.contentUpdatedAt,
            merged.positionUpdatedAt,
            Number(merged.updatedAt) || 0
        );
        return merged;
    }

    function mergeNdtRecord(serverRec, localRec) {
        var serverTs = getRecordUpdatedAt(serverRec, 'ndt');
        var localTs = getRecordUpdatedAt(localRec, 'ndt');
        var newer = localTs >= serverTs ? localRec : serverRec;
        var older = localTs >= serverTs ? serverRec : localRec;
        return Object.assign({}, older, newer);
    }

    function mergeIdRecordArrays(serverArr, localArr, deletedIds, kind, deletedAtById, photoCache) {
        var deleted = new Set(deletedIds || []);
        var delAt = deletedAtById || {};
        var byId = new Map();
        var localById = new Map((localArr || []).filter(function (r) { return r && r.id; }).map(function (r) {
            return [r.id, r];
        }));
        (serverArr || []).forEach(function (rec) {
            if (!rec || !rec.id) return;
            var localMatch = localById.get(rec.id);
            var at = Number(delAt[rec.id]) || 0;
            if (deleted.has(rec.id)
                && !recordSurvivesDelete(rec, at, kind)
                && !recordSurvivesDelete(localMatch, at, kind)) {
                return;
            }
            if (localMatch) {
                if (kind === 'pin') byId.set(rec.id, mergeDefectRecord(rec, localMatch, photoCache));
                else if (kind === 'ndt') byId.set(rec.id, mergeNdtRecord(rec, localMatch));
                else {
                    byId.set(rec.id,
                        getRecordUpdatedAt(localMatch, kind) >= getRecordUpdatedAt(rec, kind) ? localMatch : rec
                    );
                }
            } else {
                byId.set(rec.id, Object.assign({}, rec));
            }
        });
        (localArr || []).forEach(function (rec) {
            if (!rec || !rec.id || byId.has(rec.id)) return;
            var at = Number(delAt[rec.id]) || 0;
            if (deleted.has(rec.id) && !recordSurvivesDelete(rec, at, kind)) return;
            byId.set(rec.id, Object.assign({}, rec));
        });
        return Array.from(byId.values());
    }

    function mergeDefectsMaps(serverMap, localMap, serverDeleted, localDeleted, serverDeletedAt, localDeletedAt, opts) {
        opts = opts || {};
        var photoCache = opts.photoCache;
        var mergedDeleted = mergeDeletedIdsMaps(serverDeleted, localDeleted);
        var mergedDeletedAt = mergeDeletedAtMaps(serverDeletedAt, localDeletedAt);
        Object.entries(mergedDeleted).forEach(function (entry) {
            var key = entry[0];
            var ids = entry[1];
            if (!mergedDeletedAt[key]) mergedDeletedAt[key] = {};
            (ids || []).forEach(function (id) {
                if (mergedDeletedAt[key][id] == null) mergedDeletedAt[key][id] = 0;
            });
        });
        var keys = new Set([].concat(
            Object.keys(serverMap || {}),
            Object.keys(localMap || {}),
            Object.keys(mergedDeleted || {})
        ));
        var defects = {};

        keys.forEach(function (key) {
            var delAt = mergedDeletedAt[key] || {};
            var deletedSet = new Set(mergedDeleted[key] || []);
            var serverArr = (serverMap && serverMap[key]) || [];
            var localArr = (localMap && localMap[key]) || [];
            var serverById = new Map((serverArr || []).filter(function (r) { return r && r.id; }).map(function (r) {
                return [r.id, r];
            }));
            var localById = new Map((localArr || []).filter(function (r) { return r && r.id; }).map(function (r) {
                return [r.id, r];
            }));

            var ordered = [];
            serverArr.forEach(function (sRec) {
                if (!sRec || !sRec.id) return;
                var lRec = localById.get(sRec.id);
                var at = Number(delAt[sRec.id]) || 0;
                if (deletedSet.has(sRec.id)
                    && !recordSurvivesDelete(sRec, at, 'pin')
                    && !recordSurvivesDelete(lRec, at, 'pin')) {
                    return;
                }
                ordered.push(lRec ? mergeDefectRecord(sRec, lRec, photoCache) : Object.assign({}, sRec));
            });
            localArr.forEach(function (lRec) {
                if (!lRec || !lRec.id || serverById.has(lRec.id)) return;
                var at = Number(delAt[lRec.id]) || 0;
                if (deletedSet.has(lRec.id) && !recordSurvivesDelete(lRec, at, 'pin')) return;
                ordered.push(Object.assign({}, lRec));
            });

            if (typeof opts.renumberFloorDefects === 'function') {
                opts.renumberFloorDefects(ordered, { preserveOrder: true });
            }
            defects[key] = ordered;

            var activeIds = new Set(ordered.map(function (d) { return d.id; }));
            var stillDeleted = [];
            var stillDeletedAt = {};
            deletedSet.forEach(function (id) {
                if (activeIds.has(id)) return;
                stillDeleted.push(id);
                stillDeletedAt[id] = Number(delAt[id]) || 0;
            });
            if (stillDeleted.length > 0) mergedDeleted[key] = stillDeleted;
            else delete mergedDeleted[key];
            if (Object.keys(stillDeletedAt).length > 0) mergedDeletedAt[key] = stillDeletedAt;
            else delete mergedDeletedAt[key];
        });

        return { defects: defects, deletedDefectIds: mergedDeleted, deletedDefectAt: mergedDeletedAt };
    }

    function mergeNdtDataMaps(serverMap, localMap, serverDeleted, localDeleted, serverDeletedAt, localDeletedAt) {
        var mergedDeleted = mergeDeletedIdsMaps(serverDeleted, localDeleted);
        var mergedDeletedAt = mergeDeletedAtMaps(serverDeletedAt, localDeletedAt);
        Object.entries(mergedDeleted).forEach(function (entry) {
            var key = entry[0];
            var ids = entry[1];
            if (!mergedDeletedAt[key]) mergedDeletedAt[key] = {};
            (ids || []).forEach(function (id) {
                if (mergedDeletedAt[key][id] == null) mergedDeletedAt[key][id] = 0;
            });
        });
        var keys = new Set([].concat(
            Object.keys(serverMap || {}),
            Object.keys(localMap || {}),
            Object.keys(mergedDeleted || {})
        ));
        var ndtData = {};
        keys.forEach(function (key) {
            ndtData[key] = mergeIdRecordArrays(
                serverMap && serverMap[key],
                localMap && localMap[key],
                mergedDeleted[key],
                'ndt',
                mergedDeletedAt[key]
            );
            var activeIds = new Set((ndtData[key] || []).map(function (d) { return d && d.id; }).filter(Boolean));
            var stillDeleted = (mergedDeleted[key] || []).filter(function (id) { return !activeIds.has(id); });
            if (stillDeleted.length) {
                mergedDeleted[key] = stillDeleted;
                var stillAt = {};
                stillDeleted.forEach(function (id) {
                    stillAt[id] = Number(mergedDeletedAt[key] && mergedDeletedAt[key][id]) || 0;
                });
                mergedDeletedAt[key] = stillAt;
            } else {
                delete mergedDeleted[key];
                delete mergedDeletedAt[key];
            }
        });
        return { ndtData: ndtData, deletedNdtIds: mergedDeleted, deletedNdtAt: mergedDeletedAt };
    }

    var api = {
        getRecordUpdatedAt: getRecordUpdatedAt,
        getDefectContentUpdatedAt: getDefectContentUpdatedAt,
        getDefectPositionUpdatedAt: getDefectPositionUpdatedAt,
        mergeDeletedIdsMaps: mergeDeletedIdsMaps,
        mergeDeletedAtMaps: mergeDeletedAtMaps,
        pickImportedText: pickImportedText,
        keepStoredIfUntouched: keepStoredIfUntouched,
        pickPhotoListSide: pickPhotoListSide,
        isOutdatedBuild: isOutdatedBuild,
        countKeptExistingOnImport: countKeptExistingOnImport,
        recordSurvivesDelete: recordSurvivesDelete,
        mergePhotoArrays: mergePhotoArrays,
        collectPhotoSrcById: collectPhotoSrcById,
        alignPhotoSrcArrayToIds: alignPhotoSrcArrayToIds,
        isLightweightCloudPhotoRef: isLightweightCloudPhotoRef,
        collectPackedPhotoUrlMap: collectPackedPhotoUrlMap,
        extractInlinePhotos: extractInlinePhotos,
        mergeDefectRecord: mergeDefectRecord,
        mergeNdtRecord: mergeNdtRecord,
        mergeIdRecordArrays: mergeIdRecordArrays,
        mergeDefectsMaps: mergeDefectsMaps,
        mergeNdtDataMaps: mergeNdtDataMaps
    };

    root.BSA = root.BSA || {};
    root.BSA.syncMerge = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
