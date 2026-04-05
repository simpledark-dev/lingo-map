import { Application, Container, Sprite, Graphics } from 'pixi.js';
import { TileType, Entity, Building } from '../core/types';
import { loadAssets, getTexture, preloadAllAssets } from '../renderer/AssetLoader';
import { buildTransitionLayer, TRANSITION_ASSET_KEYS } from '../renderer/TransitionTiles';

export class EditorApp {
  app: Application;
  private worldContainer: Container;
  private groundLayer: Container;
  private transitionLayer: Container;
  private entityLayer: Container;
  private roofLayer: Container;
  private gridOverlay: Container;
  private hoverGraphics: Graphics;
  private selectionGraphics: Graphics;
  private previewContainer: Container;
  private previewSprites: Sprite[] = [];

  private tileSprites: (Sprite | null)[][] = [];
  private objectSprites = new Map<string, Sprite>();
  private buildingBaseSprites = new Map<string, Sprite>();
  private buildingRoofSprites = new Map<string, Sprite>();

  private mapWidth = 0;
  private mapHeight = 0;
  private tileSize = 32;
  private initialized = false;
  private destroyed = false;

  // Current tiles for transition rebuilds
  private currentTiles: TileType[][] = [];

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.groundLayer = new Container();
    this.transitionLayer = new Container();
    this.entityLayer = new Container();
    this.roofLayer = new Container();
    this.gridOverlay = new Container();
    this.hoverGraphics = new Graphics();
    this.selectionGraphics = new Graphics();
    this.previewContainer = new Container();
    this.entityLayer.sortableChildren = true;
  }

  async init(container: HTMLDivElement): Promise<void> {
    const rect = container.getBoundingClientRect();
    await this.app.init({
      width: rect.width || 800,
      height: rect.height || 600,
      backgroundColor: 0x222222,
      antialias: false,
      resolution: 1,
    });

    if (this.destroyed) return;

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    this.worldContainer.addChild(this.groundLayer);
    this.worldContainer.addChild(this.transitionLayer);
    this.worldContainer.addChild(this.entityLayer);
    this.worldContainer.addChild(this.roofLayer);
    this.worldContainer.addChild(this.gridOverlay);
    this.worldContainer.addChild(this.hoverGraphics);
    this.worldContainer.addChild(this.selectionGraphics);
    this.worldContainer.addChild(this.previewContainer);
    this.app.stage.addChild(this.worldContainer);

    // Load all assets
    await preloadAllAssets();

    // Responsive resize
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.app.renderer.resize(width, height);
        }
      }
    });
    observer.observe(container);

    this.initialized = true;
  }

  renderTiles(tiles: TileType[][], width: number, height: number, tileSize: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
    this.tileSize = tileSize;
    this.currentTiles = tiles;
    this.groundLayer.removeChildren();
    this.tileSprites = [];

    for (let r = 0; r < height; r++) {
      const row: (Sprite | null)[] = [];
      for (let c = 0; c < width; c++) {
        const tex = getTexture(tiles[r][c]);
        if (!tex) { row.push(null); continue; }
        const s = new Sprite(tex);
        s.x = c * tileSize;
        s.y = r * tileSize;
        s.width = tileSize;
        s.height = tileSize;
        this.groundLayer.addChild(s);
        row.push(s);
      }
      this.tileSprites.push(row);
    }

    this.rebuildTransitions(tiles, width, height, tileSize);
    this.rebuildGrid();
  }

  updateSingleTile(row: number, col: number, tileType: TileType): void {
    const tex = getTexture(tileType);
    if (!tex) return;
    const existing = this.tileSprites[row]?.[col];
    if (existing) {
      existing.texture = tex;
    }
  }

  rebuildTransitions(tiles?: TileType[][], width?: number, height?: number, tileSize?: number): void {
    const t = tiles ?? this.currentTiles;
    const w = width ?? this.mapWidth;
    const h = height ?? this.mapHeight;
    const ts = tileSize ?? this.tileSize;
    if (t.length === 0) return;

    this.transitionLayer.removeChildren();
    const mapData = { id: 'editor', width: w, height: h, tileSize: ts, tiles: t, objects: [], buildings: [], npcs: [], triggers: [], spawnPoints: [] };
    const layer = buildTransitionLayer(mapData);
    this.transitionLayer.addChild(layer);
  }

  renderObjects(objects: Entity[]): void {
    this.entityLayer.removeChildren();
    this.objectSprites.clear();
    for (const obj of objects) {
      this.addObjectSprite(obj);
    }
  }

  addObjectSprite(obj: Entity): void {
    const tex = getTexture(obj.spriteKey);
    if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(obj.anchor.x, obj.anchor.y);
    s.x = obj.x;
    s.y = obj.y;
    s.zIndex = obj.sortY;
    this.entityLayer.addChild(s);
    this.objectSprites.set(obj.id, s);
  }

  removeObjectSprite(id: string): void {
    const s = this.objectSprites.get(id);
    if (s) {
      this.entityLayer.removeChild(s);
      s.destroy();
      this.objectSprites.delete(id);
    }
  }

  renderBuildings(buildings: Building[]): void {
    // Clear existing
    for (const s of this.buildingBaseSprites.values()) { this.entityLayer.removeChild(s); s.destroy(); }
    for (const s of this.buildingRoofSprites.values()) { this.roofLayer.removeChild(s); s.destroy(); }
    this.buildingBaseSprites.clear();
    this.buildingRoofSprites.clear();

    for (const b of buildings) {
      this.addBuildingSprites(b);
    }
  }

  addBuildingSprites(b: Building): void {
    const baseTex = getTexture(b.baseSpriteKey);
    if (baseTex) {
      const s = new Sprite(baseTex);
      s.anchor.set(b.anchor.x, b.anchor.y);
      s.x = b.x;
      s.y = b.y;
      s.zIndex = b.sortY;
      this.entityLayer.addChild(s);
      this.buildingBaseSprites.set(b.id, s);

      // Roof
      const roofTex = getTexture(b.roofSpriteKey);
      if (roofTex) {
        const rs = new Sprite(roofTex);
        rs.anchor.set(b.anchor.x, 1.0);
        rs.x = b.x;
        rs.y = b.y - baseTex.height;
        this.roofLayer.addChild(rs);
        this.buildingRoofSprites.set(b.id, rs);
      }
    }
  }

  removeBuildingSprites(id: string): void {
    const base = this.buildingBaseSprites.get(id);
    if (base) { this.entityLayer.removeChild(base); base.destroy(); this.buildingBaseSprites.delete(id); }
    const roof = this.buildingRoofSprites.get(id);
    if (roof) { this.roofLayer.removeChild(roof); roof.destroy(); this.buildingRoofSprites.delete(id); }
  }

  private rebuildGrid(): void {
    this.gridOverlay.removeChildren();
    const g = new Graphics();
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.15 });
    const totalW = this.mapWidth * this.tileSize;
    const totalH = this.mapHeight * this.tileSize;
    for (let r = 0; r <= this.mapHeight; r++) {
      g.moveTo(0, r * this.tileSize);
      g.lineTo(totalW, r * this.tileSize);
    }
    for (let c = 0; c <= this.mapWidth; c++) {
      g.moveTo(c * this.tileSize, 0);
      g.lineTo(c * this.tileSize, totalH);
    }
    g.stroke();
    this.gridOverlay.addChild(g);
  }

  setGridVisible(visible: boolean): void {
    this.gridOverlay.visible = visible;
  }

  highlightCell(row: number, col: number): void {
    this.hoverGraphics.clear();
    this.hoverGraphics.rect(col * this.tileSize, row * this.tileSize, this.tileSize, this.tileSize);
    this.hoverGraphics.fill({ color: 0x4488ff, alpha: 0.25 });
  }

  highlightObject(obj: Entity): void {
    this.selectionGraphics.clear();
    const s = this.objectSprites.get(obj.id);
    if (!s) return;
    const bounds = s.getBounds();
    this.selectionGraphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.selectionGraphics.stroke({ width: 2, color: 0x44ff44, alpha: 0.8 });
  }

  clearHighlight(): void {
    this.hoverGraphics.clear();
  }

  /** Show a semi-transparent preview of a building at the given position. */
  showBuildingPreview(baseSpriteKey: string, roofSpriteKey: string, x: number, y: number, anchor: { x: number; y: number }): void {
    this.clearPreview();
    const baseTex = getTexture(baseSpriteKey);
    if (baseTex) {
      const s = new Sprite(baseTex);
      s.anchor.set(anchor.x, anchor.y);
      s.x = x;
      s.y = y;
      s.alpha = 0.5;
      this.previewContainer.addChild(s);
      this.previewSprites.push(s);

      const roofTex = getTexture(roofSpriteKey);
      if (roofTex) {
        const rs = new Sprite(roofTex);
        rs.anchor.set(anchor.x, 1.0);
        rs.x = x;
        rs.y = y - baseTex.height;
        rs.alpha = 0.5;
        this.previewContainer.addChild(rs);
        this.previewSprites.push(rs);
      }
    }
  }

  /** Show a semi-transparent preview of an object at the given position. */
  showObjectPreview(spriteKey: string, x: number, y: number, anchor: { x: number; y: number }): void {
    this.clearPreview();
    const tex = getTexture(spriteKey);
    if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(anchor.x, anchor.y);
    s.x = x;
    s.y = y;
    s.alpha = 0.5;
    this.previewContainer.addChild(s);
    this.previewSprites.push(s);
  }

  clearPreview(): void {
    for (const s of this.previewSprites) { s.destroy(); }
    this.previewSprites = [];
    this.previewContainer.removeChildren();
  }

  clearSelection(): void {
    this.selectionGraphics.clear();
  }

  updateCamera(x: number, y: number, zoom: number): void {
    this.worldContainer.scale.set(zoom, zoom);
    this.worldContainer.x = -x * zoom;
    this.worldContainer.y = -y * zoom;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.initialized ? (this.app.canvas as HTMLCanvasElement) : null;
  }

  screenToWorld(screenX: number, screenY: number, cameraX: number, cameraY: number, zoom: number): { x: number; y: number } {
    const canvas = this.getCanvas();
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = (screenX - rect.left) * (canvas.width / rect.width);
    const sy = (screenY - rect.top) * (canvas.height / rect.height);
    return { x: sx / zoom + cameraX, y: sy / zoom + cameraY };
  }

  destroy(): void {
    this.destroyed = true;
    if (this.initialized) {
      this.app.destroy(true, { children: true });
    }
  }
}
