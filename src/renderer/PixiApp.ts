import { Application } from 'pixi.js';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DECOR_SPRITE_KEYS } from '../core/constants';
import { GameState, MapData, TileType } from '../core/types';
import { loadMap, getSpawnPoint } from '../core/MapLoader';
import { buildStressMap, StressOptions } from '../core/MapStress';
import { createPlayer, updatePlayer } from '../core/PlayerSystem';
import { resolveMovement } from '../core/CollisionSystem';
import { updateCamera, getViewportWorldSize } from '../core/CameraSystem';
import { checkDoorTriggers } from '../core/TriggerSystem';
import { checkInteraction, advanceDialogue } from '../core/InteractionSystem';
import { GameBridge } from '../core/GameBridge';
import { CommandQueue } from '../core/CommandQueue';
import { buildWalkGrid, findPath } from '../core/Pathfinding';
import { NPCWanderState, initWanderStates, updateWanderStates } from '../core/NPCWanderSystem';
import { buildCarNetwork, carAABB, CAR_SPRITE_SETS, CarCollisionBox, CarNetwork, CarSystemState, createCarSystemState, lookAheadBox, spriteKeyForCar, updateCars } from '../core/CarSystem';
import { getTexture, loadAssets, loadPackSingle } from './AssetLoader';

/** localStorage key kept in sync with `data/car-collisions.json` by the
 * editor. The runtime no longer reads it (we use the disk file via the
 * API instead) but the constant stays exported for the editor's cache. */
const CAR_COLLISIONS_KEY = 'editor:car-collisions';
void CAR_COLLISIONS_KEY;
import { loadAutoTileset } from './AutoTileset';
import { InputAdapter } from './InputAdapter';
import { RenderSystem } from './RenderSystem';
import { DebugOverlay } from './DebugOverlay';
import { TapFeedback } from './TapFeedback';
import { BGMManager } from './BGMManager';

export type PixiAppOptions = StressOptions & {
  musicEnabled?: boolean;
  startMapId?: string;
};

export class PixiApp {
  app: Application;
  private renderSystem: RenderSystem | null = null;
  private inputAdapter: InputAdapter;
  private gameState: GameState | null = null;
  private currentMap: MapData | null = null;
  /** Last cell coordinates we printed to the console, so we only log on
   * tile-cell crossings rather than every pixel-level move. Reset when
   * the active map changes so cell `(0,0)` of map B logs even if we just
   * left cell `(0,0)` of map A. */
  private lastLoggedCell: { mapId: string; col: number; row: number } | null = null;
  private transitioning = false;
  private initialized = false;
  private destroyed = false;
  private walkGrid: boolean[][] | null = null;
  private npcWanderStates: NPCWanderState[] = [];
  private tapFeedback: TapFeedback | null = null;
  private bgm: BGMManager;
  /** Ambient-traffic state for the current map. Null when the map has no
   * car-path layer painted (so most interior maps stay car-free). Built
   * by `loadScene` and torn down on scene change. */
  private carSystemState: CarSystemState | null = null;
  private carNetwork: CarNetwork | null = null;
  /** Toggle for the per-frame collision-box debug overlay. Backtick (`)
   * flips it. When on, every player + NPC + car AABB renders as a
   * coloured rect, and each car's look-ahead box renders in a different
   * shade so you can see what the obstacle test is actually checking. */
  private debugShowCollisions = false;
  private debugKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  /** Frame counter for the path/target "give up" guard. Each tick the
   * player is in path/target mode but didn't actually move (collision
   * blocked us, or pathfinding sent us at an obstacle), this
   * increments. After STUCK_FRAMES_LIMIT, we try to re-path from the
   * current position to the same final goal — a stale grid or an NPC
   * that moved can leave the original waypoints invalid even though
   * a route still exists. If re-path also fails or we've already
   * retried twice, drop to direct mode and let the user re-tap. */
  private stuckFrames = 0;
  private rePathAttempts = 0;
  /** Per-sprite collision overrides loaded from `data/car-collisions.json`
   * via the API. Cached here for the lifetime of the scene so the
   * resolver in the per-frame tick is allocation-free. Empty until the
   * fetch resolves (CarSystem falls back to a tile-sized box meanwhile). */
  private carCollisionOverrides: Record<string, CarCollisionBox> = {};
  readonly bridge: GameBridge;
  readonly commandQueue: CommandQueue;
  private debugOverlay: DebugOverlay | null = null;
  private readonly options: PixiAppOptions;

