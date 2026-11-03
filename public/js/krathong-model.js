// krathong-model.js — 3D krathong (procedural, or /assets/models/krathong.glb if present).
// Material slots: base, innerPetal, outerPetal, flower  (colours sampled from the photo)
import * as THREE from 'three';
import { assetFlags } from './assets.js';

export const DEFAULT_COLORS = {
  base: '#2E7D32', innerPetal: '#FF8F00', outerPetal: '#D84315', flower: '#FDD835',
};
export const HOST_COLORS = {
  base: '#B8862B', innerPetal: '#FFD27A', outerPetal: '#F2A93B', flower: '#FFF1B8',
};

/* ------------------------------------------------------------------ */
/* Shared resources (created once, reused by every krathong)           */
/* ------------------------------------------------------------------ */
const shared = {};

function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture() {
  if (!shared.glow) {
    shared.glow = canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.2, 'rgba(255,236,190,0.85)');
      r.addColorStop(0.5, 'rgba(255,170,70,0.28)');
      r.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
  }
  return shared.glow;
}

function flameTexture() {
  if (!shared.flame) {
    shared.flame = canvasTex(64, 128, (g, w, h) => {
      g.translate(w / 2, h * 0.72);
      const grad = g.createRadialGradient(0, 0, 1, 0, -10, h * 0.55);
      grad.addColorStop(0, 'rgba(255,255,245,1)');
      grad.addColorStop(0.25, 'rgba(255,230,140,0.95)');
      grad.addColorStop(0.55, 'rgba(255,140,40,0.7)');
      grad.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -h * 0.68);
      g.bezierCurveTo(w * 0.42, -h * 0.25, w * 0.4, h * 0.2, 0, h * 0.26);
      g.bezierCurveTo(-w * 0.4, h * 0.2, -w * 0.42, -h * 0.25, 0, -h * 0.68);
      g.fill();
    });
  }
  return shared.flame;
}

function smokeTexture() {
  if (!shared.smoke) {
    shared.smoke = canvasTex(64, 64, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(230,230,240,0.55)');
      r.addColorStop(1, 'rgba(230,230,240,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
  }
  return shared.smoke;
}

export function petalTexture() {
  if (!shared.petalTex) {
    shared.petalTex = canvasTex(64, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#9a9a9a');
      grad.addColorStop(0.55, '#f2f2f2');
      grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 6); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        g.beginPath(); g.moveTo(w / 2, h - i * 18); g.lineTo(4, h - i * 18 - 14); g.stroke();
        g.beginPath(); g.moveTo(w / 2, h - i * 18); g.lineTo(w - 4, h - i * 18 - 14); g.stroke();
      }
    });
  }
  return shared.petalTex;
}

export function trunkTextures() {
  if (!shared.trunkTop) {
    shared.trunkTop = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#e8e8e0'; g.fillRect(0, 0, w, h);
      for (let r = w / 2; r > 4; r -= 7 + Math.random() * 6) {
        g.strokeStyle = `rgba(80,90,60,${0.15 + Math.random() * 0.25})`;
        g.lineWidth = 1.5 + Math.random() * 2;
        g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.stroke();
      }
    });
    shared.trunkSide = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#d9dccf'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 3 + Math.random() * 5) {
        g.fillStyle = `rgba(40,60,30,${0.08 + Math.random() * 0.2})`;
        g.fillRect(x, 0, 1 + Math.random() * 2, h);
      }
    });
    shared.trunkSide.wrapS = THREE.RepeatWrapping;
    shared.trunkSide.repeat.set(3, 1);
  }
  return shared;
}

/** Folded banana-leaf petal: V-shaped crease, pointed tip, base at origin, growing +Y. */
export function petalGeometry() {
  if (shared.petalGeo) return shared.petalGeo;
  const geo = new THREE.PlaneGeometry(1, 1, 6, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const v = pos.getY(i) + 0.5; // 0..1
    const width = Math.pow(1 - v, 0.95) * (1 + 0.35 * Math.sin(Math.PI * v));
    const nx = x * width;
    const crease = -Math.abs(nx) * 0.55; // V fold
    const cup = v * v * 0.22;
    pos.setXYZ(i, nx, v, crease + cup);
  }
  geo.computeVertexNormals();
  shared.petalGeo = geo;
  return geo;
}

export function marigoldGeometry() {
  if (shared.marigold) return shared.marigold;
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 13) * Math.sin(v.y * 11) * Math.sin(v.z * 12);
    v.multiplyScalar(1 + n * 0.12);
    v.y *= 0.8;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  shared.marigold = geo;
  return geo;
}

