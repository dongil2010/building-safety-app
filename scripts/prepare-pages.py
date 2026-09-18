#!/usr/bin/env python3
"""GitHub Pages 배포용 정적 파일을 _site/ 에 모은다."""
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
SHA = os.environ.get("GITHUB_SHA", "local")
SHORT = SHA[:7]

FILES = [
    "index.html",
    "app.js",
    "styles.css",
    "sw.js",
    "manifest.json",
    "photo-capture.html",
    "web-version.json",
]
DIRS = ["js", "templates"]


def retoken(text: str, pattern: str, repl: str, label: str) -> str:
    """캐시버스팅 토큰을 '지금 값이 뭐든' 정규식으로 갈아끼운다. 0건이면 빌드를 세운다.

    2026-09-18: 예전엔 `?v=20260824_surveyLayout` 같은 '그때 그 값'을 문자열로 찾아 바꿨다.
    로컬 git-sync.ps1이 그 값들을 이미 시각 토큰으로 갈아버린 뒤로는 찾을 게 없어서 치환이
    전부 조용히 no-op이 됐고, 다른 기기에서 git-sync 없이 그냥 push하면 index.html의 `?v=`와
    sw.js 캐시 이름이 어제 토큰 그대로 배포됐다. 그러면 신규 방문자만 새 코드를 받고 기존
    사용자(=현장 전부)는 서비스워커 캐시의 옛 app.js를 계속 쓴다. 실제로 328329f 배포가
    이 상태였다. 그래서 (1) 값이 뭐든 덮어쓰고 (2) 안 맞으면 소리내어 죽게 한다.
    """
    new, n = re.subn(pattern, repl, text)
    if n == 0:
        raise SystemExit(
            f"[prepare-pages] 캐시 토큰 치환 실패: {label} — 패턴이 안 맞는다. "
            f"파일 구조가 바뀌었는지 확인할 것. pattern={pattern}"
        )
    print(f"[prepare-pages] {label}: {n}건 -> {SHORT}")
    return new


def copytree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    for name in FILES:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, OUT / name)

    for name in DIRS:
        src = ROOT / name
        if src.exists():
            copytree(src, OUT / name)

    (OUT / ".nojekyll").write_text("", encoding="utf-8")

    index = OUT / "index.html"
    html = index.read_text(encoding="utf-8")
    html = retoken(html, r'href="styles\.css\?v=[^"]+"',
                   f'href="styles.css?v={SHORT}"', "styles.css")
    html = retoken(html, r'(src="(?:app\.js|js/[^"]+\.js))\?v=[^"]+"',
                   r'\g<1>?v=' + SHORT + '"', "app.js / js/*")
    html = retoken(html, r"window\.BSA_APP_VERSION = '[^']*'",
                   f"window.BSA_APP_VERSION = '{SHORT}'", "화면 표시 버전")
    html = retoken(html, r"register\('\./sw\.js\?v=[^']+'\)",
                   f"register('./sw.js?v={SHORT}')", "sw.js 등록 URL")

    # 2026-09-16: Gemini 키는 소스(app.js)에 절대 하드코딩하지 않는다 — 한 번 git 히스토리에
    # 들어가면 영원히 남고, 실제로 GitHub Push Protection이 이걸 막은 적도 있다. 대신 GitHub
    # Actions 리포지토리 Secret(GEMINI_API_KEY)만 여기 배포 시점에 읽어서 window 전역 변수로
    # 주입한다 — 이 값은 빌드 산출물(_site, 배포된 사이트)에만 존재하고 git에는 절대 안 남는다.
    # 로컬 개발 서버(run_local_server.ps1)는 이 스크립트를 안 거치므로 항상 빈 값 → app.js가
    # 자동으로 기존 클라우드(Worker→Cloud Vision)로 폴백한다.
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if gemini_key:
        inject = f'<script>window.GEMINI_DIRECT_API_KEY = {json.dumps(gemini_key)};</script>\n'
        html = html.replace("</head>", inject + "</head>")

    index.write_text(html, encoding="utf-8")

    sw = OUT / "sw.js"
    if sw.exists():
        text = sw.read_text(encoding="utf-8")
        text = retoken(text, r"const CACHE_NAME = '[^']*'",
                       f"const CACHE_NAME = 'building-safety-v{SHORT}'", "SW 캐시 이름")
        sw.write_text(text, encoding="utf-8")

    version = {
        "sha": SHA,
        "short": SHORT,
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (OUT / "web-version.json").write_text(
        json.dumps(version, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("pages site ready:", OUT)
    print("version:", version)


if __name__ == "__main__":
    main()
