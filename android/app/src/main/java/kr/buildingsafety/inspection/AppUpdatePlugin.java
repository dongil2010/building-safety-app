package kr.buildingsafety.inspection;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 앱 내부에서 APK를 내려받아 설치 화면을 연다 (사이드로드/사내 배포용).
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            Activity activity = getActivity();
            PackageManager pm = activity.getPackageManager();
            PackageInfo info = pm.getPackageInfo(activity.getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("versionName", info.versionName != null ? info.versionName : "1.0");
            long code;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                code = info.getLongVersionCode();
            } else {
                code = info.versionCode;
            }
            ret.put("versionCode", code);
            ret.put("packageName", activity.getPackageName());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("버전 조회 실패: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        }
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openUnknownSourcesSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } else {
                Intent intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("설정 화면을 열 수 없습니다: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String apkUrl = call.getString("url");
        if (apkUrl == null || apkUrl.trim().isEmpty()) {
            call.reject("apkUrl이 필요합니다");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                call.reject("알 수 없는 앱 설치 권한이 필요합니다 (NEED_INSTALL_PERMISSION)");
                return;
            }
        }

        final String urlFinal = apkUrl.trim();
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlFinal);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(120000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    call.reject("APK 다운로드 실패 (HTTP " + code + ")");
                    return;
                }

                File outFile = new File(getContext().getCacheDir(), "bsa-update.apk");
                if (outFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    outFile.delete();
                }

                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(outFile)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) >= 0) {
                        out.write(buf, 0, n);
                    }
                    out.flush();
                }

                getActivity().runOnUiThread(() -> {
                    try {
                        installApkFile(outFile);
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        ret.put("path", outFile.getAbsolutePath());
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("설치 화면 실행 실패: " + e.getMessage(), e);
                    }
                });
            } catch (Exception e) {
                call.reject("다운로드 실패: " + e.getMessage(), e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void installApkFile(File apkFile) {
        Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getContext().startActivity(intent);
    }
}
