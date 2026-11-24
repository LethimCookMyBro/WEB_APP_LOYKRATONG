// mobile-client.js — participant flow
// language → name → wish → write & fold → capture → swipe to float
import {
  WISHES, getWish, UI, LANGUAGE_MODES,
  japaneseNameToThai, thaiNameToKatakana, katakanaReading,
} from './language-data.js';
import { renderPattern } from './pattern-view.js';
import * as IP from './image-processor.js';
import { audio } from './audio.js';
import { startCamera, captureFromFile } from './capture-ui.js';

const DEFAULT_COLORS = { base: '#2E7D32', innerPetal: '#FF8F00', outerPetal: '#D84315', flower: '#FDD835' };
const STEPS = ['name', 'wish', 'write', 'capture', 'send'];
const STORE_KEY = 'loykrathong_state_v3';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
const fresh = () => ({
  step: 'welcome',
  mode: null,            // TH_TO_JP | JP_TO_TH
  lang: 'th',
  nameInput: '',
  nameOut: '',
  nameEdited: false,
  nameSource: '',
  wishId: null,
  customWish: '',
  capture: null,         // { dataURL, colors, found, inkRatio, source }
  id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  sent: 0,
});
let state = fresh();
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved && saved.mode) state = { ...fresh(), ...saved };
} catch { /* storage unavailable */ }
const hadProgress = state.step !== 'welcome' && !!state.mode;
const resumeStep = state.step;
if (hadProgress) state.step = 'welcome';
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota / private mode */ }
}

const ceremony = { opened: false, opening: false };

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const tp = document.createElement('template'); tp.innerHTML = html.trim(); return tp.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k) => UI[state.lang][k] ?? UI.th[k] ?? k;
const targetScript = () => (state.mode === LANGUAGE_MODES.TH_TO_JP ? 'ja' : 'th');
const scriptOf = (text) => (/[ぁ-ヿ一-鿿]/.test(text) ? 'ja' : 'th');
const capture = () => state.capture;
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

function toast(msg, type = '') {
  const el = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3000);
}

/* ------------------------------------------------------------------ */
/* Socket                                                              */
/* ------------------------------------------------------------------ */
const socket = window.io ? window.io({ transports: ['websocket', 'polling'] }) : null;
function setConn(on) {
  $('#connDot').className = 'dot ' + (on ? 'on' : 'off');
  $('#conn').title = t(on ? 'connOn' : 'connOff');
  $('#conn').setAttribute('aria-label', t(on ? 'connOn' : 'connOff'));
  document.querySelectorAll('[data-conn]').forEach((n) => { n.className = 'dot ' + (on ? 'on' : 'off'); });
}
if (socket) {
  socket.on('connect', () => { setConn(true); socket.emit('join', { role: 'participant' }); });
  socket.on('disconnect', () => setConn(false));
  socket.on('ceremony_state', (s) => {
    const was = ceremony.opened;
    ceremony.opened = !!s.opened; ceremony.opening = !!s.opening;
    if (!was && ceremony.opened) onCeremonyOpened();
    sendUI?.refresh();
  });
} else {
  setConn(false);
}

/* ------------------------------------------------------------------ */
/* Router + chrome                                                     */
/* ------------------------------------------------------------------ */
function go(step) {
  if (step !== 'send') destroySend();
  state.step = step;
  save();
  render();
  window.scrollTo(0, 0);
}

function renderChrome() {
  document.body.dataset.lang = state.lang;
  document.documentElement.lang = state.lang;
  $('#brandTitle').textContent = state.mode ? t('appTitle') : 'ลอยกระทง 3 มิติ';
  const prog = $('#progress');
  const idx = STEPS.indexOf(state.step);
  prog.hidden = idx < 0;
  if (idx >= 0) {
    const labels = [t('stepName'), t('stepWish'), t('stepWrite'), t('stepCapture'), t('stepSend')];
    prog.innerHTML = `<div class="prog-bars">${STEPS.map((s, i) => `<button type="button" class="pb ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}" data-step="${s}" aria-label="${esc(labels[i])}" ${i < idx ? '' : 'disabled'}></button>`).join('')}</div>
      <div class="prog-label"><span>🪷 ${esc(t('stepOf').replace('{n}', idx + 1))}</span> ${esc(labels[idx])}</div>`;
    prog.querySelectorAll('.pb.done').forEach((n) => { n.onclick = () => go(n.dataset.step); });
  }
}

