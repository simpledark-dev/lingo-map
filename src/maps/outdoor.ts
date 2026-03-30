import { MapData, TileType, Entity, Building, NPCData } from '../core/types';

const W = 100;
const H = 100;
const T = 32;
const G = TileType.GRASS;
const P = TileType.PATH;

// ── Seeded pseudo-random for deterministic placement ──

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

// ── Tile generation ──

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      r.push(G);
    }
    tiles.push(r);
  }

  function hPath(row: number, c0: number, c1: number, width = 1) {
    for (let w = 0; w < width; w++) {
      const r = row + w;
      if (r < 0 || r >= H) continue;
      for (let c = c0; c <= c1; c++) {
        if (c >= 0 && c < W) tiles[r][c] = P;
      }
    }
  }
  function vPath(col: number, r0: number, r1: number, width = 1) {
    for (let w = 0; w < width; w++) {
      const c = col + w;
      if (c < 0 || c >= W) continue;
      for (let r = r0; r <= r1; r++) {
        if (r >= 0 && r < H) tiles[r][c] = P;
      }
    }
  }
  function pathRect(r0: number, c0: number, r1: number, c1: number) {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (r >= 0 && r < H && c >= 0 && c < W) tiles[r][c] = P;
  }

  // ── Major roads (2-tile wide) ──
  hPath(49, 0, 99, 2);   // main east-west
  vPath(49, 0, 99, 2);   // main north-south
  hPath(20, 5, 94, 2);   // northern boulevard
  hPath(78, 5, 94, 2);   // southern boulevard
  vPath(20, 5, 94, 2);   // western avenue
  vPath(78, 5, 94, 2);   // eastern avenue

  // ── Secondary roads (1-tile wide) ──
  hPath(35, 10, 89);
  hPath(64, 10, 89);
  vPath(35, 10, 89);
  vPath(64, 10, 89);

  // ── Village squares / plazas ──
  pathRect(46, 46, 53, 53);  // central square
  pathRect(17, 17, 23, 23);  // NW plaza
  pathRect(17, 76, 23, 82);  // NE plaza
  pathRect(76, 17, 82, 23);  // SW plaza
  pathRect(76, 76, 82, 82);  // SE plaza
  pathRect(32, 46, 37, 53);  // north market
  pathRect(62, 46, 67, 53);  // south market

  // ── Spurs to houses ──
  const spurs = [
    // NW district
    [12, 14, 20], [15, 14, 20], [27, 14, 20], [12, 25, 35],
    // NE district
    [84, 14, 20], [87, 14, 20], [73, 14, 20], [84, 25, 35],
    // SW district
    [12, 78, 88], [15, 78, 88], [27, 78, 88],
    // SE district
    [84, 78, 88], [87, 78, 88], [73, 78, 88],
    // Central spurs
    [42, 46, 49], [57, 46, 49], [42, 50, 53], [57, 50, 53],
    // Mid-ring spurs
    [30, 35, 49], [70, 35, 49], [30, 50, 64], [70, 50, 64],
  ];
  for (const [col, r0, r1] of spurs) {
    vPath(col, r0, r1);
  }

  return tiles;
}

// ── Object helpers ──

let entityId = 0;

function tree(x: number, y: number): Entity {
  return {
    id: `tree-${++entityId}`, x, y,
    spriteKey: 'tree',
    anchor: { x: 0.5, y: 1.0 },
    sortY: y,
    collisionBox: { offsetX: -8, offsetY: -16, width: 16, height: 16 },
  };
}

function rock(x: number, y: number): Entity {
  return {
    id: `rock-${++entityId}`, x, y,
    spriteKey: 'rock',
    anchor: { x: 0.5, y: 1.0 },
    sortY: y,
    collisionBox: { offsetX: -12, offsetY: -20, width: 24, height: 20 },
  };
}

function house(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 64;
  const y = tileRow * T + 96;
  return {
    id, x, y,
    baseSpriteKey: 'house-base',
    roofSpriteKey: 'house-roof',
    anchor: { x: 0.5, y: 1.0 },
    sortY: y,
    collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 },
    doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 },
    targetMapId: 'indoor',
    targetSpawnId: 'entrance',
  };
}

let npcId = 0;
function npc(x: number, y: number, name: string, lines: string[]): NPCData {
  return {
    id: `npc-${++npcId}`, x, y,
    spriteKey: 'npc',
    anchor: { x: 0.5, y: 1.0 },
    sortY: y,
    collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    name,
    dialogue: lines,
  };
}

// ── Cluster generators ──

function treeCluster(cx: number, cy: number, count: number, spread: number): Entity[] {
  const offsets = [
    [0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1],
    [0, -2], [0, 2], [-2, 0], [2, 0],
    [-2, -2], [2, -2], [-2, 2], [2, 2],
    [1, -3], [-1, 3], [3, 1], [-3, -1],
    [0, -3], [0, 3], [-3, 0], [3, 0],
  ];
  const trees: Entity[] = [];
  for (let i = 0; i < Math.min(count, offsets.length); i++) {
    trees.push(tree(cx + offsets[i][0] * spread, cy + offsets[i][1] * spread));
  }
  return trees;
}

