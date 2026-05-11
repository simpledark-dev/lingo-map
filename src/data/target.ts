/**
 * Target language — the language the player is LEARNING. Distinct
 * from native locale (the language the UI is in), and from the
 * native-language meaning shown beside each target word.
 *
 * Three valid values for now:
 *   - `lingo`   the fake constructed language used during early
 *               testing (mira, grano, solpi, …). Default for any
 *               save that pre-dates this module.
 *   - `french`  real French, for native-vi or native-en testers.
 *   - `english` real English, for native-vi testers.
 *
 * Architecture mirrors `i18n.ts` exactly:
 *   – Module-level cache + listener set so non-React callers
 *     (vocabularyPacks.getVocabularyPack, etc.) can read sync.
 *   – `useTarget()` is the React subscription hook.
 *   – `hasPickedTarget` / `markTargetPicked` gate the boot-time
 *     picker so returning players skip it.
 *
 * The picker UI is responsible for filtering invalid combos
 * (target === native is meaningless, so the picker hides the
 * locale matching the active native language).
 */
import { useEffect, useState } from 'react';

export type TargetLanguage = 'lingo' | 'french' | 'english';

export const TARGET_LANGUAGES: ReadonlyArray<TargetLanguage> = [
  'lingo',
  'french',
  'english',
];

export const TARGET_STORAGE_KEY = 'lingo-target';
export const TARGET_PICKED_STORAGE_KEY = 'lingo-target:picked';

const DEFAULT_TARGET: TargetLanguage = 'lingo';

type Listener = (target: TargetLanguage) => void;
const listeners = new Set<Listener>();
let cached: TargetLanguage | null = null;

function isTarget(value: unknown): value is TargetLanguage {
  return (
    typeof value === 'string' &&
    (TARGET_LANGUAGES as readonly string[]).includes(value)
  );
}

export function getTarget(): TargetLanguage {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return DEFAULT_TARGET;
  try {
    const raw = window.localStorage.getItem(TARGET_STORAGE_KEY);
    cached = isTarget(raw) ? raw : DEFAULT_TARGET;
  } catch {
    cached = DEFAULT_TARGET;
  }
  return cached;
}

export function setTarget(next: TargetLanguage): void {
  if (!isTarget(next)) return;
  if (cached === next) return;
  cached = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(TARGET_STORAGE_KEY, next);
    } catch {
      /* quota / private mode — keep the in-memory cache only */
    }
  }
  for (const listener of listeners) listener(next);
}

export function hasPickedTarget(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TARGET_PICKED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTargetPicked(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TARGET_PICKED_STORAGE_KEY, '1');
  } catch {
    /* silent */
  }
}

export function clearTargetPicked(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TARGET_PICKED_STORAGE_KEY);
  } catch {
    /* silent */
  }
}

export function subscribeTarget(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTarget(): TargetLanguage {
  const [t, setT] = useState<TargetLanguage>(() => getTarget());
  useEffect(() => {
    setT(getTarget());
    return subscribeTarget(setT);
  }, []);
  return t;
}
