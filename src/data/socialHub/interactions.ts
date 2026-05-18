/**
 * Interaction dialogue trees for the social hub.
 *
 * Each interaction is a small directed graph rather than a linear
 * script — the player's choice picks an edge, and edges carry
 * outcomes (tip, satisfaction shift, end-state). The runner walks
 * the graph one node at a time.
 *
 * Vocabulary:
 *   – Interaction       = one self-contained social encounter
 *                         (welcome, ask-for-drink, complain-about-heat…).
 *   – StarterVariation  = a starting NPC line; multiple per interaction
 *                         so repeated requests don't read identically.
 *   – DialogueNode      = a single "NPC line + player choices" beat.
 *   – ChoiceOutcome     = what happens when the player picks an option.
 *                         Either branches to another node, or ends the
 *                         interaction with a tagged result.
 *
 * V1 keeps NPC reply variation simple: each ChoiceOutcome can carry
 * a small list of `npcReplies` to vary the line shown for the same
 * branch outcome. The runner picks one at random when the branch
 * fires. Same for starter lines — picked at random when the
 * interaction begins.
 *
 * To stay scalable, the trees DON'T mention specific NPC names.
 * The runner substitutes {npc} / {player} placeholders at render
 * time so any persona can star in any interaction.
 */

import type { PoiType } from './pois';

/** Tags carried on a terminal outcome. Drive the runtime state
 *  changes the lifecycle module applies AFTER the interaction
 *  closes — keeping dialogue data declarative. */
export interface InteractionResult {
  /** End the conversation. False = branches to `nextNode`. */
  end: true;
  /** Money awarded to the player (cents). 0 = no tip. */
  tipCents?: number;
  /** Mood shift applied to the NPC's satisfaction score
   *  (range roughly -3..+3 per beat). */
  satisfactionDelta?: number;
  /** When set, the NPC packs up and leaves the venue at the end
   *  of this beat — short delay so the bad-response feedback lands
   *  before the sprite walks out. */
  npcLeaves?: boolean;
  /** Marks this interaction's outcome as a happy path (positive,
   *  helpful). Used for review aggregation. Defaults to false. */
  happy?: boolean;
  /** Optional staff-task hook. V1 marks the interaction as
   *  needing-staff but immediately resolves; v2 will pause the
   *  interaction, light a marker over the staff NPC, and wait for
   *  the player to walk over. Carrying the field now keeps the
   *  data shape stable for the upgrade. */
  staffTask?: 'coffee' | 'charger' | 'blanket' | 'book' | 'wifi';
}

/** Non-terminal outcome — pick this choice and the conversation
 *  steps to another node. Carries an interim mood shift so even
 *  middle-of-tree choices have weight. */
export interface InteractionBranch {
  end?: false;
  nextNode: string;
  satisfactionDelta?: number;
  /** Optional NPC reactions inside the BRANCH itself — shown as
   *  the NPC's next line before the next node's lines kick in.
   *  When empty, the runner jumps straight to `nextNode`. Pick a
   *  random entry when there are multiple. */
  npcReplies?: string[];
}

export type ChoiceOutcome = InteractionResult | InteractionBranch;

export interface PlayerChoice {
  label: string;
  outcome: ChoiceOutcome;
}

export interface DialogueNode {
  id: string;
  /** NPC line(s) shown when entering this node. Multiple = pick one
   *  at random per visit so repeated plays feel different. */
  npcLines: string[];
  choices: PlayerChoice[];
}

export interface InteractionTree {
  id: string;
  /** POI types this interaction is valid at. The lifecycle module
   *  uses this to pick an appropriate request when an NPC settles
   *  at a POI. `'entrance'` interactions only fire while the NPC is
   *  in the entering / waiting-for-welcome state. */
  allowedPoiTypes: PoiType[];
  /** Multiple starter lines so the same interaction reads
   *  differently across visits. */
  starterVariations: string[];
  /** Entry node id — usually `'root'`. */
  startNodeId: string;
  nodes: Record<string, DialogueNode>;
}

// ──────────────────────────────────────────────────────────────
// Interaction: entrance_welcome
// Fires immediately on NPC spawn at the entrance. Sets the tone.
// ──────────────────────────────────────────────────────────────
const entranceWelcome: InteractionTree = {
  id: 'entrance_welcome',
  allowedPoiTypes: ['entrance'],
  starterVariations: [
    'Hi, is this place still open?',
    'Hey there — can I come in?',
    'Hello! Are you still accepting visitors?',
  ],
  startNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      npcLines: [
        'Hi, is this place still open?',
        'Hey there — can I come in?',
        'Hello! Are you still accepting visitors?',
      ],
      choices: [
        {
          label: "Yes, we're open. Welcome in!",
          outcome: {
            end: true,
            tipCents: 100,
            satisfactionDelta: 2,
            happy: true,
          },
        },
        {
          label: "Sorry — we're closed right now.",
          outcome: {
            end: true,
            satisfactionDelta: -1,
            npcLeaves: true,
          },
        },
        {
          label: 'Get out.',
          outcome: {
            end: true,
            satisfactionDelta: -3,
            npcLeaves: true,
          },
        },
      ],
    },
  },
};

