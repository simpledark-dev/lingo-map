'use client';

import { useEffect } from 'react';
import { DialogueState } from '../core/types';
import { speakDialogue, cancelDialogueSpeech } from './tts';

interface DialogueOverlayProps {
  dialogue: DialogueState;
  onAdvance: () => void;
  /** Fires when the player taps one of the prompt's option buttons.
   *  Receives the option's stable id (e.g. 'view', 'help'). The
   *  overlay just reports the selection up to whoever owns the
   *  dialogue state — it doesn't decide what happens. */
  onSelectOption?: (optionId: string) => void;
}

// ── Cozy pixel-art palette ──
// Warm parchment background + dark wood-brown frame + amber accents.
// All borders are sharp (no border-radius, no anti-aliasing) and the
// drop shadow is a hard offset, no blur — that's the look of a 16-bit
// RPG dialogue box. If we move to bitmap-asset frames later this
// CSS-only version slots out cleanly.
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
  optionRest: '#f0d28a',
  optionHover: '#fff0b8',
  optionBorder: '#6b3f1a',
  hintText: '#7b5530',
};

export default function DialogueOverlay({ dialogue, onAdvance, onSelectOption }: DialogueOverlayProps) {
  const isLastLine = dialogue.currentLine >= dialogue.lines.length - 1;
  const currentLine = dialogue.lines[dialogue.currentLine] ?? '';
  // When `options` is set the dialogue is a static prompt with choice
  // buttons instead of a sequence the player advances through —
  // tapping the box must NOT call onAdvance, otherwise the click that
  // lands on the choice area would dismiss the prompt before the user
  // could read it.
  const hasOptions = !!dialogue.options && dialogue.options.length > 0;

  useEffect(() => {
    if (!currentLine) return;
    speakDialogue(currentLine);
    return cancelDialogueSpeech;
  }, [currentLine, dialogue.npcId]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 50,
      }}
      onClick={hasOptions ? undefined : onAdvance}
    >
      {/* Outer frame: dark wood with hard drop-shadow for "weight". */}
      <div
        style={{
          background: COLORS.wood,
          border: `3px solid ${COLORS.woodShadow}`,
          boxShadow: `0 4px 0 0 ${COLORS.woodShadow}`,
          padding: 4,
          imageRendering: 'pixelated',
          fontFamily: 'var(--font-geist-mono), ui-monospace, "Courier New", monospace',
          maxWidth: 720,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {/* Inner panel: parchment with a subtle highlight bevel along
            the top-left and a darker shade along the bottom-right.
            Achieved with two stacked box-shadows so we don't need
            extra DOM. */}
        <div
          style={{
            background: COLORS.parchment,
            border: `2px solid ${COLORS.woodLight}`,
            boxShadow: `inset 2px 2px 0 0 ${COLORS.parchmentLight}, inset -2px -2px 0 0 ${COLORS.parchmentShadow}`,
            padding: '14px 16px 12px',
          }}
        >
          {/* Name plaque — amber underline, slight letter-spacing for
              that "stamped on the page" feel. */}
          <div
            style={{
              color: COLORS.accentGoldDark,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              borderBottom: `2px solid ${COLORS.accentGold}`,
              paddingBottom: 4,
              marginBottom: 10,
              display: 'inline-block',
            }}
          >
            {dialogue.npcName}
          </div>

          {/* Body text. Bumped line-height for cozy reading; brown ink
              against parchment. */}
          <div
            style={{
              color: COLORS.text,
              fontSize: 15,
              lineHeight: 1.5,
              marginBottom: hasOptions ? 12 : 8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {currentLine}
          </div>

          {hasOptions ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {dialogue.options!.map((opt) => {
                const isDisabled = !!opt.disabled;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    // stopPropagation keeps the outer parchment's click
                    // handler from also firing (which would advance the
                    // dialogue when no options are present). Disabled
                    // options short-circuit before forwarding so the
                    // parent never sees a click for a not-yet-built mode.
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDisabled) return;
                      onSelectOption?.(opt.id);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      background: COLORS.optionRest,
                      border: `2px solid ${COLORS.optionBorder}`,
                      boxShadow: isDisabled
                        ? 'none'
                        : `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.optionBorder}`,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      color: COLORS.text,
                      opacity: isDisabled ? 0.55 : 1,
                      transition: 'transform 80ms ease-out, background 120ms',
                    }}
                    onMouseDown={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.transform = 'translateY(2px)';
                      e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}`;
                    }}
                    onMouseUp={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.transform = '';
                      e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.optionBorder}`;
                    }}
                    onMouseEnter={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.background = COLORS.optionHover;
                    }}
                    onMouseLeave={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.background = COLORS.optionRest;
                      e.currentTarget.style.transform = '';
                      e.currentTarget.style.boxShadow = `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.optionBorder}`;
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{opt.label}</span>
                      {isDisabled ? (
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
                      ) : null}
                    </div>
                    {opt.hint ? (
                      <div style={{ fontSize: 11, color: COLORS.hintText, marginTop: 3, lineHeight: 1.4 }}>
                        {opt.hint}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            // Continue indicator — tiny pixel triangle bouncing at the
            // bottom-right, the standard JRPG "more text below" cue.
            <div
              style={{
                color: COLORS.accentGoldDark,
                fontSize: 11,
                textAlign: 'right',
                marginTop: 4,
                animation: 'lingoMapDialogueBlink 1.1s ease-in-out infinite',
              }}
            >
              {isLastLine ? '▼ tap to close' : '▼ tap to continue'}
            </div>
          )}
        </div>

        <style>{`
          @keyframes lingoMapDialogueBlink {
            0%, 100% { opacity: 1; transform: translateY(0); }
            50%       { opacity: 0.5; transform: translateY(2px); }
          }
        `}</style>
      </div>
    </div>
  );
}
