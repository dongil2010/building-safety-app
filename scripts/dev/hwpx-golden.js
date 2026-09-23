/**
 * 한글 출력 "전후 비교" 장치 — 브라우저 전용 개발 도구 (CI에서는 안 돈다).
 *
 * 한글 출력 코드를 고칠 때, 고치기 전과 후에 같은 데이터로 파일을 만들어 **zip 안 파일
 * 40여 개가 바이트까지 같은지** 본다. 구조 검사기(js/shared/hwpx-validate.js)는 표 모양만
 * 보고 어느 칸에 어떤 값이 들어갔는지는 못 보는데, 이건 그것까지 잡는다.
 *
 * 2026-09-23 처음 만들 때 확인한 것:
 *   - 같은 입력이면 출력이 바이트까지 같다(날짜·난수 고정 불필요).
 *   - 로그인·도면 없이도 끝까지 돈다. 단, 미리보기 창이 숨겨져 있으면 브라우저가
 *     requestAnimationFrame을 멈춰서 층 사이 yieldToUi()에서 영영 멈춘다 → prepare()가
 *     rAF를 setTimeout으로 바꾼다.
 *
 * 쓰는 법 (로컬 서버 http://localhost:8000 을 연 브라우저 콘솔에서):
 *   eval(await (await fetch('/scripts/dev/hwpx-golden.js')).text());
 *   await HwpxGolden.saveBaseline('before');     // 고치기 전
 *   // ... 코드 수정, 새로고침(서비스워커 캐시 비우기), 위 eval 다시 ...
 *   await HwpxGolden.compare('before');          // { same: true } 여야 한다
 *
 * 기준 출력은 IndexedDB에 저장돼서 새로고침해도 남는다.
 * **실제 파일은 내려받지 않는다** — 다운로드 링크 클릭을 가로챈다.
 */
