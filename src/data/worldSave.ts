import { Direction } from '../core/types';
import { MAX_ZOOM, MIN_ZOOM } from '../core/constants';

export const WORLD_SAVE_STORAGE_KEY = 'lingo-world:v1';

export interface SavedWorldState {
  version: 1;
  mapId: string;
  x: number;
  y: number;
  facing: Direction;
  zoom: number;
  returnSpawnId: string | null;
  returnMapId: string | null;
  savedAt: number;
}

const VALID_DIRECTIONS = new Set<Direction>(['up', 'down', 'left', 'right']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export function loadWorldSave(): SavedWorldState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORLD_SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedWorldState>;
    if (
      parsed.version !== 1 ||
      typeof parsed.mapId !== 'string' ||
      parsed.mapId.length === 0 ||
      !isFiniteNumber(parsed.x) ||
      !isFiniteNumber(parsed.y) ||
      !parsed.facing ||
      !VALID_DIRECTIONS.has(parsed.facing) ||
      !isFiniteNumber(parsed.zoom)
    ) {
      return null;
    }
    return {
      version: 1,
      mapId: parsed.mapId,
      x: parsed.x,
      y: parsed.y,
      facing: parsed.facing,
      zoom: clampZoom(parsed.zoom),
      returnSpawnId: typeof parsed.returnSpawnId === 'string' ? parsed.returnSpawnId : null,
      returnMapId: typeof parsed.returnMapId === 'string' ? parsed.returnMapId : null,
      savedAt: isFiniteNumber(parsed.savedAt) ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveWorldState(state: SavedWorldState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WORLD_SAVE_STORAGE_KEY, JSON.stringify({
      ...state,
      zoom: clampZoom(state.zoom),
    }));
  } catch {
    // Private mode / quota failures should not interrupt gameplay.
  }
}

export function clearWorldSave(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WORLD_SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
