'use client';

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
} from '../data/wallet';
import { speakDialogue, cancelDialogueSpeech } from './tts';

interface VocabularyPracticeViewProps {
  pack: VocabularyPack;
  npcName: string;
  onClose: () => void;
}

// Cozy palette (kept in sync with DialogueOverlay + VocabularyListView).
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
  speakerBgActive: '#fff0b8',
  correct: '#5d8a3a',
  correctBg: '#cde0a3',
  wrong: '#a14535',
  wrongBg: '#e6a99c',
};

// How long to hold the colored feedback before auto-advancing. Long
// enough that the player has time to read the right answer when they
// missed, short enough that the practice loop stays brisk.
const FEEDBACK_HOLD_MS = 1100;

interface Round {
  /** The word the player is being quizzed on. */
  prompt: VocabularyEntry;
  /** 4 entries — the prompt itself + 3 distractors — pre-shuffled.
   *  Distractors prefer the same part-of-speech so the test is real
   *  (a noun won't be paired with three verbs as obviously-wrong
   *  choices). When the POS pool is too small we fall back to any. */
  choices: VocabularyEntry[];
}

function buildRound(pack: VocabularyPack, progress: VocabProgress): Round {
  const prompt = pickPromptEntry(pack, progress);
  const choices = buildChoices(pack, prompt);
  return { prompt, choices };
}

