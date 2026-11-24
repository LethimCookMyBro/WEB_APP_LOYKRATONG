// write-pad.js — write your name and wish on the phone screen, one letter at a
// time, in a big box with a grey letter to trace and a "how to write" lesson
// (stroke order for Japanese, a tracing animation for Thai).
// The letters are then put together into one handwriting image (transparent
// PNG), the same kind of image a photo of paper produces.
import { charLesson, graphemes } from './pattern-view.js';
import { canvasToDataURL, makeCanvas } from './image-processor.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PENS = ['#1b1b1b', '#c0392b', '#1e5bb8', '#1f7a43'];
const LEADING_VOWELS = /^[เแโใไ]$/;
const isSpace = (c) => /^\s+$/.test(c);
// drawings are kept while the page is open, so closing the pad loses nothing
const memo = new Map();

/** Split a line into the units written one per box. */
export function unitsOf(text, script) {
  const parts = script === 'th' ? graphemes(text) : [...text];
  return parts.filter((c) => c !== '');
}

/**
 * @param {{lines:{key:string,label:string,text:string,script:'ja'|'th'}[], s:Object, onDone:(dataURL:string)=>void, toast?:Function, vibrate?:Function}} opts
 *   s = strings: title, how, slow, guide, undo, clear, prev, next, done, strokeTip, thaiTip, empty, close
 */
