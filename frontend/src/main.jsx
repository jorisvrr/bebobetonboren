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

/* 1) Target cursor - alleen op desktop met een echte muis.
   De component zet zichzelf ook intern uit op mobiel; dit is de extra gate. */
if (!isTouch && !prefersReduced) {
  const host = document.createElement('div');
  host.id = 'target-cursor-root';
  document.body.appendChild(host);
  // Markeer de pagina zodat we de OS-cursor overal kunnen verbergen
  // (ook op links/knoppen/velden en tijdens selecteren) via CSS.
  document.documentElement.classList.add('bebo-cursor-on');
  createRoot(host).render(
    <TargetCursor
      targetSelector=".btn, .textlink, .dienst, .chip, .regio__list span, .sm-toggle, .sm-panel-item, .sm-socials-link, .sm-logo, .float a, .offerte__direct a, .footer__col a, .ident, .field input, .field textarea, .field select"
      spinDuration={3}
      hideDefaultCursor={true}
    />
  );
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
