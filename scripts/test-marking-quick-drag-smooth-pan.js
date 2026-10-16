// 2026-10-16: 터치 한 번 눌러 바로 끌기 + 부드러운 도면 이동 정적 검사
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const must = [
  'const TOUCH_QUICK_DRAG_THRESHOLD = 14',
  'if (dist <= TOUCH_QUICK_DRAG_THRESHOLD) return;',
  "prefers-reduced-motion: reduce",
  'function stopMapAutoPanOnUserInput',
  '_panAnimTarget = { x: targetOffsetX, y: targetOffsetY, s: targetScale };',
  "panCanvasToDefectMarking(defect, Object.assign({ animate: true }, options));",
  "elements.planCanvas.addEventListener(evName, stopMapAutoPanOnUserInput",
];
let fail = 0;
for (const m of must) if (!src.includes(m)) { console.error('MISSING:', m); fail++; }
if (src.includes('pendingDragHit = null;\n                    isDragging = true;\n                    if (elements.planCanvas) elements.planCanvas.style.cursor = \'grabbing\';\n                }\n                return;')) { console.error('old touch→pan block remains'); fail++; }
if (fail) process.exit(1); console.log('test-marking-quick-drag-smooth-pan OK');