(function (root) {
    'use strict';

    var DB_NAME = 'bsa_hwpx_golden';
    var STORE = 'baselines';

    // 1x1 PNG — 사진 경로(디코드·크기 계산·BinData 추가)를 태우기 위한 최소 이미지
    var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    var FIXED_TS = 1758585600000; // 2026-09-23 00:00 UTC — 저장 시각이 출력에 새지 않게

    var prepared = false;
    var captured = [];

    function prepare() {
        if (prepared) return;
        prepared = true;
        // 숨겨진 창에서는 rAF가 멈춘다 → 층 사이 yieldToUi()가 안 끝난다
        root.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 0); };
        var origCOU = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function (b) {
            if (b && b.type === 'application/hwp+zip') captured.push(b);
            return origCOU(b);
        };
        var origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            if (this.hasAttribute('download')) return; // 실제 다운로드 막기
            return origClick.call(this);
        };
    }

    /** 결함 한 건 */
    function defect(bldgId, fc, i, extra) {
        return Object.assign({
            id: bldgId + '_' + fc + '_d' + i,
            no: 'NO.' + String(i).padStart(2, '0'),
            category: '구조체', component: '기둥', location: fc, defectType: '균열', cause: '건조수축',
            crackWidth: '0.2', crackLength: '100', size: '0.2x100', itemCount: '',
            photos: [], surveyRound: '2026년_하반기',
            x: 100 + i * 10, y: 100, targetX: 120 + i * 10, targetY: 120,
            updatedAt: FIXED_TS, contentUpdatedAt: FIXED_TS, mapMarkedAt: FIXED_TS,
            inspectorName: '검사자'
        }, extra || {});
    }

    /**
     * 출력이 거치는 길을 되도록 많이 태우는 가짜 건물.
     * 종별(1·2종/3종) × 점검 종류(정밀/정기) 네 가지 템플릿을 각각 고른다.
     */
    function buildFixture(facilityGrade, inspectionType) {
        var tag = (facilityGrade.indexOf('3') >= 0 ? 'g3' : 'g12') + (inspectionType.indexOf('정밀') >= 0 ? 'p' : 'r');
        var id = 'bldg-golden-' + tag;
        var fk = function (c) { return id + '_' + c; };
        var bldg = {
            id: id, name: '비교용건물', siteName: '비교용', facilityGrade: facilityGrade, inspectionType: inspectionType,
            inspectionYear: '2026년', inspectionPeriod: '하반기', address: '광주광역시',
            floorsList: [
                { floorCode: 'B1F', floorLabel: '지하1층' },
                { floorCode: '1F', floorLabel: '지상1층' },
                { floorCode: '2F', floorLabel: '지상2층' },
                { floorCode: 'EXT', floorLabel: '외부' }
            ]
        };
        var defects = {};
        defects[fk('B1F')] = [defect(id, 'B1F', 1, { photos: [PNG] }), defect(id, 'B1F', 2, { defectType: '누수', crackWidth: '', crackLength: '', size: '' })];
        defects[fk('1F')] = [
            defect(id, '1F', 3, { photos: [PNG, PNG] }),
            defect(id, '1F', 4, { defectType: '박리', crackWidth: '', crackLength: '', size: '100x200', component: '보' }),
            defect(id, '1F', 5, { isProgress: true, component: '슬래브' })
        ];
        defects[fk('2F')] = [defect(id, '2F', 6, { crackWidth: '0.3', crackLength: '250' })];
        defects[fk('EXT')] = [defect(id, 'EXT', 7, { component: '외벽', category: '비구조체' })];

        var ndt = {};
        ndt[fk('1F')] = [
            { id: 'n-t1', category: '기울기', no: 'T-1', location: '외벽 동측', component: '외벽', height: 'H = 3,000mm', avgValue: '3', tiltRatio: '1/1000', grade: 'a등급', dispDirection: '←' },
            { id: 'n-t2', category: '기울기', no: 'T-2', location: '외벽 서측', component: '외벽', height: 'H = 3,000mm', avgValue: '12', tiltRatio: '1/250', grade: 'c등급', dispDirection: '→' },
            { id: 'n-c1', category: '탄산화', no: 'C-1', location: '기둥', component: '기둥', carbDepth: 12, carbCover: 40, carbRemainMm: 28 },
            { id: 'n-s1', category: '강도', no: 'S-1', location: '기둥', component: '기둥', strengthFinal: 24.1, strengthRatio: 100, strengthGrade: 'a' },
            {
                id: 'n-f1', category: '내화피복', no: 'F-1', location: '철골보', component: '보', fireproofDesign: 'THK 25 뿜칠',
                fpFlange: { readings: [22, 23, 24], unavailable: false }, fpWeb: { readings: [21, 22, 23], unavailable: false }
            }
        ];
        ndt[fk('2F')] = [
            { id: 'n-c2', category: '탄산화', no: 'C-2', location: '보', component: '보', carbDepth: 18, carbCover: 40, carbRemainMm: 22 }
        ];

        var groups = {};
        groups[fk('1F')] = [
            { id: 'g-1', groupNo: 1, category: '변위', locationType: '바닥', measureLength: 10, points: [{ level: 2 }, { level: 1 }, { level: 0 }] },
            { id: 'g-2', groupNo: 2, category: '부재변위', locationType: '보', measureLength: 4.8, points: [{ level: 0 }, { level: -1 }, { level: 0 }] }
        ];

        return { tag: tag, bldg: bldg, defects: defects, ndtData: ndt, ndtDisplacementGroups: groups };
    }

    var FIXTURES = [
        ['제2종시설물', '정밀안전점검'],
        ['제2종시설물', '정기안전점검'],
        ['제3종시설물', '정밀안전점검'],
        ['제3종시설물', '정기안전점검']
    ];

    /** 가짜 건물 하나로 실제 출력 함수를 돌려 zip 속 파일을 전부 꺼낸다 */
    async function runFixture(fx) {
        prepare();
        var s = root.state;
        s.buildings = [fx.bldg];
        s.currentBuilding = fx.bldg;
        s.currentBuildingId = fx.bldg.id;
        s.currentFloor = '1F';
        s.defects = fx.defects;
        s.ndtData = fx.ndtData;
        s.ndtDisplacementGroups = fx.ndtDisplacementGroups;

        captured.length = 0;
        await root.exportHwpxSurveyTable();
        if (!captured.length) throw new Error(fx.tag + ': 파일이 안 만들어졌다');
        var zip = await root.JSZip.loadAsync(captured[0]);
        var files = {};
        var names = Object.keys(zip.files).sort();
        for (var i = 0; i < names.length; i += 1) {
            var f = zip.file(names[i]);
            if (!f) continue;
            var textual = /\.(xml|hpf|rdf|txt)$|mimetype$/.test(names[i]);
            files[names[i]] = await f.async(textual ? 'string' : 'base64');
        }
        return files;
    }

    async function runAll() {
        var out = {};
        for (var i = 0; i < FIXTURES.length; i += 1) {
            var fx = buildFixture(FIXTURES[i][0], FIXTURES[i][1]);
            out[fx.tag] = await runFixture(fx);
        }
        return out;
    }

    // ---- IndexedDB (새로고침해도 기준 출력이 남게) ----
    function openDb() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function dbPut(key, value) {
        var db = await openDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }
    async function dbGet(key) {
        var db = await openDb();
        return new Promise(function (resolve, reject) {
            var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function summarize(all) {
        var v = root.BSA && root.BSA.hwpxValidate;
        var out = {};
        Object.keys(all).forEach(function (tag) {
            var files = all[tag];
            var secs = Object.keys(files).filter(function (n) { return /^Contents\/section\d+\.xml$/.test(n); });
            var tables = 0;
            var problems = 0;
            secs.forEach(function (n) {
                if (!v) return;
                var r = v.validateSection(files[n]);
                tables += r.tables;
                problems += r.problems.length;
            });
            out[tag] = { files: Object.keys(files).length, sectionKB: secs.map(function (n) { return Math.round(files[n].length / 1024); }), tables: tables, structureProblems: problems };
        });
        return out;
    }

    /** 고치기 전 출력을 저장한다 */
    async function saveBaseline(label) {
        var all = await runAll();
        await dbPut(label || 'before', all);
        return { saved: label || 'before', summary: summarize(all) };
    }

    /** 지금 코드로 다시 출력해서 저장된 기준과 비교한다. 다른 곳은 앞뒤 문맥을 보여 준다. */
    async function compare(label) {
        var base = await dbGet(label || 'before');
        if (!base) throw new Error('기준 출력이 없다: ' + (label || 'before') + ' — saveBaseline 먼저');
        var now = await runAll();
        var diffs = [];
        Object.keys(base).forEach(function (tag) {
            var a = base[tag] || {};
            var b = now[tag] || {};
            var names = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
            names.forEach(function (n) {
                if (a[n] === b[n]) return;
                if (a[n] == null || b[n] == null) {
                    diffs.push({ tag: tag, file: n, kind: a[n] == null ? '새로 생김' : '없어짐' });
                    return;
                }
                var i = 0;
                while (i < a[n].length && a[n][i] === b[n][i]) i += 1;
                diffs.push({
                    tag: tag, file: n, lenBefore: a[n].length, lenAfter: b[n].length, at: i,
                    before: a[n].slice(Math.max(0, i - 120), i + 120),
                    after: b[n].slice(Math.max(0, i - 120), i + 120)
                });
            });
        });
        return { same: diffs.length === 0, differing: diffs.length, diffs: diffs.slice(0, 8), summary: summarize(now) };
    }

    root.HwpxGolden = {
        prepare: prepare,
        buildFixture: buildFixture,
        runFixture: runFixture,
        runAll: runAll,
        saveBaseline: saveBaseline,
        compare: compare,
        FIXTURES: FIXTURES
    };
})(window);
