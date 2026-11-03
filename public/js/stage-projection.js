// stage-projection.js — main projector view (3rd person / near-isometric river).
// Night river, opening ceremony, synchronised krathongs arriving from phones.
import * as THREE from 'three';
import {
  createRenderer, createWater, createSky, createLanterns, createSkyline,
  createRippleSystem, createSparkles, waveHeight, MOON_DIR, MAX_WATER_LIGHTS, createClock,
} from './scene-env.js';
import { glowTexture, HOST_COLORS } from './krathong-model.js';
import { createFleet } from './krathong-fleet.js';
import { SignLayer } from './sign-labels.js';
import { getWish } from './language-data.js';
import { audio } from './audio.js';
import { assetFlags } from './assets.js';

const params = new URLSearchParams(location.search);
const MAX_KRATHONGS = Number(params.get('max')) || 300;
const $ = (s) => document.querySelector(s);

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
const canvas = $('#stage-canvas');
// Projectors are usually 1080p: render at 1x and let MSAA smooth the edges.
const env = createRenderer(canvas, { pixelRatio: Number(params.get('pr')) || 1, bloomStrength: 0.95, bloomScale: 0.4, msaa: 4 });
const { scene, camera, renderer } = env;
renderer.toneMappingExposure = 0.72;
scene.fog = new THREE.Fog(0x0b0f2a, 70, 280);
camera.fov = 40;
camera.position.set(0, 13, 30);
camera.lookAt(0, 0, -40);
camera.updateProjectionMatrix();

const water = createWater({ size: 900, segments: 128, fogNear: 70, fogFar: 270 });
scene.add(water.mesh);
const sky = createSky({ radius: 620, stars: 1600 });
scene.add(sky.group);
const lanterns = createLanterns({ count: 260 });
scene.add(lanterns.points);
const skyline = createSkyline({ z: -300 });
scene.add(skyline.group);
const ripples = createRippleSystem(scene);
const sparkles = createSparkles({ count: 120, spread: 50, center: new THREE.Vector3(0, 0, -10) });
scene.add(sparkles.points);

scene.add(new THREE.HemisphereLight(0x7d88d0, 0x1a1420, 0.9));
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

const _fp = new THREE.Vector3(); const _ft = new THREE.Vector3(); const _fn = new THREE.Vector3();
function frameAt(u) {
  const p = curve.getPointAt(Math.min(1, Math.max(0, u)), _fp);
  const tan = curve.getTangentAt(Math.min(1, Math.max(0, u)), _ft);
  const n = _fn.set(-tan.z, 0, tan.x).normalize();
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
  lanterns.uniforms.uBright.value = 0.35 + 0.6 * c;
  renderer.toneMappingExposure = 0.72 + 0.3 * c;
  for (const b of bankLamps) b.glow.material.opacity = 0.35 + 0.4 * c;
}

/* ------------------------------------------------------------------ */
/* Krathong loop: everyone's krathong keeps drifting round, never vanishes */
/* ------------------------------------------------------------------ */
const loopCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 4.5), new THREE.Vector3(-7, 0, -3), new THREE.Vector3(-11, 0, -17),
  new THREE.Vector3(-11, 0, -34), new THREE.Vector3(-5, 0, -50), new THREE.Vector3(5, 0, -54),
  new THREE.Vector3(12, 0, -40), new THREE.Vector3(12, 0, -20), new THREE.Vector3(8, 0, -5),
], true, 'catmullrom', 0.5);
const LOOP_SAMPLES = 1024;
const loopP = new Float32Array(LOOP_SAMPLES * 2);
const loopT = new Float32Array(LOOP_SAMPLES * 2);
for (let i = 0; i < LOOP_SAMPLES; i++) {
  const p = loopCurve.getPointAt(i / LOOP_SAMPLES); const t = loopCurve.getTangentAt(i / LOOP_SAMPLES);
  loopP[i * 2] = p.x; loopP[i * 2 + 1] = p.z; loopT[i * 2] = t.x; loopT[i * 2 + 1] = t.z;
}
const loopOut = { x: 0, z: 0, tx: 0, tz: 0 };
function loopAt(u) {
  const f = (((u % 1) + 1) % 1) * LOOP_SAMPLES;
  const i = Math.floor(f); const j = (i + 1) % LOOP_SAMPLES; const k = f - i;
  loopOut.x = loopP[i * 2] + (loopP[j * 2] - loopP[i * 2]) * k;
  loopOut.z = loopP[i * 2 + 1] + (loopP[j * 2 + 1] - loopP[i * 2 + 1]) * k;
  loopOut.tx = loopT[i * 2] + (loopT[j * 2] - loopT[i * 2]) * k;
  loopOut.tz = loopT[i * 2 + 1] + (loopT[j * 2 + 1] - loopT[i * 2 + 1]) * k;
  return loopOut;
}
const LAP_SECONDS = Number(params.get('lap')) || 300; // one slow lap ≈ 5 minutes

