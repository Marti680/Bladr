#!/usr/bin/env python3
"""Bygger Bladr i to udgaver fra samme kilde (src/):

  docs/index.html      Selvstændig, installérbar webapp (GitHub Pages). Biblioteker hentes lokalt fra docs/vendor.
  dist/artifact.html   Udgaven der kører som Claude-artifact (biblioteker fra cdnjs).

Brug:  python3 tools/build.py            (begge udgaver)
       python3 tools/build.py --version 2026.11.01-1
"""
import argparse, base64, datetime, hashlib, json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DOCS = os.path.join(ROOT, 'docs')
DIST = os.path.join(ROOT, 'dist')

CDN_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'
CDN_PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/'
CDN_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/'

# Sikkerhed i den installerede udgave: siden må kun hente fra sin egen adresse (ingen eksterne kald).
# 'unsafe-inline' er nødvendigt, fordi hele appen ligger som inline-script og -stil i index.html.
# blob: til workers (PDF.js) og rammer (udskrift), data:/blob: til billeder (underskrift, symboler, miniaturer).
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
       "font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-src blob:; object-src 'none'; "
       "base-uri 'none'; form-action 'none'")

# Skrifttyper ligger lokalt i docs/vendor/fonts (kun latin-tegnsæt, som dækker æ, ø og å). Licens: SIL OFL, se OFL-*.txt.
FONTS = [('IBM Plex Sans', 400, 'ibm-plex-sans-latin-400-normal'), ('IBM Plex Sans', 500, 'ibm-plex-sans-latin-500-normal'),
         ('IBM Plex Sans', 600, 'ibm-plex-sans-latin-600-normal'), ('IBM Plex Mono', 400, 'ibm-plex-mono-latin-400-normal'),
         ('IBM Plex Mono', 500, 'ibm-plex-mono-latin-500-normal'), ('Caveat', 500, 'caveat-latin-500-normal'),
         ('Dancing Script', 500, 'dancing-script-latin-500-normal'), ('Great Vibes', 400, 'great-vibes-latin-400-normal')]
FONT_CSS = ''.join(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;src:url(vendor/fonts/{f}.woff2) format('woff2')}}\n" for fam, w, f in FONTS)
GOOGLE_FONTS = re.compile(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\n?')

# Integritetstjek (SRI) på cdnjs-scripts i artifact-udgaven. Hashene beregnes ud fra de lokale kopier i docs/vendor,
# som er de samme filer som på cdnjs (begge kommer fra npm-pakkerne). Ændres en version, skal den lokale kopi skiftes med.
CDN_FILES = [(CDN_PDFJS, 'pdf.min.js'), (CDN_PDFJS, 'pdf.worker.min.js'), (CDN_PDFLIB, 'pdf-lib.min.js'), (CDN_XLSX, 'xlsx.full.min.js')]

PWA_HEAD = '''<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="__CSP__">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Bladr er en PDF-læser med markering, mål, lag, optælling og underskrift. Filerne bliver på din egen computer.">
<meta name="theme-color" content="#1f5f8b">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<style>
__FONTS__:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
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
        {"action": "./", "accept": {"application/pdf": [".pdf"]},
         "icons": [{"src": "icons/file-pdf-256.png", "sizes": "256x256", "type": "image/png"},
                   {"src": "icons/file-pdf-48.png", "sizes": "48x48", "type": "image/png"}]}
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


def sri(path):
    return 'sha384-' + base64.b64encode(hashlib.sha384(read(path, 'rb')).digest()).decode()


def build_artifact(app):
    for base, f in CDN_FILES:
        tag = f'<script src="{base}{f}"></script>'
        if app.count(tag) != 1:
            raise SystemExit(f'Fandt ikke script-tagget til {f} i src/app.html')
        app = app.replace(tag, f'<script src="{base}{f}" integrity="{sri(os.path.join(DOCS, "vendor", f))}" crossorigin="anonymous"></script>')
    # Bemærk: PDF.js-arbejderen startes også via GlobalWorkerOptions.workerSrc (new Worker(url)). Den vej kan ikke få
    # integrity-tjek; det dækker kun script-tagget ovenfor. Arbejderen hentes fra samme faste cdnjs-adresse med version.
    write(os.path.join(DIST, 'artifact.html'), app)


def build_pwa(app, version):
    body, nf = GOOGLE_FONTS.subn('', app)
    if nf != 2 or 'fonts.googleapis.com' in body or 'fonts.gstatic.com' in body:
        raise SystemExit('Kunne ikke fjerne Google Fonts fra den installerede udgave')
    body = body.replace(CDN_PDFJS, 'vendor/').replace(CDN_PDFLIB, 'vendor/').replace(CDN_XLSX, 'vendor/')
    # Arbejderen kører som rigtig web worker i appen, så den skal ikke også indlæses på siden.
    body, n = re.subn(r'<script src="vendor/pdf\.worker\.min\.js"></script>\n?', '', body)
    if n != 1 or 'cdnjs.cloudflare.com' in body:
        raise SystemExit('Kunne ikke skifte bibliotekerne til lokale filer')
    head = PWA_HEAD.replace('__CSP__', CSP).replace('__FONTS__', FONT_CSS)
    write(os.path.join(DOCS, 'index.html'), head + body + PWA_TAIL)
    shutil.copy(os.path.join(SRC, 'pwa.js'), os.path.join(DOCS, 'pwa.js'))
    write(os.path.join(DOCS, 'sw.js'), read(os.path.join(SRC, 'sw.js')).replace('__VERSION__', version))
    write(os.path.join(DOCS, 'manifest.webmanifest'), json.dumps(MANIFEST, ensure_ascii=False, indent=2) + '\n')
    write(os.path.join(DOCS, '.nojekyll'), '')
    for f in ['pdf.min.js', 'pdf.worker.min.js', 'pdf-lib.min.js', 'xlsx.full.min.js'] + [f'fonts/{x[2]}.woff2' for x in FONTS]:
        if not os.path.exists(os.path.join(DOCS, 'vendor', f)):
            raise SystemExit(f'Mangler docs/vendor/{f}')
    ext = set(re.findall(r'<(?:script|link|img|iframe)[^>]*(?:src|href)="(https?://[^"]+)"', head + body))
    if ext:
        raise SystemExit('Den installerede udgave henter stadig fra eksterne adresser: ' + ', '.join(sorted(ext)))


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
