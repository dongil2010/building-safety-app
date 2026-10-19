package kr.buildingsafety.inspection.relay;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.RouteInfo;
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
        return connect(context, wifiSsid, pass, auth, false);
    }

    /**
     * retry=true 는 WPA2↔WPA3 을 바꿔 한 번 더 붙어 보는 것. QR 에 WPA 라고 써 있어도
     * 삼성 휴대폰 핫스팟·전용 Wi-Fi 가 WPA3 전용이면 WPA2 암호로는 안 붙는다(반대도).
     */
    private synchronized boolean connect(Context context, String wifiSsid, String pass, String auth, boolean retry) {
        app = context.getApplicationContext();
        start(context);
        ssid = wifiSsid;
        releaseRequest();
        final String wantSsid = wifiSsid;
        final String wantPass = pass;
        final String usedAuth = auth;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            message = "이 폰(Android 9 이하)은 자동 연결이 안 됩니다. Wi-Fi 설정에서 「" + wifiSsid + "」에 직접 연결해 주세요.";
            emitStatus();
            return false;
        }
        ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        try {
            WifiNetworkSpecifier.Builder b = new WifiNetworkSpecifier.Builder().setSsid(wifiSsid);
            if (pass != null && !pass.isEmpty()) {
                if (auth != null && auth.equalsIgnoreCase("SAE")) b.setWpa3Passphrase(pass);
                else b.setWpa2Passphrase(pass);
            }
            NetworkRequest req = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .setNetworkSpecifier(b.build())
                .build();
            ConnectivityManager.NetworkCallback cb = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    requestedNet = network;
                    connecting = false;
                    receiverIp = null;
                    message = null;
                    wake();
                    emitStatus();
                }
                @Override public void onLost(Network network) {
                    if (network.equals(requestedNet)) requestedNet = null;
                    receiverIp = null;
                    message = "받는 기기 Wi-Fi 연결이 끊겼습니다. 다시 연결하는 중…";
                    emitStatus();
                }
                @Override public void onUnavailable() {
                    connecting = false;
                    if (!retry && wantPass != null && !wantPass.isEmpty() && active && wantSsid.equals(ssid)) {
                        String other = "SAE".equalsIgnoreCase(usedAuth) ? "WPA" : "SAE";
                        message = "다른 보안 방식(" + ("SAE".equals(other) ? "WPA3" : "WPA2") + ")으로 한 번 더 연결해 봅니다…";
                        emitStatus();
                        connect(app, wantSsid, wantPass, other, true);
                        return;
                    }
                    message = "Wi-Fi 연결이 취소됐거나 받는 기기 Wi-Fi를 못 찾았습니다. 받는 기기 화면에 QR이 떠 있는지 보고 다시 스캔해 주세요.";
                    emitStatus();
                }
            };
            requestCb = cb;
            connecting = true;
            message = null;
            cm.requestNetwork(req, cb, 60000);
            emitStatus();
            return true;
        } catch (Exception e) {
            connecting = false;
            message = "Wi-Fi 연결 요청 실패: " + e.getMessage();
            emitStatus();
            return false;
        }
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
        candidates.addAll(gatewayIps(net));
        candidates.add(FALLBACK_IP);
        for (String ip : candidates) {
            if (!active) return false;
            if (reachable(net, ip, SnapProtocol.DEFAULT_PORT)) {
                receiverIp = ip;
                receiverPort = SnapProtocol.DEFAULT_PORT;
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
            } else if (receiverIp == null) {
                state = "searching";
                emitStatus();
                if (findReceiver(net)) {
                    state = "ready";
                    message = null;
                    backoff = 0;
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
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try { ds.receive(p); } catch (SocketTimeoutException e) { continue; }
                    String[] b = SnapProtocol.parseBeacon(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                    if (b == null) continue;
                    beaconIps.remove(b[1]);
                    beaconIps.put(b[1], System.currentTimeMillis());
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
