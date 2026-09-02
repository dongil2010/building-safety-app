# -*- coding: utf-8 -*-
"""Patch existing grade3 stamp: data cells white fill, no DOUBLE_SLIM top on data rows."""
import re, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = ROOT / "templates" / "hwpx_grade3_survey_stamp.hwpx"
HEADER_GRAD = {"5", "6", "7", "16", "17"}
WHITE = '<hc:fillBrush><hc:winBrush faceColor="#FFFFFF" hatchColor="#999999" alpha="0"/></hc:fillBrush>'
SOLID_TOP = '<hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/>'

def patch_bf(block, bid):
    if bid in HEADER_GRAD:
        return block
    block = re.sub(r"<hc:fillBrush>[\s\S]*?</hc:fillBrush>", "", block)
    block = re.sub(r"<hh:gradation[^>]*>[\s\S]*?</hh:gradation>", "", block)
    block = re.sub(r'<hh:topBorder type="DOUBLE_SLIM"[^/]*/>', SOLID_TOP, block)
    if "<hc:fillBrush" not in block:
        block = block.replace("</hh:borderFill>", WHITE + "</hh:borderFill>")
    return block

shutil.copy2(STAMP, STAMP.with_suffix(".hwpx.bak_data_bg"))
with zipfile.ZipFile(STAMP, "r") as zin:
    files = {n: zin.read(n) for n in zin.namelist()}
hdr = files["Contents/header.xml"].decode("utf-8")
hdr = re.sub(
    r'<hh:borderFill id="(\d+)"[^>]*>[\s\S]*?</hh:borderFill>',
    lambda m: patch_bf(m.group(0), m.group(1)),
    hdr,
)
files["Contents/header.xml"] = hdr.encode("utf-8")
sec_name = "Contents/section1.xml" if "Contents/section1.xml" in files else "Contents/section0.xml"
sec = files[sec_name].decode("utf-8")
sec = re.sub(r"<hp:p\b([^>]*)>", lambda m: f"<hp:p{re.sub(r' borderFillIDRef=\"\\d+\"', '', m.group(1))}>", sec)
sec = re.sub(r"<hp:run\b([^>]*)>", lambda m: f"<hp:run{re.sub(r' borderFillIDRef=\"\\d+\"', '', m.group(1))}>", sec)
files[sec_name] = sec.encode("utf-8")
with zipfile.ZipFile(STAMP, "w") as zout:
    for name, data in files.items():
        zout.writestr(name, data)
print("patched", STAMP)
with zipfile.ZipFile(STAMP) as z:
    h = z.read("Contents/header.xml").decode()
for i in ["8", "9", "11"]:
    m = re.search(rf'<hh:borderFill id="{i}"[^>]*>([\s\S]*?)</hh:borderFill>', h)
    b = m.group(1)
    print(i, "fill", "fillBrush" in b, "top", re.search(r'<hh:top[^>]*type="([^"]+)"', b).group(1))
