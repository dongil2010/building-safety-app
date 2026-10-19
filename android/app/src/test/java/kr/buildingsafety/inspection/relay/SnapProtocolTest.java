package kr.buildingsafety.inspection.relay;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

/** 2026-10-19 SnapSync 규격 호환(바이트 단위)과 크기·이름 제한. */
public class SnapProtocolTest {

    /** SnapSync PhotoClient 가 쓰는 그대로의 바이트(MAGIC, int 이름길이, 이름, long 크기, 본문). */
    private static byte[] snapSyncFrame(String name, byte[] body) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(bos);
        dos.write(new byte[] { 'S', 'N', 'A', 'P' });
        byte[] n = name.getBytes(StandardCharsets.UTF_8);
        dos.writeInt(n.length);
        dos.write(n);
        dos.writeLong(body.length);
        dos.write(body);
        dos.flush();
        return bos.toByteArray();
    }

    @Test
    public void readsSnapSyncFrame() throws Exception {
        byte[] body = new byte[100000];
        for (int i = 0; i < body.length; i++) body[i] = (byte) (i * 31);
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(snapSyncFrame("SNAP_20261019_101010.jpg", body)));
        SnapProtocol.Header h = SnapProtocol.readHeader(in);
        assertEquals("SNAP_20261019_101010.jpg", h.fileName);
        assertEquals(body.length, h.size);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        SnapProtocol.copyExactly(in, out, h.size);
        assertArrayEquals(body, out.toByteArray());
    }

    @Test
    public void writerMatchesSnapSyncBytes() throws Exception {
        byte[] body = "hello".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(bos);
        SnapProtocol.writeHeader(dos, "SNAP_1.jpg", body.length);
        dos.write(body);
        assertArrayEquals(snapSyncFrame("SNAP_1.jpg", body), bos.toByteArray());
        assertEquals(1, SnapProtocol.ACK_SUCCESS);
        assertEquals(0, SnapProtocol.ACK_FAILURE);
        assertEquals(8888, SnapProtocol.DEFAULT_PORT);
        assertEquals(8889, SnapProtocol.DISCOVERY_PORT);
    }

    @Test
    public void rejectsHugeNameAndSize() throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(bos);
        dos.write(SnapProtocol.MAGIC);
        dos.writeInt(10_000_000);
        try {
            SnapProtocol.readHeader(new DataInputStream(new ByteArrayInputStream(bos.toByteArray())));
            fail("name length cap");
        } catch (SnapProtocol.ProtocolException expected) { }

        bos.reset();
        dos.write(SnapProtocol.MAGIC);
        dos.writeInt(3);
        dos.write("a.j".getBytes(StandardCharsets.UTF_8));
        dos.writeLong(SnapProtocol.MAX_FILE_BYTES + 1);
        try {
            SnapProtocol.readHeader(new DataInputStream(new ByteArrayInputStream(bos.toByteArray())));
            fail("size cap");
        } catch (SnapProtocol.ProtocolException expected) { }

        try {
            SnapProtocol.readHeader(new DataInputStream(new ByteArrayInputStream("HTTP".getBytes(StandardCharsets.UTF_8))));
            fail("bad magic");
        } catch (SnapProtocol.ProtocolException expected) { }

        try {
            SnapProtocol.readHeader(new DataInputStream(new ByteArrayInputStream(new byte[0])));
            fail("empty");
        } catch (SnapProtocol.EmptyConnectionException expected) { }
    }

    @Test
    public void truncatedBodyFails() throws Exception {
        byte[] frame = snapSyncFrame("x.jpg", new byte[5000]);
        byte[] cut = java.util.Arrays.copyOf(frame, frame.length - 10);
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(cut));
        SnapProtocol.Header h = SnapProtocol.readHeader(in);
        try {
            SnapProtocol.copyExactly(in, new ByteArrayOutputStream(), h.size);
            fail("must throw");
        } catch (java.io.EOFException expected) { }
    }

    @Test
    public void sanitizesNames() {
        assertEquals("passwd.jpg", SnapProtocol.sanitizeFileName("../../etc/passwd"));
        assertEquals("a_b.jpg", SnapProtocol.sanitizeFileName("a:b.jpg"));
        assertEquals("evil.JPG", SnapProtocol.sanitizeFileName("C:\\x\\..evil.JPG"));
        String longName = SnapProtocol.sanitizeFileName(new String(new char[300]).replace('\0', '가') + ".jpeg");
        assertTrue(longName.length() <= SnapProtocol.MAX_SAVED_NAME_CHARS);
        assertTrue(longName.endsWith(".jpeg"));
        assertTrue(SnapProtocol.sanitizeFileName("").startsWith("photo_"));
        assertTrue(SnapProtocol.sanitizeFileName("\u0000\u0001").endsWith(".jpg"));
    }

    @Test
    public void beaconsAndWifiQr() {
        String b = SnapProtocol.beacon("SM-X|200", "192.168.49.1", 8888);
        assertEquals("SNAP_SYNC_SERVER|SM-X_200|192.168.49.1|8888", b);
        String[] p = SnapProtocol.parseBeacon(b);
        assertEquals("192.168.49.1", p[1]);
        assertEquals("8888", p[2]);
        assertNull(SnapProtocol.parseBeacon("SNAP_SYNC_SERVER|x|not.an.ip|8888"));
        assertNull(SnapProtocol.parseBeacon("HELLO"));

        // SnapSync 수신 화면 QR(이스케이프 없음)
        String[] w = SnapProtocol.parseWifiQr("WIFI:S:AndroidShare_1234;T:WPA;P:abcd1234;;");
        assertEquals("AndroidShare_1234", w[0]);
        assertEquals("abcd1234", w[1]);
        assertEquals("WPA", w[2]);
        // 이스케이프 왕복
        String qr = SnapProtocol.wifiQr("현장;A", "p:w\\d");
        String[] back = SnapProtocol.parseWifiQr(qr);
        assertEquals("현장;A", back[0]);
        assertEquals("p:w\\d", back[1]);
        assertNull(SnapProtocol.parseWifiQr("https://example.com"));
        assertEquals("", SnapProtocol.parseWifiQr("WIFI:S:open;T:nopass;P:;;")[1]);
    }
    @Test
    public void samsungHotspotQrAndSecurity() {
        // 삼성 「모바일 핫스팟」 화면 QR 순서(T 먼저, H 붙음)
        String[] w = SnapProtocol.parseWifiQr("WIFI:T:WPA;S:Galaxy Tab S9 1234;P:abcd1234;H:false;;");
        assertEquals("Galaxy Tab S9 1234", w[0]);
        assertEquals("abcd1234", w[1]);
        assertEquals("WIFI:S:A;T:SAE;P:abcd1234;;", SnapProtocol.wifiQr("A", "abcd1234", "SAE"));
        assertEquals("WIFI:S:A;T:WPA;P:abcd1234;;", SnapProtocol.wifiQr("A", "abcd1234", "WPA"));
        assertEquals("WIFI:S:A;T:nopass;P:;;", SnapProtocol.wifiQr("A", "", "SAE"));
        assertEquals("SAE", SnapProtocol.parseWifiQr(SnapProtocol.wifiQr("A", "abcd1234", "SAE"))[2]);
        assertNull(SnapProtocol.checkHotspotInput("Galaxy", "abcd1234"));
        assertNull(SnapProtocol.checkHotspotInput("Galaxy", ""));
        assertTrue(SnapProtocol.checkHotspotInput("", "abcd1234") != null);
        assertTrue(SnapProtocol.checkHotspotInput("Galaxy", "short") != null);
        assertTrue(SnapProtocol.checkHotspotInput(new String(new char[11]).replace('\0', '가'), "abcd1234") != null);
    }
}
