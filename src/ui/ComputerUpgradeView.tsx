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
  reduceUpgradeTimer,
  useNow,
  useUpgradeTimer,
} from "../data/computerUpgradeTimer";
import { t } from "../data/i18n";
import {
  getMeaning,
  MIRA_PACK,
  VocabularyEntry,
} from "../data/vocabularyPacks";
import { formatBalance, useWalletBalance } from "../data/wallet";
import { playSfx, SFX } from "./sfx";
import { getUiTheme } from "./uiThemes";

// Source of words for the speed-up mini-quiz. Pinned to MIRA_PACK
// because it's the broadest beginner-friendly deck; later we can
// route to whatever pack the player is currently studying.
const SPEEDUP_PACK = MIRA_PACK;
// How much time each correct answer shaves off the timer.
const SPEEDUP_REWARD_MS = 10_000;

interface SpeedupQuestion {
  correct: VocabularyEntry;
  options: VocabularyEntry[];
}

function buildSpeedupQuestion(): SpeedupQuestion {
  const pool = SPEEDUP_PACK.entries;
  const correct = pool[Math.floor(Math.random() * pool.length)];
  // Prefer same-POS distractors so the test is meaningful — fall
  // back to any if the POS pool is too small.
  const samePos = pool.filter(
    (e) => e.target !== correct.target && e.pos === correct.pos,
  );
  const fallback = pool.filter((e) => e.target !== correct.target);
  const distractorPool = samePos.length >= 3 ? samePos : fallback;
  const distractors: VocabularyEntry[] = [];
  const used = new Set<string>();
  while (distractors.length < 3 && distractors.length < distractorPool.length) {
    const candidate =
      distractorPool[Math.floor(Math.random() * distractorPool.length)];
    if (used.has(candidate.target)) continue;
    used.add(candidate.target);
    distractors.push(candidate);
  }
  const options = [correct, ...distractors];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { correct, options };
}

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
  // Modal has two body modes — the regular upgrade view (cards + Buy
  // button) and the speed-up mini-quiz. The header (title, balance,
  // close X) stays the same across both so the player can always bail
  // out the same way.
  const [view, setView] = useState<"upgrade" | "speedup">("upgrade");
  const [question, setQuestion] = useState<SpeedupQuestion>(() =>
    buildSpeedupQuestion(),
  );
  // After answering, freeze the buttons for a beat to show feedback
  // (green for correct, red for wrong), then auto-advance to the
  // next question.
  const [answerState, setAnswerState] = useState<{
    pickedTarget: string;
    correct: boolean;
  } | null>(null);
  // "+10s" floater shown briefly on every correct answer. Lives in
  // its own state so the timer in the header can also bump.
  const [floater, setFloater] = useState<string | null>(null);

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
      const result = finishComputerUpgrade();
      if (result.ok) playSfx(SFX.UPGRADE);
      onClose();
    }, 280);
  };

  const enterSpeedup = () => {
    if (mode !== "running") return;
    setQuestion(buildSpeedupQuestion());
    setAnswerState(null);
    setFloater(null);
    setView("speedup");
  };

  const exitSpeedup = () => {
    setView("upgrade");
    setAnswerState(null);
    setFloater(null);
  };

  const handlePickAnswer = (entry: VocabularyEntry) => {
    // Lock the buttons; the round stays in "review" state until the
    // player clicks Next, so they can see the correct answer + reward
    // feedback at their own pace (matches the Translate-view pattern).
    if (answerState) return;
    const isCorrect = entry.target === question.correct.target;
    setAnswerState({ pickedTarget: entry.target, correct: isCorrect });
    if (isCorrect) {
      reduceUpgradeTimer(SPEEDUP_REWARD_MS);
      playSfx(SFX.CORRECT);
      setFloater(
        t("computer.speedup.timeAdded", {
          seconds: Math.round(SPEEDUP_REWARD_MS / 1000),
        }),
      );
    } else {
      setFloater(null);
    }
  };

  const handleSpeedupNext = () => {
    setQuestion(buildSpeedupQuestion());
    setAnswerState(null);
    setFloater(null);
  };

  // When the timer completes mid-quiz (player's last correct answer
  // pushed it over the line, or it organically finished while they
  // were translating), kick them back to the upgrade view so they
  // can hit "Finish Upgrade." Otherwise the quiz keeps running on a
  // timer that's already done.
  useEffect(() => {
    if (view === "speedup" && (!progress || progress.complete)) {
      exitSpeedup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, progress?.complete]);

  const handlePrimaryClick = () => {
    if (mode === "ready") handleFinish();
    else if (mode === "running") enterSpeedup();
    else handleStart();
  };

  const primaryDisabled =
    purchasing || (mode === "idle" && (!nextLevel || !canAfford));

  const primaryLabel = (() => {
    if (mode === "ready") return t("computer.upgrade.finishButton");
    if (mode === "running") return t("computer.upgrade.speedupButton");
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
      onClick={onClose}
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
        onClick={(e) => e.stopPropagation()}
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

        {view === "speedup" ? (
          <SpeedupBody
            compact={compact}
            question={question}
            answerState={answerState}
            floater={floater}
            remainingLabel={
              progress
                ? formatUpgradeRemaining(progress.remainingMs)
                : "0:00"
            }
            onBack={exitSpeedup}
            onPick={handlePickAnswer}
            onNext={handleSpeedupNext}
          />
        ) : (
          <>
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
                : mode === "running"
                  ? "#3a6fb5"
                  : canAfford
                    ? COLORS.buyEnabled
                    : COLORS.buyDisabled,
            color: "#fdf6e0",
            border: `2px solid ${
              purchasing || mode === "ready"
                ? COLORS.accentGoldDark
                : mode === "running"
                  ? "#274d80"
                  : COLORS.cardBorder
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
          </>
        )}
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

interface SpeedupBodyProps {
  compact: boolean;
  question: SpeedupQuestion;
  answerState: { pickedTarget: string; correct: boolean } | null;
  floater: string | null;
  remainingLabel: string;
  onBack: () => void;
  onPick: (entry: VocabularyEntry) => void;
  onNext: () => void;
}

function SpeedupBody({
  compact,
  question,
  answerState,
  floater,
  remainingLabel,
  onBack,
  onPick,
  onNext,
}: SpeedupBodyProps) {
  const answered = answerState !== null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 8 : 12,
      }}
    >
      {/* Header row inside the speedup view: back link + live timer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: COLORS.accentGoldDark,
            fontSize: compact ? 12 : 13,
            fontWeight: 800,
            letterSpacing: 0.5,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {t("computer.speedup.back")}
        </button>
        <div
          style={{
            fontSize: compact ? 12 : 14,
            fontWeight: 800,
            color: COLORS.text,
            fontVariantNumeric: "tabular-nums",
            background: COLORS.parchmentLight,
            border: `2px solid ${COLORS.cardBorder}`,
            padding: compact ? "2px 8px" : "3px 10px",
            borderRadius: 4,
          }}
        >
          {remainingLabel}
        </div>
      </div>

      {/* Prompt — with the chunky reward badge floating over it on
          a correct answer. The badge style mirrors the Translate
          view's `.vt-money-feedback` so the visual language is
          consistent across earning surfaces. */}
      <div
        style={{
          position: "relative",
          textAlign: "center",
          padding: compact ? "6px 8px" : "10px 12px",
          background: COLORS.parchmentLight,
          border: `2px solid ${COLORS.cardBorder}`,
          borderRadius: 6,
        }}
      >
        {floater && (
          <div
            key={floater + question.correct.target}
            style={{
              position: "absolute",
              top: -16,
              left: "50%",
              transform: "translateX(-50%)",
              minWidth: 92,
              padding: compact ? "6px 14px" : "8px 18px",
              borderRadius: 6,
              textAlign: "center",
              fontSize: compact ? 18 : 22,
              fontWeight: 900,
              letterSpacing: 0,
              lineHeight: 1,
              color: "#1f5a1f",
              background: "rgba(58, 138, 58, 0.18)",
              border: "3px solid #3a8a3a",
              boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 4px 0 0 ${COLORS.cardBorder}`,
              pointerEvents: "none",
              animation: "lingoSpeedupBadgePop 1450ms ease-out forwards",
              textShadow: "1px 1px 0 rgba(255,255,255,0.35)",
              zIndex: 2,
            }}
          >
            {floater}
          </div>
        )}
        <div
          style={{
            fontSize: compact ? 10 : 11,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: COLORS.hintText,
            marginBottom: 4,
          }}
        >
          {t("computer.speedup.title")}
        </div>
        <div
          style={{
            fontSize: compact ? 15 : 18,
            fontWeight: 800,
            color: COLORS.text,
            lineHeight: 1.2,
          }}
        >
          {t("computer.speedup.question", { word: question.correct.target })}
        </div>
      </div>

      {/* Choices (2×2 grid) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: compact ? 6 : 8,
        }}
      >
        {question.options.map((opt) => {
          const isPicked = answerState?.pickedTarget === opt.target;
          const isCorrect = answerState?.correct && isPicked;
          const isWrong = answerState && !answerState.correct && isPicked;
          const revealCorrect =
            answerState &&
            !answerState.correct &&
            opt.target === question.correct.target;
          const bg = isCorrect
            ? "#3a8a3a"
            : isWrong
              ? "#a83b3b"
              : revealCorrect
                ? "#3a8a3a"
                : COLORS.cardRest;
          const fg = isCorrect || isWrong || revealCorrect ? "#fdf6e0" : COLORS.text;
          const borderColor = isCorrect || revealCorrect
            ? "#1f5a1f"
            : isWrong
              ? "#5d1f1f"
              : COLORS.cardBorder;
          return (
            <button
              key={opt.target}
              onClick={() => onPick(opt)}
              disabled={answered}
              style={{
                position: "relative",
                background: bg,
                color: fg,
                border: `2px solid ${borderColor}`,
                borderRadius: 8,
                padding: compact ? "9px 6px" : "12px 8px",
                fontSize: compact ? 13 : 15,
                fontWeight: 800,
                letterSpacing: 0.3,
                cursor: answered ? "default" : "pointer",
                transition: "background 0.15s ease-out",
                minHeight: compact ? 36 : 44,
                lineHeight: 1.15,
              }}
            >
              {getMeaning(opt)}
              {isCorrect ? (
                <span style={{ marginLeft: 6, fontSize: compact ? 13 : 15 }}>✓</span>
              ) : null}
              {isWrong ? (
                <span style={{ marginLeft: 6, fontSize: compact ? 13 : 15 }}>✗</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Footer: either the Next button (after the player has
          answered) or the hint text reminding them how the speed-up
          works (before they answer). */}
      {answered ? (
        <button
          onClick={onNext}
          style={{
            background: COLORS.buyEnabled,
            color: "#fdf6e0",
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 6,
            padding: compact ? "8px 10px" : "10px 12px",
            fontSize: compact ? 13 : 14,
            fontWeight: 800,
            letterSpacing: 0.5,
            cursor: "pointer",
            boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
          }}
        >
          {t("computer.speedup.next")}
        </button>
      ) : (
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: COLORS.hintText,
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          {t("computer.speedup.hint", {
            seconds: Math.round(SPEEDUP_REWARD_MS / 1000),
          })}
        </div>
      )}

      {/* CSS keyframe for the chunky reward badge — pop in, hold,
          then float up and fade out (matches the Translate view's
          delta-float so the visual language is consistent). */}
      <style>{`
        @keyframes lingoSpeedupBadgePop {
          0%   { opacity: 0; transform: translate(-50%, 10px) scale(0.82); }
          14%  { opacity: 1; transform: translate(-50%, 0)    scale(1.16); }
          30%  { opacity: 1; transform: translate(-50%, 0)    scale(1); }
          74%  { opacity: 1; transform: translate(-50%, -6px)  scale(1); }
          100% { opacity: 0; transform: translate(-50%, -34px) scale(1.08); }
        }
      `}</style>
    </div>
  );
}
