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

// 20 NPCs, one per extracted me-char-NN sprite. Spawn positions were
// picked from the disk-saved sidewalk decor in data/pokemon.json by
// scripts/pick-npc-spots.mjs (a max-min-distance greedy spread over
// walkable sidewalk tiles), so each NPC starts on a real sidewalk
// rather than a random grass cell. wanderRadius lets them stroll the
// surrounding block without all converging into one knot.
const npcs: NPCData[] = [
  {
    id: "pk-npc-1",
    x: 112,
    y: 96,
    spriteKey: "me-char-01",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 96,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Mira",
    dialogue: ["Oh, hi there! You must be new in town.", "The Mart is just east past the path."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-2",
    x: 400,
    y: 96,
    spriteKey: "me-char-02",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 96,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Hank",
    dialogue: ["Mart's been in my family three generations.", "Anything you need, we've got it."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-3",
    x: 688,
    y: 96,
    spriteKey: "me-char-03",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 96,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Riku",
    dialogue: ["I'm waiting for the next showing at the cinema.", "Old monster movies tonight!"],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-4",
    x: 48,
    y: 256,
    spriteKey: "me-char-04",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 256,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Sumi",
    dialogue: ["Morning! Try the bakery while it's warm."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-5",
    x: 336,
    y: 256,
    spriteKey: "me-char-05",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 256,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Kit",
    dialogue: ["Hey, hey! Wanna race to that tree?", "...okay, fine, you win."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-6",
    x: 560,
    y: 256,
    spriteKey: "me-char-06",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 256,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Tomas",
    dialogue: ["Construction's been going on for weeks.", "They never finish."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-7",
    x: 688,
    y: 256,
    spriteKey: "me-char-07",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 256,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Ada",
    dialogue: ["I'm late for my shift. Excuse me!"],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-8",
    x: 208,
    y: 288,
    spriteKey: "me-char-08",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 288,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Jun",
    dialogue: ["Have you seen a stray cat? Black with white socks."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-9",
    x: 400,
    y: 368,
    spriteKey: "me-char-09",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 368,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Pia",
    dialogue: ["The cars get really fast around the bend. Be careful."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-10",
    x: 48,
    y: 432,
    spriteKey: "me-char-10",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 432,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Olek",
    dialogue: ["Did you bring your book back? Library closes at 6."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-11",
    x: 608,
    y: 432,
    spriteKey: "me-char-11",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 432,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Esme",
    dialogue: ["Postal route takes forever today."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-12",
    x: 240,
    y: 464,
    spriteKey: "me-char-12",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 464,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Bo",
    dialogue: ["I just moved here. Still figuring out the streets."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-13",
    x: 368,
    y: 496,
    spriteKey: "me-char-13",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 496,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Nora",
    dialogue: ["You look like you've been walking all morning."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-14",
    x: 512,
    y: 528,
    spriteKey: "me-char-14",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 528,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Reza",
    dialogue: ["I lost my keys somewhere on this street..."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-15",
    x: 400,
    y: 624,
    spriteKey: "me-char-15",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 624,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Yuki",
    dialogue: ["Cinema's playing something foreign tonight. Subtitles!"],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-16",
    x: 48,
    y: 656,
    spriteKey: "me-char-16",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 656,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Cleo",
    dialogue: ["Waiting on a delivery. They said before noon."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-17",
    x: 664,
    y: 656,
    spriteKey: "me-char-17",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 656,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Otis",
    dialogue: ["That mart sells the best onigiri."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-18",
    x: 176,
    y: 688,
    spriteKey: "me-char-18",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 688,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Saba",
    dialogue: ["I should be at work but the weather is too nice."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-19",
    x: 320,
    y: 752,
    spriteKey: "me-char-19",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 752,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Theo",
    dialogue: ["I dropped my coffee earlier. Don't step in it."],
    wanderRadius: 32,
  },
  {
    id: "pk-npc-20",
    x: 560,
    y: 752,
    spriteKey: "me-char-20",
    anchor: { x: 0.5, y: 1.0 },
    sortY: 752,
    collisionBox: NPC_FOOT_COLLISION,
    name: "Vera",
    dialogue: ["Welcome to the neighborhood, friend."],
    wanderRadius: 32,
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
