package kr.buildingsafety.inspection;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
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
        registerPlugin(GallerySaverPlugin.class);
        registerPlugin(PhotoRelayPlugin.class);
        super.onCreate(savedInstanceState);
        enterFullscreen();
        try {
            if (getBridge() != null) getBridge().setWebViewClient(new OfflineAwareWebViewClient(getBridge(), this));
        } catch (Exception ignored) { }
        lockWebViewTextScale();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
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
        enterFullscreen();
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

    /** 상태줄·하단 버튼을 숨겨 화면 전체를 쓴다. 가장자리를 쓸어 올리면 잠깐만 보인다. */
    private void enterFullscreen() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                View decor = getWindow().getDecorView();
                decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                );
            }
        } catch (Exception ignored) { }
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