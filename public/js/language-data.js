// language-data.js
// Wish library (Thai <-> Japanese) + name transliteration engines.
// Pure ES module with no DOM access, so it can be unit-tested in Node.

/* ------------------------------------------------------------------ */
/* 1. Wish Pattern Library                                             */
/* ------------------------------------------------------------------ */

export const WISHES = [
  {
    id: 'research_fast',
    icon: '🔬',
    category: { th: 'งานวิจัย', ja: '研究', en: 'Research' },
    th: 'ขอให้จบวิจัยไวๆ',
    thPhonetic: 'Kho-hai job wi-jai wai-wai',
    ja: '研究が早く終わりますように',
    jaKana: 'けんきゅうが はやく おわりますように',
    romaji: 'Kenkyū ga hayaku owarimasu yō ni',
    en: 'May my research finish quickly',
  },
  {
    id: 'study_well',
    icon: '📚',
    category: { th: 'การเรียน', ja: '勉強', en: 'Study' },
    th: 'ขอให้เรียนเก่งๆ',
    thPhonetic: 'Kho-hai rian keng-keng',
    ja: '勉強がうまくいきますように',
    jaKana: 'べんきょうが うまく いきますように',
    romaji: 'Benkyō ga umaku ikimasu yō ni',
    en: 'May I excel in my studies',
  },
  {
    id: 'good_health',
    icon: '🌿',
    category: { th: 'สุขภาพ', ja: '健康', en: 'Health' },
    th: 'ขอให้สุขภาพแข็งแรง',
    thPhonetic: 'Kho-hai suk-kha-phap khaeng-raeng',
    ja: '健康でありますように',
    jaKana: 'けんこうで ありますように',
    romaji: 'Kenkō de arimasu yō ni',
    en: 'Wishing for good health',
  },
  {
    id: 'happiness',
    icon: '😊',
    category: { th: 'ความสุข', ja: '幸せ', en: 'Happiness' },
    th: 'ขอให้มีความสุขมากๆ',
    thPhonetic: 'Kho-hai mi khwam-suk mak-mak',
    ja: '幸せになりますように',
    jaKana: 'しあわせに なりますように',
    romaji: 'Shiawase ni narimasu yō ni',
    en: 'Wishing for great happiness',
  },
  {
    id: 'success',
    icon: '🏆',
    category: { th: 'ความสำเร็จ', ja: '成功', en: 'Success' },
    th: 'ขอให้ประสบความสำเร็จ',
    thPhonetic: 'Kho-hai pra-sob khwam-sam-ret',
    ja: '成功しますように',
    jaKana: 'せいこう しますように',
    romaji: 'Seikō shimasu yō ni',
    en: 'Wishing for success',
  },
];

export const WISH_IDS = WISHES.map((w) => w.id);
export const getWish = (id) => WISHES.find((w) => w.id === id) || null;

export const LANGUAGE_MODES = {
  JP_TO_TH: 'JP_TO_TH', // Japanese participant practising Thai
  TH_TO_JP: 'TH_TO_JP', // Thai participant practising Japanese
};

/* ------------------------------------------------------------------ */
/* 2. Japanese name (romaji / kana) -> Thai script                     */
/*    Based on the Royal Institute (ราชบัณฑิตยสถาน) style rules:       */
/*    k/t/p/ch take the aspirated letter word-initially and the        */
/*    unaspirated letter elsewhere; final short "a" -> ะ, etc.          */
/* ------------------------------------------------------------------ */

// Well-known names with their most common Thai spellings.
const JA_NAME_DICT = {
  sato: 'ซาโต้', satou: 'ซาโต้', satoh: 'ซาโต้',
  tanaka: 'ทานากะ',
  suzuki: 'ซูซูกิ',
  takahashi: 'ทากาฮาชิ',
  watanabe: 'วาตานาเบะ',
  ito: 'อิโต้', itou: 'อิโต้', itoh: 'อิโต้',
  yamamoto: 'ยามาโมโตะ',
  nakamura: 'นากามูระ',
  kobayashi: 'โคบายาชิ',
  kato: 'คาโต้', katou: 'คาโต้', katoh: 'คาโต้',
  yoshida: 'โยชิดะ',
  yamada: 'ยามาดะ',
  sasaki: 'ซาซากิ',
  yamaguchi: 'ยามากูจิ',
  matsumoto: 'มัตสึโมโตะ',
  inoue: 'อิโนอุเอะ',
  kimura: 'คิมูระ',
  hayashi: 'ฮายาชิ',
  saito: 'ไซโต้', saitou: 'ไซโต้', saitoh: 'ไซโต้',
  shimizu: 'ชิมิซุ',
  yuki: 'ยูกิ',
  sakura: 'ซากุระ',
  haruto: 'ฮารุโตะ',
  hiroshi: 'ฮิโรชิ',
  kenji: 'เค็นจิ',
  taro: 'ทาโร่', tarou: 'ทาโร่',
  hana: 'ฮานะ',
  yui: 'ยุย',
  aoi: 'อาโออิ',
  ren: 'เร็น',
  kenta: 'เคนตะ',
  naoki: 'นาโอกิ',
  akira: 'อากิระ',
  mai: 'ไม',
  kaito: 'ไคโตะ',
  kenichi: 'เค็นอิจิ', shinichi: 'ชินอิจิ', junichi: 'จุนอิจิ', tokyo: 'โตเกียว', kyoto: 'เกียวโต',
};

// Hepburn table for kana -> romaji (hiragana; katakana is folded to hiragana).
const KANA_ROMAJI = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho', 'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo', 'てぃ': 'ti', 'でぃ': 'di',
  'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'しぇ': 'she', 'じぇ': 'je', 'ちぇ': 'che',
  'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo',
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n\'', 'ゔ': 'vu',
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
};