function actionBar(buttons) {
  const bar = $('#actionbar');
  const inner = $('#actionbarInner');
  inner.innerHTML = '';
  if (!buttons) { bar.hidden = true; return {}; }
  bar.hidden = false;
  const refs = {};
  for (const b of buttons) {
    const el = h(`<button type="button" class="btn ${b.cls || ''}">${b.html}</button>`);
    el.onclick = b.onClick;
    if (b.disabled) el.disabled = true;
    inner.appendChild(el);
    refs[b.key || 'k' + Object.keys(refs).length] = el;
  }
  return refs;
}
const backBtn = (to) => ({ html: `‹`, cls: 'btn-ghost btn-back', onClick: () => go(to), key: 'back' });
const nextBtn = (to, disabled, label) => ({ html: `${esc(label || t('next'))} <span aria-hidden="true">›</span>`, cls: 'btn-primary', onClick: () => go(to), key: 'next', disabled });

const head = (title, sub) => `<header class="sh"><h1 class="sh-title">${esc(title)}</h1>${sub ? `<p class="sh-sub">${esc(sub)}</p>` : ''}</header>`;

function render() {
  renderChrome();
  const screen = $('#screen');
  screen.innerHTML = '';
  screen.style.animation = 'none'; void screen.offsetWidth; screen.style.animation = '';
  ({ welcome: renderWelcome, name: renderName, wish: renderWish, write: renderWrite, capture: renderCapture, send: renderSend })[state.step]?.(screen);
}

/* ------------------------------------------------------------------ */
/* Illustrations                                                       */
/* ------------------------------------------------------------------ */
const ART_KRATHONG = `<svg viewBox="0 0 120 90" aria-hidden="true"><defs><linearGradient id="ak" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd0dc"/><stop offset="1" stop-color="#ff7d9f"/></linearGradient><radialGradient id="af"><stop offset="0" stop-color="#fff6d0"/><stop offset=".5" stop-color="#ffc35c" stop-opacity=".7"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="60" cy="80" rx="46" ry="6" fill="#ffc35c" opacity=".18"/>
  <circle cx="60" cy="26" r="16" fill="url(#af)"/><path d="M60 13c3 5 4 9 0 15c-4-6-3-10 0-15z" fill="#fff4c9"/><rect x="58" y="27" width="4" height="22" rx="1.5" fill="#fff8ec"/>
  <path d="M14 66c14 6 78 6 92 0c-5 11-25 16-46 16S19 77 14 66z" fill="#3b9a5a"/>
  ${[-36, -18, 0, 18, 36].map((dx) => `<path d="M${60 + dx} 44c8 8 9 16 5 24h-10c-4-8-3-16 5-24z" fill="url(#ak)"/>`).join('')}
</svg>`;
/* ------------------------------------------------------------------ */
/* Welcome                                                             */
/* ------------------------------------------------------------------ */
function renderWelcome(root) {
  actionBar(null);
  root.appendChild(h(`<section class="welcome">
    <div class="hero-art"><div class="ha ha-k">${ART_KRATHONG}</div></div>
    <h1 class="hero-title">ลอยกระทง 3 มิติ</h1>
    <p class="hero-ja">3Dロイクラトン</p>
    <p class="hero-sub">แลกเปลี่ยนภาษาไทย–ญี่ปุ่น · タイ語と日本語の交流</p>
  </section>`));
  if (hadProgress && state.mode && state.step === 'welcome') {
    const r = h(`<div class="resume">
      <span class="resume-ico">🪷</span>
      <div class="resume-txt"><b>${esc(t('resume'))}</b><span>${esc(state.nameOut || '')}</span></div>
      <button class="btn btn-sm btn-primary" data-a="resume">${esc(t('resume'))} ›</button>
      <button class="btn btn-sm btn-ghost" data-a="restart" aria-label="${esc(t('restart'))}">✕</button>
    </div>`);
    r.querySelector('[data-a=resume]').onclick = () => { audio.init(); go(resumeStep === 'welcome' ? 'name' : resumeStep); };
    r.querySelector('[data-a=restart]').onclick = () => { state = fresh(); save(); render(); };
    root.appendChild(r);
  }
  const cards = h(`<div class="lang-pick">
    <p class="pick-label">เลือกภาษาของคุณ · 言語を選ぶ</p>
    <button class="lang-btn" data-mode="TH_TO_JP" data-lang="th"><span class="lf">🇹🇭</span><span class="lt"><b>ภาษาไทย</b><small>ฝึกเขียนภาษาญี่ปุ่น</small></span><span class="la">›</span></button>
    <button class="lang-btn" data-mode="JP_TO_TH" data-lang="ja"><span class="lf">🇯🇵</span><span class="lt ja"><b>日本語</b><small>タイ語を書いてみる</small></span><span class="la">›</span></button>
  </div>`);
  cards.querySelectorAll('.lang-btn').forEach((b) => {
    b.onclick = () => {
      audio.init();
      if (state.mode && state.mode !== b.dataset.mode) { const id = state.id; state = fresh(); state.id = id; }
      state.mode = b.dataset.mode;
      state.lang = b.dataset.lang;
      go('name');
    };
  });
  root.appendChild(cards);
  root.appendChild(h(`<p class="foot-links"><a href="/template.html" target="_blank" rel="noopener">📄 กระดาษ A4 · A4用紙</a></p>`));
}

