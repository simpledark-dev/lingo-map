"use client";

import { useState } from "react";
import {
  COMPUTER_LEVELS,
  ComputerLevel,
  ComputerLevelId,
  getNextComputerLevel,
  purchaseNextComputerUpgrade,
  useComputerUpgradeLevel,
} from "../data/computerUpgrade";
import { t } from "../data/i18n";
import { formatBalance, useWalletBalance } from "../data/wallet";
import { getUiTheme } from "./uiThemes";

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

// Placeholder tier art. The two computer-desk images are reused — swap in
// real per-tier sprites later by dropping new files under /public/assets/
// and updating these paths.
const TIER_IMG: Record<ComputerLevelId, string> = {
  broken: "/assets/placeholder/computer-desk-l0.png",
  "used-laptop": "/assets/placeholder/computer-desk-l1.png",
  "home-pc": "/assets/placeholder/computer-desk-l2.png",
  "study-rig": "/assets/placeholder/computer-desk-l3.png",
};

interface ComputerUpgradeViewProps {
  onClose: () => void;
}

export default function ComputerUpgradeView({ onClose }: ComputerUpgradeViewProps) {
  const level = useComputerUpgradeLevel();
  const balance = useWalletBalance();
  const [message, setMessage] = useState<string | null>(null);
  // Flashes the Buy button gold for ~180ms on a successful purchase,
  // then closes so the world FX (desk flash + sparkles + pop) are
  // visible. We don't show the "Upgraded to X" toast anymore — the
  // animated desk is the feedback.
  const [purchasing, setPurchasing] = useState(false);
  const nextLevel = getNextComputerLevel(level);
  const currentLevel = COMPUTER_LEVELS[level] ?? COMPUTER_LEVELS[0];
  const totalTiers = COMPUTER_LEVELS.length;
  const isMaxed = nextLevel === null;
  const canAfford = nextLevel !== null && balance >= nextLevel.costCents;

  const handleUpgrade = () => {
    if (purchasing) return;
    if (!nextLevel || !canAfford) {
      // Defensive — button is disabled in this state, but keep the
      // error toasts working in case the disable race somehow fails.
      if (nextLevel && balance < nextLevel.costCents) {
        setMessage(
          t("computer.upgrade.needMoney", {
            amount: formatBalance(nextLevel.costCents - balance),
          }),
        );
      } else {
        setMessage(t("computer.upgrade.maxed"));
      }
      return;
    }
    // Show the gold-flash on the Buy button now, then defer the
    // actual purchase + modal close so the world FX on the desk
    // (which fires the moment the level changes) runs AFTER the
    // modal disappears — otherwise the dark overlay hides it.
    setPurchasing(true);
    window.setTimeout(() => {
      purchaseNextComputerUpgrade();
      onClose();
    }, 280);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        zIndex: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          ...UI_THEME.modal.panelStyle,
          width: "min(480px, 100%)",
          maxHeight: "90dvh",
          padding: 16,
          gap: 12,
          overflowY: "auto",
        }}
      >
        {/* Header: title + balance + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: COLORS.text,
                letterSpacing: 0.5,
              }}
            >
              {t("computer.upgrade.title")}
            </div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.hintText,
                lineHeight: 1.35,
                marginTop: 2,
              }}
            >
              {t("computer.upgrade.subtitle")}
            </div>
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.text,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              padding: "4px 10px",
              borderRadius: 4,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: COLORS.coinGold, marginRight: 4 }}>●</span>
            {formatBalance(balance)}
          </div>
          <button
            onClick={onClose}
            aria-label={t("computer.upgrade.closeAria")}
            style={{
              width: 28,
              height: 28,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "6px 0",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {COMPUTER_LEVELS.map((tier) => {
              const reached = tier.level <= level;
              return (
                <span
                  key={tier.id}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: reached ? COLORS.coinGold : "transparent",
                    border: `2px solid ${reached ? COLORS.accentGoldDark : COLORS.cardBorder}`,
                    boxShadow: reached
                      ? `inset 1px 1px 0 0 ${COLORS.parchmentLight}`
                      : "none",
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: COLORS.hintText,
            }}
          >
            {`Lv ${level + 1} / ${totalTiers}`}
          </div>
        </div>

        {/* Side-by-side: current → next */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 10,
          }}
        >
          <TierCard
            tier={currentLevel}
            label={t("computer.upgrade.current")}
            tone="current"
          />
          <div
            aria-hidden
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: isMaxed ? COLORS.hintText : COLORS.accentGoldDark,
              padding: "0 2px",
              userSelect: "none",
            }}
          >
            →
          </div>
          {isMaxed ? (
            <MaxedCard />
          ) : (
            <TierCard tier={nextLevel} label={t("computer.upgrade.next")} tone="next" />
          )}
        </div>

        {/* What you'll get — flavor text for the next tier */}
        {!isMaxed && (
          <div
            style={{
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 6,
              padding: "8px 10px",
              boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: COLORS.hintText,
                marginBottom: 4,
              }}
            >
              {t("computer.upgrade.next")}
            </div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.text,
                lineHeight: 1.4,
              }}
            >
              {t(nextLevel.descriptionKey)}
            </div>
          </div>
        )}

        {message && (
          <div
            style={{
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 6,
              color: COLORS.text,
              fontSize: 12,
              lineHeight: 1.35,
              padding: "8px 10px",
            }}
          >
            {message}
          </div>
        )}

        <button
          onClick={handleUpgrade}
          disabled={!nextLevel || !canAfford || purchasing}
          style={{
            background: purchasing
              ? COLORS.coinGold
              : canAfford
                ? COLORS.buyEnabled
                : COLORS.buyDisabled,
            color: "#fdf6e0",
            border: `2px solid ${purchasing ? COLORS.accentGoldDark : COLORS.cardBorder}`,
            borderRadius: 4,
            padding: "10px 12px",
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: 0.5,
            cursor: canAfford && !purchasing ? "pointer" : "not-allowed",
            opacity: nextLevel ? (canAfford ? 1 : 0.75) : 0.6,
            transition: "background 0.15s linear, transform 0.15s ease-out",
            transform: purchasing ? "scale(1.03)" : "scale(1)",
            boxShadow: purchasing ? `0 0 18px ${COLORS.coinGold}` : "none",
          }}
        >
          {nextLevel
            ? t("computer.upgrade.button", { price: formatBalance(nextLevel.costCents) })
            : t("computer.upgrade.maxedButton")}
        </button>
      </div>
    </div>
  );
}