/* ------------------------------------------------------------------ */
/* Optional GLB model                                                  */
/* ------------------------------------------------------------------ */
let glbTemplate = null;
let glbChecked = false;

/** Try /assets/models/krathong.glb once. Falls back to the procedural model. */
export async function preloadKrathongModel(url = '/assets/models/krathong.glb') {
  if (glbChecked) return !!glbTemplate;
  glbChecked = true;
  try {
    if (!(await assetFlags()).model) return false;
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    glbTemplate = gltf.scene;
    // normalise size: fit radius ~1
    const box = new THREE.Box3().setFromObject(glbTemplate);
    const size = box.getSize(new THREE.Vector3());
    const s = 2 / Math.max(size.x, size.z);
    glbTemplate.scale.setScalar(s);
    glbTemplate.position.y = -box.min.y * s;
    return true;
  } catch (e) {
    console.warn('krathong.glb not loaded, using procedural model', e);
    glbTemplate = null;
    return false;
  }
}

function slotFor(name = '') {
  const n = name.toLowerCase();
  if (n.includes('inner')) return 'innerPetal';
  if (n.includes('outer')) return 'outerPetal';
  if (n.includes('flower')) return 'flower';
  if (n.includes('base')) return 'base';
  return null;
}

/* ------------------------------------------------------------------ */
/* Sign (wish handwriting) texture                                     */
/* ------------------------------------------------------------------ */

