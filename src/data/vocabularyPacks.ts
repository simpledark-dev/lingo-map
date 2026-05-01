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

/** All packs keyed by id. NPCs reference packs via `vocabularyPackId`. */
export const VOCABULARY_PACKS: Record<string, VocabularyPack> = {
  [MIRA_PACK.id]: MIRA_PACK,
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
