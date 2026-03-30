import { MapData, TileType, Entity } from '../core/types';

const W = 28;
const H = 22;
const F = TileType.FLOOR;
const WL = TileType.WALL;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      // Outer walls
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) {
        // Door gap at bottom center
        if (row === H - 1 && (col === 13 || col === 14)) {
          r.push(F);
        } else {
          r.push(WL);
        }
      }
      // Horizontal wall dividing upper rooms from main hall (row 7)
      // Doorways at cols 6-7 (to bedroom) and cols 20-21 (to study)
      else if (row === 7 && !(col === 6 || col === 7) && !(col === 20 || col === 21)) {
        r.push(WL);
      }
      // Vertical wall dividing upper-left bedroom from upper-right study (col 14)
      // Doorway at rows 3-4
      else if (col === 14 && row < 7 && !(row === 3 || row === 4)) {
        r.push(WL);
      }
      // Small kitchen partition in main room (col 22, rows 12-17)
      // with doorway at rows 12-13
      else if (col === 22 && row >= 12 && row <= 17 && !(row === 12 || row === 13)) {
        r.push(WL);
      }
      else {
        r.push(F);
      }
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, spriteKey: string, w: number, h: number): Entity {
  return {
    id: `indoor-${++id}`, x, y, spriteKey,
    anchor: { x: 0.5, y: 1.0 },
    sortY: y,
    collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h },
  };
}

/** Decorative object with no collision (rugs, candles, windows). */
function decor(x: number, y: number, spriteKey: string): Entity {
  return {
    id: `indoor-${++id}`, x, y, spriteKey,
    anchor: { x: 0.5, y: 1.0 },
    sortY: y - 1000, // render below other entities (flat on floor)
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
  };
}

// pixel helpers
const T = 32;
function tx(col: number) { return col * T + T / 2; }
function ty(row: number) { return (row + 1) * T; } // anchor at bottom

