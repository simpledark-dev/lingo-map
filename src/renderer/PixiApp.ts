import { Application } from 'pixi.js';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DEFAULT_ZOOM, DECOR_SPRITE_KEYS } from '../core/constants';
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
import { loadAssets, preloadAllAssets } from './AssetLoader';
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
  private transitioning = false;
  private initialized = false;
  private destroyed = false;
  private walkGrid: boolean[][] | null = null;
  private npcWanderStates: NPCWanderState[] = [];
  private tapFeedback: TapFeedback | null = null;
  private bgm: BGMManager;

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
      resolution: 1,
      autoDensity: false,
      resizeTo: container,
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

    // Load the grass↔water auto-tileset before the first scene so RenderSystem
    // can paint the dual-grid layer immediately rather than waiting for a paint.
    await loadAutoTileset();

    await this.loadScene(this.options.startMapId ?? 'outdoor', 'default');

    if (this.destroyed) return;

    this.initialized = true;

    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaMS / 1000);
    });

    // Preload all remaining assets in the background so scene transitions are instant
    preloadAllAssets().catch(() => {});
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
    // Spawn point: 1 tile BELOW the entity's feet, so arriving players don't
    // immediately land in the trigger zone above.
    const dynamicSpawns = transitionEntities
      .filter(o => o.transition!.incomingSpawnId)
      .map(o => ({
        id: o.transition!.incomingSpawnId!,
        x: o.x,
        y: o.y + T,
        facing: 'down' as const,
      }));
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
    this.renderSystem.initPlayer(player);

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

    // Convert moveTarget to pathfinding waypoints
    if (input.moveTarget && this.walkGrid) {
      const waypoints = findPath(
        this.walkGrid,
        this.gameState.player.x, this.gameState.player.y,
        input.moveTarget.x, input.moveTarget.y,
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
        this.renderSystem.updateNPC(ws.npcId, ws.currentX, ws.currentY);
      }
    }

    // Update renderer
    this.renderSystem.updatePlayer(this.gameState.player, delta);
    this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom, map.maxViewTiles ? viewportCap : undefined);
    this.renderSystem.updateAnimations(performance.now() / 1000);
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

  destroy(): void {
    this.destroyed = true;
    this.currentMap = null;
    this.inputAdapter.destroy();
    this.bgm.destroy();
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
