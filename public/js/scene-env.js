// scene-env.js — shared night-river environment pieces for stage + mobile views:
// renderer/bloom setup, water shader (moon + candle reflections + golden ripple),
// sky dome with stars & moon, sky lanterns (โคมลอย), skyline silhouettes, ripple rings.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { glowTexture } from './krathong-model.js';

export const MOON_DIR = new THREE.Vector3(-0.35, 0.32, -1).normalize();
export const MAX_WATER_LIGHTS = 24;

/** Tiny replacement for the deprecated THREE.Clock. */
export function createClock() {
  const start = performance.now();
  let last = start;
  return {
    elapsedTime: 0,
    getDelta() {
      const now = performance.now();
      const d = (now - last) / 1000;
      last = now;
      this.elapsedTime = (now - start) / 1000;
      return d;
    },
  };
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/**
 * Renderer + EffectComposer(RenderPass, UnrealBloomPass, OutputPass).
 * The composer renders into a multisampled target (MSAA) so the canvas itself
 * does not need antialiasing; bloom runs at a reduced resolution.
 */
export function createRenderer(canvas, { pixelRatio = 2, bloom = true, bloomStrength = 0.9, bloomScale = 0.5, msaa = 4 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !bloom, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
  let composer = null; let bloomPass = null;
  if (bloom) {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: msaa });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloomStrength, 0.5, 0.7);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloomPass.resolution.set(w * bloomScale, h * bloomScale);
    }
  }
  resize();
  return {
    renderer, scene, camera, composer, bloomPass, resize,
    render() { composer ? composer.render() : renderer.render(scene, camera); },
  };
}

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

/**
 * Tileable normal map built once on the CPU from a sum of sine waves with
 * integer frequencies (so it wraps seamlessly). Sampling a texture twice is far
 * cheaper per pixel than evaluating fractal noise in the shader.
 */
