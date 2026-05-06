/**
 * Tiny boolean-flag store for one-shot game progression events.
 *
 * Slice 1 uses this for things like "child-asked-for-sandwich" and
 * "child-fed" — too small for a full quest engine, but enough to
 * branch dialogue on what's already happened. When slice 2 lands a
 * proper quest state machine, flags here become quest-step keys
 * (set them on quest-step-complete; existing read sites can keep
 * working unchanged).
 *
 * Same localStorage / module-cache / pub-sub pattern as wallet.ts
 * and inventory.ts.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lingo-event-flags:v1';

type FlagSet = Record<string, true>;
type Listener = (flags: FlagSet) => void;
const listeners = new Set<Listener>();
let cached: FlagSet | null = null;

function read(): FlagSet {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') {
    cached = {};
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = {};
      return cached;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      cached = {};
      return cached;
    }
    const cleaned: FlagSet = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === true) cleaned[k] = true;
    }
    cached = cleaned;
  } catch {
    cached = {};
  }
  return cached;
}

function write(value: FlagSet): void {
  cached = value;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch { /* silent */ }
}

function emit(): void {
  const snapshot = { ...read() };
  for (const l of listeners) l(snapshot);
}

export function hasFlag(key: string): boolean {
  return read()[key] === true;
}

export function setFlag(key: string): void {
  const current = read();
  if (current[key]) return; // idempotent — no-op when already set
  write({ ...current, [key]: true });
  emit();
}

export function clearFlag(key: string): void {
  const current = read();
  if (!current[key]) return;
  const { [key]: _gone, ...rest } = current;
  void _gone;
  write(rest);
  emit();
}

export function subscribeFlags(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — returns whether `key` is set and re-renders on change. */
export function useEventFlag(key: string): boolean {
  const [flag, setFlag2] = useState<boolean>(() => hasFlag(key));
  useEffect(() => {
    setFlag2(hasFlag(key));
    return subscribeFlags((flags) => setFlag2(flags[key] === true));
  }, [key]);
  return flag;
}

/** Common flag keys, centralised so a typo in one site doesn't
 *  silently desync from another. */
export const FLAGS = {
  CHILD_ASKED_FOR_SANDWICH: 'child-asked-for-sandwich',
  CHILD_FED: 'child-fed',
  /** True once the player has finished the opening cutscene
   *  (Phase 1 of the intro). The cutscene only renders when this
   *  flag is missing; flipping it on is permanent unless cleared
   *  by the dev reset path. */
  INTRO_CUTSCENE_SEEN: 'intro-cutscene-seen',
  /** True once the parent's apartment monologue has played. Auto-
   *  fires the first time the player lands in pokemon-house-1f
   *  with the intro quest active; gives the practical exposition
   *  (rent timer, translator-job plan, the lie) inside the room
   *  it refers to instead of mid-cutscene. Permanent unless the
   *  dev reset path wipes it. */
  INTRO_APARTMENT_SEEN: 'intro-apartment-seen',
  /** True once the CEO has hired the player (Stage 3 of the intro
   *  dialogue). Used to swap the intro quest's marker target from
   *  the CEO to the office tutor — the player is told to talk to
   *  the trainer next. The intro quest itself stays active until
   *  the tutor's mock-job session completes. */
  INTRO_HIRED: 'intro-hired',
  /** True once the player has finished the in-office first-customer
   *  session (Eli's 3-word translator job). Stops Eli from
   *  re-offering the warm-up on every subsequent visit and is the
   *  signal that completes intro-translator-job → first-paycheck. */
  INTRO_TUTOR_DONE: 'intro-tutor-done',
} as const;
