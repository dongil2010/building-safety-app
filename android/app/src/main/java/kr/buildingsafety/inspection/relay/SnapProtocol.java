package kr.buildingsafety.inspection.relay;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.regex.Pattern;

/**
 * 2026-10-19 SnapSync(resilient-meitner) 사진 전송 규격을 그대로 따른다 — 그 앱과 서로 주고받을 수 있게.
 * 한 장 = TCP 연결 하나: "SNAP" 4바이트 → 파일 이름 길이(int, big-endian) → 이름(UTF-8) → 크기(long) → JPEG 바이트.
 * 받는 쪽은 다 받은 뒤 1바이트로 답한다(0x01 성공, 0x00 실패).
 * 찾기: 받는 기기가 UDP 8889 로 "SNAP_SYNC_SERVER|기기이름|IP|포트" 를 2초마다 뿌린다. 보내는 쪽은 "SNAP_SYNC_DISCOVER" 로 물을 수 있다.
 * Android 클래스를 쓰지 않아 PC JUnit 으로 바로 시험한다.
 */
public final class SnapProtocol {
    public static final int DEFAULT_PORT = 8888;
    public static final int DISCOVERY_PORT = 8889;
    /** 8888 을 다른 앱이 쓰고 있으면 차례로 시도(알림·같은 Wi-Fi QR 에 실제 포트를 실어 보낸다). 8889 는 알림용이라 뺀다. */
    public static final int[] SERVER_PORTS = { 8888, 8890, 8891, 8892, 8893, 8894 };
    /** 핫스팟 없이 같은 Wi-Fi(공유기)로 받을 때의 QR: BSARELAY:H:192.168.0.12;P:8888;N:기기이름;S:와이파이이름;; */
    public static final String LAN_QR_PREFIX = "BSARELAY:";
    public static final byte[] MAGIC = { 'S', 'N', 'A', 'P' };
    public static final int ACK_SUCCESS = 0x01;
    public static final int ACK_FAILURE = 0x00;
    public static final String BEACON_PREFIX = "SNAP_SYNC_SERVER|";
    public static final String PROBE_PREFIX = "SNAP_SYNC_DISCOVER";

    /** 이름이 이보다 길면 받지 않는다(이상한 길이로 메모리를 크게 잡지 않게). */
    public static final int MAX_NAME_BYTES = 512;
    /** 한 장 최대 크기. 폰 원본 사진은 보통 3~15MB. */
    public static final long MAX_FILE_BYTES = 40L * 1024L * 1024L;
    /** 저장할 때 쓰는 이름 최대 글자 수. */
    public static final int MAX_SAVED_NAME_CHARS = 80;

    private static final Pattern IPV4 = Pattern.compile("^(25[0-5]|2[0-4]\\d|1?\\d?\\d)(\\.(25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}$");

    private SnapProtocol() { }

    public static final class Header {
        public final String fileName;
        public final long size;
        public Header(String fileName, long size) { this.fileName = fileName; this.size = size; }
    }

    /** 규격에 안 맞는 연결. 실패 답(0x00)을 보내고 끊는다. */
    public static final class ProtocolException extends IOException {
        public ProtocolException(String message) { super(message); }
    }

    /** 아무것도 안 보내고 끊은 연결(찾기용으로 포트만 두드려 본 경우). 조용히 무시한다. */
    public static final class EmptyConnectionException extends IOException {
        public EmptyConnectionException() { super("empty connection"); }
    }

    public static void writeHeader(DataOutputStream out, String fileName, long size) throws IOException {
        if (size <= 0 || size > MAX_FILE_BYTES) throw new ProtocolException("size out of range: " + size);
        byte[] name = sanitizeFileName(fileName).getBytes(StandardCharsets.UTF_8);
        out.write(MAGIC);
        out.writeInt(name.length);
        out.write(name);
        out.writeLong(size);
    }

