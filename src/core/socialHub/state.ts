/**
 * Runtime state for the social-hub experiment.
 *
 * Single source of truth for everything that changes during a play
 * session: who's in the room, where they are in their lifecycle,
 * which POI slots are claimed, how much the player has earned, and
 * the review log so far. All mutating helpers return a NEW state
 * object — the SocialHubScene React component stores this in
 * useState so React re-renders naturally on every change.
 *
 * What's intentionally NOT here:
 *   – Sprite handles or pixi objects (those live in PixiApp's
 *     renderer; this module just speaks in npc *ids*).
 *   – Dialogue tree position (owned by the dialogue runner; this
 *     module only knows "npc N is currently in a dialogue").
 *   – Persistence (V1 is per-session-only).
 */

import type { Persona } from '../../data/socialHub/personas';
import type { Poi, PoiSlot } from '../../data/socialHub/pois';
import type { ReviewEntry } from '../../data/socialHub/reviews';

/** Per-NPC state machine. The scene runner drives transitions; the
 *  lifecycle module owns the rules for when each is valid. */
export type NpcState =
  | 'entering'              // walking from spawn into an entrance slot
  | 'waiting_for_welcome'   // sitting at entrance, marker on, waiting for player
  | 'wandering'             // walking from one POI to another
  | 'idling'                // at a POI, marker OFF (between requests)
  | 'waiting_for_interaction' // at a POI, marker ON, request pending
  | 'in_dialogue'           // player actively talking to them
  | 'leaving';              // walking from their last POI back to the door

export interface GuestNpc {
  /** Runtime id. Different from `persona.personaId` — a persona can
   *  be present multiple times in one session under different ids. */
  id: string;
  persona: Persona;
  state: NpcState;
  /** Current POI slot they occupy, if any. `null` while in transit. */
  slotId: string | null;
  /** Net satisfaction over this visit. Drives the exit review. */
  satisfaction: number;
  /** Successful interactions completed this visit. */
  successCount: number;
  /** Total interactions completed this visit (success + failure).
   *  When this hits `maxInteractions` the NPC packs up and leaves. */
  totalCount: number;
  /** How many interactions this NPC will participate in before
   *  leaving naturally. Sampled per visit so visits feel variable. */
  maxInteractions: number;
  /** When they spawned — used for "they've been here long enough"
   *  fallback if a guest gets stuck. */
  spawnedAt: number;
  /** Interactions they've already done this visit. Used to avoid
   *  asking the same request twice from the same NPC. */
  doneInteractionIds: string[];
  /** When true, the next wander tick wanders this NPC immediately
   *  (no probability roll). Set after the entrance-welcome resolves
   *  so guests clear the door fast instead of loitering. Cleared
   *  the moment the wander actually fires. */
  needsImmediateWander?: boolean;
}

export interface SocialHubState {
  /** Live NPC roster keyed by runtime id for O(1) lookup. */
  npcsById: Record<string, GuestNpc>;
  /** Occupied POI slot ids → claimant NPC id. A slot in this map is
   *  considered TAKEN even during the walk-to-slot phase, so two
   *  arriving NPCs never pick the same destination. */
  slotClaims: Record<string, string>;
  /** Player's social-hub tip jar, in cents. Distinct from the main
   *  game wallet — this is experiment-local and not used by the
   *  CEO/translator job loop. */
  moneyCents: number;
  /** Newest review first. Capped so the log doesn't grow forever. */
  reviews: ReviewEntry[];
  /** Monotonic counter for generating unique NPC runtime ids. */
  nextNpcSeq: number;
  /** When the last NPC spawn fired. Lets the lifecycle module
   *  rate-limit arrivals without firing once per render. */
  lastSpawnAt: number;
}

export function createInitialState(): SocialHubState {
  return {
    npcsById: {},
    slotClaims: {},
    moneyCents: 0,
    reviews: [],
    nextNpcSeq: 1,
    lastSpawnAt: 0,
  };
}

/** Pick the first free slot of a POI, scanning left-to-right.
 *  Returns null if every slot is claimed. */
export function findFreeSlot(state: SocialHubState, poi: Poi): PoiSlot | null {
  for (const slot of poi.slots) {
    if (!state.slotClaims[slot.id]) return slot;
  }
  return null;
}

export function isSlotFree(state: SocialHubState, slotId: string): boolean {
  return !state.slotClaims[slotId];
}

export function claimSlot(
  state: SocialHubState,
  slotId: string,
  npcId: string,
): SocialHubState {
  return {
    ...state,
    slotClaims: { ...state.slotClaims, [slotId]: npcId },
  };
}

export function releaseSlot(
  state: SocialHubState,
  slotId: string,
): SocialHubState {
  if (!state.slotClaims[slotId]) return state;
  const next = { ...state.slotClaims };
  delete next[slotId];
  return { ...state, slotClaims: next };
}

export function updateNpc(
  state: SocialHubState,
  id: string,
  patch: Partial<GuestNpc>,
): SocialHubState {
  const existing = state.npcsById[id];
  if (!existing) return state;
  return {
    ...state,
    npcsById: { ...state.npcsById, [id]: { ...existing, ...patch } },
  };
}

export function addNpc(state: SocialHubState, npc: GuestNpc): SocialHubState {
  return {
    ...state,
    npcsById: { ...state.npcsById, [npc.id]: npc },
    nextNpcSeq: state.nextNpcSeq + 1,
  };
}

export function removeNpc(state: SocialHubState, id: string): SocialHubState {
  if (!state.npcsById[id]) return state;
  const npcs = { ...state.npcsById };
  delete npcs[id];
  // Release any slot the NPC was claiming.
  let next = { ...state, npcsById: npcs };
  for (const [slotId, claimant] of Object.entries(state.slotClaims)) {
    if (claimant === id) {
      next = releaseSlot(next, slotId);
    }
  }
  return next;
}

export function addReview(state: SocialHubState, entry: ReviewEntry): SocialHubState {
  const REVIEW_CAP = 20;
  const next = [entry, ...state.reviews].slice(0, REVIEW_CAP);
  return { ...state, reviews: next };
}

export function addMoney(state: SocialHubState, cents: number): SocialHubState {
  return { ...state, moneyCents: state.moneyCents + cents };
}

/** Census-style aggregate used by the spawn rate-limiter and the
 *  HUD label. */
export function countActiveNpcs(state: SocialHubState): number {
  return Object.keys(state.npcsById).length;
}

/** True if at least one entrance slot is free for a new arrival. */
export function hasFreeEntranceSlot(
  state: SocialHubState,
  entrancePoi: Poi,
): boolean {
  return entrancePoi.slots.some((s) => !state.slotClaims[s.id]);
}
