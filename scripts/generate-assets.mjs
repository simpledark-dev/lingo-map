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
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, 32, 1);
  ctx.fillRect(0, 0, 1, 32);
  save(name, c);
}

// ══════════════════════════════════════
// TILES
// ══════════════════════════════════════
console.log('Tiles:');
tile('grass.png', '#4a8c3f');
tile('path.png', '#c4a35a');

// Water tile — blue with subtle wave pattern
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3068a8';
  ctx.fillRect(0, 0, 32, 32);
  // wave highlights
  ctx.fillStyle = '#4080c0';
  ctx.fillRect(4, 8, 10, 2);
  ctx.fillRect(18, 16, 10, 2);
  ctx.fillRect(6, 24, 12, 2);
  // darker ripples
  ctx.fillStyle = '#285898';
  ctx.fillRect(14, 4, 8, 1);
  ctx.fillRect(2, 14, 8, 1);
  ctx.fillRect(20, 22, 8, 1);
  ctx.fillRect(8, 30, 10, 1);
  save('water.png', c);
}

// Bridge tile — wooden planks over water
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // water underneath (visible at edges)
  ctx.fillStyle = '#3068a8';
  ctx.fillRect(0, 0, 32, 32);
  // wooden planks
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(2, 0, 28, 32);
  // plank lines
  ctx.fillStyle = '#7a5f37';
  ctx.fillRect(2, 7, 28, 1);
  ctx.fillRect(2, 15, 28, 1);
  ctx.fillRect(2, 23, 28, 1);
  ctx.fillRect(2, 31, 28, 1);
  // railing hints at edges
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(0, 0, 3, 32);
  ctx.fillRect(29, 0, 3, 32);
  // nails
  ctx.fillStyle = '#555555';
  ctx.fillRect(3, 3, 1, 1); ctx.fillRect(28, 3, 1, 1);
  ctx.fillRect(3, 11, 1, 1); ctx.fillRect(28, 11, 1, 1);
  ctx.fillRect(3, 19, 1, 1); ctx.fillRect(28, 19, 1, 1);
  ctx.fillRect(3, 27, 1, 1); ctx.fillRect(28, 27, 1, 1);
  save('bridge.png', c);
}

// Floor — warm light wood with plank lines
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9a96e';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#b8955c';
  ctx.fillRect(0, 7, 32, 1);
  ctx.fillRect(0, 15, 32, 1);
  ctx.fillRect(0, 23, 32, 1);
  ctx.fillRect(0, 31, 32, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  ctx.fillRect(8, 0, 1, 32);
  ctx.fillRect(22, 0, 1, 32);
  save('floor.png', c);
}

// Wall — stone brick
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6a6a7a';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#555565';
  ctx.fillRect(0, 7, 32, 1); ctx.fillRect(0, 15, 32, 1);
  ctx.fillRect(0, 23, 32, 1); ctx.fillRect(0, 31, 32, 1);
  ctx.fillRect(15, 0, 1, 8); ctx.fillRect(7, 8, 1, 8);
  ctx.fillRect(23, 8, 1, 8); ctx.fillRect(15, 16, 1, 8);
  ctx.fillRect(7, 24, 1, 8); ctx.fillRect(23, 24, 1, 8);
  save('wall.png', c);
}

// ══════════════════════════════════════
// PLAYER
// ══════════════════════════════════════
console.log('Player:');
function player(name, arrowDir) {
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a7bd5';
  ctx.fillRect(4, 8, 24, 32);
  ctx.fillStyle = '#f5c6a0';
  ctx.fillRect(8, 0, 16, 16);
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(6, 40, 8, 8);
  ctx.fillRect(18, 40, 8, 8);
  ctx.fillStyle = '#ffffff';
  const cx = 16, cy = 24;
  if (arrowDir === 'down') ctx.fillRect(cx - 2, cy + 4, 4, 8);
  if (arrowDir === 'up') ctx.fillRect(cx - 2, cy - 8, 4, 8);
  if (arrowDir === 'left') ctx.fillRect(cx - 8, cy - 2, 8, 4);
  if (arrowDir === 'right') ctx.fillRect(cx + 2, cy - 2, 8, 4);
  save(name, c);
}
player('player-down.png', 'down');
player('player-up.png', 'up');
player('player-left.png', 'left');
player('player-right.png', 'right');

// ══════════════════════════════════════
// OUTDOOR OBJECTS
// ══════════════════════════════════════
console.log('Outdoor objects:');

// Tree (64x96)
{
  const c = createCanvas(64, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(24, 56, 16, 40);
  ctx.fillStyle = '#2d6a1e';
  ctx.fillRect(8, 16, 48, 48);
  ctx.fillStyle = '#3a8c2e';
  ctx.fillRect(16, 4, 32, 40);
  ctx.fillStyle = '#4aad3a';
  ctx.fillRect(20, 0, 24, 24);
  save('tree.png', c);
}

// Rock (32x32)
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

// House base (128x96)
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

// House roof (128x64) — stepped triangle, transparent corners
{
  const c = createCanvas(128, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b04040';
  ctx.fillRect(0, 32, 128, 32);
  ctx.fillRect(8, 24, 112, 8);
  ctx.fillRect(16, 16, 96, 8);
  ctx.fillRect(24, 8, 80, 8);
  ctx.fillRect(32, 0, 64, 8);
  save('house-roof.png', c);
}

// ── Coffee shop base (160x96) ──
{
  const c = createCanvas(160, 96);
  const ctx = c.getContext('2d');
  // walls — warm cream
  ctx.fillStyle = '#e8d8c0';
  ctx.fillRect(0, 0, 160, 96);
  // accent stripe
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(0, 0, 160, 8);
  // large windows
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(12, 28, 40, 28);
  ctx.fillRect(108, 28, 40, 28);
  // window frames
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(12, 28, 40, 2); ctx.fillRect(12, 54, 40, 2);
  ctx.fillRect(12, 28, 2, 28); ctx.fillRect(50, 28, 2, 28);
  ctx.fillRect(30, 28, 2, 28);
  ctx.fillRect(108, 28, 40, 2); ctx.fillRect(108, 54, 40, 2);
  ctx.fillRect(108, 28, 2, 28); ctx.fillRect(146, 28, 2, 28);
  ctx.fillRect(126, 28, 2, 28);
  // door
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(66, 48, 28, 48);
  // door handle
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(88, 68, 3, 6);
  // "COFFEE" sign area
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(56, 12, 48, 16);
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(58, 14, 44, 12);
  // foundation
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 90, 160, 6);
  save('cafe-base.png', c);
}

// Coffee shop roof (160x56) — flat with awning
{
  const c = createCanvas(160, 56);
  const ctx = c.getContext('2d');
  // main roof — warm brown
  ctx.fillStyle = '#8b6a4a';
  ctx.fillRect(0, 16, 160, 40);
  ctx.fillRect(4, 8, 152, 8);
  ctx.fillRect(8, 0, 144, 8);
  // awning stripes
  ctx.fillStyle = '#c44a4a';
  for (let x = 0; x < 160; x += 16) {
    ctx.fillRect(x, 40, 8, 16);
  }
  ctx.fillStyle = '#e8d8c0';
  for (let x = 8; x < 160; x += 16) {
    ctx.fillRect(x, 40, 8, 16);
  }
  save('cafe-roof.png', c);
}

// ── Restaurant base (192x112) ──
{
  const c = createCanvas(192, 112);
  const ctx = c.getContext('2d');
  // walls — warm brick red
  ctx.fillStyle = '#a05040';
  ctx.fillRect(0, 0, 192, 112);
  // brick pattern
  ctx.fillStyle = '#904838';
  for (let y = 0; y < 112; y += 12) {
    ctx.fillRect(0, y, 192, 1);
    const off = (y / 12) % 2 === 0 ? 0 : 16;
    for (let x = off; x < 192; x += 32) {
      ctx.fillRect(x, y, 1, 12);
    }
  }
  // large windows
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(12, 32, 36, 36);
  ctx.fillRect(144, 32, 36, 36);
  // window frames
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(12, 32, 36, 2); ctx.fillRect(12, 66, 36, 2);
  ctx.fillRect(12, 32, 2, 36); ctx.fillRect(46, 32, 2, 36);
  ctx.fillRect(29, 32, 2, 36);
  ctx.fillRect(144, 32, 36, 2); ctx.fillRect(144, 66, 36, 2);
  ctx.fillRect(144, 32, 2, 36); ctx.fillRect(178, 32, 2, 36);
  ctx.fillRect(161, 32, 2, 36);
  // double doors
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(76, 52, 40, 60);
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(95, 52, 2, 60);
  // door handles
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(90, 78, 3, 6);
  ctx.fillRect(99, 78, 3, 6);
  // sign
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(62, 12, 68, 20);
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(64, 14, 64, 16);
  // foundation
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 104, 192, 8);
  save('restaurant-base.png', c);
}

