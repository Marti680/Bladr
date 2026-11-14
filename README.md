# Bladr

En PDF-læser med markering, mål, lag, optælling, stempler og underskrift. Bladr kører i browseren og kan installeres som et program på Windows. **Dine PDF'er forlader aldrig din computer**: filer, markeringer og gemte værktøjer ligger kun i Bladrs eget lager på den enkelte computer.

**Åbn Bladr:** https://marti680.github.io/Bladr/

## Installér på Windows

1. Åbn linket ovenfor i **Microsoft Edge** eller **Google Chrome**.
2. Klik på installér-ikonet i adresselinjen (en skærm med en pil), eller vælg *Menu → Apps → Installér Bladr*.
3. Bladr får nu sit eget vindue, et ikon i Start-menuen og virker også uden internet.

### Brug Bladr som standardprogram til PDF

1. Højreklik på en PDF i Stifinder → **Åbn med** → **Vælg en anden app**.
2. Vælg **Bladr** og sæt flueben i **Brug altid denne app** (Windows 11: tryk *Altid*).

Du kan også gå til *Indstillinger → Apps → Standardapps*, søge efter `.pdf` og vælge Bladr.

### Blanke PDF-ikoner i Stifinder

Chrome glemmer at give PDF-filtypen et ikon, når Bladr er standardprogram, så filerne vises som blanke sider. Ret det sådan:

1. Hent scriptet [windows-filikon.ps1](https://marti680.github.io/Bladr/windows-filikon.ps1). Det lander i mappen *Overførsler* (Downloads).
2. Se indholdet, før du kører det: højreklik på filen → **Åbn med** → **Notesblok**. Du kan også læse det her: [docs/windows-filikon.ps1](docs/windows-filikon.ps1).
3. Åbn **Windows PowerShell**, og kør den fil, du har hentet:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\Downloads\windows-filikon.ps1"
```

Scriptet henter Bladrs filikon og sætter det på Bladrs PDF-registrering for din egen bruger. `-ExecutionPolicy Bypass` gælder kun for denne ene kørsel. Kør det igen, hvis ikonerne bliver blanke efter en Chrome-opdatering.

## Opdateringer

Når der kommer en ny version, viser Bladr en besked øverst: *"Der er en ny version af Bladr klar"*. Tryk **Genstart nu**. Du skal ikke installere noget igen.

## Funktioner

- Læs, søg, zoom, rotér, miniaturer og liste over seneste filer
- Streg, pil, ramme, cirkel, sky, tekstfelt, tekst med pil
- Målestok (1:N eller kalibrering), mål, polylinje med længde, areal og omkreds, huller i arealer, vinkler og rumfang (udgravning eller opbygning)
- Lag, der kan slås til og fra og eksporteres samlet (som rigtige PDF-lag) eller hver for sig
- Optælling i grupper med Find lignende (ens symboler) og Tæl tekst, rettelser og godkendelse, stempler, egne symboler fra skærmklip (Ctrl+V)
- Udtræk af tal og tabeller med hurtig sum, gem som Excel
- Mængder med egne priser eller faktorer
- Markeringsliste med status og kommentar, eksport til Excel
- PDF-kommentarer: eksport som redigerbare kommentarer til Bluebeam og Adobe, og overtagelse af kommentarer fra dem
- Værktøjskasse med gemte værktøjer og standardlag
- Sammenligning af revisioner med skyer om ændringer
- Underskrift (tegnet, skrevet eller fra billede) og låsning af formularfelter ved eksport
- Udskrift med synlige lag (Ctrl+P)

## Udvikling

Se [CLAUDE.md](CLAUDE.md). Kort fortalt: kilden ligger i `src/`, og `python3 tools/build.py` bygger den installérbare udgave til `docs/` (som GitHub Pages viser) og Claude-artifact-udgaven til `dist/`.

Skrifttyperne (IBM Plex Sans og Mono, Caveat, Dancing Script, Great Vibes) ligger lokalt i `docs/vendor/fonts/` under SIL Open Font License.

Bladr bruger [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0), [pdf-lib](https://pdf-lib.js.org/) (MIT) og [SheetJS](https://sheetjs.com/) (Apache 2.0). Licenserne ligger i `docs/vendor/`.
