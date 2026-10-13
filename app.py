"""
BEBO Betonboren & Zagen - Flask website
----------------------------------------
Een moderne, lead-genererende site met een offerte-aanvraag als kern.

Belangrijk voor deployment (Railway):
- Start command: `gunicorn app:app`  (staat ook in Procfile)
- De PORT wordt door Railway via de omgevingsvariabele PORT aangeleverd.
- Offerteaanvragen worden gemaild naar MAIL_TO (standaard info@bebobetonboren.nl)
  via de SMTP_* env vars (zie .env.example) en bijgeschreven in data/leads.jsonl.
  Op Vercel is de schijf niet blijvend: zonder werkende SMTP krijgt de bezoeker
  daar een foutmelding met het telefoonnummer in plaats van een bedankpagina.
"""

import os
import json
import mimetypes
import smtplib
import datetime
from email.message import EmailMessage
from pathlib import Path

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    flash,
    send_from_directory,
    Response,
)

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "verander-mij-in-productie")

# Python 3.12 (Vercel) kent .webp niet in zijn standaardlijst; zonder deze regel
# gaan de projectfoto's de deur uit als "application/octet-stream".
mimetypes.add_type("image/webp", ".webp")


@app.after_request
def cache_projectfotos(resp):
    """Projectfoto's mogen in de browser en bij Vercel bewaard blijven.

    Alleen voor static/img/projecten/: die bestanden veranderen zelden. CSS en
    JavaScript houden bewust de standaard (altijd even navragen), zodat een
    nieuwe versie van de site direct zichtbaar is.
    """
    if request.path.startswith("/static/img/projecten/") and resp.status_code == 200:
        resp.headers["Cache-Control"] = "public, max-age=86400, s-maxage=604800"
    return resp

# Canonieke site-URL voor SEO (canonical, Open Graph, sitemap). Zet in productie
# de env var SITE_URL op je eigen domein, bijv. https://www.bebobetonboren.nl
SITE_URL = os.environ.get("SITE_URL", "https://bebobetonboren.nl").rstrip("/")

# Lettertype-preview voor de klant (nog niet definitief gekozen).
#   "titillium" = Titillium Web uit de BEBO-stijlguide
#   ""/"off"    = het oorspronkelijke lettertype (Bricolage Grotesque / Inter / Space Mono)
# Terugzetten kan hier, of zonder code via de env var FONT_PREVIEW=off.
FONT_PREVIEW = os.environ.get("FONT_PREVIEW", "titillium").strip().lower()
if FONT_PREVIEW in ("0", "off", "uit", "none", "false"):
    FONT_PREVIEW = ""


@app.context_processor
def inject_seo_globals():
    # diensten: ook de footer leest uit deze ene lijst (zelfde namen en volgorde).
    return {"site_url": SITE_URL, "diensten": DIENSTEN, "font_preview": FONT_PREVIEW}

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
LEADS_FILE = DATA_DIR / "leads.jsonl"
INTAKE_FILE = DATA_DIR / "intake.jsonl"