// Restaurant roof (192x64) — peaked, darker
{
  const c = createCanvas(192, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 32, 192, 32);
  ctx.fillRect(8, 24, 176, 8);
  ctx.fillRect(16, 16, 160, 8);
  ctx.fillRect(24, 8, 144, 8);
  ctx.fillRect(40, 0, 112, 8);
  // chimney
  ctx.fillStyle = '#555555';
  ctx.fillRect(152, 0, 16, 24);
  ctx.fillStyle = '#444444';
  ctx.fillRect(150, 0, 20, 4);
  save('restaurant-roof.png', c);
}

// ── Bookstore base (128x96) — cozy, green/brown ──
{
  const c = createCanvas(128, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a0906a';
  ctx.fillRect(0, 0, 128, 96);
  // window with books visible
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(12, 28, 32, 28);
  ctx.fillRect(84, 28, 32, 28);
  // window frames
  ctx.fillStyle = '#3a5a2a';
  ctx.fillRect(12, 28, 32, 2); ctx.fillRect(12, 54, 32, 2);
  ctx.fillRect(12, 28, 2, 28); ctx.fillRect(42, 28, 2, 28);
  ctx.fillRect(84, 28, 32, 2); ctx.fillRect(84, 54, 32, 2);
  ctx.fillRect(84, 28, 2, 28); ctx.fillRect(114, 28, 2, 28);
  // books in windows
  ctx.fillStyle = '#c44a4a'; ctx.fillRect(16, 42, 4, 12);
  ctx.fillStyle = '#3a7bd5'; ctx.fillRect(22, 44, 4, 10);
  ctx.fillStyle = '#4a8c3f'; ctx.fillRect(28, 42, 4, 12);
  ctx.fillStyle = '#c44a4a'; ctx.fillRect(88, 44, 4, 10);
  ctx.fillStyle = '#c4a35a'; ctx.fillRect(94, 42, 4, 12);
  ctx.fillStyle = '#8855aa'; ctx.fillRect(100, 43, 4, 11);
  // door
  ctx.fillStyle = '#3a5a2a';
  ctx.fillRect(52, 52, 24, 44);
  // sign
  ctx.fillStyle = '#3a5a2a';
  ctx.fillRect(44, 8, 40, 16);
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(46, 10, 36, 12);
  // foundation
  ctx.fillStyle = '#666666';
  ctx.fillRect(0, 88, 128, 8);
  save('bookstore-base.png', c);
}
// Bookstore roof (128x64) — green
{
  const c = createCanvas(128, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a6a2a';
  ctx.fillRect(0, 32, 128, 32);
  ctx.fillRect(8, 24, 112, 8);
  ctx.fillRect(16, 16, 96, 8);
  ctx.fillRect(24, 8, 80, 8);
  ctx.fillRect(32, 0, 64, 8);
  save('bookstore-roof.png', c);
}

// ── Market base (160x96) — open stall feel ──
{
  const c = createCanvas(160, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d4b888';
  ctx.fillRect(0, 0, 160, 96);
  // open front — darker inside visible
  ctx.fillStyle = '#6a5a40';
  ctx.fillRect(16, 32, 128, 56);
  // support posts
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(16, 32, 6, 56);
  ctx.fillRect(74, 32, 6, 56);
  ctx.fillRect(138, 32, 6, 56);
  // produce/goods hints
  ctx.fillStyle = '#cc4444'; ctx.fillRect(28, 60, 16, 12);
  ctx.fillStyle = '#44aa44'; ctx.fillRect(50, 58, 16, 14);
  ctx.fillStyle = '#ddaa33'; ctx.fillRect(86, 60, 16, 12);
  ctx.fillStyle = '#dd8844'; ctx.fillRect(110, 58, 16, 14);
  // sign
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(48, 6, 64, 18);
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(50, 8, 60, 14);
  // foundation
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 90, 160, 6);
  save('market-base.png', c);
}
// Market roof (160x56) — striped awning, different from cafe
{
  const c = createCanvas(160, 56);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8b6a4a';
  ctx.fillRect(0, 16, 160, 40);
  ctx.fillRect(4, 8, 152, 8);
  ctx.fillRect(8, 0, 144, 8);
  // awning stripes — yellow/white
  ctx.fillStyle = '#ddaa33';
  for (let x = 0; x < 160; x += 16) ctx.fillRect(x, 40, 8, 16);
  ctx.fillStyle = '#f0ece4';
  for (let x = 8; x < 160; x += 16) ctx.fillRect(x, 40, 8, 16);
  save('market-roof.png', c);
}

// ── Bakery base (128x96) — warm pink/peach ──
{
  const c = createCanvas(128, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8c0a0';
  ctx.fillRect(0, 0, 128, 96);
  // window — display case
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(12, 32, 32, 24);
  ctx.fillRect(84, 32, 32, 24);
  // frames
  ctx.fillStyle = '#c07050';
  ctx.fillRect(12, 32, 32, 2); ctx.fillRect(12, 54, 32, 2);
  ctx.fillRect(12, 32, 2, 24); ctx.fillRect(42, 32, 2, 24);
  ctx.fillRect(84, 32, 32, 2); ctx.fillRect(84, 54, 32, 2);
  ctx.fillRect(84, 32, 2, 24); ctx.fillRect(114, 32, 2, 24);
  // pastries in window
  ctx.fillStyle = '#d4a050'; ctx.fillRect(18, 44, 8, 8);
  ctx.fillStyle = '#c08040'; ctx.fillRect(30, 46, 8, 6);
  ctx.fillStyle = '#d4a050'; ctx.fillRect(90, 44, 8, 8);
  ctx.fillStyle = '#e0b060'; ctx.fillRect(102, 45, 8, 7);
  // door
  ctx.fillStyle = '#8a5030';
  ctx.fillRect(52, 52, 24, 44);
  // sign
  ctx.fillStyle = '#c07050';
  ctx.fillRect(40, 8, 48, 18);
  ctx.fillStyle = '#f8f0e0';
  ctx.fillRect(42, 10, 44, 14);
  // foundation
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 88, 128, 8);
  save('bakery-base.png', c);
}
// Bakery roof (128x64) — warm orange
{
  const c = createCanvas(128, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c07840';
  ctx.fillRect(0, 32, 128, 32);
  ctx.fillRect(8, 24, 112, 8);
  ctx.fillRect(16, 16, 96, 8);
  ctx.fillRect(24, 8, 80, 8);
  ctx.fillRect(32, 0, 64, 8);
  // chimney with smoke hint
  ctx.fillStyle = '#888888';
  ctx.fillRect(96, 0, 12, 20);
  ctx.fillStyle = '#777777';
  ctx.fillRect(94, 0, 16, 3);
  save('bakery-roof.png', c);
}

// ── Inn base (160x112) — larger, warm wood ──
{
  const c = createCanvas(160, 112);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a7a50';
  ctx.fillRect(0, 0, 160, 112);
  // timber beams
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(0, 0, 160, 4);
  ctx.fillRect(0, 40, 160, 4);
  ctx.fillRect(0, 0, 4, 112);
  ctx.fillRect(76, 0, 4, 112);
  ctx.fillRect(156, 0, 4, 112);
  // windows
  ctx.fillStyle = '#ffcc66';
  ctx.fillRect(14, 12, 24, 20); ctx.fillRect(44, 12, 24, 20);
  ctx.fillRect(90, 12, 24, 20); ctx.fillRect(124, 12, 24, 20);
  ctx.fillRect(14, 52, 24, 20); ctx.fillRect(44, 52, 24, 20);
  ctx.fillRect(124, 52, 24, 20);
  // frames
  ctx.fillStyle = '#5a3a1a';
  for (const [wx, wy] of [[14,12],[44,12],[90,12],[124,12],[14,52],[44,52],[124,52]]) {
    ctx.fillRect(wx, wy, 24, 2); ctx.fillRect(wx, wy+18, 24, 2);
    ctx.fillRect(wx, wy, 2, 20); ctx.fillRect(wx+22, wy, 2, 20);
  }
  // double door
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(90, 56, 28, 56);
  ctx.fillStyle = '#4a2a10';
  ctx.fillRect(103, 56, 2, 56);
  // handles
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(98, 80, 3, 5);
  ctx.fillRect(107, 80, 3, 5);
  // hanging sign
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(60, 48, 8, 4);
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(50, 52, 28, 18);
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(52, 54, 24, 14);
  // foundation
  ctx.fillStyle = '#666666';
  ctx.fillRect(0, 104, 160, 8);
  save('inn-base.png', c);
}
// Inn roof (160x64) — dark brown, larger
{
  const c = createCanvas(160, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(0, 32, 160, 32);
  ctx.fillRect(8, 24, 144, 8);
  ctx.fillRect(16, 16, 128, 8);
  ctx.fillRect(24, 8, 112, 8);
  ctx.fillRect(36, 0, 88, 8);
  // chimney
  ctx.fillStyle = '#777777';
  ctx.fillRect(128, 0, 14, 20);
  ctx.fillStyle = '#666666';
  ctx.fillRect(126, 0, 18, 3);
  save('inn-roof.png', c);
}

// ── Blacksmith base (128x96) — dark stone ──
{
  const c = createCanvas(128, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, 0, 128, 96);
  // stone texture
  ctx.fillStyle = '#4a4a4a';
  for (let y = 0; y < 96; y += 10) {
    ctx.fillRect(0, y, 128, 1);
    const off = (y / 10) % 2 === 0 ? 0 : 12;
    for (let x = off; x < 128; x += 24) ctx.fillRect(x, y, 1, 10);
  }
  // forge glow window
  ctx.fillStyle = '#ff6600';
  ctx.fillRect(12, 28, 28, 24);
  ctx.fillStyle = '#cc4400';
  ctx.fillRect(14, 30, 24, 20);
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(18, 34, 8, 8);
  ctx.fillRect(28, 36, 6, 6);
  // regular window
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(88, 28, 28, 24);
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(88, 28, 28, 2); ctx.fillRect(88, 50, 28, 2);
  ctx.fillRect(88, 28, 2, 24); ctx.fillRect(114, 28, 2, 24);
  // door — heavy iron-bound
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(52, 48, 24, 48);
  ctx.fillStyle = '#555555';
  ctx.fillRect(52, 52, 24, 2);
  ctx.fillRect(52, 68, 24, 2);
  ctx.fillRect(52, 84, 24, 2);
  // anvil silhouette on sign
  ctx.fillStyle = '#333333';
  ctx.fillRect(48, 8, 32, 16);
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(56, 12, 16, 4);
  ctx.fillRect(52, 16, 24, 4);
  // foundation
  ctx.fillStyle = '#444444';
  ctx.fillRect(0, 88, 128, 8);
  save('blacksmith-base.png', c);
}
// Blacksmith roof (128x64) — dark
{
  const c = createCanvas(128, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 32, 128, 32);
  ctx.fillRect(8, 24, 112, 8);
  ctx.fillRect(16, 16, 96, 8);
  ctx.fillRect(24, 8, 80, 8);
  ctx.fillRect(32, 0, 64, 8);
  // large chimney with smoke
  ctx.fillStyle = '#555555';
  ctx.fillRect(8, 0, 20, 28);
  ctx.fillStyle = '#444444';
  ctx.fillRect(6, 0, 24, 3);
  save('blacksmith-roof.png', c);
}

// ── Unique indoor objects ──
console.log('Location-specific objects:');

// Anvil (24x24)
{
  const c = createCanvas(24, 24);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#555555';
  ctx.fillRect(4, 16, 16, 8);
  ctx.fillStyle = '#777777';
  ctx.fillRect(2, 8, 20, 10);
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 6, 24, 4);
  ctx.fillStyle = '#999999';
  ctx.fillRect(6, 4, 12, 4);
  // horn
  ctx.fillStyle = '#777777';
  ctx.fillRect(0, 8, 4, 4);
  save('anvil.png', c);
}

// Forge (32x32)
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, 8, 32, 24);
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 4, 32, 6);
  // fire inside
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(4, 10, 24, 16);
  ctx.fillStyle = '#cc4400';
  ctx.fillRect(8, 14, 8, 10);
  ctx.fillRect(18, 16, 6, 8);
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(10, 16, 5, 6);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(12, 18, 3, 3);
  save('forge.png', c);
}

