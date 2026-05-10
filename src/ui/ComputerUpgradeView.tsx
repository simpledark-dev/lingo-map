"use client";

import { useState } from "react";
import {
  COMPUTER_LEVELS,
  getNextComputerLevel,
  purchaseNextComputerUpgrade,
  useComputerUpgradeLevel,
} from "../data/computerUpgrade";
import { t } from "../data/i18n";
import { formatBalance, useWalletBalance } from "../data/wallet";
import { getUiTheme } from "./uiThemes";

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface ComputerUpgradeViewProps {
  onClose: () => void;
}

export default function ComputerUpgradeView({ onClose }: ComputerUpgradeViewProps) {
  const level = useComputerUpgradeLevel();
  const balance = useWalletBalance();
  const [message, setMessage] = useState<string | null>(null);
  const nextLevel = getNextComputerLevel(level);

  const handleUpgrade = () => {
    const result = purchaseNextComputerUpgrade();
    if (result.ok) {
      setMessage(t("computer.upgrade.success", { item: t(result.level.nameKey) }));
      return;
    }
    if (result.reason === "insufficient" && result.level) {
      setMessage(
        t("computer.upgrade.needMoney", {
          amount: formatBalance(result.level.costCents - balance),
        }),
      );
      return;
    }
    setMessage(t("computer.upgrade.maxed"));
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
        }}
      >
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

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {COMPUTER_LEVELS.map((item) => {
            const isCurrent = item.level === level;
            const isOwned = item.level < level;
            const isNext = nextLevel?.level === item.level;
            const isLocked = item.level > level + 1;
            const canAfford = balance >= item.costCents;
            return (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 10,
                  background: isCurrent ? COLORS.cardActive : COLORS.cardRest,
                  border: `2px solid ${isCurrent ? COLORS.accentGoldDark : COLORS.cardBorder}`,
                  borderRadius: 6,
                  padding: "9px 10px",
                  boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                  opacity: isLocked ? 0.74 : 1,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 4,
                    border: `2px solid ${COLORS.cardBorder}`,
                    background: COLORS.parchmentLight,
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                >
                  {item.level === 0 ? "⌁" : item.level}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: COLORS.text,
                    }}
                  >
                    {t(item.nameKey)}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: COLORS.hintText,
                      lineHeight: 1.35,
                    }}
                  >
                    {t(item.descriptionKey)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 4,
                    minWidth: 76,
                  }}
                >
                  {item.costCents > 0 && (
                    <div
                      style={{
                        color: COLORS.accentGoldDark,
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {formatBalance(item.costCents)}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: isNext && canAfford ? COLORS.buyEnabled : COLORS.hintText,
                    }}
                  >
                    {isCurrent
                      ? t("computer.upgrade.current")
                      : isOwned
                        ? t("computer.upgrade.owned")
                        : isNext
                          ? t("computer.upgrade.next")
                          : t("computer.upgrade.locked")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
          disabled={!nextLevel || balance < nextLevel.costCents}
          style={{
            background:
              nextLevel && balance >= nextLevel.costCents
                ? COLORS.buyEnabled
                : COLORS.buyDisabled,
            color: "#fdf6e0",
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 4,
            padding: "9px 12px",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.5,
            cursor: nextLevel && balance >= nextLevel.costCents ? "pointer" : "not-allowed",
            opacity: nextLevel && balance >= nextLevel.costCents ? 1 : 0.75,
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
