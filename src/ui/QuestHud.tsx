'use client';

/**
 * Persistent quest overview pinned just below the HUD pill row.
 * Shows every active quest's title + short objective so the player
 * always knows what they're working on without opening the log
 * modal. Available quests (with an `availableHint`) appear under a
 * subtle "NEW" badge so the player notices fresh content as it
 * unlocks.
 *
 * Generalises the IntroHintBanner that previously only showed the
 * office-direction pill — replaced by this since the intro quest's
 * objective copy already covers the same "go to Mart Street" beat.
 *
 * Auto-hides when there's nothing active or available so a clear-
 * board player gets a clean HUD.
 */
import { useMemo } from 'react';
import { QUESTS, useQuestStatuses, FIRST_PAYCHECK_THRESHOLD_CENTS } from '../data/quests';
import { useLifetimeEarnings, formatBalance } from '../data/wallet';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface QuestHudProps {
  /** Optional: clicking the strip opens the full quest log modal.
   *  Wired by GameCanvas so this component stays presentational. */
  onOpenLog?: () => void;
}

export default function QuestHud({ onOpenLog }: QuestHudProps) {
  const statuses = useQuestStatuses();
  // Subscribed even when no quest cares about it — the hook is
  // cheap, and this way the strip rerenders live as cents tick up
  // for any future progress-aware quest.
  const lifetimeEarnings = useLifetimeEarnings();
  const active = useMemo(
    // Strip is intentionally ACTIVE-only. Available / new quests
    // are surfaced through the in-world dialogue + the quest log
    // modal; piling them onto the HUD made it noisy on a fresh
    // save (three or four pills stacked over the world). Players
    // tap the 📜 button when they want to browse what's pending.
    () => Object.values(QUESTS).filter((q) => statuses[q.id] === 'active'),
    [statuses],
  );

  /** Per-quest progress suffix, appended to the title in the strip
   *  so the player can read it at a glance. Returns null for quests
   *  that have no numeric progress to show. New quests with metric
   *  goals add a case here; un-cased quests stay title-only. */
  const progressSuffix = (questId: string): string | null => {
    if (questId === 'first-paycheck') {
      const earned = Math.min(lifetimeEarnings, FIRST_PAYCHECK_THRESHOLD_CENTS);
      return `${formatBalance(earned)} / ${formatBalance(FIRST_PAYCHECK_THRESHOLD_CENTS)}`;
    }
    return null;
  };

  if (active.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 34,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 12,
        // Wrapper itself never intercepts clicks — only the
        // individual pills do (each wired below). Otherwise the
        // wrapper's auto-flex sizing in some browsers expands
        // beyond the visible content and silently eats taps that
        // the player aimed at the canvas underneath.
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'center',
        maxWidth: 'min(92vw, 420px)',
      }}
      aria-label="Active quests overview"
    >
      {active.map((q) => (
        <QuestRow
          key={q.id}
          accent={COLORS.active}
          title={q.title}
          progress={progressSuffix(q.id)}
          onClick={onOpenLog}
        />
      ))}
    </div>
  );
}

function QuestRow({
  accent,
  title,
  badge,
  progress,
  onClick,
}: {
  accent: string;
  title: string;
  badge?: string;
  /** Optional progress suffix rendered after the title (e.g.
   *  "$1.23 / $5.00"). Null/undefined for quests without a numeric
   *  goal — the title stands alone in that case. */
  progress?: string | null;
  /** Tap handler — when set, the pill itself becomes the only
   *  click-intercepting element in the strip. The wrapper above
   *  stays pointer-events:none so the rest of the screen passes
   *  taps straight through to the canvas. */
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Open quest details: ${title}` : undefined}
      title={onClick ? 'Open quest log' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        background: 'rgba(0, 0, 0, 0.65)',
        border: `1px solid ${accent}`,
        borderRadius: 999,
        color: COLORS.parchmentLight,
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        textShadow: '0 1px 0 rgba(0,0,0,0.7)',
        userSelect: 'none',
        maxWidth: '92vw',
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {badge && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: '#fdf6e0',
            background: accent,
            padding: '1px 6px',
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1, color: accent }}>
        ◆
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#fbe9b8',
          letterSpacing: 0.3,
          // Single-line title — clip with ellipsis on tiny screens
          // so the row never wraps awkwardly.
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </span>
      {progress && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: accent,
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '1px 6px',
            borderRadius: 999,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {progress}
        </span>
      )}
      {onClick && (
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: COLORS.text,
            background: COLORS.parchmentLight,
            border: `1px solid ${accent}`,
            borderRadius: 999,
            width: 18,
            height: 18,
            padding: 0,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0,
            textShadow: 'none',
            boxShadow: `inset 1px 1px 0 0 ${COLORS.parchment}`,
          }}
        >
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: accent,
              color: '#fdf6e0',
              fontSize: 9,
              lineHeight: 1,
              fontWeight: 900,
            }}
          >
            i
          </span>
        </span>
      )}
    </div>
  );
}
