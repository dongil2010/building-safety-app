package kr.buildingsafety.inspection;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 2026-10-16 (1.3.11) offline boot, same origin (https://dongil2010.github.io).
 *
 * Capacitor with server.url fetches app HTML natively; offline that throws -> errorPath (offline.html).
 * The Service Worker can't help because that native fetch bypasses it, and the app also loads
 * Firebase / CDN scripts synchronously from other hosts.
 *
 * This client keeps its own copy of every static file the app loads:
 *  - online: download it ourselves, save a copy in app files (net-cache/), serve it
 *            (HTML gets the Capacitor bridge script injected exactly like Capacitor does)
 *  - offline or download failed: serve the saved copy; for app files fall back to the copy bundled in the APK
 * API calls (Firestore, Auth, Storage, POST etc.) are never touched.
 */
public class OfflineAwareWebViewClient extends BridgeWebViewClient {
    private static final String APP_HOST = "dongil2010.github.io";
    private static final String APP_BASE = "/building-safety-app/";
    private final Context ctx;
    private final Bridge bridge;
    private final File cacheDir;

    public OfflineAwareWebViewClient(Bridge bridge, Context ctx) {
        super(bridge);
        this.bridge = bridge;
        this.ctx = ctx.getApplicationContext();
        this.cacheDir = new File(this.ctx.getFilesDir(), "net-cache");
        //noinspection ResultOfMethodCallIgnored
        cacheDir.mkdirs();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        try {
            if (request != null && "GET".equalsIgnoreCase(request.getMethod()) && isCacheable(request.getUrl())) {
                WebResourceResponse r = handle(request);
                if (r != null) return r;
            }
        } catch (Throwable ignored) { }
        return super.shouldInterceptRequest(view, request);
    }

    private boolean isAppUrl(Uri u) {
        return u != null && APP_HOST.equalsIgnoreCase(u.getHost()) && u.getPath() != null && u.getPath().startsWith(APP_BASE);
    }

    private boolean isCacheable(Uri u) {
        if (u == null || u.getScheme() == null || !u.getScheme().startsWith("http")) return false;
        String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        if (isAppUrl(u)) {
            String p = u.getPath();
            // never cache the version file (it must say "unknown" when offline)
            return !p.endsWith("/web-version.json");
        }
        if (host.equals("www.gstatic.com") || host.equals("cdnjs.cloudflare.com") || host.equals("cdn.jsdelivr.net")
            || host.equals("fonts.googleapis.com") || host.equals("fonts.gstatic.com") || host.equals("unpkg.com")) {
            return true;
        }
        return false;
    }

    private boolean isHtml(Uri u, String mime) {
        if (mime != null && mime.toLowerCase(Locale.ROOT).contains("text/html")) return true;
        String p = u.getPath() == null ? "" : u.getPath();
        return p.endsWith("/") || p.endsWith(".html");
    }

    private String keyFor(Uri u) {
        // ignore query (?v=, ?_r=) so offline lookups always hit
        String p = u.getPath() == null ? "/" : u.getPath();
        if (p.endsWith("/")) p = p + "index.html";
        String s = u.getHost() + p;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }

    private WebResourceResponse handle(WebResourceRequest request) throws Exception {
        Uri u = request.getUrl();
        String key = keyFor(u);
        File body = new File(cacheDir, key);
        File meta = new File(cacheDir, key + ".mime");
        if (hasInternet()) {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(u.toString()).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(20000);
                c.setInstanceFollowRedirects(true);
                for (Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
                    String k = h.getKey();
                    if (k == null || k.equalsIgnoreCase("Accept-Encoding") || k.equalsIgnoreCase("Range") || k.equalsIgnoreCase("If-None-Match") || k.equalsIgnoreCase("If-Modified-Since")) continue;
                    c.setRequestProperty(k, h.getValue());
                }
                String[] old = readMeta(meta);
                if (body.exists() && old[1].length() > 0) c.setRequestProperty("If-None-Match", old[1]);
                if (body.exists() && old[2].length() > 0) c.setRequestProperty("If-Modified-Since", old[2]);
                int code = c.getResponseCode();
                if (code == 304 && body.exists()) {
                    c.disconnect();
                    return respond(u, readAll(new FileInputStream(body)), old[0]);
                }
                if (code == 200) {
                    String mime = c.getContentType();
                    byte[] data = readAll(c.getInputStream());
                    save(body, meta, data, mime, c.getHeaderField("ETag"), c.getHeaderField("Last-Modified"));
                    c.disconnect();
                    return respond(u, data, mime);
                }
                c.disconnect();
                if (code >= 400 && code < 500) return null; // let the WebView show the real error
            } catch (Exception ignored) {
                // network flaked -> fall through to saved copy
            }
        }
        if (body.exists()) {
            String mime = readMeta(meta)[0];
            return respond(u, readAll(new FileInputStream(body)), mime.length() > 0 ? mime : null);
        }
        if (isAppUrl(u)) {
            String rel = u.getPath().substring(APP_BASE.length());
            if (rel.isEmpty() || rel.endsWith("/")) rel = rel + "index.html";
            try {
                byte[] data = readAll(ctx.getAssets().open("public/" + rel));
                return respond(u, data, guessMime(rel));
            } catch (Exception ignored) { }
        }
        return null;
    }

    private WebResourceResponse respond(Uri u, byte[] data, String mimeFull) {
        String mime = mimeFull == null ? guessMime(u.getPath()) : mimeFull.split(";")[0].trim();
        String enc = "UTF-8";
        InputStream in = new ByteArrayInputStream(data);
        if (isAppUrl(u) && isHtml(u, mime)) {
            mime = "text/html";
            in = inject(in);
        }
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
    }

    /** Same bridge script injection Capacitor does for its own pages (so plugins keep working). */
    private InputStream inject(InputStream in) {
        try {
            Object server = bridge.getLocalServer();
            Field f = server.getClass().getDeclaredField("jsInjector");
            f.setAccessible(true);
            Object inj = f.get(server);
            if (inj == null) return in;
            Method m = inj.getClass().getDeclaredMethod("getInjectedStream", InputStream.class);
            m.setAccessible(true);
            return (InputStream) m.invoke(inj, in);
        } catch (Throwable t) {
            return in;
        }
    }

    private static String guessMime(String path) {
        String p = path == null ? "" : path.toLowerCase(Locale.ROOT);
        if (p.endsWith("/") || p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".hwpx") || p.endsWith(".zip")) return "application/octet-stream";
        return "application/octet-stream";
    }

    private static String[] readMeta(File meta) {
        String[] out = new String[] { "", "", "" };
        try {
            if (!meta.exists()) return out;
            String[] parts = new String(readAll(new FileInputStream(meta)), "UTF-8").split("\n", -1);
            for (int i = 0; i < 3 && i < parts.length; i++) out[i] = parts[i].trim();
        } catch (Exception ignored) { }
        return out;
    }

    private static void save(File body, File meta, byte[] data, String mime, String etag, String lastMod) {
        try {
            File tmp = new File(body.getPath() + ".tmp");
            try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(data); }
            //noinspection ResultOfMethodCallIgnored
            tmp.renameTo(body);
            try (FileOutputStream o = new FileOutputStream(meta)) { o.write(((mime == null ? "" : mime) + "\n" + (etag == null ? "" : etag) + "\n" + (lastMod == null ? "" : lastMod)).getBytes("UTF-8")); }
        } catch (Exception ignored) { }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        try (InputStream i = in; ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = i.read(buf)) >= 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        }
    }

    private boolean hasInternet() {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            Network n = cm.getActiveNetwork();
            if (n == null) return false;
            NetworkCapabilities nc = cm.getNetworkCapabilities(n);
            if (nc == null) return false;
            return nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (Exception e) {
            return true;
        }
    }
}