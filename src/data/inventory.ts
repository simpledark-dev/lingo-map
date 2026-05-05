/**
 * Persistent player inventory — survives reloads, syncs across views.
 *
 * Mirror of `wallet.ts`'s pattern: localStorage-backed, module-level
 * cache with a tiny pub/sub so non-React callers (shop modal,
 * dialogue handlers) can mutate too. Stored as `Record<itemId, count>`
 * in JSON; missing items are treated as count 0.
 *
 * No item-stack cap — the wallet acts as the natural ceiling. The
 * `consume` path returns false when count is 0 so callers can branch
 * without pre-checking.
 */
import { useEffect, useState } from 'react';
import { getItem } from './items';
import { restoreEnergy } from './energy';
import { completeQuest, getQuestStatus } from './quests';

const STORAGE_KEY = 'lingo-inventory:v1';

export type InventoryMap = Record<string, number>;

type Listener = (inv: InventoryMap) => void;
const listeners = new Set<Listener>();
let cached: InventoryMap | null = null;

function read(): InventoryMap {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') {
    cached = {};
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = {};
      return cached;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      cached = {};
      return cached;
    }
    // Coerce: drop non-numeric / negative counts. Missing → omitted.
    const cleaned: InventoryMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        cleaned[k] = Math.floor(v);
      }
    }
    cached = cleaned;
  } catch {
    cached = {};
  }
  return cached;
}

function write(value: InventoryMap): void {
  cached = value;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Quota / private mode — silent. In-memory cache still drives
    // this session.
  }
}

function emit(): void {
  const snapshot = { ...read() };
  for (const l of listeners) l(snapshot);
}

export function getInventory(): InventoryMap {
  return { ...read() };
}

export function getItemCount(id: string): number {
  return read()[id] ?? 0;
}

export function hasItem(id: string): boolean {
  return getItemCount(id) > 0;
}

/** Add `count` of `id` to the inventory. Defaults to 1. */
export function addItem(id: string, count = 1): void {
  if (count <= 0) return;
  const current = read();
  const next: InventoryMap = { ...current, [id]: (current[id] ?? 0) + count };
  write(next);
  emit();
}

/** Remove `count` of `id` if available. Returns true on success,
 *  false if the player didn't have enough. Atomic — no partial
 *  consumption. */
export function consumeItem(id: string, count = 1): boolean {
  if (count <= 0) return true;
  const current = read();
  const have = current[id] ?? 0;
  if (have < count) return false;
  const remaining = have - count;
  const next: InventoryMap = { ...current };
  if (remaining > 0) next[id] = remaining;
  else delete next[id];
  write(next);
  emit();
  return true;
}

/** Eat one of the item: removes it from inventory and restores
 *  energy by the item's `energy` value. Returns true on success,
 *  false if the player didn't have the item or it isn't edible
 *  (no `energy` field — quest-only items, future tools, etc.).
 *  The two state mutations are independent (consume + restore) so
 *  a hypothetical mid-call energy module failure can't leave the
 *  player short an item with no benefit; consume is checked first. */
export function eatItem(id: string): boolean {
  const def = getItem(id);
  if (!def || !def.energy || def.energy <= 0) return false;
  if (!consumeItem(id, 1)) return false;
  restoreEnergy(def.energy);
  // Tutorial — eating during the eat-quest closes it. Importing
  // the quest module here is safe: quests.ts doesn't import
  // inventory, so no cycle.
  if (getQuestStatus('tutorial-eat') === 'active') {
    completeQuest('tutorial-eat');
  }
  return true;
}

export function subscribeInventory(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — returns the live inventory snapshot and re-renders
 *  on change. */
export function useInventory(): InventoryMap {
  const [inv, setInv] = useState<InventoryMap>(() => getInventory());
  useEffect(() => {
    setInv(getInventory());
    return subscribeInventory(setInv);
  }, []);
  return inv;
}
