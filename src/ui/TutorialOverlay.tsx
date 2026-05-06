'use client';

/**
 * Step-by-step tutorial popups for the office-tutor mock job.
 *
 * Phase-2 layer on top of the structural Phase-1 plumbing:
 * - Tutor NPC + offer dialogue + handoff to Saba (Phase 1)
 * - Contextual hints sequenced through the offer → wordlist →
 *   practice → translate flow (this file)
 *
 * Step is DERIVED from current React state + a couple of event
 * flags rather than tracked as a separate state machine. That
 * keeps the popups robust to refresh / back-navigation: if the
 * player is currently in the wordlist with the tutor pack, they
 * see the wordlist hint; if they're in the translate session,
 * they see the translate hint; if they navigate back to the
 * offer dialogue, the hint flips based on whether they've
 * already opened the wordlist (INTRO_TUTOR_WORDLIST_SEEN flag).
 *
 * The overlay renders a single non-blocking pill at top-center,
 * just below the HUD's safe-area inset. It's deliberately copy-
 * only — no DOM-anchored arrows or pulsing rings on specific
 * buttons — so future tweaks to the dialogue / wordlist UI
 * don't break the tutorial.
 */

import { useEffect, useState } from 'react';
import { DialogueState } from '../core/types';
import { hasFlag, FLAGS, subscribeFlags } from '../data/eventFlags';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface TutorialOverlayProps {
  dialogue: DialogueState | null;
  vocabularyView: { packId: string } | null;
  /** Internal sub-state of the vocabulary view, surfaced from
   *  VocabularyListView's onSubModeChange callback. Lets the
   *  overlay branch its wordlist hint between "browse"/"picker"
   *  and "actively drilling in practice mode" — the modal manages
   *  those sub-views internally so we can't infer the difference
   *  from `vocabularyView` alone. */
  vocabularySubMode: 'list' | 'practice-picker' | 'practice';
  translateView: { packId: string } | null;
}

const TUTOR_PACK_ID = 'office-tutor-pack';
const TUTOR_NPC_ID = 'office-npc-tutor';

/** Step copy keyed by id. Each step has a short headline + body
 *  so the popup reads naturally without being a wall of text. */
const STEPS: Record<string, { title: string; body: string }> = {
  'offer-pick-view': {
    title: 'Tap option 2 first',
    body: "Look the words over before you commit. No money on the line.",
  },
  'offer-pick-help': {
    title: "Now try option 1",
    body: "Run a real translation session — same flow real customers use.",
  },
  'wordlist': {
    title: 'Browse the words',
    body: 'Tap a word to hear it. When you feel ready, tap Practice to drill them with no penalty.',
  },
  'practice': {
    title: 'Practice is free',
    body: "No money, no energy. Make as many wrong guesses as you want. When you're done, tap Back to return to the offer.",
  },
  'mode-picker': {
    title: 'Pick a mode',
    body: 'Four modes are planned — only Read and Listen are built so far. Try Read first.',
  },
  'translate': {
    title: 'Translate to earn',
    body: 'Right answers earn money. Wrong ones cost a bit. Saying "I don\'t know" is a small loss too.',
  },
};

type StepId = keyof typeof STEPS;

/** Subscribe to event flag changes so the offer-dialogue popup
 *  flips between "pick option 2" and "now try option 1" the
 *  moment INTRO_TUTOR_WORDLIST_SEEN is set, without needing the
 *  parent to re-render. */
function useFlagsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeFlags(() => setTick((t) => t + 1)), []);
  return tick;
}

function deriveStep(props: TutorialOverlayProps): StepId | null {
  // Tutorial is over (or never armed) — bail.
  if (!hasFlag(FLAGS.INTRO_HIRED)) return null;
  if (hasFlag(FLAGS.INTRO_TUTOR_DONE)) return null;

  // Inside the for-money translation session with the tutor pack.
  if (props.translateView?.packId === TUTOR_PACK_ID) return 'translate';

  // Inside the wordlist with the tutor pack. Branch by the
  // internal sub-mode (surfaced via onSubModeChange) so the
  // popup adapts: 'list'/'practice-picker' get the browse +
  // practice intro; 'practice' gets the no-stakes nudge once
  // the player is actively drilling.
  if (props.vocabularyView?.packId === TUTOR_PACK_ID) {
    if (props.vocabularySubMode === 'practice') return 'practice';
    return 'wordlist';
  }

  // At the tutor's offer dialogue (Help/View/Decline) OR at the
  // mode picker (Read/Listen/Write/Speak) the player gets after
  // tapping "help". The mode picker is detectable by `mode-read`
  // appearing in the option ids — that's how the dialogue knows
  // it's a mode pick rather than the offer.
  if (props.dialogue?.npcId === TUTOR_NPC_ID && props.dialogue.options) {
    const isModePicker = props.dialogue.options.some((o) => o.id === 'mode-read');
    if (isModePicker) return 'mode-picker';
    if (hasFlag(FLAGS.INTRO_TUTOR_WORDLIST_SEEN)) return 'offer-pick-help';
    return 'offer-pick-view';
  }

  return null;
}

export default function TutorialOverlay(props: TutorialOverlayProps) {
  // useFlagsTick re-renders whenever any event flag changes, so
  // the derived step picks up INTRO_TUTOR_WORDLIST_SEEN flips
  // even when no other prop changes (e.g. player tapped option 2
  // → wordlist mounted → flag set → wordlist closes → step
  // becomes 'offer-pick-help' on the next render).
  useFlagsTick();
  const step = deriveStep(props);
  if (!step) return null;

  const { title, body } = STEPS[step];

  return (
    <div
      // Wrapper: full-width strip so the inner pill can center
      // itself responsively. pointerEvents:none lets clicks pass
      // through to whatever's underneath — the popup is purely a
      // hint, never a touch target.
      style={{
        position: 'fixed',
        top: 'calc(96px + env(safe-area-inset-top, 0px))',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 80,
        pointerEvents: 'none',
        padding: '0 16px',
      }}
      aria-live="polite"
      role="status"
    >
      <div
        style={{
          maxWidth: 360,
          background: COLORS.parchment,
          border: `2px solid ${COLORS.accentGold}`,
          borderRadius: 8,
          padding: '10px 14px',
          color: COLORS.text,
          fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui',
          boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 4px 0 0 #1a1008`,
          // Subtle pulse so a player who tabs back to the page
          // notices the popup. Keyed on the step id so changing
          // step retriggers the animation.
          animation: 'lingoMapTutorialIn 280ms ease-out',
        }}
        // The pill itself accepts pointer events so the user can
        // tap-to-acknowledge without having to thread the needle
        // around it. We don't dismiss on tap — the step changes
        // when the player progresses — but blocking the click
        // makes the affordance read as "this is for me to read,"
        // not "this is decoration."
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: COLORS.accentGoldDark,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>{body}</div>
        <style>{`
          @keyframes lingoMapTutorialIn {
            0%   { opacity: 0; transform: translateY(-6px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
