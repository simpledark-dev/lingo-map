import { Application, Container, Sprite } from 'pixi.js';
import { MapData, PlayerState, TileType } from '../core/types';
import { getTexture } from './AssetLoader';
import { buildTransitionLayer, TRANSITION_ASSET_KEYS } from './TransitionTiles';

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
    this.entityLayer = new Container();
    this.roofLayer = new Container();

    // Entity layer uses sortableChildren for zIndex-based depth sorting
    this.entityLayer.sortableChildren = true;

    this.worldContainer.addChild(this.groundLayer);
    this.worldContainer.addChild(this.transitionLayer);
    this.worldContainer.addChild(this.entityLayer);
    this.worldContainer.addChild(this.roofLayer);
    this.app.stage.addChild(this.worldContainer);
  }

  renderTiles(map: MapData): void {
    this.groundLayer.removeChildren();
    this.transitionLayer.removeChildren();

    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const tileType = map.tiles[row][col];
        const texture = getTexture(tileType);
        if (!texture) continue;

        const sprite = new Sprite(texture);
        sprite.x = col * map.tileSize;
        sprite.y = row * map.tileSize;
        sprite.width = map.tileSize;
        sprite.height = map.tileSize;
        this.groundLayer.addChild(sprite);
      }
    }

    // Build transition overlays (grass ↔ dirt dithered edges)
    const transitions = buildTransitionLayer(map);
    this.transitionLayer.addChild(transitions);
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

    // Objects (trees, rocks)
    let seed = 1;
    for (const obj of map.objects) {
      const texture = getTexture(obj.spriteKey);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(obj.anchor.x, obj.anchor.y);
      sprite.x = obj.x;
      sprite.y = obj.y;
      sprite.zIndex = obj.sortY;
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
      const baseTexture = getTexture(building.baseSpriteKey);
      if (baseTexture) {
        const sprite = new Sprite(baseTexture);
        sprite.anchor.set(building.anchor.x, building.anchor.y);
        sprite.x = building.x;
        sprite.y = building.y;
        sprite.zIndex = building.sortY;
        this.entityLayer.addChild(sprite);
        this.buildingBaseSprites.set(building.id, sprite);
      }

      // Roof — managed collection for future per-roof control
      const roofTexture = getTexture(building.roofSpriteKey);
      if (roofTexture) {
        const roofSprite = new Sprite(roofTexture);
        roofSprite.anchor.set(building.anchor.x, 1.0);
        // Position roof so its bottom sits on top of the base sprite
        // Base anchor is (0.5, 1.0), so base top = building.y - baseTexture.height
        // Roof bottom should meet base top
        const baseHeight = baseTexture ? baseTexture.height : 96;
        roofSprite.x = building.x;
        roofSprite.y = building.y - baseHeight;
        roofSprite.alpha = 1.0; // fully opaque for vertical slice
        this.roofLayer.addChild(roofSprite);
        this.roofSprites.set(building.id, roofSprite);
      }
    }

    // NPCs
    for (const npc of map.npcs) {
      const texture = getTexture(npc.spriteKey);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(npc.anchor.x, npc.anchor.y);
      sprite.x = npc.x;
      sprite.y = npc.y;
      sprite.zIndex = npc.sortY;
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
    this.playerSprite.zIndex = player.sortY;
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
    this.playerSprite.zIndex = player.sortY;
  }

  updateCamera(cameraX: number, cameraY: number, zoom: number = 1): void {
    this.worldContainer.scale.set(zoom, zoom);
    this.worldContainer.x = -cameraX * zoom;
    this.worldContainer.y = -cameraY * zoom;
  }

  /** Update an NPC sprite's position (for wandering). */
  updateNPC(npcId: string, x: number, y: number): void {
    const sprite = this.npcSprites.get(npcId);
    if (!sprite) return;
    sprite.x = x;
    sprite.y = y;
    sprite.zIndex = y;
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

    // NPC idle bob — slight Y oscillation
    for (const [id, anim] of this.npcAnims) {
      const sprite = this.npcSprites.get(id);
      if (!sprite) continue;
      const t = time * anim.speed + anim.phase;
      sprite.y = anim.baseY + Math.sin(t) * anim.swayAmount;
    }
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

    const tileTypes = new Set<TileType>();
    for (const row of map.tiles) {
      for (const t of row) tileTypes.add(t);
    }
    for (const t of tileTypes) keys.add(t);

    for (const obj of map.objects) keys.add(obj.spriteKey);
    for (const b of map.buildings) {
      keys.add(b.baseSpriteKey);
      keys.add(b.roofSpriteKey);
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
