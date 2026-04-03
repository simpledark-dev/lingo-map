import { Anchor, CollisionBox } from '../core/types';

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
