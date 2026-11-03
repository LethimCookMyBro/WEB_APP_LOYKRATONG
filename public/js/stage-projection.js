// stage-projection.js — main projector view (3rd person / near-isometric river).
// Night river, opening ceremony, synchronised krathongs arriving from phones.
import * as THREE from 'three';
import {
  createRenderer, createWater, createSky, createLanterns, createSkyline,
  createRippleSystem, createSparkles, waveHeight, MOON_DIR, MAX_WATER_LIGHTS, createClock,
} from './scene-env.js';
import { createKrathong, preloadKrathongModel, glowTexture, HOST_COLORS } from './krathong-model.js';
import { getWish } from './language-data.js';
import { audio } from './audio.js';

const MAX_KRATHONGS = Number(new URLSearchParams(location.search).get('max')) || 55;
const LIGHT_POOL = 6;
const $ = (s) => document.querySelector(s);

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
const canvas = $('#stage-canvas');
const env = createRenderer(canvas, { pixelRatio: 1.5, bloomStrength: 1.05, bloomScale: 0.5 });
const { scene, camera, renderer } = env;
renderer.toneMappingExposure = 0.72;
scene.fog = new THREE.Fog(0x0b0f2a, 70, 280);
camera.fov = 40;
camera.position.set(0, 13, 30);
camera.lookAt(0, 0, -40);
camera.updateProjectionMatrix();

const water = createWater({ size: 900, segments: 220, fogNear: 70, fogFar: 270 });
scene.add(water.mesh);
const sky = createSky({ radius: 620, stars: 2200 });
scene.add(sky.group);
const lanterns = createLanterns({ count: 260 });
scene.add(lanterns.points);
const skyline = createSkyline({ z: -300 });
scene.add(skyline.group);
const ripples = createRippleSystem(scene);
const sparkles = createSparkles({ count: 160, spread: 50, center: new THREE.Vector3(0, 0, -10) });
scene.add(sparkles.points);

scene.add(new THREE.HemisphereLight(0x5d6cc0, 0x080a18, 0.5));
const moonLight = new THREE.DirectionalLight(0xc8d4ff, 0.65);
moonLight.position.copy(MOON_DIR).multiplyScalar(80);
scene.add(moonLight);

// River path (CatmullRomCurve3) from the pier to the horizon
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 4), new THREE.Vector3(-1.5, 0, -4), new THREE.Vector3(2.5, 0, -15),
  new THREE.Vector3(-3, 0, -30), new THREE.Vector3(4, 0, -50), new THREE.Vector3(-4, 0, -77),
  new THREE.Vector3(3, 0, -110), new THREE.Vector3(-1, 0, -148), new THREE.Vector3(-3, 0, -195),
], false, 'catmullrom', 0.4);
const CURVE_LEN = curve.getLength();
const halfWidth = (u) => 15 + u * 22;

function frameAt(u) {
  const p = curve.getPointAt(Math.min(1, Math.max(0, u)));
  const tan = curve.getTangentAt(Math.min(1, Math.max(0, u)));
  const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
  return { p, tan, n };
}

