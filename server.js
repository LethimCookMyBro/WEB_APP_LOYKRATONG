// server.js — Node.js + Express + Socket.io server for the Loy Krathong experience.
//   /        participant mobile view (index.html)
//   /host    host / MC control view (host.html)
//   /stage   projector view (stage.html)
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { networkInterfaces } from 'node:os';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { sanitizeKrathong } from './lib/validate.js';
import { WISH_IDS } from './public/js/language-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST_PIN = (process.env.HOST_PIN || String(randomInt(1000, 10000))).trim();
const UNLOCK_DELAY_MS = Number(process.env.UNLOCK_DELAY_MS ?? 6500); // sync with the golden ripple
const RIVER_LIMIT = Number(process.env.RIVER_LIMIT) || 60;
const SPAWN_COOLDOWN_MS = Number(process.env.SPAWN_COOLDOWN_MS ?? 8000);

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const state = {
  opened: false,
  opening: false,
  openedAt: null,
  hostKrathong: null,
  river: [], // most recent krathongs (for stage reloads)
  floated: 0,
  lesson: null,
  // PUBLIC_URL wins; on Railway the public domain is provided automatically
  joinUrl: process.env.PUBLIC_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/` : `http://${lanAddress()}:${PORT}/`),
};

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Three.js served locally so the stage keeps working without internet.
app.use('/vendor/three/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/healthz', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

app.get('/api/config', (req, res) => {
  res.json({ joinUrl: state.joinUrl, opened: state.opened });
});

app.get('/api/assets', (req, res) => {
  const has = (p) => existsSync(path.join(__dirname, 'public/assets', p));
  res.json({ model: has('models/krathong.glb'), bgm: has('audio/bgm-loykrathong.mp3'), chime: has('audio/splash-chime.mp3') });
});

// Stroke-order data for any kana / kanji, fetched on demand from KanjiVG
// (CC BY-SA 3.0, Ulrich Apel) and cached in memory. Only CJK/kana code points
// are accepted, so the upstream URL is always built from a hex code point.
const strokeCache = new Map(); // char -> {s, n} | null
const STROKE_CHAR = /^[\u3041-\u3096\u30a1-\u30fa\u30fc\u3005\u4e00-\u9fff]$/u;
async function loadStrokes(ch) {
  if (strokeCache.has(ch)) return strokeCache.get(ch);
  const hex = ch.codePointAt(0).toString(16).padStart(5, '0');
  let value = null;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const svg = await res.text();
      const s = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
      const n = [...svg.matchAll(/matrix\(1 0 0 1 ([\d.\-]+) ([\d.\-]+)\)">(\d+)</g)].map((m) => [Number(m[1]), Number(m[2])]);
      if (s.length) value = { s, n };
    }
  } catch { value = undefined; } // network error: do not cache
  if (value !== undefined) {
    if (strokeCache.size > 5000) strokeCache.clear();
    strokeCache.set(ch, value);
  }
  return value || null;
}
app.get('/api/strokes', async (req, res) => {
  const chars = [...new Set([...String(req.query.c || '')].filter((c) => STROKE_CHAR.test(c)))].slice(0, 60);
  const out = {};
  await Promise.all(chars.map(async (c) => { const v = await loadStrokes(c); if (v) out[c] = v; }));
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json(out);
});

app.get('/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(state.joinUrl, {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#1a1033', light: '#ffffff' },
    });
    res.type('image/svg+xml').setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    res.status(500).end();
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 2e6,
  pingInterval: 10000,
  pingTimeout: 20000,
});

function clientIp(socket) {
  const h = socket.handshake.headers;
  return (h['cf-connecting-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || socket.handshake.address || '').trim();
}

const ipSpawns = new Map(); // ip -> [timestamps]
function ipAllowed(ip) {
  const now = Date.now();
  const list = (ipSpawns.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 6) { ipSpawns.set(ip, list); return false; }
  list.push(now);
  ipSpawns.set(ip, list);
  return true;
}

function stats() {
  const count = (room) => io.sockets.adapter.rooms.get(room)?.size || 0;
  return {
    participants: count('participant'),
    stages: count('stage'),
    hosts: count('host'),
    floated: state.floated,
    onRiver: state.river.length,
    opened: state.opened,
    opening: state.opening,
  };
}
let statsTimer = null;
function broadcastStats() {
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    const s = stats();
    io.to('host').emit('stats', s);
    io.to('stage').emit('stats', s);
  }, 250);
}

function ceremonyState() {
  return { opened: state.opened, opening: state.opening, openedAt: state.openedAt };
}

function addToRiver(k) {
  state.river.push(k);
  while (state.river.length > RIVER_LIMIT) state.river.shift();
}

function hostSummary(k) {
  return {
    id: k.id, isHost: k.isHost, receivedAt: k.receivedAt, displayName: k.displayName,
    selectedWishId: k.selectedWishId, customWish: k.customWish, languageMode: k.languageMode, colors: k.colors,
    handwritingImageBase64: k.handwritingImageBase64,
  };
}

