import { MapData, Entity, Building, Position, CollisionBox, TileType } from './types';
import { getWorldCollisionBox, checkAABBOverlap, WorldBox } from './CollisionSystem';

const GRID_CELL = 16; // pathfinding resolution — half a tile for smoother paths

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

  // Object/building/NPC check
  const allObjects = [...objects, ...map.npcs];
  for (const obj of allObjects) {
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

/**
 * A* pathfinding on the walk grid.
 * Returns a list of world-space positions (waypoints), or empty if no path found.
 */
export function findPath(
  grid: boolean[][],
  fromX: number, fromY: number,
  toX: number, toY: number,
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

  // If target is blocked, find nearest walkable cell
  let goalR = er, goalC = ec;
  if (!grid[goalR]?.[goalC]) {
    const nearest = findNearestWalkable(grid, er, ec, rows, cols);
    if (!nearest) return [];
    goalR = nearest[0];
    goalC = nearest[1];
  }

  // If start is blocked (shouldn't happen but safety)
  if (!grid[sr]?.[sc]) return [];

  // Same cell
  if (sr === goalR && sc === goalC) return [{ x: toX, y: toY }];

  // A* with 8-directional movement
  const key = (r: number, c: number) => r * cols + c;
  const open = new Map<number, { r: number; c: number; g: number; f: number }>();
  const closed = new Set<number>();
  const parent = new Map<number, number>();

  const h = (r: number, c: number) => {
    const dr = Math.abs(r - goalR);
    const dc = Math.abs(c - goalC);
    // Octile distance
    return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
  };

  const startKey = key(sr, sc);
  open.set(startKey, { r: sr, c: sc, g: 0, f: h(sr, sc) });

  const dirs = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2],
  ];

  let found = false;
  const goalKey = key(goalR, goalC);

  // Limit iterations for performance on large maps
  let iterations = 0;
  const MAX_ITER = 10000;

  while (open.size > 0 && iterations++ < MAX_ITER) {
    // Find lowest f in open set
    let bestKey = -1;
    let bestF = Infinity;
    for (const [k, node] of open) {
      if (node.f < bestF) { bestF = node.f; bestKey = k; }
    }

    const current = open.get(bestKey)!;
    open.delete(bestKey);
    closed.add(bestKey);

    if (bestKey === goalKey) { found = true; break; }

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

      const ng = current.g + cost;
      const existing = open.get(nk);
      if (existing && ng >= existing.g) continue;

      parent.set(nk, bestKey);
      open.set(nk, { r: nr, c: nc, g: ng, f: ng + h(nr, nc) });
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

  // Replace last waypoint with exact target position
  if (simplified.length > 0) {
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