/* ---------- river banks ---------- */
function buildBanks() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a120f, roughness: 1 });
  for (const side of [-1, 1]) {
    const pos = []; const idx = [];
    const N = 90; const rows = 6;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const { p, n } = frameAt(u);
      for (let r = 0; r < rows; r++) {
        const off = halfWidth(u) + (r === 0 ? 0 : Math.pow(r / (rows - 1), 1.6) * 160) + Math.sin(i * 1.7 + side) * 0.8;
        const y = r === 0 ? -0.2 : 0.35 + r * 0.4 + Math.sin(i * 0.9 + r) * 0.2;
        pos.push(p.x + n.x * off * side, y, p.z + n.z * off * side);
      }
    }
    // extend behind the camera
    for (let i = 0; i < N; i++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = i * rows + r; const b = a + rows;
        if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, mat));
  }
  // near shore under the camera / around the pier
  const near = new THREE.Mesh(new THREE.PlaneGeometry(200, 40), mat);
  near.rotation.x = -Math.PI / 2; near.position.set(0, 0.3, 30);
  group.add(near);
  // trees (dark silhouettes)
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 2, 5);
  const treeM = new THREE.MeshStandardMaterial({ color: 0x07100c, roughness: 1 });
  const trees = new THREE.InstancedMesh(treeGeo, treeM, 120);
  const trunks = new THREE.InstancedMesh(trunkGeo, treeM, 120);
  const d = new THREE.Object3D();
  for (let i = 0; i < 120; i++) {
    const u = 0.12 + Math.random() * 0.85; const side = i % 2 ? 1 : -1;
    const { p, n } = frameAt(u);
    const off = halfWidth(u) + 7 + Math.random() * 30;
    const s = 1.2 + Math.random() * 1.6 + u * 2;
    d.position.set(p.x + n.x * off * side, 2 + s * 0.8, p.z + n.z * off * side);
    d.scale.set(s, s * (1 + Math.random() * 0.5), s); d.rotation.set(0, Math.random() * 3, 0); d.updateMatrix();
    trees.setMatrixAt(i, d.matrix);
    d.position.y = 1; d.scale.set(1, 1, 1); d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
  }
  group.add(trees, trunks);
  return group;
}
scene.add(buildBanks());

/* ---------- bank lamps ---------- */
const bankLamps = [];
{
  const postM = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 });
  const postG = new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6);
  for (let i = 0; i < 18; i++) {
    const u = 0.02 + i * 0.045; const side = i % 2 ? 1 : -1;
    const { p, n } = frameAt(u);
    const off = halfWidth(u) + 1.2;
    const x = p.x + n.x * off * side; const z = p.z + n.z * off * side;
    const post = new THREE.Mesh(postG, postM); post.position.set(x, 1.3, z); scene.add(post);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
    glow.position.set(x, 2.55, z); glow.scale.setScalar(2.2);
    scene.add(glow);
    bankLamps.push({ x, z, glow });
  }
}

/* ---------- pier (ท่าน้ำ) ---------- */
{
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3122, roughness: 0.85 });
  const pier = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(12, 0.18, 0.62), wood);
    plank.position.set(0, 0.55, 6.2 + i * 0.68);
    pier.add(plank);
  }
  for (const x of [-5.8, 5.8]) {
    for (const z of [6.0, 11.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.6, 8), wood);
      post.position.set(x, 0.3, z); pier.add(post);
    }
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    lamp.position.set(x, 1.8, 6.0); lamp.scale.setScalar(2.4);
    pier.add(lamp);
  }
  scene.add(pier);
  const pierLight = new THREE.PointLight(0xffb36b, 6, 18, 1.5);
  pierLight.position.set(0, 3, 7);
  scene.add(pierLight);
}

/* ---------- candle light pool (fixed count → no shader recompiles) ---------- */
const lightPool = Array.from({ length: LIGHT_POOL }, () => {
  const l = new THREE.PointLight(0xffa04a, 0, 7, 1.6);
  scene.add(l);
  return l;
});

/* ------------------------------------------------------------------ */
/* Ceremony state                                                      */
/* ------------------------------------------------------------------ */
const look = { ceremony: 0, target: 0, lanterns: 0.08, lanternsTarget: 0.08 };
function setCeremonyLook(opened, instant = false) {
  look.target = opened ? 1 : 0;
  look.lanternsTarget = opened ? 1 : 0.08;
  if (instant) { look.ceremony = look.target; look.lanterns = look.lanternsTarget; }
  $('#waiting').style.opacity = opened ? '0' : '1';
}
function applyLook(dt) {
  look.ceremony += (look.target - look.ceremony) * Math.min(1, dt * 0.35);
  look.lanterns += (look.lanternsTarget - look.lanterns) * Math.min(1, dt * 0.18);
  const c = look.ceremony;
  water.uniforms.uCeremony.value = c;
  sky.uniforms.uCeremony.value = c;
  lanterns.uniforms.uAmount.value = look.lanterns;
  lanterns.uniforms.uBright.value = 0.35 + 0.75 * c;
  renderer.toneMappingExposure = 0.72 + 0.3 * c;
  for (const b of bankLamps) b.glow.material.opacity = 0.35 + 0.4 * c;
}

/* ------------------------------------------------------------------ */
/* Krathongs on the river                                              */
/* ------------------------------------------------------------------ */
const floating = [];
let count = 0;

