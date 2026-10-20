/**
 * 2026-10-19 동기화 진행률 — 「오프라인에서 사진 넣고 마킹 움직이고 결함내용 고친 것이 얼마나 서버에 올라갔는지」.
 *
 * 이 기기에서 한 변경만 적는 일지(기기 저장소, 회사별). 서버 데이터는 읽지도 쓰지도 않는다.
 *  - 기록: 결함 내용 수정(touchDefectUpdatedAt) · 마킹 이동(touchDefectPositionUpdatedAt) · 마킹 삭제(묘비) ·
 *          비파괴 수정 · 새 사진(사진 ID 발급) — 같은 기록·같은 종류는 한 건으로 합친다.
 *  - 올라감 처리: **서버가 저장을 확인했을 때만** — 층 묶음 쓰기가 끝난 뒤(confirmFloor) · 사진이 Storage에 올라간 표시(confirmPhoto).
 *    층 묶음을 만든 뒤에 또 고친 것은 순번(seq)이 커서 남는다(다음 동기화에서 올라감).
 *  - 여러 기기: 일지는 기기마다 따로라 다른 기기 작업은 세지 않는다. 합치기·덮어쓰기 방지는 기존 동기화
 *    (칸별 병합·묘비·syncRev·floor-sync-guard)가 하고, 이 모듈은 거기에 손대지 않는다.
 * DOM·Firebase를 쓰지 않는다(그리기는 HTML 문자열만 만든다).
 */
