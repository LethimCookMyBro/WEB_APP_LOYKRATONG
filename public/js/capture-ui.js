// capture-ui.js — camera with a live outline of the detected sheet of paper,
// photo upload, and the 4-corner adjust screen. Shared by the participant and
// host pages. Works with any plain paper (no printed template needed).
//
// opts = { strings, defaults, onResult(result), toast(msg, type), vibrate(pattern) }
// result = { dataURL, colors, found, inkRatio, source }
import * as IP from './image-processor.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const noop = () => {};

export async function captureFromFile(file, opts) {
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = IP.toCanvas(img, 2000);
    URL.revokeObjectURL(url);
    const det = IP.findPaper(canvas) || notFound(canvas);
    openAdjust(canvas, det, 'upload', opts);
  } catch (e) {
    console.error(e);
    (opts.toast || noop)(opts.strings.error, 'err');
  }
}

const notFound = (canvas) => ({ points: IP.defaultQuad(canvas.width, canvas.height), found: [false, false, false, false], all: false });

let stream = null;
function stopStream() { stream?.getTracks().forEach((tr) => tr.stop()); stream = null; }

export async function startCamera(opts) {
  const S = opts.strings; const toast = opts.toast || noop; const vibrate = opts.vibrate || noop;
  if (!navigator.mediaDevices?.getUserMedia) { toast(S.cameraDenied, 'err'); return; }
  const view = h(`<div class="camera-view">
    <div class="camera-stage">
      <video playsinline muted autoplay></video>
      <div class="camera-overlay"><svg></svg></div>
      <div class="camera-top"><p>${esc(S.captureHint)}</p><button class="btn btn-icon" data-a="close" aria-label="close">✕</button></div>
    </div>
    <div class="camera-bottom">
      <label class="btn btn-sm" style="cursor:pointer" aria-label="upload">🖼️<input type="file" accept="image/*" hidden></label>
      <button class="shutter" aria-label="${esc(S.shoot)}" disabled></button>
      <span class="chip" data-status style="min-width:64px;justify-content:center">…</span>
    </div>
  </div>`);
  document.body.appendChild(view);
  const video = view.querySelector('video');
  const svg = view.querySelector('svg');
  const shutter = view.querySelector('.shutter');
  const stage = view.querySelector('.camera-stage');
  const status = view.querySelector('[data-status]');
  let loop = 0; let closed = false;
  const onResize = () => drawOverlay();
  const close = () => { closed = true; clearInterval(loop); stopStream(); window.removeEventListener('resize', onResize); view.remove(); };
  view.querySelector('[data-a=close]').onclick = close;
  view.querySelector('input[type=file]').onchange = (e) => { const f = e.target.files?.[0]; close(); if (f) captureFromFile(f, opts); };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
  } catch (e) {
    close(); toast(S.cameraDenied, 'err'); return;
  }
  if (closed) { stopStream(); return; }
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  shutter.disabled = false;

  // video px -> screen px (video uses object-fit: cover)
  const toScreen = (pts) => {
    const w = stage.clientWidth; const hh = stage.clientHeight;
    const vw = video.videoWidth; const vh = video.videoHeight;
    const sc = Math.max(w / vw, hh / vh);
    const ox = (w - vw * sc) / 2; const oy = (hh - vh * sc) / 2;
    return pts.map(([x, y]) => [ox + x * sc, oy + y * sc]);
  };
  let quad = null; // detected paper corners in video px
  function drawOverlay() {
    const w = stage.clientWidth; const hh = stage.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
    if (!quad) {
      // hint frame: an A4-ish rectangle
      let gw = w * 0.7; let gh = gw * 1.32;
      if (gh > hh * 0.7) { gh = hh * 0.7; gw = gh / 1.32; }
      svg.innerHTML = `<rect x="${(w - gw) / 2}" y="${(hh - gh) / 2 - 10}" width="${gw}" height="${gh}" rx="10" fill="none" stroke="#ffe1a1" stroke-width="2" stroke-dasharray="10 8" opacity=".75"/>`;
      return;
    }
    const sp = toScreen(quad);
    const d = sp.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + 'Z';
    svg.innerHTML = `
      <defs><mask id="camMask"><rect width="${w}" height="${hh}" fill="#fff"/><path d="${d}" fill="#000"/></mask></defs>
      <rect width="${w}" height="${hh}" fill="rgba(3,5,18,.45)" mask="url(#camMask)"/>
      <path d="${d}" fill="rgba(95,211,179,.08)" stroke="#5fd3b3" stroke-width="3" stroke-linejoin="round"/>
      ${sp.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#5fd3b3"/>`).join('')}`;
  }
  drawOverlay();
  window.addEventListener('resize', onResize);
  const small = document.createElement('canvas');
  let readyStreak = 0;
  loop = setInterval(() => {
    if (closed || !video.videoWidth) return;
    const sc = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    small.width = Math.round(video.videoWidth * sc); small.height = Math.round(video.videoHeight * sc);
    small.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, small.width, small.height);
    const det = IP.findPaper(small, 240);
    quad = det ? det.points.map(([x, y]) => [x / sc, y / sc]) : null;
    status.textContent = quad ? '✓' : '…';
    status.className = 'chip ' + (quad ? 'ok' : '');
    if (quad) { if (++readyStreak === 2) vibrate(20); } else readyStreak = 0;
    shutter.style.boxShadow = quad ? '0 0 0 6px rgba(95,211,179,.55), 0 0 30px rgba(95,211,179,.6)' : '';
    drawOverlay();
  }, 300);
  shutter.onclick = () => {
    const canvas = IP.toCanvas(video, 2000);
    const det = IP.findPaper(canvas) || notFound(canvas);
    vibrate(30);
    close();
    openAdjust(canvas, det, 'camera', opts);
  };
}

/** Make sure the quad is ordered TL, TR, BR, BL even if handles were dragged across. */
export function sortQuad(p) {
  const cx = p.reduce((a, q) => a + q[0], 0) / 4; const cy = p.reduce((a, q) => a + q[1], 0) / 4;
  const ring = [...p].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0; let best = Infinity;
  ring.forEach((q, i) => { if (q[0] + q[1] < best) { best = q[0] + q[1]; start = i; } });
  return [0, 1, 2, 3].map((i) => ring[(start + i) % 4]);
}

function openAdjust(photo, det, source, opts) {
  const S = opts.strings; const toast = opts.toast || noop;
  const view = h(`<div class="adjust-view">
    <div class="camera-top" style="position:relative;background:none"><p><b>${esc(S.adjustTitle)}</b><br><span class="muted small">${esc(det.all ? S.autoFound : S.autoNotFound)}</span></p></div>
    <div class="adjust-stage"><canvas></canvas></div>
    <div class="camera-bottom">
      <button class="btn" data-a="retake">${esc(S.retake)}</button>
      <button class="btn btn-primary" data-a="ok" style="flex:1">✓ ${esc(S.useThis)}</button>
    </div>
  </div>`);
  document.body.appendChild(view);
  const stage = view.querySelector('.adjust-stage');
  const canvas = view.querySelector('canvas');
  const pts = det.points.map((p) => [...p]);
  const handles = pts.map(() => { const d = h('<div class="handle" role="slider" aria-label="corner"></div>'); stage.appendChild(d); return d; });
  const loupe = h('<div class="loupe" hidden><canvas width="220" height="220"></canvas></div>');
  stage.appendChild(loupe);
  let fit = { s: 1, ox: 0, oy: 0 };
  function draw() {
    const w = stage.clientWidth; const hh = stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = hh * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(w / photo.width, hh / photo.height) * 0.94;
    fit = { s, ox: (w - photo.width * s) / 2, oy: (hh - photo.height * s) / 2 };
    g.fillStyle = '#05060f'; g.fillRect(0, 0, w, hh);
    g.drawImage(photo, fit.ox, fit.oy, photo.width * s, photo.height * s);
    const sp = pts.map(([x, y]) => [fit.ox + x * s, fit.oy + y * s]);
    g.strokeStyle = '#f5c66a'; g.lineWidth = 2; g.setLineDash([8, 6]);
    g.beginPath(); sp.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    g.setLineDash([]);
    sp.forEach(([x, y], i) => { handles[i].style.left = x + 'px'; handles[i].style.top = y + 'px'; handles[i].style.borderColor = det.found[i] ? '#5fd3b3' : '#f5c66a'; });
  }
  draw();
  const ro = new ResizeObserver(draw); ro.observe(stage);
  handles.forEach((hd, i) => {
    hd.addEventListener('pointerdown', (e) => {
      e.preventDefault(); hd.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const r = stage.getBoundingClientRect();
        const x = (ev.clientX - r.left - fit.ox) / fit.s; const y = (ev.clientY - r.top - fit.oy) / fit.s;
        pts[i] = [Math.max(0, Math.min(photo.width, x)), Math.max(0, Math.min(photo.height, y))];
        det.found[i] = true;
        draw();
        loupe.hidden = false;
        const lx = ev.clientX - r.left; const ly = ev.clientY - r.top;
        loupe.style.left = Math.min(r.width - 120, Math.max(10, lx - 55)) + 'px';
        loupe.style.top = Math.max(10, ly - 150) + 'px';
        const lg = loupe.querySelector('canvas').getContext('2d');
        const z = 60 / Math.max(0.2, fit.s * 2.5);
        lg.fillStyle = '#000'; lg.fillRect(0, 0, 220, 220);
        lg.drawImage(photo, pts[i][0] - z, pts[i][1] - z, z * 2, z * 2, 0, 0, 220, 220);
        lg.strokeStyle = '#f5c66a'; lg.lineWidth = 2; lg.beginPath(); lg.moveTo(110, 90); lg.lineTo(110, 130); lg.moveTo(90, 110); lg.lineTo(130, 110); lg.stroke();
      };
      const up = () => { loupe.hidden = true; hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); };
      hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    });
  });
  const close = () => { ro.disconnect(); view.remove(); };
  view.querySelector('[data-a=retake]').onclick = () => { close(); if (source === 'camera') startCamera(opts); };
  view.querySelector('[data-a=ok]').onclick = () => {
    const btn = view.querySelector('[data-a=ok]');
    btn.disabled = true; btn.textContent = S.processing;
    setTimeout(() => {
      try {
        const out = IP.processPaper(photo, sortQuad(pts));
        close();
        opts.onResult({ dataURL: out.dataURL, colors: { ...opts.defaults }, found: null, inkRatio: out.inkRatio, source });
      } catch (e) {
        console.error(e); btn.disabled = false; btn.textContent = S.useThis; toast(S.error, 'err');
      }
    }, 60);
  };
}
