#!/usr/bin/env node
'use strict';

/**
 * app.js 조각 관리 (2026-11-08)
 *
 * app.js(7만 줄)는 이제 app/NN-이름.js 조각을 이어 붙여 만든 파일이다.
 * 브라우저·테스트·배포는 지금처럼 app.js 하나만 쓴다. 사람과 AI는 조각을 고친다.
 *
 *   node scripts/app-parts.js join          조각 → app.js
 *   node scripts/app-parts.js split         app.js → 조각 (누가 app.js를 직접 고쳤을 때)
 *   node scripts/app-parts.js sync          바뀐 쪽을 조각마다 골라 맞춤(양쪽 다 바뀐 조각이 있으면 멈춤)
 *   node scripts/app-parts.js check         어긋나면 실패(npm test·배포·git-sync가 부름)
 *   node scripts/app-parts.js where 52370   app.js 줄 → 조각 파일:줄
 *
 * app.js 안의 표시 줄(모두 "// @@app-part" 로 시작, 동작 영향 없는 주석):
 *   1번 줄   // @@app-parts 자동 생성 파일 …           (경고)
 *   조각 앞  // @@app-part 03-canvas.js sha=… …        (경계 + 마지막 join 때 그 조각 내용의 해시)
 * 표시 줄을 모두 빼면 나누기 전 app.js와 바이트까지 같다.
 *
 * 「마지막 join 상태」는 따로 파일을 두지 않고 경계 줄의 sha= 에 적는다. 그래서 git으로 같이
 * 움직이고, 서로 다른 조각을 고친 두 사람의 병합도 표시 줄끼리 부딪히지 않는다.
 *   조각 내용 == app.js 구간            → 맞음
 *   app.js 구간만 sha와 다름            → app.js를 직접 고침 → split(또는 sync)
 *   조각만 sha와 다름                   → 조각을 고치고 join 안 함 → join(또는 sync)
 *   둘 다 sha와 다르고 서로도 다름       → 양쪽 다 고침 → 사람이 그 조각을 맞춰야 함
 *
 * 조각 파일의 1번 줄은 안내 주석(// @@app-part 이름 — …)이고 join 때 app.js 경계 줄로 바뀐다.
 * 그래서 app.js의 경계 줄 = 조각의 1번 줄이고, 줄 번호가 그대로 대응한다(where).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app.js');
const DIR = path.join(ROOT, 'app');
const PART_FILE_RE = /^\d{2}-[a-z0-9-]+\.js$/;
const MARK = '// @@app-part';
const HEADER_LINE = '// @@app-parts 자동 생성 파일 — 여기를 고치지 말고 app/ 조각을 고친 뒤 `node scripts/app-parts.js join` (CLAUDE.md 「app.js 조각」)\n';
const APP_MARK_RE = /^\/\/ @@app-part (\S+) sha=([0-9a-f]+)/;
const PART_HEAD_RE = /^\/\/ @@app-part (\S+)/;

// 동료 규칙 「한글 출력은 건들지 마」: scripts/test-pdf-preview-hwpx-layout.js가 이 구간을 sha256으로 고정한다.
// 경계가 이 안에 들어가면 그 해시가 바뀌므로 막는다.
const FORBID_START = '    // --- HWPX 균열 게이지·팁 측정결과';
const FORBID_END = '    function removeSingleDefectRecord(';

const partHead = (name) => `${MARK} ${name} — app.js의 일부(단독 실행 안 됨). 고친 뒤 \`node scripts/app-parts.js join\`\n`;
const appMark = (name, hash) => `${MARK} ${name} sha=${hash} — 원본은 app/${name} (여기 말고 거기서 고칠 것)\n`;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

class Stop extends Error {}
function stop(msg) { throw new Stop(msg); }

/** 줄 배열(각 줄 끝 \n 포함, 마지막 줄은 \n 없을 수 있음) */
function lines(text) {
    return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

function readText(file) {
    const raw = fs.readFileSync(file, 'utf8');
    const text = raw.replace(/\r\n/g, '\n');
    return { text, hadCr: text !== raw };
}

function writeIfChanged(file, text) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
    fs.writeFileSync(file, text, 'utf8');
    return true;
}

/** 조각 본문에 표시 줄이 섞이면 join/split 경계가 깨진다 */
function assertNoMarkInBody(body, where) {
    const bad = lines(body).findIndex((l) => l.startsWith(MARK));
    if (bad >= 0) stop(`${where}: 본문 ${bad + 2}번째 줄이 "${MARK}"로 시작한다 — 이 문구는 경계 표시 전용이라 쓸 수 없다.`);
}

