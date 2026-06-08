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
import { useEffect, useState } from "react";
import { hasFlag, FLAGS } from "./eventFlags";
import { getChildName } from "./profile";
import { t } from "./i18n";

const STORAGE_KEY = "lingo-quests:v1";
/** Append-only list of quest IDs in the order the player completed
 *  them. The QuestLog reads this to render Completed sorted most-
 *  recent first instead of catalog-insertion order. Stored as a
 *  separate key so the existing status-map schema stays untouched
 *  and back-compat reads keep working. */
const ORDER_KEY = "lingo-quests:completion-order";
/** Per-quest "lifetime cents at activation" snapshots. Lets phase-
 *  delta quests (second + third paychecks) measure earnings made
 *  WHILE the quest was active rather than total lifetime — without
 *  this, a player who already earned $4+ before the chain reached
 *  the second paycheck would auto-complete it (and chained third
 *  paycheck) the instant they unlocked. */
const START_LIFETIME_KEY = "lingo-quests:start-lifetime:v1";

export type QuestStatus = "inactive" | "active" | "completed";

/** First paycheck: cumulative lifetime cents required before the
 *  CEO will claim the bonus. This one stays cumulative because the
 *  player completes it manually at the CEO; the threshold just
 *  gates whether the claim option lights up. */
export const FIRST_PAYCHECK_THRESHOLD_CENTS = 200;
/** Second + third paychecks: PHASE deltas in cents — earnings the
 *  player must accumulate WHILE the quest is active. Snapshots
 *  taken at quest-start (see `ensureQuestStartLifetime`) anchor the
 *  delta so a stale save with high cumulative earnings doesn't
 *  auto-complete these the moment they unlock. */
export const SECOND_PAYCHECK_PHASE_CENTS = 200;
export const THIRD_PAYCHECK_PHASE_CENTS = 200;
/** Bonus paid on top of the cents already earned when the
 *  first-paycheck quest is claimed. (Second / third paychecks
 *  auto-complete on phase-delta without a CEO claim — they're
 *  pure mode tutorials, no narrative bonus.) */
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
   *  "Buy bread at the Mart…" after they have actually asked. */
  computeObjective?: () => string;
  /** Hint shown in the log BEFORE the quest is started — points
   *  the player at the NPC or location that triggers it. Lets
   *  players plan the next thing to do without first stumbling on
   *  the right NPC by chance. */
  availableHint?: string;
  /** Locale-aware hint hook, mirroring computeObjective. */
  computeAvailableHint?: () => string;
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
  /** When true, the quest is parked: `startQuest` no-ops, `isAvailable`
   *  returns false, and the player never sees it in the HUD or log.
   *  Lets us temporarily retire a quest that's been authored but
   *  doesn't fit the current beat (e.g. the borrow / buy / eat
   *  tutorial chain while the survival loop is being reworked) without
   *  deleting its def — flip back to false to re-enable. */
  disabled?: boolean;
}

function childDisplayName(): string {
  return getChildName() ?? "Mim";
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
    : quest.completedSummary ?? "Completed.";
}

/** True when every quest id in `prereqs` is currently `'completed'`.
 *  Empty list / `undefined` short-circuits to true so quests
 *  without a prereq stay always-eligible. Caller passes a snapshot
 *  of the status map to keep this pure / cheap to call inside React
 *  filters. */
export function arePrereqsMet(
  prereqs: string[] | undefined,
  statuses: StatusMap
): boolean {
  if (!prereqs || prereqs.length === 0) return true;
  return prereqs.every((id) => statuses[id] === "completed");
}

/** Convenience: `inactive` quest that has an `availableHint` AND
 *  has all prereqs satisfied — i.e. would render under the
 *  "Available" tier in the quest log / HUD. */
