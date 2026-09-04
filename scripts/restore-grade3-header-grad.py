# -*- coding: utf-8 -*-
"""Restore header-cell #FFF→#BBB grads on stamp bfs 5/6/7/16/17; keep char transparent bf 18."""
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = ROOT / "templates" / "hwpx_grade3_survey_stamp.hwpx"
SRC = ROOT / "templates" / "hwpx_grade3_survey_stamp.hwpx.bak_no_text_bg"
HEADER_GRAD_IDS = {"5", "6", "7", "16", "17"}
TRANSPARENT_BF = (
    '<hh:borderFill id="18" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
    '<hh:slash type="NONE" Crooked="0" isCounter="0"/>'
    '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
    '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>'
    '<hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>'
    '<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>'
    '<hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>'
    '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>'
    '<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#000000" alpha="0"/></hc:fillBrush>'
    '</hh:borderFill>'
)


def main():
    if not SRC.exists():
        raise SystemExit(f"missing source {SRC}")
    with zipfile.ZipFile(SRC) as z:
        src_hdr = z.read("Contents/header.xml").decode("utf-8")
    src_blocks = {
        m.group(1): m.group(0)
        for m in re.finditer(r'<hh:borderFill id="(\d+)"[^>]*>[\s\S]*?</hh:borderFill>', src_hdr)
        if m.group(1) in HEADER_GRAD_IDS
    }
    for bid in HEADER_GRAD_IDS:
        if bid not in src_blocks or "gradation" not in src_blocks[bid]:
            raise SystemExit(f"source missing grad for bf {bid}")

    with zipfile.ZipFile(STAMP) as z:
        files = {n: z.read(n) for n in z.namelist()}
    hdr = files["Contents/header.xml"].decode("utf-8")

    for bid, block in src_blocks.items():
        if not re.search(rf'<hh:borderFill id="{bid}"', hdr):
            raise SystemExit(f"stamp missing bf {bid}")
        hdr = re.sub(
            rf'<hh:borderFill id="{bid}"[^>]*>[\s\S]*?</hh:borderFill>',
            block,
            hdr,
            count=1,
        )

    # keep / ensure transparent char bf
    if re.search(r'<hh:borderFill id="18"', hdr):
        hdr = re.sub(
            r'<hh:borderFill id="18"[^>]*>[\s\S]*?</hh:borderFill>',
            TRANSPARENT_BF,
            hdr,
            count=1,
        )
    else:
        hdr = hdr.replace("</hh:borderFills>", TRANSPARENT_BF + "</hh:borderFills>")

    for cid in ("10", "11", "12"):
        def fix_char(m, _cid=cid):
            block = m.group(0)
            block = re.sub(r'\s*shadeColor="[^"]*"', ' shadeColor="none"', block)
            block = re.sub(r'\s*borderFillIDRef="[^"]*"', "", block)
            return re.sub(
                r'(<hh:charPr\b[^>]*?)(/?>)',
                lambda mm: f'{mm.group(1)} borderFillIDRef="18"{mm.group(2)}',
                block,
                count=1,
            )
        hdr = re.sub(rf'<hh:charPr id="{cid}"[^>]*>[\s\S]*?</hh:charPr>', fix_char, hdr, count=1)

    # itemCnt
    def sync(m):
        count = len(re.findall(r"<hh:borderFill ", m.group(2)))
        attrs = re.sub(r'itemCnt="\d+"', f'itemCnt="{count}"', m.group(1))
        return f"<hh:borderFills{attrs}>{m.group(2)}</hh:borderFills>"
    hdr = re.sub(r'<hh:borderFills([^>]*)>([\s\S]*?)</hh:borderFills>', sync, hdr, count=1)

    files["Contents/header.xml"] = hdr.encode("utf-8")
    with zipfile.ZipFile(STAMP, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for name, data in files.items():
            zout.writestr(name, data)

    with zipfile.ZipFile(STAMP) as z:
        h = z.read("Contents/header.xml").decode()
    for bid in sorted(HEADER_GRAD_IDS | {"18"}, key=int):
        b = re.search(rf'<hh:borderFill id="{bid}"[^>]*>[\s\S]*?</hh:borderFill>', h).group(0)
        print(bid, "grad", "gradation" in b, "face",
              re.search(r'faceColor="([^"]*)"', b).group(1) if "faceColor=" in b else None)
    for cid in ("10", "11", "12"):
        print(re.search(rf'<hh:charPr id="{cid}"[^>]*>', h).group(0))
    print("ok", STAMP)


if __name__ == "__main__":
    main()
