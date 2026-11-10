# BEBO Betonboren & Zagen - Flask website

Moderne, lead-genererende one-page site met een offerte-aanvraag als kern.
Gebouwd op Flask + Jinja, zonder JS-framework. Klaar voor Railway.

## Lokaal draaien
```bash
pip install -r requirements.txt
python app.py
# → http://127.0.0.1:5000
```

## Deploy op Railway
1. Push deze map naar een GitHub-repo.
2. Railway → New Project → Deploy from GitHub repo.
3. De repo bevat een **Dockerfile**; Railway bouwt daarmee (deterministisch,
   geen gok over taal/versie). `railway.json` forceert de Dockerfile-builder.
   De React Bits-bundel is meegecommit, dus er is géén Node nodig op Railway.
4. De `PORT` wordt door Railway aangeleverd; de Dockerfile bindt gunicorn daarop.
5. Zet onder **Variables** minimaal:
   - `SECRET_KEY` → een lange willekeurige string.
6. Na een geslaagde build: **Settings → Networking → Generate Domain** om de
   site publiek te maken (anders blijft de service "Unexposed").
7. (Optioneel) e-mailnotificaties - zet ook de `SMTP_*`-vars (zie `.env.example`).

> Werkt de build via Railpack i.p.v. de Dockerfile? Dan pinnen `.python-version`
> (3.12) en de `Procfile` (`gunicorn app:app`) alsnog de juiste setup.

> Let op: op Railway is de filesystem niet persistent. Wil je leads bewaren,
> gebruik dan de SMTP-notificatie of koppel later een database/airtable.

## Waar staat wat
```
app.py                 Flask-app + offerte-afhandeling (validatie, opslag, mail)
templates/
  base.html            nav, footer, zwevend belknopje, betontextuur-filter
  index.html           hero, diensten, werkwijze, waarom, werkgebied, offerte
  bedankt.html         bevestiging na verzenden
  404.html
static/css/style.css   volledige stijl (design-tokens bovenin)
static/js/main.js      nav-scroll, mobiel menu, scroll-reveal, offerte-chips
static/bundle/         gebouwde React Bits-bundel (gecommit; Flask serveert dit)
frontend/              Vite + React bron voor de React Bits-effecten
data/leads.jsonl       binnengekomen aanvragen (één JSON per regel)
```

## Inhoud aanpassen
- **Diensten**: pas de lijst `DIENSTEN` aan in `app.py` (één bron - voedt zowel de
  servicekaarten als de chips in het formulier).
- **Bedrijfsgegevens**: het dict `BEDRIJF` in `app.py`.
- **Teksten**: in `templates/index.html`.

## Foto's toevoegen (sterk aangeraden)
Nu staan er gegenereerde betonpanelen als placeholder. Vervang ze door echte
projectfoto's voor maximale impact:
1. Zet je foto's in `static/img/`.
2. In `index.html`, vervang in `.hero__panel` en `.regio__panel` het
   `<div class="tex" ...>` door bijv.:
   ```html
   <img src="{{ url_for('static', filename='img/jouw-foto.jpg') }}"
        alt="Kernboring in betonvloer" style="width:100%;height:100%;object-fit:cover">
   ```
   en haal de `aria-hidden` weg als de foto inhoudelijk is.

## Nog te doen voor livegang
- [ ] Echte projectfoto's plaatsen (hero + werkgebied).
- [ ] De voorbeeldquote bij "Waarom BEBO" vervangen door een **echte** klantreferentie.
- [ ] `SECRET_KEY` + (optioneel) SMTP-variabelen instellen op Railway.
- [ ] Eigen domein koppelen (bebobetonboren.nl).
- [ ] Privacy/cookie-tekst toevoegen als je later tracking/analytics gebruikt.

## React Bits-effecten (TargetCursor + Beams + StaggeredMenu)
Twee echte React Bits-componenten draaien als React-"eilanden" boven de
Flask-pagina, gebouwd met Vite:
- **TargetCursor** (gsap) - een richtkruis-cursor in BEBO-rood die op knoppen,
  links en kaarten "lockt". Sluit aan op het richtkruis-motief van de site.
- **Beams** (three.js / react-three-fiber) - subtiele lichtstrepen als
  achtergrond in de donkere offerte-sectie.

Beide staan **uit op mobiel en bij `prefers-reduced-motion`**. Three.js wordt
lazy geladen (aparte chunk) en pas wanneer de offerte-sectie in beeld komt.

### De bundel herbouwen (alleen nodig bij wijzigingen aan de effecten)
```bash
cd frontend
npm install
npm run build      # → schrijft naar ../static/bundle/
```
De gebouwde bundel staat in `static/bundle/` en is meegecommit, dus **Railway
heeft géén Node nodig** bij deploy - Flask serveert de bundel als statische
bestanden. Node/Vite heb je alleen lokaal nodig als je de effecten aanpast.

### BEBO-aanpassingen in de componenten
- `StaggeredMenu.jsx`: openingsvolgorde (constante `T` bovenin): eerst de knop, dan het paneel,
  dan de links met een lichte stagger, dan nummers en contact. Verborgen links staan ver genoeg
  omlaag en onzichtbaar (`LINK_UIT`), zodat lange links niet te vroeg uitsteken. Dubbelklik wordt
  genegeerd; heropenen tijdens het sluiten gaat vanaf de huidige stand. Bij
  `prefers-reduced-motion` alleen een korte vervaging.
