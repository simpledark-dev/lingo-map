import { Entity, PlayerState, Building, NPCData } from './types';

export interface SortableEntity {
  id: string;
  sortY: number;
  type: 'object' | 'building-base' | 'npc' | 'player';
}

/**
 * Build a sorted list of entity IDs for the renderer to use for z-ordering.
 * Sorted by sortY ascending (lower Y = further back = rendered first).
 */
export function getSortedEntityIds(
  objects: Entity[],
  buildings: Building[],
  npcs: NPCData[],
  player: PlayerState,
): SortableEntity[] {
  const entries: SortableEntity[] = [];

  for (const obj of objects) {
    entries.push({ id: obj.id, sortY: obj.sortY, type: 'object' });
  }
  for (const b of buildings) {
    entries.push({ id: b.id, sortY: b.sortY, type: 'building-base' });
  }
  for (const npc of npcs) {
    entries.push({ id: npc.id, sortY: npc.sortY, type: 'npc' });
  }
  entries.push({ id: player.id, sortY: player.sortY, type: 'player' });

  entries.sort((a, b) => a.sortY - b.sortY);
  return entries;
}
