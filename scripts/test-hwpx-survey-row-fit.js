'use strict';
// 2026-10-19 3종 한글 상태조사표 행 높이 — 15행이면 1행쯤 남게 키우고, 17행이 차면 다 들어가게 줄인다(쪽 넘침 없음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fit = require(path.join(root, 'js', 'shared', 'hwpx-survey-row-fit.js'));

// 3종 양식(hwpx_survey_template_grade3*.hwpx) 실측: A4, 위 5669·아래 4252·머리말 4331·꼬리말 4252,
// 머리글 2행 4298, 표 바깥 여백 위아래 140씩, 층 제목 「N) 층 상태조사표」 1200+1440
const bodyH = fit.bodyHeight({ height: 83340, top: 5669, bottom: 4252, header: 4331, footer: 4252 });
assert.strictEqual(bodyH, 64836);
const geo = (reserveH) => ({ bodyH, reserveH, headerH: 4298, tableMarginV: 280 });
const OLD_ROW_H = 3500;
const ONE_LINE = fit.lineNeed(1, 850, 508, 0);

[2640, 0, 5240].forEach((reserveH) => {
    // 15행: 예전(3500)보다 키 크고, 쪽 아래 1행쯤 남는다
    const p15 = fit.planRows(Object.assign(geo(reserveH), { needs: Array(15).fill(ONE_LINE) }));
    assert.ok(p15.fits && (reserveH > 4000 || p15.rowH > OLD_ROW_H), `15행 키움 (${reserveH}) ${p15.rowH}`);
    const spare = p15.area - p15.total;
    assert.ok(spare >= p15.rowH * 0.9 && spare < p15.rowH * 1.2, `한 행쯤 남음 ${spare}/${p15.rowH}`);
    // 16·17행: 그 쪽에 다 들어간다
    [16, 17].forEach((n) => {
        const p = fit.planRows(Object.assign(geo(reserveH), { needs: Array(n).fill(ONE_LINE) }));
        assert.ok(p.fits && p.total <= p.area, `${n}행 쪽 안`);
        const pageUsed = reserveH + 4298 + 280 + p.total;
        assert.ok(pageUsed <= bodyH, `${n}행 본문 높이 안 ${pageUsed}`);
    });
    const p17 = fit.planRows(Object.assign(geo(reserveH), { needs: Array(17).fill(ONE_LINE) }));
    assert.ok(p17.rowH < p15.rowH, '17행은 줄인다');
});

// 줄 많은 행은 그 높이를 지키고 나머지를 줄여 쪽을 넘지 않는다
const tall = fit.lineNeed(5, 850, 508, 0);
const mix = fit.planRows(Object.assign(geo(2640), { needs: [tall, tall].concat(Array(15).fill(ONE_LINE)) }));
assert.ok(mix.fits && mix.heights[0] === tall && mix.heights[2] < mix.defaultH && mix.total <= mix.area);
// 도저히 안 들어가면 fits=false(경고) — 그래도 최소 높이는 지킨다
const tooMuch = fit.planRows(Object.assign(geo(2640), { needs: Array(17).fill(fit.lineNeed(8, 850, 508, 0)) }));
assert.strictEqual(tooMuch.fits, false);
// 몇 행 안 되는 쪽도 같은 기본 높이
assert.strictEqual(fit.planRows(Object.assign(geo(2640), { needs: [ONE_LINE, ONE_LINE] })).rowH,
    fit.planRows(Object.assign(geo(2640), { needs: Array(15).fill(ONE_LINE) })).rowH);
assert.strictEqual(fit.paraHeight([{ vertpos: 0, vertsize: 1200, spacing: 1440 }]), 2640);

// 연결: 3종 상태조사표만(1·2종 표는 그대로)
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
assert.strictEqual((app.match(/const fitSurveyPageRows = \(destTbl, pageRows\) =>/g) || []).length, 1, '3종 한 곳');
assert.ok(/if \(fitRows\.length\) fitSurveyPageRows\(destTbl, fitRows\);/.test(app));
assert.ok(/applyRowHeightFromLines\(newRow, rowMaxLines, rowLineMetric, 2800\);/.test(app), '1·2종은 예전 그대로');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/js\/shared\/hwpx-survey-row-fit\.js\?v=/.test(html) && html.indexOf('js/shared/hwpx-survey-row-fit.js') < html.indexOf('src="app.js'));
console.log('test-hwpx-survey-row-fit: ok');
