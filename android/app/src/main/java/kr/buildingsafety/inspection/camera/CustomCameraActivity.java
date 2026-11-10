package kr.buildingsafety.inspection.camera;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.camera2.CameraCharacteristics;
import android.os.Bundle;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
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
 * - 줌: 줌 막대를 끌면 부드럽게(초광각 ~ 15배), 배율 버튼, 두 손가락 벌리기. 화면을 누르면 그 자리에 초점.
 *   기기 줌 한계를 넘는 배율은 가운데를 잘라 맞춘다(보이는 대로 찍힘). 초광각은 기기가 1배 미만 줌을 주면 그대로,
 *   아니면 따로 달린 초광각 렌즈로 바꿔 건다. 플래시(손전등)는 지금 렌즈에 불이 있으면 초광각에서도 켠다.
 * - 가로로만 찍는다(왼쪽으로 눕힘 / 오른쪽으로 눕힘 두 방향). 줌 버튼·줌 막대는 오른쪽 아래(오른손 엄지 자리).
 * - 촬영 버튼은 끌어서 아무 데나 옮기고 위 「셔터 고정」을 누르면 그 자리에 고정(기기에 기억). 「셔터 옮기기」로 다시 푼다.
 * - 찍은 뒤 「확인」은 촬영 버튼이 있는 쪽에 크게, 「다시 찍기」는 반대쪽.
 * - 음량 버튼으로도 찍는다.
 * 결과: 긴 변을 줄이고 바로 세운 JPEG 를 앱 캐시에 두고 그 경로(EXTRA_PATH)를 돌려준다.
 */
public class CustomCameraActivity extends AppCompatActivity {
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_ERROR = "error";
    public static final String EXTRA_LONG_EDGE = "longEdge";
    public static final String EXTRA_QUALITY = "quality";

    private static final String PREFS = "bsa_camera";
    private static final String KEY_SHUTTER_X = "shutterFx"; // 촬영 버튼 자리(화면 너비·높이에 대한 비율)
    private static final String KEY_SHUTTER_Y = "shutterFy";
    private static final String KEY_SHUTTER_LOCKED = "shutterLocked";
    private static final float MAX_ZOOM = 15f;
    private static final float[] ZOOM_STEPS = { 1f, 2f, 5f, 10f, 15f };

    private PreviewView previewView;
    private ImageView reviewImage;
    private LinearLayout zoomRow;
    private TextView zoomLabel;
    private TextView posButton;
    private TextView torchButton;
    private FrameLayout rootView;
    private GradientDrawable shutterRing;
    private FrameLayout reviewBar;
    private View shutter;
    private TextView closeButton;
    private TextView confirmButton;
    private TextView retakeButton;

    private final List<TextView> zoomChips = new ArrayList<>();
    private final List<Float> zoomChipValues = new ArrayList<>();
    private ZoomSlider zoomSlider;
    private float zoom = 1f;          // 화면에 보이는 배율(초광각 < 1 ≤ 망원)
    private float extraCrop = 1f;     // 기기 줌 한계를 넘는 만큼 가운데를 자르는 배율
    private volatile float extraCropAtShot = 1f;
    private float camMin = 1f;        // 지금 걸린 렌즈의 기기 줌 범위
    private float camMax = 1f;
    private float mainMin = 1f;       // 기본 렌즈의 최소 줌(1 미만이면 초광각까지 한 렌즈로 됨)
    private boolean mainRangeKnown;
    private CameraSelector uwSelector; // 따로 달린 초광각 렌즈(없으면 null)
    private float uwRatio = 0.5f;     // 그 렌즈의 배율(기본 렌즈 = 1)
    private boolean usingUw;
    private Preview preview;

