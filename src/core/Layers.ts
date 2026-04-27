import { MapData, MapLayer } from './types';
import { DEFAULT_LAYERS, LAYER_SORT_SPACING, PLAYER_LAYER_ID } from './constants';

/** Resolve a map's effective layer list. Maps may omit `layers`; in that
 * case we substitute a copy of the default 4-layer set. Always returns a
 * non-empty array so callers don't need null checks. */
export function getLayers(map: Pick<MapData, 'layers'>): MapLayer[] {
  if (map.layers && map.layers.length > 0) return map.layers;
  return DEFAULT_LAYERS.map(l => ({ id: l.id, name: l.name }));
}

/** Look up a layer's index in the map. Falls back to the index of the
 * `'props'` layer (the conventional home for entities), or 0 if neither
 * exists. Used by the renderer to compute effective z-index. */
export function getLayerIndex(layers: MapLayer[], layerId: string | undefined): number {
  if (layerId) {
    const idx = layers.findIndex(l => l.id === layerId);
    if (idx >= 0) return idx;
  }
  const propsIdx = layers.findIndex(l => l.id === PLAYER_LAYER_ID);
  if (propsIdx >= 0) return propsIdx;
  return 0;
}

/** Effective z-index for a sprite within the world container's
 * sortableChildren. Combines the layer's gross slot with the sprite's
 * fine-grained `sortY` (Y-sort within the layer). */
export function getEffectiveZIndex(layers: MapLayer[], layerId: string | undefined, sortY: number): number {
  return getLayerIndex(layers, layerId) * LAYER_SORT_SPACING + sortY;
}
