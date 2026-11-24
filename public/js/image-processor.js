// image-processor.js
// Client-side image pipeline (Canvas only, no libraries) for a photo of a
// plain sheet of paper with handwriting on it:
//   1. findPaper()    find the bright sheet of paper -> 4 corners (TL, TR, BR, BL)
//   2. warpQuad()     perspective-correct the sheet with a homography
//   3. extractInk()   adaptive threshold -> ink on a transparent PNG
//   4. cropToInk()    drop marks touching the edge, crop to the writing

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
/* 1. Paper detection                                                  */
/* ------------------------------------------------------------------ */

/**
 * Find the largest bright, low-colour region (the sheet of paper) and return
 * its four corners. Works on a downscaled copy, so it is fast enough to run
 * on live camera frames.
 * @param {HTMLCanvasElement} canvas
 * @returns {{points:number[][], found:boolean[], all:boolean, coverage:number}|null}
 */
export function findPaper(canvas, maxSide = 360) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const w = Math.max(8, Math.round(canvas.width * s)); const h = Math.max(8, Math.round(canvas.height * s));
  const small = makeCanvas(w, h);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, w, h);
  const d = sctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const gray = new Uint8Array(n);
  const sat = new Float32Array(n);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4]; const g = d[i * 4 + 1]; const b = d[i * 4 + 2];
    const v = Math.round(lum(r, g, b));
    gray[i] = v; hist[v]++;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    sat[i] = mx ? (mx - mn) / mx : 0;
  }
  const thr = Math.max(90, otsu(hist, n));
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = gray[i] > thr && sat[i] < 0.32 ? 1 : 0;
  // largest 4-connected component
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let best = 0; let bestId = 0; let id = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i] || label[i]) continue;
    id++;
    let top = 0; let size = 0;
    stack[top++] = i; label[i] = id;
    while (top) {
      const p = stack[--top]; size++;
      const x = p % w;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[top++] = p + 1; }
      if (p >= w && mask[p - w] && !label[p - w]) { label[p - w] = id; stack[top++] = p - w; }
      if (p < n - w && mask[p + w] && !label[p + w]) { label[p + w] = id; stack[top++] = p + w; }
    }
    if (size > best) { best = size; bestId = id; }
  }
  const coverage = best / n;
  if (coverage < 0.06) return null;
  // extreme points of the component
  let tl = [0, 0, Infinity]; let br = [0, 0, -Infinity]; let tr = [0, 0, -Infinity]; let bl = [0, 0, Infinity];
  for (let i = 0; i < n; i++) {
    if (label[i] !== bestId) continue;
    const x = i % w; const y = (i / w) | 0;
    if (x + y < tl[2]) tl = [x, y, x + y];
    if (x + y > br[2]) br = [x, y, x + y];
    if (x - y > tr[2]) tr = [x, y, x - y];
    if (x - y < bl[2]) bl = [x, y, x - y];
  }
  const up = (p) => [(p[0] + 0.5) / s, (p[1] + 0.5) / s];
  const points = [up(tl), up(tr), up(br), up(bl)];
  // reject degenerate shapes (e.g. a thin strip)
  const area = Math.abs(points.reduce((a, p, i) => { const q = points[(i + 1) % 4]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  if (area < canvas.width * canvas.height * 0.05) return null;
  return { points, found: [true, true, true, true], all: true, coverage };
}

/** Fallback corners when no paper is found: a centred rectangle with `margin` on each side. */
export function defaultQuad(w, h, margin = 0.08) {
  const mx = w * margin; const my = h * margin;
  return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
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
/* 3. Ink extraction                                                   */
/* ------------------------------------------------------------------ */

/**
 * Turn dark pen strokes into a transparent PNG (Bradley–Roth adaptive
 * threshold using an integral image). `inset` px are cut from every side
 * to drop the paper edge.
 */
export function extractInk(warped, { inset = 0, t = 0.16 } = {}) {
  const w = warped.width - inset * 2; const h = warped.height - inset * 2;
  const ctx = warped.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(inset, inset, w, h);
  const d = src.data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
    }
  }
  const S = Math.max(15, Math.round(Math.max(w, h) / 12)); const half = S >> 1;
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - half); const yb = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - half); const xb = Math.min(w, x + half + 1);
      const count = (xb - xa) * (yb - ya);
      const sum = integ[yb * (w + 1) + xb] - integ[ya * (w + 1) + xb] - integ[yb * (w + 1) + xa] + integ[ya * (w + 1) + xa];
      const mean = sum / count;
      const v = gray[y * w + x];
      // soft edge: fully ink at (1 - 1.9t)*mean, transparent at (1 - t)*mean
      const lo = mean * (1 - t * 1.9); const hi = mean * (1 - t);
      let a = v >= hi ? 0 : v <= lo ? 1 : (hi - v) / (hi - lo);
      if (mean < 40) a = 0; // very dark region (shadow / table) — ignore
      alpha[y * w + x] = a * 255;
    }
  }
  // remove isolated specks: pixels with < 2 inked neighbours
  const clean = new Uint8ClampedArray(alpha);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!alpha[i]) continue;
      let k = 0;
      if (alpha[i - 1] > 60) k++; if (alpha[i + 1] > 60) k++;
      if (alpha[i - w] > 60) k++; if (alpha[i + w] > 60) k++;
      if (alpha[i - w - 1] > 60) k++; if (alpha[i + w + 1] > 60) k++;
      if (k < 2) clean[i] = 0;
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
  return out;
}