export function isAvailable(quest: QuestDef, statuses: StatusMap): boolean {
  if (quest.disabled) return false;
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
  // loop. Auto-chained after the bread quest so the player has just
  // spent their starting cash and is in the right mindset for
  // "what do I do when I'm broke?". Each completes from inside
  // the relevant action handler (Theo's borrow, ShopView's buy,
  // inventory.eatItem) so the trigger is unambiguous and tied to
  // the actual interaction, not a status snapshot.
  // Tutorial trio (borrow → buy → eat) is parked while the survival
  // loop is being reworked. Defs stay so the locale strings and any
  // future re-enable land cleanly; `disabled: true` keeps them off
  // the HUD, the log, and out of `startQuest` until we flip it.
  "tutorial-borrow": {
    id: "tutorial-borrow",
    title: "Borrow from Theo",
    computeTitle: () => t("quest.tutorialBorrow.title"),
    objective:
      "Money runs out fast in this town. Find Theo and borrow a little.",
    computeObjective: () => t("quest.tutorialBorrow.objective"),
    completedSummary: "You borrowed from Theo.",
    computeCompletedSummary: () => t("quest.tutorialBorrow.completedSummary"),
    requiresCompleted: ["child-sandwich"],
    disabled: true,
  },
  "tutorial-buy-food": {
    id: "tutorial-buy-food",
    title: "Buy Food at the Mart",
    computeTitle: () => t("quest.tutorialBuyFood.title"),
    objective: "Buy any food item at the Mart.",
    computeObjective: () => t("quest.tutorialBuyFood.objective"),
    completedSummary: "You bought a snack.",
    computeCompletedSummary: () => t("quest.tutorialBuyFood.completedSummary"),
    requiresCompleted: ["tutorial-borrow"],
    disabled: true,
  },
  "tutorial-eat": {
    id: "tutorial-eat",
    title: "Refill Your Energy",
    computeTitle: () => t("quest.tutorialEat.title"),
    objective: "Open your Bag and eat what you bought.",
    computeObjective: () => t("quest.tutorialEat.objective"),
    completedSummary: "You ate to refill energy.",
    computeCompletedSummary: () => t("quest.tutorialEat.completedSummary"),
    requiresCompleted: ["tutorial-buy-food"],
    disabled: true,
  },
  "child-sandwich": {
    id: "child-sandwich",
    title: "Bread for Your Child",
    computeTitle: () =>
      t("quest.childSandwich.title", { child: childDisplayName() }),
    // Static fallback — only shown if `computeObjective` is somehow
    // skipped (e.g. unit-test reading the def directly).
    objective: "Your child wanted to talk to you. Head home.",
    // Two-stage objective: pre-Mim-ask vs post-Mim-ask. Keeps the
    // quest log faithful to what the PLAYER currently knows
    // (Mim hasn't said anything yet → "go home and find out") vs
    // what they're acting on (Mim asked → "buy bread").
    // Stage flips when CHILD_ASKED_FOR_SANDWICH is set inside
    // Mim's dialogue handler.
    computeObjective: () =>
      hasFlag(FLAGS.CHILD_ASKED_FOR_SANDWICH)
        ? t("quest.childSandwich.objective", { child: childDisplayName() })
        : t("quest.childSandwich.objectivePreAsk", {
            child: childDisplayName(),
          }),
    completedSummary: "You brought your child bread.",
    computeCompletedSummary: () =>
      t("quest.childSandwich.completedSummary", { child: childDisplayName() }),
    // Auto-chained after the player's first full shift (serving all
    // three office clients), not mid-shift — the bread beat shouldn't
    // arrive while the player is still learning the job. By the time
    // the shift wraps they have earnings + workflow muscle memory, and
    // Mim's request closes the loop on "you came to the city to feed
    // your kid". No `availableHint` is intentional: the chain
    // auto-starts via GameCanvas's catch-up effect, so the quest skips
    // the Available tier entirely and lands directly in In Progress.
    requiresCompleted: ["first-shift"],
  },
  // Replace the broken computer at home. Chained off child-sandwich
  // so the home thread reads as: feed the kid → fix what's broken →
  // unlock home study. Auto-completes when the player upgrades the
  // computer past level 0 (i.e. buys ANY upgrade tier) — see the
  // chain useEffect in GameCanvas. Intentionally no `availableHint`
  // for the same reason as child-sandwich (chain auto-starts; the
  // quest skips the Available tier and lands directly in active).
  "upgrade-computer": {
    id: "upgrade-computer",
    title: "Replace the Broken Computer",
    computeTitle: () => t("quest.upgradeComputer.title"),
    objective:
      "The computer at home is dead. Save up and upgrade it so the family can study.",
    computeObjective: () => t("quest.upgradeComputer.objective"),
    completedSummary: "You replaced the broken computer.",
    computeCompletedSummary: () =>
      t("quest.upgradeComputer.completedSummary"),
    requiresCompleted: ["child-sandwich"],
  },
  "intro-translator-job": {
    id: "intro-translator-job",
    title: "Apply for the Translator Job",
    computeTitle: () => t("quest.introTranslatorJob.title"),
    objective: "Walk to the translation office on Mart Street.",
    computeObjective: () => t("quest.introTranslatorJob.objective"),
    completedSummary: "You bluffed your way into a translator gig.",
    computeCompletedSummary: () =>
      t("quest.introTranslatorJob.completedSummary"),
  },
  // First shift = the office tutorial, collapsed into one repeatable
  // job. The CEO (shift manager) clocks the player in; they serve the
  // three office clients (Eli → read, Rina → listen, Yusuf → write),
  // each of whom introduces one drill mode. Completing the roster
  // wraps the shift and completes this quest, which hands off to the
  // home thread. Subsequent shifts are free practice with no quest.
  // Auto-starts once the intro is done (GameCanvas catch-up effect);
  // prereq is set anyway so a stale mid-intro save can't surface it.
  "first-shift": {
    id: "first-shift",
    title: "Work Your First Shift",
    computeTitle: () => t("quest.firstShift.title"),
    objective: "Clock in with the CEO, then serve every client on the floor.",
    computeObjective: () => t("quest.firstShift.objective"),
    availableHint: "The CEO is ready to put you to work.",
    computeAvailableHint: () => t("quest.firstShift.availableHint"),
    completedSummary: "You worked your first shift at the office.",
    computeCompletedSummary: () => t("quest.firstShift.completedSummary"),
    requiresCompleted: ["intro-translator-job"],
  },
};

