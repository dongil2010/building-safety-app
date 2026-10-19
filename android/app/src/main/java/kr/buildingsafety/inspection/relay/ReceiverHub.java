package kr.buildingsafety.inspection.relay;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 2026-10-19 받는 기기: 전용 핫스팟(LocalOnlyHotspot) + TCP 8888 서버 + UDP 8889 알림.
 * 받은 원본은 앱 안 받은편지함(files/photo-relay-inbox)에 먼저 저장하고 성공(0x01)을 답한다.
 * 그다음 갤러리(사진/스마트안전점검/현장전송)에 사본을 남기고, 웹 화면에는 결함 사진 규격으로 줄인 dataURL 을 보낸다.
 * 웹이 받았다고 확인(ack)하면 받은편지함에서 지운다 — 화면이 꺼져 있던 사이 받은 사진도 다음에 열 때 들어간다.
 */
public final class ReceiverHub {
    private static final ReceiverHub INSTANCE = new ReceiverHub();
    public static ReceiverHub get() { return INSTANCE; }

    public static final String GALLERY_DIR = "스마트안전점검/현장전송";
    private static final long MIN_FREE_BYTES = 30L * 1024L * 1024L;

    private Context app;
    private RelayEvents listener;
    private final Handler main = new Handler(Looper.getMainLooper());

    private WifiManager.LocalOnlyHotspotReservation reservation;
    private boolean hotspotStarting;
    private String ssid;
    private String password;
    /** QR 의 T: 값. WPA(WPA2·WPA2/3 겸용) / SAE(WPA3 전용) / nopass */
    private String security = "WPA";
    private String hotspotError;
    private String hotspotErrorCode;
    /** 전용 Wi-Fi 를 못 켤 때 쓰는 「휴대폰 핫스팟」(사용자가 설정에서 켜고 이름·암호를 입력). */
    private String manualSsid;
    private String manualPassword;
    private String manualSecurity = "WPA";

    private volatile boolean running;
    private ServerSocket serverSocket;
    private Thread acceptThread;
    private Thread beaconThread;
    private Thread probeThread;
    private DatagramSocket probeSocket;
    private ExecutorService clientPool;
    private final AtomicInteger receivedCount = new AtomicInteger();
    private final AtomicInteger seq = new AtomicInteger();
    private volatile String lastName;
    private volatile String lastError;
    /** 실제로 연 받기 포트(8888 이 막히면 8890…). 알림·같은 Wi-Fi QR 에 실린다. */
    private volatile int serverPort = SnapProtocol.DEFAULT_PORT;
    private volatile String serverError;
    private volatile String serverErrorCode;
    private int generation;
    private long hotspotStartedAt;
    private boolean earlyStopRetried;
    private int hotspotReq;
    private volatile int lohsReason = -1;

    public interface StartCallback { void done(boolean ok, String code, String message); }

    private ReceiverHub() { }

    public synchronized void setListener(RelayEvents l) { listener = l; }
    public synchronized void clearListener(RelayEvents l) { if (listener == l) listener = null; }

    private void emit(String type, JSObject data) {
        RelayEvents l;
        synchronized (this) { l = listener; }
        if (l != null) {
            try { l.onRelayEvent(type, data); } catch (Exception ignored) { }
        }
    }

    public boolean isActive() { return running || reservation != null || hotspotStarting; }

