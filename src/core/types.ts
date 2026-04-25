// ── Primitives ──

export interface Position {
  x: number;
  y: number;
}

export interface Anchor {
  x: number; // 0–1, fraction of sprite width
  y: number; // 0–1, fraction of sprite height
}

/** Relative to entity position — explicit gameplay data, never derived from sprite size. */
export interface CollisionBox {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

// ── Entities ──

export interface Entity {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  anchor: Anchor;
  sortY: number; // explicit depth value — hand-set, not computed from sprite
  collisionBox: CollisionBox;
  /** Optional uniform scale factor applied to the rendered sprite. Default 1.0. */
  scale?: number;
  /** Optional door-like transition. When the player walks onto this entity's
   * footprint, the engine fires a scene change. Used for staircases inside
   * interior maps so the trigger follows the visual decor.
   * - targetMapId/targetSpawnId: where this entity sends the player.
   * - incomingSpawnId: the spawn ID someone uses when arriving AT this entity
   *   from the other map. The engine auto-registers this spawn just below the
   *   entity's feet so spawn position always matches the visual position. */
  transition?: { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string };
}

export interface Building {
  id: string;
  x: number;
  y: number;
  baseSpriteKey: string;
  /** Optional separate roof sprite, always drawn above the base on the Roofs
   * layer so the player appears to walk behind it. Omit for buildings drawn as
   * a single combined image. */
  roofSpriteKey?: string;
  anchor: Anchor;
  sortY: number;
  /** Relative to unscaled sprite; scaled proportionally at read time when
   * `scale` is set so the hitbox stays visually aligned. */
  collisionBox: CollisionBox;
  /** Also scaled proportionally with `scale`. */
  doorTrigger: CollisionBox;
  targetMapId: string;
  targetSpawnId: string;
  /** Uniform visual scale. Default 1.0. Also scales collision/door trigger. */
  scale?: number;
}

export interface NPCData {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  anchor: Anchor;
  sortY: number;
  collisionBox: CollisionBox;
  name: string;
  dialogue: string[];
  /** If set, NPC wanders within this radius (pixels) of their spawn point. */
  wanderRadius?: number;
  /** Optional rectangular area the NPC is confined to (world pixels). */
  wanderBounds?: { x: number; y: number; width: number; height: number };
}

// ── Map ──

export enum TileType {
  GRASS = 'grass',
  GRASS_NEW = 'grass-new',
  GRASS_DARK = 'grass_dark',
  DIRT = 'dirt',
  PATH = 'path',
  WALL = 'wall',
  WALL_INTERIOR = 'wall-interior',
  WALL_INTERIOR_TOP = 'wall-interior-top',
  WALL_INTERIOR_TOP_LEFT = 'wall-interior-top-left',
  WALL_INTERIOR_TOP_CORNER_BL = 'wall-interior-top-corner-bl',
  WALL_INTERIOR_TOP_CORNER_INNER_TR = 'wall-interior-top-corner-inner-tr',
  WALL_INTERIOR_TOP_BL = 'wall-interior-top-bl',
  WALL_INTERIOR_TOP_BR = 'wall-interior-top-br',
  WALL_INTERIOR_BOTTOM = 'wall-interior-bottom',
  WALL_INTERIOR_LEFT = 'wall-interior-left',
  WALL_INTERIOR_RIGHT = 'wall-interior-right',
  WALL_INTERIOR_CORNER_BOTTOM_LEFT = 'wall-interior-corner-bottom-left',
  WALL_INTERIOR_CORNER_BOTTOM_RIGHT = 'wall-interior-corner-bottom-right',
  /** Running-bond brick wall. Renderer picks wall-brick-tl/tr/bl/br per cell
   * (row%2, col%2) so the offset pattern aligns automatically. Blocking. */
  WALL_BRICK = 'wall-brick',
  FLOOR = 'floor',
  FLOOR_WOOD = 'floor-wood',
  FLOOR_WOOD_2 = 'floor-wood-2',
  FLOOR_WOOD_3 = 'floor-wood-3',
  /** A 32×32 motif split into four 16×16 quadrants. Renderer picks
   * floor-tl/tr/bl/br based on the cell's (row%2, col%2) position so the
   * pattern auto-aligns when painted across multiple cells. */
  FLOOR_PATTERN = 'floor-pattern',
  WATER = 'water',
  BRIDGE = 'bridge',
  VOID = 'void',
}

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  facing: Direction;
}

export interface Trigger {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'door' | 'interact';
  targetMapId?: string;
  targetSpawnId?: string;
}

export interface MapData {
  id: string;
  width: number;  // in tiles
  height: number; // in tiles
  tileSize: number;
  tiles: TileType[][];       // [row][col]
  objects: Entity[];
  buildings: Building[];
  npcs: NPCData[];
  triggers: Trigger[];
  spawnPoints: SpawnPoint[];
  /** Cap how much of the map is visible at once, in tiles. When set, the
   * render zoom is raised (if needed) so the canvas shows at most
   * `width × height` tiles of world. Used on interior maps so the full
   * room doesn't fit the screen and the camera has to scroll. */
  maxViewTiles?: { width: number; height: number };
}

// ── Input (normalized — core never touches DOM) ──

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  interact: boolean;
  moveTarget: Position | null; // click/tap destination in world coords
}

// ── Player ──

export interface MovementMode {
  type: 'direct' | 'target' | 'path';
  target?: Position;
  /** Waypoints for pathfinding-based movement. Player follows them in order. */
  waypoints?: Position[];
}

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  anchor: Anchor;
  sortY: number;
  collisionBox: CollisionBox;
  facing: Direction;
  movementMode: MovementMode;
}

// ── Game State ──

export interface DialogueState {
  npcId: string;
  npcName: string;
  lines: string[];
  currentLine: number;
}

export interface GameState {
  currentMapId: string;
  player: PlayerState;
  camera: Position;
  entities: Entity[];
  buildings: Building[];
  npcs: NPCData[];
  activeDialogue: DialogueState | null;
  /** Spawn ID to use when exiting the current interior back to the outdoor map. */
  returnSpawnId: string | null;
  /** Map ID to return to when exiting the current interior. */
  returnMapId: string | null;
}
