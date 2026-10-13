"""Maakt drie dieptelagen (achter / midden / voor) uit EEN foto.          EXPERIMENT

Voorbeeld (de uitgelichte foto, zoals nu op de site):
  python tools/dieptekaart.py bronmateriaal/projectfotos bronmateriaal/diepte   (eenmalig; torch + transformers)
  python tools/dieptelagen.py \\
      bronmateriaal/projectfotos/vve-dedemsvaartweg-den-haag/01.jpg \\
      bronmateriaal/diepte/vve-dedemsvaartweg-den-haag-01.png \\
      static/img/projecten/vve-dedemsvaartweg-den-haag/diepte/01 \\
      61 ref:150:330:0.05 0.44
  Argumenten: foto, dieptekaart, uitvoer-voorvoegsel, cover_focus-Y (%), grens achter|midden,
  grens midden|voor. Vereist: numpy, pillow, opencv-python-headless.
  De grenzen zijn per foto met het oog afgesteld; controleer het resultaat altijd in de browser.

Stappen: dieptekaart (Depth Anything V2) -> drie maskers -> randen bijstellen op
de kleurgrenzen in de foto (GrabCut) -> wat achter een laag zit wordt aangevuld
vanuit de omliggende pixels van dezelfde foto (OpenCV inpaint) -> WebP met alfa.
Er komt geen beeld van buiten de foto bij.
"""
import sys, json, numpy as np, cv2
from PIL import Image
src, dpt, out, focus_y = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
t1, t2 = sys.argv[5], float(sys.argv[6])                  # dieptegrenzen achter|midden en midden|voor
# t1 mag ook "ref:x0:x1:delta" zijn: de middenlaag (een wand) loopt in de dieptekaart
# schuin af van boven naar onder. Dan meten we per rij de diepte van de wand in de
# kolommen x0..x1 en rekenen alles wat duidelijk verder weg ligt tot de achtergrond.
PAD_X, PAD_Y, SCHAAL = 0.08, 0.10, 0.8                    # overscan links/rechts en boven/onder; uitvoerschaal

rgb = np.array(Image.open(src).convert("RGB")); dep = np.array(Image.open(dpt).convert("L")).astype(np.float32) / 255
H, W = rgb.shape[:2]
ch = int(W / 1.5); top = int((H - ch) * focus_y / 100)   # zelfde 3:2-uitsnede als de cover op de site
py, px = int(ch * PAD_Y), int(W * PAD_X)
y0, y1 = top - py, top + ch + py
assert y0 >= 0 and y1 <= H, "te weinig beeld boven/onder voor overscan"
# boven/onder: echte pixels uit de foto; links/rechts: gespiegelde rand (vlakke wand / folie)
rgb = cv2.copyMakeBorder(rgb[y0:y1], 0, 0, px, px, cv2.BORDER_REFLECT_101)
dep = cv2.copyMakeBorder(dep[y0:y1], 0, 0, px, px, cv2.BORDER_REPLICATE)
dep = cv2.GaussianBlur(dep, (0, 0), 2)
h, w = dep.shape