(function (root) {
    'use strict';

    var KINDS = ['photo', 'move', 'edit', 'add', 'del', 'ndt', 'other'];
    var LABELS = {
        photo: '사진',
        move: '마킹 이동',
        edit: '결함 내용 수정',
        add: '새 마킹',
        del: '마킹 삭제',
        ndt: '비파괴 수정',
        other: '기타 변경(메모·도면 등, 층 단위)'
    };
    var ICONS = {
        photo: 'fa-camera', move: 'fa-up-down-left-right', edit: 'fa-pen', add: 'fa-location-dot',
        del: 'fa-trash-can', ndt: 'fa-hammer', other: 'fa-layer-group'
    };

    function emptyCounts() {
        var o = {};
        KINDS.forEach(function (k) { o[k] = 0; });
        return o;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function entryKey(kind, id) { return kind + '|' + id; }

    /**
     * opts.storage: { getItem(k), setItem(k, v) } (localStorage 모양) · opts.storageKey(): 회사별 키 · opts.now()
     */
    function createTracker(opts) {
        opts = opts || {};
        var storage = opts.storage || null;
        var keyFn = typeof opts.storageKey === 'function' ? opts.storageKey : function () { return 'bsa_sync_journal_v1'; };
        var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
        var data = null;
        var loadedKey = '';
        var listeners = [];

        function fresh() { return { v: 1, seq: 0, entries: {}, failures: {}, session: null }; }
        function load() {
            var k = keyFn();
            if (data && loadedKey === k) return data;
            loadedKey = k;
            data = fresh();
            try {
                var raw = storage && storage.getItem(k);
                var obj = raw ? JSON.parse(raw) : null;
                if (obj && typeof obj === 'object' && obj.entries) {
                    data.seq = Number(obj.seq) || 0;
                    data.entries = obj.entries || {};
                    data.failures = obj.failures || {};
                    data.session = obj.session || null;
                }
            } catch (_e) { /* 망가진 기록은 새로 */ }
            return data;
        }
        function save() {
            try { if (storage) storage.setItem(loadedKey || keyFn(), JSON.stringify(data)); } catch (_e) { /* 용량 부족 무시 */ }
            listeners.slice().forEach(function (fn) { try { fn(); } catch (_e) { /* ignore */ } });
        }
        /** 2026-10-19 건물별 진행률: 이번 회차에 층(fk)마다 올라간 수 */
        function sessionDoneFk(fk, kind) {
            var s = data.session;
            if (!s || s.finishedAt || !fk) return;
            if (!s.doneFk) s.doneFk = {};
            if (!s.doneFk[fk]) s.doneFk[fk] = {};
            s.doneFk[fk][kind] = (s.doneFk[fk][kind] || 0) + 1;
        }
        function sessionAdd(kind, n) {
            var s = data.session;
            if (!s || s.finishedAt) return;
            s.total[kind] = (s.total[kind] || 0) + n;
        }

        /** 이 기기에서 한 변경 하나. fk(층 키)는 사진이면 몰라도 된다. 반환: 순번 */
        function record(kind, id, fk) {
            if (KINDS.indexOf(kind) < 0 || kind === 'other' || !id) return 0;
            load();
            // 끝난 진행 상황 위에 새 변경이 오면 새로 센다
            if (data.session && data.session.finishedAt) data.session = null;
            var k = entryKey(kind, id);
            data.seq += 1;
            var e = data.entries[k];
            if (e) {
                e.seq = data.seq;
                e.at = now();
                if (fk) e.fk = fk;
            } else {
                // 새 마킹을 만든 뒤 고친 것은 「새 마킹」 한 건으로만 센다
                if (kind === 'edit' && data.entries[entryKey('add', id)]) {
                    data.entries[entryKey('add', id)].seq = data.seq;
                    save();
                    return data.seq;
                }
                data.entries[k] = { k: kind, id: String(id), fk: fk || '', seq: data.seq, at: now() };
                sessionAdd(kind, 1);
                // 지운 마킹: 아직 안 올린 이동·수정은 지우기 한 건으로 합친다
                if (kind === 'del') {
                    ['move', 'edit', 'add'].forEach(function (kk) {
                        var ek = entryKey(kk, id);
                        if (data.entries[ek]) {
                            if (data.session && !data.session.finishedAt) data.session.total[kk] = Math.max(0, (data.session.total[kk] || 0) - 1);
                            delete data.entries[ek];
                        }
                    });
                }
            }
            save();
            return data.seq;
        }

        /** 지금까지 적은 순번 — 층 묶음을 만들 때 받아 두고, 서버 확인 뒤 confirmFloor에 넘긴다 */
        function mark() { load(); return data.seq; }

        /**
         * 서버가 층 묶음 저장을 확인했다. 그 층에서 mark 이하 순번의 변경(사진 제외)을 올라간 것으로.
         * ids(선택): 이번에 올린 기록 id 목록 — 층 키를 모르고 적힌 변경도 id가 맞으면 올라간 것으로.
         * 반환: { confirmed, remaining } — remaining>0이면 업로드 중에 또 고친 것(층을 다시 올릴 대상으로).
         */
        function confirmFloor(fk, upToSeq, ids) {
            load();
            var idSet = null;
            if (ids && ids.length) { idSet = {}; ids.forEach(function (x) { idSet[String(x)] = 1; }); }
            var confirmed = 0;
            var remaining = 0;
            var remainingKeys = [];
            Object.keys(data.entries).forEach(function (k) {
                var e = data.entries[k];
                if (!e || e.k === 'photo') return;
                var mine = e.fk ? e.fk === fk : !!(idSet && idSet[e.id]);
                if (!mine) return;
                if (e.seq <= upToSeq) {
                    delete data.entries[k];
                    confirmed++;
                    if (data.session && !data.session.finishedAt) data.session.done[e.k] = (data.session.done[e.k] || 0) + 1;
                    sessionDoneFk(e.fk || fk, e.k);
                } else {
                    remaining++;
                    if (remainingKeys.length < 20) remainingKeys.push(e.k + ':' + e.id + '@' + e.seq);
                }
            });
            if (data.session && !data.session.finishedAt && data.session.otherFk && data.session.otherFk[fk] === 0) {
                data.session.otherFk[fk] = 1;
                data.session.done.other = (data.session.done.other || 0) + 1;
                sessionDoneFk(fk, 'other');
            }
            delete data.failures[fk];
            save();
            return { confirmed: confirmed, remaining: remaining, remainingKeys: remainingKeys };
        }

        /** 사진이 서버(Storage)에 올라간 것이 확인됐다 */
        function confirmPhoto(id) {
            load();
            var k = entryKey('photo', id);
            if (!data.entries[k]) return false;
            var pfk = data.entries[k].fk || '';
            delete data.entries[k];
            delete data.failures['photo:' + id];
            if (data.session && !data.session.finishedAt) data.session.done.photo = (data.session.done.photo || 0) + 1;
            sessionDoneFk(pfk, 'photo');
            save();
            return true;
        }

        /** 더는 안 쓰는 변경(지운 사진 등) — 올라간 것이 아니라 셀 필요가 없어진 것 */
        function drop(kind, id) {
            load();
            var k = entryKey(kind, id);
            if (!data.entries[k]) return false;
            delete data.entries[k];
            if (data.session && !data.session.finishedAt) data.session.total[kind] = Math.max(0, (data.session.total[kind] || 0) - 1);
            save();
            return true;
        }

        function noteFailure(where, reason) {
            if (!where) return;
            load();
            data.failures[String(where)] = { reason: String(reason || '실패'), at: now() };
            save();
        }
        function clearFailure(where) {
            load();
            if (data.failures[where]) { delete data.failures[where]; save(); }
        }

        /** 올리기 시작 — 지금 남은 것을 「전체」로 잡는다(이미 진행 중이면 그대로) */
        function startSession(dirtyFloorKeys) {
            load();
            if (data.session && !data.session.finishedAt) return data.session;
            var total = emptyCounts();
            Object.keys(data.entries).forEach(function (k) { var e = data.entries[k]; if (e) total[e.k] = (total[e.k] || 0) + 1; });
            var otherFk = {};
            (dirtyFloorKeys || []).forEach(function (fk) {
                if (!hasFloorEntries(fk)) { otherFk[fk] = 0; total.other += 1; }
            });
            data.session = { startedAt: now(), finishedAt: 0, total: total, done: emptyCounts(), otherFk: otherFk };
            save();
            return data.session;
        }
        function hasFloorEntries(fk) {
            return Object.keys(data.entries).some(function (k) { var e = data.entries[k]; return e && e.k !== 'photo' && e.fk === fk; });
        }

        /**
         * 화면에 보일 숫자.
         * ctx.dirtyFloorKeys: 아직 안 올라간 층(앱의 dirty 집합) · ctx.isNewOnServer(id, fk): 서버에 없는 마킹이면 true
         * ctx.photoState(id): 'uploaded' | 'pending' | 'gone' — 서버에 올라간 것이 확인되면 uploaded, 결함에서 빠졌으면 gone
         * ctx.online · ctx.syncing
         */
        function summary(ctx) {
            ctx = ctx || {};
            load();
            var dirty = (ctx.dirtyFloorKeys || []).map(String);
            var changed = false;
            var tNow = now();
            var sess = data.session && !data.session.finishedAt ? data.session : null;
            Object.keys(data.entries).forEach(function (k) {
                var e = data.entries[k];
                if (!e) return;
                if (e.k === 'photo') {
                    // 사진: 'uploaded'(서버 표시·서버 주소 확인) → 올라감 / 'gone'(더는 안 붙어 있음, 1분 지남) → 뺌
                    var ps = typeof ctx.photoState === 'function' ? ctx.photoState(e.id) : 'pending';
                    if (ps === 'uploaded') {
                        delete data.entries[k];
                        delete data.failures['photo:' + e.id];
                        if (sess) sess.done.photo = (sess.done.photo || 0) + 1;
                        sessionDoneFk(e.fk || '', 'photo');
                        changed = true;
                    } else if (ps === 'gone' && tNow - (e.at || 0) > 60000) {
                        delete data.entries[k];
                        if (sess) sess.total.photo = Math.max(0, (sess.total.photo || 0) - 1);
                        changed = true;
                    }
                    return;
                }
                // 층 변경: 그 층이 더는 「올릴 것」이 아니면(층을 지움 등) 남길 이유가 없다 — 올라감으로 세지 않고 뺀다
                if (ctx.dirtyFloorKeys && e.fk && dirty.indexOf(e.fk) < 0 && tNow - (e.at || 0) > 5000) {
                    delete data.entries[k];
                    if (sess) sess.total[e.k] = Math.max(0, (sess.total[e.k] || 0) - 1);
                    changed = true;
                } else if (!e.fk && tNow - (e.at || 0) > 86400000) {
                    delete data.entries[k];
                    if (sess) sess.total[e.k] = Math.max(0, (sess.total[e.k] || 0) - 1);
                    changed = true;
                }
            });
            var pending = emptyCounts();
            var oldestAt = 0;
            Object.keys(data.entries).forEach(function (k) {
                var e = data.entries[k];
                if (!e) return;
                pending[e.k] = (pending[e.k] || 0) + 1;
                if (!oldestAt || (e.at && e.at < oldestAt)) oldestAt = e.at || 0;
            });
            // 일지에 없는데 안 올라간 층(메모·도면·이 기능 전에 한 변경 등) — 층 단위로
            var otherPendingFk = dirty.filter(function (fk) { return !hasFloorEntries(fk); });
            pending.other = otherPendingFk.length;
            var s = data.session && !data.session.finishedAt ? data.session : null;
            if (s) {
                otherPendingFk.forEach(function (fk) {
                    if (!(fk in s.otherFk)) { s.otherFk[fk] = 0; s.total.other = (s.total.other || 0) + 1; changed = true; }
                });
            }
            var rows = [];
            var tot = 0;
            var dn = 0;
            var pd = 0;
            KINDS.forEach(function (kind) {
                var p = pending[kind] || 0;
                var total = s ? Math.max(s.total[kind] || 0, (s.done[kind] || 0) + p) : p;
                var done = s ? Math.min(s.done[kind] || 0, total) : 0;
                if (!total && !p) return;
                rows.push({ kind: kind, label: LABELS[kind], icon: ICONS[kind], total: total, done: done, pending: p });
                tot += total;
                dn += done;
                pd += p;
            });
            var failures = Object.keys(data.failures).map(function (w) {
                return { where: w, reason: data.failures[w].reason, at: data.failures[w].at };
            });
            var allDone = pd === 0;
            var finishedNow = false;
            if (s && allDone && !ctx.syncing) {
                s.finishedAt = now();
                changed = true;
                finishedNow = true;
            }
            var finishedSession = data.session && data.session.finishedAt ? data.session : null;
            if (changed) save();
            return {
                rows: rows,
                total: tot,
                done: dn,
                pending: pd,
                percent: tot ? Math.round((dn / tot) * 100) : 100,
                allDone: allDone,
                finishedNow: finishedNow,
                finishedAt: finishedSession ? finishedSession.finishedAt : 0,
                sessionActive: !!s && !s.finishedAt,
                sessionTotal: s ? tot : (finishedSession ? KINDS.reduce(function (n, k) { return n + (finishedSession.total[k] || 0); }, 0) : 0),
                oldestAt: oldestAt,
                failures: failures,
                online: ctx.online !== false,
                syncing: !!ctx.syncing
            };
        }

        /**
         * 2026-10-19 건물 하나(층 키 앞부분 「건물id_」)만의 진행률 — 오프라인 준비 창에 건물마다 보여 줄 때.
         * 모양은 summary()와 같다(renderPanelHtml에 그대로 넘긴다). 전체 summary로 먼저 정리한 뒤 센다.
         */
        function summaryFor(ctx, prefix) {
            var g = summary(ctx);
            var pre = String(prefix || '');
            var inB = function (fk) { return !!fk && String(fk).indexOf(pre) === 0; };
            var dirty = ((ctx && ctx.dirtyFloorKeys) || []).map(String);
            var pending = emptyCounts();
            var oldestAt = 0;
            Object.keys(data.entries).forEach(function (k) {
                var e = data.entries[k];
                if (!e || !inB(e.fk)) return;
                pending[e.k] = (pending[e.k] || 0) + 1;
                if (!oldestAt || (e.at && e.at < oldestAt)) oldestAt = e.at || 0;
            });
            pending.other = dirty.filter(function (fk) { return inB(fk) && !hasFloorEntries(fk); }).length;
            var s = data.session || null;
            var done = emptyCounts();
            if (s && s.doneFk) {
                Object.keys(s.doneFk).forEach(function (fk) {
                    if (!inB(fk)) return;
                    Object.keys(s.doneFk[fk]).forEach(function (kind) { done[kind] = (done[kind] || 0) + (s.doneFk[fk][kind] || 0); });
                });
            }
            var rows = [];
            var tot = 0; var dn = 0; var pd = 0;
            KINDS.forEach(function (kind) {
                var p = pending[kind] || 0;
                var d = done[kind] || 0;
                if (!p && !d) return;
                rows.push({ kind: kind, label: LABELS[kind], icon: ICONS[kind], total: p + d, done: d, pending: p });
                tot += p + d; dn += d; pd += p;
            });
            var failures = g.failures.filter(function (f) {
                var w = String(f.where || '');
                if (w === 'sync') return true;
                if (w.indexOf('photo:') === 0) return !!(ctx && typeof ctx.photoInBuilding === 'function' && ctx.photoInBuilding(w.slice(6)));
                return inB(w);
            });
            return {
                rows: rows, total: tot, done: dn, pending: pd,
                percent: tot ? Math.round((dn / tot) * 100) : 100,
                allDone: pd === 0, finishedNow: false,
                finishedAt: g.finishedAt, sessionActive: g.sessionActive, sessionTotal: tot,
                oldestAt: oldestAt, failures: failures, online: g.online, syncing: g.syncing
            };
        }

        function pendingEntries() {
            load();
            return Object.keys(data.entries).map(function (k) { return Object.assign({}, data.entries[k]); });
        }
        function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
        function reset() { data = fresh(); loadedKey = keyFn(); save(); }

        return {
            record: record, mark: mark, confirmFloor: confirmFloor, confirmPhoto: confirmPhoto, drop: drop,
            noteFailure: noteFailure, clearFailure: clearFailure, startSession: startSession,
            summary: summary, summaryFor: summaryFor, pendingEntries: pendingEntries, onChange: onChange, reset: reset,
            _data: function () { return load(); }
        };
    }

    /** 배지(작은 알약) 글자 — 없으면 '' */
    function pillText(sum) {
        if (!sum) return '';
        if (!sum.online) return sum.pending ? '안 올라간 변경 ' + sum.pending + '건' : '';
        if (sum.pending) {
            if (sum.syncing || sum.sessionActive) return '서버에 올리는 중 ' + sum.done + '/' + sum.total;
            return '안 올라간 변경 ' + sum.pending + '건';
        }
        if (sum.finishedAt) return '모두 서버에 올라감';
        return '';
    }

    function failureLabel(f, floorLabel) {
        var w = String(f.where || '');
        var place = w.indexOf('photo:') === 0 ? '사진' : (typeof floorLabel === 'function' ? (floorLabel(w) || w) : w);
        return place + ' — ' + f.reason;
    }

    /** 진행률 창 안쪽 HTML(문자열). floorLabel(fk): 층 이름 */
    function renderPanelHtml(sum, floorLabel) {
        if (!sum) return '';
        var head;
        if (!sum.pending) {
            head = '<div class="bsp-state bsp-ok"><i class="fa-solid fa-circle-check"></i> 모두 서버에 올라감</div>';
        } else if (!sum.online) {
            head = '<div class="bsp-state bsp-off"><i class="fa-solid fa-wifi-slash"></i> 오프라인 — 인터넷이 연결되면 자동으로 올립니다</div>';
        } else if (sum.syncing || sum.sessionActive) {
            head = '<div class="bsp-state bsp-run"><i class="fa-solid fa-arrows-rotate fa-spin"></i> 서버에 올리는 중</div>';
        } else {
            head = '<div class="bsp-state bsp-wait"><i class="fa-solid fa-clock"></i> 올릴 차례를 기다리는 중</div>';
        }
        var bar = '<div class="bsp-total"><div class="bsp-total-num"><b>' + sum.done + '</b> / ' + sum.total + ' 올라감'
            + (sum.pending ? ' <span class="bsp-left">남음 ' + sum.pending + '</span>' : '') + '</div>'
            + '<div class="bsp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + sum.percent + '"><span style="width:' + sum.percent + '%"></span></div></div>';
        var rows = sum.rows.length ? sum.rows.map(function (r) {
            var pct = r.total ? Math.round((r.done / r.total) * 100) : 100;
            return '<li class="bsp-row' + (r.pending ? '' : ' bsp-row-done') + '" data-kind="' + r.kind + '">'
                + '<i class="fa-solid ' + r.icon + ' bsp-ic"></i>'
                + '<span class="bsp-name">' + esc(r.label) + '</span>'
                + '<span class="bsp-cnt">' + (r.pending ? '<span class="bsp-left">남음 ' + r.pending + '</span> ' : '<i class="fa-solid fa-check"></i> ') + r.done + '/' + r.total + '</span>'
                + '<span class="bsp-mini"><span style="width:' + pct + '%"></span></span>'
                + '</li>';
        }).join('') : '<li class="bsp-empty">이 기기에 안 올라간 변경이 없습니다.</li>';
        var fails = sum.failures.length
            ? '<div class="bsp-fail"><div class="bsp-fail-title"><i class="fa-solid fa-triangle-exclamation"></i> 올리기 실패 ' + sum.failures.length + '건 — 다시 시도합니다</div><ul>'
                + sum.failures.slice(0, 8).map(function (f) { return '<li>' + esc(failureLabel(f, floorLabel)) + '</li>'; }).join('')
                + '</ul></div>'
            : '';
        var note = '<p class="bsp-note">이 기기에서 한 변경만 셉니다. 서버가 저장을 확인한 것만 「올라감」으로 셉니다.</p>';
        return head + bar + '<ul class="bsp-rows">' + rows + '</ul>' + fails + note;
    }

    /**
     * 2026-10-19 「최신으로 다시 받기」 상태 글자. st: { running, phase, done, total, at, ok, failed, error, kind } · fmt(ts)
     * prepRec: 오프라인 준비 기록(있으면) — 다시 받은 적 없을 때 준비 완료 시각을 보여 준다
     */
    function refreshStatusText(st, prepRec, fmt) {
        var f = typeof fmt === 'function' ? fmt : function (t) { return new Date(t).toLocaleString(); };
        if (st && st.running) {
            if (st.phase === 'drawings') return '다시 받는 중 · 도면 ' + (st.done || 0) + '/' + (st.total || 0);
            if (st.phase === 'photos') return '다시 받는 중 · 사진 ' + (st.done || 0) + '/' + (st.total || 0);
            if (st.phase === 'done') return '다시 받는 중 · 마무리';
            if (st.phase === 'upload') return '먼저 서버에 올리는 중';
            return '다시 받는 중 ' + (st.done || 0) + '/' + (st.total || 0) + '층';
        }
        if (st && st.error) return '다시 받기 실패 — ' + st.error;
        if (st && st.at) {
            if (st.ok === false) {
                var n = (st.failed && st.failed.length) || 0;
                return '일부만 받음' + (n ? ' (층 ' + n + '개 못 받음)' : '') + ' · ' + f(st.at) + ' — 「최신으로 다시 받기」를 눌러 주세요';
            }
            return st.kind === 'floors' ? '최신 층 데이터 받음 (' + f(st.at) + ')' : '오프라인 준비 완료 (' + f(st.at) + ')';
        }
        if (prepRec && prepRec.at) return prepRec.complete ? '오프라인 준비 완료 (' + f(prepRec.at) + ')' : '오프라인 준비 일부만 됨 (' + f(prepRec.at) + ')';
        return '오프라인 준비 안 함';
    }

    var api = {
        KINDS: KINDS, LABELS: LABELS, createTracker: createTracker, pillText: pillText,
        renderPanelHtml: renderPanelHtml, emptyCounts: emptyCounts, refreshStatusText: refreshStatusText
    };
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.syncProgress = api;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);
