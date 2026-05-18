import { MapData, TileType } from "../core/types";
import { INTERIOR_VIEW_TILES } from "../core/constants";

// ══════════════════════════════════════════════════════════════
// SOCIAL HUB — 28×20 tiles @ 16px
//
// Minimal scaffold for the social-hub experiment. Only the floor +
// walls + entrance gap are committed here; the visual layer (rugs,
// tables, plants, themed POI decor) is meant to be authored in the
// in-game editor on top of this base. The script runner anchors
// everything by POI ids in `src/data/socialHub/pois.ts`, not by
// the visual props — so editor moves don't break the gameplay.
//
// Layout:
//   ┌────────────────────────────┐
//   │..    LOUNGE      .. ..     │
//   │..    POI markers .. .. ..  │   (POIs are invisible — they
//   │..    are not drawn         │    live in pois.ts data only)
//   │..                          │
//   │..    READING    GAME       │
//   │..                          │
//   │..        STAFF             │
//   │..                          │
//   │..    ENTRANCE QUEUE        │
//   │WWWW    5-tile gap    WWWWW │   ← bottom wall + entrance
//   └────────────────────────────┘
//
// Entrance gap sits at the BOTTOM (rows 19), cols 11-15 — five
// floor tiles wide so up to five NPCs can queue.
// ══════════════════════════════════════════════════════════════

const W = 28;
const H = 20;
const T = 16;
const WI = TileType.WALL_INTERIOR;
const FW = TileType.FLOOR_WOOD;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (col === 0 || col === W - 1) {
        r.push(WI);
      } else if (row === 0 || row === 1) {
        r.push(WI);
      } else if (row === H - 1) {
        // Bottom wall with 5-tile entrance gap (cols 11-15)
        r.push(col >= 11 && col <= 15 ? FW : WI);
      } else {
        r.push(FW);
      }
    }
    tiles.push(r);
  }
  return tiles;
}

function tx(col: number) {
  return col * T + T / 2;
}
function ty(row: number) {
  return (row + 1) * T;
}

export const socialHubMap: MapData = {
  id: "social-hub",
  width: W,
  height: H,
  tileSize: T,
  maxViewTiles: INTERIOR_VIEW_TILES,
  tiles: makeTiles(),
  // Decor lives in the editor for now; no compiled objects.
  objects: [],
  buildings: [],
  // NPCs are added dynamically at runtime by the lifecycle module —
  // none baked into the map data.
  npcs: [],
  triggers: [],
  spawnPoints: [
    // `default` lands the player just inside the room, near the
    // entrance gap so the first incoming guest is visible.
    { id: "default", x: tx(13), y: ty(15), facing: "down" },
    { id: "owner-counter", x: tx(13), y: ty(10), facing: "down" },
    // Leaving NPCs don't use a named spawn point — they re-use
    // the entrance POI slots from `src/data/socialHub/pois.ts`,
    // picked at random per departure (see `beginLeave`).
  ],
};
