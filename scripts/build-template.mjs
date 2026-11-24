// Exports the A4 template to SVG + PDF (public/assets/templates/).
// Uses the pre-installed Playwright/Chromium. Usage: node scripts/build-template.mjs
import { writeFile } from 'node:fs/promises';
import { buildTemplateSVG, buildTanzakuSVG } from '../public/js/template-svg.js';

const outDir = new URL('../public/assets/templates/', import.meta.url);
const SHEETS = [
  ['a4-origami-sheet', buildTemplateSVG({ qrHref: null })],
  ['a4-tanzaku-sheet', buildTanzakuSVG({ qrHref: null })],
];
for (const [name, svg] of SHEETS) await writeFile(new URL(name + '.svg', outDir), svg);

import { createRequire } from 'node:module';
// Playwright may be installed globally (not a project dependency)
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright not found: npm i -D playwright (SVG was written, PDF skipped)');
  process.exit(0);
}
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, svg] of SHEETS) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&family=Noto+Sans+Thai:wght@400;600&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm}</style></head>
<body>${svg}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: new URL(name + '.pdf', outDir).pathname, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.screenshot({ path: new URL(name + '-preview.png', outDir).pathname, fullPage: false });
}
await browser.close();
console.log('Wrote template SVG / PDF / preview files');
