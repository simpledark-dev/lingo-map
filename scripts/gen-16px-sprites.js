#!/usr/bin/env node
// Generates 16px-scale placeholder sprites for Pokemon-style game.
// SAFETY: never overwrites an existing file. Pass --force to regenerate.
// Run: node scripts/gen-16px-sprites.js
//      node scripts/gen-16px-sprites.js --force   (DANGEROUS — overwrites everything)

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../public/assets/placeholder');
const FORCE = process.argv.includes('--force');

function save(name, canvas) {
  const filePath = path.join(OUT, name);
  if (!FORCE && fs.existsSync(filePath)) {
    console.log(`  ${name.padEnd(30)} skipped (already exists)`);
    return;
  }
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  console.log(`  ${name.padEnd(30)} ${canvas.width}x${canvas.height}`);
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// ── Player (16×24, 4 directions × 3 frames) ──

function drawPlayerBase(ctx, facing) {
  // Hair/hat
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(4, 0, 8, 5);
  ctx.fillStyle = '#4040a0';
  ctx.fillRect(4, 0, 8, 3);
  // Head
  ctx.fillStyle = '#e8b880';
  ctx.fillRect(5, 3, 6, 5);
  // Eyes
  if (facing === 'down') {
    px(ctx, 6, 5, '#202020'); px(ctx, 9, 5, '#202020');
  } else if (facing === 'up') {
    // no eyes from behind
    ctx.fillStyle = '#4040a0';
    ctx.fillRect(5, 3, 6, 3);
  } else if (facing === 'left') {
    px(ctx, 5, 5, '#202020');
  } else {
    px(ctx, 10, 5, '#202020');
  }
  // Body/shirt
  ctx.fillStyle = '#d04040';
  ctx.fillRect(4, 8, 8, 7);
  // Arms
  ctx.fillStyle = '#e8b880';
  ctx.fillRect(3, 9, 1, 4);
  ctx.fillRect(12, 9, 1, 4);
  return ctx;
}

function drawPlayerLegs(ctx, frame) {
  // frame: 0=idle, 1=walk-left, 2=walk-right
  if (frame === 0) {
    ctx.fillStyle = '#3050a0';
    ctx.fillRect(5, 15, 3, 6);
    ctx.fillRect(8, 15, 3, 6);
    ctx.fillStyle = '#604020';
    ctx.fillRect(5, 21, 3, 3);
    ctx.fillRect(8, 21, 3, 3);
  } else if (frame === 1) {
    ctx.fillStyle = '#3050a0';
    ctx.fillRect(4, 15, 3, 5);
    ctx.fillRect(9, 15, 3, 6);
    ctx.fillStyle = '#604020';
    ctx.fillRect(4, 20, 3, 3);
    ctx.fillRect(9, 21, 3, 3);
  } else {
    ctx.fillStyle = '#3050a0';
    ctx.fillRect(5, 15, 3, 6);
    ctx.fillRect(10, 15, 3, 5);
    ctx.fillStyle = '#604020';
    ctx.fillRect(5, 21, 3, 3);
    ctx.fillRect(10, 20, 3, 3);
  }
}

function genPlayer(facing, suffix, frame) {
  const c = createCanvas(16, 24);
  const ctx = c.getContext('2d');
  drawPlayerBase(ctx, facing);
  drawPlayerLegs(ctx, frame);
  save(`player-${suffix}.png`, c);
}

['down', 'up', 'left', 'right'].forEach(dir => {
  genPlayer(dir, dir, 0);
  genPlayer(dir, `${dir}-walk1`, 1);
  genPlayer(dir, `${dir}-walk2`, 2);
});

// ── NPC (16×24) ──

function genNPC(name, shirtColor) {
  const c = createCanvas(16, 24);
  const ctx = c.getContext('2d');
  // Hair
  ctx.fillStyle = '#604020';
  ctx.fillRect(4, 0, 8, 5);
  // Head
  ctx.fillStyle = '#e8b880';
  ctx.fillRect(5, 3, 6, 5);
  // Eyes
  px(ctx, 6, 5, '#202020'); px(ctx, 9, 5, '#202020');
  // Body
  ctx.fillStyle = shirtColor;
  ctx.fillRect(4, 8, 8, 7);
  // Arms
  ctx.fillStyle = '#e8b880';
  ctx.fillRect(3, 9, 1, 4);
  ctx.fillRect(12, 9, 1, 4);
  // Legs
  ctx.fillStyle = '#3050a0';
  ctx.fillRect(5, 15, 3, 6);
  ctx.fillRect(8, 15, 3, 6);
  ctx.fillStyle = '#604020';
  ctx.fillRect(5, 21, 3, 3);
  ctx.fillRect(8, 21, 3, 3);
  save(`${name}.png`, c);
}

genNPC('npc', '#40a040');
genNPC('npc-blue', '#4060c0');
genNPC('npc-green', '#40a040');
genNPC('npc-purple', '#8040a0');
genNPC('npc-orange', '#d08030');

// ── Tree (16×16) ──

function genTree() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Trunk
  ctx.fillStyle = '#806030';
  ctx.fillRect(6, 10, 4, 6);
  // Canopy
  ctx.fillStyle = '#308030';
  ctx.fillRect(2, 2, 12, 9);
  ctx.fillRect(3, 1, 10, 1);
  ctx.fillRect(4, 0, 8, 1);
  // Highlights
  ctx.fillStyle = '#40a040';
  ctx.fillRect(4, 3, 4, 3);
  ctx.fillRect(9, 5, 3, 2);
  save('tree.png', c);
}
genTree();