// Weapons rack (28x40)
{
  const c = createCanvas(28, 40);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 0, 28, 40);
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(0, 12, 28, 2);
  ctx.fillRect(0, 26, 28, 2);
  // swords
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(5, 2, 2, 10); ctx.fillRect(4, 8, 4, 2);
  ctx.fillRect(13, 3, 2, 9); ctx.fillRect(12, 9, 4, 2);
  ctx.fillRect(21, 2, 2, 10); ctx.fillRect(20, 8, 4, 2);
  // shield
  ctx.fillStyle = '#8b2020';
  ctx.fillRect(8, 15, 12, 10);
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(12, 17, 4, 6);
  // hammer
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(6, 29, 2, 10);
  ctx.fillStyle = '#777777';
  ctx.fillRect(3, 29, 8, 4);
  save('weapons-rack.png', c);
}

// Market stall (48x32)
{
  const c = createCanvas(48, 32);
  const ctx = c.getContext('2d');
  // table
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(0, 12, 48, 20);
  ctx.fillStyle = '#a08050';
  ctx.fillRect(0, 8, 48, 6);
  // legs
  ctx.fillStyle = '#6b4f27';
  ctx.fillRect(2, 28, 4, 4);
  ctx.fillRect(42, 28, 4, 4);
  // produce
  ctx.fillStyle = '#cc4444'; ctx.fillRect(4, 14, 8, 8);
  ctx.fillStyle = '#44aa44'; ctx.fillRect(14, 14, 8, 8);
  ctx.fillStyle = '#ddaa33'; ctx.fillRect(26, 14, 8, 8);
  ctx.fillStyle = '#dd8844'; ctx.fillRect(36, 14, 8, 8);
  save('market-stall.png', c);
}

