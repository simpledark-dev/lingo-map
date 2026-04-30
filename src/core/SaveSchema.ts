/**
 * Save-file schema versioning + the single parser every load site goes through.
 *
 * The bug class this prevents:
 *   The editor used to have FOUR copies of `if (!data?.tiles ...) reject`.
 *   When the schema migrated tiles into `layers[]`, the four copies fell
 *   out of sync one at a time, and each silently rejected new saves while
 *   their callers' "loaded" flags still flipped true — auto-save then
 *   wrote a compiled-map fallback over the user's real disk file.
 *
 * Mitigation:
 *   1. `SAVE_FORMAT_VERSION` is a single integer the writer stamps on every
 *      save. The reader inspects it and either accepts, migrates, or
 *      rejects with a typed error.
 *   2. `parseSavedMap` is the ONLY function callers should use to validate
 *      a candidate save. If it returns `ok: false`, the caller MUST NOT
 *      flip a "loaded" flag and MUST NOT auto-save — see EditorCanvas's
 *      load sites for the pattern.
 */
import type { Building, Entity, MapLayer, NPCData, SpawnPoint, Trigger } from './types';

/** Bumped whenever the on-disk save shape changes incompatibly. Bump this
 *  AND add a migration branch in `parseSavedMap` in the same commit, never
 *  separately. Don't reuse old numbers. */
export const SAVE_FORMAT_VERSION = 2;

/**
 * The shape we accept off the wire / off disk. Liberal in what it
 * tolerates — both the legacy flat layout (`tiles` + `objects`) and the
 * current `layers[]` layout pass. Versioning is metadata; absence
 * of the `version` field is treated as legacy (v1) for back-compat
 * with files that pre-date this scheme.
 */
export interface SavedMap {
  /** Bumped whenever the schema changes. Missing = pre-versioning (v1). */
  version?: number;
  id: string;
  width: number;
  height: number;
  tileSize?: number;
  /** Either `layers` (current) or `tiles` (legacy) must be present.
   *  Validators below enforce that — readers can rely on at least one. */
  layers?: MapLayer[];
  tiles?: string[][];
  objects?: Entity[];
  buildings?: Building[];
  npcs?: NPCData[];
  triggers?: Trigger[];
  spawnPoints?: SpawnPoint[];
}

export type ParseResult =
  | { ok: true; map: SavedMap; migrated: boolean }
  | { ok: false; error: string };

/**
 * Validate, version-check, and (if needed) migrate a raw parsed JSON
 * blob into a `SavedMap`. Single source of truth for every editor and
 * runtime load site — copy-paste of this logic is the bug we just paid
 * to fix.
 *
 * Contract:
 *   - On `ok: true`: caller MAY treat the map as valid and write to it.
 *   - On `ok: false`: caller MUST NOT auto-save anything back. The disk
 *     file may be intentionally older than the editor knows about (e.g.,
 *     came from a future version of the app), or genuinely broken; in
 *     both cases the safe action is to do nothing.
 *   - `migrated: true` indicates the returned map differs from the input
 *     because we ran a migration. Caller may want to immediately re-save
 *     so the new shape is on disk going forward, but that's optional.
 */
export function parseSavedMap(raw: unknown): ParseResult {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'save is not a JSON object' };
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !m.id) {
    return { ok: false, error: 'missing string id' };
  }
  if (typeof m.width !== 'number' || typeof m.height !== 'number'
   || m.width <= 0 || m.height <= 0) {
    return { ok: false, error: 'missing or invalid width/height' };
  }
  const hasLayers = Array.isArray(m.layers);
  const hasTiles = Array.isArray(m.tiles);
  if (!hasLayers && !hasTiles) {
    return { ok: false, error: 'save has neither `layers` nor `tiles` — no content to load' };
  }

  // Refuse anything from a future schema rather than silently truncating
  // its fields. Loud failure beats silent data loss.
  const version = typeof m.version === 'number' ? m.version : 1;
  if (version > SAVE_FORMAT_VERSION) {
    return {
      ok: false,
      error: `save version ${version} is newer than this app's ${SAVE_FORMAT_VERSION}; refusing to read`,
    };
  }

  // Migration ladder — step from version N to N+1 in order. Each step is
  // a no-op when the input is already at-or-above the target version.
  let map = m as unknown as SavedMap;
  let migrated = false;
  if (version < 2) {
    // v1 → v2: legacy save without `layers[]`. The runtime's
    // `normalizeMapData` already derives `layers` from `tiles + objects`
    // on the fly; we don't need to materialize it here. Readers that
    // need layers run normalization downstream. Just stamp the version.
    map = { ...map, version: 2 };
    migrated = true;
  }

  return { ok: true, map, migrated };
}

/**
 * Stamp an outgoing save with the current schema version. Use this when
 * writing to disk or localStorage so future loaders can route correctly.
 */
export function stampSaveVersion<T extends object>(map: T): T & { version: number } {
  return { ...map, version: SAVE_FORMAT_VERSION };
}
