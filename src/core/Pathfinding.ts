import { MapData, Entity, Building, NPCData, Position, CollisionBox, TileType } from './types';
import { getWorldCollisionBox, checkAABBOverlap, WorldBox } from './CollisionSystem';

// Pathfinding cell size in world pixels. Currently equal to the engine
// tile size (16), so each path-grid cell maps 1:1 to a tile — paths
// step in tile-aligned increments. Halve this for sub-tile precision
// (smoother diagonals at the cost of ~4× more A* work). Earlier comment
// claimed "half a tile" but the value was always one tile.
const GRID_CELL = 16;

/**
 * Build a walkability grid for pathfinding.
 * Each cell is true = walkable, false = blocked.
 * Uses a finer grid than tile size for smoother navigation.
 */
export function buildWalkGrid(
  map: MapData,
  objects: Entity[],
  buildings: Building[],
  playerCollisionBox: CollisionBox,
): boolean[][] {
  const cols = Math.ceil((map.width * map.tileSize) / GRID_CELL);
  const rows = Math.ceil((map.height * map.tileSize) / GRID_CELL);
  const grid: boolean[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      // Check if the player's collision box at this cell center would collide
      const cx = c * GRID_CELL + GRID_CELL / 2;
      const cy = r * GRID_CELL + GRID_CELL / 2;
      row.push(isCellWalkable(cx, cy, map, objects, buildings, playerCollisionBox));
    }
    grid.push(row);
  }

  return grid;
}

function isCellWalkable(
  cx: number, cy: number,
  map: MapData, objects: Entity[], buildings: Building[],
  pcb: CollisionBox,
): boolean {
  const box: WorldBox = {
    x: cx + pcb.offsetX,
    y: cy + pcb.offsetY,
    width: pcb.width,
    height: pcb.height,
  };

  // Tile check
  const startCol = Math.floor(box.x / map.tileSize);
  const endCol = Math.floor((box.x + box.width - 1) / map.tileSize);
  const startRow = Math.floor(box.y / map.tileSize);
  const endRow = Math.floor((box.y + box.height - 1) / map.tileSize);

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (r < 0 || r >= map.height || c < 0 || c >= map.width) return false;
      const t = map.tiles[r][c];
      if (
        t === TileType.WALL ||
        t === TileType.WALL_INTERIOR ||
        t === TileType.WALL_INTERIOR_TOP ||
        t === TileType.WALL_INTERIOR_TOP_LEFT ||
        t === TileType.WALL_INTERIOR_TOP_CORNER_BL ||
        t === TileType.WALL_INTERIOR_TOP_CORNER_INNER_TR ||
        t === TileType.WALL_INTERIOR_TOP_BL ||
        t === TileType.WALL_INTERIOR_TOP_BR ||
        t === TileType.WALL_INTERIOR_BOTTOM ||
        t === TileType.WALL_INTERIOR_LEFT ||
        t === TileType.WALL_INTERIOR_RIGHT ||
        t === TileType.WALL_INTERIOR_CORNER_BOTTOM_LEFT ||
        t === TileType.WALL_INTERIOR_CORNER_BOTTOM_RIGHT ||
        t === TileType.WATER ||
        t === TileType.VOID
      ) return false;
    }
  }

  // Static collidable objects + buildings only. NPCs were previously
  // included here, but they wander at runtime — baking their starting
  // positions into the grid meant after a few seconds the grid lied
  // (cells where NPCs USED to be looked blocked, cells where they
  // currently stand looked free). NPC blocking is now checked
  // dynamically inside `findPath`.
  for (const obj of objects) {
    if (obj.collisionBox.width === 0) continue; // skip decor
    const ob = getWorldCollisionBox(obj.x, obj.y, obj.collisionBox);
    if (checkAABBOverlap(box, ob)) return false;
  }
  for (const b of buildings) {
    const bb = getWorldCollisionBox(b.x, b.y, b.collisionBox, b.scale ?? 1);
    if (checkAABBOverlap(box, bb)) return false;
  }

  return true;
}

/** True if any NPC's CURRENT collision box overlaps the player's
 * hypothetical position at the given grid cell. Called per A* node so
 * pathfinding always sees up-to-date NPC positions, not stale ones
 * baked into the static walk grid. */
