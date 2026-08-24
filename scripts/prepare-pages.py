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
