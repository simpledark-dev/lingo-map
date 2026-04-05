import { TileType, Entity, Building } from '../core/types';

export interface SavedMap {
  mapName: string;
  tiles: TileType[][];
  objects: Entity[];
  buildings: Building[];
  mapWidth: number;
  mapHeight: number;
  savedAt: string; // ISO timestamp
}

const STORAGE_KEY = 'editor-maps';
const ACTIVE_KEY = 'editor-active-map';

export function getSavedMapNames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const maps = JSON.parse(raw) as Record<string, SavedMap>;
    return Object.keys(maps).sort();
  } catch { return []; }
}

export function loadSavedMap(name: string): SavedMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const maps = JSON.parse(raw) as Record<string, SavedMap>;
    return maps[name] ?? null;
  } catch { return null; }
}

export function saveMap(map: SavedMap): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const maps: Record<string, SavedMap> = raw ? JSON.parse(raw) : {};
    maps[map.mapName] = { ...map, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
    localStorage.setItem(ACTIVE_KEY, map.mapName);
  } catch { /* storage full */ }
}

export function deleteSavedMap(name: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const maps = JSON.parse(raw) as Record<string, SavedMap>;
    delete maps[name];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
  } catch { /* ignore */ }
}

export function getActiveMapName(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch { return null; }
}

export function setActiveMapName(name: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, name);
  } catch { /* ignore */ }
}