let waterNormalTex = null;
function waterNormalTexture(size = 256) {
  if (waterNormalTex) return waterNormalTex;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const waves = [];
  while (waves.length < 34) {
    const kx = Math.round((rnd() - 0.5) * 16); const ky = Math.round((rnd() - 0.5) * 16);
    if (!kx && !ky) continue;
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(k, 1.25), ph: rnd() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0; let dy = 0;
      const u = x / size; const v = y / size;
      for (const w of waves) {
        const c = Math.cos(TAU * (w.kx * u + w.ky * v) + w.ph) * w.a * TAU;
        dx += c * w.kx; dy += c * w.ky;
      }
      const s = 0.045;
      let nx = -dx * s; let ny = -dy * s; let nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  waterNormalTex = tex;
  return tex;
}

export function createWater({ size = 600, segments = 96, fogNear = 40, fogFar = 220 } = {}) {
  const lights = Array.from({ length: MAX_WATER_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 0));
  const uniforms = {
    uTime: { value: 0 },
    uNormal: { value: waterNormalTexture() },
    uMoonDir: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#040b1e') },
    uSkyTop: { value: new THREE.Color('#0b1238') },
    uSkyHorizon: { value: new THREE.Color('#2a2150') },
    uCeremony: { value: 0 },
    uRipple: { value: new THREE.Vector4(0, 0, -100, 0) },
    uLights: { value: lights },
    uLightCount: { value: 0 },
    uFogColor: { value: new THREE.Color('#0b0f2a') },
    uFogNear: { value: fogNear },
    uFogFar: { value: fogFar },
    uWaveScale: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uWaveScale;
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += (sin(w.x * 0.35 + uTime * 0.9) * 0.05 + sin(w.z * 0.5 - uTime * 1.1) * 0.04) * uWaveScale;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      #define MAXL ${MAX_WATER_LIGHTS}
      uniform float uTime; uniform sampler2D uNormal; uniform vec3 uMoonDir; uniform vec3 uDeep; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon;
      uniform float uCeremony; uniform vec4 uRipple; uniform vec4 uLights[MAXL]; uniform int uLightCount;
      uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uWaveScale;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        vec3 n1 = texture2D(uNormal, p * 0.045 + uTime * vec2(0.011, 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormal, p * 0.11 + uTime * vec2(-0.009, 0.013)).xyz * 2.0 - 1.0;
        vec2 slope = (n1.xy + n2.xy * 0.6) * 0.55 * uWaveScale;
        vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float ndv = max(dot(N, V), 0.0);
        float f1 = 1.0 - ndv; float f2 = f1 * f1;
        float fres = 0.04 + 0.96 * f2 * f2 * f1;
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 2.2, 0.0, 1.0));
        float md = max(dot(R, uMoonDir), 0.0);
        float md8 = md * md; md8 *= md8; md8 *= md8;            // md^8
        float md64 = md8 * md8; md64 *= md64; md64 *= md64;       // md^64
        float md256 = md64 * md64; md256 *= md256;               // md^256
        float moon = md256 * 0.75 + md64 * 0.035;
        vec3 col = mix(uDeep, sky, clamp(fres * 1.15, 0.0, 1.0)) + vec3(1.0, 0.95, 0.82) * moon;
        // candle reflections: soft pool + short streak toward the camera (no flicker)
        vec3 warm = vec3(0.0);
        for (int i = 0; i < MAXL; i++) {
          if (i >= uLightCount) break;
          vec4 L = uLights[i];
          vec2 d = p - L.xz;
          float d2 = dot(d, d);
          if (d2 > 60.0) continue;
          vec2 toCam = normalize(cameraPosition.xz - L.xz);
          float along = dot(d, toCam);
          float across = dot(d, vec2(-toCam.y, toCam.x)) + slope.x * 0.8;
          float pool = exp(-d2 * 0.9);
          float streak = along > 0.0 ? exp(-across * across * 5.0 - along * 0.3) : 0.0;
          warm += (pool * 0.5 + streak * 0.32) * L.w;
        }
        col += vec3(1.0, 0.6, 0.22) * warm;
        // golden ripple (opening ceremony)
        float rt = uTime - uRipple.z;
        if (rt > 0.0 && rt < 14.0) {
          float radius = rt * 8.5;
          float dist = distance(p, uRipple.xy);
          float ring = exp(-pow((dist - radius + slope.x * 3.0) / 1.8, 2.0)) * (1.0 - rt / 14.0);
          float inner = exp(-dist * 0.05) * max(0.0, 1.0 - rt / 7.0) * 0.35;
          col += vec3(1.0, 0.76, 0.32) * (ring * 1.7 + inner) * uRipple.w;
        }
        col *= mix(0.6, 1.0, uCeremony);
        col += vec3(0.55, 0.32, 0.12) * uCeremony * 0.035;
        float fd = distance(cameraPosition, vWorld);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, fd));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, segments, segments), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'water';
  return {
    mesh, uniforms,
    setLights(list) {
      const n = Math.min(list.length, MAX_WATER_LIGHTS);
      for (let i = 0; i < n; i++) lights[i].set(list[i].x, list[i].y, list[i].z, list[i].w);
      uniforms.uLightCount.value = n;
    },
    ripple(x, z, strength = 1) { uniforms.uRipple.value.set(x, z, uniforms.uTime.value, strength); },
    update(t) { uniforms.uTime.value = t; },
  };
}

/** Wave height used by the vertex shader (keeps floating objects on the surface). */
export function waveHeight(x, z, t) {
  return Math.sin(x * 0.35 + t * 0.9) * 0.05 + Math.sin(z * 0.5 - t * 1.1) * 0.04;
}

