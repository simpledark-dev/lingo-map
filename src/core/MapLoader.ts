import { MapData, SpawnPoint } from './types';
import { pokemonMap } from '../maps/pokemon';
import { pokemonHouse1fMap } from '../maps/pokemon-house-1f';
import { pokemonHouse2fMap } from '../maps/pokemon-house-2f';
import { grocer1fMap } from '../maps/grocer-1f';

const mapRegistry: Record<string, MapData> = {
  pokemon: pokemonMap,
  'pokemon-house-1f': pokemonHouse1fMap,
  'pokemon-house-2f': pokemonHouse2fMap,
  'grocer-1f': grocer1fMap,
};

export function loadMap(mapId: string): MapData {
  const map = mapRegistry[mapId];
  if (!map) throw new Error(`Map not found: ${mapId}`);
  return map;
}

export function registerMap(mapId: string, map: MapData): void {
  mapRegistry[mapId] = map;
}

export function getSpawnPoint(map: MapData, spawnId: string): SpawnPoint {
  const spawn = map.spawnPoints.find((s) => s.id === spawnId);
  if (!spawn) throw new Error(`Spawn point "${spawnId}" not found in map "${map.id}"`);
  return spawn;
}
