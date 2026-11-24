// template-svg.js — builds the Universal A4 origami template as an SVG string.
// Units are millimetres (viewBox 0 0 210 297). Shared by /template.html and
// scripts/build-template.mjs (PDF export). Geometry must stay in sync with
// image-processor.js (TEMPLATE constants).
//
// Net (centre C): floor 90x90, 4 flared trapezoid walls (bottom 90, top 114, height 24)
// which fold up to ~30° flare, 3 lotus petal tips per wall (height 22) and glue tabs.

const C = { x: 105, y: 113 };
const INK = '#3b3226';
const LINE = '#8f8270';
const FAINT = '#cdc4b5';

const rot = (x, y, k) => {
  // rotate (x, y) by k * 90° around origin
  for (let i = 0; i < k; i++) [x, y] = [-y, x];
  return [x, y];
};
const P = (x, y, k) => {
  const [rx, ry] = rot(x, y, k);
  return `${(C.x + rx).toFixed(2)},${(C.y + ry).toFixed(2)}`;
};

function wall(k) {
  // geometry for the top wall, rotated by k*90° (k=0 top, 1 right, 2 bottom, 3 left)
  const parts = [];
  // fold line floor/wall (fold UP)
  parts.push(`<path d="M${P(-45, -45, k)} L${P(45, -45, k)}" class="fold"/>`);
  // fold line wall/petal tips (fold OUT)
  parts.push(`<path d="M${P(-57, -69, k)} L${P(57, -69, k)}" class="fold"/>`);
  // left slanted side (cut)
  parts.push(`<path d="M${P(-45, -45, k)} L${P(-57, -69, k)}" class="cut"/>`);
  // right side: glue tab
  const d = [12 / 26.833, -24 / 26.833];
  const n = [24 / 26.833, 12 / 26.833];
  const p1 = [45, -45]; const p2 = [57, -69];
  const a = [p1[0] + d[0] * 6, p1[1] + d[1] * 6];
  const b = [p2[0] - d[0] * 1, p2[1] - d[1] * 1];
  const c = [p2[0] - d[0] * 3 + n[0] * 7, p2[1] - d[1] * 3 + n[1] * 7];
  const e = [p1[0] + d[0] * 14 + n[0] * 7, p1[1] + d[1] * 14 + n[1] * 7];
  parts.push(`<path d="M${P(...p1, k)} L${P(...a, k)} L${P(...e, k)} L${P(...c, k)} L${P(...b, k)} L${P(...p2, k)}" class="cut tab"/>`);
  parts.push(`<path d="M${P(...a, k)} L${P(...b, k)}" class="fold"/>`);
  const tm = [(a[0] + b[0] + c[0] + e[0]) / 4, (a[1] + b[1] + c[1] + e[1]) / 4];
  const [tx, ty] = rot(...tm, k);
  parts.push(`<text x="${C.x + tx}" y="${C.y + ty + 1}" class="tablbl">กาว</text>`);
  // inner petals (colouring zone, on the wall)
  for (const cx of [-30, 0, 30]) {
    parts.push(`<path d="M${P(cx - 14, -46, k)} C${P(cx - 15, -58, k)} ${P(cx - 6, -64, k)} ${P(cx, -67.5, k)} C${P(cx + 6, -64, k)} ${P(cx + 15, -58, k)} ${P(cx + 14, -46, k)}" class="art"/>`);
    parts.push(`<path d="M${P(cx, -48, k)} L${P(cx, -64, k)}" class="art thin"/>`);
  }
  // outer petal tips (cut outline)
  let tip = `M${P(-57, -69, k)}`;
  for (const cx of [-38, 0, 38]) {
    tip += ` L${P(cx - 19, -69, k)} C${P(cx - 19, -80, k)} ${P(cx - 6, -86, k)} ${P(cx, -91.5, k)} C${P(cx + 6, -86, k)} ${P(cx + 19, -80, k)} ${P(cx + 19, -69, k)}`;
    parts.push(`<path d="M${P(cx - 11, -70, k)} C${P(cx - 10, -78, k)} ${P(cx - 4, -83, k)} ${P(cx, -86, k)} C${P(cx + 4, -83, k)} ${P(cx + 10, -78, k)} ${P(cx + 11, -70, k)}" class="art thin"/>`);
  }
  parts.push(`<path d="${tip}" class="cut" fill="none"/>`);
  return parts.join('\n');
}

