package kr.buildingsafety.inspection.relay;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.RouteInfo;
import android.net.MacAddress;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import com.getcapacitor.JSObject;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.net.SocketFactory;

/**
 * 2026-10-19 보내는 기기: 받는 기기의 Wi-Fi(QR)에 붙고, 받는 기기를 찾고, 보낼함(files/photo-relay-outbox)의 사진을 차례로 보낸다.
 * - 앱 전체를 그 Wi-Fi 에 묶지 않는다(bindProcessToNetwork 금지). 사진 소켓만 그 Wi-Fi 의 socketFactory 로 연다.
 *   그래서 앱의 인터넷(서버 동기화)은 원래 망(LTE 등)으로 계속 간다.
 * - 받는 기기 찾기: ① UDP 8889 알림 ② 그 Wi-Fi 의 게이트웨이(핫스팟이면 받는 기기 자신) ③ 192.168.43.1. TCP 8888 이 열리는 주소를 쓴다.
 * - 보내다 실패한 사진은 지우지 않고 보낼함에 남겨 연결되면 다시 보낸다. 앱이 꺼졌다 켜져도 남는다.
 */
public final class SenderHub {
    private static final SenderHub INSTANCE = new SenderHub();
    public static SenderHub get() { return INSTANCE; }

    private static final String FALLBACK_IP = "192.168.43.1";

    private Context app;
    private RelayEvents listener;

    private ConnectivityManager.NetworkCallback requestCb;
    private volatile Network requestedNet;
    private volatile String ssid;
    private volatile boolean connecting;

    private volatile boolean active;
    private Thread worker;
    private Thread udpThread;
    private final Object kick = new Object();
    private WifiManager.MulticastLock multicastLock;

    private volatile String receiverIp;
    private volatile int receiverPort = SnapProtocol.DEFAULT_PORT;
    private volatile String receiverName;
    private final Map<String, Long> beaconIps = Collections.synchronizedMap(new LinkedHashMap<>());
    private final Map<String, Integer> beaconPorts = Collections.synchronizedMap(new LinkedHashMap<>());
    /** 「같은 Wi-Fi」 QR 로 받은 받는 기기 주소(핫스팟 없이 공유기로). 있으면 Wi-Fi 를 바꾸지 않고 여기로 보낸다. */
    private volatile String directIp;

    // 2026-10-20 「QR 찍어도 핫스팟 연결을 못해」 — 연결 시도 기록·실패 이유·수동 연결(설정에서 직접) 안내
    private volatile String qrSsid;
    private volatile String qrPass;
    private volatile String qrAuth;
    private volatile boolean qrHidden;
    private volatile String errorCode;
    private volatile boolean manual;
    private volatile int attemptNo;
    private volatile int attemptTotal;
    private volatile String attemptDesc;
    private volatile String scanInfo;
    private volatile String permNote;
    private volatile long connectedAt;
    private volatile int searchRounds;
    private List<Attempt> plan = new ArrayList<>();

    /** 연결 시도 하나: 보안 방식(WPA=WPA2 / SAE=WPA3 / nopass) + BSSID(주변 검색에서 찾았을 때만). */
    static final class Attempt {
        final String auth;
        final String bssid;
        Attempt(String auth, String bssid) { this.auth = auth; this.bssid = bssid; }
        String describe() {
            String a = "SAE".equalsIgnoreCase(auth) ? "WPA3" : ("nopass".equalsIgnoreCase(auth) ? "암호없음" : "WPA2");
            return bssid != null ? a + "+BSSID" : a;
        }
    }

