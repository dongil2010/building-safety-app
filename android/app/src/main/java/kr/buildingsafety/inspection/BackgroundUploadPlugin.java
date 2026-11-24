package kr.buildingsafety.inspection;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 2026-11-24 충전 중 백그라운드 올리기(UploadKeepAliveService)의 웹 쪽 창구.
 * JS: Capacitor.Plugins.BsaBackgroundUpload.setPending({ count }) → { running, charging }
 */
@CapacitorPlugin(name = "BsaBackgroundUpload")
public class BackgroundUploadPlugin extends Plugin {
    private int lastCount;

    @PluginMethod
    public void setPending(PluginCall call) {
        int count = call.getInt("count", 0);
        lastCount = count;
        boolean running = UploadKeepAliveService.update(getContext(), count);
        JSObject r = new JSObject();
        r.put("running", running);
        r.put("charging", UploadKeepAliveService.isCharging(getContext()));
        call.resolve(r);
    }

    /** 앱이 뒤로 가는 순간(아직 전경으로 쳐 주는 동안) 한 번 더 — 그때 충전기를 꽂아 둔 경우 */
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (lastCount > 0) UploadKeepAliveService.update(getContext(), lastCount);
    }

    /** 앱으로 돌아올 때 — 뒤에서 충전기를 꽂아 못 띄웠던 경우 */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (lastCount > 0) UploadKeepAliveService.update(getContext(), lastCount);
    }
}
