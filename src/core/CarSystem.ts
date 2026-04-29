import { CarDirection, MapData } from "./types";
import { isCarPathLayer } from "./Layers";

/** A live ambient car driving the city. Position is in world pixels;
 * `cell` and `dir` are the discrete navigation state. Cars are visual-only
 * — no collision against the player, NPCs, or each other. */
export interface Car {
  id: string;
  x: number;
  y: number;
  /** Cell the car's center currently occupies. Updated when the car
   * crosses a tile boundary. */
  cell: { row: number; col: number };
  dir: CarDirection;
  /** World pixels per second. */
  speed: number;
  /** Per-direction sprite keys. The renderer pulls the right facing on
   * each frame based on the current `dir`, so a car turning at an
   * intersection swaps texture without needing a separate animation. */
  sprites: Record<CarDirection, string>;
}

/** Pool of vehicle sprite sets — Modern Exteriors pack singles. Each
 * set has matching art for all four headings. `spawnCar` picks one set
 * at random per spawn so the road feels alive instead of monochrome.
 * Add or remove indices to widen/narrow the variety. */
export const CAR_SPRITE_SETS: Array<Record<CarDirection, string>> = [
  3, 7, 12, 18, 24,
].map((n) => ({
  n: `me:10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Car_Up_${n}`,
  s: `me:10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Car_Down_${n}`,
  e: `me:10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Car_Right_${n}`,
  w: `me:10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Car_Left_${n}`,
}));

/** Mutable runtime state for the car system. Lives for the duration of a
 * scene; rebuilt on scene change. */
export interface CarSystemState {
  cars: Car[];
  /** Seconds since the last spawn attempt. Reset on every spawn. */
  timeSinceSpawn: number;
  /** Seconds between spawn attempts. */
  spawnInterval: number;
  /** Hard cap so a network with lots of border cells doesn't flood the map. */
  maxCars: number;
}

/** Pre-computed car-path graph derived once on scene load.
 *
 *   - `exits` is the per-cell allowed-direction lookup
 *   - `borderSpawns` enumerates the cells where the system can drop a fresh
 *     car: a cell on the map's outer ring that has at least one exit
 *     pointing INWARD (so the car doesn't immediately leave). Each entry
 *     records the direction(s) eligible to spawn with. */
export interface CarNetwork {
  exits: Map<string, CarDirection[]>;
  borderSpawns: Array<{ row: number; col: number; spawnDirs: CarDirection[] }>;
}

const OPPOSITE: Record<CarDirection, CarDirection> = {
  n: "s",
  s: "n",
  e: "w",
  w: "e",
};
const DELTA: Record<CarDirection, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
};

/** True when the named direction would take a car off the map starting
 * from the given border cell. Used to filter spawn directions so cars
 * don't appear and disappear in the same frame. */
function pointsOffMap(
  row: number,
  col: number,
  dir: CarDirection,
  mapW: number,
  mapH: number
): boolean {
  if (dir === "n" && row <= 0) return true;
  if (dir === "s" && row >= mapH - 1) return true;
  if (dir === "w" && col <= 0) return true;
  if (dir === "e" && col >= mapW - 1) return true;
  return false;
}

/** Build the navigation graph from every car-path layer in the map.
 * Layers are merged: a cell present in two layers gets the UNION of
 * exits. Returns null if no car-path data exists. The editor-only
 * `visible` flag is intentionally ignored here so toggling visibility in
 * the editor (to declutter the canvas while editing) doesn't change
 * runtime behavior — same convention as tile and object layers. */
