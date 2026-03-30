import { MapData, TileType, Entity } from '../core/types';

const W = 20;
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
        if (row === H - 1 && (col === 9 || col === 10)) r.push(F);
        else r.push(WL);
      } else r.push(F);
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, k: string, w: number, h: number): Entity {
  return { id: `mk-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h } };
}
function decor(x: number, y: number, k: string): Entity {
  return { id: `mk-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function tx(c: number) { return c * T + T / 2; }
function ty(r: number) { return (r + 1) * T; }

export const marketMap: MapData = {
  id: 'market', width: W, height: H, tileSize: T, tiles: makeTiles(),
  objects: [
    // Market stalls — row 1
    obj(tx(3), ty(3), 'market-stall', 40, 20),
    obj(tx(7), ty(3), 'market-stall', 40, 20),
    obj(tx(13), ty(3), 'market-stall', 40, 20),
    obj(tx(17), ty(3), 'market-stall', 40, 20),
    // Market stalls — row 2
    obj(tx(3), ty(7), 'market-stall', 40, 20),
    obj(tx(7), ty(7), 'market-stall', 40, 20),
    obj(tx(13), ty(7), 'market-stall', 40, 20),
    obj(tx(17), ty(7), 'market-stall', 40, 20),
    // Crates & barrels — storage back wall
    obj(tx(2), ty(1), 'crate', 20, 20), obj(tx(4), ty(1), 'crate', 20, 20),
    obj(tx(16), ty(1), 'barrel', 20, 22), obj(tx(18), ty(1), 'barrel', 20, 22),
    // Bread baskets on stalls
    obj(tx(10), ty(3), 'bread-basket', 16, 14),
    obj(tx(10), ty(7), 'bread-basket', 16, 14),
    // Scattered crates
    obj(tx(1), ty(5), 'crate', 20, 20), obj(tx(18), ty(5), 'crate', 20, 20),
    obj(tx(1), ty(10), 'barrel', 20, 22), obj(tx(18), ty(10), 'barrel', 20, 22),
    // Pots
    obj(tx(1), ty(12), 'pot', 16, 20), obj(tx(18), ty(12), 'pot', 16, 20),
    // Decor
    decor(tx(1), ty(3), 'window-indoor'), decor(tx(18), ty(3), 'window-indoor'),
    decor(tx(1), ty(7), 'window-indoor'), decor(tx(18), ty(7), 'window-indoor'),
    decor(tx(10), ty(11), 'rug'),
  ],
  buildings: [],
  npcs: [
    { id: 'merchant-1', x: tx(5), y: ty(4), spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: ty(4), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Fruit Seller', dialogue: ['Fresh fruit! Well, fresh placeholders.', 'The apples are especially... rectangular today.'] },
    { id: 'merchant-2', x: tx(15), y: ty(4), spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: ty(4), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Spice Trader', dialogue: ['Spices from far-off lands!', 'They\'ll add flavor to any placeholder meal.'] },
  ],
  triggers: [{ id: 'market-exit', x: 9 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'market-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(9), y: ty(12), facing: 'up' }],
};
