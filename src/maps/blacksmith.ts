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
      // Forge partition — col 17, doorway rows 8-9
      else if (col === 17 && !(row === 8 || row === 9)) r.push(WL);
      else r.push(F);
    }
    tiles.push(r);
  }
  return tiles;
}

let id = 0;
function obj(x: number, y: number, k: string, w: number, h: number): Entity {
  return { id: `bs-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h } };
}
function decor(x: number, y: number, k: string): Entity {
  return { id: `bs-${++id}`, x, y, spriteKey: k, anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function tx(c: number) { return c * T + T / 2; }
function ty(r: number) { return (r + 1) * T; }

export const blacksmithMap: MapData = {
  id: 'blacksmith', width: W, height: H, tileSize: T, tiles: makeTiles(),
  objects: [
    // ═══ Shop front (cols 1-16) ═══
    // Weapons racks along west wall
    obj(tx(1), ty(2), 'weapons-rack', 24, 28), obj(tx(1), ty(5), 'weapons-rack', 24, 28),
    obj(tx(1), ty(8), 'weapons-rack', 24, 28), obj(tx(1), ty(11), 'weapons-rack', 24, 28),

    // Sales counter (center)
    obj(tx(6), ty(5), 'counter', 56, 20), obj(tx(8), ty(5), 'counter', 56, 20),
    obj(tx(10), ty(5), 'counter', 56, 20), obj(tx(12), ty(5), 'counter', 56, 20),

    // Display weapons on counter
    obj(tx(7), ty(4), 'weapons-rack', 24, 28),
    obj(tx(11), ty(4), 'weapons-rack', 24, 28),

    // Storage — south side
    obj(tx(15), ty(2), 'crate', 20, 20), obj(tx(15), ty(4), 'crate', 20, 20),
    obj(tx(15), ty(6), 'barrel', 20, 22),

    // Shelves east wall (of shop)
    obj(tx(15), ty(10), 'bookshelf', 28, 28), obj(tx(15), ty(12), 'bookshelf', 28, 28),

    // More crates and barrels
    obj(tx(1), ty(14), 'barrel', 20, 22), obj(tx(1), ty(16), 'barrel', 20, 22),
    obj(tx(3), ty(16), 'crate', 20, 20),
    obj(tx(15), ty(16), 'barrel', 20, 22), obj(tx(15), ty(14), 'crate', 20, 20),

    // Display area — south
    obj(tx(8), ty(10), 'weapons-rack', 24, 28),
    obj(tx(12), ty(10), 'weapons-rack', 24, 28),

    // Decoration
    decor(tx(6), ty(1), 'window-indoor'), decor(tx(12), ty(1), 'window-indoor'),
    decor(tx(6), ty(12), 'window-indoor'), decor(tx(12), ty(12), 'window-indoor'),
    obj(tx(6), ty(18), 'pot', 16, 20), obj(tx(14), ty(18), 'pot', 16, 20),
    decor(tx(10), ty(17), 'rug'),

    // ═══ Forge room (cols 18-24) ═══
    // Forges
    obj(tx(20), ty(2), 'forge', 28, 20), obj(tx(22), ty(2), 'forge', 28, 20),
    // Anvils
    obj(tx(20), ty(5), 'anvil', 20, 16), obj(tx(23), ty(5), 'anvil', 20, 16),
    // Water barrels (quenching)
    obj(tx(24), ty(8), 'barrel', 20, 22), obj(tx(24), ty(10), 'barrel', 20, 22),
    // Material crates
    obj(tx(19), ty(10), 'crate', 20, 20), obj(tx(21), ty(10), 'crate', 20, 20),
    obj(tx(19), ty(12), 'crate', 20, 20), obj(tx(21), ty(12), 'crate', 20, 20),
    obj(tx(23), ty(12), 'crate', 20, 20),
    // Weapons in progress
    obj(tx(19), ty(7), 'weapons-rack', 24, 28),
    // More storage
    obj(tx(19), ty(16), 'barrel', 20, 22), obj(tx(21), ty(16), 'barrel', 20, 22),
    obj(tx(23), ty(16), 'crate', 20, 20), obj(tx(24), ty(14), 'crate', 20, 20),
    obj(tx(19), ty(14), 'pot', 16, 20),
  ],
  buildings: [],
  npcs: [{
    id: 'blacksmith-npc', x: tx(9), y: ty(6), spriteKey: 'npc-brown',
    anchor: { x: 0.5, y: 1.0 }, sortY: ty(6),
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name: 'Blacksmith', dialogue: ['Need a blade sharpened?', 'My forge runs day and night.', 'Finest steel in the village.'],
  }],
  triggers: [{ id: 'blacksmith-exit', x: 12 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'blacksmith-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(12), y: ty(18), facing: 'up' }],
};
