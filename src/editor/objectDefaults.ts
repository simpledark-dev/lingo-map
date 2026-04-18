import { Anchor, CollisionBox, Building } from '../core/types';

interface ObjectDefault {
  anchor: Anchor;
  collisionBox: CollisionBox;
}

export const OBJECT_DEFAULTS: Record<string, ObjectDefault> = {
  'wall-window':        { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'wall-window-double': { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'wall-painting':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'wall-clock':         { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'wall-staircase':     { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'computer-desk':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'dresser':            { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'fridge':             { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -14, width: 14, height: 14 } },
  'sink-counter':       { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'drawer-cabinet':     { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -12, width: 28, height: 12 } },
  'dining-table-small': { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -22, offsetY: -14, width: 44, height: 14 } },
  'plant-pot':          { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -7, width: 14, height: 7 } },
  'tv':                 { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'rug-large':          { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'doormat':            { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'bed':                { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -14, width: 28, height: 14 } },
  'chair':              { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -6, offsetY: -6, width: 12, height: 6 } },
  'bookshelf':          { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -7, offsetY: -14, width: 14, height: 14 } },
};

export interface BuildingDefault {
  baseSpriteKey: string;
  roofSpriteKey: string;
  anchor: Anchor;
  collisionBox: CollisionBox;
  doorTrigger: CollisionBox;
  targetMapId: string;
  /** Width of base sprite for centering offset */
  baseWidth: number;
  /** Height of base sprite for Y positioning */
  baseHeight: number;
}

export const BUILDING_DEFAULTS: Record<string, BuildingDefault> = {};

export const BUILDING_ITEMS: { key: string; label: string; path: string }[] = [];

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
      { key: 'doormat', label: 'Doormat', path: '/assets/placeholder/doormat.png' },
    ],
  },
];
