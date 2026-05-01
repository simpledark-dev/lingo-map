'use client';

import { useState, useMemo } from 'react';
import { VocabularyPack, getExamples } from '../data/vocabularyPacks';
import { speakDialogue, cancelDialogueSpeech } from './tts';

interface VocabularyListViewProps {
  pack: VocabularyPack;
  npcName: string;
  onClose: () => void;
}

// ── Cozy palette (kept in sync with DialogueOverlay) ──
// Warm parchment + dark wood frame, sharp pixel borders, hard
// drop-shadows. If we add bitmap-asset frames later this CSS-only
// version slots out cleanly.
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
};

export default function VocabularyListView({ pack, npcName, onClose }: VocabularyListViewProps) {
  // Only one row expanded at a time — keeps the list short and
  // matches the "tap to peek, tap again to close" pattern players
  // already know from any phone-app collapsible list.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Pre-compute examples once per entry. Cheap (~150 string concats)
  // but no point doing it on every render.
  const entriesWithExamples = useMemo(
    () => pack.entries.map((e) => ({ entry: e, examples: getExamples(e) })),
    [pack.entries],
  );

  const handleSpeak = (target: string) => {
    // Cancel any prior utterance (TTS panel button mashing) so we
    // don't queue a backlog.
    cancelDialogueSpeech();
    speakDialogue(target);
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
        // Treat clicks on the dim background as a "close" action,
        // standard modal behavior.
      }}
      onClick={onClose}
    >
      {/* Outer wood frame, same construction as DialogueOverlay. */}
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
          maxWidth: 560,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Inner parchment panel. Header + scrollable body. */}
        <div
          style={{
            background: COLORS.parchment,
            border: `2px solid ${COLORS.woodLight}`,
            boxShadow: `inset 2px 2px 0 0 ${COLORS.parchmentLight}, inset -2px -2px 0 0 ${COLORS.parchmentShadow}`,
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
                {npcName}'s wordbook
              </div>
              <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 600 }}>
                {pack.theme} · {pack.entries.length} words
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
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
              ✕ close
            </button>
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
              scrollbar-color: ${COLORS.woodLight} ${COLORS.parchmentShadow};
            }
            .vocab-scroll::-webkit-scrollbar {
              width: 12px;
            }
            .vocab-scroll::-webkit-scrollbar-track {
              background: ${COLORS.parchmentShadow};
              border-left: 2px solid ${COLORS.woodLight};
            }
            .vocab-scroll::-webkit-scrollbar-thumb {
              background: ${COLORS.woodLight};
              border: 2px solid ${COLORS.woodShadow};
            }
            .vocab-scroll::-webkit-scrollbar-thumb:hover {
              background: ${COLORS.wood};
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
