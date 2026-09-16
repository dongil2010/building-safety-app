#!/usr/bin/env python3
"""Offline fixture check for HWPX survey templates vs export slot logic.

Replays discoverFloorSlots + stripExcess + floor-stamp clone against the four
bundled templates. No live building data required.

Run: python3 scripts/test-hwpx-template-slots.py
"""
from __future__ import annotations

import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
HP = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
FLOOR_TITLE_RE = re.compile(r'^\d+\)\s*.+층')

TEMPLATES = {
    'precision12': ('templates/hwpx_survey_template.hwpx', '12'),
    'regular12': ('templates/hwpx_survey_template_regular.hwpx', '12'),
    'precision3': ('templates/hwpx_survey_template_grade3.hwpx', '3'),
    'regular3': ('templates/hwpx_survey_template_grade3_regular.hwpx', '3'),
}


def para_text(p) -> str:
    return ''.join((t.text or '') for t in p.iter(HP + 't'))


def header_joined(tbl) -> str:
    first_tr = next(tbl.iter(HP + 'tr'), None)
    if first_tr is None:
        return ''
    return ''.join((t.text or '') for t in first_tr.iter(HP + 't')).replace(' ', '')


def is_current_status(tbl, kind: str) -> bool:
    h = header_joined(tbl)
    if kind == '3':
        return '점검내용' in h and '발생원인' in h
    return (
        '구분(NO' in h
        and '조사내용' in h
        and ('크기(mm' in h or '크기' in h)
        and '부재종류' not in h
    )


def section_paras(path: str):
    z = zipfile.ZipFile(os.path.join(ROOT, path))
    names = z.namelist()
    sec_name = 'Contents/section1.xml' if 'Contents/section1.xml' in names else 'Contents/section0.xml'
    root = ET.fromstring(z.read(sec_name))
    sec = next(el for el in root.iter() if el.tag.endswith('}sec'))
    paras = [c for c in list(sec) if c.tag.endswith('}p')]
    return z, sec_name, sec, paras


def discover(paras, kind: str, require_loc: bool):
    starts = [i for i, p in enumerate(paras) if FLOOR_TITLE_RE.search(para_text(p).strip())]
    slots = []
    for idx, s in enumerate(starts):
        e = starts[idx + 1] if idx + 1 < len(starts) else len(paras)
        status = []
        photo = None
        loc = None
        for i in range(s, e):
            txt = para_text(paras[i]).strip()
            tbls = list(paras[i].iter(HP + 'tbl'))
            if not tbls:
                continue
            if i == s:
                for t in tbls:
                    if is_current_status(t, kind):
                        status.append(t)
                continue
            if photo is None and txt.startswith('사진1'):
                photo = tbls[0]
                continue
            if photo is None:
                for t in tbls:
                    if is_current_status(t, kind):
                        status.append(t)
        for i in range(e - 1, s, -1):
            tbls = list(paras[i].iter(HP + 'tbl'))
            if len(tbls) == 1 and len(list(tbls[0].iter(HP + 'pic'))) == 1:
                loc = tbls[0]
                break
        ok = bool(status) and photo is not None
        if require_loc:
            ok = ok and loc is not None
        if ok:
            slots.append({
                'title': paras[s],
                'status': status,
                'photo': photo,
                'loc': loc,
            })
    return starts, slots


def strip_excess_new(slot):
    """Fixed strip: never delete the paragraph that still holds keep."""
    tables = slot['status']
    if len(tables) <= 1:
        return
    title = slot['title']
    keep = tables[0]

    def owning(node):
        p = node
        while p is not None and not str(p.tag).endswith('}p'):
            p = getattr(p, '_parent', None)
        return p

    keep_para = owning(keep)
    remain = [keep]
    for tbl in tables[1:]:
        p = owning(tbl)
        if p is not None and (p is keep_para or p is title):
            parent = tbl.getparent() if hasattr(tbl, 'getparent') else None
            # ElementTree: use parent map
            continue
        remain.append(tbl)
    # ElementTree lacks getparent; use stored parent map instead
    slot['_keep'] = keep
    slot['_keep_para'] = keep_para


def parent_map(sec):
    mapping = {}
    for parent in sec.iter():
        for child in list(parent):
            mapping[child] = parent
    return mapping


def owning_para(node, pmap):
    p = node
    while p is not None and not str(getattr(p, 'tag', '')).endswith('}p'):
        p = pmap.get(p)
    return p


