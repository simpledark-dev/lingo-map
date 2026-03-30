import { MapData, SpawnPoint } from './types';
import { outdoorMap } from '../maps/outdoor';
import { indoorMap } from '../maps/indoor';
import { cafeMap } from '../maps/cafe';
import { restaurantMap } from '../maps/restaurant';
import { bookstoreMap } from '../maps/bookstore';
import { marketMap } from '../maps/market';
import { bakeryMap } from '../maps/bakery';
import { innMap } from '../maps/inn';
import { blacksmithMap } from '../maps/blacksmith';

const mapRegistry: Record<string, MapData> = {
  outdoor: outdoorMap,
  indoor: indoorMap,
  cafe: cafeMap,
  restaurant: restaurantMap,
  bookstore: bookstoreMap,
  market: marketMap,
  bakery: bakeryMap,
  inn: innMap,
  blacksmith: blacksmithMap,
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
