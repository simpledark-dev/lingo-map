import { MapData, SpawnPoint } from './types';
import { normalizeMapData } from './Layers';
import { pokemonMap } from '../maps/pokemon';
import { pokemonHouse1fMap } from '../maps/pokemon-house-1f';
import { pokemonHouse2fMap } from '../maps/pokemon-house-2f';
import { grocer1fMap } from '../maps/grocer-1f';

const mapRegistry: Record<string, MapData> = {
  pokemon: normalizeMapData(pokemonMap),
  'pokemon-house-1f': normalizeMapData(pokemonHouse1fMap),
  'pokemon-house-2f': normalizeMapData(pokemonHouse2fMap),
  'grocer-1f': normalizeMapData(grocer1fMap),
};

export function loadMap(mapId: string): MapData {
  const map = mapRegistry[mapId];
  if (!map) throw new Error(`Map not found: ${mapId}`);
  return map;
}

export function registerMap(mapId: string, map: MapData): void {
  // Normalize on registration so the layered view is always populated for
  // disk-persisted overrides arriving from the editor.
  mapRegistry[mapId] = normalizeMapData(map);
}

export function getSpawnPoint(map: MapData, spawnId: string): SpawnPoint {
  const spawn = map.spawnPoints.find((s) => s.id === spawnId);
  if (!spawn) throw new Error(`Spawn point "${spawnId}" not found in map "${map.id}"`);
  return spawn;
}
