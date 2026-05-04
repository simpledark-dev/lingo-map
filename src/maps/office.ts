import { MapData, TileType, Entity, NPCData } from '../core/types';
import { INTERIOR_VIEW_TILES } from '../core/constants';

// ══════════════════════════════════════════════════════════════
// OFFICE — INTERIOR  20×16 tiles @ 16px
//
// First-version clone of `pokemon-house-1f` with the floor swapped
// to plain stone-tile flooring (workplace vibe vs the cosy wood-
// plank house). Walls and the L-shape alcove are identical so the
// editor flow + transition geometry feel familiar; the player can
// re-furnish the room (drop the dining table, add desks/computers/
// printers, etc.) using the regular editor without touching code.
//
// Backstory: this is where the main character first applied for
// the translator job. The story trigger that brings the player
// here at game start isn't wired yet — for now the map sits in the
// registry waiting for a building to point its `targetMapId` at
// `office`.
//
// Layout cues kept:
//   - Top-3 wall rows with the staircase-alcove gap at cols 17-18
//   - Bottom-row exit gap at cols 9-10 (doormat → outdoor return)
//   - Wall-mounted decor row available at row 1
// What's stripped:
//   - Kitchen / dining furniture (housey, not office)
//   - Wall-staircase to a 2F (no upper office floor for now)
// What's swapped:
//   - FLOOR_WOOD plank → FLOOR stone tile
// ══════════════════════════════════════════════════════════════

const W = 20;
const H = 16;
const T = 16;
const WI = TileType.WALL_INTERIOR;
const FW = TileType.FLOOR; // stone tile — different from the house's wood plank

const ALCOVE_COL = 14;
const ALCOVE_ROW = 5;
const V = TileType.VOID;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      // Outside the L-shape (top-right alcove): void shows the
      // black canvas, with a wall column at the alcove edge so the
      // step-in reads as a perpendicular wall face.
      if (row <= 2 && col === ALCOVE_COL) {
        r.push(WI);
      } else if (row <= 2 && col > ALCOVE_COL) {
        r.push(V);
      } else if (col === 0) {
        r.push(WI);
      } else if (col === W - 1) {
        r.push(WI);
      } else if (row <= 2) {
        r.push(WI);
      } else if (row <= ALCOVE_ROW && col >= ALCOVE_COL) {
        // The 1F variant left a 2-tile gap here for a staircase
        // up to 2F. Office has no 2F yet, so the alcove stays
        // walled — easy to punch through later if we add one.
        r.push(WI);
      } else if (row === H - 1) {
        // Bottom row: wall except the exit gap.
        r.push(col === 9 || col === 10 ? FW : WI);
      } else {
        r.push(FW);
      }
    }
    tiles.push(r);
  }
  return tiles;
}

let nextId = 0;
function tx(col: number) { return col * T + T / 2; }
function ty(row: number) { return (row + 1) * T; }

function decor(
  x: number,
  y: number,
  key: string,
  transition?: { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string },
): Entity {
  return {
    id: `office-${++nextId}`,
    x,
    y,
    spriteKey: key,
    anchor: { x: 0.5, y: 1.0 },
    sortY: y - 1000,
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
    transition,
  };
}

const objects: Entity[] = [
  // Wall-mounted decor on row 1 — same layout as the house so the
  // user can swap sprites in the editor without re-positioning.
  // Keeping the windows + clock makes the bare room feel less empty
  // before any office-specific furniture lands.
  decor(tx(4),  ty(1), 'wall-window-double'),
  decor(tx(9),  ty(1), 'wall-clock'),
  decor(tx(14), ty(1), 'wall-window-double'),

  // Doormat doubles as the exit trigger. `targetMapId: 'pokemon'`
  // is a placeholder — once an Office building exists outdoors and
  // its `incomingSpawnId` is registered, point this back to that
  // building's exit-spawn. Until then exiting drops the player at
  // the Pokemon outdoor's `from-house` spawn (the same fallback
  // grocer-1f uses pre-building-link).
  decor(tx(9) + 8, ty(14), 'doormat',
    { targetMapId: 'pokemon', targetSpawnId: 'from-house' }),
];

// Stationary CEO near the back of the office. Omitting `wanderRadius`
// keeps him rooted in place so this room can act as the first job /
// contract office once the story flow is wired.
const npcs: NPCData[] = [
  {
    id: 'office-npc-ceo',
    x: tx(10),
    y: ty(6),
    spriteKey: 'me-char-20',
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(6),
    collisionBox: { offsetX: -4, offsetY: -6, width: 8, height: 6 },
    name: 'CEO',
    dialogue: [
      "You're the new translator? Good. The city has plenty of work for someone bold enough to try.",
      'Come back when you are ready for your first contract.',
    ],
  },
];

export const officeMap: MapData = {
  id: 'office',
  width: W,
  height: H,
  tileSize: T,
  maxViewTiles: INTERIOR_VIEW_TILES,
  tiles: makeTiles(),
  objects,
  buildings: [],
  npcs,
  triggers: [],
  spawnPoints: [
    // Entrance: standing on the bottom doormat tile, facing up.
    // Matches the house's `entrance` convention so a future
    // outdoor-Office building's targetSpawnId can default to
    // `'entrance'` without thinking.
    { id: 'entrance', x: tx(9) + 8, y: ty(H - 3), facing: 'up' },
  ],
};
