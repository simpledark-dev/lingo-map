'use client';

/**
 * Translation work session — the "for money" sibling of
 * VocabularyPracticeView.
 *
 * For v1 the only mode shipped is text→meaning (player reads the
 * target word, picks the English meaning). Other modes
 * (audio→meaning, meaning→write, meaning→speak) are tagged "Soon" in
 * the dialogue and not routed here yet. When we ship them they'll
 * each be a different `mode` prop here, sharing the round/score
 * scaffolding while swapping the prompt + answer surface.
 *
 * Mechanically this is identical to practice for now — same round
 * picker, same shuffle, same feedback hold — plus a coin balance
 * that ticks up on correct answers and ticks down on misses. We'll
 * fold in SRS, diminishing returns, and the "punishment money goes
 * to a rival" idea later; the contract for callers is just
 * `<VocabularyTranslateView pack npcName onClose />` so swapping in
 * the real economy later doesn't ripple up.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { VocabularyPack, VocabularyEntry, getExamples, getMeaning } from '../data/vocabularyPacks';
import { t } from '../data/i18n';
import {
  VocabProgress,
  loadProgress,
  saveProgress,
  pickPromptEntry,
  buildChoices,
  recordAnswer,
  recordPromptShown,
} from '../data/vocabSelection';
import {
  PENALTY_PER_WRONG,
  PENALTY_PER_IDK,
  addBalance,
  creditEarnings,
  getRewardPerCorrect,
  useWalletBalance,
  formatBalance,
  formatDelta,
} from '../data/wallet';
import { cancelDialogueSpeech } from './tts';
import { speakVocabWord } from './wordSpeak';
import { playSfx, SFX } from './sfx';
import { consumeEnergy } from '../data/energy';
import { addQuestEarnings } from '../data/questEarnings';
import { getQuestStatus } from '../data/quests';
import { useInventory } from '../data/inventory';
import { ITEMS } from '../data/items';
import { getUiTheme } from './uiThemes';
import AtlasSprite from './AtlasSprite';

interface VocabularyTranslateViewProps {
  pack: VocabularyPack;
  npcName: string;
  /** Recognition surface for this session.
   *   - 'read'   → target word shown as text + speaker (default)
   *   - 'listen' → target word HIDDEN; player has to identify by
   *                audio alone (the speak-on-mount + a tappable
   *                replay button are the only cues). The wrong-
   *                answer study panel still reveals the spelling
   *                when the player misses or admits "I don't know"
   *                — the test is about recognition under TTS, not
   *                about hiding the answer forever.
   *   - 'write'  → meaning shown; player types the target word.
   *                No speaker pre-answer (hearing the word would
   *                defeat recall), no choice grid — just an input
   *                + submit. Comparison is case-insensitive on
   *                trimmed input; everything else (energy, scoring,
   *                wrong-queue, study panel) matches the other
   *                modes. */
  mode?: 'read' | 'listen' | 'write';
  onClose: () => void;
}

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

type VisibleViewport = {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  keyboardOpen: boolean;
};

function readVisibleViewport(): VisibleViewport | null {
  if (typeof window === 'undefined') return null;
  const vv = window.visualViewport;
  if (!vv) return null;
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || vv.height;
  return {
    width: vv.width,
    height: vv.height,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
    keyboardOpen: layoutHeight - vv.height > 120,
  };
}

function useVisibleViewport(): VisibleViewport | null {
  const [viewport, setViewport] = useState<VisibleViewport | null>(() =>
    readVisibleViewport(),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    let raf = 0;
    const sync = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setViewport(readVisibleViewport());
      });
    };
    sync();
    window.visualViewport.addEventListener('resize', sync);
    window.visualViewport.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      window.cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return viewport;
}

interface Round {
  prompt: VocabularyEntry;
  choices: VocabularyEntry[];
}

/** Pick a prompt + build its 4 choices using the shared
 *  weak-word-recovery picker. The picker takes recency, mastery
 *  state, and the wrong-queue into account; we just compose its
 *  two outputs into the Round shape this view consumes. */
function buildRound(pack: VocabularyPack, progress: VocabProgress): Round {
  const prompt = pickPromptEntry(pack, progress);
  const choices = buildChoices(pack, prompt);
  return { prompt, choices };
}

/** Office tutorial chain mapping: each translate mode is owned by
 *  exactly one paycheck quest. Listen / write sessions credit
 *  positive earnings to their owning quest's per-quest counter
 *  (only if that quest is currently active), so the chain auto-
 *  completes ONLY on work done with the right NPC in the right
 *  mode. Read mode is intentionally absent — first-paycheck
 *  completes via the CEO claim flow, not via auto-tally. */
const MODE_TO_QUEST: Partial<Record<'read' | 'listen' | 'write', string>> = {
  listen: 'second-paycheck',
  write: 'third-paycheck',
};

function creditQuestEarningsIfMatched(
  mode: 'read' | 'listen' | 'write',
  cents: number,
): void {
  const questId = MODE_TO_QUEST[mode];
  if (!questId) return;
  if (getQuestStatus(questId) !== 'active') return;
  addQuestEarnings(questId, cents);
}

