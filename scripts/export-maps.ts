import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { outdoorMap } from '../src/maps/outdoor';
import { indoorMap } from '../src/maps/indoor';
import { cafeMap } from '../src/maps/cafe';
import { restaurantMap } from '../src/maps/restaurant';
import { bookstoreMap } from '../src/maps/bookstore';
import { marketMap } from '../src/maps/market';
import { bakeryMap } from '../src/maps/bakery';
import { innMap } from '../src/maps/inn';
import { blacksmithMap } from '../src/maps/blacksmith';
import { MapData } from '../src/core/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data');
mkdirSync(OUT, { recursive: true });

const maps: Record<string, MapData> = {
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

for (const [name, map] of Object.entries(maps)) {
  const path = join(OUT, `${name}.json`);
  writeFileSync(path, JSON.stringify(map, null, 2));
  const tiles = map.width * map.height;
  const objs = map.objects.length;
  const blds = map.buildings.length;
  const npcs = map.npcs.length;
  console.log(`  ${name}.json — ${map.width}x${map.height} (${tiles} tiles, ${objs} objects, ${blds} buildings, ${npcs} NPCs)`);
}

console.log(`\nAll maps exported to ${OUT}/`);
