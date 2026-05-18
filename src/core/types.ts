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
  /** Layer ID this entity belongs to (matches an entry in `MapData.layers`).
   * Falls back to 'props' if missing or referencing a layer that no longer
   * exists. Within a layer, entities Y-sort by `sortY`; the layer itself
   * decides the gross render order (e.g. 'floor' renders below 'props'). */
  layer?: string;
  /** Optional door-like transition. When the player walks onto this entity's
   * trigger zone, the engine fires a scene change. Used for staircases
   * inside interior maps so the trigger follows the visual decor.
   * - targetMapId/targetSpawnId: where this entity sends the player.
   * - incomingSpawnId: the spawn ID someone uses when arriving AT this entity
   *   from the other map. The engine auto-registers this spawn just below the
   *   entity's feet so spawn position always matches the visual position.
   * - triggerBox: explicit trigger rectangle (offsets relative to entity x/y,
   *   same convention as collisionBox). When omitted the runtime derives a
   *   2-tile-wide × 1-tile-tall trigger at the entity's feet row, restricted
   *   to walkable cells — that's the legacy behaviour for staircases. The
   *   editor sets this field whenever the user enables the Door section so
   *   they can resize/move the trigger independently of the entity. */
  transition?: {
    targetMapId: string;
    targetSpawnId: string;
    incomingSpawnId?: string;
    triggerBox?: CollisionBox;
    /** Which side of the triggerBox the auto-registered incoming
     *  spawn lands on. The player materialises one tile away from
     *  that edge AND faces that direction (i.e. away from the
     *  trigger, as if they just walked out of it). Defaults to
     *  `'south'` when omitted — matches the legacy behaviour where
     *  the spawn was hardcoded one tile below the door. Use other
     *  values for triggers placed on side or top walls. */
    returnDir?: 'north' | 'south' | 'east' | 'west';
    /** Optional override for the direction the player has to be
     *  moving / facing to FIRE this trigger. Without it the engine
     *  auto-derives from trigger geometry (edge-of-map / walkable
     *  neighbour / fallback to 'up'), which is correct for most
     *  cases but wrong when e.g. a door sits in open grass with
     *  every side walkable. Setting this explicitly via the editor
     *  lets the author say "approach from BELOW" (requiresFacing:
     *  'up'), "from the LEFT" (requiresFacing: 'right'), etc. */
    requiresFacing?: 'up' | 'down' | 'left' | 'right';
    /** When set, the transition is GATED — instead of loading the
     *  target map, walking onto the trigger pops a placeholder
     *  dialogue (`You must reach <lockedTitle> to visit this
     *  district.`). Used for edge-of-map district arrows pointing at
     *  unbuilt content: the arrow exists in the world but the player
     *  can't actually leave yet. Strip this field once the target
     *  district ships and the arrow becomes a real exit. */
    lockedTitle?: string;
  };
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
  /** Optional locale keys for `dialogue`. If present, interaction
   *  reads these through `t()` at interaction time so language
   *  switches are reflected without reloading the map. The raw
   *  `dialogue` array remains the English fallback for editor/data
   *  compatibility. */
  dialogueKeys?: string[];
  /** If set, NPC wanders within this radius (pixels) of their spawn point. */
  wanderRadius?: number;
  /** Optional rectangular area the NPC is confined to (world pixels). */
  wanderBounds?: { x: number; y: number; width: number; height: number };
  /** If set, the NPC owns a vocabulary pack (lookup id in
   *  `src/data/vocabularyPacks.ts`). On interaction the player gets a
   *  "translator offer" dialog instead of plain chat: option to view
   *  the pack as a dictionary or to start a paid quizzing session.
   *  Without this field the NPC does the standard line-by-line chat. */
  vocabularyPackId?: string;
  /** Flavored opener for the translator-job dialog. Falls back to a
   *  generic line ("Hey! You're the translator, right? …") when the
   *  NPC has a vocab pack but doesn't override this. Lets each NPC
   *  pitch the work in their own voice — keeps the recurring dialog
   *  from feeling copy-pasted across every NPC the player meets. */
  vocabularyOfferLine?: string;
  /** Locale key for `vocabularyOfferLine`. Mirrors `dialogueKeys`
   *  but for the translator-offer opener. */
  vocabularyOfferLineKey?: string;
  /** Legacy recorded opener metadata. Main-game NPC dialogue is
   *  intentionally silent now because those lines are native-language
   *  English; target-language word audio is handled by vocabulary
   *  practice/list views instead. */
  vocabularyOfferAudio?: string;
  /** Marks the NPC as a shopkeeper. Interaction shows a 2-button
   *  offer ("Browse" / "Leave") instead of a plain chat; the React
   *  layer routes "Browse" to a ShopView modal listing buyable
   *  items. The string value is the display name shown in the
   *  shop modal header (e.g. "Mart"). */
  shopName?: string;
  /** Routes the NPC's interaction to a React-side handler instead
   *  of the generic chat. Used for quest NPCs whose lines depend on
   *  inventory / event-flag / quest state at interaction time —
   *  content the pure InteractionSystem can't compute without
   *  breaking layering. Slice 1 supports `'child-sandwich'`; slice
   *  3.5 adds `'lender'` for Theo; the intro-cutscene flow adds
   *  `'ceo-intro'` for the office CEO who closes the tutorial
   *  quest. */
  dialogueKind?:
    | 'child-sandwich'
    | 'lender'
    | 'ceo-intro'
    | 'office-tutor'
    | 'office-tutor-listen'
    | 'office-tutor-write'
    | 'cafe-scripted'
    | 'social-hub';
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
  /** If set, this door trigger only fires when the player is moving
   *  in the given direction (key held or position delta this frame).
   *  Set on dynamic (entity-derived) door triggers so lateral slides
   *  across the trigger box don't accidentally fire it. The required
   *  direction is auto-derived from walkable-neighbor analysis at
   *  trigger-creation time: if exactly one side of the trigger has
   *  walkable tiles, the player can only approach from there, and the
   *  required facing is the opposite (e.g. walkable above → require
   *  'down'). Falls back to 'up' when ambiguous (open ground around
   *  the trigger), which matches the legacy outdoor-building-entry
   *  behavior. Hand-coded map triggers leave this undefined and fire
   *  from any direction. */
  requiresFacing?: Direction;
  /** Gating: when set, walking onto this trigger DOES NOT load the
   *  target map. Instead the engine surfaces a placeholder dialogue
   *  ("You must reach <lockedTitle> to visit this district.") and
   *  bounces the player back. Used for edge-of-map district arrows
   *  pointing at unbuilt content. Plumbed through from
   *  `Entity.transition.lockedTitle`. */
  lockedTitle?: string;
}

