'use client';

import { useEffect, useState, useCallback } from 'react';
import { DialogueState } from '../core/types';
import { speakDialogue } from './tts';
import { playAudioUrl } from './audioEngine';
import { getDialogueTheme } from './dialogueThemes';

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

export default function DialogueOverlay({ dialogue, onAdvance, onSelectOption }: DialogueOverlayProps) {
  const theme = getDialogueTheme();
  const COLORS = theme.colors;
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
      // Pre-recorded voice line: play the asset via the shared Web
      // Audio engine and skip TTS so the browser does not speak over
      // it. The engine cleanly cuts off any prior fire of the same
      // URL, so a line change replaces instead of stacking.
      void playAudioUrl(dialogue.audioUrl);
    } else {
      speakDialogue(currentLine);
    }
    // Intentionally no cleanup-time cancel for either path. Calling
    // `speechSynthesis.cancel()` on iOS Safari can trigger a main-
    // thread stutter while the OS speech daemon flushes its audio
    // session. Letting the line finish is less abrupt, and replacement
    // utterances take over through this line-change effect.
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
      {/* Theme frame: defaults to the cutscene parchment panel, with
          the older wood-frame skin still available in dialogueThemes. */}
      <div style={theme.frameStyle}>
        {/* Inner panel: parchment with a subtle highlight bevel along
            the top-left and a darker shade along the bottom-right.
            Achieved with two stacked box-shadows so we don't need
            extra DOM. */}
        <div style={theme.panelStyle}>
          {/* Name plaque — amber underline, slight letter-spacing for
              that "stamped on the page" feel. */}
          <div style={theme.namePlaqueStyle}>
            {dialogue.npcName}
          </div>

          {/* Body text. Bumped line-height for cozy reading; brown ink
              against parchment. The hidden remainder span reserves the
              full final height during typewriter reveal so the box
              doesn't grow line-by-line as text appears — that'd make
              the surrounding layout flicker. */}
          <div
            style={{
              ...theme.bodyTextStyle,
              marginBottom: hasOptions ? 12 : 8,
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
            <div style={theme.optionsStyle}>
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
                      ...theme.optionButtonStyle,
                      boxShadow: isDisabled
                        ? 'none'
                        : theme.optionButtonRestShadow,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.55 : 1,
                    }}
                    onMouseDown={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.transform = 'translateY(2px)';
                      e.currentTarget.style.boxShadow = theme.optionButtonPressedShadow;
                    }}
                    onMouseUp={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.transform = '';
                      e.currentTarget.style.boxShadow = theme.optionButtonRestShadow;
                    }}
                    onMouseEnter={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.background = COLORS.optionHover;
                    }}
                    onMouseLeave={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.background = COLORS.optionRest;
                      e.currentTarget.style.transform = '';
                      e.currentTarget.style.boxShadow = theme.optionButtonRestShadow;
                    }}
                  >
                    <div style={theme.optionLabelStyle}>
                      <span>{opt.label}</span>
                      {showSoonBadge ? (
                        <span style={theme.soonBadgeStyle}>
                          SOON
                        </span>
                      ) : null}
                    </div>
                    {opt.hint ? (
                      <div style={theme.optionHintStyle}>
                        {opt.hint}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : !hasOptions && theme.continueMode === 'button' ? (
            <div style={theme.footerStyle}>
              <div style={theme.footerHintStyle}>
                {isFullyRevealed ? 'Tap or press Space to continue' : 'Tap to skip...'}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleBoxClick();
                }}
                style={{
                  ...theme.continueButtonStyle,
                  opacity: isFullyRevealed ? 1 : 0.6,
                }}
              >
                {isFullyRevealed ? (isLastLine ? 'Close ▶' : 'Next ▶') : 'Skip'}
              </button>
            </div>
          ) : !hasOptions && isFullyRevealed ? (
            // Continue indicator — tiny pixel triangle bouncing at the
            // bottom-right, the standard JRPG "more text below" cue.
            // Hidden during the typewriter pass; otherwise the player
            // sees "tap to continue" before they've read the line.
            <div style={theme.continueIndicatorStyle}>
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
