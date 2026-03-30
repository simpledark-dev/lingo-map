import { Assets, Texture } from 'pixi.js';
import { TileType } from '../core/types';

const ASSET_BASE = '/assets/placeholder/';

/** Maps sprite keys to file paths. */
const spriteManifest: Record<string, string> = {
  // Tiles
  [TileType.GRASS]: `${ASSET_BASE}grass.png`,
  [TileType.PATH]: `${ASSET_BASE}path.png`,
  [TileType.FLOOR]: `${ASSET_BASE}floor.png`,
  [TileType.WALL]: `${ASSET_BASE}wall.png`,
  // Player
  'player-down': `${ASSET_BASE}player-down.png`,
  'player-up': `${ASSET_BASE}player-up.png`,
  'player-left': `${ASSET_BASE}player-left.png`,
  'player-right': `${ASSET_BASE}player-right.png`,
  // Objects
  'tree': `${ASSET_BASE}tree.png`,
  'rock': `${ASSET_BASE}rock.png`,
  'house-base': `${ASSET_BASE}house-base.png`,
  'house-roof': `${ASSET_BASE}house-roof.png`,
  'npc': `${ASSET_BASE}npc.png`,
  'furniture': `${ASSET_BASE}furniture.png`,
};

const textureCache = new Map<string, Texture>();

export async function loadAssets(spriteKeys: string[]): Promise<Map<string, Texture>> {
  const toLoad: { key: string; path: string }[] = [];

  for (const key of spriteKeys) {
    if (textureCache.has(key)) continue;
    const path = spriteManifest[key];
    if (!path) {
      console.warn(`No asset path for sprite key: ${key}`);
      continue;
    }
    toLoad.push({ key, path });
  }

  // Load all missing textures
  for (const { key, path } of toLoad) {
    const texture = await Assets.load<Texture>(path);
    // Nearest-neighbor filtering for pixel art
    texture.source.scaleMode = 'nearest';
    textureCache.set(key, texture);
  }

  // Return the subset requested
  const result = new Map<string, Texture>();
  for (const key of spriteKeys) {
    const tex = textureCache.get(key);
    if (tex) result.set(key, tex);
  }
  return result;
}

export function getTexture(key: string): Texture | undefined {
  return textureCache.get(key);
}
