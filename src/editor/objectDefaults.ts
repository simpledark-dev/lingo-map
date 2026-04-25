import { Anchor, CollisionBox } from '../core/types';

/** Interior map a newly-placed building points at when its `BuildingDefault`
 * doesn't specify one. As new interiors are built, update each `BUILDING_DEFAULTS`
 * entry's `targetMapId` to send that building type to its own map. */
export const DEFAULT_INTERIOR_MAP_ID = 'pokemon-house-1f';

interface ObjectDefault {
  anchor: Anchor;
  collisionBox: CollisionBox;
  /** If true, sprite always renders BEHIND other entities/player. Used for
   * floor decor (rugs, doormats) and wall decor (windows, paintings) so the
   * player walks over/in front of them. */
  isDecor?: boolean;
}

export const OBJECT_DEFAULTS: Record<string, ObjectDefault> = {
  'wall-window':        { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'wall-window-double': { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'wall-painting':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'wall-clock':         { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'wall-staircase':     { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'computer-desk':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'dresser':            { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'fridge':             { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -14, width: 14, height: 14 } },
  'sink-counter':       { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'drawer-cabinet':     { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -12, width: 28, height: 12 } },
  'dining-table-small': { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -22, offsetY: -14, width: 44, height: 14 } },
  'plant-pot':          { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -7, width: 14, height: 7 } },
  'tv':                 { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'rug-large':          { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'rug-medium':         { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'doormat':            { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 }, isDecor: true },
  'floor-clock':        { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -8, width: 14, height: 8 } },
  'plant-pot-2':        { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -7, width: 14, height: 7 } },
  'lamp-table':         { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -5, offsetY: -6, width: 10, height: 6 } },
  'bed':                { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'chair':              { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -6, offsetY: -6, width: 12, height: 6 } },
  'bookshelf':          { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -14, width: 14, height: 14 } },
  // Grocer shelving (129×141 native). Collision sized for the default 0.5×
  // editor scale — covers the base of the shelf; scale it in the selection
  // panel and the collision will need a manual bump if you size it up.
  'food-row':           { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -30, offsetY: -20, width: 60, height: 20 } },
};

export interface BuildingDefault {
  baseSpriteKey: string;
  /** Omit for buildings drawn as a single combined image (no separate roof). */
  roofSpriteKey?: string;
  anchor: Anchor;
  collisionBox: CollisionBox;
  doorTrigger: CollisionBox;
  /** Interior map this building opens into. Omit to fall back to
   * `DEFAULT_INTERIOR_MAP_ID` — useful while an interior is still being built. */
  targetMapId?: string;
  /** Width of base sprite for centering offset */
  baseWidth: number;
  /** Height of base sprite for Y positioning */
  baseHeight: number;
}

// Collision boxes / door triggers mirror the hand-tuned values in
// `src/maps/pokemon.ts` so buildings placed via the editor behave identically
// to the ones compiled into the starter outdoor map.
export const BUILDING_DEFAULTS: Record<string, BuildingDefault> = {
  house: {
    baseSpriteKey: 'house-base',
    roofSpriteKey: 'house-roof',
    anchor: { x: 0.5, y: 1.0 },
    collisionBox: { offsetX: -38, offsetY: -52, width: 76, height: 52 },
    doorTrigger: { offsetX: -6, offsetY: 0, width: 12, height: 8 },
    baseWidth: 80,
    baseHeight: 64,
  },
  mart: {
    baseSpriteKey: 'mart-base',
    roofSpriteKey: 'mart-roof',
    anchor: { x: 0.5, y: 1.0 },
    collisionBox: { offsetX: -38, offsetY: -52, width: 76, height: 52 },
    doorTrigger: { offsetX: -6, offsetY: 0, width: 12, height: 8 },
    baseWidth: 80,
    baseHeight: 64,
  },
  lab: {
    baseSpriteKey: 'lab-base',
    roofSpriteKey: 'lab-roof',
    anchor: { x: 0.5, y: 1.0 },
    collisionBox: { offsetX: -46, offsetY: -68, width: 92, height: 68 },
    doorTrigger: { offsetX: -8, offsetY: 0, width: 16, height: 8 },
    baseWidth: 96,
    baseHeight: 80,
  },
  // Single-sprite house (no separate roof). Right door is the entrance:
  // at 256×138 the right door sits ~88px right of center, bottom of sprite.
  // The left door is ignored — would need a second trigger to support both.
  'house-new': {
    baseSpriteKey: 'house-new',
    anchor: { x: 0.5, y: 1.0 },
    collisionBox: { offsetX: -112, offsetY: -120, width: 224, height: 120 },
    doorTrigger: { offsetX: 72, offsetY: 0, width: 32, height: 16 },
    baseWidth: 256,
    baseHeight: 138,
  },
  // Native-resolution variant — placed at 670×372 for comparison with the
  // downscaled house-new. Right door is the entrance (~223px right of center).
  'house-new-2': {
    baseSpriteKey: 'house-new-2',
    anchor: { x: 0.5, y: 1.0 },
    collisionBox: { offsetX: -310, offsetY: -330, width: 620, height: 330 },
    doorTrigger: { offsetX: 203, offsetY: 0, width: 40, height: 16 },
    baseWidth: 670,
    baseHeight: 372,
  },
  // Native pixel-art version at 200×110 (~12×7 tiles at 16px tile size).
  // Right door ~65px right of center.
  'house-new-3': {
    baseSpriteKey: 'house-new-3',
    anchor: { x: 0.5, y: 1.0 },
    collisionBox: { offsetX: -94, offsetY: -100, width: 188, height: 100 },
    doorTrigger: { offsetX: 57, offsetY: 0, width: 16, height: 8 },
    baseWidth: 200,
    baseHeight: 110,
  },
  // "Pixel Grocer" shop at 237×99 (~15×6 tiles). Entrance under the awning
  // on the LEFT side, ~46px left of sprite center.
  'house-new-4': {
    baseSpriteKey: 'house-new-4',
    anchor: { x: 0.5, y: 1.0 },
    collisionBox: { offsetX: -114, offsetY: -92, width: 228, height: 92 },
    doorTrigger: { offsetX: -58, offsetY: 0, width: 24, height: 8 },
    targetMapId: 'grocer-1f',
    baseWidth: 237,
    baseHeight: 99,
  },
};

