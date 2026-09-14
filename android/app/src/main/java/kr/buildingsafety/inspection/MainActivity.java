package kr.buildingsafety.inspection;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void attachBaseContext(Context newBase) {
        // Force system font scale to 1.0 so every device paints the same UI ratio.
        Configuration config = new Configuration(newBase.getResources().getConfiguration());
        if (config.fontScale != 1f) {
            config.fontScale = 1f;
            Context ctx = newBase.createConfigurationContext(config);
            super.attachBaseContext(ctx);
            return;
        }
        super.attachBaseContext(newBase);
    }

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
        // Some OEMs re-apply accessibility scale on resume.
        try {
            Configuration config = new Configuration(getResources().getConfiguration());
            if (Math.abs(config.fontScale - 1f) > 0.001f) {
                config.fontScale = 1f;
                getResources().updateConfiguration(config, getResources().getDisplayMetrics());
                lockWebViewTextScale();
            }
        } catch (Exception ignored) { /* older API paths */ }
    }

    /** Ignore system font size / accessibility text scale so layout stays consistent. */
    private void lockWebViewTextScale() {
        try {
            if (getBridge() == null) return;
            WebView webView = getBridge().getWebView();
            if (webView == null) return;
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(85);
            settings.setMinimumFontSize(1);
            settings.setMinimumLogicalFontSize(1);
            // Re-assert after load; Pages content can inherit OEM text inflation.
            webView.post(() -> {
                try {
                    settings.setTextZoom(85);
                    webView.evaluateJavascript(
                        "(function(){try{document.documentElement.style.webkitTextSizeAdjust='100%';" +
                        "document.documentElement.style.textSizeAdjust='100%';" +
                        "document.body&&(document.body.style.webkitTextSizeAdjust='100%');}catch(e){}})();",
                        null
                    );
                } catch (Exception ignored) { }
            });
        } catch (Exception ignored) {
            // Bridge/WebView may not be ready on first frame; onStart/onResume retry.
        }
    }
}