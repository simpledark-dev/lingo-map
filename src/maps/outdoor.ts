import { MapData, TileType, Entity, Building, NPCData } from '../core/types';

// ══════════════════════════════════════════════════════════════
// MAP DESIGN OVERVIEW (100×100 tiles)
//
// ┌─────────────────────────────────────────────────────────┐
// │  NORTH FOREST          │ river │    NORTH FOREST        │
// │  (dense, clearings)    │  ↓↓↓ │                        │
// │────────────────────────┤       ├────────────────────────│
// │                        │       │                        │
// │  RESIDENTIAL ZONE      │       │   COMMERCIAL ZONE      │
// │  house, inn            │       │   cafe, bakery, market  │
// │  (buildings on roads)  │       │   restaurant, bookstore │
// │                        │       │                        │
// │──── secondary road ────[bridge]──── secondary road ─────│
// │                        │       │                        │
// │  ════ MAIN EAST-WEST ROAD ═══[BRIDGE]═══════════════   │
// │                        │  ↓↓↓  │                        │
// │──── TOWN PLAZA ────────┤       ├────────────────────────│
// │  (central landmark)    │       │    ARTISAN ZONE        │
// │                        │       │    blacksmith, etc.     │
// │────────────────────────┤       ├────────────────────────│
// │                        │       │                        │
// │  PARK / POND           │  ↓↓↓  │   SOUTH MEADOW         │
// │  (open, peaceful)      │       │   (open grass, rocks)  │
// │                        │       │                        │
// │────────────────────────┤       ├────────────────────────│
// │  SOUTH FOREST          │  exit │   SOUTH FOREST         │
// └─────────────────────────────────────────────────────────┘
//
// River: col 30-32, flows top to bottom
// Main N-S road: col 50-51
// Main E-W road: row 48-49
// Secondary roads connect zones to main roads
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

  // ─── RIVER (col 30-32, full height) ───
  for (let r = 0; r < H; r++) {
    // Gentle meander
    let offset = 0;
    if (r >= 20 && r < 35) offset = 1;
    if (r >= 55 && r < 70) offset = -1;
    if (r >= 80) offset = 1;
    for (let w = 0; w < 3; w++) set(r, 30 + offset + w, WA);
  }

  // ─── MAIN ROADS ───
  // Main east-west road (row 48-49) — the spine of the town
  hRoad(48, 0, 99, 2);
  // Main north-south road (col 50-51)
  vRoad(50, 0, 99, 2);

  // ─── BRIDGES (where main roads cross river) ───
  // E-W bridge at rows 48-49
  for (let w = 0; w < 2; w++)
    for (let c = 0; c < W; c++)
      if (tiles[48 + w][c] === WA) set(48 + w, c, BR);
  // N-S road doesn't cross the river (it's east of it)

  // ─── SECONDARY ROADS ───
  // Residential connector (west side, row 30) — from river bridge to residential
  hRoad(30, 5, 50);
  // Bridge for residential road
  for (let c = 0; c < W; c++)
    if (tiles[30][c] === WA) set(30, c, BR);

  // Commercial connector (east side, row 30) — branches east
  hRoad(30, 50, 92);

  // Southern connector (row 65)
  hRoad(65, 5, 92);
  for (let c = 0; c < W; c++)
    if (tiles[65][c] === WA) set(65, c, BR);

  // Western avenue (col 15) — residential street, west of river
  vRoad(15, 20, 72);
  // Eastern avenue (col 75) — commercial/artisan east
  vRoad(75, 20, 80);

  // ─── TOWN PLAZA (the heart — rows 44-53, cols 45-56) ───
  rect(44, 45, 53, 56, P);

  // ─── BUILDING APPROACH PATHS (short spurs from roads) ───
  // Residential zone (west) — paths from roads to building rows
  vRoad(8, 24, 30);   // to residential row 1
  vRoad(18, 24, 30);
  vRoad(8, 42, 48);   // to residential row 2
  vRoad(18, 42, 48);

  // Commercial zone (east) — paths from roads to shops
  vRoad(60, 24, 30);
  vRoad(70, 24, 30);
  vRoad(85, 24, 30);

  // Artisan zone (SE) — paths to blacksmith, workshops
  vRoad(60, 57, 65);
  vRoad(70, 57, 65);

  // Park paths (SW)
  hRoad(72, 6, 28);
  vRoad(12, 65, 78);
  vRoad(22, 65, 78);

  // Forest entrance paths
  vRoad(15, 8, 20);    // north into forest from residential
  vRoad(50, 0, 10, 2); // main road continues north into forest
  vRoad(50, 90, 99, 2); // main road south exit

  // ─── FOREST PATHS (winding, narrow) ───
  // North forest trail (west side)
  for (let r = 2; r <= 18; r++) {
    const c = 8 + Math.round(Math.sin(r * 0.5) * 2);
    set(r, c, P);
  }
  // South forest trail
  for (let r = 82; r <= 96; r++) {
    const c = 60 + Math.round(Math.sin(r * 0.4) * 3);
    set(r, c, P);
  }

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

