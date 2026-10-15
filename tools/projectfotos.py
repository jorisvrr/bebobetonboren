#!/usr/bin/env python3
"""Maakt de webversies van de projectfoto's.

Bron (onaangeroerd):  bronmateriaal/projectfotos/<project-id>/<nr>.jpg
Uitvoer (voor de site): static/img/projecten/<project-id>/<nr>-<code>-640.webp
                                                          <nr>-<code>-960.webp
                                                          <nr>-<code>-1280.webp
                                                          <nr>-<code>-groot.webp
                        static/img/projecten/fotos.json   (afmetingen en code per foto)

<code> is een korte vingerafdruk van de inhoud. Krijgt een nummer een andere
foto (de klant heeft de volgorde aangepast), dan krijgt die foto ook een andere
bestandsnaam en toont geen enkele browser of cache nog de oude foto. Webversies
die niet meer bij een bronfoto horen, worden opgeruimd.

De foto's worden alleen verkleind en als WebP opgeslagen: geen filters, geen
uitsneden. Opnamegegevens (EXIF) gaan niet mee naar de webversie.

Uitzondering (ONHERKENBAAR hieronder): op een foto van de kinderopvang hangt
een strook met portretfoto's, voornamen en geboortedata van kinderen. Die strook
wordt in de webversie onherkenbaar gemaakt. Het origineel van die foto staat
niet in de (openbare) repository (.gitignore); ontbreekt een origineel, dan
blijft de bestaande webversie staan.

Gebruik:  pip install pillow   en dan   python tools/projectfotos.py
Nieuwe foto's: zet ze in de bronmap als 01.jpg, 02.jpg, ... in de volgorde van
de klant, draai dit script en vul ze in bij PROJECTEN in app.py (nr + alt).
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
BRON = ROOT / "bronmateriaal" / "projectfotos"
DOEL = ROOT / "static" / "img" / "projecten"
BREEDTES = (640, 960, 1280)  # covers en kleinere schermen
GROOT_MAX = 2000            # langste zijde van de grote versie
KWALITEIT = 72

# (project-id, nr) -> vlakken (x0, y0, x1, y1) in pixels van het origineel die
# onherkenbaar worden gemaakt (persoonsgegevens van derden).
ONHERKENBAAR = {
    ("kinderopvang-partou", "02"): [(578, 806, 1056, 900)],
}
WEBVERSIE = re.compile(r"^\d+-[0-9a-f]{6}-(640|960|1280|groot)\.webp$")


def code(bron, vlakken):
    """Korte vingerafdruk van bronfoto + bewerking + instellingen."""
    h = hashlib.sha1(bron.read_bytes())
    h.update(repr((vlakken, BREEDTES, GROOT_MAX, KWALITEIT)).encode())
    return h.hexdigest()[:6]


def maak_onherkenbaar(im, vlakken):
    """Vervang elk vlak door grove blokken (mozaïek) met een lichte vervaging."""
    from PIL import ImageFilter
    for x0, y0, x1, y1 in vlakken:
        stuk = im.crop((x0, y0, x1, y1))
        b, h = stuk.size
        klein = stuk.resize((max(1, b // 44), max(1, h // 44)), Image.BOX)
        stuk = klein.resize((b, h), Image.NEAREST).filter(ImageFilter.GaussianBlur(6))
        im.paste(stuk, (x0, y0))
    return im


def opslaan(im, pad, breedte):
    """Schaal naar de gevraagde breedte (nooit vergroten) en sla op als WebP."""
    w, h = im.size
    if breedte < w:
        im = im.resize((breedte, round(h * breedte / w)), Image.LANCZOS)
    im.save(pad, "WEBP", quality=KWALITEIT, method=6)
    return im.size


def main():
    if not BRON.is_dir():
        sys.exit("Bronmap ontbreekt: {}".format(BRON))
    oud = {}
    if (DOEL / "fotos.json").exists():
        oud = json.loads((DOEL / "fotos.json").read_text())
    maten = {}
    totaal = 0
    for map_ in sorted(p for p in BRON.iterdir() if p.is_dir()):
        uit = DOEL / map_.name
        uit.mkdir(parents=True, exist_ok=True)
        maten[map_.name] = {}
        for bron in sorted(map_.glob("*.jpg")):
            nr = bron.stem
            vlakken = ONHERKENBAAR.get((map_.name, nr), [])
            c = code(bron, vlakken)
            im = ImageOps.exif_transpose(Image.open(bron)).convert("RGB")
            if vlakken:
                im = maak_onherkenbaar(im, vlakken)
            for b in BREEDTES:
                opslaan(im, uit / "{}-{}-{}.webp".format(nr, c, b), b)
            w, h = im.size
            schaal = min(1.0, GROOT_MAX / max(w, h))
            gw, gh = opslaan(im, uit / "{}-{}-groot.webp".format(nr, c), round(w * schaal))
            maten[map_.name][nr] = [gw, gh, c]
            totaal += 1
        # origineel niet aanwezig (zie ONHERKENBAAR) maar webversie wel: laten staan
        for nr, maat in oud.get(map_.name, {}).items():
            if (nr not in maten[map_.name] and len(maat) > 2
                    and (uit / "{}-{}-groot.webp".format(nr, maat[2])).exists()):
                maten[map_.name][nr] = maat
        # webversies die bij geen enkele foto meer horen opruimen
        nodig = {"{}-{}-".format(nr, m[2]) for nr, m in maten[map_.name].items()}
        for f in uit.iterdir():
            if f.is_file() and WEBVERSIE.match(f.name) and f.name[:10] not in nodig:
                f.unlink()
        print("{:32s} {} foto's".format(map_.name, len(maten[map_.name])))
    (DOEL / "fotos.json").write_text(json.dumps(maten, indent=1, sort_keys=True) + "\n")
    print("Klaar: {} foto's".format(totaal))


if __name__ == "__main__":
    main()
