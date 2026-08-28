# -*- coding: utf-8 -*-
"""결함조사표 양식 hwpx → 전체 템플릿에 표 + header 스타일(굴림·테두리) 동시 이식."""
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(r'D:\work\양식')
TPL = ROOT / 'templates'

SRC_GRADE12 = WORK / '결함조사표 양식 1,2종.hwpx'
SRC_GRADE3 = WORK / '결함조사표 양식 3종.hwpx'

TARGETS = {
    SRC_GRADE12: [
        TPL / 'hwpx_survey_template.hwpx',
        TPL / 'hwpx_survey_template_regular.hwpx',
    ],
    SRC_GRADE3: [
        TPL / 'hwpx_survey_template_grade3.hwpx',
        TPL / 'hwpx_survey_template_grade3_regular.hwpx',
    ],
}


def read_parts(z):
    sec = 'Contents/section1.xml' if 'Contents/section1.xml' in z.namelist() else 'Contents/section0.xml'
    return sec, z.read(sec).decode('utf-8'), z.read('Contents/header.xml').decode('utf-8')


def is_survey_table(tbl_xml, grade3):
    col_m = re.search(r'colCnt="(\d+)"', tbl_xml)
    if not col_m:
        return False
    col = int(col_m.group(1))
    texts = ''.join(re.findall(r'<hp:t[^>]*>([^<]*)</hp:t>', tbl_xml)[:16]).replace(' ', '')
    if grade3:
        return col == 7 and '점검내용' in texts and '발생원인' in texts
    return col == 10 and '조사내용' in texts and '구분' in texts and '부재종류' not in texts


def extract_survey_table(src_path, grade3):
    with zipfile.ZipFile(src_path) as z:
        _, xml, _ = read_parts(z)
    tables = [m.group(0) for m in re.finditer(r'<hp:tbl[^>]*>.*?</hp:tbl>', xml, re.S) if is_survey_table(m.group(0), grade3)]
    if not tables:
        raise RuntimeError(f'상태조사표를 찾지 못함: {src_path}')
    return tables[0]


def tag_block(xml, tag, eid):
    pat = rf'<hh:{tag} id="{eid}"[^>]*>.*?</hh:{tag}>'
    m = re.search(pat, xml, re.S)
    return m.group(0) if m else None


def font_block(xml, fid):
    m = re.search(rf'<hh:font id="{fid}"[^>]*/>', xml)
    return m.group(0) if m else None


def upsert_block(xml, tag, eid, block):
    pat = rf'<hh:{tag} id="{eid}"[^>]*>.*?</hh:{tag}>'
    if re.search(pat, xml, re.S):
        return re.sub(pat, block, xml, count=1, flags=re.S)
    # borderFill / charPr / paraPr 목록 끝에 삽입
    container_pat = rf'(<hh:{tag}s[^>]*>)(.*?)(</hh:{tag}s>)'
    m = re.search(container_pat, xml, re.S)
    if m:
        inner = m.group(2) + block
        return xml[:m.start(2)] + inner + xml[m.end(2):]
    return xml


def upsert_font(xml, fid, block):
    pat = rf'<hh:font id="{fid}"[^>]*/>'
    if re.search(pat, xml):
        return re.sub(pat, block, xml, count=1)
    m = re.search(r'(<hh:fontfaces[^>]*>)(.*?)(</hh:fontfaces>)', xml, re.S)
    if m:
        inner = m.group(2) + block
        return xml[:m.start(2)] + inner + xml[m.end(2):]
    return xml


def collect_style_ids(table_xml, src_header):
    border_ids = set(re.findall(r'borderFillIDRef="(\d+)"', table_xml))
    char_ids = set(re.findall(r'charPrIDRef="(\d+)"', table_xml))
    para_ids = set(re.findall(r'paraPrIDRef="(\d+)"', table_xml))
    font_ids = set()
    for cid in list(char_ids):
        block = tag_block(src_header, 'charPr', cid)
        if block:
            border_ids.update(re.findall(r'borderFillIDRef="(\d+)"', block))
            font_ids.update(re.findall(r'(?:hangul|latin|hanja|japanese|other|symbol|user)="(\d+)"', block))
    for pid in list(para_ids):
        block = tag_block(src_header, 'paraPr', pid)
        if block:
            char_ids.update(re.findall(r'charPrIDRef="(\d+)"', block))
    return border_ids, char_ids, para_ids, font_ids


def merge_header(src_header, tgt_header, table_xml):
    border_ids, char_ids, para_ids, font_ids = collect_style_ids(table_xml, src_header)
    out = tgt_header
    for fid in sorted(font_ids, key=int):
        block = font_block(src_header, fid)
        if block:
            out = upsert_font(out, fid, block)
    for bid in sorted(border_ids, key=int):
        block = tag_block(src_header, 'borderFill', bid)
        if block:
            out = upsert_block(out, 'borderFill', bid, block)
    for cid in sorted(char_ids, key=int):
        block = tag_block(src_header, 'charPr', cid)
        if block:
            out = upsert_block(out, 'charPr', cid, block)
    for pid in sorted(para_ids, key=int):
        block = tag_block(src_header, 'paraPr', pid)
        if block:
            out = upsert_block(out, 'paraPr', pid, block)
    return out


def replace_tbl_keep_id(old_tbl, new_tbl):
    old_id = re.search(r'\bid="(\d+)"', old_tbl)
    if old_id:
        new_tbl = re.sub(r'\bid="\d+"', f'id="{old_id.group(1)}"', new_tbl, count=1)
    return new_tbl


def patch_target(target_path, stamp_table, src_header, grade3):
    backup = target_path.with_suffix(target_path.suffix + '.bak')
    if backup.exists():
        shutil.copy2(backup, target_path)
    elif not backup.exists():
        shutil.copy2(target_path, backup)

    with zipfile.ZipFile(target_path, 'r') as zin:
        sec_name, sec_xml, tgt_header = read_parts(zin)
        items = {name: zin.read(name) for name in zin.namelist()}

    new_xml = sec_xml
    offset = 0
    replaced = 0
    for m in list(re.finditer(r'<hp:tbl[^>]*>.*?</hp:tbl>', sec_xml, re.S)):
        tbl = m.group(0)
        if not is_survey_table(tbl, grade3):
            continue
        patched = replace_tbl_keep_id(tbl, stamp_table)
        start, end = m.start() + offset, m.end() + offset
        new_xml = new_xml[:start] + patched + new_xml[end:]
        offset += len(patched) - (m.end() - m.start())
        replaced += 1

    if replaced == 0:
        raise RuntimeError(f'교체할 표 없음: {target_path}')

    items[sec_name] = new_xml.encode('utf-8')
    items['Contents/header.xml'] = merge_header(src_header, tgt_header, stamp_table).encode('utf-8')

    tmp = target_path.with_suffix('.tmp.hwpx')
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for name, data in items.items():
            zout.writestr(name, data)
    tmp.replace(target_path)
    return replaced


def main():
    for src, targets in TARGETS.items():
        if not src.exists():
            raise FileNotFoundError(src)
        grade3 = '3종' in src.name
        with zipfile.ZipFile(src) as z:
            _, _, src_header = read_parts(z)
        stamp = extract_survey_table(src, grade3)
        col = re.search(r'colCnt="(\d+)"', stamp).group(1)
        print(f'{src.name}: col={col} stamp + header merge')
        for t in targets:
            if not t.exists():
                print('  SKIP:', t.name)
                continue
            n = patch_target(t, stamp, src_header, grade3)
            print(f'  OK {t.name}: {n} tables')

if __name__ == '__main__':
    main()
