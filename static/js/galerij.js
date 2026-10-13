/* BEBO - fotoweergave op /projecten
   - klik of tik op een projectbeeld opent de foto's van DAT project
   - vorige/volgende: knoppen, pijltjestoetsen, vegen; Home/End = eerste/laatste
   - sluiten: knop, Escape of klik naast de foto; focus gaat terug naar het beeld
   - grote foto's worden pas geladen als ze getoond worden
   Zonder JavaScript opent de link gewoon de grote foto. Geen afhankelijkheden. */
(function () {
  'use strict';

  var links = document.querySelectorAll('a[data-galerij]');
  if (!links.length) return;

  var lb, img, titelEl, tellerEl, statusEl, vorigeBtn, volgendeBtn, sluitBtn, podium;
  var fotos = [], index = 0, opener = null, weg = [], open = false;

  function el(tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst) e.textContent = tekst;
    return e;
  }
  function knop(tekst, label) {
    var b = el('button', 'lb__knop', tekst);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    return b;
  }

  function bouw() {
    lb = el('div', 'lb');
    lb.hidden = true;
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');

    var kop = el('div', 'lb__kop');
    titelEl = el('p', 'lb__titel');
    titelEl.id = 'lb-titel';
    lb.setAttribute('aria-labelledby', 'lb-titel');
    sluitBtn = knop('×', 'Sluiten');
    kop.appendChild(titelEl); kop.appendChild(sluitBtn);

    podium = el('div', 'lb__podium');
    statusEl = el('p', 'lb__status');
    img = el('img', 'lb__img');
    img.decoding = 'async';
    podium.appendChild(statusEl); podium.appendChild(img);

    var voet = el('div', 'lb__voet');
    vorigeBtn = knop('←', 'Vorige foto');
    volgendeBtn = knop('→', 'Volgende foto');
    tellerEl = el('p', 'lb__teller');
    tellerEl.setAttribute('aria-live', 'polite');
    voet.appendChild(vorigeBtn); voet.appendChild(tellerEl); voet.appendChild(volgendeBtn);

    lb.appendChild(kop); lb.appendChild(podium); lb.appendChild(voet);
    document.body.appendChild(lb);

    sluitBtn.addEventListener('click', sluit);
    vorigeBtn.addEventListener('click', function () { toon(index - 1); });
    volgendeBtn.addEventListener('click', function () { toon(index + 1); });
    // klik naast de foto sluit
    podium.addEventListener('click', function (e) { if (e.target !== img) sluit(); });
    img.addEventListener('load', function () { lb.classList.remove('is-laden'); });
    img.addEventListener('error', function () {
      lb.classList.remove('is-laden'); lb.classList.add('is-fout');
      statusEl.textContent = 'Deze foto kon niet worden geladen';
    });

    // vegen op aanraakschermen
    var x0 = null, y0 = null;
    podium.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    podium.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) toon(index + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  // Welke breedte heeft de foto straks op het scherm? Daarmee kiest de browser
  // zelf de kleinste versie die scherp genoeg is.
  function bronnen(doel, f) {
    var r = podium.getBoundingClientRect();
    var b = Math.max(200, Math.min(r.width || window.innerWidth, (r.height || window.innerHeight) * f.b / f.h));
    doel.sizes = Math.round(b) + 'px';
    doel.srcset = f.midden + ' 960w, ' + (f.b > 1280 ? f.ruim + ' 1280w, ' : '') + f.groot + ' ' + f.b + 'w';
    doel.src = f.midden;
  }

  function toon(i) {
    var n = fotos.length;
    index = (i % n + n) % n;
    var f = fotos[index];
    lb.classList.remove('is-fout');
    lb.classList.add('is-laden');
    statusEl.textContent = 'Foto laden';
    img.removeAttribute('srcset'); img.removeAttribute('src');
    img.alt = f.alt;
    img.width = f.b; img.height = f.h;
    bronnen(img, f);
    if (img.complete && img.naturalWidth) lb.classList.remove('is-laden');
    tellerEl.textContent = (index + 1) + ' / ' + n;
    vorigeBtn.hidden = volgendeBtn.hidden = n < 2;
    // de volgende alvast klaarzetten, zodat bladeren direct voelt
    if (n > 1) { var p = new Image(); bronnen(p, fotos[(index + 1) % n]); }
  }

  function openen(link) {
    var project = link.closest('.project');
    if (!project) return false;
    fotos = [].map.call(project.querySelectorAll('.project__fotos a'), function (a) {
      return {
        groot: a.getAttribute('href'), midden: a.getAttribute('data-midden'), ruim: a.getAttribute('data-ruim'),
        b: +a.getAttribute('data-b') || 1500, h: +a.getAttribute('data-h') || 2000,
        alt: a.textContent.trim()
      };
    });
    if (!fotos.length) return false;
    if (!lb) bouw();
    opener = link;
    var kop = project.querySelector('h2');
    titelEl.textContent = kop ? kop.textContent.trim() : '';

    // rest van de pagina stilzetten: niet scrollen, niet bereikbaar met Tab
    var schuif = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add('lb-open');
    if (schuif > 0) document.body.style.paddingRight = schuif + 'px';
    weg = [].filter.call(document.body.children, function (k) { return k !== lb && !k.inert && k.id !== 'target-cursor-root'; });
    weg.forEach(function (k) { k.inert = true; });

    lb.hidden = false;
    open = true;
    toon(0);
    sluitBtn.focus();
    return true;
  }

  function sluit() {
    if (!open) return;
    open = false;
    lb.hidden = true;
    img.removeAttribute('srcset'); img.removeAttribute('src');
    weg.forEach(function (k) { k.inert = false; });
    weg = [];
    document.documentElement.classList.remove('lb-open');
    document.body.style.paddingRight = '';
    if (opener) opener.focus();
  }

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); sluit(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); toon(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); toon(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); toon(0); }
    else if (e.key === 'End') { e.preventDefault(); toon(fotos.length - 1); }
    else if (e.key === 'Tab') {
      // Focus binnen de fotoweergave houden. We verplaatsen de focus zelf, omdat
      // niet elke browser met Tab langs knoppen loopt (Safari standaard niet).
      e.preventDefault();
      var knoppen = [].filter.call(lb.querySelectorAll('button'), function (b) { return !b.hidden; });
      var nu = knoppen.indexOf(document.activeElement);
      var naar = nu < 0 ? 0 : (nu + (e.shiftKey ? -1 : 1) + knoppen.length) % knoppen.length;
      knoppen[naar].focus();
    }
  });

  [].forEach.call(links, function (link) {
    link.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // nieuw tabblad e.d.
      if (openen(link)) e.preventDefault();
    });
  });
})();
