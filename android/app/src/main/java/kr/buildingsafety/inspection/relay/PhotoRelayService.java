package kr.buildingsafety.inspection.relay;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import kr.buildingsafety.inspection.MainActivity;

/**
 * 2026-10-19 받기·보내기 중 화면이 꺼지거나 순정 카메라가 앞에 떠 있어도 앱이 멈추지 않게 붙드는 전경 서비스(dataSync).
 * 알림의 「중지」를 누르면 받기·보내기를 모두 끈다.
 */
public class PhotoRelayService extends Service {
    private static final String CHANNEL = "bsa_photo_relay";
    private static final int NOTIFICATION_ID = 7301;
    private static final String ACTION_STOP = "kr.buildingsafety.inspection.relay.STOP";
    private static volatile boolean running;

    /** 받기·보내기 중 하나라도 켜져 있으면 서비스를 띄우고 알림 글을 고친다. 둘 다 꺼졌으면 내린다. */
    public static void refresh(Context context) {
        if (context == null) return;
        Context c = context.getApplicationContext();
        boolean need = ReceiverHub.get().isActive() || SenderHub.get().isActive();
        try {
            if (need) {
                Intent i = new Intent(c, PhotoRelayService.class);
                if (!running && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i);
                else c.startService(i);
            } else if (running) {
                c.stopService(new Intent(c, PhotoRelayService.class));
            }
        } catch (Exception ignored) {
            // Android 12+ 는 앱이 뒤에 있을 때 전경 서비스를 새로 못 띄운다 — 이미 떠 있으면 문제없음
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            ReceiverHub.get().stop();
            SenderHub.get().stop();
            stopForegroundCompat();
            stopSelf();
            running = false;
            return START_NOT_STICKY;
        }
        Notification n = build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            running = true;
        } catch (Exception e) {
            running = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!ReceiverHub.get().isActive() && !SenderHub.get().isActive()) {
            stopForegroundCompat();
            stopSelf();
            running = false;
        }
        return START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    private void stopForegroundCompat() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Exception ignored) { }
    }

    private Notification build() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "현장 사진 직접 전송", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("인터넷 없이 기기끼리 사진을 주고받는 중일 때 표시");
            nm.createNotificationChannel(ch);
        }
        int immutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open, immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop = new Intent(this, PhotoRelayService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop, immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        String r = ReceiverHub.get().notificationText();
        String s = SenderHub.get().notificationText();
        String text = r != null && s != null ? r + " / " + s : (r != null ? r : (s != null ? s : "준비 중"));
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(r != null ? android.R.drawable.stat_sys_download : android.R.drawable.stat_sys_upload)
            .setContentTitle("현장 사진 직접 전송")
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
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
