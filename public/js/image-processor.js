// image-processor.js
// Client-side image pipeline (Canvas only, no libraries):
//   1. detectMarkers()      find the 4 black corner markers of the wish box
//   2. warpQuad()           perspective-correct the box with a homography
//   3. extractHandwriting() adaptive threshold -> ink on transparent PNG
//   4. samplePalette()      read colours of the petal / base / flower zones
//
// Geometry of the A4 template (millimetres, origin = centre of the floor square):
//   writing box     72 x 50       (x ±36, y ±25)
//   corner markers  6 x 6 squares centred at (±40, ±29)  -> "marker rectangle" 80 x 58
//   floor square    90 x 90       (±45)   = base ring + 2 flowers at (0, ±35)
//   walls (inner petals) fold up and flare out -> seen at ~45-57 mm from centre
//   petal tips (outer petals) fold outwards     -> seen at ~60-78 mm from centre

export const TEMPLATE = {
  markerRect: { w: 80, h: 58 },
  markerSize: 6,
  box: { w: 72, h: 50 },
};
export const MARKER_ASPECT = TEMPLATE.markerRect.w / TEMPLATE.markerRect.h;

const MR = TEMPLATE.markerRect;
// marker centres in template mm, order TL, TR, BR, BL
const MARKER_MM = [
  [-MR.w / 2, -MR.h / 2], [MR.w / 2, -MR.h / 2], [MR.w / 2, MR.h / 2], [-MR.w / 2, MR.h / 2],
];

/* ------------------------------------------------------------------ */
/* Homography helpers                                                  */
/* ------------------------------------------------------------------ */

/** Solve the 3x3 homography H mapping src[i] -> dst[i] (4 point pairs). */
export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(8).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
    h[r] = s / (A[r][r] || 1e-12);
  }
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** Map template millimetres -> image pixels given the 4 detected marker centres. */
export function templateToImage(quad) {
  return homography(MARKER_MM, quad);
}

/* ------------------------------------------------------------------ */
/* Canvas utilities                                                    */
/* ------------------------------------------------------------------ */

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Draw a video/image into a canvas, optionally downscaled so the long side <= maxSide. */
export function toCanvas(source, maxSide = 2000) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = makeCanvas(sw * s, sh * s);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0; let wB = 0; let best = 0; let thr = 100;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/* ------------------------------------------------------------------ */
/* 1. Corner marker detection                                          */
/* ------------------------------------------------------------------ */

/**
 * Look for the black square marker closest to each expected corner.
 * @param {HTMLCanvasElement} canvas  full image
 * @param {number[][]} expected       4 approximate marker centres [TL, TR, BR, BL] in px
 * @returns {{points:number[][], found:boolean[], all:boolean}}
 */
export function detectMarkers(canvas, expected) {
  const W = canvas.width; const H = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const side = (Math.hypot(expected[1][0] - expected[0][0], expected[1][1] - expected[0][1]) +
    Math.hypot(expected[2][0] - expected[3][0], expected[2][1] - expected[3][1])) / 2;
  const expMarker = side * (TEMPLATE.markerSize / MR.w); // expected marker side length (px)
  const radius = Math.max(24, side * 0.2);
  const points = []; const found = [];
  expected.forEach(([ex, ey]) => {
    const x0 = Math.max(0, Math.floor(ex - radius)); const y0 = Math.max(0, Math.floor(ey - radius));
    const x1 = Math.min(W, Math.ceil(ex + radius)); const y1 = Math.min(H, Math.ceil(ey + radius));
    const w = x1 - x0; const h = y1 - y0;
    if (w < 8 || h < 8) { points.push([ex, ey]); found.push(false); return; }
    const data = ctx.getImageData(x0, y0, w, h).data;
    const g = new Uint8Array(w * h);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < w * h; i++) {
      const v = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) | 0;
      g[i] = v; hist[v]++;
    }
    const thr = Math.min(otsu(hist, w * h), 110);
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let best = null;
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || g[i] > thr) continue;
      // flood fill a dark component
      let sp = 0; stack[sp++] = i; seen[i] = 1;
      let area = 0; let sx = 0; let sy = 0;
      let minX = w; let minY = h; let maxX = 0; let maxY = 0;
      while (sp) {
        const p = stack[--sp];
        const px = p % w; const py = (p / w) | 0;
        area++; sx += px; sy += py;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        const nb = [p - 1, p + 1, p - w, p + w];
        for (let k = 0; k < 4; k++) {
          const q = nb[k];
          if (q < 0 || q >= w * h) continue;
          if ((k === 0 && px === 0) || (k === 1 && px === w - 1)) continue;
          if (!seen[q] && g[q] <= thr) { seen[q] = 1; stack[sp++] = q; }
        }
      }
      const bw = maxX - minX + 1; const bh = maxY - minY + 1;
      const fill = area / (bw * bh);
      const aspect = Math.min(bw, bh) / Math.max(bw, bh);
      const expArea = expMarker * expMarker;
      if (area < expArea * 0.2 || area > expArea * 4.5) continue;
      if (fill < 0.5 || aspect < 0.45) continue;
      const cx = x0 + sx / area; const cy = y0 + sy / area;
      const dist = Math.hypot(cx - ex, cy - ey);
      const score = dist / radius + Math.abs(1 - area / expArea) * 0.3 + (1 - fill) * 0.5;
      if (!best || score < best.score) best = { cx, cy, score };
    }
    if (best) { points.push([best.cx, best.cy]); found.push(true); }
    else { points.push([ex, ey]); found.push(false); }
  });
  return { points, found, all: found.every(Boolean) };
}

