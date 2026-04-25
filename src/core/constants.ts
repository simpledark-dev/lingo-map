export const TILE_SIZE = 16;
export const PLAYER_SPEED = 90; // pixels per second
export const INTERACTION_RANGE = 32; // pixels
export const VIEWPORT_WIDTH = 800;
export const VIEWPORT_HEIGHT = 480;
export const MAX_CANVAS_WIDTH = 1024;
export const CLICK_ARRIVE_THRESHOLD = 4; // pixels — close enough to count as "arrived"
export const MIN_ZOOM = 2.0;
export const MAX_ZOOM = 4.0;
export const DEFAULT_ZOOM = 3.0;
export const ZOOM_STEP = 0.1;

/** Default viewport cap for interior maps — how many tiles of world are
 * visible at once. The rest of the canvas renders black until the player
 * moves toward an edge and the camera scrolls. Outdoor maps ignore this. */
export const INTERIOR_VIEW_TILES = { width: 20, height: 14 };

/** Sprite keys whose sortY should be heavily decremented so they render BEHIND
 * other entities (player walks "on" them). Used for floor decor (rugs) and
 * wall-mounted decor (windows, paintings, clocks, staircase). */
export const DECOR_SPRITE_KEYS = new Set<string>([
  'rug',
  'rug-large',
  'doormat',
  'flowers',
  'wall-window',
  'wall-window-double',
  'wall-painting',
  'wall-clock',
  'wall-staircase',
  'window-indoor',
  'candle',
  'coffee-cup',
]);
