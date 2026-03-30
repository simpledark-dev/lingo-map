import { Application, Container, Sprite } from 'pixi.js';
import { MapData, PlayerState, TileType } from '../core/types';
import { getTexture } from './AssetLoader';

export class RenderSystem {
  private app: Application;
  private worldContainer: Container;
  private groundLayer: Container;
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

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.groundLayer = new Container();
    this.entityLayer = new Container();
    this.roofLayer = new Container();

    // Entity layer uses sortableChildren for zIndex-based depth sorting
    this.entityLayer.sortableChildren = true;

    this.worldContainer.addChild(this.groundLayer);
    this.worldContainer.addChild(this.entityLayer);
    this.worldContainer.addChild(this.roofLayer);
    this.app.stage.addChild(this.worldContainer);
  }

  renderTiles(map: MapData): void {
    this.groundLayer.removeChildren();

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
  }

  renderObjects(map: MapData): void {
    this.currentMap = map;
    this.entityLayer.removeChildren();
    this.roofLayer.removeChildren();
    this.objectSprites.clear();
    this.buildingBaseSprites.clear();
    this.npcSprites.clear();
    this.roofSprites.clear();

    // Objects (trees, rocks)
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

  updatePlayer(player: PlayerState): void {
    if (!this.playerSprite) return;

    const texture = getTexture(player.spriteKey);
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

    keys.add('player-down');
    keys.add('player-up');
    keys.add('player-left');
    keys.add('player-right');

    return Array.from(keys);
  }

  destroy(): void {
    this.worldContainer.destroy({ children: true });
  }
}
