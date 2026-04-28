import { TileType, Entity, Building, CollisionBox, Layer, MapLayer, TileLayer } from '../core/types';
import { PLAYER_LAYER_ID } from '../core/constants';
import { isObjectLayer, isTileLayer } from '../core/Layers';

// ── State ──

export interface EditorState {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  buildings: Building[];

  activeTool: 'tile' | 'object' | 'building' | 'select' | 'eraser' | 'area-erase' | 'area-select';
  selectedTileType: string;
  selectedObjectKey: string | null;
  selectedBuildingKey: string | null;
  /** Currently-selected entity IDs (objects or building). Plural so users can
   * shift-click to build up a multi-selection and group-move them. Length
   * 0 = nothing selected. Length 1 = single selection (scale UI shows).
   * Length 2+ = multi-selection (scale UI hidden, group operations only). */
  selectedObjectIds: string[];

  showGrid: boolean;
  zoom: number;
  cameraX: number;
  cameraY: number;

  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  mapName: string;

  /** Source-of-truth ordered layer list. Each entry carries either a tile
   * grid (TileLayer) or an entity list (ObjectLayer). Index 0 renders first
   * (bottom). Layers also hold editor-only `visible`/`locked` flags. */
  layers: Layer[];
  /** ID of the currently-active layer; new entities are stamped with this. */
  activeLayerId: string;

  /** Currently-selected rectangle (in tile cells) for the Area Select tool.
   * Null when no selection is active. Persists across other tool uses so the
   * user can drag-move it from inside, then keep editing elsewhere. */
  selectionArea: { row1: number; col1: number; row2: number; col2: number } | null;
}

interface UndoEntry {
  type: string;
  data: unknown;
}

/** Editor-side default layer set. The leading `ground` tile layer carries
 * the world tile grid; the four object layers (floor/decor-low/props/above)
 * stack the gameplay entities above it. Distinct from `core/constants`'s
 * `DEFAULT_LAYERS` which is metadata-only and still used by the legacy
 * normalize fallback. */
function defaultLayers(width: number, height: number): Layer[] {
  return [
    { id: 'ground', name: 'Ground', kind: 'tile', visible: true, locked: false, tiles: emptyTileGrid(width, height, TileType.GRASS) },
    { id: 'floor', name: 'Floor', kind: 'object', visible: true, locked: false, objects: [] },
    { id: 'decor-low', name: 'Decor', kind: 'object', visible: true, locked: false, objects: [] },
    { id: 'props', name: 'Props', kind: 'object', visible: true, locked: false, objects: [] },
    { id: 'above', name: 'Above', kind: 'object', visible: true, locked: false, objects: [] },
  ];
}

function emptyTileGrid(width: number, height: number, fill: string = ''): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    for (let c = 0; c < width; c++) row.push(fill);
    out.push(row);
  }
  return out;
}

export function createInitialState(width = 50, height = 50): EditorState {
  return {
    mapWidth: width,
    mapHeight: height,
    tileSize: 16,
    buildings: [],
    activeTool: 'tile',
    selectedTileType: TileType.DIRT,
    selectedObjectKey: null,
    selectedBuildingKey: null,
    selectedObjectIds: [],
    showGrid: false,
    zoom: 2,
    cameraX: 0,
    cameraY: 0,
    undoStack: [],
    redoStack: [],
    mapName: 'custom-map',
    layers: defaultLayers(width, height),
    activeLayerId: PLAYER_LAYER_ID,
    selectionArea: null,
  };
}

// ── Selectors (read-side helpers) ──
//
// The reducer operates on `state.layers` directly. Read sites use these
// helpers to recover the legacy flat shape used by rendering, save/load,
// and selection / hit-testing.

/** First tile layer in the stack. The transition + auto-tileset systems
 * anchor here. Returns undefined if the editor somehow has no tile layer
 * (e.g. user deleted Ground); call sites should guard. */
export function getPrimaryTileLayer(state: EditorState): TileLayer | undefined {
  return state.layers.find(isTileLayer);
}

/** Tile grid for transitions/auto-tile/legacy save format (primary tile
 * layer's grid; empty grid if there is no tile layer). Returns the live
 * reference — do not mutate. */
export function getPrimaryTiles(state: EditorState): string[][] {
  const primary = getActiveTileLayer(state);
  return primary?.tiles ?? emptyTileGrid(state.mapWidth, state.mapHeight, '');
}

/** Concat of every object layer's objects, with `entity.layer` filled in
 * to match its owning layer. Used for selection / save / render-side
 * compatibility with code that expects a flat objects[]. */
export function getAllObjects(state: EditorState): Entity[] {
  const out: Entity[] = [];
  for (const l of state.layers) {
    if (!isObjectLayer(l)) continue;
    for (const o of l.objects) {
      out.push(o.layer === l.id ? o : { ...o, layer: l.id });
    }
  }
  return out;
}

/** First object layer (used as a safe fallback when an entity references a
 * layer that doesn't exist or has the wrong kind). */
function getDefaultObjectLayerId(state: EditorState): string {
  const objLayer = state.layers.find(isObjectLayer);
  return objLayer?.id ?? PLAYER_LAYER_ID;
}

/** Resolve which tile layer paint/erase actions should target. Returns the
 * active layer if it's a tile layer, else the first tile layer in the
 * stack ('Ground' by default). Returned `undefined` only if no tile layer
 * exists at all (caller should guard). */
export function getActiveTileLayer(state: EditorState): TileLayer | undefined {
  const active = state.layers.find(l => l.id === state.activeLayerId);
  if (active && isTileLayer(active)) return active;
  return state.layers.find(isTileLayer);
}

/** Tile grid for the layer that paint actions currently target. Used by
 * the editor's live paint preview cache so single-cell strokes update the
 * right grid. */
export function getActiveTiles(state: EditorState): string[][] {
  const layer = getActiveTileLayer(state);
  return layer?.tiles ?? emptyTileGrid(state.mapWidth, state.mapHeight, '');
}

// ── Actions ──

export type EditorAction =
  | { type: 'SET_TILE'; row: number; col: number; tileType: string }
  | { type: 'PAINT_TILES'; cells: { row: number; col: number }[]; tileType: string }
  | { type: 'CLEAR_AREA'; row1: number; col1: number; row2: number; col2: number }
  | { type: 'SET_SELECTION_AREA'; area: { row1: number; col1: number; row2: number; col2: number } | null }
  | { type: 'MOVE_AREA'; sourceArea: { row1: number; col1: number; row2: number; col2: number }; dRow: number; dCol: number }
  | { type: 'PLACE_OBJECT'; entity: Entity }
  | { type: 'DELETE_OBJECT'; id: string }
  | { type: 'PLACE_BUILDING'; building: Building }
  | { type: 'DELETE_BUILDING'; id: string }
  | { type: 'SELECT_OBJECT'; id: string | null }
  | { type: 'TOGGLE_SELECT_OBJECT'; id: string }
  | { type: 'SET_OBJECTS_LAYER'; ids: string[]; layerId: string }
  | { type: 'SET_OBJECT_SCALE'; id: string; scale: number }
  | { type: 'SET_OBJECT_COLLISION'; id: string; box: CollisionBox }
  | { type: 'SET_OBJECT_TRANSITION'; id: string; transition: NonNullable<Entity['transition']> | null }
  | { type: 'SET_BUILDING_SCALE'; id: string; scale: number }
  | { type: 'MOVE_OBJECT'; id: string; x: number; y: number }
  | { type: 'MOVE_OBJECTS'; positions: Array<{ id: string; x: number; y: number }>; dragId: string }
  | { type: 'MOVE_BUILDING'; id: string; x: number; y: number }
  | { type: 'SET_TOOL'; tool: EditorState['activeTool'] }
  | { type: 'SET_SELECTED_TILE'; tileType: string }
  | { type: 'SET_SELECTED_OBJECT'; spriteKey: string }
  | { type: 'SET_SELECTED_BUILDING'; buildingKey: string }
  | { type: 'SET_CAMERA'; x: number; y: number }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_TILE_SIZE'; tileSize: number }
  | { type: 'SET_MAP_NAME'; name: string }
  | { type: 'RESIZE_MAP'; width: number; height: number; anchor?: { dRow: number; dCol: number } }
  | { type: 'IMPORT_MAP'; tiles: string[][]; objects: Entity[]; buildings: Building[]; width: number; height: number; layers?: MapLayer[] | Layer[] }
  | { type: 'SET_ACTIVE_LAYER'; id: string }
  | { type: 'ADD_LAYER'; name?: string; kind?: 'tile' | 'object' }
  | { type: 'REMOVE_LAYER'; id: string }
  | { type: 'RENAME_LAYER'; id: string; name: string }
  | { type: 'REORDER_LAYER'; id: string; direction: 'up' | 'down' }
  | { type: 'TOGGLE_LAYER_VISIBLE'; id: string }
  | { type: 'TOGGLE_LAYER_LOCKED'; id: string }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ── Reducer ──

