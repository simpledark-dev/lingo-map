export const TILE_SIZE = 16;
export const PLAYER_SPEED = 90; // pixels per second
export const INTERACTION_RANGE = 32; // pixels
export const VIEWPORT_WIDTH = 800;
export const VIEWPORT_HEIGHT = 480;
export const MAX_CANVAS_WIDTH = 1024;
export const CLICK_ARRIVE_THRESHOLD = 4; // pixels — close enough to count as "arrived"
export const MIN_ZOOM = 1.5;
export const MAX_ZOOM = 4.0;
export const DEFAULT_ZOOM = 3.0;
export const ZOOM_STEP = 0.1;

/** Default viewport cap for interior maps — how many tiles of world are
 * visible at once. The rest of the canvas renders black until the player
 * moves toward an edge and the camera scrolls. Outdoor maps ignore this. */
export const INTERIOR_VIEW_TILES = { width: 20, height: 14 };

// ── Render layers (entity z-ordering) ─────────────────────────────────────
// A map's `layers[]` controls the gross render order of entities. Layers
// near the start of the array render below layers near the end. Within a
// single layer, entities Y-sort by `sortY` (taller-on-screen-y wins). The
// "props" layer is the default home for the player + NPCs.
//
// Each layer slot is sized to fit any plausible y/sortY (~10000 covers
// thousands of pixels of map height plus negative-sortY decor offsets).
export const LAYER_SORT_SPACING = 100000;

/** Default layer set used when `MapData.layers` is omitted. */
export const DEFAULT_LAYERS = [
  { id: "floor", name: "Floor" },
  { id: "decor-low", name: "Decor" },
  { id: "props", name: "Props" },
  { id: "above", name: "Above" },
] as const;

/** Layer ID where the player and NPCs render. */
export const PLAYER_LAYER_ID = "props";

/** Sprite keys whose sortY should be heavily decremented so they render BEHIND
 * other entities (player walks "on" them). Used for floor decor (rugs) and
 * wall-mounted decor (windows, paintings, clocks, staircase). */
export const DECOR_SPRITE_KEYS = new Set<string>([
  "rug",
  "rug-large",
  "doormat",
  "flowers",
  "wall-window",
  "wall-window-double",
  "wall-painting",
  "wall-clock",
  "wall-staircase",
  "window-indoor",
  "candle",
  "coffee-cup",
]);
