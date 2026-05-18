/**
 * Lifecycle / spawn / movement orchestration for the social hub.
 *
 * Pure-ish helpers that take the current `SocialHubState` and an
 * "engine" facade (the bits of PixiApp the runtime needs) and
 * produce a NEW state + side effects on the engine. Keeping the
 * pure-data and engine-effect parts together here means the React
 * scene component stays thin — it just calls tick functions and
 * stores the returned state.
 *
 * Side effects this module performs:
 *   – pixiApp.addNpc / removeNpc      — adds/removes sprites
 *   – pixiApp.walkNpcTo               — drives the smooth walk
 *   – pixiApp.setQuestMarkers         — toggles the exclamation
 *                                       above NPCs that need
 *                                       interaction
 *
 * What this module is NOT responsible for:
 *   – Picking dialogue lines (interactions module owns that)
 *   – Rendering UI (the scene component owns that)
 *   – Applying outcomes from dialogue (the dialogue runner owns that)
 */

import type { PixiApp } from '../../renderer/PixiApp';
import { pickRandomPersona } from '../../data/socialHub/personas';
import {
  Poi,
  PoiType,
  SOCIAL_HUB_POIS,
  getPoiById,
  getPoisOfType,
  slotToWorld,
} from '../../data/socialHub/pois';
import { pickInteractionForPoi } from '../../data/socialHub/interactions';
import { makeReviewEntry } from '../../data/socialHub/reviews';
import {
  GuestNpc,
  SocialHubState,
  addMoney,
  addNpc,
  addReview,
  claimSlot,
  countActiveNpcs,
  findFreeSlot,
  hasFreeEntranceSlot,
  releaseSlot,
  removeNpc,
  updateNpc,
} from './state';

// ── Tunables ───────────────────────────────────────────────────
/** Hard cap on simultaneous guests. Beyond this, new arrivals are
 *  deferred until someone leaves. Per the spec. */
export const MAX_NPCS = 8;
/** Minimum gap between spawns (ms). Without this, a session would
 *  fill the room in two ticks of the spawn loop and feel chaotic. */
export const SPAWN_INTERVAL_MS = 4000;
/** Range of "how many interactions until this NPC leaves" sampled
 *  per guest at spawn. Visits feel variable rather than all-three. */
const MAX_INTERACTIONS_RANGE: [number, number] = [2, 4];
/** Pixels-per-second the guest walks at. Slower than the player so
 *  the player can keep up visually and the room feels alive without
 *  feeling frantic. */
const WALK_SPEED = 50;
/** Probability that an NPC arriving at a non-entrance POI puts up a
 *  request marker immediately. The remainder go into `idling` and
 *  rely on the idle tick rolls to eventually fire a request OR
 *  wander to a different POI. Tuned high enough that most arrivals
 *  ARE met with a request (the player's mental model is "they came
 *  here because they wanted something"), but low enough that the
 *  scene gets some "they're just hanging out" beats too. */
const ARRIVAL_REQUEST_PROB = 0.7;

// ── Spawn ──────────────────────────────────────────────────────

/** Try to spawn a new guest at the entrance. Bails (returns the
 *  state unchanged) when:
 *    – rate-limit hasn't elapsed
 *    – MAX_NPCS reached
 *    – all entrance slots claimed
 *    – the engine refuses the sprite (missing texture). */
