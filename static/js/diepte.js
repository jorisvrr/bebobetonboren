/* BEBO - DepthParallax (2.5D-foto)                      EXPERIMENT
   Eén foto, opgesplitst in drie lagen (achter / midden / voor) die elk een
   eigen stukje meebewegen met de muis en met het scrollen. In rust liggen de
   lagen precies op elkaar en zie je de oorspronkelijke foto.

   Gebruik:
     new BeboDiepte(houder, {
       achter, midden, voor,      // URL's van de drie lagen (uit dezelfde foto)
       padX, padY,                // overscan van de lagen t.o.v. het kader (0.08 = 8%)
       intensiteit                // 1 = standaard; 0.5 = half zo veel beweging
     })
   De houder bevat al de gewone foto: dat is de terugval. De lagen komen er pas
   overheen als ze alle drie geladen zijn. Geen lagen bij "minder beweging";
   op aanraakschermen alleen het scrolldeel. Staat stil buiten beeld en zolang
   de fotocarrousel open is. Alleen transforms + requestAnimationFrame. */
(function () {
  'use strict';

  //            laag      muis (px)  scroll (px)   bij een kader van 600px of breder;
  var LAGEN = [['achter',  8,         3],          // smaller kader = evenredig minder
               ['midden', 16,         6],
               ['voor',   28,        10]];
  var BASIS = 600;

  var minder = window.matchMedia('(prefers-reduced-motion: reduce)');
  var muis = window.matchMedia('(hover: hover) and (pointer: fine)');
  var exemplaren = [];

  function klem(x, a, b) { return x < a ? a : x > b ? b : x; }

  function BeboDiepte(houder, opt) {
    this.el = houder;
    this.opt = opt;
    this.padX = +opt.padX || 0.08;
    this.padY = +opt.padY || 0.10;
    this.sterkte = opt.intensiteit == null ? 1 : +opt.intensiteit;
    this.tx = this.ty = 0;          // doel (muis), -1..1
    this.x = this.y = this.s = 0;   // huidige, gedempte waarden
    this.inBeeld = false; this.klaar = false; this.pauze = false;
    this.raf = 0; this.laatst = 0;
    if (minder.matches || !opt.achter || !opt.midden || !opt.voor || !('IntersectionObserver' in window)) return;
    exemplaren.push(this);
    var zelf = this;
    // lagen pas ophalen als de foto in de buurt komt
    this.ioLaad = new IntersectionObserver(function (e) {
      if (e.some(function (x) { return x.isIntersecting; })) { zelf.ioLaad.disconnect(); zelf.bouw(); }
    }, { rootMargin: '400px' });
    this.ioLaad.observe(houder);
  }

  BeboDiepte.prototype.bouw = function () {
    var zelf = this, wrap = document.createElement('div'), teLaden = LAGEN.length, mislukt = false;
    wrap.className = 'diepte';
    wrap.setAttribute('aria-hidden', 'true');
    this.lagen = LAGEN.map(function (l) {
      var img = new Image();
      img.className = 'diepte__laag';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.style.left = (-zelf.padX * 100) + '%';
      img.style.top = (-zelf.padY * 100) + '%';
      img.style.width = ((1 + 2 * zelf.padX) * 100) + '%';
      img.style.height = ((1 + 2 * zelf.padY) * 100) + '%';
      img.onload = function () { if (!--teLaden && !mislukt) zelf.start(wrap); };
      img.onerror = function () { mislukt = true; wrap.remove(); };   // terugval: de gewone foto blijft staan
      img.src = zelf.opt[l[0]];
      wrap.appendChild(img);
      return { img: img, muis: l[1], scroll: l[2] };
    });
    this.el.appendChild(wrap);
  };

  BeboDiepte.prototype.start = function (wrap) {
    var zelf = this, el = this.el;
    this.klaar = true;
    el.classList.add('pbeeld--diepte');
    wrap.classList.add('is-klaar');
    if (muis.matches) {
      el.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        var r = el.getBoundingClientRect();
        zelf.tx = klem((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
        zelf.ty = klem((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
        zelf.plan();
      });
      el.addEventListener('pointerleave', function () { zelf.tx = zelf.ty = 0; zelf.plan(); });
    }
    this.ioBeeld = new IntersectionObserver(function (e) {
      zelf.inBeeld = e[e.length - 1].isIntersecting;
      if (zelf.inBeeld) zelf.plan();
    });
    this.ioBeeld.observe(el);
  };

  BeboDiepte.prototype.plan = function () {
    if (!this.raf && this.klaar && this.inBeeld && !this.pauze) {
      var zelf = this;
      this.raf = requestAnimationFrame(function (t) { zelf.tik(t); });
    }
  };

  BeboDiepte.prototype.tik = function (t) {
    this.raf = 0;
    var dt = Math.min(0.05, this.laatst ? (t - this.laatst) / 1000 : 0.016);
    this.laatst = t;
    var r = this.el.getBoundingClientRect(), vh = window.innerHeight;
    // scroll: -1 (foto komt onder in beeld) .. 0 (midden) .. 1 (verdwijnt boven)
    var ts = klem((vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2), -1, 1);
    var k = 1 - Math.exp(-dt * 7), ks = 1 - Math.exp(-dt * 14);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.s += (ts - this.s) * ks;
    var schaal = Math.min(1, r.width / BASIS) * this.sterkte;
    var maxX = r.width * this.padX * 0.96, maxY = r.height * this.padY * 0.96;   // nooit voorbij de overscan
    for (var i = 0; i < this.lagen.length; i++) {
      var l = this.lagen[i];
      var dx = klem(-this.x * l.muis * schaal, -maxX, maxX);
      var dy = klem((-this.y * l.muis + this.s * l.scroll) * schaal, -maxY, maxY);
      // één transform per laag: muis en scroll zijn hier al opgeteld
      l.img.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)';
    }
    var rust = Math.abs(this.tx - this.x) < 0.001 && Math.abs(this.ty - this.y) < 0.001 && Math.abs(ts - this.s) < 0.001;
    if (rust) this.laatst = 0; else this.plan();
  };

  // scrollen: alleen de exemplaren die in beeld zijn een duwtje geven
  window.addEventListener('scroll', function () {
    for (var i = 0; i < exemplaren.length; i++) exemplaren[i].plan();
  }, { passive: true });
  window.addEventListener('resize', function () {
    for (var i = 0; i < exemplaren.length; i++) exemplaren[i].plan();
  });
  // stil zolang de fotocarrousel open is
  document.addEventListener('bebo:carrousel', function (e) {
    var open = !!(e.detail && e.detail.open);
    exemplaren.forEach(function (d) {
      d.pauze = open;
      if (open) { if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; } d.tx = d.ty = 0; d.laatst = 0; }
      else d.plan();
    });
  });

  window.BeboDiepte = BeboDiepte;

  // Koppeling met de pagina: elk beeld met data-diepte krijgt de lagen.
  [].forEach.call(document.querySelectorAll('[data-diepte]'), function (el) {
    new BeboDiepte(el, {
      achter: el.getAttribute('data-achter'), midden: el.getAttribute('data-midden'), voor: el.getAttribute('data-voor'),
      padX: el.getAttribute('data-pad-x'), padY: el.getAttribute('data-pad-y'),
      intensiteit: el.getAttribute('data-intensiteit')
    });
  });
})();
