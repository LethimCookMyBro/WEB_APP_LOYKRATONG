// capture-ui.js — camera with overlay guide + live corner detection, photo upload,
// and the 4-corner adjust screen. Shared by the participant and host pages.
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
    let det = IP.findMarkersGlobal(canvas);
    if (det) det = IP.detectMarkers(canvas, det.points); // refine at full resolution
    else det = IP.completeQuad(IP.detectMarkers(canvas, IP.defaultQuad(canvas.width, canvas.height, 0.45)));
    openAdjust(canvas, det, 'upload', opts);
  } catch (e) {
    console.error(e);
    (opts.toast || noop)(opts.strings.error, 'err');
  }
}

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
      <span class="chip" data-status style="min-width:64px;justify-content:center">0/4</span>
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

  // guide rectangle (marker rectangle) in screen px
  const guide = () => {
    const w = stage.clientWidth; const hh = stage.clientHeight;
    let gw = w * 0.46; let gh = gw / IP.MARKER_ASPECT;
    if (gh > hh * 0.4) { gh = hh * 0.4; gw = gh * IP.MARKER_ASPECT; }
    const cx = w / 2; const cy = hh * 0.47;
    return { w, h: hh, cx, cy, gw, gh, quad: [[cx - gw / 2, cy - gh / 2], [cx + gw / 2, cy - gh / 2], [cx + gw / 2, cy + gh / 2], [cx - gw / 2, cy + gh / 2]] };
  };
  // screen px -> video px (video uses object-fit: cover)
  const toVideo = (g, scaleTo = 1) => {
    const vw = video.videoWidth; const vh = video.videoHeight;
    const s = Math.max(g.w / vw, g.h / vh);
    const ox = (g.w - vw * s) / 2; const oy = (g.h - vh * s) / 2;
    return g.quad.map(([x, y]) => [((x - ox) / s) * scaleTo, ((y - oy) / s) * scaleTo]);
  };
  let found = [false, false, false, false];
  function drawOverlay() {
    const g = guide();
    svg.setAttribute('viewBox', `0 0 ${g.w} ${g.h}`);
    const r = g.gw * 1.02;
    const ms = g.gw * (IP.TEMPLATE.markerSize / IP.TEMPLATE.markerRect.w) * 2.2;
    const all = found.every(Boolean);
    svg.innerHTML = `
      <defs><mask id="camMask"><rect width="${g.w}" height="${g.h}" fill="#fff"/><circle cx="${g.cx}" cy="${g.cy}" r="${r}" fill="#000"/></mask></defs>
      <rect width="${g.w}" height="${g.h}" fill="rgba(3,5,18,.55)" mask="url(#camMask)"/>
      <circle cx="${g.cx}" cy="${g.cy}" r="${r}" fill="none" stroke="${all ? '#5fd3b3' : '#ff8fab'}" stroke-opacity=".75" stroke-width="2" stroke-dasharray="8 8"/>
      <rect x="${g.cx - g.gw / 2}" y="${g.cy - g.gh / 2}" width="${g.gw}" height="${g.gh}" fill="none" stroke="#ffe1a1" stroke-width="1.5" stroke-dasharray="6 6" opacity=".8"/>
      ${g.quad.map(([x, y], i) => `<rect x="${x - ms / 2}" y="${y - ms / 2}" width="${ms}" height="${ms}" rx="4" fill="${found[i] ? 'rgba(95,211,179,.35)' : 'none'}" stroke="${found[i] ? '#5fd3b3' : '#fff'}" stroke-width="3"/>`).join('')}
      ${all ? `<text x="${g.cx}" y="${g.cy + r + 28}" fill="#c9ffe9" font-size="15" text-anchor="middle" font-family="sans-serif">✓ ${esc(S.shoot)}</text>` : ''}`;
  }
  drawOverlay();
  window.addEventListener('resize', onResize);
  const small = document.createElement('canvas');
  let readyStreak = 0;
  loop = setInterval(() => {
    if (closed || !video.videoWidth) return;
    const s = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    small.width = Math.round(video.videoWidth * s); small.height = Math.round(video.videoHeight * s);
    small.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, small.width, small.height);
    const det = IP.detectMarkers(small, toVideo(guide(), s));
    found = det.found;
    const n = found.filter(Boolean).length;
    status.textContent = `${n}/4`;
    status.className = 'chip ' + (n === 4 ? 'ok' : '');
    if (n === 4) { if (++readyStreak === 2) vibrate(20); } else readyStreak = 0;
    shutter.style.boxShadow = n === 4 ? '0 0 0 6px rgba(95,211,179,.55), 0 0 30px rgba(95,211,179,.6)' : '';
    drawOverlay();
  }, 320);
  shutter.onclick = () => {
    const canvas = IP.toCanvas(video, 2000);
    const scale = canvas.width / video.videoWidth;
    let det = IP.detectMarkers(canvas, toVideo(guide(), scale));
    if (!det.all) {
      const global = IP.findMarkersGlobal(canvas);
      det = global ? IP.detectMarkers(canvas, global.points) : IP.completeQuad(det);
    }
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
        const out = IP.processCapture(photo, sortQuad(pts), opts.defaults);
        close();
        opts.onResult({ dataURL: out.dataURL, colors: out.colors, found: out.found, inkRatio: out.inkRatio, source });
      } catch (e) {
        console.error(e); btn.disabled = false; btn.textContent = S.useThis; toast(S.error, 'err');
      }
    }, 60);
  };
}
