# -*- coding: utf-8 -*-
"""
3종 메인 템플릿(hwpx_survey_template_grade3*.hwpx)의 결함조사표를 스탬프
(hwpx_grade3_survey_stamp.hwpx)의 깨끗한 표로 교체하고, 그 표가 참조하는 스타일
(font/borderFill/charPr/paraPr/style)을 header.xml에 **새 ID로 추가**한다.

예전에는 이 병합을 app.js가 hwpx 생성 때마다 런타임에 수행했는데, ID 리맵·검증·
정리 패치가 여러 겹 쌓이면서 "하나 고치면 다른 게 깨지는" 원인이 됐다. 이제는
이 스크립트로 템플릿을 한 번 고정하고, app.js는 1·2종과 똑같이 템플릿 표본 행만
복제한다.

사용:  py scripts/build-grade3-template-from-stamp.py
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TPL_DIR = ROOT / "templates"
STAMP = TPL_DIR / "hwpx_grade3_survey_stamp.hwpx"
TARGETS = [
    TPL_DIR / "hwpx_survey_template_grade3.hwpx",
    TPL_DIR / "hwpx_survey_template_grade3_regular.hwpx",
]
BACKUP_DIR = ROOT / "_tmp_template_bak"

# 결함표 상단(헤더) 칸만 #FFF→#BBB 그라데이션 유지. 데이터 칸·글자 바탕은 제거.
HEADER_GRAD_IDS = {"5", "6", "7", "16", "17"}
# 글자용 투명 borderFill(테두리 NONE, 채우기 없음) — 한글에서 borderFillIDRef 누락 시
# 기본 글자 테두리/바탕이 생기는 경우가 있어 명시적으로 붙인다.
CHAR_TRANSPARENT_BF_ID = "18"
CONTAINER = {"borderFill": "borderFills", "charPr": "charProperties", "paraPr": "paraProperties", "style": "styles"}
FONT_ATTR_TO_LANG = {
    "hangul": "HANGUL", "latin": "LATIN", "hanja": "HANJA", "japanese": "JAPANESE",
    "other": "OTHER", "symbol": "SYMBOL", "user": "USER",
}


def read_zip(path):
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist()}


def section_name(files):
    return "Contents/section1.xml" if "Contents/section1.xml" in files else "Contents/section0.xml"


def tag_block(xml, tag, bid):
    m = re.search(rf'<hh:{tag} id="{bid}"[^>]*/>', xml)
    if m:
        return m.group(0)
    m = re.search(rf'<hh:{tag} id="{bid}"[^>]*>[\s\S]*?</hh:{tag}>', xml)
    return m.group(0) if m else None


def append_block(xml, tag, block):
    cont = CONTAINER[tag]
    m = re.search(rf'<hh:{cont}([^>]*)>([\s\S]*?)</hh:{cont}>', xml)
    if not m:
        raise SystemExit(f"container hh:{cont} not found")
    return xml[: m.start()] + f"<hh:{cont}{m.group(1)}>{m.group(2)}{block}</hh:{cont}>" + xml[m.end():]


def sync_item_cnt(xml, tag):
    cont = CONTAINER[tag]

    def fix(m):
        count = len(re.findall(rf"<hh:{tag} ", m.group(2)))
        attrs = re.sub(r'itemCnt="\d+"', f'itemCnt="{count}"', m.group(1))
        return f"<hh:{cont}{attrs}>{m.group(2)}</hh:{cont}>"

    return re.sub(rf'<hh:{cont}([^>]*)>([\s\S]*?)</hh:{cont}>', fix, xml, count=1)


def max_id(xml, tag):
    ids = [int(x) for x in re.findall(rf'<hh:{tag} id="(\d+)"', xml)]
    return max(ids) if ids else -1


def is_survey_table(tbl):
    if not re.search(r'colCnt="7"', tbl):
        return False
    texts = "".join(re.findall(r"<hp:t[^>]*>([^<]*)</hp:t>", tbl)).replace(" ", "")
    return "점검내용" in texts and "발생원인" in texts


def sanitize_border_fill(block, orig_id):
    if orig_id in HEADER_GRAD_IDS:
        return block
    block = re.sub(r"<hc:fillBrush>[\s\S]*?</hc:fillBrush>", "", block)
    block = re.sub(r"<hc:gradation[^>]*/>", "", block)
    block = re.sub(r"<hc:gradation[^>]*>[\s\S]*?</hc:gradation>", "", block)
    return block


def sanitize_char_pr(block, transparent_bf_new_id=None):
    """글자 바탕/테두리 박스 제거. shadeColor=none, 투명 borderFill만 유지."""
    block = re.sub(r'\s*shadeColor="[^"]*"', ' shadeColor="none"', block)
    block = re.sub(r'\s*borderFillIDRef="[^"]*"', "", block)
    if transparent_bf_new_id:
        block = re.sub(
            r'(<hh:charPr\b[^>]*?)(/?>)',
            lambda m: f'{m.group(1)} borderFillIDRef="{transparent_bf_new_id}"{m.group(2)}',
            block,
            count=1,
        )
    return block


def sanitize_para_pr(block):
    block = re.sub(r"<hh:border[^>]*/>", "", block)
    block = re.sub(r"<hh:border[^>]*>[\s\S]*?</hh:border>", "", block)
    return block


def font_groups(xml):
    return {m.group(1): m.group(0) for m in re.finditer(r'<hh:fontface lang="([^"]+)"[^>]*>[\s\S]*?</hh:fontface>', xml)}


def font_block(group, fid):
    m = re.search(rf'<hh:font id="{fid}"[^>]*>[\s\S]*?</hh:font>', group) or re.search(rf'<hh:font id="{fid}"[^>]*/>', group)
    return m.group(0) if m else None


def merge_fonts(tgt_hdr, stamp_hdr, font_ids):
    """언어 그룹별로 스탬프 글꼴을 새 id로 추가. 반환: {lang: {old: new}}"""
    lang_maps = {}
    for lang, sgroup in font_groups(stamp_hdr).items():
        tgroups = font_groups(tgt_hdr)
        if lang not in tgroups:
            continue
        tgroup = tgroups[lang]
        existing = [int(x) for x in re.findall(r'<hh:font id="(\d+)"', tgroup)]
        nxt = (max(existing) + 1) if existing else 0
        fmap = {}
        new_group = tgroup
        for fid in sorted(font_ids, key=int):
            src = font_block(sgroup, fid)
            if not src:
                continue
            # 같은 얼굴(face)이 이미 있으면 재사용
            face = re.search(r'face="([^"]*)"', src)
            reuse = None
            if face:
                rm = re.search(rf'<hh:font id="(\d+)"[^>]*face="{re.escape(face.group(1))}"', tgroup)
                if rm:
                    reuse = rm.group(1)
            if reuse is not None:
                fmap[fid] = reuse
                continue
            fmap[fid] = str(nxt)
            renum = re.sub(r'^<hh:font id="\d+"', f'<hh:font id="{nxt}"', src)
            new_group = new_group.replace("</hh:fontface>", renum + "</hh:fontface>")
            nxt += 1
        cnt = len(re.findall(r"<hh:font ", new_group))
        new_group = re.sub(r'fontCnt="\d+"', f'fontCnt="{cnt}"', new_group, count=1)
        tgt_hdr = tgt_hdr.replace(tgroup, new_group)
        lang_maps[lang] = fmap
    return tgt_hdr, lang_maps


def remap_attr(xml, attr, idmap):
    return re.sub(rf'{attr}="(\d+)"', lambda m: f'{attr}="{idmap[m.group(1)]}"' if m.group(1) in idmap else m.group(0), xml)


def remap_font_ref(char_block, lang_maps):
    def fix(m):
        tag = m.group(0)
        for attr, lang in FONT_ATTR_TO_LANG.items():
            fmap = lang_maps.get(lang, {})
            tag = re.sub(rf'{attr}="(\d+)"', lambda mm: f'{attr}="{fmap.get(mm.group(1), mm.group(1))}"', tag)
        return tag
    return re.sub(r"<hh:fontRef[^>]*/>", fix, char_block)


def merge(tgt_hdr, stamp_hdr, stamp_tbl):
    border_ids = set(re.findall(r'borderFillIDRef="(\d+)"', stamp_tbl))
    char_ids = set(re.findall(r'charPrIDRef="(\d+)"', stamp_tbl))
    para_ids = set(re.findall(r'paraPrIDRef="(\d+)"', stamp_tbl))
    style_ids = set(re.findall(r'styleIDRef="(\d+)"', stamp_tbl))
    border_ids.add(CHAR_TRANSPARENT_BF_ID)
    for sid in style_ids:
        b = tag_block(stamp_hdr, "style", sid)
        if b:
            pm = re.search(r'paraPrIDRef="(\d+)"', b)
            cm = re.search(r'charPrIDRef="(\d+)"', b)
            if pm: para_ids.add(pm.group(1))
            if cm: char_ids.add(cm.group(1))
    font_ids = set()
    for cid in char_ids:
        b = tag_block(stamp_hdr, "charPr", cid)
        if b:
            bm = re.search(r'borderFillIDRef="(\d+)"', b)
            if bm: border_ids.add(bm.group(1))
            for m in re.finditer(r'(?:hangul|latin|hanja|japanese|other|symbol|user)="(\d+)"', b):
                font_ids.add(m.group(1))

    out = tgt_hdr
    out, lang_maps = merge_fonts(out, stamp_hdr, font_ids)

    def alloc(tag, ids):
        nxt = max_id(out, tag) + 1
        m = {}
        for i in sorted(ids, key=int):
            m[i] = str(nxt); nxt += 1
        return m

    border_map = alloc("borderFill", border_ids)
    char_map = alloc("charPr", char_ids)
    para_map = alloc("paraPr", para_ids)
    style_map = alloc("style", style_ids)

    for bid in sorted(border_ids, key=int):
        b = tag_block(stamp_hdr, "borderFill", bid)
        if not b: raise SystemExit(f"stamp borderFill {bid} missing")
        b = re.sub(r'^<hh:borderFill id="\d+"', f'<hh:borderFill id="{border_map[bid]}"', b)
        out = append_block(out, "borderFill", sanitize_border_fill(b, bid))
    transparent_bf_new = border_map.get(CHAR_TRANSPARENT_BF_ID)
    for cid in sorted(char_ids, key=int):
        b = tag_block(stamp_hdr, "charPr", cid)
        if not b: raise SystemExit(f"stamp charPr {cid} missing")
        b = re.sub(r'^<hh:charPr id="\d+"', f'<hh:charPr id="{char_map[cid]}"', b)
        b = remap_attr(b, "borderFillIDRef", border_map)
        b = remap_font_ref(b, lang_maps)
        out = append_block(out, "charPr", sanitize_char_pr(b, transparent_bf_new))
    for pid in sorted(para_ids, key=int):
        b = tag_block(stamp_hdr, "paraPr", pid)
        if not b: raise SystemExit(f"stamp paraPr {pid} missing")
        b = re.sub(r'^<hh:paraPr id="\d+"', f'<hh:paraPr id="{para_map[pid]}"', b)
        out = append_block(out, "paraPr", sanitize_para_pr(b))
    for sid in sorted(style_ids, key=int):
        b = tag_block(stamp_hdr, "style", sid)
        if not b: raise SystemExit(f"stamp style {sid} missing")
        b = re.sub(r'id="\d+"', f'id="{style_map[sid]}"', b, count=1)
        b = remap_attr(b, "paraPrIDRef", para_map)
        b = remap_attr(b, "charPrIDRef", char_map)
        b = re.sub(r'nextStyleIDRef="\d+"', f'nextStyleIDRef="{style_map[sid]}"', b)
        out = append_block(out, "style", b)
    for tag in CONTAINER:
        out = sync_item_cnt(out, tag)

    tbl = stamp_tbl
    tbl = remap_attr(tbl, "borderFillIDRef", border_map)
    tbl = remap_attr(tbl, "charPrIDRef", char_map)
    tbl = remap_attr(tbl, "paraPrIDRef", para_map)
    tbl = remap_attr(tbl, "styleIDRef", style_map)
    tbl = re.sub(r"<hp:(p|run)\b([^>]*)>", lambda m: f"<hp:{m.group(1)}{re.sub(r' borderFillIDRef=\"\\d+\"', '', m.group(2))}>", tbl)
    return out, tbl, {"borderFill": border_map, "charPr": char_map, "paraPr": para_map, "style": style_map, "font": lang_maps}


def replace_survey_tables(sec, new_tbl):
    count = [0]

    def rep(m):
        old = m.group(0)
        if not is_survey_table(old):
            return old
        count[0] += 1
        oid = re.search(r'\bid="(\d+)"', old).group(1)
        return re.sub(r'\bid="\d+"', f'id="{oid}"', new_tbl, count=1)

    return re.sub(r"<hp:tbl[^>]*>[\s\S]*?</hp:tbl>", rep, sec), count[0]


def verify(hdr, sec, maps):
    errors = []
    for tag, attr in [("borderFill", "borderFillIDRef"), ("charPr", "charPrIDRef"), ("paraPr", "paraPrIDRef"), ("style", "styleIDRef")]:
        defined = set(re.findall(rf'<hh:{tag} id="(\d+)"', hdr))
        used = set(re.findall(rf'{attr}="(\d+)"', sec))
        orphan = sorted(used - defined, key=int)
        if orphan:
            errors.append(f"{attr} orphan refs: {orphan}")
        cont = CONTAINER[tag]
        cnt = int(re.search(rf'<hh:{cont}[^>]*itemCnt="(\d+)"', hdr).group(1))
        if cnt != len(defined):
            errors.append(f"{cont} itemCnt={cnt} but defined={len(defined)}")
    survey = [t for t in re.findall(r"<hp:tbl[^>]*>[\s\S]*?</hp:tbl>", sec) if is_survey_table(t)]
    if not survey:
        errors.append("no survey table after replace")
    allowed_header_grads = {
        maps["borderFill"][oid]
        for oid in HEADER_GRAD_IDS
        if oid in maps["borderFill"]
    }
    for oid in HEADER_GRAD_IDS:
        nid = maps["borderFill"].get(oid)
        b = tag_block(hdr, "borderFill", nid) if nid else None
        if not b or "<hc:gradation" not in b:
            errors.append(f"header grad borderFill {oid}->{nid} missing gradation")
    for t in survey:
        # 데이터 칸에 그라데이션/면채우기가 남아 있으면 글자 배경처럼 보임 (헤더만 예외)
        for bid in set(re.findall(r'borderFillIDRef="(\d+)"', t)):
            if bid in allowed_header_grads:
                continue
            b = tag_block(hdr, "borderFill", bid)
            if b and ("gradation" in b.lower() or "<hc:fillBrush>" in b):
                fc = re.search(r'faceColor="([^"]*)"', b)
                if not (fc and fc.group(1) == "none"):
                    errors.append(f"survey cell borderFill {bid} still has visible fill/grad")
        cps = set(re.findall(r'charPrIDRef="(\d+)"', t))
        for cid in cps:
            b = tag_block(hdr, "charPr", cid)
            if not b:
                errors.append(f"survey charPr {cid} missing")
                continue
            if re.search(r'shadeColor="(?!none)[^"]+"', b):
                errors.append(f"survey charPr {cid} shadeColor not none")
            bm = re.search(r'borderFillIDRef="(\d+)"', b)
            if not bm:
                errors.append(f"survey charPr {cid} missing transparent borderFillIDRef")
            else:
                bf = tag_block(hdr, "borderFill", bm.group(1))
                if not bf:
                    errors.append(f"survey charPr {cid} borderFill {bm.group(1)} missing")
                else:
                    solid = re.findall(r'<(?:left|right|top|bottom)Border type="(?!NONE)([^"]+)"', bf)
                    if solid:
                        errors.append(f"survey charPr {cid} borderFill has visible borders {solid}")
        bf3 = tag_block(hdr, "borderFill", "3")
        if bf3 and bf3.count('type="NONE"') >= 4 and re.search(r'borderFillIDRef="3"', t):
            errors.append("survey table still references bf3 (all NONE)")
    return errors


def main():
    if not STAMP.exists():
        raise SystemExit(f"stamp missing: {STAMP}")
    stamp = read_zip(STAMP)
    stamp_hdr = stamp["Contents/header.xml"].decode("utf-8")
    stamp_sec = stamp[section_name(stamp)].decode("utf-8")
    stamp_tbl = next((t for t in re.findall(r"<hp:tbl[^>]*>[\s\S]*?</hp:tbl>", stamp_sec) if is_survey_table(t)), None)
    if not stamp_tbl:
        raise SystemExit("survey table not found in stamp")

    BACKUP_DIR.mkdir(exist_ok=True)
    ok = True
    for target in TARGETS:
        if not target.exists():
            print("skip (missing):", target.name)
            continue
        shutil.copy2(target, BACKUP_DIR / target.name)
        files = read_zip(target)
        sec_name = section_name(files)
        hdr = files["Contents/header.xml"].decode("utf-8")
        sec = files[sec_name].decode("utf-8")

        new_hdr, new_tbl, maps = merge(hdr, stamp_hdr, stamp_tbl)
        new_sec, replaced = replace_survey_tables(sec, new_tbl)
        errs = verify(new_hdr, new_sec, maps)
        print(f"=== {target.name}: replaced {replaced} survey table(s)")
        print("    borderFill map:", maps["borderFill"])
        print("    charPr map:", maps["charPr"], "paraPr map:", maps["paraPr"], "style map:", maps["style"])
        print("    font map:", maps["font"])
        if errs:
            ok = False
            for e in errs:
                print("    ERROR:", e)
            continue
        if replaced == 0:
            ok = False
            print("    ERROR: no survey table replaced")
            continue

        files["Contents/header.xml"] = new_hdr.encode("utf-8")
        files[sec_name] = new_sec.encode("utf-8")
        with zipfile.ZipFile(target, "w") as zout:
            if "mimetype" in files:
                zout.writestr("mimetype", files["mimetype"], compress_type=zipfile.ZIP_STORED)
            for name, data in files.items():
                if name == "mimetype":
                    continue
                ctype = zipfile.ZIP_STORED if name == "version.xml" else zipfile.ZIP_DEFLATED
                zout.writestr(name, data, compress_type=ctype)
        print("    written OK")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
