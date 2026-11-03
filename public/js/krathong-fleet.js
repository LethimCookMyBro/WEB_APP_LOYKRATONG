// krathong-fleet.js — draws every krathong on the projector with a handful of
// InstancedMeshes (one per part) instead of ~20 meshes per krathong.
// Per-krathong colours use instanceColor; candle flames are one Points object
// with a smooth shader flicker (no per-frame randomness, so nothing blinks).
import * as THREE from 'three';
import { petalGeometry, marigoldGeometry, petalTexture, trunkTextures, DEFAULT_COLORS } from './krathong-model.js';

// Petal layout (same as the single-krathong model): [count, radius, y, tilt, h, w, slot, offset]
const RINGS = [
  [12, 0.93, 0.12, 0.62, 0.7, 0.42, 'outerPetal', 0],
  [10, 0.7, 0.18, 0.32, 0.58, 0.34, 'innerPetal', Math.PI / 10],
  [8, 0.46, 0.21, 0.12, 0.42, 0.26, 'outerPetal', 0.2],
];
const PETALS = RINGS.reduce((n, r) => n + r[0], 0); // 30
const FLOWERS = 7;
const FLAME_Y = 0.86;

/** Material that also glows a little in its own (instance) colour, so krathongs read at night without point lights. */
function glowingInstancedMaterial(params, glow = 0.16) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance += vColor.rgb * ${glow.toFixed(3)};
      #endif`,
    );
  };
  return m;
}