    public static Header readHeader(DataInputStream in) throws IOException {
        byte[] magic = new byte[MAGIC.length];
        int first = in.read();
        if (first < 0) throw new EmptyConnectionException();
        magic[0] = (byte) first;
        try {
            in.readFully(magic, 1, MAGIC.length - 1);
        } catch (EOFException e) {
            throw new ProtocolException("short magic");
        }
        if (!Arrays.equals(magic, MAGIC)) throw new ProtocolException("bad magic");
        int len = in.readInt();
        if (len <= 0 || len > MAX_NAME_BYTES) throw new ProtocolException("bad name length: " + len);
        byte[] nameBytes = new byte[len];
        in.readFully(nameBytes);
        long size = in.readLong();
        if (size <= 0 || size > MAX_FILE_BYTES) throw new ProtocolException("bad size: " + size);
        return new Header(sanitizeFileName(new String(nameBytes, StandardCharsets.UTF_8)), size);
    }

    /** 정확히 size 바이트를 옮긴다. 모자라면 EOFException. */
    public static void copyExactly(InputStream in, OutputStream out, long size) throws IOException {
        byte[] buf = new byte[64 * 1024];
        long left = size;
        while (left > 0) {
            int n = in.read(buf, 0, (int) Math.min(buf.length, left));
            if (n < 0) throw new EOFException("connection closed with " + left + " bytes left");
            out.write(buf, 0, n);
            left -= n;
        }
    }

    /** 경로·특수문자·제어문자를 빼고, 너무 길면 줄이고, 확장자가 없으면 .jpg 를 붙인다. */
    public static String sanitizeFileName(String raw) {
        String s = raw == null ? "" : raw;
        int slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        if (slash >= 0) s = s.substring(slash + 1);
        s = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        while (s.startsWith(".")) s = s.substring(1);
        String lower = s.toLowerCase();
        String ext = "";
        int dot = s.lastIndexOf('.');
        if (dot > 0 && lower.substring(dot).matches("\\.(jpe?g|png|webp|heic)")) {
            ext = s.substring(dot);
            s = s.substring(0, dot);
        }
        if (s.isEmpty()) s = "photo_" + System.currentTimeMillis();
        if (ext.isEmpty()) ext = ".jpg";
        int room = MAX_SAVED_NAME_CHARS - ext.length();
        if (s.length() > room) s = s.substring(0, room);
        return s + ext;
    }

    public static String beacon(String deviceName, String ip, int port) {
        String name = deviceName == null || deviceName.trim().isEmpty() ? "Android" : deviceName.replace('|', '_').trim();
        return BEACON_PREFIX + name + "|" + ip + "|" + port;
    }

    /** {이름, IP, 포트} 또는 null. */
    public static String[] parseBeacon(String message) {
        if (message == null || !message.startsWith(BEACON_PREFIX)) return null;
        String[] parts = message.substring(BEACON_PREFIX.length()).split("\\|");
        if (parts.length < 3) return null;
        String ip = parts[1].trim();
        if (!IPV4.matcher(ip).matches()) return null;
        int port;
        try { port = Integer.parseInt(parts[2].trim()); } catch (NumberFormatException e) { port = DEFAULT_PORT; }
        if (port <= 0 || port > 65535) port = DEFAULT_PORT;
        return new String[] { parts[0], ip, String.valueOf(port) };
    }

    public static boolean isIpv4(String s) {
        return s != null && IPV4.matcher(s).matches();
    }

    /** 표준 Wi-Fi QR: WIFI:S:<ssid>;T:<WPA|SAE|WEP|nopass>;P:<암호>;; (\ ; , : " 는 \ 로 이스케이프) */
    public static String wifiQr(String ssid, String password) {
        return wifiQr(ssid, password, "WPA");
    }

    /** security: WPA / SAE(WPA3 전용) / nopass. 암호가 없으면 nopass. */
    public static String wifiQr(String ssid, String password, String security) {
        boolean open = password == null || password.isEmpty() || "nopass".equalsIgnoreCase(security);
        String t = open ? "nopass" : ("SAE".equalsIgnoreCase(security) ? "SAE" : "WPA");
        return "WIFI:S:" + escape(ssid) + ";T:" + t + ";P:" + (open ? "" : escape(password)) + ";;";
    }