function readParts() {
    if (!fs.existsSync(DIR)) stop('app/ 폴더가 없다.');
    const names = fs.readdirSync(DIR).filter((n) => PART_FILE_RE.test(n)).sort();
    if (!names.length) stop('app/ 에 조각(NN-이름.js)이 없다.');
    let hadCr = false;
    const parts = names.map((name) => {
        const r = readText(path.join(DIR, name));
        hadCr = hadCr || r.hadCr;
        const ls = lines(r.text);
        const m = ls.length ? PART_HEAD_RE.exec(ls[0]) : null;
        if (!m) stop(`app/${name}: 1번 줄이 "${MARK} ${name} …" 안내 주석이어야 한다(지우지 말 것).`);
        if (m[1] !== name) stop(`app/${name}: 1번 줄의 이름(${m[1]})이 파일 이름과 다르다.`);
        let body = ls.slice(1).join('');
        if (body && !body.endsWith('\n')) body += '\n';
        assertNoMarkInBody(body, `app/${name}`);
        return { name, body, hash: sha(body) };
    });
    return { parts, hadCr };
}

/** app.js → { sections:[{name, rec, body, hash, line}], hadCr, hasHeader } */
function readApp() {
    if (!fs.existsSync(APP)) stop('app.js가 없다 — `node scripts/app-parts.js join`으로 만들 것.');
    const r = readText(APP);
    const ls = lines(r.text);
    let i = 0;
    const hasHeader = ls.length > 0 && ls[0].startsWith('// @@app-parts ');
    if (hasHeader) i = 1;
    const sections = [];
    let cur = null;
    for (; i < ls.length; i++) {
        const l = ls[i];
        if (l.startsWith(MARK)) {
            const m = APP_MARK_RE.exec(l);
            if (!m) stop(`app.js ${i + 1}번 줄: 경계 표시 모양이 깨졌다(${l.trim().slice(0, 60)}…).`);
            cur = { name: m[1], rec: m[2], chunks: [], line: i + 1 };
            sections.push(cur);
        } else if (!cur) {
            stop(`app.js ${i + 1}번 줄: 첫 경계 표시보다 앞에 코드가 있다 — 어느 조각인지 알 수 없다.`);
        } else {
            cur.chunks.push(l);
        }
    }
    if (!sections.length) stop('app.js에 경계 표시(// @@app-part …)가 없다 — 조각에서 join으로 다시 만들 것.');
    sections.forEach((s) => {
        s.body = s.chunks.join('');
        delete s.chunks;
        s.hash = sha(s.body);
    });
    return { sections, hadCr: r.hadCr, hasHeader, lineCount: ls.length };
}

function buildApp(parts) {
    return HEADER_LINE + parts.map((p) => appMark(p.name, p.hash) + p.body).join('');
}

/** 한글 출력 고정 구간 안에 경계가 있으면 실패 메시지, 아니면 null */
function forbidProblem(text, label) {
    const a = text.indexOf(FORBID_START);
    const b = text.indexOf(FORBID_END);
    if (a < 0 || b < 0 || b < a) return `${label}: 한글 출력 고정 구간(${FORBID_START.trim()} ~ ${FORBID_END.trim()})을 못 찾았다.`;
    if (text.slice(a, b).indexOf('\n' + MARK) >= 0) {
        return `${label}: 한글 출력 고정 구간(test-pdf-preview-hwpx-layout.js가 해시로 고정) 안에 조각 경계가 있다 — 경계를 구간 밖으로 옮길 것.`;
    }
    return null;
}

/** 조각별 상태 비교 */
function compare(app, partsInfo) {
    const an = app.sections.map((s) => s.name);
    const pn = partsInfo.parts.map((p) => p.name);
    if (an.join('\n') !== pn.join('\n')) {
        const onlyApp = an.filter((n) => !pn.includes(n));
        const onlyPart = pn.filter((n) => !an.includes(n));
        let msg = 'app.js의 조각 목록과 app/ 폴더가 다르다.';
        if (onlyApp.length) msg += `\n  app.js에만: ${onlyApp.join(', ')}`;
        if (onlyPart.length) msg += `\n  app/에만: ${onlyPart.join(', ')}`;
        if (!onlyApp.length && !onlyPart.length) msg += '\n  (순서가 다름)';
        msg += '\n  조각을 새로 만들었거나 이름을 바꿨으면 `join`, app.js에서 경계를 옮겼으면 `split --force`.';
        return { structure: msg, rows: [] };
    }
    const rows = app.sections.map((s, k) => {
        const p = partsInfo.parts[k];
        let state;
        if (s.body === p.body) state = s.rec === p.hash ? 'ok' : 'same';
        else if (p.hash === s.rec) state = 'app';
        else if (s.hash === s.rec) state = 'part';
        else state = 'both';
        return { name: s.name, state, app: s, part: p };
    });
    return { structure: null, rows };
}

