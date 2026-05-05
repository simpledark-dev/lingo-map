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
import { creditEarnings, useLifetimeEarnings, formatBalance } from '../data/wallet';
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
  // Dev cheats are only surfaced outside production builds. Keeps
  // a player on the deployed game from accidentally tapping a
  // "+$1" button. Next.js inlines `process.env.NODE_ENV` at build
  // time so the whole block tree-shakes out of prod bundles.
  const isDev = process.env.NODE_ENV !== 'production';

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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          ...UI_THEME.modal.panelStyle,
          width: 'min(380px, 100%)',
          maxHeight: '90dvh',
          padding: 18,
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>
            ⚙️ Settings
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
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

        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 700,
            color: COLORS.hintText,
          }}
        >
          Controls
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
              Virtual D-pad
            </span>
            <span style={{ display: 'block', fontSize: 11, lineHeight: 1.4, color: COLORS.hintText, marginTop: 3 }}>
              Show on-screen movement controls on mobile.
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
          Danger zone
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
            Reset game
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.4, color: COLORS.text }}>
            Wipes location, wallet, inventory, energy, debt, quests, names, and vocab progress.
            The opening cutscene will play again.
            {' '}<strong>This cannot be undone.</strong>
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
              Reset game…
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, marginRight: 4 }}>
                Are you sure?
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
                Yes, wipe everything
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
                Cancel
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
              Dev
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
                Lifetime earnings: <strong>{formatBalance(lifetime)}</strong>.
                Skip the grind while testing quest milestones.
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
                  Earn +$1.00
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
                  Earn +$5.00
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
