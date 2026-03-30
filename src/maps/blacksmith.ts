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
      // Forge partition — col 9, doorway rows 4-5
      else if (col === 9 && !(row === 4 || row === 5)) r.push(WL);
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
    // ═══ Shop front (cols 1-8) ═══
    // Display — weapons racks
    obj(tx(1), ty(2), 'weapons-rack', 24, 28),
    obj(tx(1), ty(5), 'weapons-rack', 24, 28),
    obj(tx(1), ty(8), 'weapons-rack', 24, 28),
    // Sales counter
    obj(tx(5), ty(4), 'counter', 56, 20),
    obj(tx(7), ty(4), 'counter', 56, 20),
    // Crates of supplies
    obj(tx(8), ty(1), 'crate', 20, 20),
    obj(tx(7), ty(1), 'crate', 20, 20),
    // Barrels
    obj(tx(8), ty(8), 'barrel', 20, 22),
    obj(tx(8), ty(10), 'barrel', 20, 22),
    // Decor
    decor(tx(4), ty(1), 'window-indoor'),
    obj(tx(2), ty(10), 'pot', 16, 20),
    decor(tx(5), ty(8), 'rug'),

    // ═══ Forge room (cols 10-12) ═══
    obj(tx(11), ty(1), 'forge', 28, 20),
    obj(tx(11), ty(3), 'anvil', 20, 16),
    // Water barrel for quenching
    obj(tx(12), ty(5), 'barrel', 20, 22),
    // Materials
    obj(tx(10), ty(7), 'crate', 20, 20),
    obj(tx(12), ty(7), 'crate', 20, 20),
    obj(tx(10), ty(9), 'crate', 20, 20),
    obj(tx(12), ty(9), 'crate', 20, 20),
    // Weapons rack in forge
    obj(tx(10), ty(1), 'weapons-rack', 24, 28),
  ],
  buildings: [],
  npcs: [{
    id: 'blacksmith-npc', x: tx(6), y: ty(5), spriteKey: 'npc',
    anchor: { x: 0.5, y: 1.0 }, sortY: ty(5),
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name: 'Blacksmith',
    dialogue: ['Need a blade sharpened?', 'My forge runs day and night.', 'The finest steel in the village — placeholder steel, but still.'],
  }],
  triggers: [{ id: 'blacksmith-exit', x: 6 * T, y: (H - 1) * T, width: 64, height: 16, type: 'door', targetMapId: 'outdoor', targetSpawnId: 'blacksmith-exit' }],
  spawnPoints: [{ id: 'entrance', x: tx(6), y: ty(10), facing: 'up' }],
};
