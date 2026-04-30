#!/usr/bin/env node
/**
 * Round-trip test for the editor save/load schema.
 *
 * The bug class this catches:
 *   When a load filter rejects a valid file silently, the editor
 *   would still mark itself as "loaded" and overwrite the disk file
 *   with its own (compiled-map fallback) state on the next autosave.
 *   That destroyed user data on every editor open. We didn't notice
 *   for days because no error fires anywhere along the path.
 *
 * What this checks:
 *   For every committed map JSON in `data/`, run the schema parser
 *   from `src/core/SaveSchema.ts` against it. A parser rejection here
 *   means a future editor open of the same file would silently fail
 *   to load, putting the file at risk of being clobbered by the
 *   editor's autosave — exactly the failure mode we just fixed.
 *
 * Run:
 *   node scripts/test-map-roundtrip.mjs
 *
 * Exit code:
 *   0 → all map files parse cleanly
 *   1 → at least one file failed; details on stderr
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');

// Inlined copy of the parser shape so we don't need to compile the
// TypeScript module. Keep this in sync with `src/core/SaveSchema.ts`
// — any change to the parser there should be reflected here.
const SAVE_FORMAT_VERSION = 2;

function parseSavedMap(raw) {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'save is not a JSON object' };
  }
  if (typeof raw.id !== 'string' || !raw.id) {
    return { ok: false, error: 'missing string id' };
  }
  if (typeof raw.width !== 'number' || typeof raw.height !== 'number'
   || raw.width <= 0 || raw.height <= 0) {
    return { ok: false, error: 'missing or invalid width/height' };
  }
  const hasLayers = Array.isArray(raw.layers);
  const hasTiles = Array.isArray(raw.tiles);
  if (!hasLayers && !hasTiles) {
    return { ok: false, error: 'no `layers` or `tiles`' };
  }
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > SAVE_FORMAT_VERSION) {
    return { ok: false, error: `version ${version} is newer than supported ${SAVE_FORMAT_VERSION}` };
  }
  return { ok: true };
}

let failures = 0;
let scanned = 0;
const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
for (const f of files) {
  scanned += 1;
  let raw;
  try {
    raw = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'));
  } catch (e) {
    console.error(`✗ ${f}: not valid JSON (${e.message})`);
    failures += 1;
    continue;
  }
  // Skip non-map fixtures (e.g. data/car-collisions.json)
  if (typeof raw?.id !== 'string' || typeof raw?.width !== 'number') {
    console.log(`· ${f}: skipped (not a map file)`);
    continue;
  }
  const result = parseSavedMap(raw);
  if (!result.ok) {
    console.error(`✗ ${f}: parser rejects — ${result.error}`);
    console.error('  → the editor would silently drop this file on open and could overwrite it on autosave');
    failures += 1;
  } else {
    console.log(`✓ ${f}: loads cleanly (${raw.layers ? `${raw.layers.length} layers` : 'legacy tiles'}, version=${raw.version ?? 1})`);
  }
}

console.log(`\n${scanned} file(s) scanned, ${failures} failure(s)`);
if (failures > 0) process.exit(1);
