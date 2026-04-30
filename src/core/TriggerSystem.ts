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
 * Building doors (outdoor → interior) require `upKeyHeld === true` —
 * i.e. the up key is being pressed RIGHT NOW. Earlier we used
 * `player.facing === 'up'` here, but `facing` is sticky: after a tap-
 * walk path that briefly stepped upward near the door, facing stayed
 * 'up' even while subsequent steps were horizontal, and the door
 * fired during the lateral slide. Anchoring to the live keystate is
 * the unambiguous "user is steering up" signal.
 *
 * Tap-to-walk into a building isn't supported by this gate: walk up to
 * the door, hold up, enter. Map-level triggers (staircases, generic
 * doors) still fire from any direction since their geometry is owned
 * by the map author.
 */
export function checkDoorTriggers(
  playerX: number,
  playerY: number,
  playerCollisionBox: CollisionBox,
  upKeyHeld: boolean,
  triggers: Trigger[],
  buildings: Building[],
): TransitionEvent | null {
  const playerBox = getWorldCollisionBox(playerX, playerY, playerCollisionBox);

  // Check map-level triggers (this includes entity-derived dynamic
  // triggers from PixiApp.loadScene). Triggers flagged with
  // `requiresUpKey` only fire when the up key is actively held —
  // that's the door for buildings and staircases set up via entities
  // with `.transition`. Hand-coded triggers in `src/maps/*.ts`
  // (interior exit doors, plot-tied teleports) leave the flag unset
  // and keep firing from any direction.
  for (const trigger of triggers) {
    if (trigger.type !== 'door') continue;
    if (!trigger.targetMapId || !trigger.targetSpawnId) continue;
    if (trigger.requiresUpKey && !upKeyHeld) continue;

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

  // Legacy building.doorTrigger path — still gated on the up key.
  if (!upKeyHeld) return null;
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
