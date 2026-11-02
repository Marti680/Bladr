#!/usr/bin/env python3
"""Tegner Bladrs app-ikoner (docs/icons) ud fra src/logo.svg. Kræver Playwright med Chromium.
Kør kun igen, hvis logoet ændres."""
import asyncio, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'icons')
SVG = open(os.path.join(ROOT, 'src', 'logo.svg'), encoding='utf-8').read()
INNER = re.search(r'<svg[^>]*>(.*)</svg>', SVG, re.S).group(1)
ART = re.sub(r'<rect[^>]*/>', '', INNER, count=1)  # bladet uden den afrundede baggrund


def page(size, maskable):
    if maskable:  # fuld flade og motivet inden for den sikre zone (80 %)
        body = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1f5f8b"/><g transform="translate(32 32) scale(.78) translate(-32 -32)">{ART}</g></svg>'
    else:
        body = SVG.replace('<svg ', f'<svg width="{size}" height="{size}" ', 1)
    return f'<html><body style="margin:0;background:transparent">{body}</body></html>'


async def main():
    from playwright.async_api import async_playwright
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, size, mask in (('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True), ('favicon-32.png', 32, False)):
            pg = await b.new_page(viewport={'width': size, 'height': size})
            await pg.set_content(page(size, mask))
            await pg.screenshot(path=os.path.join(OUT, name), omit_background=True)
            await pg.close()
        # Filikon til PDF'er i Stifinder: selve logoet, så det er tydeligt i små størrelser
        pngs = {}
        for size in (16, 24, 32, 48, 64, 128, 256):
            pg = await b.new_page(viewport={'width': size, 'height': size})
            await pg.set_content(page(size, False))
            path = os.path.join(OUT, f'file-pdf-{size}.png')
            await pg.screenshot(path=path, omit_background=True)
            pngs[size] = path
            await pg.close()
        await b.close()
    from PIL import Image
    imgs = {k: Image.open(v).convert('RGBA') for k, v in pngs.items()}
    imgs[256].save(os.path.join(OUT, 'file-pdf.ico'), format='ICO', sizes=[(k, k) for k in sorted(imgs)],
                   append_images=[imgs[k] for k in sorted(imgs) if k != 256])
    for k, v in pngs.items():  # kun 48 og 256 bruges i manifestet
        if k not in (48, 256): os.remove(v)
    print('Ikoner gemt i', OUT)

asyncio.run(main())