/**
 * Generate a unique-enough object ID using a timestamp + random suffix.
 * Avoids collisions across page refreshes (module-level counters reset on
 * reload and end up colliding with IDs already persisted to disk).
 */
export function generateObjectId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `obj-${ts}-${rand}`;
}

// ── Reducer helpers (layer-targeted writes) ──

/** Replace the active tile layer's grid by running `transform` on it.
 * Falls back to the first tile layer if active is an object layer. No-op
 * if the editor has no tile layer at all. Tile reducers (SET_TILE,
 * PAINT_TILES, CLEAR_AREA, MOVE_AREA, RESIZE_MAP) all route through this
 * so painting respects the active layer — picking a non-Ground tile
 * layer in the panel and painting writes into THAT layer. */
function withActiveTileGrid(state: EditorState, transform: (tiles: string[][]) => string[][]): EditorState {
  const target = getActiveTileLayer(state);
  if (!target) return state;
  const idx = state.layers.findIndex(l => l.id === target.id);
  if (idx < 0) return state;
  const newLayers = state.layers.slice();
  newLayers[idx] = { ...target, tiles: transform(target.tiles) };
  return { ...state, layers: newLayers };
}

/** Locate the object layer that should own a given entity. Resolves to the
 * entity's `layer` field if it points at an existing object layer, else the
 * first object layer in the stack. */
function resolveObjectLayerId(state: EditorState, entity: Entity): string {
  if (entity.layer) {
    const target = state.layers.find(l => l.id === entity.layer);
    if (target && isObjectLayer(target)) return target.id;
  }
  return getDefaultObjectLayerId(state);
}

/** Apply `transform` to a single object layer's `objects` array. Used by
 * place / delete / move / scale actions. `targetLayerId === undefined`
 * applies to every object layer (used by undo passes that re-insert into
 * whichever layer currently owns the id). */
function withObjectLayer(
  state: EditorState,
  targetLayerId: string,
  transform: (objects: Entity[]) => Entity[],
): EditorState {
  const idx = state.layers.findIndex(l => l.id === targetLayerId);
  if (idx < 0) return state;
  const layer = state.layers[idx];
  if (!isObjectLayer(layer)) return state;
  const newLayers = state.layers.slice();
  newLayers[idx] = { ...layer, objects: transform(layer.objects) };
  return { ...state, layers: newLayers };
}

/** Apply `transform` across every object layer's `objects` array. Used for
 * fan-out operations (delete-by-id / move-by-id) where the caller doesn't
 * know which layer owns the target id. */
function withAllObjectLayers(state: EditorState, transform: (objects: Entity[], layerId: string) => Entity[]): EditorState {
  let changed = false;
  const newLayers = state.layers.map(l => {
    if (!isObjectLayer(l)) return l;
    const next = transform(l.objects, l.id);
    if (next === l.objects) return l;
    changed = true;
    return { ...l, objects: next };
  });
  return changed ? { ...state, layers: newLayers } : state;
}

/** Find a single object by id across every object layer. */
function findObject(state: EditorState, id: string): Entity | undefined {
  for (const l of state.layers) {
    if (!isObjectLayer(l)) continue;
    const o = l.objects.find(o => o.id === id);
    if (o) return o;
  }
  return undefined;
}

/** True if the named layer exists and has `locked: true`. Used by every
 * mutating reducer to short-circuit when the user has locked a layer in
 * the panel — Figma-style: the layer's content is read-only until
 * unlocked. Unknown layer ids return false (treat as "no constraint").
 */
function isLayerLocked(state: EditorState, layerId: string | undefined | null): boolean {
  if (!layerId) return false;
  const layer = state.layers.find(l => l.id === layerId);
  return !!layer?.locked;
}

/** True when the layer that tile-paint is currently targeting (active if
 * tile-kind, else primary) is locked. Distinct from
 * `isPrimaryTileLayerLocked` because area ops anchor on the primary while
 * paint ops follow the user's active selection. */
function isActiveTileLayerLocked(state: EditorState): boolean {
  const target = getActiveTileLayer(state);
  return !!target?.locked;
}

/** Snapshot the parts of state that layer-management actions can mutate.
 * Stored on the undo stack as the data for a `LAYERS_SNAPSHOT` entry — on
 * undo the snapshot replaces current state, and the previously-current
 * state is captured the same way for redo. Used for ADD_LAYER /
 * REMOVE_LAYER / RENAME_LAYER / REORDER_LAYER / TOGGLE_LAYER_VISIBLE /
 * TOGGLE_LAYER_LOCKED so the user can step back through every layer-panel
 * operation. */
interface LayersSnapshot { layers: Layer[]; activeLayerId: string }
function captureLayersSnapshot(state: EditorState): LayersSnapshot {
  return { layers: state.layers, activeLayerId: state.activeLayerId };
}

/** Snapshot the parts of state that RESIZE_MAP can mutate. Stored as undo
 * data for RESIZE_MAP so users can revert a destructive shrink without
 * losing the tile content the new dimensions trimmed off. Includes
 * `buildings` because anchor-aware resize shifts buildings alongside
 * objects, and the user expects undo to put them back. */
interface ResizeSnapshot {
  layers: Layer[];
  mapWidth: number;
  mapHeight: number;
  buildings: Building[];
}
function captureResizeSnapshot(state: EditorState): ResizeSnapshot {
  return {
    layers: state.layers,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    buildings: state.buildings,
  };
}

/** Decide whether to push a new MOVE_OBJECT / MOVE_BUILDING / SET_*_SCALE
 * undo entry or coalesce with the previous one. A drag fires MOVE_OBJECT
 * many times per frame; without coalescing each pixel of the drag becomes
 * its own undo step. We compare against the most recent entry: same action
 * type AND same target id ⇒ coalesce (keep the original `old*` snapshot,
 * which already captures the pre-drag state). */