/** Default guess: centred marker rectangle covering `frac` of the image width. */
export function defaultQuad(w, h, frac = 0.5) {
  let qw = w * frac; let qh = qw / MARKER_ASPECT;
  if (qh > h * 0.8) { qh = h * 0.8; qw = qh * MARKER_ASPECT; }
  const cx = w / 2; const cy = h / 2;
  return [[cx - qw / 2, cy - qh / 2], [cx + qw / 2, cy - qh / 2], [cx + qw / 2, cy + qh / 2], [cx - qw / 2, cy + qh / 2]];
}

/* ------------------------------------------------------------------ */
/* 2. Perspective warp                                                 */
/* ------------------------------------------------------------------ */

/** Warp the quadrilateral `quad` (TL, TR, BR, BL px) of `src` into an outW x outH canvas. */
export function warpQuad(src, quad, outW, outH) {
  const out = makeCanvas(outW, outH);
  const dst = [[0, 0], [outW, 0], [outW, outH], [0, outH]];
  const Hinv = homography(dst, quad); // output px -> source px
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const sdata = sctx.getImageData(0, 0, src.width, src.height).data;
  const SW = src.width; const SH = src.height;
  const octx = out.getContext('2d');
  const img = octx.createImageData(outW, outH);
  const o = img.data;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applyH(Hinv, x + 0.5, y + 0.5);
      const fx = Math.min(SW - 1.001, Math.max(0, sx - 0.5));
      const fy = Math.min(SH - 1.001, Math.max(0, sy - 0.5));
      const ix = fx | 0; const iy = fy | 0; const dx = fx - ix; const dy = fy - iy;
      const i00 = (iy * SW + ix) * 4; const i10 = i00 + 4; const i01 = i00 + SW * 4; const i11 = i01 + 4;
      const oi = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        o[oi + c] = (sdata[i00 + c] * (1 - dx) + sdata[i10 + c] * dx) * (1 - dy) +
          (sdata[i01 + c] * (1 - dx) + sdata[i11 + c] * dx) * dy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Handwriting extraction                                           */
/* ------------------------------------------------------------------ */

/**
 * Crop the writing box out of the marker-rectangle warp and turn ink into a
 * transparent PNG (Bradley–Roth adaptive threshold using an integral image).
 * @param {HTMLCanvasElement} warped  marker rectangle warped to 10 px / mm (800 x 580)
 */
export function extractHandwriting(warped, { insetMm = 4.8, t = 0.16 } = {}) {
  const pxPerMm = warped.width / MR.w;
  const inset = Math.round(insetMm * pxPerMm);
  const w = warped.width - inset * 2; const h = warped.height - inset * 2;
  const ctx = warped.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(inset, inset, w, h);
  const d = src.data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  // integral image
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
    }
  }
  const S = Math.max(15, Math.round(w / 10)); const half = S >> 1;
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - half); const yb = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - half); const xb = Math.min(w, x + half + 1);
      const count = (xb - xa) * (yb - ya);
      const sum = integ[yb * (w + 1) + xb] - integ[ya * (w + 1) + xb] - integ[yb * (w + 1) + xa] + integ[ya * (w + 1) + xa];
      const mean = sum / count;
      const v = gray[y * w + x];
      // soft edge: fully ink at (1 - 1.8t)*mean, transparent at (1 - t)*mean
      const lo = mean * (1 - t * 1.9); const hi = mean * (1 - t);
      let a = v >= hi ? 0 : v <= lo ? 1 : (hi - v) / (hi - lo);
      if (mean < 40) a = 0; // very dark region (shadow) — ignore
      alpha[y * w + x] = a * 255;
    }
  }
  // remove isolated specks: pixels with < 2 inked neighbours
  const clean = new Uint8ClampedArray(alpha);
  let ink = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!alpha[i]) continue;
      let n = 0;
      if (alpha[i - 1] > 60) n++; if (alpha[i + 1] > 60) n++;
      if (alpha[i - w] > 60) n++; if (alpha[i + w] > 60) n++;
      if (alpha[i - w - 1] > 60) n++; if (alpha[i + w + 1] > 60) n++;
      if (n < 2) clean[i] = 0; else if (clean[i] > 128) ink++;
    }
  }
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const o = img.data;
  for (let i = 0; i < w * h; i++) {
    // keep the pen colour but darken it a little for contrast
    o[i * 4] = d[i * 4] * 0.7; o[i * 4 + 1] = d[i * 4 + 1] * 0.7; o[i * 4 + 2] = d[i * 4 + 2] * 0.7;
    o[i * 4 + 3] = clean[i];
  }
  octx.putImageData(img, 0, 0);
  return { canvas: out, inkRatio: ink / (w * h) };
}

