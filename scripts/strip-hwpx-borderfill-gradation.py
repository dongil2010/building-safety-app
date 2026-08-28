# -*- coding: utf-8 -*-
"""HWPX header.xml에서 borderFill 그라데이션 채우기 제거."""
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [
    ROOT / 'templates' / 'hwpx_grade3_survey_stamp.hwpx',
    ROOT / 'templates' / 'hwpx_grade12_survey_stamp.hwpx',
]


def strip_gradation(xml: str) -> str:
    return re.sub(r'<hc:fillBrush>[\s\S]*?</hc:fillBrush>', '', xml)


def patch_hwpx(path: Path) -> int:
    with zipfile.ZipFile(path, 'r') as zin:
        items = {name: zin.read(name) for name in zin.namelist()}
    header = items['Contents/header.xml'].decode('utf-8')
    before = header.count('gradation')
    if before == 0:
        return 0
    items['Contents/header.xml'] = strip_gradation(header).encode('utf-8')
    tmp = path.with_suffix('.tmp.hwpx')
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for name, data in items.items():
            zout.writestr(name, data)
    tmp.replace(path)
    return before


def main():
    for path in TARGETS:
        if not path.exists():
            print('skip missing', path)
            continue
        n = patch_hwpx(path)
        print(path.name, 'removed gradation blocks:', n)


if __name__ == '__main__':
    main()
