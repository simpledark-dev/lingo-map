/**
 * Persistent player profile — names entered during the intro
 * cutscene. Same module-cache + pub-sub pattern as the rest of
 * the data layer.
 *
 * Names are required (cutscene blocks until both are filled), so
 * downstream callers treat the post-intro state as "both names
 * present." We still return `null` for either field when the
 * profile hasn't been saved yet — read sites that fire pre-intro
 * (e.g. a debug overlay) need to handle it gracefully rather than
 * crash.
 *
 * The pre-cutscene null-state is also what `IntroCutscene` keys
 * off to know whether to show. Once names are saved, the cutscene
 * never re-renders unless a dev tool clears the flag.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lingo-profile:v1';

export interface Profile {
  playerName: string;
  childName: string;
}

type Listener = (profile: Profile | null) => void;
const listeners = new Set<Listener>();
let cached: Profile | null | undefined;

function read(): Profile | null {
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') {
    cached = null;
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = null;
      return cached;
    }
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.playerName !== 'string' ||
      typeof parsed.childName !== 'string' ||
      !parsed.playerName.trim() ||
      !parsed.childName.trim()
    ) {
      cached = null;
      return cached;
    }
    cached = {
      playerName: parsed.playerName,
      childName: parsed.childName,
    };
  } catch {
    cached = null;
  }
  return cached;
}

function write(value: Profile | null): void {
  cached = value;
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  } catch { /* silent */ }
}

function emit(): void {
  const snap = read();
  for (const l of listeners) l(snap);
}

export function getProfile(): Profile | null {
  return read();
}

export function getPlayerName(): string | null {
  return read()?.playerName ?? null;
}

export function getChildName(): string | null {
  return read()?.childName ?? null;
}

/** Save both names atomically. Trims whitespace but does not
 *  validate length here — the cutscene UI enforces non-empty
 *  trimmed input before letting the user advance. */
export function setProfile(playerName: string, childName: string): void {
  const next: Profile = {
    playerName: playerName.trim(),
    childName: childName.trim(),
  };
  write(next);
  emit();
}

/** Dev-only: wipes the profile. Pairs with `clearFlag('intro-cutscene-seen')`
 *  to fully reset the intro for testing. */
export function clearProfile(): void {
  write(null);
  emit();
}

export function subscribeProfile(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProfile(): Profile | null {
  const [p, setP] = useState<Profile | null>(() => getProfile());
  useEffect(() => {
    setP(getProfile());
    return subscribeProfile(setP);
  }, []);
  return p;
}
