package kr.buildingsafety.inspection.relay;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 2026-10-19 받는 기기 화면의 Wi-Fi QR 을 읽는 전체 화면(CameraX + ZXing). 읽으면 글자를 돌려주고 닫힌다. */
public class QrScanActivity extends AppCompatActivity {
    public static final String EXTRA_TEXT = "text";

    private PreviewView previewView;
    private ExecutorService analyzer;
    private final MultiFormatReader reader = new MultiFormatReader();
    private volatile boolean done;
    private ProcessCameraProvider provider;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        reader.setHints(hints);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        previewView = new PreviewView(this);
        root.addView(previewView, new FrameLayout.LayoutParams(-1, -1));

        View frame = new View(this);
        GradientDrawable box = new GradientDrawable();
        box.setStroke(dp(3), Color.WHITE);
        box.setCornerRadius(dp(18));
        frame.setBackground(box);
        FrameLayout.LayoutParams fp = new FrameLayout.LayoutParams(dp(250), dp(250), Gravity.CENTER);
        root.addView(frame, fp);

        TextView hint = new TextView(this);
        hint.setText("받는 기기 화면의 QR 코드를 네모 안에 비춰 주세요");
        hint.setTextColor(Color.WHITE);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(dp(20), dp(14), dp(20), dp(14));
        GradientDrawable hb = new GradientDrawable();
        hb.setColor(0x99000000);
        hb.setCornerRadius(dp(12));
        hint.setBackground(hb);
        FrameLayout.LayoutParams hp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        hp.bottomMargin = dp(120);
        hp.leftMargin = dp(16);
        hp.rightMargin = dp(16);
        root.addView(hint, hp);

        TextView cancel = new TextView(this);
        cancel.setText("취소");
        cancel.setTextColor(Color.WHITE);
        cancel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        cancel.setGravity(Gravity.CENTER);
        GradientDrawable cb = new GradientDrawable();
        cb.setColor(0xCC1F2937);
        cb.setCornerRadius(dp(26));
        cancel.setBackground(cb);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(dp(160), dp(52), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cp.bottomMargin = dp(40);
        root.addView(cancel, cp);
        cancel.setOnClickListener(v -> { setResult(RESULT_CANCELED); finish(); });

        setContentView(root);
        analyzer = Executors.newSingleThreadExecutor();
        startCamera();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(analyzer, this::analyze);
                provider.unbindAll();
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
            } catch (Exception e) {
                Intent data = new Intent().putExtra("error", "카메라를 열지 못했습니다: " + e.getMessage());
                setResult(RESULT_CANCELED, data);
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void analyze(ImageProxy image) {
        try {
            if (done) return;
            ImageProxy.PlaneProxy plane = image.getPlanes()[0];
            ByteBuffer buf = plane.getBuffer();
            byte[] data = new byte[buf.remaining()];
            buf.get(data);
            int rowStride = plane.getRowStride();
            int w = image.getWidth();
            int h = image.getHeight();
            if (data.length < rowStride * (h - 1) + w) return;
            PlanarYUVLuminanceSource src = new PlanarYUVLuminanceSource(data, rowStride, h, 0, 0, w, h, false);
            Result r = null;
            try {
                r = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(src)));
            } catch (Exception ignored) {
                // 못 찾음 — 다음 프레임
            } finally {
                reader.reset();
            }
            if (r != null && r.getText() != null && !done) {
                done = true;
                final String text = r.getText();
                runOnUiThread(() -> {
                    setResult(RESULT_OK, new Intent().putExtra(EXTRA_TEXT, text));
                    finish();
                });
            }
        } finally {
            image.close();
        }
    }

    @Override
    protected void onDestroy() {
        if (provider != null) try { provider.unbindAll(); } catch (Exception ignored) { }
        if (analyzer != null) analyzer.shutdown();
        super.onDestroy();
    }
}