export function buildCarNetwork(map: MapData): CarNetwork | null {
  const exits = new Map<string, CarDirection[]>();
  for (const layer of map.layers ?? []) {
    if (!isCarPathLayer(layer)) continue;
    for (const [key, dirs] of Object.entries(layer.exits)) {
      const prior = exits.get(key) ?? [];
      const union = Array.from(new Set([...prior, ...dirs])) as CarDirection[];
      exits.set(key, union);
    }
  }
  if (exits.size === 0) {
    console.log("[CarSystem] no car-path cells painted → cars disabled");
    return null;
  }

  const borderSpawns: CarNetwork["borderSpawns"] = [];
  for (const [key, dirs] of exits) {
    const [row, col] = key.split(",").map(Number);
    const onBorder =
      row === 0 || row === map.height - 1 || col === 0 || col === map.width - 1;
    if (!onBorder) continue;
    const spawnDirs = dirs.filter(
      (d) => !pointsOffMap(row, col, d, map.width, map.height)
    );
    if (spawnDirs.length === 0) continue;
    borderSpawns.push({ row, col, spawnDirs });
  }
  console.log(
    `[CarSystem] network ready: ${exits.size} painted cell(s), ${borderSpawns.length} spawn-eligible border cell(s)`
  );
  if (borderSpawns.length === 0) {
    console.log(
      "[CarSystem] no cars will spawn — paint at least one border cell with an exit pointing INWARD (north→south on top row, etc.)"
    );
  } else {
    console.log(
      "[CarSystem] spawn cells:",
      borderSpawns
        .map((s) => `(${s.row},${s.col})→${s.spawnDirs.join("|")}`)
        .join(" ")
    );
  }
  return { exits, borderSpawns };
}

// ── Tunables ─────────────────────────────────────────────────────────
// Edit these to change traffic feel. Lower interval / higher cap = busier
// streets. Per-map overrides land via PixiApp setting fields directly on
// the returned state.

/** Seconds between spawn attempts. Each attempt may no-op (cap reached
 * or no spawn-eligible border cells), so live traffic stabilises lower
 * than 1/interval cars-per-second. */
export const CAR_SPAWN_INTERVAL_SEC = 2;

/** Cap on concurrent cars. Spawn attempts no-op once reached. */
export const CAR_MAX_CONCURRENT = 6;

/** Default-shaped state. Tunable knobs live here; PixiApp can override
 * after construction (e.g., heavier traffic for the city map vs the
 * pokemon starter town). */
export function createCarSystemState(): CarSystemState {
  return {
    cars: [],
    timeSinceSpawn: 0,
    spawnInterval: CAR_SPAWN_INTERVAL_SEC,
    maxCars: CAR_MAX_CONCURRENT,
  };
}

let carIdCounter = 0;
function nextCarId(): string {
  carIdCounter += 1;
  return `car-${carIdCounter}`;
}

/** Try to drop a new car onto the map. No-op when at capacity or the
 * network has no spawn-eligible border cells. Returns the new car for
 * caller-side notifications (e.g., adding the sprite to the renderer)
 * or null when nothing was spawned. */
export function spawnCar(
  state: CarSystemState,
  network: CarNetwork,
  tileSize: number,
  spritePool: Array<Record<CarDirection, string>> = CAR_SPRITE_SETS,
  speedRange: [number, number] = [40, 60]
): Car | null {
  if (state.cars.length >= state.maxCars) return null;
  if (network.borderSpawns.length === 0) return null;
  if (spritePool.length === 0) return null;
  const spawn =
    network.borderSpawns[
      Math.floor(Math.random() * network.borderSpawns.length)
    ];
  const dir =
    spawn.spawnDirs[Math.floor(Math.random() * spawn.spawnDirs.length)];
  const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
  const sprites = spritePool[Math.floor(Math.random() * spritePool.length)];
  const car: Car = {
    id: nextCarId(),
    x: spawn.col * tileSize + tileSize / 2,
    y: spawn.row * tileSize + tileSize / 2,
    cell: { row: spawn.row, col: spawn.col },
    dir,
    speed,
    sprites,
  };
  state.cars.push(car);
  console.log(
    `[CarSystem] spawned ${car.id} at cell (${spawn.row},${spawn.col}) heading ${dir} — total live: ${state.cars.length}`
  );
  return car;
}

/** Pick a valid outgoing direction at a cell, excluding the U-turn back
 * the way we came. Returns null if there's nothing valid (dead-end /
 * cell off the painted network) — caller should despawn. */
