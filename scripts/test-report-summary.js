/**
 * 보고서 본문 요약(js/report/summary-core.js) 테스트 (node)
 */
const assert = require('assert');
const api = require('../js/report/summary-core.js');

// 균열폭 읽기: 폭/길이의 앞 숫자, 범위는 큰 값, 면적은 폭이 아니다
assert.strictEqual(api.parseSize('0.3/1.6').maxWidth, 0.3);
assert.strictEqual(api.parseSize('0.3~0.45/6.0').maxWidth, 0.45);
assert.strictEqual(api.parseSize('Cw:0.2~0.32').maxWidth, 0.32);
assert.strictEqual(api.parseSize('0.3/1.0, 0.4/2.2').maxWidth, 0.4);
assert.strictEqual(api.parseSize('0.2/0.6 -2EA, 0.15/0.6').maxWidth, 0.2);
assert.strictEqual(api.parseSize('0.2x0.5').maxWidth, null, '면적은 균열폭이 아니다');
assert.strictEqual(api.parseSize('1.0*0.4').maxWidth, null);
assert.strictEqual(api.parseSize('-').maxWidth, null);
assert.strictEqual(api.parseSize('32.5/2.0, Cw:0.2~0.32').maxWidth, 32.5, '이상값은 그대로 읽고 따로 표시한다');

// 결함 유형
assert.strictEqual(api.typeKeyOf('보(G) 누수 및 백태 (우천시 누수)'), '누수');
assert.strictEqual(api.typeKeyOf('슬래브 균열 및 백태'), '백태');
assert.strictEqual(api.typeKeyOf('슬래브 균열 및 누수흔적'), '균열');
assert.strictEqual(api.typeKeyOf('철골보(G) 뿜칠 박락 및 녹 발생'), '녹 발생');
assert.strictEqual(api.typeKeyOf('철골 보 뿜칠 박락'), '내화피복 박락');
assert.strictEqual(api.typeKeyOf('RC벽체 재료분리 및 철근노출'), '철근노출');
assert.strictEqual(api.typeKeyOf('보 뿜칠 상태양호'), '양호');

// 조사표 행: 번호/위치/조사내용/크기/구조/비구조/진행/누수/원인/비고
const row = (no, content, size, structural, opt) => {
    const o = opt || {};
    return [String(no), 'X1/Y1', content, size || '-', structural ? '○' : '-', structural ? '-' : '○',
        o.progress ? '진행中' : '-', o.leak ? '누수 中' : '-', o.cause || '-', o.remark || '-'];
};
const floors = [
    {
        floorLabel: '지하1층',
        photos: { 1: 'imgA', 4: 'imgB' },
        rows: [
            row(1, '보(G) 누수 및 백태 (우천시 누수)', '', true, { leak: true, cause: '상부 방수층 파손', remark: '사진1' }),
            row(2, '슬래브 균열', '0.3~0.45/6.0', true, { cause: '건조수축 및 재료적 특성', remark: '사진4' }),
            row(3, '슬래브 균열', '0.6/2.0', true, { cause: '건조수축 및 재료적 특성' }),
            row(4, '슬래브 망상균열', '32.5/2.0, Cw:0.2~0.32', true),
            row(5, '블록벽체 수직균열', '1.2/1.8', false, { cause: '건조수축 및 재료적 특성' }),
            row(6, '보 뿜칠 상태양호', '', true),
            row(7, '벽체 타일 마감재 파손', 'Cw:1.0', false, { cause: '시공미흡 외' }),
            row(8, '슬래브 균열', '0.2/1.0', true),
            row(9, '슬래브 균열', '0.25/1.0', true),
            row(10, '슬래브 균열', '0.1/1.0', true)
        ]
    },
    {
        floorLabel: '건축물 외부',
        rows: [
            row(1, '외벽 마감재 상태양호', '', false, { remark: '사진1' }),
            row(8, '사면 상태양호', '', false),
            row(13, '환기구 덮개 상태양호', '', false, { remark: '사진4' }),
            row(15, '주차장 포장부위 균열', '', false, { cause: '차량진동에 의한 결함', remark: '사진6' }),
            row(16, '비가림 시설 앵커볼트 상태양호', '', false)
        ]
    }
];
const defects = api.buildDefects(floors);
assert.strictEqual(defects.length, 15);
const byNo = (floorIdx, no) => defects.filter((d) => d.id === floorIdx + ':' + no)[0];

