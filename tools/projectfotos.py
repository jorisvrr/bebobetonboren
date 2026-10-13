#!/usr/bin/env python3
"""Maakt de webversies van de projectfoto's.

Bron (onaangeroerd):  bronmateriaal/projectfotos/<project-id>/<nr>.jpg
Uitvoer (voor de site): static/img/projecten/<project-id>/<nr>-640.webp
                                                          <nr>-960.webp
                                                          <nr>-1280.webp
                                                          <nr>-groot.webp
                        static/img/projecten/fotos.json   (afmetingen per foto)

De foto's worden alleen verkleind en als WebP opgeslagen: geen filters, geen
uitsneden. Opnamegegevens (EXIF) gaan niet mee naar de webversie.

Gebruik:  pip install pillow   en dan   python tools/projectfotos.py
Nieuwe foto's: zet ze in de bronmap, draai dit script en vul ze in bij
PROJECTEN in app.py (nr + alt).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
BRON = ROOT / "bronmateriaal" / "projectfotos"
DOEL = ROOT / "static" / "img" / "projecten"
BREEDTES = (640, 960, 1280)  # covers en kleinere schermen
GROOT_MAX = 2000            # langste zijde van de grote versie
KWALITEIT = 72


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
    maten = {}
    totaal = 0
    for map_ in sorted(p for p in BRON.iterdir() if p.is_dir()):
        uit = DOEL / map_.name
        uit.mkdir(parents=True, exist_ok=True)
        maten[map_.name] = {}
        for bron in sorted(map_.glob("*.jpg")):
            nr = bron.stem
            im = ImageOps.exif_transpose(Image.open(bron)).convert("RGB")
            for b in BREEDTES:
                opslaan(im, uit / "{}-{}.webp".format(nr, b), b)
            w, h = im.size
            schaal = min(1.0, GROOT_MAX / max(w, h))
            gw, gh = opslaan(im, uit / "{}-groot.webp".format(nr), round(w * schaal))
            maten[map_.name][nr] = [gw, gh]
            totaal += 1
        print("{:32s} {} foto's".format(map_.name, len(maten[map_.name])))
    (DOEL / "fotos.json").write_text(json.dumps(maten, indent=1, sort_keys=True) + "\n")
    print("Klaar: {} foto's".format(totaal))


if __name__ == "__main__":
    main()
