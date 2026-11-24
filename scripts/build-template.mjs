// Exports the A4 template to SVG + PDF (public/assets/templates/).
// Uses the pre-installed Playwright/Chromium. Usage: node scripts/build-template.mjs
import { writeFile } from 'node:fs/promises';
import { buildTemplateSVG } from '../public/js/template-svg.js';

const svg = buildTemplateSVG({ qrHref: null });
const outDir = new URL('../public/assets/templates/', import.meta.url);
await writeFile(new URL('a4-origami-sheet.svg', outDir), svg);

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
await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&family=Noto+Sans+Thai:wght@400;600&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm}</style></head>
<body>${svg}</body></html>`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: new URL('a4-origami-sheet.pdf', outDir).pathname, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await page.setViewportSize({ width: 794, height: 1123 });
await page.screenshot({ path: new URL('a4-origami-sheet-preview.png', outDir).pathname, fullPage: false });
await browser.close();
console.log('Wrote a4-origami-sheet.svg / .pdf / -preview.png');