// ── Building factories ──

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

/** Evenly-spaced trees along both sides of a horizontal road. */
function hRoadsideTrees(row: number, c0: number, c1: number, spacing = 4): Entity[] {
  const trees: Entity[] = [];
  const y = row * T;
  for (let c = c0; c <= c1; c += spacing) {
    const x = c * T + T / 2;
    trees.push(tree(x + Math.round((rand() - 0.5) * 8), y - 2 * T + Math.round((rand() - 0.5) * 8)));
    trees.push(tree(x + Math.round((rand() - 0.5) * 8), y + 3 * T + Math.round((rand() - 0.5) * 8)));
  }
  return trees;
}

/** Evenly-spaced trees along both sides of a vertical road. */
function vRoadsideTrees(col: number, r0: number, r1: number, spacing = 4): Entity[] {
  const trees: Entity[] = [];
  const x = col * T;
  for (let r = r0; r <= r1; r += spacing) {
    const y = r * T + T / 2;
    trees.push(tree(x - 2 * T + Math.round((rand() - 0.5) * 8), y + Math.round((rand() - 0.5) * 8)));
    trees.push(tree(x + 3 * T + Math.round((rand() - 0.5) * 8), y + Math.round((rand() - 0.5) * 8)));
  }
  return trees;
}

/** Transition zone: sparse trees graduating from open area toward forest. */
function transitionTrees(x0: number, y0: number, x1: number, y1: number): Entity[] {
  const trees: Entity[] = [];
  for (let y = y0; y < y1; y += 80)
    for (let x = x0; x < x1; x += 80) {
      if (rand() > 0.55) continue;
      trees.push(tree(Math.round(x + (rand() - 0.5) * 56), Math.round(y + (rand() - 0.5) * 56)));
    }
  return trees;
}

// ══════════════════════════════════════════
// BUILDINGS — placed along roads, grouped by zone
// ══════════════════════════════════════════

const buildings: Building[] = [
  // ── RESIDENTIAL ZONE (west of river, rows 22-47) ──
  // Row 1: along secondary road at row 30, facing south
  house('house-main', 6, 24),         // player's house
  inn('inn-village', 16, 24),         // village inn

  // Row 2: south residential, along main E-W road, facing south
  house('house-south', 6, 42),
  bakery('bakery-west', 16, 42),      // neighborhood bakery

  // ── COMMERCIAL ZONE (east of main N-S road, rows 22-42) ──
  // Along commercial road at row 30
  cafe('cafe-main', 58, 24),           // main cafe
  bookstore('bookstore', 70, 24),      // bookstore
  market('market-main', 58, 35),       // market (south of road)
  restaurant('rest-main', 72, 35),     // restaurant

  // ── TOWN CENTER (around the plaza, rows 44-55) ──
  // Flanking the plaza — the most prominent buildings
  bakery('bakery-central', 40, 44),    // west of plaza
  cafe('cafe-plaza', 58, 44),          // east of plaza

  // ── ARTISAN ZONE (SE, rows 55-70) ──
  blacksmith('smith-main', 58, 58),    // blacksmith
  market('market-south', 68, 58),      // south market

  // ── SOUTHERN SETTLEMENT (along row 65 road) ──
  inn('inn-south', 58, 68),            // traveler's inn
  bookstore('bookstore-south', 70, 68),
];

// ══════════════════════════════════════════
// NATURE — structured zones, not random scatter
// ══════════════════════════════════════════