// Bread basket (20x20)
{
  const c = createCanvas(20, 20);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a08050';
  ctx.fillRect(2, 6, 16, 14);
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(0, 10, 20, 10);
  // bread loaves
  ctx.fillStyle = '#d4a050';
  ctx.fillRect(3, 4, 6, 8);
  ctx.fillStyle = '#c89040';
  ctx.fillRect(10, 5, 7, 7);
  ctx.fillStyle = '#ddb060';
  ctx.fillRect(5, 2, 5, 5);
  save('bread-basket.png', c);
}

// Bed (inn variant — red/warm) (32x64)
{
  const c = createCanvas(32, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(2, 54, 4, 10); ctx.fillRect(26, 54, 4, 10);
  ctx.fillRect(2, 10, 4, 6); ctx.fillRect(26, 10, 4, 6);
  ctx.fillStyle = '#6b4828';
  ctx.fillRect(0, 12, 32, 46);
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(2, 14, 28, 40);
  ctx.fillStyle = '#f0ece4';
  ctx.fillRect(6, 16, 20, 10);
  ctx.fillStyle = '#e0d8c8';
  ctx.fillRect(6, 24, 20, 2);
  // red blanket (inn style)
  ctx.fillStyle = '#8b2020';
  ctx.fillRect(2, 32, 28, 20);
  ctx.fillStyle = '#7a1818';
  ctx.fillRect(2, 32, 28, 2);
  // gold trim
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(2, 50, 28, 2);
  // headboard
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 6, 32, 8);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(0, 6, 32, 2);
  save('inn-bed.png', c);
}

// ── Counter (64x32) — for coffee shop ──
{
  const c = createCanvas(64, 32);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 8, 64, 24);
  // top surface
  ctx.fillStyle = '#8c6438';
  ctx.fillRect(0, 4, 64, 6);
  ctx.fillStyle = '#9a7248';
  ctx.fillRect(0, 4, 64, 2);
  // panel lines
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(20, 10, 1, 20);
  ctx.fillRect(42, 10, 1, 20);
  save('counter.png', c);
}

// ── Coffee machine (24x32) ──
{
  const c = createCanvas(24, 32);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#444444';
  ctx.fillRect(2, 8, 20, 24);
  // top
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 4, 24, 6);
  // spout area
  ctx.fillStyle = '#333333';
  ctx.fillRect(6, 14, 12, 10);
  // buttons
  ctx.fillStyle = '#cc4444';
  ctx.fillRect(4, 10, 4, 3);
  ctx.fillStyle = '#44cc44';
  ctx.fillRect(10, 10, 4, 3);
  // drip tray
  ctx.fillStyle = '#666666';
  ctx.fillRect(4, 26, 16, 4);
  save('coffee-machine.png', c);
}

// ── Outdoor decorations ──
console.log('Outdoor decorations:');

// Flower patch (24x16) — colorful ground cover
{
  const c = createCanvas(24, 16);
  const ctx = c.getContext('2d');
  // Stems/leaves
  ctx.fillStyle = '#3a7a2a';
  ctx.fillRect(2, 8, 20, 8);
  ctx.fillRect(4, 6, 16, 4);
  // Flowers
  ctx.fillStyle = '#dd4466'; ctx.fillRect(4, 4, 4, 4);
  ctx.fillStyle = '#ffcc44'; ctx.fillRect(10, 2, 4, 4);
  ctx.fillStyle = '#6644cc'; ctx.fillRect(16, 4, 4, 4);
  ctx.fillStyle = '#ff8844'; ctx.fillRect(7, 6, 3, 3);
  ctx.fillStyle = '#44aadd'; ctx.fillRect(14, 6, 3, 3);
  // Centers
  ctx.fillStyle = '#ffee88';
  ctx.fillRect(5, 5, 2, 2);
  ctx.fillRect(11, 3, 2, 2);
  ctx.fillRect(17, 5, 2, 2);
  save('flowers.png', c);
}

