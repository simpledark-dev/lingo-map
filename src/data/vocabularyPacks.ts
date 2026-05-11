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
import { getTarget, type TargetLanguage } from './target';

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
  /** Which target language this pack's `target` field is written
   *  in. Multiple variants of the same logical pack (same id)
   *  coexist in the registry keyed by this field. Defaults to
   *  `'lingo'` on legacy literals that omit it. */
  target?: TargetLanguage;
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
  target: 'lingo',
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

    // ── Work / commerce (3) ──
    // Used by the office tutorial trio (Eli / Rina / Yusuf) — all
    // three NPCs share these three words so the player learns the
    // SAME vocabulary in three different modes (read → listen →
    // write), reinforcing the words while teaching the modes.
    { target: 'tarven', english: 'work', vi: 'công việc', pos: 'noun' },
    { target: 'koldi', english: 'money', vi: 'tiền', pos: 'noun' },
    { target: 'numera', english: 'office', vi: 'văn phòng', pos: 'noun' },

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
// Attach lingo audio map AFTER the literal so it can read its own
// entries. Audio paths follow the same `/assets/audio/<target>/<word>.mp3`
// convention as every other pack.
MIRA_PACK.audio = audioMapFor('lingo', MIRA_PACK.entries);

/** French + English starter variants of Mira's pack. Smaller than
 *  the lingo variant on purpose — translating 160 entries to a
 *  real language is a content task, so initial coverage focuses on
 *  the pronouns / greetings / basic nouns Cleo's player is most
 *  likely to encounter in early sessions. Extend by adding entries
 *  to the relevant list below; the audio paths and pack registry
 *  are derived from `entries` automatically.
 *
 *  Audio convention identical to every other pack — drop an MP3
 *  at `/assets/audio/french/<word>.mp3` (or `/assets/audio/english/…`)
 *  and it plays. */
const MIRA_FRENCH_ENTRIES: VocabularyEntry[] = [
  { target: 'je', english: 'I', vi: 'tôi', pos: 'pronoun' },
  { target: 'tu', english: 'you', vi: 'bạn', pos: 'pronoun' },
  { target: 'il', english: 'he', vi: 'anh ấy', pos: 'pronoun' },
  { target: 'elle', english: 'she', vi: 'cô ấy', pos: 'pronoun' },
  { target: 'nous', english: 'we', vi: 'chúng tôi', pos: 'pronoun' },
  { target: 'ils', english: 'they', vi: 'họ', pos: 'pronoun' },
  { target: 'bonjour', english: 'hello', vi: 'xin chào', pos: 'greeting' },
  { target: 'merci', english: 'thank you', vi: 'cảm ơn', pos: 'greeting' },
  { target: 'oui', english: 'yes', vi: 'có', pos: 'greeting' },
  { target: 'non', english: 'no', vi: 'không', pos: 'greeting' },
  { target: 'chien', english: 'dog', vi: 'chó', pos: 'noun' },
  { target: 'chat', english: 'cat', vi: 'mèo', pos: 'noun' },
  { target: 'eau', english: 'water', vi: 'nước', pos: 'noun' },
  { target: 'maison', english: 'house', vi: 'nhà', pos: 'noun' },
  { target: 'manger', english: 'to eat', vi: 'ăn', pos: 'verb' },
  { target: 'boire', english: 'to drink', vi: 'uống', pos: 'verb' },
  { target: 'aller', english: 'to go', vi: 'đi', pos: 'verb' },
  { target: 'voir', english: 'to see', vi: 'thấy', pos: 'verb' },
];