export function trySpawnGuest(
  state: SocialHubState,
  pixiApp: PixiApp,
  now: number,
): SocialHubState {
  if (now - state.lastSpawnAt < SPAWN_INTERVAL_MS) return state;
  if (countActiveNpcs(state) >= MAX_NPCS) return state;
  const entrance = getPoiById('entrance');
  if (!entrance) return state;
  if (!hasFreeEntranceSlot(state, entrance)) return state;
  const slot = findFreeSlot(state, entrance);
  if (!slot) return state;

  const persona = pickRandomPersona();
  const id = `guest-${state.nextNpcSeq}`;
  const [minI, maxI] = MAX_INTERACTIONS_RANGE;
  const maxInteractions = Math.floor(
    minI + Math.random() * (maxI - minI + 1),
  );
  const guest: GuestNpc = {
    id,
    persona,
    state: 'entering',
    slotId: slot.id,
    satisfaction: 0,
    successCount: 0,
    totalCount: 0,
    maxInteractions,
    spawnedAt: now,
    doneInteractionIds: [],
  };

  // Spawn the sprite right at the door tile (row 19, the gap in
  // the south wall) so the walk-in animation moves UP into the
  // entrance slot. Don't push them past the wall — viewport clipping
  // would hide them and the marker would have no anchor for a beat.
  const target = slotToWorld(slot);
  // 32 px = 2 tiles below the slot row.
  const spawnY = target.y + 32;
  const ok = pixiApp.addNpc({
    id,
    x: target.x,
    y: spawnY,
    spriteKey: persona.spriteKey,
    anchor: { x: 0.5, y: 1.0 },
    sortY: spawnY,
    collisionBox: { offsetX: -4, offsetY: -6, width: 8, height: 6 },
    name: persona.name,
    dialogue: ['...'],
    dialogueKeys: ['scene.socialHub.npc.idle'],
    dialogueKind: 'social-hub',
  });
  if (!ok) return state;

  // Walk them into the entrance slot. On arrival, the lifecycle
  // tick (separate path) flips state to waiting_for_welcome and
  // raises the marker.
  pixiApp.walkNpcTo(id, target.x, target.y, {
    speed: WALK_SPEED,
    facing: 'up',
  });

  let next = addNpc(state, guest);
  next = claimSlot(next, slot.id, id);
  return { ...next, lastSpawnAt: now };
}

// ── Arrival / state transitions ────────────────────────────────

/** Tick the per-NPC state machine. The engine drives walk motion
 *  via the guided-walk system; this function checks whether a
 *  guided walk has finished by comparing position to the claimed
 *  slot's target, and advances state accordingly. */
export function tickGuestArrivals(
  state: SocialHubState,
  pixiApp: PixiApp,
): SocialHubState {
  const gameState = pixiApp.getGameState();
  if (!gameState) return state;
  let next = state;
  for (const guest of Object.values(state.npcsById)) {
    if (guest.state !== 'entering' && guest.state !== 'wandering' && guest.state !== 'leaving') {
      continue;
    }
    const sprite = gameState.npcs.find((n) => n.id === guest.id);
    if (!sprite) continue;
    if (!guest.slotId) continue;
    // For 'leaving', target is the door (outside the room) rather
    // than a POI slot. We detect arrival by lack of a slot and by
    // the position being ~at the off-map y. Simpler: leaving NPCs
    // are removed by a dedicated path (`processLeaveQueue`), not
    // by arrival inspection. Skip here.
    if (guest.state === 'leaving') continue;
    const poi = SOCIAL_HUB_POIS.find((p) =>
      p.slots.some((s) => s.id === guest.slotId),
    );
    if (!poi) continue;
    const slot = poi.slots.find((s) => s.id === guest.slotId);
    if (!slot) continue;
    const target = slotToWorld(slot);
    const dx = sprite.x - target.x;
    const dy = sprite.y - target.y;
    if (dx * dx + dy * dy < 4) {
      // Arrived. Transition to the right waiting state.
      if (guest.state === 'entering') {
        next = updateNpc(next, guest.id, {
          state: 'waiting_for_welcome',
        });
      } else if (guest.state === 'wandering') {
        // Arrived at a POI. Most of the time, fire a request
        // right away — that's why the NPC came over here. A
        // minority of arrivals settle into `idling` first so the
        // visit doesn't feel like one prompt after another.
        // When `idling` wins, the regular idle-tick rolls
        // (request / wander / stay) still drive what happens
        // next, so the player rarely sees a guest just standing
        // around silently for long.
        const interaction =
          poi.type !== 'entrance'
            ? pickInteractionForPoi(poi.type, guest.doneInteractionIds)
            : undefined;
        const fireRequestNow = interaction
          ? Math.random() < ARRIVAL_REQUEST_PROB
          : false;
        next = updateNpc(next, guest.id, {
          state: fireRequestNow ? 'waiting_for_interaction' : 'idling',
        });
      }
    }
  }
  return next;
}

