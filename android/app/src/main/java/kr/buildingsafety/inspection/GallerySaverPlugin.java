package kr.buildingsafety.inspection;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 2026-10-16 사진을 휴대폰 갤러리(사진/스마트안전점검)에 저장한다.
 * Android 10+ : MediaStore(권한 필요 없음). Android 9 이하 : 저장소 쓰기 권한을 물은 뒤 파일 + 미디어 스캔.
 * JS: Capacitor.Plugins.BsaGallery.saveImage({ data: 'data:image/jpeg;base64,...', fileName: 'x.jpg' })
 */
@CapacitorPlugin(
    name = "BsaGallery",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class GallerySaverPlugin extends Plugin {
    private static final String ALBUM = "스마트안전점검";

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (call.getString("data") == null) { call.reject("no data"); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storagePermCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) doSave(call);
        else call.reject("저장소 권한이 거부되었습니다");
    }

    private void doSave(PluginCall call) {
        try {
            String data = call.getString("data");
            String name = call.getString("fileName", "bsa_" + System.currentTimeMillis() + ".jpg");
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            String mime = data.startsWith("data:image/png") ? "image/png" : "image/jpeg";
            int comma = data.indexOf(',');
            byte[] bytes = Base64.decode(comma >= 0 ? data.substring(comma + 1) : data, Base64.DEFAULT);
            String uriStr;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                v.put(MediaStore.Images.Media.MIME_TYPE, mime);
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + ALBUM);
                v.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("MediaStore insert failed");
                try (OutputStream os = resolver.openOutputStream(uri)) {
                    if (os == null) throw new Exception("open failed");
                    os.write(bytes);
                }
                v.clear();
                v.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(uri, v, null, null);
                uriStr = uri.toString();
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ALBUM);
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("mkdir failed");
                File f = new File(dir, name);
                try (FileOutputStream fos = new FileOutputStream(f)) { fos.write(bytes); }
                MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, new String[] { mime }, null);
                uriStr = Uri.fromFile(f).toString();
            }
            JSObject r = new JSObject();
            r.put("uri", uriStr);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("갤러리 저장 실패: " + e.getMessage());
        }
    }
}
