import { CollisionBox, Building, Trigger } from './types';
import { WorldBox, getWorldCollisionBox, checkAABBOverlap } from './CollisionSystem';

export interface TransitionEvent {
  targetMapId: string;
  targetSpawnId: string;
  /** The building ID that was entered, if triggered by a building door. */
  buildingId?: string;
}

/**
 * Check if the player overlaps any door trigger or building door trigger.
 * Returns the first matching transition event, or null.
 *
 * Building doors (outdoor → interior) require `upIntent === true` —
 * the caller's "user is steering upward THIS frame" signal: either
 * the up key is held (keyboard) or the player's y decreased this tick
 * (tap-walk approaching the door from below). Earlier this was tied
 * to `player.facing === 'up'`, but `facing` is sticky and leaked
 * lateral slides through after an upward step near the door. Earlier
 * still it was the bare up-key, which broke mobile entirely (no keys
 * ever pressed). The frame-local up-intent gate covers both inputs
 * without spurious lateral fires.
 *
 * Map-level triggers (staircases, generic doors) still fire from any
 * direction since their geometry is owned by the map author.
 */
export function checkDoorTriggers(
  playerX: number,
  playerY: number,
  playerCollisionBox: CollisionBox,
  upIntent: boolean,
  triggers: Trigger[],
  buildings: Building[],
): TransitionEvent | null {
  const playerBox = getWorldCollisionBox(playerX, playerY, playerCollisionBox);

  // Check map-level triggers (this includes entity-derived dynamic
  // triggers from PixiApp.loadScene). Triggers flagged with
  // `requiresUpKey` only fire when up-intent is set — that's the
  // door for buildings and staircases set up via entities with
  // `.transition`. Hand-coded triggers in `src/maps/*.ts` (interior
  // exit doors, plot-tied teleports) leave the flag unset and keep
  // firing from any direction.
  for (const trigger of triggers) {
    if (trigger.type !== 'door') continue;
    if (!trigger.targetMapId || !trigger.targetSpawnId) continue;
    if (trigger.requiresUpKey && !upIntent) continue;

    const triggerBox: WorldBox = {
      x: trigger.x,
      y: trigger.y,
      width: trigger.width,
      height: trigger.height,
    };

    if (checkAABBOverlap(playerBox, triggerBox)) {
      return {
        targetMapId: trigger.targetMapId,
        targetSpawnId: trigger.targetSpawnId,
      };
    }
  }

  // Legacy building.doorTrigger path — still gated on up-intent.
  if (!upIntent) return null;
  for (const building of buildings) {
    const doorBox = getWorldCollisionBox(building.x, building.y, building.doorTrigger, building.scale ?? 1);
    if (checkAABBOverlap(playerBox, doorBox)) {
      return {
        targetMapId: building.targetMapId,
        targetSpawnId: building.targetSpawnId,
        buildingId: building.id,
      };
    }
  }

  return null;
}
