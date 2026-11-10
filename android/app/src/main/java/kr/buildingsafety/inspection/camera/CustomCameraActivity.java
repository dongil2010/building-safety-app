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
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.MeteringRectangle;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.OrientationEventListener;
import android.view.ScaleGestureDetector;
import android.view.Surface;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.camera2.interop.Camera2CameraControl;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.camera2.interop.CaptureRequestOptions;
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
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 2026-11-10 앱 전용 촬영 화면(CameraX). 순정 카메라 대신 쓴다.
 * - 폰을 가로로 눕혀 찍는다. 사진은 가로 두 방향(왼쪽으로 눕힘 / 오른쪽으로 눕힘)으로만 저장된다.
 *   화면 배치는 세로 기준으로 고정이라, 조작부(줌 버튼 + 그 아래 줌 막대)는 폰 아래쪽 끝 1/5 안에 모여 있고
 *   가로로 들면 어느 손으로 들든 든 손 엄지 밑에 온다. 글자만 든 방향에 맞춰 돌아간다.
 * - 줌: 줌 막대를 끌면 부드럽게(초광각 ~ 15배), 배율 버튼, 두 손가락 벌리기. 화면을 누르면 그 자리에 초점.
 *   렌즈(초광각·망원·잠망경)는 배율에 맞춰 바꿔 건다 — 따로 열리는 뒤쪽 카메라와, 기본 카메라에 묶인 물리 렌즈를 다 찾는다.
 *   렌즈가 못 내는 배율은 가운데를 잘라 맞춘다(보이는 대로 찍힘). 안 열리는 렌즈는 빼고 기본 렌즈로 찍는다.
 *   세로로 세운 채 찍으려 하면 찍지 않고 「가로로 돌려서 찍으세요」 경고를 띄운다. 바닥·천장을 향해 눕혀 들면
 *   방향을 알 수 없으므로 오른손으로 든 방향(왼쪽으로 눕힘)으로 저장한다.
 * - 초점: 기본은 화면 정중앙(계속 맞춤). 화면을 누르면 그 자리에 고정되고, 다시 찍기·렌즈 바꿈·새로 열 때 중앙으로 돌아온다.
 * - 촬영 버튼 자리는 위 「설정」 창에서 끌어 옮긴다(기기에 기억). 평소에는 안 움직인다.
 * - 찍은 뒤 「확인」은 촬영 버튼이 있는 쪽에 크게, 「다시 찍기」는 반대쪽. 음량 버튼으로도 찍는다.
 * 결과: 긴 변을 줄이고 바로 세운 JPEG 를 앱 캐시에 두고 그 경로(EXTRA_PATH)를 돌려준다.
 */
public class CustomCameraActivity extends AppCompatActivity {
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_ERROR = "error";
    public static final String EXTRA_LONG_EDGE = "longEdge";
    public static final String EXTRA_QUALITY = "quality";

    private static final String PREFS = "bsa_camera";
    private static final String KEY_SHUTTER_X = "shutterFx2"; // 촬영 버튼 자리(화면 너비·높이에 대한 비율)
    private static final String KEY_SHUTTER_Y = "shutterFy2";
    private static final float DEF_FX = 0.5f;
    private static final float DEF_FY = 0.74f;
    private static final float MAX_ZOOM = 15f;
    private static final float[] ZOOM_STEPS = { 1f, 2f, 5f, 10f, 15f };
    private static final int MAX_CHIPS = 7;
    private static final int LENS_SWITCH_DELAY_MS = 160;
    private static final int LENS_WATCHDOG_MS = 3000;
    private static final Object WATCHDOG = new Object();

    /** 배율에 맞춰 바꿔 거는 렌즈 하나. */
    private static class Lens {
        float ratio = 1f;          // 기본 렌즈 = 1
        CameraSelector selector;   // 따로 열리는 카메라(없으면 기본 뒤쪽 카메라)
        String physicalId;         // 기본 카메라에 묶인 물리 렌즈(없으면 null)
        boolean bad;               // 열어 봤더니 안 됨
    }

    private FrameLayout rootView;
    private PreviewView previewView;
    private ImageView reviewImage;
    private View focusRing;
    private GradientDrawable focusRingBg;
    private boolean focusTapped;
    private LinearLayout topBar;
    private LinearLayout zoomArea;
    private LinearLayout zoomRow;
    private TextView zoomLabel;
    private ZoomSlider zoomSlider;
    private TextView closeButton;
    private TextView settingsButton;
    private TextView torchButton;
    private FrameLayout reviewBar;
    private View shutter;
    private GradientDrawable shutterRing;
    private TextView confirmButton;
    private TextView retakeButton;
    private FrameLayout settingsPanel;
    private LinearLayout settingsBox;
    private TextView settingsText;