function shouldCoalesceUndo(undoStack: UndoEntry[], type: string, id: string): boolean {
  const last = undoStack[undoStack.length - 1];
  if (!last || last.type !== type) return false;
  const data = last.data as { id?: string };
  return data.id === id;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_TILE': {
      const { row, col, tileType } = action;
      if (row < 0 || row >= state.mapHeight || col < 0 || col >= state.mapWidth) return state;
      if (isActiveTileLayerLocked(state)) return state;
      const primary = getActiveTileLayer(state);
      if (!primary) return state;
      const oldType = primary.tiles[row][col];
      if (oldType === tileType) return state;
      return {
        ...withActiveTileGrid(state, tiles => {
          const next = tiles.map(r => [...r]);
          next[row][col] = tileType;
          return next;
        }),
        undoStack: [...state.undoStack, { type: 'SET_TILE', data: { row, col, oldType } }],
        redoStack: [],
      };
    }

    case 'PAINT_TILES': {
      const { cells, tileType } = action;
      if (isActiveTileLayerLocked(state)) return state;
      const primary = getActiveTileLayer(state);
      if (!primary) return state;
      const oldCells: { row: number; col: number; oldType: string }[] = [];
      const newTiles = primary.tiles.map(r => [...r]);
      for (const { row, col } of cells) {
        if (row < 0 || row >= state.mapHeight || col < 0 || col >= state.mapWidth) continue;
        const oldType = newTiles[row][col];
        if (oldType !== tileType) {
          oldCells.push({ row, col, oldType });
          newTiles[row][col] = tileType;
        }
      }
      if (oldCells.length === 0) return state;
      return {
        ...withActiveTileGrid(state, () => newTiles),
        undoStack: [...state.undoStack, { type: 'PAINT_TILES', data: { oldCells, tileType } }],
        redoStack: [],
      };
    }

    case 'CLEAR_AREA': {
      // Reset every tile in the rectangle to GRASS and remove any objects /
      // buildings whose anchor falls inside it. One atomic action so undo is
      // a single step, not many.
      const r0 = Math.max(0, Math.min(action.row1, action.row2));
      const r1 = Math.min(state.mapHeight - 1, Math.max(action.row1, action.row2));
      const c0 = Math.max(0, Math.min(action.col1, action.col2));
      const c1 = Math.min(state.mapWidth - 1, Math.max(action.col1, action.col2));

      const primary = getActiveTileLayer(state);
      const oldCells: { row: number; col: number; oldType: string }[] = [];
      const newTiles = primary ? primary.tiles.map(r => [...r]) : null;
      if (newTiles) {
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const old = newTiles[r][c];
            if (old !== TileType.GRASS) {
              oldCells.push({ row: r, col: c, oldType: old });
              newTiles[r][c] = TileType.GRASS;
            }
          }
        }
      }

      const T = state.tileSize;
      const x0 = c0 * T;
      const y0 = r0 * T;
      const x1Px = (c1 + 1) * T;
      const y1Px = (r1 + 1) * T;
      const inside = (x: number, y: number) => x >= x0 && x < x1Px && y >= y0 && y < y1Px;
      const allObjects = getAllObjects(state);
      const removedObjects = allObjects.filter(o => inside(o.x, o.y));
      const removedBuildings = state.buildings.filter(b => inside(b.x, b.y));

      // Reject the whole op if it would touch any locked content. A partial
      // clear (some tiles + some objects but skipping locked ones) feels
      // surprising — the user would still see their drag rectangle leave
      // unexpected residue. Better to no-op and force the user to unlock.
      if (isActiveTileLayerLocked(state) && oldCells.length > 0) return state;
      if (removedObjects.some(o => isLayerLocked(state, o.layer))) return state;

      if (oldCells.length === 0 && removedObjects.length === 0 && removedBuildings.length === 0) return state;

      const removedObjectIds = new Set(removedObjects.map(o => o.id));
      const removedBuildingIds = new Set(removedBuildings.map(b => b.id));

      let next: EditorState = state;
      if (newTiles) next = withActiveTileGrid(next, () => newTiles);
      next = withAllObjectLayers(next, objects => objects.filter(o => !removedObjectIds.has(o.id)));

      // Drop any selection that was wiped by the area clear.
      const removedAll = new Set([...removedObjectIds, ...removedBuildingIds]);
      const newSelection = state.selectedObjectIds.filter(id => !removedAll.has(id));
      return {
        ...next,
        buildings: state.buildings.filter(b => !removedBuildingIds.has(b.id)),
        selectedObjectIds: newSelection.length === state.selectedObjectIds.length ? state.selectedObjectIds : newSelection,
        undoStack: [...state.undoStack, { type: 'CLEAR_AREA', data: { oldCells, removedObjects, removedBuildings } }],
        redoStack: [],
      };
    }

    case 'SET_SELECTION_AREA': {
      return { ...state, selectionArea: action.area };
    }

    case 'MOVE_AREA': {
      // Translate every tile in `sourceArea` by `(dRow, dCol)` and shift any
      // object/building whose anchor sits inside the source rect by the same
      // amount. The source area is cleared to GRASS afterwards. One atomic
      // action so undo restores the entire move in a single step.
      const { sourceArea, dRow, dCol } = action;
      if (dRow === 0 && dCol === 0) return state;

      const r0 = Math.max(0, Math.min(sourceArea.row1, sourceArea.row2));
      const r1 = Math.min(state.mapHeight - 1, Math.max(sourceArea.row1, sourceArea.row2));
      const c0 = Math.max(0, Math.min(sourceArea.col1, sourceArea.col2));
      const c1 = Math.min(state.mapWidth - 1, Math.max(sourceArea.col1, sourceArea.col2));

      // Reject if the primary tile layer (the one being moved) is locked OR
      // if any entity inside the source rect lives on a locked layer. The
      // user must unlock first; partial moves would leave the rect in an
      // unexpected state.
      const T0 = state.tileSize;
      const inSourceCheck = (x: number, y: number) => x >= c0 * T0 && x < (c1 + 1) * T0 && y >= r0 * T0 && y < (r1 + 1) * T0;
      if (isActiveTileLayerLocked(state)) return state;
      const objectsInRect = getAllObjects(state).filter(o => inSourceCheck(o.x, o.y));
      if (objectsInRect.some(o => isLayerLocked(state, o.layer))) return state;

      const primary = getActiveTileLayer(state);
      // Snapshot every cell the move could touch — both source (will be
      // overwritten with grass) and destination (will be overwritten with
      // moved tiles). Saved in undo for full restoration.
      const cellSnapshot: { row: number; col: number; oldType: string }[] = [];
      let newTiles: string[][] | null = null;
      if (primary) {
        const seen = new Set<string>();
        const snap = (r: number, c: number) => {
          if (r < 0 || r >= state.mapHeight || c < 0 || c >= state.mapWidth) return;
          const k = `${r},${c}`;
          if (seen.has(k)) return;
          seen.add(k);
          cellSnapshot.push({ row: r, col: c, oldType: primary.tiles[r][c] });
        };
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            snap(r, c);
            snap(r + dRow, c + dCol);
          }
        }

        // Two-phase write so source/dest overlap doesn't lose data: first copy
        // source tiles into a temp buffer, then clear source to grass, then
        // paint temp into destination.
        newTiles = primary.tiles.map(r => [...r]);
        const sourceTiles: string[][] = [];
        for (let r = r0; r <= r1; r++) {
          const row: string[] = [];
          for (let c = c0; c <= c1; c++) row.push(primary.tiles[r][c]);
          sourceTiles.push(row);
        }
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) newTiles[r][c] = TileType.GRASS;
        }
        for (let dr = 0; dr <= r1 - r0; dr++) {
          for (let dc = 0; dc <= c1 - c0; dc++) {
            const tr = r0 + dr + dRow;
            const tc = c0 + dc + dCol;
            if (tr < 0 || tr >= state.mapHeight || tc < 0 || tc >= state.mapWidth) continue;
            newTiles[tr][tc] = sourceTiles[dr][dc];
          }
        }
      }

      const T = state.tileSize;
      const xMin = c0 * T;
      const xMax = (c1 + 1) * T;
      const yMin = r0 * T;
      const yMax = (r1 + 1) * T;
      const inSource = (x: number, y: number) => x >= xMin && x < xMax && y >= yMin && y < yMax;
      const dx = dCol * T;
      const dy = dRow * T;

      // Move objects whose anchor is inside the source rect. Preserve the
      // existing decor sortY trick (`sortY === y - 1000`) by rebuilding sortY
      // from the new y. Mutate within each owning layer.
      const movedObjectIds: string[] = [];
      let next: EditorState = state;
      if (newTiles) next = withActiveTileGrid(next, () => newTiles!);
      next = withAllObjectLayers(next, objects => objects.map(o => {
        if (!inSource(o.x, o.y)) return o;
        movedObjectIds.push(o.id);
        const newY = o.y + dy;
        const newSortY = o.sortY === o.y
          ? newY
          : (o.sortY < 0 ? newY - 1000 : o.sortY + dy);
        return { ...o, x: o.x + dx, y: newY, sortY: newSortY };
      }));

      const movedBuildingIds: string[] = [];
      const newBuildings = state.buildings.map(b => {
        if (!inSource(b.x, b.y)) return b;
        movedBuildingIds.push(b.id);
        return { ...b, x: b.x + dx, y: b.y + dy, sortY: b.y + dy };
      });

      return {
        ...next,
        buildings: newBuildings,
        // Selection follows the move so the user can keep dragging it.
        selectionArea: { row1: r0 + dRow, col1: c0 + dCol, row2: r1 + dRow, col2: c1 + dCol },
        undoStack: [...state.undoStack, { type: 'MOVE_AREA', data: { cellSnapshot, movedObjectIds, movedBuildingIds, dRow, dCol, prevSelection: { row1: r0, col1: c0, row2: r1, col2: c1 } } }],
        redoStack: [],
      };
    }

    case 'PLACE_OBJECT': {
      const targetLayerId = resolveObjectLayerId(state, action.entity);
      if (isLayerLocked(state, targetLayerId)) return state;
      const stamped: Entity = action.entity.layer === targetLayerId
        ? action.entity
        : { ...action.entity, layer: targetLayerId };
      return {
        ...withObjectLayer(state, targetLayerId, objects => [...objects, stamped]),
        undoStack: [...state.undoStack, { type: 'PLACE_OBJECT', data: { id: stamped.id } }],
        redoStack: [],
      };
    }

    case 'DELETE_OBJECT': {
      const obj = findObject(state, action.id);
      if (!obj) return state;
      if (isLayerLocked(state, obj.layer)) return state;
      return {
        ...withAllObjectLayers(state, objects => {
          const next = objects.filter(o => o.id !== action.id);
          return next.length === objects.length ? objects : next;
        }),
        selectedObjectIds: state.selectedObjectIds.includes(action.id) ? state.selectedObjectIds.filter(i => i !== action.id) : state.selectedObjectIds,
        undoStack: [...state.undoStack, { type: 'DELETE_OBJECT', data: { entity: obj } }],
        redoStack: [],
      };
    }

    case 'PLACE_BUILDING': {
      return {
        ...state,
        buildings: [...state.buildings, action.building],
        undoStack: [...state.undoStack, { type: 'PLACE_BUILDING', data: { id: action.building.id } }],
        redoStack: [],
      };
    }

    case 'DELETE_BUILDING': {
      const bld = state.buildings.find(b => b.id === action.id);
      if (!bld) return state;
      return {
        ...state,
        buildings: state.buildings.filter(b => b.id !== action.id),
        selectedObjectIds: state.selectedObjectIds.includes(action.id) ? state.selectedObjectIds.filter(i => i !== action.id) : state.selectedObjectIds,
        undoStack: [...state.undoStack, { type: 'DELETE_BUILDING', data: { building: bld } }],
        redoStack: [],
      };
    }

    case 'SELECT_OBJECT':
      // Replace selection. Null clears.
      return { ...state, selectedObjectIds: action.id ? [action.id] : [] };

    case 'TOGGLE_SELECT_OBJECT': {
      // Shift-click semantics: add the id if not present, remove if it is.
      // Used for building up a multi-selection that group-drag can move
      // together. Buildings (which can't currently group-drag) shouldn't
      // pass through this action — caller is expected to filter to objects.
      const has = state.selectedObjectIds.includes(action.id);
      const next = has
        ? state.selectedObjectIds.filter(i => i !== action.id)
        : [...state.selectedObjectIds, action.id];
      return { ...state, selectedObjectIds: next };
    }

    case 'SET_OBJECTS_LAYER': {
      // Reassign the owning layer of one or more objects. Used by the
      // right-click context menu and the [ / ] keyboard shortcuts to
      // re-stack already-placed entities. Tile layers are silently rejected
      // as targets (entities only live on object layers). Undo restores
      // every layer's `objects[]` via the unified LAYERS_SNAPSHOT path
      // because reversing per-id moves would need a separate inverse map.
      const target = state.layers.find(l => l.id === action.layerId);
      if (!target || target.kind !== 'object') return state;
      // Reject if the target layer is locked, OR if any of the source
      // entities currently live on a locked layer (their existing position
      // is read-only, so we can't move them out of it).
      if (target.locked) return state;
      const allObjectsForLockCheck = getAllObjects(state);
      for (const id of action.ids) {
        const o = allObjectsForLockCheck.find(oo => oo.id === id);
        if (o && isLayerLocked(state, o.layer)) return state;
      }

      // Filter to ids that actually need to move (skip objects already on
      // the target layer, and missing ids).
      const allObjects = getAllObjects(state);
      const idsToMove = action.ids.filter(id => {
        const obj = allObjects.find(o => o.id === id);
        return obj && (obj.layer ?? PLAYER_LAYER_ID) !== action.layerId;
      });
      if (idsToMove.length === 0) return state;

      const moveSet = new Set(idsToMove);
      // Pull the moving entities out of every object layer they currently
      // sit in. Track them by id so we can re-insert under the new layer
      // with the same property set (`...o, layer: <new>`).
      const movedById = new Map<string, Entity>();
      let newLayers = state.layers.map(l => {
        if (l.kind !== 'object') return l;
        const filtered: Entity[] = [];
        for (const o of l.objects) {
          if (moveSet.has(o.id)) movedById.set(o.id, o);
          else filtered.push(o);
        }
        return filtered.length === l.objects.length ? l : { ...l, objects: filtered };
      });
      // Append moved entities to the target layer in the action's id order
      // so adjacent moved entities keep a stable relative order.
      newLayers = newLayers.map(l => {
        if (l.id !== action.layerId || l.kind !== 'object') return l;
        const additions: Entity[] = [];
        for (const id of idsToMove) {
          const o = movedById.get(id);
          if (o) additions.push({ ...o, layer: action.layerId });
        }
        return { ...l, objects: [...l.objects, ...additions] };
      });

      return {
        ...state,
        layers: newLayers,
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'SET_OBJECT_SCALE': {
      // Scale is capped at 100% since source assets are already bigger than
      // needed — the only workflow is shrinking. Lower bound 1% for fine
      // granularity on very small decor.
      const clamped = Math.max(0.01, Math.min(1, action.scale));
      const obj = findObject(state, action.id);
      if (!obj || obj.scale === clamped) return state;
      if (isLayerLocked(state, obj.layer)) return state;
      const coalesce = shouldCoalesceUndo(state.undoStack, 'SET_OBJECT_SCALE', action.id);
      const undoStack = coalesce
        ? state.undoStack
        : [...state.undoStack, { type: 'SET_OBJECT_SCALE', data: { id: action.id, oldScale: obj.scale ?? 1 } }];
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === action.id ? { ...o, scale: clamped } : o),
        ),
        undoStack,
        redoStack: [],
      };
    }

    case 'SET_OBJECT_COLLISION': {
      // Update the entity's collisionBox. CollisionSystem treats
      // `width <= 0 || height <= 0` as "no collision", so the panel's
      // disable checkbox just dispatches a zero-size box.
      const obj = findObject(state, action.id);
      if (!obj) return state;
      if (isLayerLocked(state, obj.layer)) return state;
      const oldBox = obj.collisionBox;
      const nb = action.box;
      // Skip no-op updates so slider drags don't churn the undo stack.
      if (oldBox.offsetX === nb.offsetX && oldBox.offsetY === nb.offsetY
          && oldBox.width === nb.width && oldBox.height === nb.height) return state;
      const coalesce = shouldCoalesceUndo(state.undoStack, 'SET_OBJECT_COLLISION', action.id);
      const undoStack = coalesce
        ? state.undoStack
        : [...state.undoStack, { type: 'SET_OBJECT_COLLISION', data: { id: action.id, oldBox } }];
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === action.id ? { ...o, collisionBox: nb } : o),
        ),
        undoStack,
        redoStack: [],
      };
    }

    case 'SET_OBJECT_TRANSITION': {
      // Set or clear the entity's `transition` metadata. PixiApp converts
      // any object with a transition into a runtime door trigger at boot
      // (see `transitionEntities` in PixiApp.ts) — width = the player-
      // walkable cells under the entity's feet row, height = 1 tile.
      const obj = findObject(state, action.id);
      if (!obj) return state;
      if (isLayerLocked(state, obj.layer)) return state;
      const oldT = obj.transition;
      const newT = action.transition;
      // No-op when both undefined/null or every field matches. Earlier
      // versions of this check ignored `triggerBox`, which made
      // width/height/offset edits silently get dropped — the field is
      // shape-comparing now.
      const sameBox = (!oldT?.triggerBox && !newT?.triggerBox)
        || (!!oldT?.triggerBox && !!newT?.triggerBox
          && oldT.triggerBox.offsetX === newT.triggerBox.offsetX
          && oldT.triggerBox.offsetY === newT.triggerBox.offsetY
          && oldT.triggerBox.width === newT.triggerBox.width
          && oldT.triggerBox.height === newT.triggerBox.height);
      const same = (!oldT && !newT)
        || (!!oldT && !!newT
          && oldT.targetMapId === newT.targetMapId
          && oldT.targetSpawnId === newT.targetSpawnId
          && oldT.incomingSpawnId === newT.incomingSpawnId
          && sameBox);
      if (same) return state;
      const coalesce = shouldCoalesceUndo(state.undoStack, 'SET_OBJECT_TRANSITION', action.id);
      const undoStack = coalesce
        ? state.undoStack
        : [...state.undoStack, { type: 'SET_OBJECT_TRANSITION', data: { id: action.id, oldTransition: oldT } }];
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => {
            if (o.id !== action.id) return o;
            if (newT === null) {
              // Strip the transition field entirely so save format stays
              // clean (rather than persisting `transition: undefined`).
              const { transition: _t, ...rest } = o;
              void _t;
              return rest as Entity;
            }
            return { ...o, transition: newT };
          }),
        ),
        undoStack,
        redoStack: [],
      };
    }

    case 'MOVE_OBJECT': {
      const obj = findObject(state, action.id);
      if (!obj || (obj.x === action.x && obj.y === action.y)) return state;
      if (isLayerLocked(state, obj.layer)) return state;
      const coalesce = shouldCoalesceUndo(state.undoStack, 'MOVE_OBJECT', action.id);
      const undoStack = coalesce
        ? state.undoStack
        : [...state.undoStack, { type: 'MOVE_OBJECT', data: { id: action.id, oldX: obj.x, oldY: obj.y, oldSortY: obj.sortY } }];
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === action.id
            ? { ...o, x: action.x, y: action.y, sortY: o.sortY === o.y ? action.y : (o.sortY < 0 ? action.y - 1000 : o.sortY) }
            : o,
          ),
        ),
        undoStack,
        redoStack: [],
      };
    }

    case 'MOVE_OBJECTS': {
      // Group drag: caller passes new absolute (x, y) for every selected id
      // plus a stable `dragId` that lasts for one mouse-down→mouse-up cycle.
      // Undo coalesces by `dragId` so a continuous group drag = one undo
      // step, and back-to-back drags get distinct undo entries (the prior
      // single-id MOVE_OBJECT coalesced by id alone, which incorrectly
      // merged successive drags of the same object).
      const newPos = new Map(action.positions.map(p => [p.id, { x: p.x, y: p.y }]));
      if (newPos.size === 0) return state;
      // Reject the whole group drag if any participating entity is on a
      // locked layer. Partial drags would silently leave some of the user's
      // selection behind, which is more confusing than a no-op.
      for (const id of newPos.keys()) {
        const obj = findObject(state, id);
        if (obj && isLayerLocked(state, obj.layer)) return state;
      }
      const last = state.undoStack[state.undoStack.length - 1];
      const coalesce = last?.type === 'MOVE_OBJECTS' && (last.data as { dragId: string }).dragId === action.dragId;
      let undoStack = state.undoStack;
      if (!coalesce) {
        const oldPositions: Array<{ id: string; x: number; y: number; sortY: number }> = [];
        for (const id of newPos.keys()) {
          const obj = findObject(state, id);
          if (obj) oldPositions.push({ id, x: obj.x, y: obj.y, sortY: obj.sortY });
        }
        if (oldPositions.length === 0) return state;
        undoStack = [...state.undoStack, { type: 'MOVE_OBJECTS', data: { dragId: action.dragId, oldPositions } }];
      }
      // Skip the state walk if every requested position equals the current one.
      let anyChange = false;
      const next = withAllObjectLayers(state, objects =>
        objects.map(o => {
          const np = newPos.get(o.id);
          if (!np) return o;
          if (np.x === o.x && np.y === o.y) return o;
          anyChange = true;
          return {
            ...o,
            x: np.x,
            y: np.y,
            sortY: o.sortY === o.y ? np.y : (o.sortY < 0 ? np.y - 1000 : o.sortY),
          };
        }),
      );
      if (!anyChange && coalesce) return state;
      return { ...next, undoStack, redoStack: [] };
    }

    case 'MOVE_BUILDING': {
      const bld = state.buildings.find(b => b.id === action.id);
      if (!bld || (bld.x === action.x && bld.y === action.y)) return state;
      const coalesce = shouldCoalesceUndo(state.undoStack, 'MOVE_BUILDING', action.id);
      const undoStack = coalesce
        ? state.undoStack
        : [...state.undoStack, { type: 'MOVE_BUILDING', data: { id: action.id, oldX: bld.x, oldY: bld.y, oldSortY: bld.sortY } }];
      return {
        ...state,
        buildings: state.buildings.map(b =>
          b.id === action.id ? { ...b, x: action.x, y: action.y, sortY: action.y } : b
        ),
        undoStack,
        redoStack: [],
      };
    }

    case 'SET_BUILDING_SCALE': {
      // Same clamp as objects — source art is bigger than needed so we mostly
      // shrink. Upper bound 1 avoids blowing buildings up past native res.
      const clamped = Math.max(0.05, Math.min(1, action.scale));
      const bld = state.buildings.find(b => b.id === action.id);
      if (!bld || bld.scale === clamped) return state;
      const coalesce = shouldCoalesceUndo(state.undoStack, 'SET_BUILDING_SCALE', action.id);
      const undoStack = coalesce
        ? state.undoStack
        : [...state.undoStack, { type: 'SET_BUILDING_SCALE', data: { id: action.id, oldScale: bld.scale ?? 1 } }];
      return {
        ...state,
        buildings: state.buildings.map(b =>
          b.id === action.id ? { ...b, scale: clamped } : b
        ),
        undoStack,
        redoStack: [],
      };
    }

    case 'SET_TOOL':
      return { ...state, activeTool: action.tool, selectedObjectIds: [] };

    case 'SET_SELECTED_TILE':
      return { ...state, selectedTileType: action.tileType, activeTool: 'tile' };

    case 'SET_SELECTED_OBJECT':
      return { ...state, selectedObjectKey: action.spriteKey, activeTool: 'object' };

    case 'SET_SELECTED_BUILDING':
      return { ...state, selectedBuildingKey: action.buildingKey, activeTool: 'building' };

    case 'SET_CAMERA':
      return { ...state, cameraX: action.x, cameraY: action.y };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.25, Math.min(3, action.zoom)) };

    case 'TOGGLE_GRID':
      return { ...state, showGrid: !state.showGrid };

    case 'SET_TILE_SIZE':
      return { ...state, tileSize: action.tileSize };

    case 'SET_MAP_NAME':
      return { ...state, mapName: action.name };

    case 'RESIZE_MAP': {
      const { width, height } = action;
      // Anchor-aware resize: `dRow` / `dCol` are how many cells the OLD
      // content shifts inside the NEW canvas (positive = right/down).
      // Aseprite's 3×3 anchor grid maps to these values:
      //   - Top-left      → dRow=0, dCol=0                   (default)
      //   - Top-right     → dRow=0, dCol=newW-oldW
      //   - Bottom-left   → dRow=newH-oldH, dCol=0
      //   - Center        → both halved
      //   - … etc
      // The dialog computes them; the reducer just applies.
      const dR = action.anchor?.dRow ?? 0;
      const dC = action.anchor?.dCol ?? 0;
      if (width === state.mapWidth && height === state.mapHeight && dR === 0 && dC === 0) return state;

      // Resize tile grids: NEW[nr][nc] = OLD[nr - dR][nc - dC] when in bounds,
      // else GRASS. This implements the anchor by translating "where does
      // the old origin land in the new grid?" into a per-cell lookup.
      const newLayers = state.layers.map(l => {
        if (!isTileLayer(l)) return l;
        const next: string[][] = [];
        for (let r = 0; r < height; r++) {
          const row: string[] = [];
          for (let c = 0; c < width; c++) {
            const or = r - dR;
            const oc = c - dC;
            if (or >= 0 && or < state.mapHeight && oc >= 0 && oc < state.mapWidth) {
              row.push(l.tiles[or][oc]);
            } else {
              row.push(TileType.GRASS);
            }
          }
          next.push(row);
        }
        return { ...l, tiles: next };
      });

      // Shift entities + buildings by (dC*T, dR*T) so they stay glued to
      // the same content tile in the new canvas. Pure top-left anchor
      // (dR=dC=0) is a no-op for these arrays.
      const T = state.tileSize;
      const dx = dC * T;
      const dy = dR * T;
      const layersWithShiftedObjects = (dx === 0 && dy === 0)
        ? newLayers
        : newLayers.map(l => {
            if (!isObjectLayer(l)) return l;
            return {
              ...l,
              objects: l.objects.map(o => {
                const newY = o.y + dy;
                // Preserve the sortY-vs-y relationship: ordinary entities
                // keep sortY === y; decor with sortY < 0 keeps the offset
                // pattern; explicit sortY values shift by dy too.
                const newSortY = o.sortY === o.y
                  ? newY
                  : (o.sortY < 0 ? newY - 1000 : o.sortY + dy);
                return { ...o, x: o.x + dx, y: newY, sortY: newSortY };
              }),
            };
          });
      const newBuildings = (dx === 0 && dy === 0)
        ? state.buildings
        : state.buildings.map(b => ({
            ...b,
            x: b.x + dx,
            y: b.y + dy,
            sortY: b.sortY + dy,
          }));

      return {
        ...state,
        mapWidth: width,
        mapHeight: height,
        layers: layersWithShiftedObjects,
        buildings: newBuildings,
        undoStack: [...state.undoStack, { type: 'RESIZE_MAP', data: captureResizeSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'IMPORT_MAP': {
      const layers = buildImportedLayers(action.layers, action.tiles, action.objects, action.width, action.height);
      // Keep the previously-active layer if it's still present; otherwise
      // fall back to 'props' or the first layer.
      const activeLayerId = layers.some(l => l.id === state.activeLayerId)
        ? state.activeLayerId
        : (layers.find(l => l.id === PLAYER_LAYER_ID)?.id ?? layers[0]?.id ?? PLAYER_LAYER_ID);
      return {
        ...state,
        buildings: action.buildings,
        mapWidth: action.width,
        mapHeight: action.height,
        undoStack: [],
        redoStack: [],
        selectedObjectIds: [],
        layers,
        activeLayerId,
      };
    }

    case 'SET_ACTIVE_LAYER': {
      if (!state.layers.some(l => l.id === action.id)) return state;
      return { ...state, activeLayerId: action.id };
    }

    case 'ADD_LAYER': {
      // Generate a stable, collision-free id. Names default to "Layer N"
      // where N is one past the current count so freshly-added layers don't
      // accidentally share names with existing ones.
      const id = `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const name = action.name ?? `Layer ${state.layers.length + 1}`;
      const kind = action.kind ?? 'object';
      const newLayer: Layer = kind === 'tile'
        ? { id, name, kind: 'tile', visible: true, locked: false, tiles: emptyTileGrid(state.mapWidth, state.mapHeight, '') }
        : { id, name, kind: 'object', visible: true, locked: false, objects: [] };
      return {
        ...state,
        layers: [...state.layers, newLayer],
        activeLayerId: id,
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'REMOVE_LAYER': {
      // Refuse to remove the last remaining layer — the editor must have
      // somewhere to put new entities. Otherwise migrate any entities on the
      // removed layer (object kind only) to the next-best object layer
      // ('props' if present, else the first remaining object layer).
      if (state.layers.length <= 1) return state;
      const removed = state.layers.find(l => l.id === action.id);
      if (!removed) return state;
      // Locked layers can't be removed — user must unlock first.
      if (removed.locked) return state;
      const remaining = state.layers.filter(l => l.id !== action.id);
      const fallbackObjectLayer = remaining.find(l => l.id === PLAYER_LAYER_ID && isObjectLayer(l))
        ?? remaining.find(isObjectLayer);
      let migrated = remaining;
      if (isObjectLayer(removed) && fallbackObjectLayer && removed.objects.length > 0) {
        const fbId = fallbackObjectLayer.id;
        migrated = remaining.map(l => {
          if (l.id !== fbId || !isObjectLayer(l)) return l;
          const merged = [...l.objects, ...removed.objects.map(o => ({ ...o, layer: fbId }))];
          return { ...l, objects: merged };
        });
      }
      const activeLayerId = state.activeLayerId === action.id
        ? (fallbackObjectLayer?.id ?? migrated[0].id)
        : state.activeLayerId;
      return {
        ...state,
        layers: migrated,
        activeLayerId,
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'RENAME_LAYER': {
      const trimmed = action.name.trim();
      if (!trimmed) return state;
      const target = state.layers.find(l => l.id === action.id);
      if (!target || target.name === trimmed) return state;
      return {
        ...state,
        layers: state.layers.map(l => l.id === action.id ? { ...l, name: trimmed } : l),
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'REORDER_LAYER': {
      const idx = state.layers.findIndex(l => l.id === action.id);
      if (idx < 0) return state;
      const target = action.direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= state.layers.length) return state;
      const next = [...state.layers];
      [next[idx], next[target]] = [next[target], next[idx]];
      return {
        ...state,
        layers: next,
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'TOGGLE_LAYER_VISIBLE': {
      if (!state.layers.some(l => l.id === action.id)) return state;
      return {
        ...state,
        layers: state.layers.map(l => l.id === action.id ? { ...l, visible: !(l.visible !== false) } : l),
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'TOGGLE_LAYER_LOCKED': {
      if (!state.layers.some(l => l.id === action.id)) return state;
      return {
        ...state,
        layers: state.layers.map(l => l.id === action.id ? { ...l, locked: !l.locked } : l),
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
        redoStack: [],
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const entry = state.undoStack[state.undoStack.length - 1];
      const newUndo = state.undoStack.slice(0, -1);
      return applyUndo(state, entry, newUndo);
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const entry = state.redoStack[state.redoStack.length - 1];
      const newRedo = state.redoStack.slice(0, -1);
      return applyRedo(state, entry, newRedo);
    }

    default:
      return state;
  }
}

/** Build the Editor's Layer[] from an imported map. Accepts both new format
 * (content-carrying `layers` with `kind` set) and legacy format (separate
 * tiles/objects + metadata-only layers). */
export function buildImportedLayers(
  importedLayers: MapLayer[] | Layer[] | undefined,
  importedTiles: string[][],
  importedObjects: Entity[],
  width: number,
  height: number,
): Layer[] {
  // New format: layers carry kind + content. Trust them, but defensively
  // backfill missing tiles/objects arrays so downstream code never NPEs.
  if (importedLayers && importedLayers.length > 0 && importedLayers.some(l => 'kind' in l)) {
    return (importedLayers as Layer[]).map(l => {
      if (l.kind === 'tile') {
        return {
          id: l.id,
          name: l.name,
          kind: 'tile',
          visible: l.visible !== false,
          locked: l.locked === true,
          tiles: l.tiles ?? emptyTileGrid(width, height, ''),
        };
      }
      return {
        id: l.id,
        name: l.name,
        kind: 'object',
        visible: l.visible !== false,
        locked: l.locked === true,
        objects: l.objects ?? [],
      };
    });
  }

  // Legacy format: synthesize the editor's default 5-layer layout, plant the
  // imported tiles into Ground, and bin imported objects into their assigned
  // object layer (or 'props' as the catch-all default).
  const seedLayers = (importedLayers as MapLayer[] | undefined)?.length
    ? (importedLayers as MapLayer[])
    : undefined;
  const base = defaultLayers(width, height);
  // If the legacy save had its own metadata layer order/visibility, keep it
  // and add a Ground tile layer in front. Otherwise use the default 5 layers.
  let result: Layer[];
  if (seedLayers) {
    const legacyAsObject: Layer[] = seedLayers.map(l => ({
      id: l.id,
      name: l.name,
      kind: 'object',
      visible: l.visible !== false,
      locked: l.locked === true,
      objects: [],
    }));
    // Avoid duplicate ground if the legacy save somehow already included one.
    const hasGround = legacyAsObject.some(l => l.id === 'ground');
    result = hasGround
      ? legacyAsObject
      : [
          { id: 'ground', name: 'Ground', kind: 'tile', visible: true, locked: false, tiles: importedTiles },
          ...legacyAsObject,
        ];
    // Plant tiles into ground if the loop above didn't.
    if (hasGround) {
      result = result.map(l => l.id === 'ground' && l.kind === 'tile' ? { ...l, tiles: importedTiles } : l);
    }
  } else {
    result = base;
    result = result.map(l => l.id === 'ground' && l.kind === 'tile' ? { ...l, tiles: importedTiles } : l);
  }
  // Distribute objects into their owning layer; unknown/empty layer field
  // funnels to 'props' (or the first object layer if 'props' is absent).
  const propsId = result.find(l => l.id === PLAYER_LAYER_ID && l.kind === 'object')?.id
    ?? result.find(l => l.kind === 'object')?.id;
  if (propsId) {
    const byLayer = new Map<string, Entity[]>();
    for (const o of importedObjects) {
      const targetId = o.layer && result.some(l => l.id === o.layer && l.kind === 'object')
        ? o.layer
        : propsId;
      const list = byLayer.get(targetId) ?? [];
      list.push(o.layer === targetId ? o : { ...o, layer: targetId });
      byLayer.set(targetId, list);
    }
    result = result.map(l => l.kind === 'object' ? { ...l, objects: byLayer.get(l.id) ?? [] } : l);
  }
  return result;
}

function applyUndo(state: EditorState, entry: UndoEntry, newUndo: UndoEntry[]): EditorState {
  const data = entry.data as Record<string, unknown>;
  switch (entry.type) {
    case 'SET_TILE': {
      const { row, col, oldType } = data as { row: number; col: number; oldType: string };
      const primary = getActiveTileLayer(state);
      if (!primary) return { ...state, undoStack: newUndo };
      const currentType = primary.tiles[row][col];
      return {
        ...withActiveTileGrid(state, tiles => {
          const next = tiles.map(r => [...r]);
          next[row][col] = oldType;
          return next;
        }),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'SET_TILE', data: { row, col, oldType: currentType } }],
      };
    }
    case 'PAINT_TILES': {
      const { oldCells, tileType } = data as { oldCells: { row: number; col: number; oldType: string }[]; tileType: string };
      const redoCells: { row: number; col: number }[] = [];
      const next = withActiveTileGrid(state, tiles => {
        const grid = tiles.map(r => [...r]);
        for (const { row, col, oldType } of oldCells) {
          redoCells.push({ row, col });
          grid[row][col] = oldType;
        }
        return grid;
      });
      return { ...next, undoStack: newUndo, redoStack: [...state.redoStack, { type: 'PAINT_TILES', data: { cells: redoCells, tileType } }] };
    }
    case 'CLEAR_AREA': {
      const { oldCells, removedObjects, removedBuildings } = data as {
        oldCells: { row: number; col: number; oldType: string }[];
        removedObjects: Entity[];
        removedBuildings: Building[];
      };
      let next = withActiveTileGrid(state, tiles => {
        const grid = tiles.map(r => [...r]);
        for (const { row, col, oldType } of oldCells) grid[row][col] = oldType;
        return grid;
      });
      // Re-insert each removed object into its recorded layer (defaulting
      // to props if the layer field is missing or no longer exists).
      const fallbackId = next.layers.find(l => l.id === PLAYER_LAYER_ID && isObjectLayer(l))?.id
        ?? next.layers.find(isObjectLayer)?.id;
      if (fallbackId) {
        const groups = new Map<string, Entity[]>();
        for (const o of removedObjects) {
          const owner = o.layer && next.layers.some(l => l.id === o.layer && isObjectLayer(l))
            ? o.layer
            : fallbackId;
          const list = groups.get(owner) ?? [];
          list.push(o.layer === owner ? o : { ...o, layer: owner });
          groups.set(owner, list);
        }
        for (const [id, items] of groups) {
          next = withObjectLayer(next, id, objects => [...objects, ...items]);
        }
      }
      return {
        ...next,
        buildings: [...state.buildings, ...removedBuildings],
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'CLEAR_AREA_REDO', data: { oldCells, removedObjects, removedBuildings } }],
      };
    }
    case 'MOVE_AREA': {
      const { cellSnapshot, movedObjectIds, movedBuildingIds, dRow, dCol, prevSelection } = data as {
        cellSnapshot: { row: number; col: number; oldType: string }[];
        movedObjectIds: string[];
        movedBuildingIds: string[];
        dRow: number;
        dCol: number;
        prevSelection: { row1: number; col1: number; row2: number; col2: number };
      };
      const T = state.tileSize;
      const dx = dCol * T;
      const dy = dRow * T;
      const objIds = new Set(movedObjectIds);
      const bldIds = new Set(movedBuildingIds);
      const next = withActiveTileGrid(state, tiles => {
        const grid = tiles.map(r => [...r]);
        for (const { row, col, oldType } of cellSnapshot) grid[row][col] = oldType;
        return grid;
      });
      const objMoved = withAllObjectLayers(next, objects => objects.map(o => {
        if (!objIds.has(o.id)) return o;
        const newY = o.y - dy;
        const newSortY = o.sortY === o.y
          ? newY
          : (o.sortY < 0 ? newY - 1000 : o.sortY - dy);
        return { ...o, x: o.x - dx, y: newY, sortY: newSortY };
      }));
      const newBuildings = state.buildings.map(b => {
        if (!bldIds.has(b.id)) return b;
        return { ...b, x: b.x - dx, y: b.y - dy, sortY: b.y - dy };
      });
      return {
        ...objMoved,
        buildings: newBuildings,
        selectionArea: prevSelection,
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'MOVE_AREA_REDO', data }],
      };
    }
    case 'PLACE_OBJECT': {
      const { id } = data as { id: string };
      const obj = findObject(state, id);
      const next = withAllObjectLayers(state, objects => {
        const filtered = objects.filter(o => o.id !== id);
        return filtered.length === objects.length ? objects : filtered;
      });
      return { ...next, undoStack: newUndo, redoStack: [...state.redoStack, { type: 'DELETE_OBJECT_REDO', data: { entity: obj } }] };
    }
    case 'DELETE_OBJECT': {
      const { entity } = data as { entity: Entity };
      const targetLayerId = resolveObjectLayerId(state, entity);
      const stamped = entity.layer === targetLayerId ? entity : { ...entity, layer: targetLayerId };
      return {
        ...withObjectLayer(state, targetLayerId, objects => [...objects, stamped]),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'PLACE_OBJECT_REDO', data: { id: entity.id } }],
      };
    }
    case 'PLACE_BUILDING': {
      const { id } = data as { id: string };
      const bld = state.buildings.find((b: Building) => b.id === id);
      return { ...state, buildings: state.buildings.filter((b: Building) => b.id !== id), undoStack: newUndo, redoStack: [...state.redoStack, { type: 'DELETE_BUILDING_REDO', data: { building: bld } }] };
    }
    case 'DELETE_BUILDING': {
      const { building } = data as { building: Building };
      return { ...state, buildings: [...state.buildings, building], undoStack: newUndo, redoStack: [...state.redoStack, { type: 'PLACE_BUILDING_REDO', data: { id: building.id } }] };
    }
    case 'MOVE_OBJECT': {
      const { id, oldX, oldY, oldSortY } = data as { id: string; oldX: number; oldY: number; oldSortY: number };
      const cur = findObject(state, id);
      const redoData = cur ? { id, oldX: cur.x, oldY: cur.y, oldSortY: cur.sortY } : { id, oldX, oldY, oldSortY };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === id ? { ...o, x: oldX, y: oldY, sortY: oldSortY } : o),
        ),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'MOVE_OBJECT', data: redoData }],
      };
    }
    case 'MOVE_OBJECTS': {
      // Undo a group drag — restore every captured pre-drag position and
      // record current positions for redo. The dragId carries through so a
      // redo of the group drag re-coalesces correctly within the same
      // transaction (shouldn't happen in practice since redo immediately
      // commits, but defensively kept).
      const { dragId, oldPositions } = data as { dragId: string; oldPositions: Array<{ id: string; x: number; y: number; sortY: number }> };
      const oldById = new Map(oldPositions.map(p => [p.id, p]));
      const redoPositions: Array<{ id: string; x: number; y: number; sortY: number }> = [];
      for (const p of oldPositions) {
        const cur = findObject(state, p.id);
        if (cur) redoPositions.push({ id: p.id, x: cur.x, y: cur.y, sortY: cur.sortY });
      }
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => {
            const op = oldById.get(o.id);
            return op ? { ...o, x: op.x, y: op.y, sortY: op.sortY } : o;
          }),
        ),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'MOVE_OBJECTS', data: { dragId, oldPositions: redoPositions } }],
      };
    }
    case 'MOVE_BUILDING': {
      const { id, oldX, oldY, oldSortY } = data as { id: string; oldX: number; oldY: number; oldSortY: number };
      const cur = state.buildings.find(b => b.id === id);
      const redoData = cur ? { id, oldX: cur.x, oldY: cur.y, oldSortY: cur.sortY } : { id, oldX, oldY, oldSortY };
      return {
        ...state,
        buildings: state.buildings.map(b => b.id === id ? { ...b, x: oldX, y: oldY, sortY: oldSortY } : b),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'MOVE_BUILDING', data: redoData }],
      };
    }
    case 'SET_OBJECT_SCALE': {
      const { id, oldScale } = data as { id: string; oldScale: number };
      const cur = findObject(state, id);
      const redoData = cur ? { id, oldScale: cur.scale ?? 1 } : { id, oldScale };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === id ? { ...o, scale: oldScale } : o),
        ),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'SET_OBJECT_SCALE', data: redoData }],
      };
    }
    case 'SET_OBJECT_COLLISION': {
      const { id, oldBox } = data as { id: string; oldBox: CollisionBox };
      const cur = findObject(state, id);
      const redoData = cur ? { id, oldBox: cur.collisionBox } : { id, oldBox };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === id ? { ...o, collisionBox: oldBox } : o),
        ),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'SET_OBJECT_COLLISION', data: redoData }],
      };
    }
    case 'SET_OBJECT_TRANSITION': {
      const { id, oldTransition } = data as { id: string; oldTransition: NonNullable<Entity['transition']> | undefined };
      const cur = findObject(state, id);
      const redoData = { id, oldTransition: cur?.transition };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => {
            if (o.id !== id) return o;
            if (!oldTransition) {
              const { transition: _t, ...rest } = o;
              void _t;
              return rest as Entity;
            }
            return { ...o, transition: oldTransition };
          }),
        ),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'SET_OBJECT_TRANSITION', data: redoData }],
      };
    }
    case 'SET_BUILDING_SCALE': {
      const { id, oldScale } = data as { id: string; oldScale: number };
      const cur = state.buildings.find(b => b.id === id);
      const redoData = cur ? { id, oldScale: cur.scale ?? 1 } : { id, oldScale };
      return {
        ...state,
        buildings: state.buildings.map(b => b.id === id ? { ...b, scale: oldScale } : b),
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'SET_BUILDING_SCALE', data: redoData }],
      };
    }
    case 'LAYERS_SNAPSHOT': {
      // Restore the captured layers + activeLayerId; capture the
      // currently-current state for redo.
      const snap = data as unknown as LayersSnapshot;
      return {
        ...state,
        layers: snap.layers,
        activeLayerId: snap.activeLayerId,
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
      };
    }
    case 'RESIZE_MAP': {
      const snap = data as unknown as ResizeSnapshot;
      return {
        ...state,
        layers: snap.layers,
        mapWidth: snap.mapWidth,
        mapHeight: snap.mapHeight,
        buildings: snap.buildings,
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'RESIZE_MAP', data: captureResizeSnapshot(state) }],
      };
    }
    default:
      return { ...state, undoStack: newUndo };
  }
}

function applyRedo(state: EditorState, entry: UndoEntry, newRedo: UndoEntry[]): EditorState {
  const data = entry.data as Record<string, unknown>;
  switch (entry.type) {
    case 'SET_TILE': {
      const { row, col, oldType } = data as { row: number; col: number; oldType: string };
      const primary = getActiveTileLayer(state);
      if (!primary) return { ...state, redoStack: newRedo };
      const currentType = primary.tiles[row][col];
      return {
        ...withActiveTileGrid(state, tiles => {
          const next = tiles.map(r => [...r]);
          next[row][col] = oldType;
          return next;
        }),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'SET_TILE', data: { row, col, oldType: currentType } }],
      };
    }
    case 'PAINT_TILES': {
      const { cells, tileType } = data as { cells: { row: number; col: number }[]; tileType: string };
      const oldCells: { row: number; col: number; oldType: string }[] = [];
      const next = withActiveTileGrid(state, tiles => {
        const grid = tiles.map(r => [...r]);
        for (const { row, col } of cells) {
          oldCells.push({ row, col, oldType: grid[row][col] });
          grid[row][col] = tileType;
        }
        return grid;
      });
      return { ...next, redoStack: newRedo, undoStack: [...state.undoStack, { type: 'PAINT_TILES', data: { oldCells, tileType } }] };
    }
    case 'CLEAR_AREA_REDO': {
      const { oldCells, removedObjects, removedBuildings } = data as {
        oldCells: { row: number; col: number; oldType: string }[];
        removedObjects: Entity[];
        removedBuildings: Building[];
      };
      const next = withActiveTileGrid(state, tiles => {
        const grid = tiles.map(r => [...r]);
        for (const { row, col } of oldCells) grid[row][col] = TileType.GRASS;
        return grid;
      });
      const removedObjectIds = new Set(removedObjects.map(o => o.id));
      const removedBuildingIds = new Set(removedBuildings.map(b => b.id));
      const stripped = withAllObjectLayers(next, objects => {
        const filtered = objects.filter(o => !removedObjectIds.has(o.id));
        return filtered.length === objects.length ? objects : filtered;
      });
      return {
        ...stripped,
        buildings: state.buildings.filter(b => !removedBuildingIds.has(b.id)),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'CLEAR_AREA', data: { oldCells, removedObjects, removedBuildings } }],
      };
    }
    case 'MOVE_AREA_REDO': {
      // Re-apply: same logic as the original MOVE_AREA reducer, using the
      // saved snapshot to know which cells & entities to translate.
      const { cellSnapshot, movedObjectIds, movedBuildingIds, dRow, dCol, prevSelection } = data as {
        cellSnapshot: { row: number; col: number; oldType: string }[];
        movedObjectIds: string[];
        movedBuildingIds: string[];
        dRow: number;
        dCol: number;
        prevSelection: { row1: number; col1: number; row2: number; col2: number };
      };
      const T = state.tileSize;
      const dx = dCol * T;
      const dy = dRow * T;
      const r0 = prevSelection.row1, r1 = prevSelection.row2, c0 = prevSelection.col1, c1 = prevSelection.col2;
      const next = withActiveTileGrid(state, tiles => {
        const grid = tiles.map(r => [...r]);
        const sourceTiles: string[][] = [];
        for (let r = r0; r <= r1; r++) {
          const row: string[] = [];
          for (let c = c0; c <= c1; c++) row.push(grid[r][c]);
          sourceTiles.push(row);
        }
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) grid[r][c] = TileType.GRASS;
        }
        for (let dr = 0; dr <= r1 - r0; dr++) {
          for (let dc = 0; dc <= c1 - c0; dc++) {
            const tr = r0 + dr + dRow;
            const tc = c0 + dc + dCol;
            if (tr < 0 || tr >= state.mapHeight || tc < 0 || tc >= state.mapWidth) continue;
            grid[tr][tc] = sourceTiles[dr][dc];
          }
        }
        return grid;
      });
      const objIds = new Set(movedObjectIds);
      const bldIds = new Set(movedBuildingIds);
      const objMoved = withAllObjectLayers(next, objects => objects.map(o => {
        if (!objIds.has(o.id)) return o;
        const newY = o.y + dy;
        const newSortY = o.sortY === o.y
          ? newY
          : (o.sortY < 0 ? newY - 1000 : o.sortY + dy);
        return { ...o, x: o.x + dx, y: newY, sortY: newSortY };
      }));
      const newBuildings = state.buildings.map(b => {
        if (!bldIds.has(b.id)) return b;
        return { ...b, x: b.x + dx, y: b.y + dy, sortY: b.y + dy };
      });
      return {
        ...objMoved,
        buildings: newBuildings,
        selectionArea: { row1: r0 + dRow, col1: c0 + dCol, row2: r1 + dRow, col2: c1 + dCol },
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'MOVE_AREA', data: { cellSnapshot, movedObjectIds, movedBuildingIds, dRow, dCol, prevSelection } }],
      };
    }
    case 'DELETE_OBJECT_REDO': {
      const { entity } = data as { entity: Entity };
      const targetLayerId = resolveObjectLayerId(state, entity);
      const stamped = entity.layer === targetLayerId ? entity : { ...entity, layer: targetLayerId };
      return {
        ...withObjectLayer(state, targetLayerId, objects => [...objects, stamped]),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'PLACE_OBJECT', data: { id: entity.id } }],
      };
    }
    case 'PLACE_OBJECT_REDO': {
      const { id } = data as { id: string };
      const obj = findObject(state, id);
      const next = withAllObjectLayers(state, objects => {
        const filtered = objects.filter(o => o.id !== id);
        return filtered.length === objects.length ? objects : filtered;
      });
      return { ...next, redoStack: newRedo, undoStack: [...state.undoStack, { type: 'DELETE_OBJECT', data: { entity: obj } }] };
    }
    case 'DELETE_BUILDING_REDO': {
      const { building } = data as { building: Building };
      return { ...state, buildings: [...state.buildings, building], redoStack: newRedo, undoStack: [...state.undoStack, { type: 'PLACE_BUILDING', data: { id: building.id } }] };
    }
    case 'PLACE_BUILDING_REDO': {
      const { id } = data as { id: string };
      const bld = state.buildings.find((b: Building) => b.id === id);
      return { ...state, buildings: state.buildings.filter((b: Building) => b.id !== id), redoStack: newRedo, undoStack: [...state.undoStack, { type: 'DELETE_BUILDING', data: { building: bld } }] };
    }
    // ── Symmetric redo handlers for the new entry types. The undo path
    // pushes redo entries with the same shape as the originals (e.g. a
    // MOVE_OBJECT undo pushes a MOVE_OBJECT redo carrying the *post-undo*
    // state's old coords as the new "old" fields), so redoing is just the
    // mirror of undoing.
    case 'MOVE_OBJECT': {
      const { id, oldX, oldY, oldSortY } = data as { id: string; oldX: number; oldY: number; oldSortY: number };
      const cur = findObject(state, id);
      const undoData = cur ? { id, oldX: cur.x, oldY: cur.y, oldSortY: cur.sortY } : { id, oldX, oldY, oldSortY };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === id ? { ...o, x: oldX, y: oldY, sortY: oldSortY } : o),
        ),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'MOVE_OBJECT', data: undoData }],
      };
    }
    case 'MOVE_OBJECTS': {
      // Mirror of the undo path above — restore the captured positions and
      // capture the current ones for the next undo.
      const { dragId, oldPositions } = data as { dragId: string; oldPositions: Array<{ id: string; x: number; y: number; sortY: number }> };
      const oldById = new Map(oldPositions.map(p => [p.id, p]));
      const undoPositions: Array<{ id: string; x: number; y: number; sortY: number }> = [];
      for (const p of oldPositions) {
        const cur = findObject(state, p.id);
        if (cur) undoPositions.push({ id: p.id, x: cur.x, y: cur.y, sortY: cur.sortY });
      }
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => {
            const op = oldById.get(o.id);
            return op ? { ...o, x: op.x, y: op.y, sortY: op.sortY } : o;
          }),
        ),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'MOVE_OBJECTS', data: { dragId, oldPositions: undoPositions } }],
      };
    }
    case 'MOVE_BUILDING': {
      const { id, oldX, oldY, oldSortY } = data as { id: string; oldX: number; oldY: number; oldSortY: number };
      const cur = state.buildings.find(b => b.id === id);
      const undoData = cur ? { id, oldX: cur.x, oldY: cur.y, oldSortY: cur.sortY } : { id, oldX, oldY, oldSortY };
      return {
        ...state,
        buildings: state.buildings.map(b => b.id === id ? { ...b, x: oldX, y: oldY, sortY: oldSortY } : b),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'MOVE_BUILDING', data: undoData }],
      };
    }
    case 'SET_OBJECT_SCALE': {
      const { id, oldScale } = data as { id: string; oldScale: number };
      const cur = findObject(state, id);
      const undoData = cur ? { id, oldScale: cur.scale ?? 1 } : { id, oldScale };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === id ? { ...o, scale: oldScale } : o),
        ),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'SET_OBJECT_SCALE', data: undoData }],
      };
    }
    case 'SET_OBJECT_COLLISION': {
      const { id, oldBox } = data as { id: string; oldBox: CollisionBox };
      const cur = findObject(state, id);
      const undoData = cur ? { id, oldBox: cur.collisionBox } : { id, oldBox };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => o.id === id ? { ...o, collisionBox: oldBox } : o),
        ),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'SET_OBJECT_COLLISION', data: undoData }],
      };
    }
    case 'SET_OBJECT_TRANSITION': {
      const { id, oldTransition } = data as { id: string; oldTransition: NonNullable<Entity['transition']> | undefined };
      const cur = findObject(state, id);
      const undoData = { id, oldTransition: cur?.transition };
      return {
        ...withAllObjectLayers(state, objects =>
          objects.map(o => {
            if (o.id !== id) return o;
            if (!oldTransition) {
              const { transition: _t, ...rest } = o;
              void _t;
              return rest as Entity;
            }
            return { ...o, transition: oldTransition };
          }),
        ),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'SET_OBJECT_TRANSITION', data: undoData }],
      };
    }
    case 'SET_BUILDING_SCALE': {
      const { id, oldScale } = data as { id: string; oldScale: number };
      const cur = state.buildings.find(b => b.id === id);
      const undoData = cur ? { id, oldScale: cur.scale ?? 1 } : { id, oldScale };
      return {
        ...state,
        buildings: state.buildings.map(b => b.id === id ? { ...b, scale: oldScale } : b),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'SET_BUILDING_SCALE', data: undoData }],
      };
    }
    case 'LAYERS_SNAPSHOT': {
      const snap = data as unknown as LayersSnapshot;
      return {
        ...state,
        layers: snap.layers,
        activeLayerId: snap.activeLayerId,
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'LAYERS_SNAPSHOT', data: captureLayersSnapshot(state) }],
      };
    }
    case 'RESIZE_MAP': {
      const snap = data as unknown as ResizeSnapshot;
      return {
        ...state,
        layers: snap.layers,
        mapWidth: snap.mapWidth,
        mapHeight: snap.mapHeight,
        buildings: snap.buildings,
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'RESIZE_MAP', data: captureResizeSnapshot(state) }],
      };
    }
    default:
      return { ...state, redoStack: newRedo };
  }
}
