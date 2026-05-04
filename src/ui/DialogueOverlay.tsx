'use client';

import { useEffect, useState, useCallback } from 'react';
import { DialogueState } from '../core/types';
import { speakDialogue } from './tts';
import { playAudioUrl } from './audioEngine';

interface DialogueOverlayProps {
  dialogue: DialogueState;
  onAdvance: () => void;
  /** Fires when the player taps one of the prompt's option buttons.
   *  Receives the option's stable id (e.g. 'view', 'help'). The
   *  overlay just reports the selection up to whoever owns the
   *  dialogue state — it doesn't decide what happens. */
  onSelectOption?: (optionId: string) => void;
}

/** Milliseconds between revealed characters during the typewriter
 *  pass. ~22ms ≈ 45 chars/sec — brisk but still legibly per-letter
 *  in JRPG style. Tap on the dialogue box snaps the rest in. */
const TYPEWRITER_INTERVAL_MS = 22;

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

  // Typewriter reveal state — number of characters of `currentLine`
  // currently visible. Resets to 0 whenever the line changes so each
  // line plays its own pass; tapping the box mid-pass snaps to full.
  const [revealedCount, setRevealedCount] = useState(0);
  const isFullyRevealed = revealedCount >= currentLine.length;
  const visibleText = currentLine.slice(0, revealedCount);

  useEffect(() => {
    setRevealedCount(0);
    if (!currentLine) return;
    let i = 0;
    const tick = () => {
      i += 1;
      setRevealedCount(i);
      if (i < currentLine.length) {
        timer = window.setTimeout(tick, TYPEWRITER_INTERVAL_MS);
      }
    };
    let timer = window.setTimeout(tick, TYPEWRITER_INTERVAL_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [currentLine, dialogue.npcId]);

  // Tap on the parchment: if still typing, fast-forward; if revealed
  // and the dialogue is a sequence (no options), advance to next
  // line; if it's a prompt with options, ignore (player picks via the
  // option buttons, which stopPropagation themselves).
  const handleBoxClick = useCallback(() => {
    if (!isFullyRevealed) {
      setRevealedCount(currentLine.length);
      return;
    }
    if (hasOptions) return;
    onAdvance();
  }, [isFullyRevealed, hasOptions, currentLine.length, onAdvance]);

  useEffect(() => {
    if (!currentLine) return;
    if (dialogue.audioUrl) {
      // Pre-recorded voice line — play the asset via the shared Web
      // Audio engine and skip TTS so the browser doesn't speak over
      // it. The engine cleanly cuts off any prior fire of the same
      // URL (so a line change replaces, not stacks). It returns a
      // promise but we don't need to await — the next render will
      // queue or replace as needed.
      void playAudioUrl(dialogue.audioUrl);
    } else {
      speakDialogue(currentLine);
    }
    // Intentionally NO cleanup-time cancel for either path. Calling
    // `speechSynthesis.cancel()` on iOS Safari triggers a 1-2 second
    // main-thread stutter while the OS speech daemon flushes its
    // audio session — observable as "tap NPC, tap away, ~2s later
    // the game freezes for 1s." For the MP3 path the cost would be
    // smaller but the UX is the same: letting the line finish
    // naturally feels less abrupt than a hard cut, and replacement
    // utterances (advancing dialogue, opening a new NPC chat) take
    // over via the line-change branch above.
  }, [currentLine, dialogue.npcId, dialogue.audioUrl]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 50,
      }}
      onClick={handleBoxClick}
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
              against parchment. The hidden remainder span reserves the
              full final height during typewriter reveal so the box
              doesn't grow line-by-line as text appears — that'd make
              the surrounding layout flicker. */}
          <div
            style={{
              color: COLORS.text,
              fontSize: 15,
              lineHeight: 1.5,
              marginBottom: hasOptions ? 12 : 8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {visibleText}
            {!isFullyRevealed ? (
              <span aria-hidden style={{ visibility: 'hidden' }}>
                {currentLine.slice(revealedCount)}
              </span>
            ) : null}
          </div>

          {/* Options stay hidden until the line finishes typing — the
              player shouldn't be able to pick before they've read the
              prompt. Same idea for the "tap to continue" indicator
              below. */}
          {hasOptions && isFullyRevealed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {dialogue.options!.map((opt) => {
                const isDisabled = !!opt.disabled || !!opt.comingSoon;
                const showSoonBadge = !!opt.comingSoon;
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
                      {showSoonBadge ? (
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
          ) : !hasOptions && isFullyRevealed ? (
            // Continue indicator — tiny pixel triangle bouncing at the
            // bottom-right, the standard JRPG "more text below" cue.
            // Hidden during the typewriter pass; otherwise the player
            // sees "tap to continue" before they've read the line.
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
          ) : null}
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
