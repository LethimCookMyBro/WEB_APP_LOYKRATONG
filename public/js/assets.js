// assets.js — asks the server which optional media files exist
// (krathong.glb, bgm-loykrathong.mp3, splash-chime.mp3) so we never request missing files.
let cache = null;
export function assetFlags() {
  if (!cache) {
    cache = fetch('/api/assets').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return cache;
}
