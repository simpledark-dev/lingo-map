import { Entity, Layer, MapData, MapLayer, ObjectLayer, TileLayer } from './types';
import { DEFAULT_LAYERS, LAYER_SORT_SPACING, PLAYER_LAYER_ID } from './constants';

/** Resolve a map's effective layer list. Maps may omit `layers`; in that
 * case we substitute a copy of the default 4-layer set. Always returns a
 * non-empty array so callers don't need null checks. */
export function getLayers(map: Pick<MapData, 'layers'>): MapLayer[] {
  if (map.layers && map.layers.length > 0) return map.layers;
  return DEFAULT_LAYERS.map(l => ({ id: l.id, name: l.name }));
}

/** Type-narrowing guard. */
export function isTileLayer(l: Layer): l is TileLayer {
  return l.kind === 'tile';
}

/** Type-narrowing guard. */
export function isObjectLayer(l: Layer): l is ObjectLayer {
  return l.kind === 'object';
}

/** Tile layers in render order. Always non-empty after `normalizeMapData`. */
export function getTileLayers(map: Pick<MapData, 'layers'>): TileLayer[] {
  return (map.layers ?? []).filter(isTileLayer);
}

/** Object layers in render order. */
export function getObjectLayers(map: Pick<MapData, 'layers'>): ObjectLayer[] {
  return (map.layers ?? []).filter(isObjectLayer);
}

/** First tile layer — the one autotile/transition systems anchor to.
 * Returns undefined if no tile layers exist (shouldn't happen after
 * normalize, but callers should still guard). */
export function getPrimaryTileLayer(map: Pick<MapData, 'layers'>): TileLayer | undefined {
  return (map.layers ?? []).find(isTileLayer);
}

/** Ensure a `MapData` has both the new `layers` field AND legacy `tiles` /
 * `objects` arrays populated. The runtime renderer + collision systems still
 * read `tiles`/`objects` during the transition; the editor and new code read
 * `layers`. This bridge keeps both views consistent.
 *
 * Resolution rules:
 * 1. If `layers` is present, derive `tiles` (from the FIRST tile layer) and
 *    `objects` (concat of every object layer's objects, with `entity.layer`
 *    filled in if missing).
 * 2. Otherwise, treat the map as legacy: synthesize a 2-layer stack
 *    [GroundTileLayer(map.tiles), PropsObjectLayer(map.objects)] so new
 *    code reading `layers` sees something sensible.
 *
 * Mutates the passed map object in place AND returns it for chainable use.
 * Idempotent — calling it twice is a no-op. */
export function normalizeMapData(map: MapData): MapData {
  if (map.layers && map.layers.length > 0) {
    // Forward sync: derive tiles/objects from layers.
    const firstTileLayer = map.layers.find(isTileLayer);
    if (!map.tiles || map.tiles.length === 0) {
      map.tiles = firstTileLayer ? firstTileLayer.tiles : emptyTileGrid(map.width, map.height);
    }
    const allObjects: Entity[] = [];
    for (const l of map.layers) {
      if (!isObjectLayer(l)) continue;
      for (const o of l.objects) {
        // Tag entity with its owning layer if not already set, so render
        // z-sort sees the right slot.
        allObjects.push(o.layer ? o : { ...o, layer: l.id });
      }
    }
    if (!map.objects || map.objects.length === 0) {
      map.objects = allObjects;
    }
    return map;
  }
  // Legacy → synthesize layers from tiles + objects so new readers see them.
  const tiles = map.tiles ?? emptyTileGrid(map.width, map.height);
  const groundLayer: TileLayer = { id: 'ground', name: 'Ground', kind: 'tile', tiles };
  const propsLayer: ObjectLayer = { id: PLAYER_LAYER_ID, name: 'Props', kind: 'object', objects: map.objects ?? [] };
  map.layers = [groundLayer, propsLayer];
  if (!map.tiles) map.tiles = tiles;
  if (!map.objects) map.objects = propsLayer.objects;
  return map;
}

function emptyTileGrid(width: number, height: number): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    for (let c = 0; c < width; c++) row.push('');
    out.push(row);
  }
  return out;
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
