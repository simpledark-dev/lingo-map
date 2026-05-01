import { CollisionBox, Building, Trigger, Direction } from './types';
import { WorldBox, getWorldCollisionBox, checkAABBOverlap } from './CollisionSystem';

export interface TransitionEvent {
  targetMapId: string;
  targetSpawnId: string;
  /** The building ID that was entered, if triggered by a building door. */
  buildingId?: string;
}

export type DirectionalIntent = Record<Direction, boolean>;

/**
 * Check if the player overlaps any door trigger or building door trigger.
 * Returns the first matching transition event, or null.
 *
 * Doors flagged with `requiresFacing` only fire when the matching
 * direction's intent is set (key held this frame, or position delta
 * this tick going that way). Earlier this was a single `requiresUpKey`
 * boolean; generalising lets doors auto-detect their orientation from
 * the walkable side at creation time, so e.g. an exit doormat at the
 * SOUTH wall of a room fires on facing='down' rather than swallowing
 * the player every time they walk past it.
 *
 * Map-level triggers (staircases, generic doors) without
 * `requiresFacing` still fire from any direction since their geometry
 * is owned by the map author.
 */
export function checkDoorTriggers(
  playerX: number,
  playerY: number,
  playerCollisionBox: CollisionBox,
  intent: DirectionalIntent,
  triggers: Trigger[],
  buildings: Building[],
): TransitionEvent | null {
  const playerBox = getWorldCollisionBox(playerX, playerY, playerCollisionBox);

  for (const trigger of triggers) {
    if (trigger.type !== 'door') continue;
    if (!trigger.targetMapId || !trigger.targetSpawnId) continue;
    if (trigger.requiresFacing && !intent[trigger.requiresFacing]) continue;

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

  // Legacy building.doorTrigger path — kept gated on up-intent since
  // outdoor building entries are universally approached by walking up.
  if (!intent.up) return null;
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
