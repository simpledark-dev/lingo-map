import { Application } from 'pixi.js';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DEFAULT_ZOOM } from '../core/constants';
import { GameState, MapData } from '../core/types';
import { loadMap, getSpawnPoint } from '../core/MapLoader';
import { buildStressMap, StressOptions } from '../core/MapStress';
import { createPlayer, updatePlayer } from '../core/PlayerSystem';
import { resolveMovement } from '../core/CollisionSystem';
import { updateCamera } from '../core/CameraSystem';
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
    const map = buildStressMap(loadMap(mapId), this.options);
    this.currentMap = map;
    const spawn = getSpawnPoint(map, spawnId);
    const player = createPlayer(spawn);

    const requiredAssets = RenderSystem.getRequiredAssets(map);
    await loadAssets(requiredAssets);

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
      camera: updateCamera(player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height),
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
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
      this.renderSystem.updatePlayer(this.gameState.player, delta);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom);
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
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
      this.renderSystem.updatePlayer(this.gameState.player, delta);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom);
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
    this.gameState.player.x = Math.max(16, Math.min(mapW - 16, this.gameState.player.x));
    this.gameState.player.y = Math.max(16, Math.min(mapH - 16, this.gameState.player.y));
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
              y: building.y + 40, // far enough below the door trigger
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

    // Update camera
    this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);

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
    this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom);
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
