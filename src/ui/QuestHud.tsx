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
import {
  QUESTS,
  useQuestStatuses,
  useQuestAcknowledged,
  acknowledgeQuest,
  FIRST_PAYCHECK_THRESHOLD_CENTS,
  getTitle,
} from '../data/quests';
import { useLifetimeEarnings, formatBalance } from '../data/wallet';
import { t } from '../data/i18n';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

type QuestProgress = {
  label: string;
  ratio: number;
};

interface QuestHudProps {
  /** Optional: clicking a row opens that quest's details.
   *  Wired by GameCanvas so this component stays presentational. */
  onOpenLog?: (questId: string) => void;
  /** When true, lift the strip into the top safe-area gap so it
   *  remains visible above modal views like Word List / Translate. */
  liftedForModal?: boolean;
}

export default function QuestHud({ onOpenLog, liftedForModal = false }: QuestHudProps) {
  const statuses = useQuestStatuses();
  // Acknowledgement set — quests the player has tapped on at least
  // once after they became active. Untapped active quests get a
  // pulsing border + "NEW" badge so the player notices when a fresh
  // objective lands. First tap clears it permanently for that quest.
  const acknowledged = useQuestAcknowledged();
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
  const progressForQuest = (questId: string): QuestProgress | null => {
    if (questId === 'first-paycheck') {
      const earned = Math.min(lifetimeEarnings, FIRST_PAYCHECK_THRESHOLD_CENTS);
      return {
        label: `${formatBalance(earned)} / ${formatBalance(FIRST_PAYCHECK_THRESHOLD_CENTS)}`,
        ratio: earned / FIRST_PAYCHECK_THRESHOLD_CENTS,
      };
    }
    return null;
  };

  if (active.length === 0) return null;

  return (
    <>
      <style>{`
        /* Landscape mobile (short viewport, e.g. iPhone held sideways)
           has wallet/energy on the top-left and the icon row on the
           top-right with empty space in between — and very little
           vertical real estate. Pull the quest strip up into that
           middle gap so it sits in line with the rest of the HUD
           row instead of eating one of the precious few rows of
           in-world view. Portrait + tablet keep the original
           below-HUD position.

           The 500px max-height heuristic catches phones in
           landscape (≤ ~430px tall on iPhones, ≤ ~500px on most
           Android landscape) without affecting tablets in
           landscape (≥ 768px tall). */
        @media (orientation: landscape) and (max-height: 500px) {
          .lingo-map-quest-hud {
            top: calc(8px + env(safe-area-inset-top, 0px)) !important;
          }
        }
      `}</style>
    <div
      className="lingo-map-quest-hud"
      style={{
        position: 'absolute',
        // Sit BELOW the top-left status pills (wallet, energy,
        // etc.) and the top-right icon row (sound, quest log,
        // settings). Both of those start at 8px and are ~34px
        // tall, so 50px + safe-area-inset clears them with a tiny
        // gap. env(safe-area-inset-top) is 0 on devices without a
        // notch, so non-iOS layouts pull the strip up the same
        // amount as before relative to the icons. In landscape
        // mobile a media query above pulls this up to 8px so the
        // strip sits between the left/right HUD groups instead of
        // stacking below them — see lingo-map-quest-hud rule.
        top: liftedForModal
          ? 'calc(8px + env(safe-area-inset-top, 0px))'
          : 'calc(50px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        // Above modals (translate view at z-index 60, dialogue
        // wrapper at 60) so the player can see paycheck progress
        // ($X.XX / $1.00) while drilling. Especially relevant in
        // landscape mobile where the translate view fills the
        // screen and the lifetime-earnings number is the only
        // way to know how close they are to claiming.
        zIndex: liftedForModal ? 900 : 100,
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
      aria-label={t('questHud.activeOverview')}
    >
      {active.map((q) => {
        const isNew = !acknowledged.has(q.id);
        // Row is tappable when it can DO something — open the log,
        // or at least dismiss the "NEW" pulse. If neither applies
        // we leave onClick undefined so the wrapper stays
        // pointer-events:none and clicks fall through to the
        // canvas (preserving the original behaviour).
        const hasAction = isNew || !!onOpenLog;
        return (
          <QuestRow
            key={q.id}
            accent={COLORS.active}
            title={getTitle(q)}
            progress={progressForQuest(q.id)}
            isNew={isNew}
            onClick={
              hasAction
                ? () => {
                    if (isNew) acknowledgeQuest(q.id);
                    onOpenLog?.(q.id);
                  }
                : undefined
            }
          />
        );
      })}
    </div>
    </>
  );
}

function QuestRow({
  accent,
  title,
  badge,
  progress,
  isNew,
  onClick,
}: {
  accent: string;
  title: string;
  badge?: string;
  /** Optional progress suffix rendered after the title (e.g.
   *  "$1.23 / $5.00"). Null/undefined for quests without a numeric
   *  goal — the title stands alone in that case. */
  progress?: QuestProgress | null;
  /** True for active quests the player hasn't tapped yet. Drives the
   *  pulsing border + "NEW" badge so a fresh objective is
   *  unmissable. Cleared on first tap (parent calls
   *  acknowledgeQuest). */
  isNew?: boolean;
  /** Tap handler — when set, the pill itself becomes the only
   *  click-intercepting element in the strip. The wrapper above
   *  stays pointer-events:none so the rest of the screen passes
   *  taps straight through to the canvas. */
  onClick?: () => void;
}) {
  // Show the auto-derived "NEW" badge unless the caller explicitly
  // passed one (legacy `badge` prop wins). Lets future callers still
  // override copy without losing the new-quest signal.
  const effectiveBadge = badge ?? (isNew ? t('questHud.newBadge') : undefined);
  return (
    <>
      <style>{`
        /* Two arrows that flank an unacknowledged active quest row,
           pointing inward at it and bouncing toward the row in
           sync. Pulse-only feedback was too subtle in playtest —
           the arrows are unmissable while still leaving the row
           itself unchanged. Cleared on first tap. */
        @keyframes lingoMapQuestArrowL {
          0%, 100% { transform: translateX(0);   opacity: 0.85; }
          50%      { transform: translateX(6px); opacity: 1;    }
        }
        @keyframes lingoMapQuestArrowR {
          0%, 100% { transform: translateX(0);    opacity: 0.85; }
          50%      { transform: translateX(-6px); opacity: 1;    }
        }
      `}</style>
    {isNew ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
        <span
          aria-hidden
          style={{
            fontSize: 22,
            lineHeight: 1,
            color: accent,
            textShadow: `0 0 6px rgba(0,0,0,0.4)`,
            filter: `drop-shadow(0 1px 0 ${COLORS.parchmentLight})`,
            animation: 'lingoMapQuestArrowL 1s ease-in-out infinite',
            flexShrink: 0,
          }}
        >
          ▶
        </span>
        {renderRowInner()}
        <span
          aria-hidden
          style={{
            fontSize: 22,
            lineHeight: 1,
            color: accent,
            textShadow: `0 0 6px rgba(0,0,0,0.4)`,
            filter: `drop-shadow(0 1px 0 ${COLORS.parchmentLight})`,
            animation: 'lingoMapQuestArrowR 1s ease-in-out infinite',
            flexShrink: 0,
          }}
        >
          ◀
        </span>
      </div>
    ) : (
      renderRowInner()
    )}
    </>
  );

  // Inline helper so the arrow + no-arrow branches render the same
  // pill markup. Closed over the QuestRow scope so it sees the
  // existing accent / title / progress / onClick / etc.
  function renderRowInner() {
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
      aria-label={onClick ? t('questHud.openDetails', { title }) : undefined}
      title={onClick ? t('questHud.openDetails', { title }) : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: COLORS.parchmentLight,
        border: `2px solid ${accent}`,
        borderRadius: 6,
        color: COLORS.text,
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        textShadow: 'none',
        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchment}, 0 3px 0 0 ${COLORS.cardBorder}, 0 0 0 2px rgba(255, 246, 210, 0.7)`,
        userSelect: 'none',
        maxWidth: '92vw',
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {effectiveBadge && (
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
          {effectiveBadge}
        </span>
      )}
      <span aria-hidden style={{ fontSize: 13, lineHeight: 1, color: accent }}>
        📜
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: COLORS.text,
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
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.ratio * 100)}
          aria-label={progress.label}
          style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 88,
            height: 20,
            fontSize: 11,
            fontWeight: 800,
            color: COLORS.text,
            background: COLORS.cardRest,
            border: `1px solid ${accent}`,
            padding: '0 7px',
            borderRadius: 4,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
            boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}`,
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              right: `${Math.max(0, Math.min(1, 1 - progress.ratio)) * 100}%`,
              background: `linear-gradient(90deg, rgba(72, 132, 69, 0.58), rgba(92, 156, 78, 0.42))`,
            }}
          />
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              whiteSpace: 'nowrap',
              textShadow: `0 1px 0 ${COLORS.parchmentLight}`,
            }}
          >
            {progress.label}
          </span>
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
}
