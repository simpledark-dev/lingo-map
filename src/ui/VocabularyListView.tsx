'use client';

import { useState, useMemo } from 'react';
import { VocabularyPack, getExamples } from '../data/vocabularyPacks';
import { cancelDialogueSpeech } from './tts';
import { speakVocabWord } from './wordSpeak';
import VocabularyPracticeView from './VocabularyPracticeView';
import { getUiTheme } from './uiThemes';

interface VocabularyListViewProps {
  pack: VocabularyPack;
  npcName: string;
  onClose: () => void;
}

/** The list view doubles as the parent for the practice screen — the
 *  player swaps between "browse the dictionary" and "drill the words"
 *  without leaving the modal. Closing the practice screen returns
 *  here; closing the list returns to the world.
 *
 *  Practice is parameterised by mode (read vs listen) the same way
 *  the Translate flow is. The 'practice-picker' state is the
 *  intermediate step where the player picks the mode before the
 *  drill starts; mirrors translate's 4-button mode menu. */
type Mode =
  | { kind: 'list' }
  | { kind: 'practice-picker' }
  | { kind: 'practice'; mode: 'read' | 'listen' | 'write' };

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

export default function VocabularyListView({ pack, npcName, onClose }: VocabularyListViewProps) {
  // Only one row expanded at a time — keeps the list short and
  // matches the "tap to peek, tap again to close" pattern players
  // already know from any phone-app collapsible list.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  // Pre-compute examples once per entry. Cheap (~150 string concats)
  // but no point doing it on every render. MUST run on every render
  // (i.e. before any conditional returns) — moving it below the
  // mode-branch return triggered React's "Rendered fewer hooks than
  // expected" error when the player toggled into practice mode.
  const entriesWithExamples = useMemo(
    () => pack.entries.map((e) => ({ entry: e, examples: getExamples(e) })),
    [pack.entries],
  );

  if (mode.kind === 'practice') {
    return (
      <VocabularyPracticeView
        pack={pack}
        npcName={npcName}
        mode={mode.mode}
        // Back to the dictionary, NOT all the way out to the world.
        // The player explicitly clicked "Practice" from here, so the
        // natural return is to the same screen.
        onClose={() => setMode({ kind: 'list' })}
      />
    );
  }

  if (mode.kind === 'practice-picker') {
    return (
      <PracticeModePicker
        npcName={npcName}
        onPick={(picked) => setMode({ kind: 'practice', mode: picked })}
        onCancel={() => setMode({ kind: 'list' })}
      />
    );
  }

  const handleSpeak = (target: string) => {
    // Cancel any prior utterance (TTS panel button mashing) so we
    // don't queue a backlog.
    cancelDialogueSpeech();
    speakVocabWord(pack, target);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        padding: 16,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Parchment modal panel, matching the cutscene dialogue style. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...UI_THEME.modal.panelStyle,
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
        }}
      >
        {/* Header + scrollable body. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0, // lets the inner scroll region size correctly
          }}
        >
          {/* Header: pack title + close button. */}
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
                {npcName}'s wordbook
              </div>
              <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 600 }}>
                {pack.theme} · {pack.entries.length} words
              </div>
            </div>
            {/* Header actions — Practice is the primary CTA (gold)
                and Back is the muted secondary. Putting them in
                this order (primary right) matches every cozy-game
                menu pattern players have already learned. The
                Back label (vs a ✕) reads as "return to where I
                came from", which lines up with the actual
                behaviour: closing pops back to the offer dialogue
                (the snapshot is held in returnDialogue), not to
                the world. */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                style={{
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLORS.text,
                  background: COLORS.cardRest,
                  border: `2px solid ${COLORS.cardBorder}`,
                  boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
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
                ◀ Back
              </button>
              <button
                type="button"
                onClick={() => setMode({ kind: 'practice-picker' })}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff5d6',
                  background: COLORS.accentGold,
                  border: `2px solid ${COLORS.accentGoldDark}`,
                  boxShadow: `inset 1px 1px 0 0 #ffd47a, 0 2px 0 0 ${COLORS.accentGoldDark}`,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  letterSpacing: 0.4,
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
                ▶ Practice
              </button>
            </div>
          </div>

          {/* Scrollable list. Custom scrollbar styling brings the
              chrome inline with the parchment frame so the column
              doesn't look like a stray browser widget on top. */}
          <div
            className="vocab-scroll"
            style={{
              overflowY: 'scroll',
              padding: '8px 10px 12px',
              flex: 1,
              minHeight: 0,
              // iOS-specific scroll hints. Without these iOS Safari
              // sometimes refuses to recognise an absolutely-positioned
              // overflow region as scrollable — the user reports the
              // word list "completely freezing" on certain pages,
              // matching that behaviour. `pan-y` keeps tap-to-expand
              // working while permitting vertical drag. The legacy
              // `-webkit-overflow-scrolling` is harmless on modern
              // iOS and unblocks momentum on the few older builds
              // still out there. `overscroll-behavior: contain` stops
              // a runaway scroll from triggering pull-to-refresh on
              // the underlying page.
              touchAction: 'pan-y',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
            }}
          >
            {entriesWithExamples.map(({ entry, examples }) => {
              const isExpanded = expandedId === entry.target;
              return (
                <div
                  key={entry.target}
                  style={{
                    background: isExpanded ? COLORS.cardActive : COLORS.cardRest,
                    border: `2px solid ${COLORS.cardBorder}`,
                    boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                    marginBottom: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : entry.target)}
                >
                  {/* Word row: target | english | speaker */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: '0 0 auto', minWidth: 100 }}>
                      <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>
                        {entry.target}
                      </div>
                      <div style={{ color: COLORS.hintText, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
                        {entry.pos}
                      </div>
                    </div>
                    <div style={{ flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 1.3 }}>
                      {entry.english}
                    </div>
                    <button
                      type="button"
                      aria-label={`Pronounce ${entry.target}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSpeak(entry.target);
                      }}
                      style={{
                        fontFamily: 'inherit',
                        fontSize: 14,
                        background: COLORS.speakerBg,
                        border: `2px solid ${COLORS.cardBorder}`,
                        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        flex: '0 0 auto',
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.background = COLORS.speakerBgActive;
                        e.currentTarget.style.transform = 'translateY(2px)';
                        e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}`;
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.background = COLORS.speakerBg;
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = COLORS.speakerBg;
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`;
                      }}
                    >
                      🔊
                    </button>
                  </div>

                  {/* Expanded examples — only shown for the active row. */}
                  {isExpanded ? (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: `1px dashed ${COLORS.cardBorder}`,
                      }}
                    >
                      <div
                        style={{
                          color: COLORS.accentGoldDark,
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 6,
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
                            fontSize: 13,
                            lineHeight: 1.5,
                            marginBottom: i === 0 ? 4 : 0,
                          }}
                        >
                          <span style={{ color: COLORS.accentGoldDark, marginRight: 4 }}>·</span>
                          {/* Highlight the target word inside the sentence
                              so the eye lands on it immediately. */}
                          {renderSentenceWithHighlight(sentence, entry.target)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Custom scrollbar styling. Webkit + standard. The parchment
              tones keep the column looking like an in-game element
              instead of a generic browser scrollbar. */}
          <style>{`
            .vocab-scroll {
              scrollbar-width: auto;
              scrollbar-color: ${COLORS.cardBorder} ${COLORS.parchmentShadow};
            }
            .vocab-scroll::-webkit-scrollbar {
              width: 12px;
            }
            .vocab-scroll::-webkit-scrollbar-track {
              background: ${COLORS.parchmentShadow};
              border-left: 2px solid ${COLORS.cardBorder};
            }
            .vocab-scroll::-webkit-scrollbar-thumb {
              background: ${COLORS.cardBorder};
              border: 2px solid ${COLORS.accentGoldDark};
            }
            .vocab-scroll::-webkit-scrollbar-thumb:hover {
              background: ${COLORS.accentGoldDark};
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}

/**
 * Bold the target word every time it appears in the example
 * sentence. Case-sensitive on purpose — our examples insert the
 * lowercase target and only that lowercase form should highlight,
 * not "${t}" embedded in an English word. If the target ever sits at
 * the start of a sentence (e.g. greeting templates), it stays
 * lowercased so the highlight still matches.
 */
function renderSentenceWithHighlight(sentence: string, target: string) {
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

/** Mode picker shown between the dictionary and the practice drill.
 *  Mirrors the translator-job offer's mode menu (read / listen,
 *  with write & speak as comingSoon placeholders) so the player
 *  has the same vocabulary of options whether they're getting paid
 *  or not. Lives inside the list view because that's where Practice
 *  is launched from; sits in the same modal frame so navigation
 *  feels continuous. */
function PracticeModePicker({
  npcName,
  onPick,
  onCancel,
}: {
  npcName: string;
  onPick: (mode: 'read' | 'listen' | 'write') => void;
  onCancel: () => void;
}) {
  const options: Array<
    | { id: 'read' | 'listen' | 'write'; label: string; hint: string; comingSoon?: false }
    | { id: 'speak'; label: string; hint: string; comingSoon: true }
  > = [
    {
      id: 'read',
      label: '1. Read & match',
      hint: 'See each word in writing, pick its meaning.',
    },
    {
      id: 'listen',
      label: '2. Listen & match',
      hint: 'Hear each word spoken, pick its meaning.',
    },
    {
      id: 'write',
      label: '3. Write from meaning',
      hint: 'See the meaning, type the word.',
    },
    {
      id: 'speak',
      label: '4. Speak from meaning',
      hint: 'See the meaning, say the word out loud.',
      comingSoon: true,
    },
  ];

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
            padding: 18,
            width: '100%',
            maxWidth: 380,
            maxHeight: '90dvh',
            gap: 12,
          }}
        >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: COLORS.hintText, fontWeight: 700 }}>
            Practice with {npcName}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
            How would you like to practice?
          </div>
          <div style={{ fontSize: 11, color: COLORS.hintText, marginTop: 4, fontStyle: 'italic' }}>
            No money on the line — drill freely.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt) => {
            const disabled = opt.comingSoon === true;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onPick(opt.id as 'read' | 'listen' | 'write');
                }}
                style={{
                  textAlign: 'left',
                  background: disabled ? COLORS.parchmentLight : COLORS.cardRest,
                  border: `2px solid ${COLORS.cardBorder}`,
                  borderRadius: 4,
                  padding: '10px 12px',
                  fontFamily: 'inherit',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  boxShadow: disabled
                    ? 'none'
                    : `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{opt.label}</span>
                  {disabled && (
                    <span
                      style={{
                        fontSize: 9,
                        background: COLORS.hintText,
                        color: COLORS.parchmentLight,
                        padding: '1px 6px',
                        letterSpacing: 1,
                        fontWeight: 700,
                      }}
                    >
                      SOON
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: COLORS.hintText, lineHeight: 1.4 }}>{opt.hint}</div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onCancel}
          style={{
            background: COLORS.parchmentLight,
            color: COLORS.text,
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 4,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}
