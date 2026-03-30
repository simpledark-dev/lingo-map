import { MapData, TileType, Entity } from '../core/types';

const W = 28;
const H = 22;
const F = TileType.FLOOR;
const WL = TileType.WALL;
const T = 32;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) {
        if (row === H - 1 && (col === 13 || col === 14)) r.push(F);
        else r.push(WL);
      }
      // Kitchen partition (col 21, doorway rows 8-9)
      else if (col === 21 && !(row === 8 || row === 9)) r.push(WL);
      // VIP room partition (row 7, cols 1-10, doorway cols 8-9)
      else if (row === 7 && col <= 10 && !(col === 8 || col === 9)) r.push(WL);
      else r.push(F);
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, k: string, w: number, h: number): Entity {
  return { id: `rest-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h } };
}
function decor(x: number, y: number, k: string): Entity {
  return { id: `rest-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function tx(c: number) { return c * T + T / 2; }
function ty(r: number) { return (r + 1) * T; }

export const restaurantMap: MapData = {
  id: 'restaurant', width: W, height: H, tileSize: T, tiles: makeTiles(),
  objects: [
    // ═══ VIP room (upper left, rows 1-6, cols 1-10) ═══
    obj(tx(3), ty(3), 'dining-table', 24, 16), obj(tx(4), ty(3), 'dining-table', 24, 16),
    obj(tx(5), ty(3), 'dining-table', 24, 16),
    obj(tx(2), ty(3), 'dining-chair', 20, 18), obj(tx(6), ty(3), 'dining-chair', 20, 18),
    obj(tx(3), ty(4), 'dining-chair', 20, 18), obj(tx(5), ty(4), 'dining-chair', 20, 18),
    decor(tx(4), ty(2), 'wine-bottle'), decor(tx(3), ty(2), 'plate'), decor(tx(5), ty(2), 'plate'),
    decor(tx(4), ty(2), 'chandelier'),
    obj(tx(1), ty(5), 'wine-rack', 28, 28),
    decor(tx(1), ty(2), 'window-indoor'),

    // ═══ Main dining hall (rows 8-20, cols 1-20) ═══
    // Reception counter
    obj(tx(11), ty(18), 'counter', 56, 20), obj(tx(13), ty(18), 'counter', 56, 20),

    // Table row 1 — left 4-top
    obj(tx(3), ty(10), 'dining-table', 24, 16), obj(tx(4), ty(10), 'dining-table', 24, 16),
    obj(tx(2), ty(10), 'dining-chair', 20, 18), obj(tx(5), ty(10), 'dining-chair', 20, 18),
    obj(tx(3), ty(11), 'dining-chair', 20, 18), obj(tx(4), ty(11), 'dining-chair', 20, 18),
    decor(tx(3), ty(9), 'wine-bottle'), decor(tx(4), ty(9), 'plate'),

    // Table row 1 — center 4-top
    obj(tx(10), ty(10), 'dining-table', 24, 16), obj(tx(11), ty(10), 'dining-table', 24, 16),
    obj(tx(9), ty(10), 'dining-chair', 20, 18), obj(tx(12), ty(10), 'dining-chair', 20, 18),
    obj(tx(10), ty(11), 'dining-chair', 20, 18), obj(tx(11), ty(11), 'dining-chair', 20, 18),
    decor(tx(10), ty(9), 'plate'), decor(tx(11), ty(9), 'plate'),

    // Table row 1 — right 2-top
    obj(tx(17), ty(10), 'dining-table', 24, 16),
    obj(tx(16), ty(10), 'dining-chair', 20, 18), obj(tx(18), ty(10), 'dining-chair', 20, 18),
    decor(tx(17), ty(9), 'wine-bottle'),

    // Table row 2 — left 2-top
    obj(tx(3), ty(14), 'dining-table', 24, 16),
    obj(tx(2), ty(14), 'dining-chair', 20, 18), obj(tx(4), ty(14), 'dining-chair', 20, 18),
    decor(tx(3), ty(13), 'plate'),

    // Table row 2 — large center 6-top
    obj(tx(9), ty(14), 'dining-table', 24, 16), obj(tx(10), ty(14), 'dining-table', 24, 16),
    obj(tx(11), ty(14), 'dining-table', 24, 16),
    obj(tx(9), ty(15), 'dining-table', 24, 16), obj(tx(10), ty(15), 'dining-table', 24, 16),
    obj(tx(11), ty(15), 'dining-table', 24, 16),
    obj(tx(8), ty(14), 'dining-chair', 20, 18), obj(tx(8), ty(15), 'dining-chair', 20, 18),
    obj(tx(12), ty(14), 'dining-chair', 20, 18), obj(tx(12), ty(15), 'dining-chair', 20, 18),
    decor(tx(10), ty(13), 'chandelier'), decor(tx(9), ty(14), 'plate'),
    decor(tx(11), ty(14), 'wine-bottle'),

    // Table row 2 — right 2-top
    obj(tx(17), ty(14), 'dining-table', 24, 16),
    obj(tx(16), ty(14), 'dining-chair', 20, 18), obj(tx(18), ty(14), 'dining-chair', 20, 18),

    // Fireplace (west wall)
    obj(tx(1), ty(12), 'fireplace', 40, 32),
    decor(tx(1), ty(14), 'rug'),

    // Wine racks (east wall of dining)
    obj(tx(20), ty(10), 'wine-rack', 28, 28),
    obj(tx(20), ty(14), 'wine-rack', 28, 28),

    // Decoration
    decor(tx(1), ty(9), 'window-indoor'), decor(tx(1), ty(16), 'window-indoor'),
    decor(tx(20), ty(9), 'window-indoor'), decor(tx(20), ty(16), 'window-indoor'),
    obj(tx(1), ty(19), 'pot', 16, 20), obj(tx(20), ty(19), 'pot', 16, 20),
    decor(tx(8), ty(18), 'rug'), decor(tx(16), ty(18), 'rug'),
    decor(tx(6), ty(9), 'chandelier'), decor(tx(16), ty(9), 'chandelier'),

    // ═══ Kitchen (cols 22-26, rows 1-20) ═══
    obj(tx(25), ty(2), 'stove', 28, 20), obj(tx(25), ty(4), 'stove', 28, 20),
    obj(tx(23), ty(2), 'counter', 56, 20), obj(tx(23), ty(4), 'counter', 56, 20),
    obj(tx(23), ty(6), 'counter', 56, 20),
    obj(tx(25), ty(8), 'barrel', 20, 22), obj(tx(25), ty(10), 'barrel', 20, 22),
    obj(tx(23), ty(10), 'crate', 20, 20), obj(tx(23), ty(12), 'crate', 20, 20),
    obj(tx(25), ty(14), 'crate', 20, 20), obj(tx(23), ty(14), 'barrel', 20, 22),
    obj(tx(22), ty(18), 'pot', 16, 20), obj(tx(25), ty(18), 'pot', 16, 20),
  ],
  buildings: [],
  npcs: [
    { id: 'host', x: tx(12), y: ty(19), spriteKey: 'npc-white', anchor: { x: 0.5, y: 1.0 }, sortY: ty(19), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Host', dialogue: ['Welcome to the restaurant!', 'Table for one? Right this way.', 'Our chef is preparing something special tonight.'] },
    { id: 'chef', x: tx(24), y: ty(6), spriteKey: 'npc-white', anchor: { x: 0.5, y: 1.0 }, sortY: ty(6), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Chef', dialogue: ['Can\'t talk — the souffl\u00e9 is rising!', 'The passion is real!'] },
  ],
  triggers: [{ id: 'restaurant-exit', x: 13 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'restaurant-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(13), y: ty(20), facing: 'up' }],
};
