// Slices all 20 Modern Interiors premade-character sheets into
// individual idle/walk frames at public/assets/placeholder/me-char-NN-*.
// The pack folder is gitignored, so we commit only the sliced frames
// (~240 small PNGs total). Idempotent — safe to re-run.
//
// Sheet layout (verified by inspection of Premade_Character_01):
//   - 16w × 32h cell, 56 cols × 20 rows
//   - Row 0 = preview thumbnails (skip)
//   - Row 1 = idle anim, 6 frames per direction
//   - Row 2 = walk anim, 6 frames per direction
//   - Direction order along each row:
//       RIGHT (cols 0-5), UP (6-11), LEFT (12-17), DOWN (18-23)
//   All 20 sheets share the same layout (same generator output).
import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC_DIR = path.join(ROOT, 'moderninteriors-win/2_Characters/Character_Generator/0_Premade_Characters/16x16');
const OUT = path.join(ROOT, 'public/assets/placeholder');

const CELL_W = 16;
const CELL_H = 32;
const NUM_CHARACTERS = 20;

const DIRS = [
  { name: 'right', base: 0  },
  { name: 'up',    base: 6  },
  { name: 'left',  base: 12 },
  { name: 'down',  base: 18 },
];

function makeWriter(img) {
  return (col, row, file) => {
    const c = createCanvas(CELL_W, CELL_H);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
    fs.writeFileSync(path.join(OUT, file), c.toBuffer('image/png'));
  };
}

let total = 0;
for (let n = 1; n <= NUM_CHARACTERS; n++) {
  const id = String(n).padStart(2, '0');
  const src = path.join(SRC_DIR, `Premade_Character_${id}.png`);
  if (!fs.existsSync(src)) {
    console.warn(`  skipping (missing): ${src}`);
    continue;
  }
  const img = await loadImage(src);
  const writeCell = makeWriter(img);
  for (const d of DIRS) {
    // Idle frame 0 of the direction's group.
    writeCell(d.base + 0, 1, `me-char-${id}-${d.name}.png`);
    // Walk frames — mid-stride poses (frames 1 and 4 of the 6-frame cycle).
    writeCell(d.base + 1, 2, `me-char-${id}-${d.name}-walk1.png`);
    writeCell(d.base + 4, 2, `me-char-${id}-${d.name}-walk2.png`);
    total += 3;
  }
}

console.log(`Wrote ${total} frames →`, OUT);