// ── Wandering ─────────────────────────────────────────────────

/** Idle NPCs roll on every tick between three outcomes:
 *    – fire a request at the CURRENT POI (raise the marker)
 *    – wander to a DIFFERENT POI
 *    – keep idling
 *  Post-entrance NPCs short-circuit straight to the wander path
 *  so they clear the door promptly. Everyone else gets a natural
 *  beat at each POI before a marker appears, matching the rhythm
 *  the player expects between requests. */
const REQUEST_TRIGGER_PROB = 0.15;
const WANDER_TRIGGER_PROB = 0.05;

export function tickIdleWandering(
  state: SocialHubState,
  pixiApp: PixiApp,
): SocialHubState {
  let next = state;
  for (const guest of Object.values(state.npcsById)) {
    if (guest.state !== 'idling') continue;

    // ── Post-entrance short-circuit ─────────────────────────
    // Just finished the welcome — get them out of the doorway
    // without rolling the usual idle gates. Pure wander path.
    if (guest.needsImmediateWander) {
      const target = pickWanderTarget(next, guest);
      if (!target) continue;
      next = startWanderTo(next, pixiApp, guest.id, guest.slotId, target.slot);
      continue;
    }

    // ── Normal idle: maybe request, maybe wander, maybe stay ──
    const roll = Math.random();
    if (roll < REQUEST_TRIGGER_PROB) {
      // Try to put up a marker at the current POI. Skip if the
      // current slot isn't on a POI (shouldn't happen) or if all
      // valid interactions for that POI have already been done
      // by this NPC this visit.
      const currentPoi = guest.slotId
        ? SOCIAL_HUB_POIS.find((p) => p.slots.some((s) => s.id === guest.slotId))
        : undefined;
      if (currentPoi && currentPoi.type !== 'entrance') {
        const interaction = pickInteractionForPoi(
          currentPoi.type,
          guest.doneInteractionIds,
        );
        if (interaction) {
          next = updateNpc(next, guest.id, {
            state: 'waiting_for_interaction',
          });
        }
      }
      continue;
    }
    if (roll < REQUEST_TRIGGER_PROB + WANDER_TRIGGER_PROB) {
      const target = pickWanderTarget(next, guest);
      if (!target) continue;
      next = startWanderTo(next, pixiApp, guest.id, guest.slotId, target.slot);
      continue;
    }
    // else: keep idling.
  }
  return next;
}

/** Shared helper: release the old slot, claim the new one,
 *  transition to wandering, and kick off the engine walk. Used by
 *  both the post-entrance short-circuit and the normal idle wander
 *  branch above — same state changes either way. */
function startWanderTo(
  state: SocialHubState,
  pixiApp: PixiApp,
  npcId: string,
  oldSlotId: string | null,
  newSlot: { id: string; col: number; row: number },
): SocialHubState {
  let next = state;
  if (oldSlotId) next = releaseSlot(next, oldSlotId);
  next = claimSlot(next, newSlot.id, npcId);
  next = updateNpc(next, npcId, {
    state: 'wandering',
    slotId: newSlot.id,
    needsImmediateWander: false,
  });
  const world = slotToWorld(newSlot);
  pixiApp.walkNpcTo(npcId, world.x, world.y, {
    speed: WALK_SPEED,
    facing: 'down',
  });
  return next;
}

function pickWanderTarget(
  state: SocialHubState,
  guest: GuestNpc,
): { poi: Poi; slot: { id: string; col: number; row: number } } | null {
  const nonEntranceTypes: PoiType[] = ['lounge', 'reading', 'game'];
  const shuffled = nonEntranceTypes
    .flatMap((t) => getPoisOfType(t))
    .sort(() => Math.random() - 0.5);
  for (const poi of shuffled) {
    const free = findFreeSlot(state, poi);
    if (free && free.id !== guest.slotId) {
      return { poi, slot: free };
    }
  }
  return null;
}

// ── Outcome handling (called by the dialogue runner) ──────────

