@AGENTS.md

# Lingo Map — Codebase Guide

## What Is This?

A **2.5D pixel-art exploration game** (vertical slice / prototype), currently on the `experiment-minimal` branch as a **16 px Pokémon-style** build. The player walks around an outdoor map, enters buildings, talks to NPCs, and explores indoor scenes (currently a two-floor house). Built as a web app with a mobile-friendly design (tap, pinch-to-zoom, PWA-installable) and a bundled in-browser map editor that writes edits back to disk.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (app router) + React 19 |
| Renderer | PixiJS 8 (WebGL 2D canvas) |
| Game Logic | Pure TypeScript (no framework coupling) |
| Styling | Tailwind CSS 4 |
| Language | TypeScript 5 |

---

## Architecture

The codebase enforces a strict **three-layer separation**:

```
React UI (GameCanvas.tsx)
    ↕  GameBridge (events up) / CommandQueue (commands down)
PixiJS Renderer (PixiApp.ts + RenderSystem.ts)
    ↕  reads/mutates game state
Core Game Logic (src/core/*.ts) — framework-agnostic pure TS
    ↕  reads map data
Map Data (src/maps/*.ts compiled from data/*.json, overridden at runtime by /api/maps)
```

**Key principle**: `src/core/` has zero React or PixiJS imports. It could run anywhere.

---

## Directory Structure

```
src/
  app/              Next.js pages (/, /editor) + /api/maps routes
  core/             Game logic (movement, collision, pathfinding, etc.)
  renderer/         PixiJS rendering + input
  ui/               React components (overlays, minimap, dialogue)
  editor/           In-browser map editor (PixiJS-based)
  maps/             Compiled map data (TypeScript modules)
data/               Raw map JSON (read at boot, written by editor)
public/assets/      Tileset PNGs + placeholder/ sprite PNGs
scripts/            Build/utility scripts
```

---

## Core Systems

### PixiApp (`src/renderer/PixiApp.ts`)
The main orchestrator. Owns the game loop (PixiJS ticker at ~60 FPS). Each tick:
1. Reads `InputState` from `InputAdapter`
2. Processes `CommandQueue` (UI → game commands)
3. Updates dialogue, player, NPCs, camera, triggers
4. Calls `RenderSystem` to update sprites

The default map is set by `GameCanvas.tsx` (currently `pokemon`) and passed in as `startMapId`.

### RenderSystem (`src/renderer/RenderSystem.ts`)
Manages all sprites across 5 ordered layers:
1. **Ground** — base tile sprites (one per cell, indexed by `TileType`)
2. **Transitions** — dithered grass↔path/bridge edge overlays from `TransitionTiles.ts`
3. **AutoTile** — dual-grid wang shorelines from `AutoTileset.ts` (multiple tilesets stacked, see below)
4. **Entities** — objects, NPCs, player (depth-sorted by Y position via `zIndex`, with `DECOR_SPRITE_KEYS` rendered behind the player)
5. **Roofs** — building roofs, always on top

Viewport culling hides sprites outside the visible area for performance. Player walk animation cycles through `idle / walk1 / walk2` frames while moving.

### Tile rendering pipeline

For each map, three passes draw the floor:

