'use strict';
// 2026-10-19 「이 기능을 어플에 합쳐」 — SnapSync(순정 카메라 → 핫스팟 → 바로 전송)를 앱에 합친 오프라인 직접 사진 전송.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const relay = require(path.join(root, 'js', 'core', 'photo-relay-native.js'));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function mockPlugin(inbox) {
    const acked = [];
    return {
        acked,
        inbox,
        async pendingInbox({ limit }) {
            const left = inbox.filter((it) => !acked.includes(it.id));
            return { items: left.slice(0, limit), total: left.length };
        },
        async ackInbox({ ids }) { ids.forEach((id) => { if (!acked.includes(id)) acked.push(id); }); return { removed: ids.length }; }
    };
}

(async () => {
    // 1) 받은편지함: 화면이 꺼져 있던 사이 받은 사진까지 다 넣고, 이벤트와 다시 받기로 겹쳐 와도 한 번만
    {
        const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `id${n}`, name: `p${n}.jpg`, dataUrl: `data:image/jpeg;base64,${n}` }));
        const plugin = mockPlugin(items);
        const got = [];
        const pump = relay.createInboxPump({ plugin, receive: (d) => got.push(d) });
        await pump.handle(items[0]);
        await pump.handle(items[0]);
        await pump.drain();
        assert.deepStrictEqual(got, items.map((it) => it.dataUrl), '7장 모두 한 번씩, 받은 순서대로');
        assert.strictEqual(plugin.acked.length, 7, '넣은 사진만 받은편지함에서 지움');
        assert.strictEqual(pump.delivered, 7);
    }
    // 2) 넣다가 실패하면 지우지 않아 다음에 다시 넣는다
    {
        const items = [{ id: 'a', dataUrl: 'data:a' }, { id: 'b', dataUrl: 'data:b' }];
        const plugin = mockPlugin(items);
        let fail = true;
        const got = [];
        const pump = relay.createInboxPump({ plugin, receive: (d) => { if (fail && d === 'data:b') throw new Error('x'); got.push(d); } });
        await pump.handle(items[0]);
        await pump.handle(items[1]);
        assert.deepStrictEqual(plugin.acked, ['a'], '실패한 b는 남김');
        fail = false;
        await pump.drain();
        assert.deepStrictEqual(got, ['data:a', 'data:b']);
        assert.deepStrictEqual(plugin.acked, ['a', 'b']);
        assert.strictEqual(await pump.handle({ id: 'c' }), false, 'dataUrl 없는 항목은 무시');
    }
    // 3) 상태 문구
    {
        assert.strictEqual(relay.describeReceiver({}).tone, 'off');
        assert.strictEqual(relay.describeReceiver({ receiving: true, hotspotStarting: true }).tone, 'wait');
        const ok = relay.describeReceiver({ receiving: true, hotspot: true, ssid: 'AndroidShare_1', received: 3 });
        assert.strictEqual(ok.tone, 'ok');
        assert.ok(/3장/.test(ok.title));
        assert.strictEqual(relay.describeReceiver({ receiving: true, hotspotError: '핫스팟 끄세요' }).tone, 'warn');
        assert.strictEqual(relay.describeSender({ active: true, state: 'ready', receiverIp: '192.168.49.1' }).tone, 'ok');
        assert.strictEqual(relay.describeSender({ active: true, state: 'searching' }).tone, 'wait');
        assert.strictEqual(relay.describeSender({ active: true, state: 'no_wifi' }).tone, 'warn');
        assert.strictEqual(relay.describeSender({ active: false, state: 'ready' }).tone, 'off', '꺼져 있으면 연결 안 됨');
    }
    // 4) 연속 촬영: 보내지면 카메라 다시 열기, 카메라에서 취소하면 멈춤. 연결 전이면 기다리지 않고 바로 다음 장
    {
        let n = 0;
        const plan = [true, true, true, false];
        let shooter;
        const plugin = {
            async capture() {
                const ok = plan[n++];
                if (!ok) return { captured: false };
                const id = `out${n}`;
                setTimeout(() => shooter.onSendResult({ id, ok: true }), 5);
                return { captured: true, id };
            }
        };
        let cont = true;
        shooter = relay.createShooter({ plugin, isContinuous: () => cont, isReady: () => true, waitMs: 2000 });
        const t0 = Date.now();
        const r = await shooter.shoot();
        assert.strictEqual(r.shots, 3);
        assert.strictEqual(n, 4, '취소한 4번째에서 멈춤');
        assert.ok(Date.now() - t0 < 1500, '보낸 결과를 받으면 바로 다음 장(시간 초과까지 안 기다림)');

        n = 0;
        cont = false;
        const one = await shooter.shoot();
        assert.strictEqual(one.shots, 1, '연속 촬영이 꺼져 있으면 한 장');

        n = 0;
        cont = true;
        const notReady = relay.createShooter({ plugin: { capture: async () => (n++ < 2 ? { captured: true, id: 'q' + n } : { captured: false }) }, isContinuous: () => true, isReady: () => false, waitMs: 5000 });
        const t1 = Date.now();
        assert.strictEqual((await notReady.shoot()).shots, 2);
        assert.ok(Date.now() - t1 < 1000, '연결 전이면 보낼함에 쌓고 바로 다음 장');
        const busy = relay.createShooter({ plugin: { capture: () => new Promise((res) => setTimeout(() => res({ captured: false }), 30)) } });
        const p = busy.shoot();
        assert.deepStrictEqual(await busy.shoot(), { busy: true, shots: 0 }, '두 번 눌러도 카메라는 하나');
        await p;
    }
    // 5) 플러그인이 없는 웹·옛 APK에서는 기능을 숨김
    {
        assert.strictEqual(relay.getPlugin({}), null);
        assert.strictEqual(relay.getPlugin({ Capacitor: { Plugins: {}, isNativePlatform: () => false } }), null);
        assert.strictEqual(relay.getPlugin({ Capacitor: { Plugins: { BsaPhotoRelay: {} }, isNativePlatform: () => true, isPluginAvailable: () => false } }), null, '옛 APK');
        const pl = {};
        assert.strictEqual(relay.getPlugin({ Capacitor: { Plugins: { BsaPhotoRelay: pl }, isNativePlatform: () => true, isPluginAvailable: (n) => n === 'BsaPhotoRelay' } }), pl);
    }

    // 6) 네이티브: 위험 대응이 코드에 있는지
    const J = 'android/app/src/main/java/kr/buildingsafety/inspection/';
    const sender = read(J + 'relay/SenderHub.java');
    const receiver = read(J + 'relay/ReceiverHub.java');
    const proto = read(J + 'relay/SnapProtocol.java');
    const plugin = read(J + 'PhotoRelayPlugin.java');
    const allJava = sender + receiver + proto + plugin + read(J + 'relay/PhotoRelayService.java') + read(J + 'relay/QrScanActivity.java');
    assert.ok(!/\.bindProcessToNetwork\s*\(/.test(allJava), '앱 전체를 핫스팟에 묶지 않는다(서버 동기화가 끊기지 않게)');
    assert.ok(/getSocketFactory\(\)/.test(sender), '사진 소켓만 그 Wi-Fi 로');
    assert.ok(/bindSocket\(ds\)/.test(sender), 'UDP 알림 듣기도 그 Wi-Fi 에 묶음');
    assert.ok(/gatewayIps\(net\)/.test(sender) && /192\.168\.43\.1/.test(sender) && /parseBeacon/.test(sender), '찾기: UDP 알림 + 게이트웨이 + 기본 주소');
    assert.ok(/MAX_NAME_BYTES = 512/.test(proto) && /MAX_FILE_BYTES = 40L \* 1024L \* 1024L/.test(proto), '이름·크기 제한');
    assert.ok(/DEFAULT_PORT = 8888/.test(proto) && /DISCOVERY_PORT = 8889/.test(proto) && /'S', 'N', 'A', 'P'/.test(proto)
        && /SNAP_SYNC_SERVER\|/.test(proto) && /SNAP_SYNC_DISCOVER/.test(proto), 'SnapSync 규격 그대로');
    assert.ok(/KEY_PENDING, file\.getAbsolutePath\(\)\)\.commit\(\)/.test(plugin) && /recoverPendingCapture\(\)/.test(plugin), '카메라 중 앱 화면이 정리돼도 찍은 사진 살림');
    assert.ok(/MediaStore\.ACTION_IMAGE_CAPTURE/.test(plugin) && /EXTRA_OUTPUT/.test(plugin), '순정 카메라');
    assert.ok(/startLocalOnlyHotspot/.test(receiver) && /usableSpace|getUsableSpace/.test(receiver), '전용 Wi-Fi, 저장 공간 확인');
    assert.ok(/ack\(out, true\)/.test(receiver) && receiver.indexOf('renameTo(done)') < receiver.indexOf('ack(out, true)'), '파일을 다 쓴 뒤에만 성공 답');

    const manifest = read('android/app/src/main/AndroidManifest.xml');
    ['ACCESS_WIFI_STATE', 'CHANGE_WIFI_STATE', 'CHANGE_NETWORK_STATE', 'ACCESS_NETWORK_STATE', 'CHANGE_WIFI_MULTICAST_STATE', 'ACCESS_FINE_LOCATION', 'NEARBY_WIFI_DEVICES',
        'POST_NOTIFICATIONS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'CAMERA'].forEach((p) => {
        assert.ok(manifest.includes(`android.permission.${p}"`), '권한 ' + p);
    });
    assert.ok(/\.relay\.PhotoRelayService"[\s\S]*?foregroundServiceType="dataSync"/.test(manifest), '전경 서비스');
    assert.ok(/\.relay\.QrScanActivity"/.test(manifest));
    assert.ok(/queries>[\s\S]*IMAGE_CAPTURE/.test(manifest), 'Android 11+ 에서 카메라 앱 찾기');
    assert.ok(/registerPlugin\(PhotoRelayPlugin\.class\)/.test(read(J + 'MainActivity.java')));
    const gradle = read('android/app/build.gradle');
    assert.ok(/com\.google\.zxing:core:3\.3\.3/.test(gradle) && /androidx\.camera:camera-view/.test(gradle));

    // 7) 웹 연결: 기존 Firebase 방식은 그대로, 오프라인 탭은 receivePhoneRelayPhoto 로
    const html = read('index.html');
    const app = read('app.js');
    assert.ok(/id="phoneRelayModeTabs"/.test(html) && /data-relay-mode="offline"[^>]*>오프라인 직접 받기</.test(html));
    assert.ok(/id="phoneRelayOnlinePane"[\s\S]*id="mobileQrCanvas"/.test(html), '기존 QR(인터넷) 그대로');
    assert.ok(/id="phoneRelayOfflinePane"/.test(html) && /id="btnOpenPhotoSendMode"/.test(html));
    assert.ok(/<script src="js\/core\/photo-relay-native\.js\?v=[^"]+"><\/script>[\s\S]*<script src="app\.js\?v=/.test(html), 'app.js 보다 먼저 읽음');
    assert.ok(/BsaPhotoRelayUI\.init\(\{\s*receive: \(dataUrl\) => receivePhoneRelayPhoto\(dataUrl\)/.test(app));
    assert.ok(/onModalOpen\(\{ onlineUnavailable: true \}\)/.test(app), '인터넷이 없으면 오프라인 탭으로 열림(예전엔 경고만 뜨고 안 열림)');
    assert.ok(/db\.collection\('photoRelay'\)/.test(app), '기존 인터넷 방식 유지');


    // 8) 2026-10-19 「받는쪽 핫스팟 켜주는 기능이랑 핫스팟 qr도 보여주는 기능」 — 전용 Wi-Fi 실패 시 휴대폰 핫스팟으로
    {
        assert.strictEqual(relay.validateHotspotInput('', 'abcdefgh'), '핫스팟 이름을 넣어 주세요.');
        assert.ok(relay.validateHotspotInput('Galaxy', 'short'));
        assert.strictEqual(relay.validateHotspotInput('Galaxy Tab S9', 'abcd1234'), null);
        assert.strictEqual(relay.validateHotspotInput('열린핫스팟', ''), null, '암호 없는 핫스팟 허용');
        assert.ok(relay.validateHotspotInput('가'.repeat(11), 'abcd1234'), '33바이트 이상 이름 거부');
        const mem = { v: {}, getItem(k) { return this.v[k] || null; }, setItem(k, x) { this.v[k] = x; } };
        assert.strictEqual(relay.loadManualHotspot(mem), null);
        relay.saveManualHotspot(mem, { ssid: 'Galaxy Tab S9', password: 'abcd1234', security: 'SAE' });
        assert.deepStrictEqual(relay.loadManualHotspot(mem), { ssid: 'Galaxy Tab S9', password: 'abcd1234', security: 'SAE' }, '한 번 넣으면 기억');
        mem.v.bsaRelayManualHotspot = '{broken';
        assert.strictEqual(relay.loadManualHotspot(mem), null);
        assert.strictEqual(relay.fixActionFor('LOCATION_OFF').action, 'location');
        assert.strictEqual(relay.fixActionFor('PERMISSION').action, 'appSettings');
        assert.strictEqual(relay.fixActionFor('MOBILE_HOTSPOT_ON').action, 'hotspotSettings');
        assert.strictEqual(relay.fixActionFor('HOTSPOT_TIMEOUT').action, 'hotspotSettings');
        assert.strictEqual(relay.fixActionFor(null), null);
        const failed = { receiving: true, hotspot: false, hotspotError: '모바일 핫스팟이 켜져 있어…', hotspotErrorCode: 'MOBILE_HOTSPOT_ON' };
        assert.strictEqual(relay.needsManual(failed), true, '실패하면 휴대폰 핫스팟 입력을 펼침');
        assert.strictEqual(relay.needsManual({ ...failed, manualSsid: 'Galaxy' }), false);
        assert.strictEqual(relay.needsManual({ receiving: true, hotspotMode: 'local', ssid: 'AndroidShare_1' }), false);
        const d1 = relay.describeReceiver(failed);
        assert.strictEqual(d1.tone, 'warn');
        assert.ok(/받기는 켜져 있음/.test(d1.title), '서버는 열려 있음을 알림');
        const d2 = relay.describeReceiver({ receiving: true, hotspotMode: 'manual', ssid: 'Galaxy', received: 2 });
        assert.strictEqual(d2.tone, 'ok');
        assert.ok(/휴대폰 핫스팟/.test(d2.title) && /2장/.test(d2.title) && /Galaxy/.test(d2.detail));
        assert.strictEqual(relay.describeReceiver({ receiving: true, hotspotMode: 'local', ssid: 'A', received: 0 }).title, '받을 준비 완료');
    }
    {
        const plugin2 = read(J + 'PhotoRelayPlugin.java');
        const recv2 = read(J + 'relay/ReceiverHub.java');
        const send2 = read(J + 'relay/SenderHub.java');
        assert.ok(/public void receiverUseManualHotspot\(PluginCall call\)/.test(plugin2) && /checkHotspotInput/.test(plugin2));
        assert.ok(/android\.settings\.TETHER_SETTINGS/.test(plugin2), '핫스팟 설정 화면 열기');
        assert.ok(!/call\.reject\([^;]*"LOCATION_OFF"\)/.test(plugin2) && /startServerOnly\(ctx\(\), "LOCATION_OFF"/.test(plugin2), '위치가 꺼져도 받기 서버는 열고 대안 안내');
        assert.ok(/startServerOnly\(ctx\(\), "PERMISSION"/.test(plugin2), '권한 거부여도 받기 서버는 연다');
        assert.ok(/getSecurityType\(\)/.test(recv2) && /if \(type == 2\) return "SAE"/.test(recv2), 'WPA3 전용 전용Wi-Fi는 QR에 SAE');
        assert.ok(/postDelayed\([\s\S]*HOTSPOT_TIMEOUT[\s\S]*15000\)/.test(recv2), '콜백이 안 오면 15초 뒤 실패 처리');
        assert.ok(/String other = "SAE"\.equalsIgnoreCase\(usedAuth\) \? "WPA" : "SAE"/.test(send2), 'WPA2/WPA3 바꿔 한 번 더');
        assert.ok(/requestNetwork\(req, cb, 60000\)/.test(send2), '연결 요청 시간 제한');
        assert.ok(/id="btnShowRelayQr"/.test(html), '홈: 받기용 핫스팟 켜기 · QR 보기');
        const mod = read('js/core/photo-relay-native.js');
        assert.ok(/getElementById\('btnShowRelayQr'\)[\s\S]*openQrScreen\(\{ autoStart: true \}\)/.test(mod), '한 번 누르면 켜고 QR 크게');
        assert.ok(/receiverUseManualHotspot\(saved\)/.test(mod), '전용 Wi-Fi 실패 시 기억한 휴대폰 핫스팟으로 QR');
    }

    console.log('test-photo-relay-native: ok');
})().catch((e) => { console.error(e); process.exit(1); });
