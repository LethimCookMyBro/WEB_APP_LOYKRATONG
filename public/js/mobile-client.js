// mobile-client.js — participant flow:
// language → name → wish → write & fold → capture → 3D preview → swipe to float.
import {
  WISHES, getWish, UI, LANGUAGE_MODES,
  japaneseNameToThai, thaiNameToKatakana, katakanaReading,
} from './language-data.js';
import { renderPattern } from './pattern-view.js';
import * as IP from './image-processor.js';
import { audio } from './audio.js';
import { startCamera, captureFromFile } from './capture-ui.js';

const DEFAULT_COLORS = { base: '#2E7D32', innerPetal: '#FF8F00', outerPetal: '#D84315', flower: '#FDD835' };
const STEPS = ['name', 'wish', 'write', 'capture', 'float'];
const STORE_KEY = 'loykrathong_state_v1';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
const fresh = () => ({
  step: 'welcome',
  mode: null,
  lang: 'th',
  nameInput: '',
  nameOut: '',
  nameEdited: false,
  nameSource: '',
  wishId: null,
  capture: null, // { dataURL, colors, found, inkRatio, source }
  id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  sent: 0,
});
let state = fresh();
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved && saved.mode) state = { ...fresh(), ...saved };
} catch { /* storage unavailable */ }
const hadProgress = state.step !== 'welcome';
if (hadProgress) state.resumeStep = state.step;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, resumeStep: undefined })); } catch { /* quota / private mode */ }
}

const ceremony = { opened: false, opening: false };
let floatScene = null;

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k) => UI[state.lang][k] ?? UI.th[k] ?? k;
const targetScript = () => (state.mode === LANGUAGE_MODES.TH_TO_JP ? 'ja' : 'th');
const nativeLang = () => (state.mode === LANGUAGE_MODES.TH_TO_JP ? 'th' : 'ja');
const targetFontClass = () => targetScript();
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

function toast(msg, type = '') {
  const el = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3200);
}

