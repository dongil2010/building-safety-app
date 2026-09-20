#!/usr/bin/env node
'use strict';

/**
 * 소스 파일 인코딩 가드 — 한글이 깨진 채로 커밋되는 걸 막는다.
 *
 * 2026-09-19에 index.html이 CP949로 저장돼 한글 941줄이 깨지면서 앱이 통째로
 * 백지가 됐다(하루에 두 번). 눈으로는 잘 안 보이고 git diff도 "많이 바뀜"으로만
 * 보여서 리뷰로는 못 잡는다. 그래서 CI에서 기계가 막는다.
 *
 * 깨지는 경로는 셋이다:
 *   1) UTF-8 파일을 CP949로 읽어 저장  → 한글이 라틴 확장 문자로 바뀜
 *   2) CP949 파일을 UTF-8로 읽어 저장  → U+FFFD(<?>)가 박힘
 *   3) CP949 바이트가 그대로 커밋됨     → UTF-8로 디코딩 자체가 안 됨
 *
 * 세 경우 모두 여기서 걸린다.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 검사 대상 확장자 (hwpx·png 같은 바이너리는 제외) */
const TEXT_EXT = /\.(html|htm|js|mjs|cjs|css|json|md|rules|ya?ml|txt|py|ps1|svg)$/i;

/**
 * BOM을 허용하는 확장자.
 * Windows PowerShell 5.1은 BOM이 없으면 .ps1 안의 한글을 깨뜨려서 읽는다.
 * 그래서 .ps1만 예외로 둔다. html/js/css/json에 BOM이 붙었다면 메모장 계열로
 * 저장했다는 신호이므로 막는다(특히 JSON은 BOM 때문에 파싱이 깨진다).
 */
const BOM_ALLOWED_EXT = /\.ps1$/i;

/**
 * U+00C0~U+024F(라틴 확장) 구간에서 예외로 허용하는 문자.
 * 이 저장소에서 이 구간에 정상적으로 쓰이는 건 곱셈·나눗셈 기호뿐이다.
 * (·°±² 같은 건 U+00C0보다 아래라 애초에 검사 대상이 아니다)
 *
 * 새 기호를 정말 써야 하면 여기에 추가하면 된다. 단, 알파벳처럼 생긴 글자
 * (A/I/E 계열에 물결이나 점이 붙은 라틴 알파벳)는 절대 추가하지 마라 —
 * 그게 바로 깨진 한글이다.
 */
const ALLOWED_LATIN = new Set(['×', '÷']);

/** 깨진 한글이 나타나는 구간. 여기 글자가 생기면 사고다. */
const MOJIBAKE_RANGE = new RegExp(
    '[' + String.fromCharCode(0x00C0) + '-' + String.fromCharCode(0x024F) + ']', 'g'
);

/**
 * 한글이 통째로 날아간 걸 잡는 최후 방어선.
 * 정상 편집으로는 절대 이 밑으로 안 내려간다 (2026-09-20 기준 실제 값의 절반 이하).
 * 파일을 크게 정리해서 한글이 진짜 줄었다면 이 숫자를 낮추면 된다.
 */
const HANGUL_FLOOR = {
    'index.html': 3000,   // 실제 8572
    'app.js': 30000       // 실제 78961
};

const HANGUL = /[가-힣]/g;

/**
 * 깨진 자리에 박히는 U+FFFD.
 * 이 파일 안에 그 글자를 그대로 적으면 이 검사가 자기 자신을 잡으므로 코드로 만든다.
 */
const REPLACEMENT_CHAR = String.fromCharCode(0xFFFD);
function replacementRe() { return new RegExp(REPLACEMENT_CHAR, 'g'); }

function listTrackedFiles() {
    try {
        const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
            cwd: REPO_ROOT,
            maxBuffer: 1024 * 1024 * 64
        });
        return out.toString('utf8').split('\0').filter(Boolean);
    } catch (e) {
        console.error('test-source-encoding: git ls-files 실패 — ' + e.message);
        process.exit(1);
    }
}

function lineOf(text, index) {
    let line = 1;
    for (let i = 0; i < index && i < text.length; i += 1) {
        if (text[i] === '\n') line += 1;
    }
    return line;
}

