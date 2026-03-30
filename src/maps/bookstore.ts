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
      // Back storage room — row 6, doorway cols 12-13
      else if (row === 6 && !(col === 12 || col === 13)) r.push(WL);
      else r.push(F);
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, k: string, w: number, h: number): Entity {
  return { id: `bk-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h } };
}
function decor(x: number, y: number, k: string): Entity {
  return { id: `bk-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function tx(c: number) { return c * T + T / 2; }
function ty(r: number) { return (r + 1) * T; }

export const bookstoreMap: MapData = {
  id: 'bookstore', width: W, height: H, tileSize: T, tiles: makeTiles(),
  objects: [
    // ═══ Back storage (rows 1-5) ═══
    obj(tx(2), ty(1), 'bookshelf', 28, 28), obj(tx(4), ty(1), 'bookshelf', 28, 28),
    obj(tx(6), ty(1), 'bookshelf', 28, 28), obj(tx(8), ty(1), 'bookshelf', 28, 28),
    obj(tx(2), ty(4), 'crate', 20, 20), obj(tx(4), ty(4), 'crate', 20, 20),
    obj(tx(6), ty(4), 'crate', 20, 20),
    // Right side storage
    obj(tx(18), ty(1), 'bookshelf', 28, 28), obj(tx(20), ty(1), 'bookshelf', 28, 28),
    obj(tx(22), ty(1), 'bookshelf', 28, 28), obj(tx(24), ty(1), 'bookshelf', 28, 28),
    obj(tx(18), ty(4), 'crate', 20, 20), obj(tx(20), ty(4), 'crate', 20, 20),
    decor(tx(12), ty(1), 'window-indoor'),

    // ═══ Main shop floor (rows 7-18) ═══
    // Bookshelves lining walls
    obj(tx(1), ty(8), 'bookshelf', 28, 28), obj(tx(1), ty(10), 'bookshelf', 28, 28),
    obj(tx(1), ty(12), 'bookshelf', 28, 28), obj(tx(1), ty(14), 'bookshelf', 28, 28),
    obj(tx(24), ty(8), 'bookshelf', 28, 28), obj(tx(24), ty(10), 'bookshelf', 28, 28),
    obj(tx(24), ty(12), 'bookshelf', 28, 28), obj(tx(24), ty(14), 'bookshelf', 28, 28),

    // Center aisle shelves (freestanding)
    obj(tx(8), ty(9), 'bookshelf', 28, 28), obj(tx(8), ty(11), 'bookshelf', 28, 28),
    obj(tx(8), ty(13), 'bookshelf', 28, 28),
    obj(tx(17), ty(9), 'bookshelf', 28, 28), obj(tx(17), ty(11), 'bookshelf', 28, 28),
    obj(tx(17), ty(13), 'bookshelf', 28, 28),

    // Display table (center)
    obj(tx(12), ty(10), 'furniture', 24, 16), obj(tx(13), ty(10), 'furniture', 24, 16),
    decor(tx(12), ty(9), 'candle'),

    // Reading nook (lower left) — sofas + table
    obj(tx(3), ty(16), 'sofa', 40, 18),
    obj(tx(3), ty(14), 'cafe-table', 24, 16),
    obj(tx(5), ty(14), 'cafe-chair', 20, 18),
    decor(tx(3), ty(13), 'candle'),
    decor(tx(2), ty(16), 'rug'),

    // Reading nook (lower right)
    obj(tx(22), ty(16), 'sofa', 40, 18),
    obj(tx(22), ty(14), 'cafe-table', 24, 16),
    obj(tx(20), ty(14), 'cafe-chair', 20, 18),
    decor(tx(22), ty(13), 'candle'),
    decor(tx(22), ty(16), 'rug'),

    // Checkout counter
    obj(tx(12), ty(16), 'counter', 56, 20), obj(tx(14), ty(16), 'counter', 56, 20),

    // Decoration
    decor(tx(1), ty(16), 'window-indoor'), decor(tx(24), ty(16), 'window-indoor'),
    obj(tx(6), ty(18), 'pot', 16, 20), obj(tx(19), ty(18), 'pot', 16, 20),
    decor(tx(12), ty(18), 'rug'),
  ],
  buildings: [],
  npcs: [{
    id: 'bookseller', x: tx(13), y: ty(17), spriteKey: 'npc-purple',
    anchor: { x: 0.5, y: 1.0 }, sortY: ty(17),
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name: 'Bookseller', dialogue: ['Welcome to the bookstore!', 'We have stories from every corner of the world.', 'The reading nooks are cozy — make yourself at home.'],
  }],
  triggers: [{ id: 'bookstore-exit', x: 12 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'bookstore-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(12), y: ty(18), facing: 'up' }],
};
