/**
 * 2026-10-19 오프라인 직접 사진 전송(앱 전용). 「이 기능을 어플에 합쳐」 — SnapSync(순정 카메라 → 핫스팟 → 바로 전송)를 앱에 넣음.
 * - 받는 기기: 휴대폰 사진 받기 창의 「오프라인 직접 받기」 → 전용 Wi-Fi + QR. 받은 사진은 기존 receivePhoneRelayPhoto 로
 *   (결함 창이 열려 있으면 그 결함, 전경사진 창이면 전경사진, 아니면 대기함) 들어간다.
 * - 보내는 기기: 「사진 보내기 모드」 → QR 스캔해서 연결 → 순정 카메라로 찍고 확인 → 자동 전송(연속 촬영 가능).
 * - 인터넷·서버 없이 동작. 네이티브는 Capacitor.Plugins.BsaPhotoRelay (android/.../PhotoRelayPlugin.java).
 * 순수 로직(받은편지함 펌프·상태 문구·연속 촬영)은 Node 테스트(scripts/test-photo-relay-native.js)에서 바로 시험한다.
 */
(function (root) {
    'use strict';

    const PLUGIN = 'BsaPhotoRelay';

    function getPlugin(win) {
        const w = win || (typeof window !== 'undefined' ? window : null);
        const cap = w && w.Capacitor;
        if (!cap || !cap.Plugins) return null;
        if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
        if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(PLUGIN)) return null;
        return cap.Plugins[PLUGIN] || null;
    }

    function errText(e, fallback) {
        if (!e) return fallback || '알 수 없는 오류';
        return e.message || e.errorMessage || String(e) || fallback;
    }

    /**
     * 받은 사진을 화면에 넣고(receive) 네이티브 받은편지함에서 지운다(ack).
     * 같은 사진이 이벤트와 다시 받기(pendingInbox)로 두 번 와도 한 번만 넣는다. receive 가 실패하면 지우지 않는다.
     */
    function createInboxPump(opts) {
        const plugin = opts.plugin;
        const receive = opts.receive;
        const onChange = opts.onChange || function () {};
        const seen = new Set();
        let draining = null;
        let delivered = 0;

        async function handle(item) {
            if (!item || !item.id || !item.dataUrl) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            try {
                receive(item.dataUrl, item);
            } catch (e) {
                seen.delete(item.id);
                return false;
            }
            delivered += 1;
            try { await plugin.ackInbox({ ids: [item.id] }); } catch (_e) { /* 다음 다시 받기 때 seen 으로 거름 */ }
            onChange(delivered);
            return true;
        }

        async function drainOnce() {
            for (let round = 0; round < 50; round++) {
                const res = await plugin.pendingInbox({ limit: 3 });
                const items = (res && res.items) || [];
                const fresh = items.filter((it) => it && !seen.has(it.id));
                if (!fresh.length) {
                    // 이미 넣었는데 ack 가 안 된 것만 남았으면 지운다
                    const stale = items.filter((it) => it && seen.has(it.id)).map((it) => it.id);
                    if (stale.length) { try { await plugin.ackInbox({ ids: stale }); } catch (_e) { /* ignore */ } }
                    break;
                }
                for (const it of fresh) await handle(it);
            }
        }

        function drain() {
            if (!draining) {
                draining = drainOnce().catch(() => {}).then(() => { draining = null; });
            }
            return draining;
        }

        return { handle, drain, get delivered() { return delivered; } };
    }

    function describeReceiver(s) {
        s = s || {};
        if (!s.receiving) {
            return { tone: 'off', title: '꺼져 있음', detail: '「📶 핫스팟 켜고 받기」를 누르면 이 기기가 전용 Wi-Fi를 켜고 QR을 보여 줍니다. 인터넷이 없어도 됩니다.' };
        }
        if (s.hotspotStarting) return { tone: 'wait', title: '전용 Wi-Fi 켜는 중…', detail: '잠시만 기다려 주세요.' };
        const n = Number(s.received) || 0;
        const got = n ? ` · ${n}장 받음` : '';
        if (s.hotspotMode === 'local' && s.ssid) {
            return { tone: 'ok', title: (n ? '받는 중' : '받을 준비 완료') + got, detail: '보내는 폰에서 아래 QR을 스캔하면 바로 연결됩니다.' };
        }
        if (s.hotspotMode === 'manual' && s.ssid) {
            return {
                tone: 'ok',
                title: '휴대폰 핫스팟으로 받는 중' + got,
                detail: `이 기기의 「모바일 핫스팟」(${s.ssid})이 켜져 있어야 합니다. 보내는 폰이 아래 QR을 스캔하면 연결됩니다.`
            };
        }
        if (s.hotspotError) return { tone: 'warn', title: '전용 Wi-Fi를 못 켰습니다 (받기는 켜져 있음)', detail: s.hotspotError };
        const ip = (s.ips && s.ips[0]) || '';
        return {
            tone: 'ok',
            title: '받는 중 (같은 Wi-Fi)' + got,
            detail: ip ? `보내는 폰을 이 기기와 같은 Wi-Fi에 연결하세요. 이 기기 주소 ${ip}` : '보내는 폰을 이 기기와 같은 Wi-Fi에 연결하세요.'
        };
    }

    function describeSender(s) {
        s = s || {};
        const st = s.active ? (s.state || 'idle') : 'idle';
        if (st === 'ready') {
            const who = s.receiverName ? `${s.receiverName} (${s.receiverIp})` : (s.receiverIp || '');
            return { tone: 'ok', title: '받는 기기와 연결됨', detail: s.sending ? `보내는 중: ${s.sending}` : (who ? `${who} 로 바로 보냅니다.` : '찍으면 바로 보냅니다.') };
        }
        if (st === 'searching') return { tone: 'wait', title: '받는 기기 찾는 중…', detail: s.message || (s.ssid ? `Wi-Fi 「${s.ssid}」에서 찾고 있습니다.` : 'Wi-Fi에서 받는 기기를 찾고 있습니다.') };
        if (st === 'connecting') return { tone: 'wait', title: 'Wi-Fi 연결 중…', detail: s.message || '화면에 연결 확인 창이 뜨면 「연결」을 눌러 주세요.' };
        if (st === 'no_wifi') return { tone: 'warn', title: '받는 기기 Wi-Fi에 연결 안 됨', detail: s.message || '「QR 스캔해서 연결」을 눌러 받는 기기 화면의 QR을 비춰 주세요.' };
        return { tone: 'off', title: '연결 안 됨', detail: '「QR 스캔해서 연결」을 눌러 받는 기기 화면의 QR을 비춰 주세요.' };
    }

    /**
     * 순정 카메라로 찍기. 연속 촬영이면 사진이 보내지거나(최대 waitMs) 받는 기기와 연결이 안 돼 있으면 바로 카메라를 다시 연다.
     * 카메라에서 뒤로 가기(취소)하면 멈춘다.
     */
    function createShooter(opts) {
        const plugin = opts.plugin;
        const isContinuous = opts.isContinuous || (() => false);
        const isReady = opts.isReady || (() => true);
        const isOpen = opts.isOpen || (() => true);
        const waitMs = opts.waitMs == null ? 12000 : opts.waitMs;
        const waiters = new Map();
        let busy = false;
        let shots = 0;

        function onSendResult(r) {
            if (!r || !r.id) return;
            const w = waiters.get(r.id);
            if (w) { waiters.delete(r.id); w(r); }
        }

        function waitFor(id) {
            return new Promise((resolve) => {
                const t = setTimeout(() => { waiters.delete(id); resolve(null); }, waitMs);
                waiters.set(id, (r) => { clearTimeout(t); resolve(r); });
            });
        }

        async function shoot() {
            if (busy) return { busy: true, shots: 0 };
            busy = true;
            let taken = 0;
            try {
                for (let guard = 0; guard < 500; guard++) {
                    const r = await plugin.capture();
                    if (!r || !r.captured) break;
                    taken += 1;
                    shots += 1;
                    if (!isContinuous() || !isOpen()) break;
                    if (isReady()) await waitFor(r.id);
                    if (!isContinuous() || !isOpen()) break;
                }
            } finally {
                busy = false;
            }
            return { shots: taken };
        }

        return { shoot, onSendResult, get busy() { return busy; }, get shots() { return shots; } };
    }


    /** 휴대폰 핫스팟 입력 검사(네이티브 SnapProtocol.checkHotspotInput 과 같은 규칙). 문제 없으면 null. */
    function validateHotspotInput(ssid, password) {
        const name = String(ssid == null ? '' : ssid).trim();
        const pw = String(password == null ? '' : password);
        if (!name) return '핫스팟 이름을 넣어 주세요.';
        const bytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(name).length : unescape(encodeURIComponent(name)).length;
        if (bytes > 32) return '핫스팟 이름이 너무 깁니다(영문 32자까지).';
        if (pw && (pw.length < 8 || pw.length > 63)) return '암호는 8~63자입니다.';
        return null;
    }

    const MANUAL_KEY = 'bsaRelayManualHotspot';
    function loadManualHotspot(storage) {
        try {
            const raw = storage && storage.getItem(MANUAL_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || validateHotspotInput(o.ssid, o.password)) return null;
            return { ssid: String(o.ssid).trim(), password: String(o.password || ''), security: o.security === 'SAE' ? 'SAE' : 'WPA' };
        } catch (_e) {
            return null;
        }
    }
    function saveManualHotspot(storage, v) {
        try { if (storage) storage.setItem(MANUAL_KEY, JSON.stringify({ ssid: v.ssid, password: v.password || '', security: v.security === 'SAE' ? 'SAE' : 'WPA' })); } catch (_e) { /* ignore */ }
    }
    function safeStorage() {
        try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_e) { return null; }
    }

    /** 전용 Wi-Fi 를 못 켰을 때 이유 코드별로 고칠 설정 화면. */
    function fixActionFor(code) {
        if (!code) return null;
        if (code === 'LOCATION_OFF') return { action: 'location', label: '위치(GPS) 설정 열기' };
        if (code === 'PERMISSION') return { action: 'appSettings', label: '앱 권한 설정 열기' };
        if (code === 'MOBILE_HOTSPOT_ON') return { action: 'hotspotSettings', label: '모바일 핫스팟 설정 열기' };
        return { action: 'hotspotSettings', label: '핫스팟 설정 열기' };
    }

    /** 받기는 켜져 있는데 QR 로 줄 Wi-Fi 가 없을 때(전용 Wi-Fi 실패, 휴대폰 핫스팟 정보도 없음) → 입력 칸을 펼친다. */
    function needsManual(s) {
        s = s || {};
        return !!(s.receiving && !s.hotspotStarting && s.hotspotMode !== 'local' && !s.manualSsid && s.hotspotError);
    }

    // ───────────────────────── 화면 ─────────────────────────

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function listen(plugin, name, fn) {
        try {
            const h = plugin.addListener(name, fn);
            return h;
        } catch (_e) {
            return null;
        }
    }

    function createUi() {
        let plugin = null;
        let receive = null;
        let toast = function () {};
        let onReceiverChange = function () {};
        let pump = null;
        let receiverState = {};
        let senderState = {};
        let mode = 'online';
        let offlinePane = null;
        let sendScreen = null;
        let shooter = null;
        let continuous = false;
        let inited = false;
        let startingReceiver = false;

        function available() { return !!getPlugin(); }

        function init(opts) {
            if (inited) return;
            plugin = getPlugin();
            receive = opts && opts.receive;
            if (opts && typeof opts.toast === 'function') toast = opts.toast;
            if (opts && typeof opts.onReceiverChange === 'function') onReceiverChange = opts.onReceiverChange;
            const homeBtn = document.getElementById('btnOpenPhotoSendMode');
            if (!plugin || typeof receive !== 'function') {
                if (homeBtn) homeBtn.hidden = true;
                const qb = document.getElementById('btnShowRelayQr');
                if (qb) qb.hidden = true;
                return;
            }
            inited = true;
            if (homeBtn) {
                homeBtn.hidden = false;
                homeBtn.addEventListener('click', (e) => { e.preventDefault(); openSendMode(); });
            }
            const qrBtn = document.getElementById('btnShowRelayQr');
            if (qrBtn) {
                qrBtn.hidden = false;
                qrBtn.addEventListener('click', (e) => { e.preventDefault(); void openQrScreen({ autoStart: true }); });
            }
            pump = createInboxPump({
                plugin,
                receive: (dataUrl) => receive(dataUrl),
                onChange: () => { renderOffline(); onReceiverChange(); }
            });
            shooter = createShooter({
                plugin,
                isContinuous: () => continuous,
                isReady: () => senderState && senderState.state === 'ready',
                isOpen: () => !!(sendScreen && sendScreen.classList.contains('open'))
            });
            listen(plugin, 'photoReceived', (item) => { void pump.handle(item); });
            listen(plugin, 'receiverStatus', (s) => { receiverState = s || {}; renderAllReceiver(); onReceiverChange(); });
            listen(plugin, 'senderStatus', (s) => { senderState = s || {}; renderSend(); });
            listen(plugin, 'sendResult', (r) => {
                shooter.onSendResult(r);
                if (r && r.ok === false && r.attempt === 1) toast(`사진을 아직 못 보냈습니다 — ${r.message || ''} 연결되면 자동으로 다시 보냅니다.`, 'warning');
                renderSend();
            });
            const refresh = () => {
                Promise.resolve(plugin.receiverStatus()).then((s) => {
                    receiverState = s || {};
                    renderAllReceiver();
                    onReceiverChange();
                }).catch(() => {});
                Promise.resolve(plugin.senderStatus()).then((s) => { senderState = s || {}; renderSend(); }).catch(() => {});
                void pump.drain();
            };
            document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
            refresh();
            wireModal();
        }

        function isReceiving() { return !!(receiverState && receiverState.receiving); }

        // ── 받기: 휴대폰 사진 받기 창 안 탭 ──
        function wireModal() {
            const tabs = document.getElementById('phoneRelayModeTabs');
            offlinePane = document.getElementById('phoneRelayOfflinePane');
            if (!tabs || !offlinePane) return;
            tabs.hidden = false;
            tabs.querySelectorAll('[data-relay-mode]').forEach((b) => {
                b.addEventListener('click', () => setMode(b.getAttribute('data-relay-mode')));
            });
            buildOfflinePane();
        }

        function setMode(m) {
            mode = m === 'offline' ? 'offline' : 'online';
            const tabs = document.getElementById('phoneRelayModeTabs');
            if (tabs) {
                tabs.querySelectorAll('[data-relay-mode]').forEach((b) => {
                    const on = b.getAttribute('data-relay-mode') === mode;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-selected', on ? 'true' : 'false');
                });
            }
            const online = document.getElementById('phoneRelayOnlinePane');
            if (online) online.hidden = mode !== 'online';
            if (offlinePane) offlinePane.hidden = mode !== 'offline';
            const disc = document.getElementById('btnDisconnectPhoneRelay');
            if (disc) disc.style.visibility = mode === 'online' ? '' : 'hidden';
            renderOffline();
        }

        /** app.js 의 openPhoneRelayModal 이 부른다. 인터넷이 안 되면 오프라인 탭부터. */
        function onModalOpen(opts) {
            if (!inited) return false;
            const offline = !!(opts && opts.onlineUnavailable);
            const onlineTab = document.querySelector('#phoneRelayModeTabs [data-relay-mode="online"]');
            if (onlineTab) {
                onlineTab.disabled = offline;
                onlineTab.textContent = offline ? '인터넷으로 받기 (지금 못 씀)' : '인터넷으로 받기';
            }
            setMode(offline || isReceiving() ? 'offline' : mode);
            return true;
        }

        let offEls = null;
        let manualOpen = false;
        let lastError = null;

        function btn(cls, text) {
            const b = el('button', cls, text);
            b.type = 'button';
            return b;
        }

        function buildManualForm(onDone) {
            const box = el('div', 'relay-manual');
            box.appendChild(el('strong', 'relay-manual-title', '휴대폰 핫스팟으로 받기'));
            const steps = el('ol', 'relay-manual-steps');
            ['아래 「핫스팟 설정 열기」 → 「모바일 핫스팟」을 켜기',
                '그 화면의 핫스팟 이름·암호를 아래에 넣기 (한 번 넣으면 기억)',
                '「이 핫스팟으로 QR 만들기」 → 보내는 폰이 그 QR을 스캔'].forEach((t) => steps.appendChild(el('li', null, t)));
            const open = btn('btn btn-outline relay-manual-open', '핫스팟 설정 열기');
            const nameL = el('label', 'relay-field');
            nameL.appendChild(el('span', null, '핫스팟 이름'));
            const name = el('input');
            name.type = 'text';
            name.autocomplete = 'off';
            name.spellcheck = false;
            name.setAttribute('autocapitalize', 'off');
            name.placeholder = '예: Galaxy Tab S9 1234';
            nameL.appendChild(name);
            const passL = el('label', 'relay-field');
            passL.appendChild(el('span', null, '암호'));
            const passRow = el('div', 'relay-pass-row');
            const pass = el('input');
            pass.type = 'password';
            pass.autocomplete = 'off';
            pass.spellcheck = false;
            pass.setAttribute('autocapitalize', 'off');
            pass.placeholder = '8자 이상 (암호 없으면 비움)';
            const eye = btn('relay-eye', '보기');
            passRow.appendChild(pass);
            passRow.appendChild(eye);
            passL.appendChild(passRow);
            const wpa3L = el('label', 'relay-check');
            const wpa3 = el('input');
            wpa3.type = 'checkbox';
            wpa3L.appendChild(wpa3);
            wpa3L.appendChild(el('span', null, '보안이 「WPA3」로만 돼 있음 (잘 모르면 그대로)'));
            const err = el('p', 'relay-manual-err');
            err.hidden = true;
            const make = btn('btn btn-primary relay-manual-make', '이 핫스팟으로 QR 만들기');
            const saved = loadManualHotspot(safeStorage());
            if (saved) { name.value = saved.ssid; pass.value = saved.password; wpa3.checked = saved.security === 'SAE'; }
            eye.addEventListener('click', () => { pass.type = pass.type === 'password' ? 'text' : 'password'; eye.textContent = pass.type === 'password' ? '보기' : '숨김'; });
            open.addEventListener('click', () => { try { plugin.openHotspotSettings(); } catch (_e) { /* ignore */ } });
            make.addEventListener('click', async () => {
                const v = validateHotspotInput(name.value, pass.value);
                if (v) { err.textContent = v; err.hidden = false; return; }
                err.hidden = true;
                const input = { ssid: name.value.trim(), password: pass.value, security: wpa3.checked ? 'SAE' : 'WPA' };
                try {
                    receiverState = (await plugin.receiverUseManualHotspot(input)) || {};
                    saveManualHotspot(safeStorage(), input);
                    toast(`휴대폰 핫스팟 「${input.ssid}」 QR을 만들었습니다. 핫스팟이 켜져 있어야 연결됩니다.`, 'success');
                    if (onDone) onDone();
                } catch (e) {
                    err.textContent = errText(e, 'QR을 만들지 못했습니다.');
                    err.hidden = false;
                }
                renderAllReceiver();
                onReceiverChange();
            });
            [steps, open, nameL, passL, wpa3L, err, make].forEach((x) => box.appendChild(x));
            return box;
        }

        function buildOfflinePane() {
            offlinePane.innerHTML = '';
            const status = el('div', 'relay-off-status');
            const dot = el('span', 'relay-dot');
            const txt = el('div', 'relay-off-status-text');
            const title = el('strong', null, '');
            const detail = el('small', null, '');
            txt.appendChild(title);
            txt.appendChild(detail);
            status.appendChild(dot);
            status.appendChild(txt);

            const fixBtn = btn('btn btn-outline relay-off-fix', '설정 열기');
            fixBtn.hidden = true;

            const qrWrap = el('button', 'relay-off-qr');
            qrWrap.type = 'button';
            qrWrap.title = '누르면 크게 보기';
            const qrImg = el('img');
            qrImg.alt = '받기용 Wi-Fi QR 코드';
            qrWrap.appendChild(qrImg);
            const wifi = el('div', 'relay-off-wifi');
            const count = el('div', 'relay-off-count');

            const actions = el('div', 'relay-off-actions');
            const startBtn = btn('btn btn-primary relay-off-start', '📶 핫스팟 켜고 받기');
            const bigBtn = btn('btn btn-primary relay-off-big', 'QR 크게 보기');
            const retryBtn = btn('btn btn-outline relay-off-retry', '핫스팟 다시 켜기');
            const stopBtn = btn('btn btn-outline relay-off-stop', '받기 중지');
            [startBtn, bigBtn, retryBtn, stopBtn].forEach((b) => actions.appendChild(b));

            const steps = el('ol', 'relay-off-steps');
            ['보내는 폰에서 스마트안전점검 앱 → 홈의 「📷 사진 보내기 모드」',
                '「QR 스캔해서 연결」로 이 QR을 비추기',
                '「촬영해서 보내기」 → 찍고 확인 → 이 기기로 바로 들어옵니다'].forEach((t) => steps.appendChild(el('li', null, t)));

            const manualToggle = btn('relay-off-link relay-manual-toggle', '전용 Wi-Fi가 안 켜지면: 휴대폰 핫스팟으로 받기 ▾');
            const manual = buildManualForm(() => { manualOpen = false; });

            const note = el('p', 'relay-off-note', '인터넷·서버 없이 기기끼리 바로 주고받습니다(안드로이드 앱끼리만). 받은 원본은 이 기기 갤러리 「스마트안전점검/현장전송」에도 남습니다.');
            const toSend = btn('relay-off-link', '이 기기로 찍어서 보내기 (사진 보내기 모드) →');

            [status, fixBtn, qrWrap, wifi, count, actions, steps, manualToggle, manual, note, toSend].forEach((x) => offlinePane.appendChild(x));

            startBtn.addEventListener('click', () => { void startReceiver(); });
            retryBtn.addEventListener('click', () => { void startReceiver(); });
            bigBtn.addEventListener('click', () => openQrScreen({ autoStart: false }));
            qrWrap.addEventListener('click', () => openQrScreen({ autoStart: false }));
            stopBtn.addEventListener('click', stopReceiver);
            fixBtn.addEventListener('click', () => runFix(fixBtn.getAttribute('data-code')));
            manualToggle.addEventListener('click', () => { manualOpen = !manualOpen; renderOffline(); });
            toSend.addEventListener('click', () => {
                const modal = document.getElementById('mobileQrModal');
                if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
                openSendMode();
            });
            offEls = { status, title, detail, qrWrap, qrImg, wifi, count, steps, startBtn, bigBtn, retryBtn, stopBtn, fixBtn, manualToggle, manual };
            renderOffline();
        }

        function runFix(code) {
            const f = fixActionFor(code);
            if (!f) return;
            try {
                if (f.action === 'location') plugin.openLocationSettings();
                else if (f.action === 'appSettings') plugin.openAppSettings();
                else plugin.openHotspotSettings();
            } catch (_e) { /* ignore */ }
        }

        async function stopReceiver() {
            try { receiverState = (await plugin.receiverStop()) || {}; } catch (_e) { /* ignore */ }
            renderAllReceiver();
            onReceiverChange();
        }

        async function startReceiver() {
            if (startingReceiver) return receiverState;
            startingReceiver = true;
            lastError = null;
            renderAllReceiver();
            try {
                receiverState = (await plugin.receiverStart()) || {};
            } catch (e) {
                lastError = { message: errText(e, '받기를 시작하지 못했습니다.'), code: e && e.code };
                try { receiverState = (await plugin.receiverStatus()) || {}; } catch (_e) { /* ignore */ }
            } finally {
                startingReceiver = false;
            }
            // 전용 Wi-Fi 를 못 켰는데 예전에 넣은 휴대폰 핫스팟이 있으면 그걸로 QR (핫스팟을 켜 두기만 하면 됨)
            const saved = loadManualHotspot(safeStorage());
            if (receiverState.receiving && receiverState.hotspotMode !== 'local' && !receiverState.hotspotStarting
                && saved && !receiverState.manualSsid) {
                try { receiverState = (await plugin.receiverUseManualHotspot(saved)) || receiverState; } catch (_e) { /* ignore */ }
            }
            if (needsManual(receiverState)) manualOpen = true;
            renderAllReceiver();
            onReceiverChange();
            void pump.drain();
            return receiverState;
        }

        function renderAllReceiver() {
            renderOffline();
            renderQrScreen();
        }

        function receiverView() {
            const s = receiverState || {};
            let d = describeReceiver(s);
            if (startingReceiver) d = { tone: 'wait', title: '전용 Wi-Fi 켜는 중…', detail: '권한을 묻는 창이 뜨면 「허용」을 눌러 주세요.' };
            else if (lastError && !s.receiving) d = { tone: 'warn', title: '받기를 시작하지 못했습니다', detail: lastError.message };
            const code = s.receiving ? (s.hotspotMode === 'local' ? null : s.hotspotErrorCode) : (lastError && lastError.code);
            return { s, d, code, fix: fixActionFor(code), hasQr: !!(s.receiving && s.qrDataUrl) };
        }

        function fillWifi(node, s) {
            node.innerHTML = '';
            if (!s.ssid) return;
            node.appendChild(el('span', 'relay-wifi-k', 'Wi-Fi'));
            node.appendChild(el('b', 'relay-wifi-v', s.ssid));
            if (s.password) {
                node.appendChild(el('span', 'relay-wifi-k', '암호'));
                node.appendChild(el('b', 'relay-wifi-v relay-mono', s.password));
            }
        }

        function renderOffline() {
            if (!offEls) return;
            const { s, d, code, fix, hasQr } = receiverView();
            offEls.status.className = 'relay-off-status tone-' + d.tone;
            offEls.title.textContent = d.title;
            offEls.detail.textContent = d.detail;
            offEls.qrWrap.hidden = !hasQr;
            if (hasQr && offEls.qrImg.getAttribute('src') !== s.qrDataUrl) offEls.qrImg.src = s.qrDataUrl;
            offEls.wifi.hidden = !(s.receiving && s.ssid);
            fillWifi(offEls.wifi, s);
            const waitingIn = Number(s.pending) || 0;
            offEls.count.hidden = !(s.receiving && waitingIn > 0);
            offEls.count.textContent = waitingIn ? `받은 사진 ${waitingIn}장을 앱에 넣는 중…` : '';
            offEls.steps.hidden = !hasQr;
            offEls.startBtn.hidden = !!s.receiving;
            offEls.startBtn.disabled = startingReceiver;
            offEls.bigBtn.hidden = !hasQr;
            offEls.retryBtn.hidden = !(s.receiving && s.hotspotMode !== 'local' && !s.hotspotStarting);
            offEls.retryBtn.disabled = startingReceiver;
            offEls.stopBtn.hidden = !s.receiving;
            offEls.fixBtn.hidden = !fix;
            if (fix) { offEls.fixBtn.textContent = fix.label; offEls.fixBtn.setAttribute('data-code', code); }
            const showManual = manualOpen || needsManual(s);
            offEls.manual.hidden = !showManual;
            offEls.manualToggle.hidden = needsManual(s);
            offEls.manualToggle.textContent = manualOpen ? '휴대폰 핫스팟 입력 닫기 ▴' : '전용 Wi-Fi가 안 켜지면: 휴대폰 핫스팟으로 받기 ▾';
        }

        // ── 받기용 QR 크게 보기(전체 화면) ──
        let qrScreen = null;
        let qrEls = null;
        function buildQrScreen() {
            qrScreen = el('div', 'rqv-screen');
            qrScreen.id = 'relayQrScreen';
            qrScreen.setAttribute('role', 'dialog');
            qrScreen.setAttribute('aria-label', '받기용 Wi-Fi QR');
            const head = el('header', 'psm-head');
            const close = btn('psm-close', '✕');
            close.setAttribute('aria-label', '닫기');
            head.appendChild(close);
            head.appendChild(el('h2', null, '받기용 Wi-Fi QR'));
            const body = el('div', 'rqv-body');
            const status = el('div', 'relay-off-status');
            const dot = el('span', 'relay-dot');
            const txt = el('div', 'relay-off-status-text');
            const title = el('strong');
            const detail = el('small');
            txt.appendChild(title);
            txt.appendChild(detail);
            status.appendChild(dot);
            status.appendChild(txt);
            const qr = el('div', 'rqv-qr');
            const img = el('img');
            img.alt = '받기용 Wi-Fi QR 코드';
            qr.appendChild(img);
            const wifi = el('div', 'rqv-wifi');
            const hint = el('p', 'rqv-hint', '보내는 폰: 스마트안전점검 앱 → 「📷 사진 보내기 모드」 → 「QR 스캔해서 연결」로 이 화면을 비추세요. (폰 기본 카메라로 비춰 Wi-Fi에 붙여도 됩니다)');
            const actions = el('div', 'rqv-actions');
            const startBtn = btn('psm-btn rqv-start', '📶 핫스팟 켜고 받기');
            const retryBtn = btn('psm-btn rqv-retry', '핫스팟 다시 켜기');
            const fixBtn = btn('psm-btn rqv-fix', '설정 열기');
            const manualBtn = btn('psm-btn rqv-manual', '휴대폰 핫스팟 정보 넣기');
            [startBtn, retryBtn, fixBtn, manualBtn].forEach((b) => actions.appendChild(b));
            const manualWrap = el('div', 'rqv-manual');
            manualWrap.appendChild(buildManualForm(() => { qrManualOpen = false; renderQrScreen(); }));
            [status, qr, wifi, hint, actions, manualWrap].forEach((x) => body.appendChild(x));
            qrScreen.appendChild(head);
            qrScreen.appendChild(body);
            document.body.appendChild(qrScreen);
            close.addEventListener('click', closeQrScreen);
            startBtn.addEventListener('click', () => { void startReceiver(); });
            retryBtn.addEventListener('click', () => { void startReceiver(); });
            fixBtn.addEventListener('click', () => runFix(fixBtn.getAttribute('data-code')));
            manualBtn.addEventListener('click', () => { qrManualOpen = !qrManualOpen; renderQrScreen(); });
            qrEls = { status, title, detail, qr, img, wifi, hint, startBtn, retryBtn, fixBtn, manualBtn, manualWrap };
        }

        let qrManualOpen = false;
        function renderQrScreen() {
            if (!qrEls) return;
            const { s, d, code, fix, hasQr } = receiverView();
            qrEls.status.className = 'relay-off-status tone-' + d.tone;
            qrEls.title.textContent = d.title;
            qrEls.detail.textContent = d.detail;
            qrEls.qr.hidden = !hasQr;
            if (hasQr && qrEls.img.getAttribute('src') !== s.qrDataUrl) qrEls.img.src = s.qrDataUrl;
            qrEls.wifi.hidden = !(s.receiving && s.ssid);
            fillWifi(qrEls.wifi, s);
            qrEls.hint.hidden = !hasQr;
            qrEls.startBtn.hidden = !!s.receiving;
            qrEls.startBtn.disabled = startingReceiver;
            qrEls.retryBtn.hidden = !(s.receiving && s.hotspotMode !== 'local' && !s.hotspotStarting);
            qrEls.retryBtn.disabled = startingReceiver;
            qrEls.fixBtn.hidden = !fix;
            if (fix) { qrEls.fixBtn.textContent = fix.label; qrEls.fixBtn.setAttribute('data-code', code); }
            const manualNeeded = needsManual(s);
            qrEls.manualBtn.hidden = !s.receiving || s.hotspotMode === 'local';
            qrEls.manualBtn.textContent = qrManualOpen ? '입력 닫기' : (s.hotspotMode === 'manual' ? '휴대폰 핫스팟 정보 바꾸기' : '휴대폰 핫스팟 정보 넣기');
            qrEls.manualWrap.hidden = !(qrManualOpen || (manualNeeded && !hasQr));
        }

        /** 받기용 QR 을 크게. autoStart 면 꺼져 있을 때 핫스팟을 켜고 받기부터 시작. */
        async function openQrScreen(opts) {
            if (!plugin) return;
            if (!qrScreen) buildQrScreen();
            qrScreen.classList.add('open');
            document.documentElement.classList.add('psm-lock');
            renderQrScreen();
            try { receiverState = (await plugin.receiverStatus()) || receiverState; } catch (_e) { /* ignore */ }
            renderQrScreen();
            if ((!opts || opts.autoStart !== false) && !(receiverState && receiverState.receiving)) await startReceiver();
        }

        function closeQrScreen() {
            if (!qrScreen) return;
            qrScreen.classList.remove('open');
            if (!(sendScreen && sendScreen.classList.contains('open'))) document.documentElement.classList.remove('psm-lock');
        }

        // ── 보내기: 전체 화면 ──
        let sendEls = null;
        function buildSendScreen() {
            sendScreen = el('div', 'psm-screen');
            sendScreen.id = 'photoSendModeScreen';
            sendScreen.setAttribute('role', 'dialog');
            sendScreen.setAttribute('aria-label', '사진 보내기 모드');
            const head = el('header', 'psm-head');
            const close = el('button', 'psm-close', '✕');
            close.type = 'button';
            close.setAttribute('aria-label', '닫기');
            head.appendChild(close);
            head.appendChild(el('h2', null, '사진 보내기 모드'));
            const body = el('div', 'psm-body');

            const conn = el('section', 'psm-conn');
            const dot = el('span', 'relay-dot');
            const ct = el('div', 'psm-conn-text');
            const title = el('strong');
            const detail = el('small');
            ct.appendChild(title);
            ct.appendChild(detail);
            conn.appendChild(dot);
            conn.appendChild(ct);

            const scan = el('button', 'psm-btn psm-scan');
            scan.type = 'button';
            scan.innerHTML = '<i class="fa-solid fa-qrcode"></i> <span>QR 스캔해서 연결</span>';
            const shoot = el('button', 'psm-btn psm-shoot');
            shoot.type = 'button';
            shoot.innerHTML = '<i class="fa-solid fa-camera"></i> <span>촬영해서 보내기</span>';

            const toggle = el('label', 'psm-toggle');
            const cb = el('input');
            cb.type = 'checkbox';
            const tt = el('span', 'psm-toggle-text');
            tt.appendChild(el('b', null, '연속 촬영'));
            tt.appendChild(el('small', null, '보내고 나면 카메라가 바로 다시 열립니다. 그만 찍으려면 카메라에서 뒤로 가기'));
            const sw = el('span', 'psm-switch');
            toggle.appendChild(tt);
            toggle.appendChild(cb);
            toggle.appendChild(sw);

            const stats = el('div', 'psm-stats');
            const mk = (label) => {
                const box = el('div', 'psm-stat');
                const b = el('b', null, '0');
                box.appendChild(b);
                box.appendChild(el('span', null, label));
                stats.appendChild(box);
                return b;
            };
            const sentB = mk('보냄');
            const queuedB = mk('대기');
            const failedB = mk('실패');
            const last = el('p', 'psm-last');

            const sub = el('div', 'psm-sub');
            const wifiBtn = el('button', 'psm-sub-btn', 'Wi-Fi 설정');
            wifiBtn.type = 'button';
            const stopBtn = el('button', 'psm-sub-btn danger', '연결 끊기');
            stopBtn.type = 'button';
            sub.appendChild(wifiBtn);
            sub.appendChild(stopBtn);
            const help = el('p', 'psm-help', '찍은 사진은 이 폰 갤러리에 남기지 않고 받는 기기로만 보냅니다. 못 보낸 사진은 지우지 않고 기다렸다가 연결되면 자동으로 다시 보냅니다. 인터넷이 없어도 됩니다.');

            body.appendChild(conn);
            body.appendChild(scan);
            body.appendChild(shoot);
            body.appendChild(toggle);
            body.appendChild(stats);
            body.appendChild(last);
            body.appendChild(sub);
            body.appendChild(help);
            sendScreen.appendChild(head);
            sendScreen.appendChild(body);
            document.body.appendChild(sendScreen);

            close.addEventListener('click', closeSendMode);
            cb.addEventListener('change', () => { continuous = cb.checked; try { localStorage.setItem('bsaRelayContinuous', continuous ? '1' : '0'); } catch (_e) { /* ignore */ } });
            try { continuous = localStorage.getItem('bsaRelayContinuous') === '1'; } catch (_e) { continuous = false; }
            cb.checked = continuous;
            scan.addEventListener('click', async () => {
                try {
                    const r = await plugin.senderScan();
                    if (r && r.cancelled) { if (r.message) toast(r.message, 'warning'); return; }
                    if (r && r.status) senderState = r.status;
                    if (r && r.locationOff) toast('이 폰은 위치(GPS)가 꺼져 있으면 Wi-Fi 연결 창이 받는 기기를 못 찾을 수 있습니다. 안 붙으면 위치를 켜 주세요.', 'warning');
                    if (r && r.autoConnect === false) toast(`Wi-Fi 설정에서 「${r.ssid}」에 직접 연결해 주세요.`, 'warning');
                    else toast(`「${r.ssid}」에 연결합니다. 확인 창이 뜨면 「연결」을 눌러 주세요.`, 'info');
                } catch (e) {
                    toast(errText(e, 'QR을 읽지 못했습니다.'), 'error');
                }
                renderSend();
            });
            shoot.addEventListener('click', async () => {
                if (shooter.busy) return;
                if (!(senderState && senderState.state === 'ready')) {
                    toast('아직 받는 기기와 연결 전입니다. 찍은 사진은 기다렸다가 연결되면 보냅니다.', 'info');
                }
                try { await shooter.shoot(); } catch (e) { toast(errText(e, '카메라를 열지 못했습니다.'), 'error'); }
                renderSend();
            });
            wifiBtn.addEventListener('click', () => plugin.openWifiSettings());
            stopBtn.addEventListener('click', async () => {
                const q = Number(senderState && senderState.queued) || 0;
                if (q > 0 && typeof window.confirm === 'function'
                    && !window.confirm(`아직 못 보낸 사진 ${q}장이 있습니다. 연결을 끊어도 사진은 남아 있다가 다음에 연결되면 보냅니다. 끊을까요?`)) return;
                try { senderState = await plugin.senderStop(); } catch (_e) { /* ignore */ }
                renderSend();
            });
            sendEls = { conn, title, detail, scan, shoot, sentB, queuedB, failedB, last, stopBtn };
        }

        function renderSend() {
            if (!sendEls) return;
            const s = senderState || {};
            const d = describeSender(s);
            sendEls.conn.className = 'psm-conn tone-' + d.tone;
            sendEls.title.textContent = d.title;
            sendEls.detail.textContent = d.detail;
            sendEls.sentB.textContent = String(Number(s.sent) || 0);
            sendEls.queuedB.textContent = String(Number(s.queued) || 0);
            sendEls.failedB.textContent = String(Number(s.failed) || 0);
            sendEls.queuedB.parentNode.classList.toggle('warn', (Number(s.queued) || 0) > 0);
            sendEls.failedB.parentNode.classList.toggle('bad', (Number(s.failed) || 0) > 0);
            sendEls.last.textContent = s.lastSent ? `마지막으로 보낸 사진: ${s.lastSent}` : '';
            sendEls.scan.classList.toggle('done', d.tone === 'ok');
            sendEls.scan.querySelector('span').textContent = d.tone === 'ok' ? '다른 받는 기기로 다시 연결' : 'QR 스캔해서 연결';
            sendEls.stopBtn.hidden = !s.active;
        }

        function openSendMode() {
            if (!plugin) return;
            if (!sendScreen) buildSendScreen();
            sendScreen.classList.add('open');
            document.documentElement.classList.add('psm-lock');
            Promise.resolve(plugin.senderStart()).then((s) => { senderState = s || {}; renderSend(); }).catch(() => {});
            renderSend();
        }

        function closeSendMode() {
            if (!sendScreen) return;
            sendScreen.classList.remove('open');
            if (!(qrScreen && qrScreen.classList.contains('open'))) document.documentElement.classList.remove('psm-lock');
        }

        return { available, init, isReceiving, onModalOpen, openSendMode, closeSendMode, openQrScreen, closeQrScreen, setMode };
    }

    const api = { getPlugin, createInboxPump, describeReceiver, describeSender, createShooter, validateHotspotInput, loadManualHotspot, saveManualHotspot, fixActionFor, needsManual, createUi };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof root.document !== 'undefined') {
        root.BsaPhotoRelayLib = api;
        root.BsaPhotoRelayUI = createUi();
    }
})(typeof window !== 'undefined' ? window : globalThis);