// deterministic per-id numbers so every stage screen shows the same layout
function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

const fleet = createFleet(scene, MAX_KRATHONGS + 5);
const signs = new SignLayer(document.body, camera, { refDistance: 30, minScale: 0.7, maxScale: 1.05 });
const floating = [];
let count = 0;

// host halo (gold glow under the host krathong)
const hostHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
hostHalo.scale.setScalar(6);
scene.add(hostHalo);
let hostFlash = 0;

/**
 * @param {object} data  spawn_krathong payload
 * @param {object} opt   { elapsed (seconds since it was launched), entry (effects), ceremony (host glide) }
 */
function spawnKrathong(data, opt = {}) {
  if (floating.some((f) => f.data.id === data.id)) return null;
  // make room: retire the oldest non-host krathong when full
  const live = floating.filter((f) => !f.retiring);
  if (live.length >= MAX_KRATHONGS) {
    const oldest = live.filter((f) => !f.isHost).sort((a, b) => a.bornAt - b.bornAt)[0];
    if (oldest) oldest.retiring = true; else return null;
  }
  const slot = fleet.alloc();
  if (slot < 0) return null;
  const isHost = !!data.isHost;
  fleet.setColors(slot, isHost ? { ...HOST_COLORS, ...(data.colors || {}) } : data.colors);
  const id = String(data.id);
  const speed = (1 / LAP_SECONDS) * (0.88 + hash01(id, 1) * 0.24);
  const elapsed = opt.elapsed || 0;
  const f = {
    data, slot, isHost, id,
    scale: isHost ? 1.5 : 1,
    speed,
    u0: hash01(id, 4) * 0.025,
    u: 0,
    lane: isHost ? 0 : (hash01(id, 2) - 0.5) * 7,
    push: 0,
    phase: hash01(id, 3) * 10,
    entry: opt.entry ? 0 : 1,
    retiring: false,
    retire: 1,
    bornAt: Date.now() - elapsed * 1000,
    born: performance.now() - elapsed * 1000, // local monotonic clock
  };
  floating.push(f);
  signs.add(id, {
    image: data.handwritingImageBase64 || null,
    name: data.displayName || (isHost ? 'ลอยกระทง · ロイクラトン' : ''),
    isHost,
  });
  f.u = loopU(f, performance.now());
  if (opt.entry) {
    const p = loopAt(f.u);
    ripples.spawn(p.x, p.z, { maxScale: 4.5 });
    ripples.spawn(p.x, p.z, { maxScale: 7, delay: 0.35, life: 3 });
    audio.chime();
  }
  return f;
}

/**
 * Position along the loop from wall-clock age only (frame-rate independent):
 * a quick glide out from the pier for the first seconds, then a slow drift.
 */
const GLIDE_T = 6.5; const GLIDE_GAIN = 12;
function loopU(f, nowMs) {
  const age = Math.max(0, (nowMs - f.born) / 1000);
  const a = Math.min(age, GLIDE_T);
  const glide = GLIDE_GAIN * (a - (a * a) / (2 * GLIDE_T));
  return f.u0 + f.speed * (age + glide);
}

function removeKrathong(f) {
  fleet.release(f.slot);
  signs.remove(f.id);
  floating.splice(floating.indexOf(f), 1);
}

const mat4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const posV = new THREE.Vector3();
const sclV = new THREE.Vector3();
const anchors = [];
const lightList = [];

