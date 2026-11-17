/* BEBO - automatische diashow achter de homepage-hero (17-11-2026).
   - Elke `data-interval` ms (4000) de volgende foto, met een rustige
     vervaging van `data-overgang` ms (800). Loopt rond.
   - Geen pijlen, slepen, vegen of klikken; geen pauze bij hover. Rechtsonder
     staan stipjes (één per foto) die alleen aangeven welke foto in beeld is.
   - Alleen de eerste foto laadt direct (in de HTML). Elke volgende foto wordt
     pas geladen terwijl de huidige in beeld is, en er wordt pas gewisseld als
     die foto echt klaar is (geen flits, geen lege achtergrond).
   - De nieuwe foto vervaagt erin bovenop de vorige, die tot het eind volledig
     zichtbaar blijft: geen donkere tussenstap, ook niet van laatste naar eerste.
   - Eén timer tegelijk; stopt als het tabblad verborgen is of de pagina
     wordt verlaten, en gaat verder als het tabblad weer zichtbaar is.
   - prefers-reduced-motion: geen diashow, de eerste foto blijft staan.
   Opmaak: templates/index.html (.fhero__media[data-diashow] > img.fhero__img). */
(function () {
  'use strict';

  var media = document.querySelector('.fhero__media[data-diashow]');
  if (!media || media.getAttribute('data-diashow-actief')) return;
  var dias = Array.prototype.slice.call(media.querySelectorAll('.fhero__img'));
  if (dias.length < 2) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  media.setAttribute('data-diashow-actief', '1');

  var interval = +media.getAttribute('data-interval') || 4000;
  var overgang = +media.getAttribute('data-overgang') || 800;
  media.style.setProperty('--dia-overgang', overgang + 'ms');

  var stippen = Array.prototype.slice.call(document.querySelectorAll('.fhero__stip'));
  var index = 0;
  var timer = null;
  var opruimTimer = null;
  var wacht = false;   // bezig met laden van de volgende foto

  function laad(img) {
    return new Promise(function (klaar) {
      if (img.getAttribute('data-geladen')) return klaar();
      var gedaan = function () {
        img.setAttribute('data-geladen', '1');
        // decode(): pas wisselen als de foto echt getekend kan worden
        (img.decode ? img.decode() : Promise.resolve()).catch(function () {}).then(klaar);
      };
      if (!img.getAttribute('src') && img.getAttribute('data-src')) {
        img.addEventListener('load', gedaan, { once: true });
        img.addEventListener('error', function () { klaar(); }, { once: true });
        img.setAttribute('srcset', img.getAttribute('data-srcset') || '');
        img.setAttribute('src', img.getAttribute('data-src'));
      } else if (img.complete && img.naturalWidth) {
        gedaan();
      } else {
        img.addEventListener('load', gedaan, { once: true });
        img.addEventListener('error', function () { klaar(); }, { once: true });
      }
    });
  }

  function toonStip(n) {
    stippen.forEach(function (s, i) { s.classList.toggle('is-actief', i === n); });
  }

  function toon(n) {
    var oud = dias[index];
    var nieuw = dias[n];
    clearTimeout(opruimTimer);
    dias.forEach(function (d) { if (d !== oud && d !== nieuw) d.classList.remove('is-vorige'); });
    oud.classList.remove('is-actief');
    oud.classList.add('is-vorige');      // blijft volledig zichtbaar eronder
    nieuw.classList.remove('is-vorige');
    nieuw.classList.add('is-actief');    // vervaagt erin, bovenop
    index = n;
    opruimTimer = setTimeout(function () { oud.classList.remove('is-vorige'); }, overgang + 50);
    toonStip(n);
    laad(dias[(n + 1) % dias.length]);  // alvast de volgende
  }

  function plan() {
    clearTimeout(timer);                 // nooit twee timers tegelijk
    timer = setTimeout(volgende, interval);
  }

  function volgende() {
    timer = null;
    if (document.hidden || wacht) return;
    var n = (index + 1) % dias.length;
    wacht = true;
    laad(dias[n]).then(function () {
      wacht = false;
      if (document.hidden) return;
      toon(n);
      plan();
    });
  }

  function stop() { clearTimeout(timer); timer = null; }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!timer && !wacht) plan();
  });
  window.addEventListener('pagehide', stop);

  // start: zodra de eerste foto er is, de tweede alvast laden en de klok zetten
  laad(dias[0]).then(function () {
    laad(dias[1]);
    if (!document.hidden) plan();
  });
})();