assert.strictEqual(byNo(0, 1).category, 'structure');
assert.strictEqual(byNo(0, 1).leak, true, '「누수 中」 표기를 읽는다');
assert.deepStrictEqual(byNo(0, 1).photoIds, ['imgA']);
assert.strictEqual(byNo(0, 5).category, 'nonStructure');
assert.strictEqual(byNo(0, 7).category, 'interior');
assert.strictEqual(byNo(1, 1).category, 'exterior');
assert.strictEqual(byNo(1, 8).category, 'aux');
assert.strictEqual(byNo(1, 13).category, 'public');
assert.strictEqual(byNo(1, 15).category, 'public');
assert.strictEqual(byNo(1, 16).category, 'attachment');

// 균열폭 표기와 이상값
assert.strictEqual(api.itemText(byNo(0, 2)), '지하1층 슬래브 균열 (균열폭:0.45mm)');
assert.strictEqual(byNo(0, 4).widthSuspicious, true);
assert.strictEqual(api.itemText(byNo(0, 4)), '지하1층 슬래브 망상균열', '이상값은 균열폭을 붙이지 않는다');
assert.strictEqual(api.itemText(byNo(0, 5)), '지하1층 블록벽체 수직균열', '비구조체는 균열폭을 붙이지 않는다');
assert.strictEqual(api.itemText(byNo(1, 1)), '외부 외벽 마감재 상태양호');
assert.deepStrictEqual(api.listWidthChecks(defects).map((d) => d.no), ['4']);

// 추천: 구조체 0.5mm 이상 균열은 반드시 들어간다(사진이 없어도)
const sel = api.pickDefaults(defects);
assert.ok(sel.structure.indexOf('0:3') >= 0, '0.6mm 균열은 강제 포함');
assert.ok(sel.structure.indexOf('0:1') >= 0, '누수 중 + 사진');
assert.ok(sel.structure.length <= api.MAX_ITEMS);
assert.ok(sel.structure.indexOf('0:6') < 0, '결함이 있는 분류는 상태양호로 채우지 않는다');
assert.deepStrictEqual(sel.aux, ['1:8'], '결함 없는 분류는 상태양호 한 건');
assert.strictEqual(sel.public[0], '1:15', '결함이 양호 항목보다 먼저');
assert.ok(sel.public.indexOf('1:13') >= 0, '공중이용부위는 사진 있는 양호 항목으로 채운다');
assert.deepStrictEqual(sel.load, []);

// 묶음과 표
const allSel = [].concat.apply([], Object.keys(sel).map((k) => sel[k]));
const groups = api.buildGroups(defects, allSel);
const crack = groups.filter((g) => g.key === 'structure|균열')[0];
assert.strictEqual(crack.items.length, 6);
assert.strictEqual(crack.repair.short, '표면처리 및 주입공법');
assert.strictEqual(crack.cause, '건조수축 및 재료적 특성');
assert.strictEqual(crack.location, '지하1층');

const sumRows = api.buildSummaryRows(groups);
assert.ok(sumRows.some((r) => r.cells[1] === '구조체' && r.cells[2] === '균열' && /주입공법에 의한 균열보수/.test(r.cells[3])));
assert.ok(sumRows.some((r) => r.cells[1] === '마감재' && /철거 후 재시공/.test(r.cells[3])));

const partRows = api.buildPartRows(groups);
assert.ok(partRows.some((r) => r.cells[0] === '구조체' && r.cells[1] === '누수' && r.cells[4] === '상부 방수층 파손'));
const causeRows = api.buildCauseRows(groups);
assert.strictEqual(causeRows.length, groups.length);

// 짝이 정해지지 않은 유형은 보수방안을 지어내지 않는다
assert.strictEqual(api.repairOf('structure', '단면결손').short, '');
assert.strictEqual(api.repairOf('structure', '배부름').short, '');

// 의견 초안
const op = api.buildOpinion('structure', groups, { buildingName: '○○교회', roundLabel: '2026년 하반기' });
assert.ok(/^․ ○○교회에 대하여 실시한 2026년 하반기 점검 중 구조체에 대한 점검 결과는 다음과 같다\./.test(op));
assert.ok(/누수\)는 상부 방수층 파손 등에 의한 결함으로 판단됨\./.test(op), '받침 없는 말 뒤는 「는」');
assert.ok(/슬래브 균열은 건조수축 및 재료적 특성 등에 의한 결함으로 판단됨\./.test(op), '받침 있는 말 뒤는 「은」');
const opAux = api.buildOpinion('aux', groups, {});
assert.ok(/부대시설 상태는 전반적으로 양호한 것으로 조사됨/.test(opAux));

// ── 전회차 보고서와 견주기 ──
assert.strictEqual(api.prevCategoryOf('구조체 상태'), 'structure');
assert.strictEqual(api.prevCategoryOf('비구조체 상태'), 'nonStructure');
assert.strictEqual(api.prevCategoryOf('구조변경및하중조사'), 'load');
assert.strictEqual(api.prevCategoryOf('기타시설(내장재 및 천장재)'), 'interior');
assert.strictEqual(api.prevCategoryOf('기존 결함발생 부위 보수상태 조사 결과'), 'repair');
assert.strictEqual(api.prevCategoryOf('유지관리 방안'), null);