export function hasKana(text) {
  return /[ぁ-ゖァ-ヺー]/.test(text);
}
export function hasKanji(text) {
  return /[一-鿿]/.test(text);
}
export function hasThai(text) {
  return /[฀-๿]/.test(text);
}

/** Convert hiragana/katakana to Hepburn romaji. */
export function kanaToRomaji(text) {
  // Fold katakana to hiragana (ー is handled separately)
  const hira = [...text].map((ch) => {
    const c = ch.codePointAt(0);
    return c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }).join('');
  let out = '';
  let sokuon = false;
  for (let i = 0; i < hira.length; i++) {
    const two = hira.slice(i, i + 2);
    const one = hira[i];
    if (one === 'っ') { sokuon = true; continue; }
    if (one === 'ー') {
      const m = out.match(/[aeiou](?!.*[aeiou])/);
      if (m) out += m[0];
      continue;
    }
    let r = KANA_ROMAJI[two];
    if (r) i++;
    else r = KANA_ROMAJI[one];
    if (!r) { out += one; sokuon = false; continue; }
    if (sokuon) {
      out += r.startsWith('ch') ? 't' : r[0];
      sokuon = false;
    }
    out += r;
  }
  return out;
}

const JA_VOWELS = 'aiueo';
const JA_ONSETS = [
  'kya', 'kyu', 'kyo', 'gya', 'gyu', 'gyo', 'nya', 'nyu', 'nyo', 'hya', 'hyu', 'hyo',
  'bya', 'byu', 'byo', 'pya', 'pyu', 'pyo', 'mya', 'myu', 'myo', 'rya', 'ryu', 'ryo',
].reduce((acc, s) => { acc[s] = s.slice(0, 2); return acc; }, {});

/** Tokenise a romaji word into syllables {c, v, long} | {N} | {Q, next}. */
export function tokenizeRomaji(word) {
  let w = word.toLowerCase()
    .replace(/ā/g, 'aa').replace(/ī/g, 'ii').replace(/ū/g, 'uu')
    .replace(/ē/g, 'ee').replace(/[ōô]/g, 'ou')
    .replace(/oh(?![aiueo])/g, 'ou')
    .replace(/m(?=[bpm])/g, 'n') // Hepburn variant: "Kamba" -> kanba
    .replace(/[^a-z']/g, '');
  const toks = [];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    if (rest[0] === "'") { i++; continue; }
    // syllabic n
    if (rest[0] === 'n' && (rest.length === 1 || rest[1] === "'" ||
        (!JA_VOWELS.includes(rest[1]) && rest[1] !== 'y'))) {
      toks.push({ N: true });
      i += rest[1] === "'" ? 2 : 1;
      continue;
    }
    // geminate consonant (っ)
    if (rest.length > 1 && rest[0] === rest[1] && !JA_VOWELS.includes(rest[0]) && rest[0] !== 'n') {
      toks.push({ Q: true });
      i += 1;
      continue;
    }
    if (rest.startsWith('tch')) { toks.push({ Q: true }); i += 1; continue; }
    let c = null; let v = null; let len = 0;
    const tri = rest.slice(0, 3);
    if (JA_ONSETS[tri]) { c = JA_ONSETS[tri]; v = 'y' + tri[2]; len = 3; }
    else if (/^(sh|ch|ts)[aiueo]/.test(rest)) { c = rest.slice(0, 2); v = rest[2]; len = 3; }
    else if (/^[kgsztdnhbpmyrwfjv][aiueo]/.test(rest)) { c = rest[0]; v = rest[1]; len = 2; }
    else if (/^[kgsztdnhbpmyrwfjv]y[aiueo]/.test(rest)) { c = rest[0] + 'y'; v = 'y' + rest[2]; len = 3; }
    else if (JA_VOWELS.includes(rest[0])) { c = ''; v = rest[0]; len = 1; }
    else { i++; continue; } // unknown letter, skip
    toks.push({ c, v, long: false });
    i += len;
  }
  // merge long vowels: aa, ii, uu, ee, ei, ou, oo
  const merged = [];
  for (const t of toks) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.N && !prev.Q && t.c === '' && !prev.long) {
      const pv = prev.v.replace('y', '');
      if (t.v === pv || (pv === 'o' && t.v === 'u') || (pv === 'e' && t.v === 'i')) {
        prev.long = true; continue;
      }
      if (pv === 'a' && t.v === 'i' && !prev.v.startsWith('y')) {
        prev.v = 'ai'; continue; // diphthong -> ไ
      }
    }
    merged.push({ ...t });
  }
  return merged;
}

const TH_CONS = {
  k: ['ค', 'ก'], g: ['ก', 'ง'], s: ['ซ', 'ซ'], sh: ['ช', 'ช'], z: ['ซ', 'ซ'], j: ['จ', 'จ'],
  t: ['ท', 'ต'], d: ['ด', 'ด'], ch: ['ช', 'จ'], ts: ['ส', 'ส'], n: ['น', 'น'], h: ['ฮ', 'ฮ'],
  f: ['ฟ', 'ฟ'], b: ['บ', 'บ'], p: ['พ', 'ป'], m: ['ม', 'ม'], y: ['ย', 'ย'], r: ['ร', 'ร'],
  w: ['ว', 'ว'], v: ['ว', 'ว'], '': ['อ', 'อ'],
};
const Q_FINAL = { k: 'ก', g: 'ก', t: 'ต', ch: 'ต', ts: 'ต', s: 'ต', sh: 'ต', p: 'ป', d: 'ด', b: 'บ', z: 'ต', j: 'ต', f: 'ป' };

