/**
 * Persistent player wallet — survives reloads, syncs across views.
 *
 * One global balance, stored in localStorage as an integer count of
 * cents (so $0.30 is `3`). Cents-as-int avoids floating-point drift
 * across thousands of small ±$0.10–$0.30 updates. The HUD and the
 * vocab views render through `formatBalance` / `formatDelta` so the
 * "$" stays in one place.
 *
 * Why a tiny custom emitter instead of a context: the wallet needs to
 * be readable + mutable from non-React code paths too (e.g., future
 * NPC quest rewards fired from PixiApp). Module-level state with
 * subscribers stays cleanly framework-agnostic.
 *
 * Balance is clamped at 0 — wrong/IDK answers never push the player
 * "into debt". Penalties still bite because they wipe out earned
 * cents, but the metaphor of money breaks if it goes negative.
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "lingo-wallet:balance";
/** Separate counter for cents EARNED via translation work (correct
 *  answers only — not the starter, not borrowing, not quest bonuses).
 *  Drives the `first-paycheck` quest and any future "X earned this
 *  way" milestones. Lives in its own key so penalties / shop spends
 *  / debt repayment don't reset the milestone. */
const LIFETIME_EARNED_KEY = "lingo-wallet:lifetime-earned";
export const REWARD_PER_CORRECT_STORAGE_KEY = "lingo-wallet:reward-per-correct";
const STARTING_BALANCE_CENTS = 200;

/** Default cents earned for a correct vocabulary answer. ($0.30) */
export const REWARD_PER_CORRECT = 30;
/** Cents removed for a wrong vocabulary answer. ($0.20) */
export const PENALTY_PER_WRONG = 20;
/** Cents removed for an "I don't know" admission. ($0.10) — biting
 *  but markedly less than a wrong guess so honesty stays the
 *  rational play. */
export const PENALTY_PER_IDK = 10;

type Listener = (balance: number) => void;
const listeners = new Set<Listener>();
let cached: number | null = null;

/** Lifetime-earnings cache + listener set. Mirrors the balance
 *  pub/sub pattern — module-level so non-React callers (the
 *  first-paycheck watcher, any future RemoteTrigger flows) can
 *  read/subscribe without hooking. */
type EarningsListener = (lifetime: number) => void;
const earningsListeners = new Set<EarningsListener>();
let earningsCached: number | null = null;
type RewardListener = (reward: number) => void;
const rewardListeners = new Set<RewardListener>();
let rewardCached: number | null = null;

function normalizeReward(value: number): number {
  if (!Number.isFinite(value)) return REWARD_PER_CORRECT;
  return Math.max(0, Math.min(999_999, Math.round(value)));
}

function read(): number {
  if (cached !== null) return cached;
  if (typeof window === "undefined") {
    cached = STARTING_BALANCE_CENTS;
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      cached = STARTING_BALANCE_CENTS;
      window.localStorage.setItem(STORAGE_KEY, String(cached));
      return cached;
    }
    const parsed = Number(raw);
    cached = Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : STARTING_BALANCE_CENTS;
  } catch {
    cached = STARTING_BALANCE_CENTS;
  }
  return cached;
}

function write(value: number): void {
  cached = value;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Quota / private mode — silent. The in-memory `cached` value
    // still drives the current session; we just won't survive reloads.
  }
}

export function getBalance(): number {
  return read();
}

/** Apply a delta to the balance (positive or negative). Clamped at 0
 *  so the UI never shows negative coins. Returns the new balance. */
export function addBalance(delta: number): number {
  const next = Math.max(0, read() + delta);
  write(next);
  for (const l of listeners) l(next);
  return next;
}

function readEarnings(): number {
  if (earningsCached !== null) return earningsCached;
  if (typeof window === "undefined") {
    earningsCached = 0;
    return earningsCached;
  }
  try {
    const raw = window.localStorage.getItem(LIFETIME_EARNED_KEY);
    const parsed = raw ? Number(raw) : 0;
    earningsCached = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    earningsCached = 0;
  }
  return earningsCached;
}

function writeEarnings(value: number): void {
  earningsCached = value;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIFETIME_EARNED_KEY, String(value));
  } catch {
    /* silent */
  }
}

