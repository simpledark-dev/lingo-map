import { Assets, Texture } from 'pixi.js';
import { TileType } from '../core/types';
import { TILE_SIZE } from '../core/constants';

const ASSET_BASE = '/assets/placeholder/';

// ── Pack assets (Modern Exteriors Singles) ────────────────────────────────
// Sprite keys of the form `me:<themeFolder>/<fileStem>` resolve to PNGs under
// `/assets/me/<themeFolder>/<fileStem>.png`. Each Single is a discrete asset
// at its native size — could be 16×16 (paintable as a tile) or 256×240 (a
// whole building used as an object). The renderer treats the texture as-is.

// Dev points at the symlinked full pack (`public/assets/me`, gitignored,
// not deployed). Vercel builds set `NEXT_PUBLIC_PACK_BASE_URL=/assets/me-bundle/`,
// which is the committed subset produced by `npm run pack:bundle`.
const PACK_BASE = process.env.NEXT_PUBLIC_PACK_BASE_URL ?? '/assets/me/';

const packPromises = new Map<string, Promise<Texture | null>>();

/** Resolve a pack key to its public URL. Returns null if not a pack key. */
function packKeyToUrl(key: string): string | null {
  if (!key.startsWith('me:')) return null;
  return `${PACK_BASE}${key.slice(3)}.png`;
}

/** Lazy-load a pack single by its key. Idempotent. Texture is cached in
 * `textureCache` once resolved so subsequent `getTexture` calls hit. */
export function loadPackSingle(key: string): Promise<Texture | null> {
  if (textureCache.has(key)) return Promise.resolve(textureCache.get(key)!);
  const inflight = packPromises.get(key);
  if (inflight) return inflight;
  const url = packKeyToUrl(key);
  if (!url) return Promise.resolve(null);
  const p = Assets.load<Texture>(url).then((tex) => {
    tex.source.scaleMode = 'nearest';
    textureCache.set(key, tex);
    packPromises.delete(key);
    return tex;
  }).catch((err) => {
    console.warn(`Failed to load pack single "${key}":`, err);
    packPromises.delete(key);
    return null;
  });
  packPromises.set(key, p);
  return p;
}

