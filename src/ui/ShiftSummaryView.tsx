"use client";

/**
 * Shift wrap-up modal — shown when the player has served every client
 * on their shift roster (Phase 1 of the office shift loop). Aggregates
 * the shift at a glance: clients served, money earned across the shift,
 * and the flat completion bonus. Closing it lets the quest chain resume
 * (e.g. the first shift completing kicks the home thread into gear).
 *
 * Deliberately thin: per-answer earnings + per-session summaries already
 * happen inside VocabularyTranslateView; this is just the shift-level cap.
 */
import { formatBalance } from "../data/wallet";
import { t } from "../data/i18n";
import { getUiTheme } from "./uiThemes";

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface ShiftSummaryViewProps {
  /** Number of clients served this shift. */
  served: number;
  /** Cents earned (correct-answer earnings) across the whole shift. */
  earnedCents: number;
  /** Flat completion bonus paid when the shift wrapped. */
  bonusCents: number;
  onClose: () => void;
}

export default function ShiftSummaryView({
  served,
  earnedCents,
  bonusCents,
  onClose,
}: ShiftSummaryViewProps) {
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 15,
    fontWeight: 700,
    color: COLORS.text,
    padding: "8px 12px",
    background: COLORS.parchmentLight,
    border: `2px solid ${COLORS.cardBorder}`,
    borderRadius: 4,
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
          width: "min(380px, 100%)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: 0.5,
            textAlign: "center",
          }}
        >
          🛎️ {t("shift.summary.title")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={rowStyle}>
            <span>{t("shift.summary.clientsServed")}</span>
            <span>{served}</span>
          </div>
          <div style={rowStyle}>
            <span>{t("shift.summary.earned")}</span>
            <span style={{ color: COLORS.correct }}>
              {formatBalance(earnedCents)}
            </span>
          </div>
          <div style={rowStyle}>
            <span>{t("shift.summary.bonus")}</span>
            <span style={{ color: COLORS.correct }}>
              +{formatBalance(bonusCents)}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            ...UI_THEME.modal.panelStyle,
            border: `2px solid ${COLORS.cardBorder}`,
            background: COLORS.accentGold,
            color: COLORS.parchmentLight,
            fontSize: 15,
            fontWeight: 700,
            padding: "10px 12px",
            borderRadius: 6,
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          {t("shift.summary.close")}
        </button>
      </div>
    </div>
  );
}
