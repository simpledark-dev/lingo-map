#!/usr/bin/env node
// Generates pixel-art-style placeholder PNGs for Pokemon-style interior assets.
// SAFETY: never overwrites an existing file. Once a sprite exists on disk
// (whether script-generated or hand-drawn), this script leaves it alone.
// To regenerate one, delete the PNG manually first.
//
// Run: node scripts/gen-pokemon-placeholders.js
//      node scripts/gen-pokemon-placeholders.js --force   (overwrites everything — DANGEROUS)

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../public/assets/placeholder');
const FORCE = process.argv.includes('--force');

function save(filename, canvas) {
  const filePath = path.join(OUT_DIR, filename);
  if (!FORCE && fs.existsSync(filePath)) {
    console.log(`  ${filename.padEnd(30)} skipped (already exists)`);
    return;
  }
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  console.log(`  ${filename.padEnd(30)} ${canvas.width}x${canvas.height}`);
}

// ── Tiles ──

function genFloorWood() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Base amber wood
  ctx.fillStyle = '#c8a058';
  ctx.fillRect(0, 0, 16, 16);
  // Horizontal plank lines every 4px
  ctx.fillStyle = '#b08838';
  for (let y = 3; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
  // Subtle grain dots
  ctx.fillStyle = '#d0a860';
  ctx.fillRect(2, 1, 1, 1); ctx.fillRect(9, 1, 1, 1);
  ctx.fillRect(5, 5, 1, 1); ctx.fillRect(12, 5, 1, 1);
  ctx.fillRect(3, 9, 1, 1); ctx.fillRect(10, 9, 1, 1);
  ctx.fillRect(7, 13, 1, 1); ctx.fillRect(14, 13, 1, 1);
  // Darker knots
  ctx.fillStyle = '#a07828';
  ctx.fillRect(6, 2, 1, 1); ctx.fillRect(13, 10, 1, 1);
  save('floor-wood.png', c);
}

function genWallInteriorTop() {
  // Top-face tile of a wall — visible from 3/4 perspective.
  // Top half (rows 0-7): transparent (void shows through if there's nothing behind).
  // Bottom half (rows 8-15): cream "top face" + thin gray seam where it meets the wall below.
  // Gray seam is LIGHTER than the bottom-wall shadow (light comes from above).
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Cream top face (matches the white ceiling trim from the original wall-interior)
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(0, 8, 16, 5);
  // Subtle texture on the top face
  ctx.fillStyle = '#dcd4c4';
  ctx.fillRect(4, 10, 1, 1); ctx.fillRect(11, 9, 1, 1);
  // Light-gray seam (3px) — top face meeting the wall front face below
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(0, 13, 16, 1);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(0, 14, 16, 1);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(0, 15, 16, 1);
  save('wall-interior-top.png', c);
}

function genWallInteriorTopLeft() {
  // Top-face tile, vertical orientation. Left half visible, right half transparent.
  // Gray seam runs vertically along the LEFT edge.
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Cream top face — fills left half except the seam columns
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(3, 0, 5, 16);
  // Subtle texture
  ctx.fillStyle = '#dcd4c4';
  ctx.fillRect(5, 4, 1, 1); ctx.fillRect(6, 11, 1, 1);
  // Light-gray seam (3px) on the LEFT edge
  ctx.fillStyle = '#948a76';
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(1, 0, 1, 16);
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(2, 0, 1, 16);
  save('wall-interior-top-left.png', c);
}

function genWallInteriorTopCornerInnerTR() {
  // Inner concave corner of a wall-top L-bend.
  // Only the BL quadrant (cols 0-7, rows 8-15) is cream; other 3/4 is transparent.
  // A 3x3 gray dot sits at the very bottom-left corner — same dimensions as the
  // seam stripes in wall-interior-top (3px tall) and wall-interior-top-left (3px wide).
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Cream BL quadrant
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(0, 8, 8, 8);
  // Subtle texture inside the BL cream
  ctx.fillStyle = '#dcd4c4';
  ctx.fillRect(4, 10, 1, 1); ctx.fillRect(6, 12, 1, 1);
  // 3x3 gray dot at the bottom-left, gradient darkest at the very corner
  // (matches the gradient direction of wall-top and wall-top-left seams)
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(0, 13, 3, 1); // top row of dot
  ctx.fillRect(2, 14, 1, 1);
  ctx.fillRect(2, 15, 1, 1);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(0, 14, 2, 1);
  ctx.fillRect(1, 15, 1, 1);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(0, 15, 1, 1);
  save('wall-interior-top-corner-inner-tr.png', c);
}

function genWallInteriorTopCornerBL() {
  // Bottom-left corner that connects wall-interior-top (horizontal, seam at bottom)
  // and wall-interior-top-left (vertical, seam at left).
  // Layout:
  //   TR quadrant (cols 8-15 rows 0-7): transparent
  //   TL quadrant (cols 0-7 rows 0-7): cream + left seam (continues wall-top-left going up)
  //   BL quadrant (cols 0-7 rows 8-15): cream + left seam + bottom seam (corner overlap)
  //   BR quadrant (cols 8-15 rows 8-15): cream + bottom seam (continues wall-top going right)
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');

  // Cream face for the L shape (TL + BL + BR)
  ctx.fillStyle = '#e8e0d0';
  // TL face (cols 3-7 rows 0-12)
  ctx.fillRect(3, 0, 5, 13);
  // BR face (cols 8-15 rows 8-12)
  ctx.fillRect(8, 8, 8, 5);
  // Subtle texture
  ctx.fillStyle = '#dcd4c4';
  ctx.fillRect(5, 4, 1, 1); ctx.fillRect(11, 10, 1, 1);

  // Vertical left seam (cols 0-2) — applies across rows 0-15 where the L extends down
  ctx.fillStyle = '#948a76';
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(1, 0, 1, 16);
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(2, 0, 1, 16);

  // Horizontal bottom seam (rows 13-15) — applies across cols 3-15 (left seam already covers 0-2)
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(3, 13, 13, 1);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(3, 14, 13, 1);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(3, 15, 13, 1);

  save('wall-interior-top-corner-bl.png', c);
}

function genWallInteriorTopBL() {
  // Top-face tile with BOTH bottom and left seams (corner end-cap on the left side).
  // Top half (rows 0-7): transparent.
  // Bottom half (rows 8-15): cream face + 3px bottom seam + 3px left seam.
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Cream face — fills the visible bottom-right area (rows 8-12, cols 3-15)
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(3, 8, 13, 5);
  // Subtle texture
  ctx.fillStyle = '#dcd4c4';
  ctx.fillRect(7, 10, 1, 1); ctx.fillRect(12, 11, 1, 1);
  // Bottom seam — cols 3-15 (left-edge cells handled by corner gradient)
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(3, 13, 13, 1);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(3, 14, 13, 1);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(3, 15, 13, 1);
  // Left seam — rows 8-12 (bottom-row cells handled by corner gradient)
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(2, 8, 1, 5);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(1, 8, 1, 5);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(0, 8, 1, 5);
  // Corner overlap (cols 0-2, rows 13-15) — darken toward the bottom-left
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(0, 13, 3, 3);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(0, 14, 2, 2);
  ctx.fillStyle = '#7a7064';
  ctx.fillRect(0, 15, 1, 1);
  save('wall-interior-top-bl.png', c);
}

function genWallInteriorTopBR() {
  // Top-face tile with BOTH bottom and right seams (corner end-cap of a wall-top run).
  // Top half (rows 0-7): transparent.
  // Bottom half (rows 8-15): cream face + 3px bottom seam + 3px right seam.
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Cream face — fills the visible bottom-left area (rows 8-12, cols 0-12)
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(0, 8, 13, 5);
  // Subtle texture
  ctx.fillStyle = '#dcd4c4';
  ctx.fillRect(4, 10, 1, 1); ctx.fillRect(9, 11, 1, 1);
  // Bottom seam — cols 0-12 (right-edge cells handled by corner gradient)
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(0, 13, 13, 1);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(0, 14, 13, 1);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(0, 15, 13, 1);
  // Right seam — rows 8-12 (bottom-row cells handled by corner gradient)
  ctx.fillStyle = '#bcb09c';
  ctx.fillRect(13, 8, 1, 5);
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(14, 8, 1, 5);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(15, 8, 1, 5);
  // Corner overlap (cols 13-15, rows 13-15) — darken toward the bottom-right
  ctx.fillStyle = '#a89e88';
  ctx.fillRect(13, 13, 3, 3);
  ctx.fillStyle = '#948a76';
  ctx.fillRect(14, 14, 2, 2);
  ctx.fillStyle = '#7a7064';
  ctx.fillRect(15, 15, 1, 1);
  save('wall-interior-top-br.png', c);
}

