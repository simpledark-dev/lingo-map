import { Container, Sprite, Texture, Rectangle } from 'pixi.js';
import { MapData, TileType } from '../core/types';
import { getTexture } from './AssetLoader';

/**
 * Sub-tile (quadrant) wang autotile renderer for grass ↔ water boundaries.
 *
 * Each map cell is rendered as 4 sub-tile quadrants (NW, NE, SW, SE).
 * For each quadrant, we look at the 4 cells meeting at its OUTER corner of
 * the cell, build a 4-bit corner index (water=1, NW*8|NE*4|SW*2|SE*1), and
 * draw the matching quadrant of the wang tile with that index.
 *
 * This is the standard "minitile" autotile technique, and unlike whole-tile
 * wang, it correctly renders isolated 1×1 cells of either kind because each
 * quadrant samples a different group of 4 neighbors.
 */

// Cache cropped quadrant textures so we don't recreate them every render.
const quadrantTextureCache = new Map<string, Texture>();

function getQuadrantTexture(idx: number, qx: 0 | 1, qy: 0 | 1): Texture | null {
  const key = `${idx}_${qx}_${qy}`;
  const cached = quadrantTextureCache.get(key);
  if (cached) return cached;

  const base = getTexture(`water_blob_${idx}`);
  if (!base) return null;

  const half = base.frame.width / 2;
  const tex = new Texture({
    source: base.source,
    frame: new Rectangle(
      base.frame.x + qx * half,
      base.frame.y + qy * half,
      half,
      half,
    ),
  });
  quadrantTextureCache.set(key, tex);
  return tex;
}

export function buildWaterBlobLayer(map: MapData): Container {
  const layer = new Container();
  const T = map.tileSize;
  const H = T / 2;

  function isWater(row: number, col: number): boolean {
    if (row < 0 || row >= map.height || col < 0 || col >= map.width) return false;
    return map.tiles[row][col] === TileType.WATER;
  }

  // The 4 cells meeting at the grid intersection at (cornerRow, cornerCol)
  // are (cornerRow-1, cornerCol-1), (cornerRow-1, cornerCol),
  // (cornerRow, cornerCol-1), (cornerRow, cornerCol).
  // Compute their water bits and pack into NW=8 NE=4 SW=2 SE=1.
  function cornerIdx(cornerRow: number, cornerCol: number): number {
    const nw = isWater(cornerRow - 1, cornerCol - 1) ? 8 : 0;
    const ne = isWater(cornerRow - 1, cornerCol)     ? 4 : 0;
    const sw = isWater(cornerRow,     cornerCol - 1) ? 2 : 0;
    const se = isWater(cornerRow,     cornerCol)     ? 1 : 0;
    return nw | ne | sw | se;
  }

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const t = map.tiles[row][col];
      // Only blob cells whose base is grass or water — leave path/wall/etc. alone
      if (t !== TileType.GRASS && t !== TileType.WATER) continue;

      // Each of the 4 quadrants samples the grid corner at its outer corner of the cell.
      const quadrants: { qx: 0 | 1; qy: 0 | 1; cornerR: number; cornerC: number }[] = [
        { qx: 0, qy: 0, cornerR: row,     cornerC: col },     // NW quadrant → NW grid corner of cell
        { qx: 1, qy: 0, cornerR: row,     cornerC: col + 1 }, // NE
        { qx: 0, qy: 1, cornerR: row + 1, cornerC: col },     // SW
        { qx: 1, qy: 1, cornerR: row + 1, cornerC: col + 1 }, // SE
      ];

      for (const q of quadrants) {
        const idx = cornerIdx(q.cornerR, q.cornerC);
        // The cell sits in the OPPOSITE slot of the wang tile from the rendered quadrant.
        // E.g., the NW quadrant of cell C contains the NW corner of C, which is the SE
        // position of the 2x2 around that grid intersection — so we draw the SE quadrant
        // of the wang tile.
        const texQx = (1 - q.qx) as 0 | 1;
        const texQy = (1 - q.qy) as 0 | 1;
        const tex = getQuadrantTexture(idx, texQx, texQy);
        if (!tex) continue;
        const sprite = new Sprite(tex);
        sprite.x = col * T + q.qx * H;
        sprite.y = row * T + q.qy * H;
        sprite.width = H;
        sprite.height = H;
        layer.addChild(sprite);
      }
    }
  }

  return layer;
}
