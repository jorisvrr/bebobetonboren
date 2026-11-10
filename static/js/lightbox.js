/* BEBO - fotoweergave voor projecten (homepage en /projecten).
   Elk project toont één coverfoto. Klik op de cover opent deze weergave met
   álle foto's van dat project, in de volgorde van de klant, beginnend bij de
   cover. Eenvoudig: één foto tegelijk, volledig in beeld, rustige vervaging.
   Geen 3D, geen automatische overgangen.

   Opmaak (templates/_project.html):
     <a data-lightbox-open="<project-id>" data-start="<index>" href="<grote foto>">  cover
     <ul data-lightbox-groep="<project-id>" data-titel="..." hidden>                 alle foto's
       <li><a href="<groot>" data-ruim="<1280>" data-b="<breedte>" data-h="<hoogte>">alt</a></li>
   Bediening: vorige/volgende, pijltjestoetsen, Esc, vegen op touch, klik
   naast de foto sluit. Zonder JavaScript opent de link de grote coverfoto. */
(function () {
  'use strict';

  var openers = Array.prototype.slice.call(document.querySelectorAll('a[data-lightbox-open]'));
  if (!openers.length || typeof HTMLDialogElement !== 'function') return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VERVAAG = reduce ? 0 : 180; // ms, gelijk aan de CSS-transitie

  function leesGroep(id) {
    var lijst = document.querySelector('[data-lightbox-groep="' + id + '"]');
    if (!lijst) return null;
    var fotos = Array.prototype.slice.call(lijst.querySelectorAll('a')).map(function (a) {
      return {
        groot: a.getAttribute('href'),
        ruim: a.getAttribute('data-ruim') || a.getAttribute('href'),
        b: +a.getAttribute('data-b') || 0,
        h: +a.getAttribute('data-h') || 0,
        alt: a.textContent.trim()
      };
    });
    return { titel: lijst.getAttribute('data-titel') || '', fotos: fotos };
  }

  var dlg, img, titel, teller, onderschrift, knopVorige, knopVolgende, fig;
  var groep = null, index = 0, opener = null, wisselTimer = null;

  function knop(cls, label, pad) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lb__knop ' + cls;
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="' + pad + '"/></svg>';
    return b;
  }

  function bouw() {
    dlg = document.createElement('dialog');
    dlg.className = 'lb';
    dlg.setAttribute('aria-label', "Foto's");

    var kop = document.createElement('div');
    kop.className = 'lb__kop';
    titel = document.createElement('p');
    titel.className = 'lb__titel';
    teller = document.createElement('p');
    teller.className = 'lb__teller';
    teller.setAttribute('aria-live', 'polite');
    var sluit = knop('lb__sluit', 'Sluiten', 'M6 6l12 12M18 6L6 18');
    sluit.addEventListener('click', sluiten);
    var rechts = document.createElement('div');
    rechts.className = 'lb__rechts';
    rechts.appendChild(teller);
    rechts.appendChild(sluit);
    kop.appendChild(titel);
    kop.appendChild(rechts);

    fig = document.createElement('figure');
    fig.className = 'lb__beeld';
    img = document.createElement('img');
    img.decoding = 'async';
    img.addEventListener('load', function () { img.classList.add('is-geladen'); });
    onderschrift = document.createElement('figcaption');
    onderschrift.className = 'lb__onderschrift';
    fig.appendChild(img);
    fig.appendChild(onderschrift);

    knopVorige = knop('lb__vorige', 'Vorige foto', 'M15 5l-7 7 7 7');
    knopVolgende = knop('lb__volgende', 'Volgende foto', 'M9 5l7 7-7 7');
    knopVorige.addEventListener('click', function () { ga(-1); });
    knopVolgende.addEventListener('click', function () { ga(1); });

    dlg.appendChild(kop);
    dlg.appendChild(fig);
    dlg.appendChild(knopVorige);
    dlg.appendChild(knopVolgende);
    document.body.appendChild(dlg);

    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); ga(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); ga(1); }
    });
    // Esc: eerst rustig uitvagen in plaats van direct verdwijnen
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); sluiten(); });
    // klik naast de foto (achtergrond of lege ruimte rond de foto) sluit
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target === fig) sluiten();
    });
    dlg.addEventListener('close', function () {
      document.documentElement.classList.remove('lb-open');
      dlg.classList.remove('is-open', 'is-sluitend');
      img.removeAttribute('src');
      img.classList.remove('is-geladen');
      if (opener) opener.focus({ preventScroll: true });
    });

    // vegen op touch
    var x0 = null, y0 = null;
    fig.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      x0 = e.clientX; y0 = e.clientY;
    });
    fig.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = y0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) ga(dx < 0 ? 1 : -1);
    });
    fig.addEventListener('pointercancel', function () { x0 = y0 = null; });
  }

  // grote versie (max. 2000 px) alleen als het scherm er iets aan heeft
  function bron(f) {
    var nodig = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
    return nodig > 1400 ? f.groot : f.ruim;
  }

  function zet(i) {
    var n = groep.fotos.length;
    index = (i + n) % n;
    var f = groep.fotos[index];
    img.classList.remove('is-geladen');
    img.width = f.b;
    img.height = f.h;
    img.alt = f.alt;
    img.src = bron(f);
    if (img.complete && img.naturalWidth) img.classList.add('is-geladen');
    onderschrift.textContent = f.alt;
    teller.textContent = ('0' + (index + 1)).slice(-2) + ' / ' + ('0' + n).slice(-2);
    // buren alvast laden
    if (n > 1) {
      [groep.fotos[(index + 1) % n], groep.fotos[(index - 1 + n) % n]].forEach(function (b) {
        var p = new Image(); p.src = bron(b);
      });
    }
  }

  function toon(i, direct) {
    clearTimeout(wisselTimer);
    if (direct || !VERVAAG || !img.getAttribute('src')) { zet(i); return; }
    // korte vervaging: oude foto uit, nieuwe in (via .is-geladen)
    img.classList.remove('is-geladen');
    wisselTimer = setTimeout(function () { zet(i); }, VERVAAG * 0.6);
  }

  function ga(stap) { if (groep && groep.fotos.length > 1) toon(index + stap); }

  function openen(a) {
    var g = leesGroep(a.getAttribute('data-lightbox-open'));
    if (!g || !g.fotos.length) return false;
    if (!dlg) bouw();
    groep = g;
    opener = a;
    titel.textContent = g.titel;
    var meer = g.fotos.length > 1;
    knopVorige.hidden = !meer;
    knopVolgende.hidden = !meer;
    toon(+a.getAttribute('data-start') || 0, true);
    document.documentElement.classList.add('lb-open');
    dlg.showModal();
    // volgende frame: vervaging van de achtergrond starten
    requestAnimationFrame(function () { dlg.classList.add('is-open'); });
    return true;
  }

  function sluiten() {
    if (!dlg || !dlg.open || dlg.classList.contains('is-sluitend')) return;
    clearTimeout(wisselTimer);
    if (!VERVAAG) { dlg.close(); return; }
    dlg.classList.add('is-sluitend');
    dlg.classList.remove('is-open');
    setTimeout(function () { if (dlg.open) dlg.close(); }, VERVAAG);
  }

  openers.forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // nieuw tabblad mag
      if (openen(a)) e.preventDefault();
    });
  });
})();