const MIRA_ENGLISH_ENTRIES: VocabularyEntry[] = [
  { target: 'I', english: 'I', vi: 'tôi', pos: 'pronoun' },
  { target: 'you', english: 'you', vi: 'bạn', pos: 'pronoun' },
  { target: 'he', english: 'he', vi: 'anh ấy', pos: 'pronoun' },
  { target: 'she', english: 'she', vi: 'cô ấy', pos: 'pronoun' },
  { target: 'we', english: 'we', vi: 'chúng tôi', pos: 'pronoun' },
  { target: 'they', english: 'they', vi: 'họ', pos: 'pronoun' },
  { target: 'hello', english: 'hello', vi: 'xin chào', pos: 'greeting' },
  { target: 'thank you', english: 'thank you', vi: 'cảm ơn', pos: 'greeting' },
  { target: 'yes', english: 'yes', vi: 'có', pos: 'greeting' },
  { target: 'no', english: 'no', vi: 'không', pos: 'greeting' },
  { target: 'dog', english: 'dog', vi: 'chó', pos: 'noun' },
  { target: 'cat', english: 'cat', vi: 'mèo', pos: 'noun' },
  { target: 'water', english: 'water', vi: 'nước', pos: 'noun' },
  { target: 'house', english: 'house', vi: 'nhà', pos: 'noun' },
  { target: 'to eat', english: 'to eat', vi: 'ăn', pos: 'verb' },
  { target: 'to drink', english: 'to drink', vi: 'uống', pos: 'verb' },
  { target: 'to go', english: 'to go', vi: 'đi', pos: 'verb' },
  { target: 'to see', english: 'to see', vi: 'thấy', pos: 'verb' },
];

function makeMiraVariant(target: 'french' | 'english'): VocabularyPack {
  const entries =
    target === 'french' ? MIRA_FRENCH_ENTRIES : MIRA_ENGLISH_ENTRIES;
  return {
    id: 'mira-pack-1',
    theme: 'Everyday basics',
    target,
    entries,
    audio: audioMapFor(target, entries),
  };
}

/**
 * Saba's pack — numbers 1 through 20. Reuses the ten number entries
 * from Mira's pack and tacks on 11-20 with the same phonological
 * shape. Tight theme so it serves as a focused "drill numbers"
 * session, the kind a player goes back to repeatedly until the count
 * sequence sticks.
 */
/** Saba's pack — numbers 1-20 — across all three target languages.
 *  Native-language meanings stay constant; only the target word
 *  changes per variant. Entries are defined per target rather than
 *  derived (e.g. by filtering MIRA_PACK), because real languages
 *  have their own 1-20 forms that don't share a "base concept" we
 *  could parametrise. Audio paths follow the standard convention
 *  via `audioMapFor`: drop an MP3 at `/assets/audio/<target>/<word>.mp3`
 *  and it plays; nothing else to wire. */
