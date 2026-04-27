import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { MapData, PlayerState, TileType } from '../core/types';
import { PLAYER_LAYER_ID } from '../core/constants';
import { getEffectiveZIndex, getLayers, getObjectLayers, getPrimaryTileLayer, getTileLayers } from '../core/Layers';
import { getTexture, getTileTexture } from './AssetLoader';
import { buildTransitionLayer, TRANSITION_ASSET_KEYS } from './TransitionTiles';
import { buildAutoTileLayer, isAutoTilesetReady } from './AutoTileset';

interface AnimData {
  baseX: number;
  baseY: number;
  phase: number;     // random offset so each sprite sways independently
  speed: number;     // oscillation speed
  rotAmount: number; // max rotation in radians
  swayAmount: number; // max X sway in pixels
}

export class RenderSystem {
  private app: Application;
  private worldContainer: Container;
  private groundLayer: Container;
  private transitionLayer: Container;
  private autoTileLayer: Container;
  private entityLayer: Container;
  private roofLayer: Container;

  private playerSprite: Sprite | null = null;

  // Sprite registries for depth sorting
  private objectSprites = new Map<string, Sprite>();
  private buildingBaseSprites = new Map<string, Sprite>();
  private npcSprites = new Map<string, Sprite>();

  // Managed roof collection — supports per-roof control for future extensibility
  private roofSprites = new Map<string, Sprite>();

  // Current map data (needed for sorting)
  private currentMap: MapData | null = null;

  // Animation data — renderer-only, does not affect gameplay
  private treeAnims = new Map<string, AnimData>();
  private npcAnims = new Map<string, AnimData>();
  animationsEnabled = true;

  // Player walk animation state
  private playerWalkTimer = 0;
  private playerWalkFrame = 0; // 0 = idle, 1 = walk1, 2 = walk2
  private playerLastX = 0;
  private playerLastY = 0;
  private readonly WALK_FRAME_DURATION = 0.15; // seconds per frame

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.groundLayer = new Container();
    this.transitionLayer = new Container();
    this.autoTileLayer = new Container();
    this.entityLayer = new Container();
    this.roofLayer = new Container();

    // Entity layer uses sortableChildren for zIndex-based depth sorting
    this.entityLayer.sortableChildren = true;

