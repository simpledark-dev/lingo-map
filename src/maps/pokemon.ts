import { MapData, TileType, Entity, Building, NPCData } from "../core/types";

// ══════════════════════════════════════════════════════════════
// POKEMON-STYLE MAP (60×40 tiles @ 16px)
//
// Starter town: house, mart, lab, paths, pond, NPCs.
// All sprites and collision boxes sized for 16px tile scale.
// ══════════════════════════════════════════════════════════════

const W = 80;
const H = 50;
const T = 16;

const G = TileType.GRASS;
const P = TileType.PATH;
const WA = TileType.WATER;
const WL = TileType.WALL;

function makeTiles(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let row = 0; row < H; row++) {
    const r: TileType[] = [];
    for (let col = 0; col < W; col++) {
      if (row < 3 || row >= H - 3 || col < 2 || col >= W - 2) {
        r.push(WL);
      } else if (row >= 22 && row <= 23 && col >= 4 && col <= W - 5) {
        r.push(P);
      } else if (col >= 14 && col <= 15 && row >= 13 && row <= 21) {
        r.push(P);
      } else if (col >= 38 && col <= 39 && row >= 13 && row <= 21) {
        r.push(P);
      } else if (col >= 14 && col <= 15 && row >= 24 && row <= 32) {
        r.push(P);
      } else if (row >= 28 && row <= 33 && col >= 34 && col <= 43) {
        r.push(WA);
      } else {
        r.push(G);
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
  ch: number
): Entity {
  return {
    id: `pk-${++nextId}`,
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

function decor(x: number, y: number, key: string): Entity {
  return {
    id: `pk-${++nextId}`,
    x,
    y,
    spriteKey: key,
    anchor: { x: 0.5, y: 1.0 },
    sortY: y - 1000,
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
  };
}

// ── Objects — all 16×16 sprites ──

const objects: Entity[] = [
  // Border trees (16×16 each, collision 12×8)
  ...Array.from({ length: 14 }, (_, i) =>
    obj(tx(2 + i * 4), ty(1), "tree", 12, 8)
  ),
  ...Array.from({ length: 14 }, (_, i) =>
    obj(tx(2 + i * 4), ty(H - 2), "tree", 12, 8)
  ),
  ...Array.from({ length: 8 }, (_, i) =>
    obj(tx(1), ty(4 + i * 4), "tree", 12, 8)
  ),
  ...Array.from({ length: 8 }, (_, i) =>
    obj(tx(W - 2), ty(4 + i * 4), "tree", 12, 8)
  ),

  // Flower bushes
  decor(tx(24), ty(19), "bush"),
  decor(tx(26), ty(19), "bush"),
  decor(tx(28), ty(19), "bush"),
  decor(tx(24), ty(20), "bush"),
  decor(tx(26), ty(20), "bush"),
  decor(tx(28), ty(20), "bush"),

  // Town sign
  obj(tx(20), ty(21), "signpost", 10, 10),
];

// ── Buildings — sized for 16px scale ──
// House: 80×64 base sprite → covers ~5×4 tiles
// Collision and door trigger scaled proportionally

const buildings: Building[] = [
  {
    id: "pk-house",
    x: tx(13),
    y: ty(12),
    baseSpriteKey: "house-base",
    roofSpriteKey: "house-roof",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(12),
    collisionBox: { offsetX: -38, offsetY: -52, width: 76, height: 52 },
    doorTrigger: { offsetX: -6, offsetY: 0, width: 12, height: 8 },
    targetMapId: "pokemon-house-1f",
    targetSpawnId: "entrance",
  },
  {
    id: "pk-mart",
    x: tx(37),
    y: ty(12),
    baseSpriteKey: "mart-base",
    roofSpriteKey: "mart-roof",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(12),
    collisionBox: { offsetX: -38, offsetY: -52, width: 76, height: 52 },
    doorTrigger: { offsetX: -6, offsetY: 0, width: 12, height: 8 },
    targetMapId: "pokemon-house-1f",
    targetSpawnId: "entrance",
  },
  {
    id: "pk-lab",
    x: tx(13),
    y: ty(32),
    baseSpriteKey: "lab-base",
    roofSpriteKey: "lab-roof",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(32),
    collisionBox: { offsetX: -46, offsetY: -68, width: 92, height: 68 },
    doorTrigger: { offsetX: -8, offsetY: 0, width: 16, height: 8 },
    targetMapId: "pokemon-house-1f",
    targetSpawnId: "entrance",
  },
];

// ── NPCs ──
// All NPCs use Modern Interiors premade-character prefixes
// (`me-char-NN`). The renderer derives `<prefix>-<facing>` and
// `<prefix>-<facing>-walk1` from this — see RenderSystem.updateNPC.
// Sprites are 16w×32h with an anchor at the feet.

// Shared collision shape — feet-sized AABB centered under the sprite.
// Same numbers we used for the legacy 16×24 NPC art; the new sheets
// are slightly taller but their feet still occupy the bottom strip.
const NPC_FOOT_COLLISION = { offsetX: -4, offsetY: -6, width: 8, height: 6 };

const npcs: NPCData[] = [
  {
    id: "pk-npc-1",
    x: tx(20),
    y: ty(18),
    spriteKey: "me-char-04",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(18),
    collisionBox: NPC_FOOT_COLLISION,
    name: "Mira",
    dialogue: [
      "Oh, hi there! You must be new in town.",
      "If you head east past the path, you'll hit the Mart.",
      "Watch the road — the cars come fast around the bend.",
    ],
    wanderRadius: 24,
  },
  {
    id: "pk-npc-2",
    x: tx(44),
    y: ty(20),
    spriteKey: "me-char-07",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(20),
    collisionBox: NPC_FOOT_COLLISION,
    name: "Hank",
    dialogue: [
      "Mart's been in my family three generations.",
      "Anything you need, we've got it. Probably.",
    ],
    wanderRadius: 16,
  },
  {
    id: "pk-npc-3",
    x: tx(30),
    y: ty(34),
    spriteKey: "me-char-12",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(34),
    collisionBox: NPC_FOOT_COLLISION,
    name: "Riku",
    dialogue: [
      "I'm waiting for the next showing at the cinema.",
      "They're playing the old monster movies tonight!",
    ],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-4",
    x: tx(8),
    y: ty(42),
    spriteKey: "me-char-09",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(42),
    collisionBox: NPC_FOOT_COLLISION,
    name: "Sumi",
    dialogue: [
      "Morning! Long walk from the south gate, huh?",
      "Try the bakery while it's still warm.",
    ],
    wanderRadius: 24,
  },
  {
    id: "pk-npc-5",
    x: tx(26),
    y: ty(28),
    spriteKey: "me-char-14",
    anchor: { x: 0.5, y: 1.0 },
    sortY: ty(28),
    collisionBox: NPC_FOOT_COLLISION,
    name: "Kit",
    dialogue: [
      "Hey, hey! Wanna race to that tree?",
      "...okay, fine, you win. You're fast.",
    ],
    wanderRadius: 40,
  },
];

export const pokemonMap: MapData = {
  id: "pokemon",
  width: W,
  height: H,
  tileSize: T,
  tiles: makeTiles(),
  objects,
  buildings,
  npcs,
  triggers: [],
  spawnPoints: [
    { id: "default", x: tx(4), y: ty(40), facing: "down" },
    { id: "from-house", x: tx(14), y: ty(14), facing: "down" },
    { id: "from-mart", x: tx(38), y: ty(14), facing: "down" },
    { id: "from-lab", x: tx(14), y: ty(34), facing: "up" },
  ],
};
