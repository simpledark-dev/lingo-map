import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { TileType } from '../core/types';

/**
 * Dual-grid auto-tileset for binary terrain transitions.
 *
 * Each tileset is a 4×4 sheet of 16×16 tiles where each tile encodes which of
 * its four corners belong to the *upper* terrain. We render an overlay grid
 * offset by half a tile so each render slot sits at the intersection of four
 * world cells; the surrounding cells form a 4-bit corner mask that picks the
 * matching tile from the sheet.
 *
 * Multiple tilesets can be registered. They are drawn in registration order,
 * so later tilesets layer on top of earlier ones (e.g. dark grass over grass
 * over water).
 */

const SRC_TILE = 16; // pixels in the source images

/**
 * Lookup table: corner mask → tile index inside the 4×4 sheet.
 *
 * Corner mask bit layout (1 = upper terrain, 0 = lower):
 *   bit 3 = NW (top-left)
 *   bit 2 = NE (top-right)
 *   bit 1 = SW (bottom-left)
 *   bit 0 = SE (bottom-right)
 *
 * This mapping was derived from `tileset-1.png`. Both Pixel Lab tilesets we
 * use share the same layout, so we reuse the table; if you swap in a sheet
 * with a different layout you must regenerate this mapping by sampling its
 * corners.
 */
const MASK_TO_INDEX: number[] = [
   6, // 0000 → all lower
   7, // 0001 → SE
  10, // 0010 → SW
   9, // 0011 → S
   2, // 0100 → NE
  11, // 0101 → E
   4, // 0110 → NE+SW (anti-diagonal)
  15, // 0111 → all but NW
   5, // 1000 → NW
  14, // 1001 → NW+SE (diagonal)
   1, // 1010 → W
   8, // 1011 → all but NE
   3, // 1100 → N
   0, // 1101 → all but SW
  13, // 1110 → all but SE
  12, // 1111 → all upper
];

interface TilesetConfig {
  path: string;
  /** True if this tile is the *upper* terrain in this tileset's binary split. */
  isUpper: (t: TileType) => boolean;
  /**
   * True if this tile is one of the two terrains the tileset depicts. ALL four
   * surrounding cells of a render slot must satisfy this for the slot to draw —
   * otherwise the wrong terrain would bleed over unrelated tile types.
   */
  isAutoTile: (t: TileType) => boolean;
  /**
   * Optional: at least one of the four surrounding cells must satisfy this
   * for the slot to draw. Use this to ensure a tileset only fires near its
   * "feature" terrain (e.g. dark grass, dirt) and doesn't paint a flat layer
   * of its lower terrain over the whole map.
   */
  requiresPresenceOf?: (t: TileType) => boolean;
}

interface LoadedTileset extends TilesetConfig {
  frames: Texture[] | null;
}

const tilesets: LoadedTileset[] = [
  {
    path: '/assets/tileset-1.png',
    // Grass-like cells are upper; water is lower. Other tiles (dirt, path,
    // floor, wall) are not part of this tileset and are filtered out by
    // isAutoTile, so isUpper for them is irrelevant.
    isUpper: (t) => t === TileType.GRASS || t === TileType.GRASS_DARK,
    isAutoTile: (t) => t === TileType.GRASS || t === TileType.GRASS_DARK || t === TileType.WATER,
    // Only fire near water — we don't want the tileset-1 "all grass" subtile
    // painting over every pure-grass area. That caused a visible seam wherever
    // a non-participating tile type (e.g. grass-new) sat next to grass.
    requiresPresenceOf: (t) => t === TileType.WATER,
    frames: null,
  },
  {
    path: '/assets/tileset-2.png',
    // Dark grass is the upper terrain, light grass is lower.
    isUpper: (t) => t === TileType.GRASS_DARK,
    // Both participate so the dual-grid finds the boundary; we additionally
    // require at least one corner to actually be GRASS_DARK (see render loop)
    // so the tileset doesn't paint plain-grass tiles over unrelated areas.
    isAutoTile: (t) => t === TileType.GRASS || t === TileType.GRASS_DARK,
    requiresPresenceOf: (t) => t === TileType.GRASS_DARK,
    frames: null,
  },
  {
    path: '/assets/tileset-3.png',
    // Dirt is the upper terrain (this sheet is laid out as "dirt over grass"
    // — index 12 = mask 1111 is the all-dirt cell).
    isUpper: (t) => t === TileType.DIRT,
    isAutoTile: (t) => t === TileType.GRASS || t === TileType.GRASS_DARK || t === TileType.DIRT,
    requiresPresenceOf: (t) => t === TileType.DIRT,
    frames: null,
  },
];

