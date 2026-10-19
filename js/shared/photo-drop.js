/**
 * 사진 끌어다 놓기(드래그 앤 드롭) 판정 — 2026-10-19 결함 수정창 사진 칸
 *  - PC 탐색기에서 그림 파일 여러 장
 *  - 앱 안 그림(사진첩·대기함 썸네일 등 <img>를 끌면 브라우저가 data:/blob: 주소를 넘긴다)
 * 순수 함수 — app.js와 테스트가 같이 쓴다. 실제 사진 처리(줄이기·IndexedDB·동기화)는 기존 사진 추가 길 그대로.
 */
(function (root) {
    'use strict';

    var IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i;

    function isImageFile(f) {
        if (!f) return false;
        var t = String(f.type || '');
        if (/^image\//i.test(t)) return true;
        return !t && IMAGE_EXT.test(String(f.name || ''));
    }

    function typesOf(dt) {
        if (!dt || !dt.types) return [];
        try { return Array.prototype.slice.call(dt.types).map(String); } catch (_e) { return []; }
    }

    /** 끄는 중(dragover) — 파일이나 그림 주소가 실려 있으면 받는다(이때는 파일 내용을 못 본다) */
    function looksLikeImageDrag(dt) {
        var types = typesOf(dt);
        return types.indexOf('Files') >= 0 || types.indexOf('text/uri-list') >= 0;
    }

    /** 놓았을 때 그림 파일만(순서 그대로) */
    function pickImageFiles(dt) {
        if (!dt || !dt.files) return [];
        var out = [];
        for (var i = 0; i < dt.files.length; i++) {
            var f = dt.files[i];
            if (isImageFile(f)) out.push(f);
        }
        return out;
    }

    /** 앱 안 그림을 끌었을 때의 주소 — data:image/… 또는 blob: 만(남의 사이트 주소는 받지 않는다) */
    function extractImageUrl(dt) {
        if (!dt || typeof dt.getData !== 'function') return '';
        var raw = '';
        try { raw = dt.getData('text/uri-list') || ''; } catch (_e) { raw = ''; }
        if (!raw) { try { raw = dt.getData('text/plain') || ''; } catch (_e2) { raw = ''; } }
        var lines = String(raw).split(/\r?\n/).map(function (s) { return s.trim(); })
            .filter(function (s) { return s && s.charAt(0) !== '#'; });
        for (var i = 0; i < lines.length; i++) {
            if (/^data:image\//i.test(lines[i]) || /^blob:/i.test(lines[i])) return lines[i];
        }
        return '';
    }

    var api = { isImageFile: isImageFile, looksLikeImageDrag: looksLikeImageDrag, pickImageFiles: pickImageFiles, extractImageUrl: extractImageUrl };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.photoDrop = api;
})(typeof window !== 'undefined' ? window : globalThis);
