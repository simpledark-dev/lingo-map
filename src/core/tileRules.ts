import { TileType } from "./types";

// Single source of truth for "does this tile block the player?".
// CollisionSystem (runtime movement) and Pathfinding (A* walk grid) BOTH
// call this so they can never drift — a previous bug had pathfinding
// missing the `mi:walls/`, `mi:baseboards/`, `mi:borders/`, and
// WALL_BRICK cases, so the planner happily routed paths through
// MI-painted interior walls and the player got stuck against them.
export function isBlockingTile(tile: string): boolean {
  switch (tile as TileType) {
    case TileType.WALL:
    case TileType.WALL_INTERIOR:
    case TileType.WALL_INTERIOR_TOP:
    case TileType.WALL_INTERIOR_TOP_LEFT:
    case TileType.WALL_INTERIOR_TOP_CORNER_BL:
    case TileType.WALL_INTERIOR_TOP_CORNER_INNER_TR:
    case TileType.WALL_INTERIOR_TOP_BL:
    case TileType.WALL_INTERIOR_TOP_BR:
    case TileType.WALL_INTERIOR_BOTTOM:
    case TileType.WALL_INTERIOR_LEFT:
    case TileType.WALL_INTERIOR_RIGHT:
    case TileType.WALL_INTERIOR_CORNER_BOTTOM_LEFT:
    case TileType.WALL_INTERIOR_CORNER_BOTTOM_RIGHT:
    case TileType.WALL_BRICK:
    case TileType.WATER:
    case TileType.VOID:
      return true;
  }
  // Modern Interiors painted tiles — every cell of the
  // walls/baseboards/borders sheets blocks; floors don't.
  // Borders carry windows + door-unit decals that sit IN a wall cell,
  // so they must block for the same reason walls do.
  return (
    tile.startsWith("mi:walls/") ||
    tile.startsWith("mi:baseboards/") ||
    tile.startsWith("mi:borders/")
  );
}
