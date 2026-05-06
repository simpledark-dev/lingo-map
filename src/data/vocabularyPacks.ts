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

export interface VocabularyEntry {
  /** The target-language word as it appears on screen and is spoken. */
  target: string;
  /** Plain-English meaning. */
  english: string;
  /** Loose part-of-speech tag — used by the quiz UI to phrase prompts
   *  ("verb: to run" vs "noun: dog"). Not strictly enforced. */
  pos: 'noun' | 'verb' | 'adjective' | 'pronoun' | 'preposition' | 'conjunction' | 'question' | 'number' | 'time' | 'greeting';
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
    { target: 'mira', english: 'I',         pos: 'pronoun' },
    { target: 'toba', english: 'you',       pos: 'pronoun' },
    { target: 'senu', english: 'he',        pos: 'pronoun' },
    { target: 'sela', english: 'she',       pos: 'pronoun' },
    { target: 'vako', english: 'we',        pos: 'pronoun' },
    { target: 'kemo', english: 'they',      pos: 'pronoun' },
    { target: 'noli', english: 'this',      pos: 'pronoun' },
    { target: 'fudo', english: 'that',      pos: 'pronoun' },

    // ── Greetings & courtesy (5) ──
    { target: 'palu',  english: 'hello',    pos: 'greeting' },
    { target: 'versi', english: 'goodbye',  pos: 'greeting' },
    { target: 'toka',  english: 'yes',      pos: 'greeting' },
    { target: 'moren', english: 'no',       pos: 'greeting' },
    { target: 'felu',  english: 'thanks',   pos: 'greeting' },

    // ── Question words (6) ──
    { target: 'kena',  english: 'what',     pos: 'question' },
    { target: 'vora',  english: 'who',      pos: 'question' },
    { target: 'liso',  english: 'where',    pos: 'question' },
    { target: 'tezo',  english: 'when',     pos: 'question' },
    { target: 'murra', english: 'why',      pos: 'question' },
    { target: 'boran', english: 'how',      pos: 'question' },

    // ── Numbers 1-10 (10) ──
    { target: 'ena',    english: 'one',     pos: 'number' },
    { target: 'dura',   english: 'two',     pos: 'number' },
    { target: 'solva',  english: 'three',   pos: 'number' },
    { target: 'mekta',  english: 'four',    pos: 'number' },
    { target: 'galpi',  english: 'five',    pos: 'number' },
    { target: 'tumo',   english: 'six',     pos: 'number' },
    { target: 'resta',  english: 'seven',   pos: 'number' },
    { target: 'jolen',  english: 'eight',   pos: 'number' },
    { target: 'kavu',   english: 'nine',    pos: 'number' },
    { target: 'ponek',  english: 'ten',     pos: 'number' },

    // ── Body parts (10) ──
    { target: 'orna',   english: 'head',    pos: 'noun' },
    { target: 'vesti',  english: 'eye',     pos: 'noun' },
    { target: 'labu',   english: 'ear',     pos: 'noun' },
    { target: 'puro',   english: 'mouth',   pos: 'noun' },
    { target: 'kelan',  english: 'nose',    pos: 'noun' },
    { target: 'mevu',   english: 'hand',    pos: 'noun' },
    { target: 'nira',   english: 'foot',    pos: 'noun' },
    { target: 'tabok',  english: 'arm',     pos: 'noun' },
    { target: 'tobur',  english: 'leg',     pos: 'noun' },
    { target: 'finja',  english: 'hair',    pos: 'noun' },

    // ── Family & people (8) ──
    { target: 'renka',  english: 'mother',  pos: 'noun' },
    { target: 'ovan',   english: 'father',  pos: 'noun' },
    { target: 'keldi',  english: 'son',     pos: 'noun' },
    { target: 'mervi',  english: 'daughter',pos: 'noun' },
    { target: 'astro',  english: 'brother', pos: 'noun' },
    { target: 'pelma',  english: 'sister',  pos: 'noun' },
    { target: 'samri',  english: 'friend',  pos: 'noun' },
    { target: 'tunto',  english: 'baby',    pos: 'noun' },

