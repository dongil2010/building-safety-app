#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 결함 수정창 빠른 선택(부재 명칭 · 결함 종류 · 발생 원인) 최적화 회귀 테스트
 *  1) 결함 종류 → 발생 원인 자동 체크(★ 우선, 없으면 맨 위), 직접 고른 원인 유지, 자동 원인 바꿔 끼우기
 *  2) 먼저 보일 칩(★ · 사용 빈도 · 선택값 · 더보기) — 기본 목록 이름이 실제 목록에 있는지
 *  3) 계정별 설정 저장/불러오기: 새 필드(★·사용 빈도·자동 체크)가 계정 설정에 들어가고
 *     오프라인/로그아웃이면 기기 localStorage, 클라우드가 더 새로우면 클라우드
 *  4) 수기 입력(Enter/blur)은 목록·칩·★에 자동 추가하지 않음, 결함을 열 때는 원인을 자동으로 바꾸지 않음
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const q = require(path.join(__dirname, '..', 'js', 'shared', 'defect-quick-presets.js'));

function blockFrom(startIdx, bodyIdx) {
    let i = bodyIdx != null ? bodyIdx : src.indexOf('{', startIdx);
    let depth = 0;
    for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return src.slice(startIdx, i + 1);
        }
    }
    throw new Error('unterminated block');
}

function extractFunction(name) {
    const re = new RegExp('\\n\\s*(async\\s+)?function ' + name + '\\s*\\(');
    const m = re.exec(src);
    assert.ok(m, 'missing function ' + name);
    // 기본값 매개변수(options = {})를 건너뛰고 본문 여는 중괄호에서 시작
    const body = src.indexOf(') {', m.index) + 2;
    return blockFrom(m.index + 1, body);
}

function extractConstLiteral(name, open) {
    const needle = 'const ' + name + ' = ' + open;
    const at = src.indexOf(needle);
    assert.ok(at >= 0, 'missing const ' + name);
    if (open === '{') return blockFrom(at) + ';';
    const end = src.indexOf('];', at);
    return src.slice(at, end + 2);
}

// ---------- 1) 종류 → 원인 ----------
// 원인 매핑 구역(@@DEFECT_CAUSE_MAP_START ~ END)을 통째로 떼어 실행
function loadCauseMap() {
    const a = src.indexOf('// @@DEFECT_CAUSE_MAP_START');
    const b = src.indexOf('// @@DEFECT_CAUSE_MAP_END');
    assert.ok(a >= 0 && b > a, 'missing cause map markers');
    return new Function(
        extractFunction('normalizeComponentKey') + '\n' + src.slice(a, b) +
        '\nreturn { defectCausePreset, getDefaultCausePresetList };'
    )();
}
const causeMap = loadCauseMap();
const causePreset = causeMap.defectCausePreset;

function testTypeToCauseMapping() {
    const top = (key) => q.pickCausesAfterTypeChange({ groupOptions: [causePreset[key]], selected: [] }).selected;
    // 2026-09-28 과거 보고서 14건 집계 기준 맨 위 원인
    assert.deepStrictEqual(top('균열'), ['건조수축 및 재료적 특성']);
    assert.deepStrictEqual(top('누수'), ['방수층 파손']);
    assert.deepStrictEqual(top('철근노출'), ['피복두께 부족']);
    assert.deepStrictEqual(top('박리/박락'), ['철근 부식 팽창']);
    assert.deepStrictEqual(top('부식/녹'), ['방청 불량']);
    assert.deepStrictEqual(top('부식'), ['노후화']);
    assert.deepStrictEqual(top('파손'), ['시공미흡']);
    assert.ok(causePreset['균열'].includes('부등침하') && causePreset['균열'].includes('철근 부식 팽창'));
    ['과하중', '개구부 주위 응력집중', '주변부재의 구속'].forEach((c) => {
        assert.ok(causePreset['균열'].includes(c), 'crack cause ' + c);
    });

    // ★원인이 있으면 ★가 자동 체크
    let r = q.pickCausesAfterTypeChange({ groupOptions: [causePreset['균열']], groupFavorites: [['과하중']], selected: [] });
    assert.deepStrictEqual(r.selected, ['과하중']);
    // 자동 체크 끔
    r = q.pickCausesAfterTypeChange({ groupOptions: [causePreset['균열']], selected: [], autoCheck: false });
    assert.deepStrictEqual(r.selected, []);
    // 직접 고른 원인은 종류가 바뀌어도 유지, 자동 원인은 새 목록에 없으면 빠지고 새 기본이 붙음
    r = q.pickCausesAfterTypeChange({ groupOptions: [causePreset['균열']], selected: ['지하수 유입(직접)'], autoPicked: [] });
    assert.deepStrictEqual(r.selected, ['지하수 유입(직접)']);
    r = q.pickCausesAfterTypeChange({ groupOptions: [causePreset['균열']], selected: ['방수층 파손'], autoPicked: ['방수층 파손'] });
    assert.deepStrictEqual(r.selected, ['건조수축 및 재료적 특성']);
    // 기타만 있으면 자동 체크하지 않음
    r = q.pickCausesAfterTypeChange({ groupOptions: [['기타']], selected: [] });
    assert.deepStrictEqual(r.selected, []);
    // 자동 원인만 있을 때 다른 원인을 켜면 바꿔 끼움, 그 뒤는 복수 선택
    let m = q.applyManualCauseToggle({ value: '과하중', checked: true, selected: ['건조수축 및 재료적 특성', '과하중'], autoPicked: ['건조수축 및 재료적 특성'] });
    assert.deepStrictEqual(m.selected, ['과하중']);
    assert.deepStrictEqual(m.autoPicked, []);
    m = q.applyManualCauseToggle({ value: '내력부족', checked: true, selected: ['과하중', '내력부족'], autoPicked: [] });
    assert.deepStrictEqual(m.selected, ['과하중', '내력부족']);
}