// ── Bush / Flowers (16×16) ──

function genBush() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#308830';
  ctx.fillRect(2, 6, 12, 8);
  ctx.fillRect(3, 5, 10, 1);
  ctx.fillStyle = '#40a840';
  ctx.fillRect(4, 7, 4, 3);
  ctx.fillRect(9, 8, 3, 2);
  // Flowers
  px(ctx, 4, 6, '#e06060');
  px(ctx, 8, 7, '#e0e040');
  px(ctx, 11, 6, '#e06060');
  save('bush.png', c);
}
genBush();

// ── Sign (16×16) ──

function genSign() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  // Post
  ctx.fillStyle = '#806030';
  ctx.fillRect(7, 8, 2, 8);
  // Board
  ctx.fillStyle = '#c0a060';
  ctx.fillRect(2, 2, 12, 7);
  ctx.fillStyle = '#a08040';
  ctx.fillRect(2, 2, 12, 1);
  ctx.fillRect(2, 8, 12, 1);
  // Text lines
  ctx.fillStyle = '#604020';
  ctx.fillRect(4, 4, 8, 1);
  ctx.fillRect(4, 6, 6, 1);
  save('signpost.png', c);
}
genSign();

// ── Rock (16×16) ──

function genRock() {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(3, 6, 10, 8);
  ctx.fillRect(2, 7, 12, 6);
  ctx.fillStyle = '#989898';
  ctx.fillRect(4, 7, 5, 4);
  ctx.fillStyle = '#686868';
  ctx.fillRect(9, 10, 4, 3);
  save('rock.png', c);
}
genRock();

// ── House building (80×64 base, 80×32 roof) ──

function genHouseBase() {
  const c = createCanvas(80, 64);
  const ctx = c.getContext('2d');
  // Main wall — fills entire canvas height
  ctx.fillStyle = '#c8b888';
  ctx.fillRect(4, 0, 72, 64);
  // Wall border
  ctx.fillStyle = '#a09060';
  ctx.fillRect(4, 0, 72, 2);
  ctx.fillRect(4, 0, 2, 64);
  ctx.fillRect(74, 0, 2, 64);
  ctx.fillRect(4, 62, 72, 2);
  // Door
  ctx.fillStyle = '#806030';
  ctx.fillRect(34, 36, 12, 28);
  ctx.fillStyle = '#604020';
  ctx.fillRect(34, 36, 12, 2);
  // Windows
  ctx.fillStyle = '#88c8e8';
  ctx.fillRect(12, 14, 16, 12);
  ctx.fillRect(52, 14, 16, 12);
  ctx.fillStyle = '#484848';
  ctx.fillRect(19, 14, 2, 12);
  ctx.fillRect(59, 14, 2, 12);
  // Door handle
  px(ctx, 43, 48, '#d0b060');
  save('house-base.png', c);
}