# Diensten die als chips in het offerteformulier verschijnen en die
# de servicekaarten voeden. Eén bron, zodat alles consistent blijft.
DIENSTEN = [
    {
        "id": "betonboren",
        "index": "01",
        "titel": "Betonboren",
        "spec": "Ø 12-900 mm",
        "tekst": "Diamantboren met precisie. Droog en stofarm waar gebruik "
        "van water geen optie is.",
    },
    {
        "id": "wandzagen",
        "index": "02",
        "titel": "Wandzagen",
        "spec": "sparingen",
        "tekst": "Deur- en raamsparingen en complete doorbraken in wanden van beton "
        "en steen – vakkundig ingezaagd met een strak resultaat en minimale overlast.",
    },
    {
        "id": "vloerzagen",
        "index": "03",
        "titel": "Vloerzagen",
        "spec": "sparingen",
        "tekst": "Trapgaten, liftsparingen, kruipluiken, leidingsleuven, dilatatievoegen "
        "– vakkundig ingezaagd met een strak resultaat en minimale overlast.",
    },
    {
        "id": "sleuven-frezen",
        "index": "04",
        "titel": "Sleuven frezen",
        "spec": "droog of nat",
        "tekst": "Leiding- en kabelsleuven in ruwbouw, nieuwbouw of bewoonde situaties "
        "– vakkundig gefreesd, uitgebroken en opgeruimd.",
    },
    {
        "id": "sloopwerk",
        "index": "05",
        "titel": "Precisiesloop",
        "spec": "incl. puinafvoer",
        "tekst": "Gericht verwijderen van vloeren, wanden en tegelwerk. We zagen "
        "het werk los, breken het uit en voeren het puin af.",
    },
    {
        "id": "ankers",
        "index": "06",
        "titel": "Ankers & verlijmen",
        "spec": "Hilti HIT-systeem",
        "tekst": "Chemisch verankeren van stekken en ankers met hoogwaardige "
        "Hilti-producten voor een sterke, duurzame hechting.",
    },
]
DIENST_IDS = {d["id"] for d in DIENSTEN}
DIENST_LABELS = {d["id"]: d["titel"] for d in DIENSTEN}

BEDRIJF = {
    "naam": "BEBO Betonboren & Zagen",
    "straat": "Industrieweg 69-156",
    "postcode_plaats": "2651 BC Berkel en Rodenrijs",
    "email": "info@bebobetonboren.nl",
    "tel": "010-3220232",
    "tel_link": "+31103220232",
    "kvk": "59493038",
    "btw": "NL853524464B02",
}

# Voor wie: doelgroepen met de door de klant goedgekeurde teksten (intake 13-10-2026).
SECTOREN = [
    {"titel": "Aannemers", "tekst": "Samenwerken aan een strakke planning. Zo kan de volgende ploeg direct aan de slag."},
    {"titel": "Installateurs", "tekst": "Kernboringen, sparingen of sleuven voor iedere technische installatie."},
    {"titel": "Vastgoed & beheer", "tekst": "Nette uitvoering in bewoonde en verhuurde panden, met minimale overlast."},
    {"titel": "Zorginstellingen", "tekst": "Stofarm werken met minimale overlast, ook in bewoonde situaties."},
    {"titel": "Particulieren", "tekst": "Van een enkele doorvoer tot een compleet trapgat, netjes opgeleverd."},
]

# Reviews: LEEG laten tot je ECHTE content hebt. De sectie rendert alleen als de
# lijst gevuld is, dus er gaat nooit iets verzonnen live.
# Voorbeeldstructuur:
#   REVIEWS = [{"tekst": "Strak werk, netjes achtergelaten.", "naam": "J. de Vries",
#               "rol": "aannemer, Rotterdam", "ster": 5}]
REVIEWS = []
# Aggregaat-score, bijv. {"score": "4.9", "aantal": "27", "bron": "Google"}. None = verbergen.
REVIEW_RATING = None