function marigold(x, y, r) {
  let s = '';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    s += `<circle cx="${(x + Math.cos(a) * r * 0.62).toFixed(2)}" cy="${(y + Math.sin(a) * r * 0.62).toFixed(2)}" r="${(r * 0.38).toFixed(2)}" class="art"/>`;
  }
  s += `<circle cx="${x}" cy="${y}" r="${r * 0.35}" class="art"/>`;
  return s;
}

function floorRing() {
  const parts = [];
  // banana-leaf scallops around the ring (colouring zone "base")
  const leaf = (x, y, ang) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="1.5" transform="rotate(${ang} ${x} ${y})" class="art thin"/>`;
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) <= 0) continue;
    parts.push(leaf(C.x + i * 9.5, C.y - 41, 0), leaf(C.x + i * 9.5, C.y + 41, 0));
  }
  for (const i of [-1, 0, 1]) parts.push(leaf(C.x - 40.5, C.y + i * 10, 90), leaf(C.x + 40.5, C.y + i * 10, 90));
  parts.push(marigold(C.x, C.y - 35, 7), marigold(C.x, C.y + 35, 7));
  return parts.join('\n');
}

function wishBox() {
  const bx = C.x - 36; const by = C.y - 25;
  const m = 6; const parts = [];
  parts.push(`<rect x="${bx}" y="${by}" width="72" height="50" rx="1.5" fill="#fff" stroke="${FAINT}" stroke-width="0.3" stroke-dasharray="1.2 1"/>`);
  parts.push(`<text x="${bx + 2}" y="${by + 4}" class="boxlbl">ชื่อ · なまえ</text>`);
  parts.push(`<text x="${bx + 2}" y="${by + 27}" class="boxlbl">คำอธิษฐาน · ねがいごと</text>`);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    parts.push(`<rect x="${C.x + sx * 40 - m / 2}" y="${C.y + sy * 29 - m / 2}" width="${m}" height="${m}" fill="#000"/>`);
  }
  return parts.join('\n');
}

const STEPS = [
  ['ระบายสีกลีบ ฐาน และดอกไม้ (สีเข้มถ่ายติดชัดกว่า)', '花びら・台・花に色をぬる（濃い色がおすすめ）'],
  ['เขียนชื่อและคำอธิษฐานในกรอบกลาง ด้วยปากกาสีเข้ม', 'まん中の枠に名前とねがいごとを濃いペンで書く'],
  ['ตัดตามเส้นทึบ', '実線にそって切る'],
  ['พับผนัง 4 ด้านขึ้นตามเส้นประ แล้วทากาวที่แถบ “กาว”', '点線で壁を折り上げ、「กาว」(のりしろ)をはる'],
  ['พับปลายกลีบออกด้านนอก แล้วถ่ายภาพจากด้านบน', '花びらの先を外に折り、真上から撮影する'],
];

/**
 * @param {{qrHref?: string|null, joinUrl?: string}} opts
 */
export function buildTemplateSVG({ qrHref = null, joinUrl = '' } = {}) {
  const walls = [0, 1, 2, 3].map(wall).join('\n');
  const steps = STEPS.map(([th, ja], i) => {
    const y = 222 + i * 12.4;
    return `<g>
      <circle cx="16" cy="${y - 1.2}" r="3.1" fill="#f5c66a"/>
      <text x="16" y="${y}" class="num">${i + 1}</text>
      <text x="22" y="${y - 1}" class="st">${th}</text>
      <text x="22" y="${y + 3.6}" class="sj">${ja}</text>
    </g>`;
  }).join('\n');
  const qr = qrHref
    ? `<image href="${qrHref}" x="160" y="216" width="36" height="36"/>`
    : `<rect x="160" y="216" width="36" height="36" rx="2" fill="none" stroke="${FAINT}" stroke-dasharray="2 1.5"/><text x="178" y="235" class="sj" text-anchor="middle">QR ที่จอใหญ่</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm" font-family="'Noto Sans Thai', 'Noto Sans JP', sans-serif">
  <style>
    .cut { fill: none; stroke: ${INK}; stroke-width: 0.45; stroke-linejoin: round; }
    .tab { fill: #f1ece3; }
    .fold { fill: none; stroke: ${LINE}; stroke-width: 0.35; stroke-dasharray: 1.6 1.2; }
    .art { fill: none; stroke: ${LINE}; stroke-width: 0.3; }
    .thin { stroke-width: 0.22; stroke: #b3a796; }
    .tablbl { font-size: 2.6px; fill: #9a8f80; text-anchor: middle; }
    .boxlbl { font-size: 2.3px; fill: #e4e0d8; }
    .zlbl { font-size: 2.6px; fill: #b3a796; text-anchor: middle; }
    .h { font-size: 6.2px; fill: ${INK}; font-weight: 600; }
    .hs { font-size: 3.4px; fill: #7b705f; }
    .num { font-size: 3.4px; fill: #2b1a00; font-weight: 700; text-anchor: middle; }
    .st { font-size: 3.3px; fill: ${INK}; }
    .sj { font-size: 2.8px; fill: #7b705f; }
  </style>
  <rect width="210" height="297" fill="#fff"/>
  <text x="14" y="16" class="h">กระทงกระดาษ ลอยกระทง 3 มิติ · 紙のクラトン</text>
  <text x="14" y="21.5" class="hs">Universal Template — ระบายสี เขียน ตัด พับ แล้วถ่ายภาพ · 色をぬって、書いて、切って、折って、撮影</text>
  <!-- floor -->
  <rect x="${C.x - 45}" y="${C.y - 45}" width="90" height="90" fill="none" stroke="${LINE}" stroke-width="0.01"/>
  ${floorRing()}
  ${walls}
  ${wishBox()}
  <text x="${C.x}" y="${C.y - 56}" class="zlbl">กลีบใน · 内側の花びら</text>
  <text x="${C.x}" y="${C.y - 74}" class="zlbl">กลีบนอก · 外側の花びら</text>
  <text x="${C.x - 24}" y="${C.y - 30}" class="zlbl">ฐาน · 台</text>
  <!-- legend -->
  <g transform="translate(14 206)">
    <path d="M0 0 H10" class="cut"/><text x="12" y="1" class="sj">ตัด · 切る</text>
    <path d="M34 0 H44" class="fold"/><text x="46" y="1" class="sj">พับ · 折る</text>
    <rect x="70" y="-2.5" width="5" height="5" fill="#000"/><text x="77" y="1" class="sj">จุดมุมสำหรับกล้อง ห้ามระบายทับ · カメラ用マーク（ぬらない）</text>
  </g>
  ${steps}
  ${qr}
  <text x="178" y="256" class="sj" text-anchor="middle">สแกนเพื่อเข้าร่วม · QRで参加</text>
  ${joinUrl ? `<text x="178" y="260" class="sj" text-anchor="middle" style="font-size:2.2px">${joinUrl.replace(/[<>&"]/g, '')}</text>` : ''}
  <text x="105" y="290" class="sj" text-anchor="middle">พิมพ์ขนาดจริง 100% (ไม่ย่อ/ขยาย) บนกระดาษ A4 · A4・実寸（100%）で印刷してください</text>
</svg>`;
}
