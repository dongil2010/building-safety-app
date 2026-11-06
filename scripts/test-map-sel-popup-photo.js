#!/usr/bin/env node
'use strict';
/**
 * t600u: 선택 마킹 요약 팝업 「사진 추가」
 * - 현차 사진 유무는 photoIds / photos / photoUrls / 열린 창 _pendingPhotos 만으로 센다
 * - 그 마킹에만 기존 pick→attach 경로, 취소는 그대로, 없는 선택은 안전하게
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const open = app.indexOf('{', app.indexOf(')', at));
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

const countSrc = [
    extractFunction('function countDefectLocalPhotoSlots('),
    extractFunction('function countSelectedMarkPhotos('),
    extractFunction('function formatMapSelPopupPhotoStatus('),
    extractFunction('function capturePhotoTargetForSelectedDefect('),
    extractFunction('function startMapPopupPhotoAdd(')
].join('\n');

function makePhotoWorld(opts) {
    const o = opts || {};
    const defects = o.defects || [
        { id: 'A', no: 'NO.01', photos: [], photoIds: [] },
        { id: 'B', no: 'NO.02', photoIds: ['B1', 'B2'], photos: [null, null] }
    ];
    const toasts = [];
    const picks = [];
    const pinEl = { value: o.pinId || '' };
    const win = {
        _pendingPhotos: o.pending ? o.pending.slice() : undefined,
        showToast: (msg, type) => toasts.push([type, msg]),
        triggerDefectPhotoPick: (mode, target, photoTarget) => { picks.push([mode, target, photoTarget]); }
    };
    const ctx = {
        window: win,
        state: { currentBuildingId: 'b1', currentFloor: '1F' },
        document: { getElementById: (id) => (id === 'defectPinId' ? pinEl : null) },
        isDefectModalOpen: () => !!o.modalOpen,
        captureDefectPhotoTarget: () => ({
            open: !!o.modalOpen,
            pinId: pinEl.value || '',
            seq: 1,
            floorKey: 'b1_1F'
        }),
        getCurrentFloorDefects: () => defects.slice(),
        updateMapSelectedDefectPopup: () => { ctx.popupRefreshed = (ctx.popupRefreshed || 0) + 1; }
    };
    vm.createContext(ctx);
    vm.runInContext(countSrc + '\nthis.count = countDefectLocalPhotoSlots; this.countSel = countSelectedMarkPhotos;\n'
        + 'this.status = formatMapSelPopupPhotoStatus; this.captureSel = capturePhotoTargetForSelectedDefect;\n'
        + 'this.startAdd = startMapPopupPhotoAdd;', ctx);
    return { ctx, win, toasts, picks, defects, pinEl };
}

{
    const { ctx } = makePhotoWorld();
    assert.strictEqual(ctx.status(0), '사진 없음');
    assert.strictEqual(ctx.status(1), '사진 있음 (1장)');
    assert.strictEqual(ctx.status(3), '사진 있음 (3장)');
    assert.strictEqual(ctx.count({}), 0);
    assert.strictEqual(ctx.count({ photos: [], photoIds: [], photoUrls: [] }), 0);
    assert.strictEqual(ctx.count({ photos: [null, ''], photoIds: ['', null] }), 0, 'empty slots are none');
    assert.strictEqual(ctx.count({ photoIds: ['A_old'], photos: [null] }), 1, 'id-only pending download counts');
    assert.strictEqual(ctx.count({ photos: ['data:one', 'data:two'] }), 2, 'legacy inline photos');
    assert.strictEqual(ctx.count({ photoUrls: ['https://x/a.jpg', '', 'https://x/c.jpg'] }), 2, 'synced urls');
    assert.strictEqual(ctx.count({
        photoIds: ['id1', 'id2'],
        photos: ['data:one', null],
        photoUrls: ['https://x/a.jpg', 'https://x/b.jpg']
    }), 2, 'aligned mixed representations count unique slots');
    assert.strictEqual(ctx.count({ prevRoundPhotoIds: ['p1'], prevRoundPhotos: ['data:prev'] }, 'curr'), 0,
        'prev-only is not current-round photos');
}

{
    const { ctx } = makePhotoWorld({
        modalOpen: true,
        pinId: 'A',
        pending: ['data:pending', null]
    });
    assert.strictEqual(ctx.countSel({ id: 'A', photoIds: ['old'] }), 1, 'open modal pending wins for same mark');
    assert.strictEqual(ctx.countSel({ id: 'B', photoIds: ['B1', 'B2'] }), 2, 'other mark uses stored slots');
}

{
    const { ctx } = makePhotoWorld({ modalOpen: true, pinId: 'A' });
    const same = ctx.captureSel({ id: 'A' });
    assert.strictEqual(same.open, true);
    assert.strictEqual(same.pinId, 'A');
    const other = ctx.captureSel({ id: 'B' });
    assert.strictEqual(other.open, false);
    assert.strictEqual(other.pinId, 'B');
    assert.strictEqual(other.floorKey, 'b1_1F');
}

{
    const { ctx, picks } = makePhotoWorld();
    ctx.startAdd('B');
    assert.strictEqual(picks.length, 1);
    assert.deepStrictEqual(picks[0].slice(0, 2), ['gallery', 'curr']);
    assert.strictEqual(picks[0][2].pinId, 'B');
    assert.strictEqual(picks[0][2].open, false);
    assert.strictEqual(picks[0][2].floorKey, 'b1_1F');
}

{
    const { ctx, picks, toasts } = makePhotoWorld();
    ctx.startAdd('GONE');
    assert.strictEqual(picks.length, 0, 'missing mark must not open picker');
    assert.ok(toasts.some((t) => String(t[1]).indexOf('찾을 수 없습니다') >= 0));
    assert.strictEqual(ctx.popupRefreshed, 1);
    ctx.startAdd('');
    assert.strictEqual(picks.length, 0);
}

{
    const { ctx, picks } = makePhotoWorld({ modalOpen: true, pinId: 'A' });
    ctx.startAdd('A');
    assert.strictEqual(picks[0][2].open, true, 'same open editor uses pending-photo path');
    ctx.startAdd('B');
    assert.strictEqual(picks[1][2].open, false);
    assert.strictEqual(picks[1][2].pinId, 'B', 'other selected mark is not the open editor');
}

{
    const trigger = extractFunction('async function triggerDefectPhotoPick(');
    assert.ok(trigger.includes('photoTargetOverride || captureDefectPhotoTarget()'));
    assert.ok(trigger.indexOf('captureDefectPhotoTarget()') < trigger.indexOf('pickImageFromDevice('));
    assert.ok(/if \(file\) handleSelectedPhotoFile\(file, target, photoTarget\)/.test(trigger),
        'cancel (no file) does not attach');
}

{
    const start = extractFunction('function startMapPopupPhotoAdd(');
    assert.ok(start.includes("triggerDefectPhotoPick('gallery', 'curr', target)"));
    const bind = extractFunction('function bindMapSelPopupPhotoControls(');
    assert.ok(bind.includes('e.stopPropagation()'));
    const popup = extractFunction('function updateMapSelectedDefectPopup(');
    assert.ok(popup.includes('buildMapSelPopupPhotoRowHtml(d)'));
    assert.ok(popup.includes('buildMapSelPopupPhotoRowHtml(photoMember)'));
    assert.ok(popup.includes("e.target.closest('.map-sel-popup-photo')"), 'photo row does not open editor');
    const rowHtml = extractFunction('function buildMapSelPopupPhotoRowHtml(');
    assert.ok(rowHtml.includes('사진 추가'));
    assert.ok(rowHtml.includes('formatMapSelPopupPhotoStatus'));
}

assert.ok(html.includes('id="mapSelectedDefectPopup"'));
assert.ok(/\.map-sel-popup-photo-add[\s\S]*min-height:\s*2\.2rem/.test(css), 'touch-friendly add button');
assert.ok(app.includes('if (typeof updateMapSelectedDefectPopup === \'function\') updateMapSelectedDefectPopup();'));
assert.ok(!/fetchPhotosDocIfAllowed|collection\(/.test(extractFunction('function countDefectLocalPhotoSlots(')),
    'count must not do remote reads');

console.log('test-map-sel-popup-photo: ok');
