import { MapData, TileType, Entity } from '../core/types';

const W = 22;
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
        if (row === H - 1 && (col === 10 || col === 11)) r.push(F);
        else r.push(WL);
      }
      // Upper floor partition — row 7, doorway cols 10-11
      else if (row === 7 && !(col === 10 || col === 11)) r.push(WL);
      // Room divider upstairs — col 11, rows 1-6, doorway rows 3-4
      else if (col === 11 && row < 7 && !(row === 3 || row === 4)) r.push(WL);
      else r.push(F);
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, k: string, w: number, h: number): Entity {
  return { id: `inn-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h } };
}
function decor(x: number, y: number, k: string): Entity {
  return { id: `inn-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function tx(c: number) { return c * T + T / 2; }
function ty(r: number) { return (r + 1) * T; }

export const innMap: MapData = {
  id: 'inn', width: W, height: H, tileSize: T, tiles: makeTiles(),
  objects: [
    // ═══ Room 1 (upper left, cols 1-10, rows 1-6) ═══
    obj(tx(2), ty(2), 'inn-bed', 28, 48),
    obj(tx(5), ty(2), 'inn-bed', 28, 48),
    obj(tx(8), ty(2), 'inn-bed', 28, 48),
    obj(tx(4), ty(1), 'furniture', 24, 16), // nightstand
    obj(tx(7), ty(1), 'furniture', 24, 16),
    decor(tx(4), ty(0), 'candle'), decor(tx(7), ty(0), 'candle'),
    obj(tx(1), ty(5), 'crate', 20, 20),
    obj(tx(10), ty(5), 'crate', 20, 20),
    decor(tx(5), ty(5), 'rug'),

    // ═══ Room 2 (upper right, cols 12-20, rows 1-6) ═══
    obj(tx(14), ty(2), 'inn-bed', 28, 48),
    obj(tx(17), ty(2), 'inn-bed', 28, 48),
    obj(tx(20), ty(2), 'inn-bed', 28, 48),
    obj(tx(16), ty(1), 'furniture', 24, 16),
    obj(tx(19), ty(1), 'furniture', 24, 16),
    decor(tx(16), ty(0), 'candle'), decor(tx(19), ty(0), 'candle'),
    obj(tx(12), ty(5), 'crate', 20, 20),
    decor(tx(17), ty(5), 'rug'),

    // ═══ Tavern / common area (lower, rows 8-16) ═══
    // Bar counter
    obj(tx(3), ty(9), 'counter', 56, 20),
    obj(tx(5), ty(9), 'counter', 56, 20),
    obj(tx(7), ty(9), 'counter', 56, 20),
    // Barrels behind bar
    obj(tx(2), ty(8), 'barrel', 20, 22), obj(tx(4), ty(8), 'barrel', 20, 22),
    obj(tx(6), ty(8), 'barrel', 20, 22),
    // Tavern tables
    obj(tx(4), ty(12), 'furniture', 24, 16), obj(tx(5), ty(12), 'furniture', 24, 16),
    obj(tx(3), ty(12), 'chair', 20, 18), obj(tx(6), ty(12), 'chair', 20, 18),
    obj(tx(4), ty(13), 'chair', 20, 18), obj(tx(5), ty(13), 'chair', 20, 18),
    obj(tx(12), ty(12), 'furniture', 24, 16), obj(tx(13), ty(12), 'furniture', 24, 16),
    obj(tx(11), ty(12), 'chair', 20, 18), obj(tx(14), ty(12), 'chair', 20, 18),
    obj(tx(18), ty(11), 'furniture', 24, 16),
    obj(tx(17), ty(11), 'chair', 20, 18), obj(tx(19), ty(11), 'chair', 20, 18),
    // Fireplace
    obj(tx(20), ty(10), 'fireplace', 40, 32),
    decor(tx(20), ty(12), 'rug'),
    // Decor
    decor(tx(4), ty(11), 'candle'), decor(tx(12), ty(11), 'candle'),
    decor(tx(1), ty(10), 'window-indoor'), decor(tx(1), ty(14), 'window-indoor'),
    decor(tx(20), ty(14), 'window-indoor'),
    obj(tx(1), ty(16), 'pot', 16, 20), obj(tx(20), ty(16), 'pot', 16, 20),
    // Entrance rug
    decor(tx(10), ty(16), 'rug'),
  ],
  buildings: [],
  npcs: [
    { id: 'innkeeper', x: tx(5), y: ty(10), spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: ty(10), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Innkeeper', dialogue: ['Welcome to the inn!', 'Rooms are upstairs. Drinks are down here.', 'We have three beds available — pick any one you like.'] },
    { id: 'traveler-inn', x: tx(15), y: ty(13), spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: ty(13), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Weary Traveler', dialogue: ['*yawn* Long journey...', 'The beds here are comfortable though.', 'And the ale isn\'t bad either.'] },
  ],
  triggers: [{ id: 'inn-exit', x: 10 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'inn-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(10), y: ty(16), facing: 'up' }],
};