async function loadImage(src) {
  if (!src) return null;
  const img = new Image();
  img.src = src;
  try { await img.decode(); return img; } catch { return null; }
}

/**
 * @param {object} data   spawn_krathong payload
 * @param {object} opt    { startU, entry (effects), ceremony (host path) }
 */
async function spawnKrathong(data, opt = {}) {
  if (floating.some((f) => f.data.id === data.id)) return null;
  const img = await loadImage(data.handwritingImageBase64);
  const isHost = !!data.isHost;
  const wish = getWish(data.selectedWishId);
  const k = createKrathong({
    colors: isHost ? { ...HOST_COLORS, ...(data.colors || {}) } : data.colors,
    signImage: img,
    signText: img ? '' : (data.displayName || (isHost ? 'ลอยกระทง' : '')),
    signSubText: img ? '' : (isHost ? 'ロイクラトン' : ''),
    isHost,
    smoke: isHost ? 18 : 8,
  });
  // signs are the star of the projector view: make them bigger than on the phone
  k.sign.scale.multiplyScalar(isHost ? 1.5 : 1.75);
  k.sign.position.y = isHost ? 2.3 : 2.45;
  const scale = isHost ? 1.55 : 1;
  k.group.scale.setScalar(opt.entry ? 0.01 : scale);
  scene.add(k.group);
  const f = {
    data, k, scale, isHost,
    u: opt.startU ?? 0,
    duration: (isHost ? 230 : 150) * (0.85 + Math.random() * 0.3),
    lateral: (Math.random() - 0.5) * 9,
    lateralTarget: (Math.random() - 0.5) * 20,
    speedMul: 1,
    age: 0,
    phase: Math.random() * 10,
    fade: 1,
    fading: false,
    entry: opt.entry ? 0 : 1,
    ceremony: opt.ceremony ? { t: 0 } : null,
    wish,
  };
  if (isHost) f.lateralTarget = 0;
  floating.push(f);
  if (opt.entry) {
    const { p } = frameAt(f.u);
    ripples.spawn(p.x + f.lateral, p.z, { maxScale: 4.5 });
    ripples.spawn(p.x + f.lateral, p.z, { maxScale: 7, delay: 0.35, life: 3 });
    audio.chime();
  }
  // cap the number of krathongs: fade out the oldest non-host ones
  const live = floating.filter((x) => !x.fading);
  if (live.length > MAX_KRATHONGS) {
    live.filter((x) => !x.isHost).sort((a, b) => b.u - a.u).slice(0, live.length - MAX_KRATHONGS).forEach((x) => { x.fading = true; });
  }
  return f;
}

function removeKrathong(f) {
  scene.remove(f.k.group);
  f.k.dispose();
  floating.splice(floating.indexOf(f), 1);
}

