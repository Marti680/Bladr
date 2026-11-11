# Bladr – noter til udvikling

Bladr er Martins egen PDF-læser og markeringsværktøj. Al brugerflade og tekst er på **dansk**. Ejeren er ikke udvikler: forklar ændringer i almindeligt sprog, og byg det, han beder om, uden at spørge om tekniske detaljer, han ikke kan tage stilling til.

## Struktur

- `src/app.html` – hele appen (HTML, CSS og JS i én fil). Indeholder pladsholderne `__CORE__`, `__SAMPLE__` og `__VERSION__`.
- `src/core.js` – geometri, tegning (SVG-primitiver) og PDF-eksport. Bruges både i browseren og i Node til test (`module.exports`).
- `src/pwa.js` – kun i den installerede udgave: gem-dialog, udskrift, PDF-åbning fra Windows (`launchQueue`), service worker og opdateringsbesked.
- `src/sw.js` – service worker (offline og versionsskift).
- `src/sample.pdf` – eksempeldokumentet, der vises første gang.
- `tools/build.py` – bygger `docs/` (GitHub Pages, installérbar app) og `dist/artifact.html` (Claude-artifact).
- `tools/make_icons.py` – tegner app-ikonerne i `docs/icons/`.
- `docs/vendor/` – PDF.js 3.11.174, pdf-lib 1.17.1 og SheetJS (xlsx) 0.18.5 (lokale kopier, så appen virker offline). Skal matche versionerne på cdnjs i `src/app.html`.

## Arbejdsgang

1. Ret i `src/`.
2. `python3 tools/build.py` – bygger begge udgaver med et nyt versionsnummer.
3. Test: kør `python3 -m http.server` i `docs/` og åbn i Playwright/Chromium. Eksport kan testes i Node med `src/core.js` + `pdf-lib`.
4. Testudgave i Claude: publicér `dist/artifact.html` som artifact (Martins eksisterende Bladr-artifact, med `downloads`-kapabiliteten).
5. Udgivelse: commit `src/` og `docs/` og push til `main`. GitHub Pages viser `docs/` fra `main`. Installerede apps viser "Ny version klar" ved næste start.

Saml gerne flere ændringer i én udgivelse.

## Vigtige principper

- Koordinater for markeringer er i "visningsrum": pt ved zoom 1, origo øverst til venstre, siden som den vises (inkl. sidens egen rotation).
- `core.js` laver primitiver (`path`, `text`, `image`), som både tegnes som SVG og skrives ind i PDF'en, så skærm og eksport er ens.
- Data gemmes pr. browser: IndexedDB (`files`, `annots`) og localStorage (`bladr:*` – indstillinger, navn, værktøjskasse, underskrifter). Intet sendes til en server.
- Brugerens egen artifact-udgave og den installerede app har hver deres lager.
- Hold siden fri for vandret rulning på mobil, og hold farver i tokens på `:root` med mørk tilstand.

## Overbliksdokument

Martin har et Word-dokument `Bladr - overblik.docx` i `C:\Users\mnk96\OneDrive\Claude\Bladr` med: funktioner i Bladr i dag, planlagte funktioner, venteliste (idéer han har valgt at vente med) og mulige huller. Kilden er `tools/overblik/overblik.json`; dokumentet bygges med `node tools/overblik/make.js "<sti>.docx"`.

Hold det opdateret: når en funktion bliver færdig, flyt den fra "planlagt" til "funktioner"; når Martin siger, at en foreslået funktion skal vente, tilføj den på ventelisten med dato og status. Læg derefter det nye dokument i hans mappe (kræver at mappen er forbundet).
