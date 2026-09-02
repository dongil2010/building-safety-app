# -*- coding: utf-8 -*-
"""3종 스탬프 borderFill 보정: 헤더 그라데이션 유지, 데이터 흰바탕, 마지막행 테두리."""
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = ROOT / "templates" / "hwpx_grade3_survey_stamp.hwpx"
HEADER_GRAD_IDS = {"5", "6", "7", "16", "17"}
DATA_BF_IDS = {"4", "8", "9", "10", "11", "12", "13", "14", "15"}
WHITE_FILL = '<hc:fillBrush><hc:winBrush faceColor="#FFFFFF" hatchColor="#999999" alpha="0"/></hc:fillBrush>'
DOUBLE_SLIM_BOTTOM = '<hh:bottomBorder type="DOUBLE_SLIM" width="0.5 mm" color="#000000"/>'


def patch_border_fill(block: str, bid: str) -> str:
    if bid in HEADER_GRAD_IDS:
        return block
    block = re.sub(r"<hc:fillBrush>[\s\S]*?</hc:fillBrush>", "", block)
    block = re.sub(r"<hh:gradation[^>]*>[\s\S]*?</hh:gradation>", "", block)
    if bid in DATA_BF_IDS and "<hc:fillBrush" not in block:
        block = block.replace("</hh:borderFill>", WHITE_FILL + "</hh:borderFill>")
    if bid in {"13", "14", "15"}:
        block = re.sub(
            r'<hh:bottomBorder type="SOLID" width="0\.5 mm" color="#000000"/>',
            DOUBLE_SLIM_BOTTOM,
            block,
        )
    if bid == "14":
        block = re.sub(
            r'<hh:rightBorder type="SOLID" width="0\.12 mm" color="#000000"/>',
            '<hh:rightBorder type="NONE" width="0.12 mm" color="#000000"/>',
            block,
        )
    if bid == "15":
        block = re.sub(
            r'<hh:leftBorder type="SOLID" width="0\.12 mm" color="#000000"/>',
            '<hh:leftBorder type="NONE" width="0.12 mm" color="#000000"/>',
            block,
        )
    return block


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
    if not STAMP.exists():
        raise SystemExit(f"missing {STAMP}")
    shutil.copy2(STAMP, STAMP.with_suffix(".hwpx.bak_border_fix"))
    with zipfile.ZipFile(STAMP, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}
    hdr = files["Contents/header.xml"].decode("utf-8")
    hdr = re.sub(
        r'<hh:paraPr id="\d+"[^>]*>[\s\S]*?</hh:paraPr>',
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
        lambda m: patch_border_fill(m.group(0), m.group(1)),
        hdr,
    )
    files["Contents/header.xml"] = hdr.encode("utf-8")
    sec_name = "Contents/section1.xml" if "Contents/section1.xml" in files else "Contents/section0.xml"
    files[sec_name] = clean_section(files[sec_name].decode("utf-8")).encode("utf-8")
    with zipfile.ZipFile(STAMP, "w") as zout:
        for name, data in files.items():
            zout.writestr(name, data)
    print("patched", STAMP)
    with zipfile.ZipFile(STAMP) as z:
        h = z.read("Contents/header.xml").decode()
    for i in ["16", "17", "8", "14", "15"]:
        m = re.search(rf'<hh:borderFill id="{i}"[^>]*>([\s\S]*?)</hh:borderFill>', h)
        b = m.group(1)
        print(i, "grad", "gradation" in b.lower(), "fill", "fillBrush" in b,
              "top", re.search(r'<hh:top[^>]*type="([^"]+)"', b).group(1),
              "bot", re.search(r'<hh:bottom[^>]*type="([^"]+)"', b).group(1),
              "R", re.search(r'<hh:right[^>]*type="([^"]+)"', b).group(1) if re.search(r'<hh:right', b) else '?')


if __name__ == "__main__":
    main()
