You are a senior game engine + frontend architect.

Your task is to build a **production-structured, scalable 2D pixel-art game prototype** using:

- Next.js (app shell + UI)
- PixiJS (game rendering)

This is NOT a quick prototype. This must be designed so it can scale into a full game.

--------------------------------------------------
🎯 GOAL
--------------------------------------------------

Build a **vertical slice** of a cozy exploration game where:

- The player can walk around an outdoor map
- There are objects like trees and a house
- The player can enter a house (scene transition)
- There is an indoor map with furniture
- There is at least one NPC with simple interaction

Additional behavior requirements:

- The player should be able to click/tap on a walkable point in the world and automatically move there
- The camera should follow the player and keep them centered when possible

The system MUST be designed so that:

1. Placeholder assets can be replaced later WITHOUT changing logic
2. The game can scale to large maps with many objects and NPCs
3. The architecture can later be reused in React Native

--------------------------------------------------
🎮 GAME STYLE (VERY IMPORTANT)
--------------------------------------------------

The game uses a **2.5D top-down (3/4 angled) perspective**, similar to Stardew Valley.

This is NOT a true top-down view.

You MUST implement the following technical rules:

1. Player position is defined by the **feet (bottom center of sprite)**

2. Depth sorting:
   - All entities must be sorted by their **Y position (feet Y)**
   - Lower on screen = rendered in front

3. Buildings MUST be split into:
   - base layer (walls, doors)
   - roof/top overlay (rendered above player when behind)

4. Collision:
   - Only the ground-contact area is collidable
   - DO NOT use sprite width/height for collision

5. Sprites can be larger than tiles:
   - Trees, houses, etc. may span multiple tiles
   - But logical position must align with tile grid

6. The world is still **tile-based (grid system)** underneath

--------------------------------------------------
🧠 ARCHITECTURE (CRITICAL)
--------------------------------------------------

You MUST strictly separate:

1. Game Core (pure logic, no rendering)
2. Renderer (PixiJS only)
3. UI Layer (Next.js components)

DO NOT mix these.

--------------------------------------------------
📁 REQUIRED PROJECT STRUCTURE
--------------------------------------------------

Create a clean structure like:

/assets        → images (placeholder pixel art)
/maps          → map data (JSON or TS)
/core          → game logic (movement, collision, sorting)
/renderer      → PixiJS rendering layer
/ui            → Next.js UI (dialogue, overlays)

--------------------------------------------------
🗺️ MAP SYSTEM (DATA-DRIVEN)
--------------------------------------------------

Maps MUST be defined as structured data, NOT hardcoded.

Example structure:

{
  id,
  width,
  height,
  tileSize,
  tiles,
  objects,
  buildings,
  npcs,
  triggers
}

--------------------------------------------------
🧱 ENTITY STRUCTURE
--------------------------------------------------

Each object/NPC/building must include:

{
  id,
  x,
  y,
  sprite,
  anchor,
  sortY,
  collisionBox
}

--------------------------------------------------
🏠 BUILDINGS
--------------------------------------------------

Each building must include:

{
  baseSprite,
  roofSprite,
  collisionBox,
  doorTrigger,
  targetMapId
}

--------------------------------------------------
🎮 SYSTEMS TO IMPLEMENT
--------------------------------------------------

1. Player movement
   - Support 4-direction movement
   - Player logical position is based on feet (bottom center)
   - Support click/tap-to-move: when the user clicks/taps a walkable point, the player should move toward that destination
   - For this vertical slice, keep movement logic simple and reliable (no need for complex pathfinding unless necessary)

2. Collision system
   - Support tile-based and object-based collision
   - Prevent walking through blocked areas
   - Collision must use explicit collision data, not sprite size

3. Camera system
   - Camera follows the player
   - Camera keeps the player centered when possible
   - Camera must clamp to map bounds (no showing outside map)
   - Must work for both indoor and outdoor maps

4. Depth sorting
   - Use Y-based sorting
   - Lower on screen renders in front
   - Player sorting must use feet position

5. Scene switching
   - Support transitions between outdoor and indoor maps
   - Entering a building places player at correct indoor spawn
   - Exiting returns player to correct outdoor position

6. Basic NPC interaction
   - At least one NPC with simple text interaction
   - System should be extensible for future dialogue systems

--------------------------------------------------
🎨 PLACEHOLDER ASSETS (IMPORTANT)
--------------------------------------------------

Generate SIMPLE pixel-art placeholder assets with:

- NO anti-aliasing
- crisp pixel edges
- PNG format
- consistent scale

Use these approximate sizes:

- tile: 32x32
- player: ~32x48
- tree: ~64x96
- house: ~128x128

Assets required:

- grass tile
- path tile
- tree
- rock/bush
- house base
- house roof
- player (4 directions)
- 1 NPC
- interior floor
- interior wall
- simple furniture

--------------------------------------------------
🔁 WORKFLOW REQUIREMENTS (VERY IMPORTANT)
--------------------------------------------------

Design everything so that:

PHASE 1:
- works fully with placeholder assets

PHASE 2:
- assets can be replaced WITHOUT touching logic

PHASE 3:
- new maps, NPCs, objects can be added easily

This is CRITICAL.

--------------------------------------------------
🚫 DO NOT DO THESE
--------------------------------------------------

- DO NOT hardcode object positions inside rendering code
- DO NOT derive collision from sprite size
- DO NOT mix UI and game logic
- DO NOT put everything in one file
- DO NOT tightly couple assets with behavior

--------------------------------------------------
📦 OUTPUT REQUIREMENTS
--------------------------------------------------

Provide:

1. Working Next.js project structure
2. PixiJS game canvas integration
3. All core systems implemented
4. Example outdoor map + indoor map
5. Placeholder assets
6. Clean, readable, well-commented code

--------------------------------------------------
🧠 MOST IMPORTANT RULE
--------------------------------------------------

Build this as a **production-structured, data-driven game foundation where gameplay logic is completely independent from visual assets**, so that assets can be replaced later without breaking the system.

--------------------------------------------------