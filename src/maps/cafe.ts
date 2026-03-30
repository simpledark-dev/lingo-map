import { MapData, TileType, Entity } from '../core/types';

const W = 18;
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
        if (row === H - 1 && (col === 8 || col === 9)) {
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

let id = 0;
function obj(x: number, y: number, spriteKey: string, w: number, h: number): Entity {
  return {
    id: `cafe-${++id}`, x, y, spriteKey,
    anchor: { x: 0.5, y: 1.0 }, sortY: y,
    collisionBox: { offsetX: -Math.floor(w / 2), offsetY: -h, width: w, height: h },
  };
}
function decor(x: number, y: number, spriteKey: string): Entity {
  return {
    id: `cafe-${++id}`, x, y, spriteKey,
    anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000,
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
  };
}

function tx(col: number) { return col * T + T / 2; }
function ty(row: number) { return (row + 1) * T; }

export const cafeMap: MapData = {
  id: 'cafe',
  width: W,
  height: H,
  tileSize: T,
  tiles: makeTiles(),

  objects: [
    // ── Service counter along north wall ──
    obj(tx(4), ty(2), 'counter', 56, 20),
    obj(tx(6), ty(2), 'counter', 56, 20),
    obj(tx(8), ty(2), 'counter', 56, 20),

    // Coffee machines behind counter
    obj(tx(3), ty(1), 'coffee-machine', 20, 20),
    obj(tx(5), ty(1), 'coffee-machine', 20, 20),

    // Pastry display on counter
    obj(tx(9), ty(1), 'pastry-case', 28, 18),

    // Menu board on wall
    obj(tx(12), ty(1), 'menu-board', 24, 28),

    // ── Cafe seating — round tables with cafe chairs ──
    // Left side — 2 small tables
    obj(tx(3), ty(5), 'cafe-table', 24, 16),
    obj(tx(2), ty(5), 'cafe-chair', 20, 18),
    obj(tx(4), ty(5), 'cafe-chair', 20, 18),
    decor(tx(3), ty(4), 'coffee-cup'),

    obj(tx(3), ty(8), 'cafe-table', 24, 16),
    obj(tx(2), ty(8), 'cafe-chair', 20, 18),
    obj(tx(4), ty(8), 'cafe-chair', 20, 18),
    decor(tx(3), ty(7), 'coffee-cup'),

    // Center — larger table
    obj(tx(8), ty(6), 'cafe-table', 24, 16),
    obj(tx(9), ty(6), 'cafe-table', 24, 16),
    obj(tx(7), ty(6), 'cafe-chair', 20, 18),
    obj(tx(10), ty(6), 'cafe-chair', 20, 18),
    decor(tx(8), ty(5), 'coffee-cup'),
    decor(tx(9), ty(5), 'coffee-cup'),

    // Right side — 2 small tables
    obj(tx(14), ty(5), 'cafe-table', 24, 16),
    obj(tx(13), ty(5), 'cafe-chair', 20, 18),
    obj(tx(15), ty(5), 'cafe-chair', 20, 18),
    decor(tx(14), ty(4), 'coffee-cup'),

    obj(tx(14), ty(8), 'cafe-table', 24, 16),
    obj(tx(13), ty(8), 'cafe-chair', 20, 18),
    obj(tx(15), ty(8), 'cafe-chair', 20, 18),

    // ── Cozy sofa corner — lower left ──
    obj(tx(2), ty(11), 'sofa', 40, 18),
    obj(tx(4), ty(10), 'cafe-table', 24, 16),
    decor(tx(4), ty(9), 'coffee-cup'),

    // ── Decoration ──
    decor(tx(1), ty(4), 'window-indoor'),
    decor(tx(1), ty(8), 'window-indoor'),
    decor(tx(16), ty(4), 'window-indoor'),
    decor(tx(16), ty(8), 'window-indoor'),
    obj(tx(16), ty(12), 'pot', 16, 20),
    obj(tx(1), ty(12), 'pot', 16, 20),
  ],

  buildings: [],

  npcs: [
    {
      id: 'barista',
      x: tx(6),
      y: ty(3),
      spriteKey: 'npc',
      anchor: { x: 0.5, y: 1.0 },
      sortY: ty(3),
      collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
      name: 'Barista',
      dialogue: [
        'Welcome to the café!',
        'We have the best coffee in the village.',
        'Try our pastries — they\'re freshly baked!',
      ],
    },
  ],

  triggers: [
    {
      id: 'cafe-exit',
      x: 8 * T,
      y: (H - 1) * T,
      width: 64,
      height: 16,
      type: 'door',
      targetMapId: 'outdoor',
      targetSpawnId: 'cafe-exit',
    },
  ],

  spawnPoints: [
    { id: 'entrance', x: tx(8), y: ty(12), facing: 'up' },
  ],
};