# ---------------------------------------------------------------------------
# PROJECTEN - één bron voor de homepage (uitgelicht project) en /projecten.
# Titels, categorieën en teksten zijn letterlijk van de klant (inzendingen
# BEBO-20261013-1405-5ZKN, -1422-5Z0T en -1535-F4WN). Niets bijverzinnen.
#
# Foto's
#   Origineel:  bronmateriaal/projectfotos/<id>/<nr>.jpg   (niet aanpassen)
#   Website:    static/img/projecten/<id>/<nr>-640|960|1280|groot.webp
#   De webversies maak je met:  python tools/projectfotos.py
#   "fotos":       (nr, alt) in de volgorde van de klant; alt beschrijft wat er
#                  te zien is, zonder iets toe te voegen dat we niet weten.
#   "cover":       nr van de foto die als hoofdbeeld dient.
#   "cover_focus": welk deel van de foto in het liggende coverkader valt
#                  (CSS object-position, "horizontaal verticaal"). In de
#                  fotoweergave staat altijd de hele foto.
#   Een project zonder foto's krijgt automatisch het tijdelijke beeldvlak.
#
# "uitgelicht": True bij precies één project; dat staat op de homepage.
# "categorie" mag leeg zijn; dan wordt er geen categorielabel getoond.
# ---------------------------------------------------------------------------
PROJECTEN = [
    {
        "id": "vmbo-trias",
        "titel": "VMBO Trias",
        "categorie": "Verduurzamingsproject.",
        "tekst": [
            "Boren van nieuwe doorvoeren en sparingen t.b.v. de nieuwe klimaatinstallatie.",
        ],
        "cover": "06",
        "cover_focus": "50% 50%",
        "fotos": [
            ("01", "Betonwand boven een deur met geboorde ronde doorvoeren en een rechthoekige sparing"),
            ("02", "Twee kernboringen in een betonbalk, daaronder afdekfolie"),
            ("03", "Hal met een rij geboorde doorvoeren in de betonwand boven de deuren"),
            ("04", "Rechthoekige sparing en ronde doorvoer in de betonwand boven een deur"),
            ("05", "Twee geboorde sparingen in de betonwand boven een deurkozijn"),
            ("06", "Boorstelling op een rolsteiger met afscherming in de hal, naast de trap"),
            ("07", "Kernboormachine op een boorstatief tegen de betonwand, boven de afgeschermde steiger"),
            ("08", "Vier kernboringen in de betonvloer van een gang"),
        ],
        "uitgelicht": False,
    },
    {
        "id": "rwzi-heinenoord",
        "titel": "Rioolwaterzuiveringsinstallatie Heinenoord",
        "categorie": "Renovatie pompinstallatie.",
        "tekst": [
            "Nieuwe doorvoeren geboord t.b.v. renovatie van de "
            "rioolwaterzuiveringsinstallatie.",
        ],
        "cover": "02",
        "cover_focus": "50% 50%",
        "fotos": [
            ("01", "Pompruimte met een rolsteiger naast de leidingen en afsluiters"),
            ("02", "Medewerker op de rolsteiger bij de leidingen in de pompruimte"),
            ("03", "Medewerker met gehoorbescherming aan het werk op de rolsteiger in de pompruimte"),
            ("04", "Zicht door een geboorde doorvoer op een leidingflens"),
        ],
        "uitgelicht": False,
    },
    {
        "id": "vve-dedemsvaartweg-den-haag",
        "titel": "VvE Dedemsvaartweg Den Haag",
        "categorie": "Renovatie rookgaskanalen.",
        "tekst": [
            "Zagen van sparingen t.b.v. renovatie van de bestaande rookgaskanalen.",
            "Werkzaamheden zijn uitgevoerd d.m.v. droogtechniek m.b.v. bronafzuiging "
            "en een aparte luchtreiniger om stofoverlast tot een minimum te beperken.",
        ],
        "cover": "01",
        "cover_focus": "50% 61%",
        "fotos": [
            ("01", "Gezaagde sparing in een wand met daarachter de rookgaskanalen"),
            ("02", "Het appartementengebouw gezien vanaf de parkeerplaats"),
            ("03", "Gezaagde sparing in de wand van een hal, met zicht op de kanalen in de schacht"),
            ("04", "Zicht in de schacht met de rookgaskanalen"),
            ("05", "Gezaagde sparing in een wand met zicht op de kanalen in de schacht"),
        ],
        "uitgelicht": True,
    },
    {
        "id": "obs-de-vogelenzang",
        "titel": "Openbare basisschool De Vogelenzang",
        "categorie": "Verduurzamingsproject.",
        "tekst": [
            "Doorvoeren geboord t.b.v. de nieuwe klimaatinstallatie.",
        ],
        "cover": "07",
        "cover_focus": "50% 50%",
        "fotos": [
            ("01", "Lokaal met twee geboorde doorvoeren in de bakstenen wand"),
            ("02", "Twee ronde doorvoeren in een bakstenen binnenwand"),
            ("03", "Medewerker boort met een kernboormachine een doorvoer in de bakstenen wand"),
            ("04", "Twee doorvoeren in de buitengevel, gezien vanuit de tuin"),
            ("05", "Entree van de school met twee doorvoeren in de gevel ernaast"),
            ("06", "Gevel van de school met twee paar geboorde doorvoeren"),
            ("07", "Twee paar geboorde doorvoeren in de bakstenen gevel"),
            ("08", "Twee geboorde doorvoeren in de bakstenen gevel van dichtbij"),
            ("09", "Gevel met aan weerszijden van de regenpijp twee geboorde doorvoeren"),
        ],
        "uitgelicht": False,
    },
    {
        "id": "monumentaal-gebouw-schiedam",
        "titel": "Monumentaal gebouw Schiedam",
        "categorie": "Voorbereiding elektra en bouwkundige aanpassingen.",
        "tekst": [
            "Boren van dozen en frezen van sleuven t.b.v. elektra.",
            "Inzagen van nieuwe deuropening.",
        ],
        "cover": "04",
        "cover_focus": "50% 50%",
        "fotos": [
            ("01", "Het monumentale pand gezien vanaf de straat"),
            ("02", "Twee gefreesde sleuven in een gestucte wand, van dichtbij"),
            ("03", "Twee verticale sleuven met een geboorde doos in een gestucte wand"),
            ("04", "Hal met gefreesde leidingsleuven en geboorde dozen in de wanden"),
            ("05", "Verticale sleuf en geboorde dozen naast een boogdeur op de overloop"),
            ("06", "Nieuw ingezaagde deuropening met stalen latei"),
        ],
        "uitgelicht": False,
    },
    {
        "id": "diverse-kruipluiken",
        "titel": "Diverse kruipluiken",
        "categorie": "",  # niet aangeleverd door de klant; geen label tonen
        "tekst": [
            "Aanbrengen van sparingen t.b.v. bereikbaarheid kruipruimtes incl. leveren "
            "en monteren van kruipluiken.",
        ],
        "cover": "05",
        "cover_focus": "50% 21%",
        "fotos": [
            ("01", "Omtrek van een kruipluik uitgeboord in een betonvloer"),
            ("02", "Gemonteerd kruipluik in een betonvloer"),
            ("03", "Kruipluik in de vloer bij een entree, naast de deurmat"),
            ("04", "Kruipluik in een tegelvloer onder een trap"),
            ("05", "Geopend kruipluik in een tegelvloer met zicht in de kruipruimte"),
            ("06", "Kruipluik in een tegelvloer naast een trap"),
            ("07", "Kruipluik in een gietvloer onder een stalen trap"),
            ("08", "Kruipluik in de vloer van een trappenhuis"),
            ("09", "Kruipluik in de vloer voor een stalen trap"),
            ("10", "Uitgeboorde sparing met ingestort kader voor een kruipluik"),
            ("11", "Kruipluik in de vloer achter een toegangsdeur"),
        ],
        "uitgelicht": False,
    },
    {
        "id": "leidingsleuven",
        "titel": "Leidingsleuven",
        "categorie": "Kantoorruimtes en Particulier.",
        "tekst": [
            "Een overzicht van aangebrachte leidingsleuven op uiteenlopende projecten.",
        ],
        "cover": "02",
        "cover_focus": "50% 65%",
        "fotos": [
            ("01", "Lange leidingsleuf in een dekvloer in een kantoorruimte in aanbouw"),
            ("02", "Leidingsleuf in de vloer van een kantoorruimte, tussen verwijderde tapijttegels"),
            ("03", "Leidingsleuf in een dekvloer van dichtbij"),
            ("04", "Brede sleuf in een betonvloer met afgetekende markering"),
            ("05", "Kernboring in een vloer met een mantelbuis erdoor"),
            ("06", "Keukenwand met gefreesde sleuven en geboorde dozen"),
            ("07", "Gefreesde sleuven en geboorde dozen in een keukenwand, van dichtbij"),
            ("08", "Keukenwand met een horizontale leidingsleuf naar een wandcontactdoos"),
            ("09", "Gefreesde sleuven en geboorde dozen in een betonwand"),
            ("10", "Betonwand met gefreesde leidingsleuven, schuin gezien"),
            ("11", "Verticale sleuf met twee geboorde dozen in een witte wand"),
            ("12", "Verticale sleuf met een dubbele doos in een witte wand, van dichtbij"),
        ],
        "uitgelicht": False,
    },
    {
        "id": "kinderopvang-partou",
        "titel": "Kinderopvang Partou",
        "categorie": "Verduurzamingsproject.",
        "tekst": [
            "Doorvoeren geboord t.b.v. de nieuwe klimaatinstallatie.",
        ],
        "cover": "07",
        "cover_focus": "50% 50%",
        "fotos": [
            ("01", "Speelruimte met twee geboorde doorvoeren in de wand naast het raam, met afzuigapparatuur ervoor"),
            ("02", "Buitengevel aan het speelplein met aan weerszijden geboorde doorvoeren"),
            ("03", "Twee geboorde doorvoeren in de bakstenen buitengevel"),
            ("04", "Twee doorvoeren in een wandpaneel tussen de ramen, met stofzuiger en luchtreiniger op de vloer"),
            ("05", "Kantoorruimte met twee doorvoeren in het wandpaneel en afzuigapparatuur op de vloer"),
            ("06", "Groepsruimte met twee paar geboorde doorvoeren in de wand"),
            ("07", "Vier geboorde doorvoeren in de bakstenen gevel aan het dakterras"),
            ("08", "Groepsruimte met twee paar doorvoeren in de wand, van bovenaf gezien"),
            ("09", "Twee doorvoeren in de wand, afgeplakt met folie en tape"),
        ],
        "uitgelicht": False,
    },
    {
        "id": "innocent-drinks",
        "titel": "Innocent drinks",
        "categorie": "Aanpassingen technische installaties",
        "tekst": [
            "Doorvoeren geboord t.b.v. aanpassingen aan de technische installaties.",
        ],
        "cover": "02",
        "cover_focus": "50% 50%",
        "fotos": [
            ("01", "Technische ruimte met leidingwerk en een geboorde doorvoer in de wand"),
            ("02", "Geboorde doorvoer in de wand boven het leidingwerk"),
            ("03", "Het bedrijfspand gezien vanaf de parkeerplaats"),
            ("04", "Afgetekende boorpunten op een wandpaneel, met een laserlijn"),
            ("05", "Vier geboorde doorvoeren in de gevelbeplating"),
            ("06", "Gevel met de geboorde doorvoeren, met een hoogwerker op het gras ervoor"),
        ],
        "uitgelicht": False,
    },
]

