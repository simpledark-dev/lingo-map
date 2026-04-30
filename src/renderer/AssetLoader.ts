import { Assets, Rectangle, Texture } from 'pixi.js';
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
// Pack file extension. Production deploys point at `/assets/me-bundle/`,
// which `scripts/convert-to-webp.mjs` filled with `.webp` versions
// (~50% smaller than the originals). Dev still reads from the
// gitignored full pack symlinked at `/assets/me/`, which is plain
// `.png` — converting 6000+ source files locally isn't worth it.
// Detect which base we're on via the env-controlled URL prefix.
const PACK_EXT = PACK_BASE.includes('me-bundle') ? '.webp' : '.png';

const packPromises = new Map<string, Promise<Texture | null>>();

/** Resolve a pack key to its public URL. Returns null if not a pack key. */
function packKeyToUrl(key: string): string | null {
  if (!key.startsWith('me:')) return null;
  return `${PACK_BASE}${key.slice(3)}${PACK_EXT}`;
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
  [TileType.GRASS]: `${ASSET_BASE}grass.webp`,
  [TileType.GRASS_DARK]: `${ASSET_BASE}grass_dark.webp`,
  [TileType.DIRT]: `${ASSET_BASE}dirt.webp`,
  [TileType.PATH]: `${ASSET_BASE}path.webp`,
  [TileType.FLOOR]: `${ASSET_BASE}floor.webp`,
  [TileType.FLOOR_WOOD]: `${ASSET_BASE}floor-wood.webp`,
  [TileType.FLOOR_WOOD_2]: `${ASSET_BASE}floor-wood-2.webp`,
  [TileType.FLOOR_WOOD_3]: `${ASSET_BASE}floor-wood-3.webp`,
  [TileType.WALL]: `${ASSET_BASE}wall.webp`,
  [TileType.WALL_INTERIOR]: `${ASSET_BASE}wall-interior.webp`,
  [TileType.WALL_INTERIOR_TOP]: `${ASSET_BASE}wall-interior-top.webp`,
  [TileType.WALL_INTERIOR_TOP_LEFT]: `${ASSET_BASE}wall-interior-top-left.webp`,
  [TileType.WALL_INTERIOR_TOP_CORNER_BL]: `${ASSET_BASE}wall-interior-top-corner-bl.webp`,
  [TileType.WALL_INTERIOR_TOP_CORNER_INNER_TR]: `${ASSET_BASE}wall-interior-top-corner-inner-tr.webp`,
  [TileType.WALL_INTERIOR_TOP_BL]: `${ASSET_BASE}wall-interior-top-bl.webp`,
  [TileType.WALL_INTERIOR_TOP_BR]: `${ASSET_BASE}wall-interior-top-br.webp`,
  [TileType.WALL_INTERIOR_BOTTOM]: `${ASSET_BASE}wall-interior-bottom.webp`,
  [TileType.WALL_INTERIOR_LEFT]: `${ASSET_BASE}wall-interior-left.webp`,
  [TileType.WALL_INTERIOR_RIGHT]: `${ASSET_BASE}wall-interior-right.webp`,
  [TileType.WALL_INTERIOR_CORNER_BOTTOM_LEFT]: `${ASSET_BASE}wall-interior-corner-bottom-left.webp`,
  [TileType.WALL_INTERIOR_CORNER_BOTTOM_RIGHT]: `${ASSET_BASE}wall-interior-corner-bottom-right.webp`,
  [TileType.WATER]: `${ASSET_BASE}water.webp`,
  [TileType.BRIDGE]: `${ASSET_BASE}bridge.webp`,
  // Transition tiles (grass ↔ dirt edges)
  'trans-n': `${ASSET_BASE}trans-n.webp`,
  'trans-s': `${ASSET_BASE}trans-s.webp`,
  'trans-w': `${ASSET_BASE}trans-w.webp`,
  'trans-e': `${ASSET_BASE}trans-e.webp`,
  'trans-nw': `${ASSET_BASE}trans-nw.webp`,
  'trans-ne': `${ASSET_BASE}trans-ne.webp`,
  'trans-sw': `${ASSET_BASE}trans-sw.webp`,
  'trans-se': `${ASSET_BASE}trans-se.webp`,
  'trans-full': `${ASSET_BASE}trans-nse.webp`,
  'trans-inner-nw': `${ASSET_BASE}trans-inner-nw.webp`,
  'trans-inner-ne': `${ASSET_BASE}trans-inner-ne.webp`,
  'trans-inner-sw': `${ASSET_BASE}trans-inner-sw.webp`,
  'trans-inner-se': `${ASSET_BASE}trans-inner-se.webp`,
  'trans-inner-nw-se': `${ASSET_BASE}trans-inner-nw-se.webp`,
  'trans-inner-ne-sw': `${ASSET_BASE}trans-inner-ne-sw.webp`,
  // Water transition tiles
  'trans-water-n': `${ASSET_BASE}trans-water-n.webp`,
  'trans-water-s': `${ASSET_BASE}trans-water-s.webp`,
  'trans-water-w': `${ASSET_BASE}trans-water-w.webp`,
  'trans-water-e': `${ASSET_BASE}trans-water-e.webp`,
  'trans-water-nw': `${ASSET_BASE}trans-water-nw.webp`,
  'trans-water-ne': `${ASSET_BASE}trans-water-ne.webp`,
  'trans-water-sw': `${ASSET_BASE}trans-water-sw.webp`,
  'trans-water-se': `${ASSET_BASE}trans-water-se.webp`,
  'trans-water-full': `${ASSET_BASE}trans-water-full.webp`,
  'trans-water-inner-nw': `${ASSET_BASE}trans-water-inner-nw.webp`,
  'trans-water-inner-ne': `${ASSET_BASE}trans-water-inner-ne.webp`,
  'trans-water-inner-sw': `${ASSET_BASE}trans-water-inner-sw.webp`,
  'trans-water-inner-se': `${ASSET_BASE}trans-water-inner-se.webp`,
  // Player
  'player-down': `${ASSET_BASE}player-down.webp`,
  'player-down-walk1': `${ASSET_BASE}player-down-walk1.webp`,
  'player-down-walk2': `${ASSET_BASE}player-down-walk2.webp`,
  'player-up': `${ASSET_BASE}player-up.webp`,
  'player-up-walk1': `${ASSET_BASE}player-up-walk1.webp`,
  'player-up-walk2': `${ASSET_BASE}player-up-walk2.webp`,
  'player-left': `${ASSET_BASE}player-left.webp`,
  'player-left-walk1': `${ASSET_BASE}player-left-walk1.webp`,
  'player-left-walk2': `${ASSET_BASE}player-left-walk2.webp`,
  'player-right': `${ASSET_BASE}player-right.webp`,
  'player-right-walk1': `${ASSET_BASE}player-right-walk1.webp`,
  'player-right-walk2': `${ASSET_BASE}player-right-walk2.webp`,
  // Modern Interiors premade characters #01–#20 are appended below
  // (see ME_CHAR_COUNT loop) — used as alt player skins via
  // PLAYER_SPRITE_PREFIX, and as NPC spriteKeys in map data. Frames
  // are sliced from the gitignored pack by
  // scripts/slice-premade-characters.mjs.
  // Objects
  'tree': `${ASSET_BASE}tree.webp`,
  'rock': `${ASSET_BASE}rock.webp`,
  'house-base': `${ASSET_BASE}house-base.webp`,
  'house-roof': `${ASSET_BASE}house-roof.webp`,
  'house-new': `${ASSET_BASE}house-new.webp`,
  'house-new-2': `${ASSET_BASE}house-new-2.webp`,
  'house-new-3': `${ASSET_BASE}house-new-3.webp`,
  'house-new-4': `${ASSET_BASE}house-new-4.webp`,
  'grass-new': `${ASSET_BASE}grass-new.webp`,
  // 32×32 floor motif sliced into 4 quadrants — see `TileType.FLOOR_PATTERN`.
  'floor-tl': `${ASSET_BASE}floor-tl.webp`,
  'floor-tr': `${ASSET_BASE}floor-tr.webp`,
  'floor-bl': `${ASSET_BASE}floor-bl.webp`,
  'floor-br': `${ASSET_BASE}floor-br.webp`,
  // Running-bond brick wall quadrants — see `TileType.WALL_BRICK`.
  'wall-brick-tl': `${ASSET_BASE}wall-brick-tl.webp`,
  'wall-brick-tr': `${ASSET_BASE}wall-brick-tr.webp`,
  'wall-brick-bl': `${ASSET_BASE}wall-brick-bl.webp`,
  'wall-brick-br': `${ASSET_BASE}wall-brick-br.webp`,
  'food-row': `${ASSET_BASE}food-row.webp`,
  'mart-base': `${ASSET_BASE}mart-base.webp`,
  'mart-roof': `${ASSET_BASE}mart-roof.webp`,
  'lab-base': `${ASSET_BASE}lab-base.webp`,
  'lab-roof': `${ASSET_BASE}lab-roof.webp`,
  'npc': `${ASSET_BASE}npc.webp`,
  'npc-blue': `${ASSET_BASE}npc-blue.webp`,
  // Artist-drawn NPC variants
  // Indoor objects
  'chair': `${ASSET_BASE}chair.webp`,
  'bed': `${ASSET_BASE}bed.webp`,
  'bookshelf': `${ASSET_BASE}bookshelf.webp`,
  'rug': `${ASSET_BASE}rug.webp`,
  'candle': `${ASSET_BASE}candle.webp`,
  'window-indoor': `${ASSET_BASE}window.webp`,
  // Building exteriors
  // Indoor — cafe/restaurant shared
  // Cafe-specific
  'coffee-cup': `${ASSET_BASE}coffee-cup.webp`,
  // Restaurant-specific
  'dining-table': `${ASSET_BASE}dining-table.webp`,
  // New building exteriors
  // Location-specific indoor objects
  // Pokemon-style interior objects
  'wall-window': `${ASSET_BASE}wall-window.webp`,
  'wall-window-double': `${ASSET_BASE}wall-window-double.webp`,
  'wall-painting': `${ASSET_BASE}wall-painting.webp`,
  'wall-clock': `${ASSET_BASE}wall-clock.webp`,
  'wall-staircase': `${ASSET_BASE}wall-staircase.webp`,
  'computer-desk': `${ASSET_BASE}computer-desk.webp`,
  'dresser': `${ASSET_BASE}dresser.webp`,
  'fridge': `${ASSET_BASE}fridge.webp`,
  'sink-counter': `${ASSET_BASE}sink-counter.webp`,
  'drawer-cabinet': `${ASSET_BASE}drawer-cabinet.webp`,
  'dining-table-small': `${ASSET_BASE}dining-table-small.webp`,
  'plant-pot': `${ASSET_BASE}plant-pot.webp`,
  'tv': `${ASSET_BASE}tv.webp`,
  'rug-large': `${ASSET_BASE}rug-large.webp`,
  'rug-medium': `${ASSET_BASE}rug-medium.webp`,
  'doormat': `${ASSET_BASE}doormat.webp`,
  'floor-clock': `${ASSET_BASE}floor-clock.webp`,
  'plant-pot-2': `${ASSET_BASE}plant-pot-2.webp`,
  'lamp-table': `${ASSET_BASE}lamp-table.webp`,
  // Outdoor decorations
  'flowers': `${ASSET_BASE}flowers.webp`,
  'signpost': `${ASSET_BASE}signpost.webp`,
  'bush': `${ASSET_BASE}bush.webp`,
};

