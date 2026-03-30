import { MapData, TileType, Entity } from '../core/types';

const W = 24;
const H = 18;
const F = TileType.FLOOR;
const WL = TileType.WALL;
const T = 32;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) {
        if (row === H - 1 && (col === 11 || col === 12)) {
          r.push(F);
        } else {
          r.push(WL);
        }
      }
      // Kitchen partition (col 18, rows 1-12, doorway at rows 5-6)
      else if (col === 18 && row <= 12 && !(row === 5 || row === 6)) {
        r.push(WL);
      } else {
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
    id: `rest-${++id}`, x, y, spriteKey,
    anchor: { x: 0.5, y: 1.0 }, sortY: y,
    collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h },
  };
}
function decor(x: number, y: number, spriteKey: string): Entity {
  return {
    id: `rest-${++id}`, x, y, spriteKey,
    anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000,
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
  };
}

function tx(col: number) { return col * T + T / 2; }
function ty(row: number) { return (row + 1) * T; }

export const restaurantMap: MapData = {
  id: 'restaurant',
  width: W,
  height: H,
  tileSize: T,
  tiles: makeTiles(),

  objects: [
    // ════════════════════════════════════
    // DINING HALL (cols 1-17)
    // ════════════════════════════════════

    // ── Host stand near entrance ──
    obj(tx(9), ty(14), 'counter', 56, 20),

    // ── Wine rack by entrance ──
    obj(tx(16), ty(15), 'wine-rack', 28, 28),

    // ── Table row 1 — formal 4-tops with tablecloths ──
    obj(tx(3), ty(3), 'dining-table', 24, 16),
    obj(tx(4), ty(3), 'dining-table', 24, 16),
    obj(tx(2), ty(3), 'dining-chair', 20, 18),
    obj(tx(5), ty(3), 'dining-chair', 20, 18),
    obj(tx(3), ty(4), 'dining-chair', 20, 18),
    obj(tx(4), ty(4), 'dining-chair', 20, 18),
    decor(tx(3), ty(2), 'wine-bottle'),
    decor(tx(4), ty(2), 'plate'),

    obj(tx(12), ty(3), 'dining-table', 24, 16),
    obj(tx(13), ty(3), 'dining-table', 24, 16),
    obj(tx(11), ty(3), 'dining-chair', 20, 18),
    obj(tx(14), ty(3), 'dining-chair', 20, 18),
    obj(tx(12), ty(4), 'dining-chair', 20, 18),
    obj(tx(13), ty(4), 'dining-chair', 20, 18),
    decor(tx(12), ty(2), 'wine-bottle'),
    decor(tx(13), ty(2), 'plate'),

    // ── Table row 2 — intimate 2-tops ──
    obj(tx(3), ty(7), 'dining-table', 24, 16),
    obj(tx(2), ty(7), 'dining-chair', 20, 18),
    obj(tx(4), ty(7), 'dining-chair', 20, 18),
    decor(tx(3), ty(6), 'plate'),

    obj(tx(15), ty(7), 'dining-table', 24, 16),
    obj(tx(14), ty(7), 'dining-chair', 20, 18),
    obj(tx(16), ty(7), 'dining-chair', 20, 18),
    decor(tx(15), ty(6), 'wine-bottle'),

    // ── Center — large banquet table (6-top) ──
    obj(tx(8), ty(7), 'dining-table', 24, 16),
    obj(tx(9), ty(7), 'dining-table', 24, 16),
    obj(tx(10), ty(7), 'dining-table', 24, 16),
    obj(tx(8), ty(8), 'dining-table', 24, 16),
    obj(tx(9), ty(8), 'dining-table', 24, 16),
    obj(tx(10), ty(8), 'dining-table', 24, 16),
    obj(tx(7), ty(7), 'dining-chair', 20, 18),
    obj(tx(7), ty(8), 'dining-chair', 20, 18),
    obj(tx(11), ty(7), 'dining-chair', 20, 18),
    obj(tx(11), ty(8), 'dining-chair', 20, 18),
    decor(tx(9), ty(6), 'wine-bottle'),
    decor(tx(8), ty(7), 'plate'),
    decor(tx(10), ty(7), 'plate'),

    // ── Table row 3 — booths ──
    obj(tx(2), ty(11), 'dining-table', 24, 16),
    obj(tx(3), ty(11), 'dining-chair', 20, 18),
    decor(tx(2), ty(10), 'plate'),

    obj(tx(15), ty(11), 'dining-table', 24, 16),
    obj(tx(14), ty(11), 'dining-chair', 20, 18),
    obj(tx(16), ty(11), 'dining-chair', 20, 18),
    decor(tx(15), ty(10), 'wine-bottle'),

    // ── Chandeliers (decorative, no collision) ──
    decor(tx(5), ty(2), 'chandelier'),
    decor(tx(9), ty(5), 'chandelier'),
    decor(tx(13), ty(2), 'chandelier'),

    // ── Fireplace on west wall ──
    obj(tx(1), ty(7), 'fireplace', 40, 32),
    decor(tx(1), ty(9), 'rug'),

    // ── Wine rack on east wall ──
    obj(tx(17), ty(7), 'wine-rack', 28, 28),

    // ── Windows ──
    decor(tx(1), ty(3), 'window-indoor'),
    decor(tx(1), ty(11), 'window-indoor'),
    decor(tx(17), ty(3), 'window-indoor'),
    decor(tx(17), ty(11), 'window-indoor'),

    // ── Pots ──
    obj(tx(1), ty(15), 'pot', 16, 20),

    // ── Entrance rug ──
    decor(tx(12), ty(16), 'rug'),

    // ════════════════════════════════════
    // KITCHEN (cols 19-22)
    // ════════════════════════════════════

    // Stoves
    obj(tx(22), ty(2), 'stove', 28, 20),
    obj(tx(22), ty(4), 'stove', 28, 20),

    // Prep counters
    obj(tx(20), ty(2), 'counter', 56, 20),
    obj(tx(20), ty(4), 'counter', 56, 20),

    // Storage
    obj(tx(22), ty(8), 'barrel', 20, 22),
    obj(tx(22), ty(10), 'barrel', 20, 22),
    obj(tx(20), ty(8), 'crate', 20, 20),
    obj(tx(20), ty(10), 'crate', 20, 20),
    obj(tx(20), ty(12), 'crate', 20, 20),

    // Kitchen pots
    obj(tx(19), ty(14), 'pot', 16, 20),
    obj(tx(22), ty(14), 'pot', 16, 20),
  ],

  buildings: [],

  npcs: [
    {
      id: 'host',
      x: tx(11),
      y: ty(14),
      spriteKey: 'npc',
      anchor: { x: 0.5, y: 1.0 },
      sortY: ty(14),
      collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
      name: 'Host',
      dialogue: [
        'Welcome to the restaurant!',
        'Table for one? Right this way.',
        'Our chef is preparing something special tonight.',
      ],
    },
    {
      id: 'chef',
      x: tx(21),
      y: ty(6),
      spriteKey: 'npc',
      anchor: { x: 0.5, y: 1.0 },
      sortY: ty(6),
      collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
      name: 'Chef',
      dialogue: [
        'Can\'t talk now — the soufflé is rising!',
        '...Actually it\'s just placeholder food.',
        'But the passion is real!',
      ],
    },
  ],

  triggers: [
    {
      id: 'restaurant-exit',
      x: 11 * T,
      y: (H - 1) * T,
      width: 64,
      height: 16,
      type: 'door',
      targetMapId: 'outdoor',
      targetSpawnId: 'restaurant-exit',
    },
  ],

  spawnPoints: [
    { id: 'entrance', x: tx(11), y: ty(16), facing: 'up' },
  ],
};
