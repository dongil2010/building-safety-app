package kr.buildingsafety.inspection;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import kr.buildingsafety.inspection.camera.CustomCameraActivity;

/**
 * 2026-11-10 앱 전용 촬영 화면(camera/CustomCameraActivity)을 여는 다리.
 * JS: Capacitor.Plugins.BsaCamera.takePhoto({ longEdge: 2000, quality: 90 })
 *     → { dataUrl: 'data:image/jpeg;base64,...' } 또는 { cancelled: true }
 */
@CapacitorPlugin(
    name = "BsaCamera",
    permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") }
)
public class BsaCameraPlugin extends Plugin {

    @PluginMethod
    public void takePhoto(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermCallback");
            return;
        }
        launch(call);
    }

    @PermissionCallback
    private void cameraPermCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("카메라 권한이 있어야 촬영할 수 있습니다.", "PERMISSION");
            return;
        }
        launch(call);
    }

    private void launch(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), CustomCameraActivity.class);
            intent.putExtra(CustomCameraActivity.EXTRA_LONG_EDGE, call.getInt("longEdge", 2000));
            intent.putExtra(CustomCameraActivity.EXTRA_QUALITY, call.getInt("quality", 90));
            startActivityForResult(call, intent, "photoResult");
        } catch (Exception e) {
            call.reject("카메라를 열지 못했습니다: " + e.getMessage(), "CAMERA_ERROR");
        }
    }

    @ActivityCallback
    private void photoResult(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        String path = data == null ? null : data.getStringExtra(CustomCameraActivity.EXTRA_PATH);
        File file = path == null ? null : new File(path);
        try {
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK || file == null || !file.exists()) {
                String err = data == null ? null : data.getStringExtra(CustomCameraActivity.EXTRA_ERROR);
                if (err != null) { call.reject(err, "CAMERA_ERROR"); return; }
                JSObject o = new JSObject();
                o.put("cancelled", true);
                call.resolve(o);
                return;
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream((int) file.length());
            try (FileInputStream in = new FileInputStream(file)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            }
            JSObject o = new JSObject();
            o.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
            call.resolve(o);
        } catch (Throwable e) {
            if (call != null) call.reject("사진을 읽지 못했습니다: " + e.getMessage(), "CAMERA_ERROR");
        } finally {
            if (file != null) file.delete();
        }
    }
}
