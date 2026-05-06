'use client';

/**
 * Settings modal — opens via the HUD gear button. v1 surface is
 * minimal: a single destructive action ("Reset game") with a
 * two-step confirm so the player can't wipe progress with a
 * mis-tap. Future settings (volume sliders, accessibility, dev
 * toggles) slot under the same parchment frame.
 *
 * Reset behaviour: wipes every persisted key the game owns, then
 * full-page reloads so all in-memory caches re-init from a clean
 * slate (cutscene plays, quests inactive, wallet at the starter value, etc.).
 */
import { useState } from 'react';
import { resetAllGameData } from '../data/reset';
import {
  creditEarnings,
  useLifetimeEarnings,
  useRewardPerCorrect,
  setRewardPerCorrect,
  formatBalance,
} from '../data/wallet';
import { Locale, setLocale, useLocale, t } from '../data/i18n';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface SettingsViewProps {
  onClose: () => void;
  virtualDPadEnabled: boolean;
  onVirtualDPadEnabledChange: (enabled: boolean) => void;
}

export default function SettingsView({
  onClose,
  virtualDPadEnabled,
  onVirtualDPadEnabledChange,
}: SettingsViewProps) {
  // Two-stage confirm: first tap arms the destructive button, second
  // tap actually wipes. A 3-second auto-cancel keeps the armed state
  // from sticking around if the player walks away.
  const [confirming, setConfirming] = useState(false);
  // Live read so the dev "Earn $1" button label can show current
  // lifetime earnings — saves opening the wallet pill to check.
  const lifetime = useLifetimeEarnings();
  const rewardPerCorrect = useRewardPerCorrect();
  // Temporarily forced on in prod too — easier to demo the
  // "Earn $1 / +$5" cheats from a Vercel preview without spinning
  // up a local dev build. Flip back to `process.env.NODE_ENV !==
  // 'production'` once the demo phase is over.
  const isDev = true;

  const armReset = () => {
    setConfirming(true);
    window.setTimeout(() => setConfirming(false), 3000);
  };

  const doReset = () => {
    resetAllGameData();
    // Hard reload so every module-level cache (wallet, inventory,
    // energy, debt, profile, quests, eventFlags, vocab progress)
    // re-reads from the now-empty localStorage. Reloading is
    // simpler and more honest than trying to surgically reset
    // every cache + reset the engine in place.
    window.location.reload();
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          ...UI_THEME.modal.panelStyle,
          width: 'min(380px, 100%)',
          maxHeight: '90dvh',
          overflowY: 'auto',
          padding: 18,
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>
            ⚙️ {t('settings.title')}
          </div>
          <button
            onClick={onClose}
            aria-label={t('settings.close')}
            style={{
              width: 28, height: 28,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Language picker — mirrors the boot-time LocalePickerScreen
            but lives here so a player can flip languages mid-play
            without resetting. setLocale fires through the subscription
            hook, every t() call inside React re-renders with the new
            language. */}
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 700,
            color: COLORS.hintText,
          }}
        >
          {t('settings.language')}
        </div>
        <LanguagePicker />

        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 700,
            color: COLORS.hintText,
          }}
        >
          {t('settings.controls')}
        </div>

        <label
          style={{
            background: COLORS.parchmentLight,
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 6,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: COLORS.text,
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>
              {t('settings.virtualDpad')}
            </span>
            <span style={{ display: 'block', fontSize: 11, lineHeight: 1.4, color: COLORS.hintText, marginTop: 3 }}>
              {t('settings.virtualDpadHint')}
            </span>
          </span>
          <input
            type="checkbox"
            checked={virtualDPadEnabled}
            onChange={(e) => onVirtualDPadEnabledChange(e.currentTarget.checked)}
            style={{
              width: 20,
              height: 20,
              margin: 0,
              accentColor: COLORS.accentGoldDark,
              cursor: 'pointer',
            }}
          />
        </label>

        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 700,
            color: COLORS.warn,
          }}
        >
          {t('settings.dangerZone')}
        </div>

        <div
          style={{
            background: COLORS.warnBg,
            border: `2px solid ${COLORS.warn}`,
            borderRadius: 6,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            color: COLORS.text,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {t('settings.resetTitle')}
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.4, color: COLORS.text }}>
            {t('settings.resetWarning')}
            {' '}<strong>{t('settings.resetCannotUndo')}</strong>
          </div>
          {!confirming ? (
            <button
              type="button"
              onClick={armReset}
              style={{
                alignSelf: 'flex-start',
                background: COLORS.warn,
                color: '#fdf6e0',
                border: `2px solid ${COLORS.cardBorder}`,
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: 'pointer',
            }}
          >
              {t('settings.resetButton')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, marginRight: 4 }}>
                {t('settings.resetAreYouSure')}
              </span>
              <button
                type="button"
                onClick={doReset}
                style={{
                  background: COLORS.warn,
                  color: '#fdf6e0',
                  border: `2px solid ${COLORS.cardBorder}`,
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                }}
              >
                {t('settings.resetYes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  background: COLORS.parchmentLight,
                  color: COLORS.text,
                  border: `2px solid ${COLORS.cardBorder}`,
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                }}
              >
                {t('settings.resetCancel')}
              </button>
            </div>
          )}
        </div>

        {isDev && (
          <>
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 1.2,
                fontWeight: 700,
                color: COLORS.hintText,
              }}
            >
              {t('settings.devHeader')}
            </div>
            <div
              style={{
                background: COLORS.parchmentLight,
                border: `2px dashed ${COLORS.cardBorder}`,
                borderRadius: 6,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                color: COLORS.text,
              }}
            >
              <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                {t('settings.devLifetime', { amount: formatBalance(lifetime) })}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => creditEarnings(100)}
                  style={{
                    background: COLORS.cardRest,
                    color: COLORS.text,
                    border: `2px solid ${COLORS.cardBorder}`,
                    borderRadius: 4,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    cursor: 'pointer',
                }}
              >
                  {t('settings.devEarn1')}
                </button>
                <button
                  type="button"
                  onClick={() => creditEarnings(500)}
                  style={{
                    background: COLORS.cardRest,
                    color: COLORS.text,
                    border: `2px solid ${COLORS.cardBorder}`,
                    borderRadius: 4,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    cursor: 'pointer',
                }}
              >
                  {t('settings.devEarn5')}
                </button>
              </div>
              <div
                style={{
                  borderTop: `1px dashed ${COLORS.cardBorder}`,
                  paddingTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                  {t('settings.devReward', { amount: formatBalance(rewardPerCorrect) })}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setRewardPerCorrect(3)}
                    style={{
                      background: COLORS.cardRest,
                      color: COLORS.text,
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      cursor: 'pointer',
                    }}
                  >
                    $0.03
                  </button>
                  <button
                    type="button"
                    onClick={() => setRewardPerCorrect(5)}
                    style={{
                      background: COLORS.cardRest,
                      color: COLORS.text,
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      cursor: 'pointer',
                    }}
                  >
                    $0.05
                  </button>
                  <button
                    type="button"
                    onClick={() => setRewardPerCorrect(10)}
                    style={{
                      background: COLORS.cardRest,
                      color: COLORS.text,
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      cursor: 'pointer',
                    }}
                  >
                    $0.10
                  </button>
                  <button
                    type="button"
                    onClick={() => setRewardPerCorrect(50)}
                    style={{
                      background: COLORS.cardRest,
                      color: COLORS.text,
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      cursor: 'pointer',
                    }}
                  >
                    $0.50
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


/** Language picker row used inside the Settings modal. Subscribes
 *  via useLocale so its own button-pressed state updates live, and
 *  setLocale propagates through every other useLocale subscriber
 *  (the GameCanvas tree) so visible text flips on the next render. */
function LanguagePicker() {
  const current = useLocale();
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {([
        { id: "en" as Locale, key: "settings.languageEnglish" },
        { id: "vi" as Locale, key: "settings.languageVietnamese" },
      ]).map(({ id, key }) => {
        const active = current === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setLocale(id)}
            aria-pressed={active}
            style={{
              flex: 1,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              color: active ? "#fdf6e0" : COLORS.text,
              background: active ? COLORS.accentGold : COLORS.parchmentLight,
              border: `2px solid ${active ? COLORS.accentGoldDark : COLORS.cardBorder}`,
              borderRadius: 6,
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}
