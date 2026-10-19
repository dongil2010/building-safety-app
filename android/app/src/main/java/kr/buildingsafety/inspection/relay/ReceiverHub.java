package kr.buildingsafety.inspection.relay;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
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
    private String hotspotError;

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

    /** 핫스팟을 켜고 서버를 연다. 이미 켜져 있으면 그대로 성공. 메인 스레드에서 부른다. */
    public void start(Context context, StartCallback cb) {
        app = context.getApplicationContext();
        startServer();
        if (reservation != null) { cb.done(true, null, null); emitStatus(); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            hotspotError = "Android 8 이상에서만 이 기기가 직접 Wi-Fi를 켤 수 있습니다. 같은 Wi-Fi에 두 기기를 연결해 쓰세요.";
            cb.done(true, "NO_HOTSPOT", hotspotError);
            emitStatus();
            return;
        }
        WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
        if (wm == null) { cb.done(false, "NO_WIFI", "Wi-Fi 기능을 쓸 수 없는 기기입니다."); return; }
        hotspotStarting = true;
        hotspotError = null;
        final boolean[] answered = { false };
        try {
            wm.startLocalOnlyHotspot(new WifiManager.LocalOnlyHotspotCallback() {
                @Override
                public void onStarted(WifiManager.LocalOnlyHotspotReservation r) {
                    hotspotStarting = false;
                    reservation = r;
                    readConfig(r);
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
                    hotspotError = "전용 Wi-Fi가 꺼졌습니다. 「받기 시작」을 다시 눌러 주세요.";
                    emitStatus();
                }

                @Override
                public void onFailed(int reason) {
                    hotspotStarting = false;
                    reservation = null;
                    hotspotError = failReason(reason);
                    if (!answered[0]) { answered[0] = true; cb.done(false, "HOTSPOT_FAILED_" + reason, hotspotError); }
                    emitStatus();
                }
            }, main);
        } catch (SecurityException e) {
            hotspotStarting = false;
            hotspotError = "권한이 없어 전용 Wi-Fi를 못 켰습니다. 위치·근처 기기 권한과 위치(GPS)를 켜 주세요.";
            cb.done(false, "PERMISSION", hotspotError);
        } catch (IllegalStateException e) {
            // 이미 요청 중(다른 화면에서 켠 직후 등) — 콜백이 곧 온다
            if (!answered[0]) { answered[0] = true; cb.done(true, null, null); }
        } catch (Exception e) {
            hotspotStarting = false;
            hotspotError = "전용 Wi-Fi를 켜지 못했습니다: " + e.getMessage();
            cb.done(false, "HOTSPOT_ERROR", hotspotError);
        }
    }

    private static String failReason(int reason) {
        switch (reason) {
            case 1: return "Wi-Fi 채널을 잡지 못했습니다. 잠시 뒤 다시 눌러 주세요.";
            case 3: return "휴대폰 「모바일 핫스팟」이 켜져 있으면 못 켭니다. 핫스팟을 끄고 다시 눌러 주세요.";
            case 4: return "이 기기 설정(관리 정책)이 핫스팟을 막고 있습니다.";
            default: return "전용 Wi-Fi를 켜지 못했습니다(코드 " + reason + "). Wi-Fi를 켠 뒤 다시 눌러 주세요.";
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
            } else {
                WifiConfiguration c = r.getWifiConfiguration();
                if (c != null) { s = c.SSID; p = c.preSharedKey; }
            }
        } catch (Exception ignored) { }
        ssid = unquote(s);
        password = unquote(p);
    }

    private static String unquote(String s) {
        if (s == null) return null;
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) return s.substring(1, s.length() - 1);
        return s;
    }

    public synchronized void stop() {
        running = false;
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
        hotspotError = null;
        if (app != null) PhotoRelayService.refresh(app);
        emitStatus();
    }

    private synchronized void startServer() {
        if (running) return;
        running = true;
        lastError = null;
        clientPool = Executors.newFixedThreadPool(3);
        acceptThread = new Thread(this::acceptLoop, "bsa-relay-accept");
        acceptThread.start();
        beaconThread = new Thread(this::beaconLoop, "bsa-relay-beacon");
        beaconThread.start();
        probeThread = new Thread(this::probeLoop, "bsa-relay-probe");
        probeThread.start();
    }

    private void acceptLoop() {
        try {
            ServerSocket ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress(SnapProtocol.DEFAULT_PORT));
            synchronized (this) { serverSocket = ss; }
            while (running) {
                Socket s;
                try {
                    s = ss.accept();
                } catch (Exception e) {
                    if (!running) break;
                    continue;
                }
                ExecutorService pool = clientPool;
                if (pool == null) { closeQuietly(s); break; }
                pool.execute(() -> handleClient(s));
            }
        } catch (Exception e) {
            lastError = "받기 서버를 열지 못했습니다: " + e.getMessage();
            running = false;
            emitStatus();
        }
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
        o.put("receiving", running);
        o.put("hotspot", reservation != null);
        o.put("hotspotStarting", hotspotStarting);
        o.put("ssid", ssid);
        o.put("password", password);
        o.put("hotspotError", hotspotError);
        o.put("lastError", lastError);
        o.put("received", receivedCount.get());
        o.put("lastName", lastName);
        o.put("port", SnapProtocol.DEFAULT_PORT);
        List<String> ips = new ArrayList<>();
        for (InterfaceAddress a : lanAddresses()) ips.add(a.getAddress().getHostAddress());
        o.put("ips", new JSArray(ips));
        if (app != null) o.put("pending", pendingCount(app));
        if (ssid != null) {
            o.put("qrText", SnapProtocol.wifiQr(ssid, password));
            String qr = QrImage.dataUrl(SnapProtocol.wifiQr(ssid, password), 560);
            if (qr != null) o.put("qrDataUrl", qr);
        }
        return o;
    }

    public String notificationText() {
        int n = receivedCount.get();
        if (!running) return null;
        if (ssid != null) return "사진 받는 중 · Wi-Fi " + ssid + (n > 0 ? " · 받은 사진 " + n + "장" : "");
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

    private void beaconLoop() {
        String device = Build.MODEL == null ? "Android" : Build.MODEL;
        while (running) {
            for (InterfaceAddress a : lanAddresses()) {
                String ip = a.getAddress().getHostAddress();
                byte[] data = SnapProtocol.beacon(device, ip, SnapProtocol.DEFAULT_PORT).getBytes(StandardCharsets.UTF_8);
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
                    byte[] data = SnapProtocol.beacon(device, a.getAddress().getHostAddress(), SnapProtocol.DEFAULT_PORT).getBytes(StandardCharsets.UTF_8);
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
