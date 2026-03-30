import { MapData, SpawnPoint } from './types';
import { outdoorMap } from '../maps/outdoor';
import { indoorMap } from '../maps/indoor';

const mapRegistry: Record<string, MapData> = {
  outdoor: outdoorMap,
  indoor: indoorMap,
};

export function loadMap(mapId: string): MapData {
  const map = mapRegistry[mapId];
  if (!map) throw new Error(`Map not found: ${mapId}`);
  return map;
}

export function getSpawnPoint(map: MapData, spawnId: string): SpawnPoint {
  const spawn = map.spawnPoints.find((s) => s.id === spawnId);
  if (!spawn) throw new Error(`Spawn point "${spawnId}" not found in map "${map.id}"`);
  return spawn;
}

export function registerMap(mapId: string, map: MapData): void {
  mapRegistry[mapId] = map;
}
