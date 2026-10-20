#!/usr/bin/env node
'use strict';
/** 2026-10-20 빈칸 당기기: 도면(groupNo)·표(no)가 동기화 후에도 같은 번호, 빈 번호 찾기, 되돌리기 번호 시각 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const sm = require('../js/core/sync-merge.js');
function fn(name) {
    const start = app.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    let i = app.indexOf('{', start), depth = 0;
    for (; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
    }
}
const names = ['stripDefectNoSuffix', 'formatDefectNoSeq', 'applyDefectGroupNumbering', 'stampDefectNumberChanged',
    'healStaleDefectGroupNos', 'findDefectMarkingNumberGaps', 'compactDefectMarkingNumberGaps'];
const window = {};
const api = new Function('window', names.map(fn).join('\n') + '\nreturn {' + names.join(',') + '};')(window);

const T0 = 1000;
const mk = (id, n) => ({ id, no: api.formatDefectNoSeq(n), groupId: id, groupNo: api.formatDefectNoSeq(n), updatedAt: T0, contentUpdatedAt: T0, groupUpdatedAt: T0 });

// 빈 번호
assert.deepStrictEqual(api.findDefectMarkingNumberGaps([mk('a', 1), mk('b', 4), mk('c', 6)]), [2, 3, 5]);
assert.deepStrictEqual(api.findDefectMarkingNumberGaps([mk('a', 1), mk('b', 2)]), []);
assert.deepStrictEqual(api.findDefectMarkingNumberGaps([]), []);

// 당기기 → 서버(옛 값)와 병합해도 no·groupNo 모두 새 번호
const server = [mk('a', 1), mk('b', 3)];
const local = JSON.parse(JSON.stringify(server));
const r = api.compactDefectMarkingNumberGaps(local);
assert.strictEqual(r.moved, 1);
const b = local.find((d) => d.id === 'b');
assert.strictEqual(b.no, 'NO.02');
assert.strictEqual(b.groupNo, 'NO.02');
assert.ok(b.groupUpdatedAt > T0, 'groupUpdatedAt 올라감');
const merged = sm.mergeDefectRecord(server[1], b, {});
assert.strictEqual(merged.no, 'NO.02');
assert.strictEqual(merged.groupNo, 'NO.02', '도면 라벨(groupNo)도 새 번호');

// 예전 버그로 groupNo만 옛 번호로 남은 결함 → 당기기 때 no 기준으로 맞춤
const stale = [mk('a', 1), Object.assign(mk('b', 2), { groupNo: 'NO.03' })];
const r2 = api.compactDefectMarkingNumberGaps(stale);
assert.strictEqual(r2.healed, 1);
assert.strictEqual(stale[1].groupNo, 'NO.02');

// 되돌리기: 번호만 바뀐 경우에도 시각을 올리는 코드가 있는지
assert.ok(/numChanged[\s\S]{0,400}groupUpdatedAt = bsaStampAfter/.test(app));
assert.ok(app.includes('function applyDefectHistoryEntry(') && app.includes('__multi'));
// 알림
assert.ok(app.includes("id = 'defectGapNotice'") && app.includes('빈 번호 있음:'));
console.log('test-compact-gaps-sync: ok');
// 도면 전환 후 마킹 크기: 다른 층 설정을 이 층에 저장하지 않음 + 그리기 직전 현재 층 설정 보장
{
    const names2 = ['getFloorMapStyleKey', 'saveFloorMapStyleSettings', 'ensureMapStyleMatchesCurrentFloor', 'applyFloorMapStyleSettings'];
    const state = { currentBuildingId: 'B', currentFloor: '1F', styleSizes: { defect: { pin: 2 } }, floorMapStyleSettings: { B_1F: { styleSizes: { defect: { pin: 2 } } }, B_2F: { styleSizes: { defect: { pin: 0.5 } } } }, _globalStyleSizesFallback: {} };
    const env = {
        state, window: {}, _mapStyleRenderContext: null,
        snapshotMapStyleSettings: () => ({ styleSizes: JSON.parse(JSON.stringify(state.styleSizes)) }),
        cloneStyleSizesSubset: () => ({}), cloneStyleSizesMap: (m) => JSON.parse(JSON.stringify(m || {})),
        mergeStyleSizesSubset: (a, b) => Object.assign({}, a || {}, b || {}), NDT_STYLE_SIZE_KEYS: []
    };
    const keys = Object.keys(env);
    const f = new Function(...keys, names2.map(fn).join('\n') + '\nreturn {' + names2.join(',') + '};')(...keys.map((k) => env[k]));
    f.applyFloorMapStyleSettings('1F', 'B');
    state.currentFloor = '2F';                       // 설정을 안 바꾸고 층만 바뀐 길
    f.saveFloorMapStyleSettings('2F', 'B');          // 1층 크기를 2층에 저장하면 안 됨
    assert.strictEqual(state.floorMapStyleSettings.B_2F.styleSizes.defect.pin, 0.5);
    f.ensureMapStyleMatchesCurrentFloor();
    assert.strictEqual(state.styleSizes.defect.pin, 0.5, '그리기 직전 2층 크기로');
    assert.strictEqual(state.floorMapStyleSettings.B_1F.styleSizes.defect.pin, 2, '1층 크기 유지');
}
console.log('test-compact-gaps-sync: map style ok');
