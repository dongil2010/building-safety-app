/**
 * 현장 오류 자동 기록.
 *
 * 태블릿에서 앱이 터져도 지금은 콘솔에만 찍힌다. 현장 직원은 F12를 열지 않으니
 * 사용자가 우연히 발견할 때까지 아무도 모르고, 발견해도 "언제 뭐가 났는지"가 남아
 * 있지 않다. 2026-09-20 껍데기 결함 사고(js/core/data-health.js)처럼 **망가진 걸
 * 며칠 모르는 것**이 데이터가 망가지는 것보다 나쁘다.
 *
 * 그래서 window 전역 오류와 처리 안 된 Promise 거절을 붙잡아 Firestore
 * `errorLogs` 컬렉션에 남긴다. 읽기는 Firebase 콘솔에서 한다.
 *
 * 설계에서 조심한 것:
 *   - **무한루프 금지**: 기록하다 난 오류는 절대 다시 기록하지 않는다. 기록 실패는
 *     조용히 버린다. 오류 기록기가 오류를 만들면 현장이 멈춘다.
 *   - **쓰기 폭주 금지**: 같은 오류가 렌더 루프에서 초당 수십 번 날 수 있다.
 *     같은 오류 하루 3건, 기기당 하루 30건까지만 쓴다(숫자는 서명에서 무시해서
 *     "index 57" / "index 58" 같은 변종을 한 덩어리로 본다).
 *   - **로그인 전 오류도 살린다**: 규칙상 로그인해야 쓸 수 있어서, 로그인 전 오류는
 *     메모리 큐에 두었다가 로그인되면 올린다.
 */
