package kr.buildingsafety.inspection;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import kr.buildingsafety.inspection.relay.QrScanActivity;
import kr.buildingsafety.inspection.relay.ReceiverHub;
import kr.buildingsafety.inspection.relay.RelayDiag;
import kr.buildingsafety.inspection.relay.RelayEvents;
import kr.buildingsafety.inspection.relay.SenderHub;
import kr.buildingsafety.inspection.relay.SnapProtocol;

/**
 * 2026-10-19 인터넷 없이 기기끼리 현장 사진을 주고받는다(SnapSync 규격 호환).
 * 받는 기기: receiverStart → 전용 Wi-Fi + QR, 사진이 오면 'photoReceived' {id, name, dataUrl} → 웹이 ackInbox({ids}).
 * 보내는 기기: senderScan(QR 읽고 그 Wi-Fi 에 연결) → capture(순정 카메라로 찍고 자동 보내기).
 * JS: Capacitor.Plugins.BsaPhotoRelay
 */
@CapacitorPlugin(
    name = "BsaPhotoRelay",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
        @Permission(strings = { "android.permission.NEARBY_WIFI_DEVICES" }, alias = "nearby"),
        @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notify")
    }
)
public class PhotoRelayPlugin extends Plugin implements RelayEvents {
    private static final String PREFS = "bsa_photo_relay";
    private static final String KEY_PENDING = "pendingCapture";

    @Override
    public void load() {
        RelayDiag.installCrashHook(ctx());
        ReceiverHub.get().setListener(this);
        SenderHub.get().setListener(this);
        recoverPendingCapture();
    }

    @Override
    protected void handleOnDestroy() {
        ReceiverHub.get().clearListener(this);
        SenderHub.get().clearListener(this);
        super.handleOnDestroy();
    }

    @Override
    public void onRelayEvent(String type, JSObject data) {
        notifyListeners(type, data);
    }

    private Context ctx() { return getContext().getApplicationContext(); }