1. **Ground layer** — one sprite per cell, texture from `TileType`. This is the fallback look.
2. **Transition layer** — `buildTransitionLayer(map, includeWater=false)` walks every grass cell and adds dithered edge sprites where it borders path/bridge. Water borders are skipped here; the auto-tileset handles them.
3. **Auto-tile layer** — `buildAutoTileLayer()` from `src/renderer/AutoTileset.ts` is a **dual-grid** wang renderer. **Three tilesets are registered** and drawn in order (later ones layer on top):
   - `tileset-1.png` — grass/dark-grass (upper) ↔ water (lower). Produces shorelines.
   - `tileset-2.png` — dark-grass (upper) ↔ light-grass (lower). Dark-grass overlays.
   - `tileset-3.png` — dirt (upper) ↔ grass (lower). Dirt path overlays.

   How it works (same for all three sheets):
   - Each sheet is a 4×4 grid of 16×16 tiles, each encoding which of its 4 corners is the "upper" terrain.
   - Loaded once at startup via `loadAutoTileset()` and sliced into 16 sub-textures with `Rectangle` frames (no separate PNG files).
   - The render grid is `(W+1) × (H+1)`, **offset by `(-tileSize/2, -tileSize/2)`** so each render tile sits at the intersection of 4 world cells.
   - For each render slot, sample the 4 surrounding cells, build a 4-bit corner mask (`NW=8, NE=4, SW=2, SE=1`, upper=1), look up the tile via `MASK_TO_INDEX`, and draw it scaled to `tileSize`.
   - `requiresPresenceOf` on a tileset ensures it only fires when its feature terrain is actually present at a corner (so e.g. tileset-3 doesn't paint plain-grass over the whole map).
   - All four surrounding cells must pass `isAutoTile` for the slot to draw — otherwise unrelated tile types (wall, floor) bleed into the render.
   - Out-of-bounds cells **clamp** to the nearest in-bounds cell so map borders look natural.
   - **Important:** all three current sheets share the same `MASK_TO_INDEX` layout. If you swap in a sheet with a different layout you must regenerate the table by sampling its corners.

(`src/renderer/WaterBlobLayer.ts` is legacy code — no longer imported anywhere.)

### InputAdapter (`src/renderer/InputAdapter.ts`)
Normalizes keyboard (WASD/arrows), mouse (click-to-move), and touch (tap/pinch-zoom) into a pure `InputState` object with no DOM coupling.

### Core Systems (all in `src/core/`)

| File | Responsibility |
|------|---------------|
| `PlayerSystem.ts` | Movement (direct/target/path modes), facing direction |
| `CollisionSystem.ts` | AABB collision with axis-independent sliding |
| `Pathfinding.ts` | A* on a 16 px grid for click-to-move |
| `CameraSystem.ts` | Centers on player, clamps to map bounds, handles zoom |
| `InteractionSystem.ts` | NPC dialogue trigger (E/Space, within `INTERACTION_RANGE` = 32 px) |
| `TriggerSystem.ts` | Door triggers → scene transitions with dynamic exit spawns |
| `SortingSystem.ts` | Per-entity Y-based depth sort helpers |
| `NPCWanderSystem.ts` | NPC idle wandering (idle/walking state machine, seeded random) |
| `MapLoader.ts` | Map registry (pokemon, pokemon-house-1f, pokemon-house-2f); `registerMap()` used by UI to inject disk-persisted overrides |
| `MapStress.ts` | `?objects=Nx` multiplier helpers (stress-test mode) |
| `GameBridge.ts` | Event emitter (game → React UI) |
| `CommandQueue.ts` | Command queue (React UI → game) |
| `constants.ts` | `TILE_SIZE=16`, `PLAYER_SPEED`, `INTERACTION_RANGE`, `DEFAULT_ZOOM=3.0` (`MIN=2.0`, `MAX=4.0`), `DECOR_SPRITE_KEYS` (sprites always rendered behind the player) |

---

## Map Data Format

Maps are defined in `data/*.json` and compiled to `src/maps/*.ts`. At runtime, `GameCanvas.tsx` fetches `/api/maps` and re-registers each map with disk tiles/objects/buildings (keeping compiled NPCs/triggers/spawnPoints) — so editor edits take effect on refresh.

Key fields:

```typescript
{
  id: string;
  width: number; height: number;  // in tiles
  tileSize: number;               // always 16
  tiles: TileType[][];            // [row][col]
  objects: Entity[];              // trees, rocks, furniture, staircases
  buildings: Building[];          // base + roof sprites, doorTrigger, targetMapId
  npcs: NPCData[];                // name, dialogue[], wanderRadius/wanderBounds
  triggers: Trigger[];            // generic door/interact colliders
  spawnPoints: SpawnPoint[];      // named spawn locations
}
```

`TileType` is an enum (see `src/core/types.ts`) with these values:
- Outdoor: `grass`, `grass_dark`, `dirt`, `path`, `water`, `bridge`, `void`
- Walls (all blocking): `wall`, `wall-interior` + variants (`-top`, `-top-left`, `-top-corner-bl`, `-top-corner-inner-tr`, `-top-bl`, `-top-br`, `-bottom`, `-left`, `-right`, `-corner-bottom-left`, `-corner-bottom-right`)
- Floors (walkable): `floor`, `floor-wood`, `floor-wood-2`, `floor-wood-3`

**Important conventions:**
- All world positions are in **pixels**, not tiles
- Entities are positioned by their **feet** (anchor Y = 1.0)
- `sortY` is **explicit** on each entity — not derived from position
- Collision boxes are **explicit offsets** — not derived from sprite size
- `Entity.transition?` is an **optional scene-change** on entities themselves (used for staircases: walking onto the entity fires a scene load). The engine auto-registers an `incomingSpawnId` just below the entity so arrival position tracks visual position.
- This lets placeholder sprites be swapped without touching logic

---

## Tile Types & Walkability

| Tile | Walkable? |
|------|----------|
| `grass`, `grass_dark`, `dirt`, `path`, `bridge`, `floor`, `floor-wood`, `floor-wood-2`, `floor-wood-3` | Yes |
| `water`, `void`, `wall`, all `wall-interior-*` variants | No (blocked) |

Source of truth: `CollisionSystem.ts`'s non-walkable check.

---

## Scene Transitions

`TriggerSystem` detects two kinds of overlap:
1. A `doorTrigger` on a `Building` (outdoor → interior).
2. An `Entity.transition` (interior staircases, etc.).

On overlap:
1. A dynamic exit spawn is created just below the door/entity
2. `PixiApp.loadScene()` loads the `targetMapId`
3. Player spawns at `targetSpawnId`

---

## Map Editor

Accessible at `/editor`. Built with PixiJS (separate from the game renderer).

**Two-tier persistence**:
- **localStorage** — instant working buffer, survives quick refreshes, key: `editor-map:<mapId>`.
- **Disk** — debounced POST to `/api/maps/[id]` → writes `data/<mapId>.json`. This is what the game reads at boot to override compiled maps.

When the editor loads, it fetches from `/api/maps/<mapId>` first (disk), falling back to localStorage, then to the compiled map. Undo/redo stacks are maintained in-editor (`editorState.ts`). Cmd/Ctrl+Z is bound.

The editor reuses `buildTransitionLayer` and `buildAutoTileLayer` from the game renderer, so painted tiles render with the same dual-grid shorelines as in-game. Objects can be placed tile-snapped by default, with free placement and per-object scale/resize supported.

---

## API Routes

- `GET  /api/maps` — list all maps on disk as `{ maps: { [id]: MapData } }`.
- `GET  /api/maps/[id]` — fetch one map's JSON.
- `POST /api/maps/[id]` — overwrite `data/<id>.json`. Id must match `^[a-z0-9][a-z0-9-]*$` and body must include `tiles`, `width`, `height`.

---

## Performance Notes

- **Viewport culling**: Only sprites in the visible area (+ margin) are rendered
- **Stress test mode**: `?objects=Nx` (e.g., `?objects=4x`) multiplies decorative objects — tests renderer at scale
- **Seeded randomness**: NPC wander and idle animations are deterministic per object ID (same every session)
- **Default zoom** is 3.0 (range 2.0–4.0). The viewport fills the window (`100vw × 100dvh`) and the canvas auto-resizes to its container.

---

## Included Maps

| ID | Role | Size |
|----|------|------|
| `pokemon` | Outdoor starter town | 80×50 @ 16 px |
| `pokemon-house-1f` | Interior, ground floor | 16 px |
| `pokemon-house-2f` | Interior, upper floor (reached via staircase) | 16 px |

The old Stardew-branch maps (`outdoor`, `cafe`, `restaurant`, `bookstore`, `market`, `bakery`, `inn`, `blacksmith`) exist only on earlier branches.

---

## Asset Conventions

All sprites live under `/public/assets/`:
- `/public/assets/placeholder/*.png` — entity and tile sprites (16×16 tiles, variable entity sizes)
- `/public/assets/tileset-*.png` — 4×4 wang sheets of 16×16 tiles for the auto-tileset pipeline
- `/public/assets/audio/` — music and SFX

The `AssetLoader` (`src/renderer/AssetLoader.ts`) loads them by key. Sprite keys match `spriteKey` fields in map data.
