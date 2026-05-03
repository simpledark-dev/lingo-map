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
import { VocabularyPack, VocabularyEntry, getExamples } from '../data/vocabularyPacks';
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
  REWARD_PER_CORRECT,
  PENALTY_PER_WRONG,
  PENALTY_PER_IDK,
  addBalance,
  useWalletBalance,
  formatBalance,
  formatDelta,
} from '../data/wallet';
import { cancelDialogueSpeech } from './tts';
import { speakVocabWord } from './wordSpeak';
import { playSfx, SFX } from './sfx';
import { consumeEnergy } from '../data/energy';

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
   *                about hiding the answer forever. */
  mode?: 'read' | 'listen';
  onClose: () => void;
}

const COLORS = {
  parchment: '#fbe9b8',
  parchmentLight: '#fff5d6',
  parchmentShadow: '#e2cb88',
  wood: '#5b3a1f',
  woodLight: '#8b5a2b',
  woodShadow: '#3a2410',
  text: '#3d2410',
  accentGold: '#c97f1a',
  accentGoldDark: '#8b4f10',
  cardRest: '#f0d28a',
  cardActive: '#fff0b8',
  cardBorder: '#6b3f1a',
  hintText: '#7b5530',
  speakerBg: '#e8c896',
  correct: '#5d8a3a',
  correctBg: '#cde0a3',
  wrong: '#a14535',
  wrongBg: '#e6a99c',
  coinGold: '#d9a429',
  coinGoldDark: '#9a6e16',
};

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