export function openWritePad({ lines, s, onDone, toast = () => {}, vibrate = () => {} }) {
  const key = lines.map((l) => `${l.script}:${l.text}`).join('|');
  const units = memo.get(key) || lines.flatMap((l, li) => unitsOf(l.text, l.script).map((ch) => ({
    li, ch, script: l.script, space: isSpace(ch), strokes: [],
  })));
  memo.set(key, units);
  const order = units.map((u, i) => i).filter((i) => !units[i].space);
  if (!order.length) return;
  let pos = Math.max(0, order.findIndex((i) => !units[i].strokes.length));
  let pen = PENS[0];
  let guide = true;
  let lesson = null;

  const view = h(`<div class="wp" role="dialog" aria-modal="true" aria-label="${esc(s.title)}">
    <header class="wp-top">
      <button class="wp-x" data-a="close" aria-label="${esc(s.close)}">✕</button>
      <div class="wp-title">${esc(s.title)}</div>
      <button class="wp-finish" data-a="finish">✓ ${esc(s.done)}</button>
    </header>
    <div class="wp-lines"></div>
    <div class="wp-box"><svg class="wp-lesson" aria-hidden="true"></svg><canvas></canvas><div class="wp-count"></div></div>
    <p class="wp-tip"></p>
    <div class="wp-tools">
      <button class="wp-tool primary" data-a="play">▶ ${esc(s.how)}</button>
      <button class="wp-tool" data-a="slow">🐢 ${esc(s.slow)}</button>
      <button class="wp-tool" data-a="guide" aria-pressed="true">👁 ${esc(s.guide)}</button>
      <button class="wp-tool" data-a="undo">↶ ${esc(s.undo)}</button>
      <button class="wp-tool" data-a="clear">🗑 ${esc(s.clear)}</button>
    </div>
    <div class="wp-pens">${PENS.map((p, i) => `<button type="button" style="background:${p}" class="${i ? '' : 'on'}" data-pen="${p}" aria-label="pen ${i + 1}"></button>`).join('')}</div>
    <div class="wp-nav">
      <button class="btn wp-prev" data-a="prev">‹ ${esc(s.prev)}</button>
      <button class="btn btn-primary wp-next" data-a="next"></button>
    </div>
  </div>`);
  document.body.appendChild(view);
  document.body.classList.add('wp-open');
  const box = view.querySelector('.wp-box');
  const svg = view.querySelector('.wp-lesson');
  const cv = view.querySelector('canvas');
  const g = cv.getContext('2d');
  const $ = (sel) => view.querySelector(sel);

  /* ---------- top: the text with the current letter highlighted ---------- */
  function renderLines() {
    const wrap = $('.wp-lines');
    wrap.innerHTML = '';
    lines.forEach((l, li) => {
      const row = h(`<div class="wp-row"><span class="wp-label">${esc(l.label)}</span><span class="wp-chars ${l.script}"></span></div>`);
      const chars = row.querySelector('.wp-chars');
      units.forEach((u, i) => {
        if (u.li !== li) return;
        if (u.space) { chars.appendChild(h('<span class="wp-sp"> </span>')); return; }
        const b = h(`<button type="button" class="wp-ch${i === order[pos] ? ' on' : ''}${u.strokes.length ? ' done' : ''}">${esc(u.ch)}</button>`);
        b.onclick = () => { pos = order.indexOf(i); show(); };
        chars.appendChild(b);
      });
      wrap.appendChild(row);
    });
    wrap.querySelector('.wp-ch.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ---------- canvas ---------- */
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = box.clientWidth;
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    redraw();
  }
  const lw = (u) => (u.script === 'ja' ? 0.05 : 0.042);
  function strokePath(ctx, pts, size) {
    ctx.beginPath();
    if (pts.length === 1) { ctx.arc(pts[0][0] * size, pts[0][1] * size, 0.1, 0, Math.PI * 2); return; }
    ctx.moveTo(pts[0][0] * size, pts[0][1] * size);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2; const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0] * size, pts[i][1] * size, mx * size, my * size);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0] * size, last[1] * size);
  }
  function redraw() {
    const u = units[order[pos]];
    g.clearRect(0, 0, cv.width, cv.height);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of u.strokes) {
      g.strokeStyle = st.c; g.lineWidth = st.w * cv.width;
      strokePath(g, st.p, cv.width); g.stroke();
    }
    $('.wp-count').textContent = `${pos + 1} / ${order.length}`;
  }
  let cur = null;
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (cur) return;
    lesson?.stop();
    cv.setPointerCapture(e.pointerId);
    const u = units[order[pos]];
    cur = { id: e.pointerId, st: { c: pen, w: lw(u), p: [pt(e)] } };
    u.strokes.push(cur.st);
    redraw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerId !== cur.id) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const p = pt(ev); const q = cur.st.p[cur.st.p.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.004) cur.st.p.push(p);
    }
    redraw();
  });
  const end = (e) => {
    if (!cur || e.pointerId !== cur.id) return;
    cur = null;
    renderLines();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  /* ---------- navigation ---------- */
  function show() {
    const u = units[order[pos]];
    lesson?.stop();
    lesson = charLesson(svg, u.ch, u.script);
    lesson.setGuide(guide);
    box.className = `wp-box ${u.script}`;
    $('.wp-tip').textContent = u.script === 'ja' ? s.strokeTip : s.thaiTip;
    const last = pos === order.length - 1;
    $('.wp-next').innerHTML = last ? `✓ ${esc(s.done)}` : `${esc(s.next)} ›`;
    $('.wp-prev').disabled = pos === 0;
    renderLines();
    redraw();
    if (!u.strokes.length) setTimeout(() => { if (units[order[pos]] === u && !u.strokes.length) lesson.play(1); }, 350);
  }
  const written = () => units.some((u) => u.strokes.length);
  function finish() {
    if (!written()) { toast(s.empty); return; }
    const dataURL = compose(units, lines.length);
    vibrate(20);
    close();
    onDone(dataURL);
  }
  function close() {
    lesson?.stop();
    window.removeEventListener('resize', fit);
    document.body.classList.remove('wp-open');
    view.remove();
  }
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a],[data-pen]');
    if (!b) return;
    if (b.dataset.pen) { pen = b.dataset.pen; view.querySelectorAll('[data-pen]').forEach((o) => o.classList.toggle('on', o === b)); return; }
    const u = units[order[pos]];
    switch (b.dataset.a) {
      case 'close': close(); break;
      case 'finish': finish(); break;
      case 'play': lesson.play(1); break;
      case 'slow': lesson.play(0.4); break;
      case 'guide': guide = !guide; lesson.setGuide(guide); b.setAttribute('aria-pressed', String(guide)); b.classList.toggle('off', !guide); break;
      case 'undo': u.strokes.pop(); redraw(); renderLines(); break;
      case 'clear': u.strokes.length = 0; redraw(); renderLines(); break;
      case 'prev': if (pos > 0) { pos--; show(); } break;
      case 'next': if (pos < order.length - 1) { pos++; vibrate(8); show(); } else finish(); break;
      default:
    }
  });
  window.addEventListener('resize', fit);
  fit();
  show();
  return { close };
}

