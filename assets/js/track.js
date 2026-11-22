/* Marie-Josée Grimard — suivi : couche d’événements unique, consentement (Loi 25), chargement différé des outils.
   Règles : rien ne se charge ni ne s’écrit avant le oui; sans identifiant dans tools/tracking.config.json le code reste inerte
   (aucune requête, aucune interface, aucune erreur). Aucun courriel, nom, téléphone ni message n’est jamais envoyé. */
(() => {
  'use strict';
  if (window.mjgTrack) return;
  const D = document, W = window, S = D.currentScript;
  const KEY = 'mjg-consent';
  const LANG = (D.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const base = W.MJG_TRACK || {};
  const test = DEV && W.MJG_TRACK_TEST ? W.MJG_TRACK_TEST : {};
  const cfg = {
    ph: { key: '', host: 'https://eu.i.posthog.com', ...(base.ph || {}), ...(test.ph || {}) },
    cl: { id: '', ...(base.cl || {}), ...(test.cl || {}) },
    meta: { pixel: '', capi: '', ...(base.meta || {}), ...(test.meta || {}) },
    cal: { popup: true, ...(base.cal || {}), ...(test.cal || {}) },
    v: base.v || '1', debug: !!(base.debug || test.debug || /[?&]mjgdebug\b/.test(location.search)),
  };
  // identifiants : forme vérifiée avant tout chargement (jamais d’injection dans une URL de script)
  if (!/^phc_[A-Za-z0-9]{20,80}$/.test(cfg.ph.key)) cfg.ph.key = '';
  if (!/^https:\/\/[a-z0-9-]+\.i\.posthog\.com$/.test(cfg.ph.host)) cfg.ph.host = 'https://eu.i.posthog.com';
  if (!/^[a-z0-9]{6,16}$/.test(cfg.cl.id)) cfg.cl.id = '';
  if (!/^\d{10,20}$/.test(cfg.meta.pixel)) cfg.meta.pixel = '';
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[A-Za-z0-9/_-]*)?\/capi$/.test(cfg.meta.capi)) cfg.meta.capi = '';
  const HAS_A = !!(cfg.ph.key || cfg.cl.id), HAS_M = !!cfg.meta.pixel;
  const PREVIEW = /[?&]consent=preview\b/.test(location.search); // aperçu du bandeau sans identifiant (rien n’est enregistré)

  const safe = (f) => (...a) => { try { return f(...a); } catch (e) { if (cfg.debug) console.warn('[mjg-track]', e); } };
  const $ = (s, c = D) => c.querySelector(s);
  const $$ = (s, c = D) => Array.from(c.querySelectorAll(s));
  const store = {
    get: (k, s) => { try { return (s || localStorage).getItem(k); } catch (e) { return null; } },
    set: (k, v, s) => { try { (s || localStorage).setItem(k, v); } catch (e) { /* noop */ } },
    del: (k, s) => { try { (s || localStorage).removeItem(k); } catch (e) { /* noop */ } },
  };
  const uid = () => (W.crypto && crypto.randomUUID ? crypto.randomUUID() : 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const cookie = (n) => { const m = D.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };

  /* ------------------------------------------------------------ couche d’événements */
  const dl = W.mjgDataLayer = [];
  const pending = [];          // événements avant le choix : en mémoire seulement, jamais écrits ni envoyés
  const consent = { a: false, m: false, set: false };
  const loaded = { ph: false, cl: false, meta: false };
  let phReady = false; const phQ = [];

  const pageNs = () => { const p = $('#page'); return p ? p.dataset.ns || '' : ''; };
  const slug = () => location.pathname.split('/').filter(Boolean).pop() || '';
  const dest = () => { const p = $('#page'); return (p && p.dataset.dest) || ''; };

  /* ------------------------------------------------------------ attribution (UTM, référent) */
  const UKEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const attr = { cur: {}, ref: '', first: null };
  safe(() => {
    const q = new URLSearchParams(location.search);
    UKEYS.concat(['fbclid', 'gclid']).forEach((k) => { const v = q.get(k); if (v) attr.cur[k] = v.slice(0, 255); });
    let ref = (q.get('mjg_ref') || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 80);
    if (q.has('mjg_ref')) { q.delete('mjg_ref'); const s = q.toString(); history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); }
    if (!ref && D.referrer) { try { const h = new URL(D.referrer).hostname; if (h && h !== location.hostname) ref = h; } catch (e) { /* noop */ } }
    attr.ref = ref;
    // dernier contact : repris de la session seulement si cette visite n’a rien apporté (changement de langue)
    const prev = store.get('mjg-attr', sessionStorage);
    if (prev && !Object.keys(attr.cur).length && !attr.ref) { const o = JSON.parse(prev); attr.cur = o.cur || {}; attr.ref = o.ref || ''; }
  })();
  const persistAttr = safe(() => {
    store.set('mjg-attr', JSON.stringify({ cur: attr.cur, ref: attr.ref }), sessionStorage);
    let f = null; try { f = JSON.parse(store.get('mjg-first') || 'null'); } catch (e) { f = null; }
    if (!f || Date.now() - f.t > 90 * 864e5) { f = { t: Date.now(), cur: attr.cur, ref: attr.ref }; store.set('mjg-first', JSON.stringify(f)); }
    attr.first = f;
  });
  const attrProps = () => {
    const o = { ...attr.cur }; if (attr.ref) o.referrer_host = attr.ref;
    if (attr.first && attr.first.cur) { UKEYS.slice(0, 3).forEach((k) => { if (attr.first.cur[k]) o['first_' + k] = attr.first.cur[k]; }); if (attr.first.ref) o.first_referrer_host = attr.first.ref; }
    delete o.fbclid; delete o.gclid; return o;
  };
  const touch = () => { const c = attr.cur; return { source: c.utm_source || attr.ref || (attr.first && attr.first.cur.utm_source) || 'direct', medium: c.utm_medium || (attr.ref ? 'referral' : 'none'), campaign: c.utm_campaign || '', content: c.utm_content || '', term: c.utm_term || '' }; };

  /* ------------------------------------------------------------ correspondance Meta */
  const metaFor = (ev) => {
    switch (ev.event) {
      case 'page_view': return [{ n: 'PageView' }];
      case 'project_view': return [{ n: 'ViewContent', d: { content_name: ev.project, content_ids: [ev.project], content_type: 'product', content_category: ev.destination || undefined } }];
      case 'phone_click': case 'email_click': case 'form_submit': return [{ n: 'Contact' }];
      case 'booking_completed': return [{ n: 'Schedule' }, { n: 'Lead' }];
      default: return [];
    }
  };

  /* ------------------------------------------------------------ chargeurs (après le oui seulement) */
  const loadScript = (src, attrs = {}) => { const s = D.createElement('script'); s.async = true; s.src = src; Object.keys(attrs).forEach((k) => s.setAttribute(k, attrs[k])); D.head.appendChild(s); return s; };

  const loadClarity = safe(() => {
    if (loaded.cl || !cfg.cl.id) return; loaded.cl = true;
    (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); }; t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(W, D, 'clarity', 'script', cfg.cl.id);
    W.clarity('consentv2', { ad_Storage: consent.m ? 'granted' : 'denied', analytics_Storage: 'granted' });
    W.clarity('set', 'lang', LANG);
  });

  const loadPostHog = safe(() => {
    if (loaded.ph || !cfg.ph.key) return; loaded.ph = true;
    const s = loadScript(cfg.ph.host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js', { crossorigin: 'anonymous' });
    s.onload = safe(() => {
      W.posthog.init(cfg.ph.key, {
        api_host: cfg.ph.host, person_profiles: 'always', autocapture: false, capture_pageview: false, capture_pageleave: true,
        disable_session_recording: true, disable_surveys: true, advanced_disable_feature_flags: true, enable_heatmaps: false,
        persistence: 'localStorage', respect_dnt: true, loaded: () => { phReady = true; phQ.splice(0).forEach((f) => f()); },
      });
      if (W.posthog.has_opted_out_capturing && W.posthog.has_opted_out_capturing()) W.posthog.opt_in_capturing();
    });
  });

  const loadMeta = safe(() => {
    if (loaded.meta || !cfg.meta.pixel) return; loaded.meta = true;
    (function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); })(W, D, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    W.fbq.disablePushState = true;                 // les pages virtuelles sont comptées une fois, par notre couche
    W.fbq('set', 'autoConfig', false, cfg.meta.pixel); // pas de capture automatique de boutons ni de formulaires
    W.fbq('init', cfg.meta.pixel);
  });

  const fbcValue = () => cookie('_fbc') || (attr.cur.fbclid ? 'fb.1.' + Date.now() + '.' + attr.cur.fbclid : '');
  const relayCapi = safe((name, id, data) => {
    if (!cfg.meta.capi) return;
    fetch(cfg.meta.capi, { method: 'POST', mode: 'cors', keepalive: true, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_name: name, event_id: id, url: location.href.split('#')[0].slice(0, 300), fbp: cookie('_fbp'), fbc: fbcValue(), custom_data: data || undefined, pixel_consent: true }) }).catch(() => {});
  });

  /* ------------------------------------------------------------ envoi aux outils (selon le choix) */
  const send = safe((ev) => {
    const { event, ts, ...props } = ev;
    if (consent.a) {
      if (cfg.ph.key) { const f = () => W.posthog.capture(event, props, { timestamp: new Date(ts) }); phReady ? f() : phQ.push(f); }
      if (cfg.cl.id && W.clarity) {
        W.clarity('event', event);
        if (event === 'page_view') { W.clarity('set', 'ns', props.ns || ''); if (props.project) W.clarity('set', 'project', props.project); ['utm_source', 'utm_medium', 'utm_campaign', 'referrer_host'].forEach((k) => { if (props[k]) W.clarity('set', k, props[k]); }); }
        if (/^(cta_click|booking_completed|form_submit|phone_click|email_click)$/.test(event)) W.clarity('upgrade', event);
      }
    }
    if (consent.m && cfg.meta.pixel && W.fbq) {
      metaFor(ev).forEach((m) => { const id = ev.eid ? ev.eid + (m.n === 'Lead' ? '-l' : '') : uid(); W.fbq('track', m.n, m.d || {}, { eventID: id }); relayCapi(m.n, id, m.d); });
    }
  });

  const flush = () => { pending.splice(0).forEach(send); };

  function track(name, props) {
    const ev = { event: name, ts: Date.now(), eid: uid(), path: location.pathname, lang: LANG, ns: pageNs(), ...attrProps(), ...(props || {}) };
    dl.push(ev); if (dl.length > 400) dl.shift();
    if (cfg.debug) console.debug('[mjg-track]', name, props || {});
    if (consent.a || consent.m) send(ev); else if (pending.length < 60) pending.push(ev);
    return ev;
  }
  W.mjgTrack = track;
  track.config = () => ({ analytics: HAS_A, ads: HAS_M, posthog: !!cfg.ph.key, clarity: !!cfg.cl.id, meta: !!cfg.meta.pixel, capi: !!cfg.meta.capi });
  track.consent = () => ({ ...consent });
  track.dataLayer = dl;

  /* ------------------------------------------------------------ consentement */
  const apply = safe((fromStorage) => {
    if (consent.a) { persistAttr(); loadClarity(); loadPostHog(); }
    if (consent.m) loadMeta();
    if (!consent.a && W.clarity && loaded.cl) W.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    if (!consent.a && W.posthog && loaded.ph && W.posthog.opt_out_capturing) W.posthog.opt_out_capturing();
    if (!consent.m && W.fbq && loaded.meta) W.fbq('consent', 'revoke');
    if (consent.a && W.posthog && loaded.ph && W.posthog.opt_in_capturing && !fromStorage) W.posthog.opt_in_capturing();
    if (consent.m && W.fbq && loaded.meta) W.fbq('consent', 'grant');
    if (consent.a || consent.m) flush(); else pending.length = 0;
  });
  const choose = safe((a, m) => {
    consent.a = HAS_A && !!a; consent.m = HAS_M && !!m; consent.set = true;
    if (!PREVIEW) store.set(KEY, JSON.stringify({ a: consent.a ? 1 : 0, m: consent.m ? 1 : 0, v: cfg.v, t: Date.now() }));
    if (!consent.a) { store.del('mjg-first'); store.del('mjg-attr', sessionStorage); }
    apply(false);
  });
  safe(() => {
    const gpc = !!navigator.globalPrivacyControl;
    let c = null; try { c = JSON.parse(store.get(KEY) || 'null'); } catch (e) { c = null; }
    if (c && c.v === cfg.v) { consent.a = HAS_A && c.a === 1; consent.m = HAS_M && c.m === 1; consent.set = true; }
    else if (gpc) { consent.set = true; } // signal Global Privacy Control : refus par défaut, sans bandeau (modifiable par le lien du pied de page)
    if (consent.set) apply(true);
  })();

  /* ------------------------------------------------------------ bandeau */
  const TXT = {
    fr: { t: 'Votre vie privée', d: 'Avec votre accord, nous mesurons l’usage du site (pages vues, clics, enregistrements anonymisés des écrans) pour l’améliorer, et l’efficacité de nos publicités. Rien n’est chargé avant votre choix.',
      no: 'Tout refuser', yes: 'Tout accepter', more: 'Personnaliser', save: 'Enregistrer mon choix', pol: 'Politique de confidentialité',
      a: ['Mesure d’audience et comportement', 'Pages vues, clics, défilement et enregistrements d’écran anonymisés (champs de saisie masqués).'],
      m: ['Publicité', 'Mesure de l’effet de nos publicités sur Meta (Facebook, Instagram).'] },
    en: { t: 'Your privacy', d: 'With your permission, we measure how the site is used (page views, clicks, anonymised screen recordings) to improve it, and how well our ads perform. Nothing loads before you choose.',
      no: 'Refuse all', yes: 'Accept all', more: 'Customise', save: 'Save my choice', pol: 'Privacy policy',
      a: ['Audience and behaviour measurement', 'Page views, clicks, scrolling and anonymised screen recordings (input fields masked).'],
      m: ['Advertising', 'Measures the effect of our ads on Meta (Facebook, Instagram).'] },
  }[LANG];
  let box = null, lastFocus = null;
  const privacyUrl = S && S.dataset.privacy ? new URL(S.dataset.privacy, location.href).href : '';
  const build = () => {
    const el = D.createElement('div');
    el.className = 'ck'; el.id = 'ck'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-labelledby', 'ck-t'); el.setAttribute('aria-describedby', 'ck-d'); el.hidden = true;
    const row = (id, k, on) => `<label class="ck__row"><span><b>${TXT[k][0]}</b><small>${TXT[k][1]}</small></span><input type="checkbox" role="switch" id="${id}"${on ? ' checked' : ''}><i class="ck__sw" aria-hidden="true"></i></label>`;
    const showA = HAS_A || PREVIEW, showM = HAS_M || PREVIEW;
    el.innerHTML = `<p class="ck__t" id="ck-t">${TXT.t}</p><p class="ck__d" id="ck-d">${TXT.d}</p>
<div class="ck__more" id="ck-more" hidden>${showA ? row('ck-a', 'a', consent.a) : ''}${showM ? row('ck-m', 'm', consent.m) : ''}</div>
<div class="ck__btns"><button type="button" class="ck__b" data-ck="no">${TXT.no}</button><button type="button" class="ck__b" data-ck="yes">${TXT.yes}</button><button type="button" class="ck__b" data-ck="save" hidden>${TXT.save}</button></div>
<p class="ck__links"><button type="button" class="ck__l" data-ck="more" aria-expanded="false" aria-controls="ck-more">${TXT.more}</button>${privacyUrl ? `<a class="ck__l" href="${privacyUrl}">${TXT.pol}</a>` : ''}</p>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ck]'); if (!b) return;
      const k = b.dataset.ck;
      if (k === 'more') { const m = $('#ck-more', el); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); $('[data-ck=save]', el).hidden = m.hidden; return; }
      const ca = $('#ck-a', el), cm = $('#ck-m', el);
      if (k === 'yes') choose(true, true); else if (k === 'no') choose(false, false); else choose(ca && ca.checked, cm && cm.checked);
      hide();
    });
    D.body.appendChild(el); return el;
  };
  const show = (focus) => {
    if (!box) box = build();
    const ca = $('#ck-a', box), cm = $('#ck-m', box); if (ca) ca.checked = consent.a; if (cm) cm.checked = consent.m;
    box.hidden = false; requestAnimationFrame(() => box.classList.add('is-in'));
    if (focus) { lastFocus = D.activeElement; const m = $('#ck-more', box); m.hidden = false; $('[data-ck=more]', box).setAttribute('aria-expanded', 'true'); $('[data-ck=save]', box).hidden = false; $('[data-ck=no]', box).focus(); }
  };
  const hide = () => { if (!box) return; box.classList.remove('is-in'); setTimeout(() => { box.hidden = true; }, 350); if (lastFocus && lastFocus.focus) { lastFocus.focus(); lastFocus = null; } };
  const maybeShow = safe(() => {
    if (!(HAS_A || HAS_M || PREVIEW) || (consent.set && !PREVIEW)) return;
    const seen = D.documentElement.classList.contains('seen');
    setTimeout(() => show(false), seen ? 700 : 2600); // après le chargeur d’ouverture
  });
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', maybeShow); else maybeShow();

  /* ------------------------------------------------------------ état d’une page */
  const pg = { depth: new Set(), moments: new Set(), once: new Set(), timers: [], io: null, raf: 0, t0: 0 };
  const once = (k) => (pg.once.has(k) ? false : (pg.once.add(k), true));
  const maxDepth = () => { const h = D.documentElement.scrollHeight - innerHeight; return h > 0 ? Math.min(100, Math.round(((W.scrollY || D.documentElement.scrollTop) / h) * 100)) : 100; };
  const onScroll = () => {
    if (pg.raf) return; pg.raf = requestAnimationFrame(() => {
      pg.raf = 0; const d = maxDepth();
      [25, 50, 75, 90].forEach((m) => { if (d >= m && !pg.depth.has(m)) { pg.depth.add(m); track('scroll_depth', { pct: m }); } });
    });
  };
  const pageView = safe((detail) => {
    pg.timers.forEach(clearInterval); pg.timers = []; if (pg.io) pg.io.disconnect();
    pg.depth.clear(); pg.moments.clear(); pg.once.clear(); pg.t0 = Date.now();
    const ns = pageNs();
    track('page_view', { title: D.title, project: ns === 'project' ? slug() : undefined, destination: dest() || undefined, entry: detail && detail.entry ? 'swap' : 'load' });
    if (ns === 'project') track('project_view', { project: slug(), destination: dest() });
    if (ns === 'notfound') track('page_not_found', { missing: location.pathname });
    pg.io = new IntersectionObserver((es) => es.forEach((e) => { const m = e.target.getAttribute('data-wcw-moment'); if (e.isIntersecting && !pg.moments.has(m)) { pg.moments.add(m); track('section_view', { moment: m }); } }), { threshold: 0.4 });
    $$('[data-wcw-moment]').forEach((el) => pg.io.observe(el));
    let sec = 0; pg.timers.push(setInterval(() => { if (D.visibilityState !== 'visible') return; sec++; if (sec === 15) track('engaged_15s'); if (sec === 60) track('engaged_60s'); }, 1000));
  });
  let first = false;
  D.addEventListener('mjg:page', (e) => { first = true; pageView(e.detail); });
  W.addEventListener('scroll', onScroll, { passive: true });
  // repli : si le moteur du site ne signale aucune page (script bloqué), la première page est comptée quand même
  setTimeout(() => { if (!first) { first = true; pageView({}); } }, 4200);

  /* ------------------------------------------------------------ Calendly : fenêtre de réservation + fin de réservation */
  let calP = null;
  const loadCal = () => calP || (calP = new Promise((res, rej) => {
    const l = D.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://calendly.com/assets/external/widget.css'; D.head.appendChild(l);
    const s = loadScript('https://calendly.com/assets/external/widget.js'); s.onload = () => (W.Calendly ? res() : rej()); s.onerror = rej; setTimeout(rej, 4000);
  }));
  const calUrl = (a, placement) => {
    const u = new URL(a.dataset.calBase || a.href); a.dataset.calBase = u.href;
    const t = touch(), p = u.searchParams;
    p.set('utm_source', t.source); p.set('utm_medium', t.medium);
    if (t.campaign) p.set('utm_campaign', t.campaign);
    p.set('utm_content', (t.content || 'cta') + '|' + placement + (pageNs() === 'project' ? ':' + slug() : ''));
    if (t.term) p.set('utm_term', t.term);
    return u.href;
  };
  W.addEventListener('message', (e) => {
    if (e.origin !== 'https://calendly.com' || !e.data || typeof e.data.event !== 'string' || e.data.event.indexOf('calendly.') !== 0) return;
    const m = { 'calendly.event_type_viewed': 'booking_viewed', 'calendly.profile_page_viewed': 'booking_viewed', 'calendly.date_and_time_selected': 'booking_slot_selected', 'calendly.event_scheduled': 'booking_completed' }[e.data.event];
    if (m && (m !== 'booking_viewed' || once('bv'))) track(m, { placement: lastPlacement });
  });

  /* ------------------------------------------------------------ clics, formulaires, vidéos, interactions */
  let lastPlacement = '';
  const PLACES = [['#nav', 'nav'], ['#sheet', 'menu'], ['#stickybar', 'sticky'], ['.ctaband', 'cta_band'], ['.pbox', 'project_panel'], ['.cbook', 'contact_page'], ['#foot', 'footer'], ['.hero', 'hero'], ['.vert', 'vertical'], ['.film', 'film'], ['.gl', 'globe'], ['.fo', 'featured'], ['.card, .lrow', 'catalogue'], ['.pnext', 'next_project'], ['main', 'content']];
  const place = (el) => { for (const [s, n] of PLACES) if (el.closest(s)) return n; return 'page'; };
  const label = (el) => (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const tick = (f) => setTimeout(safe(f), 0);

  const onLink = (a, e) => {
    const href = a.getAttribute('href') || '', pl = place(a);
    if (/^tel:/i.test(href)) return track('phone_click', { placement: pl });
    if (/^mailto:/i.test(href)) return track('email_click', { placement: pl, context: pageNs() === 'project' ? slug() : '' });
    let u; try { u = new URL(a.href, location.href); } catch (er) { return; }
    if (/(^|\.)calendly\.com$/.test(u.hostname)) {
      lastPlacement = pl; track('cta_click', { cta: 'book_call', placement: pl, label: label(a) });
      const url = calUrl(a, pl); a.href = url;
      if (cfg.cal.popup && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
        e.preventDefault();
        loadCal().then(() => { W.Calendly.initPopupWidget({ url }); const o = $('.calendly-overlay'); if (o) o.setAttribute('data-lenis-prevent', ''); }).catch(() => location.assign(url));
      }
      return;
    }
    if (a.hasAttribute('data-lang') || a.classList.contains('sheet__lang')) {
      const sp = new URLSearchParams(); UKEYS.forEach((k) => { if (attr.cur[k]) sp.set(k, attr.cur[k]); }); if (attr.ref) sp.set('mjg_ref', attr.ref);
      const l = new URL(a.href); sp.forEach((v, k) => l.searchParams.set(k, v)); a.href = l.href; // l’attribution survit au rechargement de la langue
      return track('language_switch', { to: a.getAttribute('hreflang') || '' });
    }
    if (u.origin !== location.origin) {
      if (/instagram\.com|facebook\.com/.test(u.hostname)) return track('social_click', { network: u.hostname.replace(/^www\./, '').split('.')[0], placement: pl });
      return track('outbound_click', { host: u.hostname, placement: pl });
    }
    const m = u.pathname.match(/\/(?:projets|projects)\/([^/]+)\/?$/);
    if (m) return track('project_click', { project: m[1], placement: pl });
    if (/\/destinations\/[^/]+\/?$/.test(u.pathname)) return track('destination_click', { destination: u.pathname.split('/').filter(Boolean).pop(), placement: pl });
  };

  D.addEventListener('click', safe((e) => {
    const t = e.target; if (!t || !t.closest) return;
    const a = t.closest('a[href]'); if (a) onLink(a, e);
    const o = t.closest('[data-consent-open]'); if (o) { e.preventDefault(); show(true); return; }
    let el;
    if ((el = t.closest('.chip'))) tick(() => { const n = $$('#grid .card').filter((c) => !c.classList.contains('is-hidden')).length; track('filter_change', { filter: el.dataset.f, value: el.dataset.v || 'all', results: n }); if (!n || ($('#none') && !$('#none').hidden)) track('filter_no_results', { filter: el.dataset.f, value: el.dataset.v || 'all' }); });
    else if (t.closest('#freset, #few-reset')) track('filter_reset');
    else if (t.closest('#fopen')) track('filter_panel_open');
    else if ((el = t.closest('.vt__b'))) track('view_toggle', { view: el.dataset.view });
    else if ((el = t.closest('.card__cmp'))) tick(() => { const c = el.closest('.card'); track('compare_toggle', { project: c ? c.dataset.wcwId : '', selected: el.getAttribute('aria-pressed') === 'true', count: $$('#cmp-slots span').length }); });
    else if (t.closest('#cmp-go')) track('compare_open', { count: $$('#cmp-slots span').length });
    else if (t.closest('#cmp-clear')) track('compare_clear');
    else if ((el = t.closest('[data-lb]'))) track('gallery_open', { project: slug(), index: +el.dataset.lb });
    else if (t.closest('#lb-n')) track('gallery_nav', { dir: 'next' });
    else if (t.closest('#lb-p')) track('gallery_nav', { dir: 'prev' });
    else if ((el = t.closest('[data-film-open]'))) track('film_open', { film: (el.dataset.src || '').split('/').pop().replace(/\.\w+$/, ''), placement: place(el) });
    else if (t.closest('#tourbtn')) tick(() => track('tour_toggle', { on: $('#tourbtn').getAttribute('aria-pressed') === 'true' }));
    else if ((el = t.closest('.nav__burger'))) track('menu_toggle');
  }), true);
  D.addEventListener('auxclick', safe((e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a && e.button === 1) onLink(a, e); }), true);

  D.addEventListener('change', safe((e) => { if (e.target.id === 'fsort') track('sort_change', { sort: e.target.value }); }), true);

  const forms = new WeakSet();
  D.addEventListener('focusin', safe((e) => { const f = e.target.closest && e.target.closest('form[data-mailform]'); if (f && !forms.has(f)) { forms.add(f); track('form_start', { form: f.id === 'cform' ? 'contact' : 'newsletter' }); } }), true);
  D.addEventListener('submit', safe((e) => {
    const f = e.target; if (!f.matches || !f.matches('form[data-mailform]')) return;
    const fd = new FormData(f);
    track('form_submit', { form: f.id === 'cform' ? 'contact' : 'newsletter', destination: String(fd.get('dest') || ''), has_message: !!String(fd.get('msg') || '').trim(), method: 'mailto' }); // jamais le contenu des champs
  }), true);

  const vids = new WeakMap();
  const vname = (v) => ((v.currentSrc || v.src || v.dataset.src || '').split('/').pop().split('?')[0].replace(/\.\w+$/, '')) || 'video';
  D.addEventListener('play', safe((e) => {
    const v = e.target; if (!v || v.tagName !== 'VIDEO' || (v.muted && v.loop && !v.controls)) return; // les fonds animés ne comptent pas
    if (!vids.has(v)) vids.set(v, new Set());
    track('video_play', { video: vname(v), placement: place(v) });
  }), true);
  D.addEventListener('timeupdate', safe((e) => {
    const v = e.target; const seen = vids.get(v); if (!seen || !v.duration) return;
    const p = (v.currentTime / v.duration) * 100;
    [25, 50, 75].forEach((m) => { if (p >= m && !seen.has(m)) { seen.add(m); track('video_progress', { video: vname(v), pct: m }); } });
  }), true);
  D.addEventListener('ended', safe((e) => { const v = e.target; if (v && v.tagName === 'VIDEO' && vids.has(v)) track('video_complete', { video: vname(v) }); }), true);

  const hov = new Set();
  D.addEventListener('pointerover', safe((e) => {
    const l = e.target.closest && e.target.closest('.gl__lab[data-k]');
    if (l && !hov.has('g' + l.dataset.k + location.pathname)) { hov.add('g' + l.dataset.k + location.pathname); track('globe_hover', { destination: l.dataset.k }); }
    const d = e.target.closest && e.target.closest('.dp[data-k]');
    if (d && !hov.has('d' + d.dataset.k + location.pathname)) { hov.add('d' + d.dataset.k + location.pathname); track('destination_preview', { destination: d.dataset.k }); }
  }), true);
  D.addEventListener('pointerdown', safe((e) => { if (e.target.closest && e.target.closest('.gl__c') && once('gdrag')) track('globe_interact', { how: 'drag' }); }), true);

  let errs = 0;
  W.addEventListener('error', safe((e) => { if (errs++ < 3) track('js_error', { message: String(e.message || '').slice(0, 120), file: String(e.filename || '').split('/').pop().slice(0, 40) }); }));

  if (cfg.debug) W.mjgTrackDebug = { cfg, consent, pending, loaded, attr };
})();