// ── Layered map content (Tiled-style) ─────────────────────────────────────
// A map's visual content lives in an ordered list of layers. Each layer is
// either a TileLayer (a 2D grid of cell strings) or an ObjectLayer (a list of
// free-positioned Entities). Render order is array order — index 0 first,
// last index on top. Each layer carries editor-only `visible` and `locked`
// flags that the runtime ignores.

interface BaseLayer {
  id: string;          // stable ID, referenced by Entity.layer for objects
  name: string;        // user-facing label
  visible?: boolean;   // default true; editor-only display state
  locked?: boolean;    // default false; editor-only edit state
}

export interface TileLayer extends BaseLayer {
  kind: 'tile';
  /** [row][col] cell strings — TileType enum values for engine tiles, or
   * `me:<theme>/<file>` pack refs. Empty string means "no tile here, let
   * lower layers show through". */
  tiles: string[][];
}

export interface ObjectLayer extends BaseLayer {
  kind: 'object';
  /** Free-positioned entities. Y-sorted within the layer at render time. */
  objects: Entity[];
}

/** Cardinal direction a car can exit from a car-path cell. */
export type CarDirection = 'n' | 's' | 'e' | 'w';

export interface CarPathLayer extends BaseLayer {
  kind: 'car-path';
  /** Sparse cell map keyed `"row,col"` → set of allowed car-exit directions
   * from that cell. Empty (no entry) means the cell isn't part of any road
   * the cars travel on. The runtime treats each cell's exits as outgoing
   * directions, so a cell with `['n']` only sends cars northward. */
  exits: Record<string, CarDirection[]>;
}