function pickNextDirection(
  exits: CarDirection[],
  currentDir: CarDirection
): CarDirection | null {
  const back = OPPOSITE[currentDir];
  const valid = exits.filter((d) => d !== back);
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

/** One game-tick of the car system. Advances each car along its current
 * heading and, on cell crossings, picks a fresh direction or despawns.
 * Periodically tries to spawn a new car at a random border. Returns the
 * IDs of cars that DESPAWNED this tick so the caller can drop their
 * sprites. */
export function updateCars(
  state: CarSystemState,
  network: CarNetwork,
  deltaSec: number,
  tileSize: number,
  mapWidth: number,
  mapHeight: number
): string[] {
  // Spawn attempt — every `spawnInterval` seconds. Reset timer regardless
  // of whether spawning actually succeeded so a full map doesn't get a
  // backlog of pending spawns the moment a car despawns.
  state.timeSinceSpawn += deltaSec;
  if (state.timeSinceSpawn >= state.spawnInterval) {
    state.timeSinceSpawn = 0;
    const before = state.cars.length;
    spawnCar(state, network, tileSize);
    if (state.cars.length === before) {
      console.log(
        `[CarSystem] spawn skipped — at cap ${state.maxCars} OR no border cells (${state.cars.length} live)`
      );
    }
  }

  const despawned: string[] = [];
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const car = state.cars[i];
    const { dx, dy } = DELTA[car.dir];
    car.x += dx * car.speed * deltaSec;
    car.y += dy * car.speed * deltaSec;

    // Has the car center crossed into a new cell? Compute the cell the
    // car is currently in based on its world coords.
    const newRow = Math.floor(car.y / tileSize);
    const newCol = Math.floor(car.x / tileSize);
    if (newRow === car.cell.row && newCol === car.cell.col) continue;

    // Off the map: keep moving for one extra tile so the sprite slides
    // off the edge gradually (combined with the car-mask in RenderSystem,
    // it visibly clips piece-by-piece). Despawn only after the car has
    // travelled `OFF_MAP_BUFFER_TILES` past the edge — guarantees the
    // full sprite has cleared the visible map area.
    const off = newRow < 0 || newRow >= mapHeight || newCol < 0 || newCol >= mapWidth;
    if (off) {
      // Tiles of extra travel past the map edge before despawn. Needs to
      // cover (a) the half-sprite trailing tail crossing the edge plus
      // (b) some slack for sprites slightly wider than one tile, so the
      // car is fully past the mask boundary before it's removed —
      // otherwise the very last visible pixel pops out instead of
      // sliding away. 2 tiles is a comfortable margin.
      const OFF_MAP_BUFFER_TILES = 2;
      if (
        newRow < -OFF_MAP_BUFFER_TILES ||
        newRow >= mapHeight + OFF_MAP_BUFFER_TILES ||
        newCol < -OFF_MAP_BUFFER_TILES ||
        newCol >= mapWidth + OFF_MAP_BUFFER_TILES
      ) {
        despawned.push(car.id);
        state.cars.splice(i, 1);
        console.log(
          `[CarSystem] ${car.id} despawned: drove off the map past (${newRow},${newCol})`
        );
        continue;
      }
      // Still in the buffer zone — keep current heading, just advance
      // the cell index so we don't re-enter this branch every frame
      // until the car crosses the next tile boundary.
      car.cell = { row: newRow, col: newCol };
      continue;
    }

    // Off the network → despawn (the user didn't paint car-path here).
    const key = `${newRow},${newCol}`;
    const exits = network.exits.get(key);
    if (!exits || exits.length === 0) {
      despawned.push(car.id);
      state.cars.splice(i, 1);
      console.log(
        `[CarSystem] ${car.id} despawned: cell (${newRow},${newCol}) is off the painted network`
      );
      continue;
    }

    // Pick a new direction at the cell entry. If the cell only allows a
    // U-turn (or has no forward-pointing exit), KEEP the current heading
    // instead of despawning. This makes border cells forgiving: an "exit
    // tile" the user paints with only an inward exit still lets the car
    // drive off naturally — it'll continue forward into either the next
    // cell or the off-map buffer zone above.
    const next = pickNextDirection(exits, car.dir);
    car.cell = { row: newRow, col: newCol };
    if (next) {
      car.dir = next;
      // Snap-to-cell-center on the perpendicular axis when turning, so a
      // car making a 90° turn doesn't spiral away from the cell midline
      // due to accumulated floating-point error.
      if (next === "n" || next === "s") {
        car.x = newCol * tileSize + tileSize / 2;
      } else {
        car.y = newRow * tileSize + tileSize / 2;
      }
    }
  }
  return despawned;
}

/** Resolve the sprite key the renderer should use for a car this frame,
 * based on its current heading. */
export function spriteKeyForCar(car: Car): string {
  return car.sprites[car.dir];
}