// Lamp post (12x40)
{
  const c = createCanvas(12, 40);
  const ctx = c.getContext('2d');
  // Base
  ctx.fillStyle = '#555555';
  ctx.fillRect(2, 34, 8, 6);
  // Pole
  ctx.fillStyle = '#666666';
  ctx.fillRect(4, 8, 4, 28);
  // Lamp housing
  ctx.fillStyle = '#777777';
  ctx.fillRect(1, 4, 10, 6);
  // Light glow
  ctx.fillStyle = '#ffcc44';
  ctx.fillRect(3, 5, 6, 4);
  ctx.fillStyle = '#ffee88';
  ctx.fillRect(4, 6, 4, 2);
  // Top cap
  ctx.fillStyle = '#555555';
  ctx.fillRect(2, 2, 8, 3);
  save('lamp-post.png', c);
}

// Fence horizontal (32x16)
{
  const c = createCanvas(32, 16);
  const ctx = c.getContext('2d');
  // Posts
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(1, 2, 4, 14);
  ctx.fillRect(27, 2, 4, 14);
  // Rails
  ctx.fillStyle = '#8b6240';
  ctx.fillRect(0, 4, 32, 3);
  ctx.fillRect(0, 10, 32, 3);
  // Post tops
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(1, 0, 4, 3);
  ctx.fillRect(27, 0, 4, 3);
  save('fence.png', c);
}

// Well (32x32)
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // Stone base
  ctx.fillStyle = '#888899';
  ctx.fillRect(4, 16, 24, 16);
  ctx.fillStyle = '#777788';
  ctx.fillRect(2, 20, 28, 12);
  // Water inside (visible from top)
  ctx.fillStyle = '#3068a8';
  ctx.fillRect(8, 14, 16, 8);
  // Roof support posts
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(6, 4, 3, 16);
  ctx.fillRect(23, 4, 3, 16);
  // Roof
  ctx.fillStyle = '#8b6a4a';
  ctx.fillRect(2, 2, 28, 4);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(4, 0, 24, 3);
  // Bucket
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(14, 10, 6, 5);
  // Rope
  ctx.fillStyle = '#a08050';
  ctx.fillRect(16, 4, 1, 7);
  save('well.png', c);
}

// Bench (32x20)
{
  const c = createCanvas(32, 20);
  const ctx = c.getContext('2d');
  // Legs
  ctx.fillStyle = '#555555';
  ctx.fillRect(3, 14, 3, 6);
  ctx.fillRect(26, 14, 3, 6);
  // Seat
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(0, 10, 32, 6);
  ctx.fillStyle = '#9a7f57';
  ctx.fillRect(0, 10, 32, 2);
  // Backrest
  ctx.fillStyle = '#7a5f37';
  ctx.fillRect(0, 2, 32, 10);
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(2, 4, 12, 6);
  ctx.fillRect(18, 4, 12, 6);
  // Arm rests
  ctx.fillStyle = '#6b4f27';
  ctx.fillRect(0, 4, 3, 12);
  ctx.fillRect(29, 4, 3, 12);
  save('bench.png', c);
}

// Signpost (16x36)
{
  const c = createCanvas(16, 36);
  const ctx = c.getContext('2d');
  // Post
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(6, 8, 4, 28);
  // Base
  ctx.fillStyle = '#555555';
  ctx.fillRect(3, 32, 10, 4);
  // Sign board (pointing right)
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(2, 4, 14, 8);
  // Arrow point
  ctx.fillRect(14, 2, 2, 4);
  ctx.fillRect(14, 10, 2, 4);
  // Text line
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(4, 7, 8, 2);
  // Top cap
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(5, 2, 6, 3);
  save('signpost.png', c);
}

// Bush (28x20)
{
  const c = createCanvas(28, 20);
  const ctx = c.getContext('2d');
  // Main foliage
  ctx.fillStyle = '#3a7a2a';
  ctx.fillRect(4, 6, 20, 14);
  ctx.fillStyle = '#4a8c3f';
  ctx.fillRect(2, 8, 24, 10);
  ctx.fillStyle = '#5a9c4f';
  ctx.fillRect(6, 4, 16, 8);
  // Highlight
  ctx.fillStyle = '#6aac5f';
  ctx.fillRect(8, 4, 8, 4);
  // Small berries
  ctx.fillStyle = '#cc3344';
  ctx.fillRect(8, 10, 2, 2);
  ctx.fillRect(16, 12, 2, 2);
  ctx.fillRect(12, 14, 2, 2);
  save('bush.png', c);
}

// Log pile (28x20)
{
  const c = createCanvas(28, 20);
  const ctx = c.getContext('2d');
  // Bottom row of logs
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(0, 12, 28, 8);
  // Log ends (circles-ish)
  ctx.fillStyle = '#8b6240';
  ctx.fillRect(2, 13, 6, 6);
  ctx.fillRect(10, 13, 6, 6);
  ctx.fillRect(18, 13, 6, 6);
  // Inner rings
  ctx.fillStyle = '#a08050';
  ctx.fillRect(4, 15, 2, 2);
  ctx.fillRect(12, 15, 2, 2);
  ctx.fillRect(20, 15, 2, 2);
  // Top row (smaller)
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(4, 4, 20, 9);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(6, 5, 6, 7);
  ctx.fillRect(14, 5, 6, 7);
  ctx.fillStyle = '#8b6a4a';
  ctx.fillRect(8, 7, 2, 2);
  ctx.fillRect(16, 7, 2, 2);
  save('log-pile.png', c);
}

// NPC (32x48)
{
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c44a4a';
  ctx.fillRect(4, 8, 24, 32);
  ctx.fillStyle = '#f5c6a0';
  ctx.fillRect(8, 0, 16, 16);
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(6, 40, 8, 8);
  ctx.fillRect(18, 40, 8, 8);
  save('npc.png', c);
}

// ══════════════════════════════════════
// INDOOR FURNITURE & OBJECTS
// ══════════════════════════════════════
console.log('Indoor objects:');

// Table — dark wood with top surface (32x32)
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(4, 20, 4, 12);
  ctx.fillRect(24, 20, 4, 12);
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(2, 10, 28, 14);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(1, 6, 30, 6);
  ctx.fillStyle = '#8c6438';
  ctx.fillRect(1, 6, 30, 2);
  ctx.fillStyle = '#6b4828';
  ctx.fillRect(8, 8, 16, 1);
  save('furniture.png', c);
}

// Chair (24x32)
{
  const c = createCanvas(24, 32);
  const ctx = c.getContext('2d');
  // legs
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(2, 22, 3, 10);
  ctx.fillRect(19, 22, 3, 10);
  // seat
  ctx.fillStyle = '#6b4828';
  ctx.fillRect(1, 16, 22, 8);
  // seat top
  ctx.fillStyle = '#7a5636';
  ctx.fillRect(1, 14, 22, 4);
  // backrest
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(2, 0, 20, 16);
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(4, 2, 7, 12);
  ctx.fillRect(13, 2, 7, 12);
  save('chair.png', c);
}

