import { TileType, Entity, Building, Anchor, CollisionBox, MapLayer } from '../core/types';
import { DEFAULT_LAYERS, PLAYER_LAYER_ID } from '../core/constants';

// ── State ──

export interface EditorState {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  tiles: string[][];
  objects: Entity[];
  buildings: Building[];

  activeTool: 'tile' | 'object' | 'building' | 'select' | 'eraser' | 'area-erase';
  selectedTileType: string;
  selectedObjectKey: string | null;
  selectedBuildingKey: string | null;
  selectedObjectId: string | null;

  showGrid: boolean;
  zoom: number;
  cameraX: number;
  cameraY: number;

  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  mapName: string;

  /** Ordered layer list. Index 0 renders first (bottom). Each layer carries
   * editor-only `visible` and `locked` flags that don't affect game runtime. */
  layers: MapLayer[];
  /** ID of the currently-active layer; new entities are stamped with this. */
  activeLayerId: string;
}

interface UndoEntry {
  type: string;
  data: unknown;
}

export function createInitialState(width = 50, height = 50): EditorState {
  const tiles: string[][] = [];
  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    for (let c = 0; c < width; c++) row.push(TileType.GRASS);
    tiles.push(row);
  }
  return {
    mapWidth: width,
    mapHeight: height,
    tileSize: 16,
    tiles,
    objects: [],
    buildings: [],
    activeTool: 'tile',
    selectedTileType: TileType.DIRT,
    selectedObjectKey: null,
    selectedBuildingKey: null,
    selectedObjectId: null,
    showGrid: true,
    zoom: 2,
    cameraX: 0,
    cameraY: 0,
    undoStack: [],
    redoStack: [],
    mapName: 'custom-map',
    layers: DEFAULT_LAYERS.map(l => ({ id: l.id, name: l.name, visible: true, locked: false })),
    activeLayerId: PLAYER_LAYER_ID,
  };
}

// ── Actions ──

