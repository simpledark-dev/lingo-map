/**
 * Persistent debt counter — money the player owes Theo.
 *
 * Slice 3.5 design: the wallet floor is still 0 (penalties for
 * wrong answers / IDK never silently push the player into the
 * red). Borrowing is the explicit "I'm broke and out of energy"
 * recovery path: player visits Theo, taps Borrow, balance goes up
 * by $5 AND debt goes up by $5. The HUD pill shows `balance -
 * debt` so a player with a $5 loan and $0 spent reads as $0.00
 * net (balance offsets the debt). Dropping below $0 net is the
 * visible signal that they owe Theo more than they have.
 *
 * Repayment is manual — Theo doesn't auto-skim earnings. Player
 * has to walk back to him and tap Repay. Cap at $20 (2000 cents)
 * keeps the failure state from cascading into infinite credit.
 *
 * Same module-cache + pub-sub + hook pattern as wallet.ts.
 */
import { useEffect, useState } from 'react';
import { addBalance, getBalance } from './wallet';

const STORAGE_KEY = 'lingo-debt:v1';

/** Cents lent per Borrow tap. Stays small so a borrow run is a
 *  short trip, not a single-tap windfall. */
export const BORROW_INCREMENT_CENTS = 500;
/** Hard ceiling on outstanding debt. Once hit, the Borrow option
 *  is disabled and the player has to repay before borrowing more. */
export const MAX_DEBT_CENTS = 2000;

type Listener = (debt: number) => void;
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
    cached = Number.isFinite(parsed) ? Math.max(0, Math.min(MAX_DEBT_CENTS, Math.floor(parsed))) : 0;
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
  } catch { /* silent */ }
}

function emit(): void {
  const snapshot = read();
  for (const l of listeners) l(snapshot);
}

export function getDebt(): number {
  return read();
}

/** True when the player can take another loan without exceeding
 *  the cap. Used by Theo's dialogue to disable the Borrow button
 *  when maxed out. */
export function canBorrow(): boolean {
  return read() + BORROW_INCREMENT_CENTS <= MAX_DEBT_CENTS;
}

/** Borrow `BORROW_INCREMENT_CENTS` from Theo. Increments both the
 *  wallet balance and the debt counter atomically. Returns true on
 *  success, false if borrowing would exceed `MAX_DEBT_CENTS`. */
export function borrowFromTheo(): boolean {
  if (!canBorrow()) return false;
  write(read() + BORROW_INCREMENT_CENTS);
  emit();
  addBalance(BORROW_INCREMENT_CENTS);
  return true;
}

/** Repay as much as possible: min(walletBalance, debt). Returns
 *  the cents actually repaid (0 if the player has no balance OR
 *  no debt). */
export function repayMax(): number {
  const debt = read();
  const balance = getBalance();
  const amount = Math.min(debt, balance);
  if (amount <= 0) return 0;
  write(debt - amount);
  emit();
  addBalance(-amount);
  return amount;
}

export function subscribeDebt(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDebt(): number {
  const [d, setD] = useState<number>(() => getDebt());
  useEffect(() => {
    setD(getDebt());
    return subscribeDebt(setD);
  }, []);
  return d;
}