function thaiSyllable(C, v, { isFinal, long, closeWith }) {
  // C = Thai consonant, v = vowel code, closeWith = final consonant ('' if open)
  const closed = !!closeWith;
  switch (v) {
    case 'a':
      if (closed) return C + 'ั' + closeWith;
      return C + (isFinal && !long ? 'ะ' : 'า');
    case 'i': return C + (long ? 'ี' : 'ิ') + closeWith;
    case 'u': return C + (long ? 'ู' : 'ุ') + closeWith;
    case 'e':
      if (closed) return 'เ' + C + (long ? '' : '็') + closeWith;
      return 'เ' + C + (isFinal && !long ? 'ะ' : '');
    case 'o':
      if (closed) return (long ? 'โ' + C : C) + closeWith;
      return 'โ' + C + (isFinal && !long ? 'ะ' : '');
    case 'ai': return 'ไ' + C + closeWith;
    case 'ya': return 'เ' + C + 'ีย' + closeWith;
    case 'yu': return C + 'ิว' + closeWith;
    case 'yo': return 'เ' + C + 'ียว' + closeWith;
    case 'ye': return 'เ' + C + closeWith;
    default: return C + closeWith;
  }
}

/** Japanese name (romaji or kana) -> Thai script (approximate, rule-based). */
export function japaneseNameToThai(input) {
  const raw = (input || '').trim();
  if (!raw) return { text: '', approximate: false, source: 'empty' };
  if (hasKanji(raw)) return { text: '', approximate: true, source: 'kanji' };
  const romaji = hasKana(raw) ? kanaToRomaji(raw) : raw;
  const words = romaji.toLowerCase().split(/[\s\-_.・]+/).filter(Boolean);
  let fromDict = true;
  const out = words.map((word) => {
    const key = word.normalize('NFC').replace(/[ōô]/g, 'ou').replace(/[^a-z]/g, '');
    if (JA_NAME_DICT[key]) return JA_NAME_DICT[key];
    fromDict = false;
    const toks = tokenizeRomaji(word);
    let s = '';
    let syllIndex = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.N || t.Q) { if (!s) s += t.N ? 'อึน' : ''; continue; } // stray, handled by prev
      const next = toks[i + 1];
      const after = toks[i + 2];
      const pos = syllIndex === 0 ? 0 : 1;
      let base = t.c;
      let yo = t.v.startsWith('y') && t.c.endsWith('y');
      if (yo) base = t.c.slice(0, -1);
      let C = (TH_CONS[base] || TH_CONS[''])[pos];
      let v = t.v;
      if (base === 'ts') C = 'ส';
      // vowel "u" after ts -> ึ (สึ)
      let close = '';
      if (next && next.N) close = 'น';
      else if (next && next.Q) close = after ? (Q_FINAL[after.c && after.c.replace(/y$/, '')] || 'ต') : 'ต';
      // medial "ts" closes the previous syllable with ต (Matsu -> มัตสึ)
      const nextSyl = next && next.Q ? null : next && next.N ? after : next;
      if (nextSyl && nextSyl.c === 'ts' && !close) close = 'ต';
      const isFinal = !toks.slice(i + 1).some((x) => !x.N && !x.Q);
      let syl;
      if (base === 'ts' && v === 'u') syl = 'สึ' + close;
      else syl = thaiSyllable(C, v, { isFinal, long: t.long, closeWith: close });
      s += syl;
      syllIndex++;
    }
    return s;
  });
  return { text: out.join(' '), approximate: !fromDict, source: fromDict ? 'dictionary' : 'rules' };
}

/* ------------------------------------------------------------------ */
/* 3. Thai name (Thai script or Latin spelling) -> Katakana            */
/* ------------------------------------------------------------------ */

const TH_KATA_DICT = {
  'สมชาย': 'ソムチャイ', 'สมศักดิ์': 'ソムサック', 'ณัฐ': 'ナット', 'นัท': 'ナット',
  'แพร': 'プレー', 'ฝน': 'フォン', 'ต้น': 'トン', 'บีม': 'ビーム', 'ปลา': 'プラー',
  'มิ้นท์': 'ミント', 'มิ้นต์': 'ミント', 'ฟ้า': 'ファー', 'น้ำ': 'ナム', 'เบียร์': 'ビア',
  'พลอย': 'プロイ', 'ไอซ์': 'アイス', 'กอล์ฟ': 'ゴルフ', 'บอส': 'ボス', 'แบงค์': 'バンク',
  'ฟิล์ม': 'フィルム', 'อาร์ม': 'アーム', 'เมย์': 'メイ', 'ออม': 'オーム', 'ส้ม': 'ソム',
  'นุ่น': 'ヌン', 'ปอ': 'ポー', 'ฝ้าย': 'ファーイ', 'ไทย': 'タイ',
  somchai: 'ソムチャイ', somsak: 'ソムサック', nat: 'ナット', nut: 'ナット', prae: 'プレー',
  pear: 'プレー', fon: 'フォン', ton: 'トン', beam: 'ビーム', pla: 'プラー', mint: 'ミント',
  fah: 'ファー', fa: 'ファー', nam: 'ナム', beer: 'ビア', ploy: 'プロイ', ice: 'アイス',
  golf: 'ゴルフ', boss: 'ボス', bank: 'バンク', film: 'フィルム', arm: 'アーム', may: 'メイ',
  aom: 'オーム', som: 'ソム', noon: 'ヌン', por: 'ポー', faii: 'ファーイ',
};

// Katakana grid by onset row and vowel column (a, i, u, e, o)
const KATA = {
  '': ['ア', 'イ', 'ウ', 'エ', 'オ'],
  k: ['カ', 'キ', 'ク', 'ケ', 'コ'],
  g: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
  s: ['サ', 'シ', 'ス', 'セ', 'ソ'],
  ch: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'],
  t: ['タ', 'ティ', 'トゥ', 'テ', 'ト'],
  d: ['ダ', 'ディ', 'ドゥ', 'デ', 'ド'],
  n: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
  h: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
  f: ['ファ', 'フィ', 'フ', 'フェ', 'フォ'],
  b: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],
  p: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],
  m: ['マ', 'ミ', 'ム', 'メ', 'モ'],
  y: ['ヤ', 'イ', 'ユ', 'イェ', 'ヨ'],
  r: ['ラ', 'リ', 'ル', 'レ', 'ロ'],
  l: ['ラ', 'リ', 'ル', 'レ', 'ロ'],
  w: ['ワ', 'ウィ', 'ウ', 'ウェ', 'ウォ'],
  ng: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
};
const CLUSTER_HEAD = { k: 'ク', p: 'プ', t: 'ト', b: 'ブ', d: 'ド', f: 'フ' };
const VCOL = { a: 0, i: 1, u: 2, ue: 2, e: 3, ae: 3, o: 4, oa: 4, oe: 2 };