// ---------- 2) 먼저 보일 칩 ----------
function testVisibleChips() {
    const compPresetSrc = extractConstLiteral('DEFECT_JOINT_COMPONENT_PRESET', '[') + '\n' +
        extractConstLiteral('DEFECT_COMPONENT_PRESET', '{') + '\nreturn DEFECT_COMPONENT_PRESET;';
    const compPreset = new Function(compPresetSrc)();
    ['구조체', '비구조체', '마감재'].forEach((cat) => {
        q.DEFAULT_FAVORITES.component[cat].forEach((name) => {
            assert.ok(compPreset[cat].includes(name), `default favorite component ${cat}/${name} must exist in preset`);
        });
    });
    ['기둥', '보', '슬래브', '벽체', '계단', '옹벽', '파라펫', '기초'].forEach((n) => assert.ok(compPreset['구조체'].includes(n)));
    // 기존 이름 유지
    ['RC기둥', '큰보', '작은보', 'RC벽체', '데크슬래브'].forEach((n) => assert.ok(compPreset['구조체'].includes(n), 'kept ' + n));
    // 기본 결함 종류 즐겨찾기는 앱에 실제 있는 라벨만 (오타 방지)
    Object.values(q.DEFAULT_FAVORITES.type).forEach((list) => list.forEach((t) => {
        assert.ok(src.includes(`'${t}'`), 'default favorite type label exists in app.js: ' + t);
    }));

    const favs = q.getEffectiveFavorites(undefined, 'component', '구조체', ['외벽(직접추가)'], ['파라펫']);
    assert.ok(favs.includes('외벽(직접추가)'), 'existing custom entries migrate as favorites');
    assert.ok(!favs.includes('파라펫'), 'hidden items are not favorites');

    const split = q.computeVisibleChips(compPreset['구조체'], {
        limit: 8,
        favorites: q.getEffectiveFavorites(undefined, 'component', '구조체', [], []),
        selected: ['큰보']
    });
    assert.deepStrictEqual(split.visible.slice(0, 8), ['기둥', '보', '슬래브', '벽체', '옹벽', '파라펫', '계단', '기초']);
    assert.ok(split.visible.includes('큰보'), 'selected value always visible');
    assert.ok(split.hidden.includes('RC기둥') && !split.hidden.includes('큰보'));

    // 사용 빈도: ★ 없으면 많이 쓴 것이 보이는 칸을 채움, 보이는 순서는 목록 순
    let usage = {};
    for (let i = 0; i < 3; i++) usage = q.recordUsage(usage, 'component', '구조체', '캔틸레버보');
    const s2 = q.computeVisibleChips(['A', 'B', 'C', '캔틸레버보'], { limit: 2, favorites: [], usage: q.getUsageCounts(usage, 'component', '구조체') });
    assert.deepStrictEqual(s2.visible, ['A', '캔틸레버보']);
    // 상태양호 pinned
    const s3 = q.computeVisibleChips(['상태양호', '수직균열', '누수'], { limit: 2, pinned: ['상태양호'], favorites: ['누수'] });
    assert.deepStrictEqual(s3.visible, ['상태양호', '누수']);

    // ★ 토글: 기본값을 쓰던 분류는 계정 목록으로 굳혀짐
    const map = q.toggleFavorite({}, 'component', '구조체', '옹벽', [], []);
    assert.ok(Array.isArray(map['구조체']) && !map['구조체'].includes('옹벽') && map['구조체'].includes('기둥'));
}

