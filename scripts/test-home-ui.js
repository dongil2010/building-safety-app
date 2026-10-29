#!/usr/bin/env node
'use strict';

/**
 * 홈(현장 목록) 개편: 요약·정렬·진행/완료 탭·점검일 줄·계정 버튼 정리 (2026-10-28 사용자 요청).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const HS = require(path.join(root, 'js', 'core', 'home-sites.js'));
const RD = require(path.join(root, 'js', 'core', 'round-done.js'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

const rank = (rk) => {
    const [y, p] = String(rk || '').split('_');
    const yy = parseInt(y, 10);
    if (isNaN(yy)) return null;
    const pr = p === '상반기' ? 0 : (p === '하반기' ? 1 : null);
    return pr === null ? null : yy * 10 + pr;
};
const mk = (round, date, done, mapDone) => {
    const [y, p] = round.split('_');
    const b = { inspectionYear: y, inspectionPeriod: p, date: date || '' };
    if (done) RD.setDone(b, 'report', true, 'u', 1000);
    if (mapDone) RD.setDone(b, 'defectMap', true, 'u', 1000);
    return b;
};
const deps = {
    roundKeyOf: (b) => `${b.inspectionYear}_${b.inspectionPeriod}`,
    roundRank: rank,
    inspectionDate: (b) => b.date,
    isReportDone: (b) => RD.isDone(b, 'report'),
    isMapDone: (b) => RD.isDone(b, 'defectMap')
};
const TODAY = '2026-10-28';

// 1) 최종 회차 기준 — 옛 회차가 완료여도 최종 회차가 미작성이면 진행 중
(function latestRoundRules() {
    const s1 = HS.siteStatus([mk('2025년_하반기', '2025-11-01', true), mk('2026년_상반기', '2026-05-01', false)], deps, TODAY);
    assert.strictEqual(s1.latestRound, '2026년_상반기');
    assert.strictEqual(s1.done, false);
    assert.strictEqual(s1.date, '2026-05-01');
    assert.strictEqual(s1.visited, true);
    // 최종 회차가 작성완료면 완료(옛 회차 상태 무관)
    const s2 = HS.siteStatus([mk('2025년_하반기', '', false), mk('2026년_상반기', '2026-05-01', true)], deps, TODAY);
    assert.strictEqual(s2.done, true);
    assert.strictEqual(s2.visited, true);
    // 새 회차를 추가하면 다시 진행 중으로 돌아온다
    const s3 = HS.siteStatus([mk('2026년_상반기', '2026-05-01', true), mk('2026년_하반기', '2026-10-20', false)], deps, TODAY);
    assert.strictEqual(s3.done, false);
    assert.strictEqual(s3.latestRound, '2026년_하반기');
    assert.strictEqual(HS.siteStatus([], deps, TODAY), null);
    assert.strictEqual(HS.siteStatus(null, deps, TODAY), null);
})();

// 2) 동이 여럿이면 최종 회차의 모든 동이 작성완료여야 완료, 날짜는 가장 이른 동
(function multiDong() {
    const half = HS.siteStatus([mk('2026년_하반기', '2026-10-10', true), mk('2026년_하반기', '2026-10-05', false)], deps, TODAY);
    assert.strictEqual(half.done, false);
    assert.strictEqual(half.date, '2026-10-05');
    assert.strictEqual(half.count, 2);
    const all = HS.siteStatus([mk('2026년_하반기', '2026-10-10', true), mk('2026년_하반기', '2026-10-05', true)], deps, TODAY);
    assert.strictEqual(all.done, true);
})();

// 3) 다녀온 현장: 점검일이 오늘 이전(오늘 포함)이거나 작성 완료. 미래·날짜 없음은 아직
(function visited() {
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', '2026-10-28', false)], deps, TODAY).visited, true);
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', '2026-10-29', false)], deps, TODAY).visited, false);
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', '', false)], deps, TODAY).visited, false);
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', '', true)], deps, TODAY).visited, true, '작성 완료면 다녀온 것');
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', 'garbage', false)], deps, TODAY).date, '');
})();

// 4) 요약 숫자
(function summary() {
    const st = [
        HS.siteStatus([mk('2026년_하반기', '2026-10-01', false)], deps, TODAY), // 다녀옴·미작성·위치도 미작성
        HS.siteStatus([mk('2026년_하반기', '2026-11-30', false)], deps, TODAY), // 예정
        HS.siteStatus([mk('2026년_하반기', '2026-09-01', true)], deps, TODAY),  // 보고서 완료·위치도 미체크
        HS.siteStatus([mk('2026년_하반기', '', false)], deps, TODAY),           // 날짜 없음·미작성
        HS.siteStatus([mk('2026년_하반기', '2026-08-01', false, true)], deps, TODAY) // 다녀옴·위치도만 완료
    ];
    const s = HS.summarize(st);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), { total: 5, unwritten: 4, visited: 3, remaining: 2, done: 1, mapRemaining: 2 });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(HS.summarize([]))), { total: 0, unwritten: 0, visited: 0, remaining: 0, done: 0, mapRemaining: 0 });
    // 결함위치도 작성: 최종 회차의 모든 동이 체크돼야 완료, 옛 회차 체크는 무관
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', '2026-10-01', false, true), mk('2026년_하반기', '2026-10-02', false, false)], deps, TODAY).mapDone, false);
    assert.strictEqual(HS.siteStatus([mk('2026년_상반기', '2026-04-01', false, true), mk('2026년_하반기', '2026-10-02', false, false)], deps, TODAY).mapDone, false);
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', '2026-10-01', false, true)], deps, TODAY).mapDone, true);
    // isMapDone이 없으면(옛 호출) 위치도는 미완료로 센다
    assert.strictEqual(HS.siteStatus([mk('2026년_하반기', '2026-10-01', false, true)], { roundKeyOf: deps.roundKeyOf, roundRank: rank, inspectionDate: deps.inspectionDate, isReportDone: deps.isReportDone }, TODAY).mapDone, false);
})();

// 5) 정렬: 이른 점검일이 위, 날짜 없는 현장은 맨 아래, 같은 날짜·날짜 없음은 이름순
(function sorting() {
    const list = [
        { name: '다', date: '2026-10-20' }, { name: '가', date: '' }, { name: '나', date: '2026-09-01' },
        { name: '마', date: '2026-10-20' }, { name: '라', date: '' }
    ];
    list.sort(HS.compareSites);
    assert.deepStrictEqual(list.map((x) => x.name), ['나', '다', '마', '가', '라']);
    assert.strictEqual(HS.todayLocal(new Date(2026, 9, 28)), '2026-10-28');
})();

// 6) 화면 연결: 자동 로그인·로그아웃만 계정 바에, 나머지 계정 버튼은 톱니 설정 패널 안(2026-10-29)
(function accountButtons() {
    const bar = html.slice(html.indexOf('id="heroAccountBar"'), html.indexOf('id="homeSettingsPanel"'));
    const panel = html.slice(html.indexOf('id="homeSettingsPanel"'), html.indexOf('<!-- Building List Section -->'));
    assert.ok(bar.includes('id="btnLogout"'));
    assert.ok(bar.includes('id="btnAutoLoginAccount"'), '자동 로그인 배지는 로그아웃과 함께 밖에');
    assert.ok(!panel.includes('id="btnAutoLoginAccount"'));
    assert.ok(bar.indexOf('id="btnAutoLoginAccount"') < bar.indexOf('id="btnLogout"'), '자동 로그인 다음 로그아웃');
    assert.strictEqual(html.split('id="btnAutoLoginAccount"').length, 2);
    ['btnOpenMemberApproval', 'btnLeaveCompany', 'btnDeleteAccount'].forEach((id) => {
        assert.ok(!bar.includes(`id="${id}"`), id + '는 계정 바 밖(설정 패널)으로');
        assert.ok(panel.includes(`id="${id}"`), id + '는 설정 패널 안에');
        assert.strictEqual(html.split(`id="${id}"`).length, 2, id + ' id는 하나만');
    });
    // 권한별 노출은 그대로: 가입 승인·회사 나가기는 기본 숨김, 핸들러가 켠다
    assert.ok(/id="btnOpenMemberApproval"[^>]*display: none/.test(html));
    assert.ok(/id="btnLeaveCompany"[^>]*display: none/.test(html));
    // 관리자 전용 버튼(회사 이름·회사 삭제·사진 되살리기)은 가입 승인 버튼 옆에 끼워 넣으므로 같은 줄(패널 안)로 간다
    assert.ok(app.includes("document.getElementById('btnOpenMemberApproval')"));
    assert.ok(app.includes("host.insertBefore(btn, approval.nextSibling)"));
    assert.ok(app.includes("window.logout"), '로그아웃 핸들러 유지');
})();

// 7) 화면 연결: 요약·탭·점검일 줄·진행/완료 분리
(function homeWiring() {
    assert.ok(html.includes('id="dashboardSummary"') && html.includes('id="dashboardTabs"'));
    assert.ok(html.indexOf('js/core/home-sites.js') > 0 && html.indexOf('js/core/home-sites.js') < html.indexOf('src="app.js'));
    assert.ok(app.includes('전체 현장 <b>${summary.total}') && app.includes('보고서 작성완료 <b>${summary.done}')
        && app.includes('남은 보고서 <b>${summary.remaining}') && app.includes('결함위치도 남은 수 <b>${summary.mapRemaining}'), '요약 4개');
    assert.ok(app.includes("isMapDone: (b) => !!(RD && RD.isDone(b, 'defectMap'))"), '기존 결함위치도 작성완료 표시 사용');
    assert.ok(app.includes("data-dash-tab=\"active\"") && app.includes("data-dash-tab=\"done\""));
    assert.ok(app.includes('window.state.dashboardTab'));
    assert.ok(/\.filter\(\(k\) => \(dashTab === 'done'\) === isSiteDone\(k\)\)/.test(app), '진행/완료 탭으로 현장을 나눈다');
    assert.ok(app.includes('HS.compareSites'), '점검일 이른 순 정렬');
    assert.ok(app.includes('building-row-site-visit'), '현장 줄에 점검일');
    // 삭제·휴지통 건물은 요약·탭에서 빠진다: allBldgs(= filterActiveBuildings) 기준으로 센다
    assert.ok(app.includes('groupBuildingsBySite(allBldgs).forEach'));
    // 서버를 읽지 않는다
    const fnStart = app.indexOf('// ── 요약·정렬·진행/완료 탭');
    const body = app.slice(fnStart, fnStart + 6000);
    assert.ok(!/\.collection\(|\.get\(\)|fetch\(|onSnapshot/.test(body));
    // 모바일에서 회차 줄의 별도 점검일 입력 숨김
    assert.ok(/@media \(max-width: 768px\) \{\s*#tab-home \.round-date-wrap \{ display: none !important; \}/.test(css));
    assert.ok(css.includes('.dashboard-tab.active') && css.includes('.dashboard-summary-remain'));
})();

console.log('test-home-ui OK');
