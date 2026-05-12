/**
 * Catalog of buyable / inventory items. Each item has a stable id,
 * a display name, an emoji icon (placeholder pixel-art comes later),
 * and a price in cents (matching the wallet's cents-as-int model).
 *
 * Prices track approximate U.S. convenience/grocery-store reality
 * rather than the tiny vocab-reward loop. Learning rewards stay
 * intentionally small; food is a meaningful savings goal.
 */

import { t } from './i18n';

export interface ItemDef {
  id: string;
  name: string;
  /** Emoji used as a placeholder icon until we ship pixel-art
   *  per item. Renders cleanly in the shop list and inventory at
   *  any reasonable font size. */
  icon: string;
  /** Price in cents — same unit as the wallet (`addBalance(-price)`
   *  works directly). Free items can use 0; the shop UI hides the
   *  buy button on those by convention. */
  priceCents: number;
  /** Energy restored when the player eats this item from inventory.
   *  Energy is gameplay stamina; price is the real-world-ish economy
   *  sink. They are not kept at a fixed cents-per-energy ratio.
   *  Items without an energy value (e.g. future quest-only items)
   *  can omit this; the inventory UI hides the Eat button on those. */
  energy?: number;
  /** Short flavor line shown beneath the name in the shop list.
   *  Optional — items without one render with just the name. */
  description?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  bread: {
    id: 'bread',
    name: 'Bread',
    icon: '🍞',
    priceCents: 299,
    energy: 10,
    description: 'Fresh loaf from the Mart. Simple, filling, dependable.',
  },
  onigiri: {
    id: 'onigiri',
    name: 'Onigiri',
    icon: '🍙',
    priceCents: 299,
    energy: 8,
    description: 'Triangle of warm rice with a salty surprise inside.',
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    icon: '🍎',
    priceCents: 99,
    energy: 4,
    description: 'Crisp, tart, polished on a sleeve before the bite.',
  },
  donut: {
    id: 'donut',
    name: 'Donut',
    icon: '🍩',
    priceCents: 149,
    energy: 6,
    description: 'Glazed ring of dubious nutritional value. Worth it.',
  },
  milk: {
    id: 'milk',
    name: 'Milk',
    icon: '🥛',
    priceCents: 199,
    energy: 7,
    description: 'Cold carton, slightly damp on the outside.',
  },
  cookie: {
    id: 'cookie',
    name: 'Cookie',
    icon: '🍪',
    priceCents: 125,
    energy: 3,
    description: 'Chocolate-chip. The cheap, reliable comfort.',
  },
};

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}

/** Locale-aware display name for an item. The static `name` field
 *  on the def is the English fallback; this helper looks up the
 *  current locale's translation via the `item.<id>.name` key. */
export function getItemName(id: string): string {
  const def = ITEMS[id];
  if (!def) return id;
  // t() falls back to English for keys without a translation, then
  // to the key itself if even English is missing — so a forgotten
  // item key surfaces in dev rather than going invisible.
  const translated = t(`item.${id}.name`);
  // If the key wasn't in either locale, t() returns the raw key —
  // catch that and fall back to the def's static name.
  return translated.startsWith('item.') ? def.name : translated;
}

export function getItemDescription(id: string): string | undefined {
  const def = ITEMS[id];
  if (!def?.description) return def?.description;
  const translated = t(`item.${id}.description`);
  return translated.startsWith('item.') ? def.description : translated;
}

export const ALL_ITEM_IDS: readonly string[] = Object.keys(ITEMS);
