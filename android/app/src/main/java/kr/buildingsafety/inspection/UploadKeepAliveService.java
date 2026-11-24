package kr.buildingsafety.inspection;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.BatteryManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * 2026-11-24 충전 중이면 앱이 뒤로 가거나 화면이 꺼져도 서버에 남은 사진·층을 계속 올린다.
 *
 * 웹(JS)이 「남은 올리기 n건」을 BsaBackgroundUpload.setPending 으로 알려 준다.
 *  - 남은 게 있고 충전 중이면 이 전경 서비스(dataSync)를 띄워 앱 프로세스를 붙들고, CPU 깨움(부분 wake lock)을 잡는다.
 *    Capacitor 는 뒤로 가도 JS 타이머를 멈추지 않으므로(KeepRunning 기본값) 웹의 올리기가 그대로 돈다.
 *  - 충전기를 빼면 깨움만 놓는다(배터리 보호). 다시 꽂으면 다시 잡는다.
 *  - 다 올리면(0건) 서비스를 내린다. 알림의 「중지」로 사람이 끌 수도 있다(기기 데이터는 그대로, 다음에 앱을 열면 다시 올림).
 * 올리기 자체는 웹이 한다 — 여기서는 서버에 아무것도 쓰지 않는다.
 */
public class UploadKeepAliveService extends Service {
    private static final String CHANNEL = "bsa_bg_upload";
    private static final int NOTIFICATION_ID = 7302;
    static final String ACTION_STOP = "kr.buildingsafety.inspection.BG_UPLOAD_STOP";
    /** 깨움 최대 시간 — 무언가 꼬여도 배터리를 계속 붙들지 않게(새 알림마다 다시 잡음) */
    private static final long WAKE_MAX_MS = 30L * 60L * 1000L;

    private static volatile boolean running;
    private static volatile int pending;
    private static volatile boolean stoppedByUser;

    private PowerManager.WakeLock wakeLock;
    private BroadcastReceiver powerReceiver;

    public static boolean isRunning() { return running; }

    public static boolean isCharging(Context c) {
        try {
            Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return false;
            int plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            return plugged != 0;
        } catch (Throwable e) {
            return false;
        }
    }

    /** 웹이 남은 양을 알려 줄 때마다. 반환: 서비스가 떠 있는지 */
    public static boolean update(Context context, int count) {
        if (context == null) return running;
        Context c = context.getApplicationContext();
        pending = Math.max(0, count);
        if (pending == 0) {
            stoppedByUser = false;   // 다 올렸다 — 다음 번엔 다시 켜도 된다
            if (running) {
                try { c.stopService(new Intent(c, UploadKeepAliveService.class)); } catch (Throwable ignored) { }
            }
            return false;
        }
        try {
            if (running) {
                c.startService(new Intent(c, UploadKeepAliveService.class));   // 알림 글·깨움만 갱신
            } else if (!stoppedByUser && isCharging(c)) {
                Intent i = new Intent(c, UploadKeepAliveService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i);
                else c.startService(i);
                return true;
            }
        } catch (Throwable e) {
            // Android 12+ 는 앱이 뒤에 있을 때 전경 서비스를 새로 못 띄운다 — 다음에 앱을 열 때 다시 시도
            android.util.Log.w("BsaBgUpload", "start failed: " + e);
        }
        return running;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean fg = goForeground();
        running = fg;
        if (!fg) { stopSelf(); return START_NOT_STICKY; }
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stoppedByUser = true;
            shutdown();
            return START_NOT_STICKY;
        }
        if (pending <= 0) { shutdown(); return START_NOT_STICKY; }
        registerPowerReceiver();
        applyWake();
        return START_NOT_STICKY;
    }

    private void shutdown() {
        releaseWake();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Throwable ignored) { }
        stopSelf();
        running = false;
    }

    private void registerPowerReceiver() {
        if (powerReceiver != null) return;
        powerReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent i) {
                applyWake();
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_POWER_CONNECTED);
        f.addAction(Intent.ACTION_POWER_DISCONNECTED);
        try {
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(powerReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(powerReceiver, f);
        } catch (Throwable ignored) { powerReceiver = null; }
    }

    /** 충전 중이면 깨움을 잡고, 아니면 놓는다. 알림 글도 맞춘다. */
    private void applyWake() {
        boolean charging = isCharging(this);
        if (charging) {
            try {
                if (wakeLock == null) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bsa:bg-upload");
                        wakeLock.setReferenceCounted(false);
                    }
                }
                if (wakeLock != null) wakeLock.acquire(WAKE_MAX_MS);
            } catch (Throwable ignored) { }
        } else {
            releaseWake();
        }
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, build(charging));
        } catch (Throwable ignored) { }
    }

    private void releaseWake() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Throwable ignored) { }
    }

    private boolean goForeground() {
        Notification n;
        try {
            n = build(isCharging(this));
        } catch (Throwable e) {
            n = new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle("서버에 올리는 중").setOngoing(true).build();
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            return true;
        } catch (Throwable e) {
            android.util.Log.w("BsaBgUpload", "startForeground typed failed: " + e);
        }
        try {
            startForeground(NOTIFICATION_ID, n);
            return true;
        } catch (Throwable e) {
            android.util.Log.w("BsaBgUpload", "startForeground failed: " + e);
            return false;
        }
    }

    private Notification build(boolean charging) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "서버에 올리기", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("충전 중 앱이 뒤에 있어도 남은 사진·자료를 서버에 올리는 중일 때 표시");
            nm.createNotificationChannel(ch);
        }
        int immutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 10, open, immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop = new Intent(this, UploadKeepAliveService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 11, stop, immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        String text = charging
            ? "충전 중 — 화면이 꺼져도 계속 올립니다 (남은 " + pending + "건)"
            : "충전기를 연결하면 화면이 꺼져도 계속 올립니다 (남은 " + pending + "건)";
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("서버에 올리는 중")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "중지", stopPi)
            .build();
    }

    @Override
    public void onDestroy() {
        releaseWake();
        if (powerReceiver != null) {
            try { unregisterReceiver(powerReceiver); } catch (Throwable ignored) { }
            powerReceiver = null;
        }
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