// ---------- 3) 계정별 저장/불러오기 ----------
async function testPerAccountPresets() {
    const store = {};
    const localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    };
    const window = { state: {} };
    let synced = 0;
    const body = [
        extractFunction('getUserDefectPinPresetsPayload'),
        extractConstLiteral('DEFECT_PIN_PRESET_FIELDS', '['),
        extractFunction('applyDefectPinPresets'),
        extractFunction('userDefectPinLocalKey'),
        extractFunction('persistUserDefectPinPresetsLocal'),
        extractFunction('loadAndApplyUserDefectPinPresets'),
        'return { getUserDefectPinPresetsPayload, applyDefectPinPresets, persistUserDefectPinPresetsLocal, loadAndApplyUserDefectPinPresets, DEFECT_PIN_PRESET_FIELDS };'
    ].join('\n');
    const make = (db, online) => new Function(
        'window', 'localStorage', 'db', 'navigator', 'scheduleSyncUserDefectPinPresets', '_lastSyncedUserDefectPinJson',
        'migrateDefectComponentStateShape', 'console', body
    )(window, localStorage, db, { onLine: online }, () => { synced++; }, '', () => {}, { warn() {} });

    let api = make(null, false);
    ['favoriteDefectComponents', 'favoriteDefectTypes', 'favoriteDefectCauses', 'defectPickUsage', 'defectCauseAutoCheck']
        .forEach((f) => assert.ok(api.DEFECT_PIN_PRESET_FIELDS.includes(f), 'preset field ' + f));

    // 오프라인·로컬 저장 → 다시 불러오기
    window.state = {
        uid: 'u1',
        customDefectCauses: { '균열': ['내 원인'] },
        favoriteDefectComponents: { '구조체': ['기둥', '큰보'] },
        favoriteDefectCauses: { '균열': ['과하중'] },
        defectPickUsage: { component: { '구조체': { '큰보': 5 } } },
        defectCauseAutoCheck: false
    };
    api.persistUserDefectPinPresetsLocal('u1');
    const saved = JSON.parse(store['building_safety_user_defect_pin_v1_u1']);
    assert.deepStrictEqual(saved.presets.favoriteDefectComponents, { '구조체': ['기둥', '큰보'] });
    assert.strictEqual(saved.presets.defectCauseAutoCheck, false);

    window.state = { uid: 'u1' };
    await api.loadAndApplyUserDefectPinPresets('u1', null);
    assert.deepStrictEqual(window.state.customDefectCauses, { '균열': ['내 원인'] }, 'existing custom kept');
    assert.deepStrictEqual(window.state.favoriteDefectCauses, { '균열': ['과하중'] });
    assert.strictEqual(window.state.defectCauseAutoCheck, false);
    assert.strictEqual(window.state.defectPickUsage.component['구조체']['큰보'], 5);

    // 다른 계정은 이 계정 설정을 보지 않음
    window.state = { uid: 'u2' };
    await api.loadAndApplyUserDefectPinPresets('u2', null);
    assert.ok(!window.state.favoriteDefectCauses, 'u2 must not get u1 presets');

    // 클라우드가 더 새로우면 클라우드 (구버전 클라우드에 새 필드가 없으면 로컬 값 유지)
    window.state = { uid: 'u1', favoriteDefectTypes: { '구조체': ['누수'] } };
    api = make(null, true);
    await api.loadAndApplyUserDefectPinPresets('u1', {
        defectPinPresets: { customDefectCauses: { '누수': ['클라우드 원인'] } },
        defectPinPresetsUpdatedAt: Date.now() + 60000
    });
    assert.deepStrictEqual(window.state.customDefectCauses, { '누수': ['클라우드 원인'] });
    assert.deepStrictEqual(window.state.favoriteDefectTypes, { '구조체': ['누수'] });
    const payload = api.getUserDefectPinPresetsPayload();
    assert.strictEqual(payload.defectCauseAutoCheck, true, 'auto-check defaults on');
}

// ---------- 4) 수기 입력은 자동 추가 안 함 / 결함 열 때 원인 안 바꿈 ----------
function testNoImplicitAdd() {
    const combo = extractFunction('bindDefectComboInputs');
    assert.ok(!/customDefect(Components|Types)\s*(\[[^\]]*\])?\s*\.push/.test(combo), 'typed component/type must not push custom lists');
    assert.ok(!/recordDefectPickUsage|toggleDefectFavorite/.test(combo), 'typing must not record usage or favorites');
    const causeDirect = extractFunction('bindDefectCauseDirectInput');
    assert.ok(/commitDefectCauseDirectInput\(false\)/.test(causeDirect), 'cause Enter stays non-persisting');
    const open = extractFunction('openAddDefectModal');
    assert.ok(!/applyCauseAutoPickForType/.test(open), 'opening a defect must not auto-change causes');
    assert.ok(/updateDefectCauseDropdown\(existingPin\.defectType \|\| '균열', existingPin\.cause\)/.test(open));
    const bulk = extractFunction('applyCauseAutoPickForType');
    assert.ok(/isDefectBulkEditMode\(\)/.test(bulk), 'no auto cause in bulk edit');
}

(async () => {
    testTypeToCauseMapping();
    testVisibleChips();
    await testPerAccountPresets();
    testNoImplicitAdd();
    console.log('test-defect-quick-presets: ok');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
