import { MapData, TileType, Entity } from '../core/types';

const W = 28;
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
        if (row === H - 1 && (col === 13 || col === 14)) r.push(F);
        else r.push(WL);
      }
      // Storage room partition — col 22, doorway rows 8-9
      else if (col === 22 && !(row === 8 || row === 9)) r.push(WL);
      else r.push(F);
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
    // ═══ Main market floor (cols 1-21) ═══
    // Stall row 1 (north)
    obj(tx(4), ty(3), 'market-stall', 40, 20), obj(tx(8), ty(3), 'market-stall', 40, 20),
    obj(tx(12), ty(3), 'market-stall', 40, 20), obj(tx(16), ty(3), 'market-stall', 40, 20),
    obj(tx(6), ty(2), 'bread-basket', 16, 14), obj(tx(14), ty(2), 'bread-basket', 16, 14),

    // Stall row 2 (center)
    obj(tx(4), ty(8), 'market-stall', 40, 20), obj(tx(8), ty(8), 'market-stall', 40, 20),
    obj(tx(12), ty(8), 'market-stall', 40, 20), obj(tx(16), ty(8), 'market-stall', 40, 20),
    obj(tx(6), ty(7), 'bread-basket', 16, 14), obj(tx(10), ty(7), 'bread-basket', 16, 14),

    // Stall row 3 (south)
    obj(tx(4), ty(13), 'market-stall', 40, 20), obj(tx(8), ty(13), 'market-stall', 40, 20),
    obj(tx(12), ty(13), 'market-stall', 40, 20), obj(tx(16), ty(13), 'market-stall', 40, 20),
    obj(tx(14), ty(12), 'bread-basket', 16, 14),

    // Wall barrels
    obj(tx(1), ty(3), 'barrel', 20, 22), obj(tx(1), ty(5), 'barrel', 20, 22),
    obj(tx(1), ty(8), 'barrel', 20, 22),
    obj(tx(20), ty(3), 'barrel', 20, 22), obj(tx(20), ty(5), 'barrel', 20, 22),
    obj(tx(20), ty(8), 'barrel', 20, 22),

    // Crates along walls
    obj(tx(1), ty(12), 'crate', 20, 20), obj(tx(1), ty(14), 'crate', 20, 20),
    obj(tx(20), ty(12), 'crate', 20, 20), obj(tx(20), ty(14), 'crate', 20, 20),

    // Entrance area
    obj(tx(8), ty(17), 'pot', 16, 20), obj(tx(18), ty(17), 'pot', 16, 20),

    // Decoration
    decor(tx(1), ty(1), 'window-indoor'), decor(tx(20), ty(1), 'window-indoor'),
    decor(tx(1), ty(10), 'window-indoor'), decor(tx(20), ty(10), 'window-indoor'),
    decor(tx(10), ty(16), 'rug'), decor(tx(16), ty(16), 'rug'),

    // ═══ Storage room (cols 23-26) ═══
    obj(tx(24), ty(2), 'crate', 20, 20), obj(tx(26), ty(2), 'crate', 20, 20),
    obj(tx(24), ty(4), 'crate', 20, 20), obj(tx(26), ty(4), 'crate', 20, 20),
    obj(tx(24), ty(6), 'barrel', 20, 22), obj(tx(26), ty(6), 'barrel', 20, 22),
    obj(tx(24), ty(10), 'barrel', 20, 22), obj(tx(26), ty(10), 'barrel', 20, 22),
    obj(tx(24), ty(12), 'crate', 20, 20), obj(tx(26), ty(12), 'crate', 20, 20),
    obj(tx(24), ty(14), 'bread-basket', 16, 14), obj(tx(26), ty(14), 'bread-basket', 16, 14),
    obj(tx(24), ty(16), 'pot', 16, 20), obj(tx(26), ty(16), 'pot', 16, 20),
  ],
  buildings: [],
  npcs: [
    { id: 'merchant-1', x: tx(6), y: ty(5), spriteKey: 'npc-yellow', anchor: { x: 0.5, y: 1.0 }, sortY: ty(5), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Fruit Seller', dialogue: ['Fresh fruit!', 'The apples are especially rectangular today.'] },
    { id: 'merchant-2', x: tx(14), y: ty(5), spriteKey: 'npc-orange', anchor: { x: 0.5, y: 1.0 }, sortY: ty(5), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Spice Trader', dialogue: ['Spices from far-off lands!', 'They\'ll add flavor to any placeholder meal.'] },
  ],
  triggers: [{ id: 'market-exit', x: 13 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'market-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(13), y: ty(18), facing: 'up' }],
};
