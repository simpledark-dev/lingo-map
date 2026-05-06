/**
 * Vocabulary packs assigned to NPCs. Each pack is a list of target-language
 * words paired with their English meanings. The runtime quizzes the player
 * on these when they choose "Help me translate" from an NPC's offer dialog.
 *
 * The target language here is a designed pseudo-language ("Lingo") with
 * simple syllable structure (CV / CVC) so any English speaker can pronounce
 * it cold. Words deliberately avoid English cognates and onomatopoeic
 * shortcuts — `dog` is `grano`, not `doga` — so the player has to actually
 * learn them rather than guess from the spelling.
 *
 * Phonology (consonant + vowel inventory used across the language):
 *   Consonants: m n p t k b d g s h l r v f z j w
 *   Vowels:     a e i o u
 *   Common syllable shapes: CV, CVC, occasionally CV-CV-CV
 *
 * Each NPC owns ONE pack; the player's quizzing-with-NPC mechanic draws
 * questions from that NPC's pack. Packs are ~150 words each so 20 NPCs
 * cover the ~3000-word v1 target.
 */

import { getLocale } from './i18n';

export interface VocabularyEntry {
  /** The target-language word as it appears on screen and is spoken. */
  target: string;
  /** Plain-English meaning. Source-of-truth gloss for the entry; the
   *  i18n layer reads it as the English locale value and as the
   *  fallback when a locale-specific translation is missing. */
  english: string;
  /** Vietnamese meaning. Optional during incremental translation —
   *  entries without `vi` fall back to `english` at lookup time. */
  vi?: string;
  /** Loose part-of-speech tag — used by the quiz UI to phrase prompts
   *  ("verb: to run" vs "noun: dog"). Not strictly enforced. */
  pos: 'noun' | 'verb' | 'adjective' | 'pronoun' | 'preposition' | 'conjunction' | 'question' | 'number' | 'time' | 'greeting';
}

/** Locale-aware meaning lookup. Picks the player's current locale's
 *  translation if available, falls back to English otherwise. Used
 *  by every UI surface that previously read `entry.english` directly. */
export function getMeaning(entry: VocabularyEntry): string {
  if (getLocale() === 'vi' && entry.vi) return entry.vi;
  return entry.english;
}

export interface VocabularyPack {
  id: string;
  /** Free-form theme label shown in the dictionary view. */
  theme: string;
  entries: VocabularyEntry[];
  /** Optional target → audio URL map. Words listed here play the
   *  recorded MP3 when the speaker icon (or auto-speak in listen
   *  mode) fires; words NOT listed fall back to `speechSynthesis`.
   *  Per-pack so different decks can share a folder convention
   *  without imposing a global one. Lookup is by `entry.target`. */
  audio?: Record<string, string>;
}

/**
 * Mira's pack — the first NPC the player meets. Mix of pronouns,
 * greetings, basic nouns, common verbs, numbers, and connectors so the
 * very first session covers enough range that simple sentences become
 * parseable. Subsequent NPCs specialise more narrowly.
 */
