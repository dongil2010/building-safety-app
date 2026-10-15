package kr.buildingsafety.inspection;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.util.Map;

/**
 * 2026-10-15 offline boot fix.
 * With server.url, Capacitor fetches the app's HTML pages itself (HttpURLConnection) to inject its bridge script.
 * That bypasses the WebView network stack, so the page's Service Worker cache is never consulted:
 * offline -> exception -> errorPath (offline.html) and the app cannot open.
 * When there is no validated internet, let the WebView load the page itself (return null) so the
 * Service Worker (same origin https://dongil2010.github.io, same localStorage/IndexedDB) serves the cached app.
 */
public class OfflineAwareWebViewClient extends BridgeWebViewClient {
    private final Context ctx;

    public OfflineAwareWebViewClient(Bridge bridge, Context ctx) {
        super(bridge);
        this.ctx = ctx.getApplicationContext();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        try {
            if (isAppHtml(request) && !hasInternet()) {
                return null; // WebView + Service Worker handle it (cached app shell)
            }
        } catch (Exception ignored) { }
        return super.shouldInterceptRequest(view, request);
    }

    private boolean isAppHtml(WebResourceRequest request) {
        if (request == null || request.getUrl() == null) return false;
        if (!"GET".equalsIgnoreCase(request.getMethod())) return false;
        String host = request.getUrl().getHost();
        if (host == null || !host.equalsIgnoreCase("dongil2010.github.io")) return false;
        if (request.isForMainFrame()) return true;
        Map<String, String> h = request.getRequestHeaders();
        if (h == null) return false;
        for (Map.Entry<String, String> e : h.entrySet()) {
            if ("Accept".equalsIgnoreCase(e.getKey()) && e.getValue() != null && e.getValue().toLowerCase().contains("text/html")) return true;
        }
        return false;
    }

    private boolean hasInternet() {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        Network n = cm.getActiveNetwork();
        if (n == null) return false;
        NetworkCapabilities nc = cm.getNetworkCapabilities(n);
        if (nc == null) return false;
        return nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
}