/**
 * 영일 ONLY — 복구 후 tombstone 해제 + 영일 층을 dirty로 올려 서버에 최신 고정
 * copy(await __yeongilRestoreAndPinLatest())
 */
(function () {
  const BLDG_ID = 'bldg-1789540910476';
  const FLOORS = ['1F', '2F', '3F'];
  async function loadAllInOne() {
    if (typeof window.__yeongilAllInOne === 'function') return;
    const u = 'https://raw.githubusercontent.com/dongil2010/building-safety-app/main/scripts/yeongil-all-in-one-restore.js';
    const t = await (await fetch(u)).text();
    (0, eval)(String(t).replace(/^\uFEFF/, ''));
  }
  function clearTombstones(bldg) {
    bldg.deletedDrawingFloorCodes = (bldg.deletedDrawingFloorCodes || []).filter((c) => FLOORS.indexOf(c) < 0);
    try {
      const api = window.BSA && window.BSA.drawingFloorTombstone;
      if (api && typeof api.forgetDeletedDrawingFloor === 'function') {
        FLOORS.forEach((fc) => { try { api.forgetDeletedDrawingFloor(bldg, fc, new Set()); } catch (_e) {} });
      }
    } catch (_e) {}
    // session patch (same as ALL-IN-ONE)
    try {
      const api = window.BSA && window.BSA.drawingFloorTombstone;
      if (api && typeof api.isDeletedDrawingFloor === 'function' && !api.__yeongilPatched) {
        const orig = api.isDeletedDrawingFloor.bind(api);
        api.isDeletedDrawingFloor = function (b, code, sessionKeys) {
          if (b && b.id === BLDG_ID && FLOORS.indexOf(String(code || '')) >= 0) {
            try { if (sessionKeys && sessionKeys.delete) sessionKeys.delete(b.id + '_' + code); } catch (_e) {}
            return false;
          }
          return orig(b, code, sessionKeys);
        };
        api.__yeongilPatched = true;
      }
    } catch (_e) {}
  }
  function markDirty(bldg) {
    const keys = FLOORS.map((fc) => bldg.id + '_' + fc);
    const out = { marked: [], methods: [] };
    try {
      if (typeof window.markFloorKeyDirty === 'function') {
        keys.forEach((k) => window.markFloorKeyDirty(k));
        out.methods.push('markFloorKeyDirty');
        out.marked = keys.slice();
      }
    } catch (_e) {}
    try {
      if (window._dirtyFloorKeys && typeof window._dirtyFloorKeys.add === 'function') {
        keys.forEach((k) => window._dirtyFloorKeys.add(k));
        out.methods.push('_dirtyFloorKeys');
      }
    } catch (_e) {}
    return out;
  }
  async function forceSync() {
    const tried = [];
    for (const name of ['scheduleSyncToFirebase', 'syncStateToFirebase', 'flushPendingSync', 'runSyncNow']) {
      try {
        if (typeof window[name] === 'function') {
          tried.push(name);
          const r = window[name]();
          if (r && typeof r.then === 'function') await r;
        }
      } catch (e) {
        tried.push(name + ':err:' + (e && e.message));
      }
    }
    return tried;
  }
  window.__yeongilRestoreAndPinLatest = async function () {
    await loadAllInOne();
    const restore = await window.__yeongilAllInOne();
    const list = (window.state && window.state.buildings) || [];
    const bldg = list.find((b) => b && b.id === BLDG_ID);
    const report = { at: new Date().toISOString(), restoreOk: !!(restore && restore.ok), restore, pin: {} };
    if (!bldg) {
      report.error = 'building missing after restore';
      console.log('[YEONGIL PIN]', report);
      return report;
    }
    clearTombstones(bldg);
    report.pin.tombstonesCleared = (bldg.deletedDrawingFloorCodes || []).slice();
    report.pin.dirty = markDirty(bldg);
    try {
      if (typeof window.saveStateToLocalStorage === 'function') window.saveStateToLocalStorage();
      report.pin.savedLocal = true;
    } catch (_e) { report.pin.savedLocal = false; }
    report.pin.syncTried = await forceSync();
    // wait a bit for sync
    await new Promise((r) => setTimeout(r, 2500));
    report.pin.floorsList = (bldg.floorsList || []).map((f) => f && f.floorCode);
    report.pin.defects = FLOORS.map((fc) => ({
      floor: fc,
      n: ((window.state.defects || {})[BLDG_ID + '_' + fc] || []).length,
      hasRam: !!(bldg.floorDrawings && bldg.floorDrawings[fc])
    }));
    report.ok = report.restoreOk && report.pin.floorsList.indexOf('1F') >= 0;
    console.log('[YEONGIL RESTORE+PIN]', report);
    if (typeof window.showToast === 'function') {
      window.showToast(report.ok ? '영일 복구+최신고정 시도 완료' : '영일 복구/고정 부분 실패', report.ok ? 'success' : 'warning', 8000);
    }
    return report;
  };
  console.log('%c[영일 restore+pin 준비]%c\ncopy(await __yeongilRestoreAndPinLatest())', 'color:#4ade80;font-weight:bold', '');
})();
