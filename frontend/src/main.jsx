import { createRoot } from 'react-dom/client';
import TargetCursor from './components/TargetCursor.jsx';
import StaggeredMenu from './components/StaggeredMenu.jsx';
import './bebo-overrides.css';

/* Capabilities - we volgen het React Bits-advies: effecten uit op mobiel
   en bij prefers-reduced-motion, en zwaar WebGL pas laden wanneer nodig. */
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const isSmall = window.matchMedia('(max-width: 860px)').matches;

/* 0) StaggeredMenu = de navigatie. Mount op alle schermformaten.
   Contactgegevens komen uit data-attributen op #staggered-menu (Jinja),
   zodat er een bron blijft. */
const menuRoot = document.getElementById('staggered-menu');
if (menuRoot) {
  const tel = menuRoot.dataset.tel || '';
  const telLink = menuRoot.dataset.telLink || '';
  const email = menuRoot.dataset.email || '';

  const items = [
    { label: 'Werkzaamheden', ariaLabel: 'Naar werkzaamheden', link: '/#diensten' },
    { label: 'Werkwijze', ariaLabel: 'Naar werkwijze', link: '/#werkwijze' },
    { label: 'Waarom BEBO', ariaLabel: 'Naar waarom BEBO', link: '/#waarom' },
    { label: 'Werkgebied', ariaLabel: 'Naar werkgebied', link: '/#werkgebied' },
    { label: 'Projecten', ariaLabel: 'Naar de projecten', link: '/projecten' },
    { label: 'Offerte aanvragen', ariaLabel: 'Naar offerteformulier', link: '/#offerte' }
  ];
  const socialItems = [
    { label: tel, link: 'tel:' + telLink },
    { label: 'E-mail', link: 'mailto:' + email }
  ];

  createRoot(menuRoot).render(
    <StaggeredMenu
      position="right"
      isFixed={true}
      items={items}
      socialItems={socialItems}
      displaySocials={true}
      displayItemNumbering={true}
      accentColor="#D2051E"
      colors={['#1a1b1f', '#D2051E']}
      logoUrl="/static/img/brand/bebo-logo.svg"
      menuButtonColor="#16171B"
      openMenuButtonColor="#16171B"
      changeMenuColorOnOpen={false}
    />
  );
}

/* 1) Target cursor (crosshair) - alleen met een echte muis.
   Veiligheid voorop: de systeemcursor blijft staan tot de crosshair aantoonbaar
   de muis volgt. Tekent de component niets (bijv. op Android/iPad of een smal
   venster op een touchscreen-laptop) of gaat er iets mis, dan houdt de bezoeker
   gewoon de normale cursor. Zo is er nooit een moment zonder cursor, en nooit twee. */
if (!isTouch && !prefersReduced) {
  const host = document.createElement('div');
  host.id = 'target-cursor-root';
  document.body.appendChild(host);
  createRoot(host).render(
    <TargetCursor
      targetSelector=".btn, .textlink, .dienst, .chip, .regio__list span, .sm-toggle, .sm-panel-item, .sm-socials-link, .sm-logo, .pbeeld--klik, .sc__knop, .float a, .offerte__direct a, .footer__col a, .ident, .field input, .field textarea, .field select"
      spinDuration={3}
      hideDefaultCursor={false}
    />
  );

  // De class "bebo-cursor-on" verbergt de systeemcursor en toont de crosshair
  // (zie bebo-overrides.css). Hij gaat pas aan na een echte muisbeweging waarbij
  // de crosshair op de muispositie staat, en weer uit bij aanraking of pen.
  const root = document.documentElement;
  let aan = false;
  const zetAan = () => { if (!aan) { aan = true; root.classList.add('bebo-cursor-on'); } };
  const zetUit = () => { if (aan) { aan = false; root.classList.remove('bebo-cursor-on'); } };
  let bezig = false;
  let x = 0, y = 0;   // laatst bekende muispositie
  const controleer = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') { zetUit(); return; }
    x = e.clientX; y = e.clientY;
    if (aan || bezig) return;
    bezig = true;
    // even wachten: de crosshair beweegt met een korte animatie naar de muis toe.
    // Staat hij daarna bij de laatste muispositie, dan volgt hij de muis echt.
    setTimeout(() => {
      bezig = false;
      const el = document.querySelector('.target-cursor-wrapper');
      if (!el || getComputedStyle(el).display === 'none') return;
      const r = el.getBoundingClientRect();
      if (Math.abs(r.left - x) < 60 && Math.abs(r.top - y) < 60) zetAan();
    }, 160);
  };
  const beweegEvent = 'onpointermove' in window ? 'pointermove' : 'mousemove';
  window.addEventListener(beweegEvent, controleer, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType && e.pointerType !== 'mouse') zetUit(); }, { passive: true });
  window.addEventListener('touchstart', zetUit, { passive: true });
}

/* 2) Beams-achtergrond in de offerte-sectie - three.js wordt lazy geladen
   (aparte chunk) en pas gemount wanneer de sectie in beeld komt. */
const beamsRoot = document.getElementById('beams-root');
if (beamsRoot && !prefersReduced && !isSmall) {
  const mountBeams = () =>
    import('./components/Beams.jsx').then(({ default: Beams }) => {
      createRoot(beamsRoot).render(
        <Beams
          beamNumber={10}
          lightColor="#C2493C"
          speed={1.6}
          noiseIntensity={1.4}
          scale={0.18}
          rotation={26}
        />
      );
    });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          mountBeams();
        }
      },
      { rootMargin: '300px' }
    );
    io.observe(beamsRoot);
  } else {
    mountBeams();
  }
}
