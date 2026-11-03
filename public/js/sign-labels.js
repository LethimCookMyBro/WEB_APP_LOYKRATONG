// sign-labels.js — wish cards drawn as HTML on top of the WebGL canvas.
// HTML stays sharp at any distance, is not blurred by bloom, and we can keep a
// minimum on-screen size so far-away krathongs are still readable.
//
// Cards never cover each other: every frame they are laid out in screen space
// (nearest krathong first). A card that would overlap is moved up / sideways and
// joined to its krathong with a thin gold leader line; if no free spot exists
// the farther card is hidden until there is room again.
import * as THREE from 'three';

const v = new THREE.Vector3();
const SVGNS = 'http://www.w3.org/2000/svg';
const GAP = 10;   // px between the candle and the card bottom
const PAD = 6;    // px kept free around each card

// candidate offsets in units of (card width, card height); tried in this order
const CANDIDATES = [[0, 0]];
for (let k = 1; k <= 4; k++) {
  CANDIDATES.push([0, -0.62 * k]);
  CANDIDATES.push([-0.62, -0.5 * (k - 1)], [0.62, -0.5 * (k - 1)]);
  CANDIDATES.push([-1.1, -0.5 * k], [1.1, -0.5 * k]);
}

export class SignLayer {
  /**
   * @param {HTMLElement} container  element that holds the canvas (position: relative/fixed)
   * @param {THREE.Camera} camera
   * @param {object} opts { refDistance, minScale, maxScale, className, mode, nearCount }
   */
  constructor(container, camera, opts = {}) {
    this.camera = camera;
    this.opts = { refDistance: 26, minScale: 0.62, maxScale: 1.1, ...opts };
    this.root = document.createElement('div');
    this.root.className = 'sign-layer ' + (opts.className || '');
    this.lines = document.createElementNS(SVGNS, 'svg');
    this.lines.setAttribute('class', 'sign-lines');
    this.root.appendChild(this.lines);
    container.appendChild(this.root);
    this.items = new Map();
    this.mode = opts.mode || 'auto'; // auto | all | near | off
    this.nearCount = opts.nearCount || 45;
  }

  add(id, { image = null, name = '', isHost = false } = {}) {
    if (this.items.has(id)) return this.items.get(id);
    const el = document.createElement('div');
    el.className = 'sign-card' + (isHost ? ' host' : '') + ' fresh';
    const item = { el, visible: false, last: '', w: 0, h: 0, ox: 0, oy: 0, tx: 0, ty: 0, cand: 0, isHost, line: null };
    if (image) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('load', () => { item.w = 0; }); // re-measure once the image has a size
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
    const line = document.createElementNS(SVGNS, 'g');
    line.innerHTML = '<line/><circle r="2.5"/>';
    line.style.display = 'none';
    this.lines.appendChild(line);
    item.line = line;
    this.items.set(id, item);
    setTimeout(() => el.classList.remove('fresh'), 12000);
    return item;
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    it.el.remove();
    it.line.remove();
    this.items.delete(id);
  }

  clear() { for (const id of [...this.items.keys()]) this.remove(id); }

  setMode(mode) {
    this.mode = mode;
    this.root.style.display = mode === 'off' ? 'none' : '';
  }

  hide(it) {
    if (it.visible) { it.el.style.visibility = 'hidden'; it.line.style.display = 'none'; it.visible = false; }
  }

  /**
   * @param {Array<{id:string, x:number, y:number, z:number, scale?:number, alpha?:number}>} anchors
   *   world positions of the point the card should sit on (bottom centre)
   */
  update(anchors) {
    if (this.mode === 'off') return;
    const W = this.root.clientWidth; const H = this.root.clientHeight;
    const cam = this.camera.position;
    const { refDistance, minScale, maxScale } = this.opts;

    // 1. project + priority (fresh first, then nearest)
    const cands = [];
    for (const a of anchors) {
      const it = this.items.get(a.id);
      if (!it) continue;
      v.set(a.x, a.y, a.z).project(this.camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.4) continue;
      const dist = Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z);
      if (!it.w) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
      const s = Math.min(maxScale, Math.max(minScale, refDistance / dist)) * (a.scale || 1);
      const fresh = it.el.classList.contains('fresh');
      cands.push({ a, it, dist, s, ax: (v.x * 0.5 + 0.5) * W, ay: (-v.y * 0.5 + 0.5) * H, prio: dist - (fresh ? 1000 : 0) - (it.isHost ? 500 : 0) });
    }
    cands.sort((p, q) => p.prio - q.prio);
    const limit = this.mode === 'near' ? 25 : this.mode === 'auto' ? this.nearCount : Infinity;

    // 2. greedy, collision-free placement
    const placed = [];
    const shown = new Set();
    const overlaps = (x0, y0, x1, y1) => {
      for (const r of placed) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true;
      return false;
    };
    for (const c of cands) {
      if (shown.size >= limit) break;
      const { it, s, ax, ay } = c;
      const w = it.w * s; const h = it.h * s;
      const tryOffset = (k) => {
        const [fx, fy] = CANDIDATES[k];
        const cx = ax + fx * w; const by = ay - GAP + fy * h; // card bottom-centre
        const x0 = cx - w / 2 - PAD; const x1 = cx + w / 2 + PAD; const y0 = by - h - PAD; const y1 = by + PAD;
        if (x0 < 0 || x1 > W || y0 < 0 || y1 > H + h * 0.3) return null;
        return overlaps(x0, y0, x1, y1) ? null : [x0, y0, x1, y1, cx, by];
      };
      // keep last frame's spot if it is still free (stops cards from jumping around)
      let spot = tryOffset(it.cand);
      let k = it.cand;
      if (!spot) {
        for (k = 0; k < CANDIDATES.length && !spot; k++) spot = tryOffset(k);
        k--;
      } else if (it.cand !== 0 && tryOffset(0)) { spot = tryOffset(0); k = 0; }
      if (!spot) continue; // no free room: hide this (farther) card for now
      it.cand = k;
      placed.push(spot);
      shown.add(c.a.id);
      const tx = spot[4] - ax; const ty = spot[5] - ay;
      // ease towards the new spot
      if (!it.visible) { it.ox = tx; it.oy = ty; }
      it.ox += (tx - it.ox) * 0.25; it.oy += (ty - it.oy) * 0.25;
      const cx = ax + it.ox; const by = ay + it.oy;
      const tr = `translate3d(${cx.toFixed(1)}px,${by.toFixed(1)}px,0) translate(-50%,-100%) scale(${s.toFixed(3)})`;
      if (tr !== it.last) { it.el.style.transform = tr; it.last = tr; }
      it.el.style.zIndex = String(100000 - Math.round(c.dist * 100));
      const alpha = c.a.alpha ?? 1;
      it.el.style.opacity = alpha < 1 ? alpha.toFixed(2) : '';
      // leader line from the card to its krathong
      const [ln, dot] = it.line.children;
      ln.setAttribute('x1', cx.toFixed(1)); ln.setAttribute('y1', by.toFixed(1));
      ln.setAttribute('x2', ax.toFixed(1)); ln.setAttribute('y2', ay.toFixed(1));
      dot.setAttribute('cx', ax.toFixed(1)); dot.setAttribute('cy', ay.toFixed(1));
      it.line.style.opacity = alpha < 1 ? alpha.toFixed(2) : '';
      if (!it.visible) { it.el.style.visibility = 'visible'; it.line.style.display = ''; it.visible = true; }
    }
    for (const [id, it] of this.items) if (!shown.has(id)) this.hide(it);
  }

  dispose() { this.root.remove(); this.items.clear(); }
}
