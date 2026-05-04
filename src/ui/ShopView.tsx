'use client';

/**
 * Shop modal — opens when the player taps "Browse" on a shopkeeper
 * NPC. Lists every item from the catalog, shows the wallet balance,
 * and lets the player buy items priced in cents (matching the
 * existing wallet's cents-as-int model).
 *
 * Slice 1 keeps it minimal: linear list, single qty per buy, no
 * cart, no haggling. The shop is the only sink for the wallet
 * outside of penalties, so even one item is enough to close the
 * earn → spend loop.
 */
import { useCallback } from 'react';
import { ALL_ITEM_IDS, getItem } from '../data/items';
import {
  addBalance,
  formatBalance,
  useWalletBalance,
} from '../data/wallet';
import { addItem } from '../data/inventory';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface ShopViewProps {
  /** Display name for the modal header (e.g. "Mart"). */
  shopName: string;
  onClose: () => void;
}

export default function ShopView({ shopName, onClose }: ShopViewProps) {
  const balance = useWalletBalance();

  const handleBuy = useCallback((itemId: string) => {
    const def = getItem(itemId);
    if (!def) return;
    if (balance < def.priceCents) return; // UI also disables the button — guard anyway
    addBalance(-def.priceCents);
    addItem(itemId, 1);
  }, [balance]);

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
        // Tap-outside-to-close — backdrop only, not the panel.
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
        {/* Header — shop name + balance + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 1,
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.text,
              letterSpacing: 0.5,
            }}
          >
            🏪 {shopName}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.text,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              padding: '4px 10px',
              borderRadius: 4,
            }}
            title="Your wallet"
          >
            <span style={{ color: COLORS.coinGold, marginRight: 4 }}>●</span>
            {formatBalance(balance)}
          </div>
          <button
            onClick={onClose}
            aria-label="Close shop"
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
            fontSize: 11,
            color: COLORS.hintText,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: 700,
          }}
        >
          For sale
        </div>

        {/* Item list — scrolls if it ever outgrows the viewport. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {ALL_ITEM_IDS.map((id) => {
            const def = getItem(id);
            if (!def) return null;
            const canAfford = balance >= def.priceCents;
            return (
              <div
                key={id}
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
                  {def.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
                    {def.name}
                  </div>
                  {def.description && (
                    <div style={{ fontSize: 11, color: COLORS.hintText, lineHeight: 1.35 }}>
                      {def.description}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLORS.accentGoldDark,
                    minWidth: 52,
                    textAlign: 'right',
                  }}
                >
                  {formatBalance(def.priceCents)}
                </div>
                <button
                  onClick={() => handleBuy(id)}
                  disabled={!canAfford}
                  style={{
                    background: canAfford ? COLORS.buyEnabled : COLORS.buyDisabled,
                    color: '#fdf6e0',
                    border: `2px solid ${COLORS.cardBorder}`,
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    opacity: canAfford ? 1 : 0.7,
                  }}
                >
                  {canAfford ? 'Buy' : 'Need more $'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
