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

export type QuestStatus = "inactive" | "active" | "completed";

/** Cents the player must earn (translation work only — penalties +
 *  borrows don't count) before the CEO will hand over the first
 *  paycheck. Lives here next to the quest catalog rather than in
 *  GameCanvas so the QuestHud can read it without pulling in a
 *  circular import. Set to $1.00 (35 correct translations at the
 *  current $0.30 reward, with room to absorb a few wrongs) so the
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
  // loop. Auto-chained after the sandwich so the player has just
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
    title: "A Sandwich for Your Child",
    computeTitle: () =>
      t("quest.childSandwich.title", { child: childDisplayName() }),
    // Static fallback — only shown if `computeObjective` is somehow
    // skipped (e.g. unit-test reading the def directly).
    objective: "Your child wanted to talk to you. Head home.",
    // Two-stage objective: pre-Mim-ask vs post-Mim-ask. Keeps the
    // quest log faithful to what the PLAYER currently knows
    // (Mim hasn't said anything yet → "go home and find out") vs
    // what they're acting on (Mim asked → "buy a sandwich").
    // Stage flips when CHILD_ASKED_FOR_SANDWICH is set inside
    // Mim's dialogue handler.
    computeObjective: () =>
      hasFlag(FLAGS.CHILD_ASKED_FOR_SANDWICH)
        ? t("quest.childSandwich.objective", { child: childDisplayName() })
        : t("quest.childSandwich.objectivePreAsk", {
            child: childDisplayName(),
          }),
    completedSummary: "You brought your child a sandwich.",
    computeCompletedSummary: () =>
      t("quest.childSandwich.completedSummary", { child: childDisplayName() }),
    // Auto-chained after the first paycheck — the player has the
    // money + the workflow muscle memory by then, and Mim's request
    // closes the loop on "you came to the city to feed your kid".
    // No `availableHint` is intentional: the chain auto-starts via
    // GameCanvas's catch-up effect, so the quest skips the
    // Available tier entirely and lands directly in In Progress.
    requiresCompleted: ["first-paycheck"],
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
  "first-paycheck": {
    id: "first-paycheck",
    title: "Earn Your First Paycheck",
    computeTitle: () => t("quest.firstPaycheck.title"),
    objective: "Eli's at the office. Earn $1.00 and return to the CEO.",
    computeObjective: () =>
      t("quest.firstPaycheck.objective", { threshold: "$1.00" }),
    availableHint: "The CEO promised a paycheck.",
    computeAvailableHint: () => t("quest.firstPaycheck.availableHint"),
    completedSummary: "You earned your first paycheck.",
    computeCompletedSummary: () => t("quest.firstPaycheck.completedSummary"),
    // Auto-starts as soon as the intro is done (see GameCanvas's
    // catch-up effect), but prereq is set anyway so a stale save
    // mid-intro doesn't accidentally surface this in Available.
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
  | { kind: "completed"; def: QuestDef };

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

/** When true, status + transition listeners do NOT fire immediately —
 *  GameCanvas turns this on while a dialogue is open so the QuestHud
 *  "NEW" pulse and the QuestToast popup don't appear behind the
 *  parchment box while the player is still reading the NPC's
 *  follow-up line. Internal state (read()) updates immediately, so
 *  any code path that calls `getQuestStatus()` directly still sees
 *  the latest answer.
 *
 *  `pendingStatusEmit` is a dirty flag rather than a queued list
 *  because emitStatuses always emits the CURRENT snapshot — there's
 *  no point storing intermediate states the player will never see.
 *  `pendingTransitions` IS a list because each transition is its
 *  own toast: completing one quest then starting another fires two
 *  separate notifications when we drain. */
let visibilityDeferred = false;
let pendingStatusEmit = false;
const pendingTransitions: QuestTransition[] = [];

function emitStatuses(): void {
  if (visibilityDeferred) {
    pendingStatusEmit = true;
    return;
  }
  const snapshot = { ...read() };
  for (const l of statusListeners) l(snapshot);
}

function emitTransition(event: QuestTransition): void {
  if (visibilityDeferred) {
    pendingTransitions.push(event);
    return;
  }
  for (const l of transitionListeners) l(event);
}

/** Pause / resume player-visible quest notifications. Call with `true`
 *  when a dialogue opens; `false` when it closes. While paused, every
 *  `completeQuest` / `startQuest` still mutates state but its toast
 *  and HUD-update wait. Resuming flushes a single status snapshot
 *  (so subscribers see the ENDING state, not each intermediate flip)
 *  followed by every queued transition in FIFO order. */
export function setQuestVisibilityDeferred(deferred: boolean): void {
  if (visibilityDeferred === deferred) return;
  visibilityDeferred = deferred;
  if (deferred) return;
  if (pendingStatusEmit) {
    pendingStatusEmit = false;
    const snapshot = { ...read() };
    for (const l of statusListeners) l(snapshot);
  }
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

/** Start a quest. No-op if it's already active or completed (so
 *  callers can fire `startQuest('x')` defensively without first
 *  checking status). Emits a `started` transition only when the
 *  status actually flipped, so the toast doesn't double-fire. */
export function startQuest(id: string): void {
  const def = QUESTS[id];
  if (!def) return;
  // Disabled quests are silently skipped — keeps chain-trigger code
  // (e.g. "after sandwich, start tutorial-borrow") working without
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
