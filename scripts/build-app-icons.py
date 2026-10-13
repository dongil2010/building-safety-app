#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""DONGIL 로고를 PC 설치 아이콘과 안드로이드 런처 아이콘으로 만든다."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'branding', 'dongil-logo.jpg')


def content_box(im, threshold=242):
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            if r < threshold or g < threshold or b < threshold:
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
    if maxx <= minx or maxy <= miny:
        return im
    pad = int(max(maxx - minx, maxy - miny) * 0.04) + 2
    return im.crop((
        max(0, minx - pad),
        max(0, miny - pad),
        min(w, maxx + pad + 1),
        min(h, maxy + pad + 1),
    ))


def square_icon(logo, size):
    canvas = Image.new('RGB', (size, size), (255, 255, 255))
    margin = int(size * 0.08)
    box = size - margin * 2
    fitted = logo.copy()
    fitted.thumbnail((box, box), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y))
    return canvas


def main():
    im = Image.open(SRC).convert('RGB')
    logo = content_box(im)
    branding = os.path.join(ROOT, 'branding')
    os.makedirs(branding, exist_ok=True)
    master = square_icon(logo, 1024)
    master.save(os.path.join(branding, 'icon.png'), 'PNG')
    ico_base = square_icon(logo, 256)
    ico_base.save(
        os.path.join(branding, 'icon.ico'),
        format='ICO',
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    densities = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }
    fg = {
        'mipmap-mdpi': 108,
        'mipmap-hdpi': 162,
        'mipmap-xhdpi': 216,
        'mipmap-xxhdpi': 324,
        'mipmap-xxxhdpi': 432,
    }
    res = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
    for folder, size in densities.items():
        icon = square_icon(logo, size)
        dest = os.path.join(res, folder)
        icon.save(os.path.join(dest, 'ic_launcher.png'), 'PNG')
        icon.save(os.path.join(dest, 'ic_launcher_round.png'), 'PNG')
    for folder, size in fg.items():
        # 원형 마스크에 글자가 잘리지 않게 안쪽에 넣는다.
        canvas = Image.new('RGB', (size, size), (255, 255, 255))
        inner = int(size * 0.62)
        fitted = logo.copy()
        fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
        canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
        canvas.save(os.path.join(res, folder, 'ic_launcher_foreground.png'), 'PNG')
    print('icons written', logo.size)


if __name__ == '__main__':
    main()
