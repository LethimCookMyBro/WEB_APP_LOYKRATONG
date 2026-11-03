// host.js — host / MC control page: PIN login, opening ceremony swipe,
// wish lessons on the projector, stage controls, moderation.
import { WISHES, getWish } from './language-data.js';
import { HOST_COLORS } from './krathong-model.js';
import { startCamera, captureFromFile } from './capture-ui.js';

const $ = (s) => document.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, type = '') {
  const el = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3200);
}
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

const socket = window.io({ transports: ['websocket', 'polling'] });
const ceremony = { opened: false, opening: false };
let authed = false;
let lessonOn = null;
let pad = null;
const hostK = { colors: { ...HOST_COLORS }, dataURL: null };

/* ---------------- auth ---------------- */
function auth(pin) {
  socket.emit('host_auth', { pin }, (res) => {
    if (!res?.ok) {
      ss.del('hostPin');
      $('#gate').hidden = false; $('#hostApp').hidden = true;
      $('#pinErr').textContent = res?.error === 'too_many_attempts' ? 'ลองผิดหลายครั้งเกินไป รีเฟรชหน้าแล้วลองใหม่' : 'PIN ไม่ถูกต้อง';
      return;
    }
    ss.set('hostPin', pin);
    authed = true;
    $('#gate').hidden = true; $('#hostApp').hidden = false;
    ceremony.opened = res.opened; ceremony.opening = res.opening;
    lessonOn = res.lesson?.wishId || null;
    $('#joinUrl').value = res.joinUrl || '';
    $('#hostQr').src = '/qr.svg?t=' + Date.now();
    setStats(res.stats);
    $('#modList').innerHTML = '';
    (res.recent || []).forEach((k) => addMod(k));
    if (!res.recent?.length) $('#modList').innerHTML = '<p class="muted small">ยังไม่มีกระทง</p>';
    renderLessons();
    refreshState();
    initPad();
  });
}
$('#pinForm').addEventListener('submit', (e) => { e.preventDefault(); $('#pinErr').textContent = ''; auth($('#pin').value.trim()); });
socket.on('connect', () => {
  $('#connText').textContent = 'เชื่อมต่อแล้ว';
  const pin = ss.get('hostPin');
  if (pin) auth(pin);
});
socket.on('disconnect', () => { $('#connText').textContent = 'ขาดการเชื่อมต่อ…'; });

/* ---------------- state ---------------- */
function setStats(s) {
  if (!s) return;
  $('#sParticipants').textContent = s.participants;
  $('#sStages').textContent = s.stages;
  $('#sFloated').textContent = s.floated;
  $('#sRiver').textContent = s.onRiver;
}
socket.on('stats', setStats);
socket.on('ceremony_state', (s) => { ceremony.opened = s.opened; ceremony.opening = s.opening; refreshState(); });

function refreshState() {
  const b = $('#stateBadge');
  if (ceremony.opened) { b.className = 'chip ok state-badge'; b.textContent = '● เปิดพิธีแล้ว · ผู้เข้าร่วมส่งกระทงได้'; }
  else if (ceremony.opening) { b.className = 'chip gold state-badge'; b.textContent = '✨ กำลังเปิดพิธี…'; }
  else { b.className = 'chip warn state-badge'; b.textContent = '🔒 รอพิธีเปิด · มือถือยังล็อกอยู่'; }
  pad?.setLocked(ceremony.opened || ceremony.opening);
  const ui = $('#padUi');
  if (ceremony.opened || ceremony.opening) {
    ui.innerHTML = `<div class="lock-pill" style="pointer-events:auto">${ceremony.opened ? '✅ พิธีเปิดแล้ว — กด “รีเซ็ตพิธี” หากต้องการซ้อมใหม่' : '<span class="spinner"></span> กำลังเปิดพิธีบนจอใหญ่…'}</div>`;
  } else {
    ui.innerHTML = `<div class="swipe-hint"><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>ปัดหน้าจอขึ้นเพื่อลอยกระทงปฐมฤกษ์</div>`;
  }
}

/* ---------------- ceremony pad ---------------- */
async function loadImage(src) {
  if (!src) return null;
  const img = new Image(); img.src = src;
  try { await img.decode(); return img; } catch { return null; }
}