export type EditorAction =
  | { type: 'SET_TILE'; row: number; col: number; tileType: string }
  | { type: 'PAINT_TILES'; cells: { row: number; col: number }[]; tileType: string }
  | { type: 'CLEAR_AREA'; row1: number; col1: number; row2: number; col2: number }
  | { type: 'PLACE_OBJECT'; entity: Entity }
  | { type: 'DELETE_OBJECT'; id: string }
  | { type: 'PLACE_BUILDING'; building: Building }
  | { type: 'DELETE_BUILDING'; id: string }
  | { type: 'SELECT_OBJECT'; id: string | null }
  | { type: 'SET_OBJECT_SCALE'; id: string; scale: number }
  | { type: 'SET_BUILDING_SCALE'; id: string; scale: number }
  | { type: 'MOVE_OBJECT'; id: string; x: number; y: number }
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
  | { type: 'RESIZE_MAP'; width: number; height: number }
  | { type: 'IMPORT_MAP'; tiles: string[][]; objects: Entity[]; buildings: Building[]; width: number; height: number; layers?: MapLayer[] }
  | { type: 'SET_ACTIVE_LAYER'; id: string }
  | { type: 'ADD_LAYER'; name?: string }
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

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_TILE': {
      const { row, col, tileType } = action;
      if (row < 0 || row >= state.mapHeight || col < 0 || col >= state.mapWidth) return state;
      const oldType = state.tiles[row][col];
      if (oldType === tileType) return state;
      const newTiles = state.tiles.map(r => [...r]);
      newTiles[row][col] = tileType;
      return {
        ...state,
        tiles: newTiles,
        undoStack: [...state.undoStack, { type: 'SET_TILE', data: { row, col, oldType } }],
        redoStack: [],
      };
    }

    case 'PAINT_TILES': {
      const { cells, tileType } = action;
      const oldCells: { row: number; col: number; oldType: string }[] = [];
      const newTiles = state.tiles.map(r => [...r]);
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
        ...state,
        tiles: newTiles,
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

      const oldCells: { row: number; col: number; oldType: string }[] = [];
      const newTiles = state.tiles.map(r => [...r]);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const old = newTiles[r][c];
          if (old !== TileType.GRASS) {
            oldCells.push({ row: r, col: c, oldType: old });
            newTiles[r][c] = TileType.GRASS;
          }
        }
      }

      const T = state.tileSize;
      const x0 = c0 * T;
      const y0 = r0 * T;
      const x1Px = (c1 + 1) * T;
      const y1Px = (r1 + 1) * T;
      const inside = (x: number, y: number) => x >= x0 && x < x1Px && y >= y0 && y < y1Px;
      const removedObjects = state.objects.filter(o => inside(o.x, o.y));
      const removedBuildings = state.buildings.filter(b => inside(b.x, b.y));

      if (oldCells.length === 0 && removedObjects.length === 0 && removedBuildings.length === 0) return state;

      const removedObjectIds = new Set(removedObjects.map(o => o.id));
      const removedBuildingIds = new Set(removedBuildings.map(b => b.id));

      return {
        ...state,
        tiles: newTiles,
        objects: state.objects.filter(o => !removedObjectIds.has(o.id)),
        buildings: state.buildings.filter(b => !removedBuildingIds.has(b.id)),
        selectedObjectId: state.selectedObjectId && (removedObjectIds.has(state.selectedObjectId) || removedBuildingIds.has(state.selectedObjectId))
          ? null
          : state.selectedObjectId,
        undoStack: [...state.undoStack, { type: 'CLEAR_AREA', data: { oldCells, removedObjects, removedBuildings } }],
        redoStack: [],
      };
    }

    case 'PLACE_OBJECT': {
      return {
        ...state,
        objects: [...state.objects, action.entity],
        undoStack: [...state.undoStack, { type: 'PLACE_OBJECT', data: { id: action.entity.id } }],
        redoStack: [],
      };
    }

    case 'DELETE_OBJECT': {
      const obj = state.objects.find(o => o.id === action.id);
      if (!obj) return state;
      return {
        ...state,
        objects: state.objects.filter(o => o.id !== action.id),
        selectedObjectId: state.selectedObjectId === action.id ? null : state.selectedObjectId,
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
        selectedObjectId: state.selectedObjectId === action.id ? null : state.selectedObjectId,
        undoStack: [...state.undoStack, { type: 'DELETE_BUILDING', data: { building: bld } }],
        redoStack: [],
      };
    }

    case 'SELECT_OBJECT':
      return { ...state, selectedObjectId: action.id };

    case 'SET_OBJECT_SCALE': {
      // Scale is capped at 100% since source assets are already bigger than
      // needed — the only workflow is shrinking. Lower bound 1% for fine
      // granularity on very small decor.
      const clamped = Math.max(0.01, Math.min(1, action.scale));
      return {
        ...state,
        objects: state.objects.map(o =>
          o.id === action.id ? { ...o, scale: clamped } : o
        ),
      };
    }

    case 'MOVE_OBJECT': {
      return {
        ...state,
        objects: state.objects.map(o =>
          o.id === action.id ? { ...o, x: action.x, y: action.y, sortY: o.sortY === o.y ? action.y : (o.sortY < 0 ? action.y - 1000 : o.sortY) } : o
        ),
      };
    }

    case 'MOVE_BUILDING': {
      return {
        ...state,
        buildings: state.buildings.map(b =>
          b.id === action.id ? { ...b, x: action.x, y: action.y, sortY: action.y } : b
        ),
      };
    }

    case 'SET_BUILDING_SCALE': {
      // Same clamp as objects — source art is bigger than needed so we mostly
      // shrink. Upper bound 1 avoids blowing buildings up past native res.
      const clamped = Math.max(0.05, Math.min(1, action.scale));
      return {
        ...state,
        buildings: state.buildings.map(b =>
          b.id === action.id ? { ...b, scale: clamped } : b
        ),
      };
    }

    case 'SET_TOOL':
      return { ...state, activeTool: action.tool, selectedObjectId: null };

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
      const newTiles: string[][] = [];
      for (let r = 0; r < height; r++) {
        const row: string[] = [];
        for (let c = 0; c < width; c++) {
          row.push(r < state.mapHeight && c < state.mapWidth ? state.tiles[r][c] : TileType.GRASS);
        }
        newTiles.push(row);
      }
      return { ...state, mapWidth: width, mapHeight: height, tiles: newTiles };
    }

    case 'IMPORT_MAP': {
      // Preserve any user-managed layers carried by the imported map.
      // Otherwise reset to the default 4-layer set so the editor is never in
      // a no-layers state.
      const layers = action.layers && action.layers.length > 0
        ? action.layers.map(l => ({ id: l.id, name: l.name, visible: l.visible !== false, locked: l.locked === true }))
        : DEFAULT_LAYERS.map(l => ({ id: l.id, name: l.name, visible: true, locked: false }));
      // Keep the previously-active layer if it's still present; otherwise
      // fall back to 'props' or the first layer.
      const activeLayerId = layers.some(l => l.id === state.activeLayerId)
        ? state.activeLayerId
        : (layers.find(l => l.id === PLAYER_LAYER_ID)?.id ?? layers[0].id);
      return {
        ...state,
        tiles: action.tiles,
        objects: action.objects,
        buildings: action.buildings,
        mapWidth: action.width,
        mapHeight: action.height,
        undoStack: [],
        redoStack: [],
        selectedObjectId: null,
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
      return {
        ...state,
        layers: [...state.layers, { id, name, visible: true, locked: false }],
        activeLayerId: id,
      };
    }

    case 'REMOVE_LAYER': {
      // Refuse to remove the last remaining layer — the editor must have
      // somewhere to put new entities. Otherwise migrate any entities on the
      // removed layer to the next-best layer ('props' if present, else the
      // first remaining layer).
      if (state.layers.length <= 1) return state;
      const remaining = state.layers.filter(l => l.id !== action.id);
      if (remaining.length === state.layers.length) return state;
      const fallback = remaining.find(l => l.id === PLAYER_LAYER_ID)?.id ?? remaining[0].id;
      const objects = state.objects.map(o => o.layer === action.id ? { ...o, layer: fallback } : o);
      const activeLayerId = state.activeLayerId === action.id ? fallback : state.activeLayerId;
      return { ...state, layers: remaining, objects, activeLayerId };
    }

    case 'RENAME_LAYER': {
      const trimmed = action.name.trim();
      if (!trimmed) return state;
      return {
        ...state,
        layers: state.layers.map(l => l.id === action.id ? { ...l, name: trimmed } : l),
      };
    }

    case 'REORDER_LAYER': {
      const idx = state.layers.findIndex(l => l.id === action.id);
      if (idx < 0) return state;
      const target = action.direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= state.layers.length) return state;
      const next = [...state.layers];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...state, layers: next };
    }

    case 'TOGGLE_LAYER_VISIBLE': {
      return {
        ...state,
        layers: state.layers.map(l => l.id === action.id ? { ...l, visible: !(l.visible !== false) } : l),
      };
    }

    case 'TOGGLE_LAYER_LOCKED': {
      return {
        ...state,
        layers: state.layers.map(l => l.id === action.id ? { ...l, locked: !l.locked } : l),
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

function applyUndo(state: EditorState, entry: UndoEntry, newUndo: UndoEntry[]): EditorState {
  const data = entry.data as Record<string, unknown>;
  switch (entry.type) {
    case 'SET_TILE': {
      const { row, col, oldType } = data as { row: number; col: number; oldType: string };
      const currentType = state.tiles[row][col];
      const newTiles = state.tiles.map(r => [...r]);
      newTiles[row][col] = oldType;
      return { ...state, tiles: newTiles, undoStack: newUndo, redoStack: [...state.redoStack, { type: 'SET_TILE', data: { row, col, oldType: currentType } }] };
    }
    case 'PAINT_TILES': {
      const { oldCells, tileType } = data as { oldCells: { row: number; col: number; oldType: string }[]; tileType: string };
      const newTiles = state.tiles.map(r => [...r]);
      const redoCells: { row: number; col: number }[] = [];
      for (const { row, col, oldType } of oldCells) {
        redoCells.push({ row, col });
        newTiles[row][col] = oldType;
      }
      return { ...state, tiles: newTiles, undoStack: newUndo, redoStack: [...state.redoStack, { type: 'PAINT_TILES', data: { cells: redoCells, tileType } }] };
    }
    case 'CLEAR_AREA': {
      const { oldCells, removedObjects, removedBuildings } = data as {
        oldCells: { row: number; col: number; oldType: string }[];
        removedObjects: Entity[];
        removedBuildings: Building[];
      };
      const newTiles = state.tiles.map(r => [...r]);
      for (const { row, col, oldType } of oldCells) newTiles[row][col] = oldType;
      return {
        ...state,
        tiles: newTiles,
        objects: [...state.objects, ...removedObjects],
        buildings: [...state.buildings, ...removedBuildings],
        undoStack: newUndo,
        redoStack: [...state.redoStack, { type: 'CLEAR_AREA_REDO', data: { oldCells, removedObjects, removedBuildings } }],
      };
    }
    case 'PLACE_OBJECT': {
      const { id } = data as { id: string };
      const obj = state.objects.find(o => o.id === id);
      return { ...state, objects: state.objects.filter(o => o.id !== id), undoStack: newUndo, redoStack: [...state.redoStack, { type: 'DELETE_OBJECT_REDO', data: { entity: obj } }] };
    }
    case 'DELETE_OBJECT': {
      const { entity } = data as { entity: Entity };
      return { ...state, objects: [...state.objects, entity], undoStack: newUndo, redoStack: [...state.redoStack, { type: 'PLACE_OBJECT_REDO', data: { id: entity.id } }] };
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
    default:
      return { ...state, undoStack: newUndo };
  }
}

function applyRedo(state: EditorState, entry: UndoEntry, newRedo: UndoEntry[]): EditorState {
  const data = entry.data as Record<string, unknown>;
  switch (entry.type) {
    case 'SET_TILE': {
      const { row, col, oldType } = data as { row: number; col: number; oldType: string };
      const currentType = state.tiles[row][col];
      const newTiles = state.tiles.map(r => [...r]);
      newTiles[row][col] = oldType;
      return { ...state, tiles: newTiles, redoStack: newRedo, undoStack: [...state.undoStack, { type: 'SET_TILE', data: { row, col, oldType: currentType } }] };
    }
    case 'PAINT_TILES': {
      const { cells, tileType } = data as { cells: { row: number; col: number }[]; tileType: string };
      const oldCells: { row: number; col: number; oldType: string }[] = [];
      const newTiles = state.tiles.map(r => [...r]);
      for (const { row, col } of cells) {
        oldCells.push({ row, col, oldType: newTiles[row][col] });
        newTiles[row][col] = tileType;
      }
      return { ...state, tiles: newTiles, redoStack: newRedo, undoStack: [...state.undoStack, { type: 'PAINT_TILES', data: { oldCells, tileType } }] };
    }
    case 'CLEAR_AREA_REDO': {
      const { oldCells, removedObjects, removedBuildings } = data as {
        oldCells: { row: number; col: number; oldType: string }[];
        removedObjects: Entity[];
        removedBuildings: Building[];
      };
      const newTiles = state.tiles.map(r => [...r]);
      for (const { row, col } of oldCells) newTiles[row][col] = TileType.GRASS;
      const removedObjectIds = new Set(removedObjects.map(o => o.id));
      const removedBuildingIds = new Set(removedBuildings.map(b => b.id));
      return {
        ...state,
        tiles: newTiles,
        objects: state.objects.filter(o => !removedObjectIds.has(o.id)),
        buildings: state.buildings.filter(b => !removedBuildingIds.has(b.id)),
        redoStack: newRedo,
        undoStack: [...state.undoStack, { type: 'CLEAR_AREA', data: { oldCells, removedObjects, removedBuildings } }],
      };
    }
    case 'DELETE_OBJECT_REDO': {
      const { entity } = data as { entity: Entity };
      return { ...state, objects: [...state.objects, entity], redoStack: newRedo, undoStack: [...state.undoStack, { type: 'PLACE_OBJECT', data: { id: entity.id } }] };
    }
    case 'PLACE_OBJECT_REDO': {
      const { id } = data as { id: string };
      const obj = state.objects.find(o => o.id === id);
      return { ...state, objects: state.objects.filter(o => o.id !== id), redoStack: newRedo, undoStack: [...state.undoStack, { type: 'DELETE_OBJECT', data: { entity: obj } }] };
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
    default:
      return { ...state, redoStack: newRedo };
  }
}
