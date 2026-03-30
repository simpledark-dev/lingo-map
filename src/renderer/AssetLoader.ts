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
  [TileType.WATER]: `${ASSET_BASE}water.png`,
  [TileType.BRIDGE]: `${ASSET_BASE}bridge.png`,
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
  'npc-blue': `${ASSET_BASE}npc-blue.png`,
  'npc-green': `${ASSET_BASE}npc-green.png`,
  'npc-purple': `${ASSET_BASE}npc-purple.png`,
  'npc-orange': `${ASSET_BASE}npc-orange.png`,
  'npc-yellow': `${ASSET_BASE}npc-yellow.png`,
  'npc-teal': `${ASSET_BASE}npc-teal.png`,
  'npc-pink': `${ASSET_BASE}npc-pink.png`,
  'npc-brown': `${ASSET_BASE}npc-brown.png`,
  'npc-white': `${ASSET_BASE}npc-white.png`,
  'furniture': `${ASSET_BASE}furniture.png`,
  // Indoor objects
  'chair': `${ASSET_BASE}chair.png`,
  'bed': `${ASSET_BASE}bed.png`,
  'bookshelf': `${ASSET_BASE}bookshelf.png`,
  'fireplace': `${ASSET_BASE}fireplace.png`,
  'rug': `${ASSET_BASE}rug.png`,
  'crate': `${ASSET_BASE}crate.png`,
  'barrel': `${ASSET_BASE}barrel.png`,
  'pot': `${ASSET_BASE}pot.png`,
  'candle': `${ASSET_BASE}candle.png`,
  'window-indoor': `${ASSET_BASE}window.png`,
  'stove': `${ASSET_BASE}stove.png`,
  // Building exteriors
  'cafe-base': `${ASSET_BASE}cafe-base.png`,
  'cafe-roof': `${ASSET_BASE}cafe-roof.png`,
  'restaurant-base': `${ASSET_BASE}restaurant-base.png`,
  'restaurant-roof': `${ASSET_BASE}restaurant-roof.png`,
  // Indoor — cafe/restaurant shared
  'counter': `${ASSET_BASE}counter.png`,
  'coffee-machine': `${ASSET_BASE}coffee-machine.png`,
  // Cafe-specific
  'cafe-table': `${ASSET_BASE}cafe-table.png`,
  'cafe-chair': `${ASSET_BASE}cafe-chair.png`,
  'coffee-cup': `${ASSET_BASE}coffee-cup.png`,
  'menu-board': `${ASSET_BASE}menu-board.png`,
  'pastry-case': `${ASSET_BASE}pastry-case.png`,
  'sofa': `${ASSET_BASE}sofa.png`,
  // Restaurant-specific
  'dining-table': `${ASSET_BASE}dining-table.png`,
  'dining-chair': `${ASSET_BASE}dining-chair.png`,
  'wine-bottle': `${ASSET_BASE}wine-bottle.png`,
  'plate': `${ASSET_BASE}plate.png`,
  'chandelier': `${ASSET_BASE}chandelier.png`,
  'wine-rack': `${ASSET_BASE}wine-rack.png`,
  // New building exteriors
  'bookstore-base': `${ASSET_BASE}bookstore-base.png`,
  'bookstore-roof': `${ASSET_BASE}bookstore-roof.png`,
  'market-base': `${ASSET_BASE}market-base.png`,
  'market-roof': `${ASSET_BASE}market-roof.png`,
  'bakery-base': `${ASSET_BASE}bakery-base.png`,
  'bakery-roof': `${ASSET_BASE}bakery-roof.png`,
  'inn-base': `${ASSET_BASE}inn-base.png`,
  'inn-roof': `${ASSET_BASE}inn-roof.png`,
  'blacksmith-base': `${ASSET_BASE}blacksmith-base.png`,
  'blacksmith-roof': `${ASSET_BASE}blacksmith-roof.png`,
  // Location-specific indoor objects
  'anvil': `${ASSET_BASE}anvil.png`,
  'forge': `${ASSET_BASE}forge.png`,
  'weapons-rack': `${ASSET_BASE}weapons-rack.png`,
  'market-stall': `${ASSET_BASE}market-stall.png`,
  'bread-basket': `${ASSET_BASE}bread-basket.png`,
  'inn-bed': `${ASSET_BASE}inn-bed.png`,
  // Outdoor decorations
  'flowers': `${ASSET_BASE}flowers.png`,
  'lamp-post': `${ASSET_BASE}lamp-post.png`,
  'fence': `${ASSET_BASE}fence.png`,
  'well': `${ASSET_BASE}well.png`,
  'bench': `${ASSET_BASE}bench.png`,
  'signpost': `${ASSET_BASE}signpost.png`,
  'bush': `${ASSET_BASE}bush.png`,
  'log-pile': `${ASSET_BASE}log-pile.png`,
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

  // Load all missing textures in parallel
  if (toLoad.length > 0) {
    const textures = await Promise.all(
      toLoad.map(({ path }) => Assets.load<Texture>(path))
    );
    for (let i = 0; i < toLoad.length; i++) {
      textures[i].source.scaleMode = 'nearest';
      textureCache.set(toLoad[i].key, textures[i]);
    }
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

/** Preload all known assets in the background. Call once after initial scene is ready. */
export async function preloadAllAssets(): Promise<void> {
  await loadAssets(Object.keys(spriteManifest));
}
