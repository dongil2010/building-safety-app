'use strict';
// 2026-11-13 「보에서 만든 하부면 균열이 철골보에도 뜨고, 철골보에서 지우면 보에서도 사라짐」
// 결함 종류 세팅(직접 추가·숨김·순서)은 「분류|부재」 칸. 아직 안 고친 부재는 분류 칸을 그대로 쓴다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const ctx = {
    window: { state: {
        customDefectTypes: { '구조체': ['하부면 균열', '공극'] },
        hiddenDefectTypes: { '구조체': ['기타'] },
        defectTypeOrder: { '구조체': ['하부면 균열', '공극'] }
    } }
};
vm.createContext(ctx);
vm.runInContext([
    extractFunction(app, 'function defectTypeComponentBucketKey('),
    extractFunction(app, 'function defectTypeSettingsBucket('),
    extractFunction(app, 'function ownDefectTypeSettingsBucket('),
    'this.bucket = defectTypeSettingsBucket; this.own = ownDefectTypeSettingsBucket;'
].join('\n'), ctx);
const st = ctx.window.state;
const j = (v) => JSON.stringify(v);

// 안 고친 부재 = 분류 칸 (기존 세팅 그대로 보임)
assert.strictEqual(ctx.bucket('구조체', '보(G)'), '구조체');
assert.strictEqual(ctx.bucket('구조체', ''), '구조체');

// 철골보에서 ⚙ → 분류 세팅을 복사한 철골보 칸이 생기고, 거기서 지워도 보(분류 칸)는 그대로
const b = ctx.own('구조체', '철골보(G)');
assert.strictEqual(b, '구조체|철골보(G)');
assert.strictEqual(j(st.customDefectTypes[b]), j(['하부면 균열', '공극']));
assert.strictEqual(j(st.hiddenDefectTypes[b]), j(['기타']));
st.customDefectTypes[b].splice(0, 1);
assert.strictEqual(j(st.customDefectTypes['구조체']), j(['하부면 균열', '공극']), '보 쪽은 안 지워짐');
assert.strictEqual(ctx.bucket('구조체', '철골보(G)'), b);
assert.strictEqual(ctx.bucket('구조체', '보(G)'), '구조체');
// 이미 있는 칸은 다시 복사하지 않음
st.customDefectTypes[b].push('용접부 균열');
assert.strictEqual(ctx.own('구조체', '철골보(G)'), b);
assert.strictEqual(j(st.customDefectTypes[b]), j(['공극', '용접부 균열']));

// --- 원인: 「분류|부재|종류」 칸. 같은 「균열」이라도 보와 기둥은 따로 ---
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
vm.runInContext([
    extractFunction(app, 'function causeTreeContext('),
    extractFunction(app, 'function causeTreeBucketKey('),
    extractFunction(app, 'function causeSettingsBucket('),
    extractFunction(app, 'function ownCauseSettingsBucket('),
    'this.bucket = causeSettingsBucket; this.own = ownCauseSettingsBucket;'
].join('\n'), cctx);
const cs = cctx.window.state;
assert.strictEqual(cctx.bucket('균열'), '균열', '안 고친 칸 = 예전 종류 칸');
const cb = cctx.own('균열');
assert.strictEqual(cb, '구조체|보(G)|균열');
assert.strictEqual(j(cs.customDefectCauses[cb]), j(['바닥 침하']));
assert.strictEqual(j(cs.favoriteDefectCauses[cb]), j(['건조수축 및 재료적 특성']));
cs.customDefectCauses[cb].push('보 처짐');
assert.strictEqual(j(cs.customDefectCauses['균열']), j(['바닥 침하']), '기둥 등 다른 부재(종류 칸)는 그대로');
fields.defectComponent = '기둥';
assert.strictEqual(cctx.bucket('균열'), '균열', '기둥은 아직 종류 칸');
fields.defectComponent = '보(G)';
assert.strictEqual(cctx.bucket('균열'), cb);

console.log('test-defect-type-per-component: ok');
