import { MapData, TileType, Entity, Building, NPCData } from '../core/types';

// ══════════════════════════════════════════════════════════════
// MAP LAYOUT (100×100 tiles)
//
// The map is organized around TWO main roads that cross at a
// town center. The river runs vertically through col ~38.
//
//   NORTH FOREST (rows 0-14) — dense, wraps top
//   ─────────────────────────────────────────────
//   RESIDENTIAL     │ river │  COMMERCIAL STRIP
//   (rows 15-40)    │       │  (rows 15-40)
//   houses + inn    │       │  cafe, bakery, market
//   along branch rd │       │  along main E-W road
//   ────────────MAIN E-W ROAD (row 45)──────────
//   PARK / POND     │ river │  TOWN CENTER
//   (rows 46-70)    │       │  (rows 42-52, cols 48-62)
//   open, peaceful  │       │  plaza + key buildings
//   ────────────────│       │───────────────────
//   SW FARM         │       │  ARTISAN QUARTER
//   (rows 70-85)    │       │  blacksmith, workshops
//   ─────────────────────────────────────────────
//   SOUTH FOREST (rows 86-100) — dense, wraps bottom
//
// Main N-S road: col 55
// Main E-W road: row 45
// River: col 38 (3 wide, meanders slightly)
// ══════════════════════════════════════════════════════════════

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
// TILE MAP
// ══════════════════════════════════════════

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let r = 0; r < H; r++) {
    const row: TileType[] = [];
    for (let c = 0; c < W; c++) row.push(G);
    tiles.push(row);
  }

  function set(r: number, c: number, t: TileType) {
    if (r >= 0 && r < H && c >= 0 && c < W) tiles[r][c] = t;
  }
  function hRoad(row: number, c0: number, c1: number, w = 1) {
    for (let dw = 0; dw < w; dw++)
      for (let c = c0; c <= c1; c++) set(row + dw, c, P);
  }
  function vRoad(col: number, r0: number, r1: number, w = 1) {
    for (let dw = 0; dw < w; dw++)
      for (let r = r0; r <= r1; r++) set(r, col + dw, P);
  }
  function rect(r0: number, c0: number, r1: number, c1: number, t: TileType) {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) set(r, c, t);
  }

  // ─── RIVER (col 38, 3 wide, gentle meander) ───
  for (let r = 0; r < H; r++) {
    let off = 0;
    if (r >= 25 && r < 40) off = 1;
    if (r >= 60 && r < 75) off = -1;
    for (let w = 0; w < 3; w++) set(r, 38 + off + w, WA);
  }

  // ─── MAIN ROADS (only 2, the spine) ───
  hRoad(45, 0, 99, 2);   // main E-W (row 45-46)
  vRoad(55, 0, 99, 2);   // main N-S (col 55-56)

  // ─── TOWN CENTER PLAZA (rows 42-50, cols 50-62) ───
  rect(42, 50, 50, 62, P);

  // ─── RESIDENTIAL BRANCH (west side, north of E-W road) ───
  // A road branches NW from the main E-W road
  hRoad(30, 5, 36);       // residential street (west of river)
  vRoad(15, 18, 45);      // residential avenue going north
  // Bridge where residential street crosses river
  for (let c = 0; c < W; c++)
    if (tiles[30][c] === WA) set(30, c, BR);

  // Short spurs to houses (from residential street)
  vRoad(8, 22, 30);
  vRoad(22, 22, 30);
  vRoad(8, 33, 45);
  vRoad(22, 33, 45);

  // ─── COMMERCIAL STRIP (east side, along E-W road) ───
  // Buildings line the main E-W road east of the plaza
  // Short access paths off the main road
  vRoad(68, 38, 45);
  vRoad(78, 38, 45);
  vRoad(88, 38, 45);
  vRoad(68, 47, 52);
  vRoad(78, 47, 52);

  // ─── ARTISAN QUARTER (SE, south of E-W road) ───
  hRoad(60, 55, 82);     // artisan street branching east
  vRoad(65, 47, 60);     // connector down from E-W road
  vRoad(75, 47, 60);
  vRoad(65, 60, 68);     // spurs to buildings
  vRoad(75, 60, 68);

  // ─── PARK PATHS (SW, south of E-W road, west of river) ───
  vRoad(15, 47, 72);     // park path continuing south from residential
  hRoad(58, 5, 36);      // cross path in park
  // Winding lakeside loop
  for (let r = 62; r <= 72; r++) {
    const c = 10 + Math.round(Math.sin(r * 0.3) * 3);
    set(r, c, P);
  }

  // ─── SOUTH FARM (SW) ───
  hRoad(75, 5, 36);       // farm road

  // ─── FOREST ENTRANCE PATHS ───
  vRoad(55, 0, 14, 2);    // main road extends north into forest
  vRoad(55, 86, 99, 2);   // main road extends south into forest
  vRoad(15, 8, 18);       // residential path into north forest

  // Winding forest trail (north)
  for (let r = 2; r <= 12; r++) {
    const c = 8 + Math.round(Math.sin(r * 0.6) * 2);
    set(r, c, P);
  }

  // ─── BRIDGES ───
  // Main E-W road bridge
  for (let w = 0; w < 2; w++)
    for (let c = 0; c < W; c++)
      if (tiles[45 + w][c] === WA) set(45 + w, c, BR);
  // Park cross-path bridge
  for (let c = 0; c < W; c++)
    if (tiles[58][c] === WA) set(58, c, BR);

  return tiles;
}

