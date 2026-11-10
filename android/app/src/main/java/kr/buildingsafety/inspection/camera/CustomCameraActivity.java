package kr.buildingsafety.inspection.camera;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 2026-11-10 앱 전용 촬영 화면(CameraX). 순정 카메라 대신 쓴다.
 * - 줌: 배율 버튼(기기가 되는 배율만) + 두 손가락 벌리기. 화면을 누르면 그 자리에 초점.
 * - 촬영 버튼 자리: 왼쪽 / 가운데 / 오른쪽 (위 「촬영 버튼」을 눌러 바꾸고, 기기에 기억).
 * - 찍은 뒤 「확인」은 촬영 버튼과 같은 쪽(가운데면 오른쪽)에 크게, 「다시 찍기」는 반대쪽.
 * - 음량 버튼으로도 찍는다.
 * 결과: 긴 변을 줄이고 바로 세운 JPEG 를 앱 캐시에 두고 그 경로(EXTRA_PATH)를 돌려준다.
 */
public class CustomCameraActivity extends AppCompatActivity {
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_ERROR = "error";
    public static final String EXTRA_LONG_EDGE = "longEdge";
    public static final String EXTRA_QUALITY = "quality";

    private static final String PREFS = "bsa_camera";
    private static final String KEY_SHUTTER_POS = "shutterPos"; // 0 왼쪽, 1 가운데, 2 오른쪽
    private static final float[] ZOOM_STEPS = { 1f, 2f, 3f, 5f, 10f };
    private static final String[] POS_LABEL = { "왼쪽", "가운데", "오른쪽" };

    private PreviewView previewView;
    private ImageView reviewImage;
    private LinearLayout zoomRow;
    private TextView zoomLabel;
    private TextView posButton;
    private TextView torchButton;
    private FrameLayout captureBar;
    private FrameLayout reviewBar;
    private View shutter;
    private TextView closeButton;
    private TextView confirmButton;
    private TextView retakeButton;

    private final List<TextView> zoomChips = new ArrayList<>();
    private final List<Float> zoomChipValues = new ArrayList<>();
    private boolean zoomChipsBuilt;

    private ExecutorService io;
    private ProcessCameraProvider provider;
    private Camera camera;
    private ImageCapture imageCapture;
    private boolean busy;
    private boolean torchOn;
    private int shutterPos = 1;
    private int longEdge = 2000;
    private int quality = 90;
    private File shotFile;
    private Bitmap shotBitmap;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        longEdge = Math.max(640, Math.min(6000, getIntent().getIntExtra(EXTRA_LONG_EDGE, 2000)));
        quality = Math.max(50, Math.min(100, getIntent().getIntExtra(EXTRA_QUALITY, 90)));
        shutterPos = Math.max(0, Math.min(2, prefs().getInt(KEY_SHUTTER_POS, 1)));
        io = Executors.newSingleThreadExecutor();
        buildUi();
        startCamera();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    // ───────── 화면 ─────────

    @SuppressLint("ClickableViewAccessibility")
    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        // 찍히는 범위와 보이는 범위를 같게(잘라서 채우지 않음)
        previewView.setScaleType(PreviewView.ScaleType.FIT_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(-1, -1));

        reviewImage = new ImageView(this);
        reviewImage.setBackgroundColor(Color.BLACK);
        reviewImage.setScaleType(ImageView.ScaleType.FIT_CENTER);
        reviewImage.setVisibility(View.GONE);
        root.addView(reviewImage, new FrameLayout.LayoutParams(-1, -1));