    /**
     * 시도 순서. QR 의 T: 값 먼저(주변 검색에서 그 Wi-Fi 가 WPA3 전용이면 WPA3 먼저), 그다음 반대 방식,
     * 주변 검색에서 BSSID 를 알았으면 마지막에 BSSID 까지 붙여서(이름이 같은 Wi-Fi 가 여럿이거나 기기가 이름만으로 못 찾을 때).
     */
    static List<Attempt> buildPlan(String pass, String qrType, String scanCaps, String bssid) {
        List<Attempt> out = new ArrayList<>();
        if (pass == null || pass.isEmpty()) {
            out.add(new Attempt("nopass", null));
            if (bssid != null) out.add(new Attempt("nopass", bssid));
            return out;
        }
        String caps = scanCaps == null ? "" : scanCaps.toUpperCase(java.util.Locale.ROOT);
        boolean seenSae = caps.contains("SAE");
        boolean seenPsk = caps.contains("PSK");
        String first;
        if (seenSae && !seenPsk) first = "SAE";
        else if (seenPsk) first = "WPA";
        else first = "SAE".equalsIgnoreCase(qrType) ? "SAE" : "WPA";
        String second = "SAE".equals(first) ? "WPA" : "SAE";
        out.add(new Attempt(first, null));
        // 검색에서 한 방식만 보였으면 반대 방식은 소용없음 — 단, 검색 정보가 없으면 둘 다
        if (caps.isEmpty() || (seenSae && seenPsk)) out.add(new Attempt(second, null));
        if (bssid != null) out.add(new Attempt(first, bssid));
        return out;
    }

    /** 주파수(MHz) → 「2.4GHz」 등 */
    static String bandOf(int mhz) {
        if (mhz >= 2400 && mhz < 2500) return "2.4GHz";
        if (mhz >= 4900 && mhz < 5900) return "5GHz";
        if (mhz >= 5925 && mhz < 7125) return "6GHz";
        return mhz > 0 ? mhz + "MHz" : "?";
    }

    public void setPermNote(String note) { permNote = note; }
    private volatile int directPort = SnapProtocol.DEFAULT_PORT;
    private volatile String state = "idle";
    private volatile String message;
    private volatile int sent;
    private volatile int failed;
    private volatile String sendingName;
    private volatile String lastSentName;
    private final Map<String, Integer> attempts = Collections.synchronizedMap(new LinkedHashMap<>());

    private SenderHub() { }

    public synchronized void setListener(RelayEvents l) { listener = l; }
    public synchronized void clearListener(RelayEvents l) { if (listener == l) listener = null; }

    private void emit(String type, JSObject data) {
        RelayEvents l;
        synchronized (this) { l = listener; }
        if (l != null) {
            try { l.onRelayEvent(type, data); } catch (Exception ignored) { }
        }
    }

    public boolean isActive() { return active; }

    public static File outboxDir(Context c) {
        File d = new File(c.getFilesDir(), "photo-relay-outbox");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    /** 찍은 사진을 보낼함으로 옮긴다. 보낼함 파일 이름이 곧 id. */
    public String enqueue(Context context, File captured) {
        Context c = context.getApplicationContext();
        if (app == null) app = c;
        String name = SnapProtocol.sanitizeFileName(captured.getName());
        File dest = new File(outboxDir(c), System.currentTimeMillis() + "_" + name);
        if (!captured.renameTo(dest)) {
            try (InputStream in = new FileInputStream(captured); java.io.OutputStream out = new java.io.FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } catch (Exception e) {
                dest.delete();
                return null;
            }
            captured.delete();
        }
        wake();
        emitStatus();
        return dest.getName();
    }

    /** QR 에서 읽은 Wi-Fi 로 붙는다(Android 10+). 그 아래 버전은 Wi-Fi 설정에서 직접 붙인 뒤 start 만 부른다. */
    public synchronized boolean connect(Context context, String wifiSsid, String pass, String auth) {
        return connect(context, wifiSsid, pass, auth, false, true);
    }

    /**
     * hidden: QR 의 H:true. allowAuto=false 면(권한 없음 등) 자동 연결은 건너뛰고 바로 「설정에서 직접 연결」 안내.
     * 실패하면 시도 순서(buildPlan)대로 다음 방식으로, 다 실패하면 manual=true(화면이 이름·암호를 크게 보여 줌).
     * 직접 연결해도 workLoop 가 지금 붙은 Wi-Fi 에서 받는 기기를 찾아 자동으로 이어 보낸다.
     */
    public synchronized boolean connect(Context context, String wifiSsid, String pass, String auth, boolean hidden, boolean allowAuto) {
        app = context.getApplicationContext();
        directIp = null;
        start(context);
        releaseRequest();
        ssid = wifiSsid;
        qrSsid = wifiSsid;
        qrPass = pass == null ? "" : pass;
        qrAuth = auth;
        qrHidden = hidden;
        errorCode = null;
        manual = false;
        receiverIp = null;
        connectedAt = 0;
        searchRounds = 0;
        String[] seen = scanFor(wifiSsid);
        String caps = seen == null ? null : seen[0];
        String bssid = seen == null ? null : seen[1];
        plan = buildPlan(qrPass, auth, caps, bssid);
        attemptNo = 0;
        attemptTotal = plan.size();
        RelayDiag.step(app, "send_connect");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            goManual("OLD_ANDROID", "이 폰(Android 9 이하)은 자동 연결이 안 됩니다. Wi-Fi 설정에서 「" + wifiSsid + "」에 직접 연결하면 자동으로 이어서 보냅니다.");
            return false;
        }
        if (!allowAuto) {
            goManual("WIFI_PERMISSION", "「근처 기기」(또는 위치) 권한이 없어 자동 연결을 못 합니다. 아래 「Wi-Fi 설정 열기」에서 「" + wifiSsid + "」에 직접 연결하거나, 앱 권한을 허용한 뒤 「다시 자동 연결」을 누르세요.");
            return false;
        }
        return nextAttempt();
    }

