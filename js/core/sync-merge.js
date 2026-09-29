/**
 * 다기기 동기화: 결함/NDT 고유코드 병합 + 삭제 묘비(tombstone).
 * DOM·Firebase는 쓰지 않는다. 사진 캐시는 호출 측에서 넘긴다.
 */
(function (root) {
    'use strict';

    // 수정 이력 합치기. 브라우저는 index.html이 edit-history.js를 먼저 싣고,
    // Node 테스트는 require로 가져온다 (로드 순서는 test-edit-history.js가 지킨다).
    var editHistory = (root.BSA && root.BSA.editHistory)
        || (typeof require === 'function' ? require('./edit-history.js') : null);

    var DEFECT_POSITION_FIELDS = [
        'x', 'y', 'targetX', 'targetY', 'mapMarkedAt', 'mapUnregistered',
        'vertices', 'points', 'areaAngle', 'width', 'height', 'rotation',
        'shapeType', 'areaX1', 'areaY1', 'areaX2', 'areaY2', 'areaShape',
        'areaPoints', 'areaDrawings', 'areaFillStyle', 'areaBorderStyle'
    ];

    /**
     * 묶음(그룹) 소속 칸. 2026-09-28: 「통합 해제」 뒤 다시 통합됨 — 병합이 groupId를 항상 서버 것으로
     * 되살렸다(기기에서 지운 칸은 Object.assign에 안 남음). 묶기·풀기 때 groupUpdatedAt을 찍고,
     * 둘 중 하나라도 찍혀 있으면 나중 쪽의 소속을 통째로 따른다(없는 칸은 지움).
     */
    var DEFECT_GROUP_FIELDS = ['groupId', 'groupNo', 'mergedFrom', 'surveyNumbered'];

    function getDefectGroupUpdatedAt(rec) {
        return Number(rec && rec.groupUpdatedAt) || 0;
    }

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
    /**
     * 건물(회차) 휴지통 상태 병합 — 2026-09-21.
     * 예전엔 복원 표시(_trashRestoredAt)가 복원한 기기에만 있고 서버로 안 올라가서,
     * 휴지통 상태를 들고 있던 다른 기기가 동기화 때 휴지통으로 되돌렸다(→ 30일 뒤 그 기기가
     * 영구 삭제하면 모든 기기에서 사라짐). 복원 시각(trashRestoredAt)을 서버에도 올리고,
     * 휴지통 시각과 복원 시각 중 나중 것을 따른다.
     * 반환: { trashedAt: string|null, trashRestoredAt: string|null }
     */
    function resolveBuildingTrashState(localB, remoteB) {
        function at(v) {
            var t = v ? Date.parse(String(v)) : NaN;
            return isFinite(t) ? t : 0;
        }
        function latest(list) {
            var best = null;
            var bestAt = 0;
            list.forEach(function (v) {
                var t = at(v);
                if (t > bestAt) { bestAt = t; best = String(v); }
            });
            return { value: best, at: bestAt };
        }
        var trash = latest([localB && localB.trashedAt, remoteB && remoteB.trashedAt]);
        var restore = latest([
            localB && localB._trashRestoredAt,
            localB && localB.trashRestoredAt,
            remoteB && remoteB.trashRestoredAt
        ]);
        if (trash.at && trash.at > restore.at) {
            return { trashedAt: trash.value, trashRestoredAt: restore.value };
        }
        return { trashedAt: null, trashRestoredAt: restore.value };
    }

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

    // -----------------------------------------------------------------------------------------
    // 칸 단위·사진 ID 단위 병합 (2026-09-29)
    //
    // 두 사람이 오프라인에서 같은 결함을 고치면(A는 비고, B는 폭) 결함 한 건을 통째로 "나중에 고친 쪽"이
    // 이겨서 A의 비고가 사라졌다. 사진도 목록 통째라, A가 지우고 B가 추가하면 한쪽이 사라지거나 지운
    // 사진이 (파일은 이미 지워져) 깨진 채 되살아났다.
    //
    // - fieldAt { 칸: 시각 }: touchDefectUpdatedAt이 직전 값과 비교해 **바뀐 칸만** 찍는다.
    //   contentBaseAt: 칸별 기록을 시작하기 전(또는 무엇이 바뀌었는지 모를 때) 모든 칸의 시각.
    //   칸 시각 = fieldAt[칸] || contentBaseAt || contentUpdatedAt(옛 데이터 → 예전처럼 통째).
    // - photoState { 사진ID: 시각 }: +시각 = 그때 지움, -시각 = 그때 다시 넣음(되돌리기). 사진마다
    //   절댓값이 큰 쪽을 따르고, 기록이 없는 사진은 양쪽 목록을 합친다.
    // -----------------------------------------------------------------------------------------
    var NON_CONTENT_FIELDS = new Set([
        'id', 'no', 'groupNo', 'cadNo', 'isCadImported', 'groupId', 'surveyExtra', 'surveyNumbered', 'mergedFrom',
        'updatedAt', 'contentUpdatedAt', 'positionUpdatedAt', 'groupUpdatedAt', 'photosUpdatedAt',
        'fieldAt', 'contentBaseAt', 'photoState',
        'photos', 'photoIds', 'photoUrls', 'prevRoundPhotos', 'prevRoundPhotoIds', 'prevRoundPhotoUrls'
    ].concat(DEFECT_POSITION_FIELDS, DEFECT_GROUP_FIELDS));

    function isDefectContentField(key) {
        return !!key && key.charAt(0) !== '_' && !NON_CONTENT_FIELDS.has(key);
    }

    /** 값 비교용 짧은 해시(기기 메모리에만 둔다 — 서버에 안 올라감) */
    function hashValue(v) {
        var s;
        try { s = JSON.stringify(v === undefined ? null : v); } catch (_e) { s = String(v); }
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return h.toString(36) + ':' + s.length;
    }

    /** 결함 내용 칸 → 해시. touchDefectUpdatedAt이 직전 것과 비교해 바뀐 칸을 찾는다. */
    function defectContentHashes(rec) {
        var out = {};
        if (!rec) return out;
        Object.keys(rec).forEach(function (k) {
            if (isDefectContentField(k)) out[k] = hashValue(rec[k]);
        });
        return out;
    }

    /** 직전 해시(prev)와 지금 결함을 비교해 바뀐 칸 이름 */
    function changedContentFields(prevHashes, rec) {
        var cur = defectContentHashes(rec);
        var keys = new Set(Object.keys(prevHashes || {}).concat(Object.keys(cur)));
        var out = [];
        keys.forEach(function (k) {
            if ((prevHashes || {})[k] !== cur[k]) out.push(k);
        });
        return { changed: out, hashes: cur };
    }

    function isFieldTracked(rec) {
        return !!(rec && rec.fieldAt && typeof rec.fieldAt === 'object');
    }

    function contentBaseOf(rec) {
        if (rec && rec.contentBaseAt != null && isFinite(Number(rec.contentBaseAt))) return Number(rec.contentBaseAt);
        return getDefectContentUpdatedAt(rec);
    }

    function fieldTs(rec, key) {
        var fa = rec && rec.fieldAt;
        var t = fa && Number(fa[key]);
        return t > 0 ? t : contentBaseOf(rec);
    }

    /** merged(통째 병합 결과)의 내용 칸을 칸별로 다시 고른다. 동점이면 서버. */
    function applyFieldLevelContent(merged, serverRec, localRec) {
        if (!isFieldTracked(serverRec) && !isFieldTracked(localRec)) return;
        var keys = new Set();
        Object.keys(serverRec).concat(Object.keys(localRec)).forEach(function (k) {
            if (isDefectContentField(k)) keys.add(k);
        });
        var base = Math.max(contentBaseOf(serverRec), contentBaseOf(localRec));
        var fieldAt = {};
        keys.forEach(function (k) {
            var ts = fieldTs(serverRec, k);
            var tl = fieldTs(localRec, k);
            var win = tl > ts ? localRec : serverRec;
            var lose = win === localRec ? serverRec : localRec;
            if (win[k] !== undefined) merged[k] = win[k];
            else if (lose[k] !== undefined) merged[k] = lose[k];
            var t = Math.max(ts, tl);
            if (t > base) fieldAt[k] = t;
        });
        merged.fieldAt = fieldAt;
        merged.contentBaseAt = base;
    }

    function photoStateOf(rec) {
        return (rec && rec.photoState && typeof rec.photoState === 'object') ? rec.photoState : null;
    }

    /** 사진 ID에 박힌 생성 시각(고유 ID 꼬리 u + 36진 시각). 옛 자리 번호면 0. */
    function photoIdCreatedAt(pid) {
        // createDefectPhotoId: 'u' + Date.now().toString(36)(8자리, 2059년까지) + 난수
        var m = /_u([0-9a-z]{8})[0-9a-z]*$/.exec(String(pid || ''));
        if (!m) return 0;
        var t = parseInt(m[1], 36);
        return isFinite(t) ? t : 0;
    }

    /**
     * 사진 ID 단위 병합. 반환: 합친 ID 순서 + 합친 photoState. 한쪽이라도 photoState가 있어야 쓴다.
     * 기록이 없는 사진이 한쪽에만 있으면:
     *   - 사진을 나중에 바꾼 쪽이 photoState를 가진 새 기기면 → 그쪽은 모르는 사진(상대가 새로 넣음) → 살린다
     *   - 아니면(옛 기기가 나중) 예전 규칙: 나중 쪽 목록을 따르되, 그 뒤에 만든 고유 ID 사진은 살린다
     */
    function mergePhotoIdLists(serverRec, localRec) {
        var sIds = Array.isArray(serverRec.photoIds) ? serverRec.photoIds.filter(Boolean) : [];
        var lIds = Array.isArray(localRec.photoIds) ? localRec.photoIds.filter(Boolean) : [];
        var sState = photoStateOf(serverRec) || {};
        var lState = photoStateOf(localRec) || {};
        var sp = Number(serverRec.photosUpdatedAt) || 0;
        var lp = Number(localRec.photosUpdatedAt) || 0;
        var newer = lp > sp ? localRec : serverRec;
        var newerIds = newer === localRec ? lIds : sIds;
        var olderIds = newer === localRec ? sIds : lIds;
        var newerTracked = !!photoStateOf(newer);
        var newerAt = Math.max(sp, lp);

        var state = {};
        Object.keys(sState).concat(Object.keys(lState)).forEach(function (pid) {
            var a = Number(sState[pid]) || 0;
            var b = Number(lState[pid]) || 0;
            state[pid] = Math.abs(b) > Math.abs(a) ? b : a;
        });

        var inNewer = new Set(newerIds);
        var out = [];
        var seen = new Set();
        function keep(pid) {
            if (seen.has(pid)) return;
            var st = state[pid];
            if (st > 0) return;                       // 지운 기록이 더 나중
            if (!st && !inNewer.has(pid)) {
                // 한쪽(옛 쪽)에만 있고 기록 없음
                if (!newerTracked && !(photoIdCreatedAt(pid) > newerAt)) return;
            }
            seen.add(pid);
            out.push(pid);
        }
        newerIds.forEach(keep);
        olderIds.forEach(keep);
        return { ids: out, state: state };
    }

    function mergeDefectRecord(serverRec, localRec, photoCache) {
        if (!serverRec) return localRec ? Object.assign({}, localRec) : null;
        if (!localRec) return Object.assign({}, serverRec);

        // 시각이 같으면 **서버**를 따른다. 앱에서 고치면 시각이 항상 올라가므로, 같은 시각에 내용이
        // 다른 건 서버에 직접 넣은 복구뿐이다. 2026-09-27 겨자씨 「지하1층 주차장-2」: 9/21 서버 복구가
        // 시각을 안 올렸고, 9/19 껍데기를 든 옛 기기가 동점으로 이겨 9개를 되돌렸다.
        var serverContentTs = getDefectContentUpdatedAt(serverRec);
        var localContentTs = getDefectContentUpdatedAt(localRec);
        var localContentWins = localContentTs > serverContentTs;
        var contentNewer = localContentWins ? localRec : serverRec;
        var contentOlder = localContentWins ? serverRec : localRec;
        var merged = Object.assign({}, contentOlder, contentNewer);
        // 칸별 기록이 있으면 내용 칸은 칸마다 나중 것(2026-09-29). 없으면 위 통째 결과 그대로.
        applyFieldLevelContent(merged, serverRec, localRec);

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
        // 번호도 동점이면 서버 — 같은 날 창평 B1F에서 옛 기기의 옛 번호가 이겨 번호가 겹쳤다
        var noSource = localNoTs > serverNoTs ? localRec : serverRec;
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
        var serverGroupTs = getDefectGroupUpdatedAt(serverRec);
        var localGroupTs = getDefectGroupUpdatedAt(localRec);
        if (serverGroupTs > 0 || localGroupTs > 0) {
            // 동점이면 서버(다른 칸과 같은 규칙)
            var groupSide = localGroupTs > serverGroupTs ? localRec : serverRec;
            DEFECT_GROUP_FIELDS.forEach(function (field) {
                if (groupSide[field] === undefined) delete merged[field];
                else merged[field] = groupSide[field];
            });
            // 소속이 바뀐 경우 번호도 그쪽 것(묶이면 대표 번호, 풀리면 원래 번호)
            if (String(serverRec.groupId || '') !== String(localRec.groupId || '')
                && groupSide.no != null && groupSide.no !== '') {
                merged.no = groupSide.no;
            }
            merged.groupUpdatedAt = Math.max(serverGroupTs, localGroupTs);
        }

        var serverPhotoIds = Array.isArray(serverRec.photoIds) ? serverRec.photoIds : [];
        var localPhotoIds = Array.isArray(localRec.photoIds) ? localRec.photoIds : [];
        var idMerged = null;
        if ((photoStateOf(serverRec) || photoStateOf(localRec)) && (serverPhotoIds.length || localPhotoIds.length)) {
            // 사진 ID 단위(2026-09-29) — 고유 ID라 양쪽 이미지·URL을 섞어 써도 된다
            idMerged = mergePhotoIdLists(serverRec, localRec);
            merged.photoState = idMerged.state;
            merged.photosUpdatedAt = Math.max(Number(serverRec.photosUpdatedAt) || 0, Number(localRec.photosUpdatedAt) || 0);
            if (idMerged.ids.length) {
                merged.photoIds = idMerged.ids;
                var idSrc = Object.assign(
                    {},
                    collectPhotoSrcById(serverPhotoIds, serverRec.photos, serverRec.photoUrls, photoCache),
                    collectPhotoSrcById(localPhotoIds, localRec.photos, localRec.photoUrls, photoCache)
                );
                var idPhotos = alignPhotoSrcArrayToIds(idMerged.ids, idSrc);
                if (idPhotos.some(Boolean)) merged.photos = idPhotos;
                else delete merged.photos;
                var idUrlMap = Object.assign(
                    {},
                    collectPackedPhotoUrlMap(serverPhotoIds, serverRec.photoUrls, extractInlinePhotos(serverRec), photoCache),
                    collectPackedPhotoUrlMap(localPhotoIds, localRec.photoUrls, extractInlinePhotos(localRec), photoCache)
                );
                var idUrls = idMerged.ids.map(function (pid) { return idUrlMap[String(pid)] || ''; });
                if (idUrls.some(Boolean)) merged.photoUrls = idUrls;
                else delete merged.photoUrls;
            } else {
                delete merged.photoIds;
                delete merged.photos;
                delete merged.photoUrls;
            }
        }
        var photoSide = idMerged ? null : pickPhotoListSide(serverRec, localRec);
        if (idMerged) {
            // 위에서 처리함
        } else if (photoSide) {
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
        var mergedPhotoIds = (photoSide || idMerged) ? [] : mergePhotoArrays(serverPhotoIds, localPhotoIds);
        if (photoSide || idMerged) {
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

        // 수정 이력은 **합집합**이다. Object.assign이 덮어쓴 결과를 그대로 두면 오프라인에서
        // 각자 고친 기기 한쪽의 이력이 통째로 날아간다 — 균열 진전 기록이라 복구가 안 된다.
        if (editHistory) {
            var mergedHistory = editHistory.mergeHistories(serverRec.editHistory, localRec.editHistory);
            if (mergedHistory.length) merged.editHistory = mergedHistory;
            else delete merged.editHistory;
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

    // 비파괴 기록·부동침하 구역. 결함과 같은 이유로 시각이 같으면 서버 (2026-09-27)
    function mergeNdtRecord(serverRec, localRec) {
        var serverTs = getRecordUpdatedAt(serverRec, 'ndt');
        var localTs = getRecordUpdatedAt(localRec, 'ndt');
        var localWins = localTs > serverTs;
        var newer = localWins ? localRec : serverRec;
        var older = localWins ? serverRec : localRec;
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
        getDefectGroupUpdatedAt: getDefectGroupUpdatedAt,
        mergeDeletedIdsMaps: mergeDeletedIdsMaps,
        mergeDeletedAtMaps: mergeDeletedAtMaps,
        pickImportedText: pickImportedText,
        keepStoredIfUntouched: keepStoredIfUntouched,
        pickPhotoListSide: pickPhotoListSide,
        isDefectContentField: isDefectContentField,
        defectContentHashes: defectContentHashes,
        changedContentFields: changedContentFields,
        applyFieldLevelContent: applyFieldLevelContent,
        mergePhotoIdLists: mergePhotoIdLists,
        photoIdCreatedAt: photoIdCreatedAt,
        resolveBuildingTrashState: resolveBuildingTrashState,
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
