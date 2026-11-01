#!/usr/bin/env python3
"""Bygger Bladr i to udgaver fra samme kilde (src/):

  docs/index.html      Selvstændig, installérbar webapp (GitHub Pages). Biblioteker hentes lokalt fra docs/vendor.
  dist/artifact.html   Udgaven der kører som Claude-artifact (biblioteker fra cdnjs).

Brug:  python3 tools/build.py            (begge udgaver)
       python3 tools/build.py --version 2026.11.01-1
"""
import argparse, base64, datetime, json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DOCS = os.path.join(ROOT, 'docs')
DIST = os.path.join(ROOT, 'dist')

CDN_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'
CDN_PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/'

PWA_HEAD = '''<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Bladr er en PDF-læser med markering, mål, lag, optælling og underskrift. Filerne bliver på din egen computer.">
<meta name="theme-color" content="#1f5f8b">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<style>
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}
img{max-width:100%}
[hidden]{display:none!important}
.updbar{position:fixed;z-index:70;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:12px;
  background:#1b232b;color:#fff;padding:8px 10px 8px 14px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);font-size:13px;max-width:calc(100% - 32px)}
.updbar button{border:0;border-radius:6px;background:#6fb0dc;color:#0d1a24;font:inherit;font-weight:600;padding:6px 12px;cursor:pointer}
</style>
<script src="pwa.js"></script>
</head>
<body>
'''
PWA_TAIL = '''
<div class="updbar" id="updBar" hidden role="status">Der er en ny version af Bladr klar. <button type="button" id="updGo">Genstart nu</button></div>
</body>
</html>
'''

MANIFEST = {
    "name": "Bladr PDF-læser",
    "short_name": "Bladr",
    "description": "PDF-læser med markering, mål, lag, optælling og underskrift. Filerne bliver på din egen computer.",
    "lang": "da",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "background_color": "#e7ebee",
    "theme_color": "#1f5f8b",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ],
    "file_handlers": [
        {"action": "./", "accept": {"application/pdf": [".pdf"]}}
    ],
    "launch_handler": {"client_mode": "focus-existing"}
}


def read(p, mode='r'):
    with open(p, mode, **({} if 'b' in mode else {'encoding': 'utf-8'})) as f:
        return f.read()


def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)


def assemble(version):
    app = read(os.path.join(SRC, 'app.html'))
    core = read(os.path.join(SRC, 'core.js')).replace("if(typeof module !== 'undefined') module.exports = BladrCore;", '')
    sample = base64.b64encode(read(os.path.join(SRC, 'sample.pdf'), 'rb')).decode()
    for key, val in (('__CORE__', core), ('__SAMPLE__', sample), ('__VERSION__', version)):
        if key not in app:
            raise SystemExit(f'Mangler {key} i src/app.html')
        app = app.replace(key, val)
    return app


def build_artifact(app):
    write(os.path.join(DIST, 'artifact.html'), app)


def build_pwa(app, version):
    body = app.replace(CDN_PDFJS, 'vendor/').replace(CDN_PDFLIB, 'vendor/')
    # Arbejderen kører som rigtig web worker i appen, så den skal ikke også indlæses på siden.
    body, n = re.subn(r'<script src="vendor/pdf\.worker\.min\.js"></script>\n?', '', body)
    if n != 1 or 'cdnjs.cloudflare.com' in body:
        raise SystemExit('Kunne ikke skifte bibliotekerne til lokale filer')
    write(os.path.join(DOCS, 'index.html'), PWA_HEAD + body + PWA_TAIL)
    shutil.copy(os.path.join(SRC, 'pwa.js'), os.path.join(DOCS, 'pwa.js'))
    write(os.path.join(DOCS, 'sw.js'), read(os.path.join(SRC, 'sw.js')).replace('__VERSION__', version))
    write(os.path.join(DOCS, 'manifest.webmanifest'), json.dumps(MANIFEST, ensure_ascii=False, indent=2) + '\n')
    write(os.path.join(DOCS, '.nojekyll'), '')
    for f in ('pdf.min.js', 'pdf.worker.min.js', 'pdf-lib.min.js'):
        if not os.path.exists(os.path.join(DOCS, 'vendor', f)):
            raise SystemExit(f'Mangler docs/vendor/{f}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default=datetime.datetime.now(datetime.timezone.utc).strftime('%Y.%m.%d-%H%M'))
    a = ap.parse_args()
    app = assemble(a.version)
    build_artifact(app)
    build_pwa(app, a.version)
    print('Bygget version', a.version)


if __name__ == '__main__':
    main()
