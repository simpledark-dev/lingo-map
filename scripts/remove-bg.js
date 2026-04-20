#!/usr/bin/env node
// Remove a solid background from a PNG by sampling the corner color and
// replacing matching pixels (within a tolerance) with full transparency.
//
// Usage: node scripts/remove-bg.js <input.png> [output.png] [--tolerance N]
// Default: overwrites input file. Tolerance default: 20.

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node remove-bg.js <input.png> [output.png] [--tolerance N]');
    process.exit(1);
  }

  const toleranceIdx = args.indexOf('--tolerance');
  const tolerance = toleranceIdx >= 0 ? parseInt(args[toleranceIdx + 1]) : 20;
  const fileArgs = args.filter((a, i) => a !== '--tolerance' && args[i - 1] !== '--tolerance');

  const inputPath = path.resolve(fileArgs[0]);
  const outputPath = path.resolve(fileArgs[1] ?? inputPath);

  const img = await loadImage(inputPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const px = imageData.data;

  // Sample the top-left corner as the background color
  const bgR = px[0];
  const bgG = px[1];
  const bgB = px[2];
  console.log(`Background color sampled: rgb(${bgR}, ${bgG}, ${bgB})`);
  console.log(`Tolerance: ±${tolerance}`);

  let changed = 0;
  for (let i = 0; i < px.length; i += 4) {
    const dr = Math.abs(px[i] - bgR);
    const dg = Math.abs(px[i + 1] - bgG);
    const db = Math.abs(px[i + 2] - bgB);
    if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
      px[i + 3] = 0; // set alpha to 0
      changed++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Removed ${changed} pixels. Wrote ${outputPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