    public static File inboxDir(Context c) {
        File d = new File(c.getFilesDir(), "photo-relay-inbox");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    /** 전용 Wi-Fi 없이 받기 서버만 연다(권한·위치가 막혀 휴대폰 핫스팟이나 같은 Wi-Fi 로 받을 때). */
    public void startServerOnly(Context context, String code, String reason) {
        app = context.getApplicationContext();
        startServer();
        if (reservation == null && code != null) {
            hotspotError = reason;
            hotspotErrorCode = code;
        }
        PhotoRelayService.refresh(app);
        emitStatus();
    }

    /** 휴대폰 핫스팟 이름·암호를 QR 로 쓴다. ssid 가 비면 지운다. */
    public synchronized void setManualHotspot(String s, String p, String sec) {
        if (s == null || s.trim().isEmpty()) {
            manualSsid = null;
            manualPassword = null;
            manualSecurity = "WPA";
        } else {
            manualSsid = s.trim();
            manualPassword = p == null ? "" : p;
            manualSecurity = manualPassword.isEmpty() ? "nopass" : ("SAE".equalsIgnoreCase(sec) ? "SAE" : "WPA");
        }
        emitStatus();
    }

    /** 핫스팟을 켜고 서버를 연다. 이미 켜져 있으면 그대로 성공. 메인 스레드에서 부른다. */
    public void start(Context context, StartCallback cb) {
        earlyStopRetried = false;
        startInternal(context, cb);
    }

    private void startInternal(Context context, StartCallback cb) {
        app = context.getApplicationContext();
        RelayDiag.step(app, "server");
        startServer();
        RelayDiag.step(app, "lohs_request");
        if (reservation != null) { cb.done(true, null, null); emitStatus(); return; }
        if (hotspotStarting) { cb.done(true, null, null); emitStatus(); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            hotspotError = "이 기기(Android 7 이하)는 전용 Wi-Fi를 못 켭니다. 휴대폰 핫스팟을 켜고 아래에 이름·암호를 넣어 주세요.";
            hotspotErrorCode = "UNSUPPORTED";
            cb.done(false, "UNSUPPORTED", hotspotError);
            emitStatus();
            return;
        }
        WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
        if (wm == null) {
            hotspotError = "이 기기는 Wi-Fi 기능을 앱에서 쓸 수 없습니다. 「같은 Wi-Fi로 받기」나 휴대폰 핫스팟을 쓰세요.";
            hotspotErrorCode = "NO_WIFI";
            RelayDiag.error(app, hotspotErrorCode, hotspotError);
            cb.done(false, "NO_WIFI", hotspotError);
            emitStatus();
            return;
        }
        hotspotStarting = true;
        hotspotError = null;
        hotspotErrorCode = null;
        final boolean[] answered = { false };
        final int req = ++hotspotReq;
        // 일부 기기(삼성 포함)는 이미 요청 중이거나 Wi-Fi 상태가 꼬이면 콜백이 안 온다 — 15초 뒤 실패로 정리
        main.postDelayed(() -> {
            if (req == hotspotReq && hotspotStarting && reservation == null) {
                hotspotStarting = false;
                hotspotError = "전용 Wi-Fi가 응답하지 않습니다. Wi-Fi를 껐다 켠 뒤 「핫스팟 다시 켜기」를 누르거나, 휴대폰 핫스팟을 쓰세요.";
                hotspotErrorCode = "HOTSPOT_TIMEOUT";
                RelayDiag.error(app, hotspotErrorCode, hotspotError);
                if (!answered[0]) { answered[0] = true; cb.done(false, "HOTSPOT_TIMEOUT", hotspotError); }
                emitStatus();
            }
        }, 15000);
        try {
            wm.startLocalOnlyHotspot(new WifiManager.LocalOnlyHotspotCallback() {
                @Override
                public void onStarted(WifiManager.LocalOnlyHotspotReservation r) {
                    hotspotStarting = false;
                    // 싱글턴이 끝까지 잡고 있는다(놓치면 GC 가 reservation 을 닫아 전용 Wi-Fi 가 바로 꺼진다)
                    reservation = r;
                    hotspotStartedAt = System.currentTimeMillis();
                    RelayDiag.step(app, "lohs_started");
                    readConfig(r);
                    if (ssid == null) {
                        hotspotError = "전용 Wi-Fi는 켜졌는데 이름·암호를 못 읽었습니다(기기 제한). 「같은 Wi-Fi로 받기」나 휴대폰 핫스팟을 쓰세요.";
                        hotspotErrorCode = "HOTSPOT_NO_CONFIG";
                        RelayDiag.error(app, hotspotErrorCode, hotspotError);
                    } else {
                        RelayDiag.clearError(app);
                    }
                    PhotoRelayService.refresh(app);
                    if (!answered[0]) { answered[0] = true; cb.done(true, null, null); }
                    emitStatus();
                }

                @Override
                public void onStopped() {
                    hotspotStarting = false;
                    reservation = null;
                    ssid = null;
                    password = null;
                    boolean early = System.currentTimeMillis() - hotspotStartedAt < 10000;
                    if (early && !earlyStopRetried) {
                        // 켜지자마자 꺼지는 기기(Lenovo 등) — 한 번은 알아서 다시 켜 본다
                        earlyStopRetried = true;
                        hotspotStarting = true;
                        hotspotError = null;
                        hotspotErrorCode = null;
                        RelayDiag.step(app, "lohs_stopped_early_retry");
                        emitStatus();
                        main.postDelayed(() -> { hotspotStarting = false; startInternal(app, (a, b, c) -> { }); }, 1500);
                        return;
                    }
                    hotspotError = early
                        ? "전용 Wi-Fi가 켜지자마자 기기가 꺼 버립니다. 아래 「같은 Wi-Fi로 받기」 QR이나 휴대폰 핫스팟을 쓰세요."
                        : "전용 Wi-Fi가 꺼졌습니다. 「핫스팟 다시 켜기」를 눌러 주세요.";
                    hotspotErrorCode = early ? "HOTSPOT_STOPPED_EARLY" : "HOTSPOT_STOPPED";
                    RelayDiag.error(app, hotspotErrorCode, hotspotError);
                    PhotoRelayService.refresh(app);
                    emitStatus();
                }

                @Override
                public void onFailed(int reason) {
                    hotspotStarting = false;
                    reservation = null;
                    lohsReason = reason;
                    hotspotError = failReason(reason);
                    hotspotErrorCode = reason == 3 ? "MOBILE_HOTSPOT_ON" : "HOTSPOT_FAILED_" + reason;
                    RelayDiag.error(app, hotspotErrorCode, hotspotError);
                    if (!answered[0]) { answered[0] = true; cb.done(false, "HOTSPOT_FAILED_" + reason, hotspotError); }
                    emitStatus();
                }
            }, main);
        } catch (SecurityException e) {
            hotspotStarting = false;
            hotspotError = "권한이 없어 전용 Wi-Fi를 못 켰습니다. 위치·근처 기기 권한과 위치(GPS)를 켜 주세요.";
            hotspotErrorCode = "PERMISSION";
            RelayDiag.error(app, hotspotErrorCode, hotspotError + " " + e.getMessage());
            cb.done(false, "PERMISSION", hotspotError);
            emitStatus();
        } catch (IllegalStateException e) {
            // 이미 요청 중(다른 화면에서 켠 직후 등) — 콜백이 곧 오거나 위 15초 정리가 처리
            if (!answered[0]) { answered[0] = true; cb.done(true, null, null); }
        } catch (Exception e) {
            hotspotStarting = false;
            hotspotError = "전용 Wi-Fi를 켜지 못했습니다: " + e.getMessage();
            hotspotErrorCode = "HOTSPOT_ERROR";
            RelayDiag.error(app, hotspotErrorCode, e.getClass().getSimpleName() + ": " + e.getMessage());
            cb.done(false, "HOTSPOT_ERROR", hotspotError);
            emitStatus();
        }
    }

    private static String failReason(int reason) {
        switch (reason) {
            case 1: return "Wi-Fi 채널을 잡지 못했습니다(이 기기는 Wi-Fi 연결 중엔 전용 Wi-Fi를 못 켤 수 있음). 아래 「같은 Wi-Fi로 받기」 QR을 쓰거나, Wi-Fi를 끊고 다시 눌러 주세요.";
            case 2: return "기기가 전용 Wi-Fi를 거절했습니다(일반 오류). 아래 「같은 Wi-Fi로 받기」 QR이나 휴대폰 핫스팟을 쓰세요.";
            case 3: return "「모바일 핫스팟」이 켜져 있어 전용 Wi-Fi를 못 켭니다. 핫스팟을 끄고 다시 켜거나, 켜 둔 핫스팟 이름·암호를 아래에 넣어 그걸로 받으세요.";
            case 4: return "이 기기 설정(관리 정책)이 전용 Wi-Fi를 막고 있습니다. 휴대폰 핫스팟을 켜고 아래에 이름·암호를 넣어 주세요.";
            default: return "전용 Wi-Fi를 켜지 못했습니다(코드 " + reason + "). Wi-Fi를 켠 뒤 다시 누르거나, 휴대폰 핫스팟을 쓰세요.";
        }
    }

    @SuppressWarnings("deprecation")
    private void readConfig(WifiManager.LocalOnlyHotspotReservation r) {
        String s = null, p = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.net.wifi.SoftApConfiguration c = r.getSoftApConfiguration();
                s = c.getSsid();
                p = c.getPassphrase();
                // 삼성 등 Android 13+ 일부는 전용 Wi-Fi 를 WPA3 전용으로 만든다 — QR 에 SAE 라고 써야 보내는 폰이 WPA3 로 붙는다
                security = securityName(c.getSecurityType());
            } else {
                WifiConfiguration c = r.getWifiConfiguration();
                if (c != null) { s = c.SSID; p = c.preSharedKey; }
            }
        } catch (Exception ignored) { }
        ssid = unquote(s);
        password = unquote(p);
        if (password == null || password.isEmpty()) security = "nopass";
    }

    /** SoftApConfiguration.SECURITY_TYPE_*: 0 열림, 1 WPA2, 2 WPA3, 3 WPA2/3 겸용, 4+ 기타(OWE 등) */
    static String securityName(int type) {
        if (type == 0) return "nopass";
        if (type == 2) return "SAE";
        return "WPA";
    }

    private static String unquote(String s) {
        if (s == null) return null;
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) return s.substring(1, s.length() - 1);
        return s;
    }

    public synchronized void stop() {
        running = false;
        generation++;
        serverError = null;
        serverErrorCode = null;
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) { }
        serverSocket = null;
        try { if (probeSocket != null) probeSocket.close(); } catch (Exception ignored) { }
        probeSocket = null;
        if (beaconThread != null) beaconThread.interrupt();
        if (acceptThread != null) acceptThread.interrupt();
        if (probeThread != null) probeThread.interrupt();
        beaconThread = null;
        acceptThread = null;
        probeThread = null;
        if (clientPool != null) clientPool.shutdownNow();
        clientPool = null;
        if (reservation != null) {
            try { reservation.close(); } catch (Exception ignored) { }
        }
        reservation = null;
        hotspotStarting = false;
        ssid = null;
        password = null;
        security = "WPA";
        hotspotError = null;
        hotspotErrorCode = null;
        if (app != null) PhotoRelayService.refresh(app);
        emitStatus();
    }

    /**
     * 받기 서버를 연다. 포트는 이 자리에서 바로 열어 본다(예전엔 스레드 안에서 열다 실패하면 아무 말 없이 「꺼져 있음」이 됐다).
     * 8888 을 다른 앱이 쓰고 있으면 8890… 을 쓴다.
     */
    private synchronized void startServer() {
        if (running) return;
        final int gen = ++generation;
        lastError = null;
        final ServerSocket[] holder = new ServerSocket[1];
        final String[] err = new String[1];
        final java.util.concurrent.atomic.AtomicBoolean late = new java.util.concurrent.atomic.AtomicBoolean();
        Thread binder = new Thread(() -> {
            for (int port : SnapProtocol.SERVER_PORTS) {
                ServerSocket ss = null;
                try {
                    ss = new ServerSocket();
                    ss.setReuseAddress(true);
                    ss.bind(new InetSocketAddress(port));
                    synchronized (holder) {
                        if (late.get()) { ss.close(); return; }
                        holder[0] = ss;
                    }
                    return;
                } catch (Exception e) {
                    err[0] = e.getClass().getSimpleName() + ": " + e.getMessage();
                    if (ss != null) try { ss.close(); } catch (Exception ignored) { }
                }
            }
        }, "bsa-relay-bind");
        binder.start();
        try { binder.join(4000); } catch (InterruptedException ignored) { }
        ServerSocket ss;
        synchronized (holder) {
            late.set(true);
            ss = holder[0];
        }
        if (ss == null) {
            serverError = "사진 받기 통로(포트 8888)를 열지 못했습니다. 앱을 완전히 닫았다 다시 열어 주세요. (" + (err[0] == null ? "시간 초과" : err[0]) + ")";
            serverErrorCode = "SERVER_PORT";
            if (app != null) RelayDiag.error(app, serverErrorCode, serverError);
            return;
        }
        serverError = null;
        serverErrorCode = null;
        serverSocket = ss;
        serverPort = ss.getLocalPort();
        running = true;
        clientPool = Executors.newFixedThreadPool(3);
        final ServerSocket bound = ss;
        acceptThread = new Thread(() -> acceptLoop(gen, bound), "bsa-relay-accept");
        acceptThread.start();
        beaconThread = new Thread(this::beaconLoop, "bsa-relay-beacon");
        beaconThread.start();
        probeThread = new Thread(this::probeLoop, "bsa-relay-probe");
        probeThread.start();
    }

    private boolean current(int gen) {
        synchronized (this) { return running && gen == generation; }
    }

    private void acceptLoop(int gen, ServerSocket ss) {
        int errors = 0;
        while (current(gen)) {
            Socket s;
            try {
                s = ss.accept();
                errors = 0;
            } catch (Exception e) {
                if (!current(gen)) break;
                if (ss.isClosed() || ++errors > 20) {
                    synchronized (this) {
                        if (gen == generation) {
                            running = false;
                            serverError = "사진 받기 통로가 닫혔습니다: " + e.getMessage() + " 「핫스팟 다시 켜기」를 눌러 주세요.";
                            serverErrorCode = "SERVER_CLOSED";
                        }
                    }
                    if (app != null) RelayDiag.error(app, "SERVER_CLOSED", e.getMessage());
                    emitStatus();
                    break;
                }
                try { Thread.sleep(200); } catch (InterruptedException ie) { break; }
                continue;
            }
            ExecutorService pool = clientPool;
            if (pool == null) { closeQuietly(s); break; }
            pool.execute(() -> handleClient(s));
        }
        try { ss.close(); } catch (Exception ignored) { }
    }

    private void handleClient(Socket socket) {
        File part = null;
        try {
            socket.setSoTimeout(30000);
            DataInputStream in = new DataInputStream(socket.getInputStream());
            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            SnapProtocol.Header h;
            try {
                h = SnapProtocol.readHeader(in);
            } catch (SnapProtocol.EmptyConnectionException e) {
                return; // 찾기용 두드림
            } catch (SnapProtocol.ProtocolException e) {
                ack(out, false);
                return;
            }
            File dir = inboxDir(app);
            if (dir.getUsableSpace() < h.size + MIN_FREE_BYTES) {
                ack(out, false);
                lastError = "저장 공간이 부족해 사진을 못 받았습니다.";
                emitStatus();
                return;
            }
            String base = System.currentTimeMillis() + "_" + seq.incrementAndGet() + "_" + h.fileName;
            part = new File(dir, base + ".part");
            try (OutputStream fo = new FileOutputStream(part)) {
                SnapProtocol.copyExactly(in, fo, h.size);
            }
            File done = new File(dir, base);
            if (!part.renameTo(done)) throw new java.io.IOException("rename failed");
            part = null;
            ack(out, true);
            receivedCount.incrementAndGet();
            lastName = h.fileName;
            lastError = null;
            PhotoRelayService.refresh(app);
            afterReceive(done, h.fileName);
        } catch (Exception e) {
            lastError = "사진 받는 중 끊겼습니다: " + e.getMessage();
            emitStatus();
        } finally {
            if (part != null) part.delete();
            closeQuietly(socket);
        }
    }

    private static void ack(DataOutputStream out, boolean ok) {
        try {
            out.writeByte(ok ? SnapProtocol.ACK_SUCCESS : SnapProtocol.ACK_FAILURE);
            out.flush();
        } catch (Exception ignored) { }
    }

    private void afterReceive(File file, String name) {
        saveGalleryCopy(file, name);
        JSObject item = itemFor(file, true);
        if (item != null) emit("photoReceived", item);
        emitStatus();
    }

    /** 갤러리 사본(Android 10+, 권한 필요 없음). 웹에 넣기 전 원본 보관용. */
    private void saveGalleryCopy(File file, String name) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        try {
            ContentResolver cr = app.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + GALLERY_DIR);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return;
            try (OutputStream os = cr.openOutputStream(uri); InputStream is = new FileInputStream(file)) {
                if (os == null) return;
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
        } catch (Exception ignored) { }
    }

    private JSObject itemFor(File file, boolean withData) {
        String id = file.getName();
        String name = id;
        String[] parts = id.split("_", 3);
        if (parts.length == 3) name = parts[2];
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("name", name);
        o.put("size", file.length());
        o.put("receivedAt", file.lastModified());
        if (withData) {
            String data = RelayImage.toDataUrl(file);
            if (data == null) {
                try {
                    if (file.length() > 12L * 1024L * 1024L) return null;
                    byte[] raw = readAll(file);
                    data = "data:image/jpeg;base64," + Base64.encodeToString(raw, Base64.NO_WRAP);
                } catch (Exception e) {
                    return null;
                }
            }
            o.put("dataUrl", data);
        }
        return o;
    }

    private static byte[] readAll(File f) throws java.io.IOException {
        byte[] b = new byte[(int) f.length()];
        try (DataInputStream in = new DataInputStream(new FileInputStream(f))) { in.readFully(b); }
        return b;
    }

    /** 웹이 아직 확인하지 않은 받은 사진(오래된 순). limit 장까지만 dataURL 을 붙인다. */
    public JSArray pending(Context context, int limit) {
        if (app == null) app = context.getApplicationContext();
        File[] files = inboxDir(app).listFiles((d, n) -> !n.endsWith(".part"));
        JSArray arr = new JSArray();
        if (files == null) return arr;
        List<File> list = new ArrayList<>(Arrays.asList(files));
        Collections.sort(list, (a, b) -> a.getName().compareTo(b.getName()));
        int n = 0;
        for (File f : list) {
            if (n >= limit) break;
            JSObject item = itemFor(f, true);
            if (item != null) { arr.put(item); n++; }
        }
        return arr;
    }

    public int pendingCount(Context context) {
        File[] files = inboxDir(context.getApplicationContext()).listFiles((d, n) -> !n.endsWith(".part"));
        return files == null ? 0 : files.length;
    }

    public int ack(Context context, List<String> ids) {
        File dir = inboxDir(context.getApplicationContext());
        int n = 0;
        for (String id : ids) {
            if (id == null || id.contains("/") || id.contains("\\") || id.startsWith(".")) continue;
            File f = new File(dir, id);
            if (f.exists() && f.delete()) n++;
        }
        emitStatus();
        return n;
    }

    public JSObject status(Context context) {
        if (app == null && context != null) app = context.getApplicationContext();
        JSObject o = new JSObject();
        boolean local = reservation != null && ssid != null;
        String showSsid = local ? ssid : manualSsid;
        String showPass = local ? password : manualPassword;
        String showSec = local ? security : manualSecurity;
        o.put("receiving", running);
        o.put("hotspot", reservation != null);
        o.put("hotspotStarting", hotspotStarting);
        o.put("hotspotMode", local ? "local" : (manualSsid != null ? "manual" : null));
        o.put("ssid", running ? showSsid : null);
        o.put("password", running ? showPass : null);
        o.put("security", showSec);
        o.put("manualSsid", manualSsid);
        o.put("hotspotError", hotspotError);
        o.put("hotspotErrorCode", hotspotErrorCode);
        o.put("lastError", lastError);
        o.put("received", receivedCount.get());
        o.put("lastName", lastName);
        o.put("port", serverPort);
        o.put("serverError", serverError);
        o.put("serverErrorCode", serverErrorCode);
        if (lohsReason >= 0) o.put("lohsReason", lohsReason);
        String code = serverErrorCode != null ? serverErrorCode : (local ? null : hotspotErrorCode);
        o.put("errorCode", code);
        List<String> ips = new ArrayList<>();
        for (InterfaceAddress a : lanAddresses()) ips.add(a.getAddress().getHostAddress());
        o.put("ips", new JSArray(ips));
        if (app != null) o.put("pending", pendingCount(app));
        if (running && showSsid != null) {
            String text = SnapProtocol.wifiQr(showSsid, showPass, showSec);
            o.put("qrText", text);
            String qr = QrImage.dataUrl(text, 720);
            if (qr != null) o.put("qrDataUrl", qr);
        }
        // 핫스팟 없이: 이 기기가 지금 붙어 있는 Wi-Fi(공유기) 주소로 바로 받는 QR
        String[] lan = app == null ? null : wifiLan(app);
        if (lan != null) {
            o.put("lanIp", lan[0]);
            o.put("lanSsid", lan[1]);
            if (running) {
                String lt = SnapProtocol.lanQr(lan[0], serverPort, Build.MODEL, lan[1]);
                o.put("lanQrText", lt);
                String lq = QrImage.dataUrl(lt, 720);
                if (lq != null) o.put("lanQrDataUrl", lq);
            }
        }
        JSObject diag = RelayDiag.snapshot(app);
        o.put("diag", diag);
        o.put("diagLine", RelayDiag.line(diag, code));
        return o;
    }

    public String notificationText() {
        int n = receivedCount.get();
        if (!running) return null;
        String shown = reservation != null && ssid != null ? ssid : manualSsid;
        if (shown != null) return "사진 받는 중 · Wi-Fi " + shown + (n > 0 ? " · 받은 사진 " + n + "장" : "");
        return "사진 받는 중" + (n > 0 ? " · 받은 사진 " + n + "장" : "");
    }

    private void emitStatus() {
        JSObject s = status(app);
        emit("receiverStatus", s);
    }

    /** 이 기기의 사설 IPv4 주소(핫스팟·Wi-Fi). */
    static List<InterfaceAddress> lanAddresses() {
        List<InterfaceAddress> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            while (ifs != null && ifs.hasMoreElements()) {
                NetworkInterface ni = ifs.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("tun") || name.startsWith("dummy")) continue;
                for (InterfaceAddress a : ni.getInterfaceAddresses()) {
                    InetAddress ip = a.getAddress();
                    if (ip instanceof Inet4Address && ip.isSiteLocalAddress()) out.add(a);
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** 이 기기가 붙어 있는 Wi-Fi(공유기)의 {IPv4, Wi-Fi 이름(모르면 null)}. 전용 Wi-Fi(핫스팟) 주소는 아님. Wi-Fi 에 안 붙어 있으면 null. */
    @SuppressWarnings("deprecation")
    static String[] wifiLan(Context c) {
        String ip = null;
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                for (Network n : cm.getAllNetworks()) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                    if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
                    LinkProperties lp = cm.getLinkProperties(n);
                    if (lp == null) continue;
                    for (LinkAddress la : lp.getLinkAddresses()) {
                        InetAddress a = la.getAddress();
                        if (a instanceof Inet4Address && a.isSiteLocalAddress()) { ip = a.getHostAddress(); break; }
                    }
                    if (ip != null) break;
                }
            }
        } catch (Exception ignored) { }
        if (ip == null) return null;
        String name = null;
        try {
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiInfo wi = wm == null ? null : wm.getConnectionInfo();
            if (wi != null) name = unquote(wi.getSSID());
            if (name != null && (name.isEmpty() || name.contains("unknown ssid"))) name = null;
        } catch (Exception ignored) { }
        return new String[] { ip, name };
    }

    private void beaconLoop() {
        String device = Build.MODEL == null ? "Android" : Build.MODEL;
        while (running) {
            for (InterfaceAddress a : lanAddresses()) {
                String ip = a.getAddress().getHostAddress();
                byte[] data = SnapProtocol.beacon(device, ip, serverPort).getBytes(StandardCharsets.UTF_8);
                try (DatagramSocket ds = new DatagramSocket(new InetSocketAddress(a.getAddress(), 0))) {
                    ds.setBroadcast(true);
                    InetAddress bc = a.getBroadcast();
                    if (bc != null) ds.send(new DatagramPacket(data, data.length, bc, SnapProtocol.DISCOVERY_PORT));
                    ds.send(new DatagramPacket(data, data.length, InetAddress.getByName("255.255.255.255"), SnapProtocol.DISCOVERY_PORT));
                } catch (Exception ignored) { }
            }
            try { Thread.sleep(2000); } catch (InterruptedException e) { break; }
        }
    }

    /** 보내는 쪽이 "SNAP_SYNC_DISCOVER" 로 물으면 그 주소로 바로 알림을 돌려준다. */
    private void probeLoop() {
        String device = Build.MODEL == null ? "Android" : Build.MODEL;
        DatagramSocket ds = null;
        try {
            ds = new DatagramSocket(null);
            ds.setReuseAddress(true);
            ds.bind(new InetSocketAddress(SnapProtocol.DISCOVERY_PORT));
            ds.setBroadcast(true);
            synchronized (this) { probeSocket = ds; }
            byte[] buf = new byte[512];
            while (running) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    ds.receive(p);
                } catch (Exception e) {
                    if (!running || ds.isClosed()) break;
                    continue;
                }
                String msg = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                if (!msg.startsWith(SnapProtocol.PROBE_PREFIX)) continue;
                InetAddress from = p.getAddress();
                for (InterfaceAddress a : lanAddresses()) {
                    if (!sameSubnet(a, from)) continue;
                    byte[] data = SnapProtocol.beacon(device, a.getAddress().getHostAddress(), serverPort).getBytes(StandardCharsets.UTF_8);
                    try { ds.send(new DatagramPacket(data, data.length, from, SnapProtocol.DISCOVERY_PORT)); } catch (Exception ignored) { }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (ds != null) ds.close();
        }
    }

    static boolean sameSubnet(InterfaceAddress a, InetAddress other) {
        if (!(other instanceof Inet4Address)) return false;
        byte[] x = a.getAddress().getAddress();
        byte[] y = other.getAddress();
        int prefix = a.getNetworkPrefixLength();
        if (prefix <= 0 || prefix > 32) prefix = 24;
        int mask = prefix == 32 ? -1 : ~((1 << (32 - prefix)) - 1);
        int xi = ((x[0] & 0xff) << 24) | ((x[1] & 0xff) << 16) | ((x[2] & 0xff) << 8) | (x[3] & 0xff);
        int yi = ((y[0] & 0xff) << 24) | ((y[1] & 0xff) << 16) | ((y[2] & 0xff) << 8) | (y[3] & 0xff);
        return (xi & mask) == (yi & mask);
    }

    private static void closeQuietly(Socket s) {
        try { s.close(); } catch (Exception ignored) { }
    }
}