        // 위: 닫기 · 플래시 · 촬영 버튼 자리
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(10), dp(8), dp(10), dp(8));
        closeButton = pill("닫기", 15);
        closeButton.setOnClickListener(v -> cancel());
        top.addView(closeButton);
        View spacer = new View(this);
        top.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));
        torchButton = pill("플래시 끔", 15);
        torchButton.setVisibility(View.GONE);
        torchButton.setOnClickListener(v -> toggleTorch());
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(-2, -2);
        tlp.rightMargin = dp(8);
        top.addView(torchButton, tlp);
        posButton = pill("", 15);
        posButton.setOnClickListener(v -> {
            shutterPos = (shutterPos + 1) % 3;
            prefs().edit().putInt(KEY_SHUTTER_POS, shutterPos).apply();
            applyShutterPos();
        });
        top.addView(posButton);
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // 아래: 줌 줄 + 촬영 줄
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);

        zoomLabel = new TextView(this);
        zoomLabel.setTextColor(Color.WHITE);
        zoomLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14);
        zoomLabel.setGravity(Gravity.CENTER);
        zoomLabel.setShadowLayer(4f, 0f, 0f, Color.BLACK);
        bottom.addView(zoomLabel, new LinearLayout.LayoutParams(-1, -2));

        zoomRow = new LinearLayout(this);
        zoomRow.setOrientation(LinearLayout.HORIZONTAL);
        zoomRow.setGravity(Gravity.CENTER);
        zoomRow.setPadding(0, dp(6), 0, dp(6));
        bottom.addView(zoomRow, new LinearLayout.LayoutParams(-1, -2));

        captureBar = new FrameLayout(this);
        shutter = new View(this);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.WHITE);
        ring.setStroke(dp(5), Color.argb(170, 0, 0, 0));
        shutter.setBackground(ring);
        shutter.setContentDescription("촬영");
        shutter.setOnClickListener(v -> shoot());
        captureBar.addView(shutter, new FrameLayout.LayoutParams(dp(84), dp(84)));
        bottom.addView(captureBar, new LinearLayout.LayoutParams(-1, dp(124)));

        reviewBar = new FrameLayout(this);
        reviewBar.setVisibility(View.GONE);
        confirmButton = bigButton("확인", Color.rgb(22, 163, 74), 22);
        confirmButton.setOnClickListener(v -> confirm());
        reviewBar.addView(confirmButton, new FrameLayout.LayoutParams(dp(170), dp(76)));
        retakeButton = bigButton("다시 찍기", Color.argb(200, 60, 60, 60), 17);
        retakeButton.setOnClickListener(v -> retake());
        reviewBar.addView(retakeButton, new FrameLayout.LayoutParams(dp(130), dp(64)));
        bottom.addView(reviewBar, new LinearLayout.LayoutParams(-1, dp(124)));

        root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        // 상태 표시줄·하단 버튼 자리만큼 안쪽으로
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        // 두 손가락 벌리기 = 줌, 한 번 누르기 = 초점
        ScaleGestureDetector pinch = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(@NonNull ScaleGestureDetector d) {
                ZoomState z = zoomState();
                if (z != null) setZoom(z.getZoomRatio() * d.getScaleFactor());
                return true;
            }
        });
        GestureDetector tap = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapUp(@NonNull MotionEvent e) {
                focusAt(e.getX(), e.getY());
                return true;
            }
        });
        previewView.setOnTouchListener((v, e) -> {
            pinch.onTouchEvent(e);
            if (!pinch.isInProgress()) tap.onTouchEvent(e);
            return true;
        });

        applyShutterPos();
        setContentView(root);
    }

    private TextView pill(String text, int sp) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_DIP, sp);
        t.setGravity(Gravity.CENTER);
        t.setMinHeight(dp(44));
        t.setPadding(dp(16), dp(8), dp(16), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(22));
        bg.setColor(Color.argb(150, 0, 0, 0));
        t.setBackground(bg);
        return t;
    }

    private TextView bigButton(String text, int color, int sp) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(Color.WHITE);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextSize(TypedValue.COMPLEX_UNIT_DIP, sp);
        t.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(18));
        bg.setColor(color);
        t.setBackground(bg);
        return t;
    }

    /** 촬영 버튼 자리에 맞춰 촬영·확인·다시 찍기 버튼을 놓는다. */
    private void applyShutterPos() {
        posButton.setText("촬영 버튼: " + POS_LABEL[shutterPos]);
        int side = shutterPos == 0 ? Gravity.LEFT : shutterPos == 2 ? Gravity.RIGHT : Gravity.CENTER_HORIZONTAL;
        place(shutter, side, dp(36));
        // 확인은 엄지가 있는 쪽(가운데면 오른쪽), 다시 찍기는 반대쪽
        boolean confirmLeft = shutterPos == 0;
        place(confirmButton, confirmLeft ? Gravity.LEFT : Gravity.RIGHT, dp(20));
        place(retakeButton, confirmLeft ? Gravity.RIGHT : Gravity.LEFT, dp(20));
    }

    private void place(View v, int horizontalGravity, int sideMargin) {
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) v.getLayoutParams();
        lp.gravity = horizontalGravity | Gravity.CENTER_VERTICAL;
        lp.leftMargin = sideMargin;
        lp.rightMargin = sideMargin;
        v.setLayoutParams(lp);
    }

    // ───────── 카메라 ─────────

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                imageCapture = new ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                    .build();
                provider.unbindAll();
                camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture);
                if (camera.getCameraInfo().hasFlashUnit()) torchButton.setVisibility(View.VISIBLE);
                camera.getCameraInfo().getZoomState().observe(this, this::onZoomState);
            } catch (Exception e) {
                fail("카메라를 열지 못했습니다: " + e.getMessage());
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private ZoomState zoomState() {
        return camera == null ? null : camera.getCameraInfo().getZoomState().getValue();
    }

    private void setZoom(float ratio) {
        ZoomState z = zoomState();
        if (z == null) return;
        float r = Math.max(z.getMinZoomRatio(), Math.min(z.getMaxZoomRatio(), ratio));
        camera.getCameraControl().setZoomRatio(r);
    }

    private void onZoomState(ZoomState z) {
        if (z == null) return;
        if (!zoomChipsBuilt) {
            zoomChipsBuilt = true;
            float min = z.getMinZoomRatio();
            float max = z.getMaxZoomRatio();
            if (min < 0.95f) addZoomChip(min); // 광각(기기가 될 때만)
            for (float s : ZOOM_STEPS) {
                if (s >= min - 0.01f && s <= max + 0.01f) addZoomChip(s);
            }
        }
        float cur = z.getZoomRatio();
        zoomLabel.setText(ratioText(cur));
        for (int i = 0; i < zoomChips.size(); i++) {
            boolean on = Math.abs(zoomChipValues.get(i) - cur) < 0.05f;
            GradientDrawable bg = new GradientDrawable();
            bg.setShape(GradientDrawable.OVAL);
            bg.setColor(on ? Color.rgb(250, 204, 21) : Color.argb(150, 0, 0, 0));
            zoomChips.get(i).setBackground(bg);
            zoomChips.get(i).setTextColor(on ? Color.BLACK : Color.WHITE);
        }
    }

    private void addZoomChip(float value) {
        TextView chip = new TextView(this);
        chip.setText(ratioText(value));
        chip.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15);
        chip.setTypeface(Typeface.DEFAULT_BOLD);
        chip.setGravity(Gravity.CENTER);
        chip.setOnClickListener(v -> setZoom(value));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(54), dp(54));
        lp.leftMargin = dp(6);
        lp.rightMargin = dp(6);
        zoomRow.addView(chip, lp);
        zoomChips.add(chip);
        zoomChipValues.add(value);
    }

    private static String ratioText(float r) {
        float rounded = Math.round(r * 10f) / 10f;
        if (Math.abs(rounded - Math.round(rounded)) < 0.05f) return Math.round(rounded) + "x";
        return String.format(Locale.US, "%.1fx", rounded);
    }

    private void focusAt(float x, float y) {
        if (camera == null) return;
        try {
            MeteringPoint p = previewView.getMeteringPointFactory().createPoint(x, y);
            camera.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(p).build());
        } catch (Exception ignored) { /* 초점을 못 맞추는 기기는 그대로 둔다 */ }
    }

    private void toggleTorch() {
        if (camera == null) return;
        torchOn = !torchOn;
        camera.getCameraControl().enableTorch(torchOn);
        torchButton.setText(torchOn ? "플래시 켬" : "플래시 끔");
    }

    // ───────── 촬영 → 확인 ─────────

    private void shoot() {
        if (imageCapture == null || busy || reviewBar.getVisibility() == View.VISIBLE) return;
        busy = true;
        shutter.setAlpha(0.4f);
        imageCapture.takePicture(io, new ImageCapture.OnImageCapturedCallback() {
            @Override
            public void onCaptureSuccess(@NonNull ImageProxy image) {
                try {
                    int rotation = image.getImageInfo().getRotationDegrees();
                    ByteBuffer buf = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buf.remaining()];
                    buf.get(bytes);
                    image.close();
                    Bitmap bmp = decode(bytes, rotation);
                    File f = save(bmp);
                    runOnUiThread(() -> showReview(bmp, f));
                } catch (Throwable e) {
                    try { image.close(); } catch (Exception ignored) { }
                    runOnUiThread(() -> shotFailed(e.getMessage()));
                }
            }

            @Override
            public void onError(@NonNull ImageCaptureException e) {
                runOnUiThread(() -> shotFailed(e.getMessage()));
            }
        });
    }

    /** 긴 변을 longEdge 로 줄이고 바로 세운다. */
    private Bitmap decode(byte[] bytes, int rotation) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        int srcLong = Math.max(bounds.outWidth, bounds.outHeight);
        int sample = 1;
        while (srcLong / (sample * 2) >= longEdge) sample *= 2;
        BitmapFactory.Options opt = new BitmapFactory.Options();
        opt.inSampleSize = sample;
        Bitmap raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opt);
        if (raw == null) throw new IllegalStateException("사진을 읽지 못했습니다");
        Matrix m = new Matrix();
        float scale = longEdge / (float) Math.max(raw.getWidth(), raw.getHeight());
        if (scale < 1f) m.postScale(scale, scale);
        if (rotation != 0) m.postRotate(rotation);
        if (m.isIdentity()) return raw;
        Bitmap out = Bitmap.createBitmap(raw, 0, 0, raw.getWidth(), raw.getHeight(), m, true);
        if (out != raw) raw.recycle();
        return out;
    }

    private File save(Bitmap bmp) throws Exception {
        File dir = new File(getCacheDir(), "bsa-camera");
        if (!dir.exists()) dir.mkdirs();
        File f = new File(dir, "CAM_" + System.currentTimeMillis() + ".jpg");
        try (FileOutputStream os = new FileOutputStream(f)) {
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, os);
        }
        return f;
    }

    private void shotFailed(String message) {
        busy = false;
        shutter.setAlpha(1f);
        Toast.makeText(this, "촬영하지 못했습니다" + (message == null ? "" : ": " + message), Toast.LENGTH_SHORT).show();
    }

    private void showReview(Bitmap bmp, File f) {
        busy = false;
        shutter.setAlpha(1f);
        if (isFinishing() || isDestroyed()) { f.delete(); return; }
        shotBitmap = bmp;
        shotFile = f;
        reviewImage.setImageBitmap(bmp);
        setReviewMode(true);
    }

    private void setReviewMode(boolean review) {
        reviewImage.setVisibility(review ? View.VISIBLE : View.GONE);
        reviewBar.setVisibility(review ? View.VISIBLE : View.GONE);
        captureBar.setVisibility(review ? View.GONE : View.VISIBLE);
        zoomRow.setVisibility(review ? View.GONE : View.VISIBLE);
        zoomLabel.setVisibility(review ? View.GONE : View.VISIBLE);
        posButton.setVisibility(review ? View.GONE : View.VISIBLE);
        torchButton.setVisibility(!review && camera != null && camera.getCameraInfo().hasFlashUnit() ? View.VISIBLE : View.GONE);
    }

    private void retake() {
        reviewImage.setImageDrawable(null);
        if (shotBitmap != null) { shotBitmap.recycle(); shotBitmap = null; }
        if (shotFile != null) { shotFile.delete(); shotFile = null; }
        setReviewMode(false);
    }

    private void confirm() {
        if (shotFile == null || !shotFile.exists()) { retake(); return; }
        Intent data = new Intent();
        data.putExtra(EXTRA_PATH, shotFile.getAbsolutePath());
        shotFile = null; // 넘긴 파일은 지우지 않는다
        setResult(RESULT_OK, data);
        finish();
    }

    private void cancel() {
        setResult(RESULT_CANCELED);
        finish();
    }

    private void fail(String message) {
        Intent data = new Intent();
        data.putExtra(EXTRA_ERROR, message);
        setResult(RESULT_CANCELED, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        if (reviewBar.getVisibility() == View.VISIBLE) { retake(); return; }
        setResult(RESULT_CANCELED);
        super.onBackPressed();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (event.getRepeatCount() == 0) shoot();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) return true;
        return super.onKeyUp(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (shotFile != null) shotFile.delete(); // 확인하지 않고 닫힌 사진
        if (io != null) io.shutdown();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
