import { MapData, TileType, Entity } from '../core/types';

// ══════════════════════════════════════════════════════════════
// POKEMON HOUSE — UPSTAIRS (2F)  20×14 tiles @ 16px
//
// Layout matches Pokemon RSE player bedroom:
//   - Top 3 rows: wall with painting, clock, window
//   - Bed left side
//   - Computer desk + bookshelves right side
//   - Rug center
//   - Staircase opening top-right (cols 16-17)
// ══════════════════════════════════════════════════════════════

const W = 20;
const H = 14;
const T = 16;
const WI = TileType.WALL_INTERIOR;
const FW = TileType.FLOOR_WOOD;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      // Left/right border walls
      if (col === 0 || col === W - 1) {
        r.push(WI);
      }
      // Top 3 rows: wall (except staircase gap cols 16-17 row 2)
      else if (row <= 1) {
        r.push(WI);
      }
      else if (row === 2) {
        r.push((col === 16 || col === 17) ? FW : WI);
      }
      // Bottom row: all wall
      else if (row === H - 1) {
        r.push(WI);
      }
      // Everything else: wood floor
      else {
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

function obj(x: number, y: number, key: string, cw: number, ch: number): Entity {
  return {
    id: `2f-${++nextId}`, x, y, spriteKey: key,
    anchor: { x: 0.5, y: 1.0 }, sortY: y,
    collisionBox: { offsetX: -Math.floor(cw / 2), offsetY: -ch, width: cw, height: ch },
  };
}
function decor(x: number, y: number, key: string): Entity {
  return {
    id: `2f-${++nextId}`, x, y, spriteKey: key,
    anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000,
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
  };
}

const objects: Entity[] = [
  // ── Wall-mounted decor (row 1) ──
  decor(tx(4),       ty(1), 'wall-painting'),
  decor(tx(8),       ty(1), 'wall-clock'),
  decor(tx(13),      ty(1), 'wall-window'),

  // ── Staircase decor (rows 1-2, cols 16-17) ──
  decor(tx(16) + 8,  ty(2), 'wall-staircase'),

  // ── Bedroom left side ──
  obj(tx(2),       ty(5),  'bed',     28, 28),
  obj(tx(1),       ty(8),  'dresser', 28, 28),

  // ── Study / desk area ──
  obj(tx(7),       ty(4),  'computer-desk', 28, 28),
  obj(tx(10),      ty(4),  'bookshelf', 14, 28),
  obj(tx(11),      ty(4),  'bookshelf', 14, 28),
  obj(tx(12),      ty(4),  'bookshelf', 14, 28),

  // ── Rug (central, decorative) ──
  decor(tx(7),     ty(9),  'rug-large'),
];

export const pokemonHouse2fMap: MapData = {
  id: 'pokemon-house-2f',
  width: W, height: H, tileSize: T,
  tiles: makeTiles(),
  objects,
  buildings: [],
  npcs: [],
  triggers: [
    // Staircase down to 1F — placed in walkable space just below wall gap
    {
      id: '2f-to-1f',
      x: 16 * T,
      y: 2 * T,
      width: 2 * T,
      height: T,
      type: 'door',
      targetMapId: 'pokemon-house-1f',
      targetSpawnId: 'from-2f',
    },
  ],
  spawnPoints: [
    { id: 'from-1f', x: tx(16) + 8, y: ty(4), facing: 'down' },
  ],
};
