import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pokemonMap } from '../src/maps/pokemon';
import { pokemonHouse1fMap } from '../src/maps/pokemon-house-1f';
import { pokemonHouse2fMap } from '../src/maps/pokemon-house-2f';
import { MapData } from '../src/core/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data');
mkdirSync(OUT, { recursive: true });

const maps: Record<string, MapData> = {
  pokemon: pokemonMap,
  'pokemon-house-1f': pokemonHouse1fMap,
  'pokemon-house-2f': pokemonHouse2fMap,
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
