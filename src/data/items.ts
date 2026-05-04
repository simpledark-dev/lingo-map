/**
 * Catalog of buyable / inventory items. Each item has a stable id,
 * a display name, an emoji icon (placeholder pixel-art comes later),
 * and a price in cents (matching the wallet's cents-as-int model).
 *
 * Prices track approximate U.S. convenience/grocery-store reality
 * rather than the tiny vocab-reward loop. Learning rewards stay
 * intentionally small; food is a meaningful savings goal.
 */

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
  sandwich: {
    id: 'sandwich',
    name: 'Sandwich',
    icon: '🥪',
    priceCents: 599,
    energy: 10,
    description: 'Soft bread, cheese, a slice of something. Lunchbox classic.',
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

export const ALL_ITEM_IDS: readonly string[] = Object.keys(ITEMS);