async function setPadKrathong() {
  if (!pad) return;
  const img = await loadImage(hostK.dataURL);
  pad.setKrathong({ colors: hostK.colors, signImage: img, signText: img ? '' : $('#signText').value.trim(), signSubText: img ? '' : 'ロイクラトン', isHost: true });
  pad.setLocked(ceremony.opened || ceremony.opening);
}

async function initPad() {
  if (pad) return;
  try {
    const { hasWebGL } = await import('./scene-env.js');
    if (!hasWebGL()) throw new Error('no webgl');
    const { createFloatScene } = await import('./float-scene.js');
    pad = await createFloatScene($('#pad canvas'), {
      colors: hostK.colors, signText: $('#signText').value.trim(), signSubText: 'ロイクラトン', isHost: true,
      locked: ceremony.opened || ceremony.opening, opened: ceremony.opened, gestureElement: $('#pad'),
      onLockedAttempt: () => toast(ceremony.opened ? 'พิธีเปิดไปแล้ว' : 'กำลังเปิดพิธี…'),
      onLaunch: () => vibrate(30),
      onExit: () => startCeremony(),
    });
    await setPadKrathong();
  } catch (e) {
    console.warn(e);
    $('#padUi').insertAdjacentHTML('afterbegin', '<button class="btn btn-primary" style="pointer-events:auto;margin-bottom:auto;margin-top:40%" id="padFallback">🪔 เริ่มพิธีเปิด</button>');
    $('#padFallback').onclick = () => startCeremony();
  }
}

function startCeremony() {
  const payload = {
    id: `host_${Date.now()}`,
    colors: hostK.colors,
    handwritingImageBase64: hostK.dataURL,
    displayName: $('#signText').value.trim() || 'ลอยกระทง',
  };
  socket.timeout(10000).emit('start_ceremony', { krathong: payload }, (err, res) => {
    if (err || !res?.ok) {
      toast(res?.error === 'already_open' ? 'พิธีเปิดไปแล้ว' : 'เริ่มพิธีไม่สำเร็จ', 'err');
      setPadKrathong();
      return;
    }
    toast('✨ เริ่มพิธีเปิดแล้ว! มือถือผู้เข้าร่วมจะปลดล็อกในไม่กี่วินาที', 'gold');
  });
}

const captureOpts = {
  strings: {
    captureHint: 'วางกระทงต้นแบบบนพื้นเรียบ ถ่ายจากด้านบน ให้จุดดำ 4 มุมอยู่ในกรอบเล็ง', shoot: 'ถ่ายภาพ',
    cameraDenied: 'เปิดกล้องไม่ได้ ลองเลือกรูปจากเครื่องแทน', adjustTitle: 'ปรับมุมกรอบ', autoFound: 'พบจุดมุมอัตโนมัติแล้ว',
    autoNotFound: 'ลากจุดให้ตรงกับจุดดำ 4 มุม', retake: 'ถ่ายใหม่', useThis: 'ใช้ภาพนี้', processing: 'กำลังประมวลผล…', error: 'ประมวลผลภาพไม่สำเร็จ',
  },
  defaults: HOST_COLORS,
  toast, vibrate,
  onResult(r) {
    hostK.colors = r.colors; hostK.dataURL = r.dataURL;
    toast('ใช้ภาพกระทงต้นแบบแล้ว', 'gold');
    setPadKrathong();
  },
};
$('#hostCam').onclick = () => startCamera(captureOpts);
$('#hostFile').onchange = (e) => { const f = e.target.files?.[0]; if (f) captureFromFile(f, captureOpts); e.target.value = ''; };
$('#hostDefault').onclick = () => { hostK.colors = { ...HOST_COLORS }; hostK.dataURL = null; setPadKrathong(); };
let signTimer = 0;
$('#signText').addEventListener('input', () => { clearTimeout(signTimer); signTimer = setTimeout(() => { if (!hostK.dataURL) setPadKrathong(); }, 400); });

