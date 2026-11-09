/**
 * 한글 출력 전 규칙 검토(js/core/report-review.js, 2026-10-20)
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const R = require(path.join(root, 'js', 'core', 'report-review.js'));

const base = { floorCode: '1F', floorLabel: '지상 1층', location: 'X1/Y1', component: '기둥', defectType: '균열', cause: '건조수축', widths: ['0.3'], crackLength: '1.2', itemCount: '', sizeText: '', good: false };
let n = 0;
const row = (o) => Object.assign({ id: 'd' + (++n), no: String(n) }, base, o);
const rules = (rows) => R.reviewRows(rows).map((x) => x.rule);

// 멀쩡한 행은 아무것도 안 나온다
assert.deepStrictEqual(R.reviewRows([row({})]), [], '정상 행');

// 원인 빠짐 — 2026-10-30부터 한글에도 빈칸으로 나간다
let out = R.reviewRows([row({ cause: '' })]);
assert.strictEqual(out[0].rule, 'empty-cause');
assert.strictEqual(out[0].level, 'error');
assert.ok(!/건조수축/.test(out[0].msg), '건조수축으로 채운다는 말 없음');
// 상태양호·보수완료는 원인·균열폭 검사에서 뺀다
assert.deepStrictEqual(rules([row({ defectType: '상태양호', cause: '', widths: [], good: true })]), [], '상태양호 원인 없음 = 정상');
assert.deepStrictEqual(rules([row({ defectType: '보수완료', cause: '', widths: [], good: true })]), [], '보수완료 원인 없음 = 정상');

// 빈칸
assert.ok(rules([row({ defectType: '' })]).includes('empty-type'));
assert.ok(rules([row({ location: '' })]).includes('empty-location'));
assert.ok(rules([row({ component: '' })]).includes('empty-component'));

// 균열폭
assert.ok(rules([row({ widths: ['3mm'] })]).length === 0, '3mm는 범위 안');
assert.ok(rules([row({ widths: ['8'] })]).includes('width-range'), '8mm 너무 큼');
assert.ok(rules([row({ widths: ['0.0003'] })]).includes('width-range'), 'm로 적은 듯');
assert.ok(rules([row({ widths: ['0.3cm'] })]).includes('width-nan'), 'cm 글자');
assert.ok(rules([row({ widths: ['0'] })]).includes('width-range'), '0');
// 2026-10-20 범위로 적은 균열폭(0.1~0.2)은 숫자로 본다 — 양끝을 각각 범위 검사
assert.deepStrictEqual(R.nums('0.1~0.2'), [0.1, 0.2]);
assert.deepStrictEqual(R.nums('0.1 ～ 0.2mm'), [0.1, 0.2]);
assert.deepStrictEqual(R.nums('0.1-0.2'), [0.1, 0.2]);
assert.deepStrictEqual(R.nums('0.3'), [0.3]);
assert.strictEqual(R.nums('0.1~약2'), null);
assert.deepStrictEqual(rules([row({ widths: ['0.1~0.2'] })]), [], '0.1~0.2는 정상');
assert.deepStrictEqual(rules([row({ widths: ['0.1~0.2mm', '0.3'] })]), [], '범위 + 하나');
assert.ok(rules([row({ widths: ['0.2~8'] })]).includes('width-range'), '범위 끝이 너무 큼');
assert.ok(rules([row({ widths: ['0.1~'] })]).includes('width-nan'), '끝이 빈 범위');
assert.deepStrictEqual(rules([row({ crackLength: '0.5~1.2' })]), [], '길이 범위');
assert.ok(rules([row({ widths: ['0.2', '0.4mm'] })]).length === 0, '여러 폭');
assert.ok(rules([row({ widths: [], sizeText: '' })]).includes('empty-width'), '균열인데 폭 없음');
assert.ok(!rules([row({ widths: [], sizeText: '0.3mm×1.2m' })]).includes('empty-width'), '규모 칸에 적었으면 괜찮음');
assert.deepStrictEqual(rules([row({ defectType: '이격', widths: ['20'] })]), [], '이격폭은 균열폭 칸에 적어도 됨(범위 검사도 안 함)');
assert.ok(rules([row({ defectType: '이격', widths: ['약2'] })]).includes('width-nan'), '이격폭도 숫자는 봄');
assert.ok(rules([row({ defectType: '수직균열', widths: ['9'] })]).includes('width-range'), '수직균열도 균열(범위 검사)');

// 길이·개수
assert.ok(rules([row({ crackLength: '120' })]).includes('length-range'), '120m');
assert.ok(rules([row({ crackLength: '1.2m' })]).length === 0, '1.2m');
assert.ok(rules([row({ crackLength: '약1' })]).includes('length-nan'));
assert.ok(rules([row({ itemCount: '1.5' })]).includes('count'));
assert.ok(rules([row({ itemCount: '3' })]).length === 0);

// 같은 말 두 번
assert.strictEqual(R.findRepeat('균열 균열'), '균열 균열');
assert.strictEqual(R.findRepeat('기둥기둥 하부'), '기둥기둥');
assert.strictEqual(R.findRepeat('0.3mm mm'), 'mm mm');
assert.strictEqual(R.findRepeat('건조수축,, 하중'), ',,');
assert.strictEqual(R.findRepeat('X1/Y1 기둥 하부'), '', '정상 글');
assert.strictEqual(R.findRepeat('X1~X2/Y1~Y2'), '', '통심 표기');
assert.ok(rules([row({ cause: '건조수축 건조수축' })]).includes('repeat'));
assert.ok(rules([row({ location: 'X1/Y1  기둥' })]).includes('space'), '두 칸 띄어쓰기');

// 같은 층 똑같은 행
out = R.reviewRows([row({ no: '3' }), row({ no: '4' })]);
assert.strictEqual(out.length, 1);
assert.strictEqual(out[0].rule, 'dup-row');
assert.strictEqual(out[0].no, '4');
assert.ok(/3번/.test(out[0].msg));
assert.deepStrictEqual(rules([row({}), row({ floorCode: '2F' })]), [], '층이 다르면 중복 아님');
const goodRow = { defectType: '상태양호', cause: '', widths: [], crackLength: '', good: true };
assert.deepStrictEqual(rules([row(goodRow), row(goodRow)]), [], '상태양호끼리는 같아도 중복 아님');
assert.deepStrictEqual(rules([row(Object.assign({}, goodRow, { defectType: '보수완료' })), row(Object.assign({}, goodRow, { defectType: '보수완료' }))]), [], '보수완료끼리도');

// 표기 통일(띄어쓰기만 다름) — 적게 쓴 쪽
out = R.reviewRows([row({ defectType: '철근노출', widths: [], location: 'a' }), row({ defectType: '철근노출', widths: [], location: 'b' }), row({ defectType: '철근 노출', widths: [], location: 'c' })]);
assert.deepStrictEqual(out.map((x) => x.rule), ['variant']);
assert.strictEqual(out[0].no, String(n));

// 규모 단위 섞임
out = R.reviewRows([row({ defectType: '박락', widths: [], location: 'a', sizeText: '0.5㎡' }), row({ defectType: '박락', widths: [], location: 'b', sizeText: '0.2㎡' }), row({ defectType: '박락', widths: [], location: 'c', sizeText: '0.3m2' })]);
assert.deepStrictEqual(out.map((x) => x.rule), ['unit-mix']);

// 심각한 것부터
out = R.reviewRows([row({ location: 'X1  Y1' }), row({ cause: '', location: 'z' })]);
assert.strictEqual(out[0].level, 'error');

// ---- 2026-10-20 성광교회 검토에서 규칙으로 잡을 수 있던 것 ----
// 위치·부재가 다 빈 마킹은 한 줄(empty-pin)로만, 균열폭 빈칸도 따로 안 띄움
let rs = rules([row({ location: '', component: '', widths: [], crackLength: '' })]);
assert.deepStrictEqual(rs, ['empty-pin'], '빈 마킹은 한 줄');
assert.ok(rules([row({ location: '' })]).includes('empty-location'), '위치만 빔은 그대로');
// 행·열을 설정해 둔 층은 위치 빈칸을 안 잡는다(부재 빈칸은 그대로), 행·열 없는 층은 그대로 잡는다
assert.ok(!rules([row({ location: '', gridSet: true })]).includes('empty-location'), '행·열 층은 위치 빈칸 통과');
assert.ok(rules([row({ location: '', gridSet: false })]).includes('empty-location'), '행·열 없는 층은 위치 빈칸 잡음');
assert.deepStrictEqual(rules([row({ location: '', component: '', gridSet: true })]).filter((x) => /^empty-(pin|location|component)$/.test(x)), ['empty-component'], '행·열 층 빈 마킹은 부재만');
// 결함인데 원인 「-」
assert.ok(rules([row({ defectType: '물탱크 설치', cause: '-', widths: [], crackLength: '' })]).includes('dash-cause'));
assert.ok(!rules([row({ defectType: '상태양호', cause: '-', widths: [], crackLength: '', good: true })]).includes('dash-cause'), '양호는 「-」 정상');
// 이격균열은 큰 폭 정상
assert.ok(!rules([row({ defectType: '이격균열', widths: ['6.0'] })]).includes('width-range'));
assert.ok(rules([row({ defectType: '경사균열', widths: ['6.0'] })]).includes('width-range'));
// 메모 문구
assert.ok(!rules([row({ defectType: '수직균열 (균열폭 표시)' })]).includes('memo-text'), '(균열폭 표시)는 쓰는 표기(10-28)');
assert.ok(!rules([row({ defectType: '경사균열(균열폭표시)' })]).includes('memo-text'));
assert.ok(rules([row({ defectType: '수직균열 (추후 기재)' })]).includes('memo-text'));
assert.ok(rules([row({ defectType: '수직균열 (폭 확인요)' })]).includes('memo-text'));
assert.ok(!rules([row({ defectType: '경사균열(2EA), 수평균열' })]).includes('memo-text'), '(2EA)는 메모 아님');
// 오타
out = R.reviewRows([row({ component: '천정 마감재' })]);
assert.ok(out.some((x) => x.rule === 'typo' && /천장/.test(x.msg)));
out = R.reviewRows([row({ cause: '설계또는 시공 미흡' })]);
assert.ok(out.some((x) => x.rule === 'typo' && x.msg.includes('「설계또는」 → 「설계 또는」')), '낱말 전체를 보여 줌');
assert.ok(rules([row({ cause: '시공미흡, 경과 년 수 증대' })]).includes('typo'));
assert.ok(!rules([row({ cause: '설계 또는 시공 미흡' })]).includes('typo'));
// 가운뎃점
assert.ok(rules([row({ defectType: '수직․수평균열' })]).includes('dot'));
assert.ok(!rules([row({ defectType: '수직·수평균열' })]).includes('dot'));
// 개수가 폭 칸에도
assert.ok(rules([row({ defectType: '타일파손', widths: ['7.0'], crackLength: '', sizeText: '7EA' })]).includes('count-in-width'));
assert.ok(rules([row({ defectType: '볼트 누락', widths: ['2.0'], crackLength: '', sizeText: '2EA' })]).includes('count-in-width'));
assert.ok(!rules([row({ defectType: '타일파손', widths: [], crackLength: '', sizeText: '7EA' })]).includes('count-in-width'));
// 폭·길이 바뀐 듯
assert.ok(rules([row({ widths: ['4.0'], crackLength: '0.2' })]).includes('swap'));
assert.ok(!rules([row({ widths: ['0.3'], crackLength: '0.2' })]).includes('swap'));
// 칸 섞임
assert.ok(rules([row({ component: '슬래브 콘크리트 파취 및 철근', defectType: '철근노출', widths: [], crackLength: '' })]).includes('mixed-field'));
assert.ok(rules([row({ component: '철골보(G)이음부 상태양호', defectType: '상태양호', cause: '', widths: [], crackLength: '', good: true })]).includes('mixed-field'));
assert.ok(rules([row({ component: '난간', defectType: '높이 부족 H:630mm', widths: [], crackLength: '' })]).includes('mixed-field'));
assert.ok(!rules([row({ component: '천장 마감재', defectType: '오염', widths: [], crackLength: '' })]).includes('mixed-field'));
// 위치만 다르고 값이 같음
out = R.reviewRows([row({ location: '정원', component: '옹벽', widths: ['0.15'], crackLength: '3.8' }), row({ location: '썬큰', component: '옹벽', widths: ['0.15'], crackLength: '3.8' })]);
assert.deepStrictEqual(out.map((x) => x.rule), ['same-measure']);
// 높이 단위 섞임
out = R.reviewRows([
    row({ defectType: '높이 부족', widths: [], crackLength: '', location: 'a', sizeText: 'H:800mm' }),
    row({ defectType: '높이 부족', widths: [], crackLength: '', location: 'b', sizeText: 'H:620mm' }),
    row({ defectType: '높이 부족', widths: [], crackLength: '', location: 'c', sizeText: 'H:80cm' })
]);
assert.deepStrictEqual(out.map((x) => x.rule), ['unit-mix']);
assert.ok(/cm/.test(out[0].msg));
// 위치 띄어쓰기 표기 통일
out = R.reviewRows([row({ location: '남자화장실', widths: ['0.2'] }), row({ location: '남자화장실', widths: ['0.3'] }), row({ location: '남자 화장실', widths: ['0.4'] })]);
assert.ok(out.some((x) => x.rule === 'variant' && /위치/.test(x.msg)));

// 앱 연결: 미리보기 단추·결과칸·스크립트, 한글과 같은 행(getSurveyRowsForReport)을 쓴다
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(/id="btnModalReportReview"/.test(html) && /id="reportReviewPanel"/.test(html));
assert.ok(html.indexOf('js/core/report-review.js') > 0 && html.indexOf('js/core/report-review.js') < html.indexOf('src="app.js'));
assert.ok(/function collectReportReviewRows\(\)[\s\S]{0,900}getSurveyRowsForReport\(defects\)/.test(app));
assert.ok(app.includes('window.viewDefectOnMapFromSurvey(b.dataset.rrId)'), '줄 누르면 결함으로');
// 2026-10-20 「미리보기를 닫아야 검토를 할 수 있다」: 결과 창은 미리보기 모달 밖(닫아도 남음), 체크·다시 검사·미리보기 다시 열기
const modalBody = html.indexOf('id="modalReportPreviewBody"');
const panelAt = html.indexOf('\n    <div id="reportReviewPanel"');
assert.ok(modalBody > 0 && panelAt > modalBody, '결과 창은 body 바로 아래(미리보기 모달 밖)');
assert.ok(/<\/div>\s*<\/div>\s*<\/div>\s*<!-- 2026-10-20 한글 출력 전 규칙 검토/.test(html.slice(modalBody, panelAt + 80)), '모달을 다 닫은 뒤');
assert.ok(app.includes('data-rr-check=') && app.includes("a === 'rerun'") && app.includes("a === 'preview'"), '체크·다시 검사·미리보기');
assert.ok(app.includes("panel.classList.toggle('is-over-modal'"), '미리보기 열려 있으면 그 위');
// 열린 모달은 .modal-overlay.open z-index 10000 — 미리보기 위엔 그보다 높게, 닫힌 뒤엔 다른 열린 창보다 낮게
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const openZ = +((css.match(/\.modal-overlay\.open\s*\{[^}]*z-index:\s*(\d+)/) || [])[1] || 0);
const overZ = +((css.match(/\.report-review-panel\.is-over-modal\{z-index:(\d+)\}/) || [])[1] || 0);
const baseZ = +((css.match(/\.report-review-panel\{position:fixed;[^}]*z-index:(\d+)/) || [])[1] || 0);
assert.ok(openZ > 0 && overZ > openZ && baseZ > 0 && baseZ < openZ, `z-index 모달 ${openZ} / 위 ${overZ} / 평소 ${baseZ}`);

// 2026-11-08 구조 부재인데 비구조체(해양교육원 2F NO.47 슬래브 균열·미장균열, 3F NO.94 슬래브 누수)
const SM = 'struct-member-nonstructural';
const sm = (o) => rules([row(Object.assign({ category: '비구조체', widths: [], crackLength: '' }, o))]).includes(SM);
assert.ok(sm({ component: '슬래브', defectType: '균열, 미장균열' }), '미장균열이 섞여도 균열이 있으면 잡는다');
assert.ok(sm({ component: '슬래브', defectType: '누수 및 결로수 발생' }));
assert.ok(sm({ component: '보-슬래브 접합부', defectType: '누수흔적 및 백태' }), '보-슬래브 접합부는 구조 부재');
assert.ok(sm({ component: '기둥', defectType: '수평균열' }));
assert.ok(sm({ component: '데크 슬래브', defectType: '상태양호', good: true, cause: '' }), '상태양호도 조사표 체크가 틀리게 나간다');
assert.ok(!sm({ component: '슬래브', defectType: '균열', category: '구조체' }), '구조체는 그대로');
assert.ok(!sm({ component: '슬래브', defectType: '균열', category: '마감재' }), '마감재로 고른 것은 사람이 정한 것');
assert.ok(!sm({ component: '기둥-벽체 접합부', defectType: '수직이격' }), '기둥-벽체 접합부는 비구조체(사용자 규칙)');
assert.ok(!sm({ component: '보 보수부위', defectType: '미장 수직균열' }), '미장 균열만 있으면 비구조체');
assert.ok(!sm({ component: '보(B)', defectType: '미장균열' }));
assert.ok(!sm({ component: '슬래브 단열재', defectType: '상태양호', good: true, cause: '' }));
assert.ok(!sm({ component: '기둥-보 접합부', defectType: '뿜칠 상태양호', good: true, cause: '' }));
assert.ok(!sm({ component: '천장 텍스', defectType: '오염 및 파손' }));
assert.ok(!sm({ component: '조적기둥', defectType: '수직,수평균열' }), '조적은 비구조체');
assert.ok(!sm({ component: '보도블록', defectType: '파손' }), '보도블록은 보가 아니다');
assert.ok(!sm({ component: '벽체', defectType: '균열' }), '벽체는 RC인지 조적인지 몰라 보지 않는다');
assert.ok(app.includes("category: d.category == null ? '구조체' : String(d.category)"), '검토 행에 구분을 넘긴다');

// 2026-11-08 표기 통일 결과에 바로 고치기 정보(fix)를 담는다 — 위치는 한글 칸 글자라 빼고
{
    const res = R.reviewRows([
        row({ cause: '보수 시공미흡' }), row({ cause: '보수 시공미흡' }), row({ cause: '보수 시공 미흡' }),
        row({ location: 'X1 / Y1' })
    ]);
    const v = res.filter((x) => x.rule === 'variant' && /원인/.test(x.msg));
    assert.strictEqual(v.length, 1);
    assert.deepStrictEqual(v[0].fix, { field: 'cause', label: '원인', from: '보수 시공 미흡', to: '보수 시공미흡', fromCount: 1, toCount: 2 });
    const loc = res.find((x) => x.rule === 'variant' && /위치/.test(x.msg));
    assert.ok(loc && !loc.fix, '위치 표기는 단추 없음');
}
assert.ok(app.includes('async function rrApplyFix(fix, mode)') && app.includes('data-rr-fix="match"') && app.includes('data-rr-fix="unify"'), '맞추기·통일 단추');
assert.ok(/found\.forEach\(\(d\) => \{ d\[fix\.field\] = target; touchDefectUpdatedAt\(d\); \}\)/.test(app), '고친 결함은 수정 시각을 올린다');

// 2026-11-08 미장 결함인데 구조체(미장 강제를 풀고 검토에서 잡는다)
const PL = 'plaster-structural';
const pl = (o) => rules([row(Object.assign({ category: '구조체', widths: [], crackLength: '' }, o))]).includes(PL);
assert.ok(pl({ component: '기둥', defectType: '미장균열' }));
assert.ok(pl({ component: '벽체', defectType: '미장 들뜸' }));
assert.ok(pl({ component: '기둥', defectType: '미장 상태양호', good: true, cause: '' }));
assert.ok(!pl({ component: '슬래브', defectType: '균열, 미장균열' }), '미장 아닌 결함이 같이 있으면 구조체가 맞을 수 있다');
assert.ok(!pl({ component: '기둥', defectType: '미장균열', category: '비구조체' }));
assert.ok(!pl({ component: '기둥', defectType: '수직균열' }));
// 「균열, 미장균열」 슬래브는 구조체면 두 경고 다 없음, 비구조체면 구조 부재 경고
assert.deepStrictEqual(rules([row({ component: '슬래브', defectType: '균열, 미장균열', category: '구조체', widths: [], crackLength: '' })]).filter((x) => x === SM || x === PL), []);

// 2026-11-10 조적·블록·ALC 벽체인데 구조체(통계 탭 입력 확인과 같은 판정)
const MS = 'masonry-structural';
const ms = (o) => rules([row(Object.assign({ category: '구조체', defectType: '균열', widths: [], crackLength: '' }, o))]);
assert.ok(ms({ component: '조적벽체' }).includes(MS));
assert.ok(ms({ component: '조적 벽체' }).includes(MS), '띄어쓰기');
assert.ok(ms({ component: 'ALC 벽체' }).includes(MS));
assert.ok(ms({ component: '블럭벽체' }).includes(MS));
assert.ok(ms({ component: '벽돌벽' }).includes(MS));
assert.ok(ms({ component: '조적벽체', defectType: '조적벽체 상태양호', good: true, cause: '' }).includes(MS), '상태양호 행도 조사표 구분은 틀림');
assert.ok(!ms({ component: '조적벽체', category: '비구조체' }).includes(MS));
assert.ok(!ms({ component: 'RC벽체' }).includes(MS));
assert.ok(!ms({ component: '보도블록' }).includes(MS), '보도블록은 벽체가 아님');
assert.ok(!ms({ component: '경계블록' }).includes(MS));
const msPl = ms({ component: '조적벽체', defectType: '미장균열' });
assert.ok(msPl.includes(MS) && !msPl.includes(PL), '조적벽체 미장균열은 조적 경고 하나만');
const msHit = R.reviewRows([row({ component: '조적벽체', category: '구조체', defectType: '균열', widths: [], crackLength: '' })]).find((x) => x.rule === MS);
assert.strictEqual(msHit.level, 'warn');
assert.ok(/조적벽체/.test(msHit.msg) && /비구조체로 바꿔/.test(msHit.msg));

console.log('test-report-review: ok');