  constructor(options: PixiAppOptions = {}) {
    this.app = new Application();
    this.inputAdapter = new InputAdapter();
    this.bridge = new GameBridge();
    this.commandQueue = new CommandQueue();
    this.bgm = new BGMManager(options.musicEnabled ?? true);
    this.options = options;
  }

  private container: HTMLDivElement | null = null;

  async init(container: HTMLDivElement): Promise<void> {
    this.container = container;

    const rect = container.getBoundingClientRect();
    await this.app.init({
      width: rect.width || VIEWPORT_WIDTH,
      height: rect.height || VIEWPORT_HEIGHT,
      backgroundColor: 0x000000,
      antialias: false,
      // Match the screen's pixel density so 1 renderer pixel == 1
      // device pixel. Without this, the canvas was internally at
      // logical-pixel resolution and the browser CSS-stretched it up
      // by devicePixelRatio (≈3 on mobile), nearest-neighboring at
      // every redraw — that browser-side upscale was the source of the
      // intermittent shimmer at low zoom on mobile. autoDensity sets
      // the matching CSS size automatically.
      resolution: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
      autoDensity: true,
      resizeTo: container,
      // Snap sprite world-positions to whole pixels at draw time. Without
      // this, fractional camera movement (player.x is a float, so
      // worldContainer.x = -cameraX * zoom is also fractional) causes
      // sprites to sample across texel boundaries each frame —
      // imperceptible on desktop, but on mobile with devicePixelRatio
      // 2-3 it shows up as a visible per-frame shimmer/jitter.
      roundPixels: true,
    });

    // If destroy() was called while we were awaiting, bail out
    if (this.destroyed) return;

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    container.appendChild(canvas);

    this.inputAdapter.attach(canvas);

    if (process.env.NODE_ENV === 'development') {
      this.debugOverlay = new DebugOverlay(container);
    }

    // Backtick toggles the collision-box debug overlay. We attach to
    // `window` (not the canvas) so the toggle works even when the canvas
    // doesn't have keyboard focus — matching the user's expectation
    // that pressing the key from anywhere on the page just works.
    this.debugKeydownHandler = (e: KeyboardEvent) => {
      // Backquote / backtick — distinct enough from gameplay keys.
      if (e.code === 'Backquote') {
        this.debugShowCollisions = !this.debugShowCollisions;
        if (!this.debugShowCollisions) this.renderSystem?.clearDebugCollisions();
        if (process.env.NODE_ENV === 'development') {
          console.log(`[PixiApp] collision-box debug overlay: ${this.debugShowCollisions ? 'ON' : 'OFF'}`);
        }
      }
    };
    window.addEventListener('keydown', this.debugKeydownHandler);

    // Load the grass↔water auto-tileset before the first scene so RenderSystem
    // can paint the dual-grid layer immediately rather than waiting for a paint.
    await loadAutoTileset();

    await this.loadScene(this.options.startMapId ?? 'outdoor', 'default');

    if (this.destroyed) return;

    this.initialized = true;

    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaMS / 1000);
    });

    // Earlier we kicked off a `preloadAllAssets()` here to make scene
    // transitions instant. The cost: ~3 MB of PNGs fetched in the
    // background during the most fragile moment of the cold start —
    // competing for bandwidth with the user's first inputs and the
    // car-sprite preload that already runs in `loadScene`. Scene
    // transitions instead lazy-load whatever the destination map
    // actually needs (via `loadAssets` inside `loadScene`); first door
    // entry pays a small one-time cost, every subsequent entry hits
    // the SW cache (cache-first for `/assets/*`).
  }

  private async loadScene(mapId: string, spawnId: string): Promise<void> {
    const rawMap = buildStressMap(loadMap(mapId), this.options);
    // Fix sortY for decor sprites that may have been saved with the wrong
    // value (older editor versions set sortY = feet position instead of
    // feet - 1000). Without this, the player can walk behind rugs etc.
    const baseMap = {
      ...rawMap,
      objects: rawMap.objects.map(o =>
        DECOR_SPRITE_KEYS.has(o.spriteKey) && o.sortY > o.y - 100
          ? { ...o, sortY: o.y - 1000 }
          : o
      ),
    };
    // Auto-generate door triggers from entities with `transition` metadata
    // (e.g., staircases). Trigger zone covers the bottom row of the entity's
    // visual footprint so clicking anywhere on the sprite walks the player
    // into a forgiving 2-tile-wide zone.
    const transitionEntities = baseMap.objects.filter(o => o.transition);
    const T = baseMap.tileSize;
    // Trigger zone: covers walkable tiles on the entity's feet row, up to 2
    // tiles wide. Skips wall cells so the trigger only spans tiles the player
    // can physically reach (otherwise half the zone might sit over a wall).
    const isWalkableTile = (tile: string): boolean => {
      return tile !== TileType.WALL
        && tile !== TileType.WALL_INTERIOR
        && tile !== TileType.WALL_INTERIOR_BOTTOM
        && tile !== TileType.WALL_INTERIOR_LEFT
        && tile !== TileType.WALL_INTERIOR_RIGHT
        && tile !== TileType.WALL_INTERIOR_TOP
        && tile !== TileType.WALL_INTERIOR_TOP_LEFT
        && tile !== TileType.WALL_INTERIOR_TOP_BL
        && tile !== TileType.WALL_INTERIOR_TOP_BR
        && tile !== TileType.WALL_INTERIOR_TOP_CORNER_BL
        && tile !== TileType.WALL_INTERIOR_TOP_CORNER_INNER_TR
        && tile !== TileType.WALL_INTERIOR_CORNER_BOTTOM_LEFT
        && tile !== TileType.WALL_INTERIOR_CORNER_BOTTOM_RIGHT
        && tile !== TileType.WATER
        && tile !== TileType.VOID;
    };
    const dynamicTriggers = transitionEntities.flatMap((o, i) => {
      // Explicit trigger rectangle (set by the editor's Door section)
      // takes precedence over the legacy auto-derivation. Offsets are
      // relative to the entity's x/y, same convention as collisionBox.
      const tb = o.transition!.triggerBox;
      if (tb && tb.width > 0 && tb.height > 0) {
        return [{
          id: `auto-${o.id}-${i}`,
          x: o.x + tb.offsetX,
          y: o.y + tb.offsetY,
          width: tb.width,
          height: tb.height,
          type: 'door' as const,
          targetMapId: o.transition!.targetMapId,
          targetSpawnId: o.transition!.targetSpawnId,
        }];
      }
      // Legacy auto-shape for entities without an explicit triggerBox
      // (predates the editor exposing the field — used by staircases).
      const feetRow = Math.floor((o.y - 1) / T);
      const candidateCols = [
        Math.floor((o.x - T) / T),
        Math.floor(o.x / T),
      ];
      const walkableCols = candidateCols.filter(col => {
        if (feetRow < 0 || feetRow >= baseMap.height || col < 0 || col >= baseMap.width) return false;
        return isWalkableTile(baseMap.tiles[feetRow][col]);
      });
      if (walkableCols.length === 0) return [];
      return [{
        id: `auto-${o.id}-${i}`,
        x: Math.min(...walkableCols) * T,
        y: feetRow * T,
        width: (Math.max(...walkableCols) - Math.min(...walkableCols) + 1) * T,
        height: T,
        type: 'door' as const,
        targetMapId: o.transition!.targetMapId,
        targetSpawnId: o.transition!.targetSpawnId,
      }];
    });
    // Spawn point: anchor on the trigger zone when one is set explicitly,
    // else fall back to the legacy "1 tile below the entity's feet"
    // shape (still correct for staircases, where entity.y IS the door).
    // Anchoring on the triggerBox matters for big building sprites whose
    // feet sit far below the actual door tile — without this fix the
    // returning player materialised in the middle of the building.
    const dynamicSpawns = transitionEntities
      .filter(o => o.transition!.incomingSpawnId)
      .map(o => {
        const tb = o.transition!.triggerBox;
        let x: number, y: number;
        if (tb && tb.width > 0 && tb.height > 0) {
          // Land player just below the trigger zone, centred on it.
          // `+ T` keeps a one-tile buffer so spawning doesn't immediately
          // re-fire the door trigger and bounce the player back inside.
          x = o.x + tb.offsetX + tb.width / 2;
          y = o.y + tb.offsetY + tb.height + T;
        } else {
          x = o.x;
          y = o.y + T;
        }
        return {
          id: o.transition!.incomingSpawnId!,
          x,
          y,
          facing: 'down' as const,
        };
      });
    const mergedSpawns = dynamicSpawns.length > 0
      ? [
          ...baseMap.spawnPoints.filter(s => !dynamicSpawns.some(d => d.id === s.id)),
          ...dynamicSpawns,
        ]
      : baseMap.spawnPoints;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[loadScene ${mapId}] transition entities:`, transitionEntities.length, 'triggers:', dynamicTriggers, 'spawns:', dynamicSpawns);
    }
    const map = (dynamicTriggers.length > 0 || dynamicSpawns.length > 0)
      ? { ...baseMap, triggers: [...baseMap.triggers, ...dynamicTriggers], spawnPoints: mergedSpawns }
      : baseMap;
    this.currentMap = map;
    const spawn = getSpawnPoint(map, spawnId);
    const player = createPlayer(spawn);

    // Build the asset set for this map. Pack-tile refs (`me:<theme>/<file>`)
    // are passed straight through — `loadAssets` knows how to fetch them.
    const requiredAssets = RenderSystem.getRequiredAssets(map);
    const packTiles = new Set<string>();
    for (const row of map.tiles) {
      for (const t of row) {
        if (t.startsWith('me:')) packTiles.add(t);
      }
    }
    await loadAssets([...requiredAssets, ...packTiles]);

    if (this.renderSystem) {
      this.renderSystem.destroy();
    }
    this.renderSystem = new RenderSystem(this.app);
    this.renderSystem.renderTiles(map);
    this.renderSystem.renderObjects(map);
    // Flatten static layers (ground/transition/autotile/floor) into a
    // single RenderTexture sprite — must run BEFORE the first
    // updateCamera so worldContainer's transform is still identity
    // (children render at their local positions inside the bake).
    this.renderSystem.bakeStaticLayers(map);
    this.renderSystem.initPlayer(player);

    // Build the car-traffic graph for this map. Maps without a painted
    // car-path layer simply skip car simulation entirely (most interiors).
    // RenderSystem was just re-created above so any stale car sprites
    // from the prior scene are already gone — but call clearCars()
    // anyway so a non-recreated renderer (future refactor) stays safe.
    this.renderSystem.clearCars();
    this.carNetwork = buildCarNetwork(map);
    this.carSystemState = this.carNetwork ? createCarSystemState() : null;
    if (this.carSystemState) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[CarSystem] enabled on map "${mapId}" — first spawn attempt in ${this.carSystemState.spawnInterval}s, max ${this.carSystemState.maxCars} concurrent`);
      }
      // Reset before the fetch so a previous map's overrides don't
      // bleed in if the file fetch is slow / fails.
      this.carCollisionOverrides = {};
      // Pull the user-edited per-sprite collision boxes from disk. The
      // request is fire-and-forget — the per-frame resolver consults
      // the cached field; until the response lands, CarSystem falls
      // back to texture dimensions (or one tile if textures aren't
      // loaded yet).
      fetch('/api/car-collisions')
        .then(r => r.json())
        .then(data => {
          if (!data || typeof data !== 'object' || Array.isArray(data)) return;
          this.carCollisionOverrides = data as Record<string, CarCollisionBox>;
        })
        .catch(err => console.warn('[CarSystem] failed to load /api/car-collisions, using defaults:', err));
      // Background-preload every car sprite. Intentionally NOT awaited
      // — adding 40 pack-single fetches to the blocking scene-load path
      // was the cause of the multi-second white-screen on reload. Cars
      // that spawn before their textures finish loading momentarily
      // render as the red-rect fallback in RenderSystem; on a typical
      // 12-second spawn interval the textures are ready well before
      // the first car actually appears.
      for (const set of CAR_SPRITE_SETS) {
        for (const k of Object.values(set)) {
          loadPackSingle(k).catch(() => { /* AssetLoader already warns */ });
        }
      }
    }

    const mapW = map.width * map.tileSize;
    const mapH = map.height * map.tileSize;

    this.gameState = {
      currentMapId: mapId,
      player,
      camera: updateCamera(player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height)),
      entities: map.objects,
      buildings: map.buildings,
      npcs: map.npcs,
      activeDialogue: null,
      returnSpawnId: this.gameState?.returnSpawnId ?? null,
      returnMapId: this.gameState?.returnMapId ?? null,
    };

    // Initialize tap feedback (sound + visual indicator)
    if (this.tapFeedback) this.tapFeedback.destroy();
    this.tapFeedback = new TapFeedback(this.renderSystem.getWorldContainer());

    // Build walkability grid for pathfinding
    this.walkGrid = buildWalkGrid(map, map.objects, map.buildings, player.collisionBox);

    // Initialize NPC wandering
    this.npcWanderStates = initWanderStates(map.npcs);

    this.bridge.emit({ type: 'sceneChange', mapId });
    this.bgm.onSceneChange(mapId);
  }

  private update(delta: number): void {
    if (!this.gameState || !this.renderSystem || !this.currentMap || this.transitioning) return;

    const map = this.currentMap;
    const mapW = map.width * map.tileSize;
    const mapH = map.height * map.tileSize;

    this.inputAdapter.cameraOffset = { ...this.gameState.camera };
    this.inputAdapter.playerPos = { x: this.gameState.player.x, y: this.gameState.player.y };
    this.inputAdapter.npcs = this.gameState.npcs;
    const input = this.inputAdapter.getInputState();

    // Process commands from UI
    for (const cmd of this.commandQueue.drain()) {
      if (cmd.type === 'ADVANCE_DIALOGUE' && this.gameState.activeDialogue) {
        const next = advanceDialogue(this.gameState.activeDialogue);
        if (next) {
          this.gameState.activeDialogue = next;
          this.bridge.emit({ type: 'dialogueAdvance', dialogue: next });
        } else {
          this.gameState.activeDialogue = null;
          this.bridge.emit({ type: 'dialogueEnd' });
        }
      } else if (cmd.type === 'CLOSE_DIALOGUE') {
        this.gameState.activeDialogue = null;
        this.bridge.emit({ type: 'dialogueEnd' });
      }
    }

    // Handle dialogue state
    if (this.gameState.activeDialogue) {
      // Advance with interact key OR any tap/click (for mobile)
      if (input.interact || input.moveTarget) {
        const next = advanceDialogue(this.gameState.activeDialogue);
        if (next) {
          this.gameState.activeDialogue = next;
          this.bridge.emit({ type: 'dialogueAdvance', dialogue: next });
        } else {
          this.gameState.activeDialogue = null;
          this.bridge.emit({ type: 'dialogueEnd' });
        }
      }
      // Update camera and render even during dialogue (player is frozen, but camera should stay)
      const capDialogue = getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, capDialogue);
      this.renderSystem.updatePlayer(this.gameState.player, delta);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom, map.maxViewTiles ? capDialogue : undefined);
      this.renderSystem.updateAnimations(performance.now() / 1000);
      if (this.tapFeedback) this.tapFeedback.update(delta);
      if (this.debugOverlay) this.debugOverlay.update();
      return;
    }

    // Check NPC interaction
    const dialogueEvent = checkInteraction(this.gameState.player, this.gameState.npcs, input);
    if (dialogueEvent) {
      this.gameState.activeDialogue = dialogueEvent;
      this.bridge.emit({ type: 'dialogueStart', dialogue: dialogueEvent });
      // Don't process movement this frame
      const capInteract = getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, capInteract);
      this.renderSystem.updatePlayer(this.gameState.player, delta);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom, map.maxViewTiles ? capInteract : undefined);
      return;
    }

    // Tap feedback — sound + visual indicator
    if (input.moveTarget && this.tapFeedback) {
      this.tapFeedback.trigger(input.moveTarget.x, input.moveTarget.y);
    }

    // Convert moveTarget to pathfinding waypoints. Pass current NPCs +
    // player collision box so A* sees up-to-date NPC positions and
    // routes around whoever's standing where right NOW (the static
    // walk grid no longer bakes NPC positions in — they wandered).
    if (input.moveTarget && this.walkGrid) {
      const waypoints = findPath(
        this.walkGrid,
        this.gameState.player.x, this.gameState.player.y,
        input.moveTarget.x, input.moveTarget.y,
        this.gameState.npcs,
        this.gameState.player.collisionBox,
      );
      if (waypoints.length > 0) {
        // Override input — set path mode instead of straight-line target
        this.gameState.player = {
          ...this.gameState.player,
          movementMode: { type: 'path', waypoints },
        };
        input.moveTarget = null; // consumed
      }
      // If no path found, fall through to straight-line target as fallback
    }

    // Update player movement
    const desiredPlayer = updatePlayer(this.gameState.player, input, delta);

    // Resolve collisions
    const resolved = resolveMovement(
      this.gameState.player.x,
      this.gameState.player.y,
      desiredPlayer.x,
      desiredPlayer.y,
      desiredPlayer.collisionBox,
      map,
      this.gameState.entities,
      this.gameState.buildings,
    );

    // Capture pre-update position so the stuck guard below knows whether
    // the resolved move actually changed anything.
    const prevX = this.gameState.player.x;
    const prevY = this.gameState.player.y;

    this.gameState.player = {
      ...desiredPlayer,
      x: resolved.x,
      y: resolved.y,
      sortY: resolved.y,
    };

    // Clamp to map bounds
    // Clamp to map bounds — collision handles walls, this is a safety net
    // against ever leaving the map. Feet can sit at the exact bottom edge.
    this.gameState.player.x = Math.max(0, Math.min(mapW, this.gameState.player.x));
    this.gameState.player.y = Math.max(0, Math.min(mapH, this.gameState.player.y));
    this.gameState.player.sortY = this.gameState.player.y;

    // ── Stuck guard ──
    // Player is in path/target mode but hasn't actually moved this tick
    // (collision blocked us, sub-cell obstacle, an NPC walked across
    // our path mid-route, etc). After ~165ms of being stuck, try to
    // re-derive a path from the current position to the SAME final
    // goal. A fresh path with current NPC positions usually finds an
    // alternate route. Only fall back to "give up → direct mode" when
    // the re-path itself fails or we've already retried twice (avoids
    // an infinite re-path loop when truly trapped).
    const STUCK_EPSILON_SQ = 0.01;
    const STUCK_FRAMES_LIMIT = 10;
    const RE_PATH_LIMIT = 2;
    const dxMoved = this.gameState.player.x - prevX;
    const dyMoved = this.gameState.player.y - prevY;
    const movedEnough = dxMoved * dxMoved + dyMoved * dyMoved > STUCK_EPSILON_SQ;
    const mode = this.gameState.player.movementMode;
    const inPathOrTarget = mode.type === 'path' || mode.type === 'target';
    if (movedEnough) {
      // Player progressing — reset both counters so a future stall
      // gets its full re-path budget.
      this.stuckFrames = 0;
      this.rePathAttempts = 0;
    } else if (inPathOrTarget) {
      this.stuckFrames += 1;
      if (this.stuckFrames >= STUCK_FRAMES_LIMIT) {
        // Find the original goal so the re-path lands the player at
        // the same spot the user originally tapped (modulo
        // unreachable-goal relocation handled inside findPath).
        let goalX: number | null = null;
        let goalY: number | null = null;
        if (mode.type === 'path' && mode.waypoints && mode.waypoints.length > 0) {
          const last = mode.waypoints[mode.waypoints.length - 1];
          goalX = last.x; goalY = last.y;
        } else if (mode.type === 'target' && mode.target) {
          goalX = mode.target.x; goalY = mode.target.y;
        }

        let recovered = false;
        if (goalX !== null && goalY !== null && this.walkGrid && this.rePathAttempts < RE_PATH_LIMIT) {
          const fresh = findPath(
            this.walkGrid,
            this.gameState.player.x, this.gameState.player.y,
            goalX, goalY,
            this.gameState.npcs,
            this.gameState.player.collisionBox,
          );
          if (fresh.length > 0) {
            this.gameState.player = {
              ...this.gameState.player,
              movementMode: { type: 'path', waypoints: fresh },
            };
            this.stuckFrames = 0;
            this.rePathAttempts += 1;
            recovered = true;
          }
        }

        if (!recovered) {
          this.gameState.player = { ...this.gameState.player, movementMode: { type: 'direct' } };
          this.stuckFrames = 0;
          this.rePathAttempts = 0;
        }
      }
    } else {
      this.stuckFrames = 0;
      this.rePathAttempts = 0;
    }

    // Cell-position log — dev only. Even though it's already throttled
    // to tile crossings, in production it serves no purpose and the
    // floor-divisions + console call still cost something on mobile.
    if (process.env.NODE_ENV === 'development') {
      const T = map.tileSize;
      const col = Math.floor(this.gameState.player.x / T);
      const row = Math.floor(this.gameState.player.y / T);
      const last = this.lastLoggedCell;
      if (!last || last.mapId !== map.id || last.col !== col || last.row !== row) {
        console.log(`[player] cell (${col}, ${row}) on ${map.id}`);
        this.lastLoggedCell = { mapId: map.id, col, row };
      }
    }

    // Check door triggers
    const transition = checkDoorTriggers(
      this.gameState.player.x,
      this.gameState.player.y,
      this.gameState.player.collisionBox,
      map.triggers,
      this.gameState.buildings,
    );

    if (transition) {
      this.transitioning = true;

      if (transition.buildingId) {
        // Entering a building — save a return spawn just below the building's door
        // Use the building ID as the return spawn ID
        const building = this.gameState.buildings.find(b => b.id === transition.buildingId);
        if (building) {
          const returnId = `exit-${building.id}`;
          // Register a dynamic spawn point on the outdoor map if not already there
          const currentMap = loadMap(this.gameState.currentMapId);
          if (!currentMap.spawnPoints.find(s => s.id === returnId)) {
            currentMap.spawnPoints.push({
              id: returnId,
              x: building.x,
              y: building.y + 16, // 1 tile below the door — right at the threshold
              facing: 'down',
            });
          }
          this.gameState.returnSpawnId = returnId;
          this.gameState.returnMapId = this.gameState.currentMapId;
        }
      }

      // If this is an interior exit trigger going back to where we came from,
      // use the saved return spawn. Only consume it when the trigger's target
      // matches returnMapId so interior→interior triggers (stairs) are unaffected.
      let spawnId = transition.targetSpawnId;
      let targetMapId = transition.targetMapId;
      if (
        !transition.buildingId &&
        this.gameState.returnSpawnId &&
        this.gameState.returnMapId &&
        transition.targetMapId === this.gameState.returnMapId
      ) {
        spawnId = this.gameState.returnSpawnId;
        targetMapId = this.gameState.returnMapId;
        this.gameState.returnSpawnId = null;
        this.gameState.returnMapId = null;
      }

      this.loadScene(targetMapId, spawnId).then(() => {
        this.transitioning = false;
      });
      return;
    }

    // Update camera — if the map caps the view (interior rooms), compute the
    // capped viewport in world px and pass it through so the camera clamps
    // inside the visible window and anything outside renders as black.
    const viewportCap = getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
    this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, viewportCap);

    // Update NPC wandering
    if (this.npcWanderStates.length > 0 && this.walkGrid) {
      const grid = this.walkGrid;
      const GRID_CELL = 16;
      updateWanderStates(this.npcWanderStates, delta, (x, y) => {
        const gc = Math.floor(x / GRID_CELL);
        const gr = Math.floor(y / GRID_CELL);
        return gr >= 0 && gr < grid.length && gc >= 0 && gc < (grid[0]?.length ?? 0) && grid[gr][gc];
      });
      // Sync NPC positions to game state and renderer
      for (const ws of this.npcWanderStates) {
        const npc = this.gameState.npcs.find(n => n.id === ws.npcId);
        if (npc) {
          npc.x = ws.currentX;
          npc.y = ws.currentY;
          npc.sortY = ws.currentY;
        }
        this.renderSystem.updateNPC(
          ws.npcId,
          ws.currentX,
          ws.currentY,
          ws.facing,
          ws.state === 'walking',
          ws.walkFrame,
        );
      }
    }

    // Update renderer
    this.renderSystem.updatePlayer(this.gameState.player, delta);
    this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom, map.maxViewTiles ? viewportCap : undefined);
    this.renderSystem.updateAnimations(performance.now() / 1000);
    // X-ray occluding sprites so the player stays visible behind tall objects.
    this.renderSystem.applyOcclusionFade();
    // Ambient cars — only when this map has a car-path network. Tick the
    // simulation, drop sprites for any car that despawned this frame, and
    // sync the survivors' positions to the renderer.
    if (this.carSystemState && this.carNetwork) {
      // Build the obstacle list cars should stop for: player + every
      // NPC's collision box, in world coordinates. Static decor isn't
      // included because cars stay on painted paths.
      const collidables = [
        {
          left: this.gameState.player.x + this.gameState.player.collisionBox.offsetX,
          top: this.gameState.player.y + this.gameState.player.collisionBox.offsetY,
          right: this.gameState.player.x + this.gameState.player.collisionBox.offsetX + this.gameState.player.collisionBox.width,
          bottom: this.gameState.player.y + this.gameState.player.collisionBox.offsetY + this.gameState.player.collisionBox.height,
        },
        ...this.gameState.npcs.map(n => ({
          left: n.x + n.collisionBox.offsetX,
          top: n.y + n.collisionBox.offsetY,
          right: n.x + n.collisionBox.offsetX + n.collisionBox.width,
          bottom: n.y + n.collisionBox.offsetY + n.collisionBox.height,
        })),
      ];
      // Per-sprite collision-box resolver. Order:
      //   1. User-edited box from `data/car-collisions.json` (cached at
      //      scene load).
      //   2. Fallback: full sprite footprint, centered (matches the
      //      visible image but typically has lots of transparent
      //      padding — the user can shrink it via the editor panel).
      // Returns null when both fail (texture not loaded yet); CarSystem
      // then defaults to a tile-sized box.
      const resolveCarCollision = (key: string) => {
        const override = this.carCollisionOverrides[key];
        if (override) return override;
        const tex = getTexture(key);
        if (!tex) return null;
        return {
          offsetX: -tex.width / 2,
          offsetY: -tex.height / 2,
          width: tex.width,
          height: tex.height,
        };
      };
      const despawned = updateCars(
        this.carSystemState,
        this.carNetwork,
        delta,
        map.tileSize,
        map.width,
        map.height,
        collidables,
        resolveCarCollision,
      );
      for (const id of despawned) this.renderSystem.removeCar(id);
      for (const car of this.carSystemState.cars) {
        this.renderSystem.setCar(car.id, car.x, car.y, spriteKeyForCar(car), map.tileSize);
      }
    }

    // Collision-box debug overlay — drawn after everything else so the
    // rects sit on top of sprites. Player + NPC AABBs in green, car
    // bodies in red, car look-aheads in yellow. Shows exactly what the
    // car-system obstacle test sees each frame, which is the fast way
    // to diagnose "the car went through me" reports.
    if (this.debugShowCollisions) {
      const T = map.tileSize;
      const items: Array<{ box: { left: number; top: number; right: number; bottom: number }; color: number }> = [];
      const p = this.gameState.player;
      items.push({
        box: {
          left: p.x + p.collisionBox.offsetX,
          top: p.y + p.collisionBox.offsetY,
          right: p.x + p.collisionBox.offsetX + p.collisionBox.width,
          bottom: p.y + p.collisionBox.offsetY + p.collisionBox.height,
        },
        color: 0x00ff66,
      });
      for (const n of this.gameState.npcs) {
        items.push({
          box: {
            left: n.x + n.collisionBox.offsetX,
            top: n.y + n.collisionBox.offsetY,
            right: n.x + n.collisionBox.offsetX + n.collisionBox.width,
            bottom: n.y + n.collisionBox.offsetY + n.collisionBox.height,
          },
          color: 0x00ff66,
        });
      }
      if (this.carSystemState) {
        // Same override-then-fallback resolution as the simulation, so
        // the debug rects always match what the obstacle test sees.
        for (const car of this.carSystemState.cars) {
          const key = spriteKeyForCar(car);
          let box = this.carCollisionOverrides[key];
          if (!box) {
            const tex = getTexture(key);
            box = tex
              ? { offsetX: -tex.width / 2, offsetY: -tex.height / 2, width: tex.width, height: tex.height }
              : { offsetX: -T / 2, offsetY: -T / 2, width: T, height: T };
          }
          items.push({ box: carAABB(car, box), color: 0xff3333 });
          items.push({ box: lookAheadBox(car, T, box), color: 0xffcc00 });
        }
      }
      this.renderSystem.drawDebugCollisions(items);
    }

    if (this.tapFeedback) this.tapFeedback.update(delta);

    // Debug overlay
    if (this.debugOverlay && this.renderSystem) {
      this.debugOverlay.totalObjects =
        map.objects.length + map.buildings.length + map.npcs.length + 1; // +1 for player
      this.debugOverlay.renderedSprites = this.renderSystem.getSpriteCount();
      this.debugOverlay.zoomLevel = this.inputAdapter.zoom;
      this.debugOverlay.update();
    }
  }

  getGameState(): GameState | null {
    return this.gameState;
  }

  getMapData(): import('../core/types').MapData | null {
    return this.currentMap;
  }

  setMusicEnabled(enabled: boolean): void {
    this.bgm.setEnabled(enabled);
  }

  isMusicEnabled(): boolean {
    return this.bgm.isEnabled();
  }

  resize(): void {
    if (this.destroyed || !this.initialized) return;
    this.app.resize();
  }

  destroy(): void {
    this.destroyed = true;
    this.currentMap = null;
    this.inputAdapter.destroy();
    this.bgm.destroy();
    if (this.debugKeydownHandler) {
      window.removeEventListener('keydown', this.debugKeydownHandler);
      this.debugKeydownHandler = null;
    }
    if (this.tapFeedback) {
      this.tapFeedback.destroy();
      this.tapFeedback = null;
    }
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
      this.debugOverlay = null;
    }
    if (this.renderSystem) {
      this.renderSystem.destroy();
    }
    if (this.initialized) {
      this.app.destroy(true, { children: true });
    }
    // Clear any leftover canvas children from the container
    if (this.container) {
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
      this.container = null;
    }
  }
}
