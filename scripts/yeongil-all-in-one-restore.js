/**
 * 영일연립 ONLY — 층+도면+마킹 한 번에 복구
 * getBuildingAvailableFloors 로 1F/2F/3F가 다시 지워지는 함정 회피
 *
 * 사용 (영일연립 연 상태, 하드 새로고침 금지):
 *   1) 이 파일 전체 붙여넣기
 *   2) copy(await __yeongilAllInOne())
 *   3) 결과 JSON을 채팅에 붙여 주세요
 *   4) 층 선택에서 1F 눌러 도면·핀 확인
 */
(function () {
  const BLDG_ID = 'bldg-1789540910476';
  const FLOORS = ['1F', '2F', '3F'];
  const IDB_NAME = 'building_safety_local_images';
  const LABELS = { '1F': '지상1층', '2F': '지상2층', '3F': '지상3층' };

  function findBldg() {
    const list = (window.state && window.state.buildings) || [];
    return list.find((b) => b && b.id === BLDG_ID)
      || list.find((b) => String((b && b.siteName) || '').indexOf('영일') >= 0);
  }

  function patchTombstone(bldgId) {
    const api = window.BSA && window.BSA.drawingFloorTombstone;
    if (!api || typeof api.isDeletedDrawingFloor !== 'function') {
      return { ok: false, reason: 'no-api' };
    }
    if (api.__yeongilPatched) return { ok: true, already: true };
    const orig = api.isDeletedDrawingFloor.bind(api);
    api.isDeletedDrawingFloor = function (bldg, floorCode, sessionKeys) {
      const id = bldg && bldg.id;
      const code = String(floorCode || '');
      if (id === bldgId && FLOORS.indexOf(code) >= 0) {
        try {
          if (sessionKeys && typeof sessionKeys.delete === 'function') {
            sessionKeys.delete(id + '_' + code);
          }
        } catch (_e) {}
        return false;
      }
      return orig(bldg, floorCode, sessionKeys);
    };
    api.__yeongilPatched = true;
    return { ok: true };
  }

  function ensureFloorsOnBldg(bldg) {
    if (!bldg.floorsList) bldg.floorsList = [];
    if (!bldg.drawingFloorCodes) bldg.drawingFloorCodes = [];
    const beforeDel = (bldg.deletedDrawingFloorCodes || []).slice();
    bldg.deletedDrawingFloorCodes = beforeDel.filter((c) => FLOORS.indexOf(c) < 0);
    const added = [];
    FLOORS.forEach((fc) => {
      if (!bldg.floorsList.some((f) => f && f.floorCode === fc)) {
        bldg.floorsList.push({ floorCode: fc, floorLabel: LABELS[fc] || fc });
        added.push(fc);
      }
      if (bldg.drawingFloorCodes.indexOf(fc) < 0) bldg.drawingFloorCodes.push(fc);
    });
    // getBuildingAvailableFloors 호출 금지 — tombstone 때문에 다시 지움
    return {
      clearedTombstones: beforeDel.filter((c) => FLOORS.indexOf(c) >= 0),
      addedList: added,
      floorsListNow: bldg.floorsList.map((f) => f && f.floorCode)
    };
  }

  function idbGet(store, key) {
    return new Promise((resolve) => {
      const r = indexedDB.open(IDB_NAME);
      r.onerror = () => resolve(null);
      r.onsuccess = () => {
        const db = r.result;
        try {
          if (![...db.objectStoreNames].includes(store)) {
            db.close();
            resolve(null);
            return;
          }
          const req = db.transaction(store, 'readonly').objectStore(store).get(key);
          req.onsuccess = () => { db.close(); resolve(req.result || null); };
          req.onerror = () => { db.close(); resolve(null); };
        } catch (_e) {
          try { db.close(); } catch (_e2) {}
          resolve(null);
        }
      };
    });
  }

  function siteVaultDocId(siteKey) {
    const id = String(siteKey || 'unnamed')
      .replace(/[\\/:*?"<>|#\s]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);
    return id || 'unnamed';
  }

  function siteKey(b) {
    const explicit = String(b.siteName || '').replace(/^\s*/, '').trim();
    return siteVaultDocId(explicit || '영일연립');
  }

  function roundKey(b) {
    const y = (b && b.inspectionYear) || '2026년';
    const p = (b && b.inspectionPeriod) || '하반기';
    return siteVaultDocId(y + '_' + p);
  }

  function floorRef(db, companyId, b, floorCode) {
    return db.collection('safety_app').doc(companyId)
      .collection('sites').doc(siteKey(b))
      .collection('rounds').doc(roundKey(b))
      .collection('floors').doc(floorCode);
  }

  async function decodePack(docRef, data) {
    if (!data) return null;
    if (data.dataUrl && typeof data.dataUrl === 'string' && data.dataUrl.length > 32) {
      return data.dataUrl;
    }
    const chunkCount = Number(data.chunkCount) || 0;
    if (data.chunked && chunkCount > 0 && data.writeId) {
      const snaps = await Promise.all(
        Array.from({ length: chunkCount }, (_, i) =>
          docRef.collection('parts').doc(String(data.writeId) + '_' + i).get()
        )
      );
      if (snaps.some((s) => !s.exists)) return null;
      const joined = snaps.map((s) => (s.data() && s.data().data) || '').join('');
      return joined.length > 32 ? joined : null;
    }
    return null;
  }

  function parsePackJson(raw) {
    if (!raw) return null;
    let s = String(raw);
    if (s.indexOf('data:') === 0) {
      const comma = s.indexOf(',');
      if (comma < 0) return null;
      const meta = s.slice(0, comma);
      const body = s.slice(comma + 1);
      try {
        if (/;base64/i.test(meta)) s = decodeURIComponent(escape(atob(body)));
        else s = decodeURIComponent(body);
      } catch (_e) {
        try { s = atob(body); } catch (_e2) { return null; }
      }
    }
    try {
      const obj = JSON.parse(s);
      return obj && typeof obj === 'object' ? obj : null;
    } catch (_e) {
      return null;
    }
  }

  function markingsFromPack(obj) {
    if (!obj) return null;
    const m = obj.markings || (obj.items ? { items: obj.items } : null);
    if (!m) return null;
    const items = Array.isArray(m.items) ? m.items : (Array.isArray(m) ? m : null);
    if (!items) return null;
    return items;
  }

  async function loadDrawings(bldg) {
    if (!bldg.floorDrawings) bldg.floorDrawings = {};
    if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
    const out = {};
    for (const fc of FLOORS) {
      const key = bldg.id + '_' + fc;
      const row = { code: fc };
      const dataUrl = await idbGet('floorDrawings', key);
      row.idbHit = !!(dataUrl && typeof dataUrl === 'string' && dataUrl.length > 32);
      if (row.idbHit) {
        bldg.floorDrawings[fc] = dataUrl;
        row.from = 'idb';
      }
      try {
        const tiers = await idbGet('floorDrawingTiers', key);
        if (tiers && typeof tiers === 'object') {
          bldg.floorDrawingTiers[fc] = tiers;
          row.tiers = true;
        }
      } catch (_e) {}
      row.hasRam = !!(bldg.floorDrawings && bldg.floorDrawings[fc]);
      out[fc] = row;
    }
    return out;
  }

  async function loadMarkings(bldg) {
    const db = (typeof firebase !== 'undefined' && firebase.firestore)
      ? firebase.firestore()
      : null;
    const companyId = window.state && window.state.companyId;
    if (!db || !companyId) return { error: 'no-db-or-company', floors: {} };
    if (!window.state.defects) window.state.defects = {};
    const out = { floors: {}, applied: [] };
    for (const fc of FLOORS) {
      const info = { floor: fc };
      try {
        const ref = floorRef(db, companyId, bldg, fc);
        info.path = ref.path;
        const snap = await ref.get();
        info.packExists = snap.exists;
        if (!snap.exists) {
          out.floors[fc] = info;
          continue;
        }
        const raw = await decodePack(ref, snap.data());
        const obj = parsePackJson(raw);
        const items = markingsFromPack(obj) || [];
        info.markingsCount = items.length;
        info.sampleIds = items.slice(0, 3).map((x) => x && (x.id || x.no));
        const key = BLDG_ID + '_' + fc;
        const normalized = items.map((it, idx) => {
          if (!it || typeof it !== 'object') return it;
          const copy = Object.assign({}, it);
          if (!copy.id) copy.id = copy.defectId || (fc + '_restored_' + idx);
          return copy;
        });
        window.state.defects[key] = normalized;
        out.applied.push({ key, nextN: normalized.length });
        info.withXY = normalized.filter((d) => d && Number.isFinite(Number(d.x)) && Number.isFinite(Number(d.y))).length;
        info.mapUnregistered = normalized.filter((d) => d && d.mapUnregistered).length;
      } catch (e) {
        info.error = String(e && e.message || e);
      }
      out.floors[fc] = info;
    }
    return out;
  }

  function softSaveLocalOnly() {
    try {
      if (typeof window.saveStateToLocalStorage === 'function') {
        window.saveStateToLocalStorage();
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function tryShowFloor(bldg, fc) {
    const r = { floor: fc };
    try {
      window.state.currentBuildingId = bldg.id;
      window.state.currentBuilding = bldg;
      window.state.currentFloor = fc;
      r.setState = true;
    } catch (_e) {}
    try {
      if (typeof populateFloorSelectDropdown === 'function') {
        populateFloorSelectDropdown(bldg);
        r.dropdown = true;
      }
    } catch (_e) {}
    try {
      const sel = document.getElementById('floorSelect') || document.querySelector('select#floorSelect, select[name=floor]');
      if (sel) {
        sel.value = fc;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        r.selectChange = true;
      }
    } catch (_e) {}
    try {
      if (typeof loadFloorDrawing === 'function') {
        loadFloorDrawing(fc);
        r.loadFloorDrawing = true;
      } else if (typeof window.loadFloorDrawing === 'function') {
        window.loadFloorDrawing(fc);
        r.loadFloorDrawing = true;
      }
    } catch (e) {
      r.loadError = String(e && e.message || e);
    }
    try {
      if (typeof window.drawCanvas === 'function') window.drawCanvas({ immediate: true });
      r.drawCanvas = true;
    } catch (_e) {}
    r.hasBg = !!(window.state && window.state.bgImage);
    r.defectCount = ((window.state.defects || {})[BLDG_ID + '_' + fc] || []).length;
    r.floorsListNow = (bldg.floorsList || []).map((f) => f && f.floorCode);
    return r;
  }

  window.__yeongilAllInOne = async function __yeongilAllInOne() {
    const report = {
      at: new Date().toISOString(),
      ok: false,
      note: '동기화 안 함. getBuildingAvailableFloors 호출 안 함. 하드 새로고침 금지.'
    };
    const bldg = findBldg();
    if (!bldg) {
      report.error = '영일연립 건물 없음';
      console.log('[YEONGIL ALL]', report);
      return report;
    }
    report.buildingId = bldg.id;
    report.patch = patchTombstone(bldg.id);
    report.floorsStep = ensureFloorsOnBldg(bldg);
    report.drawings = await loadDrawings(bldg);
    // 도면 넣은 뒤 다시 층 목록 보장 (중간 코드가 지웠을 수 있음)
    report.floorsStep2 = ensureFloorsOnBldg(bldg);
    report.markings = await loadMarkings(bldg);
    report.floorsStep3 = ensureFloorsOnBldg(bldg);
    report.saved = softSaveLocalOnly();
    // 저장 후에도 층이 남았는지
    report.floorsAfterSave = (bldg.floorsList || []).map((f) => f && f.floorCode);
    report.show1F = tryShowFloor(bldg, '1F');
    // 한번 더 층 보장
    ensureFloorsOnBldg(bldg);
    report.finalFloorsList = (bldg.floorsList || []).map((f) => f && f.floorCode);
    report.finalDefects = FLOORS.map((fc) => ({
      floor: fc,
      n: ((window.state.defects || {})[BLDG_ID + '_' + fc] || []).length,
      hasRam: !!(bldg.floorDrawings && bldg.floorDrawings[fc])
    }));
    report.ok = FLOORS.every((fc) => {
      const d = report.finalDefects.find((x) => x.floor === fc);
      return d && d.hasRam && report.finalFloorsList.indexOf(fc) >= 0;
    });
    console.log('[YEONGIL ALL-IN-ONE]', report);
    if (typeof window.showToast === 'function') {
      window.showToast(
        report.ok
          ? '영일 1·2·3 복구됨. 층 목록에서 1F를 누르세요.'
          : '복구 부분 실패. 콘솔 결과를 채팅에 붙여 주세요.',
        report.ok ? 'success' : 'warning',
        8000
      );
    }
    return report;
  };

  console.log('%c[영일 ALL-IN-ONE 준비]%c\ncopy(await __yeongilAllInOne())', 'color:#4ade80;font-weight:bold', '');
})();