/* ------------------------------------------------------------------ */
/* Sky dome, stars, moon                                               */
/* ------------------------------------------------------------------ */
export function createSky({ radius = 600, stars = 1800 } = {}) {
  const group = new THREE.Group();
  const uniforms = {
    uTop: { value: new THREE.Color('#050a24') },
    uMid: { value: new THREE.Color('#121a4a') },
    uHorizon: { value: new THREE.Color('#3a2a5e') },
    uGlow: { value: new THREE.Color('#ff9a4a') },
    uCeremony: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 24),
    new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow; uniform float uCeremony; varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.18, y));
          c = mix(c, uTop, smoothstep(0.18, 0.7, y));
          float glow = exp(-abs(y) * 9.0) * (0.12 + 0.35 * uCeremony);
          c += uGlow * glow;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -10;
  group.add(dome);

  // stars
  const pos = new Float32Array(stars * 3);
  const sz = new Float32Array(stars);
  const ph = new Float32Array(stars);
  for (let i = 0; i < stars; i++) {
    const u = Math.random(); const v = Math.random() * 0.92 + 0.06;
    const theta = u * Math.PI * 2; const y = Math.pow(v, 0.8);
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(theta) * r * radius * 0.95, y * radius * 0.95, Math.sin(theta) * r * radius * 0.95], i * 3);
    sz[i] = Math.random() < 0.06 ? 3.2 + Math.random() * 1.6 : 1.1 + Math.random() * 1.4;
    ph[i] = Math.random() * 10;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  sg.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const starU = { uTime: { value: 0 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } };
  const starPts = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float size; attribute float phase; uniform float uTime; uniform float uPR; varying float vA;
      void main(){ vA = 0.55 + 0.45 * sin(uTime * (0.8 + phase * 0.2) + phase * 6.0);
        gl_PointSize = size * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vec3(1.0, 0.96, 0.88) * a * vA, a * vA); }`,
  }));
  starPts.renderOrder = -9;
  group.add(starPts);

  // moon
  const moonTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(110, 110, 10, 128, 128, 120);
    r.addColorStop(0, '#fffdf5'); r.addColorStop(0.75, '#f6e8c4'); r.addColorStop(1, '#e8d39d');
    g.fillStyle = r; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.09; g.fillStyle = '#8a7a5a';
    [[90, 100, 26], [160, 80, 18], [150, 160, 30], [100, 175, 14], [70, 140, 10]].forEach(([x, y, rr]) => { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const moonPos = MOON_DIR.clone().multiplyScalar(radius * 0.8);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthWrite: false, fog: false, color: 0xffffff }));
  moon.scale.setScalar(radius * 0.075);
  moon.position.copy(moonPos);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff0c8, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4, fog: false }));
  halo.scale.setScalar(radius * 0.42);
  halo.position.copy(moonPos);
  group.add(halo, moon);

  return {
    group, uniforms,
    update(t) { starU.uTime.value = t; },
  };
}

/* ------------------------------------------------------------------ */
/* Sky lanterns (โคมลอย)                                               */
/* ------------------------------------------------------------------ */
export function createLanterns({ count = 220, area = { x: 260, zNear: -40, zFar: -330 }, height = 140 } = {}) {
  const pos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4); // speed, phase, size, order
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * area.x, Math.random() * height, area.zNear + Math.random() * (area.zFar - area.zNear)], i * 3);
    data.set([0.6 + Math.random() * 1.1, Math.random() * 100, 0.7 + Math.random() * 0.8, i / count], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('data', new THREE.BufferAttribute(data, 4));
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 0.08 }, uBright: { value: 0.4 }, uHeight: { value: height }, uScale: { value: 1500 * Math.min(window.devicePixelRatio || 1, 2) } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute vec4 data; uniform float uTime; uniform float uAmount; uniform float uHeight; uniform float uScale;
      varying float vA; varying float vFlick;
      void main() {
        vec3 p = position;
        float y = mod(p.y + uTime * data.x, uHeight);
        p.y = y + 4.0;
        p.x += sin(uTime * 0.12 + data.y) * 6.0;
        p.z += cos(uTime * 0.09 + data.y) * 4.0;
        float visible = step(data.w, uAmount);
        vA = visible * smoothstep(0.0, 12.0, y) * (1.0 - smoothstep(uHeight * 0.75, uHeight, y));
        vFlick = 0.8 + 0.2 * sin(uTime * 6.0 + data.y * 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = data.z * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright; varying float vA; varying float vFlick;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        // lantern body: rounded box, brighter at the bottom (flame)
        vec2 q = abs(uv * vec2(1.25, 1.0)) - vec2(0.18, 0.24);
        float body = 1.0 - smoothstep(0.0, 0.06, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
        float flame = exp(-pow(length(uv - vec2(0.0, 0.16)) * 7.0, 2.0));
        float halo = exp(-dot(uv, uv) * 10.0) * 0.6;
        vec3 col = vec3(1.0, 0.55, 0.18) * body * (0.55 + 0.6 * (uv.y + 0.3)) + vec3(1.0, 0.9, 0.6) * flame * 1.4 + vec3(1.0, 0.5, 0.15) * halo;
        float a = (body * 0.85 + flame + halo) * vA * uBright * vFlick;
        gl_FragColor = vec4(col * a, a);
      }`,
  }));
  pts.frustumCulled = false;
  return { points: pts, uniforms, update(t) { uniforms.uTime.value = t; } };
}