const tmpV = new THREE.Vector3();
function updateKrathongs(t, dt) {
  // separation (avoid overlapping)
  for (let i = 0; i < floating.length; i++) {
    const a = floating[i];
    a.speedMul += (1 - a.speedMul) * Math.min(1, dt * 0.5);
    for (let j = i + 1; j < floating.length; j++) {
      const b = floating[j];
      const dx = a.k.group.position.x - b.k.group.position.x;
      const dz = a.k.group.position.z - b.k.group.position.z;
      const d2 = dx * dx + dz * dz;
      const min = 2.3 * (a.scale + b.scale) / 2 + 0.6;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / min;
        const side = a.lateral >= b.lateral ? 1 : -1;
        a.lateralTarget += side * push * 4 * dt * 10;
        b.lateralTarget -= side * push * 4 * dt * 10;
        // the one behind (smaller u) slows down a little
        if (a.u < b.u) a.speedMul = Math.min(a.speedMul, 1 - push * 0.8); else b.speedMul = Math.min(b.speedMul, 1 - push * 0.8);
      }
    }
  }
  const lights = [];
  for (let i = floating.length - 1; i >= 0; i--) {
    const f = floating[i];
    f.age += dt;
    if (f.ceremony) {
      // host krathong glides from the pier to the middle of the screen, then floats normally
      f.ceremony.t += dt;
      const k = Math.min(1, f.ceremony.t / 6.5);
      const e = 1 - Math.pow(1 - k, 3);
      f.u = e * 0.16;
      if (k >= 1) f.ceremony = null;
    } else {
      f.u += (dt / f.duration) * f.speedMul;
    }
    const hw = halfWidth(f.u) - 2.5;
    f.lateralTarget = Math.max(-hw, Math.min(hw, f.lateralTarget));
    f.lateral += (f.lateralTarget - f.lateral) * Math.min(1, dt * 0.45);
    if (f.u > 0.93 && !f.fading) f.fading = true;
    if (f.fading) {
      f.fade -= dt / 4;
      if (f.fade <= 0) { removeKrathong(f); continue; }
      f.k.setOpacity(Math.max(0, f.fade));
    }
    f.entry = Math.min(1, f.entry + dt / 1.3);
    const pop = f.entry < 1 ? 1 + Math.sin(f.entry * Math.PI) * 0.25 : 1;
    const { p, tan, n } = frameAt(f.u);
    const g = f.k.group;
    g.position.set(p.x + n.x * f.lateral, 0, p.z + n.z * f.lateral);
    const bob = Math.sin(t * 1.4 + f.phase) * 0.07;
    g.position.y = waveHeight(g.position.x, g.position.z, t) + bob - (1 - f.entry) * 0.6;
    g.rotation.z = Math.cos(t * 1.1 + f.phase) * 0.06;
    g.rotation.x = Math.sin(t * 0.9 + f.phase) * 0.045;
    g.rotation.y = Math.atan2(tan.x, tan.z) + Math.sin(t * 0.15 + f.phase) * 0.6;
    g.scale.setScalar(f.scale * Math.min(1, f.entry * 1.4) * pop);
    f.k.update(t, dt);
    g.getWorldPosition(tmpV);
    lights.push({ f, x: tmpV.x, y: 0, z: tmpV.z, w: (f.isHost ? 1.8 : 1.1) * f.fade * f.entry, d: tmpV.distanceToSquared(camera.position) });
  }
  // water reflections: nearest krathongs + lamps
  lights.sort((a, b) => a.d - b.d);
  const wl = lights.slice(0, MAX_WATER_LIGHTS - 8);
  for (const b of bankLamps.slice(0, 8)) wl.push({ x: b.x, y: 0, z: b.z, w: 0.45 + 0.3 * look.ceremony });
  water.setLights(wl);
  // real point lights for the nearest few
  lightPool.forEach((l, i) => {
    const L = lights[i];
    if (!L) { l.intensity = 0; return; }
    L.f.k.flameAnchor.getWorldPosition(l.position);
    l.intensity = 3.2 * L.w * (0.85 + Math.random() * 0.15);
  });
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
function setCount(n) {
  count = n;
  $('#count').textContent = String(n);
}

function feed(data) {
  const wish = getWish(data.selectedWishId);
  const learnTh = data.languageMode === 'JP_TO_TH';
  const name = data.displayName || (data.isHost ? 'พิธีกร · 司会' : '🪷');
  const wishTx = wish ? (learnTh ? wish.th : wish.ja) : (data.customWish || '');
  const el = document.createElement('div');
  el.className = 'feed-item';
  const lotus = document.createElement('span'); lotus.className = 'lotus'; lotus.textContent = '🪷';
  const box = document.createElement('div'); box.style.minWidth = '0';
  const n = document.createElement('div'); n.className = 'n'; n.textContent = name;
  const w = document.createElement('div'); w.className = 'w'; w.textContent = wishTx;
  box.append(n, w);
  el.append(lotus, box);
  const list = $('#feed');
  list.appendChild(el);
  while (list.children.length > 4) list.firstElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, 14000);
}