/* ------------------------------------------------------------------ */
/* Name                                                                */
/* ------------------------------------------------------------------ */
function convertName(input) {
  return state.mode === LANGUAGE_MODES.TH_TO_JP ? thaiNameToKatakana(input) : japaneseNameToThai(input);
}
const patternLabels = () => ({ play: t('patPlay'), slow: t('patSlow'), all: t('patAll') });

function renderName(root) {
  const ja = targetScript() === 'ja';
  root.appendChild(h(`<div>${head(t('nameTitle'), t('nameSub'))}
    <label class="sr-only" for="nameInput">${esc(t('nameTitle'))}</label>
    <input id="nameInput" class="input input-lg" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="40" placeholder="${esc(t('namePlaceholder'))}" value="${esc(state.nameInput)}">
    <div id="nameResult"></div>
  </div>`));
  const input = $('#nameInput');
  const bar = actionBar([backBtn('welcome'), nextBtn('wish', !state.nameOut.trim())]);
  let patTimer = 0;
  function showResult(fromInput) {
    const res = $('#nameResult');
    if (fromInput && !state.nameEdited) {
      const out = convertName(state.nameInput);
      if (out.source === 'kanji') {
        res.innerHTML = `<p class="warn-line">⚠️ ${esc(t('kanjiError'))}</p>`;
        state.nameOut = ''; bar.next.disabled = true; save();
        return;
      }
      state.nameOut = out.text; state.nameSource = out.source;
    }
    bar.next.disabled = !state.nameOut.trim();
    save();
    if (!state.nameOut) { res.innerHTML = ''; return; }
    const reading = ja ? katakanaReading(state.nameOut).map((u) => `<span class="mora"><b>${esc(u.kana)}</b><span>${esc(u.romaji)}</span></span>`).join('') : '';
    const approx = state.nameSource !== 'dictionary' || state.nameEdited;
    res.innerHTML = `<div class="result-card">
      <div class="rc-label">${esc(t('nameResult'))}</div>
      <div class="rc-big ${targetScript()}" id="nameBig" spellcheck="false">${esc(state.nameOut)}</div>
      ${reading ? `<div class="reading">${reading}</div>` : ''}
      <div class="rc-actions">
        <button class="pill" id="speakName">🔊 ${esc(t('listen'))}</button>
        <button class="pill" id="editName">✏️ ${esc(approx ? t('nameApprox') : t('nameEdit'))}</button>
      </div>
      <div class="rc-pattern"><div class="rc-sub">✍️ ${esc(t('practice'))}</div><div id="namePat"></div></div>
    </div>`;
    $('#editName').onclick = () => {
      const big = $('#nameBig');
      big.contentEditable = 'true'; big.focus();
      document.getSelection()?.selectAllChildren(big);
      big.oninput = () => { state.nameEdited = true; state.nameOut = big.textContent.replace(/\s+/g, ' ').trim().slice(0, 40); bar.next.disabled = !state.nameOut; save(); };
      big.onblur = () => { big.contentEditable = 'false'; showResult(false); };
    };
    $('#speakName').onclick = () => speak(state.nameOut, ja ? 'ja-JP' : 'th-TH');
    clearTimeout(patTimer);
    patTimer = setTimeout(() => { const el = $('#namePat'); if (el) renderPattern(el, { text: state.nameOut, script: targetScript(), labels: patternLabels() }); }, 500);
  }
  input.addEventListener('input', () => { state.nameInput = input.value; state.nameEdited = false; showResult(true); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  if (state.nameOut) showResult(false); else setTimeout(() => input.focus(), 300);
}

/* ------------------------------------------------------------------ */
/* Speech + sheets                                                     */
/* ------------------------------------------------------------------ */
function getVoices() {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}
async function speak(text, lang) {
  if (!('speechSynthesis' in window) || !text) { toast(t('noVoice')); return; }
  const voices = await getVoices();
  const voice = voices.find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  if (!voice) { toast(t('noVoice')); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice; u.lang = voice.lang; u.rate = 0.82;
  speechSynthesis.speak(u);
}

function openSheet(content) {
  const back = h('<div class="sheet-backdrop"></div>');
  const sheet = h('<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><button class="sheet-x" aria-label="close">✕</button></div>');
  sheet.appendChild(content);
  document.body.append(back, sheet);
  document.body.style.overflow = 'hidden';
  const close = () => { back.remove(); sheet.remove(); document.body.style.overflow = ''; window.speechSynthesis?.cancel?.(); };
  back.onclick = close;
  sheet.querySelector('.sheet-x').onclick = close;
  return close;
}

/* ------------------------------------------------------------------ */
/* Wish                                                                */
/* ------------------------------------------------------------------ */
function wishTexts(w) {
  if (!w) return { target: state.customWish, native: '', reading: '', kana: '', cat: t('customCat'), script: scriptOf(state.customWish) };
  const ja = targetScript() === 'ja';
  return {
    target: ja ? w.ja : w.th, native: ja ? w.th : w.ja, reading: ja ? w.romaji : w.thPhonetic,
    kana: ja ? w.jaKana : '', cat: w.category[state.lang], script: targetScript(),
  };
}
const currentWish = () => (state.wishId === 'custom' ? null : getWish(state.wishId));

function renderWish(root) {
  root.appendChild(h(`<div>${head(t('wishTitle'), t('wishSub'))}<div class="wish-list" id="wishGrid"></div></div>`));
  const grid = $('#wishGrid');
  const bar = actionBar([backBtn('name'), nextBtn('write', !state.wishId)]);
  const draw = () => {
    grid.innerHTML = '';
    for (const w of WISHES) {
      const x = wishTexts(w);
      const card = h(`<button class="wish ${state.wishId === w.id ? 'selected' : ''}" type="button">
        <span class="wish-ico">${w.icon}</span>
        <span class="wish-txt"><span class="wish-target ${x.script}">${esc(x.target)}</span><span class="wish-mean">${esc(x.native)}</span></span>
        <span class="wish-check" aria-hidden="true">✓</span>
      </button>`);
      card.onclick = () => openWishLesson(w, () => { state.wishId = w.id; save(); bar.next.disabled = false; draw(); });
      grid.appendChild(card);
    }
    const custom = state.wishId === 'custom' && state.customWish;
    const cc = h(`<button class="wish wish-custom ${state.wishId === 'custom' ? 'selected' : ''}" type="button">
      <span class="wish-ico">✍️</span>
      <span class="wish-txt"><span class="wish-target ${custom ? scriptOf(state.customWish) : ''}">${esc(custom ? state.customWish : t('customCardHint'))}</span><span class="wish-mean">${esc(t('customCat'))}</span></span>
      <span class="wish-check" aria-hidden="true">✓</span>
    </button>`);
    cc.onclick = () => openCustomWish(() => { bar.next.disabled = false; draw(); });
    grid.appendChild(cc);
  };
  draw();
}

function openCustomWish(onChoose) {
  const content = h(`<div class="sheet-body">
    <h2 class="sheet-title">${esc(t('customTitle'))}</h2>
    <label class="sr-only" for="customWish">${esc(t('customTitle'))}</label>
    <textarea id="customWish" class="input" rows="2" maxlength="60" placeholder="${esc(t('customPlaceholder'))}"></textarea>
    <div class="count" data-count>0/60</div>
    <p class="hint">ℹ️ ${esc(t('customNote'))}</p>
    <div id="customPattern"></div>
    <button class="btn btn-primary btn-block" data-a="choose" disabled>✓ ${esc(t('customUse'))}</button>
  </div>`);
  const close = openSheet(content);
  const area = content.querySelector('#customWish');
  const btn = content.querySelector('[data-a=choose]');
  area.value = state.customWish;
  let timer = 0;
  const update = () => {
    const text = area.value.replace(/\s+/g, ' ').trim();
    content.querySelector('[data-count]').textContent = `${[...text].length}/60`;
    btn.disabled = !text;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const box = content.querySelector('#customPattern');
      if (!text) { box.innerHTML = ''; return; }
      renderPattern(box, { text, script: scriptOf(text), labels: patternLabels() });
    }, 450);
  };
  area.addEventListener('input', update);
  update();
  setTimeout(() => area.focus(), 300);
  btn.onclick = () => {
    state.customWish = area.value.replace(/\s+/g, ' ').trim().slice(0, 60);
    state.wishId = 'custom';
    save(); onChoose(); close(); vibrate(15);
  };
}

function openWishLesson(w, onChoose) {
  const x = wishTexts(w);
  const ja = targetScript() === 'ja';
  let useKana = false;
  const content = h(`<div class="sheet-body lesson">
    <div class="lesson-cat">${w.icon} ${esc(x.cat)}</div>
    <div class="lesson-target ${x.script}">${esc(x.target)}</div>
    ${x.kana ? `<div class="lesson-kana">${esc(x.kana)}</div>` : ''}
    <div class="lesson-read">${esc(x.reading)}</div>
    <div class="lesson-mean">${esc(t('meaning'))}: ${esc(x.native)}</div>
    <div class="rc-actions"><button class="pill" data-a="speak">🔊 ${esc(t('listen'))}</button></div>
    ${ja ? `<div class="seg-toggle"><button class="on" data-k="0">${esc(t('kanjiMode'))}</button><button data-k="1">${esc(t('kanaMode'))}</button></div>` : ''}
    <div id="lessonPattern"></div>
    <p class="hint center">💡 ${esc(ja ? t('strokeTip') : t('thaiTip'))}</p>
    ${onChoose ? `<button class="btn btn-primary btn-block" data-a="choose">✓ ${esc(t('chooseThis'))}</button>` : ''}
  </div>`);
  const close = openSheet(content);
  const pat = () => renderPattern(content.querySelector('#lessonPattern'), { text: ja ? (useKana ? w.jaKana : w.ja) : w.th, script: targetScript(), labels: patternLabels() });
  pat();
  content.querySelector('[data-a=speak]').onclick = () => speak(ja ? w.ja : w.th, ja ? 'ja-JP' : 'th-TH');
  content.querySelectorAll('.seg-toggle button').forEach((b) => {
    b.onclick = () => {
      useKana = b.dataset.k === '1';
      content.querySelectorAll('.seg-toggle button').forEach((o) => o.classList.toggle('on', o === b));
      pat();
    };
  });
  const choose = content.querySelector('[data-a=choose]');
  if (choose) choose.onclick = () => { onChoose(); close(); vibrate(15); };
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */
function renderWrite(root) {
  const w = currentWish();
  const x = wishTexts(w);
  const preview = `<div class="paper-preview">
        <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        <div class="pp-name" style="font-family:var(--font-trace-${targetScript()})">${esc(state.nameOut)}</div>
        <div class="pp-wish" style="font-family:var(--font-trace-${x.script})">${esc(x.target)}</div>
      </div>`;
  root.appendChild(h(`<div>${head(t('writeTitle'), t('writeSub'))}
    ${preview}
    <div class="rc-actions">
      <button class="pill" data-a="patName">✍️ ${esc(t('howToWrite'))} · ${esc(t('writeYourName'))}</button>
      <button class="pill" data-a="patWish">✍️ ${esc(t('howToWrite'))} · ${esc(t('writeYourWish'))}</button>
    </div>
    <ol class="mini-steps">${t('steps').map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <a class="btn btn-sm btn-ghost btn-block" href="/template.html" target="_blank" rel="noopener">📄 ${esc(t('templateLink'))}</a>
  </div>`));
  root.querySelector('[data-a=patName]').onclick = () => {
    const c = h('<div class="sheet-body"><h2 class="sheet-title center"></h2><div class="p"></div></div>');
    c.querySelector('h2').textContent = state.nameOut;
    openSheet(c); renderPattern(c.querySelector('.p'), { text: state.nameOut, script: targetScript(), size: 'lg', labels: patternLabels() });
  };
  root.querySelector('[data-a=patWish]').onclick = () => {
    if (w) { openWishLesson(w, null); return; }
    const c = h('<div class="sheet-body"><h2 class="sheet-title center"></h2><div class="p"></div></div>');
    c.querySelector('h2').textContent = x.target;
    openSheet(c); renderPattern(c.querySelector('.p'), { text: x.target, script: x.script, size: 'lg', labels: patternLabels() });
  };
  actionBar([backBtn('wish'), nextBtn('capture')]);
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */
const CAPTURE_ART_KRATHONG = `<svg viewBox="0 0 200 130" aria-hidden="true"><defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc2d1"/><stop offset="1" stop-color="#ff8fab"/></linearGradient></defs>
  <g transform="translate(100 66)">${Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30})" d="M0 -58 C13 -45 15 -36 9 -29 L-9 -29 C-15 -36 -13 -45 0 -58z" fill="url(#pg)" opacity=".9"/>`).join('')}
  <circle r="32" fill="#2E7D32"/><rect x="-24" y="-17" width="48" height="34" rx="3" fill="#fffdf7"/>
  ${[[-28, -21], [22, -21], [-28, 15], [22, 15]].map(([x, y]) => `<rect x="${x}" y="${y}" width="6" height="6" fill="#111"/>`).join('')}
  <path d="M-13 -4h26M-17 6h34" stroke="#333" stroke-width="2" stroke-linecap="round"/></g></svg>`;
function renderCapture(root) {
  const c = capture();
  root.appendChild(h(`<div>${head(c ? t('resultTitle') : t('captureTitle'), c ? '' : t('captureSub'))}<div id="capBody"></div></div>`));
  const body = $('#capBody');
  if (c) {
      body.appendChild(h(`<div class="cap-result">
        <div class="extract-preview"><img alt="" src="${c.dataURL}"></div>
        <div class="rc-sub">${esc(t('paletteHint'))}</div>
        <div class="palette" id="palette"></div>
      </div>`));
      const pal = $('#palette');
      for (const zone of ['base', 'innerPetal', 'outerPetal', 'flower']) {
        const sw = h(`<label class="swatch"><span class="sw" style="background:${c.colors[zone]}"><input type="color" value="${c.colors[zone].toLowerCase()}" aria-label="${esc(t('zone')[zone])}"></span>${esc(t('zone')[zone])}${c.found && c.found[zone] === false ? ' *' : ''}</label>`);
        const inp = sw.querySelector('input');
        inp.oninput = () => { c.colors[zone] = inp.value.toUpperCase(); sw.querySelector('.sw').style.background = inp.value; save(); };
        pal.appendChild(sw);
      }
      if (c.found && Object.values(c.found).some((v) => v === false)) body.appendChild(h(`<p class="hint center">${esc(t('defaultColorNote'))}</p>`));
    if (c.inkRatio !== undefined && c.inkRatio < 0.002) body.appendChild(h(`<p class="warn-line">⚠️ ${esc(t('faintInk'))}</p>`));
    body.appendChild(h(`<div class="rc-actions"><button class="pill" data-a="retake">📷 ${esc(t('retake'))}</button><button class="pill" data-a="draw">✏️ ${esc(t('drawInstead'))}</button></div>`));
    body.querySelector('[data-a=retake]').onclick = openCamera;
    body.querySelector('[data-a=draw]').onclick = openDrawPad;
  } else {
    body.appendChild(h(`<div class="cap-start">
      <div class="cap-art">${CAPTURE_ART_KRATHONG}</div>
      <ul class="tip-row">${t('tips').map((x, i) => `<li><span>${['💡', '📱', '⬛'][i]}</span>${esc(x)}</li>`).join('')}</ul>
      <button class="btn btn-primary btn-block btn-lg" data-a="cam">📷 ${esc(t('openCamera'))}</button>
      <label class="btn btn-block">🖼️ ${esc(t('upload'))}<input type="file" accept="image/*" hidden data-a="file"></label>
      <button class="text-link" data-a="draw">${esc(t('drawInstead'))}</button>
    </div>`));
    body.querySelector('[data-a=cam]').onclick = openCamera;
    body.querySelector('[data-a=draw]').onclick = openDrawPad;
    const file = body.querySelector('[data-a=file]');
    file.onchange = () => { if (file.files?.[0]) loadFile(file.files[0]); };
  }
  actionBar([backBtn('write'), nextBtn('send', !c, `🪷 ${t('sendTitle')}`)]);
}

function captureStrings() {
  return {
    captureHint: t('captureHint'), shoot: t('shoot'), cameraDenied: t('cameraDenied'), adjustTitle: t('adjustTitle'),
    autoFound: t('autoFound'), autoNotFound: t('autoNotFound'), retake: t('retake'), useThis: t('useThis'),
    processing: t('processing'), error: t('sendError'),
  };
}
function onCaptured(result) {
  state.capture = { dataURL: result.dataURL, colors: result.colors, found: result.found, inkRatio: result.inkRatio, source: result.source };
  save(); vibrate(20); render();
}
const captureOpts = () => ({ strings: captureStrings(), defaults: DEFAULT_COLORS, onResult: onCaptured, toast, vibrate });
const openCamera = () => startCamera(captureOpts());
const loadFile = (f) => captureFromFile(f, captureOpts());

/* ---------- Draw on screen (no paper) ---------- */
function openDrawPad() {
  const colors = { ...(capture()?.colors || DEFAULT_COLORS) };
  const pens = ['#1b1b1b', '#c0392b', '#1e5bb8', '#1f7a43'];
  let pen = pens[0];
  const x = wishTexts(currentWish());
  const [W, H] = [720, 500];
  const content = h(`<div class="sheet-body">
    <h2 class="sheet-title center">${esc(t('drawTitle'))}</h2>
    <div class="draw-pad"><div class="ghost" style="font-family:var(--font-trace-${x.script})">${esc(state.nameOut)}<br>${esc(x.target)}</div><canvas width="${W}" height="${H}"></canvas></div>
    <div class="pen-colors">${pens.map((p, i) => `<button type="button" style="background:${p}" class="${i ? '' : 'on'}" data-pen="${p}" aria-label="pen ${i + 1}"></button>`).join('')}</div>
    <div class="palette" id="drawPal"></div>
    <div class="row"><button class="btn" data-a="clear">${esc(t('clear'))}</button><button class="btn btn-primary" style="flex:1" data-a="done">✓ ${esc(t('done'))}</button></div>
  </div>`);
  const close = openSheet(content);
  const cv = content.querySelector('canvas');
  const g = cv.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  let drawing = false; let last = null; let strokes = 0;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); content.querySelector('.ghost').style.opacity = '0.35'; });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    g.strokeStyle = pen; g.lineWidth = 9;
    g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke();
    last = p; strokes++;
  });
  const end = () => { drawing = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  content.querySelectorAll('[data-pen]').forEach((b) => { b.onclick = () => { pen = b.dataset.pen; content.querySelectorAll('[data-pen]').forEach((o) => o.classList.toggle('on', o === b)); }; });
  const pal = content.querySelector('#drawPal');
  for (const zone of ['base', 'innerPetal', 'outerPetal', 'flower']) {
    const sw = h(`<label class="swatch"><span class="sw" style="background:${colors[zone]}"><input type="color" value="${colors[zone].toLowerCase()}"></span>${esc(t('zone')[zone])}</label>`);
    const inp = sw.querySelector('input');
    inp.oninput = () => { colors[zone] = inp.value.toUpperCase(); sw.querySelector('.sw').style.background = inp.value; };
    pal.appendChild(sw);
  }
  content.querySelector('[data-a=clear]').onclick = () => { g.clearRect(0, 0, cv.width, cv.height); strokes = 0; content.querySelector('.ghost').style.opacity = '1'; };
  content.querySelector('[data-a=done]').onclick = () => {
    if (strokes < 5) { toast(t('drawTitle')); return; }
    state.capture = { dataURL: IP.canvasToDataURL(cv), colors, found: null, inkRatio: undefined, source: 'draw' };
    save(); close(); render();
  };
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */
let sendUI = null;
let sendView = null;
let floatScene = null;

function destroySend() {
  floatScene?.destroy?.();
  floatScene = null;
  sendView?.remove();
  sendView = null;
  sendUI = null;
}

function buildPayload() {
  const c = capture();
  return {
    id: state.id,
    languageMode: state.mode,
    selectedWishId: state.wishId === 'custom' ? null : state.wishId,
    customWish: state.wishId === 'custom' ? state.customWish : '',
    colors: c.colors,
    handwritingImageBase64: c.dataURL,
    displayName: state.nameOut,
    displayNameOriginal: state.nameInput,
  };
}

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  try { await img.decode(); } catch { /* ignore */ }
  return img;
}

const SWIPE_HINT = (label) => `<div class="swipe-hint"><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>${esc(label)}</div>`;

function renderSend(root) {
  actionBar(null);
  root.innerHTML = '';
  const c = capture();
  if (!c) { go('capture'); return; }
  sendView = h(`<div class="float-view">
    <canvas class="three"></canvas>
    <div class="float-ui">
      <div class="float-top">
        <button class="btn btn-sm btn-glass" data-a="back">‹ ${esc(t('edit'))}</button>
        <span class="chip btn-glass"><span class="dot" data-conn></span>🪷 ${esc(t('sendTitle'))}</span>
      </div>
      <div class="float-bottom" id="sendBottom"></div>
    </div>
  </div>`);
  document.body.appendChild(sendView);
  sendView.querySelector('[data-a=back]').onclick = () => go('capture');
  setConn(socket?.connected);
  const bottom = sendView.querySelector('#sendBottom');
  let phase = 'ready'; // ready | flying | sent
  let sending = false;

  sendUI = {
    refresh() {
      if (!sendView) return;
      if (phase === 'sent') {
        bottom.innerHTML = `<div class="sent-card">
          <div class="sent-ico">🪷</div>
          <div class="sent-title">${esc(t('sent'))}</div>
          <p class="sent-sub">${esc(t('sentSub'))}</p>
          <div class="row"><button class="btn btn-ghost" style="flex:1" data-a="edit">${esc(t('edit'))}</button><button class="btn btn-primary" style="flex:1" data-a="again">${esc(t('again'))}</button></div>
        </div>`;
        bottom.querySelector('[data-a=again]').onclick = () => { phase = 'ready'; resetItem(); sendUI.refresh(); };
        bottom.querySelector('[data-a=edit]').onclick = () => go('capture');
        return;
      }
      if (phase === 'flying') { bottom.innerHTML = `<div class="lock-pill"><span class="spinner"></span>${esc(t('sending'))}</div>`; return; }
      floatScene?.setLocked(!ceremony.opened);
      if (!ceremony.opened) {
        bottom.innerHTML = `<div class="lock-pill"><span class="lock-ico">🔒</span><span><b>${esc(t('waiting'))}</b><br><small>${esc(t('waitingSub'))}</small></span></div>`;
      } else if (!floatScene) {
        bottom.innerHTML = `<button class="btn btn-primary btn-block" style="pointer-events:auto" data-a="tap">🪷 ${esc(t('tapToSend'))}</button>`;
        bottom.querySelector('[data-a=tap]').onclick = () => send();
      } else {
        bottom.innerHTML = SWIPE_HINT(t('swipe'));
      }
    },
    celebrate() {
      if (!sendView) return;
      sendView.appendChild(h('<div class="unlock-burst"></div>'));
      floatScene?.celebrate();
      toast('✨ ' + t('unlocked'), 'gold');
      vibrate([30, 60, 30]);
      audio.chime();
    },
  };

  function send() {
    if (sending) return;
    if (!socket?.connected) { toast(t('offline'), 'err'); phase = 'ready'; resetItem(); sendUI?.refresh(); return; }
    sending = true;
    socket.timeout(10000).emit('spawn_krathong', buildPayload(), (err, res) => {
      sending = false;
      if (err || !res?.ok) {
        const code = res?.error;
        if (code === 'ceremony_locked') ceremony.opened = false;
        toast(`${t('sendError')}${code === 'too_fast' ? ` · ${t('tooFast')}` : ''}`, 'err');
        phase = 'ready'; resetItem(); sendUI?.refresh();
        return;
      }
      state.sent++; save();
      phase = 'sent';
      audio.chime();
      sendUI?.refresh();
    });
  }

  async function resetItem() {
    if (!floatScene) return;
    const img = await loadImage(capture().dataURL);
    floatScene.setKrathong({ colors: capture().colors, signImage: img });
    floatScene.setLocked(!ceremony.opened);
  }

  sendUI.refresh();
  startKrathongScene(sendView, send, (p) => { phase = p; });

  function startKrathongScene(view, onExit, setPhase) {
    (async () => {
      try {
        const { hasWebGL } = await import('./scene-env.js');
        if (!hasWebGL()) throw new Error('no webgl');
        const { createFloatScene } = await import('./float-scene.js');
        const img = await loadImage(c.dataURL);
        if (!sendView) return;
        floatScene = await createFloatScene(view.querySelector('canvas.three'), {
          colors: c.colors, signImage: img, locked: !ceremony.opened, opened: ceremony.opened,
          gestureElement: view, labelContainer: view, signName: state.nameOut,
          onLockedAttempt: () => { toast('🔒 ' + t('waiting')); vibrate(40); },
          onLaunch: () => { setPhase('flying'); audio.swoosh(); vibrate(25); sendUI?.refresh(); },
          onExit,
        });
        if (!sendView) { floatScene.destroy(); floatScene = null; return; }
        sendUI.refresh();
      } catch (e) {
        console.warn(e);
        floatScene = null;
        if (sendView) {
          view.querySelector('canvas.three')?.remove();
          view.querySelector('.float-ui').insertAdjacentHTML('afterbegin', `<div class="center" style="margin-top:28vh;padding:0 24px"><img src="${c.dataURL}" alt="" style="max-width:280px;margin:0 auto;background:#fffdf7;border-radius:14px"><p class="muted">${esc(t('noWebgl'))}</p></div>`);
          sendUI.refresh();
        }
      }
    })();
  }
}

function onCeremonyOpened() {
  if (state.step === 'send' && sendUI) { sendUI.celebrate(); sendUI.refresh(); }
  else toast('✨ ' + t('unlocked'), 'gold');
}

/* ------------------------------------------------------------------ */
render();