    this.worldContainer.addChild(this.groundLayer);
    this.worldContainer.addChild(this.transitionLayer);
    this.worldContainer.addChild(this.autoTileLayer);
    this.worldContainer.addChild(this.entityLayer);
    this.worldContainer.addChild(this.roofLayer);
    this.app.stage.addChild(this.worldContainer);
  }

  renderTiles(map: MapData): void {
    this.groundLayer.removeChildren();
    this.transitionLayer.removeChildren();
    this.autoTileLayer.removeChildren();

    // Iterate every tile layer in render order, drawing each non-empty cell
    // into the shared ground container. Empty cells let lower layers show
    // through. Game runtime ignores the editor-only `visible` flag.
    const tileLayers = getTileLayers(map);
    for (const layer of tileLayers) {
      for (let row = 0; row < map.height; row++) {
        for (let col = 0; col < map.width; col++) {
          const tileType = layer.tiles[row]?.[col];
          if (!tileType) continue;
          const texture = getTileTexture(tileType, row, col);
          if (!texture) continue;
          const sprite = new Sprite(texture);
          sprite.x = col * map.tileSize;
          sprite.y = row * map.tileSize;
          sprite.width = map.tileSize;
          sprite.height = map.tileSize;
          this.groundLayer.addChild(sprite);
        }
      }
    }

    // Transitions + autotile anchor on the PRIMARY (first) tile layer —
    // typically "Ground". Higher tile layers (e.g. Walls) don't participate.
    const primary = getPrimaryTileLayer(map);
    const primaryGrid = primary?.tiles ?? map.tiles;
    const transitions = buildTransitionLayer({ ...map, tiles: primaryGrid }, false);
    this.transitionLayer.addChild(transitions);
    if (isAutoTilesetReady()) {
      const autoTiles = buildAutoTileLayer(primaryGrid, map.width, map.height, map.tileSize);
      this.autoTileLayer.addChild(autoTiles);
    }
  }

  renderObjects(map: MapData): void {
    this.currentMap = map;
    this.entityLayer.removeChildren();
    this.roofLayer.removeChildren();
    this.objectSprites.clear();
    this.buildingBaseSprites.clear();
    this.npcSprites.clear();
    this.roofSprites.clear();
    this.treeAnims.clear();
    this.npcAnims.clear();

    const layers = getLayers(map);

    // Objects (trees, rocks)
    let seed = 1;
    for (const obj of map.objects) {
      const texture = getTexture(obj.spriteKey);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(obj.anchor.x, obj.anchor.y);
      sprite.x = obj.x;
      sprite.y = obj.y;
      sprite.zIndex = getEffectiveZIndex(layers, obj.layer, obj.sortY);
      if (obj.scale && obj.scale !== 1) sprite.scale.set(obj.scale);
      this.entityLayer.addChild(sprite);
      this.objectSprites.set(obj.id, sprite);

      // Register tree animations
      if (obj.spriteKey === 'tree') {
        // Deterministic per-tree variation using a simple hash
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        this.treeAnims.set(obj.id, {
          baseX: obj.x,
          baseY: obj.y,
          phase: (seed % 1000) / 1000 * Math.PI * 2,
          speed: 0.8 + (seed % 500) / 1000,  // 0.8–1.3
          rotAmount: 0.015 + (seed % 300) / 30000, // 0.015–0.025 rad (~1–1.5 deg)
          swayAmount: 0.5 + (seed % 200) / 400, // 0.5–1.0 px
        });
      }
    }

    // Building bases
    for (const building of map.buildings) {
      const scale = building.scale ?? 1;
      const baseTexture = getTexture(building.baseSpriteKey);
      if (baseTexture) {
        const sprite = new Sprite(baseTexture);
        sprite.anchor.set(building.anchor.x, building.anchor.y);
        sprite.x = building.x;
        sprite.y = building.y;
        // Buildings always render on the props layer alongside the player so
        // Y-sort lets you walk visually behind them.
        sprite.zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, building.sortY);
        if (scale !== 1) sprite.scale.set(scale);
        this.entityLayer.addChild(sprite);
        this.buildingBaseSprites.set(building.id, sprite);
      }

      // Roof — managed collection for future per-roof control. Skipped if the
      // building is drawn as a single sprite (no separate roof).
      const roofTexture = building.roofSpriteKey ? getTexture(building.roofSpriteKey) : undefined;
      if (roofTexture) {
        const roofSprite = new Sprite(roofTexture);
        roofSprite.anchor.set(building.anchor.x, 1.0);
        // Position roof so its bottom sits on top of the base sprite. With
        // building.scale applied, the visible base height is baseHeight * scale.
        const baseHeight = baseTexture ? baseTexture.height : 96;
        roofSprite.x = building.x;
        roofSprite.y = building.y - baseHeight * scale;
        if (scale !== 1) roofSprite.scale.set(scale);
        roofSprite.alpha = 1.0; // fully opaque for vertical slice
        this.roofLayer.addChild(roofSprite);
        this.roofSprites.set(building.id, roofSprite);
      }
    }

    // NPCs — always on the props layer alongside the player.
    for (const npc of map.npcs) {
      const texture = getTexture(npc.spriteKey);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(npc.anchor.x, npc.anchor.y);
      sprite.x = npc.x;
      sprite.y = npc.y;
      sprite.zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, npc.sortY);
      this.entityLayer.addChild(sprite);
      this.npcSprites.set(npc.id, sprite);

      // NPC idle bob — very subtle vertical movement
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      this.npcAnims.set(npc.id, {
        baseX: npc.x,
        baseY: npc.y,
        phase: (seed % 1000) / 1000 * Math.PI * 2,
        speed: 1.2 + (seed % 400) / 1000, // 1.2–1.6
        rotAmount: 0,
        swayAmount: 0.8, // subtle vertical bob in pixels
      });
    }
  }

  initPlayer(player: PlayerState): void {
    const texture = getTexture(player.spriteKey);
    if (!texture) return;

    this.playerSprite = new Sprite(texture);
    this.playerSprite.anchor.set(player.anchor.x, player.anchor.y);
    this.playerSprite.x = player.x;
    this.playerSprite.y = player.y;
    const layers = this.currentMap ? getLayers(this.currentMap) : [];
    this.playerSprite.zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, player.sortY);
    this.entityLayer.addChild(this.playerSprite);
  }

  updatePlayer(player: PlayerState, delta: number = 0): void {
    if (!this.playerSprite) return;

    // Detect if player is moving
    const dx = player.x - this.playerLastX;
    const dy = player.y - this.playerLastY;
    const isMoving = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;
    this.playerLastX = player.x;
    this.playerLastY = player.y;

    // Determine sprite key with walk animation
    let spriteKey = player.spriteKey; // e.g. 'player-down'

    if (isMoving && delta > 0) {
      this.playerWalkTimer += delta;
      if (this.playerWalkTimer >= this.WALK_FRAME_DURATION) {
        this.playerWalkTimer -= this.WALK_FRAME_DURATION;
        // Alternate: walk1 → idle → walk1 → idle...
        this.playerWalkFrame = (this.playerWalkFrame + 1) % 2;
      }
      if (this.playerWalkFrame === 0) {
        spriteKey = player.spriteKey + '-walk1';
      }
      // frame 1 = idle (use base spriteKey, already set)
    } else {
      // Standing still — reset to idle
      this.playerWalkTimer = 0;
      this.playerWalkFrame = 0;
    }

    // Try walk frame, fall back to base sprite if not found
    const texture = getTexture(spriteKey) || getTexture(player.spriteKey);
    if (texture) {
      this.playerSprite.texture = texture;
    }
    this.playerSprite.x = player.x;
    this.playerSprite.y = player.y;
    const layers = this.currentMap ? getLayers(this.currentMap) : [];
    this.playerSprite.zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, player.sortY);
  }

  /** Mask rectangle that clips `worldContainer` to a centered sub-region of
   * the canvas when the current map imposes a viewport cap. Left unassigned
   * (no mask) when there is no cap, so the whole canvas shows the world. */
  private viewportMask: Graphics | null = null;

  updateCamera(
    cameraX: number,
    cameraY: number,
    zoom: number = 1,
    viewportCap?: { viewW: number; viewH: number },
  ): void {
    const canvasW = this.app.screen.width;
    const canvasH = this.app.screen.height;

    // If a cap is set, the visible window in screen pixels is the capped
    // world size scaled by zoom, centered on the canvas. Otherwise the world
    // fills the whole canvas (no mask, no centering offset).
    const cappedScreenW = viewportCap ? viewportCap.viewW * zoom : canvasW;
    const cappedScreenH = viewportCap ? viewportCap.viewH * zoom : canvasH;
    const offsetX = viewportCap ? (canvasW - cappedScreenW) / 2 : 0;
    const offsetY = viewportCap ? (canvasH - cappedScreenH) / 2 : 0;

    this.worldContainer.scale.set(zoom, zoom);
    this.worldContainer.x = offsetX - cameraX * zoom;
    this.worldContainer.y = offsetY - cameraY * zoom;

    // Install / update / remove the viewport mask so anything outside the
    // visible window renders black (the stage background).
    if (viewportCap) {
      if (!this.viewportMask) {
        this.viewportMask = new Graphics();
        this.app.stage.addChild(this.viewportMask);
        this.worldContainer.mask = this.viewportMask;
      }
      this.viewportMask.clear();
      this.viewportMask.rect(offsetX, offsetY, cappedScreenW, cappedScreenH).fill(0xffffff);
    } else if (this.viewportMask) {
      this.worldContainer.mask = null;
      this.viewportMask.destroy();
      this.app.stage.removeChild(this.viewportMask);
      this.viewportMask = null;
    }

    // Viewport culling — still based on canvas so we don't accidentally cull
    // sprites that fall inside the clip region of the mask.
    this.cullViewport(cameraX, cameraY, zoom, canvasW, canvasH);
  }

  private cullViewport(camX: number, camY: number, zoom: number, canvasW: number, canvasH: number): void {
    const margin = 128; // extra margin to avoid pop-in
    const vw = canvasW / zoom + margin * 2;
    const vh = canvasH / zoom + margin * 2;
    const left = camX - margin;
    const top = camY - margin;
    const right = left + vw;
    const bottom = top + vh;

    // Cull ground tiles
    const T = this.currentMap?.tileSize ?? 32;
    for (const child of this.groundLayer.children) {
      child.visible = child.x + T > left && child.x < right && child.y + T > top && child.y < bottom;
    }

    // Cull transition layer
    for (const child of this.transitionLayer.children) {
      // Transition layer has a single container child
      if ('children' in child) {
        for (const tc of (child as Container).children) {
          tc.visible = tc.x + T > left && tc.x < right && tc.y + T > top && tc.y < bottom;
        }
      }
    }

    // Cull auto-tile layer (same nested structure as transitions)
    for (const child of this.autoTileLayer.children) {
      if ('children' in child) {
        for (const tc of (child as Container).children) {
          tc.visible = tc.x + T > left && tc.x < right && tc.y + T > top && tc.y < bottom;
        }
      }
    }

    // Cull entity layer (trees, objects, NPCs, buildings — but not player)
    for (const child of this.entityLayer.children) {
      if (child === this.playerSprite) continue;
      child.visible = child.x + 128 > left && child.x - 128 < right && child.y + 32 > top && child.y - 192 < bottom;
    }

    // Cull roofs
    for (const child of this.roofLayer.children) {
      child.visible = child.x + 128 > left && child.x - 128 < right && child.y + 128 > top && child.y - 128 < bottom;
    }
  }

  /** Update an NPC sprite's position (for wandering). */
  updateNPC(npcId: string, x: number, y: number): void {
    const sprite = this.npcSprites.get(npcId);
    if (!sprite) return;
    sprite.x = x;
    sprite.y = y;
    const layers = this.currentMap ? getLayers(this.currentMap) : [];
    sprite.zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, y);
    // Update animation base position so idle bob is relative to new position
    const anim = this.npcAnims.get(npcId);
    if (anim) {
      anim.baseX = x;
      anim.baseY = y;
    }
  }

  /** Update idle animations for trees and NPCs. Call once per frame. */
  updateAnimations(time: number): void {
    if (!this.animationsEnabled) return;

    // Tree sway — rotation + slight X offset
    for (const [id, anim] of this.treeAnims) {
      const sprite = this.objectSprites.get(id);
      if (!sprite) continue;
      const t = time * anim.speed + anim.phase;
      sprite.rotation = Math.sin(t) * anim.rotAmount;
      sprite.x = anim.baseX + Math.sin(t * 0.7) * anim.swayAmount;
    }

    // NPC idle bob — disabled temporarily
    // for (const [id, anim] of this.npcAnims) {
    //   const sprite = this.npcSprites.get(id);
    //   if (!sprite) continue;
    //   const t = time * anim.speed + anim.phase;
    //   sprite.y = anim.baseY + Math.sin(t) * anim.swayAmount;
    // }
  }

  /** Get the world container for attaching overlays (e.g. tap indicators). */
  getWorldContainer(): Container {
    return this.worldContainer;
  }

  /** Get a roof sprite by building ID — for future per-roof behavior. */
  getRoofSprite(buildingId: string): Sprite | undefined {
    return this.roofSprites.get(buildingId);
  }

  /** Total number of sprites currently in the scene graph. */
  getSpriteCount(): number {
    return this.groundLayer.children.length
      + this.entityLayer.children.length
      + this.roofLayer.children.length;
  }

  static getRequiredAssets(map: MapData): string[] {
    const keys = new Set<string>();

    // Tile types may be enum strings or pack refs (`me:...`). Both go through
    // the same `loadAssets` path (it routes `me:` keys to the pack loader).
    const tileTypes = new Set<string>();
    for (const row of map.tiles) {
      for (const t of row) tileTypes.add(t);
    }
    for (const t of tileTypes) keys.add(t);

    for (const obj of map.objects) keys.add(obj.spriteKey);
    for (const b of map.buildings) {
      keys.add(b.baseSpriteKey);
      if (b.roofSpriteKey) keys.add(b.roofSpriteKey);
    }
    for (const npc of map.npcs) keys.add(npc.spriteKey);

    for (const dir of ['down', 'up', 'left', 'right']) {
      keys.add(`player-${dir}`);
      keys.add(`player-${dir}-walk1`);
      keys.add(`player-${dir}-walk2`);
    }

    // Transition tiles
    for (const k of TRANSITION_ASSET_KEYS) keys.add(k);

    return Array.from(keys);
  }

  destroy(): void {
    this.worldContainer.destroy({ children: true });
  }
}