export default function VocabularyPracticeView({ pack, npcName, onClose }: VocabularyPracticeViewProps) {
  const [progress, setProgress] = useState<VocabProgress>(() => loadProgress(pack.id));
  const [round, setRound] = useState<Round>(() => buildRound(pack, progress));
  // Stamp the first prompt into the recency buffer right away. Done
  // in an effect (not state init) to keep init pure.
  useEffect(() => {
    setProgress((p) => {
      const next = recordPromptShown(p, round.prompt.target);
      saveProgress(pack.id, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** When the player picks an answer, lock the buttons until either
   *  (a) the feedback hold elapses and the next round mounts (correct
   *  → auto-advance) or (b) the player taps Next (wrong → manual). */
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  /** `skipped` tracks "I don't know" picks separately from wrong
   *  guesses so the player can see how many they bailed on vs how
   *  many they actually missed. Both go to the wrong-queue on the
   *  progress side, but the surface counter keeps the categories
   *  honest. */
  const [score, setScore] = useState({ correct: 0, wrong: 0, skipped: 0 });
  /** When the player gets a round wrong we DON'T auto-advance — they
   *  need a beat to absorb the correction. Setting this flag flips
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
    setProgress((p) => {
      const nextRound = buildRound(pack, p);
      const stamped = recordPromptShown(p, nextRound.prompt.target);
      saveProgress(pack.id, stamped);
      setRound(nextRound);
      return stamped;
    });
    setSelectedTarget(null);
    setWaitingOnNext(false);
    setShowDetails(false);
  }, [pack]);

  const handlePick = useCallback(
    (chosen: VocabularyEntry) => {
      if (selectedTarget !== null || waitingOnNext) return;
      setSelectedTarget(chosen.target);
      const isCorrect = chosen.target === round.prompt.target;
      setScore((s) => ({
        ...s,
        correct: s.correct + (isCorrect ? 1 : 0),
        wrong: s.wrong + (isCorrect ? 0 : 1),
      }));
      // Same wallet impact as the translate view — practice answers
      // also feed the persistent balance so the player has one
      // unified "I'm getting better" number.
      addBalance(isCorrect ? REWARD_PER_CORRECT : -PENALTY_PER_WRONG);
      // Update per-word memory state — the picker uses this on the
      // next round (wrong-queue + recency-aware).
      setProgress((p) => {
        const updated = recordAnswer(p, round.prompt.target, isCorrect);
        saveProgress(pack.id, updated);
        return updated;
      });
      if (isCorrect) {
        advanceTimerRef.current = window.setTimeout(() => {
          advanceToNextRound();
        }, FEEDBACK_HOLD_MS);
      } else {
        setWaitingOnNext(true);
      }
    },
    [pack, round.prompt.target, selectedTarget, waitingOnNext, advanceToNextRound],
  );

  /** Player admits they don't know the word — same as wrong on the
   *  progress side (word goes to the queue, streak resets) but
   *  tracked separately in the score so honesty is visible.
   *  Auto-expands the study panel; they asked for help, give help. */
  const handleIDontKnow = useCallback(() => {
    if (selectedTarget !== null || waitingOnNext) return;
    setProgress((p) => {
      const updated = recordAnswer(p, round.prompt.target, false);
      saveProgress(pack.id, updated);
      return updated;
    });
    addBalance(-PENALTY_PER_IDK);
    setScore((s) => ({ ...s, skipped: s.skipped + 1 }));
    setWaitingOnNext(true);
    setShowDetails(true);
  }, [pack, round.prompt.target, selectedTarget, waitingOnNext]);

  const handleSpeak = useCallback(() => {
    cancelDialogueSpeech();
    speakDialogue(round.prompt.target);
  }, [round.prompt.target]);

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
        background: 'rgba(0,0,0,0.45)',
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
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `2px solid ${COLORS.woodLight}`,
              background: COLORS.parchmentLight,
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
                Practice with {npcName}
              </div>
              {/* Score row — quietly informative, not the focus. */}
              <div style={{ color: COLORS.text, fontSize: 13, display: 'flex', gap: 12 }}>
                <span style={{ color: COLORS.correct }}>
                  ✓ <strong>{score.correct}</strong>
                </span>
                <span style={{ color: COLORS.wrong }}>
                  ✗ <strong>{score.wrong}</strong>
                </span>
                {score.skipped > 0 ? (
                  <span style={{ color: COLORS.hintText }}>
                    🤷 <strong>{score.skipped}</strong>
                  </span>
                ) : null}
              </div>
            </div>
            <PixelButton onClick={onClose} small>
              ✕ close
            </PixelButton>
          </div>

          {/* Body. Layout adapts via media queries below — portrait
              uses the centered stack, landscape collapses prompt onto
              one row + 2-column choice grid so nothing overflows.
              `key` on the prompt-target wrapper retriggers fade-in on
              every new round. */}
          <div
            className="vp-body"
            style={{
              padding: '20px 16px',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              key={round.prompt.target}
              className="vp-prompt-section"
              style={{
                animation: 'lingoMapPracticeFadeIn 280ms ease-out',
                textAlign: 'center',
                marginBottom: 18,
              }}
            >
              <div
                className="vp-prompt-label"
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
              {/* Prompt word + speaker — inline, with media query
                  collapsing them onto one row in landscape. */}
              <div
                className="vp-prompt-word-row"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="vp-word"
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
                  className="vp-speaker"
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
                When details are open the choices hide so the meaning
                sits in the same vertical slot — no scroll needed. */}
            {!showDetails ? (
            <div className="vp-choices" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      animation: showAsWrong ? 'lingoMapPracticeShake 280ms ease-in-out' : undefined,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        color: COLORS.hintText,
                        fontSize: 12,
                        fontWeight: 700,
                        minWidth: 18,
                      }}
                    >
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

            {/* "I don't know" — bail option, lower-stakes than a
                wrong guess. Routed to the same wrong-queue pathway
                so the word still comes back for review, but tracked
                separately in the score so honesty is visible. */}
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

            {/* Wrong-answer study panel — replaces choices when
                expanded so the meaning stays in the visible area. */}
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
                      animation: 'lingoMapPracticeHintPulse 1.6s ease-in-out infinite',
                    }}
                  >
                    💡 Tap the word above to see what it means.
                  </div>
                ) : (
                  <div
                    className="vp-details"
                    style={{
                      background: COLORS.parchmentLight,
                      border: `2px solid ${COLORS.cardBorder}`,
                      boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                      padding: '10px 12px',
                      marginBottom: 12,
                      animation: 'lingoMapPracticeFadeIn 220ms ease-out',
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
          @keyframes lingoMapPracticeFadeIn {
            0%   { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes lingoMapPracticeShake {
            0%, 100% { transform: translateX(0); }
            20%      { transform: translateX(-4px); }
            40%      { transform: translateX(4px); }
            60%      { transform: translateX(-2px); }
            80%      { transform: translateX(2px); }
          }
          @keyframes lingoMapPracticeHintPulse {
            0%, 100% { opacity: 0.55; }
            50%       { opacity: 1; }
          }

          /* ── Landscape / short-viewport layout — same fix as
             VocabularyTranslateView. Activates at ≤540px height. */
          @media (max-height: 540px) {
            .vp-body { padding: 10px 14px; }
            .vp-prompt-section { margin-bottom: 10px !important; text-align: center; }
            .vp-prompt-label { display: none; }
            /* Stack word above speaker — see VocabularyTranslateView
               for rationale. Same compact treatment. */
            .vp-prompt-word-row {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              gap: 4px !important;
            }
            .vp-word { font-size: 22px !important; letter-spacing: 1px !important; }
            .vp-speaker { font-size: 12px !important; padding: 3px 8px !important; }
            .vp-choices {
              display: grid !important;
              grid-template-columns: 1fr 1fr;
              gap: 6px !important;
            }
            .vp-choices > button { padding: 8px 10px !important; font-size: 13px !important; }
            .vp-details { padding: 8px 10px !important; }
            .vp-details > div { font-size: 12px !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

/** Bold + tint the target word inside an example sentence so the
 *  eye lands on it immediately. Same convention as the list view's
 *  inline examples — keeps the visual language consistent. */
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

/** Small reusable button matching the cozy palette. Used in headers
 *  for tertiary actions like "close" / "back". */
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
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translateY(2px)';
        e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}`;
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`;
      }}
    >
      {children}
    </button>
  );
}
