# -*- coding: utf-8 -*-
"""3종 스탬프: 바탕화면 원본 기준 — 헤더 그라데이션(5,6,7,16,17)만 유지, 데이터 칸 배경/문단테두리 제거."""
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(r"c:\Users\dlawo\OneDrive\바탕 화면\작업중(바탕화면)\프로그램 제작\결함조사표 양식 3종.hwpx")
DST = ROOT / "templates" / "hwpx_grade3_survey_stamp.hwpx"
HEADER_GRAD_IDS = {"5", "6", "7", "16", "17"}


def sanitize_border_fill(block: str, bid: str) -> str:
    if bid in HEADER_GRAD_IDS:
        return block
    block = re.sub(r"<hc:fillBrush>[\s\S]*?</hc:fillBrush>", "", block)
    block = re.sub(r"<hh:gradation[^>]*>[\s\S]*?</hh:gradation>", "", block)
    return block


def clean_header(hdr: str) -> str:
    hdr = re.sub(
        r"<hh:paraPr id=\"\d+\"[^>]*>[\s\S]*?</hh:paraPr>",
        lambda m: re.sub(r"<hh:border[^>]*/>", "", re.sub(r"<hh:border[^>]*>[\s\S]*?</hh:border>", "", m.group(0))),
        hdr,
    )
    hdr = re.sub(
        r"<hh:charPr id=\"\d+\"[^>]*>[\s\S]*?</hh:charPr>",
        lambda m: re.sub(r"\sborderFillIDRef=\"\d+\"", "", m.group(0)),
        hdr,
    )
    hdr = re.sub(
        r'<hh:borderFill id="(\d+)"[^>]*>[\s\S]*?</hh:borderFill>',
        lambda m: sanitize_border_fill(m.group(0), m.group(1)),
        hdr,
    )
    return hdr


def clean_section(sec: str) -> str:
    sec = re.sub(
        r"<hp:p\b([^>]*)>",
        lambda m: f"<hp:p{re.sub(r' borderFillIDRef=\"\\d+\"', '', m.group(1))}>",
        sec,
    )
    sec = re.sub(
        r"<hp:run\b([^>]*)>",
        lambda m: f"<hp:run{re.sub(r' borderFillIDRef=\"\\d+\"', '', m.group(1))}>",
        sec,
    )
    return sec


def main():
    if not SRC.exists():
        raise SystemExit(f"source missing: {SRC}")
    if DST.exists():
        shutil.copy2(DST, DST.with_suffix(".hwpx.bak3"))
    with zipfile.ZipFile(SRC, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}
    files["Contents/header.xml"] = clean_header(files["Contents/header.xml"].decode("utf-8")).encode("utf-8")
    sec_name = "Contents/section1.xml" if "Contents/section1.xml" in files else "Contents/section0.xml"
    files[sec_name] = clean_section(files[sec_name].decode("utf-8")).encode("utf-8")
    with zipfile.ZipFile(DST, "w") as zout:
        for name, data in files.items():
            zout.writestr(name, data)
    print("written", DST)


if __name__ == "__main__":
    main()