/** Apply an interaction's terminal outcome. Returns the new state
 *  and a flag indicating whether the NPC was tagged to leave. The
 *  scene component combines this with a short delay before actually
 *  walking the NPC out, so the feedback line has time to read. */
export function applyOutcome(
  state: SocialHubState,
  pixiApp: PixiApp,
  npcId: string,
  outcome: {
    tipCents?: number;
    satisfactionDelta?: number;
    npcLeaves?: boolean;
    happy?: boolean;
  },
  interactionId: string,
): SocialHubState {
  const guest = state.npcsById[npcId];
  if (!guest) return state;
  let next = state;
  if (outcome.tipCents) {
    next = addMoney(next, outcome.tipCents);
  }
  // Detect whether the guest is currently parked at an entrance
  // slot — if so, they shouldn't loiter at the door after the
  // welcome resolves. Setting `needsImmediateWander` makes the
  // next wander tick move them along without rolling the usual
  // probability gate.
  const currentPoi = guest.slotId
    ? SOCIAL_HUB_POIS.find((p) => p.slots.some((s) => s.id === guest.slotId))
    : undefined;
  const wasAtEntrance = currentPoi?.type === 'entrance';
  next = updateNpc(next, npcId, {
    satisfaction: guest.satisfaction + (outcome.satisfactionDelta ?? 0),
    successCount: guest.successCount + (outcome.happy ? 1 : 0),
    totalCount: guest.totalCount + 1,
    doneInteractionIds: [...guest.doneInteractionIds, interactionId],
    state: outcome.npcLeaves ? 'leaving' : 'idling',
    needsImmediateWander: !outcome.npcLeaves && wasAtEntrance,
  });
  if (outcome.npcLeaves) {
    next = beginLeave(next, pixiApp, npcId);
  } else {
    // Check if they're done with their visit naturally.
    const after = next.npcsById[npcId];
    if (after && after.totalCount >= after.maxInteractions) {
      next = updateNpc(next, npcId, { state: 'leaving' });
      next = beginLeave(next, pixiApp, npcId);
    }
  }
  return next;
}

/** Walk an NPC out the door, then remove them and log their review.
 *  Called both for natural end-of-visit and bad-response-triggered
 *  leaves. */
function beginLeave(
  state: SocialHubState,
  pixiApp: PixiApp,
  npcId: string,
): SocialHubState {
  const guest = state.npcsById[npcId];
  if (!guest) return state;
  let next = state;
  if (guest.slotId) {
    next = releaseSlot(next, guest.slotId);
  }
  next = updateNpc(next, npcId, { slotId: null });
  // Target: one tile BELOW the entrance gap → off-map. Use the
  // middle of the door span (col 13, row 20) so they always walk
  // out through the gap regardless of which slot they were in.
  const exit = { x: 13 * 16 + 8, y: (20 + 1) * 16 };
  pixiApp.walkNpcTo(npcId, exit.x, exit.y, {
    speed: WALK_SPEED,
    facing: 'down',
    onArrive: () => {
      // Sprite is off-map; remove it and clean up. The scene
      // component picks up the removal through its own state
      // tick (it's the same React state object). We can't
      // mutate here cleanly — the scene polls and finalises in
      // `finaliseLeavers`.
      pixiApp.removeNpc(npcId);
    },
  });
  return next;
}

/** Sweep for leaving NPCs whose sprites have been removed but
 *  whose runtime state still exists. Logs their review and clears
 *  the state entry. Called from the scene's React tick. */
export function finaliseLeavers(
  state: SocialHubState,
  pixiApp: PixiApp,
): SocialHubState {
  const gs = pixiApp.getGameState();
  if (!gs) return state;
  let next = state;
  for (const guest of Object.values(state.npcsById)) {
    if (guest.state !== 'leaving') continue;
    const stillPresent = gs.npcs.some((n) => n.id === guest.id);
    if (stillPresent) continue;
    // Sprite is gone — they've fully left. Log the review and
    // remove the runtime entry.
    next = addReview(
      next,
      makeReviewEntry(guest.id, guest.persona.name, guest.satisfaction),
    );
    next = removeNpc(next, guest.id);
  }
  return next;
}