interface TierCardProps {
  tier: ComputerLevel;
  label: string;
  tone: "current" | "next";
}

function TierCard({ tier, label, tone }: TierCardProps) {
  const isNext = tone === "next";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        background: isNext ? COLORS.cardActive : COLORS.cardRest,
        border: `2px solid ${isNext ? COLORS.accentGoldDark : COLORS.cardBorder}`,
        borderRadius: 6,
        padding: "10px 8px",
        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: isNext ? COLORS.accentGoldDark : COLORS.hintText,
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          maxWidth: 120,
          background: COLORS.parchmentLight,
          border: `2px solid ${COLORS.cardBorder}`,
          borderRadius: 4,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        <img
          src={TIER_IMG[tier.id]}
          alt={t(tier.nameKey)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            imageRendering: "pixelated",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: COLORS.text,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {t(tier.nameKey)}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.hintText,
          letterSpacing: 0.5,
        }}
      >
        {`Lv ${tier.level + 1}`}
      </div>
    </div>
  );
}

function MaxedCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        background: COLORS.cardActive,
        border: `2px solid ${COLORS.accentGoldDark}`,
        borderRadius: 6,
        padding: "10px 8px",
        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: COLORS.accentGoldDark,
        }}
      >
        ★ MAX
      </div>
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          maxWidth: 120,
          background: COLORS.parchmentLight,
          border: `2px solid ${COLORS.cardBorder}`,
          borderRadius: 4,
          display: "grid",
          placeItems: "center",
          fontSize: 40,
          color: COLORS.coinGold,
        }}
      >
        ★
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: COLORS.text,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {t("computer.upgrade.maxedButton")}
      </div>
    </div>
  );
}