function refreshQr(url) {
  $('#qrImg').src = '/qr.svg?t=' + Date.now();
  if (url) $('#qrUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function showLesson(lesson) {
  const box = $('#lesson');
  const w = lesson && getWish(lesson.wishId);
  if (!w) { box.classList.remove('on'); return; }
  box.innerHTML = '';
  const make = (cls, text, tag = 'div') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  box.append(make('cat', `${w.icon} ${w.category.th} · ${w.category.ja}`));
  const cols = make('cols', '');
  const th = make('col', '');
  th.append(make('lbl', 'ภาษาไทย · タイ語'), make('tx th', w.th), make('rd', w.thPhonetic));
  const ja = make('col', '');
  ja.append(make('lbl', 'ภาษาญี่ปุ่น · 日本語'), make('tx ja', w.ja), make('kn', w.jaKana), make('rd', w.romaji));
  cols.append(th, ja);
  box.append(cols, make('en', w.en));
  box.classList.add('on');
}

let bannerTimer = 0;
function showBanner() {
  const b = $('#banner');
  b.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('on'), 8000);
}

/* ------------------------------------------------------------------ */
/* Ceremony                                                            */
/* ------------------------------------------------------------------ */
let opened = false;
async function openCeremony(hostData) {
  opened = true;
  $('#waiting').style.opacity = '0';
  const f = await spawnKrathong({ ...hostData, isHost: true }, { entry: true, ceremony: true });
  setTimeout(() => {
    const pos = f ? f.k.group.position : new THREE.Vector3(0, 0, -12);
    f?.k.flash();
    water.ripple(pos.x, pos.z, 1);
    ripples.spawn(pos.x, pos.z, { color: 0xffd27a, maxScale: 14, life: 4 });
    ripples.spawn(pos.x, pos.z, { color: 0xffd27a, maxScale: 22, life: 5, delay: 0.5 });
    setCeremonyLook(true);
    showBanner();
    audio.fanfare();
    setTimeout(() => audio.setMode('festival'), 1800);
  }, 5600);
  feed({ ...hostData, isHost: true });
}

/* ------------------------------------------------------------------ */
/* Socket                                                              */
/* ------------------------------------------------------------------ */
const socket = window.io ? window.io({ transports: ['websocket', 'polling'] }) : null;
if (socket) {
  socket.on('connect', () => socket.emit('join', { role: 'stage' }));
  socket.on('river_snapshot', async (snap) => {
    // full resync (also after reconnect)
    for (const f of [...floating]) removeKrathong(f);
    opened = snap.opened || snap.opening;
    setCeremonyLook(snap.opened, true);
    if (snap.opened && audioStarted) audio.setMode('festival');
    refreshQr(snap.joinUrl);
    showLesson(snap.lesson);
    const now = snap.now || Date.now();
    if (snap.hostKrathong && snap.opened) {
      const el = (now - snap.hostKrathong.receivedAt) / 1000;
      const u = 0.16 + Math.max(0, el - 6.5) / 230;
      if (u < 0.93) await spawnKrathong(snap.hostKrathong, { startU: u });
    } else if (snap.opening && snap.hostKrathong) {
      openCeremony(snap.hostKrathong);
    }
    for (const k of snap.krathongs || []) {
      const el = (now - k.receivedAt) / 1000;
      const u = el / 150;
      if (u < 0.9) await spawnKrathong(k, { startU: u });
    }
  });
  socket.on('ceremony_open', ({ krathong }) => openCeremony(krathong));
  socket.on('ceremony_state', (s) => {
    if (s.opened) { if (!look.target) setCeremonyLook(true); }
    else if (!s.opening && opened) { opened = false; setCeremonyLook(false); if (audioStarted) audio.setMode('calm'); }
  });
  socket.on('spawn_krathong', (k) => { spawnKrathong(k, { entry: true }); feed(k); });
  socket.on('stats', (s) => setCount(s.floated));
  socket.on('remove_krathong', ({ id }) => { const f = floating.find((x) => x.data.id === id); if (f) { f.fading = true; f.fade = Math.min(f.fade, 0.5); } });
  socket.on('river_clear', () => floating.forEach((f) => { if (!f.isHost) f.fading = true; }));
  socket.on('river_reset', () => { floating.forEach((f) => { f.fading = true; }); opened = false; setCeremonyLook(false); if (audioStarted) audio.setMode('calm'); showLesson(null); });
  socket.on('lesson', showLesson);
  socket.on('join_url', ({ url }) => refreshQr(url));
  socket.on('stage_control', ({ action, value }) => {
    if (action === 'qr_big') $('#qr').classList.add('big');
    if (action === 'qr_small') $('#qr').classList.remove('big');
    if (action === 'music_off') audio.setVolume(0);
    if (action === 'music_on') audio.setVolume(0.8);
    if (action === 'volume' && typeof value === 'number') audio.setVolume(value);
  });
} else {
  refreshQr('');
}

