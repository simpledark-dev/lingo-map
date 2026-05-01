'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { VocabularyPack, VocabularyEntry, getExamples } from '../data/vocabularyPacks';
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

function pickRound(pack: VocabularyPack, previousPromptTarget?: string): Round {
  // Avoid showing the same word twice in a row — feels fairer than
  // pure uniform random and removes a small "did I just answer this?"
  // confusion when the player picks correctly.
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

export default function VocabularyPracticeView({ pack, npcName, onClose }: VocabularyPracticeViewProps) {
  const [round, setRound] = useState<Round>(() => pickRound(pack));
  /** When the player picks an answer, lock the buttons until either
   *  (a) the feedback hold elapses and the next round mounts (correct
   *  → auto-advance) or (b) the player taps Next (wrong → manual). */
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
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
    setRound(pickRound(pack, round.prompt.target));
    setSelectedTarget(null);
    setWaitingOnNext(false);
    setShowDetails(false);
  }, [pack, round.prompt.target]);

  const handlePick = useCallback(
    (chosen: VocabularyEntry) => {
      if (selectedTarget !== null) return;
      setSelectedTarget(chosen.target);
      const isCorrect = chosen.target === round.prompt.target;
      setScore((s) => ({
        correct: s.correct + (isCorrect ? 1 : 0),
        wrong: s.wrong + (isCorrect ? 0 : 1),
      }));
      if (isCorrect) {
        advanceTimerRef.current = window.setTimeout(() => {
          advanceToNextRound();
        }, FEEDBACK_HOLD_MS);
      } else {
        setWaitingOnNext(true);
      }
    },
    [round.prompt.target, selectedTarget, advanceToNextRound],
  );

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
