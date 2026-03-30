import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'assets', 'placeholder');
mkdirSync(OUT, { recursive: true });

function save(name, canvas) {
  writeFileSync(join(OUT, name), canvas.toBuffer('image/png'));
  console.log(`  ✓ ${name}`);
}

function tile(name, color) {
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 32, 32);
  // subtle grid line
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, 32, 1);
  ctx.fillRect(0, 0, 1, 32);
  save(name, c);
}

// ── Tiles ──
console.log('Tiles:');
tile('grass.png', '#4a8c3f');
tile('path.png', '#c4a35a');
tile('floor.png', '#8b6f47');
tile('wall.png', '#555566');

// ── Player (32x48, 4 directions) ──
console.log('Player:');
function player(name, arrowDir) {
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#3a7bd5';
  ctx.fillRect(4, 8, 24, 32);
  // head
  ctx.fillStyle = '#f5c6a0';
  ctx.fillRect(8, 0, 16, 16);
  // feet
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(6, 40, 8, 8);
  ctx.fillRect(18, 40, 8, 8);
  // direction arrow
  ctx.fillStyle = '#ffffff';
  const cx = 16, cy = 24;
  if (arrowDir === 'down') { ctx.fillRect(cx - 2, cy + 4, 4, 8); }
  if (arrowDir === 'up') { ctx.fillRect(cx - 2, cy - 8, 4, 8); }
  if (arrowDir === 'left') { ctx.fillRect(cx - 8, cy - 2, 8, 4); }
  if (arrowDir === 'right') { ctx.fillRect(cx + 2, cy - 2, 8, 4); }
  save(name, c);
}
player('player-down.png', 'down');
player('player-up.png', 'up');
player('player-left.png', 'left');
player('player-right.png', 'right');

// ── Tree (64x96) ──
console.log('Objects:');
{
  const c = createCanvas(64, 96);
  const ctx = c.getContext('2d');
  // trunk
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(24, 56, 16, 40);
  // foliage (layered circles as rectangles for pixel look)
  ctx.fillStyle = '#2d6a1e';
  ctx.fillRect(8, 16, 48, 48);
  ctx.fillStyle = '#3a8c2e';
  ctx.fillRect(16, 4, 32, 40);
  ctx.fillStyle = '#4aad3a';
  ctx.fillRect(20, 0, 24, 24);
  save('tree.png', c);
}

// ── Rock (32x32) ──
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#888899';
  ctx.fillRect(4, 8, 24, 20);
  ctx.fillStyle = '#9999aa';
  ctx.fillRect(8, 4, 16, 8);
  ctx.fillStyle = '#777788';
  ctx.fillRect(8, 20, 16, 8);
  save('rock.png', c);
}

// ── House base (128x96) ──
{
  const c = createCanvas(128, 96);
  const ctx = c.getContext('2d');
  // walls
  ctx.fillStyle = '#a0785a';
  ctx.fillRect(0, 0, 128, 96);
  // door
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(52, 56, 24, 40);
  // windows
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(12, 32, 24, 20);
  ctx.fillRect(92, 32, 24, 20);
  // foundation
  ctx.fillStyle = '#666666';
  ctx.fillRect(0, 88, 128, 8);
  save('house-base.png', c);
}

// ── House roof (128x64) ──
{
  const c = createCanvas(128, 64);
  const ctx = c.getContext('2d');
  // triangular roof approximation with pixel rectangles
  ctx.fillStyle = '#b04040';
  ctx.fillRect(0, 32, 128, 32);
  ctx.fillRect(8, 24, 112, 8);
  ctx.fillRect(16, 16, 96, 8);
  ctx.fillRect(24, 8, 80, 8);
  ctx.fillRect(32, 0, 64, 8);
  save('house-roof.png', c);
}

// ── NPC (32x48) ──
{
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#c44a4a';
  ctx.fillRect(4, 8, 24, 32);
  // head
  ctx.fillStyle = '#f5c6a0';
  ctx.fillRect(8, 0, 16, 16);
  // feet
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(6, 40, 8, 8);
  ctx.fillRect(18, 40, 8, 8);
  save('npc.png', c);
}

// ── Furniture (32x32) ──
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // table
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(2, 8, 28, 16);
  // legs
  ctx.fillStyle = '#6b4f27';
  ctx.fillRect(4, 24, 4, 8);
  ctx.fillRect(24, 24, 4, 8);
  save('furniture.png', c);
}

console.log('\nAll assets generated!');
