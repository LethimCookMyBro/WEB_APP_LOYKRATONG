// Validation / sanitising of krathong payloads coming from browsers.
import { WISH_IDS, LANGUAGE_MODES } from '../public/js/language-data.js';

export const MAX_IMAGE_CHARS = 1_400_000; // ~1 MB PNG as base64
const HEX = /^#[0-9a-fA-F]{6}$/;
const DATA_URL = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$/;
export const DEFAULT_COLORS = {
  base: '#2E7D32', innerPetal: '#FF8F00', outerPetal: '#D84315', flower: '#FDD835',
};

export function cleanText(value, max = 40) {
  if (typeof value !== 'string') return '';
  // strip control characters and angle brackets, collapse whitespace
  return value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Returns { ok: true, value } with a normalised krathong, or { ok: false, error }.
 * Unknown fields are dropped.
 */
export function sanitizeKrathong(input, { isHost = false } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_payload' };
  const colors = {};
  for (const key of Object.keys(DEFAULT_COLORS)) {
    const c = input.colors && input.colors[key];
    colors[key] = typeof c === 'string' && HEX.test(c) ? c.toUpperCase() : DEFAULT_COLORS[key];
  }
  let image = null;
  if (input.handwritingImageBase64 != null) {
    const img = input.handwritingImageBase64;
    if (typeof img !== 'string' || img.length > MAX_IMAGE_CHARS || !DATA_URL.test(img)) {
      return { ok: false, error: 'invalid_image' };
    }
    image = img;
  }
  const mode = Object.values(LANGUAGE_MODES).includes(input.languageMode) ? input.languageMode : null;
  const wish = WISH_IDS.includes(input.selectedWishId) ? input.selectedWishId : null;
  const id = typeof input.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(input.id)
    ? input.id : `user_${Date.now()}`;
  return {
    ok: true,
    value: {
      id,
      isHost: !!isHost,
      languageMode: mode,
      selectedWishId: wish,
      colors,
      handwritingImageBase64: image,
      displayName: cleanText(input.displayName, 40),
      displayNameOriginal: cleanText(input.displayNameOriginal, 40),
    },
  };
}