// Bed (32x64)
{
  const c = createCanvas(32, 64);
  const ctx = c.getContext('2d');
  // frame legs
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(2, 54, 4, 10);
  ctx.fillRect(26, 54, 4, 10);
  ctx.fillRect(2, 10, 4, 6);
  ctx.fillRect(26, 10, 4, 6);
  // bed frame
  ctx.fillStyle = '#6b4828';
  ctx.fillRect(0, 12, 32, 46);
  // mattress
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(2, 14, 28, 40);
  // pillow
  ctx.fillStyle = '#f0ece4';
  ctx.fillRect(6, 16, 20, 10);
  ctx.fillStyle = '#e0d8c8';
  ctx.fillRect(6, 24, 20, 2);
  // blanket
  ctx.fillStyle = '#6a8cba';
  ctx.fillRect(2, 32, 28, 20);
  ctx.fillStyle = '#5a7caa';
  ctx.fillRect(2, 32, 28, 2);
  // headboard
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 6, 32, 8);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(0, 6, 32, 2);
  save('bed.png', c);
}

// Bookshelf (32x48)
{
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  // frame
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 0, 32, 48);
  // shelves (horizontal)
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(0, 0, 32, 3);
  ctx.fillRect(0, 15, 32, 2);
  ctx.fillRect(0, 30, 32, 2);
  ctx.fillRect(0, 45, 32, 3);
  // books — top shelf
  ctx.fillStyle = '#c44a4a'; ctx.fillRect(3, 3, 5, 12);
  ctx.fillStyle = '#3a7bd5'; ctx.fillRect(9, 5, 4, 10);
  ctx.fillStyle = '#4a8c3f'; ctx.fillRect(14, 3, 5, 12);
  ctx.fillStyle = '#c4a35a'; ctx.fillRect(20, 4, 4, 11);
  ctx.fillStyle = '#8855aa'; ctx.fillRect(25, 3, 5, 12);
  // books — middle shelf
  ctx.fillStyle = '#cc7733'; ctx.fillRect(3, 17, 6, 13);
  ctx.fillStyle = '#4477aa'; ctx.fillRect(10, 19, 5, 11);
  ctx.fillStyle = '#aa3355'; ctx.fillRect(16, 17, 4, 13);
  ctx.fillStyle = '#55aa55'; ctx.fillRect(21, 18, 5, 12);
  // books — bottom shelf
  ctx.fillStyle = '#6666aa'; ctx.fillRect(3, 32, 5, 13);
  ctx.fillStyle = '#aa8844'; ctx.fillRect(9, 34, 6, 11);
  ctx.fillStyle = '#cc5555'; ctx.fillRect(16, 32, 4, 13);
  ctx.fillStyle = '#5588cc'; ctx.fillRect(21, 33, 5, 12);
  ctx.fillStyle = '#88aa44'; ctx.fillRect(27, 32, 3, 13);
  save('bookshelf.png', c);
}

// Fireplace (48x48)
{
  const c = createCanvas(48, 48);
  const ctx = c.getContext('2d');
  // stone surround
  ctx.fillStyle = '#777788';
  ctx.fillRect(0, 0, 48, 48);
  // mantle
  ctx.fillStyle = '#6a6a7a';
  ctx.fillRect(0, 0, 48, 6);
  ctx.fillStyle = '#888899';
  ctx.fillRect(2, 0, 44, 4);
  // firebox opening
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(8, 12, 32, 36);
  // fire
  ctx.fillStyle = '#cc4400';
  ctx.fillRect(14, 28, 8, 16);
  ctx.fillRect(24, 32, 8, 12);
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(16, 32, 6, 10);
  ctx.fillRect(26, 34, 4, 8);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(18, 36, 4, 6);
  ctx.fillRect(27, 37, 3, 4);
  // logs
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(12, 42, 24, 4);
  ctx.fillRect(14, 40, 20, 3);
  save('fireplace.png', c);
}

// Rug (64x48)
{
  const c = createCanvas(64, 48);
  const ctx = c.getContext('2d');
  // outer border
  ctx.fillStyle = '#8b3a3a';
  ctx.fillRect(0, 0, 64, 48);
  // inner border
  ctx.fillStyle = '#a04a4a';
  ctx.fillRect(3, 3, 58, 42);
  // center
  ctx.fillStyle = '#c4785a';
  ctx.fillRect(6, 6, 52, 36);
  // diamond pattern
  ctx.fillStyle = '#a04a4a';
  ctx.fillRect(28, 10, 8, 8);
  ctx.fillRect(24, 14, 16, 1);
  ctx.fillRect(28, 30, 8, 8);
  ctx.fillRect(24, 34, 16, 1);
  // corner accents
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(8, 8, 4, 4);
  ctx.fillRect(52, 8, 4, 4);
  ctx.fillRect(8, 36, 4, 4);
  ctx.fillRect(52, 36, 4, 4);
  save('rug.png', c);
}

// Crate (24x28)
{
  const c = createCanvas(24, 28);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#8b6f47';
  ctx.fillRect(0, 4, 24, 24);
  // top surface
  ctx.fillStyle = '#a08050';
  ctx.fillRect(0, 0, 24, 6);
  // plank lines
  ctx.fillStyle = '#7a5f37';
  ctx.fillRect(7, 4, 1, 24);
  ctx.fillRect(16, 4, 1, 24);
  // cross brace
  ctx.fillStyle = '#6b4f27';
  ctx.fillRect(0, 14, 24, 2);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(0, 24, 24, 4);
  save('crate.png', c);
}

// Barrel (24x32)
{
  const c = createCanvas(24, 32);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(2, 4, 20, 24);
  // wider middle
  ctx.fillStyle = '#8b6a4a';
  ctx.fillRect(0, 10, 24, 12);
  // top
  ctx.fillStyle = '#9a7a5a';
  ctx.fillRect(4, 0, 16, 6);
  // metal bands
  ctx.fillStyle = '#666666';
  ctx.fillRect(1, 8, 22, 2);
  ctx.fillRect(1, 22, 22, 2);
  // top rim
  ctx.fillStyle = '#777777';
  ctx.fillRect(3, 0, 18, 2);
  // stave lines
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(8, 4, 1, 24);
  ctx.fillRect(15, 4, 1, 24);
  save('barrel.png', c);
}