function rockCluster(cx: number, cy: number, count: number, spread: number): Entity[] {
  const offsets = [
    [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];
  const rocks: Entity[] = [];
  for (let i = 0; i < Math.min(count, offsets.length); i++) {
    rocks.push(rock(cx + offsets[i][0] * spread, cy + offsets[i][1] * spread));
  }
  return rocks;
}

/** Fill a rectangular region with trees at semi-random spacing. */
function treeForest(
  x0: number, y0: number, x1: number, y1: number,
  density: number, // approx spacing in pixels between trees
): Entity[] {
  const trees: Entity[] = [];
  for (let y = y0; y < y1; y += density) {
    for (let x = x0; x < x1; x += density) {
      // jitter position deterministically
      const jx = x + (rand() - 0.5) * density * 0.6;
      const jy = y + (rand() - 0.5) * density * 0.6;
      trees.push(tree(Math.round(jx), Math.round(jy)));
    }
  }
  return trees;
}

/** Scatter rocks across a region. */
function rockField(
  x0: number, y0: number, x1: number, y1: number,
  count: number,
): Entity[] {
  const rocks: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(x0 + rand() * (x1 - x0));
    const y = Math.round(y0 + rand() * (y1 - y0));
    rocks.push(rock(x, y));
  }
  return rocks;
}

// ══════════════════════════════════════════
// BUILD ALL OBJECTS
// ══════════════════════════════════════════

const objects: Entity[] = [
  // ── Dense forests (4 corners) ──
  // NW forest
  ...treeForest(64, 64, 576, 576, 56),
  // NE forest
  ...treeForest(2624, 64, 3136, 576, 56),
  // SW forest
  ...treeForest(64, 2624, 576, 3136, 56),
  // SE forest
  ...treeForest(2624, 2624, 3136, 3136, 56),

  // ── Medium forests (along edges) ──
  // North edge
  ...treeForest(768, 64, 2432, 320, 64),
  // South edge
  ...treeForest(768, 2880, 2432, 3136, 64),
  // West edge
  ...treeForest(64, 768, 320, 2432, 64),
  // East edge
  ...treeForest(2880, 768, 3136, 2432, 64),

  // ── Tree-lined roads ──
  // Trees flanking main east-west road (y ~1568)
  ...treeForest(64, 1440, 1500, 1500, 80),
  ...treeForest(1700, 1440, 3136, 1500, 80),
  ...treeForest(64, 1700, 1500, 1760, 80),
  ...treeForest(1700, 1700, 3136, 1760, 80),

  // Trees flanking main north-south road (x ~1568)
  ...treeForest(1440, 64, 1500, 1500, 80),
  ...treeForest(1440, 1700, 1500, 3136, 80),
  ...treeForest(1700, 64, 1760, 1500, 80),
  ...treeForest(1700, 1700, 1760, 3136, 80),

  // ── Clusters inside districts ──
  // NW district park
  ...treeCluster(448, 960, 15, 48),
  ...treeCluster(448, 1120, 12, 48),
  // NE district park
  ...treeCluster(2752, 960, 15, 48),
  ...treeCluster(2752, 1120, 12, 48),
  // SW district park
  ...treeCluster(448, 2080, 15, 48),
  ...treeCluster(448, 2240, 12, 48),
  // SE district park
  ...treeCluster(2752, 2080, 15, 48),
  ...treeCluster(2752, 2240, 12, 48),

  // Central park ring
  ...treeCluster(1344, 1344, 8, 64),
  ...treeCluster(1856, 1344, 8, 64),
  ...treeCluster(1344, 1856, 8, 64),
  ...treeCluster(1856, 1856, 8, 64),

  // ── Scattered trees between districts ──
  ...treeForest(800, 480, 1300, 576, 80),
  ...treeForest(1900, 480, 2400, 576, 80),
  ...treeForest(800, 2600, 1300, 2720, 80),
  ...treeForest(1900, 2600, 2400, 2720, 80),
  ...treeForest(480, 800, 576, 1300, 80),
  ...treeForest(480, 1900, 576, 2400, 80),
  ...treeForest(2600, 800, 2720, 1300, 80),
  ...treeForest(2600, 1900, 2720, 2400, 80),

  // ── Rock formations ──
  // Rocky outcrops in each quadrant
  ...rockCluster(384, 384, 7, 36),
  ...rockCluster(2816, 384, 7, 36),
  ...rockCluster(384, 2816, 7, 36),
  ...rockCluster(2816, 2816, 7, 36),

  // Rocks along roads
  ...rockField(640, 1520, 1440, 1570, 12),
  ...rockField(1760, 1520, 2560, 1570, 12),
  ...rockField(1520, 640, 1570, 1440, 12),
  ...rockField(1520, 1760, 1570, 2560, 12),

  // Scattered rocks per district
  ...rockField(640, 640, 1400, 1400, 20),
  ...rockField(1800, 640, 2560, 1400, 20),
  ...rockField(640, 1800, 1400, 2560, 20),
  ...rockField(1800, 1800, 2560, 2560, 20),

  // Extra rock clusters near plazas
  ...rockCluster(640, 704, 5, 32),
  ...rockCluster(2560, 704, 5, 32),
  ...rockCluster(640, 2496, 5, 32),
  ...rockCluster(2560, 2496, 5, 32),
  ...rockCluster(1600, 1024, 4, 40),
  ...rockCluster(1600, 2176, 4, 40),
  ...rockCluster(1024, 1600, 4, 40),
  ...rockCluster(2176, 1600, 4, 40),
];

