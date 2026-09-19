/** 영일 1F/2F/3F 도면을 클라우드 floorDrawings에서 RAM+IDB로 채움 */
(function () {
  const BLDG_ID = 'bldg-1789540910476';
  const FLOORS = ['1F', '2F', '3F'];
  const IDB_NAME = 'building_safety_local_images';
  function findBldg() {
    const list = (window.state && window.state.buildings) || [];
    return list.find((b) => b && b.id === BLDG_ID);
  }
  function idbSet(store, key, val) {
    return new Promise((resolve) => {
      const r = indexedDB.open(IDB_NAME);
      r.onerror = () => resolve(false);
      r.onsuccess = () => {
        const db = r.result;
        try {
          if (![...db.objectStoreNames].includes(store)) { db.close(); resolve(false); return; }
          const req = db.transaction(store, 'readwrite').objectStore(store).put(val, key);
          req.onsuccess = () => { db.close(); resolve(true); };
          req.onerror = () => { db.close(); resolve(false); };
        } catch (_e) { try { db.close(); } catch (_e2) {} resolve(false); }
      };
    });
  }
  async function downloadUrlToDataUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch ' + res.status);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  window.__yeongilFetchCloudDrawings = async function () {
    const bldg = findBldg();
    const companyId = window.state && window.state.companyId;
    const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
    const report = { ok: false, floors: {} };
    if (!bldg || !db || !companyId) {
      report.error = 'missing bldg/db/company';
      console.log(report);
      return report;
    }
    if (!bldg.floorDrawings) bldg.floorDrawings = {};
    bldg.deletedDrawingFloorCodes = (bldg.deletedDrawingFloorCodes || []).filter((c) => FLOORS.indexOf(c) < 0);
    for (const fc of FLOORS) {
      const row = { code: fc };
      try {
        const ref = db.collection('safety_app').doc(companyId).collection('floorDrawings').doc(bldg.id + '_' + fc);
        const snap = await ref.get();
        row.exists = snap.exists;
        if (!snap.exists) { report.floors[fc] = row; continue; }
        const meta = snap.data() || {};
        row.keys = Object.keys(meta);
        let url = meta.downloadURL || null;
        if (!url && meta.storagePath && firebase.storage) {
          url = await firebase.storage().ref(meta.storagePath).getDownloadURL();
          row.from = 'storagePath';
        } else if (url) row.from = 'downloadURL';
        if (!url && meta.dataUrl && String(meta.dataUrl).length > 32) {
          bldg.floorDrawings[fc] = meta.dataUrl;
          await idbSet('floorDrawings', bldg.id + '_' + fc, meta.dataUrl);
          row.hasRam = true;
          row.from = 'dataUrl';
          row.len = meta.dataUrl.length;
        } else if (url) {
          const got = await downloadUrlToDataUrl(url);
          bldg.floorDrawings[fc] = got;
          await idbSet('floorDrawings', bldg.id + '_' + fc, got);
          row.hasRam = true;
          row.len = got && got.length;
        } else {
          row.from = 'no-url';
        }
      } catch (e) {
        row.error = String(e && e.message || e);
      }
      report.floors[fc] = row;
    }
    try { if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage(); } catch (_e) {}
    report.ok = FLOORS.every((fc) => report.floors[fc] && report.floors[fc].hasRam);
    console.log('[YEONGIL CLOUD DRAWINGS]', report);
    return report;
  };
  console.log('준비: copy(await __yeongilFetchCloudDrawings())');
})();
