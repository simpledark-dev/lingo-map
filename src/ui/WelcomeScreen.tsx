'use client';

/**
 * Welcome / brand splash. Shown ONCE before IntroCutscene on a
 * fresh save (or after a dev reset that wipes INTRO_CUTSCENE_SEEN).
 * Same gating as the cutscene so the two surfaces appear or skip
 * together — players who've seen the cutscene have already been
 * branded; replaying it on every load is friction.
 *
 * Auto-advances after AUTO_DISMISS_MS, or earlier if the player
 * taps. Either way it calls onComplete and the cutscene takes
 * over.
 */

import { useEffect, useRef, useState } from 'react';
import { t } from '../data/i18n';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

const AUTO_DISMISS_MS = 3600;
const FADE_OUT_MS = 360;

interface WelcomeScreenProps {
  /** Fires the moment the splash starts fading out. Parent should
   *  mount whatever comes next (the cutscene) at this point so its
   *  background is fully opaque BEHIND the still-visible-but-fading
   *  splash — that way the cross-fade reveals the next surface
   *  instead of briefly exposing the game canvas. */
  onFadeStart: () => void;
  /** Fires when the splash has fully faded out. Parent unmounts
   *  this component now. */
  onComplete: () => void;
}

export default function WelcomeScreen({ onFadeStart, onComplete }: WelcomeScreenProps) {
  // `phase` drives the CSS animation: 'in' = fading in, 'hold' =
  // visible, 'out' = fading out. The actual `onComplete` fires at
  // the end of 'out' so the cutscene swap happens after the splash
  // is visually gone (no hard cut).
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  // Stash callbacks in refs so the timer effect runs ONCE on mount.
  // Parent passes inline arrows that change identity every render
  // (frequent — quest state, viewport, etc.); listing them in the
  // effect's deps would re-run it on every parent render, resetting
  // the timers. A re-run mid-fade pushes phase back to 'hold' and
  // the splash visually reappears on top of the just-mounted
  // cutscene. Refs keep the latest handler available without
  // re-arming the schedule.
  const onFadeStartRef = useRef(onFadeStart);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onFadeStartRef.current = onFadeStart;
    onCompleteRef.current = onComplete;
  }, [onFadeStart, onComplete]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('hold'), 600);
    const t2 = window.setTimeout(() => {
      setPhase('out');
      onFadeStartRef.current();
    }, AUTO_DISMISS_MS);
    const t3 = window.setTimeout(
      () => onCompleteRef.current(),
      AUTO_DISMISS_MS + FADE_OUT_MS,
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  // Tap-to-skip: short-circuit to 'out' and fire onComplete after
  // the fade. Re-tapping during fade-out is a no-op since phase is
  // already 'out'.
  const skip = () => {
    if (phase === 'out') return;
    setPhase('out');
    onFadeStartRef.current();
    window.setTimeout(() => onCompleteRef.current(), FADE_OUT_MS);
  };

  return (
    <div
      onClick={skip}
      style={{
        position: 'fixed',
        inset: 0,
        background: `linear-gradient(180deg, ${COLORS.skyTop} 0%, ${COLORS.skyBottom} 100%)`,
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        opacity: phase === 'out' ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms ease-out`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          opacity: phase === 'in' ? 0 : 1,
          transform: phase === 'in' ? 'translateY(8px)' : 'translateY(0)',
          transition: 'opacity 500ms ease-out, transform 500ms ease-out',
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: 1,
            color: COLORS.text,
            textShadow: `0 2px 0 ${COLORS.parchmentLight}, 0 3px 6px rgba(0,0,0,0.25)`,
          }}
        >
          {t('welcome.title')}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 14,
            letterSpacing: 0.5,
            color: COLORS.text,
            opacity: 0.78,
            fontStyle: 'italic',
          }}
        >
          {t('welcome.tagline')}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 28,
          fontSize: 10,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: COLORS.text,
          opacity: phase === 'hold' ? 0.5 : 0,
          transition: 'opacity 500ms ease-out',
        }}
      >
        {t('welcome.tapToBegin')}
      </div>
    </div>
  );
}