// Pot / Vase (20x28)
{
  const c = createCanvas(20, 28);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#b06030';
  ctx.fillRect(2, 8, 16, 16);
  // wider bottom
  ctx.fillRect(0, 16, 20, 8);
  // narrow top / neck
  ctx.fillStyle = '#a05020';
  ctx.fillRect(4, 4, 12, 6);
  // rim
  ctx.fillStyle = '#c07040';
  ctx.fillRect(3, 2, 14, 3);
  // base
  ctx.fillStyle = '#904020';
  ctx.fillRect(2, 24, 16, 4);
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(6, 6, 3, 14);
  save('pot.png', c);
}

// Candle (12x24)
{
  const c = createCanvas(12, 24);
  const ctx = c.getContext('2d');
  // holder base
  ctx.fillStyle = '#888866';
  ctx.fillRect(1, 18, 10, 6);
  ctx.fillStyle = '#999977';
  ctx.fillRect(2, 16, 8, 3);
  // candle stick
  ctx.fillStyle = '#eee8d0';
  ctx.fillRect(4, 6, 4, 12);
  // flame
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(4, 2, 4, 5);
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(5, 1, 2, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(5, 3, 2, 2);
  save('candle.png', c);
}

// Window (indoor) (32x24)
{
  const c = createCanvas(32, 24);
  const ctx = c.getContext('2d');
  // frame
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 0, 32, 24);
  // glass
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(3, 3, 12, 18);
  ctx.fillRect(17, 3, 12, 18);
  // cross bar
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(3, 11, 12, 2);
  ctx.fillRect(17, 11, 12, 2);
  // light reflection
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(5, 4, 4, 6);
  ctx.fillRect(19, 4, 4, 6);
  save('window.png', c);
}

// Kitchen stove / counter (32x32)
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 8, 32, 24);
  // top surface
  ctx.fillStyle = '#666666';
  ctx.fillRect(0, 4, 32, 6);
  ctx.fillStyle = '#777777';
  ctx.fillRect(0, 4, 32, 2);
  // burners
  ctx.fillStyle = '#444444';
  ctx.fillRect(4, 6, 8, 3);
  ctx.fillRect(20, 6, 8, 3);
  // oven door
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(4, 14, 24, 14);
  // handle
  ctx.fillStyle = '#888888';
  ctx.fillRect(12, 16, 8, 2);
  // knobs
  ctx.fillStyle = '#888888';
  ctx.fillRect(6, 10, 3, 3);
  ctx.fillRect(14, 10, 3, 3);
  ctx.fillRect(22, 10, 3, 3);
  save('stove.png', c);
}

// ══════════════════════════════════════
// CAFE-SPECIFIC OBJECTS
// ══════════════════════════════════════
console.log('Cafe objects:');

// Cafe table — round, lighter wood with coffee ring stain (32x32)
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // single pedestal leg
  ctx.fillStyle = '#444444';
  ctx.fillRect(13, 24, 6, 8);
  // base
  ctx.fillStyle = '#555555';
  ctx.fillRect(8, 28, 16, 4);
  // tabletop (round-ish)
  ctx.fillStyle = '#d4b896';
  ctx.fillRect(4, 8, 24, 16);
  ctx.fillRect(6, 6, 20, 4);
  ctx.fillRect(6, 22, 20, 4);
  // top surface
  ctx.fillStyle = '#e0c8a8';
  ctx.fillRect(6, 6, 20, 4);
  ctx.fillRect(4, 8, 24, 2);
  // coffee ring stain
  ctx.fillStyle = 'rgba(100,60,20,0.15)';
  ctx.fillRect(10, 10, 8, 8);
  ctx.fillRect(12, 9, 4, 1);
  ctx.fillRect(12, 18, 4, 1);
  save('cafe-table.png', c);
}

// Cafe chair — metal frame with cushion (24x32)
{
  const c = createCanvas(24, 32);
  const ctx = c.getContext('2d');
  // metal legs
  ctx.fillStyle = '#555555';
  ctx.fillRect(2, 22, 2, 10);
  ctx.fillRect(20, 22, 2, 10);
  // seat frame
  ctx.fillStyle = '#666666';
  ctx.fillRect(1, 18, 22, 3);
  // cushion
  ctx.fillStyle = '#c44a4a';
  ctx.fillRect(2, 14, 20, 6);
  ctx.fillStyle = '#d45a5a';
  ctx.fillRect(2, 14, 20, 2);
  // backrest — metal
  ctx.fillStyle = '#555555';
  ctx.fillRect(2, 0, 2, 16);
  ctx.fillRect(20, 0, 2, 16);
  ctx.fillRect(2, 0, 20, 2);
  // back cushion
  ctx.fillStyle = '#c44a4a';
  ctx.fillRect(4, 2, 16, 12);
  ctx.fillStyle = '#b43a3a';
  ctx.fillRect(4, 12, 16, 2);
  save('cafe-chair.png', c);
}

// Coffee cup (12x16)
{
  const c = createCanvas(12, 16);
  const ctx = c.getContext('2d');
  // saucer
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(0, 12, 12, 4);
  // cup body
  ctx.fillStyle = '#f0e8d8';
  ctx.fillRect(2, 4, 8, 10);
  // coffee inside
  ctx.fillStyle = '#4a2810';
  ctx.fillRect(3, 4, 6, 3);
  // handle
  ctx.fillStyle = '#e0d8c8';
  ctx.fillRect(10, 6, 2, 6);
  // steam
  ctx.fillStyle = 'rgba(200,200,200,0.4)';
  ctx.fillRect(4, 1, 2, 3);
  ctx.fillRect(6, 0, 2, 2);
  save('coffee-cup.png', c);
}

// Menu board (28x40)
{
  const c = createCanvas(28, 40);
  const ctx = c.getContext('2d');
  // board
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 28, 36);
  // frame
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 0, 28, 2);
  ctx.fillRect(0, 34, 28, 2);
  ctx.fillRect(0, 0, 2, 36);
  ctx.fillRect(26, 0, 2, 36);
  // chalk text lines
  ctx.fillStyle = '#e8e8e0';
  ctx.fillRect(5, 6, 18, 2);
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(5, 12, 14, 1);
  ctx.fillRect(5, 16, 16, 1);
  ctx.fillRect(5, 20, 12, 1);
  ctx.fillRect(5, 24, 15, 1);
  ctx.fillRect(5, 28, 10, 1);
  // stand legs
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(6, 36, 3, 4);
  ctx.fillRect(19, 36, 3, 4);
  save('menu-board.png', c);
}