/* ------------------------------------------------------------------ */
/* Start overlay, keyboard, demo mode                                  */
/* ------------------------------------------------------------------ */
let audioStarted = false;
async function start() {
  $('#start').hidden = true;
  try { await audio.init(); audioStarted = true; audio.setMode(look.target ? 'festival' : 'calm'); } catch (e) { console.warn(e); }
  try { await document.documentElement.requestFullscreen?.(); } catch { /* user can press F */ }
}
$('#start').addEventListener('click', start);
if (new URLSearchParams(location.search).get('autostart') === '1') $('#start').hidden = true;

let demoTimer = 0;
const DEMO_NAMES = ['ทานากะ', 'ซาโต้', 'ソムチャイ', 'プロイ', 'ยามาดะ', 'ナッタポン', 'ซากุระ', 'シリポーン'];
const DEMO_COLORS = [['#2E7D32', '#FF8F00', '#D84315', '#FDD835'], ['#1565C0', '#AB47BC', '#EC407A', '#FFEE58'], ['#00897B', '#FFB300', '#F4511E', '#FFF59D'], ['#6D4C41', '#E91E63', '#9C27B0', '#FFD54F']];
function demoKrathong(i) {
  const c = DEMO_COLORS[i % DEMO_COLORS.length];
  const wishIds = ['research_fast', 'study_well', 'good_health', 'happiness', 'success'];
  return {
    id: `demo_${Date.now()}_${i}`, isHost: false, languageMode: i % 2 ? 'JP_TO_TH' : 'TH_TO_JP', selectedWishId: wishIds[i % 5],
    colors: { base: c[0], innerPetal: c[1], outerPetal: c[2], flower: c[3] },
    handwritingImageBase64: null, displayName: DEMO_NAMES[i % DEMO_NAMES.length], receivedAt: Date.now(),
  };
}
function toggleDemo() {
  if (demoTimer) { clearInterval(demoTimer); demoTimer = 0; return; }
  if (!opened) openCeremony({ id: `demo_host_${Date.now()}`, isHost: true, colors: HOST_COLORS, displayName: 'ลอยกระทง', handwritingImageBase64: null });
  let i = 0;
  demoTimer = setInterval(() => { const k = demoKrathong(i++); spawnKrathong(k, { entry: true }); feed(k); setCount(count + 1); }, 2600);
}
if (new URLSearchParams(location.search).get('demo') === '1') setTimeout(toggleDemo, 500);

let cursorTimer = 0;
window.addEventListener('mousemove', () => {
  document.body.classList.add('show-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.remove('show-cursor'), 2500);
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  if (k === 'm') audio.setVolume(audio.volume > 0 ? 0 : 0.8);
  if (k === 'q') $('#qr').classList.toggle('big');
  if (k === 'h') $('#hud').hidden = !$('#hud').hidden;
  if (k === 'd') toggleDemo();
});

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */
await preloadKrathongModel();
const clock = createClock();
let fpsAcc = 0; let fpsFrames = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  water.update(t); sky.update(t); lanterns.update(t); sparkles.update(t);
  ripples.update(dt);
  applyLook(dt);
  updateKrathongs(t, dt);
  // gentle camera drift
  camera.position.x = Math.sin(t * 0.05) * 1.2;
  camera.position.y = 13 + Math.sin(t * 0.07) * 0.3;
  camera.lookAt(0, 0, -40);
  env.render();
  // adaptive quality: lower pixel ratio if the projector PC is slow
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 4) {
    const fps = fpsFrames / fpsAcc;
    const pr = renderer.getPixelRatio();
    if (fps < 32 && pr > 0.75) { renderer.setPixelRatio(pr - 0.25); env.resize(); }
    fpsAcc = 0; fpsFrames = 0;
  }
}
frame();
window.addEventListener('resize', env.resize);
window.__stage = { spawnKrathong, openCeremony, floating, toggleDemo };
