package kr.buildingsafety.inspection.relay;

import com.getcapacitor.JSObject;

/** 받기·보내기 허브가 웹 화면(플러그인)에 알리는 통로. 화면이 없으면(앱 화면이 꺼져 있으면) 버린다 — 받은 사진은 받은편지함 파일로 남는다. */
public interface RelayEvents {
    void onRelayEvent(String type, JSObject data);
}
