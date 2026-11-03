// float-scene.js — first-person "release your krathong" scene used on the
// participant phone and the host ceremony pad. The horizon is kept just above
// the top edge so a launched krathong drifts away and leaves through the top.
import * as THREE from 'three';
import { createRenderer, createWater, createSky, createSparkles, createRippleSystem, waveHeight, MOON_DIR, createClock } from './scene-env.js';
import { createKrathong, preloadKrathongModel } from './krathong-model.js';
import { SignLayer } from './sign-labels.js';

const REST = new THREE.Vector3(0, 0, 2);

export async function createFloatScene(canvas, opts = {}) {
  await preloadKrathongModel();
  const isMobile = matchMedia('(pointer: coarse)').matches;
  const env = createRenderer(canvas, { pixelRatio: isMobile ? 1.6 : 2, bloomStrength: 0.85, bloomScale: 0.5 });
  const { scene, camera } = env;
  scene.fog = new THREE.Fog(0x0b0f2a, 30, 120);

  const water = createWater({ size: 400, segments: 120, fogNear: 25, fogFar: 110 });
  water.uniforms.uCeremony.value = opts.opened ? 1 : 0.45;
  scene.add(water.mesh);
  const sky = createSky({ radius: 300, stars: 600 });
  scene.add(sky.group);
  const sparkles = createSparkles({ count: 70, spread: 26, center: new THREE.Vector3(0, 0, -4) });
  scene.add(sparkles.points);
  const ripples = createRippleSystem(scene);

  scene.add(new THREE.HemisphereLight(0x6a78c8, 0x0a0c1c, 0.55));
  const moonLight = new THREE.DirectionalLight(0xc8d4ff, 0.7);
  moonLight.position.copy(MOON_DIR).multiplyScalar(50);
  scene.add(moonLight);

  // distant krathongs (just glows) for atmosphere
  const distant = [];
  for (let i = 0; i < 9; i++) {
    distant.push(new THREE.Vector4((Math.random() - 0.5) * 30, 0, -10 - Math.random() * 40, 0.5 + Math.random() * 0.4));
  }

  // camera: horizon just above the top edge
  function placeCamera() {
    const aspect = camera.aspect;
    camera.fov = aspect < 0.8 ? 60 : 48;
    const dist = aspect < 0.8 ? 7.2 : 6.6;
    camera.position.set(0, aspect < 0.8 ? 4.2 : 3.8, dist);
    const pitch = THREE.MathUtils.degToRad(camera.fov / 2 + 3);
    camera.rotation.set(-pitch, 0, 0, 'YXZ');
    camera.updateProjectionMatrix();
  }
  placeCamera();

  // wish card as crisp HTML above the candle (not blurred by bloom)
  const signs = new SignLayer(opts.labelContainer || canvas.parentElement, camera, {
    className: opts.labelClass || 'mobile', refDistance: 7, minScale: 0.35, maxScale: 1.0,
  });
  let k = null;
  function setKrathong({ colors, signImage, signText, signSubText, isHost } = {}) {
    if (k) { scene.remove(k.group); k.dispose(); }
    k = createKrathong({ colors, isHost, light: true, sign: false, smoke: isMobile ? 10 : 16 });
    signs.clear();
    const src = signImage ? (signImage.src || (signImage.toDataURL ? signImage.toDataURL() : null)) : null;
    signs.add('me', { image: src, name: [signText, signSubText].filter(Boolean).join(' · ') || opts.signName || '', isHost });
    k.group.position.copy(REST);
    scene.add(k.group);
    state = 'rest';
    launchT = 0; drag = 0;
    k.group.visible = true;
    k.setOpacity(1);
    return k;
  }
  let state = 'rest'; // rest | launching | gone
  let launchT = 0; let drag = 0; let dragTarget = 0; let launchPower = 1; let exitFired = false;
  let locked = !!opts.locked;
  let bounce = 0;
  setKrathong(opts);

  /* ---------- gestures ---------- */
  const el = opts.gestureElement || canvas;
  let startY = null; let lastY = 0; let lastT = 0; let vel = 0; let pointerId = null;
  function onDown(e) {
    if (state !== 'rest') return;
    pointerId = e.pointerId;
    startY = lastY = e.clientY; lastT = performance.now(); vel = 0;
    el.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    if (startY === null || e.pointerId !== pointerId) return;
    const now = performance.now();
    const dy = e.clientY - lastY;
    vel = 0.8 * vel + 0.2 * (dy / Math.max(1, now - lastT));
    lastY = e.clientY; lastT = now;
    const total = startY - e.clientY; // positive = up
    dragTarget = Math.max(0, Math.min(1, total / (el.clientHeight * 0.35)));
    if (locked) dragTarget *= 0.25;
  }
  function onUp(e) {
    if (startY === null || e.pointerId !== pointerId) return;
    const total = startY - e.clientY;
    startY = null;
    const fast = vel < -0.45;
    if (total > el.clientHeight * 0.12 || (fast && total > 30)) {
      if (locked) { bounce = 1; dragTarget = 0; opts.onLockedAttempt?.(); return; }
      launch(Math.min(1.6, Math.max(0.8, -vel * 1.2)));
    } else {
      dragTarget = 0;
    }
  }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  function launch(power = 1) {
    if (state !== 'rest' || locked) return false;
    state = 'launching';
    launchT = 0; launchPower = power; exitFired = false;
    ripples.spawn(k.group.position.x, k.group.position.z, { maxScale: 3.5 });
    opts.onLaunch?.();
    // safety net for slow devices (low FPS): always hand over within 7 s of real time
    const launchedK = k;
    setTimeout(() => {
      if (running && k === launchedK && state === 'launching' && !exitFired) {
        exitFired = true; state = 'gone'; opts.onExit?.();
      }
    }, 7000);
    return true;
  }

  /* ---------- loop ---------- */
  const clock = createClock();
  let raf = 0; let running = true;
  const tmp = new THREE.Vector3();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    water.update(t); sky.update(t); sparkles.update(t); ripples.update(dt);
    const lights = distant.map((d) => ({ x: d.x, y: 0, z: d.z, w: d.w }));
    if (k) {
      drag += (dragTarget - drag) * Math.min(1, dt * 10);
      if (bounce > 0) bounce = Math.max(0, bounce - dt * 2.2);
      const g = k.group;
      if (state === 'rest') {
        g.position.z = REST.z - drag * 1.6;
        g.position.x = Math.sin(bounce * Math.PI * 4) * 0.25 * bounce;
      } else if (state === 'launching') {
        launchT += dt * launchPower;
        const u = Math.min(1, launchT / 5.5);
        const ease = u * u * (3 - 2 * u) * 0.35 + u * u * 0.65;
        g.position.z = REST.z - drag * 1.6 - ease * 85;
        g.position.x = Math.sin(launchT * 0.8) * 0.6 * u;
        if (!exitFired) {
          tmp.copy(g.position).y += 0.9;
          tmp.project(camera);
          if (tmp.y > 1.02 || u >= 1) {
            exitFired = true;
            state = 'gone';
            opts.onExit?.();
          }
        }
      }
      g.position.y = waveHeight(g.position.x, g.position.z, t) + Math.sin(t * 1.3) * 0.035;
      g.rotation.z = Math.cos(t * 1.1) * 0.05;
      g.rotation.x = Math.sin(t * 0.9) * 0.04 - drag * 0.08;
      g.rotation.y = Math.sin(t * 0.2) * 0.2;
      k.update(t, dt);
      if (state !== 'gone') lights.push({ x: g.position.x, y: 0, z: g.position.z, w: 1.25 });
      g.visible = state !== 'gone';
      camera.updateMatrixWorld();
      signs.update(state === 'gone' ? [] : [{ id: 'me', x: g.position.x, y: g.position.y + 1.35, z: g.position.z }]);
    }
    water.setLights(lights);
    env.render();
  }
  frame();

  const onResize = () => { env.resize(); placeCamera(); };
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);

  return {
    get krathong() { return k; },
    setKrathong,
    setLocked(v) { locked = v; },
    launch,
    reset() { setKrathong({ colors: k?.colors, ...opts.lastKrathong }); },
    celebrate() {
      water.ripple(REST.x, REST.z, 1);
      k?.flash();
      ripples.spawn(REST.x, REST.z, { color: 0xffd27a, maxScale: 8, life: 3 });
      let v = water.uniforms.uCeremony.value;
      const id = setInterval(() => { v = Math.min(1, v + 0.03); water.uniforms.uCeremony.value = v; if (v >= 1) clearInterval(id); }, 50);
    },
    setOpened(v) { water.uniforms.uCeremony.value = v ? 1 : 0.45; },
    destroy() {
      running = false; cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize); ro.disconnect();
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
      k?.dispose(); signs.dispose(); env.renderer.dispose();
    },
  };
}
