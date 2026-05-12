"use client";

import { useEffect, useState } from "react";
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
// Anything shorter than this (typically mobile landscape: ~375-430 px
// tall) gets a compact layout — smaller paddings, no subtitle, the
// "next description" collapsed to a one-line italic. Keeps the full
// upgrade flow visible without scrolling.
const COMPACT_HEIGHT_THRESHOLD = 500;

function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerHeight < COMPACT_HEIGHT_THRESHOLD;
  });
  useEffect(() => {
    const onChange = () => setCompact(window.innerHeight < COMPACT_HEIGHT_THRESHOLD);
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);
  return compact;
}

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
  const compact = useCompactLayout();
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
          padding: compact ? 10 : 16,
          gap: compact ? 6 : 12,
          overflowY: "auto",
        }}
      >
        {/* Header: title + balance + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: compact ? 15 : 18,
                fontWeight: 800,
                color: COLORS.text,
                letterSpacing: 0.5,
              }}
            >
              {t("computer.upgrade.title")}
            </div>
            {!compact && (
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
            )}
          </div>
          <div
            style={{
              fontSize: compact ? 12 : 14,
              fontWeight: 700,
              color: COLORS.text,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              padding: compact ? "2px 8px" : "4px 10px",
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
              width: compact ? 24 : 28,
              height: compact ? 24 : 28,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 4,
              color: COLORS.text,
              fontSize: compact ? 12 : 14,
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
            padding: compact ? "0" : "6px 0",
          }}
        >
          <div style={{ display: "flex", gap: compact ? 4 : 6 }}>
            {COMPUTER_LEVELS.map((tier) => {
              const reached = tier.level <= level;
              const dotSize = compact ? 8 : 10;
              return (
                <span
                  key={tier.id}
                  style={{
                    width: dotSize,
                    height: dotSize,
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
              fontSize: compact ? 10 : 11,
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
            gap: compact ? 6 : 10,
          }}
        >
          <TierCard
            tier={currentLevel}
            label={t("computer.upgrade.current")}
            tone="current"
            compact={compact}
          />
          <div
            aria-hidden
            style={{
              fontSize: compact ? 20 : 28,
              fontWeight: 900,
              color: isMaxed ? COLORS.hintText : COLORS.accentGoldDark,
              padding: "0 2px",
              userSelect: "none",
            }}
          >
            →
          </div>
          {isMaxed ? (
            <MaxedCard compact={compact} />
          ) : (
            <TierCard
              tier={nextLevel}
              label={t("computer.upgrade.next")}
              tone="next"
              compact={compact}
            />
          )}
        </div>

        {/* What you'll get — flavor text for the next tier */}
        {!isMaxed &&
          (compact ? (
            <div
              style={{
                fontSize: 11,
                color: COLORS.text,
                lineHeight: 1.35,
                textAlign: "center",
                padding: "0 4px",
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  color: COLORS.accentGoldDark,
                  fontStyle: "normal",
                  marginRight: 4,
                }}
              >
                {t("computer.upgrade.next")}:
              </span>
              <span style={{ fontStyle: "italic" }}>
                {t(nextLevel.descriptionKey)}
              </span>
            </div>
          ) : (
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
          ))}

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
            padding: compact ? "7px 10px" : "10px 12px",
            fontSize: compact ? 13 : 14,
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
  compact: boolean;
}

function TierCard({ tier, label, tone, compact }: TierCardProps) {
  const isNext = tone === "next";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 3 : 6,
        background: isNext ? COLORS.cardActive : COLORS.cardRest,
        border: `2px solid ${isNext ? COLORS.accentGoldDark : COLORS.cardBorder}`,
        borderRadius: 6,
        padding: compact ? "6px 6px" : "10px 8px",
        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: compact ? 9 : 10,
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
          maxWidth: compact ? 64 : 120,
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
          fontSize: compact ? 12 : 13,
          fontWeight: 800,
          color: COLORS.text,
          textAlign: "center",
          lineHeight: 1.15,
        }}
      >
        {t(tier.nameKey)}
      </div>
      <div
        style={{
          fontSize: compact ? 9 : 10,
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

function MaxedCard({ compact }: { compact: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 3 : 6,
        background: COLORS.cardActive,
        border: `2px solid ${COLORS.accentGoldDark}`,
        borderRadius: 6,
        padding: compact ? "6px 6px" : "10px 8px",
        boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
      }}
    >
      <div
        style={{
          fontSize: compact ? 9 : 10,
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
          maxWidth: compact ? 64 : 120,
          background: COLORS.parchmentLight,
          border: `2px solid ${COLORS.cardBorder}`,
          borderRadius: 4,
          display: "grid",
          placeItems: "center",
          fontSize: compact ? 24 : 40,
          color: COLORS.coinGold,
        }}
      >
        ★
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          color: COLORS.text,
          textAlign: "center",
          lineHeight: 1.15,
        }}
      >
        {t("computer.upgrade.maxedButton")}
      </div>
    </div>
  );
}
