/**
 * 외부 도면 결함 사진도 상태조사표처럼 한 묶음으로 (2026-10-28)
 * - 외부 도면(EXT·EXT_n·이름만 바꾼 외부)의 사진을 결함 번호 순으로 합쳐 사진01부터 이어 번호
 * - 보고서 미리보기(PDF 출력의 원본): 첫 외부 도면 자리에 한 번만, 나머지 외부 도면은 사진첩 건너뜀(위치도는 그대로)
 * - 한글(hwpx)은 이미 외부 한 슬롯(EXT)에서 합친 결함으로 사진첩을 만들므로 코드 그대로(지문 테스트가 지키는 영역)
 * - 사진 데이터는 읽기만, 서버 읽기 추가 없음
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extract(name) {
    const i = app.indexOf(`function ${name}(`);
    assert.ok(i > 0, `${name} 없음`);
    let j = app.indexOf('{', i), depth = 0, k = j;
    for (; k < app.length; k++) {
        if (app[k] === '{') depth++;
        else if (app[k] === '}') { depth--; if (depth === 0) break; }
    }
    return app.slice(i, k + 1);
}

// 앱의 외부 판정(state.js)과 같은 규칙의 목: 코드 EXT·EXT_n, 또는 (주어진/현재 건물) 이름에 「외부」
const currentLabels = {}; // 지금 열어 둔 건물의 층 이름
const win = {
    isExteriorFloorCode(code, label) {
        const c = String(code || '').toUpperCase().trim();
        if (c === 'EXT' || c.startsWith('EXT_')) return true;
        const name = label != null ? label : (currentLabels[code] || '');
        return /외\s*부/.test(String(name).replace(/[\s\-_]/g, ''));
    }
};
const state = { defects: {} };
const photosOf = (d) => (d.photos || []).slice();
const src = ['isExteriorFloorCode', 'collectExteriorFloorCodes', 'parseSurveyDefectNo', 'buildCombinedExteriorPhotoEntries'].map(extract).join('\n');
const parseDefectNoParts = (d) => {
    const m = String((d && d.no) || '').match(/(\d+)(?:-(\d+))?/);
    return m ? { main: parseInt(m[1], 10), suffix: m[2] ? parseInt(m[2], 10) : 0 } : { main: Number.MAX_SAFE_INTEGER, suffix: 0 };
};
const api = new Function('window', 'state', 'getDefectOutputPhotos', 'parseDefectNoParts',
    `${src}\nreturn { collectExteriorFloorCodes, buildCombinedExteriorPhotoEntries };`)(win, state, photosOf, parseDefectNoParts);

// ---- 외부 판정: 코드 규칙 / 이름만 바꾼 외부 / 동 분할(다른 동 이름) ----
const floors = ['B1F', '1F', '2F', 'EXT', 'EXT_S', '3F'];
const bldgA = { floorsList: [{ floorCode: '2F', floorLabel: '외부-정면' }, { floorCode: '3F', floorLabel: '3층' }] };
assert.deepStrictEqual(api.collectExteriorFloorCodes(floors), ['EXT', 'EXT_S'], 'bldg 없으면 예전과 같다(코드 규칙 + 지금 건물 이름)');
assert.deepStrictEqual(api.collectExteriorFloorCodes(floors, bldgA), ['2F', 'EXT', 'EXT_S'], '이름만 바꾼 외부 도면(2F → 외부-정면)도 외부');
// 지금 열어 둔 건물에서는 2F가 외부 이름이지만, 출력하는 다른 동의 2F는 진짜 2층 → 그 동의 이름 기준
currentLabels['2F'] = '외부-정면';
const bldgB = { floorsList: [{ floorCode: '2F', floorLabel: '2층' }] };
assert.deepStrictEqual(api.collectExteriorFloorCodes(floors, bldgB), ['EXT', 'EXT_S'], '다른 동의 2층은 외부가 아님(동 분할)');
assert.deepStrictEqual(api.collectExteriorFloorCodes(floors), ['2F', 'EXT', 'EXT_S'], 'bldg 없음: 지금 건물 이름 기준(예전 동작)');
delete currentLabels['2F'];
// 이름에 외부·입면이 없는 도면은 자동으로 알 수 없다(예전과 같음)
const bldgC = { floorsList: [{ floorCode: '2F', floorLabel: '정면도' }] };
assert.deepStrictEqual(api.collectExteriorFloorCodes(floors, bldgC), ['EXT', 'EXT_S'], '이름에 외부 없음 → 일반 층');

// ---- 사진 묶음: 번호 순 · 이어 번호 ----
const D = (id, no, photos) => ({ id, no, photos });
state.defects['b_EXT'] = [D('e3', 'NO.3', ['u3a']), D('e1', 'NO.1', ['u1a', 'u1b']), null, D('x', 'NO.9', [])];
state.defects['b_EXT_S'] = [D('s2', 'NO.2', ['u2a']), D('s4', 'NO.4', ['u4a', 'u4b']), D('s2b', 'NO.2-1', ['u2b'])];
const getF = (fc) => state.defects['b_' + fc];
const ent = api.buildCombinedExteriorPhotoEntries('b', ['EXT', 'EXT_S'], getF);
assert.deepStrictEqual(ent.map((e) => e.src), ['u1a', 'u1b', 'u2a', 'u2b', 'u3a', 'u4a', 'u4b'], '결함 번호 순(도면이 달라도 합쳐서)');
assert.deepStrictEqual(ent.map((e) => e.label), ['사진01', '사진02', '사진03', '사진04', '사진05', '사진06', '사진07'], '사진01부터 이어 번호');
assert.deepStrictEqual(ent.map((e) => e.floorCode), ['EXT', 'EXT', 'EXT_S', 'EXT_S', 'EXT', 'EXT_S', 'EXT_S'], '어느 도면 결함인지 보존');
assert.deepStrictEqual(ent.map((e) => e.defectKey), ['e1', 'e1', 's2', 's2b', 'e3', 's4', 's4']);
// 같은 번호면 도면 순서 → 도면 안 순서
state.defects['b_EXT'] = [D('p', 'NO.5', ['p1']), D('q', 'NO.5', ['q1'])];
state.defects['b_EXT_S'] = [D('r', 'NO.5', ['r1'])];
assert.deepStrictEqual(api.buildCombinedExteriorPhotoEntries('b', ['EXT', 'EXT_S'], getF).map((e) => e.src), ['p1', 'q1', 'r1'], '같은 번호: 도면 순서·안 순서');
// 사진 없음 / 도면 없음 / 번호 없음
assert.deepStrictEqual(api.buildCombinedExteriorPhotoEntries('b', [], getF), []);
state.defects['b_EXT'] = [D('n', '', ['n1'])]; state.defects['b_EXT_S'] = [D('m', 'NO.1', ['m1'])];
assert.deepStrictEqual(api.buildCombinedExteriorPhotoEntries('b', ['EXT', 'EXT_S'], getF).map((e) => e.src), ['n1', 'm1'], '번호 없는 결함은 본번호 0으로(조사표 정렬과 같은 규칙)');
// 기본 목록(getFloorDefects 생략) = state.defects[bldgId_floor]
assert.strictEqual(api.buildCombinedExteriorPhotoEntries('b', ['EXT']).length, 1);
// 사진 데이터는 그대로(읽기만)
const keep = D('k', 'NO.1', ['data:image/png;base64,AAA']);
state.defects['b_EXT'] = [keep];
const before = JSON.stringify(keep);
api.buildCombinedExteriorPhotoEntries('b', ['EXT'], getF);
assert.strictEqual(JSON.stringify(keep), before, '결함·사진 데이터를 바꾸지 않는다');

// ---- 연결(wiring): 미리보기 ----
const preview = app.slice(app.indexOf('window.openReportPreviewModalFunc = async function'), app.indexOf('window.openReportPreviewModalFunc = async function') + 60000);
assert.ok(/collectExteriorFloorCodes\(availableFloors, bldg\)/.test(preview), '미리보기: bldg 이름으로 외부 판정');
assert.ok(/const exteriorPhotoEntries = exteriorFloorCodesForReport\.length\s*\?\s*buildCombinedExteriorPhotoEntries\(/.test(preview), '외부 사진 묶음 한 번 계산');
assert.ok(/exteriorPhotoEntries\.forEach\(\(e\) => \{ \(surveyPhotoLabels\[e\.defectKey\]/.test(preview), '표 비고 사진번호도 같은 묶음에서');
assert.ok(/if \(exteriorAlbumEmitted\) \{\s*skipAlbum = true;/.test(preview), '나머지 외부 도면은 사진첩 건너뜀');
assert.ok(/albumFloorLabel = '건축물 외부'/.test(preview), '묶음 사진첩 제목 건축물 외부');
assert.ok(/for \(let i = 0; i < albumItems\.length; i \+= 6\)/.test(preview), '1페이지 6장 규칙 그대로');
assert.ok(/2\. \$\{albumFloorLabel\} 현장 결함 사진첩 \(총 \$\{albumItems\.length\}개 사진\)/.test(preview));
// 위치도는 외부 도면마다 그대로
assert.ok(/data-role="location-map-page" data-floor="\$\{escapeReportHtml\(floorCode\)\}"/.test(preview), '위치도 페이지는 도면마다');
// hwpx 두 호출부에 bldg 전달 + 서버 읽기 없음
assert.strictEqual((app.match(/= collectExteriorFloorCodes\(availableFloors, bldg\)/g) || []).length, 1, '미리보기만 bldg 이름으로 판정');
// 한글(hwpx) 출력 코드는 지문 테스트(test-pdf-preview-hwpx-layout)가 지키는 영역 — 호출부는 그대로(동 분할 다른 동 이름 판정은 사용자 확인 후)
assert.strictEqual((app.match(/= collectExteriorFloorCodes\(availableFloors\);/g) || []).length, 2, 'hwpx 호출 2곳은 그대로');
const helper = extract('buildCombinedExteriorPhotoEntries') + extract('collectExteriorFloorCodes');
assert.ok(!/fetch\(|firestore|getDoc|onSnapshot|\.get\(\)/i.test(helper), '서버 읽기 없음');
// hwpx: 외부는 한 슬롯(EXT)의 합친 결함으로 사진첩을 만든다(1·2종: 슬롯 안 photoItems, 3종: 전역 사진첩) — 그대로
assert.ok(/floorsData\.push\(\{ floorCode: 'EXT', pageDefects: defects, exteriorCombined: true/.test(app));
console.log('test-ext-photo-combined OK');
