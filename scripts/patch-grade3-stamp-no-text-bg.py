# -*- coding: utf-8 -*-
"""3종 결함조사표 스탬프: 칸 배경(그라데이션) 제거 + 글자용 투명 borderFill 명시."""
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = ROOT / "templates" / "hwpx_grade3_survey_stamp.hwpx"
HEADER_GRAD_IDS = {"5", "6", "7", "16", "17"}
CHAR_IDS = {"10", "11", "12"}
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


def strip_cell_fill(block: str, bid: str) -> str:
    if bid not in HEADER_GRAD_IDS and bid not in {str(i) for i in range(4, 18)}:
        return block
    # 모든 결함표 칸(헤더 포함)에서 면채우기/그라데이션 제거 — 선 테두리만 유지
    if bid == "18":
        return TRANSPARENT_BF
    block = re.sub(r"<hc:fillBrush>[\s\S]*?</hc:fillBrush>", "", block)
    block = re.sub(r"<hc:gradation[^>]*/?>", "", block)
    block = re.sub(r"<hc:gradation[^>]*>[\s\S]*?</hc:gradation>", "", block)
    return block


def set_char_transparent(block: str) -> str:
    block = re.sub(r'\s*shadeColor="[^"]*"', ' shadeColor="none"', block)
    block = re.sub(r'\s*borderFillIDRef="[^"]*"', "", block)
    return re.sub(
        r'(<hh:charPr\b[^>]*?)(/?>)',
        lambda m: f'{m.group(1)} borderFillIDRef="18"{m.group(2)}',
        block,
        count=1,
    )


def main():
    if not STAMP.exists():
        raise SystemExit(f"missing {STAMP}")
    bak = STAMP.with_suffix(".hwpx.bak_no_text_bg")
    if not bak.exists():
        shutil.copy2(STAMP, bak)
    with zipfile.ZipFile(STAMP, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}
    hdr = files["Contents/header.xml"].decode("utf-8")

    # borderFill 18 교체/추가
    if re.search(r'<hh:borderFill id="18"', hdr):
        hdr = re.sub(
            r'<hh:borderFill id="18"[^>]*>[\s\S]*?</hh:borderFill>',
            TRANSPARENT_BF,
            hdr,
            count=1,
        )
    else:
        hdr = hdr.replace("</hh:borderFills>", TRANSPARENT_BF + "</hh:borderFills>")

    hdr = re.sub(
        r'<hh:borderFill id="(\d+)"[^>]*>[\s\S]*?</hh:borderFill>',
        lambda m: strip_cell_fill(m.group(0), m.group(1)),
        hdr,
    )

    def fix_char(m):
        cid = m.group(1)
        block = m.group(0)
        if cid in CHAR_IDS:
            return set_char_transparent(block)
        # 다른 charPr도 보이는 글자 바탕 제거
        return re.sub(r'\s*shadeColor="[^"]*"', ' shadeColor="none"', block)

    hdr = re.sub(r'<hh:charPr id="(\d+)"[^>]*>[\s\S]*?</hh:charPr>', fix_char, hdr)

    # paraPr 문단 테두리 박스 제거
    hdr = re.sub(
        r'<hh:paraPr id="\d+"[^>]*>[\s\S]*?</hh:paraPr>',
        lambda m: re.sub(r"<hh:border[^>]*/>", "", re.sub(r"<hh:border[^>]*>[\s\S]*?</hh:border>", "", m.group(0))),
        hdr,
    )

    # itemCnt 동기화
    for tag, cont in [
        ("borderFill", "borderFills"),
        ("charPr", "charProperties"),
        ("paraPr", "paraProperties"),
    ]:
        def sync(m, _tag=tag, _cont=cont):
            count = len(re.findall(rf"<hh:{_tag} ", m.group(2)))
            attrs = re.sub(r'itemCnt="\d+"', f'itemCnt="{count}"', m.group(1))
            return f"<hh:{_cont}{attrs}>{m.group(2)}</hh:{_cont}>"
        hdr = re.sub(rf'<hh:{cont}([^>]*)>([\s\S]*?)</hh:{cont}>', sync, hdr, count=1)

    files["Contents/header.xml"] = hdr.encode("utf-8")
    with zipfile.ZipFile(STAMP, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for name, data in files.items():
            zout.writestr(name, data)
    print("patched", STAMP)

    with zipfile.ZipFile(STAMP) as z:
        h = z.read("Contents/header.xml").decode()
    for bid in ["5", "6", "7", "16", "17", "18"]:
        m = re.search(rf'<hh:borderFill id="{bid}"[^>]*>[\s\S]*?</hh:borderFill>', h)
        b = m.group(0)
        print(bid, "grad", "gradation" in b.lower(), "fill", "fillBrush" in b,
              "face", re.search(r'faceColor="([^"]*)"', b).group(1) if re.search(r'faceColor=', b) else None)
    for cid in ["10", "11", "12"]:
        print("char", cid, re.search(rf'<hh:charPr id="{cid}"[^>]*>', h).group(0))


if __name__ == "__main__":
    main()
