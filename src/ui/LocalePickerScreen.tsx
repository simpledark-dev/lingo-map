'use client';

/**
 * Locale picker — shown ONCE on a fresh save (no `lingo-locale:picked`
 * flag yet) between the welcome splash and the intro cutscene. The
 * player picks their native language; that choice persists and
 * drives every native-language string in the game (NPC dialogue,
 * cutscene narration, HUD chrome, quest copy). Vocabulary words
 * stay in the fictional target language regardless.
 *
 * Self-contained styling — uses the parchment + sky gradient
 * already in the welcome screen so the boot sequence reads as one
 * coherent flow.
 */

import { useState } from 'react';
import { Locale, getLocale, setLocale, markLocalePicked, t } from '../data/i18n';
import { getUiTheme } from './uiThemes';
import { playSfx, SFX } from './sfx';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface LocalePickerScreenProps {
  onComplete: () => void;
}

export default function LocalePickerScreen({ onComplete }: LocalePickerScreenProps) {
  // Local state mirrors the persisted locale so the picker
  // updates the strings live as the player taps between
  // English / Vietnamese — they can preview the language they're
  // about to commit to before pressing Continue.
  const [pending, setPending] = useState<Locale>(getLocale());

  const pick = (locale: Locale) => {
    playSfx(SFX.NEXT_DIALOGUE);
    setPending(locale);
    setLocale(locale);
  };

  const confirm = () => {
    playSfx(SFX.NEXT_DIALOGUE);
    markLocalePicked();
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
          {t('localePicker.title')}
        </div>
        <div style={{ fontSize: 13, color: COLORS.hintText, marginBottom: 18 }}>
          {t('localePicker.subtitle')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {(['en', 'vi'] as const).map((locale) => {
            const isPicked = pending === locale;
            const labelKey = locale === 'en' ? 'localePicker.english' : 'localePicker.vietnamese';
            const flag = locale === 'en' ? '🇺🇸' : '🇻🇳';
            return (
              <button
                key={locale}
                type="button"
                onClick={() => pick(locale)}
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
                    ✓ {t('localePicker.selected')}
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
          {t('localePicker.continue')}
        </button>
      </div>
    </div>
  );
}