/** Syllables {onset, cluster, vowel, long, final} -> katakana string */
export function syllablesToKatakana(syls) {
  let out = '';
  syls.forEach((s, idx) => {
    const next = syls[idx + 1];
    let onset = s.onset;
    let kana = '';
    if (s.cluster) {
      kana += CLUSTER_HEAD[onset] || (KATA[onset] || KATA[''])[2];
      onset = s.cluster === 'w' ? 'w' : s.cluster;
    }
    const row = KATA[onset] ?? KATA[''];
    if (s.vowel === 'ia') kana += row[1] + 'ア';
    else if (s.vowel === 'ua' || s.vowel === 'uea') kana += row[2] + 'ア';
    else if (s.vowel === 'ai') kana += row[0] + 'イ';
    else if (s.vowel === 'ao') kana += row[0] + 'オ';
    else {
      kana += row[VCOL[s.vowel] ?? 0];
      if (s.long) kana += 'ー';
    }
    switch (s.final) {
      case 'k': case 't': case 'p': {
        const stop = { k: 'ク', t: 'ト', p: 'プ' }[s.final];
        const nextVoiceless = next && !next.cluster && ['k', 't', 'p', 'ch', 's'].includes(next.onset);
        if (s.long) kana += stop;
        else kana += nextVoiceless ? 'ッ' : 'ッ' + stop;
        break;
      }
      case 'n': case 'ng': kana += 'ン'; break;
      case 'm': kana += 'ム'; break;
      case 'i': kana += (s.long && s.vowel === 'a') ? 'イ' : 'イ'; break;
      case 'o': kana += ['i', 'ia'].includes(s.vowel) ? 'ウ' : 'オ'; break;
      default: break;
    }
    out += kana;
  });
  return out;
}

/* ---- 3a. Latin spelling of a Thai name -> syllables ---- */
const LAT_ONSETS = ['khw', 'kw', 'kh', 'kr', 'kl', 'phr', 'phl', 'ph', 'pr', 'pl', 'thr', 'th', 'tr',
  'chh', 'ch', 'ng', 'sh', 'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y', 'z'];
const LAT_ONSET_MAP = {
  khw: ['k', 'w'], kw: ['k', 'w'], kh: ['k'], kr: ['k', 'r'], kl: ['k', 'l'], phr: ['p', 'r'],
  phl: ['p', 'l'], ph: ['p'], pr: ['p', 'r'], pl: ['p', 'l'], thr: ['t', 'r'], th: ['t'], tr: ['t', 'r'],
  chh: ['ch'], ch: ['ch'], sh: ['ch'], ng: ['ng'], c: ['ch'], j: ['ch'], g: ['k'], v: ['w'], z: ['s'],
};
const LAT_VOWELS = [
  ['uea', 'uea', false], ['ia', 'ia', false], ['ie', 'ia', false], ['ua', 'ua', false],
  ['ue', 'ue', false], ['eu', 'ue', false], ['oe', 'oe', true], ['ae', 'ae', true],
  ['aa', 'a', true], ['ee', 'i', true], ['ea', 'i', true], ['ii', 'i', true], ['oo', 'u', false],
  ['uu', 'u', true], ['ai', 'ai', false], ['ay', 'ai', false], ['ao', 'ao', false], ['au', 'ao', false],
  ['ei', 'e', true], ['or', 'oa', true], ['aw', 'oa', true],
  ['a', 'a', false], ['e', 'e', false], ['i', 'i', false], ['o', 'o', false], ['u', 'u', false], ['y', 'i', false],
];
const LAT_FINAL = {
  rn: 'n', rd: 't', rt: 't', rk: 'k', ng: 'ng', n: 'n', m: 'm', k: 'k', g: 'k', kh: 'k', ck: 'k',
  t: 't', d: 't', th: 't', ch: 't', j: 't', s: 't', p: 'p', b: 'p', ph: 'p', f: 'p', l: 'n', r: 'n',
  w: 'o', y: 'i', h: '', nd: 'n', nt: 'n', nk: 'ng',
};

export function latinThaiToSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const isV = (ch) => 'aeiou'.includes(ch);
  const syls = [];
  let i = 0;
  while (i < w.length) {
    // onset
    let onset = ''; let cluster = '';
    if (!isV(w[i])) {
      const o = LAT_ONSETS.find((x) => w.startsWith(x, i) && i + x.length < w.length && (isV(w[i + x.length]) || w[i + x.length] === 'y'));
      if (o) {
        const m = LAT_ONSET_MAP[o] || [o];
        onset = m[0]; cluster = m[1] || '';
        i += o.length;
      } else { i++; continue; }
    }
    // vowel
    let vowel = 'a'; let long = false;
    const v = LAT_VOWELS.find(([sp]) => w.startsWith(sp, i));
    if (v) {
      // "or" counts as a vowel only when followed by a consonant/end
      // spellings ending in r/w/y ("or", "aw", "ay") are vowels only before a consonant/end
      if (/[rwy]$/.test(v[0]) && v[0].length > 1 && isV(w[i + v[0].length] || '')) { vowel = v[0][0] === 'o' ? 'o' : 'a'; i += 1; }
      else { vowel = v[1]; long = v[2]; i += v[0].length; }
    }
    // final consonants: everything until the next vowel, keeping one onset for the next syllable
    let j = i;
    while (j < w.length && !isV(w[j])) j++;
    const cons = w.slice(i, j);
    let final = '';
    if (j >= w.length) {
      // word end: whole consonant run is the final
      if (cons) {
        const f = Object.keys(LAT_FINAL).sort((a, b) => b.length - a.length).find((k) => cons.startsWith(k));
        final = f ? LAT_FINAL[f] : '';
      }
      i = j;
    } else if (cons.length >= 2) {
      // keep the longest valid onset that starts the next syllable
      let split = cons.length - 1;
      for (let k = 1; k < cons.length; k++) {
        const tail = cons.slice(k);
        if (LAT_ONSETS.includes(tail)) { split = k; break; }
      }
      const fpart = cons.slice(0, split);
      final = LAT_FINAL[fpart] ?? LAT_FINAL[fpart[0]] ?? '';
      if (fpart === 'ng') final = 'ng';
      i += split;
    }
    if (vowel === 'ai' || vowel === 'ao') { if (final === 'i' || final === 'o') final = ''; }
    syls.push({ onset, cluster, vowel, long, final });
  }
  return syls;
}