const SABA_ENTRIES: Record<TargetLanguage, VocabularyEntry[]> = {
  lingo: [
    // 1-10 — re-stated here (no longer reusing MIRA_PACK.filter)
    // so the lingo variant of this pack is self-contained and
    // future content edits to MIRA stay isolated to Cleo's deck.
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
    // 11-20 — same CV/CVC shape, intentionally distinct from 1-10
    // by more than one letter so similar-sounding pairs don't
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
  french: [
    { target: 'un', english: 'one', vi: 'một', pos: 'number' },
    { target: 'deux', english: 'two', vi: 'hai', pos: 'number' },
    { target: 'trois', english: 'three', vi: 'ba', pos: 'number' },
    { target: 'quatre', english: 'four', vi: 'bốn', pos: 'number' },
    { target: 'cinq', english: 'five', vi: 'năm', pos: 'number' },
    { target: 'six', english: 'six', vi: 'sáu', pos: 'number' },
    { target: 'sept', english: 'seven', vi: 'bảy', pos: 'number' },
    { target: 'huit', english: 'eight', vi: 'tám', pos: 'number' },
    { target: 'neuf', english: 'nine', vi: 'chín', pos: 'number' },
    { target: 'dix', english: 'ten', vi: 'mười', pos: 'number' },
    { target: 'onze', english: 'eleven', vi: 'mười một', pos: 'number' },
    { target: 'douze', english: 'twelve', vi: 'mười hai', pos: 'number' },
    { target: 'treize', english: 'thirteen', vi: 'mười ba', pos: 'number' },
    { target: 'quatorze', english: 'fourteen', vi: 'mười bốn', pos: 'number' },
    { target: 'quinze', english: 'fifteen', vi: 'mười lăm', pos: 'number' },
    { target: 'seize', english: 'sixteen', vi: 'mười sáu', pos: 'number' },
    { target: 'dix-sept', english: 'seventeen', vi: 'mười bảy', pos: 'number' },
    { target: 'dix-huit', english: 'eighteen', vi: 'mười tám', pos: 'number' },
    { target: 'dix-neuf', english: 'nineteen', vi: 'mười chín', pos: 'number' },
    { target: 'vingt', english: 'twenty', vi: 'hai mươi', pos: 'number' },
  ],
  english: [
    { target: 'one', english: 'one', vi: 'một', pos: 'number' },
    { target: 'two', english: 'two', vi: 'hai', pos: 'number' },
    { target: 'three', english: 'three', vi: 'ba', pos: 'number' },
    { target: 'four', english: 'four', vi: 'bốn', pos: 'number' },
    { target: 'five', english: 'five', vi: 'năm', pos: 'number' },
    { target: 'six', english: 'six', vi: 'sáu', pos: 'number' },
    { target: 'seven', english: 'seven', vi: 'bảy', pos: 'number' },
    { target: 'eight', english: 'eight', vi: 'tám', pos: 'number' },
    { target: 'nine', english: 'nine', vi: 'chín', pos: 'number' },
    { target: 'ten', english: 'ten', vi: 'mười', pos: 'number' },
    { target: 'eleven', english: 'eleven', vi: 'mười một', pos: 'number' },
    { target: 'twelve', english: 'twelve', vi: 'mười hai', pos: 'number' },
    { target: 'thirteen', english: 'thirteen', vi: 'mười ba', pos: 'number' },
    { target: 'fourteen', english: 'fourteen', vi: 'mười bốn', pos: 'number' },
    { target: 'fifteen', english: 'fifteen', vi: 'mười lăm', pos: 'number' },
    { target: 'sixteen', english: 'sixteen', vi: 'mười sáu', pos: 'number' },
    { target: 'seventeen', english: 'seventeen', vi: 'mười bảy', pos: 'number' },
    { target: 'eighteen', english: 'eighteen', vi: 'mười tám', pos: 'number' },
    { target: 'nineteen', english: 'nineteen', vi: 'mười chín', pos: 'number' },
    { target: 'twenty', english: 'twenty', vi: 'hai mươi', pos: 'number' },
  ],
};

function makeSabaPack(target: TargetLanguage): VocabularyPack {
  const entries = SABA_ENTRIES[target];
  return {
    id: 'saba-pack-1',
    theme: 'Numbers 1-20',
    target,
    entries,
    audio: audioMapFor(target, entries),
  };
}

export const SABA_PACK: VocabularyPack = makeSabaPack('lingo');

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
  target: 'lingo',
  entries: MIRA_PACK.entries.filter((e) =>
    ['mufra', 'naren', 'solpi', 'demba', 'palba'].includes(e.target),
  ),
};

/** Tutorial pack — used by the office tutor NPC during the intro
 *  quest's mock job. Deliberately tiny (3 words) so the player can
 *  walk through both Practice and Read flows without grinding. The
 *  words are picked from MIRA_PACK so we don't have to author new
 *  audio / examples; theme just labels what they're learning. */
/** Shared 3-word vocabulary for the office tutorial trio.
 *  All three NPCs (Eli → read, Rina → listen, Yusuf → write)
 *  drill the SAME words so the player walks out of the office
 *  having learned `tarven` / `koldi` / `numera` in every mode —
 *  reinforcing recall while teaching the modes themselves. The
 *  three packs differ only by id + theme so the translate view's
 *  per-pack progress UI can still distinguish them. */
const OFFICE_TUTOR_TARGETS = ['tarven', 'koldi', 'numera'];

/** Office tutorial entries per target language. All three office
 *  NPCs (Eli / Rina / Yusuf) drill the SAME 3 words in different
 *  modes, so the entries are defined once per target and reused by
 *  each of the three pack ids below. Native-language meanings
 *  (`english`, `vi`) are constant across targets — only the target
 *  word itself changes. */
const OFFICE_TUTOR_ENTRIES: Record<TargetLanguage, VocabularyEntry[]> = {
  lingo: MIRA_PACK.entries.filter((e) => OFFICE_TUTOR_TARGETS.includes(e.target)),
  french: [
    { target: 'travail', english: 'work', vi: 'công việc', pos: 'noun' },
    { target: 'argent', english: 'money', vi: 'tiền', pos: 'noun' },
    { target: 'bureau', english: 'office', vi: 'văn phòng', pos: 'noun' },
  ],
  english: [
    { target: 'work', english: 'work', vi: 'công việc', pos: 'noun' },
    { target: 'money', english: 'money', vi: 'tiền', pos: 'noun' },
    { target: 'office', english: 'office', vi: 'văn phòng', pos: 'noun' },
  ],
};

