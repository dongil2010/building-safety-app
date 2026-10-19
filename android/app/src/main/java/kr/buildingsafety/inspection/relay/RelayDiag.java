package kr.buildingsafety.inspection.relay;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import com.getcapacitor.JSObject;

/**
 * 2026-10-19 「핫스팟이 안켜지고 qr도 못봐」(Lenovo Idea Tab 11) — 기기에서 무슨 일이 있었는지 화면에 한 줄로 보여 주기 위한 기록.
 * 단계(step)·마지막 오류(code/message)·앱이 죽은 기록(crash)을 SharedPreferences 에 남긴다(앱이 죽었다 다시 떠도 남음).
 * 사용자가 그 줄을 캡처해 보내면 원인을 바로 안다.
 */
public final class RelayDiag {
    private static final String PREFS = "bsa_photo_relay_diag";
    private static volatile boolean hooked;

    private RelayDiag() { }

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 지금 하고 있는 일. 앱이 이 단계에서 죽으면 다음 실행 때 「지난번 … 중 앱이 멈춤」으로 보인다. */
    public static void step(Context c, String name) {
        if (c == null) return;
        try { p(c).edit().putString("step", name).putLong("stepAt", System.currentTimeMillis()).apply(); } catch (Exception ignored) { }
    }

    public static void error(Context c, String code, String message) {
        if (c == null) return;
        try {
            p(c).edit().putString("code", code).putString("message", clip(message, 160))
                .putLong("at", System.currentTimeMillis()).apply();
        } catch (Exception ignored) { }
    }

    public static void clearError(Context c) {
        if (c == null) return;
        try { p(c).edit().remove("code").remove("message").remove("at").apply(); } catch (Exception ignored) { }
    }

    /** 앱이 죽을 때 이유를 남기고 원래 처리(시스템)로 넘긴다. 한 번만 건다. */
    public static void installCrashHook(Context context) {
        if (hooked || context == null) return;
        hooked = true;
        final Context c = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                String where = "";
                for (StackTraceElement el : e.getStackTrace()) {
                    if (el.getClassName().startsWith("kr.buildingsafety")) {
                        where = " @" + el.getClassName().replace("kr.buildingsafety.inspection.", "") + ":" + el.getLineNumber();
                        break;
                    }
                }
                String step = p(c).getString("step", "");
                p(c).edit().putString("crash", clip(e.getClass().getSimpleName() + ": " + e.getMessage() + where + " (단계 " + step + ", " + t.getName() + ")", 220))
                    .putLong("crashAt", System.currentTimeMillis()).commit();
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(t, e);
        });
    }

    static String clip(String s, int n) {
        if (s == null) return null;
        return s.length() > n ? s.substring(0, n) + "…" : s;
    }

    public static JSObject snapshot(Context context) {
        JSObject o = new JSObject();
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("release", Build.VERSION.RELEASE);
        o.put("manufacturer", Build.MANUFACTURER);
        o.put("model", Build.MODEL);
        if (context == null) return o;
        Context c = context.getApplicationContext();
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            o.put("app", pi.versionName);
            o.put("appCode", Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception ignored) { }
        try {
            SharedPreferences sp = p(c);
            o.put("step", sp.getString("step", null));
            o.put("code", sp.getString("code", null));
            o.put("message", sp.getString("message", null));
            long at = sp.getLong("at", 0);
            if (at > 0) o.put("at", at);
            String crash = sp.getString("crash", null);
            long crashAt = sp.getLong("crashAt", 0);
            // 사흘 넘은 죽음 기록은 안 보인다
            if (crash != null && System.currentTimeMillis() - crashAt < 3L * 24 * 3600 * 1000) {
                o.put("crash", crash);
                o.put("crashAt", crashAt);
            }
        } catch (Exception ignored) { }
        return o;
    }

    /** 화면에 그대로 찍는 한 줄(웹이 diag 로 만들지 못할 때 대비). */
    public static String line(JSObject d, String code) {
        StringBuilder b = new StringBuilder();
        b.append("코드 ").append(code == null || code.isEmpty() ? "-" : code);
        b.append(" · Android ").append(d.optString("release", "?")).append(" (SDK ").append(d.optInt("sdk", 0)).append(')');
        b.append(" · ").append(d.optString("manufacturer", "")).append(' ').append(d.optString("model", ""));
        if (d.has("app")) b.append(" · 앱 ").append(d.optString("app", "")).append('(').append(d.optInt("appCode", 0)).append(')');
        return b.toString();
    }
}