function genHouseRoof() {
  const c = createCanvas(80, 32);
  const ctx = c.getContext('2d');
  // Roof shape
  ctx.fillStyle = '#c05030';
  ctx.fillRect(0, 8, 80, 24);
  ctx.fillRect(4, 4, 72, 4);
  ctx.fillRect(10, 0, 60, 4);
  // Roof edge
  ctx.fillStyle = '#a04020';
  ctx.fillRect(0, 30, 80, 2);
  // Ridge
  ctx.fillStyle = '#d06040';
  ctx.fillRect(12, 2, 56, 2);
  save('house-roof.png', c);
}

genHouseBase();
genHouseRoof();

// ── Mart building (80×64 base, 80×24 roof) ──

function genMartBase() {
  const c = createCanvas(80, 64);
  const ctx = c.getContext('2d');
  // Main wall — fills entire canvas height
  ctx.fillStyle = '#d0d8e0';
  ctx.fillRect(4, 0, 72, 64);
  // Wall border
  ctx.fillStyle = '#8090a0';
  ctx.fillRect(4, 0, 72, 2);
  ctx.fillRect(4, 0, 2, 64);
  ctx.fillRect(74, 0, 2, 64);
  ctx.fillRect(4, 62, 72, 2);
  // "MART" sign
  ctx.fillStyle = '#e04040';
  ctx.fillRect(20, 6, 40, 12);
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(24, 9, 6, 6); ctx.fillRect(32, 9, 6, 6);
  ctx.fillRect(40, 9, 6, 6); ctx.fillRect(48, 9, 6, 6);
  // Door
  ctx.fillStyle = '#88c8e8';
  ctx.fillRect(30, 28, 20, 36);
  ctx.fillStyle = '#6090b0';
  ctx.fillRect(39, 28, 2, 36);
  // Windows
  ctx.fillStyle = '#88c8e8';
  ctx.fillRect(10, 28, 14, 10);
  ctx.fillRect(56, 28, 14, 10);
  save('mart-base.png', c);
}

function genMartRoof() {
  const c = createCanvas(80, 24);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4060a0';
  ctx.fillRect(0, 0, 80, 24);
  ctx.fillStyle = '#506cb0';
  ctx.fillRect(2, 2, 76, 2);
  ctx.fillStyle = '#304880';
  ctx.fillRect(0, 22, 80, 2);
  save('mart-roof.png', c);
}

genMartBase();
genMartRoof();

// ── Lab building (96×80 base, 96×32 roof) ──

function genLabBase() {
  const c = createCanvas(96, 80);
  const ctx = c.getContext('2d');
  // Main wall — fills entire canvas height
  ctx.fillStyle = '#d8d8d0';
  ctx.fillRect(4, 0, 88, 80);
  ctx.fillStyle = '#a0a098';
  ctx.fillRect(4, 0, 88, 2);
  ctx.fillRect(4, 0, 2, 80);
  ctx.fillRect(90, 0, 2, 80);
  ctx.fillRect(4, 78, 88, 2);
  // Door
  ctx.fillStyle = '#806030';
  ctx.fillRect(40, 40, 16, 40);
  ctx.fillStyle = '#604020';
  ctx.fillRect(40, 40, 16, 2);
  // Windows
  ctx.fillStyle = '#88c8e8';
  ctx.fillRect(12, 16, 20, 14);
  ctx.fillRect(64, 16, 20, 14);
  ctx.fillStyle = '#484848';
  ctx.fillRect(21, 16, 2, 14);
  ctx.fillRect(73, 16, 2, 14);
  // "LAB" text
  ctx.fillStyle = '#606060';
  ctx.fillRect(36, 6, 24, 8);
  ctx.fillStyle = '#d0d0c8';
  ctx.fillRect(38, 8, 4, 4); ctx.fillRect(44, 8, 4, 4); ctx.fillRect(50, 8, 4, 4);
  save('lab-base.png', c);
}

function genLabRoof() {
  const c = createCanvas(96, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808880';
  ctx.fillRect(0, 8, 96, 24);
  ctx.fillRect(6, 4, 84, 4);
  ctx.fillRect(14, 0, 68, 4);
  ctx.fillStyle = '#687068';
  ctx.fillRect(0, 30, 96, 2);
  save('lab-roof.png', c);
}

genLabBase();
genLabRoof();

console.log('\nDone! All 16px-scale sprites generated.');