/** Downscale + encode to keep the socket payload small (~30–150 KB). */
export function canvasToDataURL(canvas, maxW = 640) {
  const s = Math.min(1, maxW / canvas.width);
  let c = canvas;
  if (s < 1) {
    c = makeCanvas(canvas.width * s, canvas.height * s);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
  }
  return c.toDataURL('image/png');
}

/* ------------------------------------------------------------------ */
/* 4. Colour sampling                                                  */
/* ------------------------------------------------------------------ */

// sample locations in template mm (several per zone, best one wins)
const ZONES = {
  base: [[-26, -36], [26, -36], [26, 36], [-26, 36], [-40.5, 0], [40.5, 0]],
  flower: [[0, -35], [0, 35], [0, -33], [0, 37]],
  innerPetal: [[-51, 0], [51, 0], [0, -51], [0, 51], [-50, -22], [50, 22], [-22, -50], [22, 50]],
  outerPetal: [[-66, 0], [66, 0], [0, -66], [0, 66], [-72, 0], [72, 0], [0, -72], [0, 72], [-62, -30], [62, 30]],
};

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  if (d) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  return [hh, max ? d / max : 0, max];
}
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Boost saturation/brightness a bit so paper crayon colours look vivid in 3D. */
function vivid([r, g, b]) {
  const [hh, s, v] = rgbToHsv(r, g, b);
  const s2 = Math.min(1, s * 1.25 + 0.05); const v2 = Math.min(1, v * 1.12 + 0.04);
  const c = v2 * s2; const x = c * (1 - Math.abs(((hh / 60) % 2) - 1)); const m = v2 - c;
  let rgb;
  if (hh < 60) rgb = [c, x, 0]; else if (hh < 120) rgb = [x, c, 0]; else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c]; else if (hh < 300) rgb = [x, 0, c]; else rgb = [c, 0, x];
  return rgb.map((u) => (u + m) * 255);
}

/**
 * @param {HTMLCanvasElement} canvas  full photo
 * @param {number[][]} quad           marker centres in px
 * @returns {{colors:Object, found:Object}}
 */
export function samplePalette(canvas, quad, defaults) {
  const H = templateToImage(quad);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const pxPerMm = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]) / MR.w;
  const r = Math.max(3, Math.round(pxPerMm * 3));
  const colors = {}; const found = {};
  for (const [zone, pts] of Object.entries(ZONES)) {
    let best = null;
    for (const [mx, my] of pts) {
      const [px, py] = applyH(H, mx, my);
      const x0 = Math.round(px - r); const y0 = Math.round(py - r);
      if (x0 < 0 || y0 < 0 || x0 + 2 * r >= canvas.width || y0 + 2 * r >= canvas.height) continue;
      const data = ctx.getImageData(x0, y0, 2 * r, 2 * r).data;
      const picks = [];
      for (let i = 0; i < data.length; i += 4) {
        const [, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        if (s > 0.22 && v > 0.18) picks.push([data[i], data[i + 1], data[i + 2], s]);
      }
      const ratio = picks.length / (data.length / 4);
      if (ratio < 0.3) continue; // mostly white paper / pen lines
      // median of each channel among coloured pixels
      const med = [0, 1, 2].map((c) => picks.map((p) => p[c]).sort((a, b) => a - b)[picks.length >> 1]);
      const sat = picks.reduce((a, p) => a + p[3], 0) / picks.length;
      const score = ratio * 0.6 + sat * 0.4;
      if (!best || score > best.score) best = { rgb: med, score };
    }
    if (best) { colors[zone] = hex(...vivid(best.rgb)); found[zone] = true; }
    else { colors[zone] = defaults[zone]; found[zone] = false; }
  }
  return { colors, found };
}

/** Full pipeline helper: photo + quad -> { handwritingCanvas, dataURL, colors, found, inkRatio } */
export function processCapture(photoCanvas, quad, defaults) {
  const warped = warpQuad(photoCanvas, quad, MR.w * 10, MR.h * 10);
  const { canvas, inkRatio } = extractHandwriting(warped);
  const { colors, found } = samplePalette(photoCanvas, quad, defaults);
  return { handwritingCanvas: canvas, dataURL: canvasToDataURL(canvas), colors, found, inkRatio, warped };
}