export default function VocabularyTranslateView({ pack, npcName, mode = 'read', onClose }: VocabularyTranslateViewProps) {
  const isListenMode = mode === 'listen';
  const isWriteMode = mode === 'write';
  const visibleViewport = useVisibleViewport();
  const keyboardOpen = isWriteMode && !!visibleViewport?.keyboardOpen;
  // Load persisted progress for this pack first; the picker reads
  // it to bias toward weak words. Initialised inside useState's
  // initializer so we only hit localStorage once per mount.
  const [progress, setProgress] = useState<VocabProgress>(() => {
    const initial = loadProgress(pack.id);
    // Even before the player answers, seed the recency buffer with
    // the first prompt so a same-pack reopen doesn't immediately
    // serve the same word again.
    return initial;
  });
  const [round, setRound] = useState<Round>(() => buildRound(pack, progress));
  // Mark the very first prompt as shown so it lands in the recency
  // buffer right away. Done in an effect rather than during state
  // init to keep init pure.
  useEffect(() => {
    setProgress((p) => {
      const next = recordPromptShown(p, round.prompt.target);
      saveProgress(pack.id, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const coins = useWalletBalance();
  /** Last-answer delta — drives the small floating "+5 / -3" badge
   *  near the coin counter so the player gets a visceral hit on each
   *  answer instead of just watching the number tick. Cleared on the
   *  next round mount. */
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  /** When the player gets a round wrong we DON'T auto-advance — they
   *  need a moment to absorb the correction. Setting this flag flips
   *  the round into a "study" state: prompt becomes tappable for the
   *  details panel, choices stay frozen, a Next button appears so the
   *  player advances at their own pace. Cleared on every round swap. */
  const [waitingOnNext, setWaitingOnNext] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  /** Write mode only — current input text. Reset between rounds. */
  const [writeInput, setWriteInput] = useState('');
  /** Write mode only — whether the locked-in answer matched. Drives
   *  the input's correct/wrong border color in the post-submit
   *  read-only state. `null` = no submission yet this round. */
  const [writeOutcome, setWriteOutcome] = useState<'correct' | 'wrong' | null>(null);
  const advanceTimerRef = useRef<number | null>(null);
  /** Lifted up from WriteForm so the Next button can focus the
   * input synchronously when the player taps it. iOS Safari only
   * raises the virtual keyboard when `.focus()` is called inside a
   * user-gesture event handler — calling it from the new round's
   * useEffect (the desktop path) silently no-ops on mobile. */
  const writeInputRef = useRef<HTMLInputElement>(null);
  /** True when the player ran out of energy. Replaces the round
   *  UI with a "go eat something" overlay; the player closes the
   *  view and uses the Bag pill to refill before coming back.
   *  Energy is consumed once per round (the very first round on
   *  mount, then once per advance). */
  const [outOfEnergy, setOutOfEnergy] = useState(false);
  /** Per-session ledger of every answered round in this view —
   *  one entry per pick / IDK. Drives the end-of-session summary
   *  (success rate + top-missed words). Reset is implicit: a new
   *  view mount starts a fresh log. */
  type RoundOutcome = 'correct' | 'wrong' | 'idk';
  const [sessionLog, setSessionLog] = useState<
    Array<{ target: string; english: string; outcome: RoundOutcome; moneyDelta: number }>
  >([]);
  /** Player tapped "End session" — flip into the summary screen
   *  instead of immediately closing so they can see how the
   *  session went before returning to the map. */
  const [sessionEnded, setSessionEnded] = useState(false);
  /** Brief exit animation before mounting the summary. Without this
   *  the work panel swaps to the summary in one frame, which makes
   *  End feel abrupt. */
  const [endingToSummary, setEndingToSummary] = useState(false);
  const endSummaryTimerRef = useRef<number | null>(null);
  /** Energy is charged ONCE per session. Opening the view costs 1
   *  energy regardless of how many rounds the player drills, so a
   *  session is the unit of work and the player can chain rounds
   *  freely once they've paid the entry fee. Mount effect rather
   *  than a useState initializer so the side-effect doesn't hide
   *  inside React-internal init flow. If the player doesn't have
   *  any energy, flip the overlay immediately and the round UI
   *  never gets a chance to render. */
  const initialEnergyConsumedRef = useRef(false);
  useEffect(() => {
    if (initialEnergyConsumedRef.current) return;
    initialEnergyConsumedRef.current = true;
    if (!consumeEnergy(1)) {
      setOutOfEnergy(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Auto-speak the prompt ONLY in listen mode — the audio is the
    // prompt itself there. In read mode the word is on screen and
    // the speaker button is opt-in; auto-speaking competes with
    // the perfect.mp3 chime for the iOS audio session and we'd see
    // either the TTS or the chime randomly dropped. Cleanest fix:
    // don't kick TTS automatically when the player can just read.
    //
    // Depend on the `round` object reference (not `round.prompt.target`)
    // so back-to-back rounds with the same target still re-fire the
    // auto-speak. Using the target string as the dep meant two milto
    // rounds in a row produced a silent second one.
    if (!isListenMode) return;
    speakVocabWord(pack, round.prompt.target);
    return cancelDialogueSpeech;
  }, [pack, round, isListenMode]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
      if (endSummaryTimerRef.current !== null) {
        window.clearTimeout(endSummaryTimerRef.current);
      }
    };
  }, []);

  const handleEndSession = useCallback(() => {
    if (endingToSummary || sessionEnded) return;
    cancelDialogueSpeech();
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setEndingToSummary(true);
    endSummaryTimerRef.current = window.setTimeout(() => {
      endSummaryTimerRef.current = null;
      setSessionEnded(true);
    }, 180);
  }, [endingToSummary, sessionEnded]);

  const advanceToNextRound = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    // Energy is charged ONCE on session entry (see the mount
    // effect that calls `consumeEnergy(1)`). Per-round advances
    // are free — a session is the unit of work, not the round.
    // The player can drill as many words as they like once the
    // session has started, and "out of energy" is only ever a
    // mount-time gate.
    setProgress((p) => {
      // Seed the next prompt's recency BEFORE picking so the picker
      // doesn't reuse it as one of the random choices that gets back
      // into rotation.
      const nextRound = buildRound(pack, p);
      const stamped = recordPromptShown(p, nextRound.prompt.target);
      saveProgress(pack.id, stamped);
      setRound(nextRound);
      return stamped;
    });
    setSelectedTarget(null);
    setLastDelta(null);
    setWaitingOnNext(false);
    setShowDetails(false);
    setWriteInput('');
    setWriteOutcome(null);
  }, [pack]);

  useEffect(() => {
    if (!waitingOnNext) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      advanceToNextRound();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [waitingOnNext, advanceToNextRound]);

  /** Write mode submit. Trim + lowercase comparison so a typo on
   *  capitalisation isn't punished — Lingo is plain ASCII and the
   *  test is recall-of-spelling, not casing pedantry. We mirror
   *  the score / wallet / wrong-queue side of `handlePick` rather
   *  than re-routing through it because the per-round state
   *  (selectedTarget) is shaped around choice clicks; the input
   *  is its own affordance. */
  const handleWriteSubmit = useCallback(
    (raw: string) => {
      if (waitingOnNext || writeOutcome !== null) return;
      const guess = raw.trim().toLowerCase();
      if (!guess) return; // empty submit — ignore
      const isCorrect = guess === round.prompt.target.toLowerCase();
      const delta = isCorrect ? getRewardPerCorrect() : -PENALTY_PER_WRONG;
      // Positive reward routes through `creditEarnings` so it
      // counts toward the lifetime-earned milestone (first-paycheck
      // quest etc.); penalties stay as plain balance changes —
      // losing money doesn't un-earn what you already made.
      if (isCorrect) {
        creditEarnings(delta);
        // ALSO credit the office-tutorial chain's per-quest counter
        // when this session belongs to one of those quests. Listen
        // sessions count toward second-paycheck; write toward third.
        // Read does not auto-tally — first-paycheck completes at
        // the CEO claim flow.
        creditQuestEarningsIfMatched(mode, delta);
      } else addBalance(delta);
      setLastDelta(delta);
      setWriteOutcome(isCorrect ? 'correct' : 'wrong');
      setProgress((p) => {
        const updated = recordAnswer(p, round.prompt.target, isCorrect);
        saveProgress(pack.id, updated);
        return updated;
      });
      if (isCorrect) {
        playSfx(SFX.CORRECT);
      } else {
        // Auto-expand the study panel on a wrong recall so the
        // player sees the correct spelling next to what they wrote.
        // (Recall mode benefits more from instant correction than
        // the recognition modes — there's no "see the right answer
        // highlighted in the choice grid" alternative.)
        setShowDetails(true);
      }
      setSessionLog((log) => [
        ...log,
        {
          target: round.prompt.target,
          english: round.prompt.english,
          outcome: isCorrect ? 'correct' : 'wrong',
          moneyDelta: delta,
        },
      ]);
      setWaitingOnNext(true);
    },
    [pack, round.prompt.target, round.prompt.english, waitingOnNext, writeOutcome],
  );

  const handlePick = useCallback(
    (chosen: VocabularyEntry) => {
      if (selectedTarget !== null || waitingOnNext) return;
      setSelectedTarget(chosen.target);
      const isCorrect = chosen.target === round.prompt.target;
      const delta = isCorrect ? getRewardPerCorrect() : -PENALTY_PER_WRONG;
      if (isCorrect) {
        creditEarnings(delta);
        creditQuestEarningsIfMatched(mode, delta);
      } else addBalance(delta);
      setLastDelta(delta);
      // Update the per-word memory state — this is what feeds the
      // wrong-queue + recency-aware picker on the next round.
      setProgress((p) => {
        const updated = recordAnswer(p, round.prompt.target, isCorrect);
        saveProgress(pack.id, updated);
        return updated;
      });
      // Both correct and wrong pause for the player. Chime fires on
      // correct, green/red flash either way. Player can tap the
      // prompt (the word in read mode, the dots in listen mode) to
      // expand meaning + examples; Next button advances when ready.
      // We deliberately DON'T auto-expand details on listen mode —
      // the player chose right (or wants to inspect their wrong
      // answer first); the choice list stays visible so they can
      // see the green ✓ exactly the way read mode does. The IDK
      // path is the only one that auto-expands.
      if (isCorrect) {
        playSfx(SFX.CORRECT);
      }
      setSessionLog((log) => [
        ...log,
        {
          target: round.prompt.target,
          english: round.prompt.english,
          outcome: isCorrect ? 'correct' : 'wrong',
          moneyDelta: delta,
        },
      ]);
      setWaitingOnNext(true);
    },
    [pack, round.prompt.target, round.prompt.english, selectedTarget, waitingOnNext],
  );

  /** Player admits they don't know the word — better than letting
   *  them random-guess into the wrong-queue. The progress side
   *  treats this exactly like a wrong answer (word goes to the
   *  queue, streak resets, comes back more often) because the
   *  recovery loop wants to drill the unknown words. The economy
   *  side bites a little (-PENALTY_PER_IDK) so honesty isn't
   *  free, but markedly less than a wrong guess so it's still the
   *  rational choice when the player has no idea. The study panel
   *  auto-expands — they asked for help, they get help. */
  const handleIDontKnow = useCallback(() => {
    if (selectedTarget !== null || waitingOnNext) return;
    const delta = -PENALTY_PER_IDK;
    setProgress((p) => {
      const updated = recordAnswer(p, round.prompt.target, false);
      saveProgress(pack.id, updated);
      return updated;
    });
    addBalance(delta);
    setLastDelta(delta);
    setSessionLog((log) => [
      ...log,
      {
        target: round.prompt.target,
        english: round.prompt.english,
        outcome: 'idk',
        moneyDelta: delta,
      },
    ]);
    setWaitingOnNext(true);
    setShowDetails(true);
  }, [pack, round.prompt.target, round.prompt.english, selectedTarget, waitingOnNext]);

  const handleSpeak = useCallback(() => {
    cancelDialogueSpeech();
    speakVocabWord(pack, round.prompt.target);
  }, [pack, round.prompt.target]);

  // The prompt word is tappable to peek at details ONLY after an
  // answer has been picked. Before that, tapping it during the
  // active question would be a free hint, which defeats the test.
  const promptIsTappable = waitingOnNext;
  const examples = getExamples(round.prompt);

  // Session-end short-circuit: tally up the per-round log and
  // render a summary card. Buckets by target so the missed-words
  // list reflects how many times each word bit the player, not
  // how many total wrongs there were. Sorted by miss count desc,
  // capped at 5 so the panel stays compact on mobile.
  if (sessionEnded) {
    const total = sessionLog.length;
    const correct = sessionLog.filter((r) => r.outcome === 'correct').length;
    const wrong = sessionLog.filter((r) => r.outcome === 'wrong').length;
    const idk = sessionLog.filter((r) => r.outcome === 'idk').length;
    const successRate = total === 0 ? 0 : Math.round((correct / total) * 100);
    // Per-session net wallet delta — derived from the logged round
    // deltas rather than a snapshot diff so custom dev rewards and
    // mid-session borrows/repays/shop purchases don't pollute the
    // "earned this session" number.
    const sessionNet = sessionLog.reduce((sum, r) => sum + r.moneyDelta, 0);
    const sessionEarned = sessionLog.reduce((sum, r) => r.moneyDelta > 0 ? sum + r.moneyDelta : sum, 0);
    const sessionLost = -sessionLog.reduce((sum, r) => r.moneyDelta < 0 ? sum + r.moneyDelta : sum, 0);
    const missesByTarget = new Map<string, { english: string; count: number }>();
    for (const r of sessionLog) {
      if (r.outcome === 'correct') continue;
      const prev = missesByTarget.get(r.target);
      if (prev) prev.count += 1;
      else missesByTarget.set(r.target, { english: r.english, count: 1 });
    }
    const topMissed = Array.from(missesByTarget.entries())
      .map(([target, v]) => ({ target, english: v.english, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
          <div
            className="vt-summary-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...UI_THEME.modal.panelStyle,
              padding: 18,
              width: '100%',
              maxWidth: 380,
              maxHeight: 'calc(100dvh - 32px)',
              gap: 14,
              boxSizing: 'border-box',
              minHeight: 0,
              animation: 'lingoMapTranslateSummaryIn 240ms ease-out',
            }}
          >
          <div className="vt-summary-header" style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: COLORS.hintText, fontWeight: 700 }}>
              {t('translate.summary.title')}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {npcName}
            </div>
          </div>

          {total === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.hintText, textAlign: 'center', padding: '12px 4px', fontStyle: 'italic' }}>
              {t('translate.summary.noRoundsAnswered')}
            </div>
          ) : (
            <>
              {/* Big rate + tally row */}
              <div className="vt-summary-stats" style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div
                    className="vt-summary-rate"
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      lineHeight: 1,
                      color: successRate >= 80 ? COLORS.correct : successRate >= 50 ? COLORS.accentGoldDark : COLORS.wrong,
                    }}
                  >
                    {successRate}%
                  </div>
                  <div className="vt-summary-rate-label" style={{ fontSize: 10, color: COLORS.hintText, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('translate.summary.successLabel')}
                  </div>
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: COLORS.cardBorder, opacity: 0.4 }} />
                <div className="vt-summary-tallies" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
                  <div><span style={{ color: COLORS.correct, fontWeight: 700 }}>✓</span> {t('translate.summary.correctRow', { count: correct })}</div>
                  <div><span style={{ color: COLORS.wrong, fontWeight: 700 }}>✕</span> {t('translate.summary.wrongRow', { count: wrong })}</div>
                  {idk > 0 && (
                    <div><span style={{ fontWeight: 700 }}>🤷</span> {t('translate.summary.skippedRow', { count: idk })}</div>
                  )}
                  <div style={{ color: COLORS.hintText, marginTop: 2 }}>{t('translate.summary.totalRow', { count: total })}</div>
                </div>
              </div>

              {/* Money summary — earned vs lost vs net for the
                  session. Computed from the round log + wallet
                  constants so mid-session borrows / shop purchases
                  don't bleed into "what you actually made working." */}
              <div
                className="vt-summary-money"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: COLORS.parchmentLight,
                  border: `2px solid ${COLORS.cardBorder}`,
                  borderRadius: 4,
                  padding: '8px 12px',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <div>
                    <span style={{ color: COLORS.correct, fontWeight: 700 }}>+{formatBalance(sessionEarned)}</span>
                    <span style={{ color: COLORS.hintText, marginLeft: 6 }}>{t('translate.summary.earnedLabel')}</span>
                  </div>
                  {sessionLost > 0 && (
                    <div>
                      <span style={{ color: COLORS.wrong, fontWeight: 700 }}>-{formatBalance(sessionLost)}</span>
                      <span style={{ color: COLORS.hintText, marginLeft: 6 }}>{t('translate.summary.lostLabel')}</span>
                    </div>
                  )}
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: COLORS.cardBorder, opacity: 0.4 }} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: COLORS.hintText, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('translate.summary.netLabel')}
                  </div>
                  <div
                    className="vt-summary-net-value"
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: sessionNet > 0 ? COLORS.correct : sessionNet < 0 ? COLORS.wrong : COLORS.text,
                    }}
                  >
                    {formatDelta(sessionNet)}
                  </div>
                </div>
              </div>

              {topMissed.length > 0 && (
                <div className="vt-summary-review" style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, flex: '1 1 auto' }}>
                  <div className="vt-summary-review-title" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: COLORS.wrong, fontWeight: 700, flexShrink: 0 }}>
                    {t('translate.summary.wordsToReview')}
                  </div>
                  <div className="vt-summary-review-list" style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', minHeight: 0 }}>
                    {topMissed.map((m) => (
                      <div
                        key={m.target}
                        className="vt-summary-review-item"
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 8,
                          background: COLORS.cardRest,
                          border: `2px solid ${COLORS.cardBorder}`,
                          borderRadius: 4,
                          padding: '6px 10px',
                          fontSize: 13,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: COLORS.text }}>{m.target}</span>
                        <span style={{ color: COLORS.hintText, fontSize: 11 }}>— {m.english}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: COLORS.wrong }}>
                          ×{m.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topMissed.length === 0 && (
                <div style={{ fontSize: 12, color: COLORS.correct, textAlign: 'center', fontStyle: 'italic' }}>
                  {t('translate.summary.cleanSession')}
                </div>
              )}
            </>
          )}

          <button
            className="vt-summary-close"
            onClick={onClose}
            style={{
              background: COLORS.accentGold,
              color: '#fdf6e0',
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 4,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {t('translate.summary.close')}
          </button>
        </div>
        <style>{`
          @keyframes lingoMapTranslateSummaryIn {
            0%   { opacity: 0; transform: translateY(10px) scale(0.96); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @media (max-height: 540px) {
            .vt-summary-panel {
              padding: 10px 14px 12px !important;
              gap: 8px !important;
              max-height: calc(100dvh - 18px) !important;
            }
            .vt-summary-header > div:first-child { font-size: 9px !important; }
            .vt-summary-header > div:last-child { font-size: 14px !important; margin-top: 0 !important; }
            .vt-summary-stats { gap: 10px !important; }
            .vt-summary-rate { font-size: 26px !important; }
            .vt-summary-rate-label { font-size: 9px !important; margin-top: 2px !important; }
            .vt-summary-tallies { font-size: 11px !important; gap: 1px !important; }
            .vt-summary-money {
              padding: 6px 10px !important;
              font-size: 11px !important;
              gap: 10px !important;
            }
            .vt-summary-net-value { font-size: 16px !important; }
            .vt-summary-review { gap: 4px !important; }
            .vt-summary-review-title { font-size: 9px !important; }
            .vt-summary-review-list { max-height: 56px; }
            .vt-summary-review-item {
              padding: 5px 8px !important;
              font-size: 12px !important;
            }
            .vt-summary-close { padding: 7px 14px !important; }
          }
          @media (max-height: 390px) {
            .vt-summary-panel {
              padding: 8px 12px 10px !important;
              gap: 6px !important;
            }
            .vt-summary-money { padding: 5px 8px !important; }
            .vt-summary-review-list { max-height: 44px; }
          }
        `}</style>
      </div>
    );
  }

  // Out-of-energy short-circuit. Three guidance branches based on
  // what the player can do RIGHT NOW:
  //   1. Has edible food in the bag → just eat it.
  //   2. Has enough cash to buy the cheapest food → head to the Mart.
  //   3. Broke → borrow from Theo first (shows Theo's portrait
  //      so a player who hasn't met him knows who to look for).
  // Branch logic is intentionally pessimistic: even if the player
  // ALSO has food in the bag, we surface that path first — eating
  // is one tap, walking to the Mart is many.
  if (outOfEnergy) {
    return <OutOfEnergyPanel npcName={npcName} onClose={onClose} />;
  }

  const translateOverlayStyle = keyboardOpen && visibleViewport
    ? {
        position: 'fixed' as const,
        left: visibleViewport.offsetLeft,
        top: visibleViewport.offsetTop,
        width: visibleViewport.width,
        height: visibleViewport.height,
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 10,
        overflowY: 'auto' as const,
        WebkitOverflowScrolling: 'touch' as const,
      }
    : {
        position: 'absolute' as const,
        inset: 0,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      };
  const translatePanelMaxHeight =
    keyboardOpen && visibleViewport
      ? `${Math.max(220, Math.floor(visibleViewport.height) - 20)}px`
      : '90vh';
  const nextButtonLabel =
    selectedTarget !== null && selectedTarget === round.prompt.target
      ? t('translate.next.correct')
      : writeOutcome === 'correct'
        ? t('translate.next.correct')
        : t('translate.next.studied');
  const handleNextRoundClick = () => {
    // iOS: must call .focus() synchronously inside a user-gesture
    // event handler for the keyboard to open. The input is readOnly
    // while the answered round is locked; iOS will focus a readOnly
    // input without opening the keyboard, so clear that DOM flag
    // first. React re-applies the correct non-readOnly state when
    // advanceToNextRound renders the next prompt.
    if (isWriteMode) {
      const input = writeInputRef.current;
      if (input) {
        input.readOnly = false;
        input.focus();
        input.select();
        input.scrollIntoView({ block: 'center', inline: 'nearest' });
        window.setTimeout(() => {
          input.scrollIntoView({ block: 'center', inline: 'nearest' });
        }, 260);
      }
    }
    advanceToNextRound();
  };

  return (
    <div
      style={{
        ...translateOverlayStyle,
        zIndex: 60,
        display: 'flex',
        background: 'rgba(0,0,0,0.5)',
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...UI_THEME.modal.panelStyle,
          width: '100%',
          maxWidth: 480,
          maxHeight: translatePanelMaxHeight,
          minHeight: 0,
          boxSizing: 'border-box',
          pointerEvents: endingToSummary ? 'none' : 'auto',
          animation: endingToSummary
            ? 'lingoMapTranslatePanelOut 180ms ease-in forwards'
            : 'lingoMapTranslatePanelIn 180ms ease-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Header — translator title plus the live coin pouch. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `2px solid ${COLORS.cardBorder}`,
              background: COLORS.parchmentLight,
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div>
              <div
                style={{
                  color: COLORS.accentGoldDark,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                {t('translate.headerFor', { name: npcName })}
              </div>
              <div style={{ color: COLORS.text, fontSize: 11, opacity: 0.8 }}>
                {isWriteMode
                  ? t('translate.modeHint.write')
                  : isListenMode
                    ? t('translate.modeHint.listen')
                    : t('translate.modeHint.read')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Coin pouch */}
              <div
                style={{
                  position: 'relative',
                  background: COLORS.cardRest,
                  border: `2px solid ${COLORS.coinGoldDark}`,
                  borderRadius: 6,
                  boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}`,
                  padding: '6px 10px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLORS.text,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ color: COLORS.coinGold }}>●</span>
                <span>{formatBalance(coins)}</span>
              </div>
              <PixelButton onClick={handleEndSession} small tone="danger">
                {t('translate.endButton')}
              </PixelButton>
            </div>
          </div>

          {/* Body. NOT scrollable by design — layout adapts to the
              viewport via media queries below so everything fits in
              landscape. Compact rules collapse the prompt onto one
              line ("What does this mean? grano 🔊") and lay choices
              in a 2-column grid. When the wrong-answer study panel
              opens, it REPLACES the choices block (not adds to it)
              so the meaning never sits below the fold. */}
          <div
            className="vt-body"
            style={{
              padding: '20px 16px',
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              boxSizing: 'border-box',
            }}
          >
            {/* Big money feedback — intentionally lives in the work
                area, not beside the wallet pill, so the player sees
                the earn/loss moment while answering. */}
            {lastDelta !== null ? (
              <div className="vt-money-feedback-layer" aria-live="polite">
                <div
                  key={lastDelta + ':' + round.prompt.target}
                  className="vt-money-feedback"
                  style={{
                    color: lastDelta > 0 ? COLORS.correct : COLORS.wrong,
                    background: lastDelta > 0 ? COLORS.correctBg : COLORS.wrongBg,
                    border: `3px solid ${lastDelta > 0 ? COLORS.correct : COLORS.wrong}`,
                    boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 4px 0 0 ${COLORS.cardBorder}`,
                  }}
                >
                  {formatDelta(lastDelta)}
                </div>
              </div>
            ) : null}

            <div
              key={round.prompt.target}
              className="vt-prompt-section"
              style={{
                animation: 'lingoMapTranslateFadeIn 280ms ease-out',
                textAlign: 'center',
                marginBottom: 18,
              }}
            >
              <div
                className="vt-prompt-label"
                style={{
                  color: COLORS.hintText,
                  fontSize: 11,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                {isWriteMode
                  ? t('translate.prompt.writeQuestion')
                  : isListenMode
                    ? t('translate.prompt.listenQuestion')
                    : t('translate.prompt.read')}
              </div>
              {/* Prompt area. In `read` mode we render the target word
                  as text with the speaker button beside it. In `listen`
                  mode we hide the spelling entirely — the player has
                  to identify the word from audio alone. The wrong-
                  answer study panel still reveals the spelling later
                  so the test is "can you recognise this when spoken",
                  not "guess a word the game is hiding forever". */}
              <div
                className="vt-prompt-word-row"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {isWriteMode ? (
                  // Write mode: the prompt IS the english meaning.
                  // No speaker — hearing the target before typing
                  // would defeat the recall test (it'd let the
                  // player just transcribe the audio). The post-
                  // submit study panel reveals + speaks the word.
                  <span
                    className="vt-word vt-write-prompt"
                    style={{
                      color: COLORS.text,
                      fontSize: 26,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      lineHeight: 1.2,
                      textShadow: `1px 1px 0 ${COLORS.parchmentShadow}`,
                      paddingBottom: 2,
                    }}
                  >
                    {getMeaning(round.prompt)}
                  </span>
                ) : isListenMode ? (
                  // Listen mode: a chunky waveform-glyph placeholder
                  // keeps the prompt visually anchored where the word
                  // would normally be. Tappable AFTER an answer (same
                  // affordance as the word in read mode) so the
                  // player can pull up meaning + examples.
                  <span
                    className="vt-word"
                    onClick={promptIsTappable ? () => setShowDetails((d) => !d) : undefined}
                    style={{
                      color: showDetails ? COLORS.accentGoldDark : COLORS.accentGoldDark,
                      fontSize: 30,
                      letterSpacing: 6,
                      lineHeight: 1.1,
                      paddingBottom: 2,
                      cursor: promptIsTappable ? 'pointer' : 'default',
                      borderBottom: promptIsTappable
                        ? `2px dashed ${showDetails ? COLORS.accentGoldDark : COLORS.hintText}`
                        : '2px dashed transparent',
                      transition: 'border-color 180ms',
                      display: 'inline-block',
                    }}
                    title={promptIsTappable ? (showDetails ? t('translate.studyHide') : t('translate.studyTap')) : undefined}
                  >
                    ◌◌◌
                  </span>
                ) : (
                  <span
                    className="vt-word"
                    onClick={promptIsTappable ? () => setShowDetails((d) => !d) : undefined}
                    style={{
                      color: COLORS.text,
                      fontSize: 32,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      lineHeight: 1.1,
                      textShadow: `1px 1px 0 ${COLORS.parchmentShadow}`,
                      cursor: promptIsTappable ? 'pointer' : 'default',
                      borderBottom: promptIsTappable
                        ? `2px dashed ${showDetails ? COLORS.accentGoldDark : COLORS.hintText}`
                        : '2px dashed transparent',
                      paddingBottom: 2,
                      transition: 'border-color 180ms',
                    }}
                    title={promptIsTappable ? (showDetails ? t('translate.studyHide') : t('translate.studyTap')) : undefined}
                  >
                    {round.prompt.target}
                  </span>
                )}
                {/* Hide the speaker pre-answer in write mode —
                    hearing the word would let the player just
                    transcribe the audio. The study panel re-shows
                    a hear-it button after the answer is locked. */}
                {!(isWriteMode && !waitingOnNext) && (
                  <button
                    type="button"
                    className="vt-speaker"
                    aria-label={t('translate.pronounceAria', { word: round.prompt.target })}
                    onClick={handleSpeak}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: isListenMode ? 15 : 13,
                      fontWeight: isListenMode ? 700 : 400,
                      background: COLORS.speakerBg,
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderRadius: 6,
                      boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                      padding: isListenMode ? '8px 16px' : '4px 10px',
                      cursor: 'pointer',
                      color: COLORS.text,
                    }}
                  >
                    🔊 {isListenMode ? t('translate.hearAgain') : t('translate.hearIt')}
                  </button>
                )}
              </div>
            </div>

            {/* Write mode replaces the 4-choice grid with a typed-
                input form. Submitted text is compared case-
                insensitively against the target. Outcome (correct/
                wrong) drives the input border color + the read-only
                lock; the wider study/details panel below still
                opens on wrong (or via tap on the prompt) just like
                the recognition modes. */}
            {isWriteMode ? (
              <WriteForm
                target={round.prompt.target}
                value={writeInput}
                onChange={setWriteInput}
                onSubmit={() => handleWriteSubmit(writeInput)}
                outcome={writeOutcome}
                disabled={writeOutcome !== null || waitingOnNext}
                inputRef={writeInputRef}
              />
            ) : !showDetails ? (
            <div
              className="vt-choices"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              {round.choices.map((choice) => {
                const isSelected = selectedTarget === choice.target;
                const isCorrectChoice = choice.target === round.prompt.target;
                const showAsCorrect = selectedTarget !== null && isCorrectChoice;
                const showAsWrong = isSelected && !isCorrectChoice;
                return (
                  <button
                    key={choice.target}
                    type="button"
                    disabled={selectedTarget !== null}
                    onClick={() => handlePick(choice)}
                    style={{
                      textAlign: 'center',
                      padding: '14px 10px',
                      background: showAsCorrect
                        ? '#3a8a3a'
                        : showAsWrong
                          ? '#a83b3b'
                          : COLORS.cardRest,
                      border: `2px solid ${
                        showAsCorrect ? '#1f5a1f' : showAsWrong ? '#5d1f1f' : COLORS.cardBorder
                      }`,
                      borderRadius: 8,
                      boxShadow:
                        selectedTarget === null
                          ? `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`
                          : 'none',
                      cursor: selectedTarget !== null ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      color: showAsCorrect || showAsWrong ? '#fdf6e0' : COLORS.text,
                      fontSize: 15,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      minHeight: 48,
                      transition: 'background 160ms, border-color 160ms',
                      animation: showAsWrong ? 'lingoMapTranslateShake 280ms ease-in-out' : undefined,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{getMeaning(choice)}</span>
                    {showAsCorrect ? <span style={{ fontSize: 15 }}>✓</span> : null}
                    {showAsWrong ? <span style={{ fontSize: 15 }}>✗</span> : null}
                  </button>
                );
              })}
            </div>
            ) : null}

            {/* "I don't know" — bail option. Lower penalty than a
                wrong guess so honest players aren't pushed toward
                random clicking. Only visible during the active
                question; hidden once an answer is locked or the
                round is in study mode. */}
            {!waitingOnNext && selectedTarget === null ? (
              <button
                type="button"
                onClick={handleIDontKnow}
                style={{
                  marginTop: 12,
                  width: '100%',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  background: 'transparent',
                  border: `1px dashed ${COLORS.cardBorder}`,
                  borderRadius: 6,
                  color: COLORS.hintText,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  letterSpacing: 0.3,
                  transition: 'background 120ms, color 120ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.parchmentLight;
                  e.currentTarget.style.color = COLORS.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = COLORS.hintText;
                }}
              >
                {t('translate.idkAction')}
              </button>
            ) : null}

            {/* Wrong-answer study panel. Two states:
                  – wrong + details collapsed: pulsing hint
                  – wrong + details expanded: meaning + examples
                    (replaces the choices block above so the panel
                    sits in the same vertical slot, no scrolling).
                Both show the Next button at the bottom. */}
            {waitingOnNext ? (
              <div style={{ marginTop: showDetails ? 0 : 14 }}>
                {!showDetails ? (
                  <div
                    style={{
                      textAlign: 'center',
                      color: COLORS.hintText,
                      fontSize: 11,
                      letterSpacing: 0.5,
                      marginBottom: 12,
                      animation: 'lingoMapTranslateHintPulse 1.6s ease-in-out infinite',
                    }}
                  >
                    💡 Tap the word above to see what it means.
                  </div>
                ) : (
                  <div
                    className="vt-details"
                    style={{
                      background: COLORS.parchmentLight,
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderRadius: 8,
                      boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                      padding: '10px 12px',
                      marginBottom: 12,
                      animation: 'lingoMapTranslateFadeIn 220ms ease-out',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                        marginBottom: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ color: COLORS.text, fontSize: 16, fontWeight: 700 }}>
                        {round.prompt.target}
                      </span>
                      <span style={{ color: COLORS.hintText, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {round.prompt.pos}
                      </span>
                      <span
                        style={{
                          color: COLORS.text,
                          fontSize: 14,
                          // Palpitate the meaning when the panel reveals so
                          // the player's eye is pulled to it rather than to
                          // the target word or POS tag (which they already
                          // saw). `display: inline-block` is required for
                          // transforms to apply to an inline span; the
                          // heartbeat runs once on mount via the panel's
                          // own fade-in re-mount.
                          display: 'inline-block',
                          transformOrigin: 'left center',
                          animation: 'lingoMapTranslateMeaningPalpitate 1100ms ease-out',
                        }}
                      >
                        — {getMeaning(round.prompt)}
                      </span>
                    </div>
                    <div style={{ borderTop: `1px dashed ${COLORS.cardBorder}`, paddingTop: 8 }}>
                      <div
                        style={{
                          color: COLORS.accentGoldDark,
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 4,
                          fontWeight: 700,
                        }}
                      >
                        {t('common.examples')}
                      </div>
                      {examples.map((sentence, i) => (
                        <div
                          key={i}
                          style={{
                            color: COLORS.text,
                            fontSize: 12,
                            lineHeight: 1.4,
                            marginBottom: i === 0 ? 4 : 0,
                          }}
                        >
                          <span style={{ color: COLORS.accentGoldDark, marginRight: 4 }}>·</span>
                          {renderHighlighted(sentence, round.prompt.target)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    // iOS: must call .focus() synchronously inside a
                    // user-gesture event handler for the keyboard to
                    // open. Doing it here (instead of relying on the
                    // useEffect that fires after re-render) makes
                    // the keyboard pop up immediately for the next
                    // word in write mode. The input is readOnly
                    // while the answered round is locked; iOS will
                    // focus a readOnly input without opening the
                    // keyboard, so clear that DOM flag first. React
                    // re-applies the correct non-readOnly state when
                    // advanceToNextRound renders the next prompt.
                    if (isWriteMode) {
                      const input = writeInputRef.current;
                      if (input) {
                        input.readOnly = false;
                        input.focus();
                        input.select();
                        input.scrollIntoView({ block: 'center', inline: 'nearest' });
                        window.setTimeout(() => {
                          input.scrollIntoView({ block: 'center', inline: 'nearest' });
                        }, 260);
                      }
                    }
                    advanceToNextRound();
                  }}
                  style={{
                    display: 'none',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#fff5d6',
                    background: COLORS.accentGold,
                    border: `2px solid ${COLORS.accentGoldDark}`,
                    borderRadius: 8,
                    boxShadow: `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    width: '100%',
                    letterSpacing: 0.5,
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(2px)';
                    e.currentTarget.style.boxShadow = 'inset 1px 1px 0 0 #ffd47a';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`;
                  }}
                >
                  {selectedTarget !== null && selectedTarget === round.prompt.target
                    ? t('translate.next.correct')
                    : t('translate.next.studied')}
                </button>
              </div>
            ) : null}
          </div>
          {waitingOnNext ? (
            <div
              className="vt-next-footer"
              style={{
                flexShrink: 0,
                padding: '10px 16px 14px',
                background: COLORS.parchment,
                borderTop: `2px solid ${COLORS.cardBorder}`,
                boxShadow: `0 -6px 10px ${COLORS.parchment}`,
              }}
            >
              <button
                type="button"
                onClick={handleNextRoundClick}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff5d6',
                  background: COLORS.accentGold,
                  border: `2px solid ${COLORS.accentGoldDark}`,
                  borderRadius: 8,
                  boxShadow: `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  width: '100%',
                  letterSpacing: 0.5,
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'translateY(2px)';
                  e.currentTarget.style.boxShadow = 'inset 1px 1px 0 0 #ffd47a';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`;
                }}
              >
                {nextButtonLabel}
              </button>
            </div>
          ) : null}
        </div>

        <style>{`
          @keyframes lingoMapTranslateFadeIn {
            0%   { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes lingoMapTranslatePanelIn {
            0%   { opacity: 0; transform: translateY(8px) scale(0.98); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes lingoMapTranslatePanelOut {
            0%   { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(-8px) scale(0.98); }
          }
          @keyframes lingoMapTranslateShake {
            0%, 100% { transform: translateX(0); }
            20%      { transform: translateX(-4px); }
            40%      { transform: translateX(4px); }
            60%      { transform: translateX(-2px); }
            80%      { transform: translateX(2px); }
          }
          @keyframes lingoMapTranslateDeltaFloat {
            0%   { opacity: 0; transform: translateY(10px) scale(0.82); }
            14%  { opacity: 1; transform: translateY(0) scale(1.16); }
            30%  { opacity: 1; transform: translateY(0) scale(1); }
            74%  { opacity: 1; transform: translateY(-6px) scale(1); }
            100% { opacity: 0; transform: translateY(-34px) scale(1.08); }
          }
          @keyframes lingoMapTranslateHintPulse {
            0%, 100% { opacity: 0.55; }
            50%       { opacity: 1; }
          }
          /* Heartbeat-style emphasis on the revealed meaning. Two
             quick beats then settle, so the player's eye lands on
             the meaning rather than scanning the whole panel. Runs
             once per show — not infinite — because sustained pulse
             on persistent UI is more distracting than helpful. */
          @keyframes lingoMapTranslateMeaningPalpitate {
            0%   { transform: scale(1); }
            15%  { transform: scale(1.18); }
            30%  { transform: scale(1); }
            45%  { transform: scale(1.12); }
            60%  { transform: scale(1); }
            100% { transform: scale(1); }
          }
          .vt-money-feedback-layer {
            position: absolute;
            top: 92px;
            left: 0;
            right: 0;
            z-index: 4;
            display: flex;
            justify-content: center;
            pointer-events: none;
          }
          .vt-money-feedback {
            min-width: 92px;
            padding: 8px 18px;
            border-radius: 6px;
            text-align: center;
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 0;
            line-height: 1;
            animation: lingoMapTranslateDeltaFloat 1450ms ease-out forwards;
            image-rendering: pixelated;
            text-shadow: 1px 1px 0 rgba(255,255,255,0.35);
          }

          /* ── Landscape / short-viewport layout ──
             Triggered when the modal can't comfortably fit its
             portrait stack (≤ 540px viewport height). The prompt
             collapses onto one inline row, choices become a 2-column
             grid, and paddings/font sizes tighten so the whole
             question + answer set fits inside ~370 px without
             scrolling. Above this breakpoint the original portrait
             layout (centered word + 4-row choices) is kept. */
          @media (max-height: 540px) {
            .vt-body { padding: 10px 14px; }
            .vt-prompt-section { margin-bottom: 10px !important; text-align: center; }
            .vt-money-feedback-layer { top: 48px; }
            .vt-money-feedback { min-width: 74px; padding: 6px 14px; font-size: 20px; }
            .vt-prompt-label { display: none; }
            /* Stack word above speaker — the 2-col grid below saved
               enough vertical room that the speaker no longer needs
               to share a row with the word. Word stays the focal
               point, speaker reads as a small secondary affordance. */
            .vt-prompt-word-row {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              gap: 4px !important;
            }
            .vt-word { font-size: 22px !important; letter-spacing: 1px !important; }
            .vt-speaker { font-size: 12px !important; padding: 3px 8px !important; }
            .vt-choices {
              display: grid !important;
              grid-template-columns: 1fr 1fr;
              gap: 6px !important;
            }
            .vt-choices > button { padding: 8px 10px !important; font-size: 13px !important; }
            .vt-details { padding: 8px 10px !important; }
            .vt-details > div { font-size: 12px !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

/**
 * Bold + tint the target word inside an example sentence so the
 * eye lands on it immediately. Same convention as VocabularyListView's
 * inline examples — keeps the visual language consistent.
 */
function renderHighlighted(sentence: string, target: string) {
  const parts = sentence.split(target);
  if (parts.length === 1) return sentence;
  const out: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    out.push(part);
    if (i < parts.length - 1) {
      out.push(
        <span
          key={i}
          style={{
            color: COLORS.accentGoldDark,
            fontWeight: 700,
            background: 'rgba(201, 127, 26, 0.15)',
            padding: '0 2px',
          }}
        >
          {target}
        </span>,
      );
    }
  });
  return out;
}

function PixelButton({ children, onClick, small, tone = 'default' }: {
  children: React.ReactNode;
  onClick: () => void;
  small?: boolean;
  /** `'danger'` paints the button red so destructive / leave-the-flow
   *  actions (e.g. End session) read as "stop now" at a glance.
   *  `'default'` is the parchment tone used everywhere else. */
  tone?: 'default' | 'danger';
}) {
  const isDanger = tone === 'danger';
  const bg = isDanger ? COLORS.wrong : COLORS.cardRest;
  const border = isDanger ? COLORS.wrong : COLORS.cardBorder;
  const text = isDanger ? COLORS.parchmentLight : COLORS.text;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: 'inherit',
        fontSize: small ? 13 : 14,
        fontWeight: 700,
        color: text,
        background: bg,
        border: `2px solid ${border}`,
        borderRadius: small ? 6 : 8,
        boxShadow: `inset 1px 1px 0 0 ${isDanger ? COLORS.wrongBg : COLORS.parchmentLight}, 0 2px 0 0 ${border}`,
        padding: small ? '6px 12px' : '8px 14px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** Write-mode answer surface. Self-contained so the parent's body
 *  branch stays one line. Hits Enter OR taps Submit to lock the
 *  answer — both routes call `onSubmit` with the trimmed value
 *  upstream. After a submission the input flips read-only and
 *  paints its border with the outcome color. */
function WriteForm({
  target,
  value,
  onChange,
  onSubmit,
  outcome,
  disabled,
  inputRef: externalRef,
}: {
  target: string;
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  outcome: 'correct' | 'wrong' | null;
  disabled: boolean;
  /** Lifted to the parent so its Next button can call `.focus()`
   * synchronously from the click handler. iOS only pops the
   * keyboard when focus() runs inside a user-gesture event; calling
   * it from a useEffect (the path used on initial mount) silently
   * fails on mobile. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? localRef;
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !disabled;
  const borderColor = outcome === 'correct'
    ? COLORS.correct
    : outcome === 'wrong'
      ? COLORS.wrong
      : COLORS.cardBorder;
  const bgColor = outcome === 'correct'
    ? COLORS.correctBg
    : outcome === 'wrong'
      ? COLORS.wrongBg
      : COLORS.parchmentLight;
  useEffect(() => {
    if (disabled || outcome !== null) return;
    const timer = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
      input.scrollIntoView({ block: 'center', inline: 'nearest' });
      window.setTimeout(() => {
        input.scrollIntoView({ block: 'center', inline: 'nearest' });
      }, 260);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [disabled, outcome, target]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <input
        ref={inputRef}
        type="text"
        autoFocus
        value={value}
        readOnly={disabled}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        // 30 chars covers every Lingo target the catalog will
        // realistically grow to without enabling a flood-paste.
        maxLength={30}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('translate.write.placeholder')}
        // Letterspacing tightens for the input vs the prompt so
        // typed text reads as input, not as a label.
        style={{
          fontFamily: 'inherit',
          fontSize: 22,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: 1,
          padding: '12px 14px',
          background: bgColor,
          color: COLORS.text,
          border: `3px solid ${borderColor}`,
          borderRadius: 8,
          outline: 'none',
          // Wrong-answer shake reuses the same keyframe the choice
          // grid uses, so the feel matches across modes.
          animation: outcome === 'wrong' ? 'lingoMapTranslateShake 280ms ease-in-out' : undefined,
        }}
        aria-label={`Type the word — ${target.length} letters`}
      />
      {outcome === null && (
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            alignSelf: 'center',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            color: '#fdf6e0',
            background: canSubmit ? COLORS.accentGold : COLORS.parchmentShadow,
            border: `2px solid ${COLORS.accentGoldDark}`,
            borderRadius: 8,
            boxShadow: canSubmit
              ? `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`
              : 'none',
            padding: '8px 22px',
            letterSpacing: 0.5,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.65,
          }}
        >
          {t('translate.write.submit')}
        </button>
      )}
      {outcome !== null && (
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: outcome === 'correct' ? COLORS.correct : COLORS.wrong,
          }}
        >
          {outcome === 'correct'
            ? '✓ Nailed it'
            : `✗ The word was “${target}”`}
        </div>
      )}
    </form>
  );
}

/** Out-of-energy panel — picks one of three guidance branches:
 *    1. Has edible food in inventory → "eat from bag".
 *    2. Has the cash to buy the cheapest food → "head to Mart".
 *    3. Broke → "borrow from Theo" + Theo portrait.
 *  Lives as a small subcomponent so it can take its own hooks
 *  (`useInventory`, `useWalletBalance`) without polluting the
 *  parent's hook list — and so the conditional render at the
 *  parent stays a single line. */
function OutOfEnergyPanel({
  npcName,
  onClose,
}: {
  npcName: string;
  onClose: () => void;
}) {
  const inventory = useInventory();
  const balance = useWalletBalance();

  // Cheapest food the catalog can offer (energy > 0). If the catalog
  // is ever empty, we still want a sensible message — fall back to
  // a non-zero number so the affordability branch doesn't silently
  // route everyone to "broke" mode.
  const edibles = Object.values(ITEMS).filter((i) => (i.energy ?? 0) > 0);
  const cheapestPrice = edibles.length
    ? Math.min(...edibles.map((i) => i.priceCents))
    : Infinity;

  const haveFoodInBag = edibles.some((def) => (inventory[def.id] ?? 0) > 0);
  const canAffordFood = balance >= cheapestPrice;

  let body: React.ReactNode;
  if (haveFoodInBag) {
    body = (
      <div style={{ fontSize: 12, color: COLORS.hintText, lineHeight: 1.45 }}>
        {t('translate.outOfEnergy.haveFood', { name: npcName })}
      </div>
    );
  } else if (canAffordFood) {
    body = (
      <div style={{ fontSize: 12, color: COLORS.hintText, lineHeight: 1.45 }}>
        {t('translate.outOfEnergy.canAfford', { balance: formatBalance(balance), name: npcName })}
      </div>
    );
  } else {
    body = (
      <>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <AtlasSprite
            atlasKey="me-char-19-down"
            scale={3}
            ariaLabel="Theo"
          />
        </div>
        <div style={{ fontSize: 12, color: COLORS.hintText, lineHeight: 1.45 }}>
          {t('translate.outOfEnergy.broke', { balance: formatBalance(balance) })}
        </div>
      </>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: 16,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...UI_THEME.modal.panelStyle,
          padding: 20,
          width: '100%',
          maxWidth: 360,
          gap: 14,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 38, lineHeight: 1 }}>⚡</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{t('translate.outOfEnergy.title')}</div>
        {body}
        <button
          onClick={onClose}
          style={{
            background: COLORS.accentGold,
            color: '#fdf6e0',
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 4,
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.5,
            cursor: 'pointer',
          }}
        >
          {t('translate.outOfEnergy.close')}
        </button>
      </div>
    </div>
  );
}
