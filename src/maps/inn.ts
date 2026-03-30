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
      // Upper floor partition — row 8, doorway cols 13-14
      else if (row === 8 && !(col === 13 || col === 14)) r.push(WL);
      // Room dividers upstairs — col 14, rows 1-7, doorway rows 4-5
      else if (col === 14 && row < 8 && !(row === 4 || row === 5)) r.push(WL);
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
    // ═══ Room 1 — left guest room (cols 1-13, rows 1-7) ═══
    obj(tx(2), ty(2), 'inn-bed', 28, 48), obj(tx(5), ty(2), 'inn-bed', 28, 48),
    obj(tx(8), ty(2), 'inn-bed', 28, 48), obj(tx(11), ty(2), 'inn-bed', 28, 48),
    obj(tx(3), ty(1), 'furniture', 24, 16), obj(tx(7), ty(1), 'furniture', 24, 16),
    obj(tx(10), ty(1), 'furniture', 24, 16),
    decor(tx(3), ty(0), 'candle'), decor(tx(7), ty(0), 'candle'), decor(tx(10), ty(0), 'candle'),
    obj(tx(1), ty(6), 'crate', 20, 20), obj(tx(13), ty(6), 'crate', 20, 20),
    decor(tx(6), ty(6), 'rug'), decor(tx(1), ty(3), 'window-indoor'),

    // ═══ Room 2 — right guest room (cols 15-26, rows 1-7) ═══
    obj(tx(16), ty(2), 'inn-bed', 28, 48), obj(tx(19), ty(2), 'inn-bed', 28, 48),
    obj(tx(22), ty(2), 'inn-bed', 28, 48), obj(tx(25), ty(2), 'inn-bed', 28, 48),
    obj(tx(17), ty(1), 'furniture', 24, 16), obj(tx(21), ty(1), 'furniture', 24, 16),
    obj(tx(24), ty(1), 'furniture', 24, 16),
    decor(tx(17), ty(0), 'candle'), decor(tx(21), ty(0), 'candle'), decor(tx(24), ty(0), 'candle'),
    obj(tx(15), ty(6), 'crate', 20, 20), obj(tx(26), ty(6), 'crate', 20, 20),
    decor(tx(20), ty(6), 'rug'), decor(tx(26), ty(3), 'window-indoor'),

    // ═══ Tavern / common area (rows 9-20) ═══
    // Bar counter (north wall of tavern)
    obj(tx(3), ty(10), 'counter', 56, 20), obj(tx(5), ty(10), 'counter', 56, 20),
    obj(tx(7), ty(10), 'counter', 56, 20), obj(tx(9), ty(10), 'counter', 56, 20),
    // Barrels behind bar
    obj(tx(2), ty(9), 'barrel', 20, 22), obj(tx(4), ty(9), 'barrel', 20, 22),
    obj(tx(6), ty(9), 'barrel', 20, 22), obj(tx(8), ty(9), 'barrel', 20, 22),

    // Tavern tables — left group
    obj(tx(4), ty(13), 'furniture', 24, 16), obj(tx(5), ty(13), 'furniture', 24, 16),
    obj(tx(3), ty(13), 'chair', 20, 18), obj(tx(6), ty(13), 'chair', 20, 18),
    obj(tx(4), ty(14), 'chair', 20, 18), obj(tx(5), ty(14), 'chair', 20, 18),
    decor(tx(4), ty(12), 'candle'),

    // Tavern tables — center group
    obj(tx(12), ty(13), 'furniture', 24, 16), obj(tx(13), ty(13), 'furniture', 24, 16),
    obj(tx(11), ty(13), 'chair', 20, 18), obj(tx(14), ty(13), 'chair', 20, 18),
    obj(tx(12), ty(14), 'chair', 20, 18), obj(tx(13), ty(14), 'chair', 20, 18),
    decor(tx(12), ty(12), 'candle'),

    // Tavern tables — right group
    obj(tx(20), ty(13), 'furniture', 24, 16),
    obj(tx(19), ty(13), 'chair', 20, 18), obj(tx(21), ty(13), 'chair', 20, 18),

    // Small tables near walls
    obj(tx(20), ty(16), 'furniture', 24, 16),
    obj(tx(19), ty(16), 'chair', 20, 18), obj(tx(21), ty(16), 'chair', 20, 18),
    obj(tx(4), ty(17), 'furniture', 24, 16),
    obj(tx(3), ty(17), 'chair', 20, 18), obj(tx(5), ty(17), 'chair', 20, 18),

    // Fireplace (east wall)
    obj(tx(26), ty(13), 'fireplace', 40, 32),
    decor(tx(26), ty(15), 'rug'),

    // Decoration
    decor(tx(1), ty(12), 'window-indoor'), decor(tx(1), ty(16), 'window-indoor'),
    decor(tx(26), ty(10), 'window-indoor'), decor(tx(26), ty(17), 'window-indoor'),
    obj(tx(1), ty(19), 'pot', 16, 20), obj(tx(26), ty(19), 'pot', 16, 20),
    decor(tx(10), ty(18), 'rug'), decor(tx(18), ty(18), 'rug'),
  ],
  buildings: [],
  npcs: [
    { id: 'innkeeper', x: tx(6), y: ty(11), spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: ty(11), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Innkeeper', dialogue: ['Welcome to the inn!', 'Rooms are upstairs. Drinks down here.', 'We have eight beds — pick any you like.'] },
    { id: 'traveler-inn', x: tx(16), y: ty(14), spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: ty(14), collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name: 'Weary Traveler', dialogue: ['*yawn* Long journey...', 'The beds are comfortable.', 'And the ale isn\'t bad either.'] },
  ],
  triggers: [{ id: 'inn-exit', x: 13 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'inn-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(13), y: ty(20), facing: 'up' }],
};