// ──────────────────────────────────────────────────────────────
// Interaction: ask_for_drink   (multi-step + recovery branch)
// ──────────────────────────────────────────────────────────────
const askForDrink: InteractionTree = {
  id: 'ask_for_drink',
  allowedPoiTypes: ['lounge', 'reading'],
  starterVariations: [
    'Could I get something to drink, please?',
    "Hey, do you serve drinks here? I'm a bit parched.",
  ],
  startNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      npcLines: [
        'Could I get something to drink, please?',
        "Hey, do you serve drinks here? I'm a bit parched.",
      ],
      choices: [
        {
          label: 'Of course — what would you like?',
          outcome: { nextNode: 'pick-drink', satisfactionDelta: 1 },
        },
        {
          label: "We don't really do drinks, sorry.",
          outcome: { nextNode: 'recovery', satisfactionDelta: -1 },
        },
        {
          label: 'No, go away.',
          outcome: {
            end: true,
            satisfactionDelta: -3,
            npcLeaves: true,
          },
        },
      ],
    },
    'pick-drink': {
      id: 'pick-drink',
      npcLines: [
        "I'd love a coffee, please.",
        'A coffee would be great, thank you.',
      ],
      choices: [
        {
          label: "Sure — I'll ask the staff to make one.",
          outcome: {
            end: true,
            tipCents: 100,
            satisfactionDelta: 2,
            happy: true,
            staffTask: 'coffee',
          },
        },
        {
          label: "Actually, we're out of coffee — sorry.",
          outcome: { end: true, satisfactionDelta: -1 },
        },
      ],
    },
    recovery: {
      id: 'recovery',
      npcLines: [
        'Oh… maybe just some water then?',
        'No worries — even tap water would be fine.',
      ],
      choices: [
        {
          label: "Of course, water I can do. I'll grab some.",
          outcome: {
            end: true,
            tipCents: 100,
            satisfactionDelta: 2,
            happy: true,
          },
        },
        {
          label: "I'd rather you went somewhere else, honestly.",
          outcome: {
            end: true,
            satisfactionDelta: -2,
            npcLeaves: true,
          },
        },
      ],
    },
  },
};

// ──────────────────────────────────────────────────────────────
// Interaction: ask_for_charger   (simple practical, one-step)
// ──────────────────────────────────────────────────────────────
const askForCharger: InteractionTree = {
  id: 'ask_for_charger',
  allowedPoiTypes: ['lounge', 'reading'],
  starterVariations: [
    "My phone's at 4% — do you have a charger I could borrow?",
    'Sorry to bother — got a spare charger anywhere?',
  ],
  startNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      npcLines: [
        "My phone's at 4% — do you have a charger I could borrow?",
        'Sorry to bother — got a spare charger anywhere?',
      ],
      choices: [
        {
          label: 'Sure, let me grab one for you.',
          outcome: {
            end: true,
            tipCents: 100,
            satisfactionDelta: 2,
            happy: true,
            staffTask: 'charger',
          },
        },
        {
          label: "I don't think we have one, sorry.",
          outcome: { end: true, satisfactionDelta: -1 },
        },
        {
          label: 'Buy your own.',
          outcome: {
            end: true,
            satisfactionDelta: -3,
            npcLeaves: true,
          },
        },
      ],
    },
  },
};

// ──────────────────────────────────────────────────────────────
// Interaction: complain_about_heat   (recovery-capable, no staff)
// ──────────────────────────────────────────────────────────────
const complainAboutHeat: InteractionTree = {
  id: 'complain_about_heat',
  allowedPoiTypes: ['lounge', 'reading', 'game'],
  starterVariations: [
    'Phew — is it just me or is it really warm in here?',
    "It's pretty stuffy. Could you turn the heat down?",
  ],
  startNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      npcLines: [
        'Phew — is it just me or is it really warm in here?',
        "It's pretty stuffy. Could you turn the heat down?",
      ],
      choices: [
        {
          label: "Yeah, I'll crack a window — thanks for saying so.",
          outcome: {
            end: true,
            tipCents: 100,
            satisfactionDelta: 2,
            happy: true,
          },
        },
        {
          label: "It's fine, you're imagining it.",
          outcome: { nextNode: 'recovery', satisfactionDelta: -2 },
        },
      ],
    },
    recovery: {
      id: 'recovery',
      npcLines: [
        "I'm really not. It's properly hot.",
        "Maybe — but I'd still appreciate it if you could help.",
      ],
      choices: [
        {
          label: 'Alright alright, let me sort it out.',
          outcome: {
            end: true,
            tipCents: 100,
            satisfactionDelta: 1,
            happy: true,
          },
        },
        {
          label: "Then go sit outside if you don't like it.",
          outcome: {
            end: true,
            satisfactionDelta: -3,
            npcLeaves: true,
          },
        },
      ],
    },
  },
};