export const BUILDING_ITEMS: { key: string; label: string; path: string }[] = [
  { key: 'house',     label: 'House',    path: '/assets/placeholder/house-base.png' },
  { key: 'mart',      label: 'Mart',     path: '/assets/placeholder/mart-base.png' },
  { key: 'lab',       label: 'Lab',      path: '/assets/placeholder/lab-base.png' },
  { key: 'house-new', label: 'House v2', path: '/assets/placeholder/house-new.png' },
  { key: 'house-new-2', label: 'House v2 full', path: '/assets/placeholder/house-new-2.png' },
  { key: 'house-new-3', label: 'House v3 px',   path: '/assets/placeholder/house-new-3.png' },
  { key: 'house-new-4', label: 'Grocer',        path: '/assets/placeholder/house-new-4.png' },
];

export interface TileItem {
  key: string;
  label: string;
  path: string;
  /** Optional crop into the source image — used for tileset slices. */
  frame?: { x: number; y: number; w: number; h: number; sheetW: number; sheetH: number };
}

// `tileset-1.png` is a 64×64 sheet of 16×16 blob tiles.
// idx 12 (row 3, col 0) = solid grass; idx 6 (row 1, col 2) = solid water.
// Indices come from `MASK_TO_INDEX[15]` and `MASK_TO_INDEX[0]` in AutoTileset.ts.
const TILESET_PATH = '/assets/tileset-1.png';
const TS = 16;
const SHEET = 64;

