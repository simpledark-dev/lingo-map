import { MapData, TileType, Entity } from '../core/types';

const W = 14;
const H = 12;
const F = TileType.FLOOR;
const WL = TileType.WALL;
const T = 32;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) {
        if (row === H - 1 && (col === 6 || col === 7)) r.push(F);
        else r.push(WL);
      }
      // Kitchen partition — col 9, doorway at rows 4-5
      else if (col === 9 && !(row === 4 || row === 5)) r.push(WL);
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
    // ── Shop front (cols 1-8) ──
    // Display counter
    obj(tx(3), ty(3), 'counter', 56, 20),
    obj(tx(5), ty(3), 'counter', 56, 20),
    // Pastry cases on counter
    obj(tx(3), ty(2), 'pastry-case', 28, 18),
    obj(tx(5), ty(2), 'pastry-case', 28, 18),
    // Bread baskets
    obj(tx(7), ty(3), 'bread-basket', 16, 14),
    obj(tx(2), ty(6), 'bread-basket', 16, 14),
    // Seating
    obj(tx(3), ty(7), 'cafe-table', 24, 16),
    obj(tx(2), ty(7), 'cafe-chair', 20, 18),
    obj(tx(4), ty(7), 'cafe-chair', 20, 18),
    obj(tx(7), ty(7), 'cafe-table', 24, 16),
    obj(tx(6), ty(7), 'cafe-chair', 20, 18),
    obj(tx(8), ty(7), 'cafe-chair', 20, 18),
    decor(tx(3), ty(6), 'candle'), decor(tx(7), ty(6), 'candle'),
    // Decor
    decor(tx(1), ty(4), 'window-indoor'), decor(tx(8), ty(4), 'window-indoor'),
    obj(tx(1), ty(10), 'pot', 16, 20), obj(tx(8), ty(10), 'pot', 16, 20),
    decor(tx(5), ty(9), 'rug'),

    // ── Kitchen (cols 10-12) ──
    obj(tx(12), ty(1), 'stove', 28, 20),
    obj(tx(12), ty(3), 'stove', 28, 20),
    obj(tx(10), ty(1), 'counter', 56, 20),
    obj(tx(10), ty(5), 'barrel', 20, 22),
    obj(tx(12), ty(5), 'crate', 20, 20),
    obj(tx(10), ty(8), 'bread-basket', 16, 14),
    obj(tx(12), ty(8), 'bread-basket', 16, 14),
    obj(tx(11), ty(10), 'barrel', 20, 22),
  ],
  buildings: [],
  npcs: [{
    id: 'baker', x: tx(4), y: ty(4), spriteKey: 'npc',
    anchor: { x: 0.5, y: 1.0 }, sortY: ty(4),
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name: 'Baker',
    dialogue: ['Welcome! Everything is baked fresh today.', 'Try the croissants — they\'re our specialty!', '...Once we get real assets, they\'ll look delicious.'],
  }],
  triggers: [{ id: 'bakery-exit', x: 6 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'bakery-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(6), y: ty(10), facing: 'up' }],
};
