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

// 원인 빠짐 — 한글엔 건조수축으로 나간다고 알림
let out = R.reviewRows([row({ cause: '' })]);
assert.strictEqual(out[0].rule, 'empty-cause');
assert.strictEqual(out[0].level, 'error');
assert.ok(/건조수축/.test(out[0].msg));
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
assert.ok(rules([row({ widths: ['0.2', '0.4mm'] })]).length === 0, '여러 폭');
assert.ok(rules([row({ widths: [], sizeText: '' })]).includes('empty-width'), '균열인데 폭 없음');
assert.ok(!rules([row({ widths: [], sizeText: '0.3mm×1.2m' })]).includes('empty-width'), '규모 칸에 적었으면 괜찮음');
assert.ok(rules([row({ defectType: '박리', widths: ['0.2'] })]).includes('width-not-crack'), '균열 아닌데 폭');
assert.ok(!rules([row({ defectType: '수직균열' })]).includes('width-not-crack'), '수직균열도 균열');

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

console.log('test-report-review: ok');