export const TILE_ITEMS: TileItem[] = [
  { key: 'grass', label: 'Grass', path: TILESET_PATH, frame: { x: 0, y: 48, w: TS, h: TS, sheetW: SHEET, sheetH: SHEET } },
  { key: 'grass-new', label: 'Grass New', path: '/assets/placeholder/grass-new.png' },
  { key: 'grass_dark', label: 'Dark Grass', path: '/assets/tileset-2.png', frame: { x: 0, y: 48, w: TS, h: TS, sheetW: SHEET, sheetH: SHEET } },
  { key: 'dirt', label: 'Dirt', path: '/assets/tileset-3.png', frame: { x: 0, y: 48, w: TS, h: TS, sheetW: SHEET, sheetH: SHEET } },
  { key: 'water', label: 'Water', path: TILESET_PATH, frame: { x: 32, y: 16, w: TS, h: TS, sheetW: SHEET, sheetH: SHEET } },
  { key: 'bridge', label: 'Bridge', path: '/assets/placeholder/bridge.png' },
  { key: 'wall', label: 'Wall', path: '/assets/placeholder/wall.png' },
  { key: 'wall-interior', label: 'Int. Wall', path: '/assets/placeholder/wall-interior.png' },
  { key: 'wall-interior-top', label: 'Wall Top', path: '/assets/placeholder/wall-interior-top.png' },
  { key: 'wall-interior-top-left', label: 'Wall TL', path: '/assets/placeholder/wall-interior-top-left.png' },
  { key: 'wall-interior-top-corner-bl', label: 'Wall T-Cnr', path: '/assets/placeholder/wall-interior-top-corner-bl.png' },
  { key: 'wall-interior-top-corner-inner-tr', label: 'Wall T-iTR', path: '/assets/placeholder/wall-interior-top-corner-inner-tr.png' },
  { key: 'wall-interior-top-bl', label: 'Wall T-BL', path: '/assets/placeholder/wall-interior-top-bl.png' },
  { key: 'wall-interior-top-br', label: 'Wall T-BR', path: '/assets/placeholder/wall-interior-top-br.png' },
  { key: 'wall-interior-bottom', label: 'Wall Btm', path: '/assets/placeholder/wall-interior-bottom.png' },
  { key: 'wall-interior-left', label: 'Wall Left', path: '/assets/placeholder/wall-interior-left.png' },
  { key: 'wall-interior-right', label: 'Wall Right', path: '/assets/placeholder/wall-interior-right.png' },
  { key: 'wall-interior-corner-bottom-left', label: 'Wall BL', path: '/assets/placeholder/wall-interior-corner-bottom-left.png' },
  { key: 'wall-interior-corner-bottom-right', label: 'Wall BR', path: '/assets/placeholder/wall-interior-corner-bottom-right.png' },
  { key: 'floor', label: 'Floor', path: '/assets/placeholder/floor.png' },
  { key: 'floor-wood', label: 'Wood Floor', path: '/assets/placeholder/floor-wood.png' },
  { key: 'floor-wood-2', label: 'Wood Floor 2', path: '/assets/placeholder/floor-wood-2.png' },
  { key: 'floor-wood-3', label: 'Wood Floor 3', path: '/assets/placeholder/floor-wood-3.png' },
  // One brush for the 32×32 motif — renderer picks the right quadrant per cell.
  { key: 'floor-pattern', label: 'Floor 32×32', path: '/assets/placeholder/floor-tl.png' },
  { key: 'wall-brick', label: 'Brick Wall', path: '/assets/placeholder/wall-brick-tl.png' },
];

export const OBJECT_CATEGORIES = [
  {
    label: 'Interior',
    items: [
      { key: 'bed', label: 'Bed', path: '/assets/placeholder/bed.png' },
      { key: 'chair', label: 'Chair', path: '/assets/placeholder/chair.png' },
      { key: 'bookshelf', label: 'Bookshelf', path: '/assets/placeholder/bookshelf.png' },
      { key: 'computer-desk', label: 'Comp Desk', path: '/assets/placeholder/computer-desk.png' },
      { key: 'dresser', label: 'Dresser', path: '/assets/placeholder/dresser.png' },
      { key: 'fridge', label: 'Fridge', path: '/assets/placeholder/fridge.png' },
      { key: 'sink-counter', label: 'Sink', path: '/assets/placeholder/sink-counter.png' },
      { key: 'drawer-cabinet', label: 'Drawer', path: '/assets/placeholder/drawer-cabinet.png' },
      { key: 'dining-table-small', label: 'Table', path: '/assets/placeholder/dining-table-small.png' },
      { key: 'tv', label: 'TV', path: '/assets/placeholder/tv.png' },
      { key: 'plant-pot', label: 'Plant', path: '/assets/placeholder/plant-pot.png' },
      { key: 'plant-pot-2', label: 'Plant 2', path: '/assets/placeholder/plant-pot-2.png' },
      { key: 'floor-clock', label: 'Flr Clock', path: '/assets/placeholder/floor-clock.png' },
      { key: 'lamp-table', label: 'Lamp', path: '/assets/placeholder/lamp-table.png' },
    ],
  },
  {
    label: 'Shop',
    items: [
      { key: 'food-row', label: 'Food Shelf', path: '/assets/placeholder/food-row.png' },
    ],
  },
  {
    label: 'Wall Decor',
    items: [
      { key: 'wall-window', label: 'Window', path: '/assets/placeholder/wall-window.png' },
      { key: 'wall-window-double', label: 'Dbl Window', path: '/assets/placeholder/wall-window-double.png' },
      { key: 'wall-painting', label: 'Painting', path: '/assets/placeholder/wall-painting.png' },
      { key: 'wall-clock', label: 'Clock', path: '/assets/placeholder/wall-clock.png' },
      { key: 'wall-staircase', label: 'Staircase', path: '/assets/placeholder/wall-staircase.png' },
      { key: 'rug-large', label: 'Rug', path: '/assets/placeholder/rug-large.png' },
      { key: 'rug-medium', label: 'Rug 2', path: '/assets/placeholder/rug-medium.png' },
      { key: 'doormat', label: 'Doormat', path: '/assets/placeholder/doormat.png' },
    ],
  },
];
