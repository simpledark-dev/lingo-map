import { MapData, TileType, Entity } from '../core/types';
import { INTERIOR_VIEW_TILES } from '../core/constants';

// ══════════════════════════════════════════════════════════════
// POKEMON HOUSE — GROUND FLOOR (1F)  20×16 tiles @ 16px
//
// Layout matches Pokemon RSE player house ground floor:
//   - Top 3 rows: wall with windows, clock, staircase opening
//   - Kitchen along north wall (below wall rows)
//   - Dining area bottom-left with table + chairs
//   - Rug in center
//   - Staircase opening top-right (cols 17-18)
//   - Exit door bottom-center (cols 9-10)
// ══════════════════════════════════════════════════════════════

const W = 20;
const H = 16;
const T = 16;
const WI = TileType.WALL_INTERIOR;
const FW = TileType.FLOOR_WOOD;

// The right side of the room has a deeper wall alcove (rows 0-5)
// that creates the stepped-in shape from the Pokemon layout:
//
//   WWWWWWWWWWWWWWWWWWWW
//   WWWWWWWWWWWWWWWWWWWW    ← full-width wall rows 0-1
//   WWWWWWWWWWWWWWWWWWWW    ← row 2 (still full wall, staircase gap at 17-18)
//   W............WWWWWWW    ← rows 3-5: left side = floor, right side (col 14+) = wall
//   W............WW[FF]W    ← row 5: staircase gap at cols 17-18 in the alcove
//   W..................W    ← rows 6+: open floor
//   WWWWWWWW[FF]WWWWWWWW    ← bottom: exit gap at cols 9-10
//
const ALCOVE_COL = 14; // wall step-in starts at this column
const ALCOVE_ROW = 5;  // alcove wall extends down to this row
const V = TileType.VOID; // nothing renders — black canvas background shows through

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      // ── Outside the room (void) ──
      // Top rows, right side: no tile — room is L-shaped, doesn't extend here.
      // The column right at the alcove edge gets a corner piece that shows
      // the wall's perpendicular side face (sells the L-shape depth).
      if (row <= 2 && col === ALCOVE_COL) {
        r.push(WI);
      }
      else if (row <= 2 && col > ALCOVE_COL) {
        r.push(V);
      }
      // ── Room border walls ──
      // Left border
      else if (col === 0) {
        r.push(WI);
      }
      // Right border (only from alcove row down)
      else if (col === W - 1) {
        r.push(WI);
      }
      // Top wall (left portion only, cols 0 to ALCOVE_COL-1)
      else if (row <= 2) {
        r.push(WI);
      }
      // ── Alcove wall step-in (rows 3 to ALCOVE_ROW, col >= ALCOVE_COL) ──
      else if (row <= ALCOVE_ROW && col >= ALCOVE_COL) {
        // Staircase opening at cols 17-18 on the last alcove row
        if (row === ALCOVE_ROW && (col === 17 || col === 18)) {
          r.push(FW);
        } else {
          r.push(WI);
        }
      }
      // Bottom row: wall except exit gap at cols 9-10
      else if (row === H - 1) {
        r.push((col === 9 || col === 10) ? FW : WI);
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
    id: `1f-${++nextId}`, x, y, spriteKey: key,
    anchor: { x: 0.5, y: 1.0 }, sortY: y,
    collisionBox: { offsetX: -Math.floor(cw / 2), offsetY: -ch, width: cw, height: ch },
  };
}
function decor(x: number, y: number, key: string, transition?: { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string }): Entity {
  return {
    id: `1f-${++nextId}`, x, y, spriteKey: key,
    anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000,
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
    transition,
  };
}

const objects: Entity[] = [
  // ── Wall-mounted decor (on wall row 1) ──
  decor(tx(4),       ty(1), 'wall-window-double'),
  decor(tx(9),       ty(1), 'wall-clock'),
  decor(tx(14),      ty(1), 'wall-window-double'),

  // ── Staircase decor — wherever this entity sits, the engine generates a
  // dynamic trigger zone at its bottom row. Move the decor in the editor and
  // the entrance follows. ──
  decor(tx(17) + 8,  ty(ALCOVE_ROW), 'wall-staircase',
    { targetMapId: 'pokemon-house-2f', targetSpawnId: 'from-1f', incomingSpawnId: 'from-2f' }),

  // ── Kitchen strip (row 3, against north wall) ──
  obj(tx(1),      ty(4), 'fridge',          14, 14),
  obj(tx(3),      ty(4), 'sink-counter',    28, 14),
  obj(tx(5) + 8,  ty(4), 'drawer-cabinet',  28, 14),
  obj(tx(8),      ty(4), 'tv',              28, 14),

  // ── Dining area (bottom-left) ──
  obj(tx(4),      ty(10), 'dining-table-small', 44, 28),
  obj(tx(2),      ty(9),  'chair', 12, 12),
  obj(tx(6),      ty(9),  'chair', 12, 12),
  obj(tx(2),      ty(11), 'chair', 12, 12),
  obj(tx(6),      ty(11), 'chair', 12, 12),

  // ── Decorations ──
  decor(tx(11),    ty(9),  'rug-large'),
  obj(tx(12),      ty(5),  'plant-pot', 14, 14),
  decor(tx(9) + 8, ty(14), 'doormat'),
];

export const pokemonHouse1fMap: MapData = {
  id: 'pokemon-house-1f',
  width: W, height: H, tileSize: T,
  maxViewTiles: INTERIOR_VIEW_TILES,
  tiles: makeTiles(),
  objects,
  buildings: [],
  npcs: [],
  triggers: [
    // Exit door — sits on the bottom wall gap tiles. Player must walk all
    // the way down to the door before the trigger fires.
    {
      id: '1f-exit',
      x: 9 * T,
      y: (H - 1) * T,
      width: 2 * T,
      height: T,
      type: 'door',
      targetMapId: 'pokemon',
      targetSpawnId: 'from-house',
    },
    // Staircase trigger is now derived dynamically from the staircase decor
    // entity above (see Entity.transition). Move the decor in the editor and
    // the trigger zone follows automatically.
  ],
  spawnPoints: [
    { id: 'entrance', x: tx(9) + 8, y: ty(H - 3), facing: 'up' },
    { id: 'from-2f',  x: tx(17), y: ty(7), facing: 'down' },
  ],
};
