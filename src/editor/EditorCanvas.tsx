'use client';

import { useRef, useEffect, useReducer, useCallback, useState } from 'react';
import { TileType, Entity } from '../core/types';
import { EditorApp } from './EditorApp';
import { editorReducer, createInitialState, EditorAction, generateObjectId, buildImportedLayers, getPrimaryTiles, getAllObjects, getActiveTileLayer } from './editorState';
import { OBJECT_DEFAULTS, BUILDING_DEFAULTS, DEFAULT_INTERIOR_MAP_ID } from './objectDefaults';
import { loadMap } from '../core/MapLoader';
import { getPackTileCellDims, getTexture } from '../renderer/AssetLoader';
import EditorToolPanel from './EditorToolPanel';
import EditorTopBar from './EditorTopBar';

const ACTIVE_MAP_KEY = 'editor-active-map';

/** Default scale for newly-placed objects. Source art is typically bigger than
 * we want on the map, so we start shrunk and let the user slide up if needed. */
const DEFAULT_OBJECT_SCALE = 1.0;

/**
 * World-space AABB that a sprite covers, given its anchor and feet position.
 * Uses the loaded texture size. Falls back to a 1-tile square if the texture
 * isn't loaded yet (shouldn't happen after initial render, but safe default).
 */
function getSpriteBounds(
  x: number, y: number, spriteKey: string, anchor: { x: number; y: number }, tileSize: number, scale: number = 1,
): { left: number; top: number; right: number; bottom: number } {
  const tex = getTexture(spriteKey);
  const w = (tex?.width ?? tileSize) * scale;
  const h = (tex?.height ?? tileSize) * scale;
  const left = x - w * anchor.x;
  const top = y - h * anchor.y;
  return { left, top, right: left + w, bottom: top + h };
}

/**
 * Compute tile-aligned snap X for a sprite of a given width.
 * - Odd-tile sprites (1, 3 tiles wide) snap to tile center.
 * - Even-tile sprites (2, 4 tiles wide) snap to tile edge so the sprite
 *   straddles whole tiles cleanly.
 */
function snapXForSprite(col: number, spriteKey: string, tileSize: number): number {
  const tex = getTexture(spriteKey);
  const w = tex?.width ?? tileSize;
  const tilesWide = Math.max(1, Math.round(w / tileSize));
  const isOdd = tilesWide % 2 === 1;
  return isOdd
    ? col * tileSize + tileSize / 2
    : col * tileSize;
}

/** For tile painting: expand a single (row, col) click into the full set of
 * cells that belong to its `(N×M)` cycle when the tile asset is a multi-tile
 * pack source (e.g. a 32×32 floor patch → 2×2 cycle). The cycle is anchored
 * to the world grid (cell `(c, r)` belongs to cycle `(c % N, r % M)`), so
 * adjacent cycles align cleanly when the user drags across them.
 *
 * Returns a single-cell set for non-pack tiles or any source already at
 * `TILE_SIZE × TILE_SIZE`. */
/** True when a Tile-mode-picked pack asset is bigger than one cell. Such
 * assets are routed to object placement on the Floor layer instead of into
 * `tiles[][]`, which gives them free placement (any grid cell) and renders
 * them as a single sprite at native size — identical to Object mode. */
function isMultiTilePackTile(tileType: string): boolean {
  if (!tileType.startsWith('me:')) return false;
  const { cols, rows } = getPackTileCellDims(tileType);
  return cols > 1 || rows > 1;
}

/** Resolve the layer (id, name, kind) that a click would actually write
 * to right now, given the active tool, active layer, and currently-picked
 * palette item. Returns null for tools where "destination layer" doesn't
 * meaningfully apply (select / area-select / area-erase) so the cursor
 * label suppresses itself instead of lying.
 *
 * Mirrors the routing in `handlePointerDown`:
 * - 'tile' tool with a multi-tile pack source → routes to `floor` (or first
 *   layer if floor is missing) via `stampMultiTileAsObject`.
 * - 'tile' tool with a single-cell source → active tile layer (Ground if
 *   active is an object layer).
 * - 'object' / 'building' tool → active object layer (Props if active is
 *   a tile layer, via `resolveObjectLayerId` in the reducer).
 * - 'eraser' → not shown; the destination depends on what's under the
 *   cursor (building, object, or tile-paint), which we can't predict here. */
function resolveCursorPlacementLayer(state: ReturnType<typeof createInitialState>):
  { name: string; kind: 'tile' | 'object' | 'car-path' } | null
{
  switch (state.activeTool) {
    case 'tile': {
      // Multi-tile pack tile → object layer (floor by convention).
      if (isMultiTilePackTile(state.selectedTileType)) {
        const target = state.layers.find(l => l.id === 'floor') ?? state.layers[0];
        if (!target) return null;
        return { name: target.name, kind: target.kind };
      }
      // Single-cell tile → active tile layer or first tile layer.
      const active = state.layers.find(l => l.id === state.activeLayerId);
      if (active && active.kind === 'tile') return { name: active.name, kind: 'tile' };
      const firstTile = state.layers.find(l => l.kind === 'tile');
      return firstTile ? { name: firstTile.name, kind: 'tile' } : null;
    }
    case 'object':
    case 'building': {
      // Active layer if it's an object layer, else first object layer
      // (mirrors `resolveObjectLayerId` in the reducer).
      const active = state.layers.find(l => l.id === state.activeLayerId);
      if (active && active.kind === 'object') return { name: active.name, kind: 'object' };
      const firstObj = state.layers.find(l => l.kind === 'object');
      return firstObj ? { name: firstObj.name, kind: 'object' } : null;
    }
    default:
      return null;
  }
}

/** Place a multi-tile pack source as an Object on the Floor layer at the
 * click cell. The patch's top-left aligns to the click cell; with sprite
 * anchor (0.5, 1.0) the entity position is bottom-center: x = colTL +
 * (N×TS)/2, y = (rowTL + M) × TS.
 *
 * Tile mode means "this is ground" — so we always target the Floor layer
 * (or whichever bottom-most layer exists if Floor was deleted) rather than
 * the user's active layer. Otherwise patches end up on Props with the
 * player and Y-sort badly when the player walks across them. */
function stampMultiTileAsObject(
  tileType: string,
  row: number,
  col: number,
  tileSize: number,
  layers: { id: string }[],
  dispatch: React.Dispatch<EditorAction>,
): boolean {
  if (!tileType.startsWith('me:')) return false;
  const { cols: N, rows: M } = getPackTileCellDims(tileType);
  if (N <= 1 && M <= 1) return false;
  const targetLayer = layers.find(l => l.id === 'floor')?.id ?? layers[0]?.id ?? 'floor';
  const px = col * tileSize + (N * tileSize) / 2;
  const py = (row + M) * tileSize;
  dispatch({
    type: 'PLACE_OBJECT',
    entity: {
      id: generateObjectId(),
      x: px, y: py,
      spriteKey: tileType,
      anchor: { x: 0.5, y: 1.0 },
      sortY: py,
      collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
      layer: targetLayer,
    },
  });
  return true;
}

function initFromGameMap(): ReturnType<typeof createInitialState> {
  // 1) Figure out which map to open — last edited, or default to pokemon
  let mapId = 'pokemon';
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(ACTIVE_MAP_KEY);
    if (saved) mapId = saved;
  }

  // 2) Prefer localStorage-edited version over the compiled map
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`editor-map:${mapId}`);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.tiles && saved.width && saved.height) {
          const base = createInitialState(saved.width, saved.height);
          return {
            ...base,
            layers: buildImportedLayers(saved.layers, saved.tiles, saved.objects || [], saved.width, saved.height),
            buildings: saved.buildings || [],
            mapWidth: saved.width,
            mapHeight: saved.height,
            mapName: saved.id || mapId,
            tileSize: saved.tileSize || 16,
          };
        }
      }
    } catch { /* fall through to compiled map */ }
  }

  // 3) Fallback: compiled map. If `mapId` was set to something not in the
  // compiled registry (e.g. a stale custom name from an old import session,
  // or the placeholder 'custom-map' default), `loadMap` throws and the
  // entire editor page errors out. Catch and degrade to 'pokemon' instead
  // — the disk-load effect will still try `/api/maps/<original-id>` next,
  // so a real on-disk map with a non-registry id stays loadable.
  let map: ReturnType<typeof loadMap>;
  try {
    map = loadMap(mapId);
  } catch {
    try {
      map = loadMap('pokemon');
    } catch {
      // Registry is broken or pokemon is missing — return an empty default
      // state so the editor can at least render the chrome.
      return createInitialState();
    }
  }
  const base = createInitialState(map.width, map.height);
  return {
    ...base,
    layers: buildImportedLayers(map.layers, map.tiles, map.objects, map.width, map.height),
    buildings: map.buildings,
    mapWidth: map.width,
    mapHeight: map.height,
    mapName: map.id,
    tileSize: map.tileSize,
  };
}

