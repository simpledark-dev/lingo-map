import { Container, Sprite } from 'pixi.js';
import { MapData, TileType } from '../core/types';
import { getTexture } from './AssetLoader';

/** All transition sprite keys for asset loading. */
export const TRANSITION_ASSET_KEYS = [
  'trans-n', 'trans-s', 'trans-w', 'trans-e',
  'trans-nw', 'trans-ne', 'trans-sw', 'trans-se',
  'trans-full',
  'trans-inner-nw', 'trans-inner-ne', 'trans-inner-sw', 'trans-inner-se',
  'trans-inner-nw-se', 'trans-inner-ne-sw',
];

const DIRT_TILES = new Set<string>([TileType.PATH, TileType.BRIDGE]);

function isDirt(map: MapData, row: number, col: number): boolean {
  if (row < 0 || row >= map.height || col < 0 || col >= map.width) return false;
  return DIRT_TILES.has(map.tiles[row][col]);
}

/**
 * Build transition overlay sprites for grass tiles that border dirt.
 * Uses a quadrant-based approach: each grass tile checks its 4 cardinal
 * and 4 diagonal neighbors, then picks the right blended tile.
 */
export function buildTransitionLayer(map: MapData): Container {
  const layer = new Container();
  const T = map.tileSize;

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] !== TileType.GRASS) continue;

      const n = isDirt(map, row - 1, col);
      const s = isDirt(map, row + 1, col);
      const w = isDirt(map, row, col - 1);
      const e = isDirt(map, row, col + 1);
      const nw = isDirt(map, row - 1, col - 1);
      const ne = isDirt(map, row - 1, col + 1);
      const sw = isDirt(map, row + 1, col - 1);
      const se = isDirt(map, row + 1, col + 1);

      const cardinals = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);

      // No dirt neighbors at all — skip
      if (cardinals === 0 && !nw && !ne && !sw && !se) continue;

      let key: string | null = null;

      if (cardinals >= 3) {
        // 3 or 4 cardinal sides = almost all dirt
        key = 'trans-full';
      } else if (cardinals === 2) {
        // 2 adjacent cardinal sides = outer corner
        if (n && w) key = 'trans-nw';
        else if (n && e) key = 'trans-ne';
        else if (s && w) key = 'trans-sw';
        else if (s && e) key = 'trans-se';
        // 2 opposite sides (n+s or w+e) = treat as full dirt
        else key = 'trans-full';
      } else if (cardinals === 1) {
        // 1 cardinal side = edge
        if (n) key = 'trans-n';
        else if (s) key = 'trans-s';
        else if (w) key = 'trans-w';
        else if (e) key = 'trans-e';
      } else {
        // 0 cardinal sides — check diagonals for inner corners
        // Can have multiple inner corners on one tile
        const diags = (nw ? 1 : 0) + (ne ? 1 : 0) + (sw ? 1 : 0) + (se ? 1 : 0);
        if (diags === 1) {
          if (nw) key = 'trans-inner-nw';
          else if (ne) key = 'trans-inner-ne';
          else if (sw) key = 'trans-inner-sw';
          else if (se) key = 'trans-inner-se';
        } else if (diags === 2) {
          if (nw && se) key = 'trans-inner-nw-se';
          else if (ne && sw) key = 'trans-inner-ne-sw';
          else {
            // Two adjacent diagonals — place both individually
            if (nw) addSprite(layer, 'trans-inner-nw', col, row, T);
            if (ne) addSprite(layer, 'trans-inner-ne', col, row, T);
            if (sw) addSprite(layer, 'trans-inner-sw', col, row, T);
            if (se) addSprite(layer, 'trans-inner-se', col, row, T);
            continue;
          }
        } else if (diags >= 3) {
          // 3+ diagonals — just go full dirt
          key = 'trans-full';
        }
      }

      if (key) addSprite(layer, key, col, row, T);
    }
  }

  return layer;
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
