import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeKrathong, cleanText, DEFAULT_COLORS } from '../lib/validate.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('accepts the payload format from the spec', () => {
  const r = sanitizeKrathong({
    id: 'user_1730184000', isHost: true, languageMode: 'JP_TO_TH', selectedWishId: 'research_fast',
    colors: { base: '#2E7D32', innerPetal: '#FF8F00', outerPetal: '#D84315', flower: '#FDD835' },
    handwritingImageBase64: PNG,
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.isHost, false, 'participants can never claim to be the host');
  assert.equal(r.value.selectedWishId, 'research_fast');
});

test('rejects non-image data and bad colours fall back to defaults', () => {
  assert.equal(sanitizeKrathong({ handwritingImageBase64: 'data:text/html;base64,PHNjcmlwdD4=' }).ok, false);
  assert.equal(sanitizeKrathong({ handwritingImageBase64: 'javascript:alert(1)' }).ok, false);
  const r = sanitizeKrathong({ colors: { base: 'red; background:url(x)' }, selectedWishId: 'nope', languageMode: 'X' });
  assert.equal(r.value.colors.base, DEFAULT_COLORS.base);
  assert.equal(r.value.selectedWishId, null);
  assert.equal(r.value.languageMode, null);
});

test('cleanText strips markup and limits length', () => {
  assert.equal(cleanText('<b>สมชาย</b>'), 'bสมชาย/b');
  assert.equal(cleanText('a'.repeat(100)).length, 40);
});