    private ExecutorService io;
    private ProcessCameraProvider provider;
    private Camera camera;
    private ImageCapture imageCapture;
    private boolean busy;
    private boolean torchOn;
    private float shutterFx = 0.97f;
    private float shutterFy = 0.3f;
    private boolean shutterLocked;
    private boolean shutterDragging;
    private float downRawX, downRawY, downViewX, downViewY;
    private Boolean confirmOnLeft;
    private int longEdge = 2000;
    private int quality = 90;
    private File shotFile;
    private Bitmap shotBitmap;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        longEdge = Math.max(640, Math.min(6000, getIntent().getIntExtra(EXTRA_LONG_EDGE, 2000)));
        quality = Math.max(50, Math.min(100, getIntent().getIntExtra(EXTRA_QUALITY, 90)));
        shutterFx = Math.max(0f, Math.min(1f, prefs().getFloat(KEY_SHUTTER_X, 0.97f)));
        shutterFy = Math.max(0f, Math.min(1f, prefs().getFloat(KEY_SHUTTER_Y, 0.3f)));
        shutterLocked = prefs().getBoolean(KEY_SHUTTER_LOCKED, false);
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
        rootView = root;
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
            shutterLocked = !shutterLocked;
            prefs().edit().putBoolean(KEY_SHUTTER_LOCKED, shutterLocked).apply();
            applyShutterLock();
        });
        top.addView(posButton);
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // 아래 오른쪽: 배율 글자 · 배율 버튼 · 줌 막대(맨 아래) — 가로로 든 오른손 엄지가 닿는 자리
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
        zoomRow.setPadding(0, dp(4), 0, dp(4));
        bottom.addView(zoomRow, new LinearLayout.LayoutParams(-1, -2));

        zoomSlider = new ZoomSlider();
        bottom.addView(zoomSlider, new LinearLayout.LayoutParams(-1, dp(58)));
        root.addView(bottom, new FrameLayout.LayoutParams(dp(390), -2, Gravity.BOTTOM | Gravity.RIGHT));

        // 찍은 뒤: 확인 · 다시 찍기
        reviewBar = new FrameLayout(this);
        reviewBar.setVisibility(View.GONE);
        confirmButton = bigButton("확인", Color.rgb(22, 163, 74), 22);
        confirmButton.setOnClickListener(v -> confirm());
        reviewBar.addView(confirmButton, new FrameLayout.LayoutParams(dp(170), dp(76)));
        retakeButton = bigButton("다시 찍기", Color.argb(200, 60, 60, 60), 17);
        retakeButton.setOnClickListener(v -> retake());
        reviewBar.addView(retakeButton, new FrameLayout.LayoutParams(dp(130), dp(64)));
        root.addView(reviewBar, new FrameLayout.LayoutParams(-1, dp(100), Gravity.BOTTOM));

        // 촬영 버튼: 화면 어디든 끌어 놓을 수 있다(고정하면 안 움직임)
        shutter = new View(this);
        shutterRing = new GradientDrawable();
        shutterRing.setShape(GradientDrawable.OVAL);
        shutterRing.setColor(Color.WHITE);
        shutter.setBackground(shutterRing);
        shutter.setContentDescription("촬영");
        shutter.setOnTouchListener(this::onShutterTouch);
        root.addView(shutter, new FrameLayout.LayoutParams(dp(84), dp(84)));
        root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> placeShutter());

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
                setZoom(zoom * d.getScaleFactor());
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

        applyShutterLock();
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

    private void applyShutterLock() {
        posButton.setText(shutterLocked ? "셔터 옮기기" : "셔터 고정");
        // 옮길 수 있을 때는 노란 테두리
        shutterRing.setStroke(dp(5), shutterLocked ? Color.argb(170, 0, 0, 0) : Color.rgb(250, 204, 21));
    }

    private int shutterRangeX() {
        return rootView.getWidth() - rootView.getPaddingLeft() - rootView.getPaddingRight() - dp(84);
    }

    private int shutterRangeY() {
        return rootView.getHeight() - rootView.getPaddingTop() - rootView.getPaddingBottom() - dp(84);
    }

    /** 기억한 자리에 촬영 버튼을 놓고, 확인 버튼을 촬영 버튼이 있는 쪽에 둔다. */
    private void placeShutter() {
        int w = shutterRangeX();
        int h = shutterRangeY();
        if (w <= 0 || h <= 0) return;
        if (!shutterDragging) {
            shutter.setX(rootView.getPaddingLeft() + shutterFx * w);
            shutter.setY(rootView.getPaddingTop() + shutterFy * h);
        }
        boolean left = shutterFx < 0.5f;
        if (confirmOnLeft == null || confirmOnLeft != left) {
            confirmOnLeft = left;
            place(confirmButton, left ? Gravity.LEFT : Gravity.RIGHT, dp(20));
            place(retakeButton, left ? Gravity.RIGHT : Gravity.LEFT, dp(20));
        }
    }

    /** 누르면 촬영. 고정하지 않았으면 끌어서 옮긴다. */
    private boolean onShutterTouch(View v, MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = e.getRawX();
                downRawY = e.getRawY();
                downViewX = v.getX();
                downViewY = v.getY();
                shutterDragging = false;
                return true;
            case MotionEvent.ACTION_MOVE: {
                if (shutterLocked) return true;
                float dx = e.getRawX() - downRawX;
                float dy = e.getRawY() - downRawY;
                if (!shutterDragging && Math.hypot(dx, dy) > ViewConfiguration.get(this).getScaledTouchSlop()) shutterDragging = true;
                int w = shutterRangeX();
                int h = shutterRangeY();
                if (shutterDragging && w > 0 && h > 0) {
                    float x = Math.max(rootView.getPaddingLeft(), Math.min(rootView.getPaddingLeft() + w, downViewX + dx));
                    float y = Math.max(rootView.getPaddingTop(), Math.min(rootView.getPaddingTop() + h, downViewY + dy));
                    v.setX(x);
                    v.setY(y);
                    shutterFx = (x - rootView.getPaddingLeft()) / w;
                    shutterFy = (y - rootView.getPaddingTop()) / h;
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
                if (shutterDragging) {
                    shutterDragging = false;
                    prefs().edit().putFloat(KEY_SHUTTER_X, shutterFx).putFloat(KEY_SHUTTER_Y, shutterFy).apply();
                    placeShutter();
                } else {
                    shoot();
                }
                return true;
            case MotionEvent.ACTION_CANCEL:
                shutterDragging = false;
                placeShutter();
                return true;
            default:
                return true;
        }
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
                preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                imageCapture = new ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build();
                bind();
            } catch (Exception e) {
                fail("카메라를 열지 못했습니다: " + e.getMessage());
            }
        }, ContextCompat.getMainExecutor(this));
    }

    /** 지금 배율에 맞는 렌즈(기본 / 따로 달린 초광각)를 건다. */
    private void bind() {
        try {
            provider.unbindAll();
            CameraSelector selector = usingUw && uwSelector != null ? uwSelector : CameraSelector.DEFAULT_BACK_CAMERA;
            camera = provider.bindToLifecycle(this, selector, preview, imageCapture);
        } catch (Exception e) {
            if (usingUw) { // 초광각 렌즈를 못 걸면 기본 렌즈만 쓴다
                usingUw = false;
                uwSelector = null;
                zoom = Math.max(1f, zoom);
                bind();
                rebuildZoomUi();
                return;
            }
            fail("카메라를 열지 못했습니다: " + e.getMessage());
            return;
        }
        final CameraInfo info = camera.getCameraInfo();
        boolean flash = info.hasFlashUnit();
        if (!flash) torchOn = false;
        if (torchOn) camera.getCameraControl().enableTorch(true);
        torchButton.setText(torchOn ? "플래시 켬" : "플래시 끔");
        torchButton.setVisibility(flash && reviewBar.getVisibility() != View.VISIBLE ? View.VISIBLE : View.GONE);
        readRange(info, info.getZoomState().getValue());
        info.getZoomState().observe(this, z -> {
            if (camera == null || camera.getCameraInfo() != info) return;
            readRange(info, z);
        });
        applyZoom();
    }

    /** 걸린 렌즈의 줌 범위를 읽는다. 처음 기본 렌즈 범위를 알게 되면 초광각 렌즈를 찾고 줌 버튼을 만든다. */
    private void readRange(CameraInfo info, ZoomState z) {
        if (z == null) return;
        boolean changed = Math.abs(camMin - z.getMinZoomRatio()) > 0.001f || Math.abs(camMax - z.getMaxZoomRatio()) > 0.001f;
        camMin = z.getMinZoomRatio();
        camMax = z.getMaxZoomRatio();
        if (!usingUw && !mainRangeKnown) {
            mainRangeKnown = true;
            mainMin = camMin;
            if (mainMin >= 0.95f) findUltraWide(info);
            rebuildZoomUi();
            applyZoom();
        } else if (changed) {
            applyZoom();
        }
    }

    /** 기본 렌즈가 1배 미만 줌을 못 주는 기기: 뒤쪽 렌즈 중 화각이 더 넓은 것을 초광각으로 쓴다. */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void findUltraWide(CameraInfo mainInfo) {
        try {
            Camera2CameraInfo main = Camera2CameraInfo.from(mainInfo);
            float mainView = viewFactor(main);
            if (mainView <= 0f) return;
            float best = 0.9f;
            for (CameraInfo ci : provider.getAvailableCameraInfos()) {
                Camera2CameraInfo c = Camera2CameraInfo.from(ci);
                if (c.getCameraId().equals(main.getCameraId())) continue;
                Integer facing = c.getCameraCharacteristic(CameraCharacteristics.LENS_FACING);
                if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) continue;
                float v = viewFactor(c);
                if (v <= 0f) continue;
                float ratio = v / mainView;
                if (ratio < best) {
                    best = ratio;
                    uwSelector = ci.getCameraSelector();
                    uwRatio = Math.max(0.4f, ratio);
                }
            }
        } catch (Throwable ignored) { /* 못 찾으면 기본 렌즈만 */ }
    }

    /** 초점거리 ÷ 센서 너비 — 작을수록 넓게 찍힌다. */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private static float viewFactor(Camera2CameraInfo c) {
        float[] f = c.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
        SizeF size = c.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
        if (f == null || f.length == 0 || size == null || size.getWidth() <= 0f) return 0f;
        return f[0] / size.getWidth();
    }

    private float minZoom() {
        if (mainMin < 0.95f) return mainMin;
        return uwSelector != null ? uwRatio : 1f;
    }

    private void setZoom(float ratio) {
        if (camera == null) return;
        zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, ratio));
        applyZoom();
    }

    /** zoom 값을 렌즈 선택 + 기기 줌 + 가운데 자르기로 나눠 건다. */
    private void applyZoom() {
        if (camera == null) return;
        zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, zoom));
        boolean wantUw = uwSelector != null && zoom < 0.999f;
        if (wantUw != usingUw) {
            usingUw = wantUw;
            bind(); // 렌즈를 바꿔 건 뒤 다시 applyZoom
            return;
        }
        float want = usingUw ? zoom / uwRatio : zoom;
        float cam = Math.max(camMin, Math.min(camMax, want));
        extraCrop = Math.max(1f, want / cam);
        camera.getCameraControl().setZoomRatio(cam);
        previewView.setScaleX(extraCrop);
        previewView.setScaleY(extraCrop);
        zoomLabel.setText(ratioText(zoom));
        zoomSlider.invalidate();
        for (int i = 0; i < zoomChips.size(); i++) {
            boolean on = Math.abs(zoomChipValues.get(i) - zoom) < 0.05f;
            GradientDrawable bg = new GradientDrawable();
            bg.setShape(GradientDrawable.OVAL);
            bg.setColor(on ? Color.rgb(250, 204, 21) : Color.argb(150, 0, 0, 0));
            zoomChips.get(i).setBackground(bg);
            zoomChips.get(i).setTextColor(on ? Color.BLACK : Color.WHITE);
        }
    }

    private void rebuildZoomUi() {
        zoomRow.removeAllViews();
        zoomChips.clear();
        zoomChipValues.clear();
        float min = minZoom();
        if (min < 0.95f) addZoomChip(min); // 초광각(기기가 될 때만)
        for (float s : ZOOM_STEPS) addZoomChip(s);
        zoomSlider.invalidate();
    }

    private void addZoomChip(float value) {
        TextView chip = new TextView(this);
        chip.setText(ratioText(value));
        chip.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15);
        chip.setTypeface(Typeface.DEFAULT_BOLD);
        chip.setGravity(Gravity.CENTER);
        chip.setOnClickListener(v -> setZoom(value));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(50), dp(50));
        lp.leftMargin = dp(5);
        lp.rightMargin = dp(5);
        zoomRow.addView(chip, lp);
        zoomChips.add(chip);
        zoomChipValues.add(value);
    }

    /** 줌 막대: 좌우로 끌면 배율이 부드럽게 바뀐다(왼쪽 끝 = 가장 넓게, 오른쪽 끝 = 15배, 배수 간격이 고르게). */
    private class ZoomSlider extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float[] marks = { 1f, 2f, 5f, 10f, 15f };

        ZoomSlider() {
            super(CustomCameraActivity.this);
            setContentDescription("줌 막대");
        }

        private float pad() { return dp(28); }

        private float xOf(float ratio) {
            float min = minZoom();
            float t = (float) (Math.log(ratio / min) / Math.log(MAX_ZOOM / min));
            return pad() + Math.max(0f, Math.min(1f, t)) * (getWidth() - 2 * pad());
        }

        @Override
        protected void onDraw(@NonNull Canvas c) {
            float cy = dp(18);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeWidth(dp(8));
            paint.setColor(Color.argb(120, 0, 0, 0));
            c.drawLine(pad(), cy, getWidth() - pad(), cy, paint);
            paint.setStrokeWidth(dp(4));
            paint.setColor(Color.argb(230, 255, 255, 255));
            c.drawLine(pad(), cy, getWidth() - pad(), cy, paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(dp(11));
            paint.setShadowLayer(4f, 0f, 0f, Color.BLACK);
            float min = minZoom();
            if (min < 0.95f) drawMark(c, min, cy);
            for (float m : marks) drawMark(c, m, cy);
            paint.clearShadowLayer();
            float x = xOf(zoom);
            paint.setColor(Color.argb(140, 0, 0, 0));
            c.drawCircle(x, cy, dp(14), paint);
            paint.setColor(Color.rgb(250, 204, 21));
            c.drawCircle(x, cy, dp(11), paint);
        }

        private void drawMark(Canvas c, float ratio, float cy) {
            float x = xOf(ratio);
            paint.setColor(Color.WHITE);
            c.drawCircle(x, cy, dp(3), paint);
            c.drawText(ratioText(ratio), x, cy + dp(28), paint);
        }

        @SuppressLint("ClickableViewAccessibility")
        @Override
        public boolean onTouchEvent(MotionEvent e) {
            int a = e.getActionMasked();
            if (a == MotionEvent.ACTION_DOWN || a == MotionEvent.ACTION_MOVE) {
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                float w = getWidth() - 2 * pad();
                if (w <= 0) return true;
                float t = Math.max(0f, Math.min(1f, (e.getX() - pad()) / w));
                float min = minZoom();
                setZoom((float) (min * Math.pow(MAX_ZOOM / min, t)));
            }
            return true;
        }
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
        extraCropAtShot = extraCrop;
        // 가로 두 방향(180도 뒤집힘)은 화면이 다시 만들어지지 않으므로 찍을 때마다 방향을 맞춘다
        imageCapture.setTargetRotation(getWindowManager().getDefaultDisplay().getRotation());
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
        float crop = Math.max(1f, extraCropAtShot);
        int srcLong = Math.round(Math.max(bounds.outWidth, bounds.outHeight) / crop);
        int sample = 1;
        while (srcLong / (sample * 2) >= longEdge) sample *= 2;
        BitmapFactory.Options opt = new BitmapFactory.Options();
        opt.inSampleSize = sample;
        Bitmap raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opt);
        if (raw == null) throw new IllegalStateException("사진을 읽지 못했습니다");
        // 기기 줌 한계를 넘은 배율만큼 가운데를 자른다(미리보기와 같은 범위)
        int cw = Math.max(1, Math.round(raw.getWidth() / crop));
        int ch = Math.max(1, Math.round(raw.getHeight() / crop));
        int cx = (raw.getWidth() - cw) / 2;
        int cy = (raw.getHeight() - ch) / 2;
        Matrix m = new Matrix();
        float scale = longEdge / (float) Math.max(cw, ch);
        if (scale < 1f) m.postScale(scale, scale);
        if (rotation != 0) m.postRotate(rotation);
        if (m.isIdentity() && crop <= 1f) return raw;
        Bitmap out = Bitmap.createBitmap(raw, cx, cy, cw, ch, m, true);
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
        shutter.setVisibility(review ? View.GONE : View.VISIBLE);
        zoomRow.setVisibility(review ? View.GONE : View.VISIBLE);
        zoomLabel.setVisibility(review ? View.GONE : View.VISIBLE);
        zoomSlider.setVisibility(review ? View.GONE : View.VISIBLE);
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
