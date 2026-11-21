/* Scène WebGL du héros : les rendus officiels des trois destinations, fondus par un balayage bruité,
   avec une onde d’eau qui suit le pointeur et un zoom lié au défilement.
   Chargée après le LCP. Une seule boucle (gsap.ticker). Aucun objet 3D inventé : les images sont les rendus réels. */
export async function createStage({ canvas, hero, imgs, video, root, debug }) {
  let THREE;
  try { THREE = await import(root + 'vendor/three.module.min.js'); } catch (e) { return null; }
  const gsap = window.gsap;
  const loseListeners = [];

  // images décodées
  await Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
  if (imgs.some((im) => !im.naturalWidth)) return null;
  if (video && !(video.readyState >= 2 && video.videoWidth)) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  const dpr = () => Math.min(window.devicePixelRatio || 1, innerWidth < 800 ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr());
  renderer.setClearColor(0x0b1210, 1);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(); // inutilisé (plan plein cadre) mais requis par render()
  // copie exacte sur un canvas : la taille de la texture ne dépend plus du rendu de l'élément <img>
  const sizes = [];
  const srcs = video ? [video] : imgs;
  const tex = srcs.map((im) => {
    if (video) {
      sizes.push(new THREE.Vector2(video.videoWidth, video.videoHeight));
      const vt = new THREE.VideoTexture(video);
      vt.minFilter = THREE.LinearFilter; vt.magFilter = THREE.LinearFilter; vt.generateMipmaps = false;
      return vt;
    }
    const k = Math.min(1, 2048 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    sizes.push(new THREE.Vector2(c.width, c.height));
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  });
  const size = (i) => sizes[i];

  const uniforms = {
    uA: { value: tex[0] }, uB: { value: tex[0] },
    uSA: { value: size(0) }, uSB: { value: size(0) },
    uP: { value: 0 }, uT: { value: 0 }, uZoom: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uRip: { value: 0 }, uDir: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uA, uB; uniform vec2 uSA, uSB, uRes, uMouse;
      uniform float uP, uT, uZoom, uRip, uDir;
      vec2 cover(vec2 uv, vec2 img){
        float ra = uRes.x / uRes.y, ri = img.x / img.y;
        vec2 s = ra > ri ? vec2(1.0, ri / ra) : vec2(ra / ri, 1.0);
        return (uv - 0.5) * s + 0.5;
      }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
      void main(){
        vec2 uv = vUv;
        // onde d'eau autour du pointeur
        vec2 d = uv - uMouse; d.x *= uRes.x / uRes.y;
        float r = length(d);
        float wave = sin(r * 42.0 - uT * 3.4) * exp(-r * 5.2) * uRip;
        uv += normalize(d + 1e-4) * wave * 0.014;
        // miroitement lent
        uv += vec2(sin(uv.y * 20.0 + uT * 0.9), cos(uv.x * 17.0 + uT * 0.8)) * 0.0014;
        // zoom lié au défilement
        uv = (uv - 0.5) / uZoom + 0.5;
        // balayage bruité en diagonale
        float nz = fbm(uv * 3.2 + uT * 0.02);
        float g = (uDir > 0.0 ? uv.x : 1.0 - uv.x) * 0.52 + (1.0 - uv.y) * 0.16 + nz * 0.32;
        float rev = smoothstep(0.0, 1.0, clamp((uP * 1.55 - g) / 0.5, 0.0, 1.0));
        float edge = rev * (1.0 - rev) * 4.0;
        vec2 off = vec2(0.045 * uDir, 0.0) * edge;
        vec2 ua = cover(uv + off * (1.0 - rev), uSA), ub = cover(uv - off * rev, uSB);
        vec3 a = texture2D(uA, ua).rgb, b = texture2D(uB, ub).rgb;
        // fente chromatique légère sur l'arête
        float ca = 0.004 * edge;
        a.r = texture2D(uA, cover(uv + off * (1.0 - rev) + vec2(ca, 0.0), uSA)).r;
        b.b = texture2D(uB, cover(uv - off * rev - vec2(ca, 0.0), uSB)).b;
        vec3 col = mix(a, b, rev);
        // vignettage doux
        float v = smoothstep(1.15, 0.35, length((vUv - 0.5) * vec2(1.0, 0.9)));
        col *= mix(0.88, 1.0, v);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);

  const fit = () => {
    const r = hero.getBoundingClientRect();
    const w = Math.max(1, Math.round(hero.clientWidth)), h = Math.max(1, Math.round(hero.clientHeight));
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w, h);
  };
  fit();
  const ro = new ResizeObserver(fit); ro.observe(hero);

  // pointeur
  const target = { x: 0.5, y: 0.5 }, cur = { x: 0.5, y: 0.5 };
  let lastMove = 0, speed = 0, visible = true, destroyed = false, lost = false, cdir = 1;
  const onMove = (e) => {
    const r = hero.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width, ny = 1 - (e.clientY - r.top) / r.height;
    speed = Math.min(1, Math.hypot(nx - target.x, ny - target.y) * 14);
    target.x = nx; target.y = ny; lastMove = performance.now();
  };
  hero.addEventListener('pointermove', onMove, { passive: true });

  // gouttes ambiantes (sans pointeur : mobile, clavier)
  const drip = () => {
    if (destroyed || !visible) return;
    if (performance.now() - lastMove < 2500) return;
    target.x = 0.2 + Math.random() * 0.6; target.y = 0.25 + Math.random() * 0.5;
    cur.x = target.x; cur.y = target.y;
    gsap.fromTo(uniforms.uRip, { value: 1.0 }, { value: 0, duration: 3.2, ease: 'power2.out' });
  };
  const dripId = setInterval(drip, 4200);

  // visibilité : rendu suspendu hors écran
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 });
  io.observe(hero);

  let frames = 0;
  const tick = (time) => {
    if (destroyed || lost) return;
    if (!visible || document.hidden) return;
    uniforms.uT.value = time;
    cur.x += (target.x - cur.x) * 0.14; cur.y += (target.y - cur.y) * 0.14;
    uniforms.uMouse.value.set(cur.x, cur.y);
    const idle = performance.now() - lastMove > 200;
    speed *= 0.93;
    if (!idle) uniforms.uRip.value = Math.max(uniforms.uRip.value, Math.min(0.9, 0.25 + speed));
    else if (!gsap.isTweening(uniforms.uRip)) uniforms.uRip.value *= 0.96;
    renderer.render(scene, cam);
    frames++;
    if (debug) {
      const i = renderer.info;
      window.__stage = { drawCalls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, hoverState: idle ? 'idle' : 'moving', frames };
    }
  };
  gsap.ticker.add(tick);

  // perte de contexte
  const onLost = (e) => { e.preventDefault(); lost = true; hero.classList.remove('has-gl'); };
  const onRestored = () => { lost = false; tex.forEach((t) => { t.needsUpdate = true; }); hero.classList.add('has-gl'); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  loseListeners.push(['webglcontextlost', onLost], ['webglcontextrestored', onRestored]);

  let current = 0, tween = null;
  const api = {
    go(i, immediate) {
      if (video && !immediate) return;
      if (i === current && !immediate) return;
      if (tween) { tween.progress(1); }
      cdir = i > current || (current === imgs.length - 1 && i === 0) ? 1 : -1;
      uniforms.uDir.value = cdir;
      if (immediate) {
        uniforms.uA.value = tex[i]; uniforms.uB.value = tex[i]; uniforms.uSA.value = size(i); uniforms.uSB.value = size(i); uniforms.uP.value = 0; current = i;
        hero.classList.add('has-gl'); return;
      }
      uniforms.uB.value = tex[i]; uniforms.uSB.value = size(i);
      tween = gsap.fromTo(uniforms.uP, { value: 0 }, {
        value: 1, duration: 1.9, ease: 'power2.inOut',
        onComplete: () => { uniforms.uA.value = tex[i]; uniforms.uSA.value = size(i); uniforms.uP.value = 0; current = i; tween = null; },
      });
      current = i;
    },
    setScroll(p) { uniforms.uZoom.value = 1 + p * 0.14; },
    destroy() {
      destroyed = true; gsap.ticker.remove(tick); clearInterval(dripId); io.disconnect(); ro.disconnect();
      hero.removeEventListener('pointermove', onMove);
      loseListeners.forEach(([n, f]) => canvas.removeEventListener(n, f));
      tex.forEach((t) => t.dispose()); mat.dispose(); quad.geometry.dispose(); renderer.dispose();
      hero.classList.remove('has-gl');
    },
  };
  hero.classList.add('has-gl');
  return api;
}
