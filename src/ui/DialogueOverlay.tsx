"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { DialogueState } from "../core/types";
import { t } from "../data/i18n";
import { getDialogueTheme, type DialogueThemeColors } from "./dialogueThemes";
import { playSfx, SFX } from "./sfx";

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
const TRANSLATE_MODE_OPTION_COLORS: Record<
  string,
  { bg: string; hover: string; border: string }
> = {
  "mode-read": { bg: "#f3d895", hover: "#ffe7a8", border: "#9a6e16" },
  "mode-listen": { bg: "#dce4b7", hover: "#edf2ca", border: "#697a3a" },
  "mode-write": { bg: "#cfe1e8", hover: "#e0eef3", border: "#3b87a6" },
  "mode-speak": { bg: "#e9c7bc", hover: "#f3d7ce", border: "#8f5a68" },
};
const TRANSLATE_MODE_OPTION_NUMBERS: Record<string, string> = {
  "mode-read": "1",
  "mode-listen": "2",
  "mode-write": "3",
  "mode-speak": "4",
};

/** Leave-the-conversation options pick up a small glyph so the
 *  player can spot the exit at a glance instead of reading every
 *  label. `←` for "back to previous menu", `✕` for "close the
 *  whole interaction". Detection is by id pattern — every leave
 *  id we use already follows one of these conventions, so adding
 *  a new one needs no type change. */
function leaveIcon(optionId: string): "back" | "exit" | null {
  if (optionId === "mode-back") return "back";
  if (/(^|-)decline$/.test(optionId)) return "exit";
  return null;
}

/** Cozy palette for the per-speaker name plaque. Picked to read
 *  cleanly against the parchment background without fighting the
 *  theme's gold accents. The first entry is the existing
 *  amber-gold so anonymous / single-NPC dialogues look unchanged
 *  from before. */
const SPEAKER_COLORS = [
  '#8b4f10', // amber-gold (default — same as before)
  '#2d6a8a', // teal
  '#9c3a5b', // rose
  '#3a6e3a', // forest
  '#6b3a7e', // plum
  '#a0581f', // burnt orange
] as const;

/** Stable colour for a given speaker name. Hash → palette index, so
 *  the same character always paints the same colour and players can
 *  glance at the plaque to tell who's speaking without reading the
 *  letters. Empty / null names fall through to the default amber. */
function speakerColor(name: string): string {
  if (!name) return SPEAKER_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return SPEAKER_COLORS[Math.abs(h) % SPEAKER_COLORS.length];
}

function plainDialogueText(line: string): string {
  return line.replace(/<\/?(gain|loss|warn)>/g, "");
}

function renderDialogueText(
  line: string,
  visibleChars: number,
  colors: DialogueThemeColors,
) {
  const nodes: ReactNode[] = [];
  const tagRe = /<(gain|loss|warn)>(.*?)<\/\1>/g;
  let cursor = 0;
  let remaining = visibleChars;
  let key = 0;

  const push = (text: string, tone?: "gain" | "loss" | "warn") => {
    if (!text || remaining <= 0) return;
    const shown = text.slice(0, remaining);
    remaining -= shown.length;
    if (!tone) {
      nodes.push(shown);
      return;
    }
    const color =
      tone === "gain" ? colors.correct : tone === "loss" ? colors.wrong : colors.active;
    const bg =
      tone === "gain" ? colors.correctBg : tone === "loss" ? colors.wrongBg : colors.cardActive;
    nodes.push(
      <span
        key={`tone-${key++}`}
        style={{
          display: "inline-block",
          color,
          background: bg,
          border: `1px solid ${color}`,
          borderRadius: 3,
          padding: "0 3px",
          fontWeight: 900,
          lineHeight: 1.25,
        }}
      >
        {shown}
      </span>,
    );
  };

  for (const match of line.matchAll(tagRe)) {
    push(line.slice(cursor, match.index));
    push(match[2], match[1] as "gain" | "loss" | "warn");
    cursor = (match.index ?? 0) + match[0].length;
  }
  push(line.slice(cursor));
  return nodes;
}