function readReward(): number {
  if (rewardCached !== null) return rewardCached;
  if (typeof window === "undefined") {
    rewardCached = REWARD_PER_CORRECT;
    return rewardCached;
  }
  try {
    const raw = window.localStorage.getItem(REWARD_PER_CORRECT_STORAGE_KEY);
    rewardCached =
      raw === null ? REWARD_PER_CORRECT : normalizeReward(Number(raw));
  } catch {
    rewardCached = REWARD_PER_CORRECT;
  }
  return rewardCached;
}

function writeReward(value: number): void {
  rewardCached = normalizeReward(value);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      REWARD_PER_CORRECT_STORAGE_KEY,
      String(rewardCached)
    );
  } catch {
    /* silent */
  }
}

/** Lifetime cents earned via translation work. Distinct from
 *  current balance: spending, penalties, and debt never reduce
 *  this number. */
export function getLifetimeEarnings(): number {
  return readEarnings();
}

/** Add cents to the wallet AND record them as translation
 *  earnings. Use this anywhere a correct-answer reward is paid;
 *  use plain `addBalance` for borrowing, quest bonuses, shop
 *  refunds, and other non-earned credits. Negative amounts are
 *  rejected — earnings are monotonic. */
export function creditEarnings(cents: number): number {
  if (cents <= 0) return getBalance();
  const nextLifetime = readEarnings() + cents;
  writeEarnings(nextLifetime);
  for (const l of earningsListeners) l(nextLifetime);
  return addBalance(cents);
}

/** Current correct-answer reward in cents. Dev Settings can override
 *  this while testing economy pacing; production defaults to $0.30
 *  unless a local override already exists. */
export function getRewardPerCorrect(): number {
  return readReward();
}

export function setRewardPerCorrect(cents: number): number {
  const next = normalizeReward(cents);
  writeReward(next);
  for (const l of rewardListeners) l(next);
  return next;
}

export function adjustRewardPerCorrect(deltaCents: number): number {
  return setRewardPerCorrect(readReward() + deltaCents);
}

export function resetRewardPerCorrect(): number {
  rewardCached = REWARD_PER_CORRECT;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(REWARD_PER_CORRECT_STORAGE_KEY);
    } catch {
      /* silent */
    }
  }
  for (const l of rewardListeners) l(REWARD_PER_CORRECT);
  return REWARD_PER_CORRECT;
}

export function subscribeEarnings(listener: EarningsListener): () => void {
  earningsListeners.add(listener);
  return () => {
    earningsListeners.delete(listener);
  };
}

export function subscribeRewardPerCorrect(
  listener: RewardListener
): () => void {
  rewardListeners.add(listener);
  return () => {
    rewardListeners.delete(listener);
  };
}

/** React hook for lifetime earnings. Same shape as
 *  `useWalletBalance`. */
export function useLifetimeEarnings(): number {
  const [v, setV] = useState<number>(() => getLifetimeEarnings());
  useEffect(() => {
    setV(getLifetimeEarnings());
    return subscribeEarnings(setV);
  }, []);
  return v;
}

export function useRewardPerCorrect(): number {
  const [v, setV] = useState<number>(() => getRewardPerCorrect());
  useEffect(() => {
    setV(getRewardPerCorrect());
    return subscribeRewardPerCorrect(setV);
  }, []);
  return v;
}

export function subscribeBalance(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — returns the live balance (in cents) and re-renders
 *  on change. */
export function useWalletBalance(): number {
  const [balance, setBalance] = useState<number>(() => getBalance());
  useEffect(() => {
    // Re-sync on mount in case localStorage was written before React
    // hydrated.
    setBalance(getBalance());
    return subscribeBalance(setBalance);
  }, []);
  return balance;
}

/** Format an integer cent amount as a "$X.XX" string. Always shows
 *  exactly two fractional digits so widths stay stable. */
export function formatBalance(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

/** Format a signed delta for floating-badge UI ("+$0.30" / "-$0.20"). */
export function formatDelta(cents: number): string {
  if (cents > 0) return `+${formatBalance(cents)}`;
  return formatBalance(cents); // negative formatBalance already prefixes the minus
}