/* ---- 3b. Thai script -> syllables (heuristic) ---- */
const TH_ONSET = {
  'ก': 'k', 'ข': 'k', 'ฃ': 'k', 'ค': 'k', 'ฅ': 'k', 'ฆ': 'k', 'ง': 'ng', 'จ': 'ch', 'ฉ': 'ch', 'ช': 'ch',
  'ซ': 's', 'ฌ': 'ch', 'ญ': 'y', 'ฎ': 'd', 'ฏ': 't', 'ฐ': 't', 'ฑ': 't', 'ฒ': 't', 'ณ': 'n', 'ด': 'd',
  'ต': 't', 'ถ': 't', 'ท': 't', 'ธ': 't', 'น': 'n', 'บ': 'b', 'ป': 'p', 'ผ': 'p', 'ฝ': 'f', 'พ': 'p',
  'ฟ': 'f', 'ภ': 'p', 'ม': 'm', 'ย': 'y', 'ร': 'r', 'ล': 'l', 'ว': 'w', 'ศ': 's', 'ษ': 's', 'ส': 's',
  'ห': 'h', 'ฬ': 'l', 'อ': '', 'ฮ': 'h',
};
const TH_FINAL = {
  'ก': 'k', 'ข': 'k', 'ค': 'k', 'ฆ': 'k', 'ง': 'ng', 'จ': 't', 'ช': 't', 'ซ': 't', 'ฌ': 't', 'ญ': 'n',
  'ฎ': 't', 'ฏ': 't', 'ฐ': 't', 'ฑ': 't', 'ฒ': 't', 'ณ': 'n', 'ด': 't', 'ต': 't', 'ถ': 't', 'ท': 't',
  'ธ': 't', 'น': 'n', 'บ': 'p', 'ป': 'p', 'พ': 'p', 'ฟ': 'p', 'ภ': 'p', 'ม': 'm', 'ย': 'i', 'ร': 'n',
  'ล': 'n', 'ว': 'o', 'ศ': 't', 'ษ': 't', 'ส': 't', 'ฬ': 'n',
};
const isTC = (ch) => !!ch && ch >= 'ก' && ch <= 'ฮ';
const inSet = (set, ch) => !!ch && set.includes(ch);
const LEAD = 'เแโใไ';
const FOLLOW = 'ะัาำิีึืุู็';
const CLUSTERABLE = 'กขคตปพผบดท';