/* ------------------------------------------------------------------ */
/* Skyline (temples, trees) silhouettes                                */
/* ------------------------------------------------------------------ */
export function createSkyline({ width = 700, height = 60, z = -260, seed = 7 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const layer = (color, lights, scale, hBias) => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = color;
    const base = 256;
    // tree line
    g.beginPath(); g.moveTo(0, base);
    for (let x = 0; x <= 2048; x += 12) g.lineTo(x, base - 40 * hBias - rnd() * 26 * hBias - Math.sin(x * 0.01) * 10);
    g.lineTo(2048, base); g.fill();
    // temples: chedi (bell) and prang (corn-cob)
    let x = 60 + rnd() * 100;
    while (x < 2000) {
      const h = (60 + rnd() * 110) * scale;
      const w = h * (0.35 + rnd() * 0.2);
      g.beginPath();
      if (rnd() < 0.55) {
        // chedi
        g.moveTo(x - w / 2, base - 30);
        g.lineTo(x - w / 2, base - h * 0.25);
        g.quadraticCurveTo(x - w / 2, base - h * 0.62, x - w * 0.12, base - h * 0.66);
        g.lineTo(x - w * 0.06, base - h);
        g.lineTo(x + w * 0.06, base - h);
        g.lineTo(x + w * 0.12, base - h * 0.66);
        g.quadraticCurveTo(x + w / 2, base - h * 0.62, x + w / 2, base - h * 0.25);
        g.lineTo(x + w / 2, base - 30);
      } else {
        // prang / roof with chofa
        g.moveTo(x - w * 0.7, base - 30);
        g.lineTo(x - w * 0.55, base - h * 0.45);
        g.lineTo(x - w * 0.2, base - h * 0.55);
        g.quadraticCurveTo(x - w * 0.1, base - h * 1.0, x, base - h * 1.05);
        g.quadraticCurveTo(x + w * 0.1, base - h * 1.0, x + w * 0.2, base - h * 0.55);
        g.lineTo(x + w * 0.55, base - h * 0.45);
        g.lineTo(x + w * 0.7, base - 30);
      }
      g.closePath(); g.fill();
      if (lights) {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = `rgba(255,${170 + rnd() * 60},${80 + rnd() * 60},${0.5 + rnd() * 0.5})`;
          g.fillRect(x - w * 0.3 + rnd() * w * 0.6, base - 30 - rnd() * h * 0.3, 2, 2);
        }
        g.fillStyle = color;
      }
      x += w + 40 + rnd() * 220;
    }
    if (lights) {
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(255,${160 + rnd() * 80},${70 + rnd() * 70},${0.3 + rnd() * 0.6})`;
        const px = rnd() * 2048; const py = base - 6 - rnd() * 30;
        g.fillRect(px, py, 1.5 + rnd() * 1.5, 1.5 + rnd() * 1.5);
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const group = new THREE.Group();
  const far = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.3, height * 1.2), new THREE.MeshBasicMaterial({ map: layer('#1a1a40', false, 1.2, 1.6), transparent: true, fog: false, depthWrite: false }));
  far.position.set(0, height * 0.6 - 2, z - 60);
  const near = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: layer('#070815', true, 1, 1), transparent: true, fog: false, depthWrite: false }));
  near.position.set(0, height * 0.5 - 1.5, z);
  group.add(far, near);
  return { group };
}

/* ------------------------------------------------------------------ */
/* Expanding ripple rings (RingGeometry)                               */
/* ------------------------------------------------------------------ */
export function createRippleSystem(scene) {
  const geo = new THREE.RingGeometry(0.93, 1, 72);
  const list = [];
  return {
    spawn(x, z, { color = 0xfff1d0, maxScale = 4, life = 2.4, delay = 0 } = {}) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.06, z);
      scene.add(m);
      list.push({ m, age: -delay, life, maxScale });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        r.age += dt;
        if (r.age < 0) continue;
        const k = r.age / r.life;
        if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); list.splice(i, 1); continue; }
        const s = 0.4 + (r.maxScale - 0.4) * (1 - Math.pow(1 - k, 2.2));
        r.m.scale.set(s, s, s);
        r.m.material.opacity = (1 - k) * 0.38;
      }
    },
  };
}

/** Small floating sparkles above the water (fireflies / reflections). */
export function createSparkles({ count = 120, spread = 40, center = new THREE.Vector3() } = {}) {
  const pos = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([center.x + (Math.random() - 0.5) * spread, 0.3 + Math.random() * 2.5, center.z + (Math.random() - 0.5) * spread], i * 3);
    ph[i] = Math.random() * 20;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const uniforms = { uTime: { value: 0 }, uScale: { value: 60 * Math.min(window.devicePixelRatio || 1, 2) } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float phase; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec3 p = position; p.y += sin(uTime * 0.6 + phase) * 0.3; p.x += sin(uTime * 0.3 + phase * 2.0) * 0.5;
        vA = 0.5 + 0.5 * sin(uTime * 2.0 + phase * 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = exp(-d * d * 30.0) * vA;
      gl_FragColor = vec4(vec3(1.0, 0.85, 0.5) * a, a); }`,
  }));
  return { points: pts, update(t) { uniforms.uTime.value = t; } };
}
