#!/usr/bin/env node
'use strict';
/**
 * 외부(CDN) 라이브러리를 APK에 같이 넣는다 — 2026-11-06
 *
 * 왜: 앱은 인터넷 없이 켜져야 한다. 앱 파일은 APK 안에 있지만 Firebase·PDF·엑셀 같은 외부 라이브러리는 없어서,
 *     한 번도 온라인으로 연 적 없는 기기(새 설치·앱 데이터 삭제)는 오프라인에서 화면이 켜지지 않았다.
 * 어떻게: index.html의 외부 script·stylesheet와 아이콘 글꼴을 www/_cdn/<host>/<path> 에 받아 둔다.
 *     OfflineAwareWebViewClient가 저장 사본이 없을 때 이 파일을 쓴다.
 * 하나라도 못 받으면 빌드를 멈춘다 — 빠진 채로 배포하면 오프라인에서 안 켜지는 것을 나중에야 알게 된다.
 * 사용: node scripts/bundle-cdn-assets.js (npm run prepare:www 뒤에 cap:sync가 부른다)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www', '_cdn');
const HOSTS = new Set(['www.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com']);
// 글자 파일은 CSS 안에서 부른다. 없으면 아이콘이 네모로 나온다(본문 글꼴은 기기 글꼴로 대체되어 빼도 된다)
const EXTRA = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'
];

/** 외부 라이브러리 주소 목록 (쿼리·조각 제외, 중복 제거) */
function listCdnUrls(html) {
    const urls = new Set(EXTRA);
    const re = /<(?:script|link)\b[^>]*\b(?:src|href)=["'](https:\/\/[^"']+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
        const u = new URL(m[1]);
        if (HOSTS.has(u.hostname)) urls.add(u.origin + u.pathname);
    }
    return Array.from(urls);
}

function localPathFor(url) {
    const u = new URL(url);
    return path.join(OUT, u.hostname, ...decodeURIComponent(u.pathname).split('/').filter(Boolean));
}

async function main() {
    const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
    const urls = listCdnUrls(html);
    let total = 0;
    for (const url of urls) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const file = localPathFor(url);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, buf);
        total += buf.length;
    }
    console.log(`외부 라이브러리 ${urls.length}개를 APK에 넣습니다 (${(total / 1048576).toFixed(1)}MB)`);
}

if (require.main === module) {
    main().catch((e) => {
        console.error('외부 라이브러리를 받지 못했습니다 — 인터넷을 확인하고 다시 빌드하세요:', e.message);
        process.exit(1);
    });
}
module.exports = { listCdnUrls, HOSTS };
