/**
 * 영일 ONLY — Firestore 회사 문서의 건물 메타에서 1F/2F/3F tombstone 제거 + floorsList 고정
 * (폰 등 다른 기기가 서버 기준으로 층을 보게 함)
 * copy(await __yeongilPinServerMeta())
 */
(function () {
  const BLDG_ID = 'bldg-1789540910476';
  const FLOORS = ['1F', '2F', '3F'];
  const LABELS = { '1F': '지상1층', '2F': '지상2층', '3F': '지상3층' };

  window.__yeongilPinServerMeta = async function () {
    const report = { at: new Date().toISOString(), ok: false };
    const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
    const companyId = window.state && window.state.companyId;
    if (!db || !companyId) {
      report.error = 'no db/companyId';
      console.log(report);
      return report;
    }
    report.companyId = companyId;
    const docRef = db.collection('safety_app').doc(companyId);
    const snap = await docRef.get();
    if (!snap.exists) {
      report.error = 'company doc missing';
      console.log(report);
      return report;
    }
    const data = snap.data() || {};
    const buildings = Array.isArray(data.buildings) ? data.buildings.slice() : [];
    const idx = buildings.findIndex((b) => b && b.id === BLDG_ID);
    report.buildingIndex = idx;
    if (idx < 0) {
      report.error = 'yeongil not in server buildings';
      report.buildingIds = buildings.map((b) => b && b.id);
      console.log(report);
      return report;
    }
    const b = Object.assign({}, buildings[idx]);
    report.before = {
      deleted: (b.deletedDrawingFloorCodes || []).slice(),
      floorsList: (b.floorsList || []).map((f) => f && f.floorCode),
      drawingFloorCodes: (b.drawingFloorCodes || []).slice()
    };
    b.deletedDrawingFloorCodes = (b.deletedDrawingFloorCodes || []).filter((c) => FLOORS.indexOf(c) < 0);
    if (!Array.isArray(b.floorsList)) b.floorsList = [];
    if (!Array.isArray(b.drawingFloorCodes)) b.drawingFloorCodes = [];
    FLOORS.forEach((fc) => {
      if (!b.floorsList.some((f) => f && f.floorCode === fc)) {
        b.floorsList.push({ floorCode: fc, floorLabel: LABELS[fc] || fc });
      }
      if (b.drawingFloorCodes.indexOf(fc) < 0) b.drawingFloorCodes.push(fc);
    });
    // strip heavy local-only fields if somehow present
    delete b.floorDrawings;
    delete b.floorDrawingPdfs;
    delete b.floorDrawingTiers;
    delete b.floorDrawingSources;
    buildings[idx] = b;
    await docRef.update({
      buildings: buildings,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // also patch local state
    try {
      const local = (window.state.buildings || []).find((x) => x && x.id === BLDG_ID);
      if (local) {
        local.deletedDrawingFloorCodes = (local.deletedDrawingFloorCodes || []).filter((c) => FLOORS.indexOf(c) < 0);
        local.floorsList = b.floorsList.slice();
        local.drawingFloorCodes = b.drawingFloorCodes.slice();
      }
    } catch (_e) {}
    report.after = {
      deleted: (b.deletedDrawingFloorCodes || []).slice(),
      floorsList: (b.floorsList || []).map((f) => f && f.floorCode),
      drawingFloorCodes: (b.drawingFloorCodes || []).slice()
    };
    report.ok = true;
    console.log('[YEONGIL PIN SERVER META]', report);
    if (typeof window.showToast === 'function') {
      window.showToast('영일 층 목록을 서버에 고정했습니다. 폰에서 새로고침해 보세요.', 'success', 8000);
    }
    return report;
  };
  console.log('준비: copy(await __yeongilPinServerMeta())');
})();