export function createFleet(scene, capacity = 300) {
  const group = new THREE.Group();
  group.name = 'krathong-fleet';
  scene.add(group);

  // ---- local part matrices -------------------------------------------------
  const petalLocal = []; const petalSlot = [];
  {
    const pivot = new THREE.Object3D(); const d = new THREE.Object3D(); pivot.add(d);
    for (const [count, radius, y, tilt, h, w, slot, offset] of RINGS) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + offset;
        pivot.rotation.set(0, -a, 0);
        d.scale.set(w, h, w); d.position.set(0, y, radius); d.rotation.set(tilt, 0, 0);
        pivot.updateMatrixWorld(true);
        petalLocal.push(d.matrixWorld.clone()); petalSlot.push(slot);
      }
    }
  }
  const flowerLocal = [];
  for (let i = 0; i < FLOWERS; i++) {
    const a = (i / FLOWERS) * Math.PI * 2 + 0.3;
    flowerLocal.push(new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
      new THREE.Vector3(0.105, 0.105, 0.105),
    ));
  }
  const baseLocal = new THREE.Matrix4().makeTranslation(0, 0.06, 0);
  const collarLocal = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.16, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
  const candleLocal = new THREE.Matrix4().makeTranslation(0, 0.5, 0);

  // ---- instanced meshes ----------------------------------------------------
  const t = trunkTextures();
  const make = (geo, mat, count) => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
    return m;
  };
  const base = make(new THREE.CylinderGeometry(1, 0.9, 0.32, 32, 1), glowingInstancedMaterial({ map: t.trunkSide, roughness: 0.85 }, 0.35), capacity);
  const collar = make(new THREE.TorusGeometry(1.0, 0.07, 6, 36), glowingInstancedMaterial({ roughness: 0.7 }, 0.4), capacity);
  const petals = make(petalGeometry(), glowingInstancedMaterial({ map: petalTexture(), side: THREE.DoubleSide, roughness: 0.62 }, 0.5), capacity * PETALS);
  const flowers = make(marigoldGeometry(), glowingInstancedMaterial({ roughness: 0.9 }, 0.5), capacity * FLOWERS);
  const candles = make(new THREE.CylinderGeometry(0.055, 0.06, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.5, emissive: 0xffd9a0, emissiveIntensity: 0.35 }), capacity);
  // make sure instanceColor buffers exist before the first render (white)
  const white = new THREE.Color(1, 1, 1);
  for (const m of [base, collar, petals, flowers]) {
    for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, white);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  // ---- flames (glow + teardrop core) as one Points object ------------------
  const fPos = new Float32Array(capacity * 3);
  const fData = new Float32Array(capacity * 2); // seed, size
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3).setUsage(THREE.DynamicDrawUsage));
  fGeo.setAttribute('data', new THREE.BufferAttribute(fData, 2).setUsage(THREE.DynamicDrawUsage));
  fGeo.setDrawRange(0, 0);
  const fUniforms = { uTime: { value: 0 }, uScale: { value: 300 }, uFlash: { value: 0 } };
  const flames = new THREE.Points(fGeo, new THREE.ShaderMaterial({
    uniforms: fUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec2 data; uniform float uTime; uniform float uScale;
      varying float vF; varying float vOn;
      void main() {
        vOn = step(0.001, data.y);
        vF = 0.95 + 0.03 * sin(uTime * 6.1 + data.x) + 0.02 * sin(uTime * 9.7 + data.x * 2.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = data.y * uScale * vF / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vF; varying float vOn;
      void main() {
        if (vOn < 0.5) discard;
        vec2 uv = gl_PointCoord - 0.5;
        uv.y = -uv.y;
        float glow = exp(-dot(uv, uv) * 16.0) * 0.4;
        // teardrop core, pointing up
        vec2 q = vec2(uv.x * 5.2, (uv.y + 0.02) * 2.6);
        float core = exp(-(q.x * q.x * (1.0 + max(q.y, 0.0) * 2.5) + q.y * q.y) * 6.0);
        vec3 col = vec3(1.0, 0.58, 0.2) * glow + vec3(1.0, 0.92, 0.7) * core * 1.6;
        float a = clamp(glow + core, 0.0, 1.0) * vF;
        gl_FragColor = vec4(col * vF, a);
      }`,
  }));
  flames.frustumCulled = false;
  group.add(flames);

  // ---- slot management ----------------------------------------------------
  const used = new Uint8Array(capacity);
  const free = [];
  let top = 0; // highest slot index in use + 1
  const tmp = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const col = new THREE.Color();

  function counts() {
    base.count = collar.count = candles.count = top;
    petals.count = top * PETALS;
    flowers.count = top * FLOWERS;
    fGeo.setDrawRange(0, top);
  }

  function alloc() {
    const slot = free.length ? free.pop() : top < capacity ? top++ : -1;
    if (slot < 0) return -1;
    used[slot] = 1;
    counts();
    return slot;
  }

  function release(slot) {
    if (slot < 0 || !used[slot]) return;
    used[slot] = 0;
    setMatrix(slot, zero);
    fData[slot * 2 + 1] = 0;
    fGeo.attributes.data.needsUpdate = true;
    free.push(slot);
    while (top > 0 && !used[top - 1]) { top--; const i = free.indexOf(top); if (i >= 0) free.splice(i, 1); }
    counts();
  }

  function setColors(slot, colors = DEFAULT_COLORS) {
    const c = { ...DEFAULT_COLORS, ...colors };
    base.setColorAt(slot, col.set(c.base));
    collar.setColorAt(slot, col.set(c.outerPetal));
    for (let i = 0; i < PETALS; i++) petals.setColorAt(slot * PETALS + i, col.set(c[petalSlot[i]]));
    for (let i = 0; i < FLOWERS; i++) flowers.setColorAt(slot * FLOWERS + i, col.set(c.flower));
    for (const m of [base, collar, petals, flowers]) m.instanceColor.needsUpdate = true;
    fData[slot * 2] = slot * 7.31 % 100;
    fData[slot * 2 + 1] = 1;
    fGeo.attributes.data.needsUpdate = true;
  }

  /** Place krathong `slot` with world matrix `m` (includes position, rotation, scale). */
  function setMatrix(slot, m) {
    base.setMatrixAt(slot, tmp.multiplyMatrices(m, baseLocal));
    collar.setMatrixAt(slot, tmp.multiplyMatrices(m, collarLocal));
    candles.setMatrixAt(slot, tmp.multiplyMatrices(m, candleLocal));
    for (let i = 0; i < PETALS; i++) petals.setMatrixAt(slot * PETALS + i, tmp.multiplyMatrices(m, petalLocal[i]));
    for (let i = 0; i < FLOWERS; i++) flowers.setMatrixAt(slot * FLOWERS + i, tmp.multiplyMatrices(m, flowerLocal[i]));
    // flame anchor = m * (0, FLAME_Y, 0)
    const e = m.elements;
    fPos[slot * 3] = e[4] * FLAME_Y + e[12];
    fPos[slot * 3 + 1] = e[5] * FLAME_Y + e[13];
    fPos[slot * 3 + 2] = e[6] * FLAME_Y + e[14];
    const sc = Math.hypot(e[0], e[1], e[2]);
    if (used[slot]) fData[slot * 2 + 1] = sc;
  }

  function commit(time) {
    for (const m of [base, collar, candles, petals, flowers]) m.instanceMatrix.needsUpdate = true;
    fGeo.attributes.position.needsUpdate = true;
    fGeo.attributes.data.needsUpdate = true;
    fUniforms.uTime.value = time;
  }

  return { group, alloc, release, setColors, setMatrix, commit, capacity, get size() { return top - free.length; } };
}
