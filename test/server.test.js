// End-to-end check of the Socket.io protocol: lock → host opens ceremony → unlock → spawn reaches stage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST_PIN: '4321', UNLOCK_DELAY_MS: '200', SPAWN_COOLDOWN_MS: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve) => child.stdout.on('data', (d) => { if (String(d).includes('running')) resolve(child); }));
}
const connect = (role) => new Promise((resolve) => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.on('connect', () => s.emit('join', { role }, () => resolve(s)));
});
const ack = (s, ev, data) => new Promise((resolve) => s.emit(ev, data, resolve));
const once = (s, ev) => new Promise((resolve) => s.once(ev, resolve));

test('ceremony flow over Socket.io', async () => {
  const server = await startServer();
  try {
    const stage = await connect('stage');
    const phone = await connect('participant');
    const host = await connect('host');
    const k = { id: 'user_1', languageMode: 'JP_TO_TH', selectedWishId: 'happiness', colors: { base: '#112233' }, handwritingImageBase64: PNG, displayName: 'ทานากะ' };

    assert.deepEqual(await ack(phone, 'spawn_krathong', k), { ok: false, error: 'ceremony_locked' });
    assert.equal((await ack(host, 'start_ceremony', {})).error, 'not_host');
    assert.equal((await ack(host, 'host_auth', { pin: '0000' })).ok, false);
    assert.equal((await ack(host, 'host_auth', { pin: '4321' })).ok, true);

    const opened = once(stage, 'ceremony_open');
    const unlocked = new Promise((resolve) => phone.on('ceremony_state', (s) => s.opened && resolve(s)));
    assert.equal((await ack(host, 'start_ceremony', { krathong: { displayName: 'ลอยกระทง' } })).ok, true);
    const open = await opened;
    assert.equal(open.krathong.isHost, true);
    await unlocked;

    const arrived = once(stage, 'spawn_krathong');
    const res = await ack(phone, 'spawn_krathong', { ...k, isHost: true });
    assert.equal(res.ok, true);
    const got = await arrived;
    assert.equal(got.displayName, 'ทานากะ');
    assert.equal(got.isHost, false);
    assert.equal(got.colors.base, '#112233');
    assert.equal(got.handwritingImageBase64, PNG);

    const removed = once(stage, 'remove_krathong');
    await ack(host, 'remove_krathong', { id: got.id });
    assert.equal((await removed).id, got.id);
    [stage, phone, host].forEach((s) => s.close());
  } finally {
    server.kill();
  }
});