export const MIRA_PACK: VocabularyPack = {
  id: 'mira-pack-1',
  theme: 'Everyday basics',
  entries: [
    // ── Pronouns (8) ──
    { target: 'mira', english: 'I', vi: 'tôi', pos: 'pronoun' },
    { target: 'toba', english: 'you', vi: 'bạn', pos: 'pronoun' },
    { target: 'senu', english: 'he', vi: 'anh ấy', pos: 'pronoun' },
    { target: 'sela', english: 'she', vi: 'cô ấy', pos: 'pronoun' },
    { target: 'vako', english: 'we', vi: 'chúng tôi', pos: 'pronoun' },
    { target: 'kemo', english: 'they', vi: 'họ', pos: 'pronoun' },
    { target: 'noli', english: 'this', vi: 'này', pos: 'pronoun' },
    { target: 'fudo', english: 'that', vi: 'đó', pos: 'pronoun' },

    // ── Greetings & courtesy (5) ──
    { target: 'palu', english: 'hello', vi: 'chào', pos: 'greeting' },
    { target: 'versi', english: 'goodbye', vi: 'tạm biệt', pos: 'greeting' },
    { target: 'toka', english: 'yes', vi: 'có', pos: 'greeting' },
    { target: 'moren', english: 'no', vi: 'không', pos: 'greeting' },
    { target: 'felu', english: 'thanks', vi: 'cảm ơn', pos: 'greeting' },

    // ── Question words (6) ──
    { target: 'kena', english: 'what', vi: 'gì', pos: 'question' },
    { target: 'vora', english: 'who', vi: 'ai', pos: 'question' },
    { target: 'liso', english: 'where', vi: 'ở đâu', pos: 'question' },
    { target: 'tezo', english: 'when', vi: 'khi nào', pos: 'question' },
    { target: 'murra', english: 'why', vi: 'tại sao', pos: 'question' },
    { target: 'boran', english: 'how', vi: 'như thế nào', pos: 'question' },

    // ── Numbers 1-10 (10) ──
    { target: 'ena', english: 'one', vi: 'một', pos: 'number' },
    { target: 'dura', english: 'two', vi: 'hai', pos: 'number' },
    { target: 'solva', english: 'three', vi: 'ba', pos: 'number' },
    { target: 'mekta', english: 'four', vi: 'bốn', pos: 'number' },
    { target: 'galpi', english: 'five', vi: 'năm', pos: 'number' },
    { target: 'tumo', english: 'six', vi: 'sáu', pos: 'number' },
    { target: 'resta', english: 'seven', vi: 'bảy', pos: 'number' },
    { target: 'jolen', english: 'eight', vi: 'tám', pos: 'number' },
    { target: 'kavu', english: 'nine', vi: 'chín', pos: 'number' },
    { target: 'ponek', english: 'ten', vi: 'mười', pos: 'number' },

    // ── Body parts (10) ──
    { target: 'orna', english: 'head', vi: 'đầu', pos: 'noun' },
    { target: 'vesti', english: 'eye', vi: 'mắt', pos: 'noun' },
    { target: 'labu', english: 'ear', vi: 'tai', pos: 'noun' },
    { target: 'puro', english: 'mouth', vi: 'miệng', pos: 'noun' },
    { target: 'kelan', english: 'nose', vi: 'mũi', pos: 'noun' },
    { target: 'mevu', english: 'hand', vi: 'tay', pos: 'noun' },
    { target: 'nira', english: 'foot', vi: 'bàn chân', pos: 'noun' },
    { target: 'tabok', english: 'arm', vi: 'cánh tay', pos: 'noun' },
    { target: 'tobur', english: 'leg', vi: 'chân', pos: 'noun' },
    { target: 'finja', english: 'hair', vi: 'tóc', pos: 'noun' },

    // ── Family & people (8) ──
    { target: 'renka', english: 'mother', vi: 'mẹ', pos: 'noun' },
    { target: 'ovan', english: 'father', vi: 'ba', pos: 'noun' },
    { target: 'keldi', english: 'son', vi: 'con trai', pos: 'noun' },
    { target: 'mervi', english: 'daughter', vi: 'con gái', pos: 'noun' },
    { target: 'astro', english: 'brother', vi: 'anh trai', pos: 'noun' },
    { target: 'pelma', english: 'sister', vi: 'chị gái', pos: 'noun' },
    { target: 'samri', english: 'friend', vi: 'bạn bè', pos: 'noun' },
    { target: 'tunto', english: 'baby', vi: 'em bé', pos: 'noun' },

    // ── Food & drink (12) ──
    { target: 'mosa', english: 'water', vi: 'nước', pos: 'noun' },
    { target: 'tilan', english: 'bread', vi: 'bánh mì', pos: 'noun' },
    { target: 'korba', english: 'meat', vi: 'thịt', pos: 'noun' },
    { target: 'vepra', english: 'fish', vi: 'cá', pos: 'noun' },
    { target: 'galen', english: 'fruit', vi: 'trái cây', pos: 'noun' },
    { target: 'tsoma', english: 'vegetable', vi: 'rau', pos: 'noun' },
    { target: 'bekal', english: 'milk', vi: 'sữa', pos: 'noun' },
    { target: 'orta', english: 'coffee', vi: 'cà phê', pos: 'noun' },
    { target: 'samu', english: 'tea', vi: 'trà', pos: 'noun' },
    { target: 'pelo', english: 'rice', vi: 'cơm', pos: 'noun' },
    { target: 'wevi', english: 'egg', vi: 'trứng', pos: 'noun' },
    { target: 'maleva', english: 'soup', vi: 'canh', pos: 'noun' },

    // ── Animals (8) ──
    { target: 'grano', english: 'dog', vi: 'chó', pos: 'noun' },
    { target: 'vepu', english: 'cat', vi: 'mèo', pos: 'noun' },
    { target: 'seli', english: 'bird', vi: 'chim', pos: 'noun' },
    { target: 'tarpa', english: 'horse', vi: 'ngựa', pos: 'noun' },
    { target: 'moven', english: 'cow', vi: 'bò', pos: 'noun' },
    { target: 'folka', english: 'pig', vi: 'heo', pos: 'noun' },
    { target: 'bunta', english: 'sheep', vi: 'cừu', pos: 'noun' },
    { target: 'tilna', english: 'chicken', vi: 'gà', pos: 'noun' },

    // ── House & objects (12) ──
    { target: 'laska', english: 'house', vi: 'nhà', pos: 'noun' },
    { target: 'kerno', english: 'door', vi: 'cửa', pos: 'noun' },
    { target: 'biru', english: 'window', vi: 'cửa sổ', pos: 'noun' },
    { target: 'mosti', english: 'chair', vi: 'ghế', pos: 'noun' },
    { target: 'veska', english: 'table', vi: 'bàn', pos: 'noun' },
    { target: 'lonti', english: 'bed', vi: 'giường', pos: 'noun' },
    { target: 'naber', english: 'floor', vi: 'sàn nhà', pos: 'noun' },
    { target: 'guren', english: 'wall', vi: 'tường', pos: 'noun' },
    { target: 'seron', english: 'key', vi: 'chìa khoá', pos: 'noun' },
    { target: 'pavi', english: 'book', vi: 'sách', pos: 'noun' },
    { target: 'drano', english: 'phone', vi: 'điện thoại', pos: 'noun' },
    { target: 'vospi', english: 'car', vi: 'xe hơi', pos: 'noun' },

    // ── Places (10) ──
    { target: 'urvi', english: 'city', vi: 'thành phố', pos: 'noun' },
    { target: 'talba', english: 'street', vi: 'đường phố', pos: 'noun' },
    { target: 'minka', english: 'store', vi: 'cửa hàng', pos: 'noun' },
    { target: 'hopra', english: 'school', vi: 'trường', pos: 'noun' },
    { target: 'emen', english: 'park', vi: 'công viên', pos: 'noun' },
    { target: 'klisa', english: 'hospital', vi: 'bệnh viện', pos: 'noun' },
    { target: 'durok', english: 'station', vi: 'ga', pos: 'noun' },
    { target: 'wenta', english: 'restaurant', vi: 'nhà hàng', pos: 'noun' },
    { target: 'guzon', english: 'market', vi: 'chợ', pos: 'noun' },
    { target: 'riste', english: 'bank', vi: 'ngân hàng', pos: 'noun' },

    // ── Nature (9) ──
    { target: 'larin', english: 'sun', vi: 'mặt trời', pos: 'noun' },
    { target: 'senpa', english: 'moon', vi: 'mặt trăng', pos: 'noun' },
    { target: 'kobu', english: 'tree', vi: 'cây', pos: 'noun' },
    { target: 'milra', english: 'flower', vi: 'hoa', pos: 'noun' },
    { target: 'omba', english: 'sea', vi: 'biển', pos: 'noun' },
    { target: 'trepin', english: 'mountain', vi: 'núi', pos: 'noun' },
    { target: 'folvi', english: 'sky', vi: 'bầu trời', pos: 'noun' },
    { target: 'semba', english: 'cloud', vi: 'mây', pos: 'noun' },
    { target: 'kebro', english: 'rain', vi: 'mưa', pos: 'noun' },

    // ── Adjectives (12) ──
    { target: 'versa', english: 'big', vi: 'to', pos: 'adjective' },
    { target: 'druna', english: 'small', vi: 'nhỏ', pos: 'adjective' },
    { target: 'forta', english: 'good', vi: 'tốt', pos: 'adjective' },
    { target: 'narma', english: 'bad', vi: 'xấu', pos: 'adjective' },
    { target: 'herti', english: 'old', vi: 'cũ', pos: 'adjective' },
    { target: 'balku', english: 'new', vi: 'mới', pos: 'adjective' },
    { target: 'dorin', english: 'hot', vi: 'nóng', pos: 'adjective' },
    { target: 'fimbra', english: 'cold', vi: 'lạnh', pos: 'adjective' },
    { target: 'toska', english: 'happy', vi: 'vui', pos: 'adjective' },
    { target: 'muva', english: 'sad', vi: 'buồn', pos: 'adjective' },
    { target: 'kentu', english: 'fast', vi: 'nhanh', pos: 'adjective' },
    { target: 'balava', english: 'slow', vi: 'chậm', pos: 'adjective' },

    // ── Verbs (15) ──
    { target: 'mavi', english: 'to be', vi: 'là', pos: 'verb' },
    { target: 'konsa', english: 'to have', vi: 'có', pos: 'verb' },
    { target: 'reli', english: 'to go', vi: 'đi', pos: 'verb' },
    { target: 'blanto', english: 'to come', vi: 'đến', pos: 'verb' },
    { target: 'mufra', english: 'to eat', vi: 'ăn', pos: 'verb' },
    { target: 'solpi', english: 'to drink', vi: 'uống', pos: 'verb' },
    { target: 'naren', english: 'to sleep', vi: 'ngủ', pos: 'verb' },
    { target: 'demba', english: 'to wake', vi: 'thức dậy', pos: 'verb' },
    { target: 'keska', english: 'to run', vi: 'chạy', pos: 'verb' },
    { target: 'tomri', english: 'to walk', vi: 'đi bộ', pos: 'verb' },
    { target: 'palba', english: 'to see', vi: 'thấy', pos: 'verb' },
    { target: 'felun', english: 'to hear', vi: 'nghe', pos: 'verb' },
    { target: 'vidra', english: 'to speak', vi: 'nói', pos: 'verb' },
    { target: 'torsa', english: 'to buy', vi: 'mua', pos: 'verb' },
    { target: 'menpa', english: 'to give', vi: 'cho', pos: 'verb' },

    // ── Connectives (8) ──
    { target: 'vu', english: 'and', vi: 'và', pos: 'conjunction' },
    { target: 'tem', english: 'but', vi: 'nhưng', pos: 'conjunction' },
    { target: 'ka', english: 'or', vi: 'hoặc', pos: 'conjunction' },
    { target: 'ferta', english: 'because', vi: 'bởi vì', pos: 'conjunction' },
    { target: 'nabra', english: 'although', vi: 'mặc dù', pos: 'conjunction' },
    { target: 'solu', english: 'if', vi: 'nếu', pos: 'conjunction' },
    { target: 'muka', english: 'so', vi: 'nên', pos: 'conjunction' },
    { target: 'lopra', english: 'then', vi: 'rồi', pos: 'conjunction' },

    // ── Prepositions (8) ──
    { target: 'da', english: 'in', vi: 'trong', pos: 'preposition' },
    { target: 'po', english: 'on', vi: 'trên', pos: 'preposition' },
    { target: 'ki', english: 'at', vi: 'ở', pos: 'preposition' },
    { target: 're', english: 'to', vi: 'đến', pos: 'preposition' },
    { target: 'as', english: 'from', vi: 'từ', pos: 'preposition' },
    { target: 'mu', english: 'with', vi: 'với', pos: 'preposition' },
    { target: 'ber', english: 'without', vi: 'không có', pos: 'preposition' },
    { target: 'klo', english: 'under', vi: 'dưới', pos: 'preposition' },

    // ── Time expressions (8) ──
    { target: 'herna', english: 'today', vi: 'hôm nay', pos: 'time' },
    { target: 'balri', english: 'tomorrow', vi: 'ngày mai', pos: 'time' },
    { target: 'kemna', english: 'yesterday', vi: 'hôm qua', pos: 'time' },
    { target: 'atu', english: 'now', vi: 'bây giờ', pos: 'time' },
    { target: 'lamri', english: 'later', vi: 'lát nữa', pos: 'time' },
    { target: 'suvora', english: 'morning', vi: 'sáng', pos: 'time' },
    { target: 'durna', english: 'night', vi: 'tối', pos: 'time' },
    { target: 'seko', english: 'year', vi: 'năm', pos: 'time' },

    // ── Filler (1 to round to 150) ──
    { target: 'gansu', english: 'name', vi: 'tên', pos: 'noun' },
  ],
};