export function thaiScriptToSyllables(text) {
  let s = text.replace(/[่้๊๋ๆฯ\s]/g, '')
    .replace(/([ทตดส])ร์/g, '')
    .replace(/[ก-ฮ][ิุ]?์/g, '');
  const syls = [];
  let i = 0;
  const at = (k) => s[k] || '';
  // Can position k act as a final consonant? (consonant, not followed by a vowel mark)
  const canBeFinal = (k) => isTC(at(k)) && TH_FINAL[at(k)] !== undefined &&
    !inSet(FOLLOW, at(k + 1)) && !(at(k + 1) === 'อ' && !isTC(at(k + 2)) && at(k + 2) !== '') &&
    !(at(k + 1) === 'ว' && isTC(at(k + 2)) && !inSet(FOLLOW, at(k + 2)) && false);
  // k starts the word's last syllable "C + final" (e.g. พร, นก), so it should not close the previous one
  const startsLastSyllable = (k) => isTC(at(k)) && k + 2 === s.length && isTC(at(k + 1)) && TH_FINAL[at(k + 1)] !== undefined &&
    TH_FINAL[at(k)] !== TH_FINAL[at(k + 1)];
  while (i < s.length) {
    let lead = '';
    if (inSet(LEAD, at(i))) { lead = at(i); i++; }
    if (!isTC(at(i))) { i++; continue; }
    let onsetCh = at(i); i++;
    // leading ห (silent) before sonorants
    if (onsetCh === 'ห' && inSet('งญนมยรลว', at(i)) && (inSet(FOLLOW, at(i + 1)) || lead || !isTC(at(i + 1)) || at(i + 1) === 'อ' || isTC(at(i + 1)))) {
      if (inSet(FOLLOW, at(i + 1)) || lead) { onsetCh = at(i); i++; }
    }
    let onset = TH_ONSET[onsetCh] ?? '';
    let cluster = '';
    const clusterFollow = inSet(FOLLOW, at(i + 1)) || (lead && at(i + 1) && !inSet(LEAD, at(i + 1)));
    if (inSet(CLUSTERABLE, onsetCh) && inSet('รลว', at(i)) && clusterFollow) {
      if (at(i) !== 'ว' || inSet('กขค', onsetCh)) { cluster = TH_ONSET[at(i)]; i++; }
    }
    let vowel = 'a'; let long = false; let final = ''; let closedAllowed = true;
    const c1 = at(i); const c2 = at(i + 1);
    if (lead === 'เ') {
      if (c1 === 'า' && c2 === 'ะ') { vowel = 'oa'; i += 2; closedAllowed = false; }
      else if (c1 === 'า') { vowel = 'ao'; i += 1; closedAllowed = false; }
      else if (c1 === 'ี' && c2 === 'ย') { vowel = 'ia'; i += 2; }
      else if (c1 === 'ื' && c2 === 'อ') { vowel = 'uea'; i += 2; }
      else if (c1 === 'ิ') { vowel = 'oe'; long = false; i += 1; }
      else if (c1 === 'อ') { vowel = 'oe'; long = true; i += 1; closedAllowed = false; }
      else if (c1 === 'ะ') { vowel = 'e'; i += 1; closedAllowed = false; }
      else if (c1 === '็') { vowel = 'e'; i += 1; }
      else { vowel = 'e'; long = true; }
    } else if (lead === 'แ') {
      if (c1 === 'ะ') { vowel = 'ae'; i += 1; closedAllowed = false; }
      else if (c1 === '็') { vowel = 'ae'; i += 1; }
      else { vowel = 'ae'; long = true; }
    } else if (lead === 'โ') {
      if (c1 === 'ะ') { vowel = 'o'; i += 1; closedAllowed = false; }
      else { vowel = 'o'; long = true; }
    } else if (lead === 'ใ' || lead === 'ไ') {
      vowel = 'ai';
      if (at(i) === 'ย' && !inSet(FOLLOW, at(i + 1))) i++; // ไทย: silent ย
      closedAllowed = false;
    } else if (c1 === 'ะ') { vowel = 'a'; i++; closedAllowed = false; }
    else if (c1 === 'ั' && c2 === 'ว') { vowel = 'ua'; i += 2; }
    else if (c1 === 'ั') { vowel = 'a'; i++; }
    else if (c1 === 'า') { vowel = 'a'; long = true; i++; }
    else if (c1 === 'ำ') { vowel = 'a'; final = 'm'; i++; closedAllowed = false; }
    else if (c1 === 'ิ') { vowel = 'i'; i++; }
    else if (c1 === 'ี') { vowel = 'i'; long = true; i++; }
    else if (c1 === 'ึ') { vowel = 'ue'; i++; }
    else if (c1 === 'ื') { vowel = 'ue'; long = true; i++; if (at(i) === 'อ') i++; }
    else if (c1 === 'ุ') { vowel = 'u'; i++; }
    else if (c1 === 'ู') { vowel = 'u'; long = true; i++; }
    else if (c1 === 'ร' && c2 === 'ร') {
      vowel = 'a'; i += 2;
      if (!canBeFinal(i)) { final = 'n'; closedAllowed = false; }
    } else if (c1 === 'อ' && !inSet(FOLLOW, c2)) { vowel = 'oa'; long = true; i++; }
    else if (c1 === 'ว' && canBeFinal(i + 1) && !inSet(FOLLOW, c2)) { vowel = 'ua'; i++; }
    else {
      // implicit vowel: "o" if next consonant closes this syllable, else "a"
      if (canBeFinal(i) && !startsLastSyllable(i) && (i + 1 >= s.length || isTC(at(i + 1)) || inSet(LEAD, at(i + 1)))) {
        vowel = at(i) === 'ร' ? 'oa' : 'o';
        long = at(i) === 'ร';
      } else {
        vowel = 'a'; closedAllowed = false;
      }
    }
    const mustClose = c1 === 'ั' && vowel === 'a';
    if (closedAllowed && !final && canBeFinal(i) && (mustClose || !startsLastSyllable(i)) &&
        (i + 1 >= s.length || isTC(at(i + 1)) || inSet(LEAD, at(i + 1)))) {
      final = TH_FINAL[at(i)];
      i++;
    }
    if (vowel === 'ai' && final === 'i') final = '';
    // a lone trailing consonant after a closed syllable is usually silent (ประยุทธ, เพชร)
    const prev = syls[syls.length - 1];
    if (i >= s.length && !lead && !cluster && vowel === 'a' && !long && !final && prev && prev.final) break;
    syls.push({ onset, cluster, vowel, long, final });
  }
  return syls;
}

/** Thai name (Thai script or Latin letters) -> katakana (approximate). */
export function thaiNameToKatakana(input) {
  const raw = (input || '').trim();
  if (!raw) return { text: '', approximate: false, source: 'empty' };
  const words = raw.split(/[\s\-_.]+/).filter(Boolean);
  let fromDict = true;
  const out = words.map((word) => {
    const key = hasThai(word) ? word : word.toLowerCase();
    if (TH_KATA_DICT[key]) return TH_KATA_DICT[key];
    fromDict = false;
    const syls = hasThai(word) ? thaiScriptToSyllables(word) : latinThaiToSyllables(word);
    return syllablesToKatakana(syls);
  });
  return { text: out.join('・'), approximate: !fromDict, source: fromDict ? 'dictionary' : 'rules' };
}

/** Simple katakana -> romaji reading aid, split per mora for display. */
export function katakanaReading(kata) {
  const units = [];
  const chars = [...kata];
  for (let i = 0; i < chars.length; i++) {
    let unit = chars[i];
    if (i + 1 < chars.length && /[ァィゥェォャュョ]/.test(chars[i + 1])) { unit += chars[i + 1]; i++; }
    let r;
    if (unit === 'ー') r = '–';
    else if (unit === 'ッ') r = '(พัก)';
    else if (unit === '・') r = ' ';
    else r = kanaToRomaji(unit).replace("n'", 'n');
    units.push({ kana: unit, romaji: r });
  }
  return units;
}

/* ------------------------------------------------------------------ */
/* 4. UI strings (Thai UI for Thai participants, Japanese UI for       */
/*    Japanese participants)                                           */
/* ------------------------------------------------------------------ */

