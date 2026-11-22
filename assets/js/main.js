/* Marie-Josée Grimard — moteur du site.
   GSAP + ScrollTrigger + Lenis (une seule boucle : gsap.ticker). Transitions de page par échange de #page.
   transform / opacity / clip-path seulement ; mouvement réduit respecté ; replis sans WebGL. */
(() => {
  'use strict';
  const SCRIPT = document.currentScript;
  const ABS_ROOT = new URL(SCRIPT.dataset.root || './', location.href).href;
  const LANG = SCRIPT.dataset.lang || document.documentElement.lang || 'fr';
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const DEBUG = /[?&]debug\b/.test(location.search);
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const wide = () => innerWidth > 800;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const FR = LANG === 'fr';

  if (!window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.config({ nullTargetWarn: false });
  root.classList.add(REDUCE ? 'no-motion' : 'is-motion');
  if (FINE && !REDUCE) root.classList.add('has-cursor');

  /* ----------------------------------------------------------- défilement (Lenis) */
  let lenis = null;
  if (!REDUCE && FINE && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollTo = (target, opts = {}) => {
    if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4), ...opts });
    else if (typeof target === 'number') scrollTo_native(target);
    else (target.scrollIntoView ? target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' }) : 0);
  };
  const scrollTo_native = (y) => window.scrollTo({ top: y, behavior: REDUCE ? 'auto' : 'smooth' });
  const lockScroll = (on) => { if (lenis) (on ? lenis.stop() : lenis.start()); document.body.style.overflow = on ? 'hidden' : ''; };

  /* ----------------------------------------------------------- état global de page */
  let pageMM = null;           // gsap.matchMedia de la page courante
  let cleanups = [];
  let busy = false;
  const onCleanup = (fn) => cleanups.push(fn);
  const listen = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); onCleanup(() => t.removeEventListener(ev, fn, o)); };

  /* ----------------------------------------------------------- utilitaires de texte */
  function splitWords(el) {
    if (el.classList.contains('is-split')) return [];
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const o = document.createElement('span'); o.className = 'sw';
            const i = document.createElement('span'); i.textContent = p; o.appendChild(i); frag.appendChild(o); words.push(i);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    el.classList.add('is-split');
    return words;
  }

  function initSplits(scope) {
    $$('[data-split]', scope).forEach((el) => {
      if (REDUCE) { el.classList.add('is-split'); return; }
      const w = splitWords(el);
      if (!w.length) return;
      gsap.set(w, { yPercent: 112 });
      ScrollTrigger.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: () => gsap.to(w, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.055 }),
      });
    });
    $$('[data-reveal]', scope).forEach((el) => {
      if (REDUCE) return;
      ScrollTrigger.create({
        trigger: el, start: 'top 92%', once: true,
        onEnter: () => { el.classList.add('is-in'); gsap.fromTo(el, { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', clearProps: 'transform' }); },
      });
    });
  }

  /* ----------------------------------------------------------- horloges locales */
  function initClocks(scope) {
    const els = $$('.clk[data-tz] b', scope);
    if (!els.length) return;
    const fmt = {};
    const tick = () => els.forEach((b) => {
      const tz = b.parentElement.dataset.tz;
      fmt[tz] = fmt[tz] || new Intl.DateTimeFormat(FR ? 'fr-CA' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
      b.textContent = fmt[tz].format(new Date()).replace(/ | /g, '');
    });
    tick();
    const id = setInterval(tick, 15000);
    onCleanup(() => clearInterval(id));
  }

  /* ----------------------------------------------------------- compteurs */
  function initCounters(scope) {
    $$('[data-count]', scope).forEach((el) => {
      const n = +el.dataset.count;
      if (REDUCE) { el.textContent = n; return; }
      const o = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: () => gsap.to(o, { v: n, duration: 1.1, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); }, onComplete: () => { el.textContent = n; } }),
      });
    });
  }

  /* ----------------------------------------------------------- globe 3D des routes */
  let globeInst = null;
  let railHold = 0;
  function initGlobe(scope) {
    const gEl = $('.gl[data-globe]', scope);
    if (!gEl) return;
    const fail = () => gEl.parentElement.classList.add('no-globe');
    if (REDUCE) { fail(); return; }
    const col = {};
    $$('.gl__lab[data-k]', gEl).forEach((l) => { col[l.dataset.k] = getComputedStyle(l).getPropertyValue('--dest').trim(); });
    const boot = () => import(ABS_ROOT + 'assets/js/globe.js')
      .then((m) => m.createGlobe({ el: gEl, root: ABS_ROOT, gsap, reduce: REDUCE, colors: col }))
      .then((g) => {
        if (!g) { fail(); return; }
        globeInst = g; document.documentElement.classList.add('has-globe');
        const on = $('.dp.is-on', scope);
        g.setActive((on && on.dataset.k) || gEl.dataset.active || 'dr');
        onCleanup(() => { g.destroy(); globeInst = null; document.documentElement.classList.remove('has-globe'); });
      })
      .catch(fail);
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); boot(); } }, { rootMargin: '600px' });
    io.observe(gEl.parentElement); onCleanup(() => io.disconnect());
  }

  /* ----------------------------------------------------------- boutons magnétiques, inclinaison des cartes */
  function initMicro(scope) {
    if (!FINE || REDUCE) return;
    $$('[data-magnetic]', scope).forEach((b) => {
      const xt = gsap.quickTo(b, 'x', { duration: 0.6, ease: 'power3' }), yt = gsap.quickTo(b, 'y', { duration: 0.6, ease: 'power3' });
      const mv = (e) => { const r = b.getBoundingClientRect(); xt((e.clientX - r.left - r.width / 2) * 0.22); yt((e.clientY - r.top - r.height / 2) * 0.3); };
      const lv = () => { xt(0); yt(0); };
      listen(b, 'pointermove', mv); listen(b, 'pointerleave', lv);
    });
    $$('.card', scope).forEach((c) => {
      const mv = (e) => {
        const r = c.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = `perspective(1000px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-6px)`;
      };
      const lv = () => { c.style.transform = ''; };
      listen(c, 'pointermove', mv); listen(c, 'pointerleave', lv);
    });
  }

  /* ----------------------------------------------------------- curseur */
  const cursor = $('#cursor');
  if (cursor && FINE && !REDUCE && innerWidth >= 1000) {
    const cx = gsap.quickTo(cursor, 'x', { duration: 0.28, ease: 'power3' }), cy = gsap.quickTo(cursor, 'y', { duration: 0.28, ease: 'power3' });
    const label = $('#cursor-label');
    window.addEventListener('pointermove', (e) => { cx(e.clientX); cy(e.clientY); }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const c = e.target.closest && e.target.closest('[data-cursor]');
      const l = e.target.closest && e.target.closest('a,button,[role=button],input,select,textarea,label');
      if (c) { label.textContent = c.dataset.cursor; cursor.classList.add('is-label'); } else cursor.classList.remove('is-label');
      cursor.classList.toggle('is-link', !!l && !c);
    });
  }

  /* ----------------------------------------------------------- navigation : masquage, feuille mobile, repère */
  const nav = $('#nav'), burger = $('#burger'), sheet = $('#sheet');
  let sheetOpen = false;
  function setSheet(open) {
    if (!sheet || sheetOpen === open) return;
    sheetOpen = open;
    burger.setAttribute('aria-expanded', open);
    sheet.setAttribute('aria-hidden', !open);
    lockScroll(open);
    if (open) {
      sheet.style.visibility = 'visible';
      gsap.to(sheet, { clipPath: `circle(150% at calc(100% - 38px) 38px)`, duration: REDUCE ? 0 : 0.9, ease: 'power3.inOut' });
      gsap.fromTo('.sheet__a, .sheet__foot > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: REDUCE ? 0 : 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.25 });
    } else {
      gsap.to(sheet, { clipPath: 'circle(0% at calc(100% - 38px) 38px)', duration: REDUCE ? 0 : 0.7, ease: 'power3.inOut', onComplete: () => { sheet.style.visibility = 'hidden'; } });
    }
  }
  if (burger) burger.addEventListener('click', () => setSheet(!sheetOpen));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) setSheet(false); });

  // masquer la capsule en descendant, la montrer en remontant
  let lastY = 0;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      if (nav) nav.classList.toggle('is-hidden', y > 600 && self.direction === 1 && !sheetOpen);
      lastY = y;
      const bar = $('#rail-b'), num = $('#rail-n'), ru = $('.rail-ui');
      if (ru) ru.style.opacity = y > innerHeight * 0.8 && self.progress < 0.975 ? 1 : 0;
      if (bar) bar.style.transform = `scaleY(${self.progress.toFixed(4)})`;
      if (num) num.textContent = String(Math.round(self.progress * 100)).padStart(2, '0');
    },
  });

  // fil d’Ariane latéral : libellé de la section visible
  function initRailLabel(scope) {
    const lab = $('#rail-t');
    if (!lab) return;
    const secs = $$('main > section', scope);
    secs.forEach((s) => {
      const e = $('.eyebrow', s);
      ScrollTrigger.create({
        trigger: s, start: 'top 55%', end: 'bottom 55%',
        onToggle: (self) => { if (self.isActive) lab.textContent = e ? e.textContent.slice(0, 28) : ''; },
      });
    });
  }

  // barre collante mobile : masquée quand le pied de page offre déjà l’appel à l’action
  const sticky = $('#stickybar');
  function initSticky() {
    if (!sticky) return;
    const target = $('.ctaband') || $('#foot');
    ScrollTrigger.create({ start: () => innerHeight * 0.9, end: 'max', onUpdate: (self) => sticky.classList.toggle('is-gone', self.direction === 1), onLeaveBack: () => sticky.classList.add('is-gone') });
    sticky.classList.remove('is-hidden');
    sticky.classList.add('is-gone');
    if (!target) return;
    ScrollTrigger.create({
      trigger: target, start: 'top 85%', end: 'bottom bottom',
      onToggle: (self) => sticky.classList.toggle('is-hidden', self.isActive && wide() === false),
    });
  }

  /* ----------------------------------------------------------- vidéos (chargement paresseux, lecture visible) */
  function initVideos(scope) {
    const vids = $$('video[data-src]:not(.hero__video)', scope);
    if (!vids.length) return;
    const play = (v) => {
      if (REDUCE) return;
      if (!v.src) { v.src = srcFor(v); v.load(); }
      v.play().then(() => v.classList.add('is-playing')).catch(() => {});
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { if (v.hasAttribute('data-autoplay')) play(v); else if (!v.src) { v.src = srcFor(v); v.preload = 'metadata'; } }
      else if (!v.paused && v.hasAttribute('data-autoplay')) { v.pause(); }
    }), { rootMargin: '200px', threshold: 0.2 });
    vids.forEach((v) => io.observe(v));
    onCleanup(() => io.disconnect());
  }

  function openFilm(src) {
    const wrap = document.createElement('div');
    wrap.className = 'lightbox'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<button class="lightbox__x" type="button" aria-label="${FR ? 'Fermer' : 'Close'}"><svg class="i" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button><figure class="lightbox__f"><video controls autoplay playsinline style="max-width:min(94vw,1600px);max-height:84svh;border-radius:12px;background:#000" src="${src}"></video></figure>`;
    document.body.appendChild(wrap); lockScroll(true);
    const v = $('video', wrap), x = $('button', wrap);
    const close = () => { v.pause(); wrap.remove(); lockScroll(false); window.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    x.addEventListener('click', close); wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    window.addEventListener('keydown', key); x.focus();
  }

  /* ----------------------------------------------------------- formulaires mailto */
  function initForms(scope) {
    $$('[data-mailform]', scope).forEach((f) => {
      listen(f, 'submit', (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        let body = f.dataset.body || '';
        if (f.hasAttribute('data-compose')) {
          const lines = [];
          if (fd.get('name')) lines.push((FR ? 'Nom : ' : 'Name: ') + fd.get('name'));
          if (fd.get('email')) lines.push((FR ? 'Courriel : ' : 'Email: ') + fd.get('email'));
          if (fd.get('dest')) lines.push((FR ? 'Destination : ' : 'Destination: ') + fd.get('dest'));
          body = lines.join('\n') + '\n\n' + (fd.get('msg') || '');
        } else if (fd.get('email')) {
          body += '\n\n' + (FR ? 'Mon courriel : ' : 'My email: ') + fd.get('email');
        }
        location.href = `mailto:${f.dataset.to}?subject=${encodeURIComponent(f.dataset.subject || '')}&body=${encodeURIComponent(body)}`;
      });
    });
    const p = new URLSearchParams(location.search).get('p');
    const msg = $('#cmsg');
    if (p && msg && !msg.value) msg.value = FR ? `Bonjour Marie-Josée, j’aimerais en savoir plus sur le projet ${p}.` : `Hello Marie-Josée, I would like to know more about the ${p} project.`;
  }

  /* ----------------------------------------------------------- révélation des titres en caractères (héros) */
  function revealHeroChars(scope, delay = 0) {
    const chars = $$('.hero__name .ch > span, .dhero__t .ch > span, .phero__t .ch > span, .abhero .ch > span', scope);
    const rest = $$('.hero__kicker, .hero__foot, .hero__clocks, .tourbtn, .dhero__k, .dhero__lead, .dhero__foot, .phero__k, .phero__tag, .phero__back', scope);
    if (REDUCE) { gsap.set(chars, { yPercent: 0, y: 0 }); gsap.set(rest, { opacity: 1 }); return; }
    const tl = gsap.timeline({ delay });
    tl.fromTo(chars, { yPercent: 106, y: 0 }, { yPercent: 0, y: 0, duration: 1.5, ease: 'expo.out', stagger: { each: 0.038, from: 'start' } }, 0);
    tl.fromTo(rest, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.09, clearProps: 'transform' }, 0.35);
    const media = $('.hero__media, .dhero__media, .phero__media', scope);
    if (media) tl.fromTo(media, { scale: 1.14 }, { scale: 1, duration: 2.4, ease: 'expo.out' }, 0);
    return tl;
  }

  /* ============================================================ ACCUEIL */
  let stage = null;
  const srcFor = (v) => (v.dataset.webm && v.canPlayType('video/webm; codecs="vp9"') ? v.dataset.webm : v.dataset.src);
  const SAVE = !!(navigator.connection && navigator.connection.saveData);
  function pageHome(scope, mm, entry) {
    const hero = $('#hero');
    const film = hero.dataset.mode === 'film';
    const imgs = $$('.hero__img', hero), labels = $$('.hero__slide', hero), prog = $('.hero__prog b', hero);
    const video = $('.hero__video', hero);
    let cur = 0, timer = null, kickoff = null;
    const setLabel = (i) => {
      if (i === cur) return;
      cur = i;
      labels.forEach((l, k) => l.classList.toggle('is-on', k === cur));
      hero.style.setProperty('--dest', getComputedStyle(labels[cur]).getPropertyValue('--dest'));
    };

    // WebGL après le LCP
    function startGL() {
      if (stage || !hero.isConnected || REDUCE) return;
      import(ABS_ROOT + 'assets/js/stage.js')
        .then((m) => m.createStage({ canvas: $('#stage', hero), hero, imgs: film ? [] : imgs, video: film ? video : null, root: ABS_ROOT, debug: DEBUG }))
        .then((s) => { if (!s) return; stage = s; if (!film) s.go(cur, true); onCleanup(() => { s.destroy(); stage = null; }); })
        .catch(() => {});
    }

    if (film) {
      // film d'ouverture : trois destinations en 16 s (0-6,1 · 6,1-10,1 · 10,1-fin), boucle sans couture
      const cuts = [0, 6.1 / 16.17, 10.1 / 16.17];
      const tickFilm = () => {
        if (!video.duration) return;
        const f = video.currentTime / video.duration;
        setLabel(f >= cuts[2] ? 2 : f >= cuts[1] ? 1 : 0);
        prog.style.transform = `scaleX(${f.toFixed(4)})`;
      };
      gsap.ticker.add(tickFilm); onCleanup(() => gsap.ticker.remove(tickFilm));
      kickoff = () => {
        if (REDUCE || SAVE || !hero.isConnected) return;
        video.src = srcFor(video); video.load();
        video.addEventListener('canplay', () => {
          video.play().then(() => {
            video.classList.add('is-playing'); hero.classList.add('film-on');
            if (!stage) startGL();
          }).catch(() => {});
        }, { once: true });
      };
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (!video.src) return;
        if (e.isIntersecting) video.play().catch(() => {}); else video.pause();
      }), { threshold: 0.05 });
      io.observe(hero); onCleanup(() => io.disconnect());
    } else {
      const DUR = 6.5;
      const setSlide = (i, fromUser) => {
        if (i === cur && !fromUser) return;
        cur = (i + imgs.length) % imgs.length;
        imgs.forEach((im, k) => im.classList.toggle('is-on', k === cur));
        labels.forEach((l, k) => l.classList.toggle('is-on', k === cur));
        hero.style.setProperty('--dest', getComputedStyle(labels[cur]).getPropertyValue('--dest'));
        if (stage) stage.go(cur);
        runProg();
      };
      const runProg = () => {
        if (REDUCE) return;
        gsap.killTweensOf(prog); gsap.set(prog, { scaleX: 0 });
        timer && timer.kill();
        timer = gsap.to(prog, { scaleX: 1, duration: DUR, ease: 'none', onComplete: () => setSlide(cur + 1) });
      };
      labels.forEach((l, k) => l.addEventListener('click', (e) => { if (!l.classList.contains('is-on')) { e.preventDefault(); e.stopPropagation(); setSlide(k, true); } }));
      onCleanup(() => timer && timer.kill());
      kickoff = () => startGL();
    }
    const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(kickoff, { timeout: 2500 }) : setTimeout(kickoff, 1200));
    if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true });

    // parallaxe de sortie du héros
    mm.add('(min-width: 1px)', () => {
      gsap.to('.hero__name', { yPercent: -22, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.hero__media', { yPercent: 14, scale: 1.06, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.hero__foot, .hero__kicker, .hero__clocks, .tourbtn', { opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: '30% top', end: '75% top', scrub: true } });
      ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', onUpdate: (s) => stage && stage.setScroll(s.progress) });
    });

    // manifeste : mots allumés au défilement + vignettes en ligne
    const words = $$('.manifesto__text .w', scope);
    if (REDUCE) words.forEach((w) => w.classList.add('is-lit'));
    else {
      gsap.to(words, { color: '#0F1613', ease: 'none', stagger: 0.12, scrollTrigger: { trigger: '.manifesto__text', start: 'top 80%', end: 'bottom 52%', scrub: 0.4 } });
      $$('.mi', scope).forEach((mi) => ScrollTrigger.create({
        trigger: mi, start: 'top 82%', once: true,
        onEnter: () => { mi.classList.add('is-in'); gsap.to(mi, { scale: 1, opacity: 1, duration: 1.3, ease: 'expo.out' }); },
      }));
    }

    // destinations : triptyque (épinglé au poste de travail, empilé sur mobile)
    const panels = $$('.dp', scope), pin = $('#dests-pin'), arcs = $$('.rm__arc', scope);
    const setPanel = (i) => {
      panels.forEach((p, k) => {
        const on = k === i; p.classList.toggle('is-on', on);
        const v = $('video', p); if (v) { if (on && !REDUCE) { if (!v.src) { v.src = srcFor(v); v.load(); } v.play().then(() => v.classList.add('is-playing')).catch(() => {}); } else v.pause(); }
      });
      arcs.forEach((a) => a.classList.toggle('is-on', a.dataset.k === panels[i].dataset.k));
      const stg = document.getElementById('dests-stage'); if (stg) stg.dataset.on = i;
      if (globeInst) globeInst.setActive(panels[i].dataset.k);
    };
    setPanel(0);
    mm.add('(min-width: 801px) and (prefers-reduced-motion: no-preference)', () => {
      let idx = 0;
      const st = ScrollTrigger.create({
        trigger: pin, start: 'top top', end: '+=210%', pin: true, anticipatePin: 1, scrub: false,
        onUpdate: (s) => { const i = clamp(Math.floor(s.progress * 3), 0, 2); if (i !== idx) { idx = i; setPanel(i); } },
      });
      panels.forEach((p, k) => { const h = () => { idx = k; setPanel(k); }; p.addEventListener('mouseenter', h); p.addEventListener('focus', h); });
      return () => st.kill();
    });
    mm.add('(max-width: 800px)', () => {
      panels.forEach((p, k) => ScrollTrigger.create({ trigger: p, start: 'top 60%', end: 'bottom 40%', onToggle: (s) => { if (s.isActive) setPanel(k); } }));
    });
    // tracé des routes
    $$('.rm__arc', scope).forEach((a) => {
      const len = a.getTotalLength ? a.getTotalLength() : 0;
      if (!len || REDUCE) return;
      gsap.set(a, { strokeDasharray: `${len}`, strokeDashoffset: len });
      ScrollTrigger.create({ trigger: a, start: 'top 90%', once: true, onEnter: () => gsap.to(a, { strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut', onComplete: () => { a.style.strokeDasharray = '3 9'; a.style.strokeDashoffset = 0; } }) });
    });

    // vedette : défilement horizontal épinglé
    const track = $('#feat-track'), fpin = $('#feat-pin');
    mm.add('(min-width: 801px) and (prefers-reduced-motion: no-preference)', () => {
      // défilement horizontal collé en CSS (sticky) : aucun passage en position fixe, donc aucun décalage de mise en page
      const sec = fpin.parentElement;
      const dist = () => Math.max(0, track.scrollWidth - innerWidth + 0);
      const size = () => { sec.style.height = (innerHeight + dist()) + 'px'; };
      sec.classList.add('feat--sticky'); size();
      const tw = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.7, invalidateOnRefresh: true, onRefreshInit: size } });
      onCleanup(() => { sec.classList.remove('feat--sticky'); sec.style.height = ''; });
      $$('.fs__pic', track).forEach((pic) => gsap.fromTo(pic, { xPercent: -5 }, { xPercent: 5, ease: 'none', scrollTrigger: { trigger: pic.parentElement, containerAnimation: tw, start: 'left right', end: 'right left', scrub: true } }));
    });
    mm.add('(max-width: 800px)', () => {
      $$('.fs__pic', track).forEach((pic) => gsap.fromTo(pic, { xPercent: -5 }, { xPercent: 5, ease: 'none', scrollTrigger: { trigger: pic.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }));
    });

    // film vertical : le téléphone se lève
    const phone = $('.vert__phone', scope);
    if (phone && !REDUCE) {
      gsap.fromTo(phone, { y: 140, rotate: 7, opacity: 0 }, { y: 0, rotate: 0, opacity: 1, duration: 1.7, ease: 'expo.out', scrollTrigger: { trigger: phone, start: 'top 88%', once: true } });
      gsap.to(phone, { yPercent: -7, ease: 'none', scrollTrigger: { trigger: phone, start: 'top bottom', end: 'bottom top', scrub: true } });
      if (FINE) {
        gsap.set(phone, { transformPerspective: 900 });
        const ry = gsap.quickTo(phone, 'rotationY', { duration: 0.9, ease: 'power3' }), rx = gsap.quickTo(phone, 'rotationX', { duration: 0.9, ease: 'power3' });
        const sec = phone.closest('.vert') || phone.parentElement;
        listen(sec, 'pointermove', (e) => { const r = phone.getBoundingClientRect(); ry(clamp(((e.clientX - (r.left + r.width / 2)) / innerWidth) * -70, -26, 26)); rx(clamp(((e.clientY - (r.top + r.height / 2)) / innerHeight) * 40, -18, 18)); });
        listen(sec, 'pointerleave', () => { ry(0); rx(0); });
      }
    }
    $$('[data-film-open]', scope).forEach((b) => b.addEventListener('click', () => b.dataset.src && openFilm(b.dataset.src)));

    // rail : glisser
    initRail(scope);

    // mosaïque + parallaxes
    initParallax(scope);

    // visite guidée
    initTour(scope);

    // couleur de destination dans l’en-tête de page
    return entry;
  }

  /* ----------------------------------------------------------- rail glissant */
  function initRail(scope) {
    const track = $('#rail-track', scope), bar = $('#rail-prog', scope);
    if (!track) return;
    const upd = () => { const m = track.scrollWidth - track.clientWidth; if (bar) bar.style.transform = `scaleX(${clamp(m ? track.scrollLeft / m : 1, 0.06, 1).toFixed(3)})`; };
    listen(track, 'scroll', upd, { passive: true }); upd();
    if (!FINE) return;
    let down = false, sx = 0, sl = 0, moved = 0;
    listen(track, 'pointerdown', (e) => { if (e.button !== 0) return; down = true; sx = e.clientX; sl = track.scrollLeft; moved = 0; track.style.scrollSnapType = 'none'; });
    listen(window, 'pointermove', (e) => { if (!down) return; const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx)); track.scrollLeft = sl - dx; });
    listen(window, 'pointerup', () => { if (!down) return; down = false; track.style.scrollSnapType = ''; });
    listen(track, 'click', (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    listen(track, 'wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.stopPropagation(); } }, { passive: true });
  }

  /* ----------------------------------------------------------- parallaxes génériques */
  function initParallax(scope) {
    if (REDUCE) return;
    $$('.mo, .gs, .gi', scope).forEach((el) => {
      const sp = +el.dataset.speed || 1;
      const f = $('.mo__f, .gs__f, .gi__f', el);
      if (f && !f.closest('.gi')) {
        gsap.to(f, { clipPath: 'inset(0 0 0% 0 round 16px)', duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 118%', once: true } });
        const im = $('img', f);
        gsap.fromTo(im, { yPercent: -9, scale: 1.18 }, { yPercent: 9, scale: 1.18, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      } else if (f) {
        gsap.from(f, { clipPath: 'inset(0 0 100% 0 round 16px)', duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 118%', once: true } });
      }
      if (wide()) gsap.fromTo(el, { y: (sp - 1) * 90 }, { y: -(sp - 1) * 90, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    $$('.about__fig .arch, .abhero__fig .arch', scope).forEach((a) => gsap.fromTo($('img', a), { yPercent: -4, scale: 1.12 }, { yPercent: 4, scale: 1.12, ease: 'none', scrollTrigger: { trigger: a, start: 'top bottom', end: 'bottom top', scrub: true } }));
    $$('.card, .rep, .ab, .oh, .fo, .fact', scope).forEach((c) => {
      if (c.closest('.feat__track') || c.closest('.rail__track')) return;
      gsap.from(c, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: c, start: 'top 92%', once: true } });
    });
    $$('.rail__track .card', scope).forEach((c, i) => gsap.from(c, { x: 80, opacity: 0, duration: 1.2, delay: i * 0.05, ease: 'expo.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: '#rail-track', start: 'top 90%', once: true } }));
    $$('.amen li, .loc__l li', scope).forEach((li, i) => gsap.from(li, { opacity: 0, y: 26, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: li, start: 'top 94%', once: true } }));
    $$('#feat, #rail, .grid--cat', scope).forEach((sec) => ScrollTrigger.create({ trigger: sec, start: 'top 60%', end: 'bottom 40%', onToggle: (self) => { railHold += self.isActive ? 1 : -1; const ru = $('.rail-ui'); if (ru) ru.classList.toggle('is-off', railHold > 0); } }));
    $$('.foot__name', scope).forEach((n) => gsap.fromTo(n, { yPercent: 16 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '#foot', start: 'top bottom', end: 'bottom bottom', scrub: true } }));
    $$('.dhero__media, .phero__media', scope).forEach((m) => gsap.to(m, { yPercent: 10, ease: 'none', scrollTrigger: { trigger: m.parentElement, start: 'top top', end: 'bottom top', scrub: true } }));
    $$('.dhero__t, .phero__t', scope).forEach((m) => gsap.to(m, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: m.parentElement, start: 'top top', end: 'bottom top', scrub: true } }));
  }

  /* ----------------------------------------------------------- visite guidée */
  function initTour(scope) {
    const btn = $('#tourbtn');
    if (!btn || !wide() || REDUCE) return;
    const secs = $$('[data-tour]', scope);
    let on = false, i = 0, timer = null;
    const stop = () => { on = false; btn.setAttribute('aria-pressed', 'false'); $('span', btn).textContent = btn.dataset.labelStart; clearTimeout(timer); };
    const step = () => {
      if (!on) return;
      i = Math.min(i + 1, secs.length - 1);
      const s = secs[i];
      const y = s.id === 'dests' || s.id === 'feat' ? s.getBoundingClientRect().top + scrollY : s.getBoundingClientRect().top + scrollY;
      scrollTo(y, { duration: 2.6 });
      const dwell = s.id === 'dests' ? 9500 : s.id === 'feat' ? 11000 : 6200;
      if (s.id === 'dests' || s.id === 'feat') {
        // laisser le défilement épinglé avancer lentement
        const span = s.id === 'dests' ? innerHeight * 2.1 : Math.max(0, $('#feat-track').scrollWidth - innerWidth);
        setTimeout(() => on && scrollTo(y + span, { duration: dwell / 1000 - 1, easing: (t) => t }), 2800);
      }
      timer = setTimeout(() => { if (i >= secs.length - 1) stop(); else step(); }, dwell + (s.id === 'dests' || s.id === 'feat' ? 400 : 0));
    };
    btn.addEventListener('click', () => {
      if (on) { stop(); return; }
      on = true; i = 0; btn.setAttribute('aria-pressed', 'true'); $('span', btn).textContent = btn.dataset.labelStop;
      scrollTo(0, { duration: 1 }); timer = setTimeout(step, 1600);
    });
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => listen(window, ev, (e) => { if (on && (ev !== 'keydown' || ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Escape', 'Home', 'End'].includes(e.key))) stop(); }, { passive: true }));
    onCleanup(stop);
  }

  /* ============================================================ CATALOGUE */
  function pageProjects(scope) {
    const grid = $('#grid'), list = $('#list'), cards = $$('.card', grid), rows = $$('.lrow', list);
    const data = JSON.parse($('#proj-data').textContent);
    const none = $('#none'), count = $('#fcount'), res = $('#results');
    const st = { dest: '', city: '', type: '', status: '', sort: 'order', view: 'grid' };
    const CITY_DEST = { 'punta-cana': 'dr', 'cap-cana': 'dr', tulum: 'mx', carvoeiro: 'pt' };
    const qd = new URLSearchParams(location.search).get('dest'); if (qd) st.dest = qd;
    const sel = new Set();

    const visible = (el) => ['dest', 'city', 'type', 'status'].every((k) => !st[k] || el.dataset[k] === st[k]);
    function apply(animate = true) {
      const target = st.view === 'grid' ? cards : rows;
      const first = new Map();
      if (animate && !REDUCE) target.forEach((el) => { if (!el.classList.contains('is-hidden')) first.set(el, el.getBoundingClientRect()); });
      let n = 0;
      [...cards, ...rows].forEach((el) => { const v = visible(el); el.classList.toggle('is-hidden', !v); if (v && cards.includes(el)) n++; });
      const key = st.sort === 'name' ? (e) => e.dataset.name : (e) => +e.dataset.order;
      [[grid, cards], [list, rows]].forEach(([parent, els]) => {
        els.slice().sort((a, b) => (key(a) > key(b) ? 1 : -1)).forEach((el, k) => { el.style.order = k; parent.style.display = ''; });
        parent.style.display = '';
      });
      // l’ordre visuel : CSS order via flex/grid
      grid.style.display = '';
      cards.forEach((el) => el.style.order = el.style.order);
      list.style.display = st.view === 'list' ? 'flex' : ''; list.style.flexDirection = 'column';
      count.textContent = (n === 1 ? data.n.one : data.n.many.replace('{n}', n));
      none.hidden = n !== 0;
      const few = document.getElementById('few'); if (few) few.hidden = !(n > 0 && n <= 3);
      if (animate && !REDUCE) {
        let k = 0;
        target.forEach((el) => {
          if (el.classList.contains('is-hidden')) return;
          const f = first.get(el);
          if (f) {
            const l = el.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
            if (Math.abs(dx) + Math.abs(dy) > 1) gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.9, ease: 'expo.out', clearProps: 'transform' });
          } else gsap.fromTo(el, { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, delay: (k++) * 0.04, ease: 'expo.out', clearProps: 'transform,opacity' });
        });
      }
      ScrollTrigger.refresh();
    }
    // chips
    $$('.chip', scope).forEach((c) => c.addEventListener('click', () => {
      const k = c.dataset.f, v = c.dataset.v;
      st[k] = v;
      if (k === 'dest' && v) { if (st.city && CITY_DEST[st.city] !== v) st.city = ''; }
      $$('.chip', scope).filter((x) => x.dataset.f === k).forEach((x) => x.classList.toggle('is-on', x === c));
      syncChips(); apply();
    }));
    function syncChips() {
      $$('.chip[data-f=city]', scope).forEach((c) => {
        const ok = !c.dataset.v || !st.dest || CITY_DEST[c.dataset.v] === st.dest;
        c.style.display = ok ? '' : 'none';
        c.classList.toggle('is-on', c.dataset.v === st.city);
      });
      $$('.chip[data-f=dest]', scope).forEach((c) => c.classList.toggle('is-on', c.dataset.v === st.dest));
    }
    syncChips();
    const fr2 = document.getElementById('few-reset'); if (fr2) fr2.addEventListener('click', () => document.getElementById('freset').click());
    $('#freset').addEventListener('click', () => { Object.assign(st, { dest: '', city: '', type: '', status: '' }); $$('.chip', scope).forEach((c) => c.classList.toggle('is-on', !c.dataset.v)); syncChips(); apply(); });
    $('#fsort').addEventListener('change', (e) => { st.sort = e.target.value; apply(); });
    $$('.vt__b', scope).forEach((b) => b.addEventListener('click', () => {
      st.view = b.dataset.view; res.dataset.view = st.view;
      $$('.vt__b', scope).forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b); });
      apply(false);
      if (!REDUCE) gsap.fromTo(st.view === 'grid' ? grid : list, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' });
    }));
    // panneau mobile
    const panel = $('#fpanel'), open = $('#fopen');
    const setPanel = (o) => { panel.classList.toggle('is-open', o); open.setAttribute('aria-expanded', o); };
    open.addEventListener('click', () => setPanel(!panel.classList.contains('is-open')));
    $('#fapply').addEventListener('click', () => { setPanel(false); scrollTo($('#results'), { offset: -140 }); });

    // aperçu qui suit le curseur (vue liste)
    const peek = $('#peek'), pimg = $('img', peek);
    if (FINE && !REDUCE) {
      const px = gsap.quickTo(peek, 'x', { duration: 0.5, ease: 'power3' }), py = gsap.quickTo(peek, 'y', { duration: 0.5, ease: 'power3' });
      listen(list, 'pointermove', (e) => { px(e.clientX + 28); py(e.clientY - peek.offsetHeight / 2); });
      rows.forEach((r) => {
        r.addEventListener('pointerenter', () => { pimg.src = r.dataset.img; gsap.to(peek, { opacity: 1, scale: 1, duration: 0.5, ease: 'expo.out' }); });
        r.addEventListener('pointerleave', () => gsap.to(peek, { opacity: 0, scale: 0.85, duration: 0.4 }));
      });
    }

    // comparateur
    const bar = $('#cmp'), slots = $('#cmp-slots'), go = $('#cmp-go'), gt = $('#cmp-go-t');
    const modal = $('#cmpmodal'), tbl = $('#cmpmodal-tbl');
    function syncCmp() {
      cards.forEach((c) => { const b = $('.card__cmp', c); b.setAttribute('aria-pressed', sel.has(c.dataset.wcwId)); });
      bar.hidden = sel.size === 0;
      slots.innerHTML = [...sel].map((id) => `<span style="background-image:url('${data.p[id].img}')" title="${data.p[id].name}"></span>`).join('');
      go.disabled = sel.size < 2; gt.textContent = data.n.cmp.replace('{n}', sel.size);
      const hint = document.getElementById('cmp-hint'); if (hint) hint.textContent = sel.size >= 3 ? data.n.three : sel.size === 2 ? data.n.two : data.n.hint;
      if (!bar.hidden && !REDUCE) gsap.fromTo(bar, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', overwrite: true });
    }
    cards.forEach((c) => $('.card__cmp', c).addEventListener('click', (e) => {
      e.preventDefault(); const id = c.dataset.wcwId;
      if (sel.has(id)) sel.delete(id); else if (sel.size < 3) sel.add(id); else if (!REDUCE) gsap.fromTo(bar, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1,.3)' });
      syncCmp();
    }));
    $('#cmp-clear').addEventListener('click', () => { sel.clear(); syncCmp(); });
    let lastFocus = null;
    const closeModal = () => { modal.hidden = true; lockScroll(false); lastFocus && lastFocus.focus(); };
    go.addEventListener('click', () => {
      const ids = [...sel]; lastFocus = document.activeElement;
      const row = (label, f, cls = '') => `<div class="ctbl__r ${cls}" style="--n:${ids.length}"><b>${label}</b>${ids.map((id) => `<span>${f(data.p[id])}</span>`).join('')}</div>`;
      tbl.innerHTML = `<div class="ctbl">${row('', (p) => `<img src="${p.img}" alt="">${p.name}`, 'ctbl__h')}${row(data.rows.place, (p) => `${p.place}`)}${row(data.rows.type, (p) => p.type)}${row(data.rows.beds, (p) => p.beds)}${row(data.rows.status, (p) => p.status)}${row(data.rows.price, (p) => p.price)}${row(data.rows.amen, (p) => p.amen.slice(0, 8).join(' · '))}</div>`;
      modal.hidden = false; lockScroll(true);
      if (!REDUCE) gsap.fromTo('.cmpmodal__in', { y: 60, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out' });
      $('#cmpmodal-x').focus();
    });
    $('#cmpmodal-x').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    listen(window, 'keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
    onCleanup(() => lockScroll(false));
    apply(false);
  }

  /* ============================================================ FICHE PROJET */
  function pageProject(scope) {
    const items = JSON.parse($('#lb-data').textContent);
    const lb = $('#lightbox'), img = $('#lb-img'), cap = $('#lb-cap'), cnt = $('#lb-c');
    let i = 0, last = null;
    const show = (n, dir = 0) => {
      i = (n + items.length) % items.length;
      const it = items[i];
      if (!REDUCE) gsap.fromTo(img, { opacity: 0, x: dir * 60, scale: 0.98 }, { opacity: 1, x: 0, scale: 1, duration: 0.7, ease: 'expo.out' });
      img.src = it.s; img.alt = it.a; cap.textContent = it.a; cnt.textContent = `${String(i + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    };
    const open = (n) => { last = document.activeElement; lb.hidden = false; lockScroll(true); show(n); $('#lb-x').focus(); if (!REDUCE) gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.5 }); };
    const close = () => { lb.hidden = true; lockScroll(false); last && last.focus(); };
    $$('[data-lb]', scope).forEach((b) => b.addEventListener('click', () => open(+b.dataset.lb)));
    $('#lb-x').addEventListener('click', close);
    $('#lb-p').addEventListener('click', () => show(i - 1, -1));
    $('#lb-n').addEventListener('click', () => show(i + 1, 1));
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lightbox__f')) close(); });
    listen(window, 'keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(i + 1, 1); else if (e.key === 'ArrowLeft') show(i - 1, -1);
      else if (e.key === 'Tab') { const f = $$('button', lb); const a = document.activeElement; if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); } }
    });
    let sx = null;
    lb.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    lb.addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 60) show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); });
    onCleanup(() => lockScroll(false));
  }

  /* ============================================================ INIT D’UNE PAGE */
  function initPage(entry) {
    const page = $('#page');
    const ns = page.dataset.ns;
    cleanups.forEach((f) => { try { f(); } catch (e) { /* noop */ } }); cleanups = [];
    pageMM && pageMM.revert();
    pageMM = gsap.matchMedia();
    root.dataset.ns = ns;
    if (nav) nav.dataset.here = labelFor(ns, page.dataset.title);
    if (page.dataset.other) {
      const oh = new URL(page.dataset.other, location.href).href;
      $$('.nav__lang, .sheet__lang').forEach((a) => a.setAttribute('href', oh));
    }
    $$('[data-nav]').forEach((a) => { const cur = { dest: 'dests', project: 'projects' }[ns] || ns; if (a.dataset.nav === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    initSplits(page);
    initCounters(page);
    initClocks(page);
    initMicro(page);
    initForms(page);
    initVideos(page);
    if (ns !== 'home') initParallax(page);
    initRailLabel(page);
    initSticky();
    initGlobe(page);
    const delay = entry ? 0.1 : 0;
    if (ns === 'home') { pageHome(page, pageMM, entry); }
    else if (ns === 'projects') pageProjects(page);
    else if (ns === 'project') pageProject(page);
    // scrollto internes
    $$('[data-scrollto]', page).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const t = $(a.getAttribute('href')); t && scrollTo(t); }));
    revealHeroChars(page, entry ? delay : 0);
    requestAnimationFrame(() => ScrollTrigger.refresh());
    listen(window, 'resize', () => { clearTimeout(initPage._t); initPage._t = setTimeout(() => ScrollTrigger.refresh(), 250); });
  }
  function labelFor(ns, title) { const t = (title || '').split(' — ')[0]; return ns === 'home' ? 'Marie-Josée Grimard' : t; }

  /* ============================================================ TRANSITIONS DE PAGE */
  const curtain = $('#curtain'), blades = $$('#curtain i'), cLabel = $('#curtain-label');
  function curtainIn(label) {
    return new Promise((res) => {
      if (REDUCE) return res();
      curtain.style.visibility = 'visible'; cLabel.textContent = label || '';
      const tl = gsap.timeline({ onComplete: res });
      tl.fromTo(blades, { yPercent: 101 }, { yPercent: 0, duration: 0.72, ease: 'power4.inOut', stagger: 0.055 }, 0);
      tl.fromTo(cLabel, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 0.5);
    });
  }
  function curtainOut() {
    return new Promise((res) => {
      if (REDUCE) return res();
      const tl = gsap.timeline({ onComplete: () => { curtain.style.visibility = 'hidden'; gsap.set(blades, { yPercent: 101 }); res(); } });
      tl.to(cLabel, { opacity: 0, y: -24, duration: 0.45, ease: 'power2.in' }, 0);
      tl.to(blades, { yPercent: -101, duration: 0.72, ease: 'power4.inOut', stagger: 0.055 }, 0.15);
    });
  }
  async function go(url, label, push = true) {
    if (busy) return; busy = true;
    try {
      const fetched = fetch(url, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
      if (sheetOpen) setSheet(false);
      await curtainIn(label);
      const html = await fetched;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const next = doc.getElementById('page');
      if (!next) { location.href = url; return; }
      if (push) history.pushState({}, '', url);
      // détruire l’ancienne page
      cleanups.forEach((f) => { try { f(); } catch (e) { /* noop */ } }); cleanups = [];
      pageMM && pageMM.revert(); ScrollTrigger.getAll().forEach((s) => s.kill());
      document.title = doc.title;
      const old = $('#page');
      old.replaceWith(document.adoptNode(next));
      document.body.dataset.dest = next.dataset.dest || ''; if (!next.dataset.dest) delete document.body.dataset.dest;
      window.scrollTo(0, 0); lenis && lenis.scrollTo(0, { immediate: true, force: true });
      if (nav) nav.classList.remove('is-hidden');
      // ScrollTrigger global de navigation (recréé car tué)
      bindGlobalTriggers();
      initPage(true);
      await curtainOut();
    } catch (e) {
      location.href = url;
    } finally { busy = false; }
  }
  function bindGlobalTriggers() {
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: (self) => {
        const y = self.scroll();
        if (nav) nav.classList.toggle('is-hidden', y > 600 && self.direction === 1 && !sheetOpen);
        const bar = $('#rail-b'), num = $('#rail-n'), ru = $('.rail-ui');
        if (ru) ru.style.opacity = y > innerHeight * 0.8 && self.progress < 0.975 ? 1 : 0;
        if (bar) bar.style.transform = `scaleY(${self.progress.toFixed(4)})`;
        if (num) num.textContent = String(Math.round(self.progress * 100)).padStart(2, '0');
      },
    });
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-lang') || a.classList.contains('sheet__lang')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(mailto:|tel:)/.test(href)) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || /\.(pdf|mp4|jpg|webp|zip)$/i.test(u.pathname)) return;
    if (u.pathname === location.pathname && u.search === location.search) { e.preventDefault(); return; }
    e.preventDefault();
    const lab = a.querySelector('.card__name, .dp__name, .drow__t, .oh b, .pnext__t, .fo__b b, .sheet__t') || a;
    go(u.href, (lab.textContent || '').trim().slice(0, 40));
  });
  window.addEventListener('popstate', () => go(location.href, '', false));

  /* ============================================================ DÉMARRAGE (chargeur à la première visite) */
  function boot() {
    // absolutiser les liens de la coquille persistante (la page change de profondeur sans rechargement)
    $$('#nav a, #sheet a, #stickybar').forEach((a) => { const h = a.getAttribute('href'); if (h && !h.startsWith('#') && !/^(mailto:|tel:|https?:)/.test(h)) a.setAttribute('href', a.href); });
    const seen = root.classList.contains('seen');
    const loader = $('#loader');
    const start = () => { initPage(false); };
    if (REDUCE || seen || !loader) { start(); return; }
    const num = $('#loader-num'), bar = $('.loader__bar');
    const o = { v: 0 };
    // préparer l’état initial du héros pendant le chargeur
    initPageLater();
    gsap.to(o, { v: 100, duration: 0.9, ease: 'power2.inOut', onUpdate: () => { num.textContent = String(Math.round(o.v)).padStart(3, '0'); bar.style.transform = `scaleX(${o.v / 100})`; } });
    gsap.to(loader, { yPercent: -100, duration: 0.95, ease: 'power4.inOut', delay: 1.0, onComplete: () => { loader.style.display = 'none'; gate(); } });
    try { sessionStorage.setItem('mjg-seen', '1'); } catch (e) { /* noop */ }
    function initPageLater() { /* initialisation après le chargeur pour que le héros se révèle sous les yeux */ }
    function gate() { /* noop */ }
    // l’initialisation se fait quand le chargeur monte
    gsap.delayedCall(1.65, start);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