const cell = (r, c, lines) => ({ row: r, col: c, lines: lines });
const prev = api.extractPrev([
    { cells: [cell(0, 0, ['구  분']), cell(0, 1, ['주요 점검결과']),
        cell(1, 0, ['구조체 상태']), cell(1, 1, ['1. 지하1층 상부 보 누수 및 백태 (우천시 누수)', '2. 지상2층 상부 보 수직·경사균열']),
        cell(2, 0, ['공중 이용 부위']), cell(2, 1, ['1. 점검로 상태양호', '2. D.A 진입구 안전난간 시건장치 미흡']),
        cell(3, 0, ['기존 결함발생 부위 보수상태 조사 결과']), cell(3, 1, ['1. 기 결함사항에 대한 보수 미실시'])] },
    { cells: [cell(0, 0, ['구  분']), cell(0, 1, ['주요 상태조사 결과']), cell(0, 2, ['책임기술자 의견, 분석 및 평가']),
        cell(1, 0, ['구조체 상태']), cell(1, 1, ['1. 다른 문구']), cell(1, 2, ['- 구조체 의견 한 줄']),
        cell(2, 0, ['부대시설']), cell(2, 1, ['1. 사면 상태양호']), cell(2, 2, ['- 사면 상태는 양호'])] },
    { cells: [cell(0, 0, ['구분']), cell(0, 1, ['손상유형'])] }
]);
assert.deepStrictEqual(prev.items.structure, ['지하1층 상부 보 누수 및 백태 (우천시 누수)', '지상2층 상부 보 수직·경사균열'], '결과표가 먼저');
assert.deepStrictEqual(prev.items.aux, ['사면 상태양호'], '결과표에 없는 분류는 결과분석 표에서');
assert.strictEqual(prev.opinion.structure, '- 구조체 의견 한 줄');
assert.strictEqual(prev.repairNote, '기 결함사항에 대한 보수 미실시');

assert.ok(api.similarity('지하1층 상부 보 누수 및 백태 (우천시 누수)', '지하층 식당 보(G) 누수 및 백태 (우천시 누수)') >= 0.55);
assert.ok(api.similarity('도로포장 부위 균열', '외부 주차장 포장부위 균열') >= 0.55);
assert.ok(api.similarity('D.A 진입구 안전난간 시건장치 미흡', '지상4층 난간 높이 및 고정 상태양호') < 0.55);
assert.strictEqual(api.similarity('지상3층 상부 슬래브 균열 및 백태', '지상1층 슬래브 균열 및 백태 (균열폭:0.3mm)'), 0, '층이 다르면 다른 결함');
assert.ok(api.similarity('지상3층 상부 슬래브 균열 및 백태', '지상3층 슬래브 균열 및 백태 (균열폭:0.3mm)') >= 0.55);

const cmp = api.compareLines(
    ['점검로 상태양호', 'D.A 진입구 안전난간 시건장치 미흡', '도로포장 부위 균열'],
    ['외부 주차장 포장부위 균열', '점검로  상태양호', '지상4층 난간 높이 및 고정 상태양호']
);
assert.deepStrictEqual(cmp.cur.map((c) => c.kind), ['changed', 'same', 'new'], '띄어쓰기 차이는 같은 것으로');
assert.deepStrictEqual(cmp.prev.map((c) => c.kind), ['same', 'missing', 'changed']);
assert.strictEqual(cmp.prev[2].curIdx, 0);

const found = api.findDefectForPrev('지하1층 상부 슬래브 균열', defects, 'structure', []);
assert.ok(found && found.category === 'structure' && /슬래브 균열/.test(found.content));
assert.strictEqual(api.findDefectForPrev('D.A 진입구 안전난간 시건장치 미흡', defects, 'public', []), null, '금회 조사표에 없는 결함');