def strip_excess_fixed(slot, pmap, sec):
    tables = [t for t in slot['status'] if pmap.get(t) is not None]
    if len(tables) <= 1:
        slot['status'] = tables
        return
    title = slot['title']
    keep = tables[0]
    keep_para = owning_para(keep, pmap)
    for tbl in tables[1:]:
        if pmap.get(tbl) is None:
            continue
        p = owning_para(tbl, pmap)
        if p is not None and (p is keep_para or p is title):
            parent = pmap[tbl]
            parent.remove(tbl)
            pmap.pop(tbl, None)
            continue
        if p is not None and pmap.get(p) is not None:
            pmap[p].remove(p)
            # detach descendants
            for el in list(p.iter()):
                pmap.pop(el, None)
            pmap.pop(p, None)
        elif pmap.get(tbl) is not None:
            pmap[tbl].remove(tbl)
            pmap.pop(tbl, None)
    slot['status'] = [keep] if pmap.get(keep) is not None else [
        t for t in tables if pmap.get(t) is not None
    ][:1]


def strip_excess_old(slot, pmap):
    tables = [t for t in slot['status'] if pmap.get(t) is not None]
    if len(tables) <= 1:
        slot['status'] = tables
        return
    title = slot['title']
    keep = tables[0]
    for tbl in tables[1:]:
        if pmap.get(tbl) is None:
            continue
        p = owning_para(tbl, pmap)
        if p is not None and p is title:
            pmap[tbl].remove(tbl)
            pmap.pop(tbl, None)
            continue
        if p is not None and pmap.get(p) is not None:
            pmap[p].remove(p)
            for el in list(p.iter()):
                pmap.pop(el, None)
            pmap.pop(p, None)
        elif pmap.get(tbl) is not None:
            pmap[tbl].remove(tbl)
            pmap.pop(tbl, None)
    slot['status'] = [keep] if pmap.get(keep) is not None else [
        t for t in tables if pmap.get(t) is not None
    ][:1]


def count_secpr(sec) -> int:
    return sum(1 for el in sec.iter(HP + 'secPr'))


def check_template(name: str, rel: str, kind: str) -> list[str]:
    errors = []
    _z, sec_name, sec, paras = section_paras(rel)
    require_loc = kind == '12'
    starts, slots = discover(paras, kind, require_loc)
    if not starts:
        errors.append(f'{name}: no floor title paragraphs ({sec_name})')
        return errors
    if not slots:
        errors.append(f'{name}: discoverFloorSlots found 0 slots in {sec_name}')
        return errors

    slot = slots[0]
    if not slot['status']:
        errors.append(f'{name}: first slot has no current status table')
        return errors

    # Old strip on a fresh parse
    _z2, _s2, sec_old, paras_old = section_paras(rel)
    _st, slots_old = discover(paras_old, kind, require_loc)
    pmap_old = parent_map(sec_old)
    strip_excess_old(slots_old[0], pmap_old)
    old_keep_alive = bool(slots_old[0]['status']) and pmap_old.get(slots_old[0]['status'][0]) is not None

    # New strip
    _z3, _s3, sec_new, paras_new = section_paras(rel)
    _st, slots_new = discover(paras_new, kind, require_loc)
    pmap_new = parent_map(sec_new)
    strip_excess_fixed(slots_new[0], pmap_new, sec_new)
    new_keep_alive = bool(slots_new[0]['status']) and pmap_new.get(slots_new[0]['status'][0]) is not None
    if not new_keep_alive:
        errors.append(f'{name}: fixed stripExcess detached the keep status table')

    if name == 'precision12' and old_keep_alive:
        errors.append('precision12: expected old stripExcess to detach keep (bug disappeared?)')
    if name != 'precision12' and not old_keep_alive:
        # regular12 keep is in title para so old path should survive
        if name == 'regular12':
            errors.append('regular12: old strip unexpectedly detached title-para keep')

    # secPr duplication: clone title→end twice without stripping, vs with strip
    title = slots[0]['title']
    title_idx = paras.index(title)
    stamp = paras[title_idx:]
    secpr_in_stamp = sum(1 for p in stamp for _ in p.iter(HP + 'secPr'))
    if name == 'regular12' and secpr_in_stamp < 1:
        errors.append('regular12: expected hp:secPr in the floor stamp title paragraph')
    if name in ('precision12', 'precision3') and secpr_in_stamp != 0:
        errors.append(f'{name}: floor stamp should not include the document secPr')

    print(
        f'  {name:12} section={sec_name:22} titles={len(starts)} '
        f'slots={len(slots)} statusTbls={len(slot["status"])} '
        f'oldKeep={old_keep_alive} newKeep={new_keep_alive} '
        f'secPrInStamp={secpr_in_stamp}'
    )
    return errors


def main() -> int:
    print('HWPX template slot fixture check')
    errors = []
    for name, (rel, kind) in TEMPLATES.items():
        full = os.path.join(ROOT, rel)
        if not os.path.isfile(full):
            errors.append(f'missing template {rel}')
            continue
        errors.extend(check_template(name, rel, kind))
    if errors:
        print('FAILED:')
        for e in errors:
            print(' -', e)
        return 1
    print('ok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