export type Layer = TileLayer | ObjectLayer | CarPathLayer;

/** Backwards-compat alias for code paths that only need the editor-only flags
 * (visible/locked/id/name). All Layer instances satisfy this shape. */
export type MapLayer = BaseLayer;

export interface MapData {
  id: string;
  width: number;  // in tiles
  height: number; // in tiles
  tileSize: number;
  /** Ordered list of layers (Tiled-style). Bottom (index 0) renders first.
   * The canonical content store post-refactor — both tile grids and object
   * lists live inside layer entries. */
  layers?: Layer[];
  /** @deprecated — legacy single tile grid for the unmigrated path. Filled
   * by `normalizeMapData` from `layers` when only the new format is present,
   * so downstream readers see consistent data either way. New writers
   * should target `layers` directly. */
  tiles: string[][];
  /** @deprecated — legacy flat object list. See `tiles` note. Same
   * normalization rule applies. */
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
  /** Optional inline choice prompt shown beneath the current line.
   *  When set, the dialogue overlay renders the options as buttons and
   *  the line itself is treated as the prompt. Used for the
   *  "translator job" offer dialog and any future branching UI; the
   *  buttons are non-functional in v1, just visual. */
  options?: DialogueOption[];
  /** Optional context for translator-offer dialogs: which pack the
   *  NPC owns and how many words are in it. Currently informational
   *  only — used to compose the prompt text and the "view dictionary"
   *  / "help translate" buttons. */
  vocabularyPackId?: string;
  vocabularyWordCount?: number;
  /** Legacy recorded dialogue metadata. DialogueOverlay currently
   *  keeps NPC English lines silent; target-language word audio is
   *  handled by vocabulary views instead. */
  audioUrl?: string;
  /** When true, DialogueOverlay reveals the current line in full
   *  immediately — no per-character typewriter pass. Used when we
   *  RESTORE a dialogue the player has already read (e.g. the
   *  translator offer after closing the wordlist) so the typing
   *  pass doesn't replay copy they've already seen. */
  skipTypewriter?: boolean;
  /** Marker that the React layer should rewrite the dialogue based
   *  on game state (inventory / event flags / debt / quest). Mirrors
   *  `NPCData.dialogueKind`; the engine just hands the marker off,
   *  it doesn't interpret the value. */
  dialogueKind?:
    | 'child-sandwich'
    | 'lender'
    | 'ceo-intro'
    | 'office-tutor'
    | 'office-tutor-listen'
    | 'office-tutor-write'
    | 'cafe-scripted'
    | 'social-hub';
  /** Synthetic React-only dialogue that the engine never opened —
   *  e.g. the locked-district notice or the post-session thank-you
   *  fired from `handleCloseTranslateView`. The advance handler
   *  closes locally instead of pushing `ADVANCE_DIALOGUE` to the
   *  engine (which would no-op because the engine has no record
   *  of this dialogue) and the player would be stuck staring at
   *  the box. */
  clientOnly?: boolean;
}

/** Decoupled from `disabled`: a disabled option only dims the row.
 *  `comingSoon: true` adds the "SOON" badge, signalling the
 *  feature is planned but unbuilt. Used for translator modes
 *  (Write/Speak/Recall) that the player will get later. Borrow /
 *  Repay use `disabled` without `comingSoon` so they read as "not
 *  available right now" instead of "coming in a future patch". */
export interface DialogueOption {
  /** Stable id, used by the UI to react when a button is selected. */
  id: string;
  /** Visible button text. */
  label: string;
  /** Optional short helper text rendered beneath the button. */
  hint?: string;
  /** When true, the button renders muted + ignores clicks. The
   *  generic disabled state (no badge) means "not available right
   *  now" — e.g. Repay when you have no money, Borrow when at the
   *  cap. Pair with `comingSoon: true` to add the SOON badge for
   *  features that are planned but unbuilt. */
  disabled?: boolean;
  /** Adds a "SOON" badge to the option, signalling planned-but-
   *  unshipped functionality. Implies `disabled` for click
   *  behaviour but is logically distinct — the SOON badge would
   *  be misleading on transient states like "no money to repay
   *  with right now." */
  comingSoon?: boolean;
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