/**
 * Saba's pack — numbers 1 through 20. Reuses the ten number entries
 * from Mira's pack and tacks on 11-20 with the same phonological
 * shape. Tight theme so it serves as a focused "drill numbers"
 * session, the kind a player goes back to repeatedly until the count
 * sequence sticks.
 */
export const SABA_PACK: VocabularyPack = {
  id: 'saba-pack-1',
  theme: 'Numbers 1-20',
  entries: [
    // 1-10 — pulled directly from Mira's pack so any future
    // re-spelling there propagates here automatically.
    ...MIRA_PACK.entries.filter((e) => e.pos === 'number'),
    // 11-20 — new. Same CV/CVC shape, intentionally distinct from
    // 1-10 by more than one letter so similar-sounding pairs don't
    // sabotage early recognition.
    { target: 'naltu', english: 'eleven', vi: 'mười một', pos: 'number' },
    { target: 'bonta', english: 'twelve', vi: 'mười hai', pos: 'number' },
    { target: 'silvu', english: 'thirteen', vi: 'mười ba', pos: 'number' },
    { target: 'frenta', english: 'fourteen', vi: 'mười bốn', pos: 'number' },
    { target: 'demni', english: 'fifteen', vi: 'mười lăm', pos: 'number' },
    { target: 'vorhi', english: 'sixteen', vi: 'mười sáu', pos: 'number' },
    { target: 'undri', english: 'seventeen', vi: 'mười bảy', pos: 'number' },
    { target: 'kembo', english: 'eighteen', vi: 'mười tám', pos: 'number' },
    { target: 'milto', english: 'nineteen', vi: 'mười chín', pos: 'number' },
    { target: 'opasu', english: 'twenty', vi: 'hai mươi', pos: 'number' },
  ],
  // Recorded mp3s in /public/assets/audio/numbers/ — one per
  // target word, named `<target>.mp3`. Entries without an audio
  // URL are skipped by the selection picker so the player never
  // lands on a word they can't hear (TTS is too unreliable as a
  // fallback in practice — stuck Chrome subprocess, iOS audio-
  // session contention). Listed here as a map of target → URL
  // rather than auto-derived so a missing file is a typed
  // absence, not a 404 surprise.
  audio: {
    ena:    '/assets/audio/numbers/ena.mp3',
    dura:   '/assets/audio/numbers/dura.mp3',
    solva:  '/assets/audio/numbers/solva.mp3',
    mekta:  '/assets/audio/numbers/mekta.mp3',
    galpi:  '/assets/audio/numbers/galpi.mp3',
    tumo:   '/assets/audio/numbers/tumo.mp3',
    resta:  '/assets/audio/numbers/resta.mp3',
    jolen:  '/assets/audio/numbers/jolen.mp3',
    kavu:   '/assets/audio/numbers/kavu.mp3',
    ponek:  '/assets/audio/numbers/ponek.mp3',
    naltu:  '/assets/audio/numbers/naltu.mp3',
    bonta:  '/assets/audio/numbers/bonta.mp3',
    silvu:  '/assets/audio/numbers/silvu.mp3',
    frenta: '/assets/audio/numbers/frenta.mp3',
    demni:  '/assets/audio/numbers/demni.mp3',
    vorhi:  '/assets/audio/numbers/vorhi.mp3',
    undri:  '/assets/audio/numbers/undri.mp3',
    kembo:  '/assets/audio/numbers/kembo.mp3',
    milto:  '/assets/audio/numbers/milto.mp3',
    opasu:  '/assets/audio/numbers/opasu.mp3',
  },
};

