// Convert every PNG under `public/assets/` to a sibling `.webp` so
// the runtime can fetch the smaller format. Lossless WebP for pixel
// art so the visual stays identical (alpha + crisp edges); sharp's
// default quality settings on `lossless: true` typically save 25-50%
// vs PNG with no perceptible difference.
//
// Browsers we ship to (Safari 14+ via package.json browserslist,
// every modern Chrome/Edge/Firefox) all support WebP, so AssetLoader
// can swap URLs directly with no fallback. PNGs stay on disk for now
// — they're unused but easy to git-rm in a follow-up commit if we
// confirm WebP works everywhere.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TARGETS = [
  path.join(ROOT, 'public/assets/placeholder'),
  path.join(ROOT, 'public/assets/me-bundle'),
];
const TOP_LEVEL_FILES = [
  path.join(ROOT, 'public/assets/me-char-atlas.png'),
  path.join(ROOT, 'public/assets/tileset-1.png'),
  path.join(ROOT, 'public/assets/tileset-2.png'),
  path.join(ROOT, 'public/assets/tileset-3.png'),
  path.join(ROOT, 'public/assets/tileset-12.png'),
  path.join(ROOT, 'public/assets/tileset-14.png'),
];

function* walkPngs(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walkPngs(p);
    else if (ent.isFile() && p.toLowerCase().endsWith('.png')) yield p;
  }
}

let totalPng = 0;
let totalWebp = 0;
let skipped = 0;
let converted = 0;

async function convert(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp');
  // Skip if the .webp is already newer than the .png. Lets us re-run
  // freely without re-encoding 100s of unchanged sprites.
  if (fs.existsSync(webpPath)
   && fs.statSync(webpPath).mtimeMs >= fs.statSync(pngPath).mtimeMs) {
    skipped += 1;
    totalPng += fs.statSync(pngPath).size;
    totalWebp += fs.statSync(webpPath).size;
    return;
  }
  await sharp(pngPath).webp({ lossless: true, effort: 6 }).toFile(webpPath);
  converted += 1;
  totalPng += fs.statSync(pngPath).size;
  totalWebp += fs.statSync(webpPath).size;
}

const tasks = [];
for (const dir of TARGETS) {
  if (!fs.existsSync(dir)) continue;
  for (const p of walkPngs(dir)) tasks.push(p);
}
for (const f of TOP_LEVEL_FILES) {
  if (fs.existsSync(f)) tasks.push(f);
}

// Run with a small concurrency cap — sharp uses native threads, and
// 50 simultaneous jobs is enough to keep the cores busy without
// over-spawning libuv work.
const CONCURRENCY = 8;
let cursor = 0;
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < tasks.length) {
    const p = tasks[cursor++];
    await convert(p);
  }
});
await Promise.all(workers);

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`PNG total:   ${fmt(totalPng)}`);
console.log(`WebP total:  ${fmt(totalWebp)}  (${((totalWebp / totalPng) * 100).toFixed(1)}% of PNG)`);
console.log(`Converted:   ${converted}`);
console.log(`Skipped:     ${skipped}  (already up-to-date)`);
