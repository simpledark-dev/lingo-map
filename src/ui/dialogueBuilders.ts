/**
 * Dialogue builders + the intro apartment script.
 *
 * Extracted from GameCanvas.tsx so they can be unit-tested without
 * spinning up the whole canvas + bridge subscriber. Each builder
 * takes the engine-supplied `stub` DialogueState and returns the
 * React-managed shape (rewritten lines + options + dialogueKind).
 *
 * No React, no Pixi, no DOM — just data layer reads. Keep it that
 * way: callers in GameCanvas.tsx re-import these and use them in
 * the bridge subscriber.
 */

import { DialogueState } from '../core/types';
import {
  getQuestStatus,
  startQuest,
  FIRST_PAYCHECK_THRESHOLD_CENTS,
  FIRST_PAYCHECK_BONUS_CENTS,
} from '../data/quests';
import {
  formatBalance,
  getBalance,
  getLifetimeEarnings,
} from '../data/wallet';
import { hasItem } from '../data/inventory';
import {
  getDebt,
  canBorrow,
  BORROW_INCREMENT_CENTS,
  MAX_DEBT_CENTS,
} from '../data/debt';
import { hasFlag, setFlag, FLAGS } from '../data/eventFlags';
import { getPlayerName, getChildName } from '../data/profile';

/** Compose the child NPC's dialogue based on the current quest's
 *  status + inventory. Slice 2 promotes the previous flag-driven
 *  state machine to the quest module — same four branches:
 *    1. Quest inactive → Mim asks; we `startQuest` so future
 *       visits skip the ask AND the toast fires.
 *    2. Active, no sandwich → Mim nags, no options.
 *    3. Active, has sandwich → "Give it" option appears. (The
 *       option handler is what actually completes the quest, so a
 *       player who opens this dialogue and walks away keeps the
 *       quest active rather than auto-finishing it on view.)
 *    4. Completed → casual thank-you line. */
export function buildChildSandwichDialogue(stub: DialogueState): DialogueState {
  const status = getQuestStatus('child-sandwich');
  const introStatus = getQuestStatus('intro-translator-job');
  // Override the engine-supplied name with the player's child name
  // from the intro cutscene. The map data uses "Mim" as a fallback
  // (the engine doesn't read profile state), but the player typed
  // a specific name during the cutscene and seeing that everywhere
  // beats a hardcoded placeholder.
  const childNpcName = getChildName() ?? stub.npcName;
  // Helper so every branch consistently emits the player-named NPC
  // and short-circuits the boilerplate of `npcId: stub.npcId,
  // npcName: childNpcName, currentLine: 0`.
  const withChildName = (extra: Partial<DialogueState>): DialogueState => ({
    ...stub,
    npcName: childNpcName,
    ...extra,
  });
  // Intro override: while the tutorial quest is active, Mim sends
  // the player off with a "good luck" line and DOES NOT start her
  // own quest yet. Avoids two competing toasts on the very first
  // session and keeps the player pointed at the office.
  if (introStatus === 'active' && status === 'inactive') {
    return withChildName({
      lines: [
        `Good luck, dad! I'll wait here. Bring back some good news!`,
      ],
    });
  }
  if (status === 'completed') {
    return withChildName({
      lines: ['Thanks for the sandwich earlier! I love you, dad.'],
    });
  }
  if (status === 'inactive') {
    // Auto-start ONLY when the chain prereq is satisfied. Without
    // this guard, talking to Mim before first-paycheck completes
    // (e.g. in the brief window between cutscene-end and the
    // apartment monologue starting the intro quest) would kick
    // off the sandwich quest out of order — showing "I'm hungry"
    // before the player has even taken the translator job.
    if (getQuestStatus('first-paycheck') === 'completed') {
      startQuest('child-sandwich');
      return withChildName({
        lines: [
          "I'm hungry… can you go to the Mart and grab me a sandwich? Please?",
        ],
      });
    }
    // Pre-prereq fallback — a friendly, non-quest-starting line so
    // an early interaction with Mim feels like a real beat instead
    // of a dead-end. Two variants based on whether the intro quest
    // has begun yet, so the line lands in context.
    return withChildName({
      lines: introStatus === 'active'
        ? [`Good luck, dad! I'll wait here. Bring back some good news!`]
        : [`Hi dad. Are we okay?`],
    });
  }
  // status === 'active'. The chain auto-starts the quest WITHOUT
  // a Mim dialogue, so the very first visit needs to land the
  // hungry-ask beat — flagged so subsequent returns flip to the
  // ongoing "did you get it?" exchange. The Give option is shown
  // both when the player has the sandwich AND when they don't:
  // the option handler differentiates, and an inventory check at
  // selection time lets Mim deliver the "huh? where?" line as a
  // direct reaction to the player tapping Give without having one.
  if (!hasFlag(FLAGS.CHILD_ASKED_FOR_SANDWICH)) {
    setFlag(FLAGS.CHILD_ASKED_FOR_SANDWICH);
    return withChildName({
      lines: [
        "I'm hungry… can you go to the Mart and grab me a sandwich? Please?",
      ],
    });
  }
  // hasItem('sandwich') is read at option-handle time, not here, so
  // the "Give" option always renders and the routing decides the
  // outcome based on inventory state at that moment. Keeps the
  // dialogue builder a pure projection of quest + flag state.
  void hasItem;
  return withChildName({
    lines: ['Did you get my sandwich?'],
    options: [
      { id: 'child-give-sandwich', label: 'Give the sandwich 🥪' },
      { id: 'child-decline', label: 'Not yet' },
    ],
  });
}

