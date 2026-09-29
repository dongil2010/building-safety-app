/**
 * 현장 오류 기록 조회 화면 (2026-09-28).
 *
 * js/core/error-log.js가 태블릿 오류를 Firestore `errorLogs`에 남기지만, 읽으려면 Firebase 콘솔을
 * 열어야 해서 아무도 안 봤다. 홈 설정 패널의 "오류 기록" 버튼으로 앱 안에서 본다.
 *
 * - 읽기만 한다. 규칙상 errorLogs는 고치거나 지울 수 없다(firestore.rules).
 * - 같은 오류(숫자만 다른 것 포함 — error-log.js signatureOf)는 한 줄로 묶어 "몇 번·몇 대·언제"를 보인다.
 * - errorLogs는 회사 구분 없는 컬렉션이다. 규칙이 "그 기록의 회사 직원만 읽기"라서(2026-09-29)
 *   쿼리도 반드시 where('companyId','==',우리회사)로 좁힌다 — 안 좁히면 규칙이 쿼리 전체를 거부한다.
 * - 정렬(orderBy at)은 서버에서 하지 않는다. where와 섞으면 복합 색인이 필요한데 CI는 규칙만 게시한다.
 *   오류는 기기당 하루 30건으로 막혀 있어 회사 전체를 받아 화면에서 정렬해도 양이 적다(FETCH_LIMIT가 안전장치).
 */
