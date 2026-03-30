import { CollisionBox, Building, Trigger } from './types';
import { WorldBox, getWorldCollisionBox, checkAABBOverlap } from './CollisionSystem';

export interface TransitionEvent {
  targetMapId: string;
  targetSpawnId: string;
}

/**
 * Check if the player overlaps any door trigger or building door trigger.
 * Returns the first matching transition event, or null.
 */
export function checkDoorTriggers(
  playerX: number,
  playerY: number,
  playerCollisionBox: CollisionBox,
  triggers: Trigger[],
  buildings: Building[],
): TransitionEvent | null {
  const playerBox = getWorldCollisionBox(playerX, playerY, playerCollisionBox);

  // Check map-level triggers
  for (const trigger of triggers) {
    if (trigger.type !== 'door') continue;
    if (!trigger.targetMapId || !trigger.targetSpawnId) continue;

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

  // Check building door triggers
  for (const building of buildings) {
    const doorBox = getWorldCollisionBox(building.x, building.y, building.doorTrigger);
    if (checkAABBOverlap(playerBox, doorBox)) {
      return {
        targetMapId: building.targetMapId,
        targetSpawnId: building.targetSpawnId,
      };
    }
  }

  return null;
}