    /** 휴대폰 핫스팟 이름·암호 검사. 문제 없으면 null, 있으면 고칠 말. */
    public static String checkHotspotInput(String ssid, String password) {
        if (ssid == null || ssid.trim().isEmpty()) return "핫스팟 이름을 넣어 주세요.";
        if (ssid.trim().getBytes(StandardCharsets.UTF_8).length > 32) return "핫스팟 이름이 너무 깁니다(영문 32자까지).";
        if (password != null && !password.isEmpty() && (password.length() < 8 || password.length() > 63)) return "암호는 8~63자입니다.";
        return null;
    }

    /** {ssid, 암호(없으면 ""), 방식} 또는 null. 기존 SnapSync 처럼 이스케이프 없는 QR 도 읽는다. */
    public static String[] parseWifiQr(String content) {
        if (content == null) return null;
        String c = content.trim();
        if (!c.regionMatches(true, 0, "WIFI:", 0, 5)) return null;
        String ssid = null, pass = "", type = "";
        for (String f : splitFields(c.substring(5))) {
            if (f.length() < 2 || f.charAt(1) != ':') continue;
            char k = Character.toUpperCase(f.charAt(0));
            String v = f.substring(2);
            if (k == 'S') ssid = v;
            else if (k == 'P') pass = v;
            else if (k == 'T') type = v;
        }
        if (ssid == null || ssid.isEmpty()) return null;
        if (ssid.length() >= 2 && ssid.startsWith("\"") && ssid.endsWith("\"")) ssid = ssid.substring(1, ssid.length() - 1);
        return new String[] { ssid, pass, type };
    }

    /** 「같은 Wi-Fi」 QR. name·wifiSsid 는 화면 안내용(없어도 됨). */
    public static String lanQr(String ip, int port, String name, String wifiSsid) {
        StringBuilder b = new StringBuilder(LAN_QR_PREFIX);
        b.append("H:").append(escape(ip)).append(";P:").append(port).append(';');
        if (name != null && !name.isEmpty()) b.append("N:").append(escape(name)).append(';');
        if (wifiSsid != null && !wifiSsid.isEmpty()) b.append("S:").append(escape(wifiSsid)).append(';');
        return b.append(';').toString();
    }

    /** {ip, port, name, ssid} 또는 null(우리 QR 이 아니거나 주소가 이상함). */
    public static String[] parseLanQr(String content) {
        if (content == null) return null;
        String c = content.trim();
        if (!c.regionMatches(true, 0, LAN_QR_PREFIX, 0, LAN_QR_PREFIX.length())) return null;
        String ip = null, name = "", ssid = "";
        int port = DEFAULT_PORT;
        for (String f : splitFields(c.substring(LAN_QR_PREFIX.length()))) {
            if (f.length() < 2 || f.charAt(1) != ':') continue;
            char k = Character.toUpperCase(f.charAt(0));
            String v = f.substring(2);
            if (k == 'H') ip = v.trim();
            else if (k == 'P') {
                try { port = Integer.parseInt(v.trim()); } catch (NumberFormatException e) { return null; }
            } else if (k == 'N') name = v;
            else if (k == 'S') ssid = v;
        }
        if (!isIpv4(ip) || port < 1 || port > 65535) return null;
        return new String[] { ip, String.valueOf(port), name, ssid };
    }

    private static java.util.List<String> splitFields(String body) {
        java.util.List<String> fields = new java.util.ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < body.length(); i++) {
            char ch = body.charAt(i);
            if (ch == '\\' && i + 1 < body.length()) {
                cur.append(body.charAt(++i));
            } else if (ch == ';') {
                fields.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        if (cur.length() > 0) fields.add(cur.toString());
        return fields;
    }

    private static String escape(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder();
        for (char ch : s.toCharArray()) {
            if (ch == '\\' || ch == ';' || ch == ',' || ch == ':' || ch == '"') b.append('\\');
            b.append(ch);
        }
        return b.toString();
    }
}