(function (root) {
    'use strict';

    const FETCH_LIMIT = 2000;
    const DAY_MS = 24 * 60 * 60 * 1000;

    function timeOf(log) {
        const at = log && log.at;
        if (at && typeof at.toMillis === 'function') {
            try { return at.toMillis(); } catch (_e) { /* 아래로 */ }
        }
        if (at && typeof at.seconds === 'number') return at.seconds * 1000;
        const local = Number(log && log.atLocal);
        return Number.isFinite(local) && local > 0 ? local : 0;
    }

    /** userAgent를 사람이 알아볼 기기 이름으로 */
    function deviceLabel(ua) {
        const s = String(ua || '');
        if (!s) return '알 수 없는 기기';
        if (/SM-[TX]\d|Tab|iPad/i.test(s)) return /iPad/i.test(s) ? 'iPad' : 'Android 태블릿';
        if (/Android/i.test(s)) return /Mobile/i.test(s) ? 'Android 폰' : 'Android 태블릿';
        if (/iPhone/i.test(s)) return 'iPhone';
        if (/Windows/i.test(s)) return 'Windows PC';
        if (/Macintosh|Mac OS/i.test(s)) return 'Mac';
        return '기타 기기';
    }

    function signatureOf(log) {
        const api = root.BSA && root.BSA.errorLog;
        if (api && typeof api.signatureOf === 'function') return api.signatureOf(log);
        return [log && log.kind, log && log.message, log && log.source].join('|').replace(/\d+/g, '#').slice(0, 200);
    }

    /** 우리 회사 것만(로그인 전 오류는 회사가 비어 있어 같이 보인다), 기간 안의 것만 */
    function filterLogs(logs, opts) {
        const o = opts || {};
        const since = Number(o.since) || 0;
        const companyId = o.companyId || '';
        return (logs || []).filter(function (log) {
            if (!log) return false;
            if (companyId && log.companyId && log.companyId !== companyId) return false;
            return timeOf(log) >= since;
        });
    }

    /**
     * 같은 오류끼리 묶는다. 최근에 난 묶음이 위로.
     * 반환: [{ sig, kind, message, source, count, devices, users, versions, first, last, samples }]
     * samples는 최근 것부터 최대 5건(자세히 볼 때 스택·주소를 보여 준다).
     */
    function groupLogs(logs) {
        const map = new Map();
        (logs || []).forEach(function (log) {
            if (!log) return;
            const sig = signatureOf(log);
            let g = map.get(sig);
            if (!g) {
                g = {
                    sig: sig, kind: log.kind || 'error', message: log.message || '', source: log.source || '',
                    count: 0, devices: new Set(), users: new Set(), versions: new Set(),
                    first: Infinity, last: 0, samples: []
                };
                map.set(sig, g);
            }
            const t = timeOf(log);
            g.count += 1;
            g.devices.add(log.deviceId || log.device || '?');
            if (log.userName) g.users.add(log.userName);
            if (log.appVersion) g.versions.add(log.appVersion);
            if (t && t < g.first) g.first = t;
            if (t > g.last) {
                g.last = t;
                g.message = log.message || g.message;   // 숫자가 다른 변종 중 가장 최근 문구
            }
            g.samples.push(log);
        });
        return Array.from(map.values()).map(function (g) {
            g.samples.sort(function (a, b) { return timeOf(b) - timeOf(a); });
            return {
                sig: g.sig, kind: g.kind, message: g.message, source: g.source, count: g.count,
                devices: g.devices.size, users: Array.from(g.users), versions: Array.from(g.versions).sort().reverse(),
                first: g.first === Infinity ? 0 : g.first, last: g.last, samples: g.samples.slice(0, 5)
            };
        }).sort(function (a, b) { return b.last - a.last; });
    }

    function formatTime(ms) {
        if (!ms) return '-';
        const d = new Date(ms);
        const p = function (n) { return n < 10 ? '0' + n : String(n); };
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function kindLabel(kind) {
        if (kind === 'unhandledrejection') return '처리 안 된 비동기 오류';
        if (kind === 'error') return '오류';
        return String(kind || '오류');
    }

    /** 규칙(그 회사 직원만)을 통과하는 쿼리 — 회사로 좁히고, 정렬은 받은 뒤 화면에서 */
    function buildQuery(db, companyId) {
        return db.collection('errorLogs').where('companyId', '==', companyId).limit(FETCH_LIMIT);
    }

    const api = {
        FETCH_LIMIT: FETCH_LIMIT,
        buildQuery: buildQuery,
        timeOf: timeOf,
        deviceLabel: deviceLabel,
        filterLogs: filterLogs,
        groupLogs: groupLogs,
        formatTime: formatTime,
        kindLabel: kindLabel
    };

    // --- 여기부터는 브라우저에서만 ---
    if (root && root.document) {
        const doc = root.document;
        let cache = null;        // 마지막으로 받은 원본 목록
        let loading = false;

        function esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function el(id) { return doc.getElementById(id); }

        function currentOpts() {
            const days = Number((el('errorLogRange') || {}).value) || 7;
            const st = root.state || {};
            return { since: Date.now() - days * DAY_MS, companyId: st.companyId || '' };
        }

        function setStatus(text) {
            const s = el('errorLogStatus');
            if (s) s.textContent = text || '';
        }

        function render() {
            const list = el('errorLogList');
            if (!list) return;
            if (!cache) { list.innerHTML = ''; return; }
            const logs = filterLogs(cache, currentOpts());
            const groups = groupLogs(logs);
            const devices = new Set(logs.map(function (l) { return l.deviceId || l.device || '?'; }));
            setStatus(logs.length
                ? '오류 ' + logs.length + '건 · 종류 ' + groups.length + '가지 · 기기 ' + devices.size + '대'
                    + (cache.length >= FETCH_LIMIT ? ' (기록이 ' + FETCH_LIMIT + '건을 넘어 일부만 받았습니다 — 최근 것이 빠졌을 수 있음)' : '')
                : '이 기간에 기록된 오류가 없습니다. 👍');
            list.innerHTML = groups.map(function (g, i) {
                const users = g.users.length ? g.users.slice(0, 3).join(', ') + (g.users.length > 3 ? ' 외' : '') : '로그인 전';
                const samples = g.samples.map(function (s) {
                    return '<div class="error-log-sample">'
                        + '<div class="error-log-sample-head">' + esc(formatTime(timeOf(s))) + ' · ' + esc(s.userName || '로그인 전')
                        + ' · ' + esc(deviceLabel(s.device)) + ' · v' + esc(s.appVersion || '?') + (s.online === false ? ' · 오프라인' : '') + '</div>'
                        + (s.source ? '<div class="error-log-sample-line">위치: ' + esc(s.source) + '</div>' : '')
                        + (s.url ? '<div class="error-log-sample-line">화면: ' + esc(s.url) + '</div>' : '')
                        + (s.stack ? '<pre class="error-log-stack">' + esc(s.stack) + '</pre>' : '')
                        + '</div>';
                }).join('');
                return '<details class="error-log-group"' + (i === 0 ? ' open' : '') + '>'
                    + '<summary>'
                    + '<span class="error-log-count" title="같은 오류가 난 횟수">' + g.count + '회</span>'
                    + '<span class="error-log-msg">' + esc(g.message) + '</span>'
                    + '<span class="error-log-meta">' + esc(kindLabel(g.kind)) + ' · 기기 ' + g.devices + '대 · ' + esc(users)
                    + ' · 마지막 ' + esc(formatTime(g.last))
                    + (g.versions.length ? ' · v' + esc(g.versions[0]) : '') + '</span>'
                    + '</summary>'
                    + samples
                    + '</details>';
            }).join('');
        }

        async function load() {
            if (loading) return;
            const fb = root.firebase;
            const user = fb && fb.auth && fb.auth().currentUser;
            if (!fb || !fb.apps || !fb.apps.length || !user) {
                setStatus('로그인한 뒤에 볼 수 있습니다.');
                return;
            }
            if (root.navigator && root.navigator.onLine === false) {
                setStatus('오프라인입니다. 인터넷에 연결된 뒤 다시 열어 주세요.');
                return;
            }
            const companyId = (root.state && root.state.companyId) || '';
            if (!companyId) {
                setStatus('회사에 소속된 계정만 볼 수 있습니다.');
                return;
            }
            loading = true;
            setStatus('불러오는 중…');
            try {
                const snap = await buildQuery(fb.firestore(), companyId).get();
                cache = snap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data()); });
                cache.sort(function (a, b) { return timeOf(b) - timeOf(a); });
                render();
            } catch (e) {
                setStatus('불러오지 못했습니다: ' + ((e && e.message) || e));
            } finally {
                loading = false;
            }
        }

        function open() {
            const modal = el('errorLogModal');
            if (!modal) return;
            modal.classList.add('open');
            load();
        }

        function close() {
            const modal = el('errorLogModal');
            if (modal) modal.classList.remove('open');
        }

        function bind() {
            const btn = el('btnOpenErrorLogs');
            if (btn) btn.addEventListener('click', open);
            ['btnCloseErrorLogModal', 'btnCloseErrorLogFooter'].forEach(function (id) {
                const b = el(id);
                if (b) b.addEventListener('click', close);
            });
            const reload = el('btnReloadErrorLogs');
            if (reload) reload.addEventListener('click', function () { cache = null; load(); });
            const range = el('errorLogRange');
            if (range) range.addEventListener('change', render);
            const modal = el('errorLogModal');
            if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
        }

        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind);
        else bind();

        api.open = open;
        api.close = close;
    }

    root.BSA = root.BSA || {};
    root.BSA.errorLogView = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