export default function DialogueOverlay({
  dialogue,
  onAdvance,
  onSelectOption,
}: DialogueOverlayProps) {
  const theme = getDialogueTheme();
  const COLORS = theme.colors;
  const isLastLine = dialogue.currentLine >= dialogue.lines.length - 1;
  const currentLine = dialogue.lines[dialogue.currentLine] ?? "";
  const plainCurrentLine = plainDialogueText(currentLine);
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
  const isFullyRevealed = revealedCount >= plainCurrentLine.length;

  // Timer id for the pending typewriter tick — kept in a ref so
  // handleBoxClick can cancel it when the player fast-forwards.
  // Without this, clicking mid-pass briefly snaps to full text but
  // the next tick (within 22ms) overwrites revealedCount back to
  // its local `i`, making the click look like a no-op.
  const typewriterTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentLine) {
      setRevealedCount(0);
      return;
    }
    // Skip-typewriter dialogues land fully revealed in a single
    // tick — used when we RESTORE copy the player already read
    // (e.g. the translator-offer menu after closing the wordlist).
    // Replaying the typing pass on familiar lines feels like the
    // game forgot itself.
    if (dialogue.skipTypewriter) {
      setRevealedCount(plainCurrentLine.length);
      return;
    }
    setRevealedCount(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setRevealedCount(i);
      if (i < plainCurrentLine.length) {
        typewriterTimerRef.current = window.setTimeout(tick, TYPEWRITER_INTERVAL_MS);
      } else {
        typewriterTimerRef.current = null;
      }
    };
    typewriterTimerRef.current = window.setTimeout(tick, TYPEWRITER_INTERVAL_MS);
    return () => {
      if (typewriterTimerRef.current !== null) {
        window.clearTimeout(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    };
  }, [currentLine, plainCurrentLine.length, dialogue.npcId, dialogue.skipTypewriter]);

  // Settle time between typewriter completion and option render.
  // Without this, the same React tick that paints the last
  // character also flips `isFullyRevealed` true and reveals the
  // option buttons — the player's eye is still tracking the
  // typewriter and the options feel like they jumped the gun.
  // 250ms is enough to read as "the line landed, now choose."
  // Restored dialogues (skipTypewriter) bypass the wait — replaying
  // a settle on familiar copy is just lag.
  const [optionsSettled, setOptionsSettled] = useState(false);
  useEffect(() => {
    if (!hasOptions || !isLastLine || !isFullyRevealed) {
      setOptionsSettled(false);
      return;
    }
    if (dialogue.skipTypewriter) {
      setOptionsSettled(true);
      return;
    }
    const t = window.setTimeout(() => setOptionsSettled(true), 250);
    return () => window.clearTimeout(t);
  }, [hasOptions, isLastLine, isFullyRevealed, dialogue.skipTypewriter]);

  // Tap on the parchment: if still typing, fast-forward; otherwise
  // advance to next line. Only the LAST line of an options dialogue
  // locks the tap — that's where the choice buttons live and we
  // don't want a stray box-tap dismissing them. Intermediate lines
  // of multi-line options dialogues (e.g. CEO's paycheck monologue
  // before the Claim button) must still advance on tap, otherwise
  // the player stalls on line 0 and never reaches the choices.
  const handleBoxClick = useCallback(() => {
    if (!isFullyRevealed) {
      // Cancel the pending typewriter tick — without this, the
      // next scheduled tick fires within 22ms and overwrites
      // revealedCount back to its closure-local `i` value, making
      // the fast-forward briefly flash full text and then snap
      // back to mid-typewriter.
      if (typewriterTimerRef.current !== null) {
        window.clearTimeout(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
      setRevealedCount(plainCurrentLine.length);
      return;
    }
    if (hasOptions && isLastLine) return;
    // Audible "page turn" cue — fires ONLY when we're actually
    // advancing past a fully-revealed line, never on the
    // fast-forward branch above. The two taps feel different
    // (skip = "show me the rest", advance = "I read it, next");
    // pairing only the advance with sound preserves that
    // distinction.
    playSfx(SFX.NEXT_DIALOGUE);
    onAdvance();
  }, [isFullyRevealed, hasOptions, isLastLine, plainCurrentLine.length, onAdvance]);

  // Main-game NPC dialogue is native-language English, so it stays
  // silent. Foreign-word audio lives in the vocabulary views via
  // `wordSpeak`, where the player is explicitly learning the target
  // language.

  return (
    <div
      style={{
        position: "absolute",
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
        <div
          style={{
            ...theme.panelStyle,
            // Option prompts are short menu copy, not multi-line story text.
            // The cutscene-style theme normally reserves vertical space for
            // typewriter stability; remove that reserved gap here so choices
            // sit close to the utterance without negative margins.
            gap: hasOptions ? 4 : theme.panelStyle.gap,
          }}
        >
          {/* Name plaque — amber underline, slight letter-spacing for
              that "stamped on the page" feel. The plaque color is
              derived from a hash of the speaker's name so that
              back-and-forth dialogues (apartment monologue, future
              multi-party scenes) clearly signal who's talking just
              from the colour switch — no extra portraits needed. */}
          <div
            style={{
              ...theme.namePlaqueStyle,
              color: speakerColor(dialogue.npcName),
              borderBottomColor: speakerColor(dialogue.npcName),
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
              ...theme.bodyTextStyle,
              minHeight: hasOptions ? 0 : theme.bodyTextStyle.minHeight,
              marginBottom: hasOptions ? 6 : 8,
            }}
          >
            {renderDialogueText(currentLine, revealedCount, COLORS)}
            {!isFullyRevealed ? (
              <span aria-hidden style={{ visibility: "hidden" }}>
                {plainCurrentLine.slice(revealedCount)}
              </span>
            ) : null}
          </div>

          {/* Options stay hidden until the LAST line finishes typing
              — the player shouldn't be able to pick before they've
              read the whole prompt, and on multi-line dialogues
              (e.g. CEO intro) gating only on `isFullyRevealed`
              would surface choices on line 0 with more text still
              to come. Fade-in softens the appearance so it doesn't
              pop. */}
          {hasOptions && optionsSettled ? (
            <div
              className={
                'lingo-dlg-options' +
                (dialogue.options!.some((o) => TRANSLATE_MODE_OPTION_COLORS[o.id])
                  ? ' is-mode-grid'
                  : '')
              }
              style={{
                ...theme.optionsStyle,
                animation: 'lingoMapDialogueOptionsIn 220ms ease-out',
              }}
            >
              {dialogue.options!.map((opt) => {
                const isDisabled = !!opt.disabled || !!opt.comingSoon;
                const showSoonBadge = !!opt.comingSoon;
                const modeOptionColors = TRANSLATE_MODE_OPTION_COLORS[opt.id];
                const modeOptionNumber = TRANSLATE_MODE_OPTION_NUMBERS[opt.id];
                const leaveKind = leaveIcon(opt.id);
                const labelText = modeOptionNumber
                  ? opt.label.replace(/^\d+\.\s*/, "")
                  : leaveKind
                    ? opt.label.replace(/^[←✕]\s*/, "")
                    : opt.label;
                const optionRestShadow = modeOptionColors
                  ? `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${modeOptionColors.border}`
                  : theme.optionButtonRestShadow;
                const optionPressedShadow = modeOptionColors
                  ? `inset 1px 1px 0 0 ${COLORS.parchmentLight}`
                  : theme.optionButtonPressedShadow;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={
                      modeOptionColors
                        ? 'lingo-dlg-mode-option'
                        : leaveKind
                          ? 'lingo-dlg-leave-option'
                          : undefined
                    }
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
                      background: modeOptionColors?.bg ?? theme.optionButtonStyle.background,
                      border: modeOptionColors
                        ? `2px solid ${modeOptionColors.border}`
                        : theme.optionButtonStyle.border,
                      boxShadow: isDisabled ? "none" : optionRestShadow,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: isDisabled ? 0.55 : 1,
                      touchAction: "manipulation",
                    }}
                    onPointerDown={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      e.currentTarget.style.transform = "translateY(2px)";
                      e.currentTarget.style.boxShadow = optionPressedShadow;
                    }}
                    onPointerUp={(e) => {
                      if (isDisabled) return;
                      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                      e.currentTarget.style.transform = "";
                      e.currentTarget.style.boxShadow = optionRestShadow;
                    }}
                    onPointerCancel={(e) => {
                      if (isDisabled) return;
                      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                      e.currentTarget.style.transform = "";
                      e.currentTarget.style.boxShadow = optionRestShadow;
                    }}
                    onMouseEnter={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.background =
                        modeOptionColors?.hover ?? COLORS.optionHover;
                    }}
                    onMouseLeave={(e) => {
                      if (isDisabled) return;
                      e.currentTarget.style.background =
                        modeOptionColors?.bg ?? COLORS.optionRest;
                      e.currentTarget.style.transform = "";
                      e.currentTarget.style.boxShadow = optionRestShadow;
                    }}
                  >
                    <div style={theme.optionLabelStyle}>
                      {modeOptionNumber ? (
                        <span
                          style={{
                            minWidth: 24,
                            height: 22,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: modeOptionColors?.border ?? COLORS.accentGold,
                            border: `1px solid ${COLORS.cardBorder}`,
                            borderRadius: 3,
                            boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}`,
                            color: COLORS.parchmentLight,
                            fontSize: 12,
                            fontWeight: 800,
                            lineHeight: 1,
                          }}
                        >
                          {modeOptionNumber}
                        </span>
                      ) : leaveKind ? (
                        <span
                          aria-hidden
                          style={{
                            minWidth: 24,
                            height: 22,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: COLORS.parchmentLight,
                            border: `1px solid ${COLORS.cardBorder}`,
                            borderRadius: 3,
                            boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}`,
                            color: COLORS.hintText,
                            fontSize: 13,
                            fontWeight: 800,
                            lineHeight: 1,
                          }}
                        >
                          {leaveKind === "back" ? "←" : "✕"}
                        </span>
                      ) : null}
                      <span>{labelText}</span>
                      {showSoonBadge ? (
                        <span style={theme.soonBadgeStyle}>{t('common.soon')}</span>
                      ) : null}
                    </div>
                    {opt.hint ? (
                      <div style={theme.optionHintStyle}>{opt.hint}</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : !hasOptions && theme.continueMode === "button" ? (
            <div style={theme.footerStyle}>
              <div style={theme.footerHintStyle}>
                {isFullyRevealed
                  ? t('dialogue.control.tapContinue')
                  : t('dialogue.control.tapSkip')}
              </div>
              {/* Continue button only shows once the line is fully
                  revealed. During the typewriter pass, tap-on-box
                  already fast-forwards (see handleBoxClick), so a
                  separate "Skip" button was a duplicated affordance
                  that did nothing the box-tap didn't already do. */}
              {isFullyRevealed && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBoxClick();
                  }}
                  style={theme.continueButtonStyle}
                >
                  {isLastLine ? t('dialogue.control.close') : t('dialogue.control.next')}
                </button>
              )}
            </div>
          ) : !hasOptions && isFullyRevealed ? (
            // Continue indicator — tiny pixel triangle bouncing at the
            // bottom-right, the standard JRPG "more text below" cue.
            // Hidden during the typewriter pass; otherwise the player
            // sees "tap to continue" before they've read the line.
            <div style={theme.continueIndicatorStyle}>
              {isLastLine
                ? t('dialogue.control.indicatorClose')
                : t('dialogue.control.indicatorContinue')}
            </div>
          ) : null}
        </div>

        <style>{`
          @keyframes lingoMapDialogueBlink {
            0%, 100% { opacity: 1; transform: translateY(0); }
            50%       { opacity: 0.5; transform: translateY(2px); }
          }
          @keyframes lingoMapDialogueOptionsIn {
            0%   { opacity: 0; transform: translateY(4px); }
            100% { opacity: 1; transform: translateY(0); }
          }

          /* ── Landscape compaction for the mode picker ──
             4 stacked rows + the back row blow past the
             ~400px landscape height on phones (iOS) and the
             dialogue gets clipped above. Fold the four mode
             options into a 2×2 grid; the back option spans
             both columns below them. Only triggers when the
             dialogue is the mode-picker (has-mode-grid class
             on the container) so single-option / yes-no
             dialogues still render full-width. */
          @media (orientation: landscape) and (max-height: 540px) {
            .lingo-dlg-options.is-mode-grid {
              display: grid !important;
              grid-template-columns: 1fr 1fr;
              gap: 6px !important;
              margin-top: 2px !important;
            }
            .lingo-dlg-options.is-mode-grid .lingo-dlg-leave-option {
              grid-column: 1 / -1;
            }
            .lingo-dlg-options.is-mode-grid > button {
              padding: 6px 10px !important;
            }
            .lingo-dlg-options.is-mode-grid .lingo-dlg-mode-option > div:first-child {
              font-size: 13px !important;
            }
            .lingo-dlg-options.is-mode-grid .lingo-dlg-mode-option > div:last-child {
              font-size: 10px !important;
              margin-top: 2px !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