/** Builds a glowing sign: ink is recoloured to warm light on a soft dark card. */
export function makeSignTexture(image, { text = '', subText = '' } = {}) {
  const W = 512; const H = 356;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // card
  const pad = 14;
  g.save();
  const r = 26;
  g.beginPath();
  g.roundRect ? g.roundRect(pad, pad, W - pad * 2, H - pad * 2, r) : g.rect(pad, pad, W - pad * 2, H - pad * 2);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(40,22,60,0.55)');
  bg.addColorStop(1, 'rgba(20,10,40,0.55)');
  g.fillStyle = bg; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,214,140,0.55)'; g.stroke();
  g.restore();
  const inner = { x: pad + 16, y: pad + 12, w: W - (pad + 16) * 2, h: H - (pad + 12) * 2 };
  if (image) {
    // tint ink to a warm glow colour
    const tmp = document.createElement('canvas');
    tmp.width = inner.w; tmp.height = inner.h;
    const tg = tmp.getContext('2d');
    const iw = image.naturalWidth || image.width; const ih = image.naturalHeight || image.height;
    const s = Math.min(inner.w / iw, inner.h / ih);
    const dw = iw * s; const dh = ih * s;
    tg.drawImage(image, (inner.w - dw) / 2, (inner.h - dh) / 2, dw, dh);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = '#fff3d1';
    tg.fillRect(0, 0, inner.w, inner.h);
    g.save();
    g.shadowColor = 'rgba(255,190,90,0.95)';
    g.shadowBlur = 16;
    g.drawImage(tmp, inner.x, inner.y);
    g.shadowBlur = 4;
    g.drawImage(tmp, inner.x, inner.y);
    g.restore();
  } else if (text) {
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff3d1';
    g.shadowColor = 'rgba(255,190,90,0.95)'; g.shadowBlur = 18;
    g.font = '600 64px "Mitr", "Noto Sans Thai", "Noto Sans JP", sans-serif';
    g.fillText(text, W / 2, subText ? H / 2 - 30 : H / 2, W - 60);
    if (subText) {
      g.font = '500 40px "Noto Sans JP", "Noto Sans Thai", sans-serif';
      g.fillText(subText, W / 2, H / 2 + 44, W - 60);
    }
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Krathong factory                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {object} opts.colors        {base, innerPetal, outerPetal, flower}
 * @param {HTMLImageElement|HTMLCanvasElement|null} opts.signImage
 * @param {string} [opts.signText]
 * @param {boolean} [opts.isHost]
 * @param {boolean} [opts.light]      attach a PointLight to the candle
 * @param {number}  [opts.smoke]      number of incense smoke particles
 */
export function createKrathong(opts = {}) {
  const colors = { ...DEFAULT_COLORS, ...(opts.colors || {}) };
  const group = new THREE.Group();
  group.name = 'krathong';
  const body = new THREE.Group();
  group.add(body);
  const materials = {};
  const ownTextures = [];
  const disposables = [];

  const mat = (slot, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colors[slot]),
      roughness: 0.62,
      metalness: 0.0,
      emissive: new THREE.Color(colors[slot]).multiplyScalar(0.12),
      ...extra,
    });
    (materials[slot] = materials[slot] || []).push(m);
    disposables.push(m);
    return m;
  };

  if (glbTemplate) {
    const model = glbTemplate.clone(true);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const slot = slotFor(o.material?.name) || slotFor(o.name);
      if (slot) o.material = mat(slot, { side: THREE.DoubleSide });
    });
    body.add(model);
  } else {
    // banana-trunk base
    const t = trunkTextures();
    const sideM = mat('base', { map: t.trunkSide, roughness: 0.85 });
    const topM = mat('base', { map: t.trunkTop, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.9, 0.32, 40, 1), [sideM, topM, sideM]);
    disposables.push(base.geometry);
    base.position.y = 0.06;
    body.add(base);
    // leaf collar around the trunk
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 48), mat('outerPetal', { roughness: 0.7 }));
    disposables.push(collar.geometry);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.16;
    body.add(collar);

    const pGeo = petalGeometry();
    // petal rings as InstancedMesh (one draw call per ring)
    const dummy = new THREE.Object3D();
    const pivot = new THREE.Object3D();
    pivot.add(dummy);
    const ring = (count, radius, y, tilt, h, w, slot, offset) => {
      const m = mat(slot, { side: THREE.DoubleSide, map: petalTexture() });
      const inst = new THREE.InstancedMesh(pGeo, m, count);
      disposables.push(inst);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + offset;
        pivot.rotation.set(0, -a, 0);
        dummy.scale.set(w, h, w);
        dummy.position.set(0, y, radius);
        dummy.rotation.set(tilt, 0, 0);
        pivot.updateMatrixWorld(true);
        inst.setMatrixAt(i, dummy.matrixWorld);
      }
      inst.instanceMatrix.needsUpdate = true;
      body.add(inst);
    };
    ring(12, 0.93, 0.12, 0.62, 0.7, 0.42, 'outerPetal', 0);
    ring(10, 0.7, 0.18, 0.32, 0.58, 0.34, 'innerPetal', Math.PI / 10);
    ring(8, 0.46, 0.21, 0.12, 0.42, 0.26, 'outerPetal', 0.2);
    // marigolds
    const fGeo = marigoldGeometry();
    const fM = mat('flower', { roughness: 0.9 });
    const flowers = new THREE.InstancedMesh(fGeo, fM, 7);
    disposables.push(flowers);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      dummy.position.set(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3);
      dummy.rotation.set(0, a, 0);
      dummy.scale.setScalar(0.105);
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
    }
    pivot.remove(dummy);
    flowers.instanceMatrix.needsUpdate = true;
    body.add(flowers);
  }

  // candle
  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.06, 0.55, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.5, emissive: 0xffd9a0, emissiveIntensity: 0.25 }),
  );
  disposables.push(candle.geometry, candle.material);
  candle.position.y = 0.5;
  body.add(candle);
  const flameAnchor = new THREE.Object3D();
  flameAnchor.position.y = 0.86;
  body.add(flameAnchor);
  const glowM = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb35c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 });
  const flameM = new THREE.SpriteMaterial({ map: flameTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  disposables.push(glowM, flameM);
  const glow = new THREE.Sprite(glowM);
  glow.scale.setScalar(0.9);
  const flame = new THREE.Sprite(flameM);
  flame.scale.set(0.12, 0.24, 1);
  flame.position.y = 0.04;
  flameAnchor.add(glow, flame);

  // incense sticks
  const stickM = new THREE.MeshStandardMaterial({ color: 0x8a4b2a, roughness: 0.9 });
  const tipM = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff5a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const stickGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.62, 5);
  disposables.push(stickM, tipM, stickGeo);
  const tips = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(stickGeo, stickM);
    const a = -0.25 + i * 0.25;
    s.position.set(0.16 + i * 0.03, 0.5, -0.1 + i * 0.1);
    s.rotation.set(a * 0.5, 0, -0.18 + a * 0.3);
    body.add(s);
    const tip = new THREE.Sprite(tipM);
    tip.scale.setScalar(0.07);
    tip.position.set(0, 0.31, 0);
    s.add(tip);
    tips.push(tip);
  }

  // smoke
  const smokeCount = opts.smoke ?? 14;
  let smoke = null; let smokeData = null;
  if (smokeCount > 0) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(smokeCount * 3);
    const alpha = new Float32Array(smokeCount);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const sm = new THREE.ShaderMaterial({
      uniforms: { map: { value: smokeTexture() }, size: { value: 70 } },
      vertexShader: `attribute float alpha; varying float vA; uniform float size;
        void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * (0.6 + (1.-alpha)) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA;
        void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb, c.a * vA * 0.6); }`,
      transparent: true, depthWrite: false,
    });
    smoke = new THREE.Points(geo, sm);
    smoke.frustumCulled = false;
    disposables.push(geo, sm);
    smokeData = Array.from({ length: smokeCount }, (_, i) => ({ life: (i / smokeCount) * 3, x: 0, z: 0, seed: Math.random() * 10 }));
    body.add(smoke);
  }

  // candle point light
  let light = null;
  if (opts.light) {
    light = new THREE.PointLight(0xffa64d, 2.2, 6, 1.6);
    light.position.y = 0.95;
    body.add(light);
  }

  // wish sign (billboard sprite)
  const signM = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 1 });
  disposables.push(signM);
  const sign = new THREE.Sprite(signM);
  sign.scale.set(1.45, 1.01, 1);
  sign.position.y = 1.85;
  sign.renderOrder = 10;
  group.add(sign);

  function setSign(image, textOpts) {
    if (signM.map) signM.map.dispose();
    const tex = makeSignTexture(image, textOpts);
    signM.map = tex;
    signM.needsUpdate = true;
    sign.visible = true;
  }
  if (opts.sign !== false && (opts.signImage || opts.signText)) setSign(opts.signImage, { text: opts.signText, subText: opts.signSubText });
  else sign.visible = false;

  if (opts.isHost) {
    const haloM = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 });
    disposables.push(haloM);
    const halo = new THREE.Sprite(haloM);
    halo.scale.setScalar(4.2);
    halo.position.y = 0.4;
    group.add(halo);
  }

  function setColors(next) {
    Object.assign(colors, next);
    for (const [slot, list] of Object.entries(materials)) {
      for (const m of list) {
        m.color.set(colors[slot]);
        m.emissive.set(colors[slot]).multiplyScalar(0.12);
      }
    }
  }

  const seed = Math.random() * 100;
  let flash = 0;
  function update(time, dt) {
    // gentle, smooth flicker (no random jumps)
    const f = 0.95 + Math.sin(time * 6.1 + seed) * 0.03 + Math.sin(time * 9.7 + seed * 2) * 0.02;
    const boost = 1 + flash * 3;
    flame.scale.set(0.12 * (0.9 + f * 0.15), 0.24 * f, 1);
    flame.position.x = Math.sin(time * 5 + seed) * 0.008;
    glow.scale.setScalar(0.9 * f * boost);
    glowM.opacity = Math.min(1, 0.65 * f * (1 + flash));
    if (light) light.intensity = 2.0 * (0.97 + (f - 0.95) * 0.5) * boost;
    for (const t of tips) t.scale.setScalar(0.06 + Math.sin(time * 3 + seed) * 0.01);
    if (flash > 0) flash = Math.max(0, flash - dt * 0.6);
    if (smoke) {
      const pos = smoke.geometry.attributes.position;
      const al = smoke.geometry.attributes.alpha;
      for (let i = 0; i < smokeData.length; i++) {
        const p = smokeData[i];
        p.life += dt;
        if (p.life > 3) p.life -= 3;
        const k = p.life / 3;
        const y = 0.82 + k * 1.3;
        const x = 0.2 + Math.sin(time * 0.8 + p.seed + k * 4) * 0.12 * (0.3 + k);
        const z = Math.cos(time * 0.7 + p.seed + k * 3) * 0.1 * (0.3 + k);
        pos.setXYZ(i, x, y, z);
        al.setX(i, Math.sin(Math.PI * k) * (1 - k * 0.5));
      }
      pos.needsUpdate = true; al.needsUpdate = true;
    }
  }

  function setOpacity(a) {
    group.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
        m.transparent = true;
        m.opacity = m.userData.baseOpacity * a;
      }
    });
  }

  function dispose() {
    if (signM.map) signM.map.dispose();
    for (const d of disposables) d.dispose?.();
    for (const t of ownTextures) t.dispose();
  }

  return {
    group, body, sign, flameAnchor, light, colors,
    setColors, setSign, update, setOpacity, dispose,
    flash() { flash = 1; },
  };
}