# Introtekst op /projecten. Dit is een voorstel van de websitebouwer, geen tekst
# van de klant; hier aan te passen.
PROJECTEN_INTRO = (
    "Een selectie van projecten waarin precisie, vakmanschap en een nette "
    "uitvoering centraal staan."
)

# Afmetingen van de webversies, geschreven door tools/projectfotos.py.
try:
    with (Path(__file__).parent / "static" / "img" / "projecten" / "fotos.json").open(
        encoding="utf-8"
    ) as _fh:
        FOTO_MATEN = json.load(_fh)
except (OSError, ValueError):
    FOTO_MATEN = {}


def _foto(pid: str, nr: str, alt: str):
    """Eén projectfoto met paden en afmetingen; None als de webversie ontbreekt."""
    maat = FOTO_MATEN.get(pid, {}).get(nr)
    if not maat:
        return None
    basis = "img/projecten/{}/{}".format(pid, nr)
    breedte, hoogte = maat
    return {
        "nr": nr,
        "alt": alt,
        "klein": basis + "-640.webp",
        "midden": basis + "-960.webp",
        "ruim": basis + "-1280.webp",
        "groot": basis + "-groot.webp",
        "breedte": breedte,
        "hoogte": hoogte,
    }


def _projecten() -> list:
    """Projecten met volgnummer ("01"), categorielabel zonder slotpunt en foto's."""
    uit = []
    for i, p in enumerate(PROJECTEN, start=1):
        q = dict(p)
        q["nr"] = "{:02d}".format(i)
        q["label"] = (p.get("categorie") or "").strip().rstrip(".")
        # foto's in de volgorde van de klant; de carrousel opent op de cover
        fotos = [f for f in (_foto(p["id"], nr, alt) for nr, alt in p.get("fotos", [])) if f]
        cover = next((f for f in fotos if f["nr"] == p.get("cover")), fotos[0] if fotos else None)
        q["cover"] = cover
        q["cover_index"] = fotos.index(cover) if cover else 0
        q["fotos"] = fotos
        q["cover_focus"] = p.get("cover_focus") or "50% 50%"
        uit.append(q)
    return uit


