#!/usr/bin/env node
/**
 * Walk every place a placeholder sprite key can be referenced
 * (data/*.json + src/**\/*.ts), compare against the keys registered in
 * spriteManifest, and print the dead ones plus the orphaned PNG files
 * not registered at all. Read-only — does NOT delete.
 *
 * Notes on false-positive avoidance:
 *  - Some keys are constructed via template literals (e.g.
 *    `player-${dir}-walk1`). To not flag those as dead, we also count
 *    a key as referenced if its dash-separated prefix appears in code
 *    (e.g. `player-up` is "covered" by any `player-` substring match).
 *  - TileType enum values are STRING enums whose value matches the
 *    manifest key (e.g. TileType.GRASS = 'grass'), so a search for the
 *    literal 'grass' in code finds them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER_DIR = path.join(ROOT, 'public/assets/placeholder');
const ASSET_LOADER = path.join(ROOT, 'src/renderer/AssetLoader.ts');

// ── Extract registered keys from spriteManifest ──
// Matches each `'key': '...'` or `[TileType.X]: '...'` line.
const loaderSrc = fs.readFileSync(ASSET_LOADER, 'utf8');
const manifestStart = loaderSrc.indexOf('const spriteManifest');
const manifestEnd = loaderSrc.indexOf('};', manifestStart);
const manifestBlock = loaderSrc.slice(manifestStart, manifestEnd);
const registered = new Set();
for (const m of manifestBlock.matchAll(/['"]([\w-]+)['"]\s*:\s*[`'"]/g)) {
  registered.add(m[1]);
}
// TileType.X resolves to a string value — pull the literal value from
// types.ts so we count `'grass'` etc. without manually mirroring.
const TYPES = path.join(ROOT, 'src/core/types.ts');
const typesSrc = fs.readFileSync(TYPES, 'utf8');
const tileTypeBlock = typesSrc.match(/export enum TileType[\s\S]*?\}/);
if (tileTypeBlock) {
  for (const m of tileTypeBlock[0].matchAll(/=\s*['"]([\w-]+)['"]/g)) {
    registered.add(m[1]);
  }
}

// ── Build the corpus to search ──
const corpus = [];
function walk(dir, exts) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
    const full = path.join(dir, f.name);
    if (f.isDirectory()) { walk(full, exts); continue; }
    if (!exts.some(e => f.name.endsWith(e))) continue;
    let content = fs.readFileSync(full, 'utf8');
    // Strip AssetLoader's spriteManifest block so its self-declarations
    // don't mask real dead entries — but KEEP the rest of the file so
    // helper functions that reference keys (e.g., the FLOOR_PATTERN
    // quadrant picker on lines 341-342) are still scanned.
    if (full === ASSET_LOADER) {
      const start = content.indexOf('const spriteManifest');
      if (start >= 0) {
        const end = content.indexOf('};', start);
        if (end > start) content = content.slice(0, start) + content.slice(end + 2);
      }
    }
    corpus.push(content);
  }
}
walk(path.join(ROOT, 'src'), ['.ts', '.tsx']);
walk(path.join(ROOT, 'data'), ['.json']);
const haystack = corpus.join('\n');

// ── Detect template-literal patterns that compose keys at runtime ──
// Without this, keys like `player-left-walk1` look dead because the
// source uses `player-${dir}-walk1`. We grep for these patterns and
// expand them into the concrete key set they cover.
const COMPOSED_PATTERNS = [
  // `player-${dir}` and `player-${dir}-walkN`
  { re: /`player-\$\{dir\}([-\w]*)`/g, expand: (suffix) => ['up', 'down', 'left', 'right'].map(d => `player-${d}${suffix}`) },
  // `car-${dir}` (used by the older fallback before pack singles)
  { re: /`car-\$\{dir\}`/g, expand: () => ['up', 'down', 'left', 'right'].map(d => `car-${d}`) },
];
const composed = new Set();
for (const { re, expand } of COMPOSED_PATTERNS) {
  for (const m of haystack.matchAll(re)) {
    const suffix = m[1] ?? '';
    for (const k of expand(suffix)) composed.add(k);
  }
}

// ── Decide referenced vs. dead ──
const referenced = new Set();
for (const key of registered) {
  if (composed.has(key)) { referenced.add(key); continue; }
  // Direct literal — surrounded by quote, slash, or word boundary.
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`['"\`/]${escaped}['"\`/-]`).test(haystack);
  if (direct) { referenced.add(key); continue; }
}
const dead = [...registered].filter(k => !referenced.has(k)).sort();

// ── Orphan PNGs (files in placeholder/ not registered in manifest) ──
const onDisk = fs.readdirSync(PLACEHOLDER_DIR)
  .filter(f => f.endsWith('.png'))
  .map(f => f.slice(0, -4));
const orphans = onDisk.filter(f => !registered.has(f)).sort();

console.log(`spriteManifest entries: ${registered.size}`);
console.log(`  referenced: ${referenced.size}`);
console.log(`  DEAD (registered but no reference found): ${dead.length}`);
for (const k of dead) {
  const p = path.join(PLACEHOLDER_DIR, `${k}.png`);
  const sz = fs.existsSync(p) ? `${(fs.statSync(p).size / 1024).toFixed(0)} KB` : 'no file';
  console.log(`    - ${k}  [${sz}]`);
}
console.log('');
console.log(`PNG files on disk: ${onDisk.length}`);
console.log(`  ORPHANS (file exists, not in manifest): ${orphans.length}`);
for (const k of orphans) {
  const sz = (fs.statSync(path.join(PLACEHOLDER_DIR, `${k}.png`)).size / 1024).toFixed(0);
  console.log(`    - ${k}.png  [${sz} KB]`);
}
