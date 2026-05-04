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
import { hasFlag, FLAGS } from './eventFlags';

const STORAGE_KEY = 'lingo-quests:v1';

export type QuestStatus = 'inactive' | 'active' | 'completed';

/** Cents the player must earn (translation work only — penalties +
 *  borrows don't count) before the CEO will hand over the first
 *  paycheck. Lives here next to the quest catalog rather than in
 *  GameCanvas so the QuestHud can read it without pulling in a
 *  circular import. */
export const FIRST_PAYCHECK_THRESHOLD_CENTS = 500;
/** Bonus paid on top of the cents already earned when the
 *  first-paycheck quest is claimed. */
export const FIRST_PAYCHECK_BONUS_CENTS = 100;

export interface QuestDef {
  id: string;
  /** Short label, used in the HUD pill, the log header, and the
   *  toast. Keep under ~28 chars for the toast to fit on mobile. */
  title: string;
  /** What the player needs to do to clear this quest. Shown in the
   *  log while the quest is active. Static fallback — for quests
   *  whose text changes as the player progresses through sub-
   *  stages, also set `computeObjective` and treat this as the
   *  initial / "before-anything-happens" copy. */
  objective: string;
  /** Optional dynamic-objective hook. Returns the current objective
   *  string given live game state (event flags, inventory, etc.).
   *  Called on each render of the quest log, so keep it cheap and
   *  pure. Skipped when undefined — the static `objective` field
   *  is shown instead. Lets a quest like child-sandwich say
   *  "Mim wanted to talk to you. Head home." pre-conversation and
   *  "Buy a sandwich at the Mart…" after Mim has actually asked. */
  computeObjective?: () => string;
  /** Hint shown in the log BEFORE the quest is started — points
   *  the player at the NPC or location that triggers it. Lets
   *  players plan the next thing to do without first stumbling on
   *  the right NPC by chance. */
  availableHint?: string;
  /** Wrap-up shown in the log after the quest is completed. Falls
   *  back to "Completed." when omitted. */
  completedSummary?: string;
  /** IDs of quests that must be in `'completed'` state before this
   *  quest is allowed to appear anywhere a player can see it
   *  (Available tier in the log, etc.). Inactive quests with
   *  unmet prereqs are treated as fully hidden — the player
   *  shouldn't even know they exist yet. Empty / omitted = no
   *  prereq, the quest is gated only by `availableHint`. */
  requiresCompleted?: string[];
}

/** Resolve a quest's currently-displayed objective string. Calls
 *  the optional `computeObjective` hook if present, else returns
 *  the static `objective`. Centralised so call sites (log, future
 *  HUD subtitle, etc.) don't have to know whether a particular
 *  quest opted into dynamic copy. */
export function getObjective(quest: QuestDef): string {
  return quest.computeObjective ? quest.computeObjective() : quest.objective;
}

/** True when every quest id in `prereqs` is currently `'completed'`.
 *  Empty list / `undefined` short-circuits to true so quests
 *  without a prereq stay always-eligible. Caller passes a snapshot
 *  of the status map to keep this pure / cheap to call inside React
 *  filters. */
export function arePrereqsMet(
  prereqs: string[] | undefined,
  statuses: StatusMap,
): boolean {
  if (!prereqs || prereqs.length === 0) return true;
  return prereqs.every((id) => statuses[id] === 'completed');
}

/** Convenience: `inactive` quest that has an `availableHint` AND
 *  has all prereqs satisfied — i.e. would render under the
 *  "Available" tier in the quest log / HUD. */
export function isAvailable(quest: QuestDef, statuses: StatusMap): boolean {
  if (statuses[quest.id]) return false;
  if (!quest.availableHint) return false;
  return arePrereqsMet(quest.requiresCompleted, statuses);
}

/** Catalog of all quests in the game. New entries register here;
 *  call sites reference them by id (`startQuest('child-sandwich')`)
 *  rather than passing the def around, so the catalog stays the
 *  single source of truth for quest copy. */
export const QUESTS: Record<string, QuestDef> = {
  'child-sandwich': {
    id: 'child-sandwich',
    title: 'A Sandwich for Mim',
    // Static fallback — only shown if `computeObjective` is somehow
    // skipped (e.g. unit-test reading the def directly).
    objective: 'Mim wanted to talk to you. Head home.',
    // Two-stage objective: pre-Mim-ask vs post-Mim-ask. Keeps the
    // quest log faithful to what the PLAYER currently knows
    // (Mim hasn't said anything yet → "go home and find out") vs
    // what they're acting on (Mim asked → "buy a sandwich").
    // Stage flips when CHILD_ASKED_FOR_SANDWICH is set inside
    // Mim's dialogue handler.
    computeObjective: () =>
      hasFlag(FLAGS.CHILD_ASKED_FOR_SANDWICH)
        ? 'Buy a sandwich at the Mart and bring it home.'
        : 'Mim wanted to talk to you. Head home.',
    completedSummary: 'You brought Mim a sandwich. They were thrilled.',
    // Auto-chained after the first paycheck — the player has the
    // money + the workflow muscle memory by then, and Mim's request
    // closes the loop on "you came to the city to feed your kid".
    // No `availableHint` is intentional: the chain auto-starts via
    // GameCanvas's catch-up effect, so the quest skips the
    // Available tier entirely and lands directly in In Progress.
    requiresCompleted: ['first-paycheck'],
  },
  'intro-translator-job': {
    id: 'intro-translator-job',
    title: 'Apply for the Translator Job',
    objective: 'Walk to the translation office on Mart Street. The CEO is waiting.',
    // No `availableHint` — this quest is auto-started by the intro
    // cutscene rather than discovered organically; surfacing a hint
    // before the cutscene runs would spoil it.
    completedSummary: 'You bluffed your way into a translator gig. The work begins now.',
  },
  'first-paycheck': {
    id: 'first-paycheck',
    title: 'Earn Your First Paycheck',
    // Concrete, action-first objective. Calls out (1) WHERE to
    // find work (vocabulary NPCs in town with translation
    // offers), (2) WHAT to earn ($5.00), (3) WHO to return to
    // (the office CEO) so a player coming back after a break
    // doesn't have to guess.
    objective: 'Talk to vocabulary NPCs around town and accept their translator offers. Earn $5.00 from correct answers, then return to the CEO at the office for your bonus.',
    availableHint: 'The CEO promised a paycheck once you\u2019ve earned your stripes — keep translating.',
    completedSummary: 'You earned your first paycheck. The CEO threw in a small bonus on top.',
    // Auto-starts as soon as the intro is done (see GameCanvas's
    // catch-up effect), but prereq is set anyway so a stale save
    // mid-intro doesn't accidentally surface this in Available.
    requiresCompleted: ['intro-translator-job'],
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
