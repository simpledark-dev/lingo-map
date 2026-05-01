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
import { speakDialogue, cancelDialogueSpeech } from './tts';

interface VocabularyTranslateViewProps {
  pack: VocabularyPack;
  npcName: string;
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

const FEEDBACK_HOLD_MS = 1100;
const REWARD_PER_CORRECT = 5;
const PENALTY_PER_WRONG = 3;

interface Round {
  prompt: VocabularyEntry;
  choices: VocabularyEntry[];
}

function pickRound(pack: VocabularyPack, previousPromptTarget?: string): Round {
  const pool = previousPromptTarget
    ? pack.entries.filter((e) => e.target !== previousPromptTarget)
    : pack.entries;
  const prompt = pool[Math.floor(Math.random() * pool.length)];
  const samePOS = pack.entries.filter(
    (e) => e.pos === prompt.pos && e.target !== prompt.target,
  );
  const distractors: VocabularyEntry[] = shuffle(samePOS).slice(0, 3);
  while (distractors.length < 3) {
    const candidate = pack.entries[Math.floor(Math.random() * pack.entries.length)];
    if (
      candidate.target !== prompt.target &&
      !distractors.some((d) => d.target === candidate.target)
    ) {
      distractors.push(candidate);
    }
  }
  return { prompt, choices: shuffle([prompt, ...distractors]) };
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function VocabularyTranslateView({ pack, npcName, onClose }: VocabularyTranslateViewProps) {
  const [round, setRound] = useState<Round>(() => pickRound(pack));
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [coins, setCoins] = useState(0);
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

  useEffect(() => {
    speakDialogue(round.prompt.target);
    return cancelDialogueSpeech;
  }, [round.prompt.target]);

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
    setRound(pickRound(pack, round.prompt.target));
    setSelectedTarget(null);
    setLastDelta(null);
    setWaitingOnNext(false);
    setShowDetails(false);
  }, [pack, round.prompt.target]);

  const handlePick = useCallback(
    (chosen: VocabularyEntry) => {
      if (selectedTarget !== null) return;
      setSelectedTarget(chosen.target);
      const isCorrect = chosen.target === round.prompt.target;
      const delta = isCorrect ? REWARD_PER_CORRECT : -PENALTY_PER_WRONG;
      setCoins((c) => c + delta);
      setLastDelta(delta);
      if (isCorrect) {
        // Brisk correct flow — auto-advance.
        advanceTimerRef.current = window.setTimeout(() => {
          advanceToNextRound();
        }, FEEDBACK_HOLD_MS);
      } else {
        // Wrong — freeze the round, surface the Next button, let the
        // player tap the prompt to peek at meaning + examples before
        // they choose to move on.
        setWaitingOnNext(true);
      }
    },
    [round.prompt.target, selectedTarget, advanceToNextRound],
  );

  const handleSpeak = useCallback(() => {
    cancelDialogueSpeech();
    speakDialogue(round.prompt.target);
  }, [round.prompt.target]);

  // The prompt word is tappable to peek at details ONLY after an
  // answer has been picked. Before that, tapping it during the
  // active question would be a free hint, which defeats the test.
  const promptIsTappable = waitingOnNext;
  const examples = getExamples(round.prompt);

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
                Read the word, pick its meaning.
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
                <span style={{ color: COLORS.coinGold }}>●</span>
                <span>{coins}</span>
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
                    {lastDelta > 0 ? `+${lastDelta}` : `${lastDelta}`}
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
                What does this mean?
              </div>
              {/* Prompt word + speaker. In portrait the speaker sits
                  beneath the word; in landscape the media query
                  collapses both onto one row to save vertical space.
                  The word stays tappable AFTER a wrong answer so the
                  player can pull up the study panel — before that
                  it's decorative (tapping would be a free hint). */}
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
                <button
                  type="button"
                  className="vt-speaker"
                  aria-label={`Pronounce ${round.prompt.target}`}
                  onClick={handleSpeak}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 13,
                    background: COLORS.speakerBg,
                    border: `2px solid ${COLORS.cardBorder}`,
                    boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    color: COLORS.text,
                  }}
                >
                  🔊 hear it
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
                      <span style={{ color: COLORS.text, fontSize: 14 }}>
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
                  Got it — Next ▶
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
