@AGENTS.md

# Lingo Map — Codebase Guide

## What Is This?

A **2.5D pixel-art exploration game** (vertical slice / prototype). The player walks around an outdoor town, enters buildings, talks to NPCs, and explores multiple indoor scenes. Built as a web app with a mobile-friendly design (tap, pinch-to-zoom) and a bundled in-browser map editor.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (app router) + React 19 |
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
Map Data (src/maps/*.ts compiled from data/*.json)
```

**Key principle**: `src/core/` has zero React or PixiJS imports. It could run anywhere.

---

## Directory Structure

```
src/
  app/              Next.js pages (/, /editor)
  core/             Game logic (movement, collision, pathfinding, etc.)
  renderer/         PixiJS rendering + input
  ui/               React components (overlays, minimap, dialogue)
  editor/           In-browser map editor (PixiJS-based)
  maps/             Compiled map data (TypeScript modules)
data/               Raw map JSON (source of truth)
public/assets/placeholder/  All sprite PNGs (136+ files)
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

### RenderSystem (`src/renderer/RenderSystem.ts`)
Manages all sprites across 4 ordered layers:
1. **Ground** — tile sprites
2. **Transitions** — dithered tile-edge blends
3. **Entities** — objects, NPCs, player (depth-sorted by Y position via `zIndex`)
4. **Roofs** — building roofs, always on top

Viewport culling hides sprites outside the visible area for performance.

### InputAdapter (`src/renderer/InputAdapter.ts`)
Normalizes keyboard (WASD/arrows), mouse (click-to-move), and touch (tap/pinch-zoom) into a pure `InputState` object with no DOM coupling.

### Core Systems (all in `src/core/`)

| File | Responsibility |
|------|---------------|
| `PlayerSystem.ts` | Movement (direct/target/path modes), facing direction |
| `CollisionSystem.ts` | AABB collision with axis-independent sliding |
| `Pathfinding.ts` | A* on a 16 px grid for click-to-move |
| `CameraSystem.ts` | Centers on player, clamps to map bounds, handles zoom |
| `InteractionSystem.ts` | NPC dialogue trigger (E/Space, within 64 px) |
| `TriggerSystem.ts` | Door triggers → scene transitions with dynamic exit spawns |
| `NPCWanderSystem.ts` | NPC idle wandering (idle/walking state machine, seeded random) |
| `MapLoader.ts` | Registry pattern: maps registered by ID, loaded on demand |
| `GameBridge.ts` | Event emitter (game → React UI) |
| `CommandQueue.ts` | Command queue (React UI → game) |

---

## Map Data Format

Maps are defined in `data/*.json` and compiled to `src/maps/*.ts`. Key fields:

```typescript
{
  id: string;
  width: number; height: number;  // in tiles
  tileSize: number;               // 32 px
  tiles: TileType[][];            // [row][col]: "grass"|"path"|"wall"|"floor"|"water"|"bridge"
  objects: Entity[];              // trees, rocks, decorations
  buildings: Building[];          // base + roof sprites, doorTrigger, targetMapId
  npcs: NPCData[];                // name, dialogue[], wanderRadius
  triggers: Trigger[];            // generic door colliders
  spawnPoints: SpawnPoint[];      // named spawn locations
}
```

**Important conventions:**
- All world positions are in **pixels**, not tiles
- Entities are positioned by their **feet** (anchor Y = 1.0)
- `sortY` is **explicit** on each entity — not derived from position
- Collision boxes are **explicit offsets** — not derived from sprite size
- This lets placeholder sprites be swapped without touching logic

---

## Tile Types & Walkability

| Tile | Walkable? |
|------|----------|
| `grass`, `path`, `floor`, `bridge` | Yes |
| `wall`, `water` | No (blocked) |

---

## Scene Transitions

`TriggerSystem` detects when the player overlaps a `doorTrigger` on a `Building` or a standalone `Trigger`. On overlap:
1. A dynamic exit spawn is created just below the door
2. `PixiApp.loadScene()` loads the `targetMapId`
3. Player spawns at `targetSpawnId`

---

## Map Editor

Accessible at `/editor`. Built with PixiJS (separate from the game renderer). Maps are auto-saved to `localStorage` as JSON. Playtesting opens the game with `?map=custom`.

Editor state lives in `src/editor/editorState.ts`. Persistence in `src/editor/mapStorage.ts`. Undo/redo stacks are maintained in-editor.

---

## Performance Notes

- **Viewport culling**: Only sprites in the visible area (+ margin) are rendered
- **Stress test mode**: `?objects=Nx` (e.g., `?objects=4x`) multiplies decorative objects — tests renderer at scale
- **Seeded randomness**: NPC wander and idle animations are deterministic per object ID (same every session)

---

## Included Maps

outdoor, cafe, restaurant, bookstore, market, bakery, inn, blacksmith, plus any custom editor maps.

---

## Asset Conventions

All sprites are in `/public/assets/placeholder/*.png` (32×32 tiles, variable entity sizes). The `AssetLoader` (`src/renderer/AssetLoader.ts`) loads them by key. Sprite keys match `spriteKey` fields in map data.