/** 오류 메시지에 쓸 짧은 주변 문맥 */
function snippet(text, index) {
    const from = Math.max(0, index - 30);
    const to = Math.min(text.length, index + 30);
    return text.slice(from, to).replace(/\r?\n/g, '↵');
}

const problems = [];

function report(file, kind, detail, fix) {
    problems.push({ file: file, kind: kind, detail: detail, fix: fix });
}

listTrackedFiles().forEach(function (rel) {
    if (!TEXT_EXT.test(rel)) return;

    const abs = path.join(REPO_ROOT, rel);
    let buf;
    try {
        buf = fs.readFileSync(abs);
    } catch (e) {
        return;   // 심볼릭 링크·삭제 예정 등은 건너뛴다
    }

    // (3) UTF-8로 디코딩 자체가 안 되는 파일 = CP949 바이트가 그대로 들어옴
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
        report(rel, 'UTF-8이 아님',
            '파일이 UTF-8로 읽히지 않습니다 (CP949/ANSI로 저장된 것으로 보입니다).',
            '편집기에서 UTF-8로 다시 저장하거나, git에서 이전 버전을 되살리세요.');
        return;   // 이 상태면 아래 검사는 의미가 없다
    }

    const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    if (hasBom && !BOM_ALLOWED_EXT.test(rel)) {
        report(rel, 'BOM',
            '파일 맨 앞에 UTF-8 BOM이 붙어 있습니다.',
            '메모장 대신 VS Code에서 "UTF-8"(BOM 없음)로 저장하세요.');
    }

    const text = buf.toString('utf8');

    // (2) 깨진 자리에 박히는 U+FFFD
    const fffd = text.indexOf(REPLACEMENT_CHAR);
    if (fffd >= 0) {
        const count = (text.match(replacementRe()) || []).length;
        report(rel, '한글 깨짐(U+FFFD)',
            count + '군데가 깨졌습니다. 첫 위치 ' + rel + ':' + lineOf(text, fffd)
                + ' 근처 → ' + snippet(text, fffd),
            'CP949로 저장된 파일을 UTF-8로 읽어서 생긴 손상입니다. '
                + '이 파일은 되살릴 수 없으니 git에서 이전 버전을 복구하세요.');
    }

    // (1) UTF-8을 CP949/CP1252로 읽어서 생긴 라틴 글자
    MOJIBAKE_RANGE.lastIndex = 0;
    let m;
    let firstBad = -1;
    let badCount = 0;
    while ((m = MOJIBAKE_RANGE.exec(text)) !== null) {
        if (ALLOWED_LATIN.has(m[0])) continue;
        badCount += 1;
        if (firstBad < 0) firstBad = m.index;
    }
    if (badCount > 0) {
        report(rel, '한글 깨짐(라틴 문자)',
            badCount + '글자가 라틴 확장 문자로 바뀌었습니다. 첫 위치 '
                + rel + ':' + lineOf(text, firstBad) + ' 근처 → ' + snippet(text, firstBad),
            'UTF-8 파일을 CP949로 읽어서 저장했을 때 나옵니다. '
                + 'git에서 이전 버전을 복구하세요.');
    }

    // 한글이 통째로 사라진 경우
    const floor = HANGUL_FLOOR[rel.replace(/\\/g, '/')];
    if (floor != null) {
        const count = (text.match(HANGUL) || []).length;
        if (count < floor) {
            report(rel, '한글 급감',
                '한글이 ' + count + '자뿐입니다 (최소 ' + floor + '자 기대).',
                '파일이 손상됐거나, 한글을 의도적으로 크게 줄였다면 '
                    + 'scripts/test-source-encoding.js의 HANGUL_FLOOR를 조정하세요.');
        }
    }
});

if (problems.length) {
    console.error('\n인코딩 검사 실패 — ' + problems.length + '건\n');
    problems.forEach(function (p) {
        console.error('  [' + p.kind + '] ' + p.file);
        console.error('      ' + p.detail);
        console.error('      → ' + p.fix + '\n');
    });
    console.error('한글이 깨진 채로 배포되면 앱이 백지가 됩니다(2026-09-19 사고).');
    console.error('되살리는 법:  git checkout <정상이던 커밋> -- <파일>\n');
    process.exit(1);
}

console.log('test-source-encoding: ok');
