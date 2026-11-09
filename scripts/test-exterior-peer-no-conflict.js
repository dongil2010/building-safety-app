#!/usr/bin/env node
'use strict';
/**
 * 2026-11-09 외부 결함 번호 겹침(H2): 두 사람이 동시에 다른 외부 면을 찍으면 또 겹치던 문제.
 * - 새 결함 창을 열 때도 다른 외부 면을 다시 받는다(force, 5초에 한 번)
 * - 받은 뒤 이 기기가 새로 만들어 아직 서버에 없는 결함이 다른 면 번호와 겹치면 옮긴다(먼저 올린 사람 번호는 그대로)
 * - 다른 면은 결함만 합친다(도면 주소를 서버의 옛 주소로 덮지 않음)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { extractFunction } = require('./lib-extract-fn');
const syncMerge = require(path.join(root, 'js', 'core', 'sync-merge.js'));
const noConflict = require(path.join(root, 'js', 'core', 'no-conflict.js'));

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const src = [
    'function refreshExteriorPeerFloorsFromServer(',
    'async function refreshExteriorPeerFloorsOnce(',
    'function mergeFloorDefectsOnlyIntoState(',
    'function resolveExteriorDefectNoConflicts('
].map((h) => extractFunction(app, h)).join('\n');

function makeEnv({ server, local, serverKnown, openId }) {
    const B = 'yg';
    const bldg = {
        id: B, name: '영광군청 본관',
        floorsList: [{ floorCode: 'EXT_1', floorLabel: '외부 정면' }, { floorCode: 'EXT_2', floorLabel: '외부 배면' }, { floorCode: '1F', floorLabel: '1층' }],
        floorDrawings: { EXT_2: 'data:image/png;base64,' + 'A'.repeat(64) }
    };
    const state = { companyId: 'c', currentBuildingId: B, currentFloor: 'EXT_1', defects: {}, deletedDefectIds: {}, deletedDefectAt: {} };
    Object.entries(local).forEach(([fc, arr]) => { state.defects[`${B}_${fc}`] = arr.map((d) => Object.assign({}, d)); });
    const known = new Map();
    Object.entries(serverKnown || {}).forEach(([fc, ids]) => known.set(`${B}_${fc}`, new Set(ids)));
    const reads = [];
    const dirty = new Set();
    const toasts = [];
    const win = {
        state,
        isExteriorFloorCode: (code) => String(code).startsWith('EXT'),
        BSA: { noConflict },
        showToast: (m) => toasts.push(m)
    };
    const deps = {
        window: win,
        document: { getElementById: (id) => (id === 'defectPinId' ? { value: openId || '' } : null) },
        navigator: { onLine: true },
        db: {},
        elements: { defectModal: { classList: { contains: () => !!openId } } },
        console: { info() {}, warn() {} },
        _exteriorPeersFreshAt: new Map(),
        _exteriorPeersInFlight: new Map(),
        EXTERIOR_PEERS_FRESH_MS: 60000,
        FLOOR_READ_CONCURRENCY: 4,
        _syncInFlight: false,
        isRemoteSyncing: false,
        buildingFloorCodesForBackup: (b) => b.floorsList.map((f) => f.floorCode),
        runPool: async (items, _n, fn) => { await Promise.all(items.map(fn)); },
        readFloorBundleStrict: async (_b, code) => {
            reads.push(code);
            await new Promise((r) => setTimeout(r, 5));
            return server[code] || null;
        },
        saveStateToLocalStorage() {},
        noteServerDefectIds: (k, items) => known.set(k, new Set(items.map((d) => String(d.id)))),
        serverDefectIdsOfFloor: (k) => known.get(k) || null,
        seedPhotoCacheFromUrlMap() {},
        emptyFloorBundle: () => ({ markings: { items: [], deletedIds: [], deletedAt: {} } }),
        mergeDefectsMaps: syncMerge.mergeDefectsMaps,
        markFloorKeyDirty: (k) => dirty.add(k)
    };
    const names = Object.keys(deps);
    const api = new Function(...names, src + '; return { refreshExteriorPeerFloorsFromServer };')(...names.map((k) => deps[k]));
    return { api, bldg, state, reads, dirty, toasts, deps, key: (fc) => `${B}_${fc}` };
}

const d = (id, no, extra) => Object.assign({ id, no, x: 1, y: 1, updatedAt: 10, contentUpdatedAt: 10 }, extra || {});
const nos = (arr) => (arr || []).map((x) => x.no).sort();

(async () => {
    // 1) 정면에서 내가 방금 만든 NO.04(아직 서버에 없음) ↔ 동료가 배면에 먼저 올린 NO.04 → 내 것만 NO.05로
    {
        const env = makeEnv({
            local: { EXT_1: [d('a1', 'NO.01'), d('a2', 'NO.02'), d('a3', 'NO.03'), d('mine', 'NO.04')] },
            serverKnown: { EXT_1: ['a1', 'a2', 'a3'] },
            server: {
                EXT_2: {
                    markings: { items: [d('b4', 'NO.04')], deletedIds: [], deletedAt: {} },
                    drawing: { rasterUrl: 'https://firebasestorage.googleapis.com/old-drawing.png' }
                }
            }
        });
        const res = await env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1', { force: true });
        assert.strictEqual(res.merged, 1);
        assert.deepStrictEqual(nos(env.state.defects[env.key('EXT_2')]), ['NO.04'], '배면 결함을 받음');
        const front = env.state.defects[env.key('EXT_1')];
        assert.strictEqual(front.find((x) => x.id === 'mine').no, 'NO.05', '내 새 결함은 다음 번호로');
        assert.deepStrictEqual(front.filter((x) => x.id !== 'mine').map((x) => x.no), ['NO.01', 'NO.02', 'NO.03'], '서버에 있던 번호는 그대로');
        assert.ok(env.dirty.has(env.key('EXT_1')), '바뀐 면은 다시 올림');
        assert.strictEqual(res.changes.length, 1);
        assert.strictEqual(env.toasts.length, 1, '알림');
        assert.ok(env.bldg.floorDrawings.EXT_2.startsWith('data:'), '다른 면 도면은 건드리지 않음(결함만 합침)');
    }

    // 2) 지금 면의 서버 확인을 아직 못 했으면(서버 id 모름) 아무것도 옮기지 않음
    {
        const env = makeEnv({
            local: { EXT_1: [d('a1', 'NO.01'), d('mine', 'NO.04')] },
            serverKnown: {},
            server: { EXT_2: { markings: { items: [d('b4', 'NO.04')], deletedIds: [], deletedAt: {} } } }
        });
        const res = await env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1', { force: true });
        assert.deepStrictEqual(res.changes, []);
        assert.strictEqual(env.state.defects[env.key('EXT_1')].find((x) => x.id === 'mine').no, 'NO.04');
        assert.strictEqual(env.dirty.size, 0);
    }

    // 3) 수정창에 열려 있는 결함은 옮기지 않고, 그 번호는 다른 결함이 쓰지 않음
    {
        const env = makeEnv({
            local: { EXT_1: [d('a1', 'NO.01'), d('open', 'NO.06'), d('mine', 'NO.04')] },
            serverKnown: { EXT_1: ['a1'] },
            openId: 'open',
            server: { EXT_2: { markings: { items: [d('b4', 'NO.04'), d('b5', 'NO.05')], deletedIds: [], deletedAt: {} } } }
        });
        await env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1', { force: true });
        const front = env.state.defects[env.key('EXT_1')];
        assert.strictEqual(front.find((x) => x.id === 'open').no, 'NO.06', '열린 결함 번호 그대로');
        assert.strictEqual(front.find((x) => x.id === 'mine').no, 'NO.07', '열린 결함 번호(NO.06)를 피해 다음 번호');
    }

    // 4) 겹침 없으면 그대로, 1분 안 다시 부르면 건너뜀(force면 다시 받음)
    {
        const env = makeEnv({
            local: { EXT_1: [d('a1', 'NO.01')] },
            serverKnown: { EXT_1: ['a1'] },
            server: { EXT_2: { markings: { items: [d('b2', 'NO.02')], deletedIds: [], deletedAt: {} } } }
        });
        const r1 = await env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1');
        assert.deepStrictEqual(r1.changes, []);
        const r2 = await env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1');
        assert.strictEqual(r2.skipped, 'recent');
        const r3 = await env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1', { force: true });
        assert.strictEqual(r3.merged, 1, '새 결함 창(force)은 1분 안이어도 받음');
        assert.deepStrictEqual(env.reads, ['EXT_2', 'EXT_2'], '외부 면만 읽음(1층은 안 읽음)');
    }

    // 5) 면 열기와 새 결함 창이 동시에 부르면 한 번만 읽음
    {
        const env = makeEnv({
            local: { EXT_1: [] },
            serverKnown: { EXT_1: [] },
            server: { EXT_2: { markings: { items: [d('b2', 'NO.02')], deletedIds: [], deletedAt: {} } } }
        });
        const [x, y] = await Promise.all([
            env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1'),
            env.api.refreshExteriorPeerFloorsFromServer(env.bldg, 'EXT_1', { force: true })
        ]);
        assert.strictEqual(x, y, '같은 결과');
        assert.deepStrictEqual(env.reads, ['EXT_2'], '한 번만 읽음');
    }

    // 6) 외부가 아닌 층은 아무것도 안 함
    {
        const env = makeEnv({ local: {}, serverKnown: {}, server: {} });
        const r = await env.api.refreshExteriorPeerFloorsFromServer(env.bldg, '1F', { force: true });
        assert.strictEqual(r.skipped, 'notexterior');
        assert.deepStrictEqual(env.reads, []);
    }

    // --- 연결 ---
    const part09 = fs.readFileSync(path.join(root, 'app', '09-settings-input-camera.js'), 'utf8');
    assert.ok(/noEl\.dataset\.autoNo && typeof window\.pullExteriorPeersForNewDefect === 'function'/.test(part09), '새 결함 창에서 다시 받기');
    const fn = extractFunction(app, 'function pullExteriorPeersForNewDefect(');
    assert.ok(/EXTERIOR_PEERS_ON_NEW_MS/.test(fn) && /\{ force: true \}/.test(fn), '5초에 한 번, force');
    const once = extractFunction(app, 'async function refreshExteriorPeerFloorsOnce(');
    assert.ok(!/mergeFloorBundleIntoState\(/.test(once), '다른 면은 층 묶음 전체를 합치지 않음');
    const auto = extractFunction(app, 'function refreshNewDefectAutoNo(');
    assert.ok(/defectModal\.classList\.contains\('open'\)/.test(auto), '창이 열려 있을 때만 번호를 다시 매김');

    console.log('test-exterior-peer-no-conflict: ok');
})().catch((e) => { console.error(e); process.exit(1); });
