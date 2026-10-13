// SafetyMan.exe 점수 결합 로직 (src/lib/safetymanExe.ts 를 그대로 JS로 변환). 실행: node scoring-exe.js
function sugenoLambda(ws) {
  let bestL = -1;
  let bestE = Infinity;
  for (let i = 0; i <= 6e3; i++) {
    const l = -1 + i * 1e-3;
    const e = Math.abs(lambdaMeasure(ws, l) - 1);
    if (e < bestE) {
      bestE = e;
      bestL = l;
    }
  }
  return bestL;
}
function lambdaMeasure(ws, l) {
  if (Math.abs(l) < 1e-12) return ws.reduce((s, w) => s + w, 0);
  let p = 1;
  for (const w of ws) p *= 1 + l * w;
  return (p - 1) / l;
}
function choquet(values, weights) {
  const pairs = values.map((v, i) => {
    var _a;
    return { v, w: (_a = weights[i]) != null ? _a : 0 };
  }).filter((p) => p.v >= 1e-5 && p.w > 0);
  if (!pairs.length) return 0;
  const l = sugenoLambda(pairs.map((p) => p.w));
  pairs.sort((a, b) => a.v - b.v);
  let r = pairs[0].v;
  for (let i = 1; i < pairs.length; i++) {
    const tail = pairs.slice(i).map((p) => p.w);
    r += (pairs[i].v - pairs[i - 1].v) * lambdaMeasure(tail, l);
  }
  return r;
}
const RC_MEMBER_DENSITY = {
  \uAE30\uB465: 0.9,
  // +0x438
  \uB0B4\uB825\uBCBD: 0.9,
  // +0x440
  \uD070\uBCF4: 0.7,
  // +0x458
  \uC791\uC740\uBCF4: 0.5,
  // +0x460
  \uC2AC\uB798\uBE0C: 0.3
  // +0x450
};
const WALL_MEMBER_DENSITY = {
  \uB0B4\uB825\uBCBD: 0.9,
  \uC2AC\uB798\uBE0C: 0.5
};
const FLAT_MEMBER_DENSITY = {
  \uAE30\uB465: 0.9,
  \uC2AC\uB798\uBE0C: 0.9
};
function memberDensity(member, material, frame) {
  var _a, _b;
  if (frame === "\uBCBD\uC2DD") return (_a = WALL_MEMBER_DENSITY[member]) != null ? _a : 0;
  if (frame === "\uBB34\uB7C9\uD310") return (_b = FLAT_MEMBER_DENSITY[member]) != null ? _b : 0;
  if (material === "STEEL" && member === "\uB0B4\uB825\uBCBD") return 0;
  return RC_MEMBER_DENSITY[member];
}
const STEEL_ITEM_DENSITY = {
  \uAC15\uC7AC\uADDC\uACA9: 0.5,
  \uC6A9\uC811\uC811\uD569\uC0C1\uD0DC: 0.7,
  \uBCFC\uD2B8\uC811\uD569\uC0C1\uD0DC: 0.7,
  \uAC15\uC7AC\uBD80\uC2DD\uB3C4: 0.9,
  \uB0B4\uD654\uD53C\uBCF5: 0.3
};
const STEEL_JOINT_CORROSION_DENSITY = 0.7;
function steelMemberScore(items) {
  const order = ["\uAC15\uC7AC\uADDC\uACA9", "\uC6A9\uC811\uC811\uD569\uC0C1\uD0DC", "\uBCFC\uD2B8\uC811\uD569\uC0C1\uD0DC", "\uAC15\uC7AC\uBD80\uC2DD\uB3C4", "\uB0B4\uD654\uD53C\uBCF5"];
  const vals = order.map((k) => {
    var _a;
    const v = (_a = items[k]) != null ? _a : 0;
    if (k === "\uBCFC\uD2B8\uC811\uD569\uC0C1\uD0DC" && !(v >= 1e-5)) return 1;
    return v;
  });
  return choquet(vals, order.map((k) => STEEL_ITEM_DENSITY[k]));
}
function steelCombinedMember(member, material) {
  if (material === "SRC") return member === "\uD070\uBCF4" || member === "\uC791\uC740\uBCF4";
  if (material === "STEEL") return member === "\uAE30\uB465" || member === "\uD070\uBCF4" || member === "\uC791\uC740\uBCF4";
  return false;
}
function floorPositionDensity(sampleFloor, floorsAbove, floorsBelow) {
  const total = floorsAbove + floorsBelow;
  if (total <= 0) return 0.9;
  const r = (sampleFloor < 0 ? floorsAbove - sampleFloor : floorsAbove - sampleFloor + 1) / total;
  if (r < 0.2) return 0.1;
  if (r < 0.4) return 0.3;
  if (r < 0.6) return 0.5;
  if (r < 0.8) return 0.7;
  return 0.9;
}
const OVERALL_DENSITY = { safety: 0.9, status: 0.7, disp: 0.7 };
function overallScore(safety, status, disp) {
  return choquet(
    [safety != null ? safety : 0, status, disp],
    [OVERALL_DENSITY.safety, OVERALL_DENSITY.status, OVERALL_DENSITY.disp]
  );
}
const RC_ITEM_ORDER = [
  "\uCF58\uD06C\uB9AC\uD2B8\uAC15\uB3C4",
  "\uADE0\uC5F4",
  "\uCF58\uD06C\uB9AC\uD2B8\uC911\uC131\uD654",
  "\uC5FC\uD654\uBB3C",
  "\uCCA0\uADFC\uBD80\uC2DD",
  "\uD45C\uBA74\uB178\uD6C4"
];
function itemGradeIndex(score) {
  if (score < 2) return 0;
  if (score < 4) return 1;
  if (score < 6) return 2;
  if (score < 8) return 3;
  return 4;
}
const RULE = [
  [[1, 1, 1, 1, 1, 0.5], [0.06, 0, 0, 0, 0, 0.06], [0.06, 0, 0, 0, 0, 0.06], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
  [[1, 0, 1, 1, 0, 0.5], [0.06, 1, 0, 0, 1, 0.06], [0.06, 0, 0, 0, 0, 0.06], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
  [[0.75, 0, 1, 0.75, 0, 0.5], [0.25, 0, 0, 1, 0, 0.25], [0.25, 1, 0, 0.25, 1, 0.25], [0.25, 0, 0, 0, 0, 0.25], [0.25, 0, 0, 0, 0, 0.06]],
  [[0.75, 0, 0.75, 0.25, 0, 0.5], [0.5, 0, 1, 0.75, 0, 0.5], [0.5, 0, 0.5, 1, 0, 0.25], [0.5, 1, 0.25, 0.75, 1, 0.25], [0.5, 0, 0, 0, 0, 0.06]],
  [[0.75, 0, 0.5, 0, 0, 0.5], [0.5, 0, 0.75, 0.25, 0, 0.5], [0.5, 0, 1, 0.75, 0, 0.5], [0.5, 0, 0.5, 1, 0, 0.5], [0.5, 1, 0, 0.75, 1, 0.06]]
];
function rcMemberScore(itemScores) {
  var _a;
  const mu = [0, 0, 0, 0, 0];
  for (let c = 0; c < 6; c++) {
    const s = (_a = itemScores[c]) != null ? _a : 0;
    if (!(s >= 1e-5)) continue;
    const g = itemGradeIndex(s);
    for (let k = 0; k < 5; k++) mu[k] = Math.max(mu[k], RULE[g][k][c]);
  }
  let result = 0;
  for (let k = 0; k < 5; k++) {
    const cand = mu[k] >= 0.75 ? 2 * k + 5 - 4 * mu[k] : mu[k];
    if (cand > result) result = cand;
  }
  return result;
}
const CRACK_AREA_OVER_FACTOR = 1.1;
function crackAreaFactor(under, over) {
  const t = under + over;
  if (t <= 0) return 1;
  return (over * CRACK_AREA_OVER_FACTOR + under) / t;
}
{
  CRACK_AREA_OVER_FACTOR,
  OVERALL_DENSITY,
  RC_ITEM_ORDER,
  STEEL_ITEM_DENSITY,
  STEEL_JOINT_CORROSION_DENSITY,
  choquet,
  crackAreaFactor,
  floorPositionDensity,
  itemGradeIndex,
  memberDensity,
  overallScore,
  rcMemberScore,
  steelCombinedMember,
  steelMemberScore
};

// ---- tests (node scoring-exe.js) ----
const W = [0.9, 0.9, 0.7, 0.5, 0.3] // 기둥,내력벽,큰보,작은보,슬래브
const fw = (f, a, b) => floorPositionDensity(f, a, b)
const r2 = (x) => Math.round(x * 100) / 100
const cases = []
const eq = (name, got, want) => cases.push([name, r2(got), want, r2(got) === want])
// Sample2 계열 (20F/B1)
const s2 = [[-1, [1, 3, 3, 3, 1]], [4, [1, 3, 5, 3, 5]], [12, [1, 1, 7, 3, 5]], [20, [1, 3, 7, 1, 5]]]
const s2f = s2.map(([f, v]) => [f, choquet(v, W)])
eq('S2 -1F', s2f[0][1], 2.97); eq('S2 4F', s2f[1][1], 4.56); eq('S2 12F', s2f[2][1], 5.77); eq('S2 20F', s2f[3][1], 5.94)
const s2st = choquet(s2f.map((x) => x[1]), s2f.map((x) => fw(x[0], 20, 1)))
eq('S2 상태', s2st, 5.18); eq('S2 종합', overallScore(null, s2st, 1), 3.92)
// light (Sample2.xlsx)
const l = [[-1, [1, 1, 1, 1, 1]], [4, [1, 1, 1, 1, 1]], [12, [1, 1, 1, 1, 3]], [20, [1, 1, 1, 1, 1]]].map(([f, v]) => [f, choquet(v, W)])
eq('light 12F', l[2][1], 1.6)
const lst = choquet(l.map((x) => x[1]), l.map((x) => fw(x[0], 20, 1)))
eq('light 상태', lst, 1.3); eq('light 종합', overallScore(null, lst, 1), 1.21)
// 은파 2026 (4F/B1)
const e1 = choquet([1, 5, 3, 3, 3], W), e3 = choquet([1, 3, 1.6, 3, 1], W)
eq('은파 -1F', e1, 4.78); eq('은파 3F', e3, 2.92)
const est = choquet([e1, e3], [fw(-1, 4, 1), fw(3, 4, 1)])
eq('은파 상태', est, 4.59); eq('은파 종합(disp 3)', overallScore(null, est, 3), 4.12)
// 규칙표: 균열 C → 5, 균열 B + 강도 A → 3, 중성화 D → 3
eq('rule 균열C', rcMemberScore([1, 5.5, 0, 0, 0, 1.5]), 5)
eq('rule 중성화D', rcMemberScore([1, 1, 7, 0, 0, 1]), 3)
eq('steel 큰보 (볼트1, 내화3)', steelMemberScore({ 볼트접합상태: 1, 내화피복: 3 }), 1.6)
eq('steel 볼트 미조사=1', steelMemberScore({ 내화피복: 3 }), 1.6)
eq('은파 3F 작은보 = max(RC 중성화D→3, steel)', Math.max(rcMemberScore([1, 1.57, 7, 0, 0, 1]), steelMemberScore({ 볼트접합상태: 1, 내화피복: 2 })), 3)
eq('crack ×1.1 area', 5 * crackAreaFactor(1, 1), 5.25)
console.table(cases.map(([n, g, w, ok]) => ({ case: n, got: g, want: w, ok })))
if (cases.some((c) => !c[3])) process.exit(1)