function isCellBlockedByNpc(
  cx: number, cy: number,
  npcs: NPCData[],
  pcb: CollisionBox,
): boolean {
  if (npcs.length === 0) return false;
  const box: WorldBox = {
    x: cx + pcb.offsetX,
    y: cy + pcb.offsetY,
    width: pcb.width,
    height: pcb.height,
  };
  for (const npc of npcs) {
    if (npc.collisionBox.width === 0 || npc.collisionBox.height === 0) continue;
    const nb = getWorldCollisionBox(npc.x, npc.y, npc.collisionBox);
    if (checkAABBOverlap(box, nb)) return true;
  }
  return false;
}

/**
 * A* pathfinding on the walk grid.
 * Returns a list of world-space positions (waypoints), or empty if no path found.
 *
 * `npcs` and `playerCollisionBox` enable dynamic NPC blocking — the static
 * grid has walls/buildings/static objects baked in, but NPCs are checked
 * against their current positions per node so paths never route through
 * an NPC that's standing somewhere different from where the grid was built.
 */
export function findPath(
  grid: boolean[][],
  fromX: number, fromY: number,
  toX: number, toY: number,
  npcs: NPCData[] = [],
  playerCollisionBox: CollisionBox = { offsetX: 0, offsetY: 0, width: 0, height: 0 },
): Position[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  const startC = Math.floor(fromX / GRID_CELL);
  const startR = Math.floor(fromY / GRID_CELL);
  const endC = Math.floor(toX / GRID_CELL);
  const endR = Math.floor(toY / GRID_CELL);

  // Clamp to bounds
  const sc = Math.max(0, Math.min(cols - 1, startC));
  const sr = Math.max(0, Math.min(rows - 1, startR));
  const ec = Math.max(0, Math.min(cols - 1, endC));
  const er = Math.max(0, Math.min(rows - 1, endR));

  // If target is blocked, find nearest walkable cell. Track whether we
  // relocated so the final-waypoint override below knows whether to
  // honour the original tap coordinates (target IS walkable) or stop
  // at the nearest-walkable cell center (target was unreachable).
  let goalR = er, goalC = ec;
  let goalRelocated = false;
  if (!grid[goalR]?.[goalC]) {
    const nearest = findNearestWalkable(grid, er, ec, rows, cols);
    if (!nearest) return [];
    goalR = nearest[0];
    goalC = nearest[1];
    goalRelocated = true;
  }

  // If start is blocked (shouldn't happen but safety)
  if (!grid[sr]?.[sc]) return [];

  // Same cell
  if (sr === goalR && sc === goalC) return [{ x: toX, y: toY }];

  // A* with 8-directional movement.
  // Open set is a binary min-heap keyed on f (g + h). Earlier this was
  // a Map<key, node> with a linear scan to find the lowest-f entry,
  // which is O(n²) over the whole search and produced 50-150 ms hitches
  // on mobile when tapping far. Heap brings each pop down to O(log n)
  // — for the worst-case 2350-cell grid that's ~12 ops vs ~2350.
  //
  // We don't implement decrease-key. Instead, when a better path to a
  // node is found we just push a NEW heap entry; the stale one gets
  // popped later and skipped via the closed-set check. This is the
  // standard "lazy deletion" trick for A*.
  const key = (r: number, c: number) => r * cols + c;
  const closed = new Set<number>();
  const parent = new Map<number, number>();
  // Best known g per node. Lets us reject heap entries that were
  // superseded by a cheaper path (and avoid re-exploring nodes whose
  // best path didn't change).
  const bestG = new Map<number, number>();

  const h = (r: number, c: number) => {
    const dr = Math.abs(r - goalR);
    const dc = Math.abs(c - goalC);
    // Octile distance
    return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
  };

  const open = new MinHeap<HeapNode>((a, b) => a.f - b.f);
  const startKey = key(sr, sc);
  open.push({ k: startKey, r: sr, c: sc, g: 0, f: h(sr, sc) });
  bestG.set(startKey, 0);

  const dirs = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2],
  ];

  let found = false;
  const goalKey = key(goalR, goalC);

  // Hard cap. With heap, each pop is cheap, so a generous cap doesn't
  // dominate cost — but it stops pathological maps from spinning.
  // Worst-case nodes in a 47×50 grid is ~2350; 5000 leaves headroom.
  let iterations = 0;
  const MAX_ITER = 5000;

  while (open.size() > 0 && iterations++ < MAX_ITER) {
    const current = open.pop()!;
    if (closed.has(current.k)) continue; // stale heap entry
    closed.add(current.k);

    if (current.k === goalKey) { found = true; break; }

    for (const [dr, dc, cost] of dirs) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (!grid[nr][nc]) continue;

      const nk = key(nr, nc);
      if (closed.has(nk)) continue;

      // For diagonal movement, check that both adjacent cells are walkable (no corner cutting)
      if (dr !== 0 && dc !== 0) {
        if (!grid[current.r + dr]?.[current.c] || !grid[current.r]?.[current.c + dc]) continue;
      }

      // Dynamic NPC block check — uses current NPC positions, not the
      // stale ones from grid build. Skip the goal cell itself (we want
      // paths that approach an NPC; the runtime collision system will
      // still stop the player just before contact) — otherwise pathing
      // toward a stationary NPC always returns "no path".
      if (nk !== goalKey && isCellBlockedByNpc(
        nc * GRID_CELL + GRID_CELL / 2,
        nr * GRID_CELL + GRID_CELL / 2,
        npcs,
        playerCollisionBox,
      )) continue;

      const ng = current.g + cost;
      const existingG = bestG.get(nk);
      if (existingG !== undefined && ng >= existingG) continue;

      bestG.set(nk, ng);
      parent.set(nk, current.k);
      open.push({ k: nk, r: nr, c: nc, g: ng, f: ng + h(nr, nc) });
    }
  }

  if (!found) return [];

  // Reconstruct path
  const pathCells: [number, number][] = [];
  let ck = goalKey;
  while (ck !== startKey) {
    const r = Math.floor(ck / cols);
    const c = ck % cols;
    pathCells.unshift([r, c]);
    const pk = parent.get(ck);
    if (pk === undefined) break;
    ck = pk;
  }

  // Simplify path — remove collinear waypoints
  const simplified: Position[] = [];
  for (let i = 0; i < pathCells.length; i++) {
    const [r, c] = pathCells[i];
    if (i === 0 || i === pathCells.length - 1) {
      simplified.push({ x: c * GRID_CELL + GRID_CELL / 2, y: r * GRID_CELL + GRID_CELL / 2 });
      continue;
    }
    // Check if direction changes
    const [pr, pc] = pathCells[i - 1];
    const [nr, nc] = pathCells[i + 1];
    const dr1 = r - pr, dc1 = c - pc;
    const dr2 = nr - r, dc2 = nc - c;
    if (dr1 !== dr2 || dc1 !== dc2) {
      simplified.push({ x: c * GRID_CELL + GRID_CELL / 2, y: r * GRID_CELL + GRID_CELL / 2 });
    }
  }

  // When the target is walkable, replace the last waypoint with the
  // exact tap coordinates so the player ends up where the user pointed
  // (not the cell center). When the target was unreachable and we
  // relocated the goal, KEEP the cell-center as the final waypoint —
  // overriding to the tap coords would send the player into the
  // obstacle and let the runtime stuck-guard cancel it. Now the path
  // ends correctly at the nearest reachable spot.
  if (simplified.length > 0 && !goalRelocated) {
    simplified[simplified.length - 1] = { x: toX, y: toY };
  }

  return simplified;
}

function findNearestWalkable(grid: boolean[][], r: number, c: number, rows: number, cols: number): [number, number] | null {
  for (let radius = 1; radius < 20; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc]) {
          return [nr, nc];
        }
      }
    }
  }
  return null;
}

/** A* heap entry. `k` is the cell key (row * cols + col), `r`/`c` the
 * grid coords, `g` the cost-so-far, `f` = g + heuristic. */
interface HeapNode {
  k: number;
  r: number;
  c: number;
  g: number;
  f: number;
}

/** Tiny binary min-heap. Inlined here rather than reaching for a
 * dependency — A* is the only consumer and the implementation is
 * ~40 lines. `compare` returns negative if `a` should come out first. */
class MinHeap<T> {
  private heap: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}
  size(): number { return this.heap.length; }
  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }
  pop(): T | undefined {
    const n = this.heap.length;
    if (n === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (n > 1) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }
  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[p]) < 0) {
        [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
        i = p;
      } else break;
    }
  }
  private bubbleDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this.compare(this.heap[l], this.heap[smallest]) < 0) smallest = l;
      if (r < n && this.compare(this.heap[r], this.heap[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
