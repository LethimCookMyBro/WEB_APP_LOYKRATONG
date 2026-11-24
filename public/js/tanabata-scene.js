// tanabata-scene.js — Tanabata (七夕) on the projector: two bamboo clumps on the
// river banks, tanzaku wish strips that fly in and hang from the branches, and
// the Milky Way (天の川, "the river in the sky") above the river.
import * as THREE from 'three';

let seed = 3;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/* ------------------------------------------------------------------ */
/* Milky Way                                                           */
/* ------------------------------------------------------------------ */
export function createMilkyWay(radius = 560) {
  const group = new THREE.Group();
  const N = 2600;
  const pos = new Float32Array(N * 3); const size = new Float32Array(N); const ph = new Float32Array(N);
  const dir = new THREE.Vector3(); const up = new THREE.Vector3();
  const along = (s) => dir.set(s * 1.7, 0.2 + 0.2 * (1 - s * s), -1).normalize();
  for (let i = 0; i < N; i++) {
    const s = rnd() * 2 - 1;
    along(s);
    // gaussian spread perpendicular to the band
    const g = (rnd() + rnd() + rnd() - 1.5) * 0.09;
    up.set(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    const p = dir.clone().addScaledVector(up, g).normalize().multiplyScalar(radius);
    pos.set([p.x, p.y, p.z], i * 3);
    size[i] = 0.8 + rnd() * 1.6; ph[i] = rnd() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const uniforms = { uTime: { value: 0 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) }, uBright: { value: 0.7 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float size; attribute float phase; uniform float uTime; uniform float uPR; varying float vA;
      void main(){ vA = 0.6 + 0.4 * sin(uTime * (0.7 + phase * 0.1) + phase * 5.0);
        gl_PointSize = size * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uBright; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * uBright;
      gl_FragColor = vec4(vec3(0.82, 0.88, 1.0) * a, a); }`,
  }));
  pts.renderOrder = -8;
  group.add(pts);
  // soft glow clouds along the band
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g2 = c.getContext('2d');
  const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(170,185,255,0.55)'); grad.addColorStop(1, 'rgba(170,185,255,0)');
  g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 14; i++) {
    const s = -1 + (i / 13) * 2;
    const p = along(s).clone().multiplyScalar(radius * 0.98);
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22, fog: false });
    const sp = new THREE.Sprite(m);
    sp.position.copy(p);
    sp.scale.set(radius * 0.32, radius * 0.16, 1);
    sp.renderOrder = -9;
    group.add(sp);
  }
  return { group, update(t) { uniforms.uTime.value = t; } };
}

/* ------------------------------------------------------------------ */
/* Bamboo clump with hang points                                       */
/* ------------------------------------------------------------------ */
function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 0.22, 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + 0.5; // 0..1 along the leaf
    const w = Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.35);
    p.setY(i, p.getY(i) * w);
    p.setX(i, x);
    p.setZ(i, -x * x * 0.25); // droop
  }
  g.computeVertexNormals();
  return g;
}

function createBamboo({ base, inward, scale = 1 }) {
  const group = new THREE.Group();
  const culmM = new THREE.MeshStandardMaterial({ color: 0x4f9a5e, roughness: 0.6, emissive: 0x2c6b3a, emissiveIntensity: 0.55 });
  const nodeM = new THREE.MeshStandardMaterial({ color: 0x2f6e3e, roughness: 0.7, emissive: 0x1d4a29, emissiveIntensity: 0.5 });
  const branchM = new THREE.MeshStandardMaterial({ color: 0x5c9a4e, roughness: 0.7, emissive: 0x2c5a26, emissiveIntensity: 0.5 });
  const hang = [];
  const leafPos = [];
  const culms = 4;
  for (let c = 0; c < culms; c++) {
    const h = (22 + rnd() * 6) * scale;
    const x = base.x + (c - 1.5) * 0.9 * scale - inward * c * 0.2;
    const z = base.z + (rnd() - 0.5) * 2.2;
    const lean = inward * (0.03 + rnd() * 0.04);
    const culm = new THREE.Group();
    culm.position.set(x, base.y, z);
    culm.rotation.z = -lean;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.24 * scale, h, 10), culmM);
    stalk.position.y = h / 2;
    culm.add(stalk);
    for (let y = 2; y < h; y += 2.3 * scale) {
      const node = new THREE.Mesh(new THREE.TorusGeometry(0.22 * scale, 0.05 * scale, 6, 14), nodeM);
      node.rotation.x = Math.PI / 2; node.position.y = y;
      culm.add(node);
    }
    group.add(culm);
    culm.updateMatrixWorld(true);
    // branches reaching over the water
    const nb = 2 + Math.floor(rnd() * 2);
    for (let b = 0; b < nb; b++) {
      const y0 = (6 + c * 1.6 + b * 4.2 + rnd() * 1.5) * scale;
      if (y0 > h - 2) continue;
      const start = new THREE.Vector3(0, y0, 0).applyMatrix4(culm.matrixWorld);
      const len = (5 + rnd() * 4) * scale;
      const end = start.clone().add(new THREE.Vector3(inward * len, -0.6 - rnd() * 1.6, (rnd() - 0.5) * 3));
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 1.4 + rnd(), 0));
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.06 * scale, 5, false), branchM);
      group.add(tube);
      for (let k = 0; k < 7; k++) {
        const tt = 0.22 + (k / 6) * 0.76;
        const p = curve.getPoint(tt);
        hang.push({ x: p.x, y: p.y, z: p.z, used: null });
        leafPos.push([p.x, p.y, p.z]);
      }
      for (let k = 0; k < 6; k++) { const p = curve.getPoint(0.4 + rnd() * 0.6); leafPos.push([p.x, p.y + 0.2, p.z]); }
    }
    // leaves near the top of the culm
    for (let k = 0; k < 10; k++) {
      const p = new THREE.Vector3((rnd() - 0.5) * 2, h - rnd() * 5, (rnd() - 0.5) * 2).applyMatrix4(culm.matrixWorld);
      leafPos.push([p.x, p.y, p.z]);
    }
  }
  // leaves (instanced)
  const per = 4;
  const leaves = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshStandardMaterial({ color: 0x3f8a47, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x1f4a24, emissiveIntensity: 0.6 }), leafPos.length * per);
  const d = new THREE.Object3D();
  let i = 0;
  for (const [x, y, z] of leafPos) {
    for (let k = 0; k < per; k++) {
      d.position.set(x, y, z);
      d.rotation.set((rnd() - 0.5) * 0.8, rnd() * Math.PI * 2, -0.5 - rnd() * 0.6);
      d.scale.setScalar((1.1 + rnd() * 0.8) * scale);
      d.updateMatrix();
      leaves.setMatrixAt(i++, d.matrix);
    }
  }
  group.add(leaves);
  return { group, hang };
}

/* ------------------------------------------------------------------ */
/* Tanzaku                                                             */
/* ------------------------------------------------------------------ */
const TZ_W = 0.9; const TZ_H = 2.85;
const tzGeo = new THREE.PlaneGeometry(TZ_W, TZ_H);
tzGeo.translate(0, -TZ_H / 2, 0);

function tanzakuTexture(img, color, name) {
  const W = 128; const H = 406;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.82)';
  g.fillRect(8, 22, W - 16, H - 30);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(W / 2, 11, 4.5, 0, Math.PI * 2); g.fill();
  if (img) {
    const iw = img.naturalWidth || img.width; const ih = img.naturalHeight || img.height;
    const s = Math.min((W - 22) / iw, (H - 40) / ih);
    g.drawImage(img, (W - iw * s) / 2, 26 + (H - 40 - ih * s) / 2, iw * s, ih * s);
  } else if (name) {
    g.fillStyle = '#2b2118'; g.font = '600 22px "Noto Sans JP","Noto Sans Thai",sans-serif';
    g.textAlign = 'center';
    [...name].slice(0, 10).forEach((ch, i) => g.fillText(ch, W / 2, 60 + i * 30));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

async function loadImage(src) {
  if (!src) return null;
  const img = new Image(); img.src = src;
  try { await img.decode(); return img; } catch { return null; }
}

export function createTanabata(scene, camera) {
  const group = new THREE.Group();
  group.name = 'tanabata';
  scene.add(group);
  const left = createBamboo({ base: new THREE.Vector3(-21, 0.3, -5), inward: 1 });
  const right = createBamboo({ base: new THREE.Vector3(19.5, 0.3, -7), inward: -1, scale: 0.95 });
  group.add(left.group, right.group);
  const slots = [...left.hang, ...right.hang];
  // prefer lower / nearer branch spots first (more readable on the projector)
  slots.forEach((s) => { s.score = -Math.hypot(s.x - camera.position.x, s.y - camera.position.y, s.z - camera.position.z) - s.y * 0.6; });
  slots.sort((a, b) => b.score - a.score);

  // strings (one LineSegments for all)
  const MAX = slots.length;
  const linePos = new Float32Array(MAX * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xd8d2c0, transparent: true, opacity: 0.55 }));
  lines.frustumCulled = false;
  group.add(lines);

  const items = [];
  const tmp = new THREE.Vector3();

  function pickSlot() {
    const free = slots.filter((s) => !s.used);
    if (!free.length) {
      // full: recycle the oldest tanzaku
      const oldest = items.filter((it) => !it.leaving).sort((a, b) => a.born - b.born)[0];
      if (!oldest) return null;
      remove(oldest.id, true);
      return oldest.slot;
    }
    const top = free.slice(0, Math.max(1, Math.ceil(free.length * 0.35)));
    return top[Math.floor(rnd() * top.length)];
  }

  async function add(data, { entry = true, elapsed = 0 } = {}) {
    if (items.some((it) => it.id === data.id)) return null;
    const slot = pickSlot();
    if (!slot) return null;
    const img = await loadImage(data.handwritingImageBase64);
    const mat = new THREE.MeshBasicMaterial({
      map: tanzakuTexture(img, data.tanzakuColor || '#3E9B5F', data.displayName || ''),
      side: THREE.DoubleSide, color: new THREE.Color(0.66, 0.66, 0.66), transparent: true,
    });
    const mesh = new THREE.Mesh(tzGeo, mat);
    const len = 0.45 + rnd() * 0.7;
    const it = {
      id: data.id, data, slot, mesh, len, phase: rnd() * 10, born: performance.now() - elapsed * 1000,
      entry: entry ? 0 : 1, leaving: false, fade: 1,
      from: new THREE.Vector3(0, 1.5, 8), ctrl: new THREE.Vector3(slot.x * 0.4, slot.y + 6, slot.z + 6),
    };
    slot.used = it;
    group.add(mesh);
    items.push(it);
    return it;
  }

  function remove(id, instant = false) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (instant) { dispose(it); return; }
    it.leaving = true;
  }
  function dispose(it) {
    group.remove(it.mesh);
    it.mesh.material.map?.dispose(); it.mesh.material.dispose();
    if (it.slot.used === it) it.slot.used = null;
    items.splice(items.indexOf(it), 1);
  }
  function clear() { [...items].forEach((it) => { it.leaving = true; }); }

  const bez = (a, b, c, k, out) => out.set(
    (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * b.x + k * k * c.x,
    (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * b.y + k * k * c.y,
    (1 - k) * (1 - k) * a.z + 2 * (1 - k) * k * b.z + k * k * c.z,
  );

  function update(t, dt) {
    let n = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.leaving) {
        it.fade -= dt / 1.5;
        if (it.fade <= 0) { dispose(it); continue; }
        it.mesh.material.opacity = it.fade;
      }
      const hangTop = tmp.set(it.slot.x, it.slot.y - it.len, it.slot.z);
      const wind = Math.sin(t * 0.5) * 0.06;
      if (it.entry < 1) {
        it.entry = Math.min(1, it.entry + dt / 2.6);
        const k = 1 - Math.pow(1 - it.entry, 3);
        bez(it.from, it.ctrl, hangTop, k, it.mesh.position);
        it.mesh.rotation.set(0, Math.sin(it.entry * 9) * 0.8 * (1 - k), Math.sin(it.entry * 12) * 0.5 * (1 - k));
        const s = 0.4 + 0.6 * k;
        it.mesh.scale.set(s, s, s);
      } else {
        it.mesh.position.copy(hangTop);
        it.mesh.rotation.set(0, Math.sin(t * 0.6 + it.phase) * 0.18, Math.sin(t * 1.1 + it.phase) * 0.09 + wind);
        it.mesh.scale.set(1, 1, 1);
      }
      // string from the branch to the top of the strip
      if (it.entry >= 1) {
        linePos.set([it.slot.x, it.slot.y, it.slot.z, it.mesh.position.x, it.mesh.position.y, it.mesh.position.z], n * 6);
        n++;
      }
    }
    lineGeo.setDrawRange(0, n * 2);
    lineGeo.attributes.position.needsUpdate = true;
  }

  return { group, add, remove, clear, update, items, get capacity() { return slots.length; } };
}
