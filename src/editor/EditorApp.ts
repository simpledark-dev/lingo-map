import { Application, Container, Sprite, Graphics, Text } from 'pixi.js';
import { TileType, Entity, Building, MapLayer } from '../core/types';
import { PLAYER_LAYER_ID } from '../core/constants';
import { getEffectiveZIndex } from '../core/Layers';
import { getTexture, getTileTexture, loadPackSingle, preloadAllAssets } from '../renderer/AssetLoader';
import { buildTransitionLayer } from '../renderer/TransitionTiles';
import { loadAutoTileset, buildAutoTileLayer, isAutoTilesetReady } from '../renderer/AutoTileset';

export class EditorApp {
  app: Application;
  private worldContainer: Container;
  private groundLayer: Container;
  private transitionLayer: Container;
  private autoTileLayer: Container;
  private entityLayer: Container;
  private roofLayer: Container;
  private gridOverlay: Container;
  private hoverGraphics: Graphics;
  private selectionGraphics: Graphics;
  private areaRectGraphics: Graphics;
  // Area Select tool's persistent selection rectangle and a ghost preview
  // shown while the user is dragging the selection to a new location.
  private areaSelectGraphics: Graphics;
  private areaSelectGhostGraphics: Graphics;
  private selectionLabel: Text | null = null;
  private previewContainer: Container;
  private previewSprites: Sprite[] = [];

  private tileSprites: (Sprite | null)[][] = [];

  /** Snapshot of the editor's current layer list. EditorCanvas calls
   * `setLayers` before rendering so z-sort and visibility honor the
   * user-managed layer order, visibility, and lock state. */
  private currentLayers: MapLayer[] = [];
  private objectSprites = new Map<string, Sprite>();
  private buildingBaseSprites = new Map<string, Sprite>();
  private buildingRoofSprites = new Map<string, Sprite>();

  private mapWidth = 0;
  private mapHeight = 0;
  private tileSize = 16;
  private initialized = false;
  private destroyed = false;

  // Current tiles for transition rebuilds
  private currentTiles: string[][] = [];

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.groundLayer = new Container();
    this.transitionLayer = new Container();
    this.autoTileLayer = new Container();
    this.entityLayer = new Container();
    this.roofLayer = new Container();
    this.gridOverlay = new Container();
    this.hoverGraphics = new Graphics();
    this.selectionGraphics = new Graphics();
    this.areaRectGraphics = new Graphics();
    this.areaSelectGraphics = new Graphics();
    this.areaSelectGhostGraphics = new Graphics();
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
    this.worldContainer.addChild(this.autoTileLayer);
    this.worldContainer.addChild(this.entityLayer);
    this.worldContainer.addChild(this.roofLayer);
    this.worldContainer.addChild(this.gridOverlay);
    this.worldContainer.addChild(this.hoverGraphics);
    this.worldContainer.addChild(this.selectionGraphics);
    this.worldContainer.addChild(this.areaRectGraphics);
    this.worldContainer.addChild(this.areaSelectGraphics);
    this.worldContainer.addChild(this.areaSelectGhostGraphics);
    this.worldContainer.addChild(this.previewContainer);
    this.app.stage.addChild(this.worldContainer);

    // Load all assets (including the auto-tileset for grass↔water transitions)
    await preloadAllAssets();
    await loadAutoTileset();

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

