import { MapData, TileType, Entity } from '../core/types';
import { INTERIOR_VIEW_TILES } from '../core/constants';

// ══════════════════════════════════════════════════════════════
// GROCER — GROUND FLOOR  14×10 tiles @ 16px
//
// Empty shop interior. Exit is a wall-mounted staircase: wherever the user
// drops a `wall-staircase` in the editor, PixiApp auto-generates a trigger at
// its feet row. The compiled map below includes one template staircase so the
// engine's `transitionsBySpriteKey` map picks up the transition payload and
// applies it to editor-placed staircases that lack their own transition data.
// ══════════════════════════════════════════════════════════════

const W = 14;
const H = 10;
const T = 16;
const WI = TileType.WALL_INTERIOR;
const FW = TileType.FLOOR_WOOD;

// Alcove opening in the top wall where the staircase lives.
const STAIR_COL_L = 6;
const STAIR_COL_R = 7;
const STAIR_ROW = 1; // the walkable row right below the top wall

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      // Borders: left, right, top, bottom — all wall.
      if (col === 0 || col === W - 1 || row === 0 || row === H - 1) {
        r.push(WI);
      } else {
        r.push(FW);
      }
    }
    tiles.push(r);
  }
  return tiles;
}

let nextId = 0;
function tx(col: number) { return col * T + T / 2; }
function ty(row: number) { return (row + 1) * T; }

function decor(x: number, y: number, key: string, transition?: { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string }): Entity {
  return {
    id: `grocer-1f-${++nextId}`, x, y, spriteKey: key,
    anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000,
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
    transition,
  };
}

const objects: Entity[] = [
  // Template staircase — its `transition` payload is what PixiApp's
  // `transitionsBySpriteKey` map hands off to any editor-placed
  // `wall-staircase` that lacks its own transition data, so user-placed
  // staircases dynamically become exits pointing back to the outdoor map.
  // The feet sit on STAIR_ROW, which must be walkable (FW) for the
  // auto-generated trigger to land on a walkable tile.
  decor(
    tx(STAIR_COL_L) + T / 2,
    ty(STAIR_ROW),
    'wall-staircase',
    // - targetMapId / targetSpawnId: placeholder — when the player entered
    //   from a building, PixiApp stores a dynamic `exit-<buildingId>` spawn
    //   and overrides targetSpawnId on exit. Only used if the player somehow
    //   arrived here without entering through a door.
    // - incomingSpawnId: the `entrance` spawn is auto-registered 1 tile below
    //   whichever staircase the user places, so entering from the outdoor
    //   Grocer lands the player right next to the staircase regardless of
    //   where in the interior the user placed it.
    { targetMapId: 'pokemon', targetSpawnId: 'from-house', incomingSpawnId: 'entrance' },
  ),
];

export const grocer1fMap: MapData = {
  id: 'grocer-1f',
  width: W, height: H, tileSize: T,
  // Cap the on-screen view so large interiors scroll instead of fitting the
  // whole room on one screen.
  maxViewTiles: INTERIOR_VIEW_TILES,
  tiles: makeTiles(),
  objects,
  buildings: [],
  npcs: [],
  triggers: [],
  spawnPoints: [
    // 'entrance' is where the player lands when entering through the door
    // on the outdoor Grocer building. Placed in the middle of the room.
    { id: 'entrance', x: tx(STAIR_COL_L) + T / 2, y: ty(H - 2), facing: 'up' },
  ],
};