export default function VocabularyTranslateView({ pack, npcName, mode = 'read', onClose }: VocabularyTranslateViewProps) {
  const isListenMode = mode === 'listen';
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
  const advanceTimerRef = useRef<number | null>(null);
  /** True when the player ran out of energy. Replaces the round
   *  UI with a "go eat something" overlay; the player closes the
   *  view and uses the Bag pill to refill before coming back.
   *  Energy is consumed once per round (the very first round on
   *  mount, then once per advance). */
  const [outOfEnergy, setOutOfEnergy] = useState(false);
  /** Pay the energy cost for the FIRST round exactly once. Mount
   *  effect rather than a useState initializer so the side-effect
   *  doesn't hide inside React-internal init flow. If the player
   *  doesn't have any energy, flip the overlay immediately and
   *  the round UI never gets a chance to render. */
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
    };
  }, []);

  const advanceToNextRound = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    // Pay 1 energy to start the next round. If the player can't
    // afford it, freeze the view on the out-of-energy overlay
    // instead of rolling a fresh prompt — they have to leave, eat,
    // and come back. We still clear the per-round transient state
    // (selection, delta, study panel) so the overlay isn't sitting
    // on top of the previous round's "+3 / -2" badge.
    if (!consumeEnergy(1)) {
      setOutOfEnergy(true);
      setSelectedTarget(null);
      setLastDelta(null);
      setWaitingOnNext(false);
      setShowDetails(false);
      return;
    }
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
  }, [pack]);

  const handlePick = useCallback(
    (chosen: VocabularyEntry) => {
      if (selectedTarget !== null || waitingOnNext) return;
      setSelectedTarget(chosen.target);
      const isCorrect = chosen.target === round.prompt.target;
      const delta = isCorrect ? REWARD_PER_CORRECT : -PENALTY_PER_WRONG;
      addBalance(delta);
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
      setWaitingOnNext(true);
    },
    [pack, round.prompt.target, selectedTarget, waitingOnNext],
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
    setProgress((p) => {
      const updated = recordAnswer(p, round.prompt.target, false);
      saveProgress(pack.id, updated);
      return updated;
    });
    addBalance(-PENALTY_PER_IDK);
    setLastDelta(-PENALTY_PER_IDK);
    setWaitingOnNext(true);
    setShowDetails(true);
  }, [pack, round.prompt.target, selectedTarget, waitingOnNext]);

  const handleSpeak = useCallback(() => {
    cancelDialogueSpeech();
    speakVocabWord(pack, round.prompt.target);
  }, [pack, round.prompt.target]);

  // The prompt word is tappable to peek at details ONLY after an
  // answer has been picked. Before that, tapping it during the
  // active question would be a free hint, which defeats the test.
  const promptIsTappable = waitingOnNext;
  const examples = getExamples(round.prompt);

  // Out-of-energy short-circuit: replace the round UI with a
  // simple parchment notice + Close. The player goes back to the
  // map, opens the bag, eats, and re-enters this view (which will
  // re-run the mount-effect that pays for the first round).
  if (outOfEnergy) {
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
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: COLORS.parchment,
            border: `3px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            boxShadow: `inset 2px 2px 0 0 ${COLORS.parchmentLight}, inset -2px -2px 0 0 ${COLORS.parchmentShadow}, 0 6px 0 0 #2a1a0a`,
            padding: 20,
            width: '100%',
            maxWidth: 360,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            textAlign: 'center',
            color: COLORS.text,
          }}
        >
          <div style={{ fontSize: 38, lineHeight: 1 }}>⚡</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Out of energy</div>
          <div style={{ fontSize: 12, color: COLORS.hintText, lineHeight: 1.45 }}>
            You&apos;re too tired to keep working. Open your <strong>Bag</strong> and eat
            something to refill, then come back to {npcName}.
          </div>
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
            Close
          </button>
        </div>
      </div>
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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.wood,
          border: `3px solid ${COLORS.woodShadow}`,
          boxShadow: `0 4px 0 0 ${COLORS.woodShadow}`,
          padding: 4,
          imageRendering: 'pixelated',
          fontFamily: 'var(--font-geist-mono), ui-monospace, "Courier New", monospace',
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            background: COLORS.parchment,
            border: `2px solid ${COLORS.woodLight}`,
            boxShadow: `inset 2px 2px 0 0 ${COLORS.parchmentLight}, inset -2px -2px 0 0 ${COLORS.parchmentShadow}`,
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
              borderBottom: `2px solid ${COLORS.woodLight}`,
              background: COLORS.parchmentLight,
              gap: 12,
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
                Translating for {npcName}
              </div>
              <div style={{ color: COLORS.text, fontSize: 11, opacity: 0.8 }}>
                {isListenMode ? 'Listen and pick the meaning.' : 'Read the word, pick its meaning.'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Coin pouch */}
              <div
                style={{
                  position: 'relative',
                  background: COLORS.cardRest,
                  border: `2px solid ${COLORS.coinGoldDark}`,
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
                <span>{formatBalance(coins)}</span>
                {/* Floating delta — fades up + out on each answer. The
                    `key={lastDelta}` retriggers the animation even if
                    the value is the same as the previous one. */}
                {lastDelta !== null ? (
                  <span
                    key={lastDelta + ':' + round.prompt.target}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: 4,
                      color: lastDelta > 0 ? COLORS.correct : COLORS.wrong,
                      fontSize: 11,
                      fontWeight: 700,
                      animation: 'lingoMapTranslateDeltaFloat 900ms ease-out forwards',
                      pointerEvents: 'none',
                    }}
                  >
                    {formatDelta(lastDelta)}
                  </span>
                ) : null}
              </div>
              <PixelButton onClick={onClose} small>
                ✕ close
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
            }}
          >
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
                {isListenMode ? 'Listen carefully — what did you hear?' : 'What does this mean?'}
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
                {isListenMode ? (
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
                    title={promptIsTappable ? (showDetails ? 'Hide details' : 'Tap to see meaning & examples') : undefined}
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
                    title={promptIsTappable ? (showDetails ? 'Hide details' : 'Tap to see meaning & examples') : undefined}
                  >
                    {round.prompt.target}
                  </span>
                )}
                <button
                  type="button"
                  className="vt-speaker"
                  aria-label={`Pronounce ${round.prompt.target}`}
                  onClick={handleSpeak}
                  style={{
                    fontFamily: 'inherit',
                    // In listen mode the speaker is the player's only
                    // affordance for replaying the word, so make it
                    // bigger + more inviting. Read mode keeps the
                    // small secondary-affordance look.
                    fontSize: isListenMode ? 15 : 13,
                    fontWeight: isListenMode ? 700 : 400,
                    background: COLORS.speakerBg,
                    border: `2px solid ${COLORS.cardBorder}`,
                    boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                    padding: isListenMode ? '8px 16px' : '4px 10px',
                    cursor: 'pointer',
                    color: COLORS.text,
                  }}
                >
                  🔊 {isListenMode ? 'hear again' : 'hear it'}
                </button>
              </div>
            </div>

            {/* Choices stay visible UNTIL the player expands the
                details panel (only possible after a wrong answer).
                When details are open the choices are hidden so the
                meaning sits in the same vertical slot — the player
                doesn't have to scroll past frozen choices to read
                what the word means. */}
            {!showDetails ? (
            <div className="vt-choices" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {round.choices.map((choice, i) => {
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
                      textAlign: 'left',
                      padding: '10px 14px',
                      background: showAsCorrect
                        ? COLORS.correctBg
                        : showAsWrong
                          ? COLORS.wrongBg
                          : COLORS.cardRest,
                      border: `2px solid ${
                        showAsCorrect ? COLORS.correct : showAsWrong ? COLORS.wrong : COLORS.cardBorder
                      }`,
                      boxShadow:
                        selectedTarget === null
                          ? `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`
                          : 'none',
                      cursor: selectedTarget !== null ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      color: COLORS.text,
                      fontSize: 15,
                      transition: 'background 160ms, border-color 160ms',
                      animation: showAsWrong ? 'lingoMapTranslateShake 280ms ease-in-out' : undefined,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span style={{ color: COLORS.hintText, fontSize: 12, fontWeight: 700, minWidth: 18 }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span style={{ flex: 1 }}>{choice.english}</span>
                    {showAsCorrect ? <span style={{ color: COLORS.correct, fontSize: 16 }}>✓</span> : null}
                    {showAsWrong ? <span style={{ color: COLORS.wrong, fontSize: 16 }}>✗</span> : null}
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
                🤷 I don&apos;t know — show me
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
                        — {round.prompt.english}
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
                        Examples
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
                  onClick={advanceToNextRound}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#fff5d6',
                    background: COLORS.accentGold,
                    border: `2px solid ${COLORS.accentGoldDark}`,
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
                    ? 'Nice! Next ▶'
                    : 'Got it — Next ▶'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <style>{`
          @keyframes lingoMapTranslateFadeIn {
            0%   { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes lingoMapTranslateShake {
            0%, 100% { transform: translateX(0); }
            20%      { transform: translateX(-4px); }
            40%      { transform: translateX(4px); }
            60%      { transform: translateX(-2px); }
            80%      { transform: translateX(2px); }
          }
          @keyframes lingoMapTranslateDeltaFloat {
            0%   { opacity: 0; transform: translateY(0); }
            20%  { opacity: 1; }
            100% { opacity: 0; transform: translateY(-22px); }
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

function PixelButton({ children, onClick, small }: { children: React.ReactNode; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: 'inherit',
        fontSize: small ? 13 : 14,
        fontWeight: 700,
        color: COLORS.text,
        background: COLORS.cardRest,
        border: `2px solid ${COLORS.cardBorder}`,
        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
        padding: small ? '6px 12px' : '8px 14px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