def _uitgelicht():
    """Het ene project voor de homepage (het eerste met uitgelicht=True)."""
    alle = _projecten()
    return next((p for p in alle if p.get("uitgelicht")), alle[0] if alle else None)


def _save_lead(lead: dict) -> bool:
    """Schrijf de lead regel-voor-regel weg (append-only). True als het gelukt is."""
    try:
        with LEADS_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(lead, ensure_ascii=False) + "\n")
        return True
    except OSError as exc:  # bijv. alleen-lezen schijf op Vercel
        app.logger.warning("Lead opslaan mislukt: %s", exc)
        return False


def _email_lead(lead: dict) -> bool:
    """Mail de offerteaanvraag naar het bedrijf. True als de mailserver hem aannam.

    Ontvanger: MAIL_TO, standaard het bedrijfsadres (info@bebobetonboren.nl).
    """
    host = os.environ.get("SMTP_HOST")
    if not host:
        return False
    try:
        msg = EmailMessage()
        diensten = ", ".join(DIENST_LABELS.get(d, d) for d in lead["diensten"]) or "-"
        msg["Subject"] = f"Nieuwe offerteaanvraag - {lead['naam']}"
        msg["From"] = os.environ.get("SMTP_FROM", os.environ["SMTP_USER"])
        msg["To"] = os.environ.get("MAIL_TO", BEDRIJF["email"])
        if lead["email"]:
            msg["Reply-To"] = lead["email"]
        msg.set_content(
            f"Nieuwe aanvraag via de website\n\n"
            f"Naam:       {lead['naam']}\n"
            f"Telefoon:   {lead['telefoon']}\n"
            f"E-mail:     {lead['email']}\n"
            f"Plaats:     {lead['plaats']}\n"
            f"Werk:       {diensten}\n"
            f"Planning:   {lead['planning']}\n\n"
            f"Omschrijving:\n{lead['omschrijving']}\n\n"
            f"Ontvangen:  {lead['ontvangen']}\n"
        )
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", 587)), timeout=15) as s:
            s.starttls()
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 - de bezoeker krijgt hieronder een nette melding
        app.logger.warning("Offerte-mail mislukt: %s", exc)
        return False


