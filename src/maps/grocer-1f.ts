import { MapData, TileType } from '../core/types';

// ══════════════════════════════════════════════════════════════
// GROCER — GROUND FLOOR  14×10 tiles @ 16px
//
// Empty shop interior. Single exit at the bottom-center. Intended as a
// starter shell — furniture (counter, shelves, NPC) can be placed via the
// map editor later.
// ══════════════════════════════════════════════════════════════

const W = 14;
const H = 10;
const T = 16;
const WI = TileType.WALL_INTERIOR;
const FW = TileType.FLOOR_WOOD;

// Exit gap straddles cols 6–7 on the bottom wall.
const EXIT_COL_L = 6;
const EXIT_COL_R = 7;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (col === 0 || col === W - 1 || row === 0) {
        r.push(WI);
      } else if (row === H - 1) {
        r.push(col === EXIT_COL_L || col === EXIT_COL_R ? FW : WI);
      } else {
        r.push(FW);
      }
    }
    tiles.push(r);
  }
  return tiles;
}

function tx(col: number) { return col * T + T / 2; }
function ty(row: number) { return (row + 1) * T; }

export const grocer1fMap: MapData = {
  id: 'grocer-1f',
  width: W, height: H, tileSize: T,
  tiles: makeTiles(),
  objects: [],
  buildings: [],
  npcs: [],
  triggers: [
    // Exit — spans the two-tile bottom gap. Player walks all the way down to
    // leave. targetSpawnId is a fallback; PixiApp injects a dynamic return
    // spawn at the building the player entered from, so this value is only
    // used if the player somehow arrived here without entering through a door.
    {
      id: 'grocer-1f-exit',
      x: EXIT_COL_L * T,
      y: (H - 1) * T,
      width: 2 * T,
      height: T,
      type: 'door',
      targetMapId: 'pokemon',
      targetSpawnId: 'from-house',
    },
  ],
  spawnPoints: [
    // 'entrance' is where the player lands when they enter through a door.
    { id: 'entrance', x: tx(EXIT_COL_L) + T / 2, y: ty(H - 3), facing: 'up' },
  ],
};
