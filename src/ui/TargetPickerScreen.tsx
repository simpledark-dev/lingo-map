'use client';

/**
 * Target-language picker — shown ONCE on a fresh save after the
 * native-language picker, BEFORE the cutscene. The player picks
 * the language they want to LEARN. Choice persists across reloads
 * via `lingo-target` + `lingo-target:picked`.
 *
 * The locale matching the active NATIVE language is filtered out
 * of the option list — picking "learn English" while native=English
 * (or "learn Vietnamese" while native=Vietnamese) is meaningless
 * and would just confuse downstream pack lookups.
 *
 * Visual parity with LocalePickerScreen on purpose — same parchment
 * card, same sky gradient, same button styling. Reads as the
 * second step of one boot flow instead of two unrelated screens.
 */

import { useState } from 'react';
import { getLocale, t } from '../data/i18n';
import {
  TargetLanguage,
  TARGET_LANGUAGES,
  getTarget,
  setTarget,
  markTargetPicked,
} from '../data/target';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface TargetPickerScreenProps {
  onComplete: () => void;
}

/** Map each target to a flag emoji. Lingo is the constructed
 *  language — uses a globe to convey "not a real Earth language".
 *  Flags chosen by the most-spoken country for each. */
const TARGET_FLAGS: Record<TargetLanguage, string> = {
  lingo: '🌐',
  french: '🇫🇷',
  english: '🇬🇧',
};

const TARGET_LABEL_KEYS: Record<TargetLanguage, string> = {
  lingo: 'targetPicker.lingo',
  french: 'targetPicker.french',
  english: 'targetPicker.english',
};

export default function TargetPickerScreen({ onComplete }: TargetPickerScreenProps) {
  // Local pending state mirrors persisted target so the picker
  // updates live as the player taps between options. We DON'T
  // commit `markTargetPicked` until the player presses Continue —
  // tapping a language then backing out shouldn't burn the gate.
  const [pending, setPending] = useState<TargetLanguage>(getTarget());

  // Filter out the player's native locale. Learning your own
  // native is a no-op; the pack lookup would just hand back the
  // word in its meaning form. Lingo is always shown (constructed
  // language, no native-collision).
  const native = getLocale();
  const visible = TARGET_LANGUAGES.filter((target) => {
    if (target === 'english' && native === 'en') return false;
    // No `vi` target yet, but if added later, mirror the rule:
    // if (target === 'vi' && native === 'vi') return false;
    return true;
  });

  const pick = (target: TargetLanguage) => {
    setPending(target);
    setTarget(target);
  };

  const confirm = () => {
    markTargetPicked();
    onComplete();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: `linear-gradient(180deg, ${COLORS.skyTop} 0%, ${COLORS.skyBottom} 100%)`,
        zIndex: 1050,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui',
      }}
    >
      <div
        style={{
          background: COLORS.parchment,
          border: `3px solid ${COLORS.cardBorder}`,
          borderRadius: 8,
          boxShadow: `inset 2px 2px 0 0 ${COLORS.parchmentLight}, inset -2px -2px 0 0 ${COLORS.parchmentShadow}, 0 6px 0 0 #2a1a0a`,
          padding: '24px 28px',
          maxWidth: 380,
          width: '100%',
          color: COLORS.text,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>
          {t('targetPicker.title')}
        </div>
        <div style={{ fontSize: 13, color: COLORS.hintText, marginBottom: 18 }}>
          {t('targetPicker.subtitle')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {visible.map((target) => {
            const isPicked = pending === target;
            const labelKey = TARGET_LABEL_KEYS[target];
            const flag = TARGET_FLAGS[target];
            return (
              <button
                key={target}
                type="button"
                onClick={() => pick(target)}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 15,
                  fontWeight: 700,
                  color: COLORS.text,
                  background: isPicked
                    ? `linear-gradient(180deg, ${COLORS.correctBg} 0%, ${COLORS.parchmentLight} 100%)`
                    : COLORS.cardRest,
                  border: `2px solid ${isPicked ? COLORS.done : COLORS.cardBorder}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  boxShadow: isPicked
                    ? `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 3px 0 0 ${COLORS.done}, 0 0 0 4px rgba(93, 138, 58, 0.24)`
                    : `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                  transform: isPicked ? 'translateY(-1px)' : 'none',
                  transition: 'background 120ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out, transform 120ms ease-out',
                  display: 'grid',
                  gridTemplateColumns: '32px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                }}
                aria-pressed={isPicked}
              >
                <span aria-hidden style={{ fontSize: 19, lineHeight: 1, textAlign: 'center' }}>{flag}</span>
                <span>{t(labelKey)}</span>
                {isPicked && (
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: '#fdf6e0',
                      background: COLORS.done,
                      border: `1px solid ${COLORS.cardBorder}`,
                      borderRadius: 999,
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✓ {t('targetPicker.selected')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={confirm}
          style={{
            background: COLORS.accentGold,
            color: '#fdf6e0',
            border: `2px solid ${COLORS.accentGoldDark}`,
            borderRadius: 6,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.5,
            cursor: 'pointer',
            boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.accentGoldDark}`,
            width: '100%',
          }}
        >
          {t('targetPicker.continue')}
        </button>
      </div>
    </div>
  );
}
