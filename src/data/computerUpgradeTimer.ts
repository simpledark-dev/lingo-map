import { useEffect, useState } from "react";

// Persisted "upgrade in progress" state for the apartment computer.
// When the player starts an upgrade we record the start time + target
// level + duration in localStorage; the timer keeps running across
// page reloads and is consumed when the player clicks "Finish".
//
// Note: this module is intentionally separate from `computerUpgrade.ts`
// so the level state (which the renderer subscribes to for the desk
// sprite swap) stays a single number — only writes when the upgrade
// actually completes, never while a timer is running.

export const UPGRADE_TIMER_STORAGE_KEY = "lingo-computer:upgradeTimer";

export interface UpgradeTimerState {
  /** Wall-clock ms epoch when the player paid + started the timer. */
  startedAt: number;
  /** Level the timer is upgrading to. The renderer + modal show this
   * as the "next" tier while the timer runs, even if the player's
   * current level somehow changes elsewhere. */
  targetLevel: number;
  /** Total duration of this upgrade in ms. Captured at start so a
   * future code change to `upgradeDurationMs` doesn't retroactively
   * speed up / slow down a timer already in progress. */
  durationMs: number;
}

type Listener = (state: UpgradeTimerState | null) => void;

const listeners = new Set<Listener>();
let cached: UpgradeTimerState | null | undefined;

function read(): UpgradeTimerState | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") {
    cached = null;
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(UPGRADE_TIMER_STORAGE_KEY);
    if (!raw) {
      cached = null;
    } else {
      const parsed = JSON.parse(raw) as UpgradeTimerState;
      if (
        typeof parsed?.startedAt === "number" &&
        typeof parsed?.targetLevel === "number" &&
        typeof parsed?.durationMs === "number"
      ) {
        cached = parsed;
      } else {
        cached = null;
      }
    }
  } catch {
    cached = null;
  }
  return cached;
}

function write(state: UpgradeTimerState | null): void {
  cached = state;
  if (typeof window !== "undefined") {
    try {
      if (state === null) {
        window.localStorage.removeItem(UPGRADE_TIMER_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          UPGRADE_TIMER_STORAGE_KEY,
          JSON.stringify(state),
        );
      }
    } catch {
      // Private mode / quota: keep the in-memory state for this session.
    }
  }
  for (const listener of listeners) listener(state);
}

export function getUpgradeTimer(): UpgradeTimerState | null {
  return read();
}

export function startUpgradeTimer(
  targetLevel: number,
  durationMs: number,
): UpgradeTimerState {
  const state: UpgradeTimerState = {
    startedAt: Date.now(),
    targetLevel,
    durationMs: Math.max(0, durationMs),
  };
  write(state);
  return state;
}

export function clearUpgradeTimer(): void {
  if (read() === null) return;
  write(null);
}

/** Cut `reduceMs` off the remaining time by rolling the `startedAt`
 * stamp backwards. Used by the speed-up mini-quiz: each correct
 * translation answer calls this. Clamped so it never rolls so far
 * past the duration that progress > 1 — at the limit, the timer
 * simply registers as complete. No-op when there's no timer. */
export function reduceUpgradeTimer(reduceMs: number): UpgradeTimerState | null {
  const current = read();
  if (!current || reduceMs <= 0) return current;
  const minStartedAt = Date.now() - current.durationMs;
  const next: UpgradeTimerState = {
    ...current,
    startedAt: Math.max(minStartedAt, current.startedAt - reduceMs),
  };
  write(next);
  return next;
}

export function subscribeUpgradeTimer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface UpgradeTimerProgress {
  /** 0..1, clamped. */
  progress01: number;
  remainingMs: number;
  complete: boolean;
  state: UpgradeTimerState;
}

export function getUpgradeTimerProgress(
  now = Date.now(),
  state: UpgradeTimerState | null = read(),
): UpgradeTimerProgress | null {
  if (!state) return null;
  if (state.durationMs <= 0) {
    return { progress01: 1, remainingMs: 0, complete: true, state };
  }
  const elapsed = Math.max(0, now - state.startedAt);
  const progress01 = Math.min(1, elapsed / state.durationMs);
  const remainingMs = Math.max(0, state.durationMs - elapsed);
  return { progress01, remainingMs, complete: progress01 >= 1, state };
}

export function isUpgradeTimerComplete(
  state: UpgradeTimerState | null = read(),
): boolean {
  const p = getUpgradeTimerProgress(Date.now(), state);
  return p?.complete ?? false;
}

export function useUpgradeTimer(): UpgradeTimerState | null {
  const [state, setState] = useState<UpgradeTimerState | null>(() =>
    getUpgradeTimer(),
  );
  useEffect(() => {
    setState(getUpgradeTimer());
    return subscribeUpgradeTimer(setState);
  }, []);
  return state;
}

/** Re-renders the calling component every `intervalMs` so derived
 * timer values (MM:SS label, progress bar fill) refresh while the
 * timer counts down. Doesn't read state itself — the component pairs
 * this with `useUpgradeTimer()` + `getUpgradeTimerProgress()`. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "MM:SS" formatter for the modal label + in-world bar caption. */
export function formatUpgradeRemaining(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
