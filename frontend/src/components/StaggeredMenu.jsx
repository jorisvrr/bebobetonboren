import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './StaggeredMenu.css';

// BEBO (10-11-2026): openingsvolgorde. Eerst reageert de knop, dan komt het
// paneel binnen, pas als dat (bijna) staat verschijnen de links met een
// lichte stagger, daarna nummers en contactgegevens. Tijden in seconden.
const T = {
  lagen: 0.12,        // gekleurde lagen schuiven in
  lagenStagger: 0.07,
  lagenDuur: 0.5,
  paneel: 0.25,       // paneel begint (staat er visueel ca. 0.30s later)
  paneelDuur: 0.55,
  links: 0.56,        // eerste link; laatste begint ca. 0.20s later
  linksStagger: 0.04,
  linksDuur: 0.7,
  nummers: 0.64,
  contact: 0.78,      // contactkop en -links: klaar rond 1.1s
  sluitenInhoud: 0.12,
  sluitenPaneel: 0.4,
  dubbelklik: 0.28    // tweede klik binnen deze tijd wordt genegeerd
};
// Verborgen stand van een link: ver genoeg omlaag dat ook de gekantelde
// (en dus hogere) hoek van een lange link als "Offerte aanvragen" niet al
// boven de onderrand van zijn regel uitsteekt, plus onzichtbaar.
const LINK_UIT = { yPercent: 175, rotate: 6, opacity: 0 };
const minderBeweging = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const StaggeredMenu = ({
  position = 'right',
  colors = ['#B497CF', '#5227FF'],
  items = [],
  socialItems = [],
  displaySocials = true,
  displayItemNumbering = true,
  className,
  logoUrl = '/static/img/bebo-mark.svg',
  menuButtonColor = '#16171B',
  openMenuButtonColor = '#16171B',
  accentColor = '#D2051E',
  changeMenuColorOnOpen = true,
  isFixed = false,
  closeOnClickAway = true,
  onMenuOpen,
  onMenuClose
}) => {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const panelRef = useRef(null);
  const preLayersRef = useRef(null);
  const preLayerElsRef = useRef([]);
  const plusHRef = useRef(null);
  const plusVRef = useRef(null);
  const iconRef = useRef(null);
  const textInnerRef = useRef(null);
  const textWrapRef = useRef(null);
  const [textLines, setTextLines] = useState(['Menu', 'Sluit']);

  const openTlRef = useRef(null);
  const closeTweenRef = useRef(null);
  const spinTweenRef = useRef(null);
  const textCycleAnimRef = useRef(null);
  const colorTweenRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const busyRef = useRef(false);
  const itemEntranceTweenRef = useRef(null);
  const laatsteKlikRef = useRef(0);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;
      const plusH = plusHRef.current;
      const plusV = plusVRef.current;
      const icon = iconRef.current;
      const textInner = textInnerRef.current;
      if (!panel || !plusH || !plusV || !icon || !textInner) return;

      let preLayers = [];
      if (preContainer) {
        preLayers = Array.from(preContainer.querySelectorAll('.sm-prelayer'));
      }
      preLayerElsRef.current = preLayers;

      const offscreen = position === 'left' ? -100 : 100;
      gsap.set([panel, ...preLayers], { xPercent: offscreen, opacity: 1 });
      if (preContainer) {
        gsap.set(preContainer, { xPercent: 0, opacity: 1 });
      }
      gsap.set(plusH, { transformOrigin: '50% 50%', rotate: 0 });
      gsap.set(plusV, { transformOrigin: '50% 50%', rotate: 90 });
      gsap.set(icon, { rotate: 0, transformOrigin: '50% 50%' });
      gsap.set(textInner, { yPercent: 0 });
      if (toggleBtnRef.current) gsap.set(toggleBtnRef.current, { color: menuButtonColor });
    });
    return () => ctx.revert();
  }, [menuButtonColor, position]);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return null;

    // Werd het menu net gesloten (sluitanimatie nog bezig)? Dan vanaf de
    // huidige stand terug openen, zonder de links opnieuw te verbergen.
    const halverwegeDicht = !!(closeTweenRef.current && closeTweenRef.current.isActive());
    openTlRef.current?.kill();
    if (closeTweenRef.current) {
      closeTweenRef.current.kill();
      closeTweenRef.current = null;
    }
    itemEntranceTweenRef.current?.kill();

    const itemEls = Array.from(panel.querySelectorAll('.sm-panel-itemLabel'));
    const numberEls = Array.from(panel.querySelectorAll('.sm-panel-list[data-numbering] .sm-panel-item'));
    const socialTitle = panel.querySelector('.sm-socials-title');
    const socialLinks = Array.from(panel.querySelectorAll('.sm-socials-link'));
    const inhoud = [...itemEls, ...numberEls, socialTitle, ...socialLinks].filter(Boolean);
    gsap.killTweensOf(inhoud);

    const tl = gsap.timeline({ paused: true });

    if (minderBeweging()) {
      // prefers-reduced-motion: geen schuif- of kantelbewegingen, alleen een
      // korte vervaging van het paneel en de inhoud.
      gsap.set([...layers, panel], { xPercent: 0 });
      if (itemEls.length) gsap.set(itemEls, { yPercent: 0, rotate: 0, opacity: 1 });
      if (numberEls.length) gsap.set(numberEls, { '--sm-num-opacity': 1 });
      if (socialTitle) gsap.set(socialTitle, { opacity: 1 });
      if (socialLinks.length) gsap.set(socialLinks, { y: 0, opacity: 1 });
      tl.fromTo([...layers, panel], { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' }, 0);
      openTlRef.current = tl;
      return tl;
    }
    gsap.set([...layers, panel], { opacity: 1 });

    if (!halverwegeDicht) {
      if (itemEls.length) gsap.set(itemEls, LINK_UIT);
      if (numberEls.length) gsap.set(numberEls, { '--sm-num-opacity': 0 });
      if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
      if (socialLinks.length) gsap.set(socialLinks, { y: 18, opacity: 0 });
    }

    // 1) gekleurde lagen, 2) paneel: vanaf de huidige stand (meestal buiten beeld)
    layers.forEach((el, i) => {
      tl.to(el, { xPercent: 0, duration: T.lagenDuur, ease: 'power4.out' }, T.lagen + i * T.lagenStagger);
    });
    tl.to(panel, { xPercent: 0, duration: T.paneelDuur, ease: 'power4.out' }, T.paneel);

    if (halverwegeDicht) {
      // inhoud stond nog; alleen zeker weten dat alles zichtbaar is
      if (itemEls.length) tl.to(itemEls, { yPercent: 0, rotate: 0, opacity: 1, duration: 0.2 }, 0);
      if (numberEls.length) tl.to(numberEls, { '--sm-num-opacity': 1, duration: 0.2 }, 0);
      if (socialTitle) tl.to(socialTitle, { opacity: 1, duration: 0.2 }, 0);
      if (socialLinks.length) tl.to(socialLinks, { y: 0, opacity: 1, duration: 0.2 }, 0);
      openTlRef.current = tl;
      return tl;
    }

    // 3) links, als één reeks (ook "Offerte aanvragen", de laatste)
    if (itemEls.length) {
      tl.to(
        itemEls,
        { yPercent: 0, rotate: 0, duration: T.linksDuur, ease: 'power3.out', stagger: { each: T.linksStagger, from: 'start' } },
        T.links
      );
      tl.to(
        itemEls,
        { opacity: 1, duration: 0.3, ease: 'power1.out', stagger: { each: T.linksStagger, from: 'start' } },
        T.links
      );
      if (numberEls.length) {
        tl.to(
          numberEls,
          { '--sm-num-opacity': 1, duration: 0.4, ease: 'power2.out', stagger: { each: T.linksStagger, from: 'start' } },
          T.nummers
        );
      }
    }

    // 4) contactgegevens als laatste detail
    if (socialTitle) {
      tl.to(socialTitle, { opacity: 1, duration: 0.3, ease: 'power2.out' }, T.contact);
    }
    if (socialLinks.length) {
      tl.to(
        socialLinks,
        {
          y: 0,
          opacity: 1,
          duration: 0.32,
          ease: 'power3.out',
          stagger: { each: 0.05, from: 'start' },
          onComplete: () => {
            gsap.set(socialLinks, { clearProps: 'opacity' });
          }
        },
        T.contact + 0.03
      );
    }

    openTlRef.current = tl;
    return tl;
  }, []);

  const playOpen = useCallback(() => {
    busyRef.current = true;
    const tl = buildOpenTimeline();
    if (tl) {
      tl.eventCallback('onComplete', () => {
        busyRef.current = false;
      });
      tl.play(0);
    } else {
      busyRef.current = false;
    }
  }, [buildOpenTimeline]);

  const playClose = useCallback(() => {
    openTlRef.current?.kill();
    openTlRef.current = null;
    itemEntranceTweenRef.current?.kill();

    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return;

    const itemEls = Array.from(panel.querySelectorAll('.sm-panel-itemLabel'));
    const numberEls = Array.from(panel.querySelectorAll('.sm-panel-list[data-numbering] .sm-panel-item'));
    const socialTitle = panel.querySelector('.sm-socials-title');
    const socialLinks = Array.from(panel.querySelectorAll('.sm-socials-link'));
    const inhoud = [...itemEls, socialTitle, ...socialLinks].filter(Boolean);

    const herstel = () => {
      if (itemEls.length) gsap.set(itemEls, LINK_UIT);
      if (numberEls.length) gsap.set(numberEls, { '--sm-num-opacity': 0 });
      if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
      if (socialLinks.length) gsap.set(socialLinks, { y: 18, opacity: 0 });
      busyRef.current = false;
    };

    closeTweenRef.current?.kill();
    const offscreen = position === 'left' ? -100 : 100;

    if (minderBeweging()) {
      closeTweenRef.current = gsap.to([...layers, panel], {
        opacity: 0,
        duration: 0.15,
        ease: 'none',
        onComplete: () => {
          gsap.set([...layers, panel], { xPercent: offscreen, opacity: 1 });
          herstel();
        }
      });
      return;
    }

    // Sluiten: inhoud vervaagt kort, dan schuift het paneel weg en volgen
    // de gekleurde lagen (omgekeerde volgorde van openen).
    const tl = gsap.timeline({ onComplete: herstel });
    gsap.killTweensOf(inhoud);
    if (inhoud.length) tl.to(inhoud, { opacity: 0, duration: T.sluitenInhoud, ease: 'power1.out' }, 0);
    if (numberEls.length) tl.to(numberEls, { '--sm-num-opacity': 0, duration: T.sluitenInhoud }, 0);
    tl.to(panel, { xPercent: offscreen, duration: T.sluitenPaneel, ease: 'power3.in' }, 0.04);
    [...layers].reverse().forEach((el, i) => {
      tl.to(el, { xPercent: offscreen, duration: T.sluitenPaneel, ease: 'power3.in' }, 0.08 + i * 0.05);
    });
    closeTweenRef.current = tl;
  }, [position]);

  const animateIcon = useCallback(opening => {
    const icon = iconRef.current;
    if (!icon) return;
    spinTweenRef.current?.kill();
    if (opening) {
      spinTweenRef.current = gsap.to(icon, { rotate: 225, duration: 0.8, ease: 'power4.out', overwrite: 'auto' });
    } else {
      spinTweenRef.current = gsap.to(icon, { rotate: 0, duration: 0.35, ease: 'power3.inOut', overwrite: 'auto' });
    }
  }, []);

  const animateColor = useCallback(
    opening => {
      const btn = toggleBtnRef.current;
      if (!btn) return;
      colorTweenRef.current?.kill();
      if (changeMenuColorOnOpen) {
        const targetColor = opening ? openMenuButtonColor : menuButtonColor;
        colorTweenRef.current = gsap.to(btn, {
          color: targetColor,
          delay: 0.18,
          duration: 0.3,
          ease: 'power2.out'
        });
      } else {
        gsap.set(btn, { color: menuButtonColor });
      }
    },
    [openMenuButtonColor, menuButtonColor, changeMenuColorOnOpen]
  );

  React.useEffect(() => {
    if (toggleBtnRef.current) {
      if (changeMenuColorOnOpen) {
        const targetColor = openRef.current ? openMenuButtonColor : menuButtonColor;
        gsap.set(toggleBtnRef.current, { color: targetColor });
      } else {
        gsap.set(toggleBtnRef.current, { color: menuButtonColor });
      }
    }
  }, [changeMenuColorOnOpen, menuButtonColor, openMenuButtonColor]);

  const animateText = useCallback(opening => {
    const inner = textInnerRef.current;
    if (!inner) return;
    textCycleAnimRef.current?.kill();

    const currentLabel = opening ? 'Menu' : 'Sluit';
    const targetLabel = opening ? 'Sluit' : 'Menu';
    const cycles = 3;
    const seq = [currentLabel];
    let last = currentLabel;
    for (let i = 0; i < cycles; i++) {
      last = last === 'Menu' ? 'Sluit' : 'Menu';
      seq.push(last);
    }
    if (last !== targetLabel) seq.push(targetLabel);
    seq.push(targetLabel);
    setTextLines(seq);

    gsap.set(inner, { yPercent: 0 });
    const lineCount = seq.length;
    const finalShift = ((lineCount - 1) / lineCount) * 100;
    textCycleAnimRef.current = gsap.to(inner, {
      yPercent: -finalShift,
      duration: 0.5 + lineCount * 0.07,
      ease: 'power4.out'
    });
  }, []);

  const toggleMenu = useCallback(() => {
    // Een (onbedoelde) dubbelklik mag de animatie niet halverwege omdraaien.
    const nu = performance.now();
    if (nu - laatsteKlikRef.current < T.dubbelklik * 1000) return;
    laatsteKlikRef.current = nu;
    const target = !openRef.current;
    openRef.current = target;
    setOpen(target);
    if (target) {
      onMenuOpen?.();
      playOpen();
    } else {
      onMenuClose?.();
      playClose();
    }
    animateIcon(target);
    animateColor(target);
    animateText(target);
  }, [playOpen, playClose, animateIcon, animateColor, animateText, onMenuOpen, onMenuClose]);

  const closeMenu = useCallback(() => {
    if (openRef.current) {
      openRef.current = false;
      setOpen(false);
      onMenuClose?.();
      playClose();
      animateIcon(false);
      animateColor(false);
      animateText(false);
    }
  }, [playClose, animateIcon, animateColor, animateText, onMenuClose]);

  React.useEffect(() => {
    if (!closeOnClickAway || !open) return;

    const handleClickOutside = event => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(event.target)
      ) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeOnClickAway, open, closeMenu]);

  return (
    <div
      className={(className ? className + ' ' : '') + 'staggered-menu-wrapper' + (isFixed ? ' fixed-wrapper' : '')}
      style={accentColor ? { ['--sm-accent']: accentColor } : undefined}
      data-position={position}
      data-open={open || undefined}
    >
      <div ref={preLayersRef} className="sm-prelayers" aria-hidden="true">
        {(() => {
          const raw = colors && colors.length ? colors.slice(0, 4) : ['#1e1e22', '#35353c'];
          let arr = [...raw];
          if (arr.length >= 3) {
            const mid = Math.floor(arr.length / 2);
            arr.splice(mid, 1);
          }
          return arr.map((c, i) => <div key={i} className="sm-prelayer" style={{ background: c }} />);
        })()}
      </div>
      <header className="staggered-menu-header" aria-label="Hoofdnavigatie">
        <a className="sm-logo" href="/" aria-label="BEBO - naar boven">
          <img
            src={logoUrl}
            alt="BEBO Betonboren & Zagen"
            className="sm-logo-img"
            draggable={false}
            width={40}
            height={40}
          />
        </a>
        <button
          ref={toggleBtnRef}
          className="sm-toggle"
          aria-label={open ? 'Menu sluiten' : 'Menu openen'}
          aria-expanded={open}
          aria-controls="staggered-menu-panel"
          onClick={toggleMenu}
          type="button"
        >
          <span ref={textWrapRef} className="sm-toggle-textWrap" aria-hidden="true">
            <span ref={textInnerRef} className="sm-toggle-textInner">
              {textLines.map((l, i) => (
                <span className="sm-toggle-line" key={i}>
                  {l}
                </span>
              ))}
            </span>
          </span>
          <span ref={iconRef} className="sm-icon" aria-hidden="true">
            <span ref={plusHRef} className="sm-icon-line" />
            <span ref={plusVRef} className="sm-icon-line sm-icon-line-v" />
          </span>
        </button>
      </header>

      <aside id="staggered-menu-panel" ref={panelRef} className="staggered-menu-panel" aria-hidden={!open}>
        <div className="sm-panel-inner">
          <ul className="sm-panel-list" role="list" data-numbering={displayItemNumbering || undefined}>
            {items && items.length ? (
              items.map((it, idx) => (
                <li className="sm-panel-itemWrap" key={it.label + idx}>
                  <a
                    className="sm-panel-item"
                    href={it.link}
                    aria-label={it.ariaLabel}
                    data-index={idx + 1}
                    onClick={closeMenu}
                  >
                    <span className="sm-panel-itemLabel">{it.label}</span>
                  </a>
                </li>
              ))
            ) : (
              <li className="sm-panel-itemWrap" aria-hidden="true">
                <span className="sm-panel-item">
                  <span className="sm-panel-itemLabel">No items</span>
                </span>
              </li>
            )}
          </ul>
          {displaySocials && socialItems && socialItems.length > 0 && (
            <div className="sm-socials" aria-label="Contact">
              <h3 className="sm-socials-title">Contact</h3>
              <ul className="sm-socials-list" role="list">
                {socialItems.map((s, i) => (
                  <li key={s.label + i} className="sm-socials-item">
                    <a href={s.link} className="sm-socials-link">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default StaggeredMenu;
