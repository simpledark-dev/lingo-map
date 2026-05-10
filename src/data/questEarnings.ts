/**
 * Per-quest earnings counter — cents the player has banked WHILE
 * a specific quest was active and they were working the right
 * NPC's mode.
 *
 * Why this exists: the office tutorial chain (first → second →
 * third paycheck) introduces one translate mode at a time and
 * each quest is gated on $2 of work IN THAT MODE. Earlier
 * iterations measured progress against cumulative lifetime
 * earnings, which broke in two ways:
 *   1. Dev cheats / earlier mode work pushed lifetime past the
 *      threshold, so each quest auto-completed the instant it
 *      started. Player never met Rina or Yusuf; sandwich quest
 *      kicked off out of order.
 *   2. Doing more read sessions on Eli would silently complete
 *      the listen / write quests too — defeating the "tutorial
 *      for each mode" goal.
 *
 * Storage: localStorage key `lingo-quest-earnings:v1`, JSON
 * `Record<questId, cents>`. Same module-cache + pub-sub pattern
 * as wallet / quests so non-React callers and React subscribers
 * stay in sync.
 *
 * Increments happen ONLY from the relevant translate session —
 * see VocabularyTranslateView's credit path. Wallet's lifetime
 * total continues to track every cent earned (used by first-
 * paycheck's CEO claim threshold, the wallet pill, etc.).
 */
import { useEffect, useState } from "react";

export const QUEST_EARNINGS_STORAGE_KEY = "lingo-quest-earnings:v1";

type EarningsMap = Record<string, number>;
type Listener = (snapshot: EarningsMap) => void;

const listeners = new Set<Listener>();
let cached: EarningsMap | null = null;

function read(): EarningsMap {
  if (cached !== null) return cached;
  if (typeof window === "undefined") {
    cached = {};
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(QUEST_EARNINGS_STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as EarningsMap) : {};
  } catch {
    cached = {};
  }
  return cached;
}

function write(map: EarningsMap): void {
  cached = map;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      QUEST_EARNINGS_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* quota / private mode — silent */
  }
}

function emit(): void {
  const snapshot = { ...read() };
  for (const l of listeners) l(snapshot);
}

/** Add `cents` to a quest's earnings counter. Caller is
 *  responsible for deciding the quest is the "right" one for
 *  this credit (typically: the active quest whose mode matches
 *  the current translate session). Negative or zero amounts are
 *  silently ignored — quest earnings are monotonic. */
export function addQuestEarnings(questId: string, cents: number): void {
  if (cents <= 0) return;
  const map = { ...read() };
  map[questId] = (map[questId] ?? 0) + cents;
  write(map);
  emit();
}

export function getQuestEarnings(questId: string): number {
  return read()[questId] ?? 0;
}

export function subscribeQuestEarnings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useQuestEarnings(questId: string): number {
  const [v, setV] = useState<number>(() => getQuestEarnings(questId));
  useEffect(() => {
    setV(getQuestEarnings(questId));
    const unsubscribe = subscribeQuestEarnings((snapshot) => {
      setV(snapshot[questId] ?? 0);
    });
    return unsubscribe;
  }, [questId]);
  return v;
}