    // ── Food & drink (12) ──
    { target: 'mosa',   english: 'water',   pos: 'noun' },
    { target: 'tilan',  english: 'bread',   pos: 'noun' },
    { target: 'korba',  english: 'meat',    pos: 'noun' },
    { target: 'vepra',  english: 'fish',    pos: 'noun' },
    { target: 'galen',  english: 'fruit',   pos: 'noun' },
    { target: 'tsoma',  english: 'vegetable',pos: 'noun' },
    { target: 'bekal',  english: 'milk',    pos: 'noun' },
    { target: 'orta',   english: 'coffee',  pos: 'noun' },
    { target: 'samu',   english: 'tea',     pos: 'noun' },
    { target: 'pelo',   english: 'rice',    pos: 'noun' },
    { target: 'wevi',   english: 'egg',     pos: 'noun' },
    { target: 'maleva', english: 'soup',    pos: 'noun' },

    // ── Animals (8) ──
    { target: 'grano',  english: 'dog',     pos: 'noun' },
    { target: 'vepu',   english: 'cat',     pos: 'noun' },
    { target: 'seli',   english: 'bird',    pos: 'noun' },
    { target: 'tarpa',  english: 'horse',   pos: 'noun' },
    { target: 'moven',  english: 'cow',     pos: 'noun' },
    { target: 'folka',  english: 'pig',     pos: 'noun' },
    { target: 'bunta',  english: 'sheep',   pos: 'noun' },
    { target: 'tilna',  english: 'chicken', pos: 'noun' },

    // ── House & objects (12) ──
    { target: 'laska',  english: 'house',   pos: 'noun' },
    { target: 'kerno',  english: 'door',    pos: 'noun' },
    { target: 'biru',   english: 'window',  pos: 'noun' },
    { target: 'mosti',  english: 'chair',   pos: 'noun' },
    { target: 'veska',  english: 'table',   pos: 'noun' },
    { target: 'lonti',  english: 'bed',     pos: 'noun' },
    { target: 'naber',  english: 'floor',   pos: 'noun' },
    { target: 'guren',  english: 'wall',    pos: 'noun' },
    { target: 'seron',  english: 'key',     pos: 'noun' },
    { target: 'pavi',   english: 'book',    pos: 'noun' },
    { target: 'drano',  english: 'phone',   pos: 'noun' },
    { target: 'vospi',  english: 'car',     pos: 'noun' },

    // ── Places (10) ──
    { target: 'urvi',   english: 'city',       pos: 'noun' },
    { target: 'talba',  english: 'street',     pos: 'noun' },
    { target: 'minka',  english: 'store',      pos: 'noun' },
    { target: 'hopra',  english: 'school',     pos: 'noun' },
    { target: 'emen',   english: 'park',       pos: 'noun' },
    { target: 'klisa',  english: 'hospital',   pos: 'noun' },
    { target: 'durok',  english: 'station',    pos: 'noun' },
    { target: 'wenta',  english: 'restaurant', pos: 'noun' },
    { target: 'guzon',  english: 'market',     pos: 'noun' },
    { target: 'riste',  english: 'bank',       pos: 'noun' },

    // ── Nature (9) ──
    { target: 'larin',  english: 'sun',     pos: 'noun' },
    { target: 'senpa',  english: 'moon',    pos: 'noun' },
    { target: 'kobu',   english: 'tree',    pos: 'noun' },
    { target: 'milra',  english: 'flower',  pos: 'noun' },
    { target: 'omba',   english: 'sea',     pos: 'noun' },
    { target: 'trepin', english: 'mountain',pos: 'noun' },
    { target: 'folvi',  english: 'sky',     pos: 'noun' },
    { target: 'semba',  english: 'cloud',   pos: 'noun' },
    { target: 'kebro',  english: 'rain',    pos: 'noun' },

    // ── Adjectives (12) ──
    { target: 'versa',  english: 'big',     pos: 'adjective' },
    { target: 'druna',  english: 'small',   pos: 'adjective' },
    { target: 'forta',  english: 'good',    pos: 'adjective' },
    { target: 'narma',  english: 'bad',     pos: 'adjective' },
    { target: 'herti',  english: 'old',     pos: 'adjective' },
    { target: 'balku',  english: 'new',     pos: 'adjective' },
    { target: 'dorin',  english: 'hot',     pos: 'adjective' },
    { target: 'fimbra', english: 'cold',    pos: 'adjective' },
    { target: 'toska',  english: 'happy',   pos: 'adjective' },
    { target: 'muva',   english: 'sad',     pos: 'adjective' },
    { target: 'kentu',  english: 'fast',    pos: 'adjective' },
    { target: 'balava', english: 'slow',    pos: 'adjective' },