(function (root) {
    'use strict';

    /** 같은 오류를 하루에 이만큼까지만 올린다 */
    const MAX_PER_SIGNATURE_PER_DAY = 3;
    /** 기기 하나가 하루에 올릴 수 있는 총 건수 */
    const MAX_PER_DAY = 30;
    /** 로그인 전에 들고 있을 오류 개수 (넘으면 오래된 것부터 버린다) */
    const MAX_QUEUE = 20;
    /** 로그인·네트워크를 기다리며 다시 시도하는 주기 */
    const FLUSH_RETRY_MS = 15000;

    const QUOTA_KEY = 'bsa_error_log_quota';
    const DEVICE_KEY = 'bsa_device_id';

    /** 필드별 최대 길이 — firestore.rules의 errorLogShapeOk()와 같은 값이어야 한다 */
    const LIMITS = {
        kind: 40,
        message: 500,
        stack: 2000,
        source: 300,
        url: 300,
        device: 300,
        deviceId: 64,
        appVersion: 60,
        uid: 64,
        userName: 100,
        companyId: 64,
        companyName: 100
    };

    function clip(value, max) {
        if (value === null || value === undefined) return '';
        let text;
        try {
            text = String(value);
        } catch (_e) {
            return '';
        }
        return text.length > max ? text.slice(0, max) : text;
    }

    /** 로컬 날짜 기준 하루 (현장 사람이 "오늘"이라고 부르는 그 하루) */
    function dayKeyOf(now) {
        const d = new Date(now);
        const m = d.getMonth() + 1;
        const day = d.getDate();
        return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
    }

    /**
     * 같은 오류인지 판정하는 서명.
     * 숫자를 전부 #으로 눌러서 "NO.57 없음" / "NO.58 없음"을 한 덩어리로 본다.
     */
    function signatureOf(entry) {
        const raw = [entry && entry.kind, entry && entry.message, entry && entry.source].join('|');
        return raw.replace(/\d+/g, '#').slice(0, 200);
    }

    function emptyQuota(day) {
        return { day: day, total: 0, sigs: {} };
    }

    /**
     * 이 오류를 올려도 되는지 보고, 허용되면 1 올린 새 한도를 돌려준다.
     * 원본은 건드리지 않는다(테스트에서 비교하기 쉽게).
     */
    function shouldLog(quota, sig, day) {
        const base = (quota && quota.day === day) ? quota : emptyQuota(day);
        const used = base.sigs[sig] || 0;
        if (base.total >= MAX_PER_DAY) return { allow: false, reason: 'daily', quota: base };
        if (used >= MAX_PER_SIGNATURE_PER_DAY) return { allow: false, reason: 'signature', quota: base };
        const sigs = Object.assign({}, base.sigs);
        sigs[sig] = used + 1;
        return {
            allow: true,
            reason: '',
            seq: used + 1,
            quota: { day: day, total: base.total + 1, sigs: sigs }
        };
    }

    /** Firestore에 넣을 모양으로 자른다. at(서버시각)은 보낼 때 붙인다. */
    function buildEntry(raw, ctx) {
        const r = raw || {};
        const c = ctx || {};
        return {
            kind: clip(r.kind || 'error', LIMITS.kind),
            message: clip(r.message || '내용 없는 오류', LIMITS.message),
            stack: clip(r.stack, LIMITS.stack),
            source: clip(r.source, LIMITS.source),
            url: clip(c.url, LIMITS.url),
            device: clip(c.device, LIMITS.device),
            deviceId: clip(c.deviceId, LIMITS.deviceId),
            appVersion: clip(c.appVersion, LIMITS.appVersion),
            uid: clip(c.uid, LIMITS.uid),
            userName: clip(c.userName, LIMITS.userName),
            companyId: clip(c.companyId, LIMITS.companyId),
            companyName: clip(c.companyName, LIMITS.companyName),
            online: c.online === true,
            atLocal: typeof c.now === 'number' ? c.now : Date.now(),
            sameErrorToday: typeof r.seq === 'number' ? r.seq : 1
        };
    }

    /**
     * 기록할 가치가 없는 오류인지.
     * 다른 출처(CDN) 스크립트 오류는 브라우저가 "Script error."만 주고 내용을 감춘다.
     */
    function isNoise(raw) {
        const message = String((raw && raw.message) || '').trim();
        if (!message) return true;
        if (/^script error\.?$/i.test(message) && !(raw && raw.stack)) return true;
        return false;
    }

    const api = {
        MAX_PER_SIGNATURE_PER_DAY: MAX_PER_SIGNATURE_PER_DAY,
        MAX_PER_DAY: MAX_PER_DAY,
        MAX_QUEUE: MAX_QUEUE,
        LIMITS: LIMITS,
        clip: clip,
        dayKeyOf: dayKeyOf,
        signatureOf: signatureOf,
        emptyQuota: emptyQuota,
        shouldLog: shouldLog,
        buildEntry: buildEntry,
        isNoise: isNoise
    };

    // --- 여기부터는 브라우저에서만 동작한다 (Node 테스트는 위 순수 함수만 쓴다) ---
    if (root && root.document && root.addEventListener) {
        const win = root;
        const queue = [];
        let retryTimer = null;
        let recording = false;

        function readQuota(day) {
            try {
                const parsed = JSON.parse(win.localStorage.getItem(QUOTA_KEY) || 'null');
                if (parsed && parsed.day === day && parsed.sigs) return parsed;
            } catch (_e) { /* 못 읽으면 새로 센다 */ }
            return emptyQuota(day);
        }

        function writeQuota(quota) {
            try {
                win.localStorage.setItem(QUOTA_KEY, JSON.stringify(quota));
            } catch (_e) { /* 저장 못 해도 기록은 진행한다 */ }
        }

        /** 같은 태블릿에서 난 오류를 묶어 보려고 기기마다 한 번 만들어 두는 id */
        function deviceId() {
            try {
                let id = win.localStorage.getItem(DEVICE_KEY);
                if (!id) {
                    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
                    win.localStorage.setItem(DEVICE_KEY, id);
                }
                return id;
            } catch (_e) {
                return '';
            }
        }

        function context(now) {
            const state = win.state || {};
            return {
                now: now,
                url: win.location && win.location.href,
                device: win.navigator && win.navigator.userAgent,
                deviceId: deviceId(),
                appVersion: win.BSA_APP_VERSION,
                uid: state.uid,
                userName: state.userName,
                companyId: state.companyId,
                companyName: state.companyName,
                online: !(win.navigator && win.navigator.onLine === false)
            };
        }

        function stopRetry() {
            if (retryTimer) {
                clearInterval(retryTimer);
                retryTimer = null;
            }
        }

        function startRetry() {
            if (retryTimer) return;
            retryTimer = setInterval(flush, FLUSH_RETRY_MS);
        }

        /**
         * 큐를 Firestore로 밀어낸다.
         * 오프라인이면 Firestore 지속성이 알아서 들고 있다가 나중에 보내므로
         * 여기서 완료를 기다리지 않는다 (기다리면 오프라인에서 영영 안 끝난다).
         */
        function flush() {
            if (!queue.length) { stopRetry(); return; }
            const fb = win.firebase;
            if (!fb || !fb.apps || !fb.apps.length || !fb.firestore) { startRetry(); return; }
            const user = fb.auth && fb.auth().currentUser;
            if (!user) { startRetry(); return; }

            let col;
            let stamp;
            try {
                col = fb.firestore().collection('errorLogs');
                stamp = fb.firestore.FieldValue.serverTimestamp();
            } catch (_e) {
                startRetry();
                return;
            }

            const pending = queue.splice(0, queue.length);
            stopRetry();
            pending.forEach(function (entry) {
                try {
                    const doc = Object.assign({}, entry, { at: stamp });
                    if (!doc.uid) doc.uid = clip(user.uid, LIMITS.uid);
                    const p = col.add(doc);
                    if (p && typeof p.catch === 'function') p.catch(function () { /* 조용히 포기 */ });
                } catch (_e) { /* 이 한 건만 버린다 */ }
            });
        }

        /** 오류 한 건을 한도 안에서 큐에 넣는다. 여기서 던지는 일은 없어야 한다. */
        function record(raw) {
            if (recording) return false;
            recording = true;
            try {
                if (isNoise(raw)) return false;
                const now = Date.now();
                const day = dayKeyOf(now);
                const entry0 = buildEntry(raw, context(now));
                const verdict = shouldLog(readQuota(day), signatureOf(entry0), day);
                if (!verdict.allow) return false;
                writeQuota(verdict.quota);
                entry0.sameErrorToday = verdict.seq;
                queue.push(entry0);
                while (queue.length > MAX_QUEUE) queue.shift();
                flush();
                return true;
            } catch (_e) {
                return false;
            } finally {
                recording = false;
            }
        }

        win.addEventListener('error', function (ev) {
            if (!ev) return;
            const err = ev.error;
            record({
                kind: 'error',
                message: ev.message || (err && err.message),
                stack: err && err.stack,
                source: ev.filename ? ev.filename + ':' + ev.lineno + ':' + ev.colno : ''
            });
        });

        win.addEventListener('unhandledrejection', function (ev) {
            const reason = ev && ev.reason;
            record({
                kind: 'unhandledrejection',
                message: (reason && reason.message) || reason,
                stack: reason && reason.stack,
                source: ''
            });
        });

        // 로그인이 끝나면 로그인 전에 쌓인 오류가 올라간다
        win.addEventListener('online', flush);

        api.record = record;
        api.flush = flush;
        api.pendingCount = function () { return queue.length; };
    }

    root.BSA = root.BSA || {};
    root.BSA.errorLog = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
