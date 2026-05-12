import { useEffect, useState } from "react";
import { addBalance, getBalance } from "./wallet";

export const COMPUTER_UPGRADE_STORAGE_KEY = "lingo-computer:level";

export type ComputerLevelId = "broken" | "used-laptop" | "home-pc" | "study-rig";

export interface ComputerLevel {
  level: number;
  id: ComputerLevelId;
  nameKey: string;
  descriptionKey: string;
  costCents: number;
}

export const COMPUTER_LEVELS: readonly ComputerLevel[] = [
  {
    level: 0,
    id: "broken",
    nameKey: "computer.level.broken.name",
    descriptionKey: "computer.level.broken.description",
    costCents: 0,
  },
  {
    level: 1,
    id: "used-laptop",
    nameKey: "computer.level.usedLaptop.name",
    descriptionKey: "computer.level.usedLaptop.description",
    costCents: 500,
  },
  {
    level: 2,
    id: "home-pc",
    nameKey: "computer.level.homePc.name",
    descriptionKey: "computer.level.homePc.description",
    costCents: 2500,
  },
  {
    level: 3,
    id: "study-rig",
    nameKey: "computer.level.studyRig.name",
    descriptionKey: "computer.level.studyRig.description",
    costCents: 7500,
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

export function purchaseNextComputerUpgrade():
  | { ok: true; level: ComputerLevel }
  | { ok: false; reason: "max" | "insufficient"; level?: ComputerLevel } {
  const nextLevel = getNextComputerLevel();
  if (!nextLevel) return { ok: false, reason: "max" };
  if (getBalance() < nextLevel.costCents) {
    return { ok: false, reason: "insufficient", level: nextLevel };
  }
  addBalance(-nextLevel.costCents);
  setComputerUpgradeLevel(nextLevel.level);
  return { ok: true, level: nextLevel };
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