    // ── Verbs (15) ──
    { target: 'mavi',   english: 'to be',    pos: 'verb' },
    { target: 'konsa',  english: 'to have',  pos: 'verb' },
    { target: 'reli',   english: 'to go',    pos: 'verb' },
    { target: 'blanto', english: 'to come',  pos: 'verb' },
    { target: 'mufra',  english: 'to eat',   pos: 'verb' },
    { target: 'solpi',  english: 'to drink', pos: 'verb' },
    { target: 'naren',  english: 'to sleep', pos: 'verb' },
    { target: 'demba',  english: 'to wake',  pos: 'verb' },
    { target: 'keska',  english: 'to run',   pos: 'verb' },
    { target: 'tomri',  english: 'to walk',  pos: 'verb' },
    { target: 'palba',  english: 'to see',   pos: 'verb' },
    { target: 'felun',  english: 'to hear',  pos: 'verb' },
    { target: 'vidra',  english: 'to speak', pos: 'verb' },
    { target: 'torsa',  english: 'to buy',   pos: 'verb' },
    { target: 'menpa',  english: 'to give',  pos: 'verb' },

    // ── Connectives (8) ──
    { target: 'vu',     english: 'and',     pos: 'conjunction' },
    { target: 'tem',    english: 'but',     pos: 'conjunction' },
    { target: 'ka',     english: 'or',      pos: 'conjunction' },
    { target: 'ferta',  english: 'because', pos: 'conjunction' },
    { target: 'nabra',  english: 'although',pos: 'conjunction' },
    { target: 'solu',   english: 'if',      pos: 'conjunction' },
    { target: 'muka',   english: 'so',      pos: 'conjunction' },
    { target: 'lopra',  english: 'then',    pos: 'conjunction' },

    // ── Prepositions (8) ──
    { target: 'da',     english: 'in',      pos: 'preposition' },
    { target: 'po',     english: 'on',      pos: 'preposition' },
    { target: 'ki',     english: 'at',      pos: 'preposition' },
    { target: 're',     english: 'to',      pos: 'preposition' },
    { target: 'as',     english: 'from',    pos: 'preposition' },
    { target: 'mu',     english: 'with',    pos: 'preposition' },
    { target: 'ber',    english: 'without', pos: 'preposition' },
    { target: 'klo',    english: 'under',   pos: 'preposition' },

    // ── Time expressions (8) ──
    { target: 'herna',  english: 'today',     pos: 'time' },
    { target: 'balri',  english: 'tomorrow',  pos: 'time' },
    { target: 'kemna',  english: 'yesterday', pos: 'time' },
    { target: 'atu',    english: 'now',       pos: 'time' },
    { target: 'lamri',  english: 'later',     pos: 'time' },
    { target: 'suvora', english: 'morning',   pos: 'time' },
    { target: 'durna',  english: 'night',     pos: 'time' },
    { target: 'seko',   english: 'year',      pos: 'time' },

    // ── Filler (1 to round to 150) ──
    { target: 'gansu',  english: 'name',      pos: 'noun' },
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
    { target: 'naltu',  english: 'eleven',    pos: 'number' },
    { target: 'bonta',  english: 'twelve',    pos: 'number' },
    { target: 'silvu',  english: 'thirteen',  pos: 'number' },
    { target: 'frenta', english: 'fourteen',  pos: 'number' },
    { target: 'demni',  english: 'fifteen',   pos: 'number' },
    { target: 'vorhi',  english: 'sixteen',   pos: 'number' },
    { target: 'undri',  english: 'seventeen', pos: 'number' },
    { target: 'kembo',  english: 'eighteen',  pos: 'number' },
    { target: 'milto',  english: 'nineteen',  pos: 'number' },
    { target: 'opasu',  english: 'twenty',    pos: 'number' },
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
