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

# Canonieke site-URL voor SEO (canonical, Open Graph, sitemap). Zet in productie
# de env var SITE_URL op je eigen domein, bijv. https://www.bebobetonboren.nl
SITE_URL = os.environ.get("SITE_URL", "https://bebobetonboren.nl").rstrip("/")


@app.context_processor
def inject_seo_globals():
    # diensten: ook de footer leest uit deze ene lijst (zelfde namen en volgorde).
    return {"site_url": SITE_URL, "diensten": DIENSTEN}

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
}

# Klanttypes / sectoren. Generiek en juist voor dit type bedrijf.
SECTOREN = [
    {"titel": "Aannemers", "tekst": "Sparingen en doorbraken die op tijd klaar zijn, zodat jouw planning niet schuift."},
    {"titel": "Installateurs", "tekst": "Kernboringen en sleuven voor leidingen, ventilatie en elektra, exact op maat."},
    {"titel": "Vastgoed & beheer", "tekst": "Nette uitvoering in bewoonde en verhuurde panden, met minimale overlast."},
    {"titel": "Particulieren", "tekst": "Van een enkele doorvoer tot een compleet trapgat, netjes opgeleverd."},
    # Tekst samengesteld uit goedgekeurde formuleringen; nog door de klant te bevestigen.
    {"titel": "Zorginstellingen", "tekst": "Stofarm werken met minimale overlast, ook in bewoonde situaties."},
]

# Reviews en cases: LEEG laten tot je ECHTE content hebt. De secties renderen
# alleen als de lijst gevuld is, dus er gaat nooit iets verzonnen live.
# Voorbeeldstructuur:
#   REVIEWS = [{"tekst": "Strak werk, netjes achtergelaten.", "naam": "J. de Vries",
#               "rol": "aannemer, Rotterdam", "ster": 5}]
REVIEWS = []
# Aggregaat-score, bijv. {"score": "4.9", "aantal": "27", "bron": "Google"}. None = verbergen.
REVIEW_RATING = None
#   CASES = [{"titel": "28 sparingen in 2 dagen", "tekst": "Kantoor bleef open dankzij
#             geluidsbeperkende technieken.", "meta": "2 dagen · centrum Rotterdam",
#             "img": "cases/kantoor.jpg"}]  # img is optioneel (echte projectfoto)
CASES = []


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
        "  <url><loc>{}/</loc><changefreq>monthly</changefreq>"
        "<priority>1.0</priority></url>\n"
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
        cases=CASES,
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