/* ---------------- lessons ---------------- */
function renderLessons() {
  const box = $('#lessons');
  box.innerHTML = '';
  for (const w of WISHES) {
    const item = h(`<div class="lesson-item ${lessonOn === w.id ? 'on' : ''}">
      <span style="font-size:22px">${w.icon}</span>
      <div class="txt"><b style="font-family:var(--font-trace-th)">${esc(w.th)}</b><span style="font-family:var(--font-ja)">${esc(w.ja)}</span></div>
      <button class="btn btn-sm ${lessonOn === w.id ? 'btn-primary' : ''}">${lessonOn === w.id ? 'กำลังแสดง' : 'แสดง'}</button>
    </div>`);
    item.querySelector('button').onclick = () => setLesson(lessonOn === w.id ? null : w.id);
    box.appendChild(item);
  }
}
function setLesson(id) {
  socket.emit('show_lesson', { wishId: id }, (res) => { if (res?.ok) { lessonOn = res.lesson?.wishId || null; renderLessons(); } });
}
$('#hideLesson').onclick = () => setLesson(null);

/* ---------------- stage controls ---------------- */
document.querySelectorAll('[data-ctl]').forEach((b) => {
  b.onclick = () => socket.emit('stage_control', { action: b.dataset.ctl }, (r) => r?.ok && toast('ส่งคำสั่งไปจอใหญ่แล้ว'));
});
let volTimer = 0;
$('#vol').addEventListener('input', (e) => {
  clearTimeout(volTimer);
  volTimer = setTimeout(() => socket.emit('stage_control', { action: 'volume', value: Number(e.target.value) }), 120);
});
function saveJoinUrl(url) {
  socket.emit('set_join_url', { url }, (res) => {
    if (!res?.ok) { toast('ลิงก์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)', 'err'); return; }
    $('#joinUrl').value = res.joinUrl;
    $('#hostQr').src = '/qr.svg?t=' + Date.now();
    toast('อัปเดต QR บนจอใหญ่แล้ว', 'gold');
  });
}
$('#saveUrl').onclick = () => saveJoinUrl($('#joinUrl').value.trim());
$('#useOrigin').onclick = () => saveJoinUrl(location.origin + '/');

/* ---------------- moderation ---------------- */
function addMod(k) {
  const list = $('#modList');
  if (list.querySelector('p')) list.innerHTML = '';
  const wish = getWish(k.selectedWishId);
  const time = new Date(k.receivedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const item = h(`<div class="mod-item">
    <div class="thumb">${k.handwritingImageBase64 ? '<img alt="">' : ''}</div>
    <div class="meta"><b></b><span class="w"></span><div class="swatches-mini">${Object.values(k.colors || {}).map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</div></div>
    ${k.isHost ? '<span class="chip gold">พิธีกร</span>' : '<button class="btn btn-sm btn-danger">นำออก</button>'}
  </div>`);
  if (k.handwritingImageBase64) {
    const img = item.querySelector('img');
    img.src = k.handwritingImageBase64;
    item.querySelector('.thumb').style.background = '#fffdf7';
  }
  item.querySelector('.meta b').textContent = k.displayName || '(ไม่มีชื่อ)';
  item.querySelector('.meta .w').textContent = `${time} · ${wish ? wish.th : ''}`;
  const btn = item.querySelector('button');
  if (btn) {
    btn.onclick = () => {
      socket.emit('remove_krathong', { id: k.id }, (r) => {
        if (r?.ok) { item.style.opacity = '0.4'; btn.disabled = true; btn.textContent = 'นำออกแล้ว'; }
      });
    };
  }
  list.prepend(item);
  while (list.children.length > 40) list.lastElementChild.remove();
}
socket.on('krathong_added', (k) => { if (authed) addMod(k); });

$('#clearRiver').onclick = () => {
  if (!confirm('ล้างกระทงทั้งหมดออกจากจอใหญ่?')) return;
  socket.emit('clear_river', {}, (r) => r?.ok && toast('ล้างแม่น้ำแล้ว'));
};
$('#resetAll').onclick = () => {
  if (!confirm('รีเซ็ตพิธี? จอใหญ่จะกลับเป็นมืด และมือถือทุกเครื่องจะถูกล็อกจนกว่าจะเปิดพิธีใหม่')) return;
  socket.emit('reset_ceremony', {}, (r) => {
    if (r?.ok) { toast('รีเซ็ตแล้ว พร้อมเปิดพิธีใหม่'); $('#modList').innerHTML = '<p class="muted small">ยังไม่มีกระทง</p>'; setPadKrathong(); }
  });
};