// ══════════════════════════════════════════
// ENTITY HELPERS
// ══════════════════════════════════════════

let entityId = 0;
function tree(x: number, y: number): Entity {
  return { id: `tree-${++entityId}`, x, y, spriteKey: 'tree', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -8, offsetY: -16, width: 16, height: 16 } };
}
function rock(x: number, y: number): Entity {
  return { id: `rock-${++entityId}`, x, y, spriteKey: 'rock', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -12, offsetY: -20, width: 24, height: 20 } };
}

function house(id: string, col: number, row: number): Building {
  const x = col * T + 64, y = row * T + 96;
  return { id, x, y, baseSpriteKey: 'house-base', roofSpriteKey: 'house-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'indoor', targetSpawnId: 'entrance' };
}
function cafe(id: string, col: number, row: number): Building {
  const x = col * T + 80, y = row * T + 96;
  return { id, x, y, baseSpriteKey: 'cafe-base', roofSpriteKey: 'cafe-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -80, offsetY: -96, width: 160, height: 88 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'cafe', targetSpawnId: 'entrance' };
}
function restaurant(id: string, col: number, row: number): Building {
  const x = col * T + 96, y = row * T + 112;
  return { id, x, y, baseSpriteKey: 'restaurant-base', roofSpriteKey: 'restaurant-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -96, offsetY: -112, width: 192, height: 104 }, doorTrigger: { offsetX: -20, offsetY: -8, width: 40, height: 8 }, targetMapId: 'restaurant', targetSpawnId: 'entrance' };
}
function bookstore(id: string, col: number, row: number): Building {
  const x = col * T + 64, y = row * T + 96;
  return { id, x, y, baseSpriteKey: 'bookstore-base', roofSpriteKey: 'bookstore-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'bookstore', targetSpawnId: 'entrance' };
}
function market(id: string, col: number, row: number): Building {
  const x = col * T + 80, y = row * T + 96;
  return { id, x, y, baseSpriteKey: 'market-base', roofSpriteKey: 'market-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -80, offsetY: -96, width: 160, height: 88 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'market', targetSpawnId: 'entrance' };
}
function bakery(id: string, col: number, row: number): Building {
  const x = col * T + 64, y = row * T + 96;
  return { id, x, y, baseSpriteKey: 'bakery-base', roofSpriteKey: 'bakery-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'bakery', targetSpawnId: 'entrance' };
}
function inn(id: string, col: number, row: number): Building {
  const x = col * T + 80, y = row * T + 112;
  return { id, x, y, baseSpriteKey: 'inn-base', roofSpriteKey: 'inn-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -80, offsetY: -112, width: 160, height: 104 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'inn', targetSpawnId: 'entrance' };
}
function blacksmith(id: string, col: number, row: number): Building {
  const x = col * T + 64, y = row * T + 96;
  return { id, x, y, baseSpriteKey: 'blacksmith-base', roofSpriteKey: 'blacksmith-roof', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'blacksmith', targetSpawnId: 'entrance' };
}

// ── Decoration helpers ──

function bush(x: number, y: number): Entity {
  return { id: `bush-${++entityId}`, x, y, spriteKey: 'bush', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -10, offsetY: -12, width: 20, height: 12 } };
}
function flowers(x: number, y: number): Entity {
  // Decorative — no collision (walkable)
  return { id: `flw-${++entityId}`, x, y, spriteKey: 'flowers', anchor: { x: 0.5, y: 1.0 }, sortY: y - 1000, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
}
function lampPost(x: number, y: number): Entity {
  return { id: `lamp-${++entityId}`, x, y, spriteKey: 'lamp-post', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -4, offsetY: -6, width: 8, height: 6 } };
}
function fence(x: number, y: number): Entity {
  return { id: `fnc-${++entityId}`, x, y, spriteKey: 'fence', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -14, offsetY: -8, width: 28, height: 8 } };
}
function well(x: number, y: number): Entity {
  return { id: `well-${++entityId}`, x, y, spriteKey: 'well', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -14, offsetY: -20, width: 28, height: 20 } };
}
function bench(x: number, y: number): Entity {
  return { id: `bnch-${++entityId}`, x, y, spriteKey: 'bench', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -14, offsetY: -10, width: 28, height: 10 } };
}
function signpost(x: number, y: number): Entity {
  return { id: `sign-${++entityId}`, x, y, spriteKey: 'signpost', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -6, offsetY: -8, width: 12, height: 8 } };
}
function logPile(x: number, y: number): Entity {
  return { id: `log-${++entityId}`, x, y, spriteKey: 'log-pile', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -12, offsetY: -12, width: 24, height: 12 } };
}

/** Lamp posts evenly along a horizontal road. */
function hLamps(row: number, c0: number, c1: number, spacing = 6): Entity[] {
  const lamps: Entity[] = [];
  for (let c = c0; c <= c1; c += spacing)
    lamps.push(lampPost(c * T + T / 2, (row - 1) * T));
  return lamps;
}

/** Lamp posts evenly along a vertical road. */
function vLamps(col: number, r0: number, r1: number, spacing = 6): Entity[] {
  const lamps: Entity[] = [];
  for (let r = r0; r <= r1; r += spacing)
    lamps.push(lampPost((col - 1) * T, r * T + T / 2));
  return lamps;
}

let npcId = 0;
function npc(x: number, y: number, name: string, lines: string[]): NPCData {
  return { id: `npc-${++npcId}`, x, y, spriteKey: 'npc', anchor: { x: 0.5, y: 1.0 }, sortY: y, collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 }, name, dialogue: lines };
}

