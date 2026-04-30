// One-shot slicer: extracts idle + 2 walk frames per direction from
// Premade_Character_01.png (16x16 sheet) and writes individual PNGs
// into public/assets/placeholder/. The pack folder itself is gitignored
// so we commit only these sliced frames.
//
// Sheet layout (verified by inspection):
//   - 16w × 32h cell, 56 cols × 20 rows of cells
//   - Row 0 = preview thumbnails (skip)
//   - Row 1 = idle anim, 6 frames per direction
//   - Row 2 = walk anim, 6 frames per direction
//   - Direction order along a row: LEFT (cols 0-5), UP (6-11),
//     RIGHT (12-17), DOWN (18-23). Verify in-game; flip cols if mirrored.
import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'moderninteriors-win/2_Characters/Character_Generator/0_Premade_Characters/16x16/Premade_Character_01.png');
const OUT = path.join(ROOT, 'public/assets/placeholder');

const CELL_W = 16;
const CELL_H = 32;

const DIRS = [
  { name: 'right', base: 0  },
  { name: 'up',    base: 6  },
  { name: 'left',  base: 12 },
  { name: 'down',  base: 18 },
];

const img = await loadImage(SRC);

function writeCell(col, row, file) {
  const c = createCanvas(CELL_W, CELL_H);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
  fs.writeFileSync(path.join(OUT, file), c.toBuffer('image/png'));
}

for (const d of DIRS) {
  // Idle frame 0 of the direction's group.
  writeCell(d.base + 0, 1, `me-char-01-${d.name}.png`);
  // Walk frames — pick mid-stride poses (frame 1 and frame 4 of the
  // 6-frame walk cycle). Frame 0 is near-neutral so we'd lose contrast
  // against idle; frames 1/4 show alternating legs.
  writeCell(d.base + 1, 2, `me-char-01-${d.name}-walk1.png`);
  writeCell(d.base + 4, 2, `me-char-01-${d.name}-walk2.png`);
}

console.log('Wrote 12 frames →', OUT);
