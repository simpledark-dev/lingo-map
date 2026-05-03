import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SIZE = 16;
// Pixel grid: 0 = transparent, 1 = arrow body, 2 = arrow border/outline
// Right-pointing arrow design (16x16, large chevron, easy to read at game scale).
// We rotate this canvas for the other 3 directions.
const RIGHT = [
  '................',
  '................',
  '......2.........',
  '......22........',
  '......122.......',
  '......1122......',
  '......11122.....',
  '...22221111122..',
  '...22221111122..',
  '......11122.....',
  '......1122......',
  '......122.......',
  '......22........',
  '......2.........',
  '................',
  '................',
];

const COLOR_BODY   = [255, 215, 100, 255]; // warm gold
const COLOR_BORDER = [110,  70,  20, 255]; // dark wood-brown outline

function buildBuffer(grid) {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = grid[y][x];
      const i = (y * SIZE + x) * 4;
      if (ch === '1') {
        buf[i] = COLOR_BODY[0]; buf[i+1] = COLOR_BODY[1]; buf[i+2] = COLOR_BODY[2]; buf[i+3] = COLOR_BODY[3];
      } else if (ch === '2') {
        buf[i] = COLOR_BORDER[0]; buf[i+1] = COLOR_BORDER[1]; buf[i+2] = COLOR_BORDER[2]; buf[i+3] = COLOR_BORDER[3];
      } else {
        buf[i] = 0; buf[i+1] = 0; buf[i+2] = 0; buf[i+3] = 0;
      }
    }
  }
  return buf;
}

function rotateGrid(grid, dir) {
  // dir: 'right' (no rotate), 'down' (90cw), 'left' (180), 'up' (270cw / 90ccw)
  if (dir === 'right') return grid;
  const rows = grid.length;
  const cols = grid[0].length;
  const out = Array.from({ length: rows }, () => new Array(cols).fill('.'));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = grid[y][x];
      let ny, nx;
      if (dir === 'down')      { ny = x;            nx = rows - 1 - y; }
      else if (dir === 'left') { ny = rows - 1 - y; nx = cols - 1 - x; }
      else /* up */            { ny = cols - 1 - x; nx = y; }
      out[ny][nx] = ch;
    }
  }
  return out.map((r) => r.join(''));
}

const dirs = ['east', 'south', 'west', 'north'];
const rotKey = { east: 'right', south: 'down', west: 'left', north: 'up' };

for (const d of dirs) {
  const grid = rotateGrid(RIGHT, rotKey[d]);
  const raw = buildBuffer(grid);
  const baseName = `edge-arrow-${d}`;
  const png = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toBuffer();
  const webp = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
  await writeFile(`/Users/gaelduong/Documents/Code/lingo-map/public/assets/placeholder/${baseName}.png`, png);
  await writeFile(`/Users/gaelduong/Documents/Code/lingo-map/public/assets/placeholder/${baseName}.webp`, webp);
  console.log(`wrote ${baseName}.png and .webp`);
}
