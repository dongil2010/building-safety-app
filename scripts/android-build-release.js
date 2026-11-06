#!/usr/bin/env node
'use strict';
/**
 * 정식 인증서로 서명한 릴리스 APK 만들기 (업로드 안 함) — 2026-11-06
 *
 * 왜: 지금까지 배포한 APK는 디버그 빌드(debuggable, 「Android Debug」 인증서)라 Play 프로텍트가 유해 앱으로 잡기 쉽다.
 * 어떻게: 인증서를 그냥 바꾸면 설치된 앱 위에 덮어쓸 수 없어 앱을 지워야 하고, 그러면 기기의 오프라인 데이터도 지워진다.
 *   그래서 APK 서명 v3 키 교체(rotation)를 쓴다. 옛 디버그 키가 새 키를 보증하는 증명(lineage)을 APK에 넣어
 *   Android 9 이상은 지우지 않고 덮어써서 새 인증서로 넘어간다. Android 8 이하는 옛 키 서명으로 그대로 설치된다.
 *
 * 키는 저장소 밖 ~/.bsa-release/ 에만 둔다. 잃어버리면 앱을 더 이상 업데이트할 수 없으니 반드시 따로 백업한다.
 * 사용: node scripts/android-build-release.js
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOME = path.join(os.homedir(), '.bsa-release');
const KS = path.join(HOME, 'release.jks');
const PASS_FILE = path.join(HOME, 'release.pass');
const LINEAGE = path.join(HOME, 'debug-to-release.lineage');
const ALIAS = 'bsa-release';
const OLD_KS = path.join(os.homedir(), '.android', 'debug.keystore');
const OUT_DIR = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release');

function sdkTool(name) {
    const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
    const btRoot = path.join(sdk, 'build-tools');
    const versions = fs.readdirSync(btRoot).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return path.join(btRoot, versions[versions.length - 1], name);
}

function run(cmd, args, opts) {
    // .bat 은 셸로 실행해야 한다. 비밀번호는 인자가 아니라 환경 변수(env:)로 넘긴다.
    const shell = /\.bat$/i.test(cmd);
    return execFileSync(shell ? `"${cmd}"` : cmd, args, Object.assign({ stdio: 'inherit', shell, env: process.env }, opts));
}

function ensureKey() {
    fs.mkdirSync(HOME, { recursive: true });
    if (!fs.existsSync(PASS_FILE)) {
        if (fs.existsSync(KS)) throw new Error(`비밀번호 파일 없이 키만 있습니다: ${KS}`);
        fs.writeFileSync(PASS_FILE, crypto.randomBytes(24).toString('hex'), { mode: 0o600 });
    }
    process.env.BSA_RELEASE_PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
    process.env.BSA_DEBUG_PASS = 'android'; // Android 디버그 키의 공개된 기본 비밀번호
    if (!fs.existsSync(KS)) {
        run('keytool', ['-genkeypair', '-keystore', KS, '-storetype', 'PKCS12', '-alias', ALIAS, '-keyalg', 'RSA', '-keysize', '4096',
            '-validity', '10000', '-dname', 'CN=Smart Safety Inspection, C=KR',
            '-storepass:env', 'BSA_RELEASE_PASS', '-keypass:env', 'BSA_RELEASE_PASS']);
        console.log(`새 릴리스 키를 만들었습니다: ${KS} — 따로 백업하세요.`);
    }
    if (!fs.existsSync(LINEAGE)) {
        run(sdkTool('apksigner.bat'), ['rotate', '--out', `"${LINEAGE}"`,
            '--old-signer', '--ks', `"${OLD_KS}"`, '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'env:BSA_DEBUG_PASS', '--key-pass', 'env:BSA_DEBUG_PASS',
            '--new-signer', '--ks', `"${KS}"`, '--ks-key-alias', ALIAS, '--ks-pass', 'env:BSA_RELEASE_PASS', '--key-pass', 'env:BSA_RELEASE_PASS']);
    }
}

function main() {
    ensureKey();
    const gradle = path.join(ROOT, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    run(gradle, ['assembleRelease', '-q'], { cwd: path.join(ROOT, 'android') });
    const unsigned = path.join(OUT_DIR, 'app-release-unsigned.apk');
    const aligned = path.join(OUT_DIR, 'app-release-aligned.apk');
    const signed = path.join(OUT_DIR, 'app-release.apk');
    run(sdkTool('zipalign.exe'), ['-f', '-p', '4', unsigned, aligned]);
    run(sdkTool('apksigner.bat'), ['sign',
        '--ks', `"${OLD_KS}"`, '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'env:BSA_DEBUG_PASS', '--key-pass', 'env:BSA_DEBUG_PASS',
        '--next-signer', '--ks', `"${KS}"`, '--ks-key-alias', ALIAS, '--ks-pass', 'env:BSA_RELEASE_PASS', '--key-pass', 'env:BSA_RELEASE_PASS',
        '--lineage', `"${LINEAGE}"`, '--rotation-min-sdk-version', '28', '--out', `"${signed}"`, `"${aligned}"`]);
    fs.unlinkSync(aligned);
    console.log(`완료 (업로드 안 함): ${signed}`);
}

main();
