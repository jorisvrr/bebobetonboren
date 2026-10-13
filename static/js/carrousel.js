/* BEBO - fotocarrousel ("skewed carousel")
   Opent als een projectbeeld wordt aangeklikt en toont alleen de foto's van
   DAT project. De actieve foto staat recht in het midden; de buren draaien per
   stap verder om hun verticale as weg (60 graden per stap), elk met een eigen
   perspectief. Geometrie naar het voorbeeld van React Bits Pro "Skewed
   Carousel" (alleen het zichtbare gedrag; de broncode daarvan is niet openbaar).

   Gebruik:  BeboCarrousel.open({ titel, fotos, start, opener })
             fotos: [{ klein, midden, ruim, groot, b, h, alt }]
   Bediening: pijlen, pijltjestoetsen, Home/End, slepen/vegen, klik op een
   buurfoto of op een streepje; sluiten met de knop, Escape of klik naast de foto's.
   Geen afhankelijkheden. */
(function () {
  'use strict';

  var ROTATIE = 60;          // graden per stap vanaf de actieve foto
  var ROTATIE_SMAL = 50;     // telefoon: iets minder sterk
  var INACTIEF = 0.85;       // schaal van niet-actieve foto's
  var RADIUS = 8;            // hoekafronding in px
  var VEER = 121, DEMPING = 22;   // kritisch gedempte veer: ~0,6 s per stap

  var minderBeweging = window.matchMedia('(prefers-reduced-motion: reduce)');
  var sc, titelEl, sluitBtn, podium, tellerEl, vorigeBtn, volgendeBtn, strepenEl;
  var fotos = [], kaarten = [], strepen = [], n = 0;
  var pos = 0, doel = 0, snelheid = 0, raf = 0, laatst = 0;
  var maat = null, sleep = null, negeerKlik = false;
  var isOpen = false, opener = null, weg = [];

  function el(tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst) e.textContent = tekst;
    return e;
  }
  function knop(klasse, pad, label) {
    var b = el('button', 'sc__knop ' + klasse);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + pad + '"/></svg>';
    return b;
  }
  function klem(x, a, b) { return x < a ? a : x > b ? b : x; }
  function twee(x) { return (x < 10 ? '0' : '') + x; }

  function bouw() {
    sc = el('div', 'sc');
    sc.hidden = true;
    sc.setAttribute('role', 'dialog');
    sc.setAttribute('aria-modal', 'true');
    sc.setAttribute('aria-labelledby', 'sc-titel');

    var kop = el('div', 'sc__kop');
    titelEl = el('p', 'sc__titel');
    titelEl.id = 'sc-titel';
    sluitBtn = knop('sc__sluit', 'M6 6l12 12M18 6L6 18', 'Sluiten');
    kop.appendChild(titelEl); kop.appendChild(sluitBtn);

    podium = el('div', 'sc__podium');

    var voet = el('div', 'sc__voet');
    tellerEl = el('p', 'sc__teller');
    tellerEl.setAttribute('aria-live', 'polite');
    tellerEl.setAttribute('aria-atomic', 'true');
    var nav = el('div', 'sc__nav');
    vorigeBtn = knop('sc__vorige', 'M15 5l-7 7 7 7', 'Vorige foto');
    volgendeBtn = knop('sc__volgende', 'M9 5l7 7-7 7', 'Volgende foto');
    strepenEl = el('div', 'sc__strepen');
    strepenEl.setAttribute('aria-hidden', 'true');
    nav.appendChild(vorigeBtn); nav.appendChild(strepenEl); nav.appendChild(volgendeBtn);
    voet.appendChild(tellerEl); voet.appendChild(nav);

    sc.appendChild(kop); sc.appendChild(podium); sc.appendChild(voet);
    document.body.appendChild(sc);

    sluitBtn.addEventListener('click', sluit);
    vorigeBtn.addEventListener('click', function () { naar(doel - 1); });
    volgendeBtn.addEventListener('click', function () { naar(doel + 1); });
    strepenEl.addEventListener('click', function (e) {
      var i = strepen.indexOf(e.target.closest('.sc__streep'));
      if (i > -1) naar(i);
    });

    // klik: buurfoto = daarheen; naast de foto's = sluiten
    podium.addEventListener('click', function (e) {
      if (negeerKlik) { negeerKlik = false; return; }
      var k = e.target.closest('.sc__kaart');
      if (!k) { sluit(); return; }
      var i = +k.getAttribute('data-i');
      if (i !== doel) naar(i);
    });

    // slepen (muis) en vegen (aanraking) via pointer events
    podium.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      sleep = { id: e.pointerId, x0: e.clientX, pos0: pos, bewogen: false, t: e.timeStamp, v: 0 };
      negeerKlik = false;
    });
    podium.addEventListener('pointermove', function (e) {
      if (!sleep || e.pointerId !== sleep.id) return;
      var dx = e.clientX - sleep.x0;
      if (!sleep.bewogen) {
        if (Math.abs(dx) < 6) return;
        sleep.bewogen = true;
        snelheid = 0;
        try { podium.setPointerCapture(sleep.id); } catch (err) { /* niet erg */ }
        sc.classList.add('is-sleep');
      }
      var p = sleep.pos0 - dx / maat.pitch;
      // voorbij de eerste of laatste foto: meegeven met weerstand
      if (p < 0) p *= 0.3;
      else if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.3;
      var dt = (e.timeStamp - sleep.t) / 1000;
      if (dt > 0) sleep.v = sleep.v * 0.6 + ((p - pos) / dt) * 0.4;
      sleep.t = e.timeStamp;
      pos = p;
      laad(Math.round(klem(pos, 0, n - 1)));
      plan();
    });
    function los(e) {
      if (!sleep || e.pointerId !== sleep.id) return;
      var s = sleep; sleep = null;
      sc.classList.remove('is-sleep');
      if (!s.bewogen) return;
      negeerKlik = true;
      setTimeout(function () { negeerKlik = false; }, 0);
      var v = klem(s.v, -8, 8);
      snelheid = minderBeweging.matches ? 0 : v;
      naar(Math.round(pos + v * 0.14));
    }
    podium.addEventListener('pointerup', los);
    podium.addEventListener('pointercancel', los);
    podium.addEventListener('dragstart', function (e) { e.preventDefault(); });

    window.addEventListener('resize', function () { if (isOpen) { meet(); teken(); } });
  }

  // Maten van het podium -> grootte van de foto's en afstand ertussen.
  function meet() {
    var r = podium.getBoundingClientRect();
    var vw = r.width, vh = r.height;
    var smal = vw < 700, midden = vw < 1100;
    // Hoogte van de actieve foto (een staande foto is 3:4, dus breedte = 0,75 x hoogte).
    // Groot genoeg om het werk goed te bekijken, maar nooit hoger dan het podium:
    //   desktop  ca. 450-640 px, meegroeiend met de schermhoogte
    //   tablet   ca. 350-450 px
    //   telefoon de foto vult het grootste deel van de schermbreedte
    var sh = window.innerHeight;
    var hoog = smal ? vw * 0.80 / 0.75
             : midden ? Math.min(klem(sh * 0.56, 350, 450), vw * 0.46 / 0.75)
             : Math.min(klem(sh * 0.58, 450, 640), vw * 0.30 / 0.75);
    hoog = Math.min(hoog, vh * (smal ? 0.90 : 0.84));
    var w3 = Math.max(120, Math.round(hoog * 0.75));
    // Afstand tussen twee gedraaide buren, en (iets ruimer) van de actieve foto
    // tot zijn buur. Zo passen er op een breed scherm vijf foto's naast elkaar
    // terwijl de middelste groot blijft.
    var pitch = w3 * 0.74;
    var naast = w3 * (smal ? 0.80 : 0.86);
    var rot = smal ? ROTATIE_SMAL : ROTATIE;
    // Hoeveel buren aan elke kant (deels) in beeld komen. Een gedraaide foto is
    // smal; de derde staat weer vlak (180 graden) en steekt daardoor eerder in beeld.
    var venster = 1;
    for (var j = 2; j <= 3; j++) {
      var half = w3 * INACTIEF * Math.max(0.15, Math.abs(Math.cos(j * rot * Math.PI / 180))) * 0.575;
      if (naast + (j - 1) * pitch - half < vw / 2) venster = j;
    }
    maat = {
      vw: vw, w3: w3, h: Math.round(w3 / 0.75), pitch: pitch,
      basis: w3 - 2 * (naast - pitch),      // rekenbreedte van een buur in de rij
      rot: rot,
      persp: Math.round(w3 * 4),            // voorbeeld: 800px bij kaarten van 200px
      maxW: vw - (smal ? 24 : 96),
      venster: venster
    };
    kaarten.forEach(function (k, i) {
      var f = fotos[i];
      k.wn = Math.round(maat.h * f.b / f.h);       // breedte bij deze hoogte, hele foto
      k.fit = Math.min(1, maat.maxW / k.wn);       // brede foto past altijd in beeld
      var st = k.el.style;
      st.width = k.wn + 'px'; st.height = maat.h + 'px';
      st.marginLeft = (-k.wn / 2) + 'px'; st.marginTop = (-maat.h / 2) + 'px';
      k.img.sizes = k.wn + 'px';
    });
  }

  // Zet elke foto op zijn plek voor de huidige (mogelijk gebroken) positie.
  function teken() {
    var i, k, d, a, w3 = maat.w3, basis = maat.basis;
    for (i = 0; i < n; i++) {
      k = kaarten[i];
      d = i - pos;
      a = Math.max(0, 1 - Math.abs(d));            // 1 = actief, 0 = buur of verder
      k.d = d; k.a = a;
      k.e = basis + (k.wn * k.fit - basis) * a;    // ruimte die de foto in de rij inneemt
    }
    var c = [0];
    for (i = 1; i < n; i++) c[i] = c[i - 1] + maat.pitch + (kaarten[i - 1].e - basis) / 2 + (kaarten[i].e - basis) / 2;
    var p = klem(pos, 0, n - 1), lo = Math.floor(p), hi = Math.min(n - 1, lo + 1);
    var anker = c[lo] + (c[hi] - c[lo]) * (p - lo) + (pos - p) * maat.pitch;

    for (i = 0; i < n; i++) {
      k = kaarten[i];
      var st = k.el.style;
      if (Math.abs(k.d) > maat.venster + 1.6) {
        if (!k.weg) { st.visibility = 'hidden'; k.weg = true; }
        continue;
      }
      if (k.weg) { st.visibility = ''; k.weg = false; }
      var rot = klem(-k.d * maat.rot, -180, 180);
      var schaal = INACTIEF + (k.fit - INACTIEF) * k.a;
      var slot = Math.min(w3, k.wn);
      var snij = (k.wn - (slot + (k.wn - slot) * k.a)) / 2;   // liggende foto: buiten het midden bijgesneden
      st.transform = 'translate3d(' + (c[i] - anker).toFixed(2) + 'px,0,0) perspective(' + maat.persp + 'px) rotateY(' + rot.toFixed(2) + 'deg) scale(' + schaal.toFixed(4) + ')';
      st.clipPath = st.webkitClipPath = 'inset(0 ' + snij.toFixed(1) + 'px round ' + RADIUS + 'px)';
      st.zIndex = String(100 - Math.round(Math.abs(k.d) * 10));
      // van achteren gezien staat een beeld in spiegelbeeld; terugspiegelen zodat
      // de foto altijd klopt (de wissel gebeurt precies als de kaart op zijn kant staat)
      var achter = Math.abs(rot) > 90;
      if (achter !== k.achter) { k.img.style.transform = achter ? 'scaleX(-1)' : ''; k.achter = achter; }
    }
  }

  function plan() {
    if ((sleep && sleep.bewogen) || pos !== doel) sc.setAttribute('data-bezig', '1');   // direct, niet pas bij het volgende beeldje
    if (!raf) raf = requestAnimationFrame(tik);
  }
  function tik(t) {
    raf = 0;
    var dt = Math.min(0.05, laatst ? (t - laatst) / 1000 : 0.016);
    laatst = t;
    if (!sleep || !sleep.bewogen) {
      if (minderBeweging.matches) { pos = doel; snelheid = 0; }
      else {
        var stappen = Math.max(1, Math.ceil(dt / 0.008)), h = dt / stappen;
        for (var s = 0; s < stappen; s++) {
          snelheid += (-VEER * (pos - doel) - DEMPING * snelheid) * h;
          pos += snelheid * h;
        }
        if (Math.abs(pos - doel) < 0.0008 && Math.abs(snelheid) < 0.01) { pos = doel; snelheid = 0; }
      }
    }
    teken();
    if ((sleep && sleep.bewogen) || pos !== doel) plan();
    else { laatst = 0; sc.removeAttribute('data-bezig'); }
  }

  // Alleen de foto's rond het doel ophalen; de rest pas als ze in de buurt komen.
  function laad(midden) {
    for (var i = Math.max(0, midden - maat.venster); i <= Math.min(n - 1, midden + maat.venster); i++) {
      var k = kaarten[i], f = fotos[i];
      if (k.geladen) continue;
      k.geladen = true;
      var set = [f.klein + ' 640w', f.midden + ' 960w'];
      if (f.b > 1280) set.push(f.ruim + ' 1280w');
      set.push(f.groot + ' ' + f.b + 'w');
      k.img.srcset = set.join(', ');
      k.img.src = f.midden;
    }
  }

  function naar(i) {
    doel = klem(i, 0, n - 1);
    tellerEl.textContent = twee(doel + 1) + ' / ' + twee(n);
    strepen.forEach(function (s, j) { s.classList.toggle('is-actief', j === doel); });
    kaarten.forEach(function (k, j) {
      k.el.classList.toggle('is-actief', j === doel);
      if (j === doel) k.el.removeAttribute('aria-hidden'); else k.el.setAttribute('aria-hidden', 'true');
    });
    vorigeBtn.setAttribute('aria-disabled', doel === 0 ? 'true' : 'false');
    volgendeBtn.setAttribute('aria-disabled', doel === n - 1 ? 'true' : 'false');
    laad(doel);
    plan();
  }

  function open(opt) {
    if (!opt || !opt.fotos || !opt.fotos.length) return false;
    if (!sc) bouw();
    fotos = opt.fotos; n = fotos.length;
    opener = opt.opener || null;
    titelEl.textContent = opt.titel || '';

    // foto's opbouwen (nog zonder bron; laad() vult ze)
    [].slice.call(podium.querySelectorAll('.sc__kaart')).forEach(function (k) { k.remove(); });
    strepenEl.textContent = '';
    kaarten = []; strepen = [];
    fotos.forEach(function (f, i) {
      var k = el('div', 'sc__kaart');
      k.setAttribute('data-i', i);
      var img = el('img');
      img.alt = f.alt || '';
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('load', function () { img.classList.add('is-geladen'); });
      k.appendChild(img);
      podium.appendChild(k);
      kaarten.push({ el: k, img: img, geladen: false, weg: false, achter: false });
      strepen.push(strepenEl.appendChild(el('span', 'sc__streep')));
    });
    sc.classList.toggle('is-enkel', n < 2);

    // rest van de pagina stilzetten: niet scrollen, niet bereikbaar met Tab
    var schuif = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add('sc-open');
    if (schuif > 0) document.body.style.paddingRight = schuif + 'px';
    weg = [].filter.call(document.body.children, function (k) { return k !== sc && !k.inert && k.id !== 'target-cursor-root'; });
    weg.forEach(function (k) { k.inert = true; });

    sc.hidden = false;
    isOpen = true;
    meet();
    pos = doel = klem(opt.start | 0, 0, n - 1);
    snelheid = 0; laatst = 0; sleep = null;
    naar(doel);
    teken();
    sluitBtn.focus();
    document.dispatchEvent(new CustomEvent('bebo:carrousel', { detail: { open: true } }));
    return true;
  }

  function sluit() {
    if (!isOpen) return;
    isOpen = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    sc.hidden = true;
    sc.removeAttribute('data-bezig');
    [].slice.call(podium.querySelectorAll('.sc__kaart')).forEach(function (k) { k.remove(); });
    kaarten = [];
    weg.forEach(function (k) { k.inert = false; });
    weg = [];
    document.documentElement.classList.remove('sc-open');
    document.body.style.paddingRight = '';
    document.dispatchEvent(new CustomEvent('bebo:carrousel', { detail: { open: false } }));
    if (opener) opener.focus();
  }

  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); sluit(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); naar(doel + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); naar(doel - 1); }
    else if (e.key === 'Home') { e.preventDefault(); naar(0); }
    else if (e.key === 'End') { e.preventDefault(); naar(n - 1); }
    else if (e.key === 'Tab') {
      // Focus binnen de carrousel houden. We verplaatsen de focus zelf, omdat
      // niet elke browser met Tab langs knoppen loopt (Safari standaard niet).
      e.preventDefault();
      var knoppen = n < 2 ? [sluitBtn] : [sluitBtn, vorigeBtn, volgendeBtn];
      var nu = knoppen.indexOf(document.activeElement);
      knoppen[nu < 0 ? 0 : (nu + (e.shiftKey ? -1 : 1) + knoppen.length) % knoppen.length].focus();
    }
  });

  window.BeboCarrousel = { open: open, sluit: sluit };

  // Koppeling met de pagina: elk projectbeeld opent de foto's van zijn project.
  [].forEach.call(document.querySelectorAll('a[data-galerij]'), function (link) {
    link.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;   // nieuw tabblad e.d.
      var houder = link.closest('.project, .uitgelicht');
      if (!houder) return;
      var lijst = [].map.call(houder.querySelectorAll('.project__fotos a'), function (a) {
        return {
          groot: a.getAttribute('href'), klein: a.getAttribute('data-klein'),
          midden: a.getAttribute('data-midden'), ruim: a.getAttribute('data-ruim'),
          b: +a.getAttribute('data-b') || 1500, h: +a.getAttribute('data-h') || 2000,
          alt: a.textContent.trim()
        };
      });
      if (open({ titel: link.getAttribute('data-titel') || '', fotos: lijst, start: +link.getAttribute('data-start') || 0, opener: link })) e.preventDefault();
    });
  });
})();
