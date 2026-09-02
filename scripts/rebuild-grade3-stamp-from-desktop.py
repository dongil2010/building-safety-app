# -*- coding: utf-8 -*-
"""바탕화면 원본에서 3종 스탬프를 그대로 재생성(헤더 그라데이션만 유지, 데이터 칸 배경/문단테두리만 제거)."""
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


def extract_survey_table(sec: str) -> str:
    m = re.search(r'<hp:tbl[^>]*>[\s\S]*?점검내용[\s\S]*?</hp:tbl>', sec)
    if not m:
        raise SystemExit("survey table not found in source")
    return m.group(0)


def main():
    if not SRC.exists():
        raise SystemExit(f"source missing: {SRC}")
    if DST.exists():
        shutil.copy2(DST, DST.with_suffix(".hwpx.bak_rebuild"))
    with zipfile.ZipFile(SRC, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}
    sec_name = "Contents/section1.xml" if "Contents/section1.xml" in files else "Contents/section0.xml"
    sec = files[sec_name].decode("utf-8")
    survey_tbl = extract_survey_table(sec)
    # 스탬프는 표 하나만 담은 최소 section
    new_sec = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        '<hs:sec xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
        'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
        'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
        'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">'
        f'<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="0"><hp:tbl>{survey_tbl}</hp:tbl></hp:run></hp:p>'
        '</hs:sec>'
    )
    # survey_tbl already has hp:tbl tags - fix wrapper
    new_sec = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        '<hs:sec xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
        'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
        'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
        'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">'
        f'<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="0">{survey_tbl}</hp:run></hp:p>'
        '</hs:sec>'
    )
    hdr = clean_header(files["Contents/header.xml"].decode("utf-8"))
    sec_clean = clean_section(new_sec)
    # write minimal hwpx from source template shell
    out_files = {}
    for name, data in files.items():
        if name == "Contents/header.xml":
            out_files[name] = hdr.encode("utf-8")
        elif name == sec_name:
            out_files[name] = sec_clean.encode("utf-8")
        elif name.startswith("Contents/section") and name != sec_name:
            continue
        else:
            out_files[name] = data
    if sec_name != "Contents/section0.xml" and "Contents/section0.xml" in out_files:
        del out_files["Contents/section0.xml"]
    with zipfile.ZipFile(DST, "w") as zout:
        for name, data in out_files.items():
            zout.writestr(name, data)
    print("written", DST)
    # verify key border fills match original
    with zipfile.ZipFile(SRC) as z1, zipfile.ZipFile(DST) as z2:
        h1 = z1.read("Contents/header.xml").decode()
        h2 = z2.read("Contents/header.xml").decode()
    for bid in ["5", "16", "17", "8", "13", "14", "15"]:
        def snap(h, i):
            m = re.search(rf'<hh:borderFill id="{i}"[^>]*>([\s\S]*?)</hh:borderFill>', h)
            b = m.group(1) if m else ""
            return (
                "grad" if "gradation" in b.lower() else "no-grad",
                "fill" if "fillBrush" in b else "no-fill",
                re.search(r'bottomBorder type="([^"]+)"', b).group(1) if re.search(r"bottomBorder", b) else "?",
                re.search(r'rightBorder type="([^"]+)"', b).group(1) if re.search(r"rightBorder", b) else "?",
            )
        print(f"bf{bid} orig={snap(h1,bid)} stamp={snap(h2,bid)}")


if __name__ == "__main__":
    main()