def _save_intake(record: dict) -> None:
    """Bewaar een content-intake (append-only)."""
    with INTAKE_FILE.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def _format_intake(data: dict) -> str:
    """Zet de intake om naar een leesbaar overzicht voor in de mail."""
    b = data.get("bedrijf") or {}
    out = []
    add = out.append
    add("Nieuwe content-intake via de website\n")
    add("== BEDRIJF & CONTACT ==")
    add("Naam:        " + (b.get("naam") or "-"))
    if b.get("ondertitel"):
        add("Ondertitel:  " + b["ondertitel"])
    add("Telefoon:    " + (b.get("tel") or "-"))
    add("WhatsApp:    " + (b.get("whatsapp") or "(zelfde als telefoon)"))
    add("E-mail:      " + (b.get("email") or "-"))
    adres = ", ".join(x for x in [b.get("straat"), b.get("postcode_plaats")] if x)
    add("Adres:       " + (adres or "-"))
    if b.get("kvk"):
        add("KvK:         " + b["kvk"])
    if b.get("openingstijden"):
        add("Openingstijden: " + b["openingstijden"])

    diensten = data.get("diensten") or []
    add("\n== WERKZAAMHEDEN (%d) ==" % len(diensten))
    for i, s in enumerate(diensten, 1):
        spec = ("  [" + s["spec"] + "]") if s.get("spec") else ""
        add("%d. %s%s" % (i, s.get("titel") or "(naam?)", spec))
        if s.get("tekst"):
            add("   " + s["tekst"])

    w = data.get("werkgebied") or {}
    add("\n== WERKGEBIED ==")
    add("Plaatsen: " + (w.get("plaatsen") or "-"))
    if w.get("tekst"):
        add("Toelichting: " + w["tekst"])

    add("\n== WAAROM WIJ ==")
    for p in (data.get("waarom") or []):
        add("- " + (p.get("kop") or "") + ((": " + p["tekst"]) if p.get("tekst") else ""))

    o = data.get("over") or {}
    add("\n== OVER ==")
    add(o.get("omschrijving") or "-")
    if o.get("ervaring"):
        add("Ervaring: " + o["ervaring"])
    if o.get("team"):
        add("Ploeg: " + o["team"])

    kop = data.get("kop") or {}
    if kop.get("titel") or kop.get("lede"):
        add("\n== KOPTEKST (voorkeur klant) ==")
        if kop.get("titel"):
            add("Kop: " + kop["titel"])
        if kop.get("lede"):
            add("Intro: " + kop["lede"])
    return "\n".join(out)