    /** 마지막 QR 로 처음부터 다시 자동 연결. */
    public synchronized boolean retryLast(Context context) {
        if (qrSsid == null) return false;
        return connect(context, qrSsid, qrPass, qrAuth, qrHidden, true);
    }

    public String lastQrSsid() { return qrSsid; }
    public String lastQrPass() { return qrPass; }
    public String lastQrAuth() { return qrAuth; }
    public boolean lastQrHidden() { return qrHidden; }

    private void goManual(String code, String msg) {
        connecting = false;
        errorCode = code;
        manual = true;
        message = msg;
        if (app != null) RelayDiag.error(app, code, msg + (scanInfo != null ? " / 검색 " + scanInfo : ""));
        wake();
        emitStatus();
    }

    /** 주변 Wi-Fi 검색 결과에서 그 이름을 찾는다(권한·위치가 있어야 보임). {보안 문자열, BSSID} 또는 null. scanInfo 에 화면용 요약. */
    @SuppressWarnings("deprecation")
    private String[] scanFor(String want) {
        scanInfo = null;
        try {
            WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return null;
            if (!wm.isWifiEnabled()) { scanInfo = "Wi-Fi 꺼짐"; return null; }
            try { wm.startScan(); } catch (Exception ignored) { }
            List<ScanResult> list = wm.getScanResults();
            if (list == null || list.isEmpty()) { scanInfo = "검색 결과 없음(권한·위치 확인)"; return null; }
            ScanResult best = null;
            for (ScanResult r : list) {
                String name = Build.VERSION.SDK_INT >= 33 && r.getWifiSsid() != null ? unquote(r.getWifiSsid().toString()) : r.SSID;
                if (want.equals(name) && (best == null || r.level > best.level)) best = r;
            }
            if (best == null) { scanInfo = "주변에 안 보임"; return null; }
            scanInfo = "보임 " + bandOf(best.frequency) + " " + best.level + "dBm " + securityLabel(best.capabilities);
            return new String[] { best.capabilities, best.BSSID };
        } catch (SecurityException e) {
            scanInfo = "검색 권한 없음";
        } catch (Exception e) {
            scanInfo = "검색 오류";
        }
        return null;
    }

    static String securityLabel(String caps) {
        if (caps == null) return "";
        String c = caps.toUpperCase(java.util.Locale.ROOT);
        boolean sae = c.contains("SAE"), psk = c.contains("PSK");
        if (sae && psk) return "WPA2/3";
        if (sae) return "WPA3";
        if (psk) return "WPA2";
        if (c.contains("OWE")) return "OWE";
        return "열림";
    }