/** Compose Theo's dialogue based on current debt + balance.
 *
 *  Three states:
 *    1. No debt, no balance → friendly opener + Borrow option.
 *    2. Outstanding debt → ledger line ("You owe Theo $X.XX") +
 *       Borrow (disabled at cap) + Repay (disabled if balance == 0).
 *    3. Just repaid in full → "we're square" follow-up. Driven by
 *       the option handler, not this builder. */
export function buildLenderDialogue(stub: DialogueState): DialogueState {
  const debt = getDebt();
  const balance = getBalance();
  const lines =
    debt > 0
      ? [
          `You owe me ${formatBalance(debt)}. Need more, or are you here to pay up?`,
        ]
      : ['Need a hand? I can spot you five at a time, up to twenty.'];
  const canPay = debt > 0 && balance > 0;
  const repayAmount = Math.min(balance, debt);
  const options: DialogueState['options'] = [
    {
      id: 'lender-borrow',
      label: `Borrow ${formatBalance(BORROW_INCREMENT_CENTS)}`,
      hint: canBorrow()
        ? `Owed after: ${formatBalance(debt + BORROW_INCREMENT_CENTS)} (cap ${formatBalance(MAX_DEBT_CENTS)})`
        : `You’re maxed out — pay some back first.`,
      disabled: !canBorrow(),
    },
    {
      id: 'lender-repay',
      label: canPay ? `Repay ${formatBalance(repayAmount)}` : 'Repay',
      hint: canPay
        ? `Pays everything you can right now.`
        : debt === 0
          ? `Nothing to repay.`
          : `You don’t have any cash on you.`,
      disabled: !canPay,
    },
    { id: 'lender-leave', label: 'Maybe later' },
  ];
  return {
    ...stub,
    lines,
    options,
  };
}

/** Compose Eli's dialogue. Two branches:
 *
 *  1. Pre-hire (intro-translator-job not yet completed) — Eli
 *     brushes the player off; the CEO has to hire them first.
 *  2. Hired — translator-offer shape, repeatable. Same flow as
 *     Saba/Pio: tap to translate, earn per correct, lose per
 *     wrong. Eli is the player's primary first-paycheck customer
 *     (3-word pack); the player can drill him as many sessions
 *     as they want until the $1.00 threshold is met.
 *
 *  Shape note: the engine would already build a generic translator
 *  offer for any NPC with `vocabularyPackId`. We override here so
 *  Eli's offer line + the option hints fit his role as the
 *  player's first customer rather than the generic "I'm struggling
 *  with these words" pitch. */
export function buildOfficeTutorDialogue(stub: DialogueState): DialogueState {
  const introDone = getQuestStatus('intro-translator-job') === 'completed';

  if (!introDone) {
    return {
      ...stub,
      lines: [
        "I'll wait for an actual translator — talk to the CEO first.",
      ],
      currentLine: 0,
    };
  }

  return {
    ...stub,
    lines: [
      "Hey, the translator! Got three words to drill — quick run?",
    ],
    currentLine: 0,
    vocabularyPackId: 'office-tutor-pack',
    vocabularyWordCount: 3,
    options: [
      {
        id: 'help',
        label: "Sure, I'll give it a shot",
        hint: 'Earn money for every word you get right. Wrong ones will cost you.',
      },
      {
        id: 'view',
        label: 'Let me look them over first (3 words)',
        hint: 'Browse the list, hear how they sound, practice freely — no money on the line.',
      },
      {
        id: 'decline',
        label: 'Sorry, not right now',
        hint: '',
      },
    ],
  };
}