// ──────────────────────────────────────────────────────────────
// Interaction: casual_how_long_owned   (small talk, no tip)
// Gives the player social-talk practice without monetising every
// chat. Tips only flow from helpful actions.
// ──────────────────────────────────────────────────────────────
const casualHowLongOwned: InteractionTree = {
  id: 'casual_how_long_owned',
  allowedPoiTypes: ['lounge', 'reading'],
  starterVariations: [
    'How long have you been running this place?',
    'So, when did you open up here?',
    "It's a nice spot — have you owned it long?",
  ],
  startNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      npcLines: [
        'How long have you been running this place?',
        'So, when did you open up here?',
        "It's a nice spot — have you owned it long?",
      ],
      choices: [
        {
          label: "It's been about two years.",
          outcome: {
            nextNode: 'react-two-years',
            satisfactionDelta: 1,
          },
        },
        {
          label: 'My family used to run it before me.',
          outcome: {
            nextNode: 'react-family',
            satisfactionDelta: 1,
          },
        },
        {
          label: "That's none of your business.",
          outcome: { end: true, satisfactionDelta: -2 },
        },
      ],
    },
    'react-two-years': {
      id: 'react-two-years',
      npcLines: [
        'Two years already? Impressive.',
        'Only two years? You move fast.',
        'Nice — you must have learned a lot in that time.',
      ],
      choices: [
        {
          label: "Thanks, it's been a journey.",
          outcome: {
            end: true,
            satisfactionDelta: 1,
            happy: true,
          },
        },
        {
          label: 'Honestly some days I want to quit.',
          outcome: {
            end: true,
            satisfactionDelta: 0,
            happy: true,
          },
        },
      ],
    },
    'react-family': {
      id: 'react-family',
      npcLines: [
        "Oh wow — that's lovely. Family businesses have a feel to them.",
        'That makes sense. The place has a warmth to it.',
      ],
      choices: [
        {
          label: 'Thanks. I try to keep the spirit going.',
          outcome: {
            end: true,
            satisfactionDelta: 2,
            happy: true,
          },
        },
        {
          label: "Yeah, whatever. Anyway.",
          outcome: { end: true, satisfactionDelta: -1 },
        },
      ],
    },
  },
};

// ──────────────────────────────────────────────────────────────
// Interaction: ask_book_recommendation   (reading-area exclusive)
// ──────────────────────────────────────────────────────────────
const askBookRecommendation: InteractionTree = {
  id: 'ask_book_recommendation',
  allowedPoiTypes: ['reading'],
  starterVariations: [
    "I'm in the mood for a good read — any recommendation?",
    'Got a favourite book on these shelves?',
  ],
  startNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      npcLines: [
        "I'm in the mood for a good read — any recommendation?",
        'Got a favourite book on these shelves?',
      ],
      choices: [
        {
          label: 'Try the green one on the third shelf — it always lands.',
          outcome: {
            end: true,
            tipCents: 100,
            satisfactionDelta: 2,
            happy: true,
            staffTask: 'book',
          },
        },
        {
          label: 'Honestly I never read — pick what looks nice.',
          outcome: { end: true, satisfactionDelta: 0 },
        },
        {
          label: "I don't keep track. Figure it out.",
          outcome: {
            end: true,
            satisfactionDelta: -2,
            npcLeaves: true,
          },
        },
      ],
    },
  },
};

export const INTERACTIONS: ReadonlyArray<InteractionTree> = [
  entranceWelcome,
  askForDrink,
  askForCharger,
  complainAboutHeat,
  casualHowLongOwned,
  askBookRecommendation,
];

export function getInteractionById(id: string): InteractionTree | undefined {
  return INTERACTIONS.find((i) => i.id === id);
}

/** Pick an interaction that's allowed at this POI type. Filters out
 *  `entrance_welcome` for non-entrance POIs and vice versa. */
export function pickInteractionForPoi(
  poiType: PoiType,
  excludeIds: ReadonlyArray<string> = [],
): InteractionTree | undefined {
  const candidates = INTERACTIONS.filter(
    (i) => i.allowedPoiTypes.includes(poiType) && !excludeIds.includes(i.id),
  );
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function pickStarterLine(tree: InteractionTree): string {
  return tree.starterVariations[
    Math.floor(Math.random() * tree.starterVariations.length)
  ];
}

export function pickNpcLine(node: DialogueNode): string {
  return node.npcLines[Math.floor(Math.random() * node.npcLines.length)];
}
