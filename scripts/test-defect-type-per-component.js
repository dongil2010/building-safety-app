'use strict';
// 2026-11-13 세팅 트리: 분류 → 부재 → 결함 종류 → 원인
//  - 「보에서 만든 하부면 균열이 철골보에도 뜨고, 철골보에서 지우면 보에서도 사라짐」 → 결함 종류 세팅은 「분류|부재」 칸
//  - 같은 「균열」이라도 부재가 다르면 원인 세팅이 따로 → 「분류|부재|종류」 칸
//  - 보(G)·보(B)는 「보」 한 칸, 철골보(G)·(B)는 「철골보」 한 칸
//  - 아직 안 고친 칸은 예전 칸(분류 / 종류)을 그대로 쓴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const j = (v) => JSON.stringify(v);
const HELPERS = [
    extractFunction(app, 'function settingsComponentName('),
    extractFunction(app, 'function findOwnedSettingsBucket(')
];

// --- 결함 종류 ---
const ctx = {
    window: { state: {
        customDefectTypes: { '구조체': ['하부면 균열', '공극'] },
        hiddenDefectTypes: { '구조체': ['기타'] },
        defectTypeOrder: { '구조체': ['하부면 균열', '공극'] },
        favoriteDefectTypes: {}
    } },
    getDefectFavoriteList: () => ['균열']
};
vm.createContext(ctx);
vm.runInContext(HELPERS.concat([
    extractFunction(app, 'function defectTypeComponentBucketKey('),
    extractFunction(app, 'function defectTypeSettingsBucket('),
    extractFunction(app, 'function ownDefectTypeSettingsBucket('),
    'this.bucket = defectTypeSettingsBucket; this.own = ownDefectTypeSettingsBucket; this.norm = settingsComponentName;'
]).join('\n'), ctx);
const st = ctx.window.state;

assert.strictEqual(ctx.norm('보(G)'), '보');
assert.strictEqual(ctx.norm('보 (b)'), '보');
assert.strictEqual(ctx.norm('철골보(B)'), '철골보');
assert.strictEqual(ctx.norm('기둥'), '기둥');
assert.strictEqual(ctx.norm('PC보(G)'), '보');
assert.strictEqual(ctx.norm('RC보'), '보');
assert.strictEqual(ctx.norm('큰보'), '보');
assert.strictEqual(ctx.norm('작은보'), '보');
assert.strictEqual(ctx.norm('RC기둥'), '기둥');
assert.strictEqual(ctx.norm('PC기둥'), '기둥');
assert.strictEqual(ctx.norm('철골기둥'), '철골기둥');
assert.strictEqual(ctx.norm('SRC기둥'), 'SRC기둥');
assert.strictEqual(ctx.norm('원형기둥'), '원형기둥');

// 안 고친 부재 = 분류 칸
assert.strictEqual(ctx.bucket('구조체', '보(G)'), '구조체');
assert.strictEqual(ctx.bucket('구조체', ''), '구조체');

// 철골보(G)에서 ⚙ → 「철골보」 칸. 거기서 지워도 보(분류 칸)는 그대로, 철골보(B)도 같은 칸
const b = ctx.own('구조체', '철골보(G)');
assert.strictEqual(b, '구조체|철골보');
assert.strictEqual(j(st.customDefectTypes[b]), j(['하부면 균열', '공극']));
assert.strictEqual(j(st.hiddenDefectTypes[b]), j(['기타']));
assert.strictEqual(j(st.favoriteDefectTypes[b]), j(['균열']));
st.customDefectTypes[b].splice(0, 1);
assert.strictEqual(j(st.customDefectTypes['구조체']), j(['하부면 균열', '공극']), '보 쪽은 안 지워짐');
assert.strictEqual(ctx.bucket('구조체', '철골보(B)'), b, '철골보(B)도 같은 칸');
assert.strictEqual(ctx.bucket('구조체', '보(G)'), '구조체');
assert.strictEqual(ctx.own('구조체', '철골보(B)'), b, '다시 복사하지 않음');

// 예전에 만든 「구조체|보(G)」 칸은 「보」로 이어 씀
st.customDefectTypes['구조체|보(G)'] = ['하부면 균열', '보 처짐'];
st.hiddenDefectTypes['구조체|보(G)'] = [];
st.defectTypeOrder['구조체|보(G)'] = ['보 처짐'];
assert.strictEqual(ctx.bucket('구조체', '보(B)'), '구조체|보(G)', '보(B)도 예전 보(G) 칸을 봄');
const bb = ctx.own('구조체', '보(B)');
assert.strictEqual(bb, '구조체|보');
assert.strictEqual(j(st.customDefectTypes[bb]), j(['하부면 균열', '보 처짐']), '예전 보(G) 칸에서 복사');
assert.strictEqual(ctx.bucket('구조체', '보(G)'), '구조체|보');

// --- 원인 ---
const fields = { defectCategory: '구조체', defectComponent: '보(G)' };
const cctx = {
    window: { state: {
        customDefectCauses: { '균열': ['바닥 침하'] },
        hiddenDefectCauses: { '균열': ['철근 부식 팽창'] },
        defectCauseOrder: { '균열': ['건조수축 및 재료적 특성', '바닥 침하'] },
        favoriteDefectCauses: { '균열': ['건조수축 및 재료적 특성'] }
    } },
    document: { getElementById: (id) => (id in fields ? { value: fields[id] } : null) },
    getDefectComboValue: (sel) => (sel && sel.value) || '',
    getDefectFavoriteList: (field, bucket) => (cctx.window.state.favoriteDefectCauses[bucket] || []).slice(),
    seedCauseSettingsFromLegacyKey: () => {}
};
vm.createContext(cctx);
vm.runInContext(HELPERS.concat([
    extractFunction(app, 'function causeTreeContext('),
    extractFunction(app, 'function causeTreeBucketKey('),
    extractFunction(app, 'function findOwnedCauseBucket('),
    extractFunction(app, 'function causeSettingsBucket('),
    extractFunction(app, 'function ownCauseSettingsBucket('),
    'this.bucket = causeSettingsBucket; this.own = ownCauseSettingsBucket;'
]).join('\n'), cctx);
const cs = cctx.window.state;
assert.strictEqual(cctx.bucket('균열'), '균열', '안 고친 칸 = 예전 종류 칸');
const cb = cctx.own('균열');
assert.strictEqual(cb, '구조체|보|균열');
assert.strictEqual(j(cs.customDefectCauses[cb]), j(['바닥 침하']));
assert.strictEqual(j(cs.favoriteDefectCauses[cb]), j(['건조수축 및 재료적 특성']));
cs.customDefectCauses[cb].push('보 처짐');
assert.strictEqual(j(cs.customDefectCauses['균열']), j(['바닥 침하']), '다른 부재(종류 칸)는 그대로');
fields.defectComponent = '기둥';
assert.strictEqual(cctx.bucket('균열'), '균열', '기둥은 아직 종류 칸');
fields.defectComponent = '보(B)';
assert.strictEqual(cctx.bucket('균열'), cb, '보(B)도 보 칸');

console.log('test-defect-type-per-component: ok');