  renderTiles(tiles: string[][], width: number, height: number, tileSize: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
    this.tileSize = tileSize;
    // Clone — `updateSingleTile` mutates this during paint drags before the
    // React state has been dispatched, and we mustn't mutate the React array.
    this.currentTiles = tiles.map(row => [...row]);
    this.groundLayer.removeChildren();
    this.tileSprites = [];

    for (let r = 0; r < height; r++) {
      const row: (Sprite | null)[] = [];
      for (let c = 0; c < width; c++) {
        const tex = getTileTexture(tiles[r][c], r, c);
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
    this.rebuildAutoTiles();
    this.rebuildGrid();
  }

  updateSingleTile(row: number, col: number, tileType: string): void {
    const tex = getTileTexture(tileType, row, col);
    if (!tex) return;
    const existing = this.tileSprites[row]?.[col];
    if (existing) {
      existing.texture = tex;
    }
    // Mutate the source-of-truth so the auto-tile rebuild sees this paint stroke.
    // EditorApp keeps `currentTiles` in sync between full re-renders.
    if (this.currentTiles[row]) this.currentTiles[row][col] = tileType;
    this.rebuildAutoTiles();
  }

  private rebuildAutoTiles(): void {
    if (!isAutoTilesetReady() || this.currentTiles.length === 0) return;
    this.autoTileLayer.removeChildren();
    const layer = buildAutoTileLayer(this.currentTiles, this.mapWidth, this.mapHeight, this.tileSize);
    this.autoTileLayer.addChild(layer);
  }

  rebuildTransitions(tiles?: string[][], width?: number, height?: number, tileSize?: number): void {
    const t = tiles ?? this.currentTiles;
    const w = width ?? this.mapWidth;
    const h = height ?? this.mapHeight;
    const ts = tileSize ?? this.tileSize;
    if (t.length === 0) return;

    this.transitionLayer.removeChildren();
    const mapData = { id: 'editor', width: w, height: h, tileSize: ts, tiles: t, objects: [], buildings: [], npcs: [], triggers: [], spawnPoints: [] };
    // Skip water — the AutoTileset layer below handles grass↔water.
    const layer = buildTransitionLayer(mapData, false);
    this.transitionLayer.addChild(layer);
  }

  /** Find every Modern Exteriors pack key referenced by the current editor
   * state and ensure each one is loaded into PixiJS. Called before rendering
   * so saved pack tiles/objects show up the first time the editor opens (the
   * placeholder preload doesn't know about pack singles, and `getTexture`
   * misses don't re-trigger loads). Idempotent — cached singles short-circuit
   * inside `loadPackSingle`. */
  async ensurePackAssets(state: { tiles: string[][]; objects: Entity[]; buildings: Building[] }): Promise<void> {
    const keys = new Set<string>();
    for (const row of state.tiles) {
      for (const t of row) if (t.startsWith('me:')) keys.add(t);
    }
    for (const o of state.objects) {
      if (o.spriteKey.startsWith('me:')) keys.add(o.spriteKey);
    }
    for (const b of state.buildings) {
      if (b.baseSpriteKey.startsWith('me:')) keys.add(b.baseSpriteKey);
      if (b.roofSpriteKey?.startsWith('me:')) keys.add(b.roofSpriteKey);
    }
    if (keys.size === 0) return;
    await Promise.all([...keys].map(k => loadPackSingle(k)));
  }

  /** Update the layer list used for z-sort and visibility/lock filtering.
   * Called by EditorCanvas before each `renderObjects`/`renderBuildings` so
   * the editor reflects the user-managed layer state. */
  setLayers(layers: MapLayer[]): void {
    this.currentLayers = layers;
  }

  renderObjects(objects: Entity[]): void {
    this.entityLayer.removeChildren();
    this.objectSprites.clear();
    for (const obj of objects) {
      // Skip entities whose layer is hidden in the editor. Game runtime
      // ignores the visible flag — that's editor-only display state.
      const layer = this.currentLayers.find(l => l.id === obj.layer);
      if (layer && layer.visible === false) continue;
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
    s.zIndex = getEffectiveZIndex(this.currentLayers, obj.layer, obj.sortY);
    if (obj.scale && obj.scale !== 1) s.scale.set(obj.scale);
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
    const scale = b.scale ?? 1;
    const baseTex = getTexture(b.baseSpriteKey);
    if (baseTex) {
      const s = new Sprite(baseTex);
      s.anchor.set(b.anchor.x, b.anchor.y);
      s.x = b.x;
      s.y = b.y;
      // Buildings always render on the props layer alongside the player.
      s.zIndex = getEffectiveZIndex(this.currentLayers, PLAYER_LAYER_ID, b.sortY);
      if (scale !== 1) s.scale.set(scale);
      this.entityLayer.addChild(s);
      this.buildingBaseSprites.set(b.id, s);

      // Roof — skipped if the building is drawn as a single sprite.
      const roofTex = b.roofSpriteKey ? getTexture(b.roofSpriteKey) : undefined;
      if (roofTex) {
        const rs = new Sprite(roofTex);
        rs.anchor.set(b.anchor.x, 1.0);
        rs.x = b.x;
        rs.y = b.y - baseTex.height * scale;
        if (scale !== 1) rs.scale.set(scale);
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

  /** Show / update the area-erase drag rectangle. Coords are tile-cell
   * indices; negative width/height handled by drawing the normalized rect. */
  showAreaRect(row1: number, col1: number, row2: number, col2: number): void {
    const r0 = Math.min(row1, row2);
    const r1 = Math.max(row1, row2);
    const c0 = Math.min(col1, col2);
    const c1 = Math.max(col1, col2);
    this.areaRectGraphics.clear();
    this.areaRectGraphics.rect(
      c0 * this.tileSize,
      r0 * this.tileSize,
      (c1 - c0 + 1) * this.tileSize,
      (r1 - r0 + 1) * this.tileSize,
    );
    this.areaRectGraphics.fill({ color: 0xff4444, alpha: 0.18 });
    this.areaRectGraphics.stroke({ color: 0xff4444, alpha: 0.9, width: 2 });
  }

  clearAreaRect(): void {
    this.areaRectGraphics.clear();
  }

  /** Persistent selection rectangle for the Area Select tool. Different
   * color from area-erase so the user can tell them apart at a glance. */
  showSelectionArea(row1: number, col1: number, row2: number, col2: number): void {
    const r0 = Math.min(row1, row2);
    const r1 = Math.max(row1, row2);
    const c0 = Math.min(col1, col2);
    const c1 = Math.max(col1, col2);
    this.areaSelectGraphics.clear();
    this.areaSelectGraphics.rect(
      c0 * this.tileSize,
      r0 * this.tileSize,
      (c1 - c0 + 1) * this.tileSize,
      (r1 - r0 + 1) * this.tileSize,
    );
    this.areaSelectGraphics.fill({ color: 0x44aaff, alpha: 0.15 });
    this.areaSelectGraphics.stroke({ color: 0x44aaff, alpha: 0.9, width: 2 });
  }

  clearSelectionArea(): void {
    this.areaSelectGraphics.clear();
  }

  /** Ghost rectangle drawn at the proposed destination while the user is
   * dragging the selection to move it. Cleared on pointerup. */
  showSelectionGhost(row1: number, col1: number, row2: number, col2: number): void {
    const r0 = Math.min(row1, row2);
    const r1 = Math.max(row1, row2);
    const c0 = Math.min(col1, col2);
    const c1 = Math.max(col1, col2);
    this.areaSelectGhostGraphics.clear();
    this.areaSelectGhostGraphics.rect(
      c0 * this.tileSize,
      r0 * this.tileSize,
      (c1 - c0 + 1) * this.tileSize,
      (r1 - r0 + 1) * this.tileSize,
    );
    this.areaSelectGhostGraphics.stroke({ color: 0x44ff88, alpha: 0.9, width: 2 });
  }

  clearSelectionGhost(): void {
    this.areaSelectGhostGraphics.clear();
  }

  highlightBuilding(b: Building): void {
    this.selectionGraphics.clear();
    const s = this.buildingBaseSprites.get(b.id);
    if (!s) return;
    // Building base sprite covers the whole footprint; reuse the same bbox math.
    const scale = b.scale ?? 1;
    const texW = s.texture.width;
    const texH = s.texture.height;
    const w = texW * scale;
    const h = texH * scale;
    const left = b.x - w * b.anchor.x;
    const top = b.y - h * b.anchor.y;
    this.selectionGraphics.rect(left, top, w, h);
    this.selectionGraphics.stroke({ width: 2, color: 0x44ff44, alpha: 0.8 });

    const worldZoom = this.worldContainer.scale.x || 1;
    if (!this.selectionLabel) {
      this.selectionLabel = new Text({
        text: '',
        style: {
          fontFamily: 'monospace',
          fontSize: 12,
          fill: 0x44ff44,
          stroke: { color: 0x000000, width: 3 },
          align: 'center',
        },
      });
      this.selectionLabel.anchor.set(0.5, 1);
      this.worldContainer.addChild(this.selectionLabel);
    }
    this.selectionLabel.text = `${Math.round(w)} × ${Math.round(h)}`;
    this.selectionLabel.scale.set(1 / worldZoom);
    this.selectionLabel.x = left + w / 2;
    this.selectionLabel.y = top - 2 / worldZoom;
    this.selectionLabel.visible = true;
  }

  highlightObject(obj: Entity): void {
    this.selectionGraphics.clear();
    const s = this.objectSprites.get(obj.id);
    if (!s) return;
    // Compute world-space bounds from the entity's position, anchor, texture,
    // and scale. Using sprite.getBounds() returns screen-space coords which
    // don't match the selectionGraphics parent (worldContainer is zoomed).
    const texW = s.texture.width;
    const texH = s.texture.height;
    const scale = obj.scale ?? 1;
    const w = texW * scale;
    const h = texH * scale;
    const left = obj.x - w * obj.anchor.x;
    const top = obj.y - h * obj.anchor.y;
    this.selectionGraphics.rect(left, top, w, h);
    this.selectionGraphics.stroke({ width: 2, color: 0x44ff44, alpha: 0.8 });

    // Dimension label — rendered in world coords above the selection rect.
    // Compensate for world zoom so text stays a readable ~10-12px on screen.
    const worldZoom = this.worldContainer.scale.x || 1;
    const displayW = Math.round(w);
    const displayH = Math.round(h);
    if (!this.selectionLabel) {
      this.selectionLabel = new Text({
        text: '',
        style: {
          fontFamily: 'monospace',
          fontSize: 12,
          fill: 0x44ff44,
          stroke: { color: 0x000000, width: 3 },
          align: 'center',
        },
      });
      this.selectionLabel.anchor.set(0.5, 1);
      this.worldContainer.addChild(this.selectionLabel);
    }
    this.selectionLabel.text = `${displayW} × ${displayH}`;
    this.selectionLabel.scale.set(1 / worldZoom);
    this.selectionLabel.x = left + w / 2;
    this.selectionLabel.y = top - 2 / worldZoom;
    this.selectionLabel.visible = true;
  }

  clearHighlight(): void {
    this.hoverGraphics.clear();
  }

  /** Show a semi-transparent preview of a building at the given position. */
  showBuildingPreview(baseSpriteKey: string, roofSpriteKey: string | undefined, x: number, y: number, anchor: { x: number; y: number }, scale: number = 1): void {
    this.clearPreview();
    const baseTex = getTexture(baseSpriteKey);
    if (baseTex) {
      const s = new Sprite(baseTex);
      s.anchor.set(anchor.x, anchor.y);
      s.x = x;
      s.y = y;
      s.alpha = 0.5;
      if (scale !== 1) s.scale.set(scale);
      this.previewContainer.addChild(s);
      this.previewSprites.push(s);

      const roofTex = roofSpriteKey ? getTexture(roofSpriteKey) : undefined;
      if (roofTex) {
        const rs = new Sprite(roofTex);
        rs.anchor.set(anchor.x, 1.0);
        rs.x = x;
        rs.y = y - baseTex.height * scale;
        rs.alpha = 0.5;
        if (scale !== 1) rs.scale.set(scale);
        this.previewContainer.addChild(rs);
        this.previewSprites.push(rs);
      }
    }
  }

  /** Show a semi-transparent preview of an object at the given position. */
  showObjectPreview(spriteKey: string, x: number, y: number, anchor: { x: number; y: number }, scale: number = 1): void {
    this.clearPreview();
    const tex = getTexture(spriteKey);
    if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(anchor.x, anchor.y);
    s.x = x;
    s.y = y;
    s.alpha = 0.5;
    if (scale !== 1) s.scale.set(scale);
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
    if (this.selectionLabel) this.selectionLabel.visible = false;
  }

  updateCamera(x: number, y: number, zoom: number): void {
    this.worldContainer.scale.set(zoom, zoom);
    this.worldContainer.x = -x * zoom;
    this.worldContainer.y = -y * zoom;
    // Keep the selection label at a constant on-screen size regardless of zoom
    if (this.selectionLabel && this.selectionLabel.visible) {
      this.selectionLabel.scale.set(1 / zoom);
    }
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
