/**
 * Scripted scene: the café customer's first visit.
 *
 * Linear array of steps. The runner walks through them in order and
 * never branches in V1 — wrong answers retry the same step.
 *
 * Step kinds:
 *   say         — NPC says a line; player fills in the target-language
 *                 word inside an English template (`prefix` + input +
 *                 `suffix`). The `meaning` field is the English coaching
 *                 line shown above the input — it tells the player WHAT
 *                 they're saying without revealing the FRENCH WORD.
 *                 `expect` is the canonical answer; `accept` lists the
 *                 variants the matcher treats as correct. `actor` is the
 *                 NPC id the player must currently be talking to.
 *
 *   approach    — wait for the player to tap `actor` and walk over.
 *                 No text input. If `preNpcLine` is set, that line is
 *                 shown as a dialogue bubble on the PREVIOUS actor
 *                 first ("Can I get the menu first?") — i.e. the
 *                 character handing off the conversation gets one
 *                 last beat before the player walks away.
 *
 *   chooseSeat  — show markers on both seat anchors; on tap, teleport
 *                 the customer to that table and advance.
 *
 * Accent normalisation is the runner's job — author entries with the
 * canonical accented form (`bonjour`, `s'il vous plaît`); the matcher
 * strips diacritics before comparing.
 */

export type CafeNpcId =
  | 'cafe-customer'
  | 'cafe-worker'
  | 'cafe-seat-a'
  | 'cafe-seat-b';

export type CafeActorId = 'cafe-customer' | 'cafe-worker';

export type CafeScriptStep =
  | {
      kind: 'say';
      actor: CafeActorId;
      /** What the NPC says aloud, in English. Animated character-by-
       *  character before the player can type — visually establishes
       *  whose "turn" it is in the conversation. Empty string for
       *  beats where the NPC doesn't speak (just a coaching prompt). */
      npcLine: string;
      /** English meaning of the *whole* phrase the player is meant to
       *  produce — the coaching line. Doesn't include the French
       *  answer so the player still has to recall the word. */
      meaning: string;
      /** Optional English/French text shown LEFT of the input field.
       *  Rarely used in V1 — most prompts start with the input. */
      prefix?: string;
      /** Optional English text shown RIGHT of the input field, framing
       *  the bit the player has to fill in. Example: input "voulez-
       *  vous" with suffix " order?" reads as `[voulez-vous] order?`. */
      suffix?: string;
      expect: string;
      accept: string[];
    }
  | {
      kind: 'approach';
      actor: CafeActorId;
      /** Optional final line from the *previous* speaker, shown as a
       *  bubble on the way out. Used for "Can I get the menu first?"
       *  before the player walks to the worker. */
      preNpcLine?: string;
      preActor?: CafeActorId;
      hint: string;
    }
  | {
      kind: 'chooseSeat';
      hint: string;
    };

export const CAFE_INTRO_SCRIPT: ReadonlyArray<CafeScriptStep> = [
  // ── At the door ──
  {
    kind: 'approach',
    actor: 'cafe-customer',
    hint: 'A customer is at the door. Tap on them.',
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: 'Hi!',
    meaning: 'Greet them.',
    expect: 'bonjour',
    accept: ['bonjour', 'salut'],
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: '',
    meaning: 'Welcome them.',
    expect: 'bienvenue',
    accept: ['bienvenue'],
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: 'Can I come in?',
    meaning: 'Say yes.',
    expect: 'oui',
    accept: ['oui', 'ouais'],
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: '',
    meaning: 'Invite them in.',
    expect: "entrez, s'il vous plaît",
    accept: [
      "entrez s'il vous plaît",
      "entrez, s'il vous plaît",
      "entrez s'il vous plait",
      "entrez, s'il vous plait",
      'entrez',
    ],
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: 'Can you show me the way?',
    meaning: 'Point them in.',
    expect: 'par ici',
    accept: ['par ici', 'par là', 'par la'],
  },

  // ── Pick a table ──
  {
    kind: 'chooseSeat',
    hint: 'Tap a table to seat the customer.',
  },

  // ── At the table ──
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: 'Besides coffee, what else do you have?',
    meaning: 'Say food.',
    expect: 'nourriture',
    accept: ['nourriture', 'à manger', 'a manger'],
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: "I'm so hungry!",
    meaning: 'Ask if they want to order.',
    suffix: ' order?',
    expect: 'voulez-vous',
    accept: ['voulez-vous', 'voulez vous'],
  },
  {
    kind: 'approach',
    actor: 'cafe-worker',
    preNpcLine: 'Can I get the menu first?',
    preActor: 'cafe-customer',
    hint: 'Tap on the worker to grab the menu.',
  },

  // ── Talk to the worker ──
  {
    kind: 'say',
    actor: 'cafe-worker',
    npcLine: '',
    meaning: 'Ask if they can give you the menu.',
    suffix: ' give me the menu',
    expect: 'pouvez-vous',
    accept: ['pouvez-vous', 'pouvez vous'],
  },
  {
    kind: 'say',
    actor: 'cafe-worker',
    npcLine: 'Sure, here it is.',
    meaning: 'Thank them warmly.',
    expect: 'merci beaucoup',
    accept: ['merci beaucoup', 'merci bien', 'merci'],
  },
  {
    kind: 'say',
    actor: 'cafe-worker',
    npcLine: '',
    meaning: 'Now ask for the cookies too.',
    suffix: ' also give me the cookies',
    expect: 'pouvez-vous',
    accept: ['pouvez-vous', 'pouvez vous'],
  },
  {
    kind: 'say',
    actor: 'cafe-worker',
    npcLine: 'Here you go.',
    meaning: 'Say "great, thanks".',
    expect: 'super, merci',
    accept: [
      'super merci',
      'super, merci',
      'super',
      'genial merci',
      'génial merci',
    ],
  },

  // ── Back to the customer ──
  {
    kind: 'approach',
    actor: 'cafe-customer',
    hint: 'Bring the menu back to the customer.',
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: '',
    meaning: 'Hand them the menu.',
    suffix: ' the menu',
    expect: 'voici',
    accept: ['voici'],
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: 'Thanks. Let me take a look.',
    meaning: 'Say "of course".',
    expect: 'bien sûr',
    accept: ['bien sûr', 'bien sur', 'ok', "d'accord"],
  },
  {
    kind: 'say',
    actor: 'cafe-customer',
    npcLine: "I'm ready to order.",
    meaning: 'Tell them to go ahead.',
    expect: 'allez-y',
    accept: ['allez-y', 'allez y'],
  },
];

/** Normalise a user's typed input for comparison against an `accept`
 *  list. Strips diacritics, lowercases, trims, collapses inner
 *  whitespace, and drops trailing punctuation so the matcher tolerates
 *  the typical typos without becoming permissive enough to miss
 *  genuine mistakes. */
export function normaliseAnswer(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isAcceptedAnswer(
  step: Extract<CafeScriptStep, { kind: 'say' }>,
  raw: string,
): boolean {
  const got = normaliseAnswer(raw);
  for (const candidate of step.accept) {
    if (normaliseAnswer(candidate) === got) return true;
  }
  return false;
}
