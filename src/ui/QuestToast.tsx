'use client';

/**
 * Quest banner — slides down from the top of the screen when a
 * quest starts or completes, holds for ~3.2 seconds, slides back
 * up. Subscribes directly to `subscribeQuestTransitions` so the
 * toast logic doesn't have to thread through GameCanvas state and
 * any new quest source (dialogue, world trigger, etc.) gets it for
 * free.
 *
 * Single-toast queue: if a second transition fires while a toast
 * is mid-display, it replaces the current one (cleaner than
 * stacking when slice 2 has at most a handful of quests). For
 * higher volume we'd swap to a FIFO queue.
 */
import { useEffect, useState } from 'react';
import {
  QuestTransition,
  subscribeQuestTransitions,
} from '../data/quests';

const HOLD_MS = 3200;

const COLORS = {
  borderStart: '#c97f1a',
  borderDone: '#5d8a3a',
  bg: '#3d2410',
  bgLight: '#5b3a1f',
  text: '#fdf6e0',
  accent: '#fbe9b8',
};

export default function QuestToast() {
  const [active, setActive] = useState<QuestTransition | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    const unsub = subscribeQuestTransitions((event) => {
      setActive(event);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setActive(null);
        timer = null;
      }, HOLD_MS);
    });
    return () => {
      unsub();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  if (!active) return null;

  const isStart = active.kind === 'started';
  const labelTop = isStart ? 'New Quest' : 'Quest Complete';
  const accentColor = isStart ? COLORS.borderStart : COLORS.borderDone;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 900,
        pointerEvents: 'none',
        // Top-edge inset so it doesn't hit the iOS notch when the
        // game is in standalone PWA mode.
        paddingTop: 'max(env(safe-area-inset-top, 0), 12px)',
      }}
      key={`${active.def.id}-${active.kind}`}
      aria-live="polite"
    >
      <div
        style={{
          minWidth: 240,
          maxWidth: 'min(92vw, 380px)',
          background: COLORS.bg,
          border: `2px solid ${accentColor}`,
          boxShadow: `inset 1px 1px 0 0 ${COLORS.bgLight}, 0 4px 0 0 #1a1008`,
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: COLORS.text,
          fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui',
          // Slide-down + fade-in, then back up. Pure CSS so the toast
          // doesn't need a state-machine for animation phases.
          animation: 'lingoMapQuestToastEnter 320ms ease-out, lingoMapQuestToastExit 320ms ease-in 2880ms both',
        }}
      >
        <div
          style={{
            fontSize: 22,
            lineHeight: 1,
          }}
          aria-hidden
        >
          {isStart ? '📜' : '✅'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              color: accentColor,
              fontWeight: 700,
            }}
          >
            {labelTop}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent, lineHeight: 1.25 }}>
            {active.def.title}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes lingoMapQuestToastEnter {
          0%   { opacity: 0; transform: translateY(-12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes lingoMapQuestToastExit {
          0%   { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}