def _email_intake(data: dict) -> None:
    """Stuur de intake automatisch door naar de developer. Faalt nooit hard.

    Zet op Railway de SMTP_* env vars. Voor Gmail:
      SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=jouw@gmail.com,
      SMTP_PASS=<Gmail app-wachtwoord>, INTAKE_MAIL_TO=jouw@gmail.com
    """
    host = os.environ.get("SMTP_HOST")
    # Alleen naar het expliciet ingestelde adres van de developer; nooit
    # terugvallen op SMTP_USER (dat is het bedrijfsadres voor klantaanvragen).
    ontvanger = os.environ.get("INTAKE_MAIL_TO")
    if not host or not ontvanger:
        return
    try:
        msg = EmailMessage()
        naam = (data.get("bedrijf") or {}).get("naam") or "onbekend bedrijf"
        msg["Subject"] = "Website-content ingevuld - " + naam
        msg["From"] = os.environ.get("SMTP_FROM", os.environ["SMTP_USER"])
        msg["To"] = ontvanger
        msg.set_content(_format_intake(data) + "\n\n--\nDe volledige JSON zit als bijlage.")
        msg.add_attachment(
            json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
            maintype="application",
            subtype="json",
            filename="content.json",
        )
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", 587))) as s:
            s.starttls()
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
    except Exception as exc:  # noqa: BLE001 - mag de intake nooit blokkeren
        app.logger.warning("Intake-mail mislukt: %s", exc)


@app.route("/favicon.ico")
def favicon():
    # Browsers vragen automatisch /favicon.ico op; serveer de .ico uit static/img.
    return send_from_directory(
        app.static_folder + "/img",
        "favicon.ico",
        mimetype="image/vnd.microsoft.icon",
    )