export function getQuestDef(id: string): QuestDef | undefined {
  return QUESTS[id];
}

type StatusMap = Record<string, QuestStatus>;

type StatusListener = (statuses: StatusMap) => void;
const statusListeners = new Set<StatusListener>();

export type QuestTransition =
  | { kind: "started"; def: QuestDef }
  | { kind: "completed"; def: QuestDef }
  | { kind: "target-reached"; def: QuestDef };

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
  if (typeof window === "undefined") {
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
    orderCached = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    orderCached = [];
  }
  return orderCached;
}

function writeOrder(value: string[]): void {
  orderCached = value;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(value));
  } catch {
    /* silent */
  }
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
  if (typeof window === "undefined") {
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
    if (!parsed || typeof parsed !== "object") {
      cached = {};
      return cached;
    }
    const cleaned: StatusMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === "active" || v === "completed") cleaned[k] = v;
    }
    cached = cleaned;
  } catch {
    cached = {};
  }
  return cached;
}

function write(value: StatusMap): void {
  cached = value;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* silent */
  }
}

/** When true, the QuestToast banner is silenced — the chain
 *  `started`/`completed` events get queued instead of firing
 *  immediately. GameCanvas turns this on while a dialogue is open
 *  so the toast doesn't pop behind the parchment box while the
 *  NPC is still talking, and flushes the queue when the dialogue
 *  closes.
 *
 *  IMPORTANT: status emits (the snapshot subscribers like QuestHud
 *  / QuestLog / the chain useEffect listen to) are NOT deferred —
 *  only the toast events. Earlier the deferral covered both, which
 *  meant claiming the first-paycheck bonus didn't actually update
 *  the QuestHud, the markers, or chain into second-paycheck until
 *  the dialogue closed AND 400ms passed. Now state propagates
 *  immediately; only the visible "🎉 New Quest" banner waits. */
