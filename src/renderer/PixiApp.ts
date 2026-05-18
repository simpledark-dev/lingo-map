import { Application, loadTextures } from 'pixi.js';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DECOR_SPRITE_KEYS, MIN_ZOOM, MAX_ZOOM, INTERACTION_RANGE } from '../core/constants';
import { DialogueState, Direction, Entity, GameState, MapData, Position, TileType } from '../core/types';
import { loadMap, getSpawnPoint } from '../core/MapLoader';
import { buildStressMap, StressOptions } from '../core/MapStress';
import { createPlayer, updatePlayer } from '../core/PlayerSystem';
import { getWorldCollisionBox, resolveMovement, WorldBox } from '../core/CollisionSystem';
import { updateCamera, getViewportWorldSize } from '../core/CameraSystem';
import { checkDoorTriggers } from '../core/TriggerSystem';
import { checkInteraction, advanceDialogue } from '../core/InteractionSystem';
import { GameBridge } from '../core/GameBridge';
import { getLayers } from '../core/Layers';
import { CommandQueue } from '../core/CommandQueue';
import { buildWalkGrid, findPath } from '../core/Pathfinding';
import { NPCWanderState, initWanderStates, updateWanderStates } from '../core/NPCWanderSystem';
import { buildCarNetwork, carAABB, CAR_SPRITE_SETS, CarCollisionBox, CarNetwork, CarSystemState, createCarSystemState, lookAheadBox, spriteKeyForCar, updateCars } from '../core/CarSystem';
import { getTexture, loadAssets, loadCharacterAtlas, loadInteriorSheets, loadPackSingle, loadUiAtlas } from './AssetLoader';
import { getComputerLevel, getDeskSpriteKey, subscribeComputerUpgradeLevel } from '../data/computerUpgrade';
import {
  formatUpgradeRemaining,
  getUpgradeTimer,
  getUpgradeTimerProgress,
} from '../data/computerUpgradeTimer';
import { getNpcFirstDialogueLine } from '../data/npcDialogue';

/** localStorage key kept in sync with `data/car-collisions.json` by the
 * editor. The runtime no longer reads it (we use the disk file via the
 * API instead) but the constant stays exported for the editor's cache. */
const CAR_COLLISIONS_KEY = 'editor:car-collisions';
void CAR_COLLISIONS_KEY;
import { loadAutoTileset } from './AutoTileset';
import { InputAdapter, NPC_TAP_HALF_W, NPC_TAP_TOP, NPC_TAP_BOTTOM } from './InputAdapter';
import { RenderSystem } from './RenderSystem';
import { DebugOverlay } from './DebugOverlay';
import { TapFeedback } from './TapFeedback';
import { BGMManager } from './BGMManager';
import { SavedWorldState, saveWorldState } from '../data/worldSave';
import { t } from '../data/i18n';

export type PixiAppOptions = StressOptions & {
  musicEnabled?: boolean;
  startMapId?: string;
  /** Spawn ID on the start map. Defaults to `'default'` to match
   *  the legacy outdoor entry behavior. The intro flow overrides
   *  this to `'intro-start'` so the player wakes up inside the
   *  house facing the doormat. */
  startSpawnId?: string;
  /** Exact runtime restore from the previous browser session. When present
   *  and its map matches `startMapId`, it wins over `startSpawnId`. */
  startWorldState?: SavedWorldState | null;
};

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

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
  private worldPausedByUI = false;
  private initialized = false;
  private destroyed = false;
  /** Title of the most-recently-fired locked transition. Set when the
   *  engine pops the "locked district" dialogue; cleared the first
   *  tick the player isn't overlapping any locked trigger. Prevents
   *  the dialogue from spamming every tick while the player stands
   *  on the arrow. */
  private lastLockedTitle: string | null = null;
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
  private debugShowTapZones = false;
  private debugKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private pageLifecycleHandler: (() => void) | null = null;
  private contextLostHandler: ((e: Event) => void) | null = null;
  private contextRestoredHandler: (() => void) | null = null;
  /** Set when the WebGL context is lost. The per-frame tick bails on
   * this so we don't issue draw calls against a dead context — the
   * recovery path (full page reload, gated on a fresh persistWorldState)
   * runs from the contextlost handler itself. */
  private contextLost = false;
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
  private lastWorldSaveAt = 0;
  /** Unsubscribe from upgrade-level changes. Set in `init`, called in
   * `destroy`. The handler swaps the live `computer-desk` sprite's
   * texture so the player sees the new tier without a scene reload. */
  private computerUpgradeUnsub: (() => void) | null = null;
  private lastWorldSaveSignature = '';
  readonly bridge: GameBridge;
  readonly commandQueue: CommandQueue;
  private debugOverlay: DebugOverlay | null = null;

  private findF1Computer(): Entity | null {
    if (!this.gameState || this.gameState.currentMapId !== 'pokemon-house-1f') return null;
    return this.gameState.entities.find((entity) => entity.spriteKey === 'computer-desk') ?? null;
  }

  /** Swap every `computer-desk` sprite in the current scene to the
   * texture matching the current upgrade level. Called from the
   * `subscribeComputerUpgradeLevel` callback so the player sees the
   * room update the instant they buy an upgrade. No-op if RenderSystem
   * isn't mounted yet (still loading) or no desk is on the active map. */
  /** Sync the in-world progress bars above any `computer-desk` in the
   * current scene with the upgrade-timer state. Called every frame so
   * the bar animates smoothly. Cheap: one object allocation + at most
   * one RenderSystem call per desk; no-op when there's no timer and
   * no bar to clear. */
  private refreshUpgradeProgressBars(): void {
    if (!this.renderSystem || !this.gameState) return;
    const progress = getUpgradeTimerProgress();
    for (const entity of this.gameState.entities) {
      if (entity.spriteKey !== 'computer-desk') continue;
      if (!progress) {
        this.renderSystem.clearUpgradeProgressBar(entity.id);
        continue;
      }
      const label = progress.complete
        ? t('computer.upgrade.ready')
        : formatUpgradeRemaining(progress.remainingMs);
      this.renderSystem.setUpgradeProgressBar(
        entity.id,
        progress.progress01,
        label,
        progress.complete,
      );
    }
  }

  private refreshComputerDeskTexture(playFx = false): void {
    if (!this.renderSystem || !this.gameState) return;
    const key = getDeskSpriteKey();
    for (const entity of this.gameState.entities) {
      if (entity.spriteKey !== 'computer-desk') continue;
      this.renderSystem.refreshObjectTexture(entity.id, key);
      if (playFx) this.renderSystem.playUpgradeFx(entity.id);
    }
  }

  private getComputerWorldBox(computer: Entity): WorldBox {
    return getWorldCollisionBox(
      computer.x,
      computer.y,
      computer.collisionBox,
      computer.scale ?? 1,
    );
  }

  private expandBox(box: WorldBox, amount: number): WorldBox {
    return {
      x: box.x - amount,
      y: box.y - amount,
      width: box.width + amount * 2,
      height: box.height + amount * 2,
    };
  }

  private pointInBox(point: Position, box: WorldBox): boolean {
    return (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    );
  }

  private isPlayerNearBox(box: WorldBox): boolean {
    if (!this.gameState) return false;
    const player = this.gameState.player;
    const nearestX = Math.max(box.x, Math.min(player.x, box.x + box.width));
    const nearestY = Math.max(box.y, Math.min(player.y, box.y + box.height));
    const dx = player.x - nearestX;
    const dy = player.y - nearestY;
    return dx * dx + dy * dy <= INTERACTION_RANGE * INTERACTION_RANGE;
  }

  private buildComputerDialogue(): DialogueState {
    const tier = getComputerLevel();
    return {
      npcId: 'object-computer',
      npcName: t('computer.name'),
      lines: [t(tier.promptKey)],
      currentLine: 0,
      options: [
        { id: 'computer-study', label: t('computer.option.study') },
        { id: 'computer-upgrade', label: t('computer.option.upgrade') },
        { id: 'computer-leave', label: t('computer.option.leave') },
      ],
    };
  }

  private maybeHandleComputerInteraction(input: { interact: boolean; moveTarget: Position | null }, map: MapData): DialogueState | null {
    const computer = this.findF1Computer();
    if (!computer) return null;
    const box = this.getComputerWorldBox(computer);
    const tapBox = box;
    const tappedComputer = input.moveTarget ? this.pointInBox(input.moveTarget, tapBox) : false;
    const nearComputer = this.isPlayerNearBox(tapBox);

    if ((input.interact || tappedComputer) && nearComputer) {
      input.moveTarget = null;
      // Upgrade in progress (or ready to claim) → skip the regular
      // Study/Upgrade/Leave dialogue and open the upgrade modal
      // directly. The player's intent on tapping the computer during
      // a timer is overwhelmingly "check the timer / finish it."
      if (getUpgradeTimer()) {
        this.bridge.emit({ type: 'openComputerUpgrade' });
        return null;
      }
      return this.buildComputerDialogue();
    }

    if (tappedComputer && !nearComputer) {
      input.moveTarget = {
        x: box.x + box.width / 2,
        y: Math.min(map.height * map.tileSize, box.y + box.height + map.tileSize * 0.65),
      };
    }

    return null;
  }

  private resolveCarCollisionBox(key: string): CarCollisionBox | null {
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
  }

  private getCarObstacleBoxes(tileSize: number): WorldBox[] {
    if (!this.carSystemState) return [];
    const fallback: CarCollisionBox = {
      offsetX: -tileSize / 2,
      offsetY: -tileSize / 2,
      width: tileSize,
      height: tileSize,
    };
    return this.carSystemState.cars.map((car) => {
      const box = this.resolveCarCollisionBox(spriteKeyForCar(car)) ?? fallback;
      const aabb = carAABB(car, box);
      return {
        x: aabb.left,
        y: aabb.top,
        width: aabb.right - aabb.left,
        height: aabb.bottom - aabb.top,
      };
    });
  }

  private persistWorldState(force = false): void {
    if (!this.gameState) return;
    const now = performance.now();
    if (!force && now - this.lastWorldSaveAt < 750) return;

    const player = this.gameState.player;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.inputAdapter.zoom));
    const roundedX = Math.round(player.x * 100) / 100;
    const roundedY = Math.round(player.y * 100) / 100;
    const signature = [
      this.gameState.currentMapId,
      roundedX,
      roundedY,
      player.facing,
      Math.round(zoom * 100) / 100,
      this.gameState.returnMapId ?? '',
      this.gameState.returnSpawnId ?? '',
    ].join(':');

    if (!force && signature === this.lastWorldSaveSignature) return;

    saveWorldState({
      version: 1,
      mapId: this.gameState.currentMapId,
      x: roundedX,
      y: roundedY,
      facing: player.facing,
      zoom,
      returnSpawnId: this.gameState.returnSpawnId,
      returnMapId: this.gameState.returnMapId,
      savedAt: Date.now(),
    });
    this.lastWorldSaveAt = now;
    this.lastWorldSaveSignature = signature;
  }

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

    // iOS Safari < 16.4 hangs forever inside `createImageBitmap`
    // (sometimes silently, sometimes only on certain image sources),
    // which is the path Pixi 8's default texture loader takes — and
    // taking that path inside a worker just hides the hang. The user
    // saw a 20-minute "loading…" screen on iPhone 13 because of this.
    // Falling back to the classic `new Image()` loader sidesteps both
    // the bitmap path and the worker dependency. Cost is one main-
    // thread image-decode hop per asset, fine for our payload size.
    loadTextures.config = {
      crossOrigin: loadTextures.config?.crossOrigin ?? null,
      preferCreateImageBitmap: false,
      preferWorkers: false,
    };

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

    // Disable Pixi 8's stage event system. We do all input handling
    // manually via InputAdapter's DOM listeners on the canvas, and
    // Pixi's hit-testing was intermittently swallowing pointerdown
    // (taps on the canvas wouldn't fire our handler in some browser
    // states — e.g. Chrome's normal viewport, but worked fine after
    // toggling DevTools responsive mode). Setting `eventMode: 'none'`
    // on the root stage takes Pixi out of the chain so DOM events
    // flow straight to our listener.
    this.app.stage.eventMode = 'none';

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.setProperty('-webkit-user-select', 'none');
    canvas.style.setProperty('-webkit-user-drag', 'none');
    canvas.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    canvas.style.setProperty('-webkit-touch-callout', 'none');
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
      if (
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTextEntryTarget(e.target) ||
        this.worldPausedByUI ||
        !!this.gameState?.activeDialogue
      ) {
        return;
      }

      // Backquote / backtick — toggle collision boxes.
      if (e.code === 'Backquote') {
        this.debugShowCollisions = !this.debugShowCollisions;
        if (!this.debugShowCollisions) this.renderSystem?.clearDebugCollisions();
        if (process.env.NODE_ENV === 'development') {
          console.log(`[PixiApp] collision-box debug overlay: ${this.debugShowCollisions ? 'ON' : 'OFF'}`);
        }
      }
      // T — toggle the NPC tap-zone overlay so we can SEE exactly
      // where a tap will register as "talk to NPC". Drawn in cyan
      // (distinct from green collision boxes) so they don't blur
      // together when both overlays are on.
      if (e.code === 'KeyT') {
        this.debugShowTapZones = !this.debugShowTapZones;
        if (!this.debugShowTapZones) this.renderSystem?.clearDebugCollisions();
        if (process.env.NODE_ENV === 'development') {
          console.log(`[PixiApp] NPC tap-zone overlay: ${this.debugShowTapZones ? 'ON' : 'OFF'}`);
        }
      }
    };
    window.addEventListener('keydown', this.debugKeydownHandler);
    this.pageLifecycleHandler = () => this.persistWorldState(true);
    window.addEventListener('pagehide', this.pageLifecycleHandler);
    document.addEventListener('visibilitychange', this.pageLifecycleHandler);

    // Load the grass↔water auto-tileset and the Modern-Interiors
    // character atlas in parallel before the first scene paints. Both
    // are one-time, blocking-on-first-frame loads. Doing them in
    // parallel rather than sequentially saves a roundtrip on cold
    // start; the atlas load also pre-populates 240 NPC/player
    // sub-textures so loadAssets later has nothing to fetch for
    // `me-char-*` keys.
    await Promise.all([loadAutoTileset(), loadCharacterAtlas(), loadInteriorSheets(), loadUiAtlas()]);

    const startMapId = this.options.startMapId ?? 'pokemon';
    const startWorldState = this.options.startWorldState?.mapId === startMapId
      ? this.options.startWorldState
      : null;
    await this.loadScene(
      startMapId,
      this.options.startSpawnId ?? 'default',
      startWorldState,
    );

    if (this.destroyed) return;

    // Refresh the desk sprite live whenever the player buys an upgrade,
    // so they see the new tier on the room without a scene reload.
    // `subscribeComputerUpgradeLevel` only fires on actual changes (not
    // initial reads), so seeing a callback here always means a fresh
    // purchase — safe to play the celebration FX.
    this.computerUpgradeUnsub = subscribeComputerUpgradeLevel(() => {
      this.refreshComputerDeskTexture(true);
    });

    this.initialized = true;

    // Re-sync the renderer to whatever the container size is RIGHT NOW.
    // The container size that Pixi captured at `app.init({ width, height })`
    // is from before assets loaded; on iOS Safari, the URL bar can
    // collapse during init and the container grows without firing a
    // `window.resize`. Pixi's `resizeTo` only listens for window resize
    // events, and any `pixiApp.resize()` calls fired by GameCanvas during
    // init bailed (the `!this.initialized` guard). Net effect on first
    // portrait load: canvas + screen pinned to the smaller init size,
    // visible as a black strip at the bottom of the world view (the
    // BL-14 symptom). Rotating used to be the only way to fix it because
    // rotation fires a real window.resize. This catch-up call removes
    // the need for that detour.
    this.app.resize();

    this.app.ticker.add((ticker) => {
      if (this.contextLost) return;
      this.update(ticker.deltaMS / 1000);
    });

    // WebGL context loss recovery. Android Chrome aggressively discards
    // GPU contexts when a PWA/tab is backgrounded; when it returns, all
    // texture handles are dead. Without this, the symptom is a black
    // ground layer (tile textures gone) with intact HUD + character
    // sprites (lazy-reloaded later). Persist world state synchronously
    // inside the handler so the reload picks up at the exact same map +
    // position, then full-reload — cleanest path through Pixi 8's atlas /
    // auto-tile texture sources.
    this.contextLostHandler = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      try {
        this.persistWorldState(true);
      } catch {
        /* persist failures shouldn't block reload */
      }
    };
    this.contextRestoredHandler = () => {
      if (typeof window !== 'undefined') window.location.reload();
    };
    canvas.addEventListener('webglcontextlost', this.contextLostHandler);
    canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler);

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

  /** Public quest-marker hook. The React layer computes positions
   *  (e.g. above the office building during the intro quest) and
   *  hands them to the engine here; the renderer owns the sprite
   *  + bob lifecycle. Idempotent — call with `[]` to clear all. */
  setQuestMarkers(markers: Array<{
    id: string;
    x: number;
    y: number;
    spriteKey: string;
    label?: string;
    followNpcId?: string;
  }>): void {
    if (this.destroyed || !this.renderSystem) return;
    this.renderSystem.setQuestMarkers(markers);
  }

  /** Plain-text labels at world positions — no sprite, no bob. Used
   *  by debug overlays (social-hub POI viewer). Pass `[]` to clear. */
  setDebugLabels(labels: ReadonlyArray<{ id: string; x: number; y: number; text: string }>): void {
    if (this.destroyed || !this.renderSystem) return;
    this.renderSystem.setDebugLabels(labels);
  }

  /** Snap an NPC to a new world position. No walking animation —
   *  scripted scenes use this when a beat asks an NPC to be
   *  somewhere new (e.g. customer arrives at a chosen table after
   *  the seat-pick step). Returns true if the NPC was found. */
  teleportNpc(npcId: string, x: number, y: number, facing?: Direction): boolean {
    if (this.destroyed || !this.renderSystem || !this.gameState) return false;
    const npc = this.gameState.npcs.find((n) => n.id === npcId);
    if (!npc) return false;
    npc.x = x;
    npc.y = y;
    npc.sortY = y;
    this.renderSystem.updateNPC(npcId, x, y, facing, false, 0);
    return true;
  }

  /** Spawn an NPC at runtime. Used by the social-hub experiment: the
   *  map ships with zero NPCs and the runtime gradually populates
   *  the venue as guests arrive at the entrance. Returns false if
   *  the sprite can't load (missing texture) or the engine isn't
   *  ready. The NPC is added to gameState, the input adapter, AND
   *  the renderer in one call. */
  addNpc(npc: import('../core/types').NPCData): boolean {
    if (this.destroyed || !this.renderSystem || !this.gameState || !this.currentMap) return false;
    if (this.gameState.npcs.some((n) => n.id === npc.id)) return false;
    this.gameState.npcs.push(npc);
    this.inputAdapter.npcs = this.gameState.npcs;
    const layers = (this.currentMap.layers ?? []) as ReturnType<typeof getLayers>;
    const seed = (Math.random() * 0x7fffffff) | 0;
    const ok = this.renderSystem.spawnNpcSprite(npc, layers, seed);
    if (!ok) {
      // Roll back the data-side push so a missing-texture NPC isn't
      // left orphaned in gameState (would still be tap-detectable
      // but visually missing).
      this.gameState.npcs = this.gameState.npcs.filter((n) => n.id !== npc.id);
      this.inputAdapter.npcs = this.gameState.npcs;
      return false;
    }
    return true;
  }

  /** Remove an NPC by id — sprite, gameState entry, guided-movement
   *  bookkeeping. Used when a social-hub guest leaves. */
  removeNpc(npcId: string): boolean {
    if (this.destroyed || !this.renderSystem || !this.gameState) return false;
    this.guidedNpcs.delete(npcId);
    this.gameState.npcs = this.gameState.npcs.filter((n) => n.id !== npcId);
    this.inputAdapter.npcs = this.gameState.npcs;
    this.renderSystem.destroyNpcSprite(npcId);
    return true;
  }

  /** Smoothly walk an NPC toward `(x, y)` in a straight line at
   *  `speed` pixels/sec. Calls `onArrive` once the NPC reaches the
   *  target (within 1 px) and removes the guided entry. If a guided
   *  walk for this NPC was already in flight, the previous one is
   *  cancelled silently — the new target overrides.
   *
   *  V1 deliberately skips pathfinding: the social-hub map is a
   *  single open room with no obstacles between POIs, and adding A*
   *  here would complicate the runtime for no visible benefit. If a
   *  later experiment needs obstacle-aware NPC walks, swap this for
   *  the `findPath` call already used by the player. */
  walkNpcTo(
    npcId: string,
    x: number,
    y: number,
    options?: { speed?: number; facing?: Direction; onArrive?: () => void },
  ): boolean {
    if (this.destroyed || !this.gameState) return false;
    const npc = this.gameState.npcs.find((n) => n.id === npcId);
    if (!npc) return false;
    this.guidedNpcs.set(npcId, {
      targetX: x,
      targetY: y,
      speed: options?.speed ?? 60,
      finalFacing: options?.facing,
      onArrive: options?.onArrive,
    });
    return true;
  }

  private guidedNpcs = new Map<
    string,
    {
      targetX: number;
      targetY: number;
      speed: number;
      finalFacing?: Direction;
      onArrive?: () => void;
    }
  >();

  /** Advance every guided NPC one tick. Called from the main update
   *  loop. Each NPC steps `speed * delta` px toward its target; on
   *  arrival the entry is removed and `onArrive` fires. The NPC's
   *  facing is derived from the dominant axis of motion. */
  private updateGuidedNpcs(delta: number): void {
    if (this.guidedNpcs.size === 0) return;
    if (!this.gameState || !this.renderSystem) return;
    const arrived: string[] = [];
    for (const [npcId, guide] of this.guidedNpcs) {
      const npc = this.gameState.npcs.find((n) => n.id === npcId);
      if (!npc) {
        arrived.push(npcId);
        continue;
      }
      const dx = guide.targetX - npc.x;
      const dy = guide.targetY - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) {
        npc.x = guide.targetX;
        npc.y = guide.targetY;
        npc.sortY = npc.y;
        const facing = guide.finalFacing ?? this.getNpcMotionFacing(npcId) ?? 'down';
        this.renderSystem.updateNPC(npcId, npc.x, npc.y, facing, false, 0);
        arrived.push(npcId);
        continue;
      }
      const step = Math.min(dist, guide.speed * delta);
      npc.x += (dx / dist) * step;
      npc.y += (dy / dist) * step;
      npc.sortY = npc.y;
      // Dominant axis = facing
      const facing: Direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      // Walk-frame cycles every 0.3 sec
      const phase = ((performance.now() / 300) | 0) % 2 as 0 | 1;
      this.renderSystem.updateNPC(npcId, npc.x, npc.y, facing, true, phase);
    }
    for (const id of arrived) {
      const guide = this.guidedNpcs.get(id);
      this.guidedNpcs.delete(id);
      try { guide?.onArrive?.(); } catch { /* swallow callback errors */ }
    }
  }

  private getNpcMotionFacing(npcId: string): Direction | null {
    const guide = this.guidedNpcs.get(npcId);
    if (!guide || !this.gameState) return null;
    const npc = this.gameState.npcs.find((n) => n.id === npcId);
    if (!npc) return null;
    const dx = guide.targetX - npc.x;
    const dy = guide.targetY - npc.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  /** Public teleport hook used by the intro cutscene to drop the
   *  player at a specific spawn after the world has already booted.
   *  Mirrors the door-trigger code path exactly — same `loadScene`
   *  call — but is callable from outside the engine without spinning
   *  up a synthetic transition. No-op if the engine hasn't finished
   *  init (the cutscene's onComplete may race the boot fetch on a
   *  fast connection); the caller is expected to await/queue rather
   *  than retry, since loadScene mid-init would race the boot path. */
  async teleportToScene(mapId: string, spawnId: string): Promise<void> {
    if (this.destroyed) return;
    // Wait briefly for init if the boot is still in flight — covers
    // the rare case where the player blasts through the cutscene
    // before assets finish loading.
    const start = performance.now();
    while (!this.initialized && !this.destroyed && performance.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!this.initialized || this.destroyed) return;
    await this.loadScene(mapId, spawnId);
  }

  /** Force the player's facing direction. Used by scripted beats
   *  (intro apartment monologue) where we want the parent looking
   *  at the child regardless of last-input direction. The main
   *  update loop will overwrite this on the next movement input,
   *  which is the desired behaviour. */
  setPlayerFacing(facing: Direction): void {
    if (!this.gameState) return;
    this.gameState.player.facing = facing;
  }

  /** Return an NPC's static `dialogue[0]` line if the loaded map
   *  has them. Used by the React layer to fall back to a generic
   *  greeting when a feature-gated dialogue (e.g. translator-job
   *  offers before the player is hired) is suppressed. */
  getNpcFallbackLine(npcId: string): string | null {
    const npc = this.gameState?.npcs.find((n) => n.id === npcId);
    return npc ? getNpcFirstDialogueLine(npc) : null;
  }

  /** Force a stationary NPC's sprite to face a specific direction.
   *  Stationary NPCs (no wanderRadius) default to "-down" textures
   *  forever; this lets the intro monologue swing Mim around to
   *  face the parent and pivot her back to face-down on close. */
  setNpcFacing(npcId: string, facing: Direction): void {
    const npc = this.gameState?.npcs.find((n) => n.id === npcId);
    if (!npc || !this.renderSystem) return;
    this.renderSystem.updateNPC(npcId, npc.x, npc.y, facing, false, 0);
  }

  private async loadScene(mapId: string, spawnId: string, restoreState: SavedWorldState | null = null): Promise<void> {
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
    // Determine which direction the player must be facing to enter
    // this door, in order of decreasing reliability:
    //
    // 1. Edge-of-map: if the trigger touches a map edge, the player
    //    walks toward that edge to use the door (typical exit pattern
    //    — the doormat sits on the bottom row to leave the house).
    //    This works even when the interior is a single open floor
    //    with no walls anywhere, where the walkable-neighbour
    //    heuristic below can't pick a single direction.
    //
    // 2. Walkable-neighbour: if exactly one side has walkable tiles,
    //    the player can only approach from there, so require facing
    //    AWAY from that side (walkable above → require 'down').
    //    Catches doors set in walls inside the map, e.g. interior
    //    rooms split by a wall row.
    //
    // 3. Fall back to 'up'. Matches legacy outdoor-building entries:
    //    the trigger sits in open grass with walkable on every side,
    //    auto-detection has nothing to grip on, and the historical
    //    rule (BL-08) is "approach from south, face up".
    const deriveRequiresFacing = (
      tx: number, ty: number, tw: number, th: number,
    ): 'up' | 'down' | 'left' | 'right' => {
      const col0 = Math.floor(tx / T);
      const col1 = Math.floor((tx + Math.max(1, tw) - 1) / T);
      const row0 = Math.floor(ty / T);
      const row1 = Math.floor((ty + Math.max(1, th) - 1) / T);

      // (1) Edge of map.
      if (row1 >= baseMap.height - 1) return 'down';
      if (row0 <= 0) return 'up';
      if (col1 >= baseMap.width - 1) return 'right';
      if (col0 <= 0) return 'left';

      // (2) Walkable neighbours.
      const tileAt = (r: number, c: number): string | null => (
        r >= 0 && r < baseMap.height && c >= 0 && c < baseMap.width
          ? baseMap.tiles[r][c]
          : null
      );
      const sideWalkable = (r0: number, r1: number, c0: number, c1: number): boolean => {
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const t = tileAt(r, c);
            if (t && isWalkableTile(t)) return true;
          }
        }
        return false;
      };
      const north = sideWalkable(row0 - 1, row0 - 1, col0, col1);
      const south = sideWalkable(row1 + 1, row1 + 1, col0, col1);
      const west = sideWalkable(row0, row1, col0 - 1, col0 - 1);
      const east = sideWalkable(row0, row1, col1 + 1, col1 + 1);
      const sides: Array<['up' | 'down' | 'left' | 'right', boolean]> = [
        ['up', south], ['down', north], ['left', east], ['right', west],
      ];
      const walkable = sides.filter(([, ok]) => ok);
      if (walkable.length === 1) return walkable[0][0];

      // (3) Fall back.
      return 'up';
    };

    const dynamicTriggers = transitionEntities.flatMap((o, i) => {
      // Explicit trigger rectangle (set by the editor's Door section)
      // takes precedence over the legacy auto-derivation. Offsets are
      // relative to the entity's x/y, same convention as collisionBox.
      const tb = o.transition!.triggerBox;
      if (tb && tb.width > 0 && tb.height > 0) {
        const x = o.x + tb.offsetX;
        const y = o.y + tb.offsetY;
        return [{
          id: `auto-${o.id}-${i}`,
          x, y,
          width: tb.width,
          height: tb.height,
          type: 'door' as const,
          targetMapId: o.transition!.targetMapId,
          targetSpawnId: o.transition!.targetSpawnId,
          // Explicit editor override wins; otherwise fall through
          // to the geometry-based auto-derivation (legacy behaviour).
          requiresFacing:
            o.transition!.requiresFacing
            ?? deriveRequiresFacing(x, y, tb.width, tb.height),
          lockedTitle: o.transition!.lockedTitle,
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
      const x = Math.min(...walkableCols) * T;
      const y = feetRow * T;
      const width = (Math.max(...walkableCols) - Math.min(...walkableCols) + 1) * T;
      const height = T;
      return [{
        id: `auto-${o.id}-${i}`,
        x, y, width, height,
        type: 'door' as const,
        targetMapId: o.transition!.targetMapId,
        targetSpawnId: o.transition!.targetSpawnId,
        requiresFacing:
          o.transition!.requiresFacing
          ?? deriveRequiresFacing(x, y, width, height),
        lockedTitle: o.transition!.lockedTitle,
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
        // `returnDir` picks which side of the trigger the player
        // materialises on, with a one-tile buffer so they don't
        // immediately re-fire the trigger. Facing matches the
        // direction (player walked OUT through that edge). Defaults
        // to 'south' for back-compat with the legacy hardcoded
        // behaviour.
        const dir = o.transition!.returnDir ?? 'south';
        let x: number, y: number;
        let facing: 'up' | 'down' | 'left' | 'right';
        if (tb && tb.width > 0 && tb.height > 0) {
          const cx = o.x + tb.offsetX + tb.width / 2;
          const cy = o.y + tb.offsetY + tb.height / 2;
          const top = o.y + tb.offsetY;
          const bottom = o.y + tb.offsetY + tb.height;
          const left = o.x + tb.offsetX;
          const right = o.x + tb.offsetX + tb.width;
          if (dir === 'north') {
            x = cx; y = top - T; facing = 'up';
          } else if (dir === 'east') {
            x = right + T; y = cy; facing = 'right';
          } else if (dir === 'west') {
            x = left - T; y = cy; facing = 'left';
          } else {
            x = cx; y = bottom + T; facing = 'down';
          }
        } else {
          // No trigger box — derive from entity anchor with the same
          // one-tile buffer in the requested direction.
          if (dir === 'north')      { x = o.x;     y = o.y - T; facing = 'up'; }
          else if (dir === 'east')  { x = o.x + T; y = o.y;     facing = 'right'; }
          else if (dir === 'west')  { x = o.x - T; y = o.y;     facing = 'left'; }
          else                      { x = o.x;     y = o.y + T; facing = 'down'; }
        }
        return {
          id: o.transition!.incomingSpawnId!,
          x,
          y,
          facing,
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
    const mapW = map.width * map.tileSize;
    const mapH = map.height * map.tileSize;
    const restore = restoreState?.mapId === mapId ? restoreState : null;
    if (restore) {
      this.inputAdapter.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, restore.zoom));
    }
    const spawn = restore
      ? {
          id: '__saved-player-location',
          x: Math.max(0, Math.min(mapW, restore.x)),
          y: Math.max(0, Math.min(mapH, restore.y)),
          facing: restore.facing,
        }
      : getSpawnPoint(map, spawnId);
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

    this.gameState = {
      currentMapId: mapId,
      player,
      camera: updateCamera(player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height)),
      entities: map.objects,
      buildings: map.buildings,
      npcs: map.npcs,
      activeDialogue: null,
      returnSpawnId: restore ? restore.returnSpawnId : this.gameState?.returnSpawnId ?? null,
      returnMapId: restore ? restore.returnMapId : this.gameState?.returnMapId ?? null,
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
    this.persistWorldState(true);
  }

  private update(delta: number): void {
    if (!this.gameState || !this.renderSystem || !this.currentMap || this.transitioning) return;

    const map = this.currentMap;
    const mapW = map.width * map.tileSize;
    const mapH = map.height * map.tileSize;

    // Keep the in-world upgrade-timer bar in sync each frame. Cheap
    // when there's no timer (early return inside the helper) so this
    // doesn't add per-frame cost in the common case.
    this.refreshUpgradeProgressBars();

    this.inputAdapter.cameraOffset = { ...this.gameState.camera };
    this.inputAdapter.playerPos = { x: this.gameState.player.x, y: this.gameState.player.y };
    this.inputAdapter.npcs = this.gameState.npcs;
    // Mirror RenderSystem.updateCamera's centering math so screen→world
    // conversion lines up on viewport-capped maps. Uncapped maps have
    // offset (0, 0) — outdoor or any map without `maxViewTiles`.
    if (map.maxViewTiles) {
      const canvasW = this.app.screen.width;
      const canvasH = this.app.screen.height;
      const cap = getViewportWorldSize(map, this.inputAdapter.zoom, canvasW, canvasH);
      const cappedScreenW = cap.viewW * this.inputAdapter.zoom;
      const cappedScreenH = cap.viewH * this.inputAdapter.zoom;
      this.inputAdapter.screenOffset = {
        x: Math.max(0, (canvasW - cappedScreenW) / 2),
        y: Math.max(0, (canvasH - cappedScreenH) / 2),
      };
    } else {
      this.inputAdapter.screenOffset = { x: 0, y: 0 };
    }
    const input = this.inputAdapter.getInputState();

    // Process commands from UI
    let dialogueClosedThisFrame = false;
    for (const cmd of this.commandQueue.drain()) {
      if (cmd.type === 'ADVANCE_DIALOGUE' && this.gameState.activeDialogue) {
        const next = advanceDialogue(this.gameState.activeDialogue);
        if (next) {
          this.gameState.activeDialogue = next;
          this.bridge.emit({ type: 'dialogueAdvance', dialogue: next });
        } else {
          this.gameState.activeDialogue = null;
          this.inputAdapter.clearTransientInput({ suppressInteractUntilRelease: true });
          dialogueClosedThisFrame = true;
          this.bridge.emit({ type: 'dialogueEnd' });
        }
      } else if (cmd.type === 'CLOSE_DIALOGUE') {
        this.gameState.activeDialogue = null;
        this.inputAdapter.clearTransientInput({ suppressInteractUntilRelease: true });
        dialogueClosedThisFrame = true;
        this.bridge.emit({ type: 'dialogueEnd' });
      } else if (cmd.type === 'SET_DIALOGUE') {
        this.gameState.activeDialogue = cmd.dialogue;
        this.inputAdapter.clearTransientInput({ suppressInteractUntilRelease: true });
        this.bridge.emit({ type: 'dialogueAdvance', dialogue: cmd.dialogue });
      }
    }

    if (dialogueClosedThisFrame) {
      // The input snapshot above was taken before the UI command was
      // drained. Do not let that same stale interact/moveTarget start
      // another NPC interaction or movement on the close frame.
      const capAfterDialogue = getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, capAfterDialogue);
      this.renderSystem.updatePlayer(this.gameState.player, delta);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom, map.maxViewTiles ? capAfterDialogue : undefined);
      this.renderSystem.updateAnimations(performance.now() / 1000);
      if (this.tapFeedback) this.tapFeedback.update(delta);
      if (this.debugOverlay) this.debugOverlay.update();
      return;
    }

    // Handle dialogue state. Advancement is OWNED by DialogueOverlay
    // (tap on the box → ADVANCE_DIALOGUE command pushed back to the
    // engine via commandQueue). The engine no longer reads
    // input.interact here — letting Space advance/close from the
    // keyboard meant a player who pressed Space mid-dialogue could
    // skip past a line they hadn't read yet, with no way to recover.
    // Tap on the dialogue box still fast-forwards the typewriter
    // (see DialogueOverlay's handleBoxClick) and advances on full
    // reveal, so keyboard-only flow loses nothing material.
    if (this.gameState.activeDialogue) {
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

    if (this.worldPausedByUI) {
      const capPaused = getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
      this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, capPaused);
      this.renderSystem.updatePlayer(this.gameState.player, 0);
      this.renderSystem.updateCamera(this.gameState.camera.x, this.gameState.camera.y, this.inputAdapter.zoom, map.maxViewTiles ? capPaused : undefined);
      this.renderSystem.updateAnimations(performance.now() / 1000);
      this.renderSystem.applyOcclusionFade();
      if (this.tapFeedback) this.tapFeedback.update(delta);
      if (this.debugOverlay) this.debugOverlay.update();
      return;
    }

    const carObstacleBoxes = this.getCarObstacleBoxes(map.tileSize);

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

    const computerDialogue = this.maybeHandleComputerInteraction(input, map);
    if (computerDialogue) {
      this.gameState.activeDialogue = computerDialogue;
      this.bridge.emit({ type: 'dialogueStart', dialogue: computerDialogue });
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
      // Door-trigger-aware routing. If the tap landed inside a door
      // trigger that has a `requiresFacing` gate, plain A* might pick
      // any walkable cell adjacent to the trigger — including ones
      // where the final step doesn't move in the required direction.
      // The player then orbits the building forever, the door never
      // fires, the user taps again. Fix: rewrite the goal to be the
      // approach cell just outside the trigger on the side opposite
      // `requiresFacing`, then append a final waypoint that steps
      // INTO the trigger. The motion delta on that last step sets
      // directional intent, the door's facing gate is satisfied, the
      // door fires.
      const tap = input.moveTarget;
      const triggerHit = map.triggers.find(t =>
        t.type === 'door' &&
        !!t.requiresFacing &&
        tap.x >= t.x && tap.x < t.x + t.width &&
        tap.y >= t.y && tap.y < t.y + t.height,
      );

      let goalX = tap.x;
      let goalY = tap.y;
      let extraWaypoint: { x: number; y: number } | null = null;
      if (triggerHit && triggerHit.requiresFacing) {
        const T = map.tileSize;
        const cx = triggerHit.x + triggerHit.width / 2;
        const cy = triggerHit.y + triggerHit.height / 2;
        switch (triggerHit.requiresFacing) {
          case 'up':
            goalX = cx; goalY = triggerHit.y + triggerHit.height + T / 2; break;
          case 'down':
            goalX = cx; goalY = triggerHit.y - T / 2; break;
          case 'left':
            goalX = triggerHit.x + triggerHit.width + T / 2; goalY = cy; break;
          case 'right':
            goalX = triggerHit.x - T / 2; goalY = cy; break;
        }
        extraWaypoint = { x: cx, y: cy };
      }

      const waypoints = findPath(
        this.walkGrid,
        this.gameState.player.x, this.gameState.player.y,
        goalX, goalY,
        this.gameState.npcs,
        this.gameState.player.collisionBox,
        carObstacleBoxes,
      );
      if (waypoints.length > 0) {
        if (extraWaypoint) waypoints.push(extraWaypoint);
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
      carObstacleBoxes,
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
            carObstacleBoxes,
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

    // Check door triggers. Direction-gated doors fire only when the
    // player is moving that way THIS frame: either the matching arrow
    // key is held (keyboard), OR the player's position changed in
    // that direction (tap-walk). Pure motion-based gating avoids the
    // sticky-facing bug that fired doors during lateral slides, and
    // pure key-based gating broke mobile entirely (no keys ever held).
    // The combined gate covers both inputs cleanly.
    const MOVE_EPS = 0.01;
    const intent = {
      up: input.up || this.gameState.player.y < prevY - MOVE_EPS,
      down: input.down || this.gameState.player.y > prevY + MOVE_EPS,
      left: input.left || this.gameState.player.x < prevX - MOVE_EPS,
      right: input.right || this.gameState.player.x > prevX + MOVE_EPS,
    };
    const transition = checkDoorTriggers(
      this.gameState.player.x,
      this.gameState.player.y,
      this.gameState.player.collisionBox,
      intent,
      map.triggers,
      this.gameState.buildings,
    );

    if (transition?.lockedTitle) {
      // Gated transition: emit a placeholder dialogue and don't load.
      // Suppress while the player keeps overlapping the same locked
      // trigger (`lastLockedTitle`) so the dialogue doesn't fire
      // every tick. Cleared on the first tick the player isn't on
      // any locked trigger — see the `transition === null` branch
      // further down.
      if (this.lastLockedTitle !== transition.lockedTitle) {
        this.lastLockedTitle = transition.lockedTitle;
        this.bridge.emit({ type: 'lockedTransition', title: transition.lockedTitle });
      }
    } else if (transition === null) {
      this.lastLockedTitle = null;
    }

    if (transition && !transition.lockedTitle) {
      this.transitioning = true;
      this.bridge.emit({ type: 'sceneTransitionStart' });

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

      // Hold the load until the fade-to-black is complete so the user
      // sees a clean cross-cut rather than the new scene popping in
      // mid-fade. `sceneChange` (emitted from inside `loadScene`)
      // drives the fade-back-in on the React side, so total wall-clock
      // time is FADE_OUT_MS + loadScene + FADE_IN_MS.
      const FADE_OUT_MS = 220;
      window.setTimeout(() => {
        if (this.destroyed) return;
        this.loadScene(targetMapId, spawnId).then(() => {
          if (this.destroyed) return;
          this.transitioning = false;
        });
      }, FADE_OUT_MS);
      return;
    }

    // Update camera — if the map caps the view (interior rooms), compute the
    // capped viewport in world px and pass it through so the camera clamps
    // inside the visible window and anything outside renders as black.
    const viewportCap = getViewportWorldSize(map, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height);
    this.gameState.camera = updateCamera(this.gameState.player, mapW, mapH, this.inputAdapter.zoom, this.app.screen.width, this.app.screen.height, viewportCap);

    // Guided NPC walks (social-hub: walk to POI). Runs BEFORE the
    // wander update so guided positions are authoritative for this
    // tick — wander state would otherwise overwrite them.
    this.updateGuidedNpcs(delta);

    // Update NPC wandering
    if (this.npcWanderStates.length > 0 && this.walkGrid) {
      const grid = this.walkGrid;
      const GRID_CELL = 16;
      updateWanderStates(this.npcWanderStates, delta, (x, y, npcId) => {
        const gc = Math.floor(x / GRID_CELL);
        const gr = Math.floor(y / GRID_CELL);
        if (gr < 0 || gr >= grid.length || gc < 0 || gc >= (grid[0]?.length ?? 0)) return false;
        if (!grid[gr][gc]) return false;
        const npc = this.gameState?.npcs.find(n => n.id === npcId);
        if (!npc) return true;
        const npcBox: WorldBox = {
          x: x + npc.collisionBox.offsetX,
          y: y + npc.collisionBox.offsetY,
          width: npc.collisionBox.width,
          height: npc.collisionBox.height,
        };
        return !carObstacleBoxes.some(carBox =>
          npcBox.x < carBox.x + carBox.width &&
          npcBox.x + npcBox.width > carBox.x &&
          npcBox.y < carBox.y + carBox.height &&
          npcBox.y + npcBox.height > carBox.y
        );
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
        return this.resolveCarCollisionBox(key);
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

    // Debug overlays — drawn after everything else so the rects sit
    // on top of sprites. Two toggles share the same draw call:
    //   `: collision boxes (player/NPC green, cars red, look-ahead yellow)
    //   T: tap zones (cyan = NPCs, pink = object interactions)
    if (this.debugShowCollisions || this.debugShowTapZones) {
      const T = map.tileSize;
      const items: Array<{ box: { left: number; top: number; right: number; bottom: number }; color: number }> = [];
      if (this.debugShowCollisions) {
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
            const box = this.resolveCarCollisionBox(key) ?? { offsetX: -T / 2, offsetY: -T / 2, width: T, height: T };
            items.push({ box: carAABB(car, box), color: 0xff3333 });
            items.push({ box: lookAheadBox(car, T, box), color: 0xffcc00 });
          }
        }
      }
      if (this.debugShowTapZones) {
        for (const n of this.gameState.npcs) {
          items.push({
            box: {
              left: n.x - NPC_TAP_HALF_W,
              top: n.y - NPC_TAP_TOP,
              right: n.x + NPC_TAP_HALF_W,
              bottom: n.y + NPC_TAP_BOTTOM,
            },
            color: 0x00ccff,
          });
        }
        const computer = this.findF1Computer();
        if (computer) {
          const box = this.getComputerWorldBox(computer);
          items.push({
            box: {
              left: box.x,
              top: box.y,
              right: box.x + box.width,
              bottom: box.y + box.height,
            },
            color: 0xff66cc,
          });
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

    this.persistWorldState();
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

  /** Pauses world simulation while React-owned blocking UI is open. */
  setWorldPausedByUI(paused: boolean): void {
    if (this.worldPausedByUI === paused) return;
    this.worldPausedByUI = paused;
    if (paused) {
      this.inputAdapter.clearTransientInput({ suppressInteractUntilRelease: true });
      this.inputAdapter.setVirtualDirection(null);
      if (this.debugShowTapZones) {
        this.debugShowTapZones = false;
        this.renderSystem?.clearDebugCollisions();
      }
    }
  }

  /** Forwarded from the on-screen virtual D-pad in `VirtualDPad.tsx`. */
  setVirtualDirection(dir: { up: boolean; down: boolean; left: boolean; right: boolean } | null): void {
    this.inputAdapter.setVirtualDirection(dir);
  }

  resize(): void {
    if (this.destroyed || !this.initialized) return;
    this.app.resize();
  }

  destroy(): void {
    this.persistWorldState(true);
    this.destroyed = true;
    this.currentMap = null;
    if (this.computerUpgradeUnsub) {
      this.computerUpgradeUnsub();
      this.computerUpgradeUnsub = null;
    }
    this.inputAdapter.destroy();
    this.bgm.destroy();
    if (this.debugKeydownHandler) {
      window.removeEventListener('keydown', this.debugKeydownHandler);
      this.debugKeydownHandler = null;
    }
    if (this.pageLifecycleHandler) {
      window.removeEventListener('pagehide', this.pageLifecycleHandler);
      document.removeEventListener('visibilitychange', this.pageLifecycleHandler);
      this.pageLifecycleHandler = null;
    }
    if (this.contextLostHandler || this.contextRestoredHandler) {
      const canvas = this.app?.canvas as HTMLCanvasElement | undefined;
      if (canvas) {
        if (this.contextLostHandler) canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
        if (this.contextRestoredHandler) canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
      }
      this.contextLostHandler = null;
      this.contextRestoredHandler = null;
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