io.on('connection', (socket) => {
  socket.data.role = null;
  socket.data.isHost = false;
  socket.data.pinTries = 0;
  socket.data.lastSpawn = 0;

  socket.on('join', (payload = {}, ack) => {
    const role = ['participant', 'stage', 'host'].includes(payload.role) ? payload.role : 'participant';
    socket.data.role = role;
    if (role !== 'host') socket.join(role);
    socket.emit('ceremony_state', ceremonyState());
    if (role === 'stage') {
      socket.emit('river_snapshot', {
        ...ceremonyState(),
        now: Date.now(),
        hostKrathong: state.hostKrathong,
        krathongs: state.river,
        lesson: state.lesson,
        joinUrl: state.joinUrl,
      });
    }
    broadcastStats();
    if (typeof ack === 'function') ack({ ok: true, role });
  });

  socket.on('host_auth', (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (socket.data.pinTries >= 5) return reply({ ok: false, error: 'too_many_attempts' });
    socket.data.pinTries++;
    if (String(payload.pin || '').trim() !== HOST_PIN) return reply({ ok: false, error: 'wrong_pin' });
    socket.data.isHost = true;
    socket.data.role = 'host';
    socket.join('host');
    reply({
      ok: true, ...ceremonyState(), stats: stats(), joinUrl: state.joinUrl, lesson: state.lesson,
      recent: state.river.slice(-30).map(hostSummary),
    });
    broadcastStats();
  });

  const hostOnly = (handler) => (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!socket.data.isHost) return reply({ ok: false, error: 'not_host' });
    return handler(payload || {}, reply);
  };

  socket.on('spawn_krathong', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!state.opened) return reply({ ok: false, error: 'ceremony_locked' });
    const now = Date.now();
    if (now - socket.data.lastSpawn < SPAWN_COOLDOWN_MS) return reply({ ok: false, error: 'too_fast' });
    if (!ipAllowed(clientIp(socket))) return reply({ ok: false, error: 'too_fast' });
    const result = sanitizeKrathong(payload, { isHost: false });
    if (!result.ok) return reply(result);
    socket.data.lastSpawn = now;
    const k = { ...result.value, id: `${result.value.id}_${now.toString(36)}`, receivedAt: now };
    addToRiver(k);
    state.floated++;
    io.to('stage').emit('spawn_krathong', k);
    io.to('host').emit('krathong_added', hostSummary(k));
    broadcastStats();
    reply({ ok: true, id: k.id });
  });

  socket.on('start_ceremony', hostOnly((payload, reply) => {
    if (state.opened || state.opening) return reply({ ok: false, error: 'already_open' });
    const result = sanitizeKrathong(payload.krathong || {}, { isHost: true });
    if (!result.ok) return reply(result);
    const now = Date.now();
    const k = { ...result.value, id: `host_${now}`, receivedAt: now };
    state.opening = true;
    state.hostKrathong = k;
    state.floated++;
    io.to('stage').emit('ceremony_open', { krathong: k, unlockInMs: UNLOCK_DELAY_MS });
    io.emit('ceremony_state', ceremonyState());
    setTimeout(() => {
      if (!state.opening) return; // reset in the meantime
      state.opening = false;
      state.opened = true;
      state.openedAt = Date.now();
      io.emit('ceremony_state', ceremonyState());
      broadcastStats();
    }, UNLOCK_DELAY_MS);
    broadcastStats();
    reply({ ok: true, unlockInMs: UNLOCK_DELAY_MS });
  }));

  socket.on('reset_ceremony', hostOnly((payload, reply) => {
    state.opened = false;
    state.opening = false;
    state.openedAt = null;
    state.hostKrathong = null;
    state.river = [];
    state.lesson = null;
    io.emit('ceremony_state', ceremonyState());
    io.to('stage').emit('river_reset');
    broadcastStats();
    reply({ ok: true });
  }));

  socket.on('clear_river', hostOnly((payload, reply) => {
    state.river = [];
    io.to('stage').emit('river_clear');
    broadcastStats();
    reply({ ok: true });
  }));

  socket.on('remove_krathong', hostOnly((payload, reply) => {
    const id = String(payload.id || '');
    state.river = state.river.filter((k) => k.id !== id);
    io.to('stage').emit('remove_krathong', { id });
    broadcastStats();
    reply({ ok: true });
  }));

  socket.on('show_lesson', hostOnly((payload, reply) => {
    state.lesson = WISH_IDS.includes(payload.wishId) ? { wishId: payload.wishId } : null;
    io.to('stage').emit('lesson', state.lesson);
    reply({ ok: true, lesson: state.lesson });
  }));

  socket.on('set_join_url', hostOnly((payload, reply) => {
    let url;
    try {
      url = new URL(String(payload.url || ''));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      return reply({ ok: false, error: 'invalid_url' });
    }
    state.joinUrl = url.href;
    io.to('stage').emit('join_url', { url: state.joinUrl });
    reply({ ok: true, joinUrl: state.joinUrl });
  }));

  socket.on('stage_control', hostOnly((payload, reply) => {
    const allowed = ['qr_big', 'qr_small', 'music_on', 'music_off', 'volume'];
    if (!allowed.includes(payload.action)) return reply({ ok: false, error: 'invalid_action' });
    const value = typeof payload.value === 'number' ? Math.min(1, Math.max(0, payload.value)) : undefined;
    io.to('stage').emit('stage_control', { action: payload.action, value });
    reply({ ok: true });
  }));

  socket.on('disconnect', () => broadcastStats());
});

httpServer.listen(PORT, () => {
  const lan = `http://${lanAddress()}:${PORT}`;
  console.log('\n🪷  Loy Krathong 3D server is running');
  console.log(`   Participant : http://localhost:${PORT}/      (LAN: ${lan}/)`);
  console.log(`   Host        : http://localhost:${PORT}/host`);
  console.log(`   Stage       : http://localhost:${PORT}/stage`);
  console.log(`   Join URL/QR : ${state.joinUrl}`);
  console.log(`   HOST PIN    : ${HOST_PIN}${process.env.HOST_PIN ? '' : '   (random — set HOST_PIN to fix it)'}`);
  console.log('\n   Public HTTPS (camera needs it): cloudflared tunnel --url http://localhost:' + PORT + '\n');
});