function updateKrathongs(t, dt) {
  const n = floating.length;
  // separation: push krathongs sideways when they get close
  for (let i = 0; i < n; i++) floating[i].push *= Math.max(0, 1 - dt * 0.15);
  for (let i = 0; i < n; i++) {
    const a = floating[i];
    for (let j = i + 1; j < n; j++) {
      const b = floating[j];
      const dx = a.x - b.x; const dz = a.z - b.z;
      const min = 1.15 * (a.scale + b.scale) + 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const k = (min - Math.sqrt(d2)) / min * dt * 2.2;
        const side = (a.lane + a.push) >= (b.lane + b.push) ? 1 : -1;
        a.push += side * k; b.push -= side * k;
      }
    }
  }
  anchors.length = 0; lightList.length = 0;
  const nowMs = performance.now();
  for (let i = floating.length - 1; i >= 0; i--) {
    const f = floating[i];
    f.u = loopU(f, nowMs);
    if (f.retiring) {
      f.retire -= dt / 2.5;
      if (f.retire <= 0) { removeKrathong(f); continue; }
    }
    f.entry = Math.min(1, f.entry + dt / 1.3);
    f.push = Math.max(-4, Math.min(4, f.push));
    const L = loopAt(f.u);
    const nx = -L.tz; const nz = L.tx; // normal (unnormalised tangent is ~unit)
    const lat = f.lane + f.push;
    const x = L.x + nx * lat; const z = L.z + nz * lat;
    f.x = x; f.z = z;
    const y = waveHeight(x, z, t) + Math.sin(t * 1.4 + f.phase) * 0.07 - (1 - f.entry) * 0.6;
    const pop = f.entry < 1 ? 1 + Math.sin(f.entry * Math.PI) * 0.25 : 1;
    const sc = f.scale * Math.min(1, f.entry * 1.4) * pop * Math.max(0, f.retire);
    euler.set(Math.sin(t * 0.9 + f.phase) * 0.045, Math.atan2(L.tx, L.tz) + Math.sin(t * 0.15 + f.phase) * 0.6, Math.cos(t * 1.1 + f.phase) * 0.06);
    quat.setFromEuler(euler);
    mat4.compose(posV.set(x, y, z), quat, sclV.set(sc, sc, sc));
    fleet.setMatrix(f.slot, mat4);
    const vis = f.entry * Math.max(0, f.retire);
    anchors.push({ id: f.id, x, y: y + 1.25 * f.scale + 0.25, z, alpha: vis < 1 ? vis : 1, scale: f.isHost ? 1.2 : 1 });
    const dcx = x - camera.position.x; const dcz = z - camera.position.z;
    lightList.push({ x, y: 0, z, w: (f.isHost ? 1.6 : 1.05) * vis, d: dcx * dcx + dcz * dcz });
    if (f.isHost) {
      hostHalo.position.set(x, y + 0.5, z);
      hostHalo.material.opacity = 0.16 * vis + hostFlash * 0.5;
      hostHalo.scale.setScalar(6 + hostFlash * 10);
    }
  }
  if (hostFlash > 0) hostFlash = Math.max(0, hostFlash - dt * 0.5);
  if (!floating.some((f) => f.isHost)) hostHalo.material.opacity = 0;
  fleet.commit(t);
  signs.update(anchors);
  // water reflections: nearest krathongs + a few lamps
  lightList.sort((a, b) => a.d - b.d);
  const wl = lightList.length > MAX_WATER_LIGHTS - 6 ? lightList.slice(0, MAX_WATER_LIGHTS - 6) : lightList;
  for (let i = 0; i < 6; i++) wl.push({ x: bankLamps[i].x, y: 0, z: bankLamps[i].z, w: 0.4 + 0.25 * look.ceremony });
  water.setLights(wl);
}