// ══════════════════════════════════════════
// HOUSES — 24 total, distributed across districts
// ══════════════════════════════════════════

const buildings: Building[] = [
  // ── Central village (4 houses around the square) ──
  house('house-c1', 42, 44),
  house('house-c2', 54, 44),
  house('house-c3', 42, 55),
  house('house-c4', 54, 55),

  // ── NW district (4 houses) ──
  house('house-nw1', 10, 10),
  house('house-nw2', 16, 10),
  house('house-nw3', 10, 25),
  house('house-nw4', 16, 25),

  // ── NE district (4 houses) ──
  house('house-ne1', 82, 10),
  house('house-ne2', 88, 10),
  house('house-ne3', 82, 25),
  house('house-ne4', 88, 25),

  // ── SW district (4 houses) ──
  house('house-sw1', 10, 82),
  house('house-sw2', 16, 82),
  house('house-sw3', 10, 88),
  house('house-sw4', 16, 88),

  // ── SE district (4 houses) ──
  house('house-se1', 82, 82),
  house('house-se2', 88, 82),
  house('house-se3', 82, 88),
  house('house-se4', 88, 88),

  // ── Mid-ring houses (along secondary roads) ──
  house('house-n', 48, 30),
  house('house-s', 48, 68),
  house('house-w', 28, 48),
  house('house-e', 68, 48),
];

// ══════════════════════════════════════════
// NPCs — 20 total, scattered across the map
// ══════════════════════════════════════════

const npcs: NPCData[] = [
  // Central village NPCs
  npc(1600, 1568, 'Elder', [
    'Hello, traveler!', 'Welcome to the village.', 'Explore all four districts — each has its own character.',
  ]),
  npc(1536, 1696, 'Merchant', [
    'Fine wares for sale!', 'Well... not yet. But soon!',
  ]),
  npc(1696, 1504, 'Guard', [
    'Stay on the paths if you can.', 'The forests can be dense.',
  ]),
  npc(1504, 1504, 'Child', [
    'Tag! You\'re it!', 'Hehe, just kidding.',
  ]),

  // NW district
  npc(448, 640, 'Lumberjack', [
    'These northern woods are ancient.', 'I\'ve been clearing paths for years.',
  ]),
  npc(544, 768, 'Herbalist', [
    'The forest provides everything we need.', 'If you know where to look.',
  ]),

  // NE district
  npc(2752, 640, 'Scholar', [
    'I\'m studying the rock formations here.', 'Fascinating geological history!',
  ]),
  npc(2848, 832, 'Ranger', [
    'I patrol the eastern border.', 'All clear today.',
  ]),

  // SW district
  npc(448, 2752, 'Farmer', [
    'The soil down here is rich.', 'Perfect for growing crops... someday.',
  ]),
  npc(576, 2624, 'Fisher', [
    'I keep hoping they\'ll add a lake.', 'A man can dream.',
  ]),

  // SE district
  npc(2752, 2752, 'Miner', [
    'Rocks everywhere!', 'There must be ore beneath these stones.',
  ]),
  npc(2624, 2624, 'Wanderer', [
    'I\'ve walked every corner of this land.', 'It\'s bigger than it looks.',
  ]),

  // Along roads
  npc(960, 1600, 'Traveler', [
    'The road stretches on forever.', 'But the view is worth it.',
  ]),
  npc(2240, 1600, 'Courier', [
    'Deliveries to make!', 'No time to chat — well, maybe a little.',
  ]),
  npc(1600, 960, 'Bard', [
    'La la la~', 'Oh! Didn\'t see you there.', 'Want to hear a song? Too bad, I forgot the words.',
  ]),
  npc(1600, 2240, 'Cartographer', [
    'I\'m mapping this whole area.', 'It\'s exactly 100 by 100 tiles.', 'Trust me, I counted.',
  ]),

  // Near plazas
  npc(672, 672, 'Lookout', [
    'I can see the whole northwest from up here.',
  ]),
  npc(2528, 672, 'Lookout', [
    'The northeast is quiet today.',
  ]),
  npc(672, 2528, 'Lookout', [
    'Southwest reporting: all calm.',
  ]),
  npc(2528, 2528, 'Lookout', [
    'Southeast perimeter secure.',
  ]),
];

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════

export const outdoorMap: MapData = {
  id: 'outdoor',
  width: W,
  height: H,
  tileSize: T,
  tiles: makeTiles(),
  objects,
  buildings,
  npcs,
  triggers: [],

  spawnPoints: [
    { id: 'default', x: 1600, y: 1632, facing: 'down' },
    { id: 'house-exit', x: 1600, y: 1536, facing: 'down' },
  ],
};
