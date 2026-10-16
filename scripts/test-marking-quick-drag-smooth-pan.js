// 2026-10-16: 마킹 선택→재클릭 수정창 / 선택된 마킹 0.3초 꾹 눌러 이동 / 부드러운 도면 이동 정적 검사
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const must = [
  'const MARKING_HOLD_TO_DRAG_MS = 300;',
  'pendingDragArmed = false;\n            if (hitInfo.defect && hitInfo.defect.id) {',
  'pendingDragHit.wasSelectedBefore = wasInSelection || groupCycledInOpenModal;',
  'if (pendingDragHit.wasSelectedBefore) {\n                pendingDragLongPressTimer = setTimeout(',
  '}, MARKING_HOLD_TO_DRAG_MS);',
  'navigator.vibrate(20)',
  'if (!hd || !selectedDefectIds.has(hd.id)) return;',
  'if (!pendingDragArmed) {\n                if (dist <= threshold) return;\n                clearPendingDragLongPress();',
  'if (!pendingDragWasSelectedBefore) {',
  'const MARKING_TAP_MAX_MS = 500;',
  'if (holdArmed || tapMoved > tapThreshold || tapMs > MARKING_TAP_MAX_MS || !d?.id) {',
  "if (pendingDragHit && 'groupCyclePrev' in pendingDragHit) window._groupBoxCycle = pendingDragHit.groupCyclePrev;",
  '// 선택 확정',
  'groupCycledInOpenModal = !!(groupSelectedMember && isDefectModalOpen());',
  "prefers-reduced-motion: reduce",
  'function stopMapAutoPanOnUserInput',
  '_panAnimTarget = { x: targetOffsetX, y: targetOffsetY, s: targetScale };',
  "panCanvasToDefectMarking(defect, Object.assign({ animate: true }, options));",
  "elements.planCanvas.addEventListener(evName, stopMapAutoPanOnUserInput",
];
const mustNot = [
  // 누르는 순간(handleDragStart) 선택을 바꾸면 안 됨
  'if (!wasInSelection) selectedDefectIds.add(id);',
  '} else if (!wasInSelection || selectedDefectIds.size <= 1) {\n                    selectedDefectIds = new Set([id]);',
  'pendingDragArmed = !isTouch;',
  '// PC 마우스: 클릭 한 번에 선택+수정창',
  'if (dist <= TOUCH_QUICK_DRAG_THRESHOLD) return;',
];
let fail = 0;
for (const m of must) if (!src.includes(m)) { console.error('MISSING:', m.slice(0, 90)); fail++; }
for (const m of mustNot) if (src.includes(m)) { console.error('SHOULD BE GONE:', m); fail++; }
const startFn = src.slice(src.indexOf('function handleDragStart('), src.indexOf('function handleDragMove('));
const hitBranch = startFn.slice(startFn.indexOf('pendingDragHit = { hitInfo, imgX, imgY'), startFn.indexOf('// 도면 빈곳 터치/클릭'));
if (/selectedDefectIds(\.add|\.delete|\s*=\s*new Set)/.test(hitBranch)) { console.error('selection changed on pointerdown'); fail++; }
if (fail) process.exit(1); console.log('test-marking-quick-drag-smooth-pan OK');
