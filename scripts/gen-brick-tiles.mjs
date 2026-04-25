// Procedurally generate four 16×16 quadrants of a running-bond brick pattern.
//
// Brick size: 16×8 (smaller-scale variant). Running-bond offset is half a
// brick (8px), so the full repeat unit is 16×16 — exactly one tile. All four
// quadrants therefore contain the same image; keeping four files preserves
// the existing quadrant-picker API and leaves room to specialize later.
//
// When tiled:
//   Row A (y 0-7):  [ full brick 16px ][ full brick ][ full brick ]
//   Row B (y 8-15): [½][ full brick ][ full brick ][½]  ← offset by 8
import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = '/Users/gaelduong/Documents/Code/lingo-map/public/assets/placeholder';

// Palette roughly matching the reference teal-brick image.
const BRICK = '#3f8477';
const BRICK_HIGHLIGHT = '#4e9b8c';
const MORTAR = '#1e2a2a';

function makeTile() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');

  // Body
  ctx.fillStyle = BRICK;
  ctx.fillRect(0, 0, 16, 16);

  // Subtle highlight band at the top of each brick row for readability.
  ctx.fillStyle = BRICK_HIGHLIGHT;
  ctx.fillRect(0, 1, 16, 1);  // Row A highlight
  ctx.fillRect(0, 9, 16, 1);  // Row B highlight

  // Mortar lines — 1 pixel wide.
  ctx.fillStyle = MORTAR;
  // Horizontal: top of row A (y=0) and top of row B (y=8)
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 8, 16, 1);
  // Vertical: row A vertical seam at x=0 (tile edges)
  ctx.fillRect(0, 0, 1, 8);
  // Vertical: row B vertical seam at x=8 (middle of tile, brick boundary)
  ctx.fillRect(8, 8, 1, 8);

  return c.toBuffer('image/png');
}

// All 4 quadrants identical — pattern's fundamental repeat unit is 16×16.
const buf = makeTile();
writeFileSync(join(OUT, 'wall-brick-tl.png'), buf);
writeFileSync(join(OUT, 'wall-brick-tr.png'), buf);
writeFileSync(join(OUT, 'wall-brick-bl.png'), buf);
writeFileSync(join(OUT, 'wall-brick-br.png'), buf);

console.log('wrote 4 small-brick quadrants to', OUT);
