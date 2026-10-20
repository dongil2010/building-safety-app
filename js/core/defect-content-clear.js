/**
 * 「내용 비우기 (핀 위치 유지)」(2026-10-20) — 마킹 자리(핀·박스·지시선·NO.)는 두고 결함 내용만 비운다.
 * 이전 회차 사진(prevRoundPhotos)·이월 표시·위치 칸·번호·평가 구역은 건드리지 않는다.
 */
(function (root) {
    'use strict';
    // 비울 칸 → 빈 값
    var TEXT = ['defectType', 'component', 'cause', 'size', 'crackWidth', 'crackLength', 'itemCount',
        'note', 'notes', 'remark', 'remarks', 'memo', 'grade', 'defectGrade', 'status', 'progress', 'quantity', 'count'];
    var FLAGS = ['isProgress', 'isLeak', 'isOpeningCrack', 'isPriorityManage', 'isBookmark'];
    var ARRAYS = ['crackMeasures'];

    function isEmpty(v) { return v == null || v === '' || v === false || (Array.isArray(v) && !v.length); }

    /** 이 마킹에 비울 것이 있는가 */
    function hasContent(d) {
        if (!d) return false;
        if (TEXT.some(function (k) { return Object.prototype.hasOwnProperty.call(d, k) && !isEmpty(d[k]); })) return true;
        if (FLAGS.some(function (k) { return d[k] === true; })) return true;
        if (ARRAYS.some(function (k) { return Array.isArray(d[k]) && d[k].length; })) return true;
        return currentPhotoCount(d) > 0;
    }
    function currentPhotoCount(d) {
        var a = Array.isArray(d.photos) ? d.photos.filter(Boolean).length : 0;
        var b = Array.isArray(d.photoIds) ? d.photoIds.filter(Boolean).length : 0;
        return Math.max(a, b);
    }

    /** 내용 칸만 비운다(사진은 여기서 안 건드림 — 앱이 사진 기록과 함께 뗀다). 바뀌었으면 true */
    function clearContentFields(d) {
        if (!d) return false;
        var changed = false;
        TEXT.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(d, k) && !isEmpty(d[k])) { d[k] = ''; changed = true; }
        });
        FLAGS.forEach(function (k) { if (d[k] === true) { d[k] = false; changed = true; } });
        ARRAYS.forEach(function (k) { if (Array.isArray(d[k]) && d[k].length) { d[k] = []; changed = true; } });
        return changed;
    }

    /** 이번 회차 사진 떼기(파일은 지우지 않음). 떼기 전 사진 ID 목록을 돌려준다 */
    function unlinkCurrentPhotos(d, beforeIds) {
        if (!d) return [];
        var ids = (beforeIds || d.photoIds || []).filter(Boolean);
        d.photos = [];
        d.photoIds = [];
        if (Array.isArray(d.photoUrls)) d.photoUrls = [];
        return ids;
    }

    var api = { hasContent: hasContent, clearContentFields: clearContentFields, unlinkCurrentPhotos: unlinkCurrentPhotos, currentPhotoCount: currentPhotoCount, TEXT: TEXT, FLAGS: FLAGS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.defectContentClear = api; }
})(typeof window !== 'undefined' ? window : globalThis);