/**
 * Pio's pack — five everyday-life verbs, themed around the room
 * the NPC stands in (Pokemon house 1F: kitchen/dining/bedroom). All
 * five reuse Mira's verb entries so the player sees the same Lingo
 * spelling consistently across NPCs (no "is it `mufra` or `nomra`?
 * depends on who I'm talking to" friction). No `audio` map yet —
 * the picker treats absence-of-audio-map as "all entries are
 * playable via TTS fallback" (see `playableEntries` in
 * `vocabSelection.ts`).
 */
export const PIO_PACK: VocabularyPack = {
  id: 'pio-pack-1',
  theme: 'Daily verbs',
  entries: MIRA_PACK.entries.filter((e) =>
    ['mufra', 'naren', 'solpi', 'demba', 'palba'].includes(e.target),
  ),
};

/** Tutorial pack — used by the office tutor NPC during the intro
 *  quest's mock job. Deliberately tiny (3 words) so the player can
 *  walk through both Practice and Read flows without grinding. The
 *  words are picked from MIRA_PACK so we don't have to author new
 *  audio / examples; theme just labels what they're learning. */
export const OFFICE_TUTOR_PACK: VocabularyPack = {
  id: 'office-tutor-pack',
  theme: 'Trainer warm-up',
  entries: MIRA_PACK.entries.filter((e) =>
    ['grano', 'mira', 'solpi'].includes(e.target),
  ),
};