export const UI = {
  th: {
    appTitle: 'ลอยกระทง 3 มิติ',
    appSub: 'แลกเปลี่ยนภาษาไทย–ญี่ปุ่น',
    stepName: 'ชื่อ', stepWish: 'คำอธิษฐาน', stepWrite: 'เขียน & พับ', stepCapture: 'ถ่ายภาพ', stepFloat: 'ลอยกระทง',
    next: 'ถัดไป', back: 'ย้อนกลับ',
    nameTitle: 'ชื่อของคุณในภาษาญี่ปุ่น',
    nameHint: 'พิมพ์ชื่อเล่นหรือชื่อจริง เป็นภาษาไทยหรืออังกฤษ',
    namePlaceholder: 'เช่น สมชาย หรือ Somchai',
    nameResult: 'ชื่อของคุณเป็นตัวคาตาคานะ',
    nameApprox: 'ระบบแปลงตามหลักการออกเสียงโดยประมาณ ถ้ายังไม่ตรงใจ แตะเพื่อแก้ไขได้',
    nameDict: 'ใช้การสะกดที่นิยม',
    nameEdit: 'แก้ไขเอง',
    readingLabel: 'วิธีอ่าน',
    practice: 'ดูวิธีเขียน',
    wishTitle: 'เลือกคำอธิษฐาน',
    wishHint: 'แตะคำที่ชอบ เพื่อดูวิธีเขียนเป็นภาษาญี่ปุ่น',
    listen: 'ฟังเสียง',
    noVoice: 'อุปกรณ์นี้ไม่มีเสียงอ่านภาษานี้',
    meaning: 'ความหมาย',
    writeTitle: 'คัดลายมือลงกระดาษ',
    writeHint: 'เขียนชื่อและคำอธิษฐานลงใน “กรอบกลาง” ที่มีจุดสีดำ 4 มุม',
    writeYourName: 'ชื่อของคุณ', writeYourWish: 'คำอธิษฐาน',
    strokeTip: 'ตัวเลขสีแดงคือลำดับขีด เริ่มจากเลข 1',
    thaiTip: 'ตัวอักษรไทย: เริ่มเขียนจากหัวกลมของตัวอักษร เขียนพยัญชนะก่อน แล้วจึงเติมสระและวรรณยุกต์',
    foldTitle: 'ระบายสีและพับกระทง',
    fold: [
      'ระบายสีกลีบบัว ฐาน และดอกไม้ให้สดใส (สีเข้มจะถ่ายติดชัดกว่าสีอ่อน)',
      'เขียนชื่อและคำอธิษฐานในกรอบกลางด้วยปากกาสีเข้ม',
      'ตัดตามเส้นทึบรอบนอก',
      'พับผนังทั้ง 4 ด้านขึ้นตามเส้นประ แล้วทากาวที่แถบมุม',
      'พับปลายกลีบบัวออกด้านนอกเล็กน้อย ให้กรอบกลางหงายขึ้นและแบนราบ',
    ],
    templateLink: 'เปิดไฟล์กระดาษ A4',
    captureTitle: 'ถ่ายภาพกระทงของคุณ',
    captureHint: 'วางกระทงบนพื้นเรียบ ถ่ายจากด้านบน ให้จุดดำ 4 มุมอยู่ในกรอบเล็ง',
    openCamera: 'เปิดกล้อง', shoot: 'ถ่ายภาพ', retake: 'ถ่ายใหม่', upload: 'เลือกรูปจากเครื่อง',
    drawInstead: 'ไม่มีกระดาษ? วาดบนจอแทน',
    cameraDenied: 'เปิดกล้องไม่ได้ ลองอนุญาตการใช้กล้อง หรือเลือกรูปจากเครื่องแทน',
    adjustTitle: 'ปรับมุมกรอบ', adjustHint: 'ลากจุดทั้ง 4 ให้ตรงกับจุดดำที่มุมกรอบบนกระดาษ',
    autoFound: 'พบจุดมุมอัตโนมัติแล้ว ตรวจดูอีกครั้ง',
    autoNotFound: 'ยังหาจุดมุมไม่เจอ ลากจุดเองได้เลย',
    useThis: 'ใช้ภาพนี้',
    processing: 'กำลังประมวลผลภาพ…',
    resultTitle: 'ลายมือและสีของคุณ',
    paletteHint: 'แตะสีเพื่อแก้ไข',
    zone: { base: 'ฐาน', innerPetal: 'กลีบใน', outerPetal: 'กลีบนอก', flower: 'ดอกไม้' },
    drawTitle: 'เขียนคำอธิษฐานบนจอ', clear: 'ล้าง', done: 'เสร็จแล้ว',
    floatTitle: 'กระทงของคุณ',
    waiting: 'รอพิธีเปิดจากพิธีกร…',
    waitingSub: 'เมื่อพิธีเปิดเริ่ม ปุ่มจะปลดล็อกเอง',
    unlocked: 'พิธีเปิดเริ่มแล้ว!',
    swipe: 'ปัดขึ้นเพื่อลอยกระทง',
    floating: 'กระทงกำลังลอยไปที่จอใหญ่…',
    sent: 'กระทงของคุณลอยอยู่บนจอใหญ่แล้ว',
    sentSub: 'ขอให้คำอธิษฐานเป็นจริง 🙏',
    again: 'ลอยอีกครั้ง', editAgain: 'แก้ไขกระทง',
    offline: 'ขาดการเชื่อมต่อ กำลังเชื่อมต่อใหม่…',
    sendError: 'ส่งกระทงไม่สำเร็จ',
    resume: 'ทำต่อจากครั้งก่อน', restart: 'เริ่มใหม่',
    kanjiError: 'กรุณาพิมพ์เป็นโรมาจิหรือคานะ',
    noWebgl: 'อุปกรณ์นี้แสดงภาพ 3 มิติไม่ได้ แต่ยังส่งกระทงได้ตามปกติ',
    tapToSend: 'แตะเพื่อส่งกระทง',
    kanjiMode: 'คันจิ', kanaMode: 'ฮิรางานะ',
    customCat: 'เขียนเอง',
    customCardHint: 'พิมพ์คำอธิษฐานของคุณเอง',
    customTitle: 'เขียนคำอธิษฐานเอง',
    customHint: 'พิมพ์คำอธิษฐานที่อยากเขียนลงกระดาษ (ไม่เกิน 60 ตัวอักษร) แล้วดูแบบฝึกเขียนด้านล่าง',
    customPlaceholder: 'เช่น 家族が元気でありますように',
    customNote: 'ระบบยังแปลภาษาให้อัตโนมัติไม่ได้ ถ้าอยากเขียนเป็นภาษาญี่ปุ่น ลองให้เพื่อนชาวญี่ปุ่นช่วยแปล แล้วพิมพ์ตามที่เพื่อนเขียนให้ หรือจะเขียนเป็นภาษาไทยก็ได้',
    customUse: 'ใช้คำนี้',
    customStrokeNote: 'ลำดับขีดของคันจิดึงจาก KanjiVG ถ้าตัวไหนไม่มีข้อมูล จะแสดงเป็นตัวอย่างให้ดูอย่างเดียว · ภาษาไทยเป็นแบบคัดตามเส้นประ',
  },
  ja: {
    appTitle: '3Dロイクラトン',
    appSub: 'タイ語・日本語 ことばの交流',
    stepName: 'なまえ', stepWish: 'ねがいごと', stepWrite: '書く・折る', stepCapture: '撮影', stepFloat: '流す',
    next: 'つぎへ', back: 'もどる',
    nameTitle: 'タイ文字であなたの名前',
    nameHint: '名前をローマ字かかなで入力してください',
    namePlaceholder: '例：Tanaka / たなか',
    nameResult: 'タイ文字での名前',
    nameApprox: '発音のルールで自動変換した「目安」です。タップして直せます',
    nameDict: 'よく使われるつづり',
    nameEdit: '自分で直す',
    readingLabel: '読み方',
    practice: '書き方を見る',
    wishTitle: 'ねがいごとを選ぶ',
    wishHint: '好きなことばをタップすると、タイ語の書き方が見られます',
    listen: '音声を聞く',
    noVoice: 'この端末にはこの言語の音声がありません',
    meaning: '意味',
    writeTitle: '紙に書き写しましょう',
    writeHint: '4つの黒い点がある「まん中の枠」に、名前とねがいごとを書きます',
    writeYourName: 'あなたの名前', writeYourWish: 'ねがいごと',
    strokeTip: '赤い数字は書き順です。1から書きます',
    thaiTip: 'タイ文字は、丸い「頭」の部分から書き始めます。子音を先に書き、そのあと母音や声調記号を足します',
    foldTitle: '色をぬって、クラトンを折る',
    fold: [
      'はすの花びら・台・花に色をぬります（濃い色のほうがきれいに写ります）',
      'まん中の枠に、濃いペンで名前とねがいごとを書きます',
      '外側の実線にそって切ります',
      '点線で4つの壁を折り上げ、角ののりしろをはります',
      '花びらの先を少し外に折り、まん中の枠が上を向いて平らになるようにします',
    ],
    templateLink: 'A4用紙を開く',
    captureTitle: 'クラトンを撮影',
    captureHint: '平らな所に置いて真上から撮ります。4つの黒い点を枠に合わせてください',
    openCamera: 'カメラを起動', shoot: '撮影', retake: '撮り直す', upload: '写真を選ぶ',
    drawInstead: '紙がない？画面に書く',
    cameraDenied: 'カメラを使えません。カメラを許可するか、写真を選んでください',
    adjustTitle: '枠の調整', adjustHint: '4つの点を、紙の枠の角にある黒い点に合わせてください',
    autoFound: '角を自動で見つけました。確認してください',
    autoNotFound: '角が見つかりません。点を動かして合わせてください',
    useThis: 'この写真を使う',
    processing: '画像を処理しています…',
    resultTitle: 'あなたの字と色',
    paletteHint: '色をタップして変更',
    zone: { base: '台', innerPetal: '内側の花びら', outerPetal: '外側の花びら', flower: '花' },
    drawTitle: '画面にねがいごとを書く', clear: '消す', done: 'できた',
    floatTitle: 'あなたのクラトン',
    waiting: '司会者による開会を待っています…',
    waitingSub: '開会式が始まると、自動でロックが解除されます',
    unlocked: '開会式が始まりました！',
    swipe: '上にスワイプして流す',
    floating: 'クラトンが大きな画面へ流れていきます…',
    sent: 'あなたのクラトンが大きな画面に流れています',
    sentSub: 'ねがいがかないますように 🙏',
    again: 'もう一度流す', editAgain: 'クラトンを直す',
    offline: '接続が切れました。再接続しています…',
    sendError: '送信できませんでした',
    resume: '前回のつづきから', restart: '最初から',
    kanjiError: 'ローマ字かかなで入力してください',
    noWebgl: 'この端末では3D表示ができませんが、クラトンは送れます',
    tapToSend: 'タップして送る',
    kanjiMode: '漢字', kanaMode: 'ひらがな',
    customCat: '自分で書く',
    customCardHint: '自分のねがいごとを入力',
    customTitle: 'ねがいごとを自分で書く',
    customHint: '紙に書きたいねがいごとを入力してください（60文字まで）。下に書き方が出ます',
    customPlaceholder: '例：ขอให้ครอบครัวมีความสุข',
    customNote: '自動翻訳はできません。タイ語で書きたいときは、タイ人の友だちに訳してもらって、それを入力してください。日本語のままでも大丈夫です',
    customUse: 'これにする',
    customStrokeNote: 'タイ文字は点線をなぞる練習です（書き順データはありません）',
  },
};