function genWallInteriorRight() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Wall face fills through col 14; right edge gets a 1px border
  ctx.fillStyle = '#F3DCB3';
  ctx.fillRect(0, 0, 15, 16);
  // Subtle texture
  ctx.fillStyle = '#E6CA9B';
  ctx.fillRect(3, 4, 1, 1); ctx.fillRect(8, 7, 1, 1); ctx.fillRect(5, 2, 1, 1);
  ctx.fillRect(2, 12, 1, 1);
  // Thin gray border on the right edge (1px)
  ctx.fillStyle = '#4a4640';
  ctx.fillRect(15, 0, 1, 16);
  save('wall-interior-right.png', c);
}

function genWallInteriorCornerBottomLeft() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Wall face fills the inner area; left + bottom get 1px borders
  ctx.fillStyle = '#F3DCB3';
  ctx.fillRect(1, 0, 15, 15);
  // Subtle texture
  ctx.fillStyle = '#E6CA9B';
  ctx.fillRect(7, 4, 1, 1); ctx.fillRect(13, 7, 1, 1); ctx.fillRect(10, 2, 1, 1);
  // Thin left border (1px, full height)
  ctx.fillStyle = '#4a4640';
  ctx.fillRect(0, 0, 1, 16);
  // Thin bottom border (1px, from col 1 to right edge — left border already
  // covers col 0)
  ctx.fillRect(1, 15, 15, 1);
  save('wall-interior-corner-bottom-left.png', c);
}

function genWallInteriorCornerBottomRight() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Wall face — right + bottom get 1px borders
  ctx.fillStyle = '#F3DCB3';
  ctx.fillRect(0, 0, 15, 15);
  // Subtle texture
  ctx.fillStyle = '#E6CA9B';
  ctx.fillRect(3, 4, 1, 1); ctx.fillRect(8, 7, 1, 1); ctx.fillRect(5, 2, 1, 1);
  // Thin right border (1px, full height)
  ctx.fillStyle = '#4a4640';
  ctx.fillRect(15, 0, 1, 16);
  // Thin bottom border (1px, cols 0 to 14 — right border covers col 15)
  ctx.fillRect(0, 15, 15, 1);
  save('wall-interior-corner-bottom-right.png', c);
}

function genWallInterior() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Main wall face — fills the full tile so stacked tiles read as one smooth surface
  ctx.fillStyle = '#F3DCB3';
  ctx.fillRect(0, 0, 16, 16);
  // Subtle texture dots
  ctx.fillStyle = '#E6CA9B';
  ctx.fillRect(3, 4, 1, 1); ctx.fillRect(10, 7, 1, 1); ctx.fillRect(7, 2, 1, 1);
  ctx.fillRect(12, 12, 1, 1); ctx.fillRect(5, 11, 1, 1);
  save('wall-interior.png', c);
}

function genWallInteriorLeft() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Same wall face as wall-interior, 1px left border
  ctx.fillStyle = '#F3DCB3';
  ctx.fillRect(1, 0, 15, 16);
  // Subtle texture
  ctx.fillStyle = '#E6CA9B';
  ctx.fillRect(7, 4, 1, 1); ctx.fillRect(13, 7, 1, 1); ctx.fillRect(10, 2, 1, 1);
  ctx.fillRect(12, 12, 1, 1);
  // Thin left border (1px)
  ctx.fillStyle = '#4a4640';
  ctx.fillRect(0, 0, 1, 16);
  save('wall-interior-left.png', c);
}

function genWallInteriorBottom() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Same wall face as wall-interior, 1px bottom border
  ctx.fillStyle = '#F3DCB3';
  ctx.fillRect(0, 0, 16, 15);
  // Subtle texture
  ctx.fillStyle = '#E6CA9B';
  ctx.fillRect(3, 4, 1, 1); ctx.fillRect(10, 7, 1, 1); ctx.fillRect(7, 2, 1, 1);
  ctx.fillRect(5, 11, 1, 1);
  // Thin bottom border (1px)
  ctx.fillStyle = '#4a4640';
  ctx.fillRect(0, 15, 16, 1);
  save('wall-interior-bottom.png', c);
}

// ── Wall-mounted decor ──

