// Bakes all 20 Modern Interiors premade-character sheets into a
// single atlas PNG + JSON manifest at public/assets/me-char-atlas.*.
// The atlas is laid out as a 12 × 20 grid of 16×32 cells:
//   row r       = character r+1 (1..20)
//   cols 0..2   = down (idle, walk1, walk2)
//   cols 3..5   = up   (idle, walk1, walk2)
//   cols 6..8   = left (idle, walk1, walk2)
//   cols 9..11  = right(idle, walk1, walk2)
// At runtime AssetLoader fetches the atlas ONCE and synthesises the
// 240 named textures by frame Rectangle, replacing 240 individual
// PNG fetches that used to dominate cold start.
//
// Source-sheet layout (Premade_Character_NN.png, verified by visual
// inspection): 56 cols × 20 rows of 16×16 cells.
//   row 0 = preview thumbnails (skip)
//   row 1 = idle anim, 6 frames per direction
//   row 2 = walk anim, 6 frames per direction
//   direction order along source row:
//     RIGHT (cols 0-5), UP (6-11), LEFT (12-17), DOWN (18-23)
import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC_DIR = path.join(ROOT, 'moderninteriors-win/2_Characters/Character_Generator/0_Premade_Characters/16x16');
const OUT_DIR = path.join(ROOT, 'public/assets');
const ATLAS_PNG = path.join(OUT_DIR, 'me-char-atlas.png');
const ATLAS_JSON = path.join(OUT_DIR, 'me-char-atlas.json');

const CELL_W = 16;
const CELL_H = 32;
const NUM_CHARACTERS = 20;
// Output atlas grid: 12 frames per character (4 dirs × 3 frames).
const ATLAS_COLS = 12;
const ATLAS_ROWS = NUM_CHARACTERS;

// Source-sheet column offsets per direction. Each direction is 6
// adjacent frames in the source; we sample idx 0 (idle) and idx 1/4
// (mid-stride alternating-leg poses) for the 3 atlas frames.
const SRC_DIRS = [
  { name: 'right', base: 0  },
  { name: 'up',    base: 6  },
  { name: 'left',  base: 12 },
  { name: 'down',  base: 18 },
];

// Atlas column layout — order intentionally differs from SRC_DIRS so
// down/up come first; easier to scan visually when debugging the
// atlas PNG. The runtime keys read the manifest, not the order, so
// rearranging this list never breaks the renderer.
const ATLAS_DIR_ORDER = ['down', 'up', 'left', 'right'];
const FRAME_SUFFIX = ['', '-walk1', '-walk2'];

const atlas = createCanvas(ATLAS_COLS * CELL_W, ATLAS_ROWS * CELL_H);
const aCtx = atlas.getContext('2d');
aCtx.imageSmoothingEnabled = false;

const frames = {}; // key → [x, y, w, h]

for (let n = 1; n <= NUM_CHARACTERS; n++) {
  const id = String(n).padStart(2, '0');
  const src = path.join(SRC_DIR, `Premade_Character_${id}.png`);
  if (!fs.existsSync(src)) {
    console.warn(`  skipping (missing): ${src}`);
    continue;
  }
  const img = await loadImage(src);
  const row = n - 1;

  for (let d = 0; d < ATLAS_DIR_ORDER.length; d++) {
    const dirName = ATLAS_DIR_ORDER[d];
    const srcDir = SRC_DIRS.find(x => x.name === dirName);
    // The 3 source cells for this direction's idle / walk1 / walk2.
    const sourceCells = [
      { col: srcDir.base + 0, row: 1 }, // idle (row 1, frame 0)
      { col: srcDir.base + 1, row: 2 }, // walk1 (row 2, frame 1)
      { col: srcDir.base + 4, row: 2 }, // walk2 (row 2, frame 4)
    ];
    for (let f = 0; f < 3; f++) {
      const sCol = sourceCells[f].col;
      const sRow = sourceCells[f].row;
      const aCol = d * 3 + f;
      const aX = aCol * CELL_W;
      const aY = row * CELL_H;
      aCtx.drawImage(
        img,
        sCol * CELL_W, sRow * CELL_H, CELL_W, CELL_H, // src on the source sheet
        aX, aY, CELL_W, CELL_H,                       // dest on the atlas
      );
      const key = `me-char-${id}-${dirName}${FRAME_SUFFIX[f]}`;
      frames[key] = [aX, aY, CELL_W, CELL_H];
    }
  }
}

fs.writeFileSync(ATLAS_PNG, atlas.toBuffer('image/png'));
fs.writeFileSync(ATLAS_JSON, JSON.stringify({
  image: 'me-char-atlas.png',
  cellWidth: CELL_W,
  cellHeight: CELL_H,
  frames,
}, null, 2));

const sizeKb = (fs.statSync(ATLAS_PNG).size / 1024).toFixed(1);
console.log(`Atlas: ${ATLAS_COLS * CELL_W}×${ATLAS_ROWS * CELL_H}px, ${Object.keys(frames).length} frames, ${sizeKb} KB`);
console.log('  →', ATLAS_PNG);
console.log('  →', ATLAS_JSON);
