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
  'if (!pendingDragArmed) {\n                if (dist <= threshold) return;\n                clearPendingDragLongPress();\n                pendingDragHit = null;\n                isDragging = true;',
  'if (!pendingDragWasSelectedBefore) {',
  'groupCycledInOpenModal = !!(groupSelectedMember && isDefectModalOpen());',
  "prefers-reduced-motion: reduce",
  'function stopMapAutoPanOnUserInput',
  '_panAnimTarget = { x: targetOffsetX, y: targetOffsetY, s: targetScale };',
  "panCanvasToDefectMarking(defect, Object.assign({ animate: true }, options));",
  "elements.planCanvas.addEventListener(evName, stopMapAutoPanOnUserInput",
];
const mustNot = [
  'pendingDragArmed = !isTouch;',
  '// PC 마우스: 클릭 한 번에 선택+수정창',
  'if (dist <= TOUCH_QUICK_DRAG_THRESHOLD) return;',
];
let fail = 0;
for (const m of must) if (!src.includes(m)) { console.error('MISSING:', m.slice(0, 90)); fail++; }
for (const m of mustNot) if (src.includes(m)) { console.error('SHOULD BE GONE:', m); fail++; }
if (fail) process.exit(1); console.log('test-marking-quick-drag-smooth-pan OK');
