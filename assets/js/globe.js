/* Globe de routes : Montréal vers les trois destinations.
   Terre en points (contours simplifiés dessinés à la main, aucun fichier externe), arcs de grand cercle,
   glisser pour tourner, étiquettes cliquables. Une seule boucle (gsap.ticker). Repli : la carte SVG. */
const LAND = [
  // Amérique du Nord et centrale
  [[-168, 66], [-156, 71], [-125, 70], [-95, 72], [-80, 68], [-62, 60], [-56, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-83, 29], [-90, 30], [-97, 27], [-97.5, 22], [-96, 19], [-94, 18.5], [-91, 18.5], [-90.5, 21.3], [-87, 21.6], [-87.4, 18], [-88.5, 16], [-86, 15.8], [-83.5, 15], [-83.5, 11], [-81.5, 8.8], [-79, 9.3], [-78, 8], [-82, 7.5], [-86, 11], [-91, 14], [-96, 16], [-105, 20], [-110, 24], [-115, 30], [-118, 34], [-124, 40], [-125, 48], [-135, 58], [-150, 61], [-165, 60]],
  // Groenland
  [[-73, 78], [-60, 82], [-30, 83], [-20, 75], [-22, 70], [-42, 60], [-50, 64], [-56, 70]],
  // Amérique du Sud
  [[-78, 8], [-72, 12], [-62, 10], [-52, 5], [-50, 0], [-35, -5], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-65, -42], [-68, -52], [-72, -52], [-74, -45], [-72, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-77, 4]],
  // Caraïbes : Cuba, Hispaniola, Porto Rico, Jamaïque
  [[-85, 22], [-80, 23], [-74, 20], [-78, 20], [-82, 22]],
  [[-74.4, 19.8], [-68.4, 19.9], [-68.4, 18.4], [-71.5, 17.8], [-74.4, 18.3]],
  [[-67.2, 18.5], [-65.6, 18.4], [-65.6, 18], [-67.2, 18]],
  [[-78.3, 18.4], [-76.2, 18.2], [-76.8, 17.8], [-78.2, 18]],
  // Europe et Asie occidentale
  [[-9.5, 43.5], [-2, 47], [-4.5, 48.5], [2, 51], [8, 54], [12, 55], [20, 55], [24, 60], [30, 70], [70, 70], [70, 45], [40, 42], [28, 41], [26, 38], [22, 37], [18, 40], [16, 38], [12, 42], [8, 44], [3, 43], [0, 39], [-1, 37], [-5.5, 36], [-9, 37]],
  // Îles britanniques, Islande, Scandinavie
  [[-5, 50], [1.5, 51], [-2, 55], [-5, 58], [-6, 55]],
  [[-24, 65], [-14, 66], [-14, 64], [-22, 63.4]],
  [[5, 58], [11, 59], [18, 63], [24, 66], [20, 70], [10, 64]],
  // Afrique
  [[-17, 21], [-10, 30], [-6, 36], [10, 37], [32, 31], [34, 28], [43, 12], [51, 12], [40, -15], [35, -25], [20, -35], [12, -17], [9, 4], [-8, 4], [-17, 14]],
];
const PLACES = { mtl: [45.5, -73.6], dr: [18.6, -68.4], mx: [20.2, -87.5], pt: [37.1, -8.5] };
const RAD = Math.PI / 180;

