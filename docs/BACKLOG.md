# Backlog — bugs and improvements

Living list of known issues and improvements, captured as they're spotted
in playtesting. Each entry has a short ID so we can reference it from
commit messages and PRs (e.g., "fix BL-04: tap-to-move broken in
interiors"). Items move to a "Done" section when shipped or get
deleted/re-scoped if the underlying assumption changes.

The order here is rough notebook order, not priority order.

---

## BL-01 — Cars don't collide with player or NPCs

Currently the player and wandering NPCs walk straight through cars on
the road. Cars should behave like any other collidable object — both
the player's collision resolver and the NPC walk-grid should treat car
sprites as solid obstacles (with collision boxes that follow the moving
sprite each frame, since cars aren't static).

Knock-on effects to think about:

- Pathfinding: the walk-grid is built once at scene mount; cars move
  every frame, so per-frame moving obstacles need a different mechanism
  than the static grid (probably mirror the existing NPC-as-obstacle
  pattern from Pathfinding.ts but per-tick).
- Cars bumping into the player: do we want the car to stop, swerve, or
  push the player? Easiest is "stop", but that's also boring.

Files: [src/core/CollisionSystem.ts](../src/core/CollisionSystem.ts),
[src/core/Pathfinding.ts](../src/core/Pathfinding.ts),
[src/core/CarSystem.ts](../src/core/CarSystem.ts)

---

## BL-02 — Hard to tell main character apart from NPCs

The player and the 20 NPCs are all sliced from the same Modern Interiors
premade-character set, so visually they read as the same kind of
sprite. In playtesting, when the camera is busy and there's a crowd, you
lose track of which one is "you".

Easiest options:

- Persistent visual marker (small triangle / pulsing arrow above the
  player head)
- Distinct outfit / color hue applied to the player sprite only
- Subtle outline shader on the player sprite

Files: [src/renderer/RenderSystem.ts](../src/renderer/RenderSystem.ts),
[src/core/PlayerSystem.ts](../src/core/PlayerSystem.ts)

---

## BL-03 — Yellow building doesn't fade for occlusion

There's a yellow building (the multi-piece one — likely composed of
several pack-single sprites stitched together in the editor) where the
player walks behind it but the building stays at full opacity. Other
buildings fade as expected.

Probable cause: the occlusion-fade filter in RenderSystem only applies
to sprites tagged with `width >= MIN_OCCLUDER_WIDTH` and
`height >= MIN_OCCLUDER_HEIGHT`. Each individual piece of the
multi-piece building is below that threshold, so the filter skips them
all even though the composite reads as one tall building.

Possible fixes:

- Lower the threshold (risk: more occlusion checks → frame-rate)
- Tag pieces in the editor with a "force occluder" flag
- Group composed pieces in the editor and treat the group as one
  occluder

Files: [src/renderer/RenderSystem.ts](../src/renderer/RenderSystem.ts) —
search for `MIN_OCCLUDER_WIDTH`

---

## BL-04 — Interior tap-to-move broken; player drifts in one direction

After entering an interior map, taps on the canvas don't pathfind
correctly. The player keeps walking in one constant direction
regardless of where you tap.

Hypotheses to check:

- Coordinate mismatch: interior maps have a viewport cap
  (`maxViewTiles`), and the camera offset uses a different formula. If
  the screen→world conversion in InputAdapter doesn't account for the
  cap's centering offset, every tap resolves to a position off-map and
  pathfinding falls back to the straight-line `target` mode, which
  presents as "drifts in one direction".
- Pinch-after-tap leak (we patched a similar one earlier — double-check
  it didn't regress on interior scenes).
- The walk grid built at scene mount might have a wrong row/col
  ordering for the rotated/smaller interior dimensions.

Files: [src/renderer/InputAdapter.ts](../src/renderer/InputAdapter.ts),
[src/core/Pathfinding.ts](../src/core/Pathfinding.ts),
[src/renderer/PixiApp.ts](../src/renderer/PixiApp.ts)
(viewport-cap math)

---

## BL-05 — Player can be pinned by an NPC and frozen until NPC moves

The player's collision resolver treats NPCs as solid AABBs. If an NPC
wanders directly onto the player's tile and stops (idle phase), the
player can no longer move at all in any direction until the NPC's idle
timer expires and they wander off.

Fix sketch: the collision resolver should let the player push past or
nudge through stationary NPCs (or NPCs should yield the tile when the
player walks into them — easier given the wander system already has a
"pick a new target" hook).

Files: [src/core/CollisionSystem.ts](../src/core/CollisionSystem.ts),
[src/core/NPCWanderSystem.ts](../src/core/NPCWanderSystem.ts)

---

## BL-06 — Dialogue box UI is plain; should match pixel-art aesthetic

The current `DialogueOverlay` is a basic rounded-rectangle with white
text and a yellow NPC name — fine for a vertical slice but it doesn't
sell the world. Want something with a pixel-art frame (corner sprites

- tiled border + per-character text reveal animation).

Files: [src/ui/DialogueOverlay.tsx](../src/ui/DialogueOverlay.tsx)

---

## BL-07 — NPC tap zone too small, only the feet register

The current NPC hit-box is sprite-sized (16w × 32h plus a 4px finger
fudge), centered on the feet anchor. In practice, taps near the head or
upper body sometimes don't register as "talk to NPC" — players
intuitively tap the body, not the feet.

Fix: enlarge the tap zone to a generous bounding rectangle that covers
the full sprite plus a few pixels of slack, especially at the head/top
where players actually look.

Recent context: we deliberately TIGHTENED this earlier (was a 96×96
circle that triggered accidental NPC taps every time you tried to
walk near one). Need to find the middle ground — big enough that
intentional taps work, small enough that walk-near taps don't trigger
dialogue accidentally.

Files: [src/renderer/InputAdapter.ts](../src/renderer/InputAdapter.ts) —
search for `NPC_TAP_FUDGE`

---

## BL-08 — Door triggers fire when walking past horizontally

When the player walks left↔right past a building's front edge, they
sometimes accidentally enter the building because they pass through
the door trigger. Door triggers should only fire when the player
approaches "into" the door (i.e., walking up→down or vertical
into-the-doorway), not when sliding past.

Fix sketch: the trigger system already has the player's facing
direction; require facing == 'up' for an outdoor → interior trigger to
fire. (Or check the player's velocity vector dotted with the door's
inward normal > 0.)

Files: [src/core/TriggerSystem.ts](../src/core/TriggerSystem.ts)

---

## BL-09 — Cars deadlock through each other on the road

Two cars approaching each other on the road clip through one another
(same root cause as BL-01 essentially, but specifically between cars).
Long-term we want a more sophisticated traffic model — yield at
intersections, slow down when a car is ahead, etc.

Short-term fix that's still better than nothing: AABB check between
cars, the lower-priority car waits at the cell boundary until the
other has cleared.

Files: [src/core/CarSystem.ts](../src/core/CarSystem.ts)

---

## BL-10 — Exit-from-interior sometimes spawns at the wrong place (not necessarily building, i still dont understand how) — DONE (f1 case)

---

## BL-11 — Add an on-screen virtual D-pad for mobile — DONE

Tap-to-move and click-to-walk are fine for "go to that spot", but for
nimble play (dodging cars, corner-cutting around buildings) the user
wants a virtual D-pad on mobile: bottom-left corner, four arrow
buttons, hold-to-move, finger-slide between them to change direction
without lifting. Should feel like a Game Boy d-pad.

Implementation notes:

- The InputAdapter already supports keyboard `up/down/left/right`. The
  D-pad just needs to push the same boolean flags into `InputState`.
- Should hide on desktop (or always-show but small? play-tester
  preference).
- Touch-anchored: first finger anywhere in the D-pad zone becomes the
  "up" reference, then translation chooses direction. Avoids forcing a
  specific finger placement.
- Don't break the existing pinch-to-zoom (which uses two-finger
  gestures).

Files: [src/renderer/InputAdapter.ts](../src/renderer/InputAdapter.ts),
new component for the D-pad UI (probably in `src/ui/`)

## BL-12: Where is f2? why cant go to f2?

## BL-13: When tap NPC, NPC should stop moving, then character should approach it, and only then shows the dialogue. Currently when tapped, it moves to NPC, but i need to tap again to show dialogue

## BL-14: when first load game in portrait, see the outside of map at the bottom, but when switch to landscape, no longer see it, then switch back to portrait, no longer see it, which is good. but we need to need to fix so that first load game in portrait doesn't show the outside of the map at the bottom (black space) — DONE

---

## BL-15 — Interior maps (f1 / f2) have corrupted disk overrides

**Root cause shipped in v0.1.40** ([src/editor/EditorCanvas.tsx:357](../src/editor/EditorCanvas.tsx#L357)):
the editor's disk-load effect filtered loaded maps with
`if (!data?.tiles || !data.width ...) return`. New-format saves don't
carry a top-level `tiles` array — tiles live inside `layers[0].tiles`.
Loading an interior in the new format thus silently bailed; but
`diskLoadedRef.current = true` fired in `.finally`, the auto-save
effect ticked, and wrote the editor's CURRENT state (reduced-layers,
scale-1 fallback from compiled map / localStorage) back over the disk
file. Opening f1/f2 in the editor was destroying them every time.

The "fix white mask issue" commit on 2026-04-29 (7feb02e) is just one
of these clobbers that happened to land in git. Every commit since
then that touched these JSONs is the same destructive auto-save.

**The fix already shipped (v0.1.40)**: load-filter accepts either
`tiles` or `layers`, and import passes `data.tiles ?? []` since
`buildImportedLayers` derives content from layers when provided.

**Still owed (this BL):**

- Restore the actual interior layouts. Disk files are corrupt; pick:
  1. `git checkout f33c90e -- data/pokemon-house-{1f,2f}.json` to
     get the pre-corrupt-but-tiny state and re-scale up in editor
  2. `rm data/pokemon-house-{1f,2f}.json` to fall back to the
     compiled `src/maps/pokemon-house-{1f,2f}.ts` originals (clean
     RSE-style layout)
  3. Lay them out fresh in the editor (now safe with v0.1.40)
- Harden the editor's resize/save against schema-skew bugs like
  this. The pattern "filter rejects → flag still flips → auto-save
  destroys" is generic and worth auditing other load paths for.

What changed in 7feb02e specifically (since it's already in history):

- Both files: object scales were reset to 1.0. Before, almost every
  furniture entity was at scale ≈0.15 (tiny — the editor's resize
  feature had previously shrunk everything). After, they're at full
  natural size, which makes f1's interior look "suddenly so big".
- `data/pokemon-house-2f.json` additionally has 7/11 objects placed
  off-map: `wall-painting`, `wall-clock`, `wall-staircase`, `bed`,
  bookshelves, `rug-large` are at negative y coords or x=760
  (way outside the 320px-wide interior). Same root cause as the
  resize feature's content-shift edge case.
- The legacy top-level `tiles` array got stripped from both files.
  Tiles are now stored under `layers[0].tiles` (new schema) — that
  part is intentional and not the bug, but it complicates any
  manual revert because the schemas differ.

Diagnosis: the editor's resize/save pipeline — likely the same
content-shift edge case noted in `project_editor_resize_in_progress`
memory — corrupted both files in one save.

**Three known options if/when we come back to this:**

1. `git checkout f33c90e -- data/pokemon-house-{1f,2f}.json` to revert
   to the pre-corrupt state (scales were tiny but at least nothing
   was off-map). One-line "data is precious" rule violation but
   user-authorised in this case.
2. `rm data/pokemon-house-{1f,2f}.json` so the compiled
   `src/maps/pokemon-house-{1f,2f}.ts` originals take over (clean,
   matches the original Pokémon-RSE layout).
3. Open f1/f2 in the editor and lay them out again from scratch.

**Adjacent fix to do alongside whichever option we pick**: harden
the editor's resize feature against this content-shift bug so the
next resize doesn't redo the damage. That's
`project_editor_resize_in_progress.md`'s open work.

Files: [data/pokemon-house-1f.json](../data/pokemon-house-1f.json),
[data/pokemon-house-2f.json](../data/pokemon-house-2f.json),
[src/editor/](../src/editor/) (resize logic)

## BL-16: Occasional landscape black half screen

## BL-17: Disable magnifying glass effect on mobile/PWA

## BL-18L It is possible that NPC/character get stuck forever with the cars. Cases that i see were: main character got stuck next to a car and cannot move. Another case NPC also got stuck and cannot move

## Done

- **BL-04 — Interior tap-to-move broken.** `RenderSystem.updateCamera`
  centers the world via `offsetX/offsetY` on viewport-capped maps;
  `InputAdapter`'s screen→world conversion was missing that subtract.
  Added `screenOffset` to InputAdapter, mirrored the centering math in
  `PixiApp.update` ahead of `getInputState()`. Outdoor/uncapped maps
  unchanged (offset is (0,0)).
- **BL-05 — Player pinned by NPC.** Dropped NPCs from
  `resolveMovement`'s collision set. Player walks through NPCs;
  dialogue still gated on `INTERACTION_RANGE` so "talk to NPC" works
  the same.
- **BL-07 — NPC tap zone too small.** Bumped `NPC_TAP_FUDGE` from 4 to
  8 in `InputAdapter`. Hit area went from 24×40 around feet to 32×48
  around the full sprite — registers head/upper-body taps now without
  being so big it triggers on adjacent walks.
- **BL-08 — Doors fire when sliding past.** `checkDoorTriggers` now
  takes the player's `facing` direction and only fires building doors
  when `facing === 'up'`. Map-level triggers (staircases, etc.) still
  fire from any direction since their geometry is map-author owned.
- **BL-10 — Exit from f1 spawned far from the house.** The outdoor
  map enters f1 via an `Entity.transition` (not a `Building.doorTrigger`),
  so the engine never registered `gameState.returnSpawnId` and the
  override-on-exit path was dead. Compounded by a hardcoded `1f-exit`
  trigger in the compiled `pokemon-house-1f.ts` pointing at the static
  `from-house` outdoor spawn — that rectangle overlapped the doormat's
  auto-generated trigger and won the iteration order in
  `checkDoorTriggers`, sending the player to the wrong location.
  Removed the hardcoded trigger and moved the exit transition onto
  the compiled doormat entity (`targetSpawnId: 'outdoor-houseA-door'`
  — the dynamic spawn registered next to the outdoor house entry).
  Grocer never had a hardcoded trigger so it was always clean. As
  follow-up: `requiresUpKey: boolean` was generalised to
  `requiresFacing: Direction` so doors at the south wall of a room
  (like the f1 doormat) auto-resolve to `'down'` instead of the
  one-size-fits-all `'up'`. Required direction is derived from
  edge-of-map + walkable-neighbour analysis at trigger creation.
  Tap-to-move now also re-targets to the trigger's approach cell with
  an appended step-into-trigger waypoint, so tapping a door zone walks
  the player straight in instead of orbiting forever when A\* picks an
  approach angle that doesn't fire the facing gate.
- **BL-11 — Mobile virtual D-pad.** New `VirtualDPad.tsx` component:
  touch-anchored, 8-way octant snap (4 cardinals + 4 diagonals at
  22.5° boundary), finger-slide changes direction without lifting.
  Auto-hides on `(pointer: coarse)`-incapable devices (i.e. desktop).
  `InputAdapter.setVirtualDirection()` OR's the d-pad flags into the
  same `InputState.{up,down,left,right}` the keyboard already drives,
  so `PlayerSystem` accepts diagonal input for free.
- **BL-14 — Portrait first-load shows black space at the bottom.**
  `PixiApp.init()` reads `container.getBoundingClientRect()` once at
  init time; on iOS Safari the URL bar can collapse during init and
  the container grows without firing a `window.resize`, so Pixi's
  `resizeTo` never re-syncs. Any `pixiApp.resize()` calls scheduled
  by GameCanvas during init were bailing on `!this.initialized`. Fix:
  call `this.app.resize()` immediately after setting
  `this.initialized = true`, and re-fire resize ticks at 0/120/360/800ms
  from GameCanvas after `startGame()` resolves to catch the URL bar
  settling a few hundred ms later. Rotating used to be the only way
  to recover; now first portrait load is correct.
- **Door-transition fade-to-black.** New `sceneTransitionStart`
  event on `GameBridge`. Fired the instant a door trigger fires;
  PixiApp defers `loadScene` for 220ms so the swap happens under a
  fully-opaque overlay. `GameCanvas` renders a black div with CSS
  opacity transition: 220ms ease-in fade-out → 40ms hold (lets the
  new scene paint its first frame) → 180ms ease-out fade-in. The
  existing `transitioning` flag freezes the player throughout.
