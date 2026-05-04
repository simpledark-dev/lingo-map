'use client';

/**
 * Quest log modal — opened from the HUD scroll button. Lists active
 * quests with their objective text, then completed ones below in a
 * dimmed style. Empty state covers "no quests yet" so first-time
 * players see something useful instead of a blank panel.
 *
 * Subscribes to `useQuestStatuses` so opening, completing, or
 * starting a quest mid-modal updates the list live.
 */
import { useMemo } from 'react';
import { QUESTS, useQuestStatuses } from '../data/quests';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface QuestLogProps {
  onClose: () => void;
}

export default function QuestLog({ onClose }: QuestLogProps) {
  const statuses = useQuestStatuses();
  const { active, available, completed } = useMemo(() => {
    const all = Object.values(QUESTS);
    return {
      active: all.filter((q) => statuses[q.id] === 'active'),
      // Inactive quests with an `availableHint` show up as a hint
      // tier so the player has somewhere to look next without
      // stumbling on the right NPC by chance. Inactive quests
      // without a hint stay hidden — those are content the player
      // shouldn't know exists yet.
      available: all.filter((q) => !statuses[q.id] && q.availableHint),
      completed: all.filter((q) => statuses[q.id] === 'completed'),
    };
  }, [statuses]);

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
          width: 'min(420px, 100%)',
          maxHeight: '90dvh',
          padding: 16,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>
            📜 Quests
          </div>
          <button
            onClick={onClose}
            aria-label="Close quest log"
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingRight: 4 }}>
          {active.length === 0 && completed.length === 0 && available.length === 0 && (
            <div
              style={{
                fontSize: 12,
                color: COLORS.hintText,
                textAlign: 'center',
                padding: '20px 8px',
                fontStyle: 'italic',
              }}
            >
              Nothing here yet. Talk to people around town — someone usually needs help.
            </div>
          )}

          {active.length > 0 && (
            <Section label="In Progress" accent={COLORS.active}>
              {active.map((q) => (
                <QuestRow
                  key={q.id}
                  title={q.title}
                  body={q.objective}
                  accent={COLORS.active}
                  badge="Active"
                />
              ))}
            </Section>
          )}

          {available.length > 0 && (
            <Section label="Available" accent={COLORS.available}>
              {available.map((q) => (
                <QuestRow
                  key={q.id}
                  title={q.title}
                  body={q.availableHint ?? ''}
                  accent={COLORS.available}
                  badge="New"
                  faded
                />
              ))}
            </Section>
          )}

          {completed.length > 0 && (
            <Section label="Completed" accent={COLORS.done}>
              {completed.map((q) => (
                <QuestRow
                  key={q.id}
                  title={q.title}
                  body={q.completedSummary ?? 'Completed.'}
                  accent={COLORS.done}
                  badge="Done"
                  faded
                />
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          fontWeight: 700,
          color: accent,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function QuestRow({
  title,
  body,
  accent,
  badge,
  faded = false,
}: {
  title: string;
  body: string;
  accent: string;
  badge: string;
  faded?: boolean;
}) {
  return (
    <div
      style={{
        background: COLORS.cardRest,
        border: `2px solid ${COLORS.cardBorder}`,
        borderRadius: 6,
        padding: '8px 10px',
        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
        opacity: faded ? 0.78 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: COLORS.text }}>{title}</div>
        <div
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: 700,
            color: '#fdf6e0',
            background: accent,
            padding: '2px 6px',
            borderRadius: 3,
          }}
        >
          {badge}
        </div>
      </div>
      <div style={{ fontSize: 11, color: COLORS.hintText, lineHeight: 1.4 }}>{body}</div>
    </div>
  );
}
