package kr.buildingsafety.inspection;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        lockWebViewTextScale();
    }

    @Override
    public void onStart() {
        super.onStart();
        lockWebViewTextScale();
    }

    @Override
    public void onResume() {
        super.onResume();
        lockWebViewTextScale();
    }

    /** Ignore system font size / accessibility text scale so layout stays consistent. */
    private void lockWebViewTextScale() {
        try {
            if (getBridge() == null) return;
            WebView webView = getBridge().getWebView();
            if (webView == null) return;
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            // Keep minimum font floor from inflating UI on some OEM WebViews
            settings.setMinimumFontSize(1);
            settings.setMinimumLogicalFontSize(1);
        } catch (Exception ignored) {
            // Bridge/WebView may not be ready on first frame; onStart/onResume retry.
        }
    }
}