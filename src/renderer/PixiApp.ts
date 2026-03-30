import { Application } from 'pixi.js';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from '../core/constants';
import { GameState } from '../core/types';
import { loadMap, getSpawnPoint } from '../core/MapLoader';
import { createPlayer, updatePlayer } from '../core/PlayerSystem';
import { resolveMovement } from '../core/CollisionSystem';
import { updateCamera } from '../core/CameraSystem';
import { checkDoorTriggers } from '../core/TriggerSystem';
import { checkInteraction, advanceDialogue } from '../core/InteractionSystem';
import { GameBridge } from '../core/GameBridge';
import { CommandQueue } from '../core/CommandQueue';
import { loadAssets } from './AssetLoader';
import { InputAdapter } from './InputAdapter';
import { RenderSystem } from './RenderSystem';

export class PixiApp {
  app: Application;
  private renderSystem: RenderSystem | null = null;
  private inputAdapter: InputAdapter;
  private gameState: GameState | null = null;
  private transitioning = false;
  private initialized = false;
  private destroyed = false;

  readonly bridge: GameBridge;
  readonly commandQueue: CommandQueue;

  constructor() {
    this.app = new Application();
    this.inputAdapter = new InputAdapter();
    this.bridge = new GameBridge();
    this.commandQueue = new CommandQueue();
  }

  private container: HTMLDivElement | null = null;

  async init(container: HTMLDivElement): Promise<void> {
    this.container = container;

    await this.app.init({
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      backgroundColor: 0x1a1a2e,
      antialias: false,
      resolution: 1,
      autoDensity: false,
    });

    // If destroy() was called while we were awaiting, bail out
    if (this.destroyed) return;

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = 'pixelated';
    container.appendChild(canvas);

    this.inputAdapter.attach(canvas);

    await this.loadScene('outdoor', 'default');

    if (this.destroyed) return;

    this.initialized = true;

    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaMS / 1000);
    });
  }

  private async loadScene(mapId: string, spawnId: string): Promise<void> {
    const map = loadMap(mapId);
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
      camera: updateCamera(player, mapW, mapH),
      entities: map.objects,
      buildings: map.buildings,
      npcs: map.npcs,
      activeDialogue: null,
    };

    this.bridge.emit({ type: 'sceneChange', mapId });
  }

  private update(delta: number): void {
    if (!this.gameState || !this.renderSystem || this.transitioning) return;

    const map = loadMap(this.gameState.currentMapId);
    const mapW = map.width * map.tileSize;
    const mapH = map.height * map.tileSize;

    this.inputAdapter.cameraOffset = { ...this.gameState.camera };
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
      // While in dialogue, only allow advancing with interact key
      if (input.interact) {
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
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH);
      this.renderSystem.updatePlayer(this.gameState.player);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y);
      return;
    }

    // Check NPC interaction
    const dialogueEvent = checkInteraction(this.gameState.player, this.gameState.npcs, input);
    if (dialogueEvent) {
      this.gameState.activeDialogue = dialogueEvent;
      this.bridge.emit({ type: 'dialogueStart', dialogue: dialogueEvent });
      // Don't process movement this frame
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH);
      this.renderSystem.updatePlayer(this.gameState.player);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y);
      return;
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
      this.loadScene(transition.targetMapId, transition.targetSpawnId).then(() => {
        this.transitioning = false;
      });
      return;
    }

    // Update camera
    this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH);

    // Update renderer
    this.renderSystem.updatePlayer(this.gameState.player);
    this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y);
  }

  getGameState(): GameState | null {
    return this.gameState;
  }

  destroy(): void {
    this.destroyed = true;
    this.inputAdapter.destroy();
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