function genWallWindow() {
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // Frame
  ctx.fillStyle = '#606060';
  ctx.fillRect(2, 2, 28, 28);
  // Inner frame
  ctx.fillStyle = '#484848';
  ctx.fillRect(4, 4, 24, 24);
  // Glass panes (2 side by side)
  ctx.fillStyle = '#88c8e8';
  ctx.fillRect(5, 5, 10, 22);
  ctx.fillRect(17, 5, 10, 22);
  // Glass highlight
  ctx.fillStyle = '#a8e0f8';
  ctx.fillRect(6, 6, 3, 6);
  ctx.fillRect(18, 6, 3, 6);
  // Divider
  ctx.fillStyle = '#484848';
  ctx.fillRect(15, 4, 2, 24);
  // Sill
  ctx.fillStyle = '#787878';
  ctx.fillRect(1, 28, 30, 3);
  save('wall-window.png', c);
}

function genWallWindowDouble() {
  const c = createCanvas(48, 32);
  const ctx = c.getContext('2d');
  // Two windows side by side
  for (const ox of [2, 24]) {
    ctx.fillStyle = '#606060';
    ctx.fillRect(ox, 2, 22, 28);
    ctx.fillStyle = '#484848';
    ctx.fillRect(ox + 2, 4, 18, 24);
    ctx.fillStyle = '#88c8e8';
    ctx.fillRect(ox + 3, 5, 7, 20);
    ctx.fillRect(ox + 12, 5, 7, 20);
    ctx.fillStyle = '#a8e0f8';
    ctx.fillRect(ox + 4, 6, 2, 5);
    ctx.fillRect(ox + 13, 6, 2, 5);
    ctx.fillStyle = '#484848';
    ctx.fillRect(ox + 10, 4, 2, 24);
  }
  // Sill
  ctx.fillStyle = '#787878';
  ctx.fillRect(1, 28, 46, 3);
  save('wall-window-double.png', c);
}

function genWallPainting() {
  const c = createCanvas(32, 24);
  const ctx = c.getContext('2d');
  // Frame
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(0, 0, 32, 24);
  ctx.fillStyle = '#A0782A';
  ctx.fillRect(1, 1, 30, 22);
  // Canvas
  ctx.fillStyle = '#d8e8f0';
  ctx.fillRect(3, 3, 26, 18);
  // Simple landscape: sky
  ctx.fillStyle = '#88c0e0';
  ctx.fillRect(3, 3, 26, 10);
  // Green hills
  ctx.fillStyle = '#68a848';
  ctx.fillRect(3, 11, 26, 6);
  ctx.fillRect(6, 10, 8, 1);
  ctx.fillRect(18, 9, 6, 2);
  // Sun
  ctx.fillStyle = '#f0d858';
  ctx.fillRect(22, 4, 4, 4);
  save('wall-painting.png', c);
}

function genWallClock() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Red rim circle (approximated as octagon)
  ctx.fillStyle = '#cc2020';
  ctx.fillRect(3, 1, 10, 14);
  ctx.fillRect(1, 3, 14, 10);
  ctx.fillRect(2, 2, 12, 12);
  // White face
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(4, 3, 8, 10);
  ctx.fillRect(3, 4, 10, 8);
  // Clock hands
  ctx.fillStyle = '#202020';
  ctx.fillRect(7, 4, 1, 5); // minute
  ctx.fillRect(8, 8, 3, 1); // hour
  // Center dot
  ctx.fillRect(7, 8, 2, 1);
  save('wall-clock.png', c);
}

function genWallStaircase() {
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  // Dark opening
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, 32, 48);
  // Frame border
  ctx.fillStyle = '#505050';
  ctx.fillRect(0, 0, 2, 48);
  ctx.fillRect(30, 0, 2, 48);
  ctx.fillRect(0, 0, 32, 2);
  // Steps (lighter lines going up)
  ctx.fillStyle = '#383838';
  for (let y = 44; y >= 4; y -= 6) {
    ctx.fillRect(3, y, 26, 2);
  }
  // Handrail suggestion
  ctx.fillStyle = '#606060';
  ctx.fillRect(4, 2, 1, 46);
  save('wall-staircase.png', c);
}

// ── Floor objects ──

function genComputerDesk() {
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // Desk surface
  ctx.fillStyle = '#a08050';
  ctx.fillRect(1, 14, 30, 16);
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(1, 28, 30, 3);
  // Legs
  ctx.fillStyle = '#786030';
  ctx.fillRect(2, 28, 3, 4);
  ctx.fillRect(27, 28, 3, 4);
  // Monitor
  ctx.fillStyle = '#404040';
  ctx.fillRect(8, 2, 16, 13);
  ctx.fillStyle = '#3060a0';
  ctx.fillRect(10, 4, 12, 9);
  // Monitor stand
  ctx.fillStyle = '#505050';
  ctx.fillRect(14, 15, 4, 2);
  // Screen highlight
  ctx.fillStyle = '#4080c0';
  ctx.fillRect(11, 5, 4, 3);
  save('computer-desk.png', c);
}

