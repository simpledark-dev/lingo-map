/**
 * Catalog of buyable / inventory items. Each item has a stable id,
 * a display name, an emoji icon (placeholder pixel-art comes later),
 * and a price in cents (matching the wallet's cents-as-int model).
 *
 * Kept tiny in slice 1 — sandwich is the only entry — so the shop
 * UI and inventory plumbing have something to render before we
 * widen the catalog.
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
  /** Short flavor line shown beneath the name in the shop list.
   *  Optional — items without one render with just the name. */
  description?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  sandwich: {
    id: 'sandwich',
    name: 'Sandwich',
    icon: '🥪',
    priceCents: 30,
    description: 'Soft bread, cheese, a slice of something. Lunchbox classic.',
  },
  onigiri: {
    id: 'onigiri',
    name: 'Onigiri',
    icon: '🍙',
    priceCents: 25,
    description: 'Triangle of warm rice with a salty surprise inside.',
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    icon: '🍎',
    priceCents: 12,
    description: 'Crisp, tart, polished on a sleeve before the bite.',
  },
  donut: {
    id: 'donut',
    name: 'Donut',
    icon: '🍩',
    priceCents: 18,
    description: 'Glazed ring of dubious nutritional value. Worth it.',
  },
  milk: {
    id: 'milk',
    name: 'Milk',
    icon: '🥛',
    priceCents: 20,
    description: 'Cold carton, slightly damp on the outside.',
  },
  cookie: {
    id: 'cookie',
    name: 'Cookie',
    icon: '🍪',
    priceCents: 8,
    description: 'Chocolate-chip. The cheap, reliable comfort.',
  },
};

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}

export const ALL_ITEM_IDS: readonly string[] = Object.keys(ITEMS);