/* ------------------------------------------------------------------ */
/* Put the letters together into one image                             */
/* ------------------------------------------------------------------ */

const CELL = 180;

function inkX(u) {
  let a = Infinity; let b = -Infinity;
  for (const st of u.strokes) for (const [x] of st.p) { a = Math.min(a, x - st.w / 2); b = Math.max(b, x + st.w / 2); }
  return [Math.max(0, a), Math.min(1, b)];
}

/**
 * Lay the written boxes out in rows (Japanese: fixed-width cells; Thai: each
 * cluster trimmed to its ink so letters sit together), each line of the
 * input starting a new row, then crop to the ink.
 */
export function compose(units, lineCount) {
  const rows = []; // { items: [{u, x0, x1, at}], width }
  for (let li = 0; li < lineCount; li++) {
    const items = units.filter((u) => u.li === li);
    const maxW = (items[0]?.script === 'ja' ? 6 : 5.2) * CELL;
    let row = { items: [], width: 0 };
    items.forEach((u, k) => {
      let x0 = 0; let x1 = 0; let adv;
      if (u.space) adv = CELL * 0.35;
      else if (!u.strokes.length) return;
      else if (u.script === 'ja') { x0 = 0; x1 = 1; adv = CELL * 0.94; } else { [x0, x1] = inkX(u); adv = (x1 - x0) * CELL + CELL * 0.07; }
      const prev = items[k - 1];
      const canBreak = !(prev && LEADING_VOWELS.test(prev.ch));
      if (row.items.length && row.width + adv > maxW && canBreak) { rows.push(row); row = { items: [], width: 0 }; }
      if (u.space && !row.items.length) return;
      row.items.push({ u, x0, x1, at: row.width });
      row.width += adv;
    });
    if (row.items.length) rows.push(row);
  }
  const W = Math.max(CELL, ...rows.map((r) => r.width)) + CELL * 0.4;
  const rowH = CELL * 1.04;
  const H = rows.length * rowH + CELL * 0.4;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  rows.forEach((r, ri) => {
    const ox = (W - r.width) / 2; const oy = CELL * 0.2 + ri * rowH;
    for (const { u, x0, at } of r.items) {
      for (const st of u.strokes) {
        g.strokeStyle = st.c; g.lineWidth = st.w * CELL;
        g.beginPath();
        st.p.forEach(([x, y], i) => {
          const px = ox + at + (x - x0) * CELL; const py = oy + y * CELL;
          if (i) g.lineTo(px, py); else g.moveTo(px, py);
        });
        if (st.p.length === 1) g.lineTo(ox + at + (st.p[0][0] - x0) * CELL + 0.1, oy + st.p[0][1] * CELL);
        g.stroke();
      }
    }
  });
  return canvasToDataURL(cropAlpha(c));
}

function cropAlpha(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const { data, width: w, height: hh } = g.getImageData(0, 0, c.width, c.height);
  let x0 = w; let y0 = hh; let x1 = -1; let y1 = -1;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return c;
  const pad = 16;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(hh - 1, y1 + pad);
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
