import { MapData, TileType, Entity, NPCData } from "../core/types";
import { INTERIOR_VIEW_TILES } from "../core/constants";

// ══════════════════════════════════════════════════════════════
// CAFE — INTRO SCENE  16×11 tiles @ 16px
//
// Minimal scaffold for the scripted-scene experiment. Final
// visuals (floor variant, table sprites, decorations) are meant
// to be authored in the in-game editor — this file just nails
// the named anchor points the script runner depends on:
//
//   spawn:owner-start       — where the player begins
//   spawn:customer-door     — customer's pre-tap position
//   spawn:worker-counter    — worker's stationary position
//
//   npc id "cafe-customer"  — the customer (Léa)
//   npc id "cafe-worker"    — the worker (Théo)
//   npc id "cafe-seat-a"    — invisible chair marker at table A
//   npc id "cafe-seat-b"    — invisible chair marker at table B
//
// Layout:
//   WWWWWWWWWWWWWWWW
//   W..............W
//   W..TT......TT..W   ← tables at cols 2-3 and 10-11, row 3
//   W..............W
//   W..............W
//   W..............W
//   W..............W
//   W..............W
//   W..............W
//   WWWWW......WWWWW   ← door gap at cols 5-9, row 10
// ══════════════════════════════════════════════════════════════

const W = 16;
const H = 11;
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
      } else if (row === 0 || row <= 1) {
        r.push(WI);
      } else if (row === H - 1) {
        // Door gap at cols 5-9
        r.push(col >= 5 && col <= 9 ? FW : WI);
      } else {
        r.push(FW);
      }
    }
    tiles.push(r);
  }
  return tiles;
}

let nextId = 0;
function tx(col: number) {
  return col * T + T / 2;
}
function ty(row: number) {
  return (row + 1) * T;
}

function obj(
  x: number,
  y: number,
  key: string,
  cw: number,
  ch: number,
): Entity {
  return {
    id: `cafe-${++nextId}`,
    x,
    y,
    spriteKey: key,
    anchor: { x: 0.5, y: 1.0 },
    sortY: y,
    collisionBox: {
      offsetX: -Math.floor(cw / 2),
      offsetY: -ch,
      width: cw,
      height: ch,
    },
  };
}

// Tables — sprite key reused from the existing dining-table-small
// asset. Replace via the editor when authoring real café art.
const objects: Entity[] = [
  obj(tx(2) + T / 2, ty(3), "dining-table-small", 24, 14),
  obj(tx(10) + T / 2, ty(3), "dining-table-small", 24, 14),
];

const npcs: NPCData[] = [
  // ── Customer — starts JUST OUTSIDE the door, walks in on tap.
  // Sprite re-uses a placeholder character; swap in editor.
  {
    id: "cafe-customer",
    x: tx(7),
    y: ty(H - 1),
    spriteKey: "me-char-04",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(H - 1),
    collisionBox: { offsetX: -4, offsetY: -6, width: 8, height: 6 },
    name: "Léa",
    dialogue: ["..."],
    dialogueKeys: ["scene.cafeIntro.npc.customer.idle"],
    dialogueKind: "cafe-scripted",
  },
  // ── Worker — behind the counter on the upper-right.
  {
    id: "cafe-worker",
    x: tx(13),
    y: ty(3),
    spriteKey: "me-char-05",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(3),
    collisionBox: { offsetX: -4, offsetY: -6, width: 8, height: 6 },
    name: "Théo",
    dialogue: ["..."],
    dialogueKeys: ["scene.cafeIntro.npc.worker.idle"],
    dialogueKind: "cafe-scripted",
  },
  // ── Invisible seat markers. They act as NPCs so the existing
  // tap-on-NPC → dialogueStart event flow routes table picks
  // through the same handler. The script runner intercepts them
  // by id; default behaviour never fires.
  // Sprite key intentionally unset to a non-existent asset so they
  // render as nothing (RenderSystem skips missing textures); the
  // quest-marker arrow is what the player actually clicks on.
  {
    id: "cafe-seat-a",
    x: tx(2) + T / 2,
    y: ty(5),
    spriteKey: "__invisible-seat",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(5),
    // Seat markers don't block movement — they're tap targets only.
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
    name: "Table A",
    dialogue: ["..."],
    dialogueKeys: ["scene.cafeIntro.npc.seat.idle"],
    dialogueKind: "cafe-scripted",
  },
  {
    id: "cafe-seat-b",
    x: tx(10) + T / 2,
    y: ty(5),
    spriteKey: "__invisible-seat",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(5),
    // Seat markers don't block movement — they're tap targets only.
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
    name: "Table B",
    dialogue: ["..."],
    dialogueKeys: ["scene.cafeIntro.npc.seat.idle"],
    dialogueKind: "cafe-scripted",
  },
];

export const cafeIntroMap: MapData = {
  id: "cafe-intro",
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
    // `default` is what `loadScene` falls back to when the URL has no
    // `?spawn=` — `?map=cafe-intro` lands the player here.
    { id: "default", x: tx(7), y: ty(6), facing: "down" },
    { id: "owner-start", x: tx(7), y: ty(6), facing: "down" },
    { id: "customer-door", x: tx(7), y: ty(H - 1), facing: "up" },
    { id: "worker-counter", x: tx(13), y: ty(3), facing: "down" },
  ],
};
