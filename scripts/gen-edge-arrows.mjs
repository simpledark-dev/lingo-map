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
// Red variant — used for quest markers above story-critical doors
// (e.g. the office during the intro tutorial). The yellow palette
// blends into the cozy art at distance; red pops as "here, now".
const COLOR_BODY_RED   = [228,  60,  60, 255];
const COLOR_BORDER_RED = [110,  20,  20, 255];

function buildBuffer(grid, body = COLOR_BODY, border = COLOR_BORDER) {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = grid[y][x];
      const i = (y * SIZE + x) * 4;
      if (ch === '1') {
        buf[i] = body[0]; buf[i+1] = body[1]; buf[i+2] = body[2]; buf[i+3] = body[3];
      } else if (ch === '2') {
        buf[i] = border[0]; buf[i+1] = border[1]; buf[i+2] = border[2]; buf[i+3] = border[3];
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

async function emit(dir, palette, suffix = '') {
  const grid = rotateGrid(RIGHT, rotKey[dir]);
  const raw = buildBuffer(grid, palette[0], palette[1]);
  const baseName = `edge-arrow-${dir}${suffix}`;
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

for (const d of dirs) {
  await emit(d, [COLOR_BODY, COLOR_BORDER]);
}
// Red variants — only the south arrow is used in current code (the
// office quest marker), but generating all four keeps the asset set
// symmetric for future "must-do" markers.
for (const d of dirs) {
  await emit(d, [COLOR_BODY_RED, COLOR_BORDER_RED], '-red');
}
