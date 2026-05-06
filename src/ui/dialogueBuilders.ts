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
import { t } from '../data/i18n';

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
        t('dialogue.mim.goodLuckDad'),
      ],
    });
  }
  if (status === 'completed') {
    return withChildName({
      lines: [t('dialogue.mim.thanksForSandwich')],
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
          t('dialogue.mim.imHungry'),
        ],
      });
    }
    // Pre-prereq fallback — a friendly, non-quest-starting line so
    // an early interaction with Mim feels like a real beat instead
    // of a dead-end. Two variants based on whether the intro quest
    // has begun yet, so the line lands in context.
    return withChildName({
      lines: introStatus === 'active'
        ? [t('dialogue.mim.goodLuckDad')]
        : [t('dialogue.mim.preFirstPaycheck')],
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
        t('dialogue.mim.imHungry'),
      ],
    });
  }
  // hasItem('sandwich') is read at option-handle time, not here, so
  // the "Give" option always renders and the routing decides the
  // outcome based on inventory state at that moment. Keeps the
  // dialogue builder a pure projection of quest + flag state.
  void hasItem;
  return withChildName({
    lines: [t('dialogue.mim.didYouGet')],
    options: [
      { id: 'child-give-sandwich', label: t('dialogue.mim.giveSandwich') },
      { id: 'child-decline', label: t('dialogue.mim.notYet') },
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
          t('dialogue.theo.youOwe', { debt: formatBalance(debt) }),
        ]
      : [t('dialogue.theo.canSpot')];
  const canPay = debt > 0 && balance > 0;
  const repayAmount = Math.min(balance, debt);
  const options: DialogueState['options'] = [
    {
      id: 'lender-borrow',
      label: t('dialogue.theo.borrow', { amount: formatBalance(BORROW_INCREMENT_CENTS) }),
      hint: canBorrow()
        ? t('dialogue.theo.borrowHint', { after: formatBalance(debt + BORROW_INCREMENT_CENTS), cap: formatBalance(MAX_DEBT_CENTS) })
        : t('dialogue.theo.borrowMaxedHint'),
      disabled: !canBorrow(),
    },
    {
      id: 'lender-repay',
      label: canPay ? t('dialogue.theo.repay', { amount: formatBalance(repayAmount) }) : t('dialogue.theo.repayLabelEmpty'),
      hint: canPay
        ? t('dialogue.theo.repayHint')
        : debt === 0
          ? t('dialogue.theo.repayNothingHint')
          : t('dialogue.theo.repayBrokeHint'),
      disabled: !canPay,
    },
    { id: 'lender-leave', label: t('dialogue.theo.maybeLater') },
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
        t('dialogue.eli.preHire'),
      ],
      currentLine: 0,
    };
  }

  return {
    ...stub,
    lines: [
      t('dialogue.eli.offer'),
    ],
    currentLine: 0,
    vocabularyPackId: 'office-tutor-pack',
    vocabularyWordCount: 3,
    options: [
      {
        id: 'help',
        label: t('dialogue.offer.help'),
        hint: t('dialogue.offer.helpHint'),
      },
      {
        id: 'view',
        label: t('dialogue.offer.view', { count: 3 }),
        hint: t('dialogue.offer.viewHint'),
      },
      {
        id: 'decline',
        label: t('dialogue.offer.decline'),
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
      lines: [t('dialogue.ceo.greeting')],
      currentLine: 0,
      options: [
        {
          id: 'ceo-apply',
          label: t('dialogue.ceo.option.apply'),
        },
        {
          id: 'ceo-decline-apply',
          label: t('dialogue.ceo.option.declineApply'),
          hint: t('dialogue.ceo.option.declineApplyHint'),
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
          t('dialogue.ceo.paycheckClaimL1', { name: playerName, threshold: formatBalance(FIRST_PAYCHECK_THRESHOLD_CENTS) }),
          t('dialogue.ceo.paycheckClaimL2', { bonus: formatBalance(FIRST_PAYCHECK_BONUS_CENTS) }),
        ],
        options: [
          {
            id: 'ceo-paycheck-claim',
            label: t('dialogue.ceo.paycheckClaimOption', { bonus: formatBalance(FIRST_PAYCHECK_BONUS_CENTS) }),
            hint: t('dialogue.ceo.paycheckClaimOptionHint'),
          },
          { id: 'ceo-paycheck-decline', label: t('dialogue.ceo.paycheckMaybeLater') },
        ],
      };
    }
    return {
      ...stub,
      lines: [
        t('dialogue.ceo.paycheckCheckin1', { name: playerName, earned: formatBalance(earned) }),
        t('dialogue.ceo.paycheckCheckin2', { threshold: formatBalance(FIRST_PAYCHECK_THRESHOLD_CENTS) }),
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
  { speaker: 'parent', text: () => t('apartment.line.home') },
  { speaker: 'parent', text: () => t('apartment.line.smallButRent') },
  { speaker: 'parent', text: () => t('apartment.line.needMoney') },
  { speaker: 'parent', text: () => t('apartment.line.sawAd') },
  { speaker: 'child',  text: () => t('apartment.line.childObjection') },
  { speaker: 'parent', text: () => t('apartment.line.iKnow') },
  { speaker: 'parent', text: () => t('apartment.line.fakeIt') },
  { speaker: 'child',  text: () => t('apartment.line.willItWork') },
  { speaker: 'parent', text: () => t('apartment.line.ithasTo') },
  { speaker: 'parent', text: ({ child }) => t('apartment.line.stayHere', { child }) },
];
