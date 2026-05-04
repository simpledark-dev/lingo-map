/**
 * Persistent player energy — the "stamina" gate on translation jobs.
 *
 * Each round of paid translation costs 1 energy. Energy doesn't
 * regenerate on its own (slice 3 design — accuracy is the gate, not
 * real-time waiting); the player restores it by eating items
 * bought from the Mart. Run out → can't take more jobs until you
 * eat. Food prices are intentionally closer to real U.S. prices now,
 * so meals are a longer-term money sink rather than something a few
 * perfect answers can immediately cover.
 *
 * Starter energy is generous on a fresh save (20 of 30 max) so the
 * very first session is friction-free. Practice mode is exempt
 * from the energy check — drilling for accuracy stays free so the
 * learning loop is never gated by a soft-currency state.
 *
 * Same module-cache + pub-sub pattern as wallet.ts / inventory.ts.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lingo-energy:v1';

/** Hard cap on the energy bar. Items refill toward this; any
 *  excess is silently dropped. Picked so the costliest food
 *  (sandwich, 10) plus a fresh-save starter still fits inside. */
export const MAX_ENERGY = 30;

/** Energy a brand-new save starts with. Tuned generous so the
 *  first session covers the early "I don't know any words yet"
 *  hump without forcing the player to eat before they've earned
 *  anything. */
const STARTER_ENERGY = 20;

type Listener = (energy: number) => void;
const listeners = new Set<Listener>();
let cached: number | null = null;

function read(): number {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') {
    cached = STARTER_ENERGY;
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // Fresh save — give the starter and persist so it sticks.
      cached = STARTER_ENERGY;
      window.localStorage.setItem(STORAGE_KEY, String(cached));
      return cached;
    }
    const parsed = Number(raw);
    cached = Number.isFinite(parsed)
      ? Math.max(0, Math.min(MAX_ENERGY, Math.floor(parsed)))
      : STARTER_ENERGY;
  } catch {
    cached = STARTER_ENERGY;
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

export function getEnergy(): number {
  return read();
}

export function getMaxEnergy(): number {
  return MAX_ENERGY;
}

/** Try to spend `n` energy. Returns true on success, false if the
 *  player didn't have enough (no partial spends — the round either
 *  starts in full or doesn't). Defaults to 1 for the common
 *  per-round case. */
export function consumeEnergy(n = 1): boolean {
  if (n <= 0) return true;
  const current = read();
  if (current < n) return false;
  write(current - n);
  emit();
  return true;
}

/** Add `n` energy, clamped to MAX_ENERGY. Used by the eat action
 *  in inventory.ts. */
export function restoreEnergy(n: number): void {
  if (n <= 0) return;
  const next = Math.min(MAX_ENERGY, read() + Math.floor(n));
  write(next);
  emit();
}

export function subscribeEnergy(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEnergy(): number {
  const [e, setE] = useState<number>(() => getEnergy());
  useEffect(() => {
    setE(getEnergy());
    return subscribeEnergy(setE);
  }, []);
  return e;
}
