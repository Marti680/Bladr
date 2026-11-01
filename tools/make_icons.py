#!/usr/bin/env python3
"""Tegner Bladrs app-ikoner (docs/icons). Kør kun igen, hvis ikonet skal ændres."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'icons')
BLUE, PAPER, FOLD, INK, MARK = (31, 95, 139), (255, 255, 255), (212, 228, 239), (31, 95, 139), (240, 140, 0)


def draw(size, maskable=False):
    s = 4 * size  # tegn stort og skalér ned for bløde kanter
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BLUE)
        k = 0.62  # indhold inden for den sikre zone
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLUE)
        k = 0.78
    w, h = s * k * 0.66, s * k * 0.86
    x0, y0 = (s - w) / 2, (s - h) / 2
    f = w * 0.3
    d.polygon([(x0, y0), (x0 + w - f, y0), (x0 + w, y0 + f), (x0 + w, y0 + h), (x0, y0 + h)], fill=PAPER)
    d.polygon([(x0 + w - f, y0), (x0 + w - f, y0 + f), (x0 + w, y0 + f)], fill=FOLD)
    lw = max(2, int(s * 0.022))
    for i, frac in enumerate((0.32, 0.46, 0.60)):
        y = y0 + h * frac
        d.line([(x0 + w * 0.16, y), (x0 + w * (0.84 if i else 0.6), y)], fill=INK, width=lw)
    # målelinje med endestreger nederst på siden
    y = y0 + h * 0.80
    a, b = x0 + w * 0.16, x0 + w * 0.84
    d.line([(a, y), (b, y)], fill=MARK, width=lw)
    for x in (a, b):
        d.line([(x, y - w * 0.07), (x, y + w * 0.07)], fill=MARK, width=lw)
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('Ikoner gemt i', OUT)