export default function EditorCanvas() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const editorAppRef = useRef<EditorApp | null>(null);
  const [state, dispatch] = useReducer(editorReducer, null, initFromGameMap);

  // Track refs for event handlers
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Paint drag state
  const isPaintingRef = useRef(false);
  const paintedCellsRef = useRef<Set<string>>(new Set());
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const spaceDownRef = useRef(false);

  // Object drag state — when user grabs a selected object with the select tool.
  // Single-object drag still uses `draggingObjectRef` for the simple path
  // (compatible with the legacy dx/dy offset model). Multi-select group drags
  // use `draggingMultiRef`, which records the original positions of every
  // selected object plus the cursor anchor so each pointermove computes the
  // delta once and applies it to every object as a single MOVE_OBJECTS
  // dispatch (one undo entry per drag, regardless of count).
  const draggingObjectRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const draggingMultiRef = useRef<{
    ids: string[];
    originals: Map<string, { x: number; y: number; sortY: number }>;
    anchorWorld: { x: number; y: number };
    dragId: string;
    /** Sprite key of the object the user grabbed — used as the snap reference
     * so all objects move by the same snapped delta. */
    anchorObjectId: string;
  } | null>(null);
  const draggingBuildingRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  // Shift+click on an entity is ambiguous: it might be a toggle-into-multi-
  // select (no movement on release) OR the start of a free-placement drag
  // (movement before release). We commit to a drag immediately so motion
  // takes effect without a hand-off, but record `pendingShiftToggleId` so
  // pointerup can fire the toggle if the user never actually moved.
  const pendingShiftToggleRef = useRef<{ id: string; startScreen: { x: number; y: number } } | null>(null);
  const areaEraseRef = useRef<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  // Area Select: drawing a new selection rectangle.
  const areaSelectRef = useRef<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  // Area Select: dragging an EXISTING selection to a new location.
  const areaMoveRef = useRef<{ source: { row1: number; col1: number; row2: number; col2: number }; startCol: number; startRow: number; dRow: number; dCol: number } | null>(null);

  // Marquee selection: Figma-style click+drag in empty space within the
  // Select tool to draw a rectangle that selects every entity whose bbox
  // intersects it. `addToSelection` is captured at drag-start (shift held)
  // so subsequent pointermoves don't depend on the live shift state.
  const marqueeRef = useRef<{
    startWorld: { x: number; y: number };
    currentWorld: { x: number; y: number };
    addToSelection: boolean;
  } | null>(null);

  // Copy/paste: last copied entity (without id) and last known cursor world pos
  // Clipboard for Cmd/Ctrl+C / V. Holds an array so a group selection
  // (shift-click or marquee) can be duplicated as a unit; relative
  // positions between clipboard entities are preserved on paste so the
  // group keeps its shape.
  const clipboardRef = useRef<Entity[]>([]);
  const cursorWorldRef = useRef<{ x: number; y: number } | null>(null);
  const shiftDownRef = useRef(false);

  // Track whether we've loaded from disk yet, so the auto-save doesn't fire
  // with stale (pre-load) state and overwrite the disk copy.
  const diskLoadedRef = useRef(false);

  // Context-menu state for right-click "move to layer" affordance. `ids` is
  // captured at open time so the menu acts on the entities the user
  // right-clicked even if the selection mutates while it's open. Coords are
  // in client (page) pixels — the menu renders position:fixed at (x, y).
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);

  // Aseprite-style interactive resize. While `resizeMode` is set, the four
  // edges (in TILE coords — can go negative for expanding) define the
  // proposed new map bounds; blue lines render via EditorApp's overlay
  // graphics, and the user drags any edge to crop or extend that side.
  // Apply commits via a single RESIZE_MAP dispatch (one undo step).
  const [resizeMode, setResizeMode] = useState<{
    left: number; top: number; right: number; bottom: number;
  } | null>(null);
  const resizeDragRef = useRef<'left' | 'right' | 'top' | 'bottom' | null>(null);
  // Which edge the cursor is currently hovering over (in resize mode, not
  // currently dragging). Drives the wrapper div's `cursor` CSS so the user
  // gets ew-/ns-resize affordance before they grab.
  const [resizeHoverEdge, setResizeHoverEdge] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null);
  const beginResize = useCallback(() => {
    setResizeMode({ left: 0, top: 0, right: state.mapWidth, bottom: state.mapHeight });
  }, [state.mapWidth, state.mapHeight]);
  const cancelResize = useCallback(() => {
    setResizeMode(null);
    resizeDragRef.current = null;
  }, []);
  const applyResize = useCallback(() => {
    setResizeMode(prev => {
      if (!prev) return null;
      const newWidth = prev.right - prev.left;
      const newHeight = prev.bottom - prev.top;
      // No-op if dimensions match and no shift — exit cleanly.
      if (newWidth !== stateRef.current.mapWidth || newHeight !== stateRef.current.mapHeight || prev.left !== 0 || prev.top !== 0) {
        // dRow/dCol = -top/-left because the new origin moves to (left, top)
        // in old-grid coords, which means each old cell shifts by that much
        // in the new grid (negated).
        dispatchRef.current({
          type: 'RESIZE_MAP',
          width: newWidth,
          height: newHeight,
          anchor: { dRow: -prev.top, dCol: -prev.left },
        });
        // Shift the camera by the same delta so the user's viewport stays
        // pinned to the same content. Without this, cropping the left edge
        // shifts every object by `-left*T` in world coords while the
        // camera stays put — visually all the content "slides off-screen
        // left" from the user's perspective even though their actual
        // edits weren't lost.
        const T = stateRef.current.tileSize;
        const dx = -prev.left * T;
        const dy = -prev.top * T;
        if (dx !== 0 || dy !== 0) {
          dispatchRef.current({
            type: 'SET_CAMERA',
            x: stateRef.current.cameraX + dx,
            y: stateRef.current.cameraY + dy,
          });
        }
      }
      return null;
    });
    resizeDragRef.current = null;
    setResizeHoverEdge(null);
  }, []);

  // ── Load persisted map from disk on mount (overrides localStorage/compiled) ──
  useEffect(() => {
    let cancelled = false;
    const mapId = stateRef.current.mapName;
    if (!mapId) { diskLoadedRef.current = true; return; }
    fetch(`/api/maps/${encodeURIComponent(mapId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.tiles || !data.width || !data.height) return;
        // Deduplicate object IDs — older saves can contain collisions (a
        // module-level counter that reset on refresh used to hand out repeat
        // IDs). Selecting/resizing one object used to affect all duplicates.
        const seenIds = new Set<string>();
        const objects = (data.objects || []).map((o: Entity) => {
          if (!seenIds.has(o.id)) { seenIds.add(o.id); return o; }
          return { ...o, id: generateObjectId() };
        });
        dispatch({ type: 'IMPORT_MAP', tiles: data.tiles, objects, buildings: data.buildings || [], width: data.width, height: data.height, layers: data.layers });
        if (data.id) dispatch({ type: 'SET_MAP_NAME', name: data.id });
        if (data.tileSize) dispatch({ type: 'SET_TILE_SIZE', tileSize: data.tileSize });
      })
      .catch(() => { /* no disk copy yet */ })
      .finally(() => { diskLoadedRef.current = true; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save: localStorage (instant) + disk via API (debounced) ──
  // Preserve triggers/NPCs/spawnPoints from the compiled map since the editor
  // doesn't yet edit those.
  const diskSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state.mapName) return;
    if (!diskLoadedRef.current) return; // don't clobber disk with pre-load state

    let npcs: unknown[] = [];
    let triggers: unknown[] = [];
    let spawnPoints: unknown[] = [{ id: 'default', x: Math.floor(state.mapWidth / 2) * state.tileSize, y: Math.floor(state.mapHeight / 2) * state.tileSize, facing: 'down' }];
    try {
      const compiled = loadMap(state.mapName);
      npcs = compiled.npcs;
      triggers = compiled.triggers;
      spawnPoints = compiled.spawnPoints;
    } catch { /* map isn't a compiled game map — use defaults */ }

    // `layers` is the authoritative store. We previously also wrote
    // legacy `tiles` and `objects` mirror fields for runtime back-compat,
    // but those duplicated ~50% of the file (216 KB on the pokemon
    // map alone) and slowed the boot fetch to a crawl. `normalizeMapData`
    // in core/Layers.ts already derives them from `layers` at register
    // time, so the runtime sees the same view either way.
    const mapData = {
      id: state.mapName,
      width: state.mapWidth,
      height: state.mapHeight,
      tileSize: state.tileSize,
      buildings: state.buildings,
      npcs,
      triggers,
      spawnPoints,
      layers: state.layers,
    };

    // Instant localStorage write (working buffer, survives quick refreshes)
    try {
      localStorage.setItem(`editor-map:${state.mapName}`, JSON.stringify(mapData));
      localStorage.setItem(ACTIVE_MAP_KEY, state.mapName);
    } catch { /* storage full */ }

    // Debounced disk write (persistent, survives localStorage clears)
    if (diskSaveTimerRef.current) window.clearTimeout(diskSaveTimerRef.current);
    diskSaveTimerRef.current = window.setTimeout(() => {
      fetch(`/api/maps/${encodeURIComponent(state.mapName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapData),
      }).catch(err => console.error('Failed to persist map to disk:', err));
    }, 500);
  }, [state.layers, state.buildings, state.mapWidth, state.mapHeight, state.mapName, state.tileSize]);

  // Flush any pending disk save on unmount
  useEffect(() => {
    return () => {
      if (diskSaveTimerRef.current) window.clearTimeout(diskSaveTimerRef.current);
    };
  }, []);

  // ── Initialize PixiJS ──
  useEffect(() => {
    if (!canvasContainerRef.current || editorAppRef.current) return;

    const app = new EditorApp();
    editorAppRef.current = app;

    app.init(canvasContainerRef.current).then(async () => {
      const s = stateRef.current;
      // Load any pack assets the saved map already references before the
      // first render, otherwise pack tiles/objects come up blank until the
      // user touches the map.
      const sObjects = getAllObjects(s);
      await app.ensurePackAssets({ tiles: getPrimaryTiles(s), objects: sObjects, buildings: s.buildings });
      app.setLayers(s.layers);
      app.renderLayers(s.layers, s.mapWidth, s.mapHeight, s.tileSize, s.activeLayerId);
      app.renderBuildings(s.buildings);
      app.setGridVisible(s.showGrid);

      // Center camera on the map by default. Camera (top-left in world coords)
      // is set so the map's center aligns with the viewport center.
      const screen = app.app.screen;
      const camX = (s.mapWidth * s.tileSize) / 2 - screen.width / (2 * s.zoom);
      const camY = (s.mapHeight * s.tileSize) / 2 - screen.height / (2 * s.zoom);
      dispatchRef.current({ type: 'SET_CAMERA', x: camX, y: camY });
      app.updateCamera(camX, camY, s.zoom);
    });

    return () => {
      app.destroy();
      editorAppRef.current = null;
    };
  }, []);

  // ── Sync state changes to PixiJS ──
  useEffect(() => {
    const app = editorAppRef.current;
    if (!app) return;
    let cancelled = false;
    // Push the current layer list before rendering so z-sort and visibility
    // honor the user-managed layer state.
    app.setLayers(state.layers);
    // Lazy-load any newly-introduced pack assets before rendering. Cached
    // ones resolve immediately; first-time pack picks add a small async hop
    // but only on the first paint of that asset.
    const flatTiles = getPrimaryTiles(state);
    const flatObjects = getAllObjects(state);
    app.ensurePackAssets({ tiles: flatTiles, objects: flatObjects, buildings: state.buildings }).then(() => {
      if (cancelled) return;
      app.renderLayers(state.layers, state.mapWidth, state.mapHeight, state.tileSize, state.activeLayerId);
      app.renderBuildings(state.buildings);
    });
    return () => { cancelled = true; };
  }, [state.layers, state.buildings, state.mapWidth, state.mapHeight, state.tileSize, state.activeLayerId]);

  useEffect(() => {
    editorAppRef.current?.setGridVisible(state.showGrid);
  }, [state.showGrid]);

  useEffect(() => {
    editorAppRef.current?.updateCamera(state.cameraX, state.cameraY, state.zoom);
  }, [state.cameraX, state.cameraY, state.zoom]);

  useEffect(() => {
    const app = editorAppRef.current;
    if (!app) return;
    if (state.selectedObjectIds.length === 0) {
      app.clearSelection();
      app.clearCollisionPreview();
      app.clearDoorPreview();
      return;
    }
    const allObjects = getAllObjects(state);
    // Multi-selection: highlight every selected object as a group; the
    // dimension-label affordance from `highlightObject` wouldn't make sense
    // for a group, so the multi path skips it. Buildings still highlight via
    // their own path when exactly one is selected.
    if (state.selectedObjectIds.length > 1) {
      const objs = state.selectedObjectIds
        .map(id => allObjects.find(o => o.id === id))
        .filter((o): o is Entity => !!o);
      app.highlightObjects(objs);
      // Collision/door previews are single-entity only — would be visual
      // clutter across a multi-selection.
      app.clearCollisionPreview();
      app.clearDoorPreview();
      return;
    }
    const onlyId = state.selectedObjectIds[0];
    const obj = allObjects.find((o: Entity) => o.id === onlyId);
    if (obj) {
      app.highlightObject(obj);
      app.showCollisionPreview(obj);
      app.showDoorPreview(obj, state.tileSize);
      return;
    }
    const bld = state.buildings.find((b) => b.id === onlyId);
    if (bld) {
      app.highlightBuilding(bld);
      app.clearCollisionPreview();
      app.clearDoorPreview();
      return;
    }
    app.clearSelection();
    app.clearCollisionPreview();
    app.clearDoorPreview();
  }, [state.selectedObjectIds, state.layers, state.buildings, state.tileSize]);

  // Sync the persistent selection rectangle to the editor's drawing state.
  useEffect(() => {
    const app = editorAppRef.current;
    if (!app) return;
    if (state.selectionArea) {
      app.showSelectionArea(state.selectionArea.row1, state.selectionArea.col1, state.selectionArea.row2, state.selectionArea.col2);
    } else {
      app.clearSelectionArea();
    }
  }, [state.selectionArea]);

  // Sync the resize-mode overlay (4 blue draggable lines + kept-region
  // fill). Re-renders any time the user drags an edge.
  useEffect(() => {
    const app = editorAppRef.current;
    if (!app) return;
    if (resizeMode) {
      app.showResizeOverlay(resizeMode.left, resizeMode.top, resizeMode.right, resizeMode.bottom, state.tileSize);
    } else {
      app.clearResizeOverlay();
    }
  }, [resizeMode, state.tileSize]);

  // ── Mouse handlers ──
  const getWorldPos = useCallback((e: React.MouseEvent) => {
    const app = editorAppRef.current;
    if (!app) return { x: 0, y: 0, row: 0, col: 0 };
    const s = stateRef.current;
    const world = app.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
    return { ...world, row: Math.floor(world.y / s.tileSize), col: Math.floor(world.x / s.tileSize) };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;

    // Middle mouse or space+click — pan
    if (e.button === 1 || spaceDownRef.current) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, camX: s.cameraX, camY: s.cameraY };
      return;
    }

    // Resize mode owns ALL canvas input while active. Detect which edge
    // the cursor is closest to (within a one-tile tolerance, scaled down
    // by world zoom so the hit zone stays usable at any zoom level), and
    // start a drag on that edge. Click anywhere else inside the rect:
    // ignored. Click outside the rect: ignored too — the only ways out
    // are the floating Apply/Cancel buttons or Escape.
    if (resizeMode && e.button === 0) {
      const app = editorAppRef.current;
      if (app) {
        const wp = app.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
        const T = s.tileSize;
        // Pick the nearest of the four edges in world pixels. Tolerance
        // is one full tile so dragging is forgiving.
        const tol = T;
        const lx = resizeMode.left * T;
        const rx = resizeMode.right * T;
        const ty = resizeMode.top * T;
        const by = resizeMode.bottom * T;
        const dLeft = Math.abs(wp.x - lx);
        const dRight = Math.abs(wp.x - rx);
        const dTop = Math.abs(wp.y - ty);
        const dBottom = Math.abs(wp.y - by);
        const m = Math.min(dLeft, dRight, dTop, dBottom);
        if (m <= tol) {
          if (m === dLeft) resizeDragRef.current = 'left';
          else if (m === dRight) resizeDragRef.current = 'right';
          else if (m === dTop) resizeDragRef.current = 'top';
          else resizeDragRef.current = 'bottom';
        }
      }
      return;
    }

    // Right click on an object → open the layer-reassign context menu.
    // Right click on empty space → deselect (legacy behavior preserved).
    // The menu renders at the page-coords of the click and operates on
    // whichever ids are selected at open time. If the user right-clicks an
    // unselected object, we replace the selection with just that id first
    // so the menu acts on what the user expects.
    if (e.button === 2) {
      const wp = getWorldPos(e);
      const allObjects = getAllObjects(s);
      // Priority pass: if the user already has a selection and the click
      // falls inside any selected object's bounding box, treat THAT as the
      // hit. Sprites can be much wider than their visual silhouette (a 487×
      // 512 bed PNG has a huge invisible halo), so a topmost-by-sortY
      // search across all objects will frequently hit the wrong overlapping
      // entity. Trusting the current selection on right-click gives the
      // user a reliable disambiguation: left-click to pick the exact one,
      // then right-click anywhere on it.
      let hitId: string | null = null;
      for (const id of s.selectedObjectIds) {
        const o = allObjects.find(oo => oo.id === id);
        if (!o) continue;
        const bb = getSpriteBounds(o.x, o.y, o.spriteKey, o.anchor, s.tileSize, o.scale ?? 1);
        if (wp.x >= bb.left && wp.x < bb.right && wp.y >= bb.top && wp.y < bb.bottom) {
          hitId = id;
          break;
        }
      }
      if (!hitId) {
        const lockedLayers = new Set(s.layers.filter(l => l.locked).map(l => l.id));
        const sorted = allObjects
          .filter(o => !lockedLayers.has(o.layer ?? ''))
          .sort((a, b) => b.sortY - a.sortY);
        const hit = sorted.find(o => {
          const bb = getSpriteBounds(o.x, o.y, o.spriteKey, o.anchor, s.tileSize, o.scale ?? 1);
          return wp.x >= bb.left && wp.x < bb.right && wp.y >= bb.top && wp.y < bb.bottom;
        });
        if (hit) hitId = hit.id;
      }
      if (hitId) {
        const ids = s.selectedObjectIds.includes(hitId) ? s.selectedObjectIds : [hitId];
        if (!s.selectedObjectIds.includes(hitId)) {
          dispatchRef.current({ type: 'SELECT_OBJECT', id: hitId });
        }
        setContextMenu({ x: e.clientX, y: e.clientY, ids });
        return;
      }
      // Empty space → close any open menu and deselect.
      setContextMenu(null);
      dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
      return;
    }

    // Any non-right-click closes the context menu.
    if (contextMenu) setContextMenu(null);

    const { x, y, row, col } = getWorldPos(e);

    if (s.activeTool === 'area-erase') {
      // Drag-to-clear: record the start AND end cells (both equal at first).
      // pointerMove updates `end` and the preview; pointerUp reads `end` to
      // dispatch CLEAR_AREA — independent of cursorWorldRef which doesn't get
      // updated while we early-return out of pointerMove.
      areaEraseRef.current = { start: { row, col }, end: { row, col } };
      editorAppRef.current?.showAreaRect(row, col, row, col);
      return;
    }

    if (s.activeTool === 'area-select') {
      const sel = s.selectionArea;
      // Click INSIDE an existing selection → start a move-drag. Click outside
      // → start a new selection-rect drag (clears the old selection on first
      // pointerMove via the ghost preview).
      if (sel) {
        const r0 = Math.min(sel.row1, sel.row2);
        const r1 = Math.max(sel.row1, sel.row2);
        const c0 = Math.min(sel.col1, sel.col2);
        const c1 = Math.max(sel.col1, sel.col2);
        if (row >= r0 && row <= r1 && col >= c0 && col <= c1) {
          areaMoveRef.current = {
            source: { row1: r0, col1: c0, row2: r1, col2: c1 },
            startRow: row,
            startCol: col,
            dRow: 0,
            dCol: 0,
          };
          return;
        }
      }
      // New selection: anchor at click cell, end follows cursor.
      areaSelectRef.current = { start: { row, col }, end: { row, col } };
      editorAppRef.current?.showSelectionArea(row, col, row, col);
      return;
    }

    // Car-path painting takes precedence over tool-based dispatch so the
    // user can paint road exits onto cells whenever a car-path layer is
    // active, regardless of which tool button was last pressed. Click
    // stamps the currently-toggled `selectedCarDirections` set into the
    // clicked cell, drags continue stamping on each new cell entered.
    {
      const active = s.layers.find(l => l.id === s.activeLayerId);
      if (active && active.kind === 'car-path') {
        if (active.locked) return;
        isPaintingRef.current = true;
        paintedCellsRef.current = new Set();
        paintedCellsRef.current.add(`${row},${col}`);
        dispatchRef.current({ type: 'PAINT_CAR_CELL', row, col, exits: s.selectedCarDirections });
        return;
      }
    }

    if (s.activeTool === 'tile') {
      // Bail when the tile layer the paint would actually land on is
      // locked. The reducer also rejects PAINT_TILES on pointer-up, but
      // without this guard the optimistic updateSingleTile call paints the
      // canvas visually before the rejected dispatch — leaving phantom
      // tiles that disappear on the next layer re-render. Match the
      // reducer's resolution exactly via getActiveTileLayer (active if
      // tile-kind, else first tile layer).
      if (getActiveTileLayer(s)?.locked) return;
      isPaintingRef.current = true;
      paintedCellsRef.current = new Set();
      paintedCellsRef.current.add(`${row},${col}`);
      // Multi-tile pack sources can't fit one cell — route them through
      // object placement on the active layer so they render at native size
      // at the click position (free placement, no cycle alignment).
      if (isMultiTilePackTile(s.selectedTileType)) {
        stampMultiTileAsObject(s.selectedTileType, row, col, s.tileSize, s.layers, dispatchRef.current);
      } else {
        editorAppRef.current?.updateSingleTile(row, col, s.selectedTileType);
      }
      // We'll batch dispatch on pointer up
    } else if (s.activeTool === 'object' && s.selectedObjectKey) {
      // Default for unknown sprite keys (e.g. pack singles not in
      // OBJECT_DEFAULTS): a collision box matching the sprite's *visible*
      // footprint — full width, lower half of the height — so newly-placed
      // pack objects block the player at their actual base. Heuristic:
      // upper half of a top-down sprite is decorative (canopy / roof /
      // lamp head); lower half is what the player physically bumps into.
      // Floor decor that shouldn't block (rugs, sidewalks, multi-tile
      // pack stamps) keeps zero-size collision and stays walkable.
      const tex = getTexture(s.selectedObjectKey);
      const visW = Math.round((tex?.width ?? s.tileSize) * DEFAULT_OBJECT_SCALE);
      const visH = Math.round((tex?.height ?? s.tileSize) * DEFAULT_OBJECT_SCALE);
      const fallbackBox = { offsetX: -Math.round(visW / 2), offsetY: -Math.round(visH / 2), width: visW, height: Math.round(visH / 2) };
      const defaults = OBJECT_DEFAULTS[s.selectedObjectKey] ?? { anchor: { x: 0.5, y: 1.0 }, collisionBox: fallbackBox };
      // Hold SHIFT to place freely (no tile snap). Default is snap-to-grid.
      const freeMode = e.shiftKey;
      const placeX = freeMode ? x : snapXForSprite(col, s.selectedObjectKey, s.tileSize);
      const placeY = freeMode ? y : (row + 1) * s.tileSize;
      // Decor objects (rugs, doormats, wall-mounted items) render BEHIND the
      // player so we can walk over/in front of them. Big negative offset.
      const sortY = defaults.isDecor ? placeY - 1000 : placeY;
      // Walkable-by-default for the bottommost layers. `ground` is a tile
      // layer (no objects normally land here, but if the user activates it
      // the reducer falls back to the first object layer which IS floor),
      // and `floor` is where sidewalks / rugs / multi-tile pack stamps go —
      // none of those should block the player. Anywhere else (decor-low /
      // props / above) keeps the sprite-derived collision so trees and
      // buildings collide by default.
      const noCollideLayers = new Set(['ground', 'floor']);
      const collisionBox = noCollideLayers.has(s.activeLayerId)
        ? { offsetX: 0, offsetY: 0, width: 0, height: 0 }
        : defaults.collisionBox;
      const entity = {
        id: generateObjectId(),
        x: placeX, y: placeY,
        spriteKey: s.selectedObjectKey,
        anchor: defaults.anchor,
        sortY,
        collisionBox,
        scale: DEFAULT_OBJECT_SCALE,
        layer: s.activeLayerId,
      };
      dispatchRef.current({ type: 'PLACE_OBJECT', entity });
      dispatchRef.current({ type: 'SELECT_OBJECT', id: entity.id });
    } else if (s.activeTool === 'building' && s.selectedBuildingKey) {
      const bd = BUILDING_DEFAULTS[s.selectedBuildingKey];
      if (bd) {
        const snapX = col * s.tileSize + bd.baseWidth / 2;
        const snapY = (row + 1) * s.tileSize + bd.baseHeight - s.tileSize;
        const building = {
          id: generateObjectId(),
          x: snapX, y: snapY,
          baseSpriteKey: bd.baseSpriteKey,
          roofSpriteKey: bd.roofSpriteKey,
          anchor: bd.anchor,
          sortY: snapY,
          collisionBox: bd.collisionBox,
          doorTrigger: bd.doorTrigger,
          targetMapId: bd.targetMapId ?? DEFAULT_INTERIOR_MAP_ID,
          targetSpawnId: 'entrance',
        };
        dispatchRef.current({ type: 'PLACE_BUILDING', building });
      }
    } else if (s.activeTool === 'select') {
      // Lock-aware hit-test: skip entities on layers the user has locked.
      // Buildings have no layer concept yet, so they're never lock-skipped.
      const lockedLayers = new Set(s.layers.filter(l => l.locked).map(l => l.id));
      const shift = e.shiftKey;
      let found = false;
      for (const b of s.buildings) {
        const bb = getSpriteBounds(b.x, b.y, b.baseSpriteKey, b.anchor, s.tileSize, b.scale ?? 1);
        if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
          // Buildings always replace selection — they don't participate in
          // multi-select group drag. Shift+click on a building still works
          // as a plain click (replaces selection with just that building).
          dispatchRef.current({ type: 'SELECT_OBJECT', id: b.id });
          draggingBuildingRef.current = { id: b.id, dx: b.x - x, dy: b.y - y };
          found = true;
          break;
        }
      }
      if (!found) {
        const sorted = getAllObjects(s)
          .filter(o => !lockedLayers.has(o.layer ?? ''))
          .sort((a, b) => b.sortY - a.sortY);
        for (const obj of sorted) {
          const bb = getSpriteBounds(obj.x, obj.y, obj.spriteKey, obj.anchor, s.tileSize, obj.scale ?? 1);
          if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
            if (shift) {
              // Shift-click on an entity is ambiguous: it could be a toggle
              // into the multi-selection (no drag) OR the start of a
              // free-placement drag (shift suppresses snap). We don't pick
              // yet — record the click and let pointermove promote it to a
              // drag once the cursor moves past a small threshold.
              // pointerup with no promotion fires the toggle.
              pendingShiftToggleRef.current = { id: obj.id, startScreen: { x: e.clientX, y: e.clientY } };
            } else if (s.selectedObjectIds.includes(obj.id) && s.selectedObjectIds.length > 1) {
              // Plain click on an already-multi-selected object: keep the
              // group as-is and start a group drag.
              const allObjs = getAllObjects(s);
              const originals = new Map<string, { x: number; y: number; sortY: number }>();
              for (const id of s.selectedObjectIds) {
                const o = allObjs.find(oo => oo.id === id);
                if (o) originals.set(id, { x: o.x, y: o.y, sortY: o.sortY });
              }
              draggingMultiRef.current = {
                ids: [...s.selectedObjectIds],
                originals,
                anchorWorld: { x, y },
                dragId: `drag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                anchorObjectId: obj.id,
              };
            } else {
              // Plain click on a fresh object: replace selection, start
              // single-object drag (the legacy path).
              dispatchRef.current({ type: 'SELECT_OBJECT', id: obj.id });
              draggingObjectRef.current = { id: obj.id, dx: obj.x - x, dy: obj.y - y };
            }
            found = true;
            break;
          }
        }
      }
      // Click on empty space: start a marquee. The selection is computed
      // on pointerup so a true click-without-drag (no movement, immediate
      // release) still acts as a deselect (handled in pointerup). Shift
      // held captures intent to ADD-to-selection on release; otherwise the
      // marquee REPLACES the existing selection.
      if (!found) {
        marqueeRef.current = {
          startWorld: { x, y },
          currentWorld: { x, y },
          addToSelection: e.shiftKey,
        };
        editorAppRef.current?.showMarquee(x, y, x, y);
      }
    } else if (s.activeTool === 'eraser') {
      const lockedLayers = new Set(s.layers.filter(l => l.locked).map(l => l.id));
      // Try erasing a building first — sprite-sized hit box
      for (const b of s.buildings) {
        const bb = getSpriteBounds(b.x, b.y, b.baseSpriteKey, b.anchor, s.tileSize);
        if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
          dispatchRef.current({ type: 'DELETE_BUILDING', id: b.id });
          return;
        }
      }
      // Then objects (skip locked-layer objects)
      const sorted = getAllObjects(s)
        .filter(o => !lockedLayers.has(o.layer ?? ''))
        .sort((a, b) => b.sortY - a.sortY);
      for (const obj of sorted) {
        const bb = getSpriteBounds(obj.x, obj.y, obj.spriteKey, obj.anchor, s.tileSize, obj.scale ?? 1);
        if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
          dispatchRef.current({ type: 'DELETE_OBJECT', id: obj.id });
          return;
        }
      }
      // Otherwise erase tile to grass — but only if the tile layer the
      // erase would land on is unlocked. Otherwise the optimistic
      // updateSingleTile would paint a phantom grass cell that the
      // reducer's PAINT_TILES guard later refuses to commit.
      if (getActiveTileLayer(s)?.locked) return;
      isPaintingRef.current = true;
      paintedCellsRef.current = new Set();
      paintedCellsRef.current.add(`${row},${col}`);
      editorAppRef.current?.updateSingleTile(row, col, TileType.GRASS);
    }
  }, [getWorldPos, contextMenu, resizeMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;

    if (isPanningRef.current) {
      const dx = (e.clientX - panStartRef.current.x) / s.zoom;
      const dy = (e.clientY - panStartRef.current.y) / s.zoom;
      dispatchRef.current({ type: 'SET_CAMERA', x: panStartRef.current.camX - dx, y: panStartRef.current.camY - dy });
      return;
    }

    // Promote a pending shift+click into a drag once the cursor moves past
    // a small dead-zone (4 px in screen space). Below the threshold the
    // user might still be intending a toggle-into-selection click — we
    // wait until they unmistakably moved before committing to a drag.
    if (pendingShiftToggleRef.current) {
      const dx = e.clientX - pendingShiftToggleRef.current.startScreen.x;
      const dy = e.clientY - pendingShiftToggleRef.current.startScreen.y;
      if (dx * dx + dy * dy > 16) {
        const id = pendingShiftToggleRef.current.id;
        pendingShiftToggleRef.current = null;
        const app = editorAppRef.current;
        if (app) {
          const w = app.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
          const obj = getAllObjects(s).find(o => o.id === id);
          if (obj) {
            // If the clicked entity already belongs to a multi-selection,
            // drag the whole group; otherwise drag just this one entity.
            // We don't add it to the selection here — pointer-up's no-move
            // path handles the toggle if the user releases without moving.
            // Once we're here they DID move, so the drag itself is the
            // intent and the existing selection stays as-is.
            if (s.selectedObjectIds.includes(id) && s.selectedObjectIds.length > 1) {
              const allObjs = getAllObjects(s);
              const originals = new Map<string, { x: number; y: number; sortY: number }>();
              for (const sid of s.selectedObjectIds) {
                const o = allObjs.find(oo => oo.id === sid);
                if (o) originals.set(sid, { x: o.x, y: o.y, sortY: o.sortY });
              }
              draggingMultiRef.current = {
                ids: [...s.selectedObjectIds],
                originals,
                anchorWorld: { x: w.x, y: w.y },
                dragId: `drag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                anchorObjectId: id,
              };
            } else {
              draggingObjectRef.current = { id, dx: obj.x - w.x, dy: obj.y - w.y };
            }
          }
        }
      }
    }

    // Resize-mode edge drag: snap the active edge to the nearest tile
    // boundary. Constraint: the rect must keep at least 1 tile of size,
    // so left < right and top < bottom enforced via clamping.
    if (resizeMode && resizeDragRef.current) {
      const app = editorAppRef.current;
      if (!app) return;
      const wp = app.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
      const T = s.tileSize;
      const cellCol = Math.round(wp.x / T);
      const cellRow = Math.round(wp.y / T);
      const edge = resizeDragRef.current;
      setResizeMode(prev => {
        if (!prev) return prev;
        if (edge === 'left') {
          const left = Math.min(cellCol, prev.right - 1);
          return left === prev.left ? prev : { ...prev, left };
        }
        if (edge === 'right') {
          const right = Math.max(cellCol, prev.left + 1);
          return right === prev.right ? prev : { ...prev, right };
        }
        if (edge === 'top') {
          const top = Math.min(cellRow, prev.bottom - 1);
          return top === prev.top ? prev : { ...prev, top };
        }
        // bottom
        const bottom = Math.max(cellRow, prev.top + 1);
        return bottom === prev.bottom ? prev : { ...prev, bottom };
      });
      return;
    }

    // Resize-mode hover (not dragging): set the wrapper's cursor to
    // ew-resize / ns-resize / default based on which edge the cursor is
    // closest to within a 1-tile tolerance. Gives the user the same
    // "I can grab this" affordance native window resize handles do.
    if (resizeMode && !resizeDragRef.current) {
      const app = editorAppRef.current;
      if (app) {
        const wp = app.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
        const T = s.tileSize;
        const tol = T;
        const dLeft = Math.abs(wp.x - resizeMode.left * T);
        const dRight = Math.abs(wp.x - resizeMode.right * T);
        const dTop = Math.abs(wp.y - resizeMode.top * T);
        const dBottom = Math.abs(wp.y - resizeMode.bottom * T);
        const m = Math.min(dLeft, dRight, dTop, dBottom);
        let next: typeof resizeHoverEdge = null;
        if (m <= tol) {
          if (m === dLeft) next = 'left';
          else if (m === dRight) next = 'right';
          else if (m === dTop) next = 'top';
          else next = 'bottom';
        }
        if (next !== resizeHoverEdge) setResizeHoverEdge(next);
      }
      // Don't fall through to the placement-preview / cursor-label code —
      // those don't make sense in resize mode.
      return;
    }

    // Area-erase drag: stretch the preview rectangle from the start cell to
    // wherever the cursor currently is. CLEAR_AREA fires on pointerUp.
    if (areaEraseRef.current) {
      const ref = areaEraseRef.current;
      const { row, col } = getWorldPos(e);
      ref.end = { row, col };
      editorAppRef.current?.showAreaRect(ref.start.row, ref.start.col, row, col);
      return;
    }

    // Area Select: drawing a new selection rectangle.
    if (areaSelectRef.current) {
      const ref = areaSelectRef.current;
      const { row, col } = getWorldPos(e);
      ref.end = { row, col };
      editorAppRef.current?.showSelectionArea(ref.start.row, ref.start.col, row, col);
      return;
    }

    // Marquee selection in the Select tool: stretch the rect from the
    // anchor to the current cursor position. Selection is computed on
    // pointerup so the user can refine the rectangle freely without
    // racking up dispatches.
    if (marqueeRef.current) {
      const world = editorAppRef.current?.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
      if (world) {
        marqueeRef.current.currentWorld = world;
        editorAppRef.current?.showMarquee(
          marqueeRef.current.startWorld.x,
          marqueeRef.current.startWorld.y,
          world.x,
          world.y,
        );
      }
      return;
    }

    // Area Select: dragging an existing selection. Show ghost preview at
    // the proposed destination; the real move dispatches on pointerUp.
    if (areaMoveRef.current) {
      const ref = areaMoveRef.current;
      const { row, col } = getWorldPos(e);
      ref.dRow = row - ref.startRow;
      ref.dCol = col - ref.startCol;
      const src = ref.source;
      editorAppRef.current?.showSelectionGhost(
        src.row1 + ref.dRow,
        src.col1 + ref.dCol,
        src.row2 + ref.dRow,
        src.col2 + ref.dCol,
      );
      return;
    }

    // If dragging a selected object, move it to the cursor (snapped to the
    // tile grid by default, or freely if SHIFT is held).
    if (draggingBuildingRef.current) {
      const drag = draggingBuildingRef.current;
      const b = s.buildings.find(bb => bb.id === drag.id);
      if (b) {
        const world = editorAppRef.current?.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
        if (world) {
          const tx = world.x + drag.dx;
          const ty = world.y + drag.dy;
          const tex = getTexture(b.baseSpriteKey);
          const scale = b.scale ?? 1;
          const baseW = (tex?.width ?? s.tileSize) * scale;
          const baseH = (tex?.height ?? s.tileSize) * scale;
          let nextX: number, nextY: number;
          if (e.shiftKey) {
            nextX = tx;
            nextY = ty;
          } else {
            // Invert the placement snap formula: snapX = col*tileSize + baseW/2,
            // snapY = (row+1)*tileSize + baseH - tileSize → row*tileSize + baseH.
            const targetCol = Math.round((tx - baseW / 2) / s.tileSize);
            const targetRow = Math.round((ty - baseH) / s.tileSize);
            nextX = targetCol * s.tileSize + baseW / 2;
            nextY = targetRow * s.tileSize + baseH;
          }
          if (nextX !== b.x || nextY !== b.y) {
            dispatchRef.current({ type: 'MOVE_BUILDING', id: b.id, x: nextX, y: nextY });
          }
        }
      }
      return;
    }
    if (draggingMultiRef.current) {
      // Group drag: compute the snapped delta from the anchor object's
      // pre-drag position, then apply that same delta to every selected
      // object. Snapping the delta (not each object independently) keeps
      // the group's relative spacing intact.
      const drag = draggingMultiRef.current;
      const world = editorAppRef.current?.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
      if (world) {
        const anchor = drag.originals.get(drag.anchorObjectId);
        if (anchor) {
          // Cursor delta from where the user grabbed.
          const dxRaw = world.x - drag.anchorWorld.x;
          const dyRaw = world.y - drag.anchorWorld.y;
          // Compute target position for the anchor object, then snap that.
          const anchorObj = getAllObjects(s).find(o => o.id === drag.anchorObjectId);
          let dx: number;
          let dy: number;
          if (e.shiftKey || !anchorObj) {
            // Free placement — apply raw delta unchanged.
            dx = dxRaw;
            dy = dyRaw;
          } else {
            const targetX = anchor.x + dxRaw;
            const targetY = anchor.y + dyRaw;
            const targetCol = Math.floor(targetX / s.tileSize);
            const targetRow = Math.floor(targetY / s.tileSize);
            const snappedAnchorX = snapXForSprite(targetCol, anchorObj.spriteKey, s.tileSize);
            const snappedAnchorY = (targetRow + 1) * s.tileSize;
            dx = snappedAnchorX - anchor.x;
            dy = snappedAnchorY - anchor.y;
          }
          const positions: Array<{ id: string; x: number; y: number }> = [];
          for (const id of drag.ids) {
            const orig = drag.originals.get(id);
            if (!orig) continue;
            positions.push({ id, x: orig.x + dx, y: orig.y + dy });
          }
          dispatchRef.current({ type: 'MOVE_OBJECTS', positions, dragId: drag.dragId });
        }
      }
      return;
    }
    if (draggingObjectRef.current) {
      const drag = draggingObjectRef.current;
      const obj = getAllObjects(s).find(o => o.id === drag.id);
      if (obj) {
        const world = editorAppRef.current?.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, s.zoom);
        if (world) {
          // target position = cursor + initial offset, then optionally snap
          const tx = world.x + drag.dx;
          const ty = world.y + drag.dy;
          let nextX: number, nextY: number;
          if (e.shiftKey) {
            nextX = tx;
            nextY = ty;
          } else {
            const targetCol = Math.floor(tx / s.tileSize);
            const targetRow = Math.floor(ty / s.tileSize);
            nextX = snapXForSprite(targetCol, obj.spriteKey, s.tileSize);
            nextY = (targetRow + 1) * s.tileSize;
          }
          if (nextX !== obj.x || nextY !== obj.y) {
            dispatchRef.current({ type: 'MOVE_OBJECT', id: obj.id, x: nextX, y: nextY });
          }
        }
      }
      return;
    }

    const { x, y, row, col } = getWorldPos(e);
    cursorWorldRef.current = { x, y };
    const app = editorAppRef.current;
    app?.highlightCell(row, col);

    // Show placement preview — SHIFT disables tile snap for free placement.
    // Three branches:
    //   - building: full base + roof preview at the snapped door position.
    //   - object: pack singles fall back to the default anchor (0.5, 1.0)
    //     since they aren't in OBJECT_DEFAULTS.
    //   - tile: shows the tile texture at the cursor cell with reduced alpha.
    //     Multi-tile pack tiles preview as a 32×32+ ghost positioned where
    //     `stampMultiTileAsObject` would actually drop them, since those auto-
    //     route to the floor layer instead of into the tile grid.
    const freeMode = e.shiftKey;
    const DEFAULT_ANCHOR = { x: 0.5, y: 1.0 };
    if (app && s.activeTool === 'building' && s.selectedBuildingKey) {
      const bd = BUILDING_DEFAULTS[s.selectedBuildingKey];
      if (bd) {
        const snapX = col * s.tileSize + bd.baseWidth / 2;
        const snapY = (row + 1) * s.tileSize + bd.baseHeight - s.tileSize;
        app.showBuildingPreview(bd.baseSpriteKey, bd.roofSpriteKey, snapX, snapY, bd.anchor);
      } else {
        app.clearPreview();
      }
    } else if (app && s.activeTool === 'object' && s.selectedObjectKey) {
      const defaults = OBJECT_DEFAULTS[s.selectedObjectKey];
      const anchor = defaults?.anchor ?? DEFAULT_ANCHOR;
      const px = freeMode ? x : snapXForSprite(col, s.selectedObjectKey, s.tileSize);
      const py = freeMode ? y : (row + 1) * s.tileSize;
      app.showObjectPreview(s.selectedObjectKey, px, py, anchor, DEFAULT_OBJECT_SCALE);
    } else if (app && s.activeTool === 'tile' && s.selectedTileType) {
      const tileType = s.selectedTileType;
      if (isMultiTilePackTile(tileType)) {
        // Mirror `stampMultiTileAsObject`'s placement math so the preview lands
        // exactly where the click would drop the asset.
        const { cols: N, rows: M } = getPackTileCellDims(tileType);
        const px = col * s.tileSize + (N * s.tileSize) / 2;
        const py = (row + M) * s.tileSize;
        app.showObjectPreview(tileType, px, py, DEFAULT_ANCHOR, 1);
      } else {
        // Single-cell tile preview — uses `getTileTexture` internally so per-
        // cell pattern tiles (wall-brick, floor-pattern) preview the right
        // quadrant for the hovered cell.
        app.showTilePreview(tileType, row, col, s.tileSize);
      }
    } else {
      app?.clearPreview();
    }

    // Cursor-anchored layer label — tells the user which layer their next
    // click will write to. Only shown for placement-style tools (where the
    // destination is meaningful) and resolves the real destination layer for
    // multi-tile pack tiles, which auto-route to the floor object layer
    // even when a tile layer is active.
    if (app) {
      const dest = resolveCursorPlacementLayer(s);
      if (dest) {
        app.showCursorLayerLabel(dest.name, dest.kind, x, y, s.zoom);
      } else {
        app.clearCursorLayerLabel();
      }
    }

    if (isPaintingRef.current) {
      const key = `${row},${col}`;
      if (!paintedCellsRef.current.has(key)) {
        paintedCellsRef.current.add(key);
        // Drag-paint dispatch differs based on what kind of layer the
        // user is painting on. Car-path drag stamps the currently-toggled
        // direction set into each new cell; tile drag does optimistic
        // visual updates batched into PAINT_TILES on pointerup.
        const active = s.layers.find(l => l.id === s.activeLayerId);
        if (active && active.kind === 'car-path') {
          dispatchRef.current({ type: 'PAINT_CAR_CELL', row, col, exits: s.selectedCarDirections });
        } else {
          const tileType = s.activeTool === 'eraser' ? TileType.VOID : s.selectedTileType;
          // Multi-tile pack tiles drag-stamp as additional objects on
          // the active layer (free placement); single-tile sources
          // continue with normal cell-paint visual feedback.
          if (s.activeTool === 'tile' && isMultiTilePackTile(tileType)) {
            stampMultiTileAsObject(tileType, row, col, s.tileSize, s.layers, dispatchRef.current);
          } else {
            editorAppRef.current?.updateSingleTile(row, col, tileType);
          }
        }
      }
    }
  }, [getWorldPos, resizeMode]);

  // Cursor exits the canvas → drop the floating layer label so it doesn't
  // linger after the user moves to the side panel. Also collapse any
  // placement preview sprite for the same reason. Pointer up is also routed
  // through here (legacy) so we delegate to it after cleanup.
  const handlePointerLeave = useCallback(() => {
    const app = editorAppRef.current;
    app?.clearCursorLayerLabel();
    app?.clearPreview();
    // If a marquee was in flight, dropping the cursor off the canvas
    // cancels it without committing a half-formed selection. The pointerup
    // path that immediately follows for left-button-still-down events
    // would otherwise see a stale ref.
    if (marqueeRef.current) {
      marqueeRef.current = null;
      app?.clearMarquee();
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    // End of a resize-mode edge drag.
    if (resizeDragRef.current) {
      resizeDragRef.current = null;
      return;
    }

    // Pending shift+click that never promoted to a drag → fire the toggle
    // selection now (user released without moving = pure click, not drag).
    if (pendingShiftToggleRef.current) {
      const id = pendingShiftToggleRef.current.id;
      pendingShiftToggleRef.current = null;
      dispatchRef.current({ type: 'TOGGLE_SELECT_OBJECT', id });
      return;
    }

    if (draggingMultiRef.current) {
      // End of group drag — clearing the ref also closes the dragId
      // transaction so the next drag opens a fresh undo entry.
      draggingMultiRef.current = null;
      return;
    }
    if (draggingObjectRef.current) {
      draggingObjectRef.current = null;
      return;
    }
    if (draggingBuildingRef.current) {
      draggingBuildingRef.current = null;
      return;
    }

    if (areaEraseRef.current) {
      const { start, end } = areaEraseRef.current;
      areaEraseRef.current = null;
      // `end` is updated continuously in pointerMove; the reducer clamps to
      // the map bounds, so we dispatch raw cell indices.
      dispatchRef.current({ type: 'CLEAR_AREA', row1: start.row, col1: start.col, row2: end.row, col2: end.col });
      editorAppRef.current?.clearAreaRect();
      return;
    }

    if (marqueeRef.current) {
      // Commit a marquee selection in the Select tool. Two outcomes:
      //   - True click (no movement): treat as deselect (legacy behavior).
      //   - Real drag: bbox-intersect every visible/unlocked entity against
      //     the marquee rect; replace or augment selection per shift state.
      const m = marqueeRef.current;
      marqueeRef.current = null;
      editorAppRef.current?.clearMarquee();
      const dx = m.currentWorld.x - m.startWorld.x;
      const dy = m.currentWorld.y - m.startWorld.y;
      const moved = Math.abs(dx) > 3 || Math.abs(dy) > 3;
      if (!moved) {
        // Click without drag → deselect, unless shift was held (then keep
        // the existing selection so re-anchoring the cursor is harmless).
        if (!m.addToSelection) dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
        return;
      }
      const s = stateRef.current;
      const left = Math.min(m.startWorld.x, m.currentWorld.x);
      const right = Math.max(m.startWorld.x, m.currentWorld.x);
      const top = Math.min(m.startWorld.y, m.currentWorld.y);
      const bottom = Math.max(m.startWorld.y, m.currentWorld.y);
      const lockedLayers = new Set(s.layers.filter(l => l.locked).map(l => l.id));
      // Bbox-intersection rather than feet-position-inside: matches Figma's
      // "anything overlapping the rect" intuition. Skip locked-layer
      // entities (they can't be moved/deleted anyway, so excluding them
      // keeps the resulting selection actionable).
      const hits: string[] = [];
      for (const o of getAllObjects(s)) {
        if (lockedLayers.has(o.layer ?? '')) continue;
        const bb = getSpriteBounds(o.x, o.y, o.spriteKey, o.anchor, s.tileSize, o.scale ?? 1);
        if (bb.right > left && bb.left < right && bb.bottom > top && bb.top < bottom) {
          hits.push(o.id);
        }
      }
      // Buildings get included too — they share `selectedObjectIds` with
      // entities, and Delete works on either kind.
      for (const b of s.buildings) {
        const bb = getSpriteBounds(b.x, b.y, b.baseSpriteKey, b.anchor, s.tileSize, b.scale ?? 1);
        if (bb.right > left && bb.left < right && bb.bottom > top && bb.top < bottom) {
          hits.push(b.id);
        }
      }
      if (m.addToSelection) {
        // Toggle each hit so a second shift-marquee over the same items
        // unselects them (mirrors shift-click toggle semantics).
        for (const id of hits) dispatchRef.current({ type: 'TOGGLE_SELECT_OBJECT', id });
      } else {
        // Replace selection. Empty-marquee = clear.
        if (hits.length === 0) {
          dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
        } else {
          // First hit replaces; rest are toggled in to build the multi
          // selection in one batch.
          dispatchRef.current({ type: 'SELECT_OBJECT', id: hits[0] });
          for (let i = 1; i < hits.length; i++) {
            dispatchRef.current({ type: 'TOGGLE_SELECT_OBJECT', id: hits[i] });
          }
        }
      }
      return;
    }

    if (areaSelectRef.current) {
      const { start, end } = areaSelectRef.current;
      areaSelectRef.current = null;
      // Commit the new selection rectangle. The persistent rectangle
      // graphic is driven by the state useEffect, so we don't redraw here.
      dispatchRef.current({
        type: 'SET_SELECTION_AREA',
        area: { row1: start.row, col1: start.col, row2: end.row, col2: end.col },
      });
      return;
    }

    if (areaMoveRef.current) {
      const { source, dRow, dCol } = areaMoveRef.current;
      areaMoveRef.current = null;
      editorAppRef.current?.clearSelectionGhost();
      // No-op move: just keep the existing selection where it is.
      if (dRow === 0 && dCol === 0) return;
      dispatchRef.current({ type: 'MOVE_AREA', sourceArea: source, dRow, dCol });
      return;
    }

    if (isPaintingRef.current && paintedCellsRef.current.size > 0) {
      const s = stateRef.current;
      const active = s.layers.find(l => l.id === s.activeLayerId);
      // Car-path painting already fired PAINT_CAR_CELL per cell during
      // the drag — nothing to batch on pointerup.
      if (active && active.kind === 'car-path') {
        // no-op
      } else {
        const tileType = s.activeTool === 'eraser' ? TileType.VOID : s.selectedTileType;
        // Multi-tile pack tiles already placed individual objects per cell
        // during drag — nothing to batch into PAINT_TILES.
        if (!(s.activeTool === 'tile' && isMultiTilePackTile(tileType))) {
          const cells = Array.from(paintedCellsRef.current).map(k => {
            const [r, c] = k.split(',').map(Number);
            return { row: r, col: c };
          });
          dispatchRef.current({ type: 'PAINT_TILES', cells, tileType });
        }
      }
      isPaintingRef.current = false;
      paintedCellsRef.current.clear();
    }
  }, []);

  // Wheel handler — attached as native event to prevent browser zoom
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const s = stateRef.current;
      const app = editorAppRef.current;
      if (!app) return;

      if (e.metaKey) {
        // Cmd+scroll = zoom. Multiplicative step feels
        // consistent at every zoom level — same wheel tick covers 0.5→0.6 and
        // 2.0→2.4 in proportional terms instead of a fixed +0.05.
        const oldZoom = s.zoom;
        const factor = e.deltaY > 0 ? 1 / 1.2 : 1.2;
        const newZoom = Math.max(0.25, Math.min(8, oldZoom * factor));
        if (newZoom === oldZoom) return;

        const world = app.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, oldZoom);
        const canvas = app.getCanvas();
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
          const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
          dispatchRef.current({ type: 'SET_CAMERA', x: world.x - screenX / newZoom, y: world.y - screenY / newZoom });
        }
        dispatchRef.current({ type: 'SET_ZOOM', zoom: newZoom });
      } else {
        // Regular scroll = pan
        dispatchRef.current({
          type: 'SET_CAMERA',
          x: s.cameraX + e.deltaX / s.zoom,
          y: s.cameraY + e.deltaY / s.zoom,
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Single source of truth for the modifier — covers both Cmd (Mac) and
      // Ctrl (PC). Prior code had two separate Ctrl+Z branches that fired
      // back-to-back on PC, undoing two steps per keypress.
      const mod = e.metaKey || e.ctrlKey;

      // Undo / redo — Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y. Handled BEFORE
      // the form-field bail so the user can always step back from a
      // destructive op (e.g. shrinking the map and wiping tiles) without
      // first having to click off the input. Matches Figma / most graphics
      // editors where Cmd+Z is canvas-level no matter where focus is.
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatchRef.current({ type: e.shiftKey ? 'REDO' : 'UNDO' });
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatchRef.current({ type: 'REDO' });
        return;
      }

      // Skip remaining editor shortcuts while focus is on a form control.
      // Without this, typing into the panel's numeric inputs / spawn-id
      // text field accidentally fires Backspace→DELETE_OBJECT, '[' / ']' →
      // SET_OBJECTS_LAYER, 'g' → TOGGLE_GRID, etc. The browser-native
      // text-edit behaviour (cursor movement, character delete) is what
      // the user actually wants while typing. Cmd/Ctrl+Z/Y already
      // handled above — those win over native input undo by design.
      const focusEl = e.target as (HTMLElement | null);
      if (focusEl) {
        const tag = focusEl.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || focusEl.isContentEditable) {
          return;
        }
      }

      const target = e.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (!mod && !isTyping && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        dispatchRef.current({ type: 'SET_TOOL', tool: 'select' });
        editorAppRef.current?.clearPreview();
        return;
      }

      if (e.key === 'Escape') {
        // Resize mode swallows Escape (= cancel) before the tool reset.
        if (resizeMode) {
          setResizeMode(null);
          resizeDragRef.current = null;
          return;
        }
        dispatchRef.current({ type: 'SET_TOOL', tool: 'select' });
        editorAppRef.current?.clearPreview();
      }
      if (e.key === 'Enter' && resizeMode) {
        // Apply via Enter while in resize mode.
        applyResize();
        e.preventDefault();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = stateRef.current;
        // Multi-delete: dispatch one DELETE per id. Each dispatch pushes its
        // own undo entry today; if that ever feels noisy we can introduce
        // DELETE_OBJECTS (batch). Buildings + objects mixed in the same
        // selection both get their right action via the `buildings.some`
        // discriminator.
        for (const id of s.selectedObjectIds) {
          if (s.buildings.some(b => b.id === id)) {
            dispatchRef.current({ type: 'DELETE_BUILDING', id });
          } else {
            dispatchRef.current({ type: 'DELETE_OBJECT', id });
          }
        }
      }
      if (e.key === 'g') dispatchRef.current({ type: 'TOGGLE_GRID' });
      if (e.code === 'Space') { e.preventDefault(); spaceDownRef.current = true; }
      if (e.key === 'Shift') shiftDownRef.current = true;

      // Bracket keys — restack the selected objects up/down by one OBJECT
      // layer in the visible stack. ']' = bring forward (toward Above), '['
      // = send back (toward Floor). Tile layers are skipped since entities
      // can't live on them. For mixed-layer multi-selection, target is
      // computed from the FIRST selected object's layer so all selected
      // collapse to the same destination — predictable, even if the user's
      // group spanned several layers before.
      if ((e.key === ']' || e.key === '[') && !mod) {
        const s = stateRef.current;
        if (s.selectedObjectIds.length === 0) return;
        const firstId = s.selectedObjectIds[0];
        const firstObj = getAllObjects(s).find(o => o.id === firstId);
        if (!firstObj) return;
        const currentLayerId = firstObj.layer ?? 'props';
        // Object-layer-only stack — tile layers don't accept entities and
        // would break the bring-forward intent.
        const objectLayers = s.layers.filter(l => l.kind === 'object');
        const idx = objectLayers.findIndex(l => l.id === currentLayerId);
        if (idx < 0) return;
        const targetIdx = e.key === ']' ? idx + 1 : idx - 1;
        if (targetIdx < 0 || targetIdx >= objectLayers.length) return; // no-op at the rim
        e.preventDefault();
        dispatchRef.current({
          type: 'SET_OBJECTS_LAYER',
          ids: s.selectedObjectIds,
          layerId: objectLayers[targetIdx].id,
        });
      }

      // Copy / paste — captures EVERY currently-selected object so a group
      // selection (shift-click or marquee) can be duplicated as a unit.
      // Paste preserves the relative offsets between clipboard entities by
      // anchoring on the first one: snap the first entity's new position
      // to the cursor cell, compute the delta, apply that same delta to
      // every clipboard entity. End result: the pasted group keeps its
      // original shape, just translated to wherever the cursor is.
      if (mod && e.key.toLowerCase() === 'c') {
        const s = stateRef.current;
        if (s.selectedObjectIds.length > 0) {
          const all = getAllObjects(s);
          const copied = s.selectedObjectIds
            .map(id => all.find(o => o.id === id))
            .filter((o): o is Entity => !!o);
          if (copied.length > 0) {
            e.preventDefault();
            clipboardRef.current = copied;
          }
        }
      } else if (mod && e.key.toLowerCase() === 'v') {
        const clip = clipboardRef.current;
        const cursor = cursorWorldRef.current;
        if (clip.length > 0 && cursor) {
          e.preventDefault();
          const s = stateRef.current;
          const freeMode = shiftDownRef.current;
          // Anchor: first clipboard entity. Compute its NEW position via the
          // same snap rule single-paste used (tile-cell aligned by default,
          // free with Shift). Delta = newPos - originalPos. Apply to all.
          const anchor = clip[0];
          let anchorNewX: number, anchorNewY: number;
          if (freeMode) {
            anchorNewX = cursor.x;
            anchorNewY = cursor.y;
          } else {
            const col = Math.floor(cursor.x / s.tileSize);
            const row = Math.floor(cursor.y / s.tileSize);
            anchorNewX = snapXForSprite(col, anchor.spriteKey, s.tileSize);
            anchorNewY = (row + 1) * s.tileSize;
          }
          const dx = anchorNewX - anchor.x;
          const dy = anchorNewY - anchor.y;
          // Place each entity at original + delta. Generate new ids so the
          // pasted entities are independent from the originals; preserve
          // sortY relationship (decor's sortY < 0 trick is kept).
          const newIds: string[] = [];
          for (const src of clip) {
            const x = src.x + dx;
            const y = src.y + dy;
            const newSortY = src.sortY === src.y
              ? y
              : (src.sortY < 0 ? y - 1000 : src.sortY + dy);
            const entity: Entity = {
              ...src,
              id: generateObjectId(),
              x, y, sortY: newSortY,
            };
            dispatchRef.current({ type: 'PLACE_OBJECT', entity });
            newIds.push(entity.id);
          }
          // Replace the selection with the pasted entities so the user can
          // immediately reposition them with arrow keys / drag.
          if (newIds.length > 0) {
            dispatchRef.current({ type: 'SELECT_OBJECT', id: newIds[0] });
            for (let i = 1; i < newIds.length; i++) {
              dispatchRef.current({ type: 'TOGGLE_SELECT_OBJECT', id: newIds[i] });
            }
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDownRef.current = false;
      if (e.key === 'Shift') shiftDownRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    // resizeMode + applyResize are read inside the handler — without them in
    // deps the captured snapshot is the original null/initial values, and
    // Escape / Enter shortcuts inside resize mode are dead.
  }, [resizeMode, applyResize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100dvh', overflow: 'hidden' }}>
      <EditorTopBar state={state} dispatch={dispatch} onBeginResize={beginResize} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <EditorToolPanel state={state} dispatch={dispatch} />
        <div
          ref={canvasContainerRef}
          style={{
            flex: 1, position: 'relative',
            // Resize-mode cursor wins over the regular tool cursor: ew-resize
            // for left/right edges, ns-resize for top/bottom. Falls back to
            // crosshair (paint tools) or default.
            cursor: resizeMode
              ? (resizeDragRef.current === 'left' || resizeDragRef.current === 'right' || resizeHoverEdge === 'left' || resizeHoverEdge === 'right'
                  ? 'ew-resize'
                  : (resizeDragRef.current === 'top' || resizeDragRef.current === 'bottom' || resizeHoverEdge === 'top' || resizeHoverEdge === 'bottom'
                      ? 'ns-resize'
                      : 'default'))
              : (state.activeTool === 'tile' || state.activeTool === 'eraser' ? 'crosshair' : 'default'),
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => { handlePointerUp(); handlePointerLeave(); }}
          onContextMenu={handleContextMenu}
        />
      </div>
      {resizeMode && (
        <div
          style={{
            position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#1a1a2e', border: '1px solid #4488ff', borderRadius: 6,
            padding: '8px 12px', zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
            color: '#ddd', fontSize: 12,
          }}
        >
          <span>
            <strong style={{ color: '#88bbff' }}>Resize:</strong>{' '}
            {resizeMode.right - resizeMode.left} × {resizeMode.bottom - resizeMode.top}
            <span style={{ color: '#666' }}> (was {state.mapWidth} × {state.mapHeight})</span>
          </span>
          <button
            onClick={cancelResize}
            style={{
              padding: '4px 10px', fontSize: 11,
              background: '#2a2a3a', border: '1px solid #444', borderRadius: 4,
              color: '#ddd', cursor: 'pointer',
            }}
          >Cancel (Esc)</button>
          <button
            onClick={applyResize}
            style={{
              padding: '4px 10px', fontSize: 11,
              background: '#2a4a3a', border: '1px solid #4a8a6a', borderRadius: 4,
              color: '#cfc', cursor: 'pointer', fontWeight: 'bold',
            }}
          >Apply (Enter)</button>
        </div>
      )}
      {contextMenu && (
        <LayerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          layers={state.layers}
          onSelect={(layerId) => {
            dispatch({ type: 'SET_OBJECTS_LAYER', ids: contextMenu.ids, layerId });
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

/** Floating "Move to layer" menu shown on right-click. Lists every object
 * layer (tile layers are excluded — entities can't live there) and dispatches
 * SET_OBJECTS_LAYER on click. Auto-closes on Escape, on click outside, or
 * after a layer is picked. Position is page-fixed at the right-click coords. */
function LayerContextMenu({
  x, y, layers, onSelect, onClose,
}: {
  x: number;
  y: number;
  layers: ReturnType<typeof createInitialState>['layers'];
  onSelect: (layerId: string) => void;
  onClose: () => void;
}) {
  // Ref to the outer div so the document mousedown listener can ask
  // "did the click originate inside our menu?" — synthetic-event
  // stopPropagation on the inner onMouseDown isn't enough because React
  // processes its delegated listener before native bubbling continues to
  // the document listener I attach below.
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Close on Escape and on any click outside the menu.
    //
    // The mousedown listener is attached on the NEXT tick rather than
    // immediately. Without the delay, the same `mousedown` that came in
    // alongside the opening right-click `pointerdown` (React commits the
    // state, runs this effect, then the original native mousedown
    // continues bubbling to document) would synchronously close the menu
    // ~8 ms after it opened.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => {
      // Click on a menu item should fall through to React's onClick — only
      // close when the target is outside the menu surface.
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', onClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  // Show object layers in user-visible order: top of stack first (matches
  // the layers panel which renders the array reversed). Tile layers are
  // skipped — moving an entity onto one is rejected by the reducer.
  const objectLayers = [...layers].filter(l => l.kind === 'object').reverse();

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: '#1a1a2e',
        border: '1px solid #444',
        borderRadius: 4,
        padding: 4,
        minWidth: 140,
        zIndex: 1000,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
        fontSize: 11,
        color: '#ddd',
      }}
    >
      <div style={{ fontSize: 10, color: '#888', padding: '2px 6px 4px', borderBottom: '1px solid #333', marginBottom: 4 }}>
        Move to layer
      </div>
      {objectLayers.map(l => {
        const locked = !!l.locked;
        return (
          <button
            key={l.id}
            onClick={() => { if (!locked) onSelect(l.id); }}
            disabled={locked}
            title={locked ? 'Layer is locked — unlock it in the layers panel to move objects here' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%',
              padding: '4px 6px',
              background: 'transparent',
              border: 'none',
              color: locked ? '#666' : '#ddd',
              cursor: locked ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              fontSize: 11,
              borderRadius: 2,
            }}
            onMouseEnter={e => { if (!locked) e.currentTarget.style.background = '#2a3a5a'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span
              style={{
                width: 14, height: 14, fontSize: 9, fontWeight: 'bold',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: '#4a3a5a', color: locked ? '#666' : '#cc99ff',
                borderRadius: 2, flexShrink: 0,
              }}
            >O</span>
            {l.name}
            {locked && <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
