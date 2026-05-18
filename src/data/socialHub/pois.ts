/**
 * Points of interest for the social-hub map.
 *
 * Each POI is a TYPE (entrance, lounge, reading, …) with one or more
 * SLOTS — individual tile coordinates an NPC can occupy. Slots are
 * how we enforce "two NPCs can't stand on the same chair" without
 * any collision plumbing: the lifecycle module marks a slot occupied
 * when an NPC starts walking to it and free again when they leave.
 *
 * Entrance is special: it has 5 slots side-by-side because guests
 * queue there as they arrive. Every other POI has 1-2 slots — enough
 * to feel populated without overlap.
 *
 * Coordinates are TILE coordinates (16 px each). The lifecycle module
 * converts to world coords when walking NPCs to them.
 */

export type PoiType = "entrance" | "lounge" | "reading" | "game" | "staff";

export interface PoiSlot {
  /** Stable id used by occupancy tracking and marker placement. */
  id: string;
  /** Tile column (0-indexed from left). */
  col: number;
  /** Tile row (0-indexed from top). */
  row: number;
}

export interface Poi {
  id: string;
  type: PoiType;
  /** Human-readable label — shown in dev overlays + occasionally in
   *  dialogue ("you're in the reading area"). */
  label: string;
  slots: PoiSlot[];
}

/** First-pass POI layout. Placed against the social-hub map's wall
 *  layout (28×20, entrance gap at the south wall on cols 11-15).
 *  All slots sit on floor tiles by construction — verified against
 *  `src/maps/social-hub.ts`'s tile map. */
export const SOCIAL_HUB_POIS: ReadonlyArray<Poi> = [
  {
    id: "entrance",
    type: "entrance",
    label: "Entrance",
    // Five slots side-by-side just inside the door gap (row 17).
    // Order matters: NPCs prefer the LEFTMOST free slot so the
    // queue reads from left to right.
    slots: [
      { id: "e1", col: 11, row: 27 },
      { id: "e2", col: 12, row: 27 },
      { id: "e3", col: 13, row: 27 },
      { id: "e4", col: 14, row: 27 },
      { id: "e5", col: 15, row: 27 },
    ],
  },
  {
    id: "lounge",
    type: "lounge",
    label: "Lounge",
    // 3 slots — total non-entrance capacity (9) needs to exceed
    // MAX_NPCS (8) so a fully-occupied venue never deadlocks
    // post-welcome guests at the entrance with nowhere to go.
    slots: [
      { id: "l1", col: 4, row: 5 },
      { id: "l2", col: 6, row: 7 },
      { id: "l3", col: 4, row: 10 },
      { id: "l4", col: 4, row: 15 },
      { id: "l5", col: 6, row: 17 },
      { id: "l6", col: 4, row: 20 },
    ],
  },
  {
    id: "reading",
    type: "reading",
    label: "Reading",
    slots: [
      { id: "g1", col: 22, row: 20 },
      { id: "g2", col: 25, row: 24 },
      { id: "g3", col: 22, row: 27 },
    ],
  },
  {
    id: "game",
    type: "game",
    label: "Game area",
    slots: [
      { id: "r1", col: 22, row: 13 },
      { id: "r2", col: 24, row: 13 },
      { id: "r3", col: 17, row: 14 },
    ],
  },
  {
    id: "staff",
    type: "staff",
    label: "Staff counter",
    // The staff NPC stands here; guests don't queue here, the player
    // walks here to delegate tasks.
    slots: [{ id: "s1", col: 11, row: 9 }],
  },
];

/** Tile size in pixels — must match the map's `tileSize`. */
export const POI_TILE_SIZE = 16;

/** Convert a POI slot to world-pixel coords (centre of the tile,
 *  with `y` at the bottom of the tile so anchor-y=1 sprites land
 *  on the floor). */
export function slotToWorld(slot: PoiSlot): { x: number; y: number } {
  return {
    x: slot.col * POI_TILE_SIZE + POI_TILE_SIZE / 2,
    y: (slot.row + 1) * POI_TILE_SIZE,
  };
}

export function getPoiById(id: string): Poi | undefined {
  return SOCIAL_HUB_POIS.find((p) => p.id === id);
}

export function getPoisOfType(type: PoiType): ReadonlyArray<Poi> {
  return SOCIAL_HUB_POIS.filter((p) => p.type === type);
}