export const indoorMap: MapData = {
  id: 'indoor',
  width: W,
  height: H,
  tileSize: T,
  tiles: makeTiles(),

  objects: [
    // ════════════════════════════════════
    // UPPER LEFT — Bedroom (cols 1-13, rows 1-6)
    // ════════════════════════════════════

    // Bed against north wall
    obj(tx(3), ty(2), 'bed', 28, 48),
    // Nightstand (table) beside bed
    obj(tx(6), ty(1), 'furniture', 24, 16),
    // Candle on nightstand
    decor(tx(6), ty(0), 'candle'),
    // Rug beside bed
    decor(tx(4), ty(5), 'rug'),
    // Crate at foot of bed
    obj(tx(2), ty(5), 'crate', 20, 20),
    // Bookshelf against west wall
    obj(tx(1), ty(3), 'bookshelf', 28, 28),
    // Pot decoration
    obj(tx(1), ty(6), 'pot', 16, 20),
    // Window on north wall (decorative)
    decor(tx(8), ty(1), 'window-indoor'),
    // Chair
    obj(tx(10), ty(3), 'chair', 20, 18),
    // Small table
    obj(tx(11), ty(3), 'furniture', 24, 16),
    // Candle on table
    decor(tx(11), ty(2), 'candle'),

    // ════════════════════════════════════
    // UPPER RIGHT — Study (cols 15-26, rows 1-6)
    // ════════════════════════════════════

    // Large desk
    obj(tx(19), ty(3), 'furniture', 24, 16),
    obj(tx(20), ty(3), 'furniture', 24, 16),
    // Chair at desk
    obj(tx(19), ty(5), 'chair', 20, 18),
    // Bookshelves along north wall
    obj(tx(16), ty(2), 'bookshelf', 28, 28),
    obj(tx(18), ty(2), 'bookshelf', 28, 28),
    obj(tx(24), ty(2), 'bookshelf', 28, 28),
    obj(tx(26), ty(2), 'bookshelf', 28, 28),
    // Candle on desk
    decor(tx(20), ty(2), 'candle'),
    // Crates in corner
    obj(tx(26), ty(5), 'crate', 20, 20),
    obj(tx(25), ty(6), 'crate', 20, 20),
    // Pot
    obj(tx(15), ty(6), 'pot', 16, 20),
    // Window
    decor(tx(22), ty(1), 'window-indoor'),

    // ════════════════════════════════════
    // MAIN HALL — Living/Dining (cols 1-21, rows 8-20)
    // ════════════════════════════════════

    // Fireplace on west wall
    obj(tx(1), ty(12), 'fireplace', 40, 32),

    // Rug in front of fireplace
    decor(tx(3), ty(14), 'rug'),

    // Armchairs by fireplace
    obj(tx(2), ty(15), 'chair', 20, 18),
    obj(tx(5), ty(15), 'chair', 20, 18),

    // Dining table (center of hall)
    obj(tx(10), ty(12), 'furniture', 24, 16),
    obj(tx(11), ty(12), 'furniture', 24, 16),
    obj(tx(12), ty(12), 'furniture', 24, 16),
    obj(tx(10), ty(13), 'furniture', 24, 16),
    obj(tx(11), ty(13), 'furniture', 24, 16),
    obj(tx(12), ty(13), 'furniture', 24, 16),

    // Chairs around dining table
    obj(tx(9), ty(12), 'chair', 20, 18),
    obj(tx(9), ty(13), 'chair', 20, 18),
    obj(tx(13), ty(12), 'chair', 20, 18),
    obj(tx(13), ty(13), 'chair', 20, 18),

    // Candles on dining table
    decor(tx(11), ty(11), 'candle'),

    // Barrels along south wall
    obj(tx(2), ty(19), 'barrel', 20, 22),
    obj(tx(3), ty(20), 'barrel', 20, 22),

    // Pots near entrance (pushed to sides, away from spawn at col 13)
    obj(tx(8), ty(20), 'pot', 16, 20),
    obj(tx(19), ty(20), 'pot', 16, 20),

    // Bookshelf on east wall of main hall
    obj(tx(20), ty(10), 'bookshelf', 28, 28),
    obj(tx(20), ty(14), 'bookshelf', 28, 28),

    // Rug near entrance (decorative, no collision)
    decor(tx(14), ty(17), 'rug'),

    // Crate near south wall
    obj(tx(6), ty(20), 'crate', 20, 20),

    // Windows on west wall
    decor(tx(1), ty(9), 'window-indoor'),
    decor(tx(1), ty(17), 'window-indoor'),

    // ════════════════════════════════════
    // KITCHEN (cols 23-26, rows 8-20)
    // ════════════════════════════════════

    // Stove against east wall
    obj(tx(26), ty(10), 'stove', 28, 20),
    // Counter / table
    obj(tx(24), ty(10), 'furniture', 24, 16),
    // Barrels
    obj(tx(26), ty(14), 'barrel', 20, 22),
    obj(tx(26), ty(16), 'barrel', 20, 22),
    // Crates
    obj(tx(24), ty(16), 'crate', 20, 20),
    obj(tx(24), ty(18), 'crate', 20, 20),
    // Pots
    obj(tx(23), ty(14), 'pot', 16, 20),
    obj(tx(25), ty(19), 'pot', 16, 20),
    // Window
    decor(tx(26), ty(12), 'window-indoor'),
  ],

  buildings: [],

  npcs: [
    {
      id: 'housekeeper',
      x: tx(15),
      y: ty(12),
      spriteKey: 'npc',
      anchor: { x: 0.5, y: 1.0 },
      sortY: ty(12),
      collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
      name: 'Housekeeper',
      dialogue: [
        'Welcome! Make yourself at home.',
        'The bedroom is upstairs to the left.',
        'My study is to the right — careful with the books!',
        'Help yourself to anything in the kitchen.',
      ],
    },
  ],

  triggers: [
    {
      id: 'indoor-exit',
      x: 13 * T,
      y: (H - 1) * T,
      width: 64,
      height: 16,
      type: 'door',
      targetMapId: 'outdoor',
      targetSpawnId: 'house-exit',
    },
  ],

  spawnPoints: [
    { id: 'entrance', x: tx(13), y: ty(19), facing: 'up' },
  ],
};
