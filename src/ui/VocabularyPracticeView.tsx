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
  PENALTY_PER_WRONG,
  PENALTY_PER_IDK,
  addBalance,
  creditEarnings,
  getRewardPerCorrect,
} from '../data/wallet';
import { cancelDialogueSpeech } from './tts';
import { speakVocabWord } from './wordSpeak';
import { playSfx, SFX } from './sfx';
import { getUiTheme } from './uiThemes';

interface VocabularyPracticeViewProps {
  pack: VocabularyPack;
  npcName: string;
  /** Quiz surface — `read` shows the target word as text, `listen`
   *  hides the spelling behind a tappable placeholder and auto-
   *  speaks the prompt instead, `write` shows the meaning and asks
   *  the player to type the target. Mirrors the Translate view's
   *  mode prop so the picker can drive both. */
  mode?: 'read' | 'listen' | 'write';
  onClose: () => void;
}

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

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

export default function VocabularyPracticeView({ pack, npcName, mode = 'read', onClose }: VocabularyPracticeViewProps) {
  const isListenMode = mode === 'listen';
  const isWriteMode = mode === 'write';
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
  /** Write mode only — current input + locked outcome. Mirrors the
   *  Translate view's write surface so the per-round behaviour is
   *  consistent across the two flows. */
  const [writeInput, setWriteInput] = useState('');
  const [writeOutcome, setWriteOutcome] = useState<'correct' | 'wrong' | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  // Read mode stays silent on round mount — auto-TTS would compete
  // with the perfect.mp3 chime for the iOS audio session and one of
  // them would drop randomly. The "🔊 hear it" button is enough,
  // since the word is on screen.
  //
  // Listen mode, by contrast, MUST auto-speak — the audio is the
  // prompt itself; otherwise the player has nothing to go on.
  // Same `[round]`-reference dep as the Translate view so back-to-
  // back rounds with the same target still re-fire the speak (a
  // string dep wouldn't change and the second utterance would be
  // suppressed silently).
  useEffect(() => {
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
    setWriteInput('');
    setWriteOutcome(null);
  }, [pack]);

  /** Write-mode submit — case-insensitive comparison against the
   *  target. Mirrors `handlePick` for scoring + wrong-queue side
   *  effects but routes through its own state since the input
   *  surface isn't shaped around `selectedTarget`. */
  const handleWriteSubmit = useCallback(
    (raw: string) => {
      if (waitingOnNext || writeOutcome !== null) return;
      const guess = raw.trim().toLowerCase();
      if (!guess) return;
      const isCorrect = guess === round.prompt.target.toLowerCase();
      setScore((s) => ({
        ...s,
        correct: s.correct + (isCorrect ? 1 : 0),
        wrong: s.wrong + (isCorrect ? 0 : 1),
      }));
      // Positive reward routes through `creditEarnings` so the
      // first-paycheck milestone counts practice rounds too.
      // Penalties stay on plain addBalance.
      if (isCorrect) creditEarnings(getRewardPerCorrect());
      else addBalance(-PENALTY_PER_WRONG);
      setWriteOutcome(isCorrect ? 'correct' : 'wrong');
      setProgress((p) => {
        const updated = recordAnswer(p, round.prompt.target, isCorrect);
        saveProgress(pack.id, updated);
        return updated;
      });
      if (isCorrect) {
        playSfx(SFX.CORRECT);
      } else {
        // Auto-expand study panel on a wrong recall — same rationale
        // as the Translate view's write mode (no choice grid means
        // no "see the right answer highlighted" alternative).
        setShowDetails(true);
      }
      setWaitingOnNext(true);
    },
    [pack, round.prompt.target, waitingOnNext, writeOutcome],
  );

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
      // unified "I'm getting better" number. Correct rewards route
      // through `creditEarnings` so they count toward lifetime-earned
      // milestones (first-paycheck quest, future achievements).
      if (isCorrect) creditEarnings(getRewardPerCorrect());
      else addBalance(-PENALTY_PER_WRONG);
      // Update per-word memory state — the picker uses this on the
      // next round (wrong-queue + recency-aware).
      setProgress((p) => {
        const updated = recordAnswer(p, round.prompt.target, isCorrect);
        saveProgress(pack.id, updated);
        return updated;
      });
      // Correct AND wrong now both pause for the player. Same
      // rationale as VocabularyTranslateView — sometimes you guess
      // right but want to confirm by checking meaning + examples,
      // and the manual Next button gives that breathing room.
      if (isCorrect) {
        playSfx(SFX.CORRECT);
      }
      setWaitingOnNext(true);
    },
    [pack, round.prompt.target, selectedTarget, waitingOnNext],
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
    speakVocabWord(pack, round.prompt.target);
  }, [pack, round.prompt.target]);

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
      onClick={(e) => e.stopPropagation()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...UI_THEME.modal.panelStyle,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
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
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `2px solid ${COLORS.cardBorder}`,
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
                {isWriteMode
                  ? 'How do you write…'
                  : isListenMode
                    ? 'Listen carefully — what did you hear?'
                    : 'What does this mean?'}
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
                {isWriteMode ? (
                  // Write mode: prompt = the english meaning, no
                  // speaker pre-answer (would let the player just
                  // transcribe TTS). Study panel below reveals the
                  // word + a hear-it after submission.
                  <span
                    className="vp-word vp-write-prompt"
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
                    {round.prompt.english}
                  </span>
                ) : isListenMode && !waitingOnNext && !showDetails ? (
                  // Listen mode hides the spelling pre-answer so the
                  // player has to identify by sound. Tappable after
                  // an answer is picked (same affordance as read
                  // mode), at which point it expands the details
                  // panel revealing target + meaning.
                  <span
                    className="vp-word vp-placeholder"
                    style={{
                      color: COLORS.hintText,
                      fontSize: 32,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      lineHeight: 1.1,
                      paddingBottom: 2,
                    }}
                    aria-label="Hidden word — listen and pick the meaning"
                  >
                    ◌◌◌
                  </span>
                ) : (
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
                )}
                {/* Hide the speaker pre-answer in write mode for
                    the same reason translate hides it: hearing the
                    word would defeat the recall test. Re-shown
                    after submission via the study/details panel. */}
                {!(isWriteMode && !waitingOnNext) && (
                  <button
                    type="button"
                    className="vp-speaker"
                    aria-label={isListenMode ? 'Hear it again' : `Pronounce ${round.prompt.target}`}
                    onClick={handleSpeak}
                    style={{
                      fontFamily: 'inherit',
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
                )}
              </div>
            </div>

            {/* Write mode replaces the choice grid with an input
                form. Same energy/scoring/wrong-queue flow; the
                study panel still opens on a wrong submit (auto-
                expanded by handleWriteSubmit) so the player sees
                the correct spelling next to what they typed. */}
            {isWriteMode ? (
              <PracticeWriteForm
                target={round.prompt.target}
                value={writeInput}
                onChange={setWriteInput}
                onSubmit={() => handleWriteSubmit(writeInput)}
                outcome={writeOutcome}
                disabled={writeOutcome !== null || waitingOnNext}
              />
            ) : !showDetails ? (
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
                  {selectedTarget !== null && selectedTarget === round.prompt.target
                    ? 'Nice! Next ▶'
                    : 'Got it — Next ▶'}
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

/** Write-mode answer surface. Mirror of the Translate view's
 *  `WriteForm`; kept local instead of shared so each view can
 *  evolve its own niceties (Practice may eventually add a hint-
 *  letter button, Translate may add a streak bonus etc.) without
 *  cross-coupling. */
function PracticeWriteForm({
  target,
  value,
  onChange,
  onSubmit,
  outcome,
  disabled,
}: {
  target: string;
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  outcome: 'correct' | 'wrong' | null;
  disabled: boolean;
}) {
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
        type="text"
        autoFocus
        value={value}
        readOnly={disabled}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        maxLength={30}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type the word…"
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
          borderRadius: 4,
          outline: 'none',
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
            boxShadow: canSubmit
              ? `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`
              : 'none',
            padding: '8px 22px',
            letterSpacing: 0.5,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.65,
          }}
        >
          Submit ▶
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
