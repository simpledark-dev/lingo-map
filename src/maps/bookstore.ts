import { MapData, TileType, Entity } from '../core/types';

const W = 16;
const H = 14;
const F = TileType.FLOOR;
const WL = TileType.WALL;
const T = 32;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) {
        if (row === H - 1 && (col === 7 || col === 8)) r.push(F);
        else r.push(WL);
      } else r.push(F);
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
    // Bookshelves lining walls
    obj(tx(1), ty(2), 'bookshelf', 28, 28), obj(tx(1), ty(4), 'bookshelf', 28, 28),
    obj(tx(1), ty(6), 'bookshelf', 28, 28), obj(tx(1), ty(8), 'bookshelf', 28, 28),
    obj(tx(14), ty(2), 'bookshelf', 28, 28), obj(tx(14), ty(4), 'bookshelf', 28, 28),
    obj(tx(14), ty(6), 'bookshelf', 28, 28), obj(tx(14), ty(8), 'bookshelf', 28, 28),
    // Shelves along north wall
    obj(tx(4), ty(1), 'bookshelf', 28, 28), obj(tx(6), ty(1), 'bookshelf', 28, 28),
    obj(tx(9), ty(1), 'bookshelf', 28, 28), obj(tx(11), ty(1), 'bookshelf', 28, 28),
    // Center display table
    obj(tx(7), ty(5), 'furniture', 24, 16), obj(tx(8), ty(5), 'furniture', 24, 16),
    // Reading nook — lower left
    obj(tx(4), ty(9), 'sofa', 40, 18),
    obj(tx(4), ty(8), 'furniture', 24, 16),
    decor(tx(4), ty(7), 'candle'),
    // Checkout counter
    obj(tx(10), ty(10), 'counter', 56, 20),
    obj(tx(12), ty(10), 'counter', 56, 20),
    // Decor
    decor(tx(1), ty(10), 'rug'), decor(tx(7), ty(10), 'rug'),
    decor(tx(1), ty(1), 'window-indoor'), decor(tx(14), ty(1), 'window-indoor'),
    obj(tx(3), ty(12), 'pot', 16, 20), obj(tx(12), ty(12), 'pot', 16, 20),
  ],
  buildings: [],
  npcs: [{
    id: 'bookseller', x: tx(11), y: ty(11), spriteKey: 'npc',
    anchor: { x: 0.5, y: 1.0 }, sortY: ty(11),
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name: 'Bookseller',
    dialogue: ['Welcome to the bookstore!', 'We have stories from every corner of the world.', 'Feel free to browse — the reading nook is cozy.'],
  }],
  triggers: [{ id: 'bookstore-exit', x: 7 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'bookstore-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(7), y: ty(12), facing: 'up' }],
};
