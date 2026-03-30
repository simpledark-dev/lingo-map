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
}

export interface Building {
  id: string;
  x: number;
  y: number;
  baseSpriteKey: string;
  roofSpriteKey: string;
  anchor: Anchor;
  sortY: number;
  collisionBox: CollisionBox;
  doorTrigger: CollisionBox;
  targetMapId: string;
  targetSpawnId: string;
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
}

// ── Map ──

export enum TileType {
  GRASS = 'grass',
  PATH = 'path',
  WALL = 'wall',
  FLOOR = 'floor',
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
  type: 'direct' | 'target';
  target?: Position;
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
}