/* ---------- far-away krathong lights drifting down the river (decoration) ---------- */
const farLights = (() => {
  const N = 90;
  const pos = new Float32Array(N * 3); const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const u = { uScale: { value: 300 }, uAmount: { value: 0 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float uScale; uniform float uAmount; varying float vA;
      void main(){ vA = step(seed, uAmount); vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ if (vA < .5) discard; vec2 q = gl_PointCoord - .5; float a = exp(-dot(q,q)*22.); gl_FragColor = vec4(vec3(1.,.66,.3)*a, a); }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return {
    update(t) {
      for (let i = 0; i < N; i++) {
        const k = (seed[i] + t * 0.004 * (0.6 + seed[i])) % 1;
        const uu = 0.42 + k * 0.55;
        const { p, n } = frameAt(uu);
        const off = (seed[(i * 7) % N] - 0.5) * halfWidth(uu) * 1.3;
        pos[i * 3] = p.x + n.x * off; pos[i * 3 + 1] = 0.25; pos[i * 3 + 2] = p.z + n.z * off;
      }
      geo.attributes.position.needsUpdate = true;
      u.uAmount.value = look.ceremony;
    },
  };
})();

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
function openCeremony(hostData) {
  opened = true;
  $('#waiting').style.opacity = '0';
  const f = spawnKrathong({ ...hostData, isHost: true }, { entry: true, ceremony: true });
  setTimeout(() => {
    const pos = f ? { x: f.x, z: f.z } : { x: 0, z: -12 };
    hostFlash = 1;
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
  socket.on('river_snapshot', (snap) => {
    // full resync (also after reconnect)
    for (const f of [...floating]) removeKrathong(f);
    opened = snap.opened || snap.opening;
    setCeremonyLook(snap.opened, true);
    if (snap.opened && audioStarted) audio.setMode('festival');
    refreshQr(snap.joinUrl);
    showLesson(snap.lesson);
    const now = snap.now || Date.now();
    if (snap.hostKrathong && snap.opened) {
      spawnKrathong(snap.hostKrathong, { elapsed: (now - snap.hostKrathong.receivedAt) / 1000 + 30 });
    } else if (snap.opening && snap.hostKrathong) {
      openCeremony(snap.hostKrathong);
    }
    for (const k of snap.krathongs || []) spawnKrathong(k, { elapsed: (now - k.receivedAt) / 1000 });
  });
  socket.on('ceremony_open', ({ krathong }) => openCeremony(krathong));
  socket.on('ceremony_state', (s) => {
    if (s.opened) { if (!look.target) setCeremonyLook(true); }
    else if (!s.opening && opened) { opened = false; setCeremonyLook(false); if (audioStarted) audio.setMode('calm'); }
  });
  socket.on('spawn_krathong', (k) => { spawnKrathong(k, { entry: true }); feed(k); });
  socket.on('stats', (s) => setCount(s.floated));
  socket.on('remove_krathong', ({ id }) => { const f = floating.find((x) => x.id === id); if (f) { f.retiring = true; f.retire = Math.min(f.retire, 0.4); } });
  socket.on('river_clear', () => floating.forEach((f) => { if (!f.isHost) f.retiring = true; }));
  socket.on('river_reset', () => { floating.forEach((f) => { f.retiring = true; }); opened = false; setCeremonyLook(false); if (audioStarted) audio.setMode('calm'); showLesson(null); });
  socket.on('bgm_changed', async () => { await audio.reloadBgm(); if (audioStarted) audio.setMode(look.target ? 'festival' : 'calm'); });
  socket.on('lesson', showLesson);
  socket.on('join_url', ({ url }) => refreshQr(url));
  socket.on('stage_control', ({ action, value }) => {
    if (action === 'qr_big') $('#qr').classList.add('big');
    if (action === 'qr_small') $('#qr').classList.remove('big');
    if (action === 'music_off') audio.setVolume(0);
    if (action === 'music_on') audio.setVolume(0.8);
    if (action === 'volume' && typeof value === 'number') audio.setVolume(value);
    if (action === 'labels_all') signs.setMode('auto');
    if (action === 'labels_near') signs.setMode('near');
    if (action === 'labels_off') signs.setMode('off');
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
  demoTimer = setInterval(() => { const k = demoKrathong(i++); spawnKrathong(k, { entry: true }); feed(k); setCount(count + 1); }, Number(params.get('demoMs')) || 2600);
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
  if (k === 'l') signs.setMode({ auto: 'all', all: 'near', near: 'off', off: 'auto' }[signs.mode] || 'auto');
});

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */
const clock = createClock();
let fpsAcc = 0; let fpsFrames = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  water.update(t); sky.update(t); lanterns.update(t); sparkles.update(t);
  ripples.update(dt);
  applyLook(dt);
  farLights.update(t);
  // gentle camera drift (update before projecting the wish cards)
  camera.position.x = Math.sin(t * 0.05) * 1.2;
  camera.position.y = 13 + Math.sin(t * 0.07) * 0.3;
  camera.lookAt(0, 0, -40);
  camera.updateMatrixWorld();
  updateKrathongs(t, dt);
  env.render();
  // adaptive quality: lower the render resolution if the projector PC is slow
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 3) {
    const fps = fpsFrames / fpsAcc;
    const pr = renderer.getPixelRatio();
    if (fps < 45 && pr > 0.6) { renderer.setPixelRatio(Math.max(0.6, pr - 0.15)); env.resize(); }
    fpsAcc = 0; fpsFrames = 0;
  }
}
frame();
window.addEventListener('resize', env.resize);
window.__stage = { spawnKrathong, openCeremony, floating, toggleDemo, renderer, signs };
assetFlags(); // warm the optional-asset lookup