    private SharedPreferences prefs() { return ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** 순정 카메라가 떠 있는 사이 앱 화면이 정리돼도, 찍힌 사진은 다시 켤 때 보낼함으로 들어간다. */
    private void recoverPendingCapture() {
        String path = prefs().getString(KEY_PENDING, null);
        if (path == null) return;
        prefs().edit().remove(KEY_PENDING).apply();
        File f = new File(path);
        if (f.exists() && f.length() > 0) {
            SenderHub.get().enqueue(ctx(), f);
            SenderHub.get().start(ctx());
        } else if (f.exists()) {
            f.delete();
        }
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject o = new JSObject();
        o.put("receiver", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        o.put("sender", true);
        o.put("autoConnect", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("model", Build.MODEL);
        o.put("diag", RelayDiag.snapshot(ctx()));
        call.resolve(o);
    }

    // ───────── 받기 ─────────

    private String[] receiverAliases() {
        List<String> a = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33) { a.add("nearby"); a.add("notify"); }
        else a.add("location");
        return a.toArray(new String[0]);
    }

    private boolean receiverPermsOk() {
        if (Build.VERSION.SDK_INT >= 33) return getPermissionState("nearby") == PermissionState.GRANTED;
        return getPermissionState("location") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void receiverStart(PluginCall call) {
        RelayDiag.step(ctx(), "start");
        try {
            if (!receiverPermsOk() || (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") == PermissionState.PROMPT)) {
                RelayDiag.step(ctx(), "permission_ask");
                requestPermissionForAliases(receiverAliases(), call, "receiverPermCallback");
                return;
            }
            doReceiverStart(call);
        } catch (Throwable e) {
            failSoft(call, "START_ERROR", e);
        }
    }

    /** 어떤 예외가 나도 화면이 「켜는 중」에 멈추거나 그냥 「꺼져 있음」이 되지 않게: 받기 서버는 열고 이유를 남겨 답한다. */
    private void failSoft(PluginCall call, String code, Throwable e) {
        String msg = "받기를 켜다 오류가 났습니다: " + e.getClass().getSimpleName() + (e.getMessage() == null ? "" : " " + e.getMessage());
        RelayDiag.error(ctx(), code, msg);
        try { ReceiverHub.get().startServerOnly(ctx(), code, msg + " — 아래 「같은 Wi-Fi로 받기」나 휴대폰 핫스팟을 쓰세요."); } catch (Throwable ignored) { }
        try {
            JSObject s = ReceiverHub.get().status(ctx());
            s.put("hotspotOk", false);
            call.resolve(s);
        } catch (Throwable t) {
            call.reject(msg, code);
        }
    }

    @PermissionCallback
    private void receiverPermCallback(PluginCall call) {
        RelayDiag.step(ctx(), "permission_done");
        if (!receiverPermsOk()) {
            // 전용 Wi-Fi 는 못 켜도 받기 서버는 연다 — 휴대폰 핫스팟(이름·암호 입력)이나 같은 Wi-Fi 로 받을 수 있게
            ReceiverHub.get().startServerOnly(ctx(), "PERMISSION", Build.VERSION.SDK_INT >= 33
                ? "「근처 기기」 권한이 없어 전용 Wi-Fi를 못 켭니다. 「앱 권한 설정 열기」에서 허용하거나, 휴대폰 핫스팟을 쓰세요."
                : "「위치」 권한이 없어 전용 Wi-Fi를 못 켭니다. 「앱 권한 설정 열기」에서 허용하거나, 휴대폰 핫스팟을 쓰세요.");
            call.resolve(ReceiverHub.get().status(ctx()));
            return;
        }
        try {
            doReceiverStart(call);
        } catch (Throwable e) {
            failSoft(call, "START_ERROR", e);
        }
    }

    private boolean locationOn() {
        try {
            LocationManager lm = (LocationManager) ctx().getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return lm.isLocationEnabled();
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) {
            return true;
        }
    }

    private void doReceiverStart(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !locationOn()) {
            ReceiverHub.get().startServerOnly(ctx(), "LOCATION_OFF",
                "이 기기는 위치(GPS)가 켜져 있어야 전용 Wi-Fi를 켤 수 있습니다. 위치를 켜고 「핫스팟 다시 켜기」를 누르거나, 휴대폰 핫스팟을 쓰세요.");
            call.resolve(ReceiverHub.get().status(ctx()));
            return;
        }
        // 실패해도 reject 하지 않는다: 받기 서버는 열려 있고, 화면이 이유와 대안(같은 Wi-Fi·휴대폰 핫스팟)을 보여 준다
        final boolean[] done = { false };
        getActivity().runOnUiThread(() -> {
            try {
                ReceiverHub.get().start(ctx(), (ok, code, message) -> {
                    if (done[0]) return;
                    done[0] = true;
                    try {
                        kr.buildingsafety.inspection.relay.PhotoRelayService.refresh(ctx());
                        JSObject s = ReceiverHub.get().status(ctx());
                        s.put("hotspotOk", ok);
                        call.resolve(s);
                    } catch (Throwable e) {
                        failSoft(call, "STATUS_ERROR", e);
                    }
                });
            } catch (Throwable e) {
                if (!done[0]) { done[0] = true; failSoft(call, "START_ERROR", e); }
            }
        });
    }

    @PluginMethod
    public void receiverStop(PluginCall call) {
        ReceiverHub.get().stop();
        call.resolve(ReceiverHub.get().status(ctx()));
    }

    @PluginMethod
    public void receiverStatus(PluginCall call) {
        call.resolve(ReceiverHub.get().status(ctx()));
    }

    /** 전용 Wi-Fi 대신 쓸 휴대폰 핫스팟 이름·암호(설정에서 직접 켠 것). 빈 이름이면 지운다. 받기 서버도 연다. */
    @PluginMethod
    public void receiverUseManualHotspot(PluginCall call) {
        String ssid = call.getString("ssid", "");
        String pass = call.getString("password", "");
        String sec = call.getString("security", "WPA");
        if (ssid != null && !ssid.trim().isEmpty()) {
            String bad = SnapProtocol.checkHotspotInput(ssid, pass);
            if (bad != null) { call.reject(bad, "BAD_INPUT"); return; }
        }
        ReceiverHub.get().setManualHotspot(ssid, pass, sec);
        ReceiverHub.get().startServerOnly(ctx(), null, null);
        call.resolve(ReceiverHub.get().status(ctx()));
    }

    /** 핫스팟 없이 받기: 받기 서버만 열고, 이 기기가 붙어 있는 Wi-Fi(공유기) 주소 QR(lanQrDataUrl)을 준다. 권한 필요 없음. */
    @PluginMethod
    public void receiverStartLan(PluginCall call) {
        RelayDiag.step(ctx(), "lan_start");
        try {
            ReceiverHub.get().startServerOnly(ctx(), null, null);
            call.resolve(ReceiverHub.get().status(ctx()));
        } catch (Throwable e) {
            failSoft(call, "LAN_ERROR", e);
        }
    }

    @PluginMethod
    public void openHotspotSettings(PluginCall call) {
        Intent tether = new Intent("android.settings.TETHER_SETTINGS");
        tether.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(tether);
        } catch (Exception e) {
            openSettings(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
        }
        call.resolve();
    }

    @PluginMethod
    public void pendingInbox(PluginCall call) {
        int limit = call.getInt("limit", 5);
        if (limit < 1) limit = 1;
        if (limit > 20) limit = 20;
        final int lim = limit;
        new Thread(() -> {
            JSObject o = new JSObject();
            o.put("items", ReceiverHub.get().pending(ctx(), lim));
            o.put("total", ReceiverHub.get().pendingCount(ctx()));
            call.resolve(o);
        }, "bsa-relay-pending").start();
    }

    @PluginMethod
    public void ackInbox(PluginCall call) {
        JSArray ids = call.getArray("ids");
        List<String> list = new ArrayList<>();
        if (ids != null) {
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, null);
                if (id != null) list.add(id);
            }
        }
        JSObject o = new JSObject();
        o.put("removed", ReceiverHub.get().ack(ctx(), list));
        call.resolve(o);
    }

    // ───────── 보내기 ─────────

    private String wifiAlias() {
        if (Build.VERSION.SDK_INT >= 33) return "nearby";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return "location";
        return null;
    }

    @PluginMethod
    public void senderScan(PluginCall call) {
        String w = wifiAlias();
        boolean needCam = getPermissionState("camera") != PermissionState.GRANTED;
        boolean askWifi = w != null && getPermissionState(w) == PermissionState.PROMPT;
        if (needCam || askWifi) {
            List<String> a = new ArrayList<>();
            if (needCam) a.add("camera");
            if (askWifi) a.add(w);
            requestPermissionForAliases(a.toArray(new String[0]), call, "scanPermCallback");
            return;
        }
        launchScan(call);
    }

    @PermissionCallback
    private void scanPermCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("카메라 권한이 있어야 QR을 읽을 수 있습니다.", "PERMISSION");
            return;
        }
        launchScan(call);
    }

    private void launchScan(PluginCall call) {
        requestNotifyOnce();
        startActivityForResult(call, new Intent(getContext(), QrScanActivity.class), "scanResult");
    }

    @ActivityCallback
    private void scanResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject o = new JSObject();
            o.put("cancelled", true);
            String err = result.getData() == null ? null : result.getData().getStringExtra("error");
            if (err != null) o.put("message", err);
            call.resolve(o);
            return;
        }
        String text = result.getData().getStringExtra(QrScanActivity.EXTRA_TEXT);
        String[] lan = SnapProtocol.parseLanQr(text);
        if (lan != null) {
            // 같은 Wi-Fi QR: Wi-Fi 를 바꾸지 않고 그 주소로 바로
            SenderHub.get().connectLan(ctx(), lan[0], Integer.parseInt(lan[1]), lan[2], lan[3]);
            JSObject o = new JSObject();
            o.put("mode", "lan");
            o.put("receiverIp", lan[0]);
            if (!lan[3].isEmpty()) o.put("ssid", lan[3]);
            o.put("autoConnect", false);
            o.put("status", SenderHub.get().status(ctx()));
            call.resolve(o);
            return;
        }
        String[] wifi = SnapProtocol.parseWifiQr(text);
        if (wifi == null) {
            call.reject("받기용 QR이 아닙니다. 받는 기기의 「오프라인 직접 받기」 화면 QR(Wi-Fi 또는 같은 Wi-Fi)을 비춰 주세요.", "NOT_WIFI_QR");
            return;
        }
        boolean auto = SenderHub.get().connect(ctx(), wifi[0], wifi[1], wifi[2]);
        JSObject o = new JSObject();
        o.put("ssid", wifi[0]);
        o.put("autoConnect", auto);
        // Android 10~12 일부 기기(삼성 포함)는 위치가 꺼져 있으면 연결 창이 Wi-Fi 를 못 찾는다
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && Build.VERSION.SDK_INT < 33 && !locationOn()) o.put("locationOff", true);
        o.put("status", SenderHub.get().status(ctx()));
        call.resolve(o);
    }

    private void requestNotifyOnce() {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") == PermissionState.PROMPT) {
            try {
                getActivity().requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 7302);
            } catch (Exception ignored) { }
        }
    }

    /** QR 없이(이미 그 Wi-Fi 에 직접 붙어 있을 때) 찾기·보내기만 켠다. */
    @PluginMethod
    public void senderStart(PluginCall call) {
        SenderHub.get().start(ctx());
        call.resolve(SenderHub.get().status(ctx()));
    }

    @PluginMethod
    public void senderStop(PluginCall call) {
        SenderHub.get().stop();
        call.resolve(SenderHub.get().status(ctx()));
    }

    @PluginMethod
    public void senderStatus(PluginCall call) {
        call.resolve(SenderHub.get().status(ctx()));
    }

    @PluginMethod
    public void clearOutbox(PluginCall call) {
        JSObject o = new JSObject();
        o.put("removed", SenderHub.get().clearOutbox(ctx()));
        call.resolve(o);
    }

    @PluginMethod
    public void capture(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "capturePermCallback");
            return;
        }
        launchCamera(call);
    }

    @PermissionCallback
    private void capturePermCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("카메라 권한이 있어야 촬영할 수 있습니다.", "PERMISSION");
            return;
        }
        launchCamera(call);
    }

    /** 순정 카메라(ACTION_IMAGE_CAPTURE)로 찍는다. 결과 파일은 앱 캐시 → 찍고 「확인」을 누르면 보낼함으로. */
    private void launchCamera(PluginCall call) {
        try {
            File dir = new File(getContext().getCacheDir(), "relay-capture");
            if (!dir.exists()) dir.mkdirs();
            String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            File file = new File(dir, "SNAP_" + stamp + ".jpg");
            if (!file.exists()) file.createNewFile();
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            intent.setClipData(ClipData.newUri(getContext().getContentResolver(), "photo", uri));
            List<ResolveInfo> apps = getContext().getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (apps == null || apps.isEmpty()) {
                file.delete();
                call.reject("이 폰에서 카메라 앱을 찾지 못했습니다.", "NO_CAMERA_APP");
                return;
            }
            for (ResolveInfo ri : apps) {
                getContext().grantUriPermission(ri.activityInfo.packageName, uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            }
            prefs().edit().putString(KEY_PENDING, file.getAbsolutePath()).commit();
            SenderHub.get().start(ctx());
            startActivityForResult(call, intent, "captureResult");
        } catch (Exception e) {
            call.reject("카메라를 열지 못했습니다: " + e.getMessage(), "CAMERA_ERROR");
        }
    }

    @ActivityCallback
    private void captureResult(PluginCall call, ActivityResult result) {
        String path = prefs().getString(KEY_PENDING, null);
        prefs().edit().remove(KEY_PENDING).apply();
        String id = null;
        if (path != null) {
            File f = new File(path);
            if (result.getResultCode() == Activity.RESULT_OK && f.exists() && f.length() > 0) {
                id = SenderHub.get().enqueue(ctx(), f);
            } else if (f.exists()) {
                f.delete();
            }
        }
        if (call == null) return;
        JSObject o = new JSObject();
        o.put("captured", id != null);
        if (id != null) o.put("id", id);
        o.put("status", SenderHub.get().status(ctx()));
        call.resolve(o);
    }

    // ───────── 설정 화면 ─────────

    @PluginMethod
    public void openWifiSettings(PluginCall call) {
        openSettings(new Intent(Settings.ACTION_WIFI_SETTINGS));
        call.resolve();
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        openSettings(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    private void openSettings(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) { }
    }
}