// Modern Interiors premade-character textures load from a single
// atlas PNG (`me-char-atlas.png`) in `loadCharacterAtlas` below — see
// scripts/slice-premade-characters.mjs for how the atlas is baked.
// We deliberately DON'T register `me-char-*` keys in spriteManifest:
// every directional + walk-frame variant lives as a sub-Texture of
// the shared atlas, so individual PNG fetches never happen. If you
// need a manifest-style URL for one of these keys (e.g., debug
// overlay), look it up in textureCache after `loadCharacterAtlas`
// has resolved.


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

// ── Modern Interiors character atlas ──────────────────────────────────────
// Loads the baked `me-char-atlas.png` ONCE, then synthesises a
// `Texture` per named frame (e.g. `me-char-04-down-walk1`) and stores
// each in `textureCache`. After this resolves, every `me-char-*` key
// resolves through the normal `getTexture` path with no additional
// network. Replaces 240 individual PNG fetches that used to dominate
// cold start.
//
// Idempotent — calling twice is a no-op (returns the same in-flight
// Promise). Failures are non-fatal: the player and NPCs will simply
// render their fallback red rect until the atlas can be loaded.
let charAtlasPromise: Promise<void> | null = null;
export function loadCharacterAtlas(): Promise<void> {
  if (charAtlasPromise) return charAtlasPromise;
  charAtlasPromise = (async () => {
    try {
      const manifest = await fetch('/assets/me-char-atlas.json').then(r => {
        if (!r.ok) throw new Error(`atlas json HTTP ${r.status}`);
        return r.json() as Promise<{ image: string; frames: Record<string, [number, number, number, number]> }>;
      });
      // Manifest still records `.png` (slicer output), but the
      // shipped sheet is `.webp`. Rewrite the extension at runtime so
      // we don't have to re-slice the atlas when the converter runs.
      const imagePath = manifest.image.replace(/\.png$/i, '.webp');
      const sheet = await Assets.load<Texture>(`/assets/${imagePath}`);
      // Pixel art — disable bilinear filtering on the shared atlas
      // BEFORE we slice frames out, otherwise some sub-textures
      // would inherit the default `linear` setting and shimmer.
      sheet.source.scaleMode = 'nearest';
      for (const [key, [x, y, w, h]] of Object.entries(manifest.frames)) {
        // `new Texture({ source, frame })` is Pixi 8's way to make a
        // sub-region view onto an existing base texture without
        // copying pixel data. All 240 frames share `sheet.source`.
        const sub = new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) });
        textureCache.set(key, sub);
      }
    } catch (err) {
      console.warn('Failed to load character atlas — me-char-* sprites will fall back:', err);
    }
  })();
  return charAtlasPromise;
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