let toastDeferred = false;
const pendingTransitions: QuestTransition[] = [];

function emitStatuses(): void {
  const snapshot = { ...read() };
  for (const l of statusListeners) l(snapshot);
}

function emitTransition(event: QuestTransition): void {
  if (toastDeferred) {
    pendingTransitions.push(event);
    return;
  }
  for (const l of transitionListeners) l(event);
}

/** Pause / resume the QuestToast banner. Call with `true` when a
 *  dialogue opens; `false` when it closes. While paused, every
 *  `completeQuest` / `startQuest` still mutates state and notifies
 *  the status subscribers — only the toast event waits. Resuming
 *  drains queued transitions in FIFO order. */
export function setQuestVisibilityDeferred(deferred: boolean): void {
  if (toastDeferred === deferred) return;
  toastDeferred = deferred;
  if (deferred) return;
  if (pendingTransitions.length > 0) {
    const drain = pendingTransitions.splice(0);
    for (const ev of drain) {
      for (const l of transitionListeners) l(ev);
    }
  }
}

export function getQuestStatus(id: string): QuestStatus {
  return read()[id] ?? "inactive";
}

// ── Quest start-lifetime snapshots ──
// Used by phase-delta quests (second / third paychecks) so the
// auto-complete check measures earnings made WHILE active, not
// total lifetime. Same module-cache + localStorage pattern as the
// status map above.

let cachedStartLifetimes: Record<string, number> | null = null;

function readStartLifetimes(): Record<string, number> {
  if (cachedStartLifetimes !== null) return cachedStartLifetimes;
  if (typeof window === "undefined") {
    cachedStartLifetimes = {};
    return cachedStartLifetimes;
  }
  try {
    const raw = window.localStorage.getItem(START_LIFETIME_KEY);
    cachedStartLifetimes = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    cachedStartLifetimes = {};
  }
  return cachedStartLifetimes;
}

function writeStartLifetimes(map: Record<string, number>): void {
  cachedStartLifetimes = map;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(START_LIFETIME_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — drop silently */
  }
}

/** Record the player's lifetime-earnings number at the moment a
 *  quest goes active. Idempotent — a quest's snapshot is set ONCE
 *  on first activation; later callers re-passing a value are
 *  ignored so the baseline doesn't drift. Pass `currentLifetime`
 *  from the wallet to keep this module wallet-import-free. */
export function ensureQuestStartLifetime(
  id: string,
  currentLifetime: number,
): void {
  const map = readStartLifetimes();
  if (map[id] !== undefined) return;
  map[id] = currentLifetime;
  writeStartLifetimes(map);
}

/** Read the snapshot. Returns `fallback` (and writes it back as
 *  the snapshot) when no entry exists — covers stale saves where
 *  a quest was already active before this tracking was added.
 *  Writing the fallback prevents the next call from drifting if
 *  lifetime grows between calls. */
export function getOrInitQuestStartLifetime(
  id: string,
  fallback: number,
): number {
  const map = readStartLifetimes();
  const v = map[id];
  if (v !== undefined) return v;
  map[id] = fallback;
  writeStartLifetimes(map);
  return fallback;
}

/** Start a quest. No-op if it's already active or completed (so
 *  callers can fire `startQuest('x')` defensively without first
 *  checking status). Emits a `started` transition only when the
 *  status actually flipped, so the toast doesn't double-fire. */
