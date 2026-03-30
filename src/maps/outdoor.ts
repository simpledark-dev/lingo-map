import { MapData, TileType, Entity, Building, NPCData } from '../core/types';

const W = 100;
const H = 100;
const T = 32;
const G = TileType.GRASS;
const P = TileType.PATH;
const WA = TileType.WATER;
const BR = TileType.BRIDGE;

// ── Seeded pseudo-random ──

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

// ══════════════════════════════════════════
// TILE GENERATION
// ══════════════════════════════════════════

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) r.push(G);
    tiles.push(r);
  }

  function set(row: number, col: number, t: TileType) {
    if (row >= 0 && row < H && col >= 0 && col < W) tiles[row][col] = t;
  }
  function hLine(row: number, c0: number, c1: number, t: TileType, width = 1) {
    for (let w = 0; w < width; w++)
      for (let c = c0; c <= c1; c++) set(row + w, c, t);
  }
  function vLine(col: number, r0: number, r1: number, t: TileType, width = 1) {
    for (let w = 0; w < width; w++)
      for (let r = r0; r <= r1; r++) set(r, col + w, t);
  }
  function rect(r0: number, c0: number, r1: number, c1: number, t: TileType) {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) set(r, c, t);
  }

  // ─── Rivers ───
  // Main river: flows from NW to SE with a meander through the map
  // River is 3 tiles wide for visual weight
  const riverPath: [number, number][] = [];
  {
    // NW entrance (col ~15, row 0) flowing south-east
    let col = 15;
    for (let row = 0; row < 30; row++) {
      // gentle eastward drift
      if (row === 8) col += 1;
      if (row === 14) col += 1;
      if (row === 20) col += 2;
      if (row === 25) col += 1;
      riverPath.push([row, col]);
      for (let w = 0; w < 3; w++) set(row, col + w, WA);
    }
    // Bend east across the northern area
    for (let c = col; c <= 42; c++) {
      riverPath.push([30, c]);
      for (let w = 0; w < 3; w++) set(30 + w, c, WA);
    }
    // Flow south through center-west
    col = 42;
    for (let row = 33; row <= 60; row++) {
      // gentle meander
      if (row === 38) col -= 1;
      if (row === 42) col -= 2;
      if (row === 46) col += 1;
      if (row === 52) col += 2;
      if (row === 56) col += 1;
      riverPath.push([row, col]);
      for (let w = 0; w < 3; w++) set(row, col + w, WA);
    }
    // Bend east toward SE
    const endCol = col;
    for (let c = endCol; c <= 75; c++) {
      riverPath.push([60, c]);
      for (let w = 0; w < 3; w++) set(60 + w, c, WA);
    }
    // Flow south to SE corner exit
    col = 75;
    for (let row = 63; row < H; row++) {
      if (row === 70) col += 1;
      if (row === 78) col += 1;
      if (row === 85) col += 2;
      if (row === 92) col += 1;
      if (col >= W - 3) col = W - 4;
      riverPath.push([row, col]);
      for (let w = 0; w < 3; w++) set(row, col + w, WA);
    }
  }

  // Small tributary: flows from east edge into the main river
  {
    let col = 99;
    for (let row = 10; row <= 30; row++) {
      if (row === 14) col -= 2;
      if (row === 18) col -= 3;
      if (row === 22) col -= 2;
      if (row === 26) col -= 3;
      if (col < 44) col = 44;
      for (let w = 0; w < 2; w++) set(row, col + w, WA);
    }
  }

  // Small pond in SW
  for (let r = 75; r <= 80; r++)
    for (let c = 10; c <= 16; c++) {
      const dr = r - 77.5, dc = c - 13;
      if (dr * dr / 9 + dc * dc / 12 < 1) set(r, c, WA);
    }

  // ─── Bridges (where paths cross rivers) ───
  // Bridge locations will be placed after paths, so mark them after

  // ─── Main roads (2-tile wide) ───
  hLine(49, 0, 99, P, 2);   // main east-west
  vLine(49, 0, 99, P, 2);   // main north-south

  // ─── District connector roads ───
  hLine(20, 4, 95, P);      // northern road
  hLine(78, 4, 95, P);      // southern road
  vLine(22, 4, 95, P);      // western road
  vLine(78, 4, 95, P);      // eastern road

  // ─── Secondary roads ───
  hLine(35, 8, 92, P);
  hLine(65, 8, 92, P);
  vLine(35, 8, 92, P);
  vLine(65, 8, 92, P);

  // ─── Plazas ───
  rect(46, 46, 53, 53, P);  // central square
  rect(17, 17, 23, 25, P);  // NW plaza (wider)
  rect(17, 76, 23, 84, P);  // NE plaza
  rect(76, 17, 82, 25, P);  // SW plaza
  rect(76, 76, 82, 84, P);  // SE plaza

  // ─── Winding paths (not grid-aligned) ───
  // Path through NW forest — curves between trees
  for (let r = 4; r <= 16; r++) {
    const c = 10 + Math.round(Math.sin(r * 0.4) * 2);
    set(r, c, P); set(r, c + 1, P);
  }
  // Garden path in SE
  for (let r = 84; r <= 94; r++) {
    const c = 84 + Math.round(Math.sin(r * 0.5) * 3);
    set(r, c, P);
  }
  // Lakeside path around SW pond
  for (let r = 73; r <= 82; r++) {
    set(r, 8, P); set(r, 18, P);
  }
  hLine(73, 8, 18, P);
  hLine(82, 8, 18, P);

  // ─── Building approach paths ───
  const spurs: [number, number, number][] = [
    // Central buildings
    [44, 46, 49], [60, 46, 49], [44, 50, 53], [60, 50, 53],
    // NW
    [12, 14, 20], [20, 14, 20], [12, 25, 35], [22, 25, 35],
    // NE
    [84, 14, 20], [92, 14, 20], [84, 25, 35], [92, 25, 35],
    // SW
    [12, 78, 85], [22, 78, 85], [12, 90, 95], [22, 90, 95],
    // SE
    [84, 78, 85], [94, 78, 85], [84, 90, 95], [94, 90, 95],
    // Mid-ring
    [50, 28, 35], [52, 65, 72], [30, 46, 49], [72, 46, 49],
  ];
  for (const [col, r0, r1] of spurs) vLine(col, r0, r1, P);

  // ─── Bridges: wherever a path tile overlaps water, make it a bridge ───
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (tiles[r][c] === WA) {
        // Check if any adjacent tile is a path (this water tile is on a road)
        const neighbors = [
          [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
        ];
        let adjPath = 0;
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < H && nc >= 0 && nc < W && tiles[nr][nc] === P) adjPath++;
        }
        // If road was drawn through here (check original intent)
        // Actually, paths were drawn OVER water. Let's re-check: if this was set to P then WA,
        // we lost the path. Instead, mark bridges explicitly.
      }
    }
  }

  // Explicit bridge placements where roads cross rivers
  // Main E-W road (row 49-50) crosses the river
  for (let w = 0; w < 2; w++) {
    for (let c = 0; c < W; c++) {
      if (tiles[49 + w][c] === WA) set(49 + w, c, BR);
    }
  }
  // Main N-S road (col 49-50) crosses the river
  for (let w = 0; w < 2; w++) {
    for (let r = 0; r < H; r++) {
      if (tiles[r][49 + w] === WA) set(r, 49 + w, BR);
    }
  }
  // Secondary roads crossing rivers
  for (const roadRow of [20, 35, 65, 78]) {
    for (let c = 0; c < W; c++) {
      if (tiles[roadRow][c] === WA) set(roadRow, c, BR);
    }
  }
  for (const roadCol of [22, 35, 65, 78]) {
    for (let r = 0; r < H; r++) {
      if (tiles[r][roadCol] === WA) set(r, roadCol, BR);
    }
  }

  return tiles;
}

