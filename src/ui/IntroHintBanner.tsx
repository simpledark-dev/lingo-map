'use client';

/**
 * Phase-2 navigation banner — pulses just below the HUD pills while
 * the intro tutorial quest is active, telling the player where to
 * go ("Translation Office on Mart Street"). Hides automatically the
 * moment `intro-translator-job` flips to completed.
 *
 * This is a stand-in for an in-world building marker: rendering a
 * floating sprite over the office building requires either a
 * world-to-screen pipe from the engine to React or a synthetic
 * decor entity managed by the renderer. A HUD banner reuses the
 * existing quest-status hook and ships immediately; it can be
 * replaced or augmented with a building-attached marker once a
 * Building entity with `targetMapId: 'office'` is placed by the
 * editor.
 */
import { useQuestStatuses } from '../data/quests';
import { t } from '../data/i18n';

export default function IntroHintBanner() {
  const statuses = useQuestStatuses();
  if (statuses['intro-translator-job'] !== 'active') return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 110,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 12,
        pointerEvents: 'none',
        background: 'rgba(0, 0, 0, 0.65)',
        border: '1px solid rgba(217, 164, 41, 0.7)',
        borderRadius: 999,
        padding: '6px 14px',
        color: '#fbe9b8',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.4,
        textShadow: '0 1px 0 rgba(0,0,0,0.7)',
        whiteSpace: 'nowrap',
        animation: 'lingoMapIntroHintPulse 2.2s ease-in-out infinite',
      }}
      aria-label={t('introHint.officeAria')}
    >
      {t('introHint.officeLabel')}
      <style>{`
        @keyframes lingoMapIntroHintPulse {
          0%, 100% { opacity: 0.78; transform: translateX(-50%) scale(1); }
          50%      { opacity: 1;    transform: translateX(-50%) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
