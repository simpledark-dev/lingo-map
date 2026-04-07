import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { TileType } from '../core/types';

/**
 * Dual-grid auto-tileset for binary terrain transitions (grass ↔ water).
 *
 * The source image is a 4×4 grid of 16×16 tiles. Each tile encodes which of
 * its four corners belong to the *upper* terrain (grass). When the player
 * paints water inside a grass field, we render a half-cell-offset overlay
 * grid: each render tile inspects the four world cells around its centre and
 * picks the source tile whose corner pattern matches.
 *
 * Tileset path is fixed for now — Pixel Lab's "grass over water" set.
 */

const TILESET_PATH = '/assets/tileset-1.png';
const SRC_TILE = 16; // pixels in the source image

/**
 * Lookup table: corner mask → tile index inside the 4×4 sheet.
 *
 * Corner mask bit layout (1 = grass / upper, 0 = water / lower):
 *   bit 3 = NW (top-left)
 *   bit 2 = NE (top-right)
 *   bit 1 = SW (bottom-left)
 *   bit 0 = SE (bottom-right)
 *
 * Indices reference the sheet by `row * 4 + col`. The mapping was derived by
 * sampling the corners of every tile in `public/assets/tileset-1.png`; if you
 * swap in a different sheet you must regenerate it.
 */
const MASK_TO_INDEX: number[] = [
   6, // 0000 → all water
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
  12, // 1111 → all grass
];

let baseTexture: Texture | null = null;
let frames: Texture[] | null = null;

/** Load the tileset and slice it into 16 sub-textures. Idempotent. */
export async function loadAutoTileset(): Promise<void> {
  if (frames) return;
  baseTexture = await Assets.load<Texture>(TILESET_PATH);
  baseTexture.source.scaleMode = 'nearest';

  frames = new Array(16);
  for (let i = 0; i < 16; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    frames[i] = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(col * SRC_TILE, row * SRC_TILE, SRC_TILE, SRC_TILE),
    });
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

/** Whether a tile counts as the *upper* terrain (grass) for the auto-tile. */
function isUpper(t: TileType): boolean {
  // Anything that isn't water counts as upper terrain — so a floor-next-to-water
  // boundary still draws a shoreline. The skipping logic in `buildAutoTileLayer`
  // makes sure we don't paint the auto-tileset over pure floor/wall regions.
  return t !== TileType.WATER;
}

/** Whether a tile is a participant in the grass/water auto-tile system. */
function isAutoTile(t: TileType): boolean {
  return t === TileType.GRASS || t === TileType.WATER;
}

/**
 * Build a Container of dual-grid render sprites covering the world.
 *
 * The render grid is offset by (-tileSize/2, -tileSize/2) so each render tile
 * sits at the intersection of four world cells. Every render tile is drawn
 * (including all-grass and all-water), so the auto-tileset becomes the
 * authoritative look for grass and water — the ground layer underneath only
 * shows through for non-grass/non-water tile types like floor or path.
 *
 * Returned sprites are sized to `tileSize` (the source pixels are scaled up).
 */
export function buildAutoTileLayer(
  tiles: TileType[][],
  width: number,
  height: number,
  tileSize: number,
): Container {
  const layer = new Container();
  if (!frames) return layer;

  const halfT = tileSize / 2;

  // Render grid is (W+1) × (H+1) — one extra row/col so the south and east
  // edges of the world get a transition tile too.
  for (let r = 0; r <= height; r++) {
    for (let c = 0; c <= width; c++) {
      const nwT = clamped(tiles, width, height, r - 1, c - 1);
      const neT = clamped(tiles, width, height, r - 1, c);
      const swT = clamped(tiles, width, height, r, c - 1);
      const seT = clamped(tiles, width, height, r, c);

      // If none of the four surrounding cells participate in the auto-tile
      // system, leave this render slot empty so the underlying ground layer
      // (path/floor/wall/etc.) can show through.
      if (!isAutoTile(nwT) && !isAutoTile(neT) && !isAutoTile(swT) && !isAutoTile(seT)) continue;

      const mask = (isUpper(nwT) ? 8 : 0)
        | (isUpper(neT) ? 4 : 0)
        | (isUpper(swT) ? 2 : 0)
        | (isUpper(seT) ? 1 : 0);

      const tex = frames[MASK_TO_INDEX[mask]];
      const sprite = new Sprite(tex);
      sprite.x = c * tileSize - halfT;
      sprite.y = r * tileSize - halfT;
      sprite.width = tileSize;
      sprite.height = tileSize;
      layer.addChild(sprite);
    }
  }

  return layer;
}

/** True once the tileset has been loaded and sliced. */
export function isAutoTilesetReady(): boolean {
  return frames !== null;
}
