import { useEffect, useState } from "react";
import { addBalance, getBalance } from "./wallet";
import {
  clearUpgradeTimer,
  getUpgradeTimer,
  isUpgradeTimerComplete,
  startUpgradeTimer,
} from "./computerUpgradeTimer";

export const COMPUTER_UPGRADE_STORAGE_KEY = "lingo-computer:level";

export type ComputerLevelId =
  | "broken"
  | "used-laptop"
  | "home-pc"
  | "study-rig";

export interface ComputerLevel {
  level: number;
  id: ComputerLevelId;
  nameKey: string;
  descriptionKey: string;
  /** i18n key for the atmospheric line shown when the player taps the
   * computer at this tier. Each tier has its own line so the world
   * description updates as the player upgrades. */
  promptKey: string;
  costCents: number;
  /** Time the upgrade timer runs for after the player starts buying
   * this tier. Interpreted as "the wait BEFORE reaching this level."
   * Undefined / 0 only valid for the starting tier (no upgrade into
   * it). Kept short for early dev; tune up later. */
  upgradeDurationMs?: number;
}

export const COMPUTER_LEVELS: readonly ComputerLevel[] = [
  {
    level: 0,
    id: "broken",
    nameKey: "computer.level.broken.name",
    descriptionKey: "computer.level.broken.description",
    promptKey: "computer.dialogue.prompt.broken",
    costCents: 0,
  },
  {
    level: 1,
    id: "used-laptop",
    nameKey: "computer.level.usedLaptop.name",
    descriptionKey: "computer.level.usedLaptop.description",
    promptKey: "computer.dialogue.prompt.usedLaptop",
    costCents: 500,
    upgradeDurationMs: 120_000, // 2 min — easy to test
  },
  {
    level: 2,
    id: "home-pc",
    nameKey: "computer.level.homePc.name",
    descriptionKey: "computer.level.homePc.description",
    promptKey: "computer.dialogue.prompt.homePc",
    costCents: 2500,
    upgradeDurationMs: 240_000, // 4 min
  },
  {
    level: 3,
    id: "study-rig",
    nameKey: "computer.level.studyRig.name",
    descriptionKey: "computer.level.studyRig.description",
    promptKey: "computer.dialogue.prompt.studyRig",
    costCents: 7500,
    upgradeDurationMs: 480_000, // 8 min
  },
];

type Listener = (level: number) => void;

const listeners = new Set<Listener>();
let cached: number | null = null;

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(COMPUTER_LEVELS.length - 1, Math.trunc(value)));
}

function read(): number {
  if (cached !== null) return cached;
  if (typeof window === "undefined") {
    cached = 0;
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(COMPUTER_UPGRADE_STORAGE_KEY);
    cached = raw === null ? 0 : clampLevel(Number(raw));
  } catch {
    cached = 0;
  }
  return cached;
}

function write(level: number): void {
  cached = clampLevel(level);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPUTER_UPGRADE_STORAGE_KEY, String(cached));
  } catch {
    // Private mode / quota: keep the in-memory level for this session.
  }
}

export function getComputerUpgradeLevel(): number {
  return read();
}

export function getComputerLevel(level = read()): ComputerLevel {
  return COMPUTER_LEVELS[clampLevel(level)] ?? COMPUTER_LEVELS[0];
}

export function getNextComputerLevel(level = read()): ComputerLevel | null {
  return COMPUTER_LEVELS[clampLevel(level) + 1] ?? null;
}

/** Sprite key used to render the desk for a given upgrade level.
 * Keep in sync with the `computer-desk-l*` keys in AssetLoader. */
export function getDeskSpriteKey(level = read()): string {
  return `computer-desk-l${clampLevel(level)}`;
}

export function setComputerUpgradeLevel(level: number): number {
  const next = clampLevel(level);
  write(next);
  for (const listener of listeners) listener(next);
  return next;
}

/** Reset both the persisted level AND the in-memory cache, then
 * notify subscribers. Companion to `resetUpgradeTimerCache` in
 * `computerUpgradeTimer.ts`; called by `resetAllGameData()` so
 * stale `cached` values don't leak through to React after a reset. */
export function resetComputerUpgradeCache(): void {
  cached = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(COMPUTER_UPGRADE_STORAGE_KEY);
    } catch {
      // best-effort — quota / private mode
    }
  }
  for (const listener of listeners) listener(0);
}

/** Step 1 of the two-step upgrade flow: deduct money, start the
 * countdown timer. The actual level change happens later via
 * `finishComputerUpgrade` once the timer completes. */
export function startNextComputerUpgrade():
  | { ok: true; level: ComputerLevel }
  | {
      ok: false;
      reason: "max" | "insufficient" | "alreadyRunning";
      level?: ComputerLevel;
    } {
  if (getUpgradeTimer()) return { ok: false, reason: "alreadyRunning" };
  const nextLevel = getNextComputerLevel();
  if (!nextLevel) return { ok: false, reason: "max" };
  if (getBalance() < nextLevel.costCents) {
    return { ok: false, reason: "insufficient", level: nextLevel };
  }
  addBalance(-nextLevel.costCents);
  startUpgradeTimer(nextLevel.level, nextLevel.upgradeDurationMs ?? 0);
  return { ok: true, level: nextLevel };
}

/** Step 2 of the two-step upgrade flow: apply the queued level change
 * and clear the timer. Only succeeds when the timer has completed.
 * The level-change listener (PixiApp's subscriber) fires the
 * celebration FX from here. */
export function finishComputerUpgrade():
  | { ok: true; level: ComputerLevel }
  | { ok: false; reason: "noTimer" | "notReady" } {
  const timer = getUpgradeTimer();
  if (!timer) return { ok: false, reason: "noTimer" };
  if (!isUpgradeTimerComplete(timer)) return { ok: false, reason: "notReady" };
  setComputerUpgradeLevel(timer.targetLevel);
  clearUpgradeTimer();
  return { ok: true, level: getComputerLevel(timer.targetLevel) };
}

export function subscribeComputerUpgradeLevel(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useComputerUpgradeLevel(): number {
  const [level, setLevel] = useState<number>(() => getComputerUpgradeLevel());
  useEffect(() => {
    setLevel(getComputerUpgradeLevel());
    return subscribeComputerUpgradeLevel(setLevel);
  }, []);
  return level;
}
