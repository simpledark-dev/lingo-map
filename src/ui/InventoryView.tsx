'use client';

/**
 * Inventory modal — opens via the HUD inventory pill. Lists every
 * held item with name, count, and an Eat button when the item has
 * an `energy` value. Eating consumes one of the item and refills
 * energy via `inventory.eatItem`. Auto-closes when the inventory
 * is fully empty so the player doesn't sit on a blank panel.
 *
 * Slice 3 keeps it simple — eat is the only verb. Future verbs
 * (drop, give, examine) slot into the same row layout.
 */
import { useEffect } from 'react';
import { eatItem, useInventory } from '../data/inventory';
import { getItem, getItemName, getItemDescription } from '../data/items';
import { useEnergy, getMaxEnergy } from '../data/energy';
import { getUiTheme } from './uiThemes';
import { t } from '../data/i18n';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface InventoryViewProps {
  onClose: () => void;
}

export default function InventoryView({ onClose }: InventoryViewProps) {
  const inv = useInventory();
  const energy = useEnergy();
  const max = getMaxEnergy();

  // Compose visible rows from the catalog so a stale localStorage
  // entry from a removed item doesn't render. Sorted by name for
  // a stable order.
  const rows = Object.entries(inv)
    .map(([id, count]) => ({ id, count, def: getItem(id) }))
    .filter((r): r is { id: string; count: number; def: NonNullable<ReturnType<typeof getItem>> } => !!r.def)
    .sort((a, b) => a.def.name.localeCompare(b.def.name));

  // Auto-close when the player eats their last item — keeps the
  // panel from becoming a "you have nothing" wall while they're
  // mid-eating-streak.
  useEffect(() => {
    if (rows.length === 0) onClose();
  }, [rows.length, onClose]);

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
          width: 'min(420px, 100%)',
          maxHeight: '90dvh',
          padding: 16,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>
            🎒 {t('inventory.title')}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.text,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              padding: '4px 10px',
              borderRadius: 4,
            }}
            title={t('inventory.energyTip')}
          >
            <span style={{ color: COLORS.energyAccent, marginRight: 4 }}>⚡</span>
            {energy}/{max}
          </div>
          <button
            onClick={onClose}
            aria-label={t('inventory.close')}
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
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {rows.map((row) => {
            const energyValue = row.def.energy ?? 0;
            const canEat = energyValue > 0;
            // Once energy is at max, eating is wasteful — disable
            // the button (it'd consume the item with no effect).
            const wouldOvercap = energy >= max;
            const eatEnabled = canEat && !wouldOvercap;
            return (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: COLORS.cardRest,
                  border: `2px solid ${COLORS.cardBorder}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                }}
              >
                <div style={{ fontSize: 28, lineHeight: 1, width: 32, textAlign: 'center' }}>
                  {row.def.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
                    {getItemName(row.id)} <span style={{ color: COLORS.hintText, fontWeight: 500 }}>×{row.count}</span>
                  </div>
                  {canEat ? (
                    <div style={{ fontSize: 11, color: COLORS.hintText, lineHeight: 1.35 }}>
                      {t('inventory.eatRestoresLabel')} <span style={{ color: COLORS.energyAccent, fontWeight: 700 }}>+{energyValue} ⚡</span>
                    </div>
                  ) : getItemDescription(row.id) ? (
                    <div style={{ fontSize: 11, color: COLORS.hintText, lineHeight: 1.35 }}>
                      {getItemDescription(row.id)}
                    </div>
                  ) : null}
                </div>
                {canEat && (
                  <button
                    onClick={() => eatItem(row.id)}
                    disabled={!eatEnabled}
                    title={wouldOvercap ? t('inventory.energyFullTip') : t('inventory.eatTip', { energy: energyValue })}
                    style={{
                      background: eatEnabled ? COLORS.eatBtn : COLORS.eatBtnDisabled,
                      color: '#fdf6e0',
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      cursor: eatEnabled ? 'pointer' : 'not-allowed',
                      opacity: eatEnabled ? 1 : 0.7,
                    }}
                  >
                    {t('inventory.eat')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