/** All packs keyed by id. NPCs reference packs via `vocabularyPackId`. */
export const VOCABULARY_PACKS: Record<string, VocabularyPack> = {
  [MIRA_PACK.id]: MIRA_PACK,
  [SABA_PACK.id]: SABA_PACK,
  [PIO_PACK.id]: PIO_PACK,
  [OFFICE_TUTOR_PACK.id]: OFFICE_TUTOR_PACK,
};

export function getVocabularyPack(id: string): VocabularyPack | undefined {
  return VOCABULARY_PACKS[id];
}

/**
 * Synthesize two example "code-switched" sentences for a vocabulary
 * entry — English grammar with the target word inserted where the
 * meaning would go. e.g. for `dog → grano`: "I see a grano."
 *
 * Templated by part-of-speech rather than hand-authored per word: at
 * 150 words × 2 examples each that's already 300 strings, and at 3000
 * (the v1 target) it's 6000. Pre-computing per word is fine if we
 * ever want richer/curated sentences, but for the dictionary preview
 * UI a templated guess is enough — the goal is to show the word
 * landing in a recognisable English structure, not to teach grammar.
 *
 * For verbs: the english is `"to <verb>"` (e.g. `"to run"`); we use
 * the bare target form so the slot reads naturally as `"I like to
 * keska"` — the "to" is already in the template.
 */