// ── 작성안 B (중요도·원인·보수방안을 따로 판단) ──
const alt = require('../js/report/summary-alt.js');
const floorsB = [{
    floorLabel: '지상2층',
    rows: [
        row(1, '철골 보 웨브 단면결손', '0.5/0.15', true, { cause: '설비 시공시 천공 추정' }),
        row(2, '보(G) 수직·경사균열', '0.3/0.4', true, { cause: '건조수축 및 재료적 특성' }),
        row(3, '슬래브 균열', '0.2/1.5', true, { cause: '건조수축 및 재료적 특성', remark: '사진1' }),
        row(4, '슬래브 균열', '0.35/2.0', true, { cause: '건조수축 및 재료적 특성' }),
        row(5, '스탠드 슬래브 철근노출 및 공극', '0.1x0.2', true, { cause: '건조수축' }),
        row(6, '방송실 하부 벽체 수평·경사균열(보수부위 재균열)', '1.2/2.5', false, { cause: '건조수축 및 재료적 특성' }),
        row(7, '기둥 수평균열', '0.25/1.8', true, { cause: '건조수축 및 재료적 특성' }),
        row(8, '슬래브 망상균열', 'Cw:0.2', true),
        row(9, '천장 마감재 오염', '', false, { cause: '상부 배관 누수 추정' }),
        row(10, '보 뿜칠 상태양호', '', true)
    ]
}];
const dB = api.buildDefects(floorsB);
const nB = (no) => dB.filter((d) => d.no === String(no))[0];

assert.strictEqual(alt.importanceOf(nB(1)).grade, '상', '구조부재 단면결손');
assert.strictEqual(alt.importanceOf(nB(2)).grade, '상', '보 경사균열');
assert.strictEqual(alt.importanceOf(nB(3)).grade, '하', '0.3mm 미만 슬래브 균열');
assert.strictEqual(alt.importanceOf(nB(4)).grade, '중', '0.3mm 이상 슬래브 균열');
assert.strictEqual(alt.importanceOf(nB(5)).grade, '상', '철근노출');
assert.strictEqual(alt.importanceOf(nB(6)).grade, '중', '비구조 1.0mm 이상 — 「보수부위」를 보로 읽지 않는다');
assert.strictEqual(alt.importanceOf(nB(8)).grade, '하', '망상균열');
assert.strictEqual(alt.importanceOf(nB(10)).grade, '-', '상태양호는 등급 없음');

assert.strictEqual(alt.typeOf(nB(2)), '균열(보)');
assert.strictEqual(alt.typeOf(nB(7)), '균열(기둥)');
assert.strictEqual(alt.typeOf(nB(3)), '균열(슬래브·벽체)');
assert.strictEqual(alt.typeOf(nB(6)), '균열', '비구조 균열은 나누지 않는다');

assert.ok(/에폭시 주입/.test(alt.repairOf(nB(4))), '0.3mm 이상은 주입');
assert.ok(/표면처리/.test(alt.repairOf(nB(3))), '0.3mm 미만은 표면처리');
assert.ok(/충전/.test(alt.repairOf(nB(6))), '비구조 0.3mm 이상은 충전공법');
assert.ok(/보강/.test(alt.repairOf(nB(1))), '단면결손은 보강 대상');

assert.ok(/건조수축으로 생기지 않는다/.test(alt.reviewCause(nB(5))), '철근노출 원인이 건조수축');
assert.ok(/전단/.test(alt.reviewCause(nB(2))), '보 경사균열을 건조수축으로만 적음');
assert.strictEqual(alt.reviewCause(nB(3)), '', '슬래브 균열의 건조수축은 문제 없음');
assert.strictEqual(alt.listCauseReviews(dB).length, 2);

assert.strictEqual(alt.itemText(nB(6)), '지상2층 방송실 하부 벽체 수평·경사균열(보수부위 재균열) (균열폭:1.2mm)', 'B안은 비구조 균열도 폭을 적는다');

const selB = alt.pickDefaults(dB);
assert.strictEqual(selB.structure[0], '0:1', '가장 중요한 것이 먼저');
assert.strictEqual(selB.structure.length, api.MAX_ITEMS);
assert.ok(selB.structure.indexOf('0:3') < 0, '사진이 있어도 경미한 균열은 밀린다');

const gB = alt.applyToGroups(api.buildGroups(dB, [].concat.apply([], Object.keys(selB).map((k) => selB[k])), alt.typeOf));
const slab = gB.filter((g) => g.key === 'structure|균열(슬래브·벽체)')[0];
assert.strictEqual(slab.items.length, 3);
assert.strictEqual(slab.rep.no, '4', '대표는 묶음에서 가장 중요한 항목');
assert.ok(/금회 최대 0.35mm/.test(slab.repair.short));
const prio = alt.buildPriorityRows(gB);
assert.strictEqual(prio[0].cells[1], '상');
assert.ok(/단면결손/.test(prio[0].cells[3]));
assert.ok(/\[중요도 상\]/.test(alt.buildOpinion('structure', gB, {})));

// A안은 B안 추가 뒤에도 그대로다(묶는 기준을 주지 않으면 유형으로만 묶는다)
const gA = api.buildGroups(dB, []);
assert.ok(gA.some((g) => g.key === 'structure|균열' && g.items.length === 5));
assert.strictEqual(gA.filter((g) => g.key === 'structure|균열')[0].repair.short, '표면처리 및 주입공법');

console.log('report-summary ok');