/* ------------------------------------------------------------------ */
/* Socket                                                              */
/* ------------------------------------------------------------------ */
const socket = window.io ? window.io({ transports: ['websocket', 'polling'] }) : null;
function setConn(on) {
  $('#connDot').className = 'dot ' + (on ? 'on' : 'off');
  $('#connText').textContent = on ? 'online' : 'offline';
  document.querySelectorAll('[data-conn]').forEach((n) => { n.className = 'dot ' + (on ? 'on' : 'off'); });
}
if (socket) {
  socket.on('connect', () => { setConn(true); socket.emit('join', { role: 'participant' }); });
  socket.on('disconnect', () => { setConn(false); });
  socket.on('ceremony_state', (s) => {
    const was = ceremony.opened;
    ceremony.opened = !!s.opened; ceremony.opening = !!s.opening;
    if (!was && ceremony.opened) onCeremonyOpened();
    if (was && !ceremony.opened) floatUI?.refresh();
    floatUI?.refresh();
  });
} else {
  setConn(false);
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */
function go(step) {
  if (step !== 'float') destroyFloat();
  state.step = step;
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function canEnter(step) {
  const i = STEPS.indexOf(step);
  if (i >= 1 && !state.nameOut.trim()) return false;
  if (i >= 2 && !state.wishId) return false;
  if (i >= 4 && !state.capture) return false;
  return true;
}

function renderChrome() {
  document.body.dataset.lang = state.lang;
  document.documentElement.lang = state.lang;
  $('#brandTitle').textContent = t('appTitle');
  $('#brandSub').textContent = t('appSub');
  const prog = $('#progress');
  const idx = STEPS.indexOf(state.step);
  prog.hidden = idx < 0;
  if (idx >= 0) {
    const labels = [t('stepName'), t('stepWish'), t('stepWrite'), t('stepCapture'), t('stepFloat')];
    prog.innerHTML = STEPS.map((s, i) => `<div class="seg ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}" data-step="${s}"><div class="bar"></div>${esc(labels[i])}</div>`).join('');
    prog.querySelectorAll('.seg.done').forEach((n) => { n.onclick = () => go(n.dataset.step); });
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
    refs[b.key || b.html] = el;
  }
  return refs;
}

function render() {
  renderChrome();
  const screen = $('#screen');
  screen.innerHTML = '';
  screen.style.animation = 'none'; void screen.offsetWidth; screen.style.animation = '';
  ({ welcome: renderWelcome, name: renderName, wish: renderWish, write: renderWrite, capture: renderCapture, float: renderFloat })[state.step]?.(screen);
}

/* ------------------------------------------------------------------ */
/* Welcome                                                             */
/* ------------------------------------------------------------------ */
function renderWelcome(root) {
  actionBar(null);
  root.appendChild(h(`
    <section class="hero">
      <img class="hero-lotus" src="/assets/lotus.svg" alt="">
      <h1>ลอยกระทง 3 มิติ<span class="ja">3Dロイクラトン ・ ことばの交流</span></h1>
      <p>เขียนชื่อและคำอธิษฐานเป็นภาษาของเพื่อน พับกระทงกระดาษ แล้วส่งขึ้นจอใหญ่<br>
      <span style="font-family:var(--font-ja)">友だちの言葉で名前とねがいごとを書いて、紙のクラトンを大きな画面に流そう</span></p>
    </section>`));
  if (hadProgress && state.mode && state.resumeStep) {
    const resume = h(`<div class="card" style="margin-top:18px">
      <div class="row"><span style="font-size:22px">🪷</span><div style="flex:1"><b>${esc(t('resume'))}</b><div class="muted small">${esc(state.nameOut || '')}</div></div></div>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" style="flex:1" data-a="resume">${esc(t('resume'))}</button><button class="btn" data-a="restart">${esc(t('restart'))}</button></div>
    </div>`);
    resume.querySelector('[data-a=resume]').onclick = () => { audio.init(); go(state.resumeStep); };
    resume.querySelector('[data-a=restart]').onclick = () => { state = fresh(); save(); render(); };
    root.appendChild(resume);
  }
  const cards = h(`<div class="lang-cards">
    <button class="lang-card" data-mode="TH_TO_JP" data-lang="th">
      <span class="flag">🇹🇭</span>
      <span><span class="t1">ฉันเป็นคนไทย</span><br><span class="t2">อยากฝึกเขียนชื่อและคำอวยพรเป็น <b>ภาษาญี่ปุ่น</b></span></span>
      <span class="arrow">›</span>
    </button>
    <button class="lang-card" data-mode="JP_TO_TH" data-lang="ja">
      <span class="flag">🇯🇵</span>
      <span><span class="t1" style="font-family:var(--font-ja)">日本から来ました</span><br><span class="t2" style="font-family:var(--font-ja)">名前とねがいごとを<b>タイ語</b>で書いてみたい</span></span>
      <span class="arrow">›</span>
    </button>
  </div>`);
  cards.querySelectorAll('.lang-card').forEach((b) => {
    b.onclick = () => {
      audio.init();
      const changed = state.mode && state.mode !== b.dataset.mode;
      if (changed) { const id = state.id; state = fresh(); state.id = id; }
      state.mode = b.dataset.mode;
      state.lang = b.dataset.lang;
      go('name');
    };
  });
  root.appendChild(cards);
  root.appendChild(h(`<p class="center muted small" style="margin-top:22px">กระดาษ A4 · A4用紙: <a class="link" href="/template.html" target="_blank" rel="noopener">template</a></p>`));
}

/* ------------------------------------------------------------------ */
/* Step 1 — Name                                                       */
/* ------------------------------------------------------------------ */
function convertName(input) {
  return state.mode === LANGUAGE_MODES.TH_TO_JP ? thaiNameToKatakana(input) : japaneseNameToThai(input);
}

function renderName(root) {
  const ja = targetScript() === 'ja';
  root.appendChild(h(`<div>
    <div class="eyebrow">${esc(t('stepName'))} · 1/5</div>
    <h2 class="h1">${esc(t('nameTitle'))}</h2>
    <p class="muted" style="margin:0 0 14px">${esc(t('nameHint'))}</p>
    <label class="sr-only" for="nameInput">${esc(t('nameTitle'))}</label>
    <input id="nameInput" class="input" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="40" placeholder="${esc(t('namePlaceholder'))}" value="${esc(state.nameInput)}">
    <div id="nameResult"></div>
    <div id="namePattern"></div>
  </div>`));
  const input = $('#nameInput');
  const bar = actionBar([
    { html: `‹ ${esc(t('back'))}`, cls: 'btn-ghost', onClick: () => go('welcome'), key: 'back' },
    { html: `${esc(t('next'))} ›`, cls: 'btn-primary', onClick: () => go('wish'), key: 'next', disabled: !state.nameOut.trim() },
  ]);
  let patternTimer = null;
  function showResult(fromInput) {
    const res = $('#nameResult');
    if (fromInput && !state.nameEdited) {
      const out = convertName(state.nameInput);
      if (out.source === 'kanji') {
        res.innerHTML = `<div class="notice" style="margin-top:14px">⚠️ ${esc(t('kanjiError'))}</div>`;
        state.nameOut = ''; bar.next.disabled = true; $('#namePattern').innerHTML = ''; save();
        return;
      }
      state.nameOut = out.text; state.nameSource = out.source;
    }
    bar.next.disabled = !state.nameOut.trim();
    save();
    if (!state.nameInput.trim() && !state.nameOut) { res.innerHTML = ''; $('#namePattern').innerHTML = ''; return; }
    const reading = ja ? katakanaReading(state.nameOut).map((u) => `<span class="mora"><b>${esc(u.kana)}</b><span>${esc(u.romaji)}</span></span>`).join('') : '';
    res.innerHTML = `<div class="name-result">
      <div class="muted small">${esc(t('nameResult'))}</div>
      <div class="big ${targetFontClass()}" id="nameBig" spellcheck="false">${esc(state.nameOut)}</div>
      ${reading ? `<div class="reading">${reading}</div>` : `<div class="muted small" style="margin-top:6px">${esc(state.nameInput)}</div>`}
      <div class="row-wrap" style="justify-content:center;margin-top:12px">
        <span class="chip ${state.nameSource === 'dictionary' && !state.nameEdited ? 'ok' : 'warn'}">${state.nameSource === 'dictionary' && !state.nameEdited ? '✓ ' + esc(t('nameDict')) : '≈ ' + esc(t('nameApprox'))}</span>
      </div>
      <div class="row-wrap" style="justify-content:center;margin-top:10px">
        <button class="btn btn-sm" id="editName">✏️ ${esc(t('nameEdit'))}</button>
        <button class="btn btn-sm" id="speakName">🔊 ${esc(t('listen'))}</button>
      </div>
    </div>`;
    $('#editName').onclick = () => {
      const big = $('#nameBig');
      big.contentEditable = 'true'; big.focus();
      document.getSelection()?.selectAllChildren(big);
      big.oninput = () => { state.nameEdited = true; state.nameOut = big.textContent.replace(/\s+/g, ' ').trim().slice(0, 40); bar.next.disabled = !state.nameOut; save(); schedulePattern(); };
      big.onblur = () => { big.contentEditable = 'false'; showResult(false); };
    };
    $('#speakName').onclick = () => speak(state.nameOut, ja ? 'ja-JP' : 'th-TH');
    schedulePattern();
  }
  function schedulePattern() {
    clearTimeout(patternTimer);
    patternTimer = setTimeout(() => {
      const box = $('#namePattern');
      if (!box) return;
      if (!state.nameOut) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="card" style="margin-top:14px"><div class="h2">✍️ ${esc(t('practice'))}</div><div id="namePat"></div>
        <div class="pattern-tip"><span class="ico">💡</span><span>${esc(ja ? t('strokeTip') : t('thaiTip'))}</span></div></div>`;
      renderPattern($('#namePat'), { text: state.nameOut, script: targetScript(), labels: patternLabels() });
    }, 650);
  }
  input.addEventListener('input', () => {
    state.nameInput = input.value;
    state.nameEdited = false;
    showResult(true);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && state.nameOut) { input.blur(); } });
  if (state.nameInput || state.nameOut) showResult(!state.nameEdited && !state.nameOut);
  else setTimeout(() => input.focus(), 300);
}

function patternLabels() {
  return state.lang === 'ja' ? { play: '再生', slow: 'ゆっくり', all: '全体' } : { play: 'เล่น', slow: 'ช้า', all: 'ทั้งหมด' };
}

/* ------------------------------------------------------------------ */
/* Speech                                                              */
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

/* ------------------------------------------------------------------ */
/* Bottom sheet                                                        */
/* ------------------------------------------------------------------ */
function openSheet(content) {
  const back = h('<div class="sheet-backdrop"></div>');
  const sheet = h('<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div></div>');
  sheet.appendChild(content);
  document.body.append(back, sheet);
  document.body.style.overflow = 'hidden';
  const close = () => { back.remove(); sheet.remove(); document.body.style.overflow = ''; speechSynthesis?.cancel?.(); };
  back.onclick = close;
  // swipe down to close
  let sy = null;
  sheet.querySelector('.grab').addEventListener('pointerdown', (e) => { sy = e.clientY; });
  window.addEventListener('pointerup', (e) => { if (sy !== null && e.clientY - sy > 60) close(); sy = null; }, { once: false });
  return close;
}

/* ------------------------------------------------------------------ */
/* Step 2 — Wish                                                       */
/* ------------------------------------------------------------------ */
function wishTexts(w) {
  const ja = targetScript() === 'ja';
  return {
    target: ja ? w.ja : w.th,
    native: ja ? w.th : w.ja,
    reading: ja ? w.romaji : w.thPhonetic,
    kana: ja ? w.jaKana : '',
    cat: w.category[state.lang],
  };
}

function renderWish(root) {
  root.appendChild(h(`<div>
    <div class="eyebrow">${esc(t('stepWish'))} · 2/5</div>
    <h2 class="h1">${esc(t('wishTitle'))}</h2>
    <p class="muted" style="margin:0">${esc(t('wishHint'))}</p>
    <div class="wish-grid" id="wishGrid"></div>
  </div>`));
  const grid = $('#wishGrid');
  const bar = actionBar([
    { html: `‹ ${esc(t('back'))}`, cls: 'btn-ghost', onClick: () => go('name'), key: 'back' },
    { html: `${esc(t('next'))} ›`, cls: 'btn-primary', onClick: () => go('write'), key: 'next', disabled: !state.wishId },
  ]);
  const draw = () => {
    grid.innerHTML = '';
    for (const w of WISHES) {
      const x = wishTexts(w);
      const card = h(`<button class="wish-card ${state.wishId === w.id ? 'selected' : ''}" type="button">
        <span class="ico">${w.icon}</span>
        <span><span class="cat">${esc(x.cat)}</span><span class="target ${targetFontClass()}" style="display:block">${esc(x.target)}</span><span class="native">${esc(x.native)}</span></span>
        <span class="check">✓</span>
      </button>`);
      card.onclick = () => openWishLesson(w, () => { state.wishId = w.id; save(); bar.next.disabled = false; draw(); });
      grid.appendChild(card);
    }
  };
  draw();
}

function openWishLesson(w, onChoose) {
  const x = wishTexts(w);
  const ja = targetScript() === 'ja';
  let useKana = false;
  const content = h(`<div class="lesson">
    <div class="eyebrow">${w.icon} ${esc(x.cat)}</div>
    <div class="target ${targetFontClass()}">${esc(x.target)}</div>
    ${x.kana ? `<div class="kana">${esc(x.kana)}</div>` : ''}
    <div class="phon">${esc(x.reading)}</div>
    <div class="mean"><b>${esc(t('meaning'))}:</b> ${esc(x.native)} · ${esc(w.en)}</div>
    <div class="row-wrap" style="justify-content:center;margin-top:12px">
      <button class="btn btn-sm" data-a="speak">🔊 ${esc(t('listen'))}</button>
      <button class="btn btn-sm" data-a="speakNative">🔊 ${esc(nativeLang() === 'th' ? 'ไทย' : '日本語')}</button>
    </div>
    ${ja ? `<div style="margin-top:14px"><div class="seg-toggle"><button class="on" data-k="0">${esc(t('kanjiMode'))}</button><button data-k="1">${esc(t('kanaMode'))}</button></div></div>` : ''}
    <div id="lessonPattern" style="margin-top:6px"></div>
    <div class="pattern-tip"><span class="ico">💡</span><span>${esc(ja ? t('strokeTip') : t('thaiTip'))}</span></div>
    <button class="btn btn-primary btn-block" style="margin-top:16px" data-a="choose">✓ ${esc(t('wishTitle'))}</button>
  </div>`);
  const close = openSheet(content);
  const pat = () => renderPattern(content.querySelector('#lessonPattern'), { text: ja ? (useKana ? w.jaKana : w.ja) : w.th, script: targetScript(), labels: patternLabels() });
  pat();
  content.querySelector('[data-a=speak]').onclick = () => speak(ja ? w.ja : w.th, ja ? 'ja-JP' : 'th-TH');
  content.querySelector('[data-a=speakNative]').onclick = () => speak(ja ? w.th : w.ja, ja ? 'th-TH' : 'ja-JP');
  content.querySelectorAll('.seg-toggle button').forEach((b) => {
    b.onclick = () => {
      useKana = b.dataset.k === '1';
      content.querySelectorAll('.seg-toggle button').forEach((o) => o.classList.toggle('on', o === b));
      pat();
    };
  });
  content.querySelector('[data-a=choose]').onclick = () => { onChoose(); close(); vibrate(15); };
}

/* ------------------------------------------------------------------ */
/* Step 3 — Write & fold                                               */
/* ------------------------------------------------------------------ */
const FOLD_ICONS = [
  '<svg viewBox="0 0 40 40" fill="none" stroke="#ffe1a1" stroke-width="2" stroke-linecap="round"><path d="M8 30c4-10 10-16 22-22"/><path d="M26 6l8 8-4 4-8-8z" fill="#ff8fab" stroke="#ff8fab"/><circle cx="10" cy="30" r="3" fill="#5fd3b3" stroke="none"/></svg>',
  '<svg viewBox="0 0 40 40" fill="none" stroke="#ffe1a1" stroke-width="2"><rect x="5" y="9" width="30" height="22" rx="2"/><path d="M10 17h14M10 23h20" stroke-linecap="round"/><rect x="3" y="7" width="4" height="4" fill="#ffe1a1"/><rect x="33" y="29" width="4" height="4" fill="#ffe1a1"/></svg>',
  '<svg viewBox="0 0 40 40" fill="none" stroke="#ffe1a1" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="28" r="5"/><circle cx="11" cy="12" r="5"/><path d="M15 25L34 8M15 15l19 17"/></svg>',
  '<svg viewBox="0 0 40 40" fill="none" stroke="#ffe1a1" stroke-width="2" stroke-linejoin="round"><path d="M6 28l8-14h12l8 14z"/><path d="M14 14l-4-8M26 14l4-8" stroke-dasharray="3 3"/></svg>',
  '<svg viewBox="0 0 40 40" fill="none" stroke="#ffe1a1" stroke-width="2" stroke-linejoin="round"><path d="M4 26c6 6 26 6 32 0"/><path d="M8 26l3-10 5 6 4-10 4 10 5-6 3 10" fill="#ff8fab55"/><path d="M20 8v6" stroke="#f5c66a"/></svg>',
];

function renderWrite(root) {
  const w = getWish(state.wishId);
  const x = wishTexts(w);
  root.appendChild(h(`<div>
    <div class="eyebrow">${esc(t('stepWrite'))} · 3/5</div>
    <h2 class="h1">${esc(t('writeTitle'))}</h2>
    <p class="muted" style="margin:0 0 14px">${esc(t('writeHint'))}</p>
    <div class="paper-preview">
      <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
      <div class="muted small" style="color:#9a8f80">${esc(t('writeYourName'))}</div>
      <div class="pp-name ${targetFontClass()}" style="font-family:var(--font-trace-${targetScript()})">${esc(state.nameOut)}</div>
      <div class="muted small" style="color:#9a8f80;margin-top:4px">${esc(t('writeYourWish'))}</div>
      <div class="pp-wish" style="font-family:var(--font-trace-${targetScript()})">${esc(x.target)}</div>
    </div>
    <div class="row-wrap" style="justify-content:center;margin-top:12px">
      <button class="btn btn-sm" data-a="patName">✍️ ${esc(t('writeYourName'))}</button>
      <button class="btn btn-sm" data-a="patWish">✍️ ${esc(t('writeYourWish'))}</button>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="h2">🪷 ${esc(t('foldTitle'))}</div>
      <ol class="steps-list">${t('fold').map((s, i) => `<li><span class="ill">${FOLD_ICONS[i]}</span><p>${esc(s)}</p></li>`).join('')}</ol>
      <a class="btn btn-sm btn-block" style="margin-top:14px" href="/template.html" target="_blank" rel="noopener">📄 ${esc(t('templateLink'))}</a>
    </div>
  </div>`));
  root.querySelector('[data-a=patName]').onclick = () => {
    const c = h('<div><div class="h2 center">' + esc(state.nameOut) + '</div><div class="p"></div></div>');
    openSheet(c); renderPattern(c.querySelector('.p'), { text: state.nameOut, script: targetScript(), size: 'lg', labels: patternLabels() });
  };
  root.querySelector('[data-a=patWish]').onclick = () => openWishLesson(w, () => {});
  actionBar([
    { html: `‹ ${esc(t('back'))}`, cls: 'btn-ghost', onClick: () => go('wish') },
    { html: `📷 ${esc(t('next'))} ›`, cls: 'btn-primary', onClick: () => go('capture') },
  ]);
}

/* ------------------------------------------------------------------ */
/* Step 4 — Capture                                                    */
/* ------------------------------------------------------------------ */
function renderCapture(root) {
  const c = state.capture;
  root.appendChild(h(`<div>
    <div class="eyebrow">${esc(t('stepCapture'))} · 4/5</div>
    <h2 class="h1">${esc(c ? t('resultTitle') : t('captureTitle'))}</h2>
    <p class="muted" style="margin:0 0 14px">${esc(c ? t('paletteHint') : t('captureHint'))}</p>
    <div id="capBody"></div>
  </div>`));
  const body = $('#capBody');
  if (c) {
    body.appendChild(h(`<div class="card">
      <div class="extract-preview"><img alt="" src="${c.dataURL}"></div>
      ${c.inkRatio !== undefined && c.inkRatio < 0.002 ? `<div class="notice" style="margin-top:10px">⚠️ ${state.lang === 'ja' ? '字が薄いかもしれません。濃いペンで書くか、明るい所で撮り直してください' : 'ลายมืออาจจางเกินไป ลองใช้ปากกาสีเข้มหรือถ่ายในที่สว่างขึ้น'}</div>` : ''}
      <div class="palette" id="palette"></div>
    </div>`));
    const pal = $('#palette');
    for (const zone of ['base', 'innerPetal', 'outerPetal', 'flower']) {
      const sw = h(`<label class="swatch"><span class="sw" style="background:${c.colors[zone]}"><input type="color" value="${c.colors[zone].toLowerCase()}" aria-label="${esc(t('zone')[zone])}"></span>${esc(t('zone')[zone])}${c.found && c.found[zone] === false ? ' *' : ''}</label>`);
      const inp = sw.querySelector('input');
      inp.oninput = () => { c.colors[zone] = inp.value.toUpperCase(); sw.querySelector('.sw').style.background = inp.value; save(); };
      pal.appendChild(sw);
    }
    if (c.found && Object.values(c.found).some((v) => v === false)) {
      body.appendChild(h(`<p class="muted small center" style="margin-top:8px">* ${state.lang === 'ja' ? '色が読み取れなかった部分は標準の色です' : 'สีที่อ่านไม่ได้ ใช้สีเริ่มต้นแทน'}</p>`));
    }
    body.appendChild(h(`<div class="row-wrap" style="justify-content:center;margin-top:14px">
      <button class="btn btn-sm" data-a="retake">📷 ${esc(t('retake'))}</button>
      <button class="btn btn-sm" data-a="draw">✏️ ${esc(t('drawInstead'))}</button>
    </div>`));
    body.querySelector('[data-a=retake]').onclick = openCamera;
    body.querySelector('[data-a=draw]').onclick = openDrawPad;
  } else {
    body.appendChild(h(`<div class="card center">
      <svg viewBox="0 0 200 150" style="width:100%;max-width:280px;margin:0 auto 6px;display:block">
        <defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc2d1"/><stop offset="1" stop-color="#ff8fab"/></linearGradient></defs>
        <rect x="4" y="4" width="192" height="142" rx="16" fill="none" stroke="#ffe1a1" stroke-opacity=".35" stroke-dasharray="6 6"/>
        <g transform="translate(100 78)">
          ${Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30})" d="M0 -62 C14 -48 16 -38 10 -30 L-10 -30 C-16 -38 -14 -48 0 -62z" fill="url(#pg)" opacity=".85"/>`).join('')}
          <circle r="34" fill="#2E7D32"/>
          <rect x="-26" y="-18" width="52" height="36" rx="3" fill="#fffdf7"/>
          <rect x="-30" y="-22" width="6" height="6" fill="#111"/><rect x="24" y="-22" width="6" height="6" fill="#111"/>
          <rect x="-30" y="16" width="6" height="6" fill="#111"/><rect x="24" y="16" width="6" height="6" fill="#111"/>
          <path d="M-14 -4h28M-18 6h36" stroke="#333" stroke-width="2" stroke-linecap="round"/>
        </g>
      </svg>
      <div class="stack">
        <button class="btn btn-primary btn-block" data-a="cam">📷 ${esc(t('openCamera'))}</button>
        <label class="btn btn-block" style="cursor:pointer">🖼️ ${esc(t('upload'))}<input type="file" accept="image/*" hidden data-a="file"></label>
        <button class="btn btn-ghost btn-block" data-a="draw">✏️ ${esc(t('drawInstead'))}</button>
      </div>
    </div>`));
    body.querySelector('[data-a=cam]').onclick = openCamera;
    body.querySelector('[data-a=draw]').onclick = openDrawPad;
  }
  const file = body.querySelector('[data-a=file]') || h('<input type="file" accept="image/*" hidden>');
  file.onchange = () => { if (file.files?.[0]) loadFile(file.files[0]); };
  actionBar([
    { html: `‹ ${esc(t('back'))}`, cls: 'btn-ghost', onClick: () => go('write') },
    { html: `🪷 ${esc(t('next'))} ›`, cls: 'btn-primary', onClick: () => go('float'), disabled: !c },
  ]);
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
  save();
  vibrate(20);
  render();
}
const captureOpts = () => ({ strings: captureStrings(), defaults: DEFAULT_COLORS, onResult: onCaptured, toast, vibrate });
const openCamera = () => startCamera(captureOpts());
const loadFile = (f) => captureFromFile(f, captureOpts());

/* ---------- Draw on screen (no paper) ---------- */
function openDrawPad() {
  const colors = { ...(state.capture?.colors || DEFAULT_COLORS) };
  const pens = ['#1b1b1b', '#c0392b', '#1e5bb8', '#1f7a43'];
  let pen = pens[0];
  const w = getWish(state.wishId); const x = wishTexts(w);
  const content = h(`<div>
    <div class="h2 center">${esc(t('drawTitle'))}</div>
    <p class="muted small center" style="margin:0 0 10px"><span class="${targetFontClass()}">${esc(state.nameOut)} · ${esc(x.target)}</span></p>
    <div class="draw-pad"><div class="ghost" style="font-family:var(--font-trace-${targetScript()})">${esc(state.nameOut)}<br>${esc(x.target)}</div><canvas width="720" height="500"></canvas></div>
    <div class="pen-colors">${pens.map((p, i) => `<button type="button" style="background:${p}" class="${i ? '' : 'on'}" data-pen="${p}" aria-label="pen ${i + 1}"></button>`).join('')}</div>
    <div class="palette" id="drawPal"></div>
    <div class="row" style="margin-top:14px"><button class="btn" data-a="clear">${esc(t('clear'))}</button><button class="btn btn-primary" style="flex:1" data-a="done">✓ ${esc(t('done'))}</button></div>
  </div>`);
  const close = openSheet(content);
  const cv = content.querySelector('canvas');
  const g = cv.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  let drawing = false; let last = null; let strokes = 0;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); content.querySelector('.ghost').style.opacity = '0.4'; });
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
/* Step 5 — Float                                                      */
/* ------------------------------------------------------------------ */
let floatUI = null;
let floatView = null;

function destroyFloat() {
  floatScene?.destroy?.();
  floatScene = null;
  floatView?.remove();
  floatView = null;
  floatUI = null;
}

function buildPayload() {
  return {
    id: state.id,
    isHost: false,
    languageMode: state.mode,
    selectedWishId: state.wishId,
    colors: state.capture.colors,
    handwritingImageBase64: state.capture.dataURL,
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

function renderFloat(root) {
  actionBar(null);
  root.innerHTML = '';
  if (!state.capture) { go('capture'); return; }
  floatView = h(`<div class="float-view">
    <canvas class="three"></canvas>
    <div class="float-ui">
      <div class="float-top">
        <button class="btn btn-sm" data-a="back">‹ ${esc(t('editAgain'))}</button>
        <span class="chip"><span class="dot" data-conn></span>${esc(t('floatTitle'))}</span>
      </div>
      <div class="float-bottom" id="floatBottom"></div>
    </div>
  </div>`);
  document.body.appendChild(floatView);
  floatView.querySelector('[data-a=back]').onclick = () => go('capture');
  setConn(socket?.connected);
  const bottom = floatView.querySelector('#floatBottom');
  let phase = 'ready'; // ready | flying | sent
  let sending = false;

  floatUI = {
    refresh() {
      if (!floatView) return;
      if (phase === 'sent') {
        bottom.innerHTML = `<div class="card sent-card">
          <div style="font-size:40px">🪷</div>
          <div class="h1">${esc(t('sent'))}</div>
          <p class="muted" style="margin:0 0 14px">${esc(t('sentSub'))}</p>
          <div class="row"><button class="btn" data-a="edit">${esc(t('editAgain'))}</button><button class="btn btn-primary" style="flex:1" data-a="again">${esc(t('again'))}</button></div>
        </div>`;
        bottom.querySelector('[data-a=again]').onclick = () => { phase = 'ready'; resetKrathong(); floatUI.refresh(); };
        bottom.querySelector('[data-a=edit]').onclick = () => go('capture');
        return;
      }
      if (phase === 'flying') { bottom.innerHTML = `<div class="lock-pill"><span class="spinner"></span>${esc(t('floating'))}</div>`; return; }
      floatScene?.setLocked(!ceremony.opened);
      if (!ceremony.opened) {
        bottom.innerHTML = `<div class="lock-pill"><span class="spinner"></span><span><b>${esc(t('waiting'))}</b><br><span class="muted small">${esc(t('waitingSub'))}</span></span></div>`;
      } else if (!floatScene) {
        bottom.innerHTML = `<button class="btn btn-primary btn-block" style="pointer-events:auto" data-a="tap">🪷 ${esc(t('tapToSend'))}</button>`;
        bottom.querySelector('[data-a=tap]').onclick = () => send();
      } else {
        bottom.innerHTML = `<div class="swipe-hint"><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>${esc(t('swipe'))}</div>`;
      }
    },
    celebrate() {
      if (!floatView) return;
      floatView.appendChild(h('<div class="unlock-burst"></div>'));
      floatScene?.celebrate();
      toast('✨ ' + t('unlocked'), 'gold');
      vibrate([30, 60, 30]);
      audio.chime();
    },
  };

  async function send() {
    if (sending) return;
    if (!socket?.connected) { toast(t('offline'), 'err'); resetKrathong(); return; }
    sending = true;
    socket.timeout(10000).emit('spawn_krathong', buildPayload(), (err, res) => {
      sending = false;
      if (err || !res?.ok) {
        const code = res?.error;
        if (code === 'ceremony_locked') { ceremony.opened = false; }
        toast(`${t('sendError')}${code === 'too_fast' ? (state.lang === 'ja' ? '（少し待ってからもう一度）' : ' (รอสักครู่แล้วลองใหม่)') : ''}`, 'err');
        phase = 'ready'; resetKrathong(); floatUI?.refresh();
        return;
      }
      state.sent++; save();
      phase = 'sent';
      audio.chime();
      floatUI?.refresh();
    });
  }

  async function resetKrathong() {
    if (!floatScene) return;
    const img = await loadImage(state.capture.dataURL);
    floatScene.setKrathong({ colors: state.capture.colors, signImage: img });
    floatScene.setLocked(!ceremony.opened);
  }

  floatUI.refresh();
  (async () => {
    try {
      const { hasWebGL } = await import('./scene-env.js');
      if (!hasWebGL()) throw new Error('no webgl');
      const { createFloatScene } = await import('./float-scene.js');
      const img = await loadImage(state.capture.dataURL);
      if (!floatView) return;
      floatScene = await createFloatScene(floatView.querySelector('canvas.three'), {
        colors: state.capture.colors,
        signImage: img,
        locked: !ceremony.opened,
        opened: ceremony.opened,
        gestureElement: floatView,
        onLockedAttempt: () => { toast('🔒 ' + t('waiting')); vibrate(40); },
        onLaunch: () => { phase = 'flying'; audio.swoosh(); vibrate(25); floatUI?.refresh(); },
        onExit: () => send(),
      });
      if (!floatView) { floatScene.destroy(); floatScene = null; return; }
      floatUI.refresh();
    } catch (e) {
      console.warn(e);
      floatScene = null;
      if (floatView) {
        floatView.querySelector('canvas.three').remove();
        floatView.querySelector('.float-ui').insertAdjacentHTML('afterbegin', `<div class="center" style="margin-top:30vh;padding:0 24px"><img src="${state.capture.dataURL}" alt="" style="max-width:280px;margin:0 auto;background:#fffdf7;border-radius:14px"><p class="muted">${esc(t('noWebgl'))}</p></div>`);
        floatUI.refresh();
      }
    }
  })();
}

function onCeremonyOpened() {
  if (state.step === 'float' && floatUI) {
    floatUI.celebrate();
    floatUI.refresh();
  } else {
    toast('✨ ' + t('unlocked'), 'gold');
  }
}

/* ------------------------------------------------------------------ */
render();