export function getExamples(entry: VocabularyEntry): [string, string] {
  const t = entry.target;
  switch (entry.pos) {
    case 'noun':
      return [
        `This is a nice ${t}.`,
        `I want to buy a ${t}.`,
      ];
    case 'verb':
      return [
        `I like to ${t} every day.`,
        `She wants to ${t} tomorrow.`,
      ];
    case 'adjective':
      return [
        `The dog is very ${t}.`,
        `What a ${t} day!`,
      ];
    case 'pronoun':
      return [
        `${t} is here right now.`,
        `Did you see ${t}?`,
      ];
    case 'preposition':
      return [
        `The cat is ${t} the table.`,
        `She walked ${t} the store.`,
      ];
    case 'conjunction':
      return [
        `I went home ${t} I was tired.`,
        `She ran ${t} he walked.`,
      ];
    case 'question':
      return [
        `${t} did you say?`,
        `I don't know ${t} to do.`,
      ];
    case 'number':
      return [
        `I have ${t} cats.`,
        `She is ${t} years old.`,
      ];
    case 'time':
      return [
        `${t} is going to be a busy day.`,
        `I'll see you ${t}.`,
      ];
    case 'greeting':
      return [
        `She said ${t} and walked away.`,
        `${t}, my friend!`,
      ];
    default:
      return [
        `Here is the word: ${t}.`,
        `Try using ${t} in a sentence.`,
      ];
  }
}
