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
      // Back room partition — row 6, doorway cols 12-13
      else if (row === 6 && !(col === 12 || col === 13)) r.push(WL);
      else r.push(F);
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, k: string, w: number, h: number): Entity {
  return { id: `cafe-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h } };
}
function decor(x: number, y: number, k: string): Entity {
  return { id: `cafe-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function tx(c: number) { return c * T + T / 2; }
function ty(r: number) { return (r + 1) * T; }

export const cafeMap: MapData = {
  id: 'cafe', width: W, height: H, tileSize: T, tiles: makeTiles(),
  objects: [
    // ═══ Back room — storage & prep (rows 1-5) ═══
    obj(tx(2), ty(1), 'coffee-machine', 20, 20),
    obj(tx(4), ty(1), 'coffee-machine', 20, 20),
    obj(tx(6), ty(1), 'coffee-machine', 20, 20),
    obj(tx(2), ty(3), 'counter', 56, 20),
    obj(tx(4), ty(3), 'counter', 56, 20),
    obj(tx(8), ty(1), 'crate', 20, 20), obj(tx(10), ty(1), 'crate', 20, 20),
    obj(tx(8), ty(3), 'barrel', 20, 22), obj(tx(10), ty(3), 'barrel', 20, 22),
    // Right side storage
    obj(tx(18), ty(1), 'crate', 20, 20), obj(tx(20), ty(1), 'crate', 20, 20),
    obj(tx(22), ty(1), 'crate', 20, 20), obj(tx(24), ty(1), 'barrel', 20, 22),
    obj(tx(18), ty(3), 'pastry-case', 28, 18),
    obj(tx(20), ty(3), 'pastry-case', 28, 18),
    decor(tx(14), ty(1), 'window-indoor'),

    // ═══ Main cafe floor (rows 7-18) ═══
    // Service counter along north wall (just below partition)
    obj(tx(3), ty(8), 'counter', 56, 20),
    obj(tx(5), ty(8), 'counter', 56, 20),
    obj(tx(7), ty(8), 'counter', 56, 20),
    obj(tx(9), ty(8), 'counter', 56, 20),
    obj(tx(4), ty(7), 'pastry-case', 28, 18),
    obj(tx(8), ty(7), 'menu-board', 24, 28),

    // Seating — left side (small round tables)
    obj(tx(3), ty(11), 'cafe-table', 24, 16),
    obj(tx(2), ty(11), 'cafe-chair', 20, 18), obj(tx(4), ty(11), 'cafe-chair', 20, 18),
    decor(tx(3), ty(10), 'coffee-cup'),
    obj(tx(3), ty(14), 'cafe-table', 24, 16),
    obj(tx(2), ty(14), 'cafe-chair', 20, 18), obj(tx(4), ty(14), 'cafe-chair', 20, 18),
    decor(tx(3), ty(13), 'coffee-cup'),
    obj(tx(3), ty(17), 'cafe-table', 24, 16),
    obj(tx(2), ty(17), 'cafe-chair', 20, 18), obj(tx(4), ty(17), 'cafe-chair', 20, 18),

    // Seating — center (larger tables)
    obj(tx(10), ty(11), 'cafe-table', 24, 16), obj(tx(11), ty(11), 'cafe-table', 24, 16),
    obj(tx(9), ty(11), 'cafe-chair', 20, 18), obj(tx(12), ty(11), 'cafe-chair', 20, 18),
    decor(tx(10), ty(10), 'coffee-cup'), decor(tx(11), ty(10), 'coffee-cup'),
    obj(tx(10), ty(14), 'cafe-table', 24, 16), obj(tx(11), ty(14), 'cafe-table', 24, 16),
    obj(tx(9), ty(14), 'cafe-chair', 20, 18), obj(tx(12), ty(14), 'cafe-chair', 20, 18),

    // Seating — right side
    obj(tx(18), ty(11), 'cafe-table', 24, 16),
    obj(tx(17), ty(11), 'cafe-chair', 20, 18), obj(tx(19), ty(11), 'cafe-chair', 20, 18),
    decor(tx(18), ty(10), 'coffee-cup'),
    obj(tx(18), ty(14), 'cafe-table', 24, 16),
    obj(tx(17), ty(14), 'cafe-chair', 20, 18), obj(tx(19), ty(14), 'cafe-chair', 20, 18),

    // Cozy corner — sofas (lower right)
    obj(tx(22), ty(11), 'sofa', 40, 18),
    obj(tx(22), ty(14), 'sofa', 40, 18),
    obj(tx(22), ty(12), 'cafe-table', 24, 16),
    decor(tx(22), ty(11), 'coffee-cup'),

    // Decoration
    decor(tx(1), ty(10), 'window-indoor'), decor(tx(1), ty(14), 'window-indoor'),
    decor(tx(24), ty(10), 'window-indoor'), decor(tx(24), ty(14), 'window-indoor'),
    obj(tx(1), ty(18), 'pot', 16, 20), obj(tx(24), ty(18), 'pot', 16, 20),
    decor(tx(10), ty(17), 'rug'), decor(tx(18), ty(17), 'rug'),
    decor(tx(6), ty(8), 'candle'), decor(tx(10), ty(13), 'candle'),
  ],
  buildings: [],
  npcs: [{
    id: 'barista', x: tx(6), y: ty(9), spriteKey: 'npc-green',
    anchor: { x: 0.5, y: 1.0 }, sortY: ty(9),
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name: 'Barista', dialogue: ['Welcome to the cafe!', 'We have the best coffee in the village.', 'Try our pastries — freshly baked!'],
  }],
  triggers: [{ id: 'cafe-exit', x: 12 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'cafe-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(12), y: ty(18), facing: 'up' }],
};