/* ------------------------------------------------------------------ */
/* 4. Crop to the writing                                              */
/* ------------------------------------------------------------------ */

/**
 * Remove ink blobs that touch the border (paper edges, shadows, the table)
 * and tiny specks, then crop to the remaining writing with a small margin.
 * @returns {{canvas:HTMLCanvasElement, inkRatio:number}}
 */
export function cropToInk(inkCanvas) {
  const w = inkCanvas.width; const h = inkCanvas.height; const n = w * h;
  const ctx = inkCanvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const a = img.data;
  const on = (i) => a[i * 4 + 3] > 90;
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const minArea = Math.max(10, Math.round(n * 0.00002));
  let id = 0;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1; let ink = 0;
  const members = [];
  for (let i = 0; i < n; i++) {
    if (!on(i) || label[i]) continue;
    id++;
    let top = 0; let touches = false;
    members.length = 0;
    stack[top++] = i; label[i] = id;
    while (top) {
      const p = stack[--top]; members.push(p);
      const x = p % w; const y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      // 8-connected so thin diagonal pen lines stay in one piece
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w || (!dx && !dy)) continue;
          const q = yy * w + xx;
          if (!label[q] && on(q)) { label[q] = id; stack[top++] = q; }
        }
      }
    }
    if (touches || members.length < minArea) {
      for (const p of members) a[p * 4 + 3] = 0;
      continue;
    }
    for (const p of members) {
      const x = p % w; const y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    ink += members.length;
  }
  ctx.putImageData(img, 0, 0);
  if (x1 < 0) return { canvas: inkCanvas, inkRatio: 0 };
  const pad = Math.max(12, Math.round(Math.max(x1 - x0, y1 - y0) * 0.06));
  const cx0 = Math.max(0, x0 - pad); const cy0 = Math.max(0, y0 - pad);
  const cw = Math.min(w, x1 + pad + 1) - cx0; const ch = Math.min(h, y1 + pad + 1) - cy0;
  const out = makeCanvas(cw, ch);
  out.getContext('2d').drawImage(inkCanvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
  return { canvas: out, inkRatio: ink / ((x1 - x0 + 1) * (y1 - y0 + 1)) };
}

/** Downscale + encode to keep the socket payload small (~30–150 KB). */
export function canvasToDataURL(canvas, maxSide = 640) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
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
/* Full pipeline                                                       */
/* ------------------------------------------------------------------ */

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** photo + paper corners -> { dataURL, inkRatio } (ink on transparent PNG, cropped to the writing) */
export function processPaper(photoCanvas, quad) {
  const [tl, tr, br, bl] = quad;
  let W = (dist(tl, tr) + dist(bl, br)) / 2; let H = (dist(tl, bl) + dist(tr, br)) / 2;
  const s = Math.min(1, 1400 / Math.max(W, H));
  W = Math.max(40, Math.round(W * s)); H = Math.max(40, Math.round(H * s));
  const warped = warpQuad(photoCanvas, quad, W, H);
  const inset = Math.round(Math.min(W, H) * 0.025);
  const ink = extractInk(warped, { inset });
  const { canvas, inkRatio } = cropToInk(ink);
  return { canvas, dataURL: canvasToDataURL(canvas), inkRatio, warped };
}
