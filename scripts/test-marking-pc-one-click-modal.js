// 2026-10-16 「pc에서는 원클릭으로 결함 수정창 까지 켜도 됨」 정적 검사
// - 마우스: 움직이지 않은 짧은 클릭(pointerup 기준) 한 번에 선택+수정창
// - 터치·펜: 한 번 탭 선택, 다시 탭 수정창 그대로 / 이동(0.3초 꾹)·숨긴 마킹 규칙 그대로
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const endFn = src.slice(src.indexOf('function handleDragEnd('), src.indexOf('function handleDragEnd(') + 12000);
const tapPart = endFn.slice(endFn.indexOf('if (pendingDragHit && !isDraggingPin) {'));
// 마우스만(펜·터치 제외) 원클릭
assert.ok(src.includes("mapLastPointerType = e.pointerType || 'mouse';"), 'pointerdown에서 포인터 종류 기억');
assert.ok(src.includes("const pcMouseOneClick = !endedFromTouch && mapLastPointerType === 'mouse';"), '마우스일 때만');
// 짧은·안 움직인 클릭 판정이 원클릭보다 먼저(끌기·길게 누름은 아무것도 안 함)
const iGuard = tapPart.indexOf('if (holdArmed || tapMoved > tapThreshold || tapMs > MARKING_TAP_MAX_MS || !d?.id) {');
const iOne = tapPart.indexOf('const pcMouseOneClick');
const iSelOnly = tapPart.indexOf('if (!pendingDragWasSelectedBefore && !pcMouseOneClick) {');
const iOpen = tapPart.indexOf('openAddDefectModal(d.x, d.y');
assert.ok(iGuard > 0 && iOne > iGuard && iSelOnly > iOne && iOpen > iSelOnly, '순서: 클릭 판정 → 원클릭 여부 → 선택만(터치·펜) → 수정창');
// Ctrl 토글은 원클릭보다 먼저 빠져나감(수정창 안 염)
const iAdd = tapPart.indexOf('if (wasAdditive) {\n                pendingDragOpenedModal = false;');
assert.ok(iAdd > 0 && iAdd < iSelOnly, 'Ctrl 클릭은 선택 토글만');
// 이동 규칙은 그대로: 이미 선택된 마킹만 0.3초 꾹 누른 뒤 이동
assert.ok(src.includes('if (pendingDragHit.wasSelectedBefore) {\n                pendingDragLongPressTimer = setTimeout('));
// 도면 끌기 중에는 열리지 않음: 원클릭 코드는 handleDragStart(누를 때)에 없음
const startFn = src.slice(src.indexOf('function handleDragStart('), src.indexOf('function handleDragMove('));
assert.ok(!/pcMouseOneClick|openAddDefectModal/.test(startFn), '누를 때 수정창 안 염');
console.log('test-marking-pc-one-click-modal OK');

// 2026-10-16 「pc는 드래그도 바로 해도됨」: 마우스 왼쪽은 선택·0.3초 대기 없이 바로 끌어 이동
{
    const hitBranch = startFn.slice(startFn.indexOf('pendingDragHit = { hitInfo, imgX, imgY'), startFn.indexOf('// 도면 빈곳 터치/클릭'));
    assert.ok(/if \(!isTouch && mapLastPointerType === 'mouse' && hitInfo\.defect && hitInfo\.defect\.id\) \{\s*clearPendingDragLongPress\(\);\s*pendingDragArmed = true;\s*pendingDragHit\.pcMouseInstantDrag = true;/.test(hitBranch), '마우스는 누르자마자 이동 준비');
    // 즉시 끌기 대기는 꾹 누름으로 치지 않음 → 안 움직인 짧은 클릭은 수정창
    assert.ok(tapPart.includes('const holdArmed = pendingDragArmedAtEnd && !tapHit.pcMouseInstantDrag;'));
    // 선택 안 된 마킹을 끌면 그 마킹만 옮김(다른 선택 묶음 안 끌림)
    assert.ok(src.includes('if (pendingDragHit.pcMouseInstantDrag && hitDefect && hitDefect.id && !selectedDefectIds.has(hitDefect.id)) {'));
    // 가운데 휠 드래그는 맨 앞에서 도면 이동(마킹 판정 전)
    const iForce = startFn.indexOf('if (forcePan) {');
    assert.ok(iForce > 0 && iForce < startFn.indexOf('findHitPinPart(imgX, imgY)') && /if \(forcePan\) \{[\s\S]{0,400}isDragging = true;[\s\S]{0,200}pendingDragHit = null;/.test(startFn), '휠 드래그 = 도면 이동');
    assert.ok(/if \(e\.button === 1\) \{\s*e\.preventDefault\(\);\s*handleDragStart\(e\.clientX, e\.clientY, false, true\);/.test(src), '휠 버튼 → forcePan');
    console.log('test-marking-pc-one-click-modal instant-drag OK');
}