// ── Nature helpers ──

function treeCluster(cx: number, cy: number, count: number, spread: number): Entity[] {
  const offsets = [[0,0],[-1,-1],[1,-1],[-1,1],[1,1],[0,-2],[0,2],[-2,0],[2,0],[-2,-2],[2,-2],[-2,2],[2,2],[1,-3],[-1,3],[3,1],[-3,-1],[0,-3],[0,3],[-3,0],[3,0]];
  return offsets.slice(0, Math.min(count, offsets.length)).map(([ox, oy]) => tree(cx + ox * spread, cy + oy * spread));
}

function treeForest(x0: number, y0: number, x1: number, y1: number, density: number): Entity[] {
  const trees: Entity[] = [];
  for (let y = y0; y < y1; y += density)
    for (let x = x0; x < x1; x += density)
      trees.push(tree(Math.round(x + (rand() - 0.5) * density * 0.6), Math.round(y + (rand() - 0.5) * density * 0.6)));
  return trees;
}

function rockCluster(cx: number, cy: number, count: number, spread: number): Entity[] {
  const offsets = [[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  return offsets.slice(0, Math.min(count, offsets.length)).map(([ox, oy]) => rock(cx + ox * spread, cy + oy * spread));
}

/** Trees evenly spaced along one side of a horizontal road. */
function hTreeRow(row: number, c0: number, c1: number, side: 'north' | 'south', spacing = 3): Entity[] {
  const trees: Entity[] = [];
  const yOff = side === 'north' ? -2.5 * T : 2.5 * T;
  for (let c = c0; c <= c1; c += spacing) {
    const x = c * T + T / 2 + Math.round((rand() - 0.5) * 6);
    const y = row * T + yOff + Math.round((rand() - 0.5) * 6);
    trees.push(tree(x, y));
  }
  return trees;
}

/** Trees evenly spaced along one side of a vertical road. */
function vTreeRow(col: number, r0: number, r1: number, side: 'west' | 'east', spacing = 3): Entity[] {
  const trees: Entity[] = [];
  const xOff = side === 'west' ? -2.5 * T : 2.5 * T;
  for (let r = r0; r <= r1; r += spacing) {
    const x = col * T + xOff + Math.round((rand() - 0.5) * 6);
    const y = r * T + T / 2 + Math.round((rand() - 0.5) * 6);
    trees.push(tree(x, y));
  }
  return trees;
}

/** Sparse transition trees — gradually thins out from forest to open area. */
function transitionZone(x0: number, y0: number, x1: number, y1: number): Entity[] {
  const trees: Entity[] = [];
  for (let y = y0; y < y1; y += 72)
    for (let x = x0; x < x1; x += 72) {
      if (rand() > 0.5) continue;
      trees.push(tree(Math.round(x + (rand() - 0.5) * 48), Math.round(y + (rand() - 0.5) * 48)));
    }
  return trees;
}

/** Meadow fill — very sparse individual trees for open areas. */
function meadowTrees(x0: number, y0: number, x1: number, y1: number, count: number): Entity[] {
  const trees: Entity[] = [];
  for (let i = 0; i < count; i++)
    trees.push(tree(Math.round(x0 + rand() * (x1 - x0)), Math.round(y0 + rand() * (y1 - y0))));
  return trees;
}

// ══════════════════════════════════════════
// BUILDINGS — placed along roads, facing them
// ══════════════════════════════════════════

const buildings: Building[] = [
  // ── TOWN CENTER (around the plaza, row 42-52, col 50-62) ──
  cafe('cafe-plaza', 48, 38),          // north side of plaza
  bakery('bakery-plaza', 60, 38),      // north side of plaza
  inn('inn-plaza', 48, 52),            // south side of plaza
  bookstore('bookstore-plaza', 62, 52), // south side of plaza

  // ── RESIDENTIAL (NW, west of river, along row-30 road) ──
  house('house-1', 6, 22),
  house('house-2', 20, 22),
  inn('inn-res', 6, 33),
  bakery('bakery-res', 20, 33),

  // ── COMMERCIAL STRIP (east of plaza, along main E-W road) ──
  cafe('cafe-east', 66, 38),
  market('market-east', 76, 38),
  restaurant('rest-east', 66, 48),
  bookstore('bookstore-east', 78, 48),
  bakery('bakery-far-east', 86, 38),

  // ── ARTISAN QUARTER (SE, along row-60 road) ──
  blacksmith('smith-main', 63, 62),
  market('market-artisan', 73, 62),
];

// ══════════════════════════════════════════
// OBJECTS — structured by zone
// ══════════════════════════════════════════

const objects: Entity[] = [

  // ════════════════════════════════════════
  // FORESTS — dense edges, transition zones
  // ════════════════════════════════════════

  // North forest (rows 0-14) — dense
  ...treeForest(32, 32, 1184, 416, 40),    // NW of river
  ...treeForest(1344, 32, 1728, 416, 44),  // between river and main N-S road
  ...treeForest(1856, 32, 3168, 416, 40),  // NE block

  // North forest transition (rows 14-20) — thins out toward town
  ...transitionZone(32, 448, 1184, 640),
  ...transitionZone(1344, 448, 1728, 640),
  ...transitionZone(1856, 448, 3168, 640),

  // South forest (rows 86-100) — dense
  ...treeForest(32, 2784, 1184, 3168, 40),
  ...treeForest(1344, 2784, 1728, 3168, 44),
  ...treeForest(1856, 2784, 3168, 3168, 40),

  // South forest transition (rows 80-86) — thins out
  ...transitionZone(32, 2560, 1184, 2784),
  ...transitionZone(1856, 2560, 3168, 2784),

  // East forest edge (cols 90-100)
  ...treeForest(2912, 448, 3168, 2784, 56),
  // East transition (cols 86-90)
  ...transitionZone(2752, 448, 2912, 2784),

  // West forest (cols 0-6, west of river)
  ...treeForest(32, 448, 192, 2784, 52),

  // ════════════════════════════════════════
  // ROADSIDE TREES — main E-W road
  // Both sides, evenly spaced, the map's visual backbone
  // ════════════════════════════════════════

  // Main E-W road (row 45) — west segment (to river)
  ...hTreeRow(45, 2, 36, 'north', 3),
  ...hTreeRow(45, 2, 36, 'south', 3),
  // Main E-W road — east of river to plaza
  ...hTreeRow(45, 42, 48, 'north', 3),
  ...hTreeRow(45, 42, 48, 'south', 3),
  // Main E-W road — east of plaza
  ...hTreeRow(45, 64, 88, 'north', 3),
  ...hTreeRow(45, 64, 88, 'south', 3),

  // ════════════════════════════════════════
  // ROADSIDE TREES — main N-S road
  // ════════════════════════════════════════

  ...vTreeRow(55, 16, 40, 'west', 3),
  ...vTreeRow(55, 16, 40, 'east', 3),
  ...vTreeRow(55, 52, 84, 'west', 3),
  ...vTreeRow(55, 52, 84, 'east', 3),

  // ════════════════════════════════════════
  // ROADSIDE TREES — residential street (row 30)
  // ════════════════════════════════════════

  ...hTreeRow(30, 6, 36, 'north', 4),
  ...hTreeRow(30, 6, 36, 'south', 4),

  // ════════════════════════════════════════
  // ROADSIDE TREES — residential avenue (col 15)
  // ════════════════════════════════════════

  ...vTreeRow(15, 20, 44, 'west', 4),
  ...vTreeRow(15, 20, 44, 'east', 4),

  // ════════════════════════════════════════
  // ROADSIDE TREES — artisan street (row 60)
  // ════════════════════════════════════════

  ...hTreeRow(60, 56, 82, 'north', 4),
  ...hTreeRow(60, 56, 82, 'south', 4),

  // ════════════════════════════════════════
  // RIVERSIDE VEGETATION — the river is a feature, not a divider
  // ════════════════════════════════════════

  // West bank — organic tree line with gaps
  ...vTreeRow(37, 2, 25, 'west', 4),
  ...vTreeRow(37, 32, 44, 'west', 5),
  ...vTreeRow(37, 48, 58, 'west', 5),
  ...vTreeRow(37, 62, 84, 'west', 4),

  // East bank
  ...vTreeRow(42, 2, 25, 'east', 4),
  ...vTreeRow(42, 32, 44, 'east', 5),
  ...vTreeRow(42, 48, 58, 'east', 5),
  ...vTreeRow(42, 62, 84, 'east', 4),

  // River rocks (along banks, natural feel)
  ...rockCluster(37 * T - 48, 320, 4, 28),
  ...rockCluster(42 * T + 128, 640, 3, 32),
  ...rockCluster(37 * T - 48, 1200, 3, 28),
  ...rockCluster(42 * T + 128, 1800, 4, 28),
  ...rockCluster(37 * T - 48, 2400, 3, 32),
  // Bushes along riverbanks (soften the edge)
  bush(36 * T, 12 * T), bush(36 * T, 20 * T), bush(36 * T, 36 * T),
  bush(43 * T, 16 * T), bush(43 * T, 24 * T), bush(43 * T, 40 * T),
  bush(36 * T, 54 * T), bush(36 * T, 66 * T), bush(36 * T, 76 * T),
  bush(43 * T, 50 * T), bush(43 * T, 62 * T), bush(43 * T, 72 * T),
  // Flowers near bridges
  flowers(36 * T, 44 * T), flowers(42 * T, 44 * T),
  flowers(36 * T, 47 * T), flowers(42 * T, 47 * T),
  flowers(36 * T, 57 * T), flowers(42 * T, 59 * T),
  // Lamp posts at bridges
  lampPost(37 * T, 44 * T), lampPost(42 * T, 44 * T),
  lampPost(37 * T, 47 * T), lampPost(42 * T, 47 * T),

  // ════════════════════════════════════════
  // STREET LAMPS — along main roads for cozy feel
  // ════════════════════════════════════════

  // Main E-W road lamps
  ...hLamps(45, 4, 36, 8),
  ...hLamps(45, 42, 48, 8),
  ...hLamps(45, 64, 88, 8),
  // Main N-S road lamps
  ...vLamps(55, 16, 40, 8),
  ...vLamps(55, 52, 84, 8),
  // Residential street lamps
  ...hLamps(30, 8, 34, 8),
  // Commercial / artisan lamps
  ...hLamps(60, 58, 80, 8),

  // ════════════════════════════════════════
  // TOWN CENTER — plaza as the heart of the village
  // ════════════════════════════════════════

  // Corner trees (like a village green)
  tree(50 * T, 42 * T), tree(62 * T, 42 * T),
  tree(50 * T, 50 * T + T), tree(62 * T, 50 * T + T),
  // Interior trees (2 flanking the center)
  tree(53 * T, 46 * T), tree(59 * T, 46 * T),
  // WELL — central landmark
  well(56 * T, 46 * T),
  // Benches around the well (facing inward)
  bench(54 * T, 44 * T), bench(58 * T, 44 * T),
  bench(54 * T, 48 * T), bench(58 * T, 48 * T),
  // Flower beds around plaza edges
  flowers(51 * T, 43 * T), flowers(53 * T, 43 * T),
  flowers(59 * T, 43 * T), flowers(61 * T, 43 * T),
  flowers(51 * T, 50 * T), flowers(53 * T, 50 * T),
  flowers(59 * T, 50 * T), flowers(61 * T, 50 * T),
  // Signpost at plaza entrance
  signpost(50 * T, 46 * T),
  // Lamp posts at plaza corners
  lampPost(50 * T + T, 43 * T), lampPost(61 * T, 43 * T),
  lampPost(50 * T + T, 50 * T), lampPost(61 * T, 50 * T),

  // ════════════════════════════════════════
  // RESIDENTIAL ZONE — garden trees near houses
  // ════════════════════════════════════════

  // Between houses (tidy, 1-2 per gap)
  tree(14 * T, 24 * T), tree(14 * T, 28 * T),
  tree(28 * T, 24 * T), tree(28 * T, 28 * T),
  tree(14 * T, 36 * T), tree(14 * T, 40 * T),
  tree(28 * T, 36 * T), tree(28 * T, 40 * T),
  // Garden fences between properties
  fence(14 * T, 26 * T), fence(14 * T, 30 * T),
  fence(28 * T, 26 * T), fence(28 * T, 30 * T),
  // Flower gardens next to houses
  flowers(10 * T, 25 * T), flowers(10 * T, 27 * T),
  flowers(24 * T, 25 * T), flowers(24 * T, 27 * T),
  flowers(10 * T, 35 * T), flowers(10 * T, 37 * T),
  flowers(24 * T, 35 * T), flowers(24 * T, 37 * T),
  // Log piles near houses (cozy, lived-in)
  logPile(5 * T, 28 * T), logPile(30 * T, 40 * T),
  // Residential benches
  bench(16 * T, 26 * T), bench(16 * T, 38 * T),

  // Residential area meadow fill with bushes
  ...meadowTrees(5 * T, 20 * T, 34 * T, 44 * T, 15),
  bush(10 * T, 32 * T), bush(20 * T, 34 * T), bush(30 * T, 32 * T),

  // ════════════════════════════════════════
  // COMMERCIAL ZONE — street trees along shops
  // ════════════════════════════════════════

  // Trees between commercial buildings
  tree(74 * T, 40 * T), tree(84 * T, 40 * T),
  tree(74 * T, 50 * T), tree(84 * T, 50 * T),
  // Bushes along shopfronts
  bush(66 * T, 42 * T), bush(72 * T, 42 * T),
  bush(80 * T, 42 * T), bush(88 * T, 42 * T),
  // Flower pots outside shops
  flowers(70 * T, 40 * T), flowers(82 * T, 40 * T),
  flowers(70 * T, 50 * T), flowers(82 * T, 50 * T),
  // Benches for shoppers
  bench(72 * T, 44 * T), bench(82 * T, 44 * T),
  // Signposts at commercial zone entrance
  signpost(64 * T, 42 * T),

  // ════════════════════════════════════════
  // PARK / POND (SW, rows 48-75, west of river)
  // Peaceful area — open with clusters + meadow trees
  // ════════════════════════════════════════

  // Park clusters — organic, not uniform
  ...treeCluster(8 * T, 54 * T, 8, 48),
  ...treeCluster(24 * T, 52 * T, 6, 52),
  ...treeCluster(12 * T, 64 * T, 10, 44),
  ...treeCluster(28 * T, 68 * T, 6, 48),

  // Meadow trees (sparse, breathing room)
  ...meadowTrees(4 * T, 48 * T, 34 * T, 74 * T, 12),

  // Park benches (proper benches now!)
  bench(10 * T, 56 * T), bench(10 * T, 60 * T),
  bench(20 * T, 54 * T), bench(20 * T, 66 * T),
  bench(26 * T, 58 * T),
  // Flower beds along park paths
  flowers(14 * T, 50 * T), flowers(14 * T, 52 * T),
  flowers(14 * T, 62 * T), flowers(14 * T, 64 * T),
  flowers(16 * T, 68 * T), flowers(18 * T, 68 * T),
  // Bushes scattered in park
  bush(6 * T, 52 * T), bush(30 * T, 56 * T),
  bush(8 * T, 66 * T), bush(26 * T, 70 * T),
  // Signpost at park entrance
  signpost(15 * T, 48 * T),
  // Decorative rocks (natural, by water features)
  rock(8 * T, 70 * T), rock(24 * T, 72 * T),

  // ════════════════════════════════════════
  // ARTISAN QUARTER — work rocks + sparse trees
  // ════════════════════════════════════════

  ...rockCluster(68 * T, 58 * T, 5, 32),
  ...rockCluster(76 * T, 56 * T, 4, 36),
  tree(62 * T, 56 * T), tree(80 * T, 56 * T),
  tree(62 * T, 66 * T), tree(80 * T, 66 * T),
  // Log piles near workshops
  logPile(64 * T, 64 * T), logPile(78 * T, 64 * T),
  // Signpost at artisan entrance
  signpost(56 * T, 56 * T),

  // ════════════════════════════════════════
  // SW FARM — open with scattered rocks + few trees
  // ════════════════════════════════════════

  ...meadowTrees(4 * T, 76 * T, 34 * T, 84 * T, 8),
  ...rockCluster(12 * T, 78 * T, 4, 40),
  ...rockCluster(28 * T, 78 * T, 3, 36),
  rock(18 * T, 80 * T), rock(22 * T, 82 * T),
  // Farm feel — log piles and fences
  logPile(8 * T, 76 * T), logPile(24 * T, 76 * T),
  fence(10 * T, 76 * T), fence(12 * T, 76 * T), fence(14 * T, 76 * T),
  fence(20 * T, 76 * T), fence(22 * T, 76 * T),
  // Wildflowers in the meadow
  flowers(8 * T, 78 * T), flowers(16 * T, 80 * T),
  flowers(26 * T, 78 * T), flowers(20 * T, 82 * T),
  bush(6 * T, 80 * T), bush(30 * T, 80 * T),

  // ════════════════════════════════════════
  // MID-MAP FILL — meadow trees in the open grass
  // between zones so it's not barren
  // ════════════════════════════════════════

  // Between residential and river (east of col 30, north of E-W road)
  ...meadowTrees(30 * T, 16 * T, 36 * T, 44 * T, 8),
  // East of river, between road and commercial (cols 42-48)
  ...meadowTrees(42 * T, 16 * T, 48 * T, 40 * T, 10),
  // South of artisan, east side
  ...meadowTrees(58 * T, 64 * T, 86 * T, 82 * T, 15),
  // SW between park and south forest
  ...meadowTrees(4 * T, 74 * T, 34 * T, 84 * T, 6),
  // NE fill (cols 60-86, rows 16-38)
  ...meadowTrees(60 * T, 16 * T, 86 * T, 36 * T, 18),
  // NE bushes and flowers (soften the commercial area)
  bush(62 * T, 20 * T), bush(72 * T, 22 * T), bush(82 * T, 20 * T),
  flowers(66 * T, 24 * T), flowers(76 * T, 26 * T), flowers(86 * T, 24 * T),
  // SE fill (cols 60-86, rows 62-82)
  ...meadowTrees(60 * T, 62 * T, 86 * T, 82 * T, 12),
  // SE bushes and wildflowers
  bush(64 * T, 72 * T), bush(76 * T, 70 * T), bush(84 * T, 74 * T),
  flowers(62 * T, 68 * T), flowers(72 * T, 76 * T), flowers(82 * T, 68 * T),
  flowers(68 * T, 80 * T), flowers(78 * T, 78 * T),

  // ════════════════════════════════════════
  // BUILDING-ADJACENT TREES (1-2 per building, not blocking doors)
  // ════════════════════════════════════════

  // Plaza buildings
  tree(47 * T, 40 * T), tree(63 * T, 40 * T),       // north of plaza bldgs
  tree(47 * T, 55 * T), tree(66 * T, 55 * T),       // south of plaza bldgs

  // Commercial strip
  tree(64 * T, 38 * T), tree(90 * T, 38 * T),
  tree(64 * T, 52 * T), tree(82 * T, 52 * T),
  flowers(66 * T, 36 * T), flowers(80 * T, 36 * T),

  // Artisan
  tree(60 * T, 60 * T), tree(78 * T, 60 * T),

  // ════════════════════════════════════════
  // FOREST ENTRANCE MARKERS
  // ════════════════════════════════════════

  // North forest entrance (main road going north)
  signpost(54 * T, 16 * T),
  lampPost(54 * T, 14 * T), lampPost(57 * T, 14 * T),
  // South forest entrance
  signpost(54 * T, 86 * T),
  lampPost(54 * T, 86 * T + T), lampPost(57 * T, 86 * T + T),
  // Residential forest path entrance
  signpost(15 * T, 18 * T),
];

// ══════════════════════════════════════════
// NPCs
// ══════════════════════════════════════════

const npcs: NPCData[] = [
  // Town center
  npc(56 * T, 46 * T, 'Elder', ['Welcome to the village!', 'The plaza is our gathering place.', 'Head west for homes, east for shops.']),
  npc(54 * T, 48 * T, 'Child', ['Tag! You\'re it!', 'Catch me if you can!']),

  // Residential
  npc(15 * T, 28 * T, 'Neighbor', ['Morning! Lovely day.', 'The bakery down the road is wonderful.']),
  npc(10 * T, 40 * T, 'Gardener', ['I tend the gardens here.', 'Each house has its own little patch.']),

  // Commercial
  npc(72 * T, 44 * T, 'Shopper', ['So many shops!', 'The bookstore is my favorite.']),
  npc(82 * T, 44 * T, 'Trader', ['Fresh goods every day!', 'The market has everything.']),

  // River / bridge
  npc(38 * T, 44 * T, 'Bridge Keeper', ['This bridge is the heart of town.', 'The river is beautiful at sunset.']),
  npc(36 * T, 52 * T, 'Fisher', ['The river is full of fish!', 'Well, placeholder fish.']),

  // Park
  npc(16 * T, 56 * T, 'Old Man', ['The park is so peaceful.', 'I come here every afternoon.']),
  npc(24 * T, 66 * T, 'Jogger', ['Just doing my laps!', 'The paths are perfect for running.']),

  // Artisan
  npc(68 * T, 58 * T, 'Apprentice', ['Learning the trade.', 'The blacksmith is a tough teacher!']),

  // Forest entrances
  npc(55 * T, 14 * T, 'Ranger', ['The north forest is dense.', 'Stay on the path, traveler.']),
  npc(55 * T, 86 * T, 'Hermit', ['I live at the edge of the south woods.', 'Quiet here. I like it.']),

  // Roaming
  npc(45 * T, 30 * T, 'Traveler', ['Long road from the west.', 'Worth the journey though.']),
  npc(70 * T, 46 * T, 'Courier', ['Deliveries! Coming through!']),
  npc(55 * T, 70 * T, 'Walker', ['Just enjoying a stroll south.', 'The meadows are lovely.']),
];

// ══════════════════════════════════════════
// FILTER
// ══════════════════════════════════════════

const mapTiles = makeTiles();

function isNearBuilding(ox: number, oy: number): boolean {
  for (const b of buildings) {
    const left = b.x - 100, right = b.x + 100;
    const top = b.y - 132, bottom = b.y + 40;
    if (ox >= left && ox <= right && oy >= top && oy <= bottom) return true;
    if (ox >= b.x - 36 && ox <= b.x + 36 && oy >= bottom && oy <= b.y + 72) return true;
  }
  return false;
}

function isOnTile(ox: number, oy: number, ...types: TileType[]): boolean {
  const col = Math.floor(ox / T), row = Math.floor(oy / T);
  if (row < 0 || row >= H || col < 0 || col >= W) return false;
  return types.includes(mapTiles[row][col]);
}

const filteredObjects = objects.filter(o =>
  !isNearBuilding(o.x, o.y) && !isOnTile(o.x, o.y, TileType.WATER, TileType.BRIDGE, TileType.PATH)
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
    { id: 'default', x: 56 * T, y: 47 * T, facing: 'down' },
    { id: 'house-exit', x: 56 * T, y: 46 * T, facing: 'down' },
  ],
};