function genDresser() {
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  // Main body
  ctx.fillStyle = '#b08848';
  ctx.fillRect(2, 4, 28, 44);
  // Top surface
  ctx.fillStyle = '#c09858';
  ctx.fillRect(1, 2, 30, 4);
  // Drawers (4 rows)
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 10;
    ctx.fillStyle = '#a07838';
    ctx.fillRect(4, y, 24, 8);
    ctx.fillStyle = '#907028';
    ctx.fillRect(4, y + 7, 24, 1);
    // Handle
    ctx.fillStyle = '#d0b878';
    ctx.fillRect(14, y + 3, 4, 2);
  }
  save('dresser.png', c);
}

function genFridge() {
  const c = createCanvas(16, 32);
  const ctx = c.getContext('2d');
  // Body
  ctx.fillStyle = '#d8e0e0';
  ctx.fillRect(1, 2, 14, 30);
  // Top compartment (freezer)
  ctx.fillStyle = '#c8d0d0';
  ctx.fillRect(2, 3, 12, 10);
  // Divider
  ctx.fillStyle = '#a0a8a8';
  ctx.fillRect(1, 13, 14, 1);
  // Bottom compartment
  ctx.fillStyle = '#d0d8d8';
  ctx.fillRect(2, 15, 12, 16);
  // Handles
  ctx.fillStyle = '#888888';
  ctx.fillRect(12, 6, 2, 4);
  ctx.fillRect(12, 20, 2, 6);
  // Top edge
  ctx.fillStyle = '#b8c0c0';
  ctx.fillRect(1, 1, 14, 2);
  save('fridge.png', c);
}

function genSinkCounter() {
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // Counter body
  ctx.fillStyle = '#c0a070';
  ctx.fillRect(1, 10, 30, 22);
  // Counter top
  ctx.fillStyle = '#d8c898';
  ctx.fillRect(0, 8, 32, 4);
  // Sink basin
  ctx.fillStyle = '#a0b8c0';
  ctx.fillRect(8, 9, 12, 2);
  ctx.fillStyle = '#90a8b0';
  ctx.fillRect(9, 10, 10, 1);
  // Cabinet doors
  ctx.fillStyle = '#b09060';
  ctx.fillRect(3, 14, 11, 16);
  ctx.fillRect(18, 14, 11, 16);
  // Handles
  ctx.fillStyle = '#d8c898';
  ctx.fillRect(12, 20, 2, 4);
  ctx.fillRect(18, 20, 2, 4);
  // Faucet
  ctx.fillStyle = '#808080';
  ctx.fillRect(14, 4, 2, 6);
  ctx.fillRect(12, 4, 6, 2);
  save('sink-counter.png', c);
}

function genDrawerCabinet() {
  const c = createCanvas(32, 24);
  const ctx = c.getContext('2d');
  // Body
  ctx.fillStyle = '#b08848';
  ctx.fillRect(1, 2, 30, 22);
  // Top
  ctx.fillStyle = '#c09858';
  ctx.fillRect(0, 0, 32, 3);
  // 2 drawers
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = '#a07838';
    ctx.fillRect(3, 4 + i * 10, 26, 8);
    ctx.fillStyle = '#d0b878';
    ctx.fillRect(14, 7 + i * 10, 4, 2);
  }
  save('drawer-cabinet.png', c);
}

function genDiningTable() {
  const c = createCanvas(48, 32);
  const ctx = c.getContext('2d');
  // Table surface
  ctx.fillStyle = '#c09050';
  ctx.fillRect(2, 6, 44, 20);
  // Table top edge
  ctx.fillStyle = '#d0a060';
  ctx.fillRect(1, 4, 46, 4);
  // Legs
  ctx.fillStyle = '#906830';
  ctx.fillRect(4, 24, 3, 8);
  ctx.fillRect(41, 24, 3, 8);
  // Surface highlight
  ctx.fillStyle = '#d8b070';
  ctx.fillRect(6, 8, 36, 1);
  save('dining-table-small.png', c);
}

