// Pick 20 well-spread NPC spawn positions on the sidewalk tiles of
// data/pokemon.json. Output is a TS-ready array of NPC entries that
// can be pasted into src/maps/pokemon.ts.
//
// Strategy: take floor-layer sidewalk object positions (these ARE the
// visible sidewalks the user laid in the editor), filter to ones whose
// underlying tile is walkable AND not blocked by a collidable prop,
// then run a greedy max-min-distance picker so the 20 spawns spread
// across the map instead of clumping in one neighbourhood.
import fs from 'node:fs';

const map = JSON.parse(fs.readFileSync('/Users/gaelduong/Documents/Code/lingo-map/data/pokemon.json','utf8'));
const T = map.tileSize;

const NON_WALKABLE_TILES = new Set([
  'wall','wall-interior','wall-interior-top','wall-interior-top-left',
  'wall-interior-top-corner-bl','wall-interior-top-corner-inner-tr',
  'wall-interior-top-bl','wall-interior-top-br','wall-interior-bottom',
  'wall-interior-left','wall-interior-right',
  'wall-interior-corner-bottom-left','wall-interior-corner-bottom-right',
  'wall-brick','water','void',
]);

const ground = map.layers.find(l => l.id === 'ground');
const floor = map.layers.find(l => l.id === 'floor');

// Collidable obstacles on prop/decor/above layers — anything with a
// non-zero collisionBox at the spawn tile means a tree or building
// part is in the way.
const obstacles = [];
for (const layer of map.layers) {
  if (!layer.objects) continue;
  if (layer.id === 'floor') continue; // sidewalks themselves
  for (const o of layer.objects) {
    const c = o.collisionBox;
    if (!c || c.width <= 0 || c.height <= 0) continue;
    obstacles.push({
      // Approx world box at the object's anchored feet.
      minX: o.x + c.offsetX,
      minY: o.y + c.offsetY,
      maxX: o.x + c.offsetX + c.width,
      maxY: o.y + c.offsetY + c.height,
    });
  }
}

// Buildings have their own collision boxes on the base sprite.
for (const b of map.buildings ?? []) {
  if (!b.collisionBox) continue;
  const c = b.collisionBox;
  obstacles.push({
    minX: b.x + c.offsetX,
    minY: b.y + c.offsetY,
    maxX: b.x + c.offsetX + c.width,
    maxY: b.y + c.offsetY + c.height,
  });
}

function isClearAt(px, py) {
  const col = Math.floor(px / T);
  const row = Math.floor(py / T);
  // Stay 2 tiles away from the map edge so the NPC's wander radius
  // doesn't immediately hit the boundary wall.
  if (row < 2 || row >= map.height - 2 || col < 2 || col >= map.width - 2) return false;
  const tile = ground.tiles[row][col];
  if (NON_WALKABLE_TILES.has(tile)) return false;
  // Player feet collision box ~10×6 centered. Probe a 4-pixel box at
  // the position to rule out any prop overlap.
  const probe = { minX: px - 4, minY: py - 4, maxX: px + 4, maxY: py + 4 };
  for (const o of obstacles) {
    if (probe.minX < o.maxX && probe.maxX > o.minX
     && probe.minY < o.maxY && probe.maxY > o.minY) return false;
  }
  return true;
}

const candidates = [];
for (const o of floor.objects) {
  if (!o.spriteKey?.includes('Sidewalk')) continue;
  if (!isClearAt(o.x, o.y)) continue;
  candidates.push({ x: o.x, y: o.y });
}
console.error('Walkable sidewalk candidates:', candidates.length);

// Greedy max-min-distance: pick a random seed, then repeatedly add the
// candidate whose nearest-existing-pick distance is largest. Yields a
// well-spread cover without needing k-means / clustering.
function dist2(a, b) { const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; }
const N = 20;
const picks = [];
// Seed near the map center — keeps the first NPC visible from spawn.
let seed = candidates[0];
let best = -1;
for (const c of candidates) {
  const cx = (map.width * T) / 2;
  const cy = (map.height * T) / 2;
  const d = -((c.x-cx)**2 + (c.y-cy)**2);
  if (d > best) { best = d; seed = c; }
}
picks.push(seed);
while (picks.length < N) {
  let bestC = null, bestMin = -1;
  for (const c of candidates) {
    let minD = Infinity;
    for (const p of picks) {
      const d = dist2(c, p);
      if (d < minD) minD = d;
    }
    if (minD > bestMin) { bestMin = minD; bestC = c; }
  }
  if (!bestC) break;
  picks.push(bestC);
}

// Sort picks N→S, W→E so resulting NPC list reads top-down.
picks.sort((a, b) => a.y - b.y || a.x - b.x);

const NAMES = ['Mira','Hank','Riku','Sumi','Kit','Tomas','Ada','Jun','Pia','Olek','Esme','Bo','Nora','Reza','Yuki','Cleo','Otis','Saba','Theo','Vera'];
const DIALOGUE = [
  ['Oh, hi there! You must be new in town.', 'The Mart is just east past the path.'],
  ['Mart\'s been in my family three generations.', 'Anything you need, we\'ve got it.'],
  ['I\'m waiting for the next showing at the cinema.', 'Old monster movies tonight!'],
  ['Morning! Try the bakery while it\'s warm.'],
  ['Hey, hey! Wanna race to that tree?', '...okay, fine, you win.'],
  ['Construction\'s been going on for weeks.', 'They never finish.'],
  ['I\'m late for my shift. Excuse me!'],
  ['Have you seen a stray cat? Black with white socks.'],
  ['The cars get really fast around the bend. Be careful.'],
  ['Did you bring your book back? Library closes at 6.'],
  ['Postal route takes forever today.'],
  ['I just moved here. Still figuring out the streets.'],
  ['You look like you\'ve been walking all morning.'],
  ['I lost my keys somewhere on this street...'],
  ['Cinema\'s playing something foreign tonight. Subtitles!'],
  ['Waiting on a delivery. They said before noon.'],
  ['That mart sells the best onigiri.'],
  ['I should be at work but the weather is too nice.'],
  ['I dropped my coffee earlier. Don\'t step in it.'],
  ['Welcome to the neighborhood, friend.'],
];

let out = '';
for (let i = 0; i < picks.length; i++) {
  const p = picks[i];
  const id = String(i + 1).padStart(2, '0');
  const name = NAMES[i];
  const dialogue = DIALOGUE[i];
  out += `  {\n`;
  out += `    id: "pk-npc-${i + 1}",\n`;
  out += `    x: ${p.x},\n`;
  out += `    y: ${p.y},\n`;
  out += `    spriteKey: "me-char-${id}",\n`;
  out += `    anchor: { x: 0.5, y: 1.0 },\n`;
  out += `    sortY: ${p.y},\n`;
  out += `    collisionBox: NPC_FOOT_COLLISION,\n`;
  out += `    name: ${JSON.stringify(name)},\n`;
  out += `    dialogue: ${JSON.stringify(dialogue)},\n`;
  out += `    wanderRadius: 32,\n`;
  out += `  },\n`;
}
process.stdout.write(out);
