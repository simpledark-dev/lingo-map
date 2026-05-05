import { SETTINGS_STORAGE_KEY } from './settings';
import { WORLD_SAVE_STORAGE_KEY } from './worldSave';
import { REWARD_PER_CORRECT_STORAGE_KEY } from './wallet';

/**
 * One-call full reset for the game. Wipes every localStorage key
 * the game owns + every per-pack vocab-progress entry, so the
 * next page load behaves like a brand-new save (cutscene plays,
 * quests inactive, wallet at the starter value, energy at the starter value, etc.).
 *
 * Centralised here so future persistence modules just have to add
 * their key to `STORAGE_KEYS` (or the `vocab-progress:` prefix
 * scan, if they want per-key cleanup) — the SettingsView Reset
 * button keeps working without further plumbing.
 */

/** Exact-match localStorage keys to remove. Kept in sync with the
 *  `STORAGE_KEY` constants in each persistence module. */
const STORAGE_KEYS = [
  'lingo-wallet:balance',
  'lingo-wallet:lifetime-earned',
  REWARD_PER_CORRECT_STORAGE_KEY,
  'lingo-inventory:v1',
  'lingo-energy:v1',
  'lingo-debt:v1',
  'lingo-event-flags:v1',
  'lingo-quests:v1',
  'lingo-quests:completion-order',
  'lingo-profile:v1',
  WORLD_SAVE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
];

/** Prefixes — every key that starts with one of these is removed.
 *  Used for vocab-progress (`vocab-progress:<packId>`) and any
 *  future per-instance namespaces. */
const STORAGE_PREFIXES = [
  'vocab-progress:',
  // editor map buffers — wiping them too means the editor reverts
  // to disk state, mirroring "fresh save" expectations.
  'editor-map:',
];

export function resetAllGameData(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    // Collect-then-delete so the iteration index doesn't skip
    // entries when localStorage shifts under us.
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (STORAGE_PREFIXES.some((p) => k.startsWith(p))) {
        toDelete.push(k);
      }
    }
    for (const k of toDelete) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Quota / private mode — silent; the page reload below will
    // still drop the in-memory state and the user can retry.
  }
}