function genPlantPot() {
  const c = createCanvas(16, 24);
  const ctx = c.getContext('2d');
  // Pot
  ctx.fillStyle = '#c06030';
  ctx.fillRect(4, 14, 8, 10);
  ctx.fillRect(3, 14, 10, 2);
  ctx.fillStyle = '#a04820';
  ctx.fillRect(5, 22, 6, 2);
  // Soil
  ctx.fillStyle = '#604020';
  ctx.fillRect(4, 13, 8, 2);
  // Leaves (bushy)
  ctx.fillStyle = '#40a040';
  ctx.fillRect(3, 6, 10, 8);
  ctx.fillRect(2, 8, 12, 4);
  ctx.fillStyle = '#50b050';
  ctx.fillRect(5, 4, 6, 4);
  ctx.fillRect(4, 7, 3, 3);
  ctx.fillStyle = '#60c060';
  ctx.fillRect(6, 5, 3, 2);
  save('plant-pot.png', c);
}

function genTV() {
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // TV body
  ctx.fillStyle = '#303030';
  ctx.fillRect(2, 4, 28, 20);
  // Screen
  ctx.fillStyle = '#2050a0';
  ctx.fillRect(4, 6, 24, 16);
  // Screen content (simple gradient)
  ctx.fillStyle = '#3070c0';
  ctx.fillRect(5, 7, 22, 8);
  ctx.fillStyle = '#4090e0';
  ctx.fillRect(6, 8, 8, 4);
  // Stand
  ctx.fillStyle = '#404040';
  ctx.fillRect(12, 24, 8, 3);
  ctx.fillRect(10, 26, 12, 3);
  // Power LED
  ctx.fillStyle = '#40ff40';
  ctx.fillRect(15, 22, 2, 1);
  save('tv.png', c);
}

// ── Decorative ──

function genRugLarge() {
  const c = createCanvas(64, 48);
  const ctx = c.getContext('2d');
  // Outer border
  ctx.fillStyle = '#a03838';
  ctx.fillRect(0, 0, 64, 48);
  // Border trim
  ctx.fillStyle = '#c86060';
  ctx.fillRect(2, 2, 60, 44);
  // Inner field
  ctx.fillStyle = '#d07070';
  ctx.fillRect(4, 4, 56, 40);
  // Center diamond pattern
  ctx.fillStyle = '#e0a0a0';
  ctx.fillRect(20, 12, 24, 24);
  ctx.fillStyle = '#d08888';
  ctx.fillRect(24, 16, 16, 16);
  ctx.fillStyle = '#c87878';
  ctx.fillRect(28, 20, 8, 8);
  // Corner accents
  ctx.fillStyle = '#b85050';
  ctx.fillRect(6, 6, 6, 6); ctx.fillRect(52, 6, 6, 6);
  ctx.fillRect(6, 36, 6, 6); ctx.fillRect(52, 36, 6, 6);
  save('rug-large.png', c);
}

function genDoormat() {
  const c = createCanvas(32, 16);
  const ctx = c.getContext('2d');
  // Mat — fills full 2x1 tile area with small margin
  ctx.fillStyle = '#a06040';
  ctx.fillRect(1, 3, 30, 10);
  // Border
  ctx.fillStyle = '#805030';
  ctx.fillRect(1, 3, 30, 1);
  ctx.fillRect(1, 12, 30, 1);
  ctx.fillRect(1, 3, 1, 10);
  ctx.fillRect(30, 3, 1, 10);
  // Texture dots
  ctx.fillStyle = '#b07050';
  ctx.fillRect(4, 6, 2, 1); ctx.fillRect(10, 8, 2, 1);
  ctx.fillRect(16, 6, 2, 1); ctx.fillRect(22, 9, 2, 1);
  ctx.fillRect(27, 7, 2, 1); ctx.fillRect(7, 10, 2, 1);
  save('doormat.png', c);
}

// ── Generate all ──
console.log('Generating Pokemon interior placeholders...\n');
// genFloorWood();  // disabled — floor-wood.png is hand-managed (see floor-wood-3.png)
genWallInterior();
genWallInteriorTop();
genWallInteriorTopLeft();
genWallInteriorTopCornerBL();
genWallInteriorTopCornerInnerTR();
genWallInteriorTopBL();
genWallInteriorTopBR();
genWallInteriorBottom();
genWallInteriorLeft();
genWallInteriorRight();
genWallInteriorCornerBottomLeft();
genWallInteriorCornerBottomRight();
genWallWindow();
genWallWindowDouble();
genWallPainting();
genWallClock();
genWallStaircase();
genComputerDesk();
genDresser();
genFridge();
genSinkCounter();
genDrawerCabinet();
genDiningTable();
genPlantPot();
genTV();
genRugLarge();
genDoormat();
console.log('\nDone!');
