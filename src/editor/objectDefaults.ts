import { Anchor, CollisionBox, Building } from '../core/types';

interface ObjectDefault {
  anchor: Anchor;
  collisionBox: CollisionBox;
}

export const OBJECT_DEFAULTS: Record<string, ObjectDefault> = {
  'tree':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -12, offsetY: -16, width: 24, height: 16 } },
  'rock':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -12, offsetY: -20, width: 24, height: 20 } },
  'bush':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -10, offsetY: -12, width: 20, height: 12 } },
  'flowers':   { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } },
  'lamp-post': { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -4, offsetY: -6, width: 8, height: 6 } },
  'fence':     { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -8, width: 28, height: 8 } },
  'well':      { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -20, width: 28, height: 20 } },
  'bench':     { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -14, offsetY: -10, width: 28, height: 10 } },
  'signpost':  { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -6, offsetY: -8, width: 12, height: 8 } },
  'log-pile':  { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -12, offsetY: -12, width: 24, height: 12 } },
  'pot':       { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -8, offsetY: -10, width: 16, height: 10 } },
  'barrel':    { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -10, offsetY: -12, width: 20, height: 12 } },
  'crate':     { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -10, offsetY: -10, width: 20, height: 10 } },
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

export const BUILDING_DEFAULTS: Record<string, BuildingDefault> = {
  'house': { baseSpriteKey: 'house-base', roofSpriteKey: 'house-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -96, offsetY: -112, width: 192, height: 104 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'indoor', baseWidth: 192, baseHeight: 112 },
  'cafe': { baseSpriteKey: 'cafe-base', roofSpriteKey: 'cafe-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -120, offsetY: -124, width: 240, height: 116 }, doorTrigger: { offsetX: -16, offsetY: -8, width: 32, height: 8 }, targetMapId: 'cafe', baseWidth: 240, baseHeight: 124 },
  'restaurant': { baseSpriteKey: 'restaurant-base', roofSpriteKey: 'restaurant-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -96, offsetY: -112, width: 192, height: 104 }, doorTrigger: { offsetX: -20, offsetY: -8, width: 40, height: 8 }, targetMapId: 'restaurant', baseWidth: 192, baseHeight: 112 },
  'bookstore': { baseSpriteKey: 'bookstore-base', roofSpriteKey: 'bookstore-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -104, offsetY: -151, width: 208, height: 143 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'bookstore', baseWidth: 208, baseHeight: 151 },
  'market': { baseSpriteKey: 'market-base', roofSpriteKey: 'market-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -120, offsetY: -141, width: 240, height: 133 }, doorTrigger: { offsetX: -16, offsetY: -8, width: 32, height: 8 }, targetMapId: 'market', baseWidth: 240, baseHeight: 141 },
  'bakery': { baseSpriteKey: 'bakery-base', roofSpriteKey: 'bakery-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -104, offsetY: -114, width: 208, height: 106 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'bakery', baseWidth: 208, baseHeight: 114 },
  'inn': { baseSpriteKey: 'inn-base', roofSpriteKey: 'inn-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -80, offsetY: -112, width: 160, height: 104 }, doorTrigger: { offsetX: -14, offsetY: -8, width: 28, height: 8 }, targetMapId: 'inn', baseWidth: 160, baseHeight: 112 },
  'blacksmith': { baseSpriteKey: 'blacksmith-base', roofSpriteKey: 'blacksmith-roof', anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: -64, offsetY: -96, width: 128, height: 88 }, doorTrigger: { offsetX: -12, offsetY: -8, width: 24, height: 8 }, targetMapId: 'blacksmith', baseWidth: 128, baseHeight: 96 },
};

export const BUILDING_ITEMS = [
  { key: 'house', label: 'House', path: '/assets/placeholder/house-base.png' },
  { key: 'cafe', label: 'Cafe', path: '/assets/placeholder/cafe-base.png' },
  { key: 'restaurant', label: 'Restaurant', path: '/assets/placeholder/restaurant-base.png' },
  { key: 'bookstore', label: 'Bookstore', path: '/assets/placeholder/bookstore-base.png' },
  { key: 'market', label: 'Market', path: '/assets/placeholder/market-base.png' },
  { key: 'bakery', label: 'Bakery', path: '/assets/placeholder/bakery-base.png' },
  { key: 'inn', label: 'Inn', path: '/assets/placeholder/inn-base.png' },
  { key: 'blacksmith', label: 'Blacksmith', path: '/assets/placeholder/blacksmith-base.png' },
];

export const TILE_ITEMS = [
  { key: 'grass', label: 'Grass', path: '/assets/placeholder/grass.png' },
  { key: 'path', label: 'Path', path: '/assets/placeholder/path.png' },
  { key: 'water', label: 'Water', path: '/assets/placeholder/water.png' },
  { key: 'bridge', label: 'Bridge', path: '/assets/placeholder/bridge.png' },
  { key: 'wall', label: 'Wall', path: '/assets/placeholder/wall.png' },
  { key: 'floor', label: 'Floor', path: '/assets/placeholder/floor.png' },
];

export const OBJECT_CATEGORIES = [
  {
    label: 'Nature',
    items: [
      { key: 'tree', label: 'Tree', path: '/assets/placeholder/tree.png' },
      { key: 'rock', label: 'Rock', path: '/assets/placeholder/rock.png' },
      { key: 'bush', label: 'Bush', path: '/assets/placeholder/bush.png' },
      { key: 'flowers', label: 'Flowers', path: '/assets/placeholder/flowers.png' },
    ],
  },
  {
    label: 'Furniture',
    items: [
      { key: 'bench', label: 'Bench', path: '/assets/placeholder/bench.png' },
      { key: 'well', label: 'Well', path: '/assets/placeholder/well.png' },
      { key: 'fence', label: 'Fence', path: '/assets/placeholder/fence.png' },
      { key: 'lamp-post', label: 'Lamp', path: '/assets/placeholder/lamp-post.png' },
      { key: 'signpost', label: 'Sign', path: '/assets/placeholder/signpost.png' },
    ],
  },
  {
    label: 'Storage',
    items: [
      { key: 'crate', label: 'Crate', path: '/assets/placeholder/crate.png' },
      { key: 'barrel', label: 'Barrel', path: '/assets/placeholder/barrel.png' },
      { key: 'pot', label: 'Pot', path: '/assets/placeholder/pot.png' },
      { key: 'log-pile', label: 'Logs', path: '/assets/placeholder/log-pile.png' },
    ],
  },
];