// ══════════════════════════════════════════
// OBJECT HELPERS
// ══════════════════════════════════════════

let entityId = 0;

function tree(x: number, y: number): Entity {
  return { id: `tree-${++entityId}`, x, y, spriteKey: 'tree', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -8, offsetY: -16, width: 16, height: 16 } };
}
function rock(x: number, y: number): Entity {
  return { id: `rock-${++entityId}`, x, y, spriteKey: 'rock', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -12, offsetY: -20, width: 24, height: 20 } };
}

function house(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 64, y = tileRow * T + 96;
  return { id, x, y, baseSpriteKey: 'house-base', roofSpriteKey: 'house-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'indoor', targetSpawnId: 'entrance' };
}
function cafe(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 80, y = tileRow * T + 96;
  return { id, x, y, baseSpriteKey: 'cafe-base', roofSpriteKey: 'cafe-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -80, offsetY: -96, width: 160, height: 88 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'cafe', targetSpawnId: 'entrance' };
}
function restaurant(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 96, y = tileRow * T + 112;
  return { id, x, y, baseSpriteKey: 'restaurant-base', roofSpriteKey: 'restaurant-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -96, offsetY: -112, width: 192, height: 104 }, doorTrigger: { offsetX: -20, offsetY: -8, width: 40, height: 8 }, targetMapId: 'restaurant', targetSpawnId: 'entrance' };
}
function bookstore(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 64, y = tileRow * T + 96;
  return { id, x, y, baseSpriteKey: 'bookstore-base', roofSpriteKey: 'bookstore-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'bookstore', targetSpawnId: 'entrance' };
}
function market(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 80, y = tileRow * T + 96;
  return { id, x, y, baseSpriteKey: 'market-base', roofSpriteKey: 'market-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -80, offsetY: -96, width: 160, height: 88 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'market', targetSpawnId: 'entrance' };
}
function bakery(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 64, y = tileRow * T + 96;
  return { id, x, y, baseSpriteKey: 'bakery-base', roofSpriteKey: 'bakery-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'bakery', targetSpawnId: 'entrance' };
}
function inn(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 80, y = tileRow * T + 112;
  return { id, x, y, baseSpriteKey: 'inn-base', roofSpriteKey: 'inn-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -80, offsetY: -112, width: 160, height: 104 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'inn', targetSpawnId: 'entrance' };
}
function blacksmith(id: string, tileCol: number, tileRow: number): Building {
  const x = tileCol * T + 64, y = tileRow * T + 96;
  return { id, x, y, baseSpriteKey: 'blacksmith-base', roofSpriteKey: 'blacksmith-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'blacksmith', targetSpawnId: 'entrance' };
}

let npcId = 0;
function npc(x: number, y: number, name: string, lines: string[]): NPCData {
  return { id: `npc-${++npcId}`, x, y, spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name, dialogue: lines };
}

// ── Nature generators ──

function treeCluster(cx: number, cy: number, count: number, spread: number): Entity[] {
  const offsets = [[0,0],[-1,-1],[1,-1],[-1,1],[1,1],[0,-2],[0,2],[-2,0],[2,0],[-2,-2],[2,-2],[-2,2],[2,2],[1,-3],[-1,3],[3,1],[-3,-1],[0,-3],[0,3],[-3,0],[3,0]];
  const trees: Entity[] = [];
  for (let i = 0; i < Math.min(count, offsets.length); i++)
    trees.push(tree(cx + offsets[i][0] * spread, cy + offsets[i][1] * spread));
  return trees;
}

function treeForest(x0: number, y0: number, x1: number, y1: number, density: number): Entity[] {
  const trees: Entity[] = [];
  for (let y = y0; y < y1; y += density)
    for (let x = x0; x < x1; x += density) {
      const jx = x + (rand() - 0.5) * density * 0.7;
      const jy = y + (rand() - 0.5) * density * 0.7;
      trees.push(tree(Math.round(jx), Math.round(jy)));
    }
  return trees;
}

function rockField(x0: number, y0: number, x1: number, y1: number, count: number): Entity[] {
  const rocks: Entity[] = [];
  for (let i = 0; i < count; i++)
    rocks.push(rock(Math.round(x0 + rand() * (x1 - x0)), Math.round(y0 + rand() * (y1 - y0))));
  return rocks;
}

function rockCluster(cx: number, cy: number, count: number, spread: number): Entity[] {
  const offsets = [[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  const rocks: Entity[] = [];
  for (let i = 0; i < Math.min(count, offsets.length); i++)
    rocks.push(rock(cx + offsets[i][0] * spread, cy + offsets[i][1] * spread));
  return rocks;
}

// Riverside trees — line of trees along a river bank
function riversideTrees(x: number, y0: number, y1: number, side: 'left' | 'right'): Entity[] {
  const trees: Entity[] = [];
  const offset = side === 'left' ? -64 : 128;
  for (let y = y0; y < y1; y += 80 + Math.round(rand() * 40)) {
    trees.push(tree(x + offset + Math.round((rand() - 0.5) * 24), y));
  }
  return trees;
}

// ══════════════════════════════════════════
// OBJECTS
// ══════════════════════════════════════════

const objects: Entity[] = [
  // ══════════════════════════════════════
  // DENSE CORNER FORESTS
  // ══════════════════════════════════════
  ...treeForest(64, 64, 544, 544, 44),       // NW — thick
  ...treeForest(2624, 64, 3136, 544, 44),    // NE
  ...treeForest(64, 2624, 544, 3136, 44),    // SW
  ...treeForest(2624, 2624, 3136, 3136, 44), // SE

  // ══════════════════════════════════════
  // FOREST BORDERS (thinning toward town)
  // ══════════════════════════════════════
  // North border — wide tree line
  ...treeForest(544, 64, 1500, 320, 60),
  ...treeForest(1700, 64, 2624, 320, 60),
  // South border
  ...treeForest(544, 2880, 1500, 3136, 60),
  ...treeForest(1700, 2880, 2624, 3136, 60),
  // West border
  ...treeForest(64, 544, 320, 1500, 60),
  ...treeForest(64, 1700, 320, 2624, 60),
  // East border
  ...treeForest(2880, 544, 3136, 1500, 60),
  ...treeForest(2880, 1700, 3136, 2624, 60),

  // ══════════════════════════════════════
  // RIVERSIDE VEGETATION
  // ══════════════════════════════════════
  // Dense tree lines along the main river in all 3 segments
  ...riversideTrees(15 * T, 64, 960, 'left'),
  ...riversideTrees(15 * T, 64, 960, 'right'),
  ...riversideTrees(17 * T, 200, 900, 'left'),  // second row for thickness
  ...riversideTrees(42 * T, 1060, 1920, 'left'),
  ...riversideTrees(42 * T, 1060, 1920, 'right'),
  ...riversideTrees(40 * T, 1200, 1800, 'left'),
  ...riversideTrees(75 * T, 2050, 3100, 'left'),
  ...riversideTrees(75 * T, 2050, 3100, 'right'),
  ...riversideTrees(77 * T, 2200, 3000, 'right'),

  // ══════════════════════════════════════
  // NW QUADRANT INTERIOR (cols ~8-35, rows ~8-35)
  // ══════════════════════════════════════
  // Meadow groves — organically scattered
  ...treeCluster(320, 640, 10, 48),
  ...treeCluster(544, 480, 8, 52),
  ...treeCluster(288, 896, 12, 44),
  ...treeCluster(576, 768, 6, 56),
  // Small copse near the road
  ...treeCluster(480, 1120, 8, 44),
  ...treeCluster(320, 1280, 6, 52),
  // Fill between buildings and forest
  ...treeForest(640, 400, 1050, 600, 72),
  ...treeForest(640, 880, 1050, 1100, 72),

  // ══════════════════════════════════════
  // NE QUADRANT INTERIOR (cols ~65-92, rows ~8-35)
  // ══════════════════════════════════════
  ...treeCluster(2624, 640, 10, 48),
  ...treeCluster(2816, 480, 8, 52),
  ...treeCluster(2720, 896, 12, 44),
  ...treeCluster(2560, 768, 7, 52),
  ...treeCluster(2880, 1120, 8, 44),
  ...treeForest(2100, 400, 2560, 600, 72),
  ...treeForest(2100, 880, 2560, 1100, 72),

  // ══════════════════════════════════════
  // SW QUADRANT INTERIOR (cols ~8-35, rows ~65-92)
  // ══════════════════════════════════════
  // Trees around the pond
  ...treeCluster(192, 2336, 12, 44),
  ...treeCluster(544, 2240, 8, 48),
  ...treeCluster(384, 2560, 10, 44),
  ...treeCluster(640, 2688, 8, 48),
  // More fill
  ...treeForest(640, 2100, 1050, 2400, 72),
  ...treeForest(640, 2500, 1050, 2800, 72),
  ...treeCluster(320, 2080, 8, 56),
  ...treeCluster(480, 2800, 6, 48),

  // ══════════════════════════════════════
  // SE QUADRANT INTERIOR (cols ~65-92, rows ~65-92)
  // ══════════════════════════════════════
  ...treeCluster(2624, 2240, 12, 44),
  ...treeCluster(2816, 2400, 10, 48),
  ...treeCluster(2720, 2560, 8, 52),
  ...treeCluster(2560, 2688, 10, 44),
  ...treeCluster(2880, 2800, 8, 48),
  ...treeForest(2100, 2100, 2560, 2400, 72),
  ...treeForest(2100, 2500, 2560, 2800, 72),

  // ══════════════════════════════════════
  // CENTRAL AREA (between the main roads)
  // ══════════════════════════════════════
  // Central park — ring of trees around the square
  ...treeCluster(1344, 1280, 8, 56),
  ...treeCluster(1856, 1280, 8, 56),
  ...treeCluster(1344, 1888, 8, 56),
  ...treeCluster(1856, 1888, 8, 56),
  // Park trees closer to the square
  ...treeCluster(1440, 1376, 5, 48),
  ...treeCluster(1760, 1376, 5, 48),
  ...treeCluster(1440, 1824, 5, 48),
  ...treeCluster(1760, 1824, 5, 48),

  // ══════════════════════════════════════
  // MID-RING FILL (between outer and inner roads)
  // ══════════════════════════════════════
  // North corridor (rows 20-35)
  ...treeForest(768, 700, 1400, 1050, 80),
  ...treeForest(1800, 700, 2400, 1050, 80),
  // South corridor (rows 65-78)
  ...treeForest(768, 2150, 1400, 2500, 80),
  ...treeForest(1800, 2150, 2400, 2500, 80),
  // West corridor (cols 22-35)
  ...treeForest(768, 1150, 1100, 1500, 80),
  ...treeForest(768, 1700, 1100, 2050, 80),
  // East corridor (cols 65-78)
  ...treeForest(2100, 1150, 2500, 1500, 80),
  ...treeForest(2100, 1700, 2500, 2050, 80),

  // ══════════════════════════════════════
  // TREE-LINED ROADS
  // ══════════════════════════════════════
  // Flanking main E-W road
  ...treeForest(64, 1440, 1440, 1520, 96),
  ...treeForest(1760, 1440, 3136, 1520, 96),
  ...treeForest(64, 1680, 1440, 1760, 96),
  ...treeForest(1760, 1680, 3136, 1760, 96),
  // Flanking main N-S road
  ...treeForest(1440, 64, 1520, 1440, 96),
  ...treeForest(1440, 1760, 1520, 3136, 96),
  ...treeForest(1680, 64, 1760, 1440, 96),
  ...treeForest(1680, 1760, 3136, 3136, 96),

  // ══════════════════════════════════════
  // SCATTERED INDIVIDUAL TREES (breaks up regularity)
  // ══════════════════════════════════════
  tree(640, 640), tree(960, 480), tree(1920, 640),
  tree(2240, 1120), tree(560, 2080), tree(2880, 2080),
  tree(1200, 800), tree(1800, 2400), tree(2600, 480),
  tree(800, 1280), tree(2400, 1680), tree(1120, 2720),
  tree(2080, 320), tree(320, 2400),
  tree(720, 1600), tree(2480, 1600), tree(1600, 720),
  tree(1600, 2480), tree(1040, 1040), tree(2160, 1040),
  tree(1040, 2160), tree(2160, 2160),
  tree(480, 1920), tree(2720, 1920), tree(1920, 480),
  tree(1920, 2720), tree(1280, 1200), tree(1920, 1200),

  // ══════════════════════════════════════
  // ROCKS — much denser
  // ══════════════════════════════════════
  // Riverside rocky banks
  ...rockCluster(480, 960, 7, 32),
  ...rockCluster(1380, 960, 6, 36),
  ...rockCluster(1344, 1920, 5, 36),
  ...rockCluster(2400, 1920, 7, 32),
  ...rockCluster(2400, 2240, 5, 36),
  // Pond edge rocks
  ...rockCluster(224, 2336, 8, 28),
  ...rockCluster(576, 2496, 6, 32),
  ...rockCluster(384, 2592, 5, 30),
  // District rock gardens
  ...rockField(640, 640, 1050, 1050, 18),
  ...rockField(2100, 640, 2560, 1050, 18),
  ...rockField(640, 2100, 1050, 2560, 18),
  ...rockField(2100, 2100, 2560, 2560, 18),
  // Road-side rocks
  ...rockField(1440, 1520, 1560, 1600, 8),
  ...rockField(1640, 1520, 1760, 1600, 8),
  ...rockField(1520, 1440, 1600, 1560, 8),
  ...rockField(1520, 1640, 1600, 1760, 8),
  // Rocky outcrops in corners
  ...rockCluster(256, 256, 6, 32),
  ...rockCluster(2880, 256, 6, 32),
  ...rockCluster(256, 2880, 6, 32),
  ...rockCluster(2880, 2880, 6, 32),
  // Mid-area scatter
  ...rockField(768, 1200, 1100, 1400, 10),
  ...rockField(2100, 1200, 2500, 1400, 10),
  ...rockField(768, 1800, 1100, 2000, 10),
  ...rockField(2100, 1800, 2500, 2000, 10),
  // Individual accent rocks
  rock(960, 320), rock(1760, 1120), rock(2080, 1920),
  rock(320, 1760), rock(2880, 1280), rock(1120, 1440),
  rock(2080, 1440), rock(1440, 1120), rock(1760, 2080),
];

// ══════════════════════════════════════════
// BUILDINGS
// ══════════════════════════════════════════

const buildings: Building[] = [
  // ── Central village — town square ──
  cafe('cafe-central', 40, 42),
  bakery('bakery-central', 56, 42),
  restaurant('rest-central', 40, 57),
  bookstore('bookstore-central', 58, 57),

  // ── NW district (west of river) — residential + trade ──
  house('house-player', 8, 10),
  inn('inn-nw', 16, 10),
  market('market-nw', 8, 26),
  blacksmith('smith-nw', 18, 26),

  // ── NE district (east of tributary) — commerce ──
  cafe('cafe-ne', 80, 10),
  bakery('bakery-ne', 88, 10),
  bookstore('bookstore-ne', 80, 26),
  restaurant('rest-ne', 88, 26),

  // ── SW district (around the pond) — trade ──
  market('market-sw', 8, 82),
  blacksmith('smith-sw', 18, 82),
  inn('inn-sw', 8, 92),
  bakery('bakery-sw', 18, 92),

  // ── SE district (east of river) — leisure ──
  restaurant('rest-se', 80, 82),
  cafe('cafe-se', 90, 82),
  bookstore('bookstore-se', 80, 92),
  inn('inn-se', 90, 92),

  // ── Mid-ring landmarks ──
  market('market-n', 46, 30),
  blacksmith('smith-s', 48, 68),
  inn('inn-w', 26, 48),
  cafe('cafe-e', 68, 48),
];

// ══════════════════════════════════════════
// NPCs
// ══════════════════════════════════════════

const npcs: NPCData[] = [
  // Central village
  npc(1600, 1568, 'Elder', ['Hello, traveler!', 'Welcome to the village.', 'The river splits our land into four districts.', 'Each has its own character — explore them all.']),
  npc(1536, 1696, 'Merchant', ['Fine wares for sale!', 'Well... not yet. But soon!']),
  npc(1696, 1504, 'Guard', ['Stay on the paths if you can.', 'The river is impassable — use the bridges.']),
  npc(1504, 1504, 'Child', ['Tag! You\'re it!', 'Hehe, just kidding.']),

  // NW district
  npc(448, 640, 'Lumberjack', ['These northern woods are ancient.', 'The river keeps things green.']),
  npc(544, 768, 'Herbalist', ['The riverside herbs are the best.', 'If you know where to look.']),

  // NE district
  npc(2752, 640, 'Scholar', ['I\'m studying the rock formations here.', 'The tributary carved these bluffs.']),
  npc(2848, 832, 'Ranger', ['I patrol the eastern border.', 'All clear today.']),

  // SW district — near the pond
  npc(384, 2496, 'Fisher', ['The pond is small but full of fish!', 'Well, placeholder fish.', 'A man can dream.']),
  npc(576, 2624, 'Farmer', ['The soil near the water is rich.', 'Perfect for growing crops... someday.']),

  // SE district
  npc(2752, 2752, 'Miner', ['Rocks everywhere!', 'There must be ore beneath these stones.']),
  npc(2624, 2624, 'Wanderer', ['I\'ve walked every corner of this land.', 'The bridges are the key to navigating it all.']),

  // Along roads / bridges
  npc(960, 1600, 'Traveler', ['The road stretches on forever.', 'But the bridge views are worth stopping for.']),
  npc(2240, 1600, 'Courier', ['Deliveries to make!', 'The bridges save so much time.']),
  npc(1600, 960, 'Bard', ['La la la~', 'Oh! Didn\'t see you there.', 'The river sings a better tune than I do.']),
  npc(1600, 2240, 'Cartographer', ['I\'m mapping this whole area.', 'The river system is fascinating.', 'Two branches, one lake, bridges everywhere.']),

  // Lookouts at plazas
  npc(672, 672, 'Lookout', ['I can see the river from up here.']),
  npc(2528, 672, 'Lookout', ['The tributary is beautiful this time of day.']),
  npc(672, 2528, 'Lookout', ['The pond is peaceful today.']),
  npc(2528, 2528, 'Lookout', ['Southeast perimeter secure.']),

  // ── More villagers for a lively feel ──
  // Central area strollers
  npc(1504, 1632, 'Villager', ['Lovely day for a walk!', 'The square is always bustling.']),
  npc(1696, 1632, 'Villager', ['Have you tried the bakery? The bread is amazing.']),
  npc(1568, 1440, 'Old Man', ['I\'ve lived here my whole life.', 'The village has grown so much.']),
  npc(1632, 1760, 'Young Woman', ['I just moved here from the city.', 'It\'s so peaceful.']),

  // NW villagers
  npc(384, 448, 'Woodcutter', ['Morning! Just heading to the forest.']),
  npc(544, 960, 'Gardener', ['I tend the grove here.', 'These trees need care.']),
  npc(320, 1120, 'Walker', ['The path through the woods is my favorite.', 'So serene.']),

  // NE villagers
  npc(2688, 448, 'Trader', ['Goods from the east!', 'The road here is well-traveled.']),
  npc(2816, 960, 'Shepherd', ['My flock grazes in the eastern meadows.', 'Placeholder sheep, of course.']),
  npc(2560, 1120, 'Artist', ['The light here is perfect for painting.', 'If only I had a canvas.']),

  // SW villagers
  npc(320, 2240, 'Fisherman', ['Best fishing spot is by the pond.', 'Dawn is the magic hour.']),
  npc(544, 2880, 'Forager', ['Wild mushrooms grow near the water.', 'Placeholder mushrooms are safe to eat.']),

  // SE villagers
  npc(2688, 2240, 'Runner', ['Just doing my morning jog!', 'Five laps around the district.']),
  npc(2816, 2880, 'Botanist', ['The SE garden has rare specimens.', 'Well, rare placeholder specimens.']),

  // Bridge guards / characters
  npc(1408, 1600, 'Bridge Keeper', ['This bridge is the heart of the village.', 'Everyone crosses here.']),
  npc(1600, 1408, 'Troll', ['You shall not— just kidding.', 'Cross freely, friend.']),

  // Road travelers
  npc(800, 1600, 'Peddler', ['Pots! Pans! Placeholder goods!', 'Everything must go!']),
  npc(2400, 1600, 'Pilgrim', ['I\'m on a journey to the eastern temple.', '...Which hasn\'t been built yet.']),
  npc(1600, 800, 'Scout', ['The northern forests are thick.', 'Watch your step near the river.']),
  npc(1600, 2600, 'Messenger', ['Urgent news from the south!', '...I forgot what it was.']),
];

// ══════════════════════════════════════════
// FILTER: remove objects near buildings/water
// ══════════════════════════════════════════

const mapTiles = makeTiles();

function isNearBuilding(ox: number, oy: number): boolean {
  for (const b of buildings) {
    const left = b.x - 96, right = b.x + 96;
    const top = b.y - 128, bottom = b.y + 32;
    const doorLeft = b.x - 32, doorRight = b.x + 32, doorBottom = b.y + 64;
    if (ox >= left && ox <= right && oy >= top && oy <= bottom) return true;
    if (ox >= doorLeft && ox <= doorRight && oy >= bottom && oy <= doorBottom) return true;
  }
  return false;
}

function isInWater(ox: number, oy: number): boolean {
  const col = Math.floor(ox / T);
  const row = Math.floor(oy / T);
  if (row < 0 || row >= H || col < 0 || col >= W) return false;
  const tile = mapTiles[row][col];
  return tile === TileType.WATER || tile === TileType.BRIDGE;
}

function isOnPath(ox: number, oy: number): boolean {
  const col = Math.floor(ox / T);
  const row = Math.floor(oy / T);
  if (row < 0 || row >= H || col < 0 || col >= W) return false;
  return mapTiles[row][col] === TileType.PATH;
}

const filteredObjects = objects.filter(o =>
  !isNearBuilding(o.x, o.y) && !isInWater(o.x, o.y) && !isOnPath(o.x, o.y)
);

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════

export const outdoorMap: MapData = {
  id: 'outdoor',
  width: W,
  height: H,
  tileSize: T,
  tiles: mapTiles,
  objects: filteredObjects,
  buildings,
  npcs,
  triggers: [],

  spawnPoints: [
    { id: 'default', x: 1600, y: 1632, facing: 'down' },
    { id: 'house-exit', x: 1600, y: 1536, facing: 'down' },
    // Dynamic spawns are created at runtime when entering buildings
  ],
};