const STATE_TEXT = {
    same: '내용 같음(해시만 옛것 — join 하면 갱신)',
    app: 'app.js에서 직접 고침 → split',
    part: '조각을 고치고 join 안 함 → join',
    both: '양쪽 다 다르게 고침 → 직접 맞춰야 함',
};

function report(rows) {
    rows.filter((r) => r.state !== 'ok').forEach((r) => {
        console.log(`  app/${r.name}: ${STATE_TEXT[r.state]} (app.js ${r.app.line}번 줄부터)`);
    });
}

function cmdJoin(force) {
    const partsInfo = readParts();
    if (!force && fs.existsSync(APP)) {
        let app = null;
        try { app = readApp(); } catch (e) { if (!(e instanceof Stop)) throw e; }
        if (app) {
            const c = compare(app, partsInfo);
            const lost = c.rows.filter((r) => r.state === 'app' || r.state === 'both');
            if (lost.length) {
                report(lost);
                stop('app.js에 조각에 없는 수정이 있어 join을 멈췄다(덮으면 그 수정이 사라진다).\n'
                    + '  app.js 쪽만 고쳤으면 `split`/`sync`, 버려도 되면 `join --force`.');
            }
        }
    }
    const text = buildApp(partsInfo.parts);
    const bad = forbidProblem(text, 'join 결과');
    if (bad) stop(bad);
    const changed = writeIfChanged(APP, text);
    console.log(`[app-parts] join: 조각 ${partsInfo.parts.length}개 → app.js ${changed ? '새로 씀' : '바뀐 것 없음'}`);
}

function cmdSplit(force) {
    const app = readApp();
    const bad = forbidProblem(fs.readFileSync(APP, 'utf8'), 'app.js');
    if (bad) stop(bad);
    app.sections.forEach((s) => assertNoMarkInBody(s.body, `app.js 조각 ${s.name}`));
    if (!force) {
        const partsInfo = readParts();
        const c = compare(app, partsInfo);
        if (c.structure) stop(c.structure);
        const lost = c.rows.filter((r) => r.state === 'part' || r.state === 'both');
        if (lost.length) {
            report(lost);
            stop('조각에 app.js에 없는 수정이 있어 split을 멈췄다(덮으면 그 수정이 사라진다).\n'
                + '  `sync`로 조각마다 맞추거나, 조각 쪽을 버려도 되면 `split --force`.');
        }
    }
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
    let n = 0;
    app.sections.forEach((s) => {
        if (!PART_FILE_RE.test(s.name)) stop(`app.js 경계 이름 "${s.name}"이 NN-이름.js 모양이 아니다.`);
        if (writeIfChanged(path.join(DIR, s.name), partHead(s.name) + s.body)) {
            n++;
            console.log(`  app/${s.name} 갱신`);
        }
    });
    const extra = fs.readdirSync(DIR).filter((f) => PART_FILE_RE.test(f) && !app.sections.some((s) => s.name === f));
    if (extra.length) stop(`app.js에 없는 조각 파일이 app/에 남아 있다: ${extra.join(', ')} — 필요 없으면 지우고 다시 실행.`);
    console.log(`[app-parts] split: 조각 ${n}개 갱신`);
    cmdJoin(true); // 경계 줄 해시를 지금 내용으로 갱신(본문은 그대로)
}