/** Maps sprite keys to file paths. */
const spriteManifest: Record<string, string> = {
  // Tiles
  [TileType.GRASS]: `${ASSET_BASE}grass.png`,
  [TileType.GRASS_DARK]: `${ASSET_BASE}grass_dark.png`,
  [TileType.DIRT]: `${ASSET_BASE}dirt.png`,
  [TileType.PATH]: `${ASSET_BASE}path.png`,
  [TileType.FLOOR]: `${ASSET_BASE}floor.png`,
  [TileType.FLOOR_WOOD]: `${ASSET_BASE}floor-wood.png`,
  [TileType.FLOOR_WOOD_2]: `${ASSET_BASE}floor-wood-2.png`,
  [TileType.FLOOR_WOOD_3]: `${ASSET_BASE}floor-wood-3.png`,
  [TileType.WALL]: `${ASSET_BASE}wall.png`,
  [TileType.WALL_INTERIOR]: `${ASSET_BASE}wall-interior.png`,
  [TileType.WALL_INTERIOR_TOP]: `${ASSET_BASE}wall-interior-top.png`,
  [TileType.WALL_INTERIOR_TOP_LEFT]: `${ASSET_BASE}wall-interior-top-left.png`,
  [TileType.WALL_INTERIOR_TOP_CORNER_BL]: `${ASSET_BASE}wall-interior-top-corner-bl.png`,
  [TileType.WALL_INTERIOR_TOP_CORNER_INNER_TR]: `${ASSET_BASE}wall-interior-top-corner-inner-tr.png`,
  [TileType.WALL_INTERIOR_TOP_BL]: `${ASSET_BASE}wall-interior-top-bl.png`,
  [TileType.WALL_INTERIOR_TOP_BR]: `${ASSET_BASE}wall-interior-top-br.png`,
  [TileType.WALL_INTERIOR_BOTTOM]: `${ASSET_BASE}wall-interior-bottom.png`,
  [TileType.WALL_INTERIOR_LEFT]: `${ASSET_BASE}wall-interior-left.png`,
  [TileType.WALL_INTERIOR_RIGHT]: `${ASSET_BASE}wall-interior-right.png`,
  [TileType.WALL_INTERIOR_CORNER_BOTTOM_LEFT]: `${ASSET_BASE}wall-interior-corner-bottom-left.png`,
  [TileType.WALL_INTERIOR_CORNER_BOTTOM_RIGHT]: `${ASSET_BASE}wall-interior-corner-bottom-right.png`,
  [TileType.WATER]: `${ASSET_BASE}water.png`,
  [TileType.BRIDGE]: `${ASSET_BASE}bridge.png`,
  // Transition tiles (grass ↔ dirt edges)
  'trans-n': `${ASSET_BASE}trans-n.png`,
  'trans-s': `${ASSET_BASE}trans-s.png`,
  'trans-w': `${ASSET_BASE}trans-w.png`,
  'trans-e': `${ASSET_BASE}trans-e.png`,
  'trans-nw': `${ASSET_BASE}trans-nw.png`,
  'trans-ne': `${ASSET_BASE}trans-ne.png`,
  'trans-sw': `${ASSET_BASE}trans-sw.png`,
  'trans-se': `${ASSET_BASE}trans-se.png`,
  'trans-full': `${ASSET_BASE}trans-nse.png`,
  'trans-inner-nw': `${ASSET_BASE}trans-inner-nw.png`,
  'trans-inner-ne': `${ASSET_BASE}trans-inner-ne.png`,
  'trans-inner-sw': `${ASSET_BASE}trans-inner-sw.png`,
  'trans-inner-se': `${ASSET_BASE}trans-inner-se.png`,
  'trans-inner-nw-se': `${ASSET_BASE}trans-inner-nw-se.png`,
  'trans-inner-ne-sw': `${ASSET_BASE}trans-inner-ne-sw.png`,
  // Water transition tiles
  'trans-water-n': `${ASSET_BASE}trans-water-n.png`,
  'trans-water-s': `${ASSET_BASE}trans-water-s.png`,
  'trans-water-w': `${ASSET_BASE}trans-water-w.png`,
  'trans-water-e': `${ASSET_BASE}trans-water-e.png`,
  'trans-water-nw': `${ASSET_BASE}trans-water-nw.png`,
  'trans-water-ne': `${ASSET_BASE}trans-water-ne.png`,
  'trans-water-sw': `${ASSET_BASE}trans-water-sw.png`,
  'trans-water-se': `${ASSET_BASE}trans-water-se.png`,
  'trans-water-full': `${ASSET_BASE}trans-water-full.png`,
  'trans-water-inner-nw': `${ASSET_BASE}trans-water-inner-nw.png`,
  'trans-water-inner-ne': `${ASSET_BASE}trans-water-inner-ne.png`,
  'trans-water-inner-sw': `${ASSET_BASE}trans-water-inner-sw.png`,
  'trans-water-inner-se': `${ASSET_BASE}trans-water-inner-se.png`,
  // Player
  'player-down': `${ASSET_BASE}player-down.png`,
  'player-down-walk1': `${ASSET_BASE}player-down-walk1.png`,
  'player-down-walk2': `${ASSET_BASE}player-down-walk2.png`,
  'player-up': `${ASSET_BASE}player-up.png`,
  'player-up-walk1': `${ASSET_BASE}player-up-walk1.png`,
  'player-up-walk2': `${ASSET_BASE}player-up-walk2.png`,
  'player-left': `${ASSET_BASE}player-left.png`,
  'player-left-walk1': `${ASSET_BASE}player-left-walk1.png`,
  'player-left-walk2': `${ASSET_BASE}player-left-walk2.png`,
  'player-right': `${ASSET_BASE}player-right.png`,
  'player-right-walk1': `${ASSET_BASE}player-right-walk1.png`,
  'player-right-walk2': `${ASSET_BASE}player-right-walk2.png`,
  // Modern Interiors premade characters #01–#20 are appended below
  // (see ME_CHAR_COUNT loop) — used as alt player skins via
  // PLAYER_SPRITE_PREFIX, and as NPC spriteKeys in map data. Frames
  // are sliced from the gitignored pack by
  // scripts/slice-premade-characters.mjs.
  // Objects
  'tree': `${ASSET_BASE}tree.png`,
  'rock': `${ASSET_BASE}rock.png`,
  'house-base': `${ASSET_BASE}house-base.png`,
  'house-roof': `${ASSET_BASE}house-roof.png`,
  'house-new': `${ASSET_BASE}house-new.png`,
  'house-new-2': `${ASSET_BASE}house-new-2.png`,
  'house-new-3': `${ASSET_BASE}house-new-3.png`,
  'house-new-4': `${ASSET_BASE}house-new-4.png`,
  'grass-new': `${ASSET_BASE}grass-new.png`,
  // 32×32 floor motif sliced into 4 quadrants — see `TileType.FLOOR_PATTERN`.
  'floor-tl': `${ASSET_BASE}floor-tl.png`,
  'floor-tr': `${ASSET_BASE}floor-tr.png`,
  'floor-bl': `${ASSET_BASE}floor-bl.png`,
  'floor-br': `${ASSET_BASE}floor-br.png`,
  // Running-bond brick wall quadrants — see `TileType.WALL_BRICK`.
  'wall-brick-tl': `${ASSET_BASE}wall-brick-tl.png`,
  'wall-brick-tr': `${ASSET_BASE}wall-brick-tr.png`,
  'wall-brick-bl': `${ASSET_BASE}wall-brick-bl.png`,
  'wall-brick-br': `${ASSET_BASE}wall-brick-br.png`,
  'food-row': `${ASSET_BASE}food-row.png`,
  'mart-base': `${ASSET_BASE}mart-base.png`,
  'mart-roof': `${ASSET_BASE}mart-roof.png`,
  'lab-base': `${ASSET_BASE}lab-base.png`,
  'lab-roof': `${ASSET_BASE}lab-roof.png`,
  'npc': `${ASSET_BASE}npc.png`,
  'npc-blue': `${ASSET_BASE}npc-blue.png`,
  // Artist-drawn NPC variants
  // Indoor objects
  'chair': `${ASSET_BASE}chair.png`,
  'bed': `${ASSET_BASE}bed.png`,
  'bookshelf': `${ASSET_BASE}bookshelf.png`,
  'rug': `${ASSET_BASE}rug.png`,
  'candle': `${ASSET_BASE}candle.png`,
  'window-indoor': `${ASSET_BASE}window.png`,
  // Building exteriors
  // Indoor — cafe/restaurant shared
  // Cafe-specific
  'coffee-cup': `${ASSET_BASE}coffee-cup.png`,
  // Restaurant-specific
  'dining-table': `${ASSET_BASE}dining-table.png`,
  // New building exteriors
  // Location-specific indoor objects
  // Pokemon-style interior objects
  'wall-window': `${ASSET_BASE}wall-window.png`,
  'wall-window-double': `${ASSET_BASE}wall-window-double.png`,
  'wall-painting': `${ASSET_BASE}wall-painting.png`,
  'wall-clock': `${ASSET_BASE}wall-clock.png`,
  'wall-staircase': `${ASSET_BASE}wall-staircase.png`,
  'computer-desk': `${ASSET_BASE}computer-desk.png`,
  'dresser': `${ASSET_BASE}dresser.png`,
  'fridge': `${ASSET_BASE}fridge.png`,
  'sink-counter': `${ASSET_BASE}sink-counter.png`,
  'drawer-cabinet': `${ASSET_BASE}drawer-cabinet.png`,
  'dining-table-small': `${ASSET_BASE}dining-table-small.png`,
  'plant-pot': `${ASSET_BASE}plant-pot.png`,
  'tv': `${ASSET_BASE}tv.png`,
  'rug-large': `${ASSET_BASE}rug-large.png`,
  'rug-medium': `${ASSET_BASE}rug-medium.png`,
  'doormat': `${ASSET_BASE}doormat.png`,
  'floor-clock': `${ASSET_BASE}floor-clock.png`,
  'plant-pot-2': `${ASSET_BASE}plant-pot-2.png`,
  'lamp-table': `${ASSET_BASE}lamp-table.png`,
  // Outdoor decorations
  'flowers': `${ASSET_BASE}flowers.png`,
  'signpost': `${ASSET_BASE}signpost.png`,
  'bush': `${ASSET_BASE}bush.png`,
};

