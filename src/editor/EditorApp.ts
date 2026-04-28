import { Application, Container, Sprite, Graphics, Text } from 'pixi.js';
import { TileType, Entity, Building, Layer, MapLayer } from '../core/types';
import { PLAYER_LAYER_ID } from '../core/constants';
import { getEffectiveZIndex, isObjectLayer, isTileLayer } from '../core/Layers';
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
  /** Marquee rectangle drawn while the user is drag-selecting in the
   * Select tool — Figma-style click-and-drag in empty space to lasso many
   * entities at once. Pixel-precise (not tile-snapped) since entities have
   * free positions. Distinct from `areaSelectGraphics`, which is the
   * tile-aligned rect for the Area Sel tool. */
  private marqueeGraphics: Graphics;
  /** Translucent red overlay drawn on the currently-selected entity's
   * collision box. Only visible while one entity is selected and that
   * entity has a non-empty collisionBox; lets the user see exactly what
   * region of the sprite blocks the player. */
  private collisionPreview: Graphics;
  /** Translucent green overlay drawn on the currently-selected entity's
   * door trigger zone (when its `transition` field is set). Mirrors the
   * runtime's auto-generated trigger geometry — 2 tiles wide × 1 tile
   * tall at the entity's feet row — so the editor view matches the
   * runtime behaviour. */
  private doorPreview: Graphics;
  /** Aseprite-style resize overlay: four blue draggable lines marking
   * the proposed new map bounds, plus a translucent fill on the region
   * that will be kept. Visible only while `resizeMode` is active in
   * EditorCanvas; the user drags any line to crop or extend that edge. */
  private resizeOverlay: Graphics;
  private selectionLabel: Text | null = null;
  /** Floating layer-name tag drawn near the cursor during placement-style
   * tools so the user can see which layer their next click will write to.
   * Color-coded to match the layer-kind badges in the layers panel. */
  private cursorLayerLabel: Text | null = null;
  private cursorLayerLabelBg: Graphics | null = null;
  private previewContainer: Container;
  private previewSprites: Sprite[] = [];

  private tileSprites: (Sprite | null)[][] = [];

  /** Snapshot of the editor's current layer list. EditorCanvas calls
   * `setLayers` before rendering so z-sort and visibility honor the
   * user-managed layer order, visibility, and lock state. */
  private currentLayers: MapLayer[] = [];
  /** ID of the tile layer the live `tileSprites` cache currently tracks.
   * `updateSingleTile` patches sprites + currentTiles for THIS layer.
   * Set by `renderLayers` based on the active layer the user picked. */
  private activeTileLayerId: string | undefined;
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
    this.marqueeGraphics = new Graphics();
    this.collisionPreview = new Graphics();
    this.doorPreview = new Graphics();
    this.resizeOverlay = new Graphics();
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
    this.worldContainer.addChild(this.marqueeGraphics);
    this.worldContainer.addChild(this.collisionPreview);
    this.worldContainer.addChild(this.doorPreview);
    this.worldContainer.addChild(this.resizeOverlay);
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

  /** Re-render every tile layer (in stack order, skipping invisible ones)
   * AND every object layer in one pass. The tile-only `tileSprites` cache
   * tracks the ACTIVE tile layer (or the first visible tile layer if the
   * caller didn't specify) so `updateSingleTile` can fast-path single-cell
   * paint strokes into the layer the user is currently editing.
   *
   * Transitions / auto-tile anchor on the FIRST visible tile layer (the
   * "ground" semantically) regardless of which layer the user is painting
   * — those effects don't make sense applied to top-stacked tile layers
   * like a Walls layer.
   *
   * `renderObjects` is called from inside this method using the
   * per-object-layer `objects` arrays so we don't double-render objects
   * the way the legacy code did when callers passed them separately. */
  renderLayers(layers: Layer[], width: number, height: number, tileSize: number, activeLayerId?: string): void {
    this.mapWidth = width;
    this.mapHeight = height;
    this.tileSize = tileSize;
    this.groundLayer.removeChildren();
    this.tileSprites = [];

    // Pick the cache target: the active layer if it's a visible tile layer,
    // otherwise the first visible tile layer. The cache target's sprites
    // populate `tileSprites` so `updateSingleTile` can patch one cell.
    const activeTile = activeLayerId
      ? layers.find(l => l.id === activeLayerId && isTileLayer(l) && l.visible !== false)
      : undefined;
    const firstVisibleTile = layers.find(l => isTileLayer(l) && l.visible !== false);
    const cacheTile = (activeTile ?? firstVisibleTile) as Layer | undefined;
    const cacheTiles = cacheTile && isTileLayer(cacheTile) ? cacheTile.tiles : null;
    // Transitions / auto-tile always anchor on the first visible tile layer.
    const groundTiles = firstVisibleTile && isTileLayer(firstVisibleTile) ? firstVisibleTile.tiles : null;
    this.activeTileLayerId = cacheTile?.id;

    // Track sprites for the cache layer in `tileSprites` (indexed [r][c])
    // so single-cell updates can swap textures in place. The cache layer
    // sprites are added to `groundLayer` in correct stack order: lower
    // layers (rendered before cache) go in first, then the cache layer,
    // then higher layers.
    const visibleTileLayers = layers.filter(l => isTileLayer(l) && l.visible !== false);
    // Lower layers (below the cache layer) render first.
    for (const layer of visibleTileLayers) {
      if (!isTileLayer(layer)) continue;
      if (layer === cacheTile) break; // stop when we hit the cache layer
      this.drawTileLayer(layer.tiles, width, height, tileSize);
    }
    // Cache layer with sprite tracking.
    if (cacheTiles) {
      this.currentTiles = cacheTiles.map(row => [...row]);
      for (let r = 0; r < height; r++) {
        const row: (Sprite | null)[] = [];
        for (let c = 0; c < width; c++) {
          const cell = cacheTiles[r]?.[c];
          if (!cell) { row.push(null); continue; }
          const tex = getTileTexture(cell, r, c);
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
    } else {
      this.currentTiles = [];
    }
    // Higher layers (above the cache layer) render last.
    let pastCache = false;
    for (const layer of visibleTileLayers) {
      if (!isTileLayer(layer)) continue;
      if (layer === cacheTile) { pastCache = true; continue; }
      if (!pastCache) continue;
      this.drawTileLayer(layer.tiles, width, height, tileSize);
    }

    if (groundTiles) {
      this.rebuildTransitions(groundTiles, width, height, tileSize);
      this.rebuildAutoTiles();
    } else {
      this.transitionLayer.removeChildren();
      this.autoTileLayer.removeChildren();
    }
    this.rebuildGrid();

    // Render objects from each visible object layer. Hidden layers are
    // skipped entirely (the legacy renderObjects already filtered by
    // `currentLayers[].visible`; doing the filtering here too keeps the
    // contract single-source while we phase out the old API).
    const flatObjects: Entity[] = [];
    for (const layer of layers) {
      if (!isObjectLayer(layer)) continue;
      if (layer.visible === false) continue;
      for (const o of layer.objects) flatObjects.push(o.layer === layer.id ? o : { ...o, layer: layer.id });
    }
    this.renderObjects(flatObjects);
  }

  /** Draw every non-empty cell of a tile layer's grid into `groundLayer`.
   * No sprite cache — these layers can't be live-painted via
   * `updateSingleTile` (only the active tile layer can). */
  private drawTileLayer(tiles: string[][], width: number, height: number, tileSize: number): void {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const cell = tiles[r]?.[c];
        if (!cell) continue;
        const tex = getTileTexture(cell, r, c);
        if (!tex) continue;
        const s = new Sprite(tex);
        s.x = c * tileSize;
        s.y = r * tileSize;
        s.width = tileSize;
        s.height = tileSize;
        this.groundLayer.addChild(s);
      }
    }
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

  /** Draw the marquee selection rectangle in WORLD pixel coords (not
   * tile-aligned). EditorCanvas calls this on every pointermove while the
   * user is drag-selecting in the Select tool. */
  showMarquee(x1: number, y1: number, x2: number, y2: number): void {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    this.marqueeGraphics.clear();
    if (w < 1 && h < 1) return;
    this.marqueeGraphics.rect(left, top, w, h);
    this.marqueeGraphics.fill({ color: 0x44aaff, alpha: 0.12 });
    this.marqueeGraphics.stroke({ color: 0x44aaff, alpha: 0.9, width: 1 });
  }

  clearMarquee(): void {
    this.marqueeGraphics.clear();
  }

  /** Draw the entity's collision box in WORLD coords. Bbox math matches
   * what the runtime CollisionSystem applies: `entity.x + offsetX`, etc.
   * Auto-clears for zero-size boxes (the "no collision" sentinel). Should
   * be called whenever the panel's collision toggle/inputs change OR when
   * the user picks a different selected entity. */
  showCollisionPreview(entity: Entity): void {
    this.collisionPreview.clear();
    const cb = entity.collisionBox;
    if (cb.width <= 0 || cb.height <= 0) return;
    const left = entity.x + cb.offsetX;
    const top = entity.y + cb.offsetY;
    this.collisionPreview.rect(left, top, cb.width, cb.height);
    this.collisionPreview.fill({ color: 0xff4444, alpha: 0.25 });
    this.collisionPreview.stroke({ color: 0xff4444, alpha: 0.9, width: 1 });
  }

  clearCollisionPreview(): void {
    this.collisionPreview.clear();
  }

  /** Draw the door trigger zone for an entity in WORLD coords. Mirrors the
   * exact geometry the runtime uses: explicit `transition.triggerBox`
   * (offsets relative to entity x/y) when set, otherwise PixiApp's auto-
   * derived 2-tile-wide × 1-tile-tall shape at the entity's feet row.
   * Only renders when `entity.transition` is set. */
  showDoorPreview(entity: Entity, tileSize: number): void {
    this.doorPreview.clear();
    if (!entity.transition) return;
    const tb = entity.transition.triggerBox;
    let left: number, top: number, w: number, h: number;
    if (tb && tb.width > 0 && tb.height > 0) {
      left = entity.x + tb.offsetX;
      top = entity.y + tb.offsetY;
      w = tb.width;
      h = tb.height;
    } else {
      const T = tileSize;
      const feetRow = Math.floor((entity.y - 1) / T);
      left = Math.floor((entity.x - T) / T) * T;
      const right = (Math.floor(entity.x / T) + 1) * T;
      top = feetRow * T;
      w = right - left;
      h = T;
    }
    this.doorPreview.rect(left, top, w, h);
    this.doorPreview.fill({ color: 0x44ff88, alpha: 0.25 });
    this.doorPreview.stroke({ color: 0x44ff88, alpha: 0.9, width: 1 });
  }

  clearDoorPreview(): void {
    this.doorPreview.clear();
  }

  /** Draw the resize-mode overlay in world coords. The four edge values
   * are TILE positions (rows / cols), allowing negative values when the
   * user drags an edge OUTSIDE the original map (= expand).
   *   - left/right are columns (0..mapWidth originally)
   *   - top/bottom are rows (0..mapHeight originally)
   * The blue rectangle outlines the proposed new bounds; the translucent
   * fill highlights the region that survives. Cropped-away regions of
   * the original map sit *outside* the rectangle and remain visible
   * underneath, so the user can see what they're discarding. */
  showResizeOverlay(left: number, top: number, right: number, bottom: number, tileSize: number): void {
    this.resizeOverlay.clear();
    const T = tileSize;
    const x = left * T;
    const y = top * T;
    const w = (right - left) * T;
    const h = (bottom - top) * T;
    if (w <= 0 || h <= 0) return;
    // Translucent fill on the kept region.
    this.resizeOverlay.rect(x, y, w, h);
    this.resizeOverlay.fill({ color: 0x44aaff, alpha: 0.12 });
    // Blue outline (the four draggable edges). Drawn at world scale; pointer
    // hit-testing uses a tile-sized tolerance so it stays grabbable at all
    // zoom levels even though the visual line is thin.
    this.resizeOverlay.stroke({ color: 0x44aaff, alpha: 1, width: 2 });
    // Corner ticks make the four "handles" more visible.
    const tickLen = T;
    const tickStroke = { color: 0x88ccff, alpha: 1, width: 2 } as const;
    const corners: Array<[number, number, number, number]> = [
      [x, y, x + tickLen, y], [x, y, x, y + tickLen],
      [x + w - tickLen, y, x + w, y], [x + w, y, x + w, y + tickLen],
      [x, y + h - tickLen, x, y + h], [x, y + h, x + tickLen, y + h],
      [x + w - tickLen, y + h, x + w, y + h], [x + w, y + h - tickLen, x + w, y + h],
    ];
    for (const [x1, y1, x2, y2] of corners) {
      this.resizeOverlay.moveTo(x1, y1).lineTo(x2, y2).stroke(tickStroke);
    }
  }

  clearResizeOverlay(): void {
    this.resizeOverlay.clear();
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

  /** Highlight every object in the list with the same selection rect style
   * used by `highlightObject`, but skip the dimension label (it doesn't
   * make sense for a group selection — they typically span very different
   * sizes). Used for shift-click multi-select. */
  highlightObjects(objs: Entity[]): void {
    this.selectionGraphics.clear();
    if (this.selectionLabel) this.selectionLabel.visible = false;
    for (const obj of objs) {
      const sprite = this.objectSprites.get(obj.id);
      if (!sprite) continue;
      const scale = obj.scale ?? 1;
      const w = sprite.texture.width * scale;
      const h = sprite.texture.height * scale;
      const left = obj.x - w * obj.anchor.x;
      const top = obj.y - h * obj.anchor.y;
      this.selectionGraphics.rect(left, top, w, h);
      this.selectionGraphics.stroke({ width: 2, color: 0x44ff44, alpha: 0.8 });
    }
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

  /** Show a semi-transparent preview of a tile at the cursor cell. Goes
   * through `getTileTexture` so per-cell pattern tiles (`floor-pattern`,
   * `wall-brick`) get their correct quadrant — `getTexture` doesn't know
   * about those synthetic mappings. Sprite is forced to `tileSize × tileSize`
   * to match how the engine renders cells, regardless of the source PNG's
   * native size. */
  showTilePreview(tileType: string, row: number, col: number, tileSize: number): void {
    this.clearPreview();
    const tex = getTileTexture(tileType, row, col);
    if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(0, 0);
    s.x = col * tileSize;
    s.y = row * tileSize;
    s.width = tileSize;
    s.height = tileSize;
    s.alpha = 0.5;
    this.previewContainer.addChild(s);
    this.previewSprites.push(s);
  }

  clearPreview(): void {
    for (const s of this.previewSprites) { s.destroy(); }
    this.previewSprites = [];
    this.previewContainer.removeChildren();
  }

  /** Show a small layer-name tag positioned just below-and-right of `(x, y)`
   * world coords. Color-coded to match the layer-kind badges in the layers
   * panel (blue for tile layers, purple for objects). The text is scaled by
   * `1 / zoom` so it stays a constant on-screen size regardless of zoom.
   * `kind` controls the color so the caller doesn't need to look the layer
   * up themselves. */
  showCursorLayerLabel(text: string, kind: 'tile' | 'object', x: number, y: number, zoom: number): void {
    const fg = kind === 'tile' ? 0x88bbff : 0xcc99ff;
    if (!this.cursorLayerLabel) {
      this.cursorLayerLabelBg = new Graphics();
      this.cursorLayerLabel = new Text({
        text: '',
        style: {
          fontFamily: 'monospace',
          fontSize: 11,
          fill: fg,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      this.cursorLayerLabel.anchor.set(0, 0);
      this.worldContainer.addChild(this.cursorLayerLabelBg);
      this.worldContainer.addChild(this.cursorLayerLabel);
    }
    const label = this.cursorLayerLabel;
    const bg = this.cursorLayerLabelBg!;
    label.style.fill = fg;
    label.text = text;
    // Counter the world container's zoom so the label stays the same size
    // on screen at any zoom level. Bump width/height by the inverse so the
    // padding-rect we draw matches the rendered text dimensions.
    const inv = 1 / zoom;
    label.scale.set(inv);
    // Offset from the cursor: ~2 cells right, ~1 cell down at base scale,
    // shrunk with zoom so it visually hugs the cursor.
    const pad = 4 * inv;
    const offsetX = 12 * inv;
    const offsetY = 12 * inv;
    label.x = x + offsetX;
    label.y = y + offsetY;
    const w = label.width + pad * 2;
    const h = label.height + pad * 2;
    bg.clear();
    bg.rect(label.x - pad, label.y - pad, w, h)
      .fill({ color: 0x000000, alpha: 0.7 })
      .stroke({ color: fg, alpha: 0.6, width: 1 * inv });
    label.visible = true;
    bg.visible = true;

    // Promote bg + text to the end of worldContainer's children so they
    // render on top regardless of what other lazy-added overlays
    // (selectionLabel, future additions) ended up in the list. Without
    // this, the relative add-order between cursorLayerLabel and
    // selectionLabel was determined by which one the user triggered first
    // (selecting an object vs. hovering), so the cursor label would
    // sometimes get occluded — especially over the map area where extra
    // overlays accumulate.
    const children = this.worldContainer.children;
    this.worldContainer.setChildIndex(bg, children.length - 1);
    this.worldContainer.setChildIndex(label, children.length - 1);
  }

  clearCursorLayerLabel(): void {
    if (this.cursorLayerLabel) this.cursorLayerLabel.visible = false;
    if (this.cursorLayerLabelBg) this.cursorLayerLabelBg.visible = false;
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
    // Cursor layer label is repositioned by showCursorLayerLabel on every
    // pointermove with the current zoom, so we don't need to fix it here.
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