/** Compose the CEO's dialogue. Multi-stage during the intro quest;
 *  collapses to status check-ins afterward.
 *
 *  Intro flow (each stage is its own DialogueState — option taps
 *  push the next stage via the option handler):
 *    Stage 1 GREETING  — CEO welcomes, player chooses to apply or
 *                        bow out. Bowing out keeps the quest active
 *                        so the player can return.
 *    Stage 2 FLUENCY   — after apply. CEO asks the question,
 *                        player picks confident / honest.
 *    Stage 3 HIRED     — multi-line wrap-up: parting line,
 *                        explanation of the job mechanics, exit.
 *                        Quest completes when we ENTER this stage
 *                        (the option handler), so the toast fires
 *                        as the wrap-up plays. Tap-through advances
 *                        the lines via handleAdvanceDialogue's
 *                        ceo-intro local-advance branch.
 *
 *  Post-intro:
 *    - first-paycheck active + lifetime < threshold → progress check-in
 *    - first-paycheck active + lifetime ≥ threshold → claim button
 *    - everything else → engine static line. */
export function buildCeoIntroDialogue(stub: DialogueState): DialogueState {
  const introStatus = getQuestStatus('intro-translator-job');
  const playerName = getPlayerName() ?? 'you';

  if (introStatus === 'active') {
    // Stage 1 — greeting. CEO doesn't know the player's name yet
    // (this is their first walk-in), so use a neutral address;
    // later stages and post-intro check-ins are name-on because
    // by then he's hired them.
    return {
      ...stub,
      dialogueKind: 'ceo-intro',
      lines: [`Welcome, stranger. What can I do for you?`],
      currentLine: 0,
      options: [
        {
          id: 'ceo-apply',
          label: 'I’m here to apply for the translator job.',
        },
        {
          id: 'ceo-decline-apply',
          label: 'Ah, nothing — nevermind.',
          hint: 'You can come back any time.',
        },
      ],
    };
  }

  const paycheckStatus = getQuestStatus('first-paycheck');
  if (paycheckStatus === 'active') {
    const earned = getLifetimeEarnings();
    if (earned >= FIRST_PAYCHECK_THRESHOLD_CENTS) {
      return {
        ...stub,
        lines: [
          `${playerName}! Word is you've cleared ${formatBalance(FIRST_PAYCHECK_THRESHOLD_CENTS)} translating. That's a real paycheck.`,
          `Here — bonus of ${formatBalance(FIRST_PAYCHECK_BONUS_CENTS)} for showing up. Don't blow it all at the Mart.`,
        ],
        options: [
          {
            id: 'ceo-paycheck-claim',
            label: `Claim ${formatBalance(FIRST_PAYCHECK_BONUS_CENTS)} bonus`,
            hint: 'You earned it.',
          },
          { id: 'ceo-paycheck-decline', label: 'Maybe later' },
        ],
      };
    }
    return {
      ...stub,
      lines: [
        `Translating going alright, ${playerName}? You're at ${formatBalance(earned)} so far.`,
        `Hit ${formatBalance(FIRST_PAYCHECK_THRESHOLD_CENTS)} earned and there's a bonus waiting for you on top of what you've already pocketed.`,
      ],
    };
  }

  // Quest done (or never started) — fall back to the engine's line.
  return stub;
}

/** Script for the intro apartment back-and-forth. Index in `lines`
 *  ↔ index in `speakers` so each tap can swap the dialogue's
 *  npcName as the speaker changes. Resolved with the player's
 *  chosen child name at trigger time. */
export const APARTMENT_DIALOGUE: ReadonlyArray<{
  speaker: 'parent' | 'child';
  text: (names: { parent: string; child: string }) => string;
}> = [
  { speaker: 'parent', text: () => 'This is our home. For now.' },
  { speaker: 'parent', text: () => "It's small. Bare. But the rent's paid for a month." },
  { speaker: 'parent', text: () => 'After that... I need money. Quickly.' },
  { speaker: 'parent', text: () => "I saw an ad in the paper — translation office on Mart Street. I'm going to apply." },
  { speaker: 'child',  text: () => "Wait — but you don't even speak the language!" },
  { speaker: 'parent', text: () => 'I know.' },
  { speaker: 'parent', text: () => "I'll fake it till I make it. Smile. Nod. They won't have to know." },
  { speaker: 'child',  text: () => '...Will it work?' },
  { speaker: 'parent', text: () => 'It has to.' },
  { speaker: 'parent', text: ({ child }) => `Stay here, ${child}. I'll come back with good news.` },
];
