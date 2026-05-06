'use client';

/**
 * Tiny floating "−N ⚡" pip that pops up by the energy pill every
 * time `consumeEnergy` fires. Gives the energy spend a visceral
 * beat — when the player taps a paid translate mode and the
 * session opens, this burst makes it obvious WHERE the cost was
 * paid from instead of leaving them to spot the silent number
 * tick on the HUD.
 *
 * Self-contained: subscribes to `subscribeEnergySpent`, queues
 * one transient burst per spend, removes it after the animation
 * settles. Multiple spends close together stack rather than
 * cancelling each other so a chain of consumes still reads as
 * a chain visually.
 *
 * Rendered as a child of the energy pill so positioning is
 * automatic — `position: absolute` against the pill anchors the
 * pip just above it.
 */
import { useEffect, useState } from 'react';
import { subscribeEnergySpent } from '../data/energy';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface BurstEntry {
  id: number;
  amount: number;
}

export default function EnergyCostBurst() {
  const [bursts, setBursts] = useState<BurstEntry[]>([]);

  useEffect(() => {
    let nextId = 1;
    return subscribeEnergySpent((amount) => {
      const id = nextId++;
      setBursts((prev) => [...prev, { id, amount }]);
      // Match the keyframe duration below — the element has to
      // outlive the animation or the fade-out flickers as React
      // unmounts mid-frame.
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 900);
    });
  }, []);

  if (bursts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes lingoMapEnergyBurst {
          0%   { opacity: 0; transform: translate(-50%, 4px) scale(0.85); }
          15%  { opacity: 1; transform: translate(-50%, 0) scale(1); }
          80%  { opacity: 1; transform: translate(-50%, -22px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -28px) scale(0.95); }
        }
      `}</style>
      {bursts.map((b) => (
        <span
          key={b.id}
          aria-hidden
          style={{
            position: 'absolute',
            top: -2,
            left: '50%',
            // Translate handled by the keyframe; transform-origin
            // centred so the scale tween reads as a tiny pop.
            transform: 'translate(-50%, 0)',
            color: COLORS.energyAccent,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.3,
            lineHeight: 1,
            textShadow: '0 1px 0 rgba(255, 246, 210, 0.9)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            animation: 'lingoMapEnergyBurst 900ms ease-out forwards',
          }}
        >
          −{b.amount} ⚡
        </span>
      ))}
    </>
  );
}
