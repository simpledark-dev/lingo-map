import { MapData, TileType, Entity } from '../core/types';

const W = 26;
const H = 20;
const F = TileType.FLOOR;
const WL = TileType.WALL;
const T = 32;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) {
        if (row === H - 1 && (col === 12 || col === 13)) r.push(F);
        else r.push(WL);
      }
      // Kitchen partition — col 17, doorway rows 8-9
      else if (col === 17 && !(row === 8 || row === 9)) r.push(WL);
      else r.push(F);
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, k: string, w: number, h: number): Entity {
  return { id: `bak-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h } };
}
function decor(x: number, y: number, k: string): Entity {
  return { id: `bak-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function tx(c: number) { return c * T + T / 2; }
function ty(r: number) { return (r + 1) * T; }

export const bakeryMap: MapData = {
  id: 'bakery', width: W, height: H, tileSize: T, tiles: makeTiles(),
  objects: [
    // ═══ Shop front (cols 1-16, rows 1-18) ═══
    // Display counter with pastries
    obj(tx(4), ty(3), 'counter', 56, 20), obj(tx(6), ty(3), 'counter', 56, 20),
    obj(tx(8), ty(3), 'counter', 56, 20), obj(tx(10), ty(3), 'counter', 56, 20),
    obj(tx(4), ty(2), 'pastry-case', 28, 18), obj(tx(6), ty(2), 'pastry-case', 28, 18),
    obj(tx(8), ty(2), 'pastry-case', 28, 18),
    obj(tx(10), ty(2), 'bread-basket', 16, 14), obj(tx(12), ty(2), 'bread-basket', 16, 14),
    obj(tx(14), ty(2), 'bread-basket', 16, 14),

    // Shelves on walls
    obj(tx(1), ty(6), 'bookshelf', 28, 28), obj(tx(1), ty(8), 'bookshelf', 28, 28),
    obj(tx(15), ty(6), 'bookshelf', 28, 28), obj(tx(15), ty(8), 'bookshelf', 28, 28),

    // Seating area (center)
    obj(tx(5), ty(8), 'cafe-table', 24, 16),
    obj(tx(4), ty(8), 'cafe-chair', 20, 18), obj(tx(6), ty(8), 'cafe-chair', 20, 18),
    decor(tx(5), ty(7), 'candle'),
    obj(tx(11), ty(8), 'cafe-table', 24, 16),
    obj(tx(10), ty(8), 'cafe-chair', 20, 18), obj(tx(12), ty(8), 'cafe-chair', 20, 18),
    decor(tx(11), ty(7), 'candle'),

    obj(tx(5), ty(12), 'cafe-table', 24, 16),
    obj(tx(4), ty(12), 'cafe-chair', 20, 18), obj(tx(6), ty(12), 'cafe-chair', 20, 18),
    obj(tx(11), ty(12), 'cafe-table', 24, 16),
    obj(tx(10), ty(12), 'cafe-chair', 20, 18), obj(tx(12), ty(12), 'cafe-chair', 20, 18),

    obj(tx(8), ty(15), 'cafe-table', 24, 16), obj(tx(9), ty(15), 'cafe-table', 24, 16),
    obj(tx(7), ty(15), 'cafe-chair', 20, 18), obj(tx(10), ty(15), 'cafe-chair', 20, 18),

    // Decoration
    decor(tx(1), ty(3), 'window-indoor'), decor(tx(15), ty(3), 'window-indoor'),
    decor(tx(1), ty(12), 'window-indoor'), decor(tx(15), ty(12), 'window-indoor'),
    obj(tx(2), ty(18), 'pot', 16, 20), obj(tx(14), ty(18), 'pot', 16, 20),
    decor(tx(8), ty(17), 'rug'),

    // ═══ Kitchen (cols 18-24) ═══
    obj(tx(20), ty(2), 'stove', 28, 20), obj(tx(22), ty(2), 'stove', 28, 20), obj(tx(24), ty(2), 'stove', 28, 20),
    obj(tx(20), ty(4), 'counter', 56, 20), obj(tx(22), ty(4), 'counter', 56, 20),
    obj(tx(24), ty(6), 'barrel', 20, 22), obj(tx(24), ty(8), 'barrel', 20, 22),
    obj(tx(20), ty(8), 'crate', 20, 20), obj(tx(22), ty(8), 'crate', 20, 20),
    obj(tx(20), ty(10), 'bread-basket', 16, 14), obj(tx(22), ty(10), 'bread-basket', 16, 14),
    obj(tx(24), ty(10), 'bread-basket', 16, 14),
    obj(tx(20), ty(14), 'barrel', 20, 22), obj(tx(22), ty(14), 'crate', 20, 20),
    obj(tx(24), ty(14), 'barrel', 20, 22),
    obj(tx(19), ty(18), 'pot', 16, 20), obj(tx(24), ty(18), 'pot', 16, 20),
  ],
  buildings: [],
  npcs: [{
    id: 'baker', x: tx(7), y: ty(4), spriteKey: 'npc-white',
    anchor: { x: 0.5, y: 1.0 }, sortY: ty(4),
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name: 'Baker', dialogue: ['Welcome! Everything is baked fresh today.', 'Try the croissants!', 'Once we get real assets, they\'ll look delicious.'],
  }],
  triggers: [{ id: 'bakery-exit', x: 12 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'bakery-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(12), y: ty(18), facing: 'up' }],
};