    private final List<TextView> zoomChips = new ArrayList<>();
    private final List<Float> zoomChipValues = new ArrayList<>();
    private final List<Lens> lenses = new ArrayList<>();
    private final Lens mainLens = new Lens();
    private Lens lens = mainLens;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable switchLensTask = this::switchLensNow;
    private ExecutorService io;
    private ProcessCameraProvider provider;
    private Camera camera;
    private Preview preview;
    private ImageCapture imageCapture;
    private OrientationEventListener orientationListener;

    private float zoom = 1f;          // 화면에 보이는 배율(초광각 < 1 ≤ 망원)
    private float extraCrop = 1f;     // 렌즈가 못 내는 만큼 가운데를 자르는 배율
    private volatile float extraCropAtShot = 1f;
    private float camMin = 1f;        // 지금 걸린 렌즈의 기기 줌 범위
    private float camMax = 1f;
    private float mainMin = 1f;       // 기본 렌즈의 최소 줌(1 미만이면 초광각까지 한 렌즈로 됨)
    private boolean mainRangeKnown;

    private int landRotation = Surface.ROTATION_90; // 왼쪽으로 눕힘(오른손으로 듦)이 기본
    private boolean busy;
    private boolean torchOn;
    private boolean settingsMode;
    private boolean portraitHeld;
    private TextView portraitWarning;
    private float shutterFx = DEF_FX;
    private float shutterFy = DEF_FY;
    private boolean shutterDragging;
    private float downRawX, downRawY, downViewX, downViewY;
    private Boolean confirmOnLeft;
    private int longEdge = 2000;
    private int quality = 90;
    private File shotFile;
    private Bitmap shotBitmap;
    private Bitmap shotDisplay;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        longEdge = Math.max(640, Math.min(6000, getIntent().getIntExtra(EXTRA_LONG_EDGE, 2000)));
        quality = Math.max(50, Math.min(100, getIntent().getIntExtra(EXTRA_QUALITY, 90)));
        shutterFx = Math.max(0f, Math.min(1f, prefs().getFloat(KEY_SHUTTER_X, DEF_FX)));
        shutterFy = Math.max(0f, Math.min(1f, prefs().getFloat(KEY_SHUTTER_Y, DEF_FY)));
        io = Executors.newSingleThreadExecutor();
        lenses.add(mainLens);
        buildUi();
        orientationListener = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int o) {
                int rot;
                boolean portrait = false;
                if (o < 0) {
                    rot = Surface.ROTATION_90;      // 바닥·천장을 향함: 오른손으로 든 방향 기준
                } else if (o >= 45 && o < 135) {
                    rot = Surface.ROTATION_270;     // 오른쪽으로 눕힘(왼손)
                } else if (o >= 225 && o < 315) {
                    rot = Surface.ROTATION_90;      // 왼쪽으로 눕힘(오른손)
                } else {
                    rot = landRotation;             // 세로로 세움: 찍지 않고 경고
                    portrait = true;
                }
                if (portrait != portraitHeld) {
                    portraitHeld = portrait;
                    updatePortraitWarning();
                }
                if (rot != landRotation) {
                    landRotation = rot;
                    applyUiRotation();
                }
            }
        };
        startCamera();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (orientationListener.canDetectOrientation()) orientationListener.enable();
    }

    @Override
    protected void onPause() {
        super.onPause();
        orientationListener.disable();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    /** 글자가 든 방향에서 바로 보이게 돌릴 각도. */
    private float uiAngle() {
        return landRotation == Surface.ROTATION_90 ? 90f : -90f;
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

        // 초점 자리 표시: 기본은 정중앙(흰색), 눌러서 잡으면 그 자리(노란색)
        focusRing = new View(this);
        focusRingBg = new GradientDrawable();
        focusRingBg.setShape(GradientDrawable.OVAL);
        focusRingBg.setColor(Color.TRANSPARENT);
        focusRingBg.setStroke(dp(2), Color.argb(170, 255, 255, 255));
        focusRing.setBackground(focusRingBg);
        root.addView(focusRing, new FrameLayout.LayoutParams(dp(72), dp(72)));

        reviewImage = new ImageView(this);
        reviewImage.setBackgroundColor(Color.BLACK);
        reviewImage.setScaleType(ImageView.ScaleType.FIT_CENTER);
        reviewImage.setVisibility(View.GONE);
        root.addView(reviewImage, new FrameLayout.LayoutParams(-1, -1));

        // 위: 닫기 · 플래시 · 설정
        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(10), dp(8), dp(10), dp(8));
        closeButton = pill("닫기", 15);
        closeButton.setOnClickListener(v -> cancel());
        topBar.addView(closeButton);
        topBar.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        torchButton = pill("플래시 끔", 15);
        torchButton.setVisibility(View.GONE);
        torchButton.setOnClickListener(v -> toggleTorch());
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(-2, -2);
        tlp.rightMargin = dp(8);
        topBar.addView(torchButton, tlp);
        settingsButton = pill("설정", 15);
        settingsButton.setOnClickListener(v -> setSettingsMode(true));
        topBar.addView(settingsButton);
        root.addView(topBar, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // 세로로 세웠을 때 경고(글자는 세로 기준으로 바로 보임). 누르는 것은 막지 않는다.
        portraitWarning = bigButton("폰을 가로로 돌려서 찍으세요", Color.argb(235, 220, 38, 38), 18);
        portraitWarning.setVisibility(View.GONE);
        root.addView(portraitWarning, new FrameLayout.LayoutParams(dp(300), dp(76), Gravity.CENTER));

        // 맨 아래(화면 1/5 안): 배율 글자 · 배율 버튼 · 그 아래 줌 막대
        zoomArea = new LinearLayout(this);
        zoomArea.setOrientation(LinearLayout.VERTICAL);
        zoomArea.setGravity(Gravity.CENTER_HORIZONTAL);

        zoomLabel = new TextView(this);
        zoomLabel.setTextColor(Color.rgb(250, 204, 21));
        zoomLabel.setTypeface(Typeface.DEFAULT_BOLD);
        zoomLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14);
        zoomLabel.setGravity(Gravity.CENTER);
        zoomLabel.setShadowLayer(4f, 0f, 0f, Color.BLACK);
        zoomArea.addView(zoomLabel, new LinearLayout.LayoutParams(-2, -2));

        zoomRow = new LinearLayout(this);
        zoomRow.setOrientation(LinearLayout.HORIZONTAL);
        zoomRow.setGravity(Gravity.CENTER);
        zoomRow.setPadding(0, dp(2), 0, dp(2));
        zoomArea.addView(zoomRow, new LinearLayout.LayoutParams(-1, -2));

        zoomSlider = new ZoomSlider();
        zoomArea.addView(zoomSlider, new LinearLayout.LayoutParams(-1, dp(56)));
        root.addView(zoomArea, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        // 찍은 뒤: 확인 · 다시 찍기
        reviewBar = new FrameLayout(this);
        reviewBar.setVisibility(View.GONE);
        confirmButton = bigButton("확인", Color.rgb(22, 163, 74), 22);
        confirmButton.setOnClickListener(v -> confirm());
        reviewBar.addView(confirmButton, new FrameLayout.LayoutParams(dp(150), dp(76)));
        retakeButton = bigButton("다시 찍기", Color.argb(200, 60, 60, 60), 17);
        retakeButton.setOnClickListener(v -> retake());
        reviewBar.addView(retakeButton, new FrameLayout.LayoutParams(dp(130), dp(64)));
        root.addView(reviewBar, new FrameLayout.LayoutParams(-1, dp(180), Gravity.BOTTOM));

        // 설정 창: 촬영 버튼 자리 옮기기(촬영 버튼보다 아래에 깔린다)
        settingsPanel = new FrameLayout(this);
        settingsPanel.setBackgroundColor(Color.argb(150, 0, 0, 0));
        settingsPanel.setClickable(true);
        settingsPanel.setVisibility(View.GONE);
        settingsBox = new LinearLayout(this);
        settingsBox.setOrientation(LinearLayout.VERTICAL);
        settingsBox.setGravity(Gravity.CENTER_HORIZONTAL);
        settingsText = new TextView(this);
        settingsText.setTextColor(Color.WHITE);
        settingsText.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 16);
        settingsText.setGravity(Gravity.CENTER);
        settingsBox.addView(settingsText, new LinearLayout.LayoutParams(dp(280), -2));
        LinearLayout settingsButtons = new LinearLayout(this);
        settingsButtons.setOrientation(LinearLayout.HORIZONTAL);
        settingsButtons.setGravity(Gravity.CENTER);
        TextView resetButton = bigButton("기본 자리", Color.argb(220, 70, 70, 70), 16);
        resetButton.setOnClickListener(v -> {
            shutterFx = DEF_FX;
            shutterFy = DEF_FY;
            saveShutterPos();
            placeShutter();
        });
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(dp(120), dp(56));
        rlp.rightMargin = dp(12);
        settingsButtons.addView(resetButton, rlp);
        TextView doneButton = bigButton("완료", Color.rgb(22, 163, 74), 18);
        doneButton.setOnClickListener(v -> setSettingsMode(false));
        settingsButtons.addView(doneButton, new LinearLayout.LayoutParams(dp(120), dp(56)));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-2, -2);
        blp.topMargin = dp(18);
        settingsBox.addView(settingsButtons, blp);
        settingsPanel.addView(settingsBox, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        root.addView(settingsPanel, new FrameLayout.LayoutParams(-1, -1));

        // 촬영 버튼(자리는 설정 창에서만 옮긴다)
        shutter = new View(this);
        shutterRing = new GradientDrawable();
        shutterRing.setShape(GradientDrawable.OVAL);
        shutterRing.setColor(Color.WHITE);
        shutterRing.setStroke(dp(5), Color.argb(170, 0, 0, 0));
        shutter.setBackground(shutterRing);
        shutter.setContentDescription("촬영");
        shutter.setOnTouchListener(this::onShutterTouch);
        root.addView(shutter, new FrameLayout.LayoutParams(dp(84), dp(84)));
        root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            placeShutter();
            if (!focusTapped) centerFocusRing();
        });

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

        applyUiRotation();
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

    /** 화면 배치는 그대로 두고 글자만 든 방향(가로 두 방향)에 맞춰 돌린다. */
    private void applyUiRotation() {
        float a = uiAngle();
        closeButton.setRotation(a);
        torchButton.setRotation(a);
        settingsButton.setRotation(a);
        zoomLabel.setRotation(a);
        for (TextView chip : zoomChips) chip.setRotation(a);
        confirmButton.setRotation(a);
        retakeButton.setRotation(a);
        settingsBox.setRotation(a);
        zoomSlider.invalidate();
    }

    private void updatePortraitWarning() {
        boolean show = portraitHeld && !settingsMode && reviewBar.getVisibility() != View.VISIBLE;
        portraitWarning.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    // ───────── 촬영 버튼 자리 ─────────

    private void setSettingsMode(boolean on) {
        settingsMode = on;
        settingsPanel.setVisibility(on ? View.VISIBLE : View.GONE);
        updatePortraitWarning();
        // 옮길 수 있을 때는 노란 테두리
        shutterRing.setStroke(dp(5), on ? Color.rgb(250, 204, 21) : Color.argb(170, 0, 0, 0));
        if (on) {
            StringBuilder sb = new StringBuilder("촬영 버튼을 끌어서\n원하는 자리에 놓으세요");
            sb.append("\n\n찾은 렌즈: ");
            for (int i = 0; i < lenses.size(); i++) {
                Lens l = lenses.get(i);
                if (i > 0) sb.append(" · ");
                sb.append(ratioText(l == mainLens && mainMin < 0.95f ? mainMin : l.ratio));
                if (l == mainLens && mainMin < 0.95f) sb.append("~");
                if (l.bad) sb.append("(안 열림)");
            }
            settingsText.setText(sb.toString());
        }
    }

    private void saveShutterPos() {
        prefs().edit().putFloat(KEY_SHUTTER_X, shutterFx).putFloat(KEY_SHUTTER_Y, shutterFy).apply();
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
            place(confirmButton, left ? Gravity.LEFT : Gravity.RIGHT, dp(16));
            place(retakeButton, left ? Gravity.RIGHT : Gravity.LEFT, dp(16));
        }
    }

    private void place(View v, int horizontalGravity, int sideMargin) {
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) v.getLayoutParams();
        lp.gravity = horizontalGravity | Gravity.CENTER_VERTICAL;
        lp.leftMargin = sideMargin;
        lp.rightMargin = sideMargin;
        v.setLayoutParams(lp);
    }

    /** 평소: 누르면 촬영. 설정 창: 끌어서 옮긴다(찍지 않음). */
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
                if (!settingsMode) return true;
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
                    saveShutterPos();
                    placeShutter();
                } else if (!settingsMode) {
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

    // ───────── 카메라·렌즈 ─────────

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                provider = future.get();
                bind();
            } catch (Exception e) {
                fail("카메라를 열지 못했습니다: " + e.getMessage());
            }
        }, ContextCompat.getMainExecutor(this));
    }

    /** 지금 고른 렌즈(lens)를 건다. 안 걸리면 그 렌즈를 빼고 기본 렌즈로. */
    private void bind() {
        handler.removeCallbacks(switchLensTask);
        handler.removeCallbacksAndMessages(WATCHDOG);
        try {
            provider.unbindAll();
            Preview.Builder pb = new Preview.Builder();
            ImageCapture.Builder ib = new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY);
            if (lens.physicalId != null && Build.VERSION.SDK_INT >= 28) usePhysicalLens(pb, ib, lens.physicalId);
            preview = pb.build();
            preview.setSurfaceProvider(previewView.getSurfaceProvider());
            imageCapture = ib.build();
            CameraSelector selector = lens.selector != null ? lens.selector : CameraSelector.DEFAULT_BACK_CAMERA;
            camera = provider.bindToLifecycle(this, selector, preview, imageCapture);
        } catch (Exception e) {
            if (lens != mainLens) {
                dropLens(lens);
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
        camMin = 1f;
        camMax = 1f;
        readRange(info, info.getZoomState().getValue());
        info.getZoomState().observe(this, z -> {
            if (camera == null || camera.getCameraInfo() != info) return;
            readRange(info, z);
        });
        if (lens != mainLens) {
            // 걸리긴 했는데 화면이 안 나오는 렌즈(제조사가 막아 둔 경우)는 빼고 기본 렌즈로 돌아간다
            final Lens watched = lens;
            handler.postAtTime(() -> {
                if (lens != watched || isFinishing()) return;
                if (previewView.getPreviewStreamState().getValue() != PreviewView.StreamState.STREAMING) dropLens(watched);
            }, WATCHDOG, SystemClock.uptimeMillis() + LENS_WATCHDOG_MS);
        }
        resetFocusToCenter();
        applyZoom();
    }

    private void dropLens(Lens l) {
        l.bad = true;
        Toast.makeText(this, ratioText(l.ratio) + " 렌즈는 이 앱에서 열리지 않아 기본 렌즈로 찍습니다", Toast.LENGTH_SHORT).show();
        lens = targetLens();
        bind();
        rebuildZoomUi();
    }

    @RequiresApi(28)
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private static void usePhysicalLens(Preview.Builder pb, ImageCapture.Builder ib, String physicalId) {
        new Camera2Interop.Extender<>(pb).setPhysicalCameraId(physicalId);
        new Camera2Interop.Extender<>(ib).setPhysicalCameraId(physicalId);
    }

    /** 걸린 렌즈의 줌 범위를 읽는다. 처음 기본 렌즈 범위를 알게 되면 다른 렌즈를 찾고 줌 버튼을 만든다. */
    private void readRange(CameraInfo info, ZoomState z) {
        if (z == null) return;
        boolean changed = Math.abs(camMin - z.getMinZoomRatio()) > 0.001f || Math.abs(camMax - z.getMaxZoomRatio()) > 0.001f;
        camMin = z.getMinZoomRatio();
        camMax = z.getMaxZoomRatio();
        if (lens == mainLens && !mainRangeKnown) {
            mainRangeKnown = true;
            mainMin = camMin;
            findLenses(info);
            rebuildZoomUi();
            applyZoom();
        } else if (changed) {
            applyZoom();
        }
    }

    /** 초광각·망원·잠망경 렌즈 찾기: (가) 따로 열리는 뒤쪽 카메라 (나) 기본 카메라에 묶인 물리 렌즈. */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void findLenses(CameraInfo mainInfo) {
        try {
            CameraManager cm = (CameraManager) getSystemService(CAMERA_SERVICE);
            String mainId = Camera2CameraInfo.from(mainInfo).getCameraId();
            CameraCharacteristics mainCh = cm.getCameraCharacteristics(mainId);
            float mainView = viewFactor(mainCh);
            if (mainView <= 0f) return;
            for (CameraInfo ci : provider.getAvailableCameraInfos()) {
                try {
                    String id = Camera2CameraInfo.from(ci).getCameraId();
                    if (id.equals(mainId)) continue;
                    CameraCharacteristics ch = cm.getCameraCharacteristics(id);
                    Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
                    if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) continue;
                    addLens(viewFactor(ch) / mainView, ci.getCameraSelector(), null);
                } catch (Throwable ignored) { /* 이 카메라는 건너뜀 */ }
            }
            if (Build.VERSION.SDK_INT >= 28) {
                for (String pid : mainCh.getPhysicalCameraIds()) {
                    try {
                        addLens(viewFactor(cm.getCameraCharacteristics(pid)) / mainView, null, pid);
                    } catch (Throwable ignored) { /* 이 렌즈는 건너뜀 */ }
                }
            }
            Collections.sort(lenses, (a, b) -> Float.compare(a.ratio, b.ratio));
        } catch (Throwable ignored) { /* 못 찾으면 기본 렌즈만 */ }
    }

    private void addLens(float rawRatio, CameraSelector selector, String physicalId) {
        if (!(rawRatio > 0.3f) || rawRatio > MAX_ZOOM) return;
        if (rawRatio > 0.85f && rawRatio < 1.3f) return;     // 기본 렌즈와 같은 화각
        if (rawRatio < 1f && mainMin < 0.95f) return;        // 초광각은 기본 카메라 줌으로 이미 됨
        float ratio = snapRatio(rawRatio);
        for (Lens l : lenses) {
            if (Math.abs(l.ratio - ratio) / l.ratio < 0.12f) return; // 같은 렌즈를 두 경로로 찾음
        }
        Lens l = new Lens();
        l.ratio = ratio;
        l.selector = selector;
        l.physicalId = physicalId;
        lenses.add(l);
    }

    /** 2.9 → 3, 9.6 → 10, 0.58 → 0.6 처럼 표기 배율로 맞춘다. */
    private static float snapRatio(float r) {
        if (r >= 1.5f && Math.abs(r - Math.round(r)) / r < 0.12f) return Math.round(r);
        return Math.max(0.4f, Math.round(r * 10f) / 10f);
    }

    /** 초점거리 ÷ 센서 너비 — 작을수록 넓게 찍힌다. */
    private static float viewFactor(CameraCharacteristics ch) {
        float[] f = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
        SizeF size = ch.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
        if (f == null || f.length == 0 || size == null || size.getWidth() <= 0f) return 0f;
        return f[0] / size.getWidth();
    }

    private float minZoom() {
        if (mainMin < 0.95f) return mainMin;
        float min = 1f;
        for (Lens l : lenses) if (!l.bad && l.ratio < min) min = l.ratio;
        return min;
    }

    /** 지금 배율에 쓸 렌즈: 배율 이하에서 가장 망원인 렌즈. */
    private Lens targetLens() {
        Lens pick = null;
        for (Lens l : lenses) {
            if (l.bad) continue;
            if (l.ratio <= zoom + 0.001f && (pick == null || l.ratio > pick.ratio)) pick = l;
        }
        return pick != null ? pick : mainLens;
    }

    private void switchLensNow() {
        if (provider == null || isFinishing()) return;
        Lens t = targetLens();
        if (t == lens) return;
        lens = t;
        bind();
    }

    private void setZoom(float ratio) {
        if (camera == null) return;
        zoom = ratio;
        applyZoom();
    }

    /** zoom 값을 렌즈 선택 + 기기 줌 + 가운데 자르기로 나눠 건다. */
    private void applyZoom() {
        if (camera == null) return;
        zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, zoom));
        // 렌즈 바꾸기는 잠깐 미뤄서, 줌 막대를 끄는 동안 경계를 지날 때마다 멈칫하지 않게 한다
        handler.removeCallbacks(switchLensTask);
        if (targetLens() != lens) handler.postDelayed(switchLensTask, LENS_SWITCH_DELAY_MS);
        float want = zoom / lens.ratio;
        // 물리 렌즈는 기기 줌을 건드리지 않고(1배) 나머지는 잘라서 맞춘다
        float cam = lens.physicalId != null
            ? Math.max(camMin, Math.min(camMax, 1f))
            : Math.max(camMin, Math.min(camMax, want));
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

    /** 배율 버튼: 가장 넓은 배율 + 렌즈 배율 + 1·2·5·10·15 (많으면 2, 5 순으로 뺀다). */
    private void rebuildZoomUi() {
        List<Float> values = new ArrayList<>();
        float min = minZoom();
        if (min < 0.95f) values.add(min);
        for (Lens l : lenses) if (!l.bad && l.ratio >= 1f) addValue(values, l.ratio);
        for (float s : ZOOM_STEPS) addValue(values, s);
        Collections.sort(values);
        float[] drop = { 2f, 5f };
        for (float d : drop) {
            if (values.size() <= MAX_CHIPS) break;
            boolean isLens = false;
            for (Lens l : lenses) if (!l.bad && Math.abs(l.ratio - d) < 0.05f) isLens = true;
            if (!isLens) values.remove(Float.valueOf(d));
        }
        zoomRow.removeAllViews();
        zoomChips.clear();
        zoomChipValues.clear();
        for (float v : values) addZoomChip(v);
        applyUiRotation();
    }

    private static void addValue(List<Float> values, float v) {
        for (float x : values) if (Math.abs(x - v) < 0.05f) return;
        values.add(v);
    }

    private void addZoomChip(float value) {
        TextView chip = new TextView(this);
        chip.setText(ratioText(value));
        chip.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14);
        chip.setTypeface(Typeface.DEFAULT_BOLD);
        chip.setGravity(Gravity.CENTER);
        chip.setOnClickListener(v -> setZoom(value));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(44), dp(44));
        lp.leftMargin = dp(3);
        lp.rightMargin = dp(3);
        zoomRow.addView(chip, lp);
        zoomChips.add(chip);
        zoomChipValues.add(value);
    }

    /** 줌 막대: 끌면 배율이 부드럽게 바뀐다(한쪽 끝 = 가장 넓게, 반대쪽 끝 = 15배, 배수 간격이 고르게). */
    private class ZoomSlider extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        ZoomSlider() {
            super(CustomCameraActivity.this);
            setContentDescription("줌 막대");
        }

        private float pad() { return dp(26); }

        private float xOf(float ratio) {
            float min = minZoom();
            float t = (float) (Math.log(ratio / min) / Math.log(MAX_ZOOM / min));
            return pad() + Math.max(0f, Math.min(1f, t)) * (getWidth() - 2 * pad());
        }

        @Override
        protected void onDraw(@NonNull Canvas c) {
            float cy = dp(20);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeWidth(dp(10));
            paint.setColor(Color.argb(120, 0, 0, 0));
            c.drawLine(pad(), cy, getWidth() - pad(), cy, paint);
            paint.setStrokeWidth(dp(5));
            paint.setColor(Color.argb(230, 255, 255, 255));
            c.drawLine(pad(), cy, getWidth() - pad(), cy, paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(dp(10));
            paint.setShadowLayer(4f, 0f, 0f, Color.BLACK);
            for (float m : zoomChipValues) {
                float x = xOf(m);
                paint.setColor(Color.WHITE);
                c.drawCircle(x, cy, dp(3), paint);
                float ly = cy + dp(22);
                c.save();
                c.rotate(uiAngle(), x, ly);
                c.drawText(ratioText(m), x, ly + dp(4), paint);
                c.restore();
            }
            paint.clearShadowLayer();
            float x = xOf(zoom);
            paint.setColor(Color.argb(140, 0, 0, 0));
            c.drawCircle(x, cy, dp(15), paint);
            paint.setColor(Color.rgb(250, 204, 21));
            c.drawCircle(x, cy, dp(12), paint);
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

    /** 누른 자리에 초점·노출을 잡고 그대로 둔다(다시 찍기·렌즈 바꿈 전까지). */
    private void focusAt(float x, float y) {
        if (camera == null) return;
        try {
            setCenterAfRegion(false); // 중앙 고정 영역을 풀어야 누른 자리가 먹는다
            MeteringPoint p = previewView.getMeteringPointFactory().createPoint(x, y);
            camera.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(p).disableAutoCancel().build());
            focusTapped = true;
            // 미리보기는 가운데를 기준으로 extraCrop 만큼 커져 있다
            float w = previewView.getWidth();
            float h = previewView.getHeight();
            float px = previewView.getLeft() + w / 2f + (x - w / 2f) * extraCrop;
            float py = previewView.getTop() + h / 2f + (y - h / 2f) * extraCrop;
            focusRingBg.setStroke(dp(2), Color.rgb(250, 204, 21));
            focusRing.setX(px - focusRing.getWidth() / 2f);
            focusRing.setY(py - focusRing.getHeight() / 2f);
        } catch (Exception ignored) { /* 초점을 못 맞추는 기기는 그대로 둔다 */ }
    }

    /** 초점 기준을 화면 정중앙으로 되돌린다(계속 맞추는 초점 + 중앙 영역). */
    private void resetFocusToCenter() {
        focusTapped = false;
        focusRingBg.setStroke(dp(2), Color.argb(170, 255, 255, 255));
        centerFocusRing();
        if (camera == null) return;
        try { camera.getCameraControl().cancelFocusAndMetering(); } catch (Exception ignored) { }
        setCenterAfRegion(true);
    }

    private void centerFocusRing() {
        if (previewView.getWidth() <= 0) return;
        focusRing.setX(previewView.getLeft() + previewView.getWidth() / 2f - dp(36));
        focusRing.setY(previewView.getTop() + previewView.getHeight() / 2f - dp(36));
    }

    /** 계속 맞추는 초점이 볼 영역을 센서 정중앙(가로·세로 1/5)으로 건다 / 푼다. */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void setCenterAfRegion(boolean on) {
        if (camera == null) return;
        try {
            Camera2CameraControl c2 = Camera2CameraControl.from(camera.getCameraControl());
            if (!on) {
                c2.clearCaptureRequestOptions();
                return;
            }
            Camera2CameraInfo info = Camera2CameraInfo.from(camera.getCameraInfo());
            Rect active = info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);
            Integer maxAf = info.getCameraCharacteristic(CameraCharacteristics.CONTROL_MAX_REGIONS_AF);
            if (active == null || maxAf == null || maxAf < 1) return; // 영역을 못 거는 기기: 기기 기본(보통 중앙)
            int w = active.width() / 5;
            int h = active.height() / 5;
            MeteringRectangle center = new MeteringRectangle(
                (active.width() - w) / 2, (active.height() - h) / 2, w, h, MeteringRectangle.METERING_WEIGHT_MAX);
            c2.setCaptureRequestOptions(new CaptureRequestOptions.Builder()
                .setCaptureRequestOption(CaptureRequest.CONTROL_AF_REGIONS, new MeteringRectangle[] { center })
                .build());
        } catch (Throwable ignored) { /* 못 걸면 기기 기본 초점 */ }
    }

    private void toggleTorch() {
        if (camera == null) return;
        torchOn = !torchOn;
        camera.getCameraControl().enableTorch(torchOn);
        torchButton.setText(torchOn ? "플래시 켬" : "플래시 끔");
    }

    // ───────── 촬영 → 확인 ─────────

    private void shoot() {
        if (imageCapture == null || busy || settingsMode || reviewBar.getVisibility() == View.VISIBLE) return;
        if (portraitHeld) {
            // 세로로는 찍지 않는다: 경고를 한 번 크게 튕겨 보여 준다
            updatePortraitWarning();
            portraitWarning.animate().cancel();
            portraitWarning.setScaleX(1.25f);
            portraitWarning.setScaleY(1.25f);
            portraitWarning.animate().scaleX(1f).scaleY(1f).setDuration(350).start();
            return;
        }
        busy = true;
        extraCropAtShot = extraCrop;
        final float displayAngle = uiAngle();
        // 화면은 세로로 고정이라, 사진 방향은 폰을 눕힌 쪽(가로 두 방향 중 하나)으로 직접 정한다
        imageCapture.setTargetRotation(landRotation);
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
                    // 확인 화면용: 든 방향에서 바로 보이게 돌린 그림
                    Matrix m = new Matrix();
                    m.postRotate(displayAngle);
                    Bitmap display = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
                    runOnUiThread(() -> showReview(bmp, display, f));
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
        // 렌즈가 못 낸 배율만큼 가운데를 자른다(미리보기와 같은 범위)
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

    private void showReview(Bitmap bmp, Bitmap display, File f) {
        busy = false;
        shutter.setAlpha(1f);
        if (isFinishing() || isDestroyed()) { f.delete(); return; }
        shotBitmap = bmp;
        shotDisplay = display;
        shotFile = f;
        reviewImage.setImageBitmap(display);
        setReviewMode(true);
    }

    private void setReviewMode(boolean review) {
        int live = review ? View.GONE : View.VISIBLE;
        reviewImage.setVisibility(review ? View.VISIBLE : View.GONE);
        reviewBar.setVisibility(review ? View.VISIBLE : View.GONE);
        shutter.setVisibility(live);
        updatePortraitWarning();
        focusRing.setVisibility(live);
        zoomArea.setVisibility(live);
        settingsButton.setVisibility(live);
        torchButton.setVisibility(!review && camera != null && camera.getCameraInfo().hasFlashUnit() ? View.VISIBLE : View.GONE);
    }

    private void retake() {
        reviewImage.setImageDrawable(null);
        if (shotDisplay != null && shotDisplay != shotBitmap) shotDisplay.recycle();
        shotDisplay = null;
        if (shotBitmap != null) { shotBitmap.recycle(); shotBitmap = null; }
        if (shotFile != null) { shotFile.delete(); shotFile = null; }
        setReviewMode(false);
        resetFocusToCenter(); // 다시 찍을 때 초점 기준은 다시 중앙
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
        if (settingsMode) { setSettingsMode(false); return; }
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
        handler.removeCallbacksAndMessages(null);
        if (shotFile != null) shotFile.delete(); // 확인하지 않고 닫힌 사진
        if (io != null) io.shutdown();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