    private static String unquote(String s) {
        if (s == null) return null;
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) return s.substring(1, s.length() - 1);
        return s;
    }

    /** 시도 순서에서 다음 것을 요청. 남은 게 없으면 수동 연결 안내. */
    private synchronized boolean nextAttempt() {
        if (!active || qrSsid == null) return false;
        if (attemptNo >= plan.size()) {
            boolean notSeen = scanInfo != null && scanInfo.startsWith("주변에 안 보임");
            String band = scanInfo != null && (scanInfo.contains("5GHz") || scanInfo.contains("6GHz")) ? " 이 Wi-Fi는 " + (scanInfo.contains("6GHz") ? "6GHz" : "5GHz") + "라 이 폰이 못 잡을 수 있습니다." : "";
            goManual(notSeen ? "WIFI_NOT_SEEN" : "WIFI_UNAVAILABLE", notSeen
                ? "받는 기기 Wi-Fi 「" + qrSsid + "」가 이 폰 주변에 안 보입니다. 받는 기기 화면에 QR이 떠 있는지(핫스팟이 꺼지지 않았는지), 두 기기가 가까운지 보세요. 안 되면 아래에서 직접 연결하세요."
                : "자동 연결이 안 됐습니다(연결 창 취소·시간 초과 또는 기기 제한)." + band + " 아래 「Wi-Fi 설정 열기」에서 「" + qrSsid + "」에 직접 연결하면 자동으로 이어서 보냅니다.");
            return false;
        }
        Attempt at = plan.get(attemptNo++);
        attemptDesc = at.describe();
        ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) { goManual("NO_CONNECTIVITY", "연결 기능을 쓸 수 없습니다. 아래에서 직접 연결하세요."); return false; }
        try {
            WifiNetworkSpecifier.Builder b = new WifiNetworkSpecifier.Builder().setSsid(qrSsid);
            if (qrHidden) b.setIsHiddenSsid(true);
            if (at.bssid != null) {
                try { b.setBssid(MacAddress.fromString(at.bssid)); } catch (Exception ignored) { }
            }
            if (!"nopass".equalsIgnoreCase(at.auth)) {
                if ("SAE".equalsIgnoreCase(at.auth)) b.setWpa3Passphrase(qrPass);
                else b.setWpa2Passphrase(qrPass);
            }
            NetworkRequest req = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .setNetworkSpecifier(b.build())
                .build();
            final String wantSsid = qrSsid;
            ConnectivityManager.NetworkCallback cb = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    requestedNet = network;
                    connecting = false;
                    receiverIp = null;
                    message = null;
                    errorCode = null;
                    manual = false;
                    connectedAt = System.currentTimeMillis();
                    searchRounds = 0;
                    if (app != null) { RelayDiag.step(app, "send_wifi_ok"); RelayDiag.clearError(app); }
                    wake();
                    emitStatus();
                }
                @Override public void onLost(Network network) {
                    if (network.equals(requestedNet)) requestedNet = null;
                    receiverIp = null;
                    message = "받는 기기 Wi-Fi 연결이 끊겼습니다. 받는 기기 핫스팟이 꺼졌으면 다시 켜고 QR을 다시 스캔해 주세요.";
                    errorCode = "WIFI_LOST";
                    emitStatus();
                }
                @Override public void onUnavailable() {
                    synchronized (SenderHub.this) {
                        if (requestCb != this) return; // 이미 다른 시도로 넘어감
                        requestCb = null;
                    }
                    connecting = false;
                    if (!active || !wantSsid.equals(qrSsid)) return;
                    if (attemptNo < plan.size()) {
                        message = "연결이 안 돼 다른 방식(" + plan.get(attemptNo).describe() + ")으로 한 번 더 해 봅니다… 연결 창이 다시 뜨면 「연결」을 눌러 주세요.";
                        emitStatus();
                    }
                    nextAttempt();
                }
            };
            requestCb = cb;
            connecting = true;
            message = attemptNo > 1 ? message : null;
            if (app != null) RelayDiag.step(app, "send_request_" + attemptDesc);
            cm.requestNetwork(req, cb, 45000);
            emitStatus();
            return true;
        } catch (SecurityException e) {
            goManual("WIFI_PERMISSION", "권한이 없어 자동 연결을 못 합니다(" + e.getMessage() + "). 앱 권한에서 「근처 기기」·「위치」를 허용하거나, 아래에서 직접 연결하세요.");
            return false;
        } catch (Exception e) {
            if (app != null) RelayDiag.error(app, "WIFI_REQUEST", e.getClass().getSimpleName() + ": " + e.getMessage());
            return nextAttempt();
        }
    }

    /** 「같은 Wi-Fi」 QR: 지금 붙어 있는 Wi-Fi 그대로, 받는 기기 주소로 바로 보낸다. */
    public synchronized void connectLan(Context context, String ip, int port, String receiverLabel, String wifiName) {
        app = context.getApplicationContext();
        releaseRequest();
        qrSsid = null;
        manual = false;
        errorCode = null;
        directIp = ip;
        directPort = port;
        receiverIp = null;
        receiverName = receiverLabel == null || receiverLabel.isEmpty() ? null : receiverLabel;
        ssid = wifiName == null || wifiName.isEmpty() ? null : wifiName;
        message = null;
        start(context);
        wake();
        emitStatus();
    }

    private void releaseRequest() {
        ConnectivityManager.NetworkCallback cb = requestCb;
        requestCb = null;
        requestedNet = null;
        connecting = false;
        if (cb != null && app != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(cb);
            } catch (Exception ignored) { }
        }
    }

    /** 찾기·보내기 작업을 시작한다(QR 없이 이미 같은 Wi-Fi 에 붙어 있을 때도). */
    public synchronized void start(Context context) {
        app = context.getApplicationContext();
        if (active) { wake(); return; }
        active = true;
        try {
            WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                multicastLock = wm.createMulticastLock("bsa-photo-relay");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
            }
        } catch (Exception ignored) { }
        worker = new Thread(this::workLoop, "bsa-relay-send");
        worker.start();
        udpThread = new Thread(this::udpLoop, "bsa-relay-listen");
        udpThread.start();
        PhotoRelayService.refresh(app);
    }

    public synchronized void stop() {
        active = false;
        releaseRequest();
        if (worker != null) worker.interrupt();
        if (udpThread != null) udpThread.interrupt();
        worker = null;
        udpThread = null;
        try { if (multicastLock != null && multicastLock.isHeld()) multicastLock.release(); } catch (Exception ignored) { }
        multicastLock = null;
        receiverIp = null;
        receiverName = null;
        ssid = null;
        directIp = null;
        manual = false;
        errorCode = null;
        state = "idle";
        message = null;
        if (app != null) PhotoRelayService.refresh(app);
        emitStatus();
    }

    public void wake() {
        synchronized (kick) { kick.notifyAll(); }
    }

    /** 사진을 보낼 Wi-Fi: QR 로 요청한 망, 없으면 지금 붙어 있는 Wi-Fi. */
    private Network wifiNetwork() {
        Network n = requestedNet;
        if (n != null) return n;
        if (app == null) return null;
        try {
            ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;
            for (Network net : cm.getAllNetworks()) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(net);
                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return net;
            }
        } catch (Exception ignored) { }
        return null;
    }

    private List<String> gatewayIps(Network net) {
        List<String> out = new ArrayList<>();
        try {
            ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
            LinkProperties lp = cm == null ? null : cm.getLinkProperties(net);
            if (lp != null) {
                for (RouteInfo r : lp.getRoutes()) {
                    InetAddress g = r.getGateway();
                    if (g instanceof Inet4Address && !g.isAnyLocalAddress()) out.add(g.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** 그 Wi-Fi 에서 받은 내 주소의 x.y.z.1 과 DHCP 서버 주소(핫스팟이면 대개 받는 기기 자신). */
    private List<String> subnetGuesses(Network net) {
        List<String> out = new ArrayList<>();
        try {
            ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
            LinkProperties lp = cm == null ? null : cm.getLinkProperties(net);
            if (lp == null) return out;
            if (Build.VERSION.SDK_INT >= 30) {
                InetAddress d = lp.getDhcpServerAddress();
                if (d instanceof Inet4Address) out.add(d.getHostAddress());
            }
            for (android.net.LinkAddress la : lp.getLinkAddresses()) {
                InetAddress a = la.getAddress();
                if (a instanceof Inet4Address) {
                    byte[] b = a.getAddress();
                    out.add((b[0] & 0xff) + "." + (b[1] & 0xff) + "." + (b[2] & 0xff) + ".1");
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    private SocketFactory factory(Network net) {
        return net != null ? net.getSocketFactory() : SocketFactory.getDefault();
    }

    private boolean reachable(Network net, String ip, int port) {
        Socket s = null;
        try {
            s = factory(net).createSocket();
            s.connect(new InetSocketAddress(ip, port), 1500);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (s != null) try { s.close(); } catch (Exception ignored) { }
        }
    }

    private boolean findReceiver(Network net) {
        Set<String> candidates = new LinkedHashSet<>();
        synchronized (beaconIps) {
            List<String> recent = new ArrayList<>(beaconIps.keySet());
            Collections.reverse(recent);
            long now = System.currentTimeMillis();
            for (String ip : recent) if (now - beaconIps.get(ip) < 15000) candidates.add(ip);
        }
        String direct = directIp;
        if (direct != null) {
            // 같은 Wi-Fi QR: 그 주소부터(포트도 QR 그대로)
            if (reachable(net, direct, directPort)) {
                receiverIp = direct;
                receiverPort = directPort;
                return true;
            }
            message = "받는 기기(" + direct + ")에 닿지 않습니다. 두 기기가 같은 Wi-Fi(공유기)에 연결돼 있는지 보세요. 게스트 Wi-Fi·기기 간 차단(AP 격리)이 켜진 공유기는 안 됩니다.";
        }
        candidates.addAll(gatewayIps(net));
        candidates.addAll(subnetGuesses(net));
        candidates.add(FALLBACK_IP);
        for (String ip : candidates) {
            if (!active) return false;
            Integer bp = beaconPorts.get(ip);
            int port = bp == null ? SnapProtocol.DEFAULT_PORT : bp;
            if (reachable(net, ip, port)) {
                receiverIp = ip;
                receiverPort = port;
                return true;
            }
        }
        return false;
    }

    private void workLoop() {
        long backoff = 0;
        int idleTicks = 0;
        while (active) {
            Network net = wifiNetwork();
            if (net == null) {
                state = connecting ? "connecting" : "no_wifi";
                receiverIp = null;
                if (directIp != null && !connecting) {
                    message = "이 폰이 Wi-Fi에 연결돼 있지 않습니다. 받는 기기와 같은 Wi-Fi" + (ssid != null ? "(「" + ssid + "」)" : "") + "에 연결해 주세요.";
                }
            } else if (receiverIp == null) {
                state = "searching";
                emitStatus();
                if (findReceiver(net)) {
                    state = "ready";
                    message = null;
                    errorCode = null;
                    manual = false;
                    backoff = 0;
                    searchRounds = 0;
                } else if (++searchRounds >= 5 && directIp == null) {
                    errorCode = "RECEIVER_NOT_FOUND";
                    message = requestedNet != null
                        ? "받는 기기 Wi-Fi에는 연결됐는데 받는 기기를 못 찾았습니다. 받는 기기 화면에서 받기가 켜져 있는지(「받기 중지」를 누르지 않았는지) 보세요."
                        : "지금 연결된 Wi-Fi에서 받는 기기를 못 찾았습니다." + (qrSsid != null ? " 이 폰이 「" + qrSsid + "」에 연결돼 있는지 보세요." : "");
                }
            } else {
                state = "ready";
            }
            emitStatus();
            if ("ready".equals(state)) {
                File next = nextOutbox();
                if (next != null) {
                    idleTicks = 0;
                    boolean ok = sendOne(net, next);
                    if (ok) { backoff = 0; continue; }
                    backoff = Math.min(backoff == 0 ? 2000 : backoff * 2, 15000);
                } else if (++idleTicks % 5 == 0) {
                    // 보낼 사진이 없을 때도 10초마다 받는 기기가 살아 있는지 본다(「연결됨」이 거짓이 되지 않게)
                    String ip = receiverIp;
                    if (ip != null && !reachable(net, ip, receiverPort)) {
                        receiverIp = null;
                        state = "searching";
                        emitStatus();
                    }
                }
            }
            synchronized (kick) {
                try { kick.wait(backoff > 0 ? backoff : 2000); } catch (InterruptedException e) { break; }
            }
        }
    }

    private File nextOutbox() {
        if (app == null) return null;
        File[] files = outboxDir(app).listFiles();
        if (files == null || files.length == 0) return null;
        Arrays.sort(files, (a, b) -> a.getName().compareTo(b.getName()));
        return files[0];
    }

    private static String displayName(File f) {
        String n = f.getName();
        int u = n.indexOf('_');
        return u > 0 ? n.substring(u + 1) : n;
    }

    private boolean sendOne(Network net, File file) {
        String ip = receiverIp;
        if (ip == null) return false;
        String name = displayName(file);
        long size = file.length();
        if (size <= 0 || size > SnapProtocol.MAX_FILE_BYTES) {
            file.delete();
            failed++;
            JSObject r = new JSObject();
            r.put("id", file.getName());
            r.put("ok", false);
            r.put("name", name);
            r.put("message", size <= 0 ? "빈 사진이라 버렸습니다." : "사진이 너무 큽니다(40MB 초과).");
            emit("sendResult", r);
            return true;
        }
        sendingName = name;
        emitStatus();
        long t0 = System.currentTimeMillis();
        Socket s = null;
        String err = null;
        boolean ok = false;
        try {
            s = factory(net).createSocket();
            s.setSoTimeout(30000);
            s.connect(new InetSocketAddress(ip, receiverPort), 5000);
            DataOutputStream out = new DataOutputStream(new java.io.BufferedOutputStream(s.getOutputStream(), 64 * 1024));
            DataInputStream in = new DataInputStream(s.getInputStream());
            SnapProtocol.writeHeader(out, name, size);
            try (InputStream fin = new FileInputStream(file)) {
                SnapProtocol.copyExactly(fin, out, size);
            }
            out.flush();
            int ack = in.read();
            ok = ack == SnapProtocol.ACK_SUCCESS;
            if (!ok) err = ack < 0 ? "받는 기기가 답 없이 끊었습니다." : "받는 기기가 거절했습니다(저장 공간 등).";
        } catch (SocketTimeoutException e) {
            err = "시간이 초과됐습니다.";
        } catch (Exception e) {
            err = "보내지 못했습니다: " + e.getMessage();
        } finally {
            if (s != null) try { s.close(); } catch (Exception ignored) { }
            sendingName = null;
        }
        JSObject r = new JSObject();
        r.put("id", file.getName());
        r.put("name", name);
        r.put("ok", ok);
        r.put("bytes", size);
        r.put("ms", System.currentTimeMillis() - t0);
        if (ok) {
            file.delete();
            attempts.remove(file.getName());
            sent++;
            lastSentName = name;
            message = null;
        } else {
            Integer a = attempts.get(file.getName());
            int n = a == null ? 1 : a + 1;
            attempts.put(file.getName(), n);
            if (n == 1) failed++;
            r.put("attempt", n);
            r.put("message", err);
            message = err + " 연결되면 다시 보냅니다.";
            receiverIp = null; // 다시 찾기
        }
        emit("sendResult", r);
        PhotoRelayService.refresh(app);
        emitStatus();
        return ok;
    }

    /** UDP 8889 알림 듣기. 그 Wi-Fi 에 소켓을 묶어(Android 6+) 기본 망이 LTE 여도 핫스팟 쪽 알림을 받는다. */
    private void udpLoop() {
        byte[] probe = SnapProtocol.PROBE_PREFIX.getBytes(StandardCharsets.UTF_8);
        while (active) {
            Network net = wifiNetwork();
            DatagramSocket ds = null;
            try {
                ds = new DatagramSocket(null);
                ds.setReuseAddress(true);
                ds.setBroadcast(true);
                if (net != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    try { net.bindSocket(ds); } catch (Exception ignored) { }
                }
                ds.bind(new InetSocketAddress(SnapProtocol.DISCOVERY_PORT));
                ds.setSoTimeout(2500);
                if (receiverIp == null) {
                    try { ds.send(new DatagramPacket(probe, probe.length, InetAddress.getByName("255.255.255.255"), SnapProtocol.DISCOVERY_PORT)); } catch (Exception ignored) { }
                }
                byte[] buf = new byte[1024];
                long until = System.currentTimeMillis() + 10000;
                while (active && System.currentTimeMillis() < until) {
                    if (wifiNetwork() != net) break; // 받는 기기 Wi-Fi 에 막 붙었으면 그 망에 다시 묶는다
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try { ds.receive(p); } catch (SocketTimeoutException e) { continue; }
                    String[] b = SnapProtocol.parseBeacon(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                    if (b == null) continue;
                    beaconIps.remove(b[1]);
                    beaconIps.put(b[1], System.currentTimeMillis());
                    try { beaconPorts.put(b[1], Integer.parseInt(b[2])); } catch (Exception ignored) { }
                    if (b[1].equals(receiverIp)) receiverName = b[0];
                    if (receiverIp == null) { receiverName = b[0]; wake(); }
                }
            } catch (Exception e) {
                try { Thread.sleep(2000); } catch (InterruptedException ie) { break; }
            } finally {
                if (ds != null) ds.close();
            }
        }
    }

    public int queued() {
        if (app == null) return 0;
        File[] f = outboxDir(app).listFiles();
        return f == null ? 0 : f.length;
    }

    public JSObject status(Context context) {
        if (app == null && context != null) app = context.getApplicationContext();
        JSObject o = new JSObject();
        o.put("active", active);
        o.put("state", active ? state : "idle");
        o.put("ssid", ssid);
        o.put("connecting", connecting);
        o.put("receiverIp", receiverIp);
        o.put("receiverName", receiverName);
        o.put("queued", queued());
        o.put("sent", sent);
        o.put("failed", failed);
        o.put("sending", sendingName);
        o.put("lastSent", lastSentName);
        o.put("message", message);
        o.put("mode", directIp != null ? "lan" : (ssid != null ? "wifi" : null));
        o.put("errorCode", errorCode);
        o.put("manual", manual);
        if (manual && qrSsid != null) {
            o.put("qrSsid", qrSsid);
            o.put("qrPassword", qrPass);
        }
        o.put("canRetry", qrSsid != null && directIp == null);
        o.put("attempt", attemptNo);
        o.put("attempts", attemptTotal);
        o.put("attemptDesc", attemptDesc);
        o.put("scanInfo", scanInfo);
        o.put("permNote", permNote);
        JSObject diag = RelayDiag.snapshot(app);
        o.put("diag", diag);
        o.put("directIp", directIp);
        return o;
    }

    public String notificationText() {
        if (!active) return null;
        int q = queued();
        String head = "ready".equals(state) ? "사진 보내기 연결됨" : "받는 기기 찾는 중";
        return head + " · 보냄 " + sent + (q > 0 ? " · 대기 " + q : "");
    }

    private void emitStatus() {
        emit("senderStatus", status(app));
    }

    public int clearOutbox(Context context) {
        File[] f = outboxDir(context.getApplicationContext()).listFiles();
        int n = 0;
        if (f != null) for (File x : f) if (x.delete()) n++;
        attempts.clear();
        emitStatus();
        return n;
    }
}
