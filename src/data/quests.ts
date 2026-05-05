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
import { getChildName } from './profile';

const STORAGE_KEY = 'lingo-quests:v1';
/** Append-only list of quest IDs in the order the player completed
 *  them. The QuestLog reads this to render Completed sorted most-
 *  recent first instead of catalog-insertion order. Stored as a
 *  separate key so the existing status-map schema stays untouched
 *  and back-compat reads keep working. */
const ORDER_KEY = 'lingo-quests:completion-order';

export type QuestStatus = 'inactive' | 'active' | 'completed';

/** Cents the player must earn (translation work only — penalties +
 *  borrows don't count) before the CEO will hand over the first
 *  paycheck. Lives here next to the quest catalog rather than in
 *  GameCanvas so the QuestHud can read it without pulling in a
 *  circular import. Set to $1.00 (35 correct translations at the
 *  current $0.03 reward, with room to absorb a few wrongs) so the
 *  first session can plausibly close the loop. */
export const FIRST_PAYCHECK_THRESHOLD_CENTS = 100;
/** Bonus paid on top of the cents already earned when the
 *  first-paycheck quest is claimed. */
export const FIRST_PAYCHECK_BONUS_CENTS = 100;

export interface QuestDef {
  id: string;
  /** Short label, used in the HUD pill, the log header, and the
   *  toast. Keep under ~28 chars for the toast to fit on mobile. */
  title: string;
  /** Optional dynamic title hook for copy that depends on profile
   *  state, such as the child name chosen during the intro. */
  computeTitle?: () => string;
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
 *  "your child wanted to talk to you" pre-conversation and
 *  "Buy a sandwich at the Mart…" after they have actually asked. */
  computeObjective?: () => string;
  /** Hint shown in the log BEFORE the quest is started — points
   *  the player at the NPC or location that triggers it. Lets
   *  players plan the next thing to do without first stumbling on
   *  the right NPC by chance. */
  availableHint?: string;
  /** Wrap-up shown in the log after the quest is completed. Falls
   *  back to "Completed." when omitted. */
  completedSummary?: string;
  computeCompletedSummary?: () => string;
  /** IDs of quests that must be in `'completed'` state before this
   *  quest is allowed to appear anywhere a player can see it
   *  (Available tier in the log, etc.). Inactive quests with
   *  unmet prereqs are treated as fully hidden — the player
   *  shouldn't even know they exist yet. Empty / omitted = no
   *  prereq, the quest is gated only by `availableHint`. */
  requiresCompleted?: string[];
}

function childDisplayName(): string {
  return getChildName() ?? 'Mim';
}

export function getTitle(quest: QuestDef): string {
  return quest.computeTitle ? quest.computeTitle() : quest.title;
}

/** Resolve a quest's currently-displayed objective string. Calls
 *  the optional `computeObjective` hook if present, else returns
 *  the static `objective`. Centralised so call sites (log, future
 *  HUD subtitle, etc.) don't have to know whether a particular
 *  quest opted into dynamic copy. */
export function getObjective(quest: QuestDef): string {
  return quest.computeObjective ? quest.computeObjective() : quest.objective;
}