/** Load all registered tilesets and slice them into 16 sub-textures each. Idempotent. */
export async function loadAutoTileset(): Promise<void> {
  for (const ts of tilesets) {
    if (ts.frames) continue;
    const baseTexture = await Assets.load<Texture>(ts.path);
    baseTexture.source.scaleMode = 'nearest';
    ts.frames = new Array(16);
    for (let i = 0; i < 16; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      ts.frames[i] = new Texture({
        source: baseTexture.source,
        frame: new Rectangle(col * SRC_TILE, row * SRC_TILE, SRC_TILE, SRC_TILE),
      });
    }
  }
}

function clamped(tiles: TileType[][], width: number, height: number, row: number, col: number): TileType {
  // Edge clamp — extend the nearest in-bounds cell so the map border looks
  // natural rather than trying to render an out-of-world transition.
  if (row < 0) row = 0;
  if (row >= height) row = height - 1;
  if (col < 0) col = 0;
  if (col >= width) col = width - 1;
  return tiles[row][col];
}

/**
 * Build a Container with one dual-grid pass per registered tileset.
 *
 * Tilesets are drawn in registration order, so later passes layer on top
 * (e.g. dark grass over the grass/water shoreline).
 */
export function buildAutoTileLayer(
  tiles: TileType[][],
  width: number,
  height: number,
  tileSize: number,
): Container {
  const layer = new Container();
  const halfT = tileSize / 2;

  // Flatten all tileset passes into a single container so the RenderSystem's
  // viewport culling (which expects sprites one level deep) keeps working.
  // Tileset registration order is preserved by the addChild order: tileset-1
  // sprites are added before tileset-2 sprites, so tileset-2 layers on top.
  for (const ts of tilesets) {
    if (!ts.frames) continue;

    // Render grid is (W+1) × (H+1) — one extra row/col so the south and east
    // edges of the world get a transition tile too.
    for (let r = 0; r <= height; r++) {
      for (let c = 0; c <= width; c++) {
        const nwT = clamped(tiles, width, height, r - 1, c - 1);
        const neT = clamped(tiles, width, height, r - 1, c);
        const swT = clamped(tiles, width, height, r, c - 1);
        const seT = clamped(tiles, width, height, r, c);

        // ALL four corners must be participating terrains, otherwise we'd
        // paint the wrong tile over a foreign cell type (floor/wall/bridge).
        if (!ts.isAutoTile(nwT) || !ts.isAutoTile(neT) || !ts.isAutoTile(swT) || !ts.isAutoTile(seT)) continue;

        // Some tilesets additionally require at least one corner to be the
        // "feature" terrain (e.g. tileset-2 only fires near dark grass).
        if (ts.requiresPresenceOf
            && !ts.requiresPresenceOf(nwT) && !ts.requiresPresenceOf(neT)
            && !ts.requiresPresenceOf(swT) && !ts.requiresPresenceOf(seT)) continue;

        const mask = (ts.isUpper(nwT) ? 8 : 0)
          | (ts.isUpper(neT) ? 4 : 0)
          | (ts.isUpper(swT) ? 2 : 0)
          | (ts.isUpper(seT) ? 1 : 0);

        const tex = ts.frames[MASK_TO_INDEX[mask]];
        const sprite = new Sprite(tex);
        sprite.x = c * tileSize - halfT;
        sprite.y = r * tileSize - halfT;
        sprite.width = tileSize;
        sprite.height = tileSize;
        layer.addChild(sprite);
      }
    }
  }

  return layer;
}

/** True once all registered tilesets have been loaded and sliced. */
export function isAutoTilesetReady(): boolean {
  return tilesets.every(ts => ts.frames !== null);
}