function inside(lon, lat, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export async function createGlobe({ el, root, gsap, colors, reduce }) {
  let THREE;
  try { THREE = await import(root + 'vendor/three.module.min.js'); } catch (e) { return null; }
  const canvas = el.querySelector('.gl__c');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' }); } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setClearColor(0x000000, 0);
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr());

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 4.1);
  const globe = new THREE.Group();
  scene.add(globe);
  const pos = (lat, lon, r = 1) => new THREE.Vector3(r * Math.cos(lat * RAD) * Math.sin(lon * RAD), r * Math.sin(lat * RAD), r * Math.cos(lat * RAD) * Math.cos(lon * RAD));

  // océan : dégradé doux avec bord lumineux
  const ocean = new THREE.Mesh(new THREE.SphereGeometry(0.992, 64, 48), new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float f = pow(1.0 - clamp(vN.z,0.0,1.0), 1.6); vec3 c = mix(vec3(0.957,0.976,0.972), vec3(0.78,0.88,0.87), f); gl_FragColor = vec4(c,1.0); }',
  }));
  globe.add(ocean);

  // graticule
  const gv = [];
  for (let lon = -180; lon < 180; lon += 15) for (let lat = -80; lat < 80; lat += 4) { gv.push(...pos(lat, lon, 0.996).toArray(), ...pos(lat + 4, lon, 0.996).toArray()); }
  for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 4) { gv.push(...pos(lat, lon, 0.996).toArray(), ...pos(lat, lon + 4, 0.996).toArray()); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3));
  globe.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x0f1613, transparent: true, opacity: 0.06 })));

  // terres : points sur un réseau de Fibonacci
  const N = 30000, lp = [], gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = gold * i;
    const lat = Math.asin(y) / RAD, lon = ((Math.atan2(Math.sin(th) * r, Math.cos(th) * r) / RAD) + 540) % 360 - 180;
    if (LAND.some((p) => inside(lon, lat, p))) lp.push(...pos(lat, lon, 1.001).toArray());
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 32;
  const cx = dc.getContext('2d'); cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(16, 16, 15, 0, Math.PI * 2); cx.fill();
  const land = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x0f1613, size: 0.0165, sizeAttenuation: true, map: new THREE.CanvasTexture(dc), transparent: true, opacity: 0.88, alphaTest: 0.2, depthWrite: false }));
  globe.add(land);

  // arcs et repères
  const arcs = {}, marks = {}, pulses = {};
  const mtl = PLACES.mtl, vm = pos(mtl[0], mtl[1]);
  const mk = (v, color, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color })); m.position.copy(v.clone().multiplyScalar(1.004)); globe.add(m); return m; };
  mk(vm, 0x0f1613, 0.02);
  Object.keys(PLACES).filter((k) => k !== 'mtl').forEach((k) => {
    const col = new THREE.Color(colors[k] || '#D9380E');
    const ve = pos(PLACES[k][0], PLACES[k][1]);
    const ang = vm.angleTo(ve), pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, v = new THREE.Vector3().copy(vm).lerp(ve, t).normalize();
      pts.push(v.multiplyScalar(1 + Math.sin(Math.PI * t) * (0.1 + ang * 0.16)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.0042, 6, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3 }));
    globe.add(tube); arcs[k] = { tube, curve };
    const dot = mk(ve, col, 0.021); marks[k] = { dot, v: ve };
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    halo.position.copy(ve.clone().multiplyScalar(1.006)); halo.lookAt(ve.clone().multiplyScalar(3)); globe.add(halo); marks[k].halo = halo;
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), new THREE.MeshBasicMaterial({ color: col })); globe.add(pulse); pulses[k] = pulse;
  });

  // étiquettes HTML
  const labs = {};
  el.querySelectorAll('.gl__lab').forEach((a) => { labs[a.dataset.k] = a; });
  const homeLab = el.querySelector('.gl__lab--home');

  // état
  let active = 'dr', w = 0, h = 0, vis = true, t0 = performance.now(), ready = false;
  const view = { lat: 32, lon: -52 }, target = { lat: 32, lon: -52 }, drag = { on: false, x: 0, y: 0, dLon: 0, dLat: 0, idle: 0 };
  const dest = (k) => { const p = PLACES[k]; return { lat: 22 + (p[0] - 22) * 0.25, lon: -52 + (p[1] + 52) * 0.35 }; };
  const setActive = (k) => {
    if (!arcs[k]) return; active = k;
    Object.keys(arcs).forEach((x) => {
      arcs[x].tube.material.opacity = x === k ? 0.95 : 0.38;
      labs[x] && labs[x].classList.toggle('is-on', x === k);
    });
    if (!drag.on) { const d = dest(k); target.lat = d.lat; target.lon = d.lon; }
  };
  setActive('dr');

  const size = () => {
    w = el.clientWidth; h = el.clientHeight;
    renderer.setPixelRatio(dpr()); renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.position.z = Math.max(4.1, 4.0 / cam.aspect);
    cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(size); ro.observe(el); size();

  const v3 = new THREE.Vector3();
  const place = (lab, v) => {
    if (!lab) return;
    globe.localToWorld(v3.copy(v).multiplyScalar(1.02));
    const facing = v3.z > 0.18;
    v3.project(cam);
    const lw = lab.offsetWidth || 90, home = lab === homeLab;
    let x = ((v3.x + 1) / 2) * w;
    x = home ? Math.min(w - 4, Math.max(lw + 20, x)) : Math.min(w - lw - 22, Math.max(2, x));
    lab.style.transform = `translate3d(${x}px,${((1 - v3.y) / 2) * h}px,0)`;
    lab.style.opacity = facing ? 1 : 0; lab.style.pointerEvents = facing ? 'auto' : 'none';
  };

  const frame = () => {
    if (!vis) return;
    if (el.clientWidth !== w || el.clientHeight !== h) size();
    if (!w || !h) return;
    const t = (performance.now() - t0) / 1000;
    const sway = reduce ? 0 : Math.sin(t * 0.25) * 6;
    if (!drag.on) { drag.idle += 1; }
    view.lon += ((target.lon + drag.dLon + sway) - view.lon) * 0.06;
    view.lat += ((target.lat + drag.dLat) - view.lat) * 0.06;
    globe.rotation.y = -view.lon * RAD; globe.rotation.x = view.lat * RAD;
    Object.keys(arcs).forEach((k) => {
      const u = (t * (k === active ? 0.32 : 0.18) + (k === 'mx' ? 0.33 : k === 'pt' ? 0.66 : 0)) % 1;
      pulses[k].position.copy(arcs[k].curve.getPoint(u));
      pulses[k].material.opacity = 1; pulses[k].visible = k === active || true;
      const s = 1 + ((t * 0.8 + (k === 'pt' ? 0.4 : k === 'mx' ? 0.2 : 0)) % 1) * 1.4;
      marks[k].halo.scale.setScalar(s); marks[k].halo.material.opacity = (1 - (s - 1) / 1.4) * (k === active ? 0.6 : 0.3);
      place(labs[k], marks[k].v);
    });
    place(homeLab, vm);
    renderer.render(scene, cam);
    if (!ready) { ready = true; el.classList.add('is-ready'); }
  };
  const tick = () => frame();
  gsap.ticker.add(tick);
  const io = new IntersectionObserver((e) => { vis = e[0].isIntersecting; }, { rootMargin: '120px' });
  io.observe(el);

  // glisser
  const down = (e) => { if (e.button > 0) return; drag.on = true; drag.x = e.clientX; drag.y = e.clientY; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); el.classList.add('is-drag'); };
  const move = (e) => { if (!drag.on) return; drag.dLon -= (e.clientX - drag.x) * 0.35; drag.dLat = Math.max(-35, Math.min(35, drag.dLat + (e.clientY - drag.y) * 0.2)); drag.x = e.clientX; drag.y = e.clientY; };
  const up = () => { if (!drag.on) return; drag.on = false; el.classList.remove('is-drag'); gsap.to(drag, { dLon: 0, dLat: 0, duration: 1.6, ease: 'power3.out' }); };
  canvas.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  const lost = (e) => { e.preventDefault(); el.classList.remove('is-ready'); el.dispatchEvent(new CustomEvent('gl:lost')); };
  canvas.addEventListener('webglcontextlost', lost);

  const hover = (k) => () => setActive(k);
  const hs = Object.keys(labs).map((k) => { const f = hover(k); labs[k].addEventListener('pointerenter', f); labs[k].addEventListener('focus', f); return [k, f]; });

  frame();
  return {
    setActive,
    destroy() {
      gsap.ticker.remove(tick); ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      canvas.removeEventListener('webglcontextlost', lost);
      hs.forEach(([k, f]) => { labs[k].removeEventListener('pointerenter', f); labs[k].removeEventListener('focus', f); });
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (o.material.map) && o.material.map.dispose(); o.material.dispose(); } });
      renderer.dispose();
    },
  };
}