def verfijn(masker, band=14, iters=3):
    """Zet de rand van een dieptemasker op de dichtstbijzijnde kleurgrens in de foto."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (band * 2 + 1, band * 2 + 1))
    zeker = cv2.erode(masker, k); misschien = cv2.dilate(masker, k)
    gc = np.full(masker.shape, cv2.GC_BGD, np.uint8)
    gc[misschien > 0] = cv2.GC_PR_BGD; gc[masker > 0] = cv2.GC_PR_FGD; gc[zeker > 0] = cv2.GC_FGD
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), gc, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    uit = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.uint8) * 255
    return uit

def schoon(m, r=7):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))
    m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
    # losse eilandjes weg: alleen grote vlakken houden
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 0.004 * m.size: keep[lab == i] = 255
    return keep

voor = schoon(((dep >= t2) * 255).astype(np.uint8), 11)
if t1.startswith("ref:"):
    _, x0, x1, delta = t1.split(":"); x0, x1, delta = int(x0) + px, int(x1) + px, float(delta)
    rijen = np.arange(h); med = np.median(dep[:, x0:x1], axis=1)
    a, b = np.polyfit(rijen, med, 1)                               # rechte lijn door de wanddiepte per rij
    grens = (a * rijen + b - delta)[:, None]
else:
    grens = float(t1)
niet_achter = schoon(((dep >= grens) * 255).astype(np.uint8), 9)    # midden + voor
niet_achter = verfijn(niet_achter)                                   # wand vs. donkere schacht: scherpe kleurgrens
niet_achter = cv2.erode(schoon(niet_achter, 5), np.ones((3, 3), np.uint8))   # 1px naar binnen: geen donker randje mee
voor = cv2.bitwise_and(voor, niet_achter)

def vul(beeld, gat, straal=6, band=110):
    """Vul het gat vanuit de rand (alleen een band; dieper komt nooit in beeld)."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (band * 2 + 1, band * 2 + 1))
    rand = cv2.bitwise_and(gat, cv2.dilate(255 - gat, k))
    bgr = cv2.cvtColor(beeld, cv2.COLOR_RGB2BGR)
    klein = 0.5
    b2 = cv2.resize(bgr, None, fx=klein, fy=klein, interpolation=cv2.INTER_AREA)
    g2 = cv2.resize(gat, None, fx=klein, fy=klein, interpolation=cv2.INTER_NEAREST)
    f2 = cv2.inpaint(b2, cv2.dilate(g2, np.ones((3, 3), np.uint8)), straal, cv2.INPAINT_TELEA)
    f = cv2.resize(f2, (bgr.shape[1], bgr.shape[0]), interpolation=cv2.INTER_CUBIC)
    f = cv2.GaussianBlur(f, (0, 0), 1.2)
    uit = bgr.copy(); uit[gat > 0] = f[gat > 0]
    return cv2.cvtColor(uit, cv2.COLOR_BGR2RGB)

achter_rgb = vul(rgb, cv2.dilate(niet_achter, np.ones((5, 5), np.uint8)))       # schacht doorgetrokken achter de wand
midden_rgb = vul(rgb, cv2.dilate(voor, np.ones((7, 7), np.uint8)))              # wand doorgetrokken achter de folie
midden_a = cv2.GaussianBlur(niet_achter, (0, 0), 1.1)                             # scherpe, licht verzachte rand
voor_a = cv2.GaussianBlur(cv2.erode(voor, np.ones((5, 5), np.uint8)), (0, 0), 7)  # folie: zachte, doorschijnende rand

def bewaar(naam, kleur, alfa=None):
    im = Image.fromarray(kleur) if alfa is None else Image.fromarray(np.dstack([kleur, alfa]), "RGBA")
    im = im.resize((round(w * SCHAAL), round(h * SCHAAL)), Image.LANCZOS)
    im.save(f"{out}-{naam}.webp", "WEBP", quality=78, method=6, alpha_quality=90)
    return im
A = bewaar("achter", achter_rgb); M = bewaar("midden", midden_rgb, midden_a); V = bewaar("voor", rgb, voor_a)
# controle: lagen op elkaar in rust moeten de oorspronkelijke foto opleveren
comp = Image.alpha_composite(Image.alpha_composite(A.convert("RGBA"), M), V).convert("RGB")
orig = Image.fromarray(rgb).resize(comp.size, Image.LANCZOS)
verschil = np.abs(np.array(comp).astype(int) - np.array(orig).astype(int))
json.dump({"breedte": comp.size[0], "hoogte": comp.size[1], "pad_x": PAD_X, "pad_y": PAD_Y}, open(f"{out}-lagen.json", "w"))
print("canvas", comp.size, "| aandeel voor/midden/achter: %.0f%% / %.0f%% / %.0f%%" % (100 * (voor > 0).mean(), 100 * ((niet_achter > 0) & (voor == 0)).mean(), 100 * (niet_achter == 0).mean()),
      "| verschil met origineel in rust: gemiddeld %.2f, >12 niveaus bij %.2f%% van de pixels" % (verschil.mean(), 100 * (verschil.max(axis=2) > 12).mean()))