@app.route("/robots.txt")
def robots():
    body = "User-agent: *\nAllow: /\n\nSitemap: {}/sitemap.xml\n".format(SITE_URL)
    return Response(body, mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap():
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "  <url><loc>{0}/</loc><changefreq>monthly</changefreq>"
        "<priority>1.0</priority></url>\n"
        "  <url><loc>{0}/projecten</loc><changefreq>monthly</changefreq>"
        "<priority>0.7</priority></url>\n"
        "</urlset>\n"
    ).format(SITE_URL)
    return Response(body, mimetype="application/xml")


@app.route("/")
def index():
    return render_template(
        "index.html",
        diensten=DIENSTEN,
        bedrijf=BEDRIJF,
        sectoren=SECTOREN,
        reviews=REVIEWS,
        review_rating=REVIEW_RATING,
        uitgelicht=_uitgelicht(),
    )


@app.route("/projecten")
def projecten():
    return render_template(
        "projecten.html",
        bedrijf=BEDRIJF,
        projecten=_projecten(),
        intro=PROJECTEN_INTRO,
    )


@app.route("/offerte", methods=["POST"])
def offerte():
    # Honeypot: bots vullen dit verborgen veld in, mensen niet.
    if request.form.get("website"):
        return redirect(url_for("bedankt"))

    naam = request.form.get("naam", "").strip()
    telefoon = request.form.get("telefoon", "").strip()
    email = request.form.get("email", "").strip()
    plaats = request.form.get("plaats", "").strip()
    omschrijving = request.form.get("omschrijving", "").strip()
    planning = request.form.get("planning", "").strip() or "Niet opgegeven"
    diensten = [d for d in request.form.getlist("diensten") if d in DIENST_IDS]

    fouten = []
    if len(naam) < 2:
        fouten.append("naam")
    if not telefoon and not email:
        fouten.append("contact")

    if fouten:
        flash("Vul minimaal je naam en een telefoonnummer of e-mailadres in.", "error")
        return redirect(url_for("index") + "#offerte")

    lead = {
        "naam": naam,
        "telefoon": telefoon,
        "email": email,
        "plaats": plaats,
        "diensten": diensten,
        "omschrijving": omschrijving,
        "planning": planning,
        "ontvangen": datetime.datetime.now().isoformat(timespec="seconds"),
        "bron": request.headers.get("Referer", "direct"),
    }
    opgeslagen = _save_lead(lead)
    gemaild = _email_lead(lead)
    # Alleen "bedankt" tonen als de aanvraag echt is aangekomen: gemaild, of
    # opgeslagen op een schijf die blijft bestaan. Op Vercel verdwijnt de schijf
    # na elke aanvraag, dus daar telt alleen de mail.
    if not (gemaild or (opgeslagen and not os.environ.get("VERCEL"))):
        flash(
            "Het versturen is niet gelukt. Bel ons op {} of mail naar {}, "
            "dan helpen we je direct.".format(BEDRIJF["tel"], BEDRIJF["email"]),
            "error",
        )
        return redirect(url_for("index") + "#offerte")
    return redirect(url_for("bedankt"))


@app.route("/intake", methods=["GET", "POST"])
def intake():
    if request.method == "GET":
        return render_template("intake.html")
    # POST: JSON vanuit het formulier
    payload = request.get_json(silent=True) or {}
    if payload.get("website"):  # honeypot
        return {"ok": True}
    data = payload.get("data")
    if not isinstance(data, dict):
        return {"ok": False, "error": "ongeldige invoer"}, 400
    record = {
        "data": data,
        "ontvangen": datetime.datetime.now().isoformat(timespec="seconds"),
        "bron": request.headers.get("Referer", "direct"),
    }
    _save_intake(record)
    _email_intake(data)
    return {"ok": True}


@app.route("/bedankt")
def bedankt():
    return render_template("bedankt.html", bedrijf=BEDRIJF)


@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html", bedrijf=BEDRIJF), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
