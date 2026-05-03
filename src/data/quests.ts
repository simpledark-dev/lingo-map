/**
 * Quest state machine — the polish layer over slice 1's inventory +
 * event-flag scaffolding.
 *
 * Three statuses per quest: `inactive` (never started, default),
 * `active` (started, not yet finished), `completed`. Transitions
 * always go inactive → active → completed; we never reset a
 * completed quest in slice 2 (could change later if "daily quests"
 * become a thing).
 *
 * Storage: localStorage `lingo-quests:v1`, JSON `Record<questId,
 * QuestStatus>`. Missing entries read as `inactive`. Same module-
 * cache + pub-sub pattern as wallet.ts / inventory.ts so non-React
 * callers (dialogue handlers, future PixiApp triggers) can mutate
 * and the UI stays in sync.
 *
 * Transitions also fire a one-shot `transition` event with the
 * quest def attached. The QuestToast subscriber listens for these
 * and shows a banner — this lets the toast UI live entirely
 * outside the dialogue / GameCanvas state, so the same banner
 * works for any future quest source (NPC, trigger, scripted event).
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lingo-quests:v1';

export type QuestStatus = 'inactive' | 'active' | 'completed';

export interface QuestDef {
  id: string;
  /** Short label, used in the HUD pill, the log header, and the
   *  toast. Keep under ~28 chars for the toast to fit on mobile. */
  title: string;
  /** What the player needs to do to clear this quest. Shown in the
   *  log while the quest is active. */
  objective: string;
  /** Hint shown in the log BEFORE the quest is started — points
   *  the player at the NPC or location that triggers it. Lets
   *  players plan the next thing to do without first stumbling on
   *  the right NPC by chance. */
  availableHint?: string;
  /** Wrap-up shown in the log after the quest is completed. Falls
   *  back to "Completed." when omitted. */
  completedSummary?: string;
}

/** Catalog of all quests in the game. New entries register here;
 *  call sites reference them by id (`startQuest('child-sandwich')`)
 *  rather than passing the def around, so the catalog stays the
 *  single source of truth for quest copy. */
export const QUESTS: Record<string, QuestDef> = {
  'child-sandwich': {
    id: 'child-sandwich',
    title: 'A Sandwich for Mim',
    objective: 'Mim is hungry. Buy a sandwich at the Mart and bring it home.',
    availableHint: 'Talk to Mim at home — she might want something.',
    completedSummary: 'You brought Mim a sandwich. They were thrilled.',
  },
};

export function getQuestDef(id: string): QuestDef | undefined {
  return QUESTS[id];
}

type StatusMap = Record<string, QuestStatus>;

type StatusListener = (statuses: StatusMap) => void;
const statusListeners = new Set<StatusListener>();

export type QuestTransition =
  | { kind: 'started'; def: QuestDef }
  | { kind: 'completed'; def: QuestDef };

type TransitionListener = (event: QuestTransition) => void;
const transitionListeners = new Set<TransitionListener>();

let cached: StatusMap | null = null;

function read(): StatusMap {
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
    const cleaned: StatusMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === 'active' || v === 'completed') cleaned[k] = v;
    }
    cached = cleaned;
  } catch {
    cached = {};
  }
  return cached;
}

function write(value: StatusMap): void {
  cached = value;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch { /* silent */ }
}

function emitStatuses(): void {
  const snapshot = { ...read() };
  for (const l of statusListeners) l(snapshot);
}

function emitTransition(event: QuestTransition): void {
  for (const l of transitionListeners) l(event);
}

export function getQuestStatus(id: string): QuestStatus {
  return read()[id] ?? 'inactive';
}

/** Start a quest. No-op if it's already active or completed (so
 *  callers can fire `startQuest('x')` defensively without first
 *  checking status). Emits a `started` transition only when the
 *  status actually flipped, so the toast doesn't double-fire. */
export function startQuest(id: string): void {
  const def = QUESTS[id];
  if (!def) return;
  const current = read();
  if (current[id] === 'active' || current[id] === 'completed') return;
  const next: StatusMap = { ...current, [id]: 'active' };
  write(next);
  emitStatuses();
  emitTransition({ kind: 'started', def });
}

/** Complete a quest. Idempotent — if it was inactive (never
 *  started), we still mark it completed and fire the toast (the
 *  player effectively skipped from inactive to completed via some
 *  path the dialogue forgot to call startQuest on). */
export function completeQuest(id: string): void {
  const def = QUESTS[id];
  if (!def) return;
  const current = read();
  if (current[id] === 'completed') return;
  const next: StatusMap = { ...current, [id]: 'completed' };
  write(next);
  emitStatuses();
  emitTransition({ kind: 'completed', def });
}

export function subscribeQuests(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function subscribeQuestTransitions(listener: TransitionListener): () => void {
  transitionListeners.add(listener);
  return () => {
    transitionListeners.delete(listener);
  };
}

/** React hook — re-renders on any quest status change. */
export function useQuestStatuses(): StatusMap {
  const [s, setS] = useState<StatusMap>(() => ({ ...read() }));
  useEffect(() => {
    setS({ ...read() });
    return subscribeQuests(setS);
  }, []);
  return s;
}
