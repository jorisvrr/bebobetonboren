/* BEBO - foto vergroten op /projecten (vervangt de Skewed Carousel).
   Eenvoudige lightbox op basis van <dialog>: één foto tegelijk, volledig in
   beeld, vorige/volgende binnen hetzelfde project. Geen 3D, geen automatische
   overgangen. Bediening: klik/tik, pijltjestoetsen, Esc, vegen op touch.
   Zonder JavaScript (of zonder <dialog>) opent de link gewoon de grote foto. */
(function () {
  'use strict';

  var links = Array.prototype.slice.call(document.querySelectorAll('a[data-lightbox]'));
  if (!links.length || typeof HTMLDialogElement !== 'function') return;

  var groepen = {};
  links.forEach(function (a) {
    var g = a.getAttribute('data-lightbox');
    (groepen[g] = groepen[g] || []).push(a);
  });

  var dlg, img, titel, teller, onderschrift, knopVorige, knopVolgende;
  var groep = [], index = 0, opener = null;

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
    sluit.addEventListener('click', function () { dlg.close(); });
    var rechts = document.createElement('div');
    rechts.className = 'lb__rechts';
    rechts.appendChild(teller);
    rechts.appendChild(sluit);
    kop.appendChild(titel);
    kop.appendChild(rechts);

    var fig = document.createElement('figure');
    fig.className = 'lb__beeld';
    img = document.createElement('img');
    img.decoding = 'async';
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
    // klik naast de foto (op de achtergrond) sluit
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target === fig) dlg.close();
    });
    dlg.addEventListener('close', function () {
      document.documentElement.classList.remove('lb-open');
      img.removeAttribute('src');
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
  }

  // grote versie (max. 2000 px) alleen als het scherm er iets aan heeft
  function bron(a) {
    var nodig = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
    return nodig > 1400 ? a.getAttribute('href') : (a.getAttribute('data-ruim') || a.getAttribute('href'));
  }

  function toon(i) {
    index = (i + groep.length) % groep.length;
    var a = groep[index];
    var klein = a.querySelector('img');
    img.src = bron(a);
    img.alt = klein ? klein.alt : '';
    img.width = +a.getAttribute('data-b') || 0;
    img.height = +a.getAttribute('data-h') || 0;
    onderschrift.textContent = img.alt;
    teller.textContent = ('0' + (index + 1)).slice(-2) + ' / ' + ('0' + groep.length).slice(-2);
    var meer = groep.length > 1;
    knopVorige.hidden = !meer;
    knopVolgende.hidden = !meer;
    // buren alvast laden
    if (meer) {
      [groep[(index + 1) % groep.length], groep[(index - 1 + groep.length) % groep.length]].forEach(function (b) {
        var p = new Image(); p.src = bron(b);
      });
    }
  }

  function ga(stap) { if (groep.length > 1) toon(index + stap); }

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // nieuw tabblad mag
      e.preventDefault();
      if (!dlg) bouw();
      groep = groepen[a.getAttribute('data-lightbox')];
      opener = a;
      titel.textContent = a.getAttribute('data-titel') || '';
      toon(groep.indexOf(a));
      document.documentElement.classList.add('lb-open');
      dlg.showModal();
    });
  });
})();