function cmdSync() {
    if (!fs.existsSync(APP)) return cmdJoin(true);
    const app = readApp();
    const partsInfo = readParts();
    const c = compare(app, partsInfo);
    if (c.structure) stop(c.structure);
    const both = c.rows.filter((r) => r.state === 'both');
    if (both.length) {
        report(both);
        stop('같은 조각을 app.js와 app/ 양쪽에서 다르게 고쳤다 — 위 조각을 직접 맞춘 뒤\n'
            + '  조각이 맞으면 `join --force`, app.js가 맞으면 `split --force`.');
    }
    const fromApp = c.rows.filter((r) => r.state === 'app');
    const bad = forbidProblem(fs.readFileSync(APP, 'utf8'), 'app.js');
    if (fromApp.length && bad) stop(bad);
    fromApp.forEach((r) => {
        fs.writeFileSync(path.join(DIR, r.name), partHead(r.name) + r.app.body, 'utf8');
        console.log(`  app.js → app/${r.name}`);
    });
    c.rows.filter((r) => r.state === 'part').forEach((r) => console.log(`  app/${r.name} → app.js`));
    cmdJoin(true);
}

function cmdCheck() {
    const problems = [];
    const app = readApp();
    const partsInfo = readParts();
    if (!app.hasHeader) problems.push('app.js 1번 줄 경고 주석(// @@app-parts …)이 없다 → join');
    const c = compare(app, partsInfo);
    if (c.structure) problems.push(c.structure);
    const off = c.rows.filter((r) => r.state !== 'ok' && r.state !== 'same');
    const appText = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
    const bad1 = forbidProblem(appText, 'app.js');
    if (bad1) problems.push(bad1);
    const bad2 = forbidProblem(buildApp(partsInfo.parts), '조각을 이은 결과');
    if (bad2 && bad2 !== bad1) problems.push(bad2);
    if (app.hadCr || partsInfo.hadCr) console.log('[app-parts] 참고: CRLF 줄바꿈이 섞여 있다(저장소 규칙은 LF). join 하면 LF로 정리된다.');
    if (!off.length && !problems.length) {
        const stale = c.rows.filter((r) => r.state === 'same').length;
        console.log(`[app-parts] check: app.js == 조각 ${partsInfo.parts.length}개` + (stale ? ` (해시만 옛것 ${stale}개 — join 하면 갱신)` : ''));
        return;
    }
    if (off.length) {
        console.log('[app-parts] app.js와 조각이 어긋남:');
        report(off);
        const kinds = new Set(off.map((r) => r.state));
        if (kinds.has('both')) problems.push('양쪽 다 고친 조각이 있다 — 그 조각을 직접 맞춘 뒤 `join --force`(조각이 맞을 때) 또는 `split --force`(app.js가 맞을 때).');
        else if (kinds.size === 1 && kinds.has('app')) problems.push('app.js만 고쳐졌다 → `node scripts/app-parts.js split`');
        else if (kinds.size === 1 && kinds.has('part')) problems.push('조각만 고쳐졌다 → `node scripts/app-parts.js join`');
        else problems.push('조각마다 고친 쪽이 다르다(겹치는 조각은 없음) → `node scripts/app-parts.js sync`');
    }
    stop(problems.join('\n'));
}

function cmdWhere(nums) {
    if (!nums.length) stop('줄 번호를 적을 것: node scripts/app-parts.js where 52370');
    const app = readApp();
    nums.forEach((arg) => {
        const n = parseInt(arg, 10);
        if (!(n >= 1) || n > app.lineCount) { console.log(`${arg}: app.js 줄 범위(1~${app.lineCount}) 밖`); return; }
        if (n === 1 && app.hasHeader) { console.log(`app.js:1 → 자동 생성 경고 줄(조각 없음)`); return; }
        let sec = null;
        app.sections.forEach((s) => { if (s.line <= n) sec = s; });
        const pl = n - sec.line + 1;
        console.log(`app.js:${n} → app/${sec.name}:${pl}` + (pl === 1 ? ' (경계 표시 줄)' : ''));
    });
}

function main() {
    const [cmd, ...rest] = process.argv.slice(2);
    const force = rest.includes('--force');
    const args = rest.filter((a) => a !== '--force');
    try {
        if (cmd === 'join') cmdJoin(force);
        else if (cmd === 'split') cmdSplit(force);
        else if (cmd === 'sync') cmdSync();
        else if (cmd === 'check') cmdCheck();
        else if (cmd === 'where') cmdWhere(args);
        else {
            console.log('사용법: node scripts/app-parts.js join|split|sync|check|where <줄> [--force]');
            process.exit(cmd ? 1 : 0);
        }
    } catch (e) {
        if (e instanceof Stop) {
            console.error('[app-parts] 실패: ' + e.message);
            process.exit(1);
        }
        throw e;
    }
}

if (require.main === module) main();

module.exports = { MARK, FORBID_START, FORBID_END, lines, sha };
