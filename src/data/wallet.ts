/**
 * Persistent player wallet — survives reloads, syncs across views.
 *
 * One global balance, stored in localStorage. Every vocabulary view
 * (practice, translate-for-money, future modes) feeds the same
 * counter so the player has a single number that means "how much I've
 * earned by being good at words". The HUD subscribes to it and
 * updates live.
 *
 * Why a tiny custom emitter instead of a context: the wallet needs to
 * be readable + mutable from non-React code paths too (e.g., future
 * NPC quest rewards fired from PixiApp). Module-level state with
 * subscribers stays cleanly framework-agnostic.
 *
 * Balance is clamped at 0 — wrong/IDK answers never push the player
 * "into debt". Penalties still bite because they wipe out earned
 * coins, but the metaphor of money breaks if it goes negative.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lingo-wallet:balance';

/** Coins awarded for a correct vocabulary answer. */
export const REWARD_PER_CORRECT = 5;
/** Coins removed for a wrong vocabulary answer. */
export const PENALTY_PER_WRONG = 3;
/** Coins removed for an "I don't know" admission. Smaller than a wrong
 *  guess so honesty is cheaper than a 1-in-4 random hit. */
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

/** React hook — returns the live balance and re-renders on change. */
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