// Pastry display case (32x28)
{
  const c = createCanvas(32, 28);
  const ctx = c.getContext('2d');
  // base counter
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 16, 32, 12);
  // glass case
  ctx.fillStyle = 'rgba(180,220,240,0.5)';
  ctx.fillRect(2, 4, 28, 14);
  // frame
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 2, 32, 3);
  ctx.fillRect(0, 16, 32, 2);
  ctx.fillRect(0, 2, 2, 16);
  ctx.fillRect(30, 2, 2, 16);
  // pastries inside
  ctx.fillStyle = '#d4a050';
  ctx.fillRect(5, 10, 6, 5);
  ctx.fillStyle = '#c08040';
  ctx.fillRect(13, 9, 7, 6);
  ctx.fillStyle = '#e0b060';
  ctx.fillRect(22, 10, 5, 5);
  save('pastry-case.png', c);
}

// Sofa / couch (48x32)
{
  const c = createCanvas(48, 32);
  const ctx = c.getContext('2d');
  // legs
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(4, 28, 4, 4);
  ctx.fillRect(40, 28, 4, 4);
  // base
  ctx.fillStyle = '#6a4a30';
  ctx.fillRect(0, 20, 48, 10);
  // seat cushion
  ctx.fillStyle = '#8b5e3c';
  ctx.fillRect(2, 14, 44, 8);
  ctx.fillStyle = '#9b6e4c';
  ctx.fillRect(2, 14, 44, 2);
  // backrest
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(0, 0, 48, 16);
  // armrests
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(0, 4, 6, 20);
  ctx.fillRect(42, 4, 6, 20);
  // cushion lines
  ctx.fillStyle = '#6a3e20';
  ctx.fillRect(16, 2, 1, 12);
  ctx.fillRect(32, 2, 1, 12);
  save('sofa.png', c);
}

// ══════════════════════════════════════
// RESTAURANT-SPECIFIC OBJECTS
// ══════════════════════════════════════
console.log('Restaurant objects:');

// Dining table — white tablecloth (32x32)
{
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  // legs
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(4, 24, 3, 8);
  ctx.fillRect(25, 24, 3, 8);
  // table body
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(2, 12, 28, 14);
  // tablecloth (draping over edges)
  ctx.fillStyle = '#f0ece4';
  ctx.fillRect(0, 6, 32, 10);
  // cloth top surface
  ctx.fillStyle = '#f8f4ec';
  ctx.fillRect(0, 4, 32, 4);
  // cloth fold shadow
  ctx.fillStyle = '#e0d8c8';
  ctx.fillRect(0, 14, 32, 2);
  // cloth drape on sides
  ctx.fillStyle = '#e8e0d4';
  ctx.fillRect(0, 8, 3, 8);
  ctx.fillRect(29, 8, 3, 8);
  save('dining-table.png', c);
}

// Dining chair — upholstered, fancier (24x32)
{
  const c = createCanvas(24, 32);
  const ctx = c.getContext('2d');
  // legs — dark wood
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(2, 24, 3, 8);
  ctx.fillRect(19, 24, 3, 8);
  // seat
  ctx.fillStyle = '#8b2020';
  ctx.fillRect(1, 16, 22, 10);
  ctx.fillStyle = '#9b3030';
  ctx.fillRect(1, 16, 22, 3);
  // backrest — tall, padded
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(1, 0, 22, 18);
  // upholstery
  ctx.fillStyle = '#8b2020';
  ctx.fillRect(3, 2, 18, 13);
  // button detail
  ctx.fillStyle = '#7a1818';
  ctx.fillRect(8, 5, 2, 2);
  ctx.fillRect(14, 5, 2, 2);
  ctx.fillRect(11, 9, 2, 2);
  save('dining-chair.png', c);
}

// Wine bottle (12x28)
{
  const c = createCanvas(12, 28);
  const ctx = c.getContext('2d');
  // body
  ctx.fillStyle = '#2a4020';
  ctx.fillRect(2, 12, 8, 16);
  // neck
  ctx.fillStyle = '#2a4020';
  ctx.fillRect(4, 4, 4, 10);
  // cork/cap
  ctx.fillStyle = '#c4a35a';
  ctx.fillRect(4, 2, 4, 3);
  // label
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(3, 16, 6, 8);
  ctx.fillStyle = '#8b2020';
  ctx.fillRect(4, 18, 4, 4);
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(3, 12, 2, 12);
  save('wine-bottle.png', c);
}

// Plate with food (16x12)
{
  const c = createCanvas(16, 12);
  const ctx = c.getContext('2d');
  // plate
  ctx.fillStyle = '#f0ece4';
  ctx.fillRect(0, 2, 16, 10);
  ctx.fillStyle = '#e8e0d4';
  ctx.fillRect(2, 0, 12, 4);
  // food
  ctx.fillStyle = '#8b5030';
  ctx.fillRect(4, 3, 8, 5);
  // garnish
  ctx.fillStyle = '#4a8c3f';
  ctx.fillRect(4, 2, 3, 3);
  // sauce
  ctx.fillStyle = '#c04020';
  ctx.fillRect(9, 4, 3, 2);
  save('plate.png', c);
}

// Chandelier (32x24) — decorative ceiling piece
{
  const c = createCanvas(32, 24);
  const ctx = c.getContext('2d');
  // chain
  ctx.fillStyle = '#888866';
  ctx.fillRect(15, 0, 2, 6);
  // frame
  ctx.fillStyle = '#aa9944';
  ctx.fillRect(4, 6, 24, 3);
  ctx.fillRect(4, 6, 2, 14);
  ctx.fillRect(26, 6, 2, 14);
  ctx.fillRect(14, 6, 4, 14);
  // candles
  ctx.fillStyle = '#eee8d0';
  ctx.fillRect(6, 10, 3, 8);
  ctx.fillRect(23, 10, 3, 8);
  // flames
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(6, 7, 3, 4);
  ctx.fillRect(23, 7, 3, 4);
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(7, 6, 1, 2);
  ctx.fillRect(24, 6, 1, 2);
  save('chandelier.png', c);
}

// Wine rack (32x48)
{
  const c = createCanvas(32, 48);
  const ctx = c.getContext('2d');
  // frame
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(0, 0, 32, 48);
  // shelf dividers
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 11, 32, 2);
  ctx.fillRect(0, 23, 32, 2);
  ctx.fillRect(0, 35, 32, 2);
  ctx.fillRect(0, 46, 32, 2);
  // bottles (various colors, horizontal)
  const colors = ['#2a4020', '#4a2020', '#2a2040', '#3a3020', '#402040', '#2a4040'];
  let ci = 0;
  for (let row = 0; row < 4; row++) {
    const by = 3 + row * 12;
    for (let bx = 3; bx < 28; bx += 8) {
      ctx.fillStyle = colors[ci % colors.length];
      ctx.fillRect(bx, by, 7, 8);
      // bottle end
      ctx.fillStyle = '#c4a35a';
      ctx.fillRect(bx, by + 3, 1, 2);
      ci++;
    }
  }
  save('wine-rack.png', c);
}

console.log('\nAll assets generated!');
