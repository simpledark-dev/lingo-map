import { CollisionBox, Entity, Building, MapData, Position, TileType } from './types';

export interface WorldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Convert a relative CollisionBox to world-space AABB using entity position.
 * An optional uniform `scale` multiplies both offsets and dimensions so scaled
 * entities (e.g. resized buildings) keep their hitbox aligned with the visual. */
export function getWorldCollisionBox(entityX: number, entityY: number, box: CollisionBox, scale: number = 1): WorldBox {
  return {
    x: entityX + box.offsetX * scale,
    y: entityY + box.offsetY * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

export function checkAABBOverlap(a: WorldBox, b: WorldBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Check if a world box overlaps any non-walkable tile. */
function collidesWithTiles(map: MapData, box: WorldBox): boolean {
  const startCol = Math.floor(box.x / map.tileSize);
  const endCol = Math.floor((box.x + box.width - 1) / map.tileSize);
  const startRow = Math.floor(box.y / map.tileSize);
  const endRow = Math.floor((box.y + box.height - 1) / map.tileSize);

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      // Out of bounds = blocked
      if (row < 0 || row >= map.height || col < 0 || col >= map.width) return true;
      const tile = map.tiles[row][col];
      if (
        tile === TileType.WALL ||
        tile === TileType.WALL_INTERIOR ||
        tile === TileType.WALL_INTERIOR_TOP ||
        tile === TileType.WALL_INTERIOR_TOP_LEFT ||
        tile === TileType.WALL_INTERIOR_TOP_CORNER_BL ||
        tile === TileType.WALL_INTERIOR_TOP_CORNER_INNER_TR ||
        tile === TileType.WALL_INTERIOR_TOP_BL ||
        tile === TileType.WALL_INTERIOR_TOP_BR ||
        tile === TileType.WALL_INTERIOR_BOTTOM ||
        tile === TileType.WALL_INTERIOR_LEFT ||
        tile === TileType.WALL_INTERIOR_RIGHT ||
        tile === TileType.WALL_INTERIOR_CORNER_BOTTOM_LEFT ||
        tile === TileType.WALL_INTERIOR_CORNER_BOTTOM_RIGHT ||
        tile === TileType.WATER ||
        tile === TileType.VOID
      ) return true;
    }
  }
  return false;
}

/** Check if a world box overlaps any object or building collision box. */
function collidesWithObjects(
  box: WorldBox,
  objects: Entity[],
  buildings: Building[],
): boolean {
  for (const obj of objects) {
    if (obj.collisionBox.width <= 0 || obj.collisionBox.height <= 0) continue;
    const objBox = getWorldCollisionBox(obj.x, obj.y, obj.collisionBox);
    if (checkAABBOverlap(box, objBox)) return true;
  }
  for (const b of buildings) {
    const bBox = getWorldCollisionBox(b.x, b.y, b.collisionBox, b.scale ?? 1);
    if (checkAABBOverlap(box, bBox)) return true;
  }
  return false;
}

/**
 * Resolve player movement with axis-independent sliding.
 * Try X movement alone, then Y movement alone.
 */
export function resolveMovement(
  currentX: number,
  currentY: number,
  desiredX: number,
  desiredY: number,
  playerCollisionBox: CollisionBox,
  map: MapData,
  objects: Entity[],
  buildings: Building[],
): Position {
  // Also include NPCs as collision objects
  const allObjects = [...objects, ...map.npcs];

  // Try X axis
  let newX = desiredX;
  const xBox = getWorldCollisionBox(desiredX, currentY, playerCollisionBox);
  if (collidesWithTiles(map, xBox) || collidesWithObjects(xBox, allObjects, buildings)) {
    newX = currentX;
  }

  // Try Y axis
  let newY = desiredY;
  const yBox = getWorldCollisionBox(newX, desiredY, playerCollisionBox);
  if (collidesWithTiles(map, yBox) || collidesWithObjects(yBox, allObjects, buildings)) {
    newY = currentY;
  }

  return { x: newX, y: newY };
}