const objects: Entity[] = [

  // ════════════════════════════════════
  // 1. ROADSIDE TREES — every road gets lined
  // Pattern: grass → trees → road → trees → grass
  // ════════════════════════════════════

  // Main E-W road (row 48-49) — full length, spacing 5
  ...hRoadsideTrees(48, 2, 28, 5),    // west of river
  ...hRoadsideTrees(48, 34, 47, 5),   // between river and plaza
  ...hRoadsideTrees(48, 57, 96, 5),   // east of plaza

  // Main N-S road (col 50-51) — full length, spacing 5
  ...vRoadsideTrees(50, 2, 18, 5),    // north forest section
  ...vRoadsideTrees(50, 22, 43, 5),   // north town
  ...vRoadsideTrees(50, 54, 63, 5),   // between plaza and south road
  ...vRoadsideTrees(50, 67, 84, 5),   // south section
  ...vRoadsideTrees(50, 88, 96, 5),   // south forest section

  // Secondary H road — row 30 (residential/commercial connector)
  ...hRoadsideTrees(30, 6, 28, 5),    // west (residential side)
  ...hRoadsideTrees(30, 34, 48, 5),   // between river and main road
  ...hRoadsideTrees(30, 53, 74, 6),   // east (commercial side)
  ...hRoadsideTrees(30, 77, 92, 6),   // far east

  // Secondary H road — row 65 (southern connector)
  ...hRoadsideTrees(65, 6, 28, 5),    // west (park side)
  ...hRoadsideTrees(65, 34, 48, 5),   // between river and main
  ...hRoadsideTrees(65, 53, 74, 6),   // east
  ...hRoadsideTrees(65, 77, 92, 6),   // far east

  // Western avenue (col 15) — residential street
  ...vRoadsideTrees(15, 22, 28, 4),   // north section
  ...vRoadsideTrees(15, 32, 46, 4),   // mid section
  ...vRoadsideTrees(15, 50, 63, 4),   // south toward park
  ...vRoadsideTrees(15, 67, 72, 4),   // park entrance

  // Eastern avenue (col 75) — commercial/artisan
  ...vRoadsideTrees(75, 22, 28, 4),
  ...vRoadsideTrees(75, 32, 46, 4),
  ...vRoadsideTrees(75, 50, 63, 4),
  ...vRoadsideTrees(75, 67, 80, 4),

  // ════════════════════════════════════
  // 2. TRANSITION ZONES — forest edge → town
  // Gradually sparse as you approach buildings
  // ════════════════════════════════════

  // North forest → town (rows 16-22, the thinning zone)
  ...transitionTrees(64, 576, 896, 704),     // NW transition
  ...transitionTrees(1088, 576, 1568, 704),  // N-center-left
  ...transitionTrees(1700, 576, 2400, 704),  // N-center-right
  ...transitionTrees(2500, 576, 3136, 704),  // NE transition

  // South forest → town (rows 78-84)
  ...transitionTrees(64, 2560, 928, 2720),
  ...transitionTrees(1088, 2560, 1568, 2720),
  ...transitionTrees(1700, 2560, 2400, 2720),
  ...transitionTrees(2500, 2560, 3136, 2720),

  // East forest → town (cols 82-88)
  ...transitionTrees(2656, 640, 2816, 1440),
  ...transitionTrees(2656, 1760, 2816, 2720),

  // West forest → river (cols 6-9)
  ...transitionTrees(224, 640, 416, 1440),
  ...transitionTrees(224, 1760, 416, 2720),

  // ════════════════════════════════════
  // 3. BUILDING-ADJACENT TREES (1-3 per building, not blocking doors)
  // ════════════════════════════════════

  // Residential — house (col 8, row 24)
  tree(160, 768), tree(448, 736),
  rock(352, 800),
  // Residential — inn (col 18, row 24)
  tree(736, 768), tree(480, 736),
  // Residential — house south (col 8, row 42)
  tree(160, 1376), tree(448, 1344),
  rock(352, 1408),
  // Residential — bakery (col 18, row 42)
  tree(736, 1376), tree(480, 1344),

  // Commercial — cafe (col 58, row 24)
  tree(1824, 768), tree(2016, 736),
  // Commercial — bookstore (col 70, row 24)
  tree(2336, 768), tree(2144, 736),
  rock(2240, 800),
  // Commercial — market (col 58, row 35)
  tree(1824, 1152), tree(2016, 1184),
  // Commercial — restaurant (col 72, row 35)
  tree(2464, 1152), tree(2272, 1184),
  rock(2368, 1216),

  // Plaza — bakery west (col 40, row 44)
  tree(1216, 1408), tree(1344, 1376),
  // Plaza — cafe east (col 58, row 44)
  tree(1952, 1408), tree(2016, 1376),

  // Artisan — blacksmith (col 58, row 58)
  tree(1824, 1888), rock(2016, 1920),
  // Artisan — market south (col 68, row 58)
  tree(2272, 1888), rock(2144, 1920),

  // Southern — inn (col 58, row 68)
  tree(1824, 2208), tree(2016, 2176),
  // Southern — bookstore (col 70, row 68)
  tree(2336, 2208), rock(2240, 2240),

  // ════════════════════════════════════
  // 4. FORESTS (existing, unchanged)
  // ════════════════════════════════════

  // North forest — dense
  ...treeForest(64, 64, 896, 576, 44),
  ...treeForest(1088, 64, 1568, 384, 48),
  ...treeForest(1700, 64, 3136, 384, 48),
  ...treeForest(1088, 416, 1500, 576, 52),
  ...treeForest(1700, 416, 2400, 576, 52),
  ...treeForest(2500, 384, 3136, 576, 48),

  // Ancient Grove landmark
  ...treeCluster(2048, 256, 12, 52),

  // South forest
  ...treeForest(64, 2720, 928, 3136, 48),
  ...treeForest(1088, 2720, 1568, 3136, 52),
  ...treeForest(1700, 2720, 2400, 3136, 52),
  ...treeForest(2500, 2720, 3136, 3136, 48),

  // East forest edge
  ...treeForest(2816, 640, 3136, 1440, 64),
  ...treeForest(2816, 1760, 3136, 2720, 64),

  // West forest (thin, west of river)
  ...treeForest(32, 640, 256, 1440, 60),
  ...treeForest(32, 1760, 256, 2720, 60),

  // ════════════════════════════════════
  // 5. RIVERSIDE VEGETATION (existing, unchanged)
  // ════════════════════════════════════

  tree(832, 320), tree(800, 640), tree(864, 960),
  tree(816, 1280), tree(848, 1504), tree(800, 1760),
  tree(864, 2048), tree(816, 2336), tree(848, 2624), tree(800, 2880),
  tree(1120, 256), tree(1088, 544), tree(1120, 832),
  tree(1088, 1120), tree(1120, 1408), tree(1088, 1696),
  tree(1120, 2016), tree(1088, 2304), tree(1120, 2592), tree(1088, 2880),

  ...rockCluster(864, 480, 3, 32),
  ...rockCluster(1088, 800, 3, 28),
  ...rockCluster(864, 1600, 4, 30),
  ...rockCluster(1088, 2080, 3, 32),
  ...rockCluster(864, 2720, 3, 28),

  // ════════════════════════════════════
  // 6. TOWN PLAZA LANDMARK
  // ════════════════════════════════════

  tree(1472, 1440), tree(1792, 1440),
  tree(1472, 1728), tree(1792, 1728),
  rock(1600, 1536), rock(1632, 1536),
  rock(1600, 1600), rock(1632, 1600),

  // ════════════════════════════════════
  // 7. PARK / POND (SW)
  // ════════════════════════════════════

  ...treeCluster(320, 2240, 8, 52),
  ...treeCluster(640, 2368, 6, 48),
  ...treeCluster(256, 2560, 5, 56),
  ...treeCluster(704, 2528, 4, 52),
  rock(448, 2304), rock(448, 2432),
  rock(576, 2304), rock(576, 2432),
  tree(384, 2176), tree(512, 2176), tree(640, 2176),
  tree(192, 2432), tree(768, 2432),

  // ════════════════════════════════════
  // 8. SOUTH MEADOW (SE) — intentionally sparse
  // ════════════════════════════════════

  tree(2048, 2368), tree(2304, 2432),
  tree(2560, 2304), tree(2176, 2560), tree(2432, 2560),
  rock(2112, 2400), rock(2368, 2496), rock(2240, 2624),

  // ════════════════════════════════════
  // 9. ARTISAN ZONE ROCKS
  // ════════════════════════════════════

  ...rockCluster(1984, 1920, 5, 32),
  ...rockCluster(2240, 2016, 4, 36),

  // ════════════════════════════════════
  // 10. FOREST EDGE ROCKS
  // ════════════════════════════════════

  ...rockCluster(640, 544, 5, 36),
  ...rockCluster(1920, 544, 4, 40),
  ...rockCluster(2720, 544, 5, 36),
  ...rockCluster(640, 2752, 4, 36),
  ...rockCluster(2080, 2784, 5, 32),
  ...rockCluster(2720, 2752, 4, 36),
];