export function startQuest(id: string): void {
  const def = QUESTS[id];
  if (!def) return;
  // Disabled quests are silently skipped — keeps chain-trigger code
  // (e.g. "after bread, start tutorial-borrow") working without
  // having to gate every call site.
  if (def.disabled) return;
  const current = read();
  if (current[id] === "active" || current[id] === "completed") return;
  const next: StatusMap = { ...current, [id]: "active" };
  write(next);
  emitStatuses();
  emitTransition({ kind: "started", def });
}

/** Complete a quest. Idempotent — if it was inactive (never
 *  started), we still mark it completed and fire the toast (the
 *  player effectively skipped from inactive to completed via some
 *  path the dialogue forgot to call startQuest on). */
export function completeQuest(id: string): void {
  const def = QUESTS[id];
  if (!def) return;
  const current = read();
  if (current[id] === "completed") return;
  const next: StatusMap = { ...current, [id]: "completed" };
  write(next);
  // Append to completion-order so the log can sort by recency.
  // Defensive dedupe in case of any future double-call path.
  const order = readOrder();
  if (!order.includes(id)) {
    writeOrder([...order, id]);
    emitOrder();
  }
  emitStatuses();
  emitTransition({ kind: "completed", def });
}

export function subscribeQuests(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function subscribeQuestTransitions(
  listener: TransitionListener
): () => void {
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

// ── Quest acknowledgement ─────────────────────────────────────────
// Tracks which quest IDs the player has visibly clicked on at least
// once after they became active. The HUD uses this to pulse the row
// and show a "NEW" badge until the player taps the quest, telling
// them where to look when a fresh objective arrives. Persisted
// separately from the status map so the existing schema stays
// untouched and back-compat reads keep working.
const ACK_KEY = "lingo-quests:acknowledged:v1";
let ackCached: Set<string> | null = null;
type AckListener = (acknowledged: ReadonlySet<string>) => void;
const ackListeners = new Set<AckListener>();

function readAck(): Set<string> {
  if (ackCached !== null) return ackCached;
  if (typeof window === "undefined") {
    ackCached = new Set();
    return ackCached;
  }
  try {
    const raw = window.localStorage.getItem(ACK_KEY);
    if (!raw) {
      // First read on this device. Pre-populate with every quest
      // already in `active` or `completed` so existing players don't
      // see a pulse-storm on every previously-started quest after
      // they update. Fresh saves have no quests yet, so this is a
      // no-op for them — only quests STARTED after first boot will
      // get the "NEW" treatment.
      const seeded = new Set<string>();
      const statuses = read();
      for (const id of Object.keys(statuses)) {
        if (statuses[id] === "active" || statuses[id] === "completed") {
          seeded.add(id);
        }
      }
      writeAck(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw);
    ackCached = new Set(
      Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [],
    );
  } catch {
    ackCached = new Set();
  }
  return ackCached;
}

function writeAck(value: Set<string>): void {
  ackCached = value;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACK_KEY, JSON.stringify([...value]));
  } catch {
    /* silent */
  }
}

function emitAck(): void {
  const snapshot: ReadonlySet<string> = new Set(readAck());
  for (const l of ackListeners) l(snapshot);
}

/** Mark a quest as "the player has seen the new objective." Idempotent. */
export function acknowledgeQuest(id: string): void {
  const set = readAck();
  if (set.has(id)) return;
  const next = new Set(set);
  next.add(id);
  writeAck(next);
  emitAck();
}

export function isQuestAcknowledged(id: string): boolean {
  return readAck().has(id);
}

export function subscribeQuestAck(listener: AckListener): () => void {
  ackListeners.add(listener);
  return () => {
    ackListeners.delete(listener);
  };
}

/** React hook — returns the acknowledged set, re-rendering when it
 *  changes. */
export function useQuestAcknowledged(): ReadonlySet<string> {
  const [s, setS] = useState<ReadonlySet<string>>(() => new Set(readAck()));
  useEffect(() => {
    setS(new Set(readAck()));
    return subscribeQuestAck(setS);
  }, []);
  return s;
}
