// sign-labels.js — wish cards drawn as HTML on top of the WebGL canvas.
// HTML stays sharp at any distance, is not blurred by bloom, and we can keep a
// minimum on-screen size so far-away krathongs are still readable.
import * as THREE from 'three';

const v = new THREE.Vector3();

export class SignLayer {
  /**
   * @param {HTMLElement} container  element that holds the canvas (position: relative/fixed)
   * @param {THREE.Camera} camera
   * @param {object} opts { refDistance, minScale, maxScale, className }
   */
  constructor(container, camera, opts = {}) {
    this.camera = camera;
    this.opts = { refDistance: 26, minScale: 0.62, maxScale: 1.1, ...opts };
    this.root = document.createElement('div');
    this.root.className = 'sign-layer ' + (opts.className || '');
    container.appendChild(this.root);
    this.items = new Map();
    this.mode = opts.mode || 'auto'; // auto | all | near | off
    this.nearCount = opts.nearCount || 45;
  }

  add(id, { image = null, name = '', isHost = false } = {}) {
    if (this.items.has(id)) return this.items.get(id);
    const el = document.createElement('div');
    el.className = 'sign-card' + (isHost ? ' host' : '') + ' fresh';
    if (image) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.src = image;
      el.appendChild(img);
    }
    if (name) {
      const n = document.createElement('div');
      n.className = 'sign-name';
      n.textContent = name;
      el.appendChild(n);
    }
    if (!image && !name) el.classList.add('empty');
    el.style.visibility = 'hidden';
    this.root.appendChild(el);
    const item = { el, visible: false, last: '' };
    this.items.set(id, item);
    setTimeout(() => el.classList.remove('fresh'), 12000);
    return item;
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    it.el.remove();
    this.items.delete(id);
  }

  clear() { for (const id of [...this.items.keys()]) this.remove(id); }

  setMode(mode) {
    this.mode = mode;
    this.root.style.display = mode === 'off' ? 'none' : '';
  }

  /**
   * @param {Array<{id:string, x:number, y:number, z:number, scale?:number, alpha?:number}>} anchors
   *   world positions of the point the card should sit on (bottom centre)
   */
  update(anchors) {
    if (this.mode === 'off') return;
    const w = this.root.clientWidth; const h = this.root.clientHeight;
    const cam = this.camera.position;
    const { refDistance, minScale, maxScale } = this.opts;
    let list = anchors;
    // 'near' (or 'auto' when crowded): only the nearest cards + newly arrived ones
    const limit = this.mode === 'near' ? 25 : this.mode === 'auto' ? this.nearCount : Infinity;
    if (anchors.length > limit) {
      const fresh = anchors.filter((a) => this.items.get(a.id)?.el.classList.contains('fresh'));
      const near = anchors.map((a) => ({ a, d: (a.x - cam.x) ** 2 + (a.y - cam.y) ** 2 + (a.z - cam.z) ** 2 }))
        .sort((p, q) => p.d - q.d).slice(0, limit).map((p) => p.a);
      list = [...new Set([...near, ...fresh])];
    }
    const seen = new Set();
    for (const a of list) {
      const it = this.items.get(a.id);
      if (!it) continue;
      seen.add(a.id);
      v.set(a.x, a.y, a.z).project(this.camera);
      if (v.z > 1 || v.x < -1.3 || v.x > 1.3 || v.y < -1.3 || v.y > 1.5) {
        if (it.visible) { it.el.style.visibility = 'hidden'; it.visible = false; }
        continue;
      }
      const dist = Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z);
      const s = Math.min(maxScale, Math.max(minScale, refDistance / dist)) * (a.scale || 1);
      const sx = (v.x * 0.5 + 0.5) * w; const sy = (-v.y * 0.5 + 0.5) * h;
      const tr = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%) scale(${s.toFixed(3)})`;
      if (tr !== it.last) { it.el.style.transform = tr; it.last = tr; }
      it.el.style.zIndex = String(100000 - Math.round(dist * 100));
      const alpha = a.alpha ?? 1;
      it.el.style.opacity = alpha < 1 ? alpha.toFixed(2) : '';
      if (!it.visible) { it.el.style.visibility = 'visible'; it.visible = true; }
    }
    for (const [id, it] of this.items) {
      if (!seen.has(id) && it.visible) { it.el.style.visibility = 'hidden'; it.visible = false; }
    }
  }

  dispose() { this.root.remove(); this.items.clear(); }
}
