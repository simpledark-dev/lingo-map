// Bakes all 20 Modern Interiors premade-character sheets into a
// single atlas PNG + JSON manifest at public/assets/me-char-atlas.*.
// The atlas is laid out as a 32 × 20 grid of 16×32 cells:
//   row r       = character r+1 (1..20)
//   per dir     = base/idle1, idle2, idle3, idle4, idle5, idle6, walk1, walk2
//   dirs        = down, up, left, right
// At runtime AssetLoader fetches the atlas ONCE and synthesises the
// named textures by frame Rectangle, replacing hundreds of individual
// PNG fetches that used to dominate cold start.
//
// Source-sheet layout (Premade_Character_NN.png, verified by visual
// inspection): 56 cols × 20 rows of 16×16 cells.
//   row 0 = preview thumbnails (skip)
//   row 1 = idle anim, 6 frames per direction
//   row 2 = walk anim, 6 frames per direction
//   direction order along source row:
//     RIGHT (cols 0-5), UP (6-11), LEFT (12-17), DOWN (18-23)
import sharp from 'sharp';
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
// Output atlas grid: 32 frames per character (4 dirs × 8 unique frame slots).
const ATLAS_COLS = 32;
const ATLAS_ROWS = NUM_CHARACTERS;

// Source-sheet column offsets per direction. Each direction is 6
// adjacent frames in the source. Row 1 contains the full idle loop;
// row 2 contains the walk loop.
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
const SLOTS_PER_DIR = 8;

const frames = {}; // key → [x, y, w, h]
const composites = [];

for (let n = 1; n <= NUM_CHARACTERS; n++) {
  const id = String(n).padStart(2, '0');
  const src = path.join(SRC_DIR, `Premade_Character_${id}.png`);
  if (!fs.existsSync(src)) {
    console.warn(`  skipping (missing): ${src}`);
    continue;
  }
  const row = n - 1;

  for (let d = 0; d < ATLAS_DIR_ORDER.length; d++) {
    const dirName = ATLAS_DIR_ORDER[d];
    const srcDir = SRC_DIRS.find(x => x.name === dirName);
    const sourceCells = [
      // First atlas slot is the historical base directional key and
      // also idle frame 1. Keep both names mapped to this same frame
      // so existing runtime code keeps working with older assumptions.
      { suffixes: ['', '-idle1'], col: srcDir.base + 0, row: 1 },
      { suffixes: ['-idle2'], col: srcDir.base + 1, row: 1 },
      { suffixes: ['-idle3'], col: srcDir.base + 2, row: 1 },
      { suffixes: ['-idle4'], col: srcDir.base + 3, row: 1 },
      { suffixes: ['-idle5'], col: srcDir.base + 4, row: 1 },
      { suffixes: ['-idle6'], col: srcDir.base + 5, row: 1 },
      // Preserve the current walk selections so walking visuals stay
      // unchanged while idle gains its own loop.
      { suffixes: ['-walk1'], col: srcDir.base + 1, row: 2 },
      { suffixes: ['-walk2'], col: srcDir.base + 4, row: 2 },
    ];
    for (let f = 0; f < sourceCells.length; f++) {
      const { col: sCol, row: sRow, suffixes } = sourceCells[f];
      const aCol = d * SLOTS_PER_DIR + f;
      const aX = aCol * CELL_W;
      const aY = row * CELL_H;
      const input = await sharp(src)
        .extract({ left: sCol * CELL_W, top: sRow * CELL_H, width: CELL_W, height: CELL_H })
        .png()
        .toBuffer();
      composites.push({ input, left: aX, top: aY });
      for (const suffix of suffixes) {
        const key = `me-char-${id}-${dirName}${suffix}`;
        frames[key] = [aX, aY, CELL_W, CELL_H];
      }
    }
  }
}

await sharp({
  create: {
    width: ATLAS_COLS * CELL_W,
    height: ATLAS_ROWS * CELL_H,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(composites)
  .png()
  .toFile(ATLAS_PNG);

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
