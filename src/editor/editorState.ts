import { TileType, Entity, Building, Anchor, CollisionBox } from '../core/types';

// ── State ──

export interface EditorState {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  tiles: TileType[][];
  objects: Entity[];
  buildings: Building[];

  activeTool: 'tile' | 'object' | 'building' | 'select' | 'eraser';
  selectedTileType: TileType;
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
}

interface UndoEntry {
  type: string;
  data: unknown;
}

export function createInitialState(width = 50, height = 50): EditorState {
  const tiles: TileType[][] = [];
  for (let r = 0; r < height; r++) {
    const row: TileType[] = [];
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
  };
}

// ── Actions ──

export type EditorAction =
  | { type: 'SET_TILE'; row: number; col: number; tileType: TileType }
  | { type: 'PAINT_TILES'; cells: { row: number; col: number }[]; tileType: TileType }
  | { type: 'PLACE_OBJECT'; entity: Entity }
  | { type: 'DELETE_OBJECT'; id: string }
  | { type: 'PLACE_BUILDING'; building: Building }
  | { type: 'DELETE_BUILDING'; id: string }
  | { type: 'SELECT_OBJECT'; id: string | null }
  | { type: 'SET_OBJECT_SCALE'; id: string; scale: number }
  | { type: 'MOVE_OBJECT'; id: string; x: number; y: number }
  | { type: 'SET_TOOL'; tool: EditorState['activeTool'] }
  | { type: 'SET_SELECTED_TILE'; tileType: TileType }
  | { type: 'SET_SELECTED_OBJECT'; spriteKey: string }
  | { type: 'SET_SELECTED_BUILDING'; buildingKey: string }
  | { type: 'SET_CAMERA'; x: number; y: number }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_TILE_SIZE'; tileSize: number }
  | { type: 'SET_MAP_NAME'; name: string }
  | { type: 'RESIZE_MAP'; width: number; height: number }
  | { type: 'IMPORT_MAP'; tiles: TileType[][]; objects: Entity[]; buildings: Building[]; width: number; height: number }
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
      const oldCells: { row: number; col: number; oldType: TileType }[] = [];
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
      const newTiles: TileType[][] = [];
      for (let r = 0; r < height; r++) {
        const row: TileType[] = [];
        for (let c = 0; c < width; c++) {
          row.push(r < state.mapHeight && c < state.mapWidth ? state.tiles[r][c] : TileType.GRASS);
        }
        newTiles.push(row);
      }
      return { ...state, mapWidth: width, mapHeight: height, tiles: newTiles };
    }

    case 'IMPORT_MAP':
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
      };

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
      const { row, col, oldType } = data as { row: number; col: number; oldType: TileType };
      const currentType = state.tiles[row][col];
      const newTiles = state.tiles.map(r => [...r]);
      newTiles[row][col] = oldType;
      return { ...state, tiles: newTiles, undoStack: newUndo, redoStack: [...state.redoStack, { type: 'SET_TILE', data: { row, col, oldType: currentType } }] };
    }
    case 'PAINT_TILES': {
      const { oldCells, tileType } = data as { oldCells: { row: number; col: number; oldType: TileType }[]; tileType: TileType };
      const newTiles = state.tiles.map(r => [...r]);
      const redoCells: { row: number; col: number }[] = [];
      for (const { row, col, oldType } of oldCells) {
        redoCells.push({ row, col });
        newTiles[row][col] = oldType;
      }
      return { ...state, tiles: newTiles, undoStack: newUndo, redoStack: [...state.redoStack, { type: 'PAINT_TILES', data: { cells: redoCells, tileType } }] };
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
      const { row, col, oldType } = data as { row: number; col: number; oldType: TileType };
      const currentType = state.tiles[row][col];
      const newTiles = state.tiles.map(r => [...r]);
      newTiles[row][col] = oldType;
      return { ...state, tiles: newTiles, redoStack: newRedo, undoStack: [...state.undoStack, { type: 'SET_TILE', data: { row, col, oldType: currentType } }] };
    }
    case 'PAINT_TILES': {
      const { cells, tileType } = data as { cells: { row: number; col: number }[]; tileType: TileType };
      const oldCells: { row: number; col: number; oldType: TileType }[] = [];
      const newTiles = state.tiles.map(r => [...r]);
      for (const { row, col } of cells) {
        oldCells.push({ row, col, oldType: newTiles[row][col] });
        newTiles[row][col] = tileType;
      }
      return { ...state, tiles: newTiles, redoStack: newRedo, undoStack: [...state.undoStack, { type: 'PAINT_TILES', data: { oldCells, tileType } }] };
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
