import { Container, Sprite } from 'pixi.js';
import { MapData, TileType } from '../core/types';
import { getTexture } from './AssetLoader';

/** All transition sprite keys for asset loading. */
export const TRANSITION_ASSET_KEYS = [
  // Dirt transitions
  'trans-n', 'trans-s', 'trans-w', 'trans-e',
  'trans-nw', 'trans-ne', 'trans-sw', 'trans-se',
  'trans-full',
  'trans-inner-nw', 'trans-inner-ne', 'trans-inner-sw', 'trans-inner-se',
  'trans-inner-nw-se', 'trans-inner-ne-sw',
  // Water transitions
  'trans-water-n', 'trans-water-s', 'trans-water-w', 'trans-water-e',
  'trans-water-nw', 'trans-water-ne', 'trans-water-sw', 'trans-water-se',
  'trans-water-full',
  'trans-water-inner-nw', 'trans-water-inner-ne', 'trans-water-inner-sw', 'trans-water-inner-se',
];

const DIRT_TILES = new Set<string>([TileType.PATH, TileType.BRIDGE]);
const WATER_TILES = new Set<string>([TileType.WATER]);

function isType(map: MapData, row: number, col: number, types: Set<string>): boolean {
  if (row < 0 || row >= map.height || col < 0 || col >= map.width) return false;
  return types.has(map.tiles[row][col]);
}

/**
 * Build transition overlays for grass tiles that border dirt or water.
 *
 * `includeWater` defaults to true for the in-game renderer. The editor passes
 * false because it draws grass↔water transitions through the dual-grid
 * `AutoTileset` instead, and the two systems would otherwise overlap.
 */
export function buildTransitionLayer(map: MapData, includeWater = true): Container {
  const layer = new Container();
  const T = map.tileSize;

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] !== TileType.GRASS) continue;

      // Check dirt neighbors
      addTransitionsForType(layer, map, row, col, T, DIRT_TILES, 'trans');
      // Check water neighbors
      if (includeWater) {
        addTransitionsForType(layer, map, row, col, T, WATER_TILES, 'trans-water');
      }
    }
  }

  return layer;
}

function addTransitionsForType(
  layer: Container, map: MapData, row: number, col: number, T: number,
  tileSet: Set<string>, prefix: string,
): void {
  const n = isType(map, row - 1, col, tileSet);
  const s = isType(map, row + 1, col, tileSet);
  const w = isType(map, row, col - 1, tileSet);
  const e = isType(map, row, col + 1, tileSet);
  const nw = isType(map, row - 1, col - 1, tileSet);
  const ne = isType(map, row - 1, col + 1, tileSet);
  const sw = isType(map, row + 1, col - 1, tileSet);
  const se = isType(map, row + 1, col + 1, tileSet);

  const cardinals = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);
  if (cardinals === 0 && !nw && !ne && !sw && !se) return;

  let key: string | null = null;

  if (cardinals >= 3) {
    key = `${prefix}-full`;
  } else if (cardinals === 2) {
    if (n && w) key = `${prefix}-nw`;
    else if (n && e) key = `${prefix}-ne`;
    else if (s && w) key = `${prefix}-sw`;
    else if (s && e) key = `${prefix}-se`;
    else key = `${prefix}-full`;
  } else if (cardinals === 1) {
    if (n) key = `${prefix}-n`;
    else if (s) key = `${prefix}-s`;
    else if (w) key = `${prefix}-w`;
    else if (e) key = `${prefix}-e`;
  } else {
    const diags = (nw ? 1 : 0) + (ne ? 1 : 0) + (sw ? 1 : 0) + (se ? 1 : 0);
    if (diags === 1) {
      if (nw) key = `${prefix}-inner-nw`;
      else if (ne) key = `${prefix}-inner-ne`;
      else if (sw) key = `${prefix}-inner-sw`;
      else if (se) key = `${prefix}-inner-se`;
    } else if (diags >= 2) {
      // Place each individually
      if (nw) addSprite(layer, `${prefix}-inner-nw`, col, row, T);
      if (ne) addSprite(layer, `${prefix}-inner-ne`, col, row, T);
      if (sw) addSprite(layer, `${prefix}-inner-sw`, col, row, T);
      if (se) addSprite(layer, `${prefix}-inner-se`, col, row, T);
      return;
    }
  }

  if (key) addSprite(layer, key, col, row, T);
}

function addSprite(layer: Container, key: string, col: number, row: number, T: number): void {
  const texture = getTexture(key);
  if (!texture) return;
  const sprite = new Sprite(texture);
  sprite.x = col * T;
  sprite.y = row * T;
  sprite.width = T;
  sprite.height = T;
  layer.addChild(sprite);
}
