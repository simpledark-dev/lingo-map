/**
 * Persistent player wallet — survives reloads, syncs across views.
 *
 * One global balance, stored in localStorage as an integer count of
 * cents (so $0.03 is `3`). Cents-as-int avoids floating-point drift
 * across thousands of small ±$0.01–$0.03 updates. The HUD and the
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
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lingo-wallet:balance';

/** Cents earned for a correct vocabulary answer. ($0.03) */
export const REWARD_PER_CORRECT = 3;
/** Cents removed for a wrong vocabulary answer. ($0.02) */
export const PENALTY_PER_WRONG = 2;
/** Cents removed for an "I don't know" admission. ($0.01) — biting
 *  but markedly less than a wrong guess so honesty stays the
 *  rational play. */
export const PENALTY_PER_IDK = 1;

type Listener = (balance: number) => void;
const listeners = new Set<Listener>();
let cached: number | null = null;

function read(): number {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') {
    cached = 0;
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    cached = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    cached = 0;
  }
  return cached;
}

function write(value: number): void {
  cached = value;
  if (typeof window === 'undefined') return;
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
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/** Format a signed delta for floating-badge UI ("+$0.03" / "-$0.02"). */
export function formatDelta(cents: number): string {
  if (cents > 0) return `+${formatBalance(cents)}`;
  return formatBalance(cents); // negative formatBalance already prefixes the minus
}
