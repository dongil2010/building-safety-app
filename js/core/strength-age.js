/**
 * 콘크리트 강도(반발경도) 재령일 — 직접 입력(덮어쓰기) 우선순위 (2026-10-19)
 *  1) 이 항목만 재령일(item.strengthAgeOverride)
 *  2) 건물 공통 재령일(bldg.strengthAgeOverride)
 *  3) 자동: 준공일 ~ 점검일 DAYS360 (app.js getConcreteStrengthAgeDays)
 * 직접 입력 칸을 비우면 다음 순위(결국 자동)로 돌아간다. 저장된 계산값은 바꾸지 않고, 보여 줄 때·내보낼 때 이 값으로 다시 계산한다.
 * 순수 함수 — app.js와 테스트가 같이 쓴다.
 */
(function (root) {
    'use strict';

    var MAX_DAYS = 36500; // 100년 — 그보다 큰 값은 잘못 친 것으로 본다

    /** 입력값 → 0 이상 정수 일수, 비었거나 숫자가 아니면 null */
    function parseOverride(v) {
        if (v === null || v === undefined) return null;
        var raw = String(v).trim();
        if (raw.charAt(0) === '-') return null;
        var s = raw.replace(/[^0-9.]/g, '');
        if (!s) return null;
        var n = Math.round(parseFloat(s));
        if (!Number.isFinite(n) || n < 0 || n > MAX_DAYS) return null;
        return n;
    }

    /**
     * 쓸 재령일과 출처.
     * @returns {{ days: number|null, source: 'item'|'building'|'auto', autoDays: number|null }}
     */
    function resolve(item, bldg, autoDays) {
        var auto = (autoDays === null || autoDays === undefined || !Number.isFinite(Number(autoDays))) ? null : Number(autoDays);
        var it = parseOverride(item && item.strengthAgeOverride);
        if (it !== null) return { days: it, source: 'item', autoDays: auto };
        var b = parseOverride(bldg && bldg.strengthAgeOverride);
        if (b !== null) return { days: b, source: 'building', autoDays: auto };
        return { days: auto, source: 'auto', autoDays: auto };
    }

    function sourceLabel(source) {
        if (source === 'item') return '이 항목 직접 입력';
        if (source === 'building') return '건물 공통 직접 입력';
        return '준공일 기준 자동';
    }

    var api = { parseOverride: parseOverride, resolve: resolve, sourceLabel: sourceLabel, MAX_DAYS: MAX_DAYS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.strengthAge = api;
})(typeof window !== 'undefined' ? window : globalThis);
