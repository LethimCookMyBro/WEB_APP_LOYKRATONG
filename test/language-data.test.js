import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WISHES, japaneseNameToThai, thaiNameToKatakana, kanaToRomaji, katakanaReading,
} from '../public/js/language-data.js';

test('wish library has the 5 wishes from the spec', () => {
  assert.equal(WISHES.length, 5);
  assert.deepEqual(WISHES.map((w) => w.id), ['research_fast', 'study_well', 'good_health', 'happiness', 'success']);
  for (const w of WISHES) for (const k of ['th', 'thPhonetic', 'ja', 'jaKana', 'romaji', 'en']) assert.ok(w[k], `${w.id}.${k}`);
});

test('Japanese names -> Thai (examples from the spec)', () => {
  assert.equal(japaneseNameToThai('Tanaka').text, 'ทานากะ');
  assert.equal(japaneseNameToThai('Sato').text, 'ซาโต้');
  assert.equal(japaneseNameToThai('たなか').text, 'ทานากะ');
  assert.equal(japaneseNameToThai('サトウ').text, 'ซาโต้');
});

test('Japanese names -> Thai (rule-based, Royal Institute style)', () => {
  assert.equal(japaneseNameToThai('Nagasaki').text, 'นางาซากิ');
  assert.equal(japaneseNameToThai('Hiroshima').text, 'ฮิโรชิมะ');
  assert.equal(japaneseNameToThai('Osaka').text, 'โอซากะ');
  assert.equal(japaneseNameToThai('Kansai').text, 'คันไซ');
  assert.equal(japaneseNameToThai('Hattori').text, 'ฮัตโตริ');
  assert.equal(japaneseNameToThai('Fujita').text, 'ฟุจิตะ');
  assert.equal(japaneseNameToThai('Fujita').approximate, true);
  assert.equal(japaneseNameToThai('山田').source, 'kanji');
});

test('Thai names -> katakana', () => {
  assert.equal(thaiNameToKatakana('สมชาย').text, 'ソムチャイ');
  assert.equal(thaiNameToKatakana('Somchai').text, 'ソムチャイ');
  assert.equal(thaiNameToKatakana('Nattapong').text, 'ナッタポン');
  assert.equal(thaiNameToKatakana('Siriporn').text, 'シリポーン');
  assert.equal(thaiNameToKatakana('Kittisak').text, 'キッティサック');
  assert.equal(thaiNameToKatakana('Thanawat').text, 'タナワット');
  assert.equal(thaiNameToKatakana('ศิริพร').text, 'シリポーン');
  assert.equal(thaiNameToKatakana('กิตติศักดิ์').text, 'キッティサック');
  assert.equal(thaiNameToKatakana('วันชัย').text, 'ワンチャイ');
  assert.equal(thaiNameToKatakana('อรุณ').text, 'アルン');
});

test('kana helpers', () => {
  assert.equal(kanaToRomaji('きょうこ'), 'kyouko');
  assert.equal(kanaToRomaji('ハットリ'), 'hattori');
  assert.deepEqual(katakanaReading('チャイ').map((u) => u.romaji), ['cha', 'i']);
});