// Modern Interiors premade characters: 20 sheets × 4 directions ×
// (idle + walk1 + walk2) = 240 entries. Generated rather than listed
// out so adding a new character is just dropping its sliced PNGs in.
const ME_CHAR_COUNT = 20;
const ME_CHAR_DIRS = ['down', 'up', 'left', 'right'] as const;
for (let n = 1; n <= ME_CHAR_COUNT; n++) {
  const id = String(n).padStart(2, '0');
  for (const dir of ME_CHAR_DIRS) {
    const base = `me-char-${id}-${dir}`;
    spriteManifest[base] = `${ASSET_BASE}${base}.png`;
    spriteManifest[`${base}-walk1`] = `${ASSET_BASE}${base}-walk1.png`;
    spriteManifest[`${base}-walk2`] = `${ASSET_BASE}${base}-walk2.png`;
  }
}


const textureCache = new Map<string, Texture>();

export async function loadAssets(spriteKeys: string[]): Promise<Map<string, Texture>> {
  const toLoad: { key: string; path: string }[] = [];
  const packKeys: string[] = [];

  for (const key of spriteKeys) {
    if (textureCache.has(key)) continue;
    if (key.startsWith('me:')) {
      packKeys.push(key);
      continue;
    }
    const path = spriteManifest[key];
    if (!path) {
      console.warn(`No asset path for sprite key: ${key}`);
      continue;
    }
    toLoad.push({ key, path });
  }

  // Load registered placeholder assets in parallel. Individual failures
  // (e.g., a sprite key like `car-up` whose PNG hasn't been dropped into
  // public/assets/placeholder/ yet) resolve to null so one missing file
  // doesn't take down the whole map load — the renderer falls back to a
  // colored rect for missing car sprites and skips other missing keys.
  if (toLoad.length > 0) {
    const textures = await Promise.all(
      toLoad.map(({ key, path }) =>
        Assets.load<Texture>(path).catch((err) => {
          console.warn(`Failed to load asset "${key}" (${path}):`, err);
          return null;
        })
      )
    );
    for (let i = 0; i < toLoad.length; i++) {
      const tex = textures[i];
      if (!tex) continue;
      tex.source.scaleMode = 'nearest';
      textureCache.set(toLoad[i].key, tex);
    }
  }

  // Pack singles take a different path: they're loaded by URL derived from the
  // key, and the result is cached in the same `textureCache` so subsequent
  // `getTexture` lookups are uniform.
  if (packKeys.length > 0) {
    await Promise.all(packKeys.map(loadPackSingle));
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

/** Number of `TILE_SIZE × TILE_SIZE` cells a pack tile spans, derived from
 * its source PNG dimensions. Used by the editor's stamp-on-click logic to
 * paint the entire `N × M` cycle in one operation so cells stay aligned.
 * Returns `{1, 1}` for single-tile or unloaded textures (safe fallback). */
export function getPackTileCellDims(key: string): { cols: number; rows: number } {
  const tex = textureCache.get(key);
  if (!tex) return { cols: 1, rows: 1 };
  const N = Math.max(1, Math.floor(tex.frame.width / TILE_SIZE));
  const M = Math.max(1, Math.floor(tex.frame.height / TILE_SIZE));
  return { cols: N, rows: M };
}

/** Pick the right texture for a ground-tile cell. Delegates to `getTexture`
 * for ordinary tile types; for pattern tiles it returns the correct quadrant
 * of a 32×32 motif based on the cell's (row, col) position so the pattern
 * auto-aligns. Pack singles (`me:<theme>/<file>`) resolve to a full PNG under
 * `/assets/me/`, lazy-loaded on first request. */
export function getTileTexture(tileType: string, row: number, col: number): Texture | undefined {
  if (tileType.startsWith('me:')) {
    const cached = textureCache.get(tileType);
    if (!cached) {
      void loadPackSingle(tileType); // kick off load, render will retry next frame
      return undefined;
    }
    // Single-tile pack source — return as-is. Multi-tile pack sources are
    // never stored in `tiles[][]`; the editor routes them to `objects[]` on
    // place, so we don't need to handle multi-tile here.
    return cached;
  }
  if (tileType === 'floor-pattern') {
    const top = row % 2 === 0;
    const left = col % 2 === 0;
    const key = top
      ? (left ? 'floor-tl' : 'floor-tr')
      : (left ? 'floor-bl' : 'floor-br');
    return textureCache.get(key);
  }
  if (tileType === 'wall-brick') {
    const top = row % 2 === 0;
    const left = col % 2 === 0;
    const key = top
      ? (left ? 'wall-brick-tl' : 'wall-brick-tr')
      : (left ? 'wall-brick-bl' : 'wall-brick-br');
    return textureCache.get(key);
  }
  return textureCache.get(tileType);
}

/** Preload all known assets in the background. Call once after initial scene is ready. */
export async function preloadAllAssets(): Promise<void> {
  await loadAssets(Object.keys(spriteManifest));
}