// ══════════════════════════════════════════
// NPCs — placed at meaningful locations
// ══════════════════════════════════════════

const npcs: NPCData[] = [
  // Town plaza (the gathering point)
  npc(1600, 1600, 'Elder', ['Welcome to our village!', 'The plaza is the heart of our community.', 'Head west for homes, east for shops.']),
  npc(1536, 1696, 'Child', ['Tag! You\'re it!', 'The plaza is the best place to play.']),

  // Residential zone
  npc(384, 960, 'Neighbor', ['Morning! Lovely neighborhood, isn\'t it?', 'The baker next door is the best.']),
  npc(576, 1440, 'Gardener', ['I tend the gardens along this street.', 'Each house has its own little patch.']),

  // Commercial zone
  npc(2080, 832, 'Shopper', ['So many shops on this street!', 'The bookstore is my favorite.']),
  npc(2400, 960, 'Trader', ['The market has everything you need.', 'Fresh goods every day.']),

  // Near the river / bridge
  npc(1024, 1568, 'Bridge Keeper', ['This bridge connects the two halves of town.', 'The river is beautiful at sunset.']),
  npc(960, 960, 'Fisher', ['The river is full of fish!', 'Placeholder fish, but still.']),

  // Park area
  npc(448, 2368, 'Old Man', ['I come here every afternoon.', 'The park is so peaceful.', 'Listen to the water...']),
  npc(640, 2496, 'Jogger', ['Just doing my laps!', 'The park trail is perfect for running.']),

  // Artisan zone
  npc(2048, 1920, 'Apprentice', ['I\'m learning the trade.', 'The blacksmith is a tough teacher.']),

  // Forest entrances
  npc(512, 640, 'Ranger', ['The north forest is dense.', 'Stay on the paths, traveler.']),
  npc(1600, 320, 'Scout', ['I patrol the northern approach.', 'All clear today.']),

  // South
  npc(1600, 2880, 'Hermit', ['I live at the edge of the south woods.', 'It\'s quiet here. I like it.']),
  npc(2240, 2432, 'Naturalist', ['The meadow wildflowers are lovely.', 'If only we had flower assets...']),

  // Roads / travelers
  npc(800, 1568, 'Traveler', ['The road from west is long.', 'But the village is worth the journey.']),
  npc(2560, 1568, 'Courier', ['Deliveries! Coming through!', 'The commercial district keeps me busy.']),
  npc(1600, 1200, 'Villager', ['Heading to the shops.', 'Need to pick up some bread.']),
  npc(1600, 2112, 'Walker', ['Just enjoying a stroll south.', 'The park is lovely this time of year.']),
];

// ══════════════════════════════════════════
// FILTER: remove objects overlapping buildings, water, or paths
// ══════════════════════════════════════════

const mapTiles = makeTiles();

function isNearBuilding(ox: number, oy: number): boolean {
  for (const b of buildings) {
    const left = b.x - 100, right = b.x + 100;
    const top = b.y - 132, bottom = b.y + 40;
    const doorBottom = b.y + 72;
    if (ox >= left && ox <= right && oy >= top && oy <= bottom) return true;
    if (ox >= b.x - 36 && ox <= b.x + 36 && oy >= bottom && oy <= doorBottom) return true;
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
    { id: 'default', x: 1600, y: 1632, facing: 'down' },
    { id: 'house-exit', x: 1600, y: 1536, facing: 'down' },
  ],
};
