"use client";

import { useEffect, useState } from "react";
import {
  COMPUTER_LEVELS,
  ComputerLevel,
  ComputerLevelId,
  finishComputerUpgrade,
  getNextComputerLevel,
  startNextComputerUpgrade,
  useComputerUpgradeLevel,
} from "../data/computerUpgrade";
import {
  formatUpgradeRemaining,
  getUpgradeTimerProgress,
  useNow,
  useUpgradeTimer,
} from "../data/computerUpgradeTimer";
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
  const timer = useUpgradeTimer();
  // Re-tick every 250ms so the MM:SS label + progress bar refresh
  // while a timer is running. No-op when there's no timer.
  const now = useNow(250);
  const [message, setMessage] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const currentLevel = COMPUTER_LEVELS[level] ?? COMPUTER_LEVELS[0];
  const totalTiers = COMPUTER_LEVELS.length;
  // While a timer is running, the "next" card should reflect the tier
  // the player is actually upgrading TO, not whatever
  // `getNextComputerLevel(level)` would say (those match in normal
  // flow, but using the timer's target avoids any drift if level got
  // bumped externally).
  const nextLevel: ComputerLevel | null = timer
    ? COMPUTER_LEVELS[timer.targetLevel] ?? null
    : getNextComputerLevel(level);
  const isMaxed = nextLevel === null;
  const progress = getUpgradeTimerProgress(now, timer);

  // Three modes — each maps to a different button + state-line.
  type Mode = "idle" | "running" | "ready";
  const mode: Mode = progress
    ? progress.complete
      ? "ready"
      : "running"
    : "idle";

  const canAfford =
    mode === "idle" && nextLevel !== null && balance >= nextLevel.costCents;

  const handleStart = () => {
    if (purchasing) return;
    if (!nextLevel) {
      setMessage(t("computer.upgrade.maxed"));
      return;
    }
    if (balance < nextLevel.costCents) {
      setMessage(
        t("computer.upgrade.needMoney", {
          amount: formatBalance(nextLevel.costCents - balance),
        }),
      );
      return;
    }
    // Gold-flash the button, then commit the start. Modal stays open
    // so the player sees the timer tick down right away.
    setPurchasing(true);
    window.setTimeout(() => {
      startNextComputerUpgrade();
      setPurchasing(false);
    }, 200);
  };

  const handleFinish = () => {
    if (purchasing) return;
    // Same flash-then-close cadence as the old one-step flow — the
    // delay gives the world FX time to play AFTER the modal is gone.
    setPurchasing(true);
    window.setTimeout(() => {
      finishComputerUpgrade();
      onClose();
    }, 280);
  };

  const handlePrimaryClick = () => {
    if (mode === "ready") handleFinish();
    else handleStart();
  };

  const primaryDisabled =
    purchasing ||
    (mode === "idle" && (!nextLevel || !canAfford)) ||
    mode === "running";

  const primaryLabel = (() => {
    if (mode === "ready") return t("computer.upgrade.finishButton");
    if (mode === "running" && progress) {
      return t("computer.upgrade.runningButton", {
        time: formatUpgradeRemaining(progress.remainingMs),
      });
    }
    if (!nextLevel) return t("computer.upgrade.maxedButton");
    return t("computer.upgrade.button", {
      price: formatBalance(nextLevel.costCents),
    });
  })();

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

        {/* Timer progress bar — only shown while an upgrade is in
            progress or has just completed. Sits right above the
            primary button so the eye moves "progress → action". */}
        {progress && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: compact ? 10 : 11,
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: progress.complete
                  ? COLORS.accentGoldDark
                  : COLORS.hintText,
              }}
            >
              <span>
                {progress.complete
                  ? t("computer.upgrade.ready")
                  : t("computer.upgrade.inProgress")}
              </span>
              {!progress.complete && (
                <span style={{ color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>
                  {formatUpgradeRemaining(progress.remainingMs)}
                </span>
              )}
            </div>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 8,
                background: COLORS.parchmentLight,
                border: `2px solid ${COLORS.cardBorder}`,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${progress.progress01 * 100}%`,
                  background: COLORS.coinGold,
                  transition: "width 0.25s linear",
                }}
              />
            </div>
          </div>
        )}

        <button
          onClick={handlePrimaryClick}
          disabled={primaryDisabled}
          style={{
            background: purchasing
              ? COLORS.coinGold
              : mode === "ready"
                ? COLORS.coinGold
                : canAfford
                  ? COLORS.buyEnabled
                  : COLORS.buyDisabled,
            color: "#fdf6e0",
            border: `2px solid ${
              purchasing || mode === "ready" ? COLORS.accentGoldDark : COLORS.cardBorder
            }`,
            borderRadius: 4,
            padding: compact ? "7px 10px" : "10px 12px",
            fontSize: compact ? 13 : 14,
            fontWeight: 800,
            letterSpacing: 0.5,
            cursor: primaryDisabled ? "not-allowed" : "pointer",
            opacity: primaryDisabled && mode !== "running" ? 0.7 : 1,
            transition: "background 0.15s linear, transform 0.15s ease-out",
            transform: purchasing ? "scale(1.03)" : "scale(1)",
            boxShadow:
              purchasing || mode === "ready"
                ? `0 0 18px ${COLORS.coinGold}`
                : "none",
          }}
        >
          {primaryLabel}
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
