// pattern-view.js — writing practice ("pattern view").
//  • Japanese: real stroke order from KanjiVG, animated stroke by stroke with
//    numbered strokes, on a 十字 practice grid.
//  • Thai: dashed tracing outline in a looped (หัวกลม) font on 4-line paper,
//    animated character by character. (No stroke-order dataset exists for Thai,
//    so this is a tracing guide, not a stroke-order guide.)
import { STROKES as BUNDLED } from './data/stroke-data-ja.js';

// bundled kana + wish kanji, extended at runtime from /api/strokes
const STROKES = { ...BUNDLED };
const requested = new Set();
async function fetchMissing(text) {
  const missing = [...new Set([...text])].filter((c) => /[\u3041-\u30ff\u3005\u4e00-\u9fff]/u.test(c) && !STROKES[c] && !requested.has(c));
  if (!missing.length) return false;
  missing.forEach((c) => requested.add(c));
  try {
    const res = await fetch('/api/strokes?c=' + encodeURIComponent(missing.join('')));
    if (!res.ok) return false;
    const data = await res.json();
    Object.assign(STROKES, data);
    return Object.keys(data).length > 0;
  } catch { return false; }
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

export function graphemes(text) {
  if (window.Intl && Intl.Segmenter) {
    return [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  }
  return text.match(/[฀-๿][ัิ-ฺ็-๎]*|./gsu) || [];
}

/* ------------------------------------------------------------------ */
/* Japanese                                                            */
/* ------------------------------------------------------------------ */
function jaCell(ch, size) {
  const cell = document.createElement('div');
  cell.className = 'pcell' + (size === 'lg' ? ' lg' : '');
  const svg = el('svg', { viewBox: '0 0 109 109', 'aria-label': ch });
  cell.appendChild(svg);
  // practice grid
  el('line', { x1: 54.5, y1: 4, x2: 54.5, y2: 105, stroke: '#e6c9a8', 'stroke-width': 0.8, 'stroke-dasharray': '3 3' }, svg);
  el('line', { x1: 4, y1: 54.5, x2: 105, y2: 54.5, stroke: '#e6c9a8', 'stroke-width': 0.8, 'stroke-dasharray': '3 3' }, svg);
  const data = STROKES[ch];
  const strokes = [];
  if (!data) {
    const t = el('text', { x: 54.5, y: 80, 'text-anchor': 'middle', 'font-size': 72, fill: '#3a2b1b', 'font-family': "'Klee One','Noto Sans JP',serif" }, svg);
    t.textContent = ch;
    return { cell, strokes };
  }
  // ghost (dashed) strokes for tracing
  data.s.forEach((d) => el('path', { d, fill: 'none', stroke: '#d8c8b2', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '1 6.5' }, svg));
  const ink = el('g', {}, svg);
  const nums = el('g', {}, svg);
  data.s.forEach((d, i) => {
    const p = el('path', { d, fill: 'none', stroke: '#2b2118', 'stroke-width': 4.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ink);
    const n = data.n[i];
    let label = null;
    if (n) {
      label = el('text', { x: n[0], y: n[1], 'font-size': 9, fill: '#e0473a', 'font-weight': 700, 'font-family': 'system-ui,sans-serif', opacity: 0 }, nums);
      label.textContent = String(i + 1);
    }
    strokes.push({ path: p, label });
  });
  return { cell, strokes };
}

function renderJapanese(container, text, { size }) {
  const grid = document.createElement('div');
  grid.className = 'pattern-grid';
  container.appendChild(grid);
  const all = [];
  for (const ch of [...text]) {
    if (ch === ' ' || ch === '　') {
      const gap = document.createElement('div');
      gap.style.width = '100%'; gap.style.height = '0';
      grid.appendChild(gap);
      continue;
    }
    const { cell, strokes } = jaCell(ch, size);
    grid.appendChild(cell);
    all.push(...strokes);
  }
  let timers = [];
  function prepare() {
    all.forEach(({ path, label }) => {
      const len = path.getTotalLength();
      path.style.transition = 'none';
      path.style.strokeDasharray = `${len} ${len}`;
      path.style.strokeDashoffset = String(len);
      path.style.stroke = '#e0473a';
      if (label) label.setAttribute('opacity', 0);
    });
  }
  function play(speed = 1) {
    timers.forEach(clearTimeout); timers = [];
    prepare();
    let tAcc = 120;
    all.forEach(({ path, label }) => {
      const len = path.getTotalLength();
      const dur = Math.max(220, len * 9) / speed;
      timers.push(setTimeout(() => {
        path.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(.4,.1,.4,1)`;
        path.style.strokeDashoffset = '0';
        if (label) label.setAttribute('opacity', 1);
        timers.push(setTimeout(() => { path.style.transition += ', stroke 400ms'; path.style.stroke = '#2b2118'; }, dur));
      }, tAcc));
      tAcc += dur + 90 / speed;
    });
    return tAcc;
  }
  function showAll() {
    timers.forEach(clearTimeout); timers = [];
    all.forEach(({ path, label }) => {
      path.style.transition = 'none'; path.style.strokeDasharray = 'none'; path.style.strokeDashoffset = '0';
      path.style.stroke = '#2b2118'; if (label) label.setAttribute('opacity', 1);
    });
  }
  return { play, showAll, stop() { timers.forEach(clearTimeout); }, strokeCount: all.length };
}

/* ------------------------------------------------------------------ */
/* Thai                                                                */
/* ------------------------------------------------------------------ */
function renderThai(container, text) {
  const wrap = document.createElement('div');
  wrap.className = 'pattern-line';
  container.appendChild(wrap);
  const fs = 72; const H = 132;
  const lines = { top: 22, xTop: 50, base: 92, bottom: 116 };
  const svg = el('svg', { viewBox: `0 0 400 ${H}`, height: H });
  wrap.appendChild(svg);
  const guides = el('g', {}, svg);
  const font = "'Noto Sans Thai Looped','Noto Sans Thai',sans-serif";
  const ghost = el('text', { x: 12, y: lines.base, 'font-size': fs, 'font-family': font, fill: 'none', stroke: '#c9b79d', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, svg);
  const ink = el('text', { x: 12, y: lines.base, 'font-size': fs, 'font-family': font, fill: 'none', stroke: 'none' }, svg);
  const clusters = graphemes(text);
  const spans = clusters.map((c) => {
    const ts = el('tspan', {}, ink);
    ts.textContent = c;
    return ts;
  });
  ghost.textContent = text;

  function layout() {
    let w = 400;
    try { w = Math.max(200, ghost.getComputedTextLength() + 24); } catch { /* not rendered yet */ }
    svg.setAttribute('viewBox', `0 0 ${w} ${H}`);
    svg.setAttribute('width', Math.round(w * 1.0));
    guides.innerHTML = '';
    Object.entries(lines).forEach(([k, y]) => el('line', {
      x1: 0, x2: w, y1: y, y2: y, stroke: k === 'base' ? '#e0b98f' : '#efdcc4', 'stroke-width': k === 'base' ? 1.2 : 0.8,
      'stroke-dasharray': k === 'base' ? '' : '4 4',
    }, guides));
  }
  layout();
  if (document.fonts) document.fonts.ready.then(layout);

  let timers = [];
  function prepare() {
    spans.forEach((s) => {
      s.style.transition = 'none';
      s.style.fill = 'transparent'; s.style.stroke = '#e0473a'; s.style.strokeWidth = '1.4';
      s.style.strokeDasharray = '600'; s.style.strokeDashoffset = '600';
    });
  }
  function play(speed = 1) {
    timers.forEach(clearTimeout); timers = [];
    layout(); prepare();
    let tAcc = 150;
    spans.forEach((s) => {
      const dur = 900 / speed;
      timers.push(setTimeout(() => {
        s.style.transition = `stroke-dashoffset ${dur}ms ease-in-out, fill 500ms ${dur * 0.7}ms`;
        s.style.strokeDashoffset = '0';
        s.style.fill = '#2b2118';
      }, tAcc));
      tAcc += dur * 0.75;
    });
    return tAcc;
  }
  function showAll() {
    timers.forEach(clearTimeout); timers = [];
    spans.forEach((s) => { s.style.transition = 'none'; s.style.fill = '#2b2118'; s.style.strokeDashoffset = '0'; s.style.stroke = 'none'; });
  }
  return { play, showAll, stop() { timers.forEach(clearTimeout); }, strokeCount: spans.length };
}

/**
 * Render a practice pattern into `container`.
 * @param {HTMLElement} container
 * @param {{text:string, script:'ja'|'th', size?:'md'|'lg', autoplay?:boolean, labels?:object}} opts
 */
export function renderPattern(container, { text, script, size = 'md', autoplay = true, labels = {} }) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'pattern';
  container.appendChild(box);
  const ctrl = script === 'ja' ? renderJapanese(box, text, { size }) : renderThai(box, text);
  const controls = document.createElement('div');
  controls.className = 'pattern-controls';
  const mk = (label, fn, cls = 'btn btn-sm') => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.innerHTML = label; b.onclick = fn;
    controls.appendChild(b); return b;
  };
  mk(`<span class="ico">▶</span> ${labels.play || 'Play'}`, () => ctrl.play(1), 'btn btn-sm btn-primary');
  mk(`<span class="ico">🐢</span> ${labels.slow || 'Slow'}`, () => ctrl.play(0.45));
  mk(`<span class="ico">◼</span> ${labels.all || 'All'}`, () => ctrl.showAll());
  box.appendChild(controls);
  if (autoplay) setTimeout(() => ctrl.play(1), 250);
  if (script === 'ja') {
    // get real stroke order for characters we do not ship, then re-render once
    fetchMissing(text).then((got) => {
      if (got && box.isConnected) { ctrl.stop(); renderPattern(container, { text, script, size, autoplay, labels }); }
    });
  }
  return ctrl;
}

/* ------------------------------------------------------------------ */
/* One big character, for the on-screen writing pad                    */
/* ------------------------------------------------------------------ */

const THAI_FONT = "'Noto Sans Thai Looped','Noto Sans Thai',sans-serif";
const JA_FONT = "'Klee One','Noto Sans JP',serif";

/**
 * Draw one character (Japanese) or one Thai cluster into `svg` as a lesson:
 * a light grey letter to trace, red stroke-order numbers (Japanese), and a
 * play() animation that writes the letter in red and then fades back.
 * @returns {{play(speed?:number):void, stop():void, setGuide(on:boolean):void}}
 */
export function charLesson(svg, ch, script, { onUpdate } = {}) {
  let timers = [];
  let guideOn = true;
  let anim = [];      // elements animated by play()
  let ghost = null;   // layer hidden by setGuide(false)
  const stop = () => { timers.forEach(clearTimeout); timers = []; };

  function build() {
    stop();
    svg.innerHTML = '';
    anim = [];
    if (script === 'ja') {
      svg.setAttribute('viewBox', '0 0 109 109');
      const grid = el('g', { stroke: '#e6c9a8', 'stroke-width': 0.6, 'stroke-dasharray': '2.5 2.5' }, svg);
      el('line', { x1: 54.5, y1: 3, x2: 54.5, y2: 106 }, grid);
      el('line', { x1: 3, y1: 54.5, x2: 106, y2: 54.5 }, grid);
      ghost = el('g', {}, svg);
      const data = STROKES[ch];
      if (!data) {
        const tx = el('text', { x: 54.5, y: 84, 'text-anchor': 'middle', 'font-size': 80, fill: '#e2d5c2', 'font-family': JA_FONT }, ghost);
        tx.textContent = ch;
        return;
      }
      data.s.forEach((d) => el('path', { d, fill: 'none', stroke: '#e4d8c6', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ghost));
      const ink = el('g', {}, svg);
      data.s.forEach((d) => anim.push(el('path', { d, fill: 'none', stroke: '#e0473a', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0 }, ink)));
      const nums = el('g', {}, ghost);
      data.n.forEach((p, i) => {
        if (!p) return;
        el('circle', { cx: p[0] + 2.2, cy: p[1] - 2.8, r: 4.2, fill: '#fff6ef', opacity: 0.9 }, nums);
        const tx = el('text', { x: p[0] + 2.2, y: p[1] - 0.2, 'text-anchor': 'middle', 'font-size': 7.2, fill: '#d13a2e', 'font-weight': 700, 'font-family': 'system-ui,sans-serif' }, nums);
        tx.textContent = String(i + 1);
      });
    } else {
      svg.setAttribute('viewBox', '0 0 100 100');
      const fs = 50; const base = 68;
      let xh = 26; // x-height in px, measured below when the font is ready
      try {
        const g = document.createElement('canvas').getContext('2d');
        g.font = `${fs}px ${THAI_FONT}`;
        const m = g.measureText('ก');
        if (m.actualBoundingBoxAscent) xh = m.actualBoundingBoxAscent;
      } catch { /* keep the estimate */ }
      const lines = { top: base - xh - 16, xTop: base - xh, base, bottom: base + 14 };
      Object.entries(lines).forEach(([k, y]) => el('line', {
        x1: 2, x2: 98, y1: y, y2: y, stroke: k === 'base' ? '#e0b98f' : '#efdcc4', 'stroke-width': k === 'base' ? 0.9 : 0.6,
        'stroke-dasharray': k === 'base' ? '' : '2.5 2.5',
      }, svg));
      ghost = el('g', {}, svg);
      const gt = el('text', { x: 50, y: base, 'text-anchor': 'middle', 'font-size': fs, fill: '#e4d8c6', 'font-family': THAI_FONT }, ghost);
      gt.textContent = ch;
      const at = el('text', { x: 50, y: base, 'text-anchor': 'middle', 'font-size': fs, fill: 'transparent', stroke: '#e0473a', 'stroke-width': 1.1, 'font-family': THAI_FONT, opacity: 0 }, svg);
      at.textContent = ch;
      anim.push(at);
    }
    ghost.style.transition = 'opacity .25s';
    ghost.style.opacity = guideOn ? '1' : '0';
  }

  function play(speed = 1) {
    stop();
    if (!anim.length) return;
    if (script === 'ja') {
      let tAcc = 80;
      anim.forEach((p) => {
        const len = p.getTotalLength();
        p.style.transition = 'none';
        p.style.strokeDasharray = `${len} ${len}`; p.style.strokeDashoffset = String(len);
        p.setAttribute('opacity', 1);
      });
      anim.forEach((p) => {
        const len = p.getTotalLength();
        const dur = Math.max(260, len * 10) / speed;
        timers.push(setTimeout(() => { p.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(.4,.1,.4,1)`; p.style.strokeDashoffset = '0'; }, tAcc));
        tAcc += dur + 120 / speed;
      });
      timers.push(setTimeout(() => anim.forEach((p) => { p.style.transition = 'opacity .8s'; p.setAttribute('opacity', 0); }), tAcc + 700));
    } else {
      const tx = anim[0];
      tx.style.transition = 'none';
      tx.style.strokeDasharray = '400'; tx.style.strokeDashoffset = '400'; tx.style.fill = 'transparent';
      tx.setAttribute('opacity', 1);
      const dur = 1600 / speed;
      timers.push(setTimeout(() => { tx.style.transition = `stroke-dashoffset ${dur}ms ease-in-out, fill 500ms ${dur * 0.8}ms`; tx.style.strokeDashoffset = '0'; tx.style.fill = 'rgba(224,71,58,.85)'; }, 60));
      timers.push(setTimeout(() => { tx.style.transition = 'opacity .8s'; tx.setAttribute('opacity', 0); }, dur + 1300));
    }
  }

  build();
  if (script === 'ja' && !STROKES[ch]) {
    fetchMissing(ch).then((got) => { if (got && svg.isConnected) { build(); onUpdate?.(); } });
  }
  if (script === 'th' && document.fonts) document.fonts.ready.then(() => { if (svg.isConnected) build(); });
  return {
    play,
    stop() { stop(); anim.forEach((p) => p.setAttribute('opacity', 0)); },
    setGuide(on) { guideOn = on; if (ghost) ghost.style.opacity = on ? '1' : '0'; },
  };
}