/** Audio path convention: `/assets/audio/<targetLang>/<targetWord>.mp3`.
 *  Files are looked up by the entry's `target` field. Missing files
 *  silently fall back to browser TTS at runtime (see wordSpeak.ts),
 *  so listing a path here BEFORE the file exists is harmless —
 *  it'll just keep using TTS until you drop the MP3 in. Adding a
 *  new pack? Pass its entry list through this helper and store
 *  the result as `pack.audio`. */
function audioMapFor(
  target: TargetLanguage,
  entries: readonly VocabularyEntry[],
): Record<string, string> {
  return Object.fromEntries(
    entries.map((entry) => [
      entry.target,
      `/assets/audio/${target}/${entry.target}.mp3`,
    ]),
  );
}

function makeOfficePack(
  id: string,
  theme: string,
  target: TargetLanguage,
): VocabularyPack {
  const entries = OFFICE_TUTOR_ENTRIES[target];
  return {
    id,
    theme,
    target,
    entries,
    audio: audioMapFor(target, entries),
  };
}

export const OFFICE_TUTOR_PACK: VocabularyPack = makeOfficePack(
  'office-tutor-pack',
  'Trainer warm-up',
  'lingo',
);
export const OFFICE_LISTEN_TUTOR_PACK: VocabularyPack = makeOfficePack(
  'office-listen-tutor-pack',
  'Listening warm-up',
  'lingo',
);
export const OFFICE_WRITE_TUTOR_PACK: VocabularyPack = makeOfficePack(
  'office-write-tutor-pack',
  'Writing warm-up',
  'lingo',
);

/** Per-target pack registry. NPCs reference packs by id; the
 *  active `TargetLanguage` (from `getTarget()`) selects which
 *  variant resolves at lookup time. Packs that have no variant
 *  for the active target fall back to the `lingo` variant — keeps
 *  the game playable on a partial-content target without the NPC
 *  panic-crashing on a missing pack. */
type PackRegistry = Record<string, Partial<Record<TargetLanguage, VocabularyPack>>>;

const PACK_REGISTRY: PackRegistry = {
  [MIRA_PACK.id]: {
    lingo: MIRA_PACK,
    french: makeMiraVariant('french'),
    english: makeMiraVariant('english'),
  },
  [SABA_PACK.id]: {
    lingo: SABA_PACK,
    french: makeSabaPack('french'),
    english: makeSabaPack('english'),
  },
  [PIO_PACK.id]: { lingo: PIO_PACK },
  'office-tutor-pack': {
    lingo: OFFICE_TUTOR_PACK,
    french: makeOfficePack('office-tutor-pack', 'Trainer warm-up', 'french'),
    english: makeOfficePack('office-tutor-pack', 'Trainer warm-up', 'english'),
  },
  'office-listen-tutor-pack': {
    lingo: OFFICE_LISTEN_TUTOR_PACK,
    french: makeOfficePack('office-listen-tutor-pack', 'Listening warm-up', 'french'),
    english: makeOfficePack('office-listen-tutor-pack', 'Listening warm-up', 'english'),
  },
  'office-write-tutor-pack': {
    lingo: OFFICE_WRITE_TUTOR_PACK,
    french: makeOfficePack('office-write-tutor-pack', 'Writing warm-up', 'french'),
    english: makeOfficePack('office-write-tutor-pack', 'Writing warm-up', 'english'),
  },
};

/** Back-compat export — some surfaces (debug overlays, future
 *  pack browser) iterate VOCABULARY_PACKS by id. Returns the
 *  lingo variant for each id since that's the legacy shape. */
export const VOCABULARY_PACKS: Record<string, VocabularyPack> = Object.fromEntries(
  Object.entries(PACK_REGISTRY)
    .map(([id, variants]) => [id, variants.lingo])
    .filter(([, pack]) => pack !== undefined),
) as Record<string, VocabularyPack>;

export function getVocabularyPack(id: string): VocabularyPack | undefined {
  const target = getTarget();
  return PACK_REGISTRY[id]?.[target] ?? PACK_REGISTRY[id]?.lingo;
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
