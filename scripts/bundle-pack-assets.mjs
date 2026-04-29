#!/usr/bin/env node
/**
 * Walk every place that can reference a Modern Exteriors pack single
 * (data/*.json plus the hardcoded list in src/core/CarSystem.ts), copy
 * just those PNGs into `public/assets/me-bundle/`, and let the rest of
 * the gitignored pack stay outside the repo.
 *
 * Run before deploying when new pack references show up. CI/Vercel
 * builds use the bundle folder via NEXT_PUBLIC_PACK_BASE_URL; local
 * dev keeps the symlinked full pack at public/assets/me/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PACK = path.join(ROOT, 'public/assets/me');
const DEST = path.join(ROOT, 'public/assets/me-bundle');

const keys = new Set();

// 1) Every "me:..." string anywhere in the saved map JSONs (tile grids
//    use them as cell values; objects use them as spriteKey).
function walkValue(v, visit) {
  visit(v);
  if (Array.isArray(v)) for (const item of v) walkValue(item, visit);
  else if (v && typeof v === 'object') for (const item of Object.values(v)) walkValue(item, visit);
}
const dataDir = path.join(ROOT, 'data');
for (const f of fs.readdirSync(dataDir)) {
  if (!f.endsWith('.json')) continue;
  const obj = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  walkValue(obj, (v) => {
    if (typeof v === 'string' && v.startsWith('me:')) keys.add(v);
  });
}

// 2) CAR_SPRITE_SETS in src/core/CarSystem.ts builds keys via template
//    literal `me:.../Car_${dir}_${n}`, which a plain regex over the
//    source can't expand. Read just the index array out of the file
//    and reconstruct the four-direction sprite set per index.
const carSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/CarSystem.ts'), 'utf8');
const idxMatch = carSystemSrc.match(/CAR_SPRITE_SETS[\s\S]*?\[([\s\S]*?)\]\s*\.map/);
if (idxMatch) {
  const carIndices = (idxMatch[1].match(/\d+/g) ?? []).map(Number);
  for (const n of carIndices) {
    for (const dir of ['Up', 'Down', 'Right', 'Left']) {
      keys.add(`me:10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Car_${dir}_${n}`);
    }
  }
} else {
  console.warn('Could not parse CAR_SPRITE_SETS indices from CarSystem.ts — car art may be missing in the bundle.');
}

// 3) Copy each key's PNG from the source pack into the bundle. Wipe
//    the destination first so removed references don't leave stale
//    files in the committed folder.
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
let copied = 0, missing = 0;
const missingKeys = [];
for (const key of keys) {
  const rel = `${key.slice(3)}.png`; // strip "me:" prefix
  const src = path.join(SRC_PACK, rel);
  const dest = path.join(DEST, rel);
  if (!fs.existsSync(src)) {
    missingKeys.push(rel);
    missing++;
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied++;
}

console.log(`Bundled ${copied} pack asset${copied === 1 ? '' : 's'} into public/assets/me-bundle/`);
if (missing > 0) {
  console.warn(`${missing} reference${missing === 1 ? '' : 's'} had no source file:`);
  for (const k of missingKeys) console.warn(`  - ${k}`);
}
