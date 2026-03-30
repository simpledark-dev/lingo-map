import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');
mkdirSync(OUT, { recursive: true });

function generateIcon(size, filename) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  // Dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);

  // Draw a simple pixel-art character (the player) centered
  const scale = Math.floor(size / 48);
  const ox = Math.floor((size - 32 * scale) / 2);
  const oy = Math.floor((size - 48 * scale) / 2);

  // Head
  ctx.fillStyle = '#f5c6a0';
  ctx.fillRect(ox + 8 * scale, oy + 0 * scale, 16 * scale, 16 * scale);

  // Body
  ctx.fillStyle = '#3a7bd5';
  ctx.fillRect(ox + 4 * scale, oy + 8 * scale, 24 * scale, 32 * scale);

  // Feet
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(ox + 6 * scale, oy + 40 * scale, 8 * scale, 8 * scale);
  ctx.fillRect(ox + 18 * scale, oy + 40 * scale, 8 * scale, 8 * scale);

  writeFileSync(join(OUT, filename), c.toBuffer('image/png'));
  console.log(`  ✓ ${filename} (${size}x${size})`);
}

console.log('PWA Icons:');
generateIcon(192, 'icon-192.png');
generateIcon(512, 'icon-512.png');
generateIcon(180, 'apple-touch-icon.png');

console.log('\nDone!');