export function getCompletedSummary(quest: QuestDef): string {
  return quest.computeCompletedSummary
    ? quest.computeCompletedSummary()
    : quest.completedSummary ?? 'Completed.';
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
  // Three tiny tutorial quests teaching the borrow → buy → eat
  // loop. Auto-chained after the sandwich so the player has just
  // spent their starting cash and is in the right mindset for
  // "what do I do when I'm broke?". Each completes from inside
  // the relevant action handler (Theo's borrow, ShopView's buy,
  // inventory.eatItem) so the trigger is unambiguous and tied to
  // the actual interaction, not a status snapshot.
  'tutorial-borrow': {
    id: 'tutorial-borrow',
    title: 'Borrow from Theo',
    objective:
      'Money runs out fast in this town. Find Theo on the path outside and borrow a little to keep going.',
    completedSummary: 'You borrowed from Theo. Pay him back when you can.',
    requiresCompleted: ['child-sandwich'],
  },
  'tutorial-buy-food': {
    id: 'tutorial-buy-food',
    title: 'Buy Food at the Mart',
    objective:
      'Head into the Mart and buy any food item — you\u2019ll need something to eat before you can work again.',
    completedSummary: 'You bought a snack at the Mart. The shopkeeper appreciated the business.',
    requiresCompleted: ['tutorial-borrow'],
  },
  'tutorial-eat': {
    id: 'tutorial-eat',
    title: 'Refill Your Energy',
    objective:
      'Open your Bag (the icon under the wallet) and eat what you bought to refill your energy.',
    completedSummary:
      'You ate to refill energy. The full loop: translate → earn → buy food → eat → keep going.',
    requiresCompleted: ['tutorial-buy-food'],
  },
  'child-sandwich': {
    id: 'child-sandwich',
    title: 'A Sandwich for Your Child',
    computeTitle: () => `A Sandwich for ${childDisplayName()}`,
    // Static fallback — only shown if `computeObjective` is somehow
    // skipped (e.g. unit-test reading the def directly).
    objective: 'Your child wanted to talk to you. Head home.',
    // Two-stage objective: pre-Mim-ask vs post-Mim-ask. Keeps the
    // quest log faithful to what the PLAYER currently knows
    // (Mim hasn't said anything yet → "go home and find out") vs
    // what they're acting on (Mim asked → "buy a sandwich").
    // Stage flips when CHILD_ASKED_FOR_SANDWICH is set inside
    // Mim's dialogue handler.
    computeObjective: () =>
      hasFlag(FLAGS.CHILD_ASKED_FOR_SANDWICH)
        ? 'Buy a sandwich at the Mart and bring it home.'
        : `${childDisplayName()} wanted to talk to you. Head home.`,
    completedSummary: 'You brought your child a sandwich. They were thrilled.',
    computeCompletedSummary: () =>
      `You brought ${childDisplayName()} a sandwich. They were thrilled.`,
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
    objective: 'Find Saba (red marker on the map) — accept her translator offer to start. Earn $1.00 from correct answers, then return to the CEO at the office for your bonus.',
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

/** Cached completion order — append-only list of IDs. `null` means
 *  not-yet-loaded; first read hydrates from localStorage. */
let orderCached: string[] | null = null;
type OrderListener = (order: readonly string[]) => void;
const orderListeners = new Set<OrderListener>();

function readOrder(): string[] {
  if (orderCached !== null) return orderCached;
  if (typeof window === 'undefined') {
    orderCached = [];
    return orderCached;
  }
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) {
      orderCached = [];
      return orderCached;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      orderCached = [];
      return orderCached;
    }
    orderCached = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    orderCached = [];
  }
  return orderCached;
}

function writeOrder(value: string[]): void {
  orderCached = value;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(value));
  } catch { /* silent */ }
}

function emitOrder(): void {
  const snapshot = [...readOrder()];
  for (const l of orderListeners) l(snapshot);
}

/** Read-only snapshot of completed-quest IDs in completion order
 *  (oldest first). Useful for sorts that want most-recent at the
 *  top — flip the `indexOf` direction. */
export function getCompletionOrder(): readonly string[] {
  return readOrder();
}

export function subscribeCompletionOrder(listener: OrderListener): () => void {
  orderListeners.add(listener);
  return () => {
    orderListeners.delete(listener);
  };
}

/** React hook — re-renders when a quest is completed (and thus the
 *  order list grows). */
export function useCompletionOrder(): readonly string[] {
  const [v, setV] = useState<readonly string[]>(() => readOrder());
  useEffect(() => {
    setV(readOrder());
    return subscribeCompletionOrder(setV);
  }, []);
  return v;
}

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
  // Append to completion-order so the log can sort by recency.
  // Defensive dedupe in case of any future double-call path.
  const order = readOrder();
  if (!order.includes(id)) {
    writeOrder([...order, id]);
    emitOrder();
  }
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
