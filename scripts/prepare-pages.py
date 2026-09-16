#!/usr/bin/env python3
"""GitHub Pages 배포용 정적 파일을 _site/ 에 모은다."""
from __future__ import annotations

import json
import os
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
    html = html.replace("?v=20260824_surveyLayout", f"?v={SHORT}")
    html = html.replace("?v=20260821_land1", f"?v={SHORT}")
    html = html.replace("?v=20260822_prevPhotoView", f"?v={SHORT}")
    html = html.replace("?v=20260822_surveyInlineEdit", f"?v={SHORT}")
    html = html.replace("?v=20260822_survey2dScroll", f"?v={SHORT}")

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
        text = text.replace("building-safety-v69.4", f"building-safety-{SHORT}")
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
