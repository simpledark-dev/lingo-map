import { MapData, TileType } from '../core/types';

const W = 10;
const H = 8;
const F = TileType.FLOOR;
const WL = TileType.WALL;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      // Walls around perimeter
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) {
        // Leave a gap at the bottom center for the exit door
        if (row === H - 1 && (col === 4 || col === 5)) {
          r.push(F);
        } else {
          r.push(WL);
        }
      } else {
        r.push(F);
      }
    }
    tiles.push(r);
  }
  return tiles;
}

export const indoorMap: MapData = {
  id: 'indoor',
  width: W,
  height: H,
  tileSize: 32,
  tiles: makeTiles(),

  objects: [
    // Table
    {
      id: 'furniture-1',
      x: 96,
      y: 128,
      spriteKey: 'furniture',
      anchor: { x: 0.5, y: 1.0 },
      sortY: 128,
      collisionBox: { offsetX: -14, offsetY: -16, width: 28, height: 16 },
    },
    // Another piece of furniture
    {
      id: 'furniture-2',
      x: 224,
      y: 96,
      spriteKey: 'furniture',
      anchor: { x: 0.5, y: 1.0 },
      sortY: 96,
      collisionBox: { offsetX: -14, offsetY: -16, width: 28, height: 16 },
    },
  ],

  buildings: [],

  npcs: [],

  triggers: [
    {
      id: 'indoor-exit',
      x: 128, // tile col 4 * 32
      y: 224, // tile row 7 * 32
      width: 64,
      height: 16,
      type: 'door',
      targetMapId: 'outdoor',
      targetSpawnId: 'house-exit',
    },
  ],

  spawnPoints: [
    { id: 'entrance', x: 160, y: 208, facing: 'up' },
  ],
};