- `TargetCursor.jsx`: hoekjes op hele pixels, 5px vrij van het element (ook bij rode knoppen en
  omlijnde elementen) en altijd binnen het venster; lijndikte gelijk aan `bebo-overrides.css` (2px).

### Tweaken / uitzetten
- Kleur, snelheid en aantal van de effecten: `frontend/src/main.jsx`
  (props van `<TargetCursor>` en `<Beams>`).
- Wil je de normale muispijl houden? Zet `hideDefaultCursor={false}` in `main.jsx`.
- BEBO-kleuren van de cursor: `frontend/src/bebo-overrides.css`.
- Effect helemaal weg? Verwijder de twee `bundle/...`-regels uit `templates/base.html`.

### Let op: bundelgrootte
`Beams` trekt three.js mee (~235 kB gzip in een aparte chunk, alleen desktop).
De basis-bundel (React + gsap voor de cursor) is ~92 kB gzip. Voor een
lead-gen-site is dat de prijs van "echte" React Bits; wil je lichter, dan kan
ik de cursor ook in vanilla JS namaken en Beams door een CSS-gradient vervangen.

## Toegepaste ontwerpprincipes (de "5k"-regels)
Kleur intentioneel (rood enkel als precisie-accent) · typografie als hiërarchie ·
één duidelijke CTA-route (de offerte) · royale witruimte · terughoudende trust
signals (feiten + één quote i.p.v. logo-soup). Signatuur: het rode richtkruis als
"het exacte punt waar geboord/gezaagd wordt".

## Projecten
- Eén bron: `PROJECTEN` in `app.py` (elf projecten, 86 foto's, in de volgorde van de lijst:
  door de klant vastgesteld, niet sorteren). De homepage toont het project met
  `"uitgelicht": True` (tussen Werkzaamheden en Werkwijze); `/projecten` toont ze allemaal.
- Titels, categorieën en teksten zijn letterlijk van de klant. Een lege `categorie` toont
  geen label. Het categorielabel wordt zonder slotpunt getoond.
- `PROJECTEN_INTRO` (de zin rechtsboven op `/projecten`) is een voorstel van de bouwer.
- Templates: `templates/projecten.html`, `templates/_project.html` (beeld + fotolijst,
  gedeeld met de homepage). Opmaak: blok "PROJECTEN" in `static/css/style.css`.

### Projectfoto's
```
bronmateriaal/projectfotos/<id>/<nr>.jpg        originelen van de klant (niet aanpassen;
                                                gaan niet mee in de deploy). <nr> volgt
                                                de nummering van de klant: Tr01.jpg -> 01.jpg.
                                                .png en .webp mogen ook (zoals aangeleverd).
static/img/projecten/<id>/<nr>-<code>-640.webp  cover op telefoons
                          <nr>-<code>-960.webp  cover
                          <nr>-<code>-1280.webp cover op scherpe schermen / fotoweergave op telefoons
                          <nr>-<code>-groot.webp fotoweergave op grote schermen (max. 2000 px)
static/img/projecten/fotos.json                 afmetingen + code, geschreven door het script
tools/projectfotos.py                           maakt de webversies uit de originelen
static/js/lightbox.js                           fotoweergave (klik op een coverfoto)
```
- **Foto toevoegen:** zet het origineel in de bronmap, draai `pip install pillow` en
  `python tools/projectfotos.py`, en voeg in `PROJECTEN` bij `fotos` een regel `(nr, alt)` toe.
- **Volgorde:** de volgorde van de regels bij `fotos` is de volgorde op de site (fotoweergave,
  teller). Omwisselen = alleen die regels omdraaien; bestanden niet hernoemen.
  De eerste regel is de cover (tenzij `"cover"` iets anders zegt).
  `<code>` is een vingerafdruk van de inhoud: krijgt een nummer een andere foto, dan
  verandert ook de bestandsnaam, zodat geen browser of cache de oude foto blijft tonen.
- **Andere cover:** zet `"cover": "<nr>"` bij het project. `cover_focus` bepaalt welk deel in het
  liggende 3:2-kader valt (alleen gebruikt voor het uitgelichte project op de homepage).
- De webversies zijn alleen verkleind en als WebP opgeslagen: geen filters, geen uitsneden,
  geen opnamegegevens.
- Uitzondering: op foto 02 van Kinderopvang Partou is een strook met kinderfoto's, namen
  en geboortedata onherkenbaar gemaakt (`ONHERKENBAAR` in het script). Het origineel staat
  niet in de repository (`.gitignore`).
- **/projecten:** per project één grote coverfoto (3:2, `cover_focus`) met nummer, categorie,
  titel, tekst en het aantal foto's. Op brede schermen wisselt de foto per project van kant.
  De overige foto's staan in een verborgen lijst; een klik op de cover opent de fotoweergave
  (`static/js/lightbox.js`) met alle foto's van dat project, beginnend bij de cover: vorige/volgende,
  pijltjes, Esc, vegen, teller "01 / 08", rustige vervaging. Zonder JavaScript opent de grote foto.
  De eerdere Skewed Carousel en het fotoraster (10-11-2026) zijn op verzoek van de klant vervangen.
- **Homepage:** het project met `"uitgelicht": True` staat tussen Werkzaamheden en Werkwijze;
  de cover opent dezelfde fotoweergave.
- Een project zonder foto's krijgt automatisch het tijdelijke beeldvlak ("Foto volgt").
