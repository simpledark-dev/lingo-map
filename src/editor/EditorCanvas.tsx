'use client';

import { useRef, useEffect, useReducer, useCallback, useState } from 'react';
import { TileType, Entity } from '../core/types';
import { EditorApp } from './EditorApp';
import { editorReducer, createInitialState, EditorAction, generateObjectId, buildImportedLayers, getPrimaryTiles, getAllObjects } from './editorState';
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
  { name: string; kind: 'tile' | 'object' } | null
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

  // 3) Fallback: compiled map
  const map = loadMap(mapId);
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
  const areaEraseRef = useRef<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  // Area Select: drawing a new selection rectangle.
  const areaSelectRef = useRef<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  // Area Select: dragging an EXISTING selection to a new location.
  const areaMoveRef = useRef<{ source: { row1: number; col1: number; row2: number; col2: number }; startCol: number; startRow: number; dRow: number; dCol: number } | null>(null);

  // Copy/paste: last copied entity (without id) and last known cursor world pos
  const clipboardRef = useRef<Entity | null>(null);
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

    // Mirror the layered structure into the legacy `tiles` / `objects` fields
    // so the game runtime (which still reads those when normalizing) sees a
    // consistent view. The new `layers` field is the authoritative store.
    const mapData = {
      id: state.mapName,
      width: state.mapWidth,
      height: state.mapHeight,
      tileSize: state.tileSize,
      tiles: getPrimaryTiles(state),
      objects: getAllObjects(state),
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
    if (state.selectedObjectIds.length === 0) { app.clearSelection(); return; }
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
      return;
    }
    const onlyId = state.selectedObjectIds[0];
    const obj = allObjects.find((o: Entity) => o.id === onlyId);
    if (obj) { app.highlightObject(obj); return; }
    const bld = state.buildings.find((b) => b.id === onlyId);
    if (bld) { app.highlightBuilding(bld); return; }
    app.clearSelection();
  }, [state.selectedObjectIds, state.layers, state.buildings]);

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

    if (s.activeTool === 'tile') {
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
      const defaults = OBJECT_DEFAULTS[s.selectedObjectKey] ?? { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
      // Hold SHIFT to place freely (no tile snap). Default is snap-to-grid.
      const freeMode = e.shiftKey;
      const placeX = freeMode ? x : snapXForSprite(col, s.selectedObjectKey, s.tileSize);
      const placeY = freeMode ? y : (row + 1) * s.tileSize;
      // Decor objects (rugs, doormats, wall-mounted items) render BEHIND the
      // player so we can walk over/in front of them. Big negative offset.
      const sortY = defaults.isDecor ? placeY - 1000 : placeY;
      const entity = {
        id: generateObjectId(),
        x: placeX, y: placeY,
        spriteKey: s.selectedObjectKey,
        anchor: defaults.anchor,
        sortY,
        collisionBox: defaults.collisionBox,
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
              // Shift-click: toggle this id in/out of the multi-selection;
              // never start a drag — user is building up the selection.
              dispatchRef.current({ type: 'TOGGLE_SELECT_OBJECT', id: obj.id });
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
      // Click on empty space: shift held → keep selection; no shift → clear.
      // Lets the user re-anchor the cursor without losing a partial group.
      if (!found && !e.shiftKey) dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
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
      // Otherwise erase tile to grass
      isPaintingRef.current = true;
      paintedCellsRef.current = new Set();
      paintedCellsRef.current.add(`${row},${col}`);
      editorAppRef.current?.updateSingleTile(row, col, TileType.GRASS);
    }
  }, [getWorldPos, contextMenu]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;

    if (isPanningRef.current) {
      const dx = (e.clientX - panStartRef.current.x) / s.zoom;
      const dy = (e.clientY - panStartRef.current.y) / s.zoom;
      dispatchRef.current({ type: 'SET_CAMERA', x: panStartRef.current.camX - dx, y: panStartRef.current.camY - dy });
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
      const tileType = s.activeTool === 'eraser' ? TileType.VOID : s.selectedTileType;
      const key = `${row},${col}`;
      if (!paintedCellsRef.current.has(key)) {
        paintedCellsRef.current.add(key);
        // Multi-tile pack tiles drag-stamp as additional objects on the
        // active layer (free placement); single-tile sources continue with
        // normal cell-paint visual feedback.
        if (s.activeTool === 'tile' && isMultiTilePackTile(tileType)) {
          stampMultiTileAsObject(tileType, row, col, s.tileSize, s.layers, dispatchRef.current);
        } else {
          editorAppRef.current?.updateSingleTile(row, col, tileType);
        }
      }
    }
  }, [getWorldPos]);

  // Cursor exits the canvas → drop the floating layer label so it doesn't
  // linger after the user moves to the side panel. Also collapse any
  // placement preview sprite for the same reason. Pointer up is also routed
  // through here (legacy) so we delegate to it after cleanup.
  const handlePointerLeave = useCallback(() => {
    const app = editorAppRef.current;
    app?.clearCursorLayerLabel();
    app?.clearPreview();
  }, []);

  const handlePointerUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
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
        const newZoom = Math.max(0.25, Math.min(3, oldZoom * factor));
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

      // Undo / redo — Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y. Done first so the
      // Escape / Delete branches below don't accidentally fire on the same
      // keypress (e.g. pressing 'z' standalone shouldn't trigger anything).
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

      if (e.key === 'Escape') {
        dispatchRef.current({ type: 'SET_TOOL', tool: 'select' });
        editorAppRef.current?.clearPreview();
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

      // Copy / paste — copy uses the FIRST currently-selected object; paste
      // drops one new copy at the cursor. Multi-clipboard could be added
      // later but the common case is "duplicate this thing I just placed."
      if (mod && e.key.toLowerCase() === 'c') {
        const s = stateRef.current;
        const firstId = s.selectedObjectIds[0];
        if (firstId) {
          const selected = getAllObjects(s).find(o => o.id === firstId);
          if (selected) {
            e.preventDefault();
            clipboardRef.current = selected;
          }
        }
      } else if (mod && e.key.toLowerCase() === 'v') {
        const src = clipboardRef.current;
        const cursor = cursorWorldRef.current;
        if (src && cursor) {
          e.preventDefault();
          const s = stateRef.current;
          const freeMode = shiftDownRef.current;
          let x: number, y: number;
          if (freeMode) {
            x = cursor.x;
            y = cursor.y;
          } else {
            const col = Math.floor(cursor.x / s.tileSize);
            const row = Math.floor(cursor.y / s.tileSize);
            x = snapXForSprite(col, src.spriteKey, s.tileSize);
            y = (row + 1) * s.tileSize;
          }
          const sortY = src.sortY < 0 ? y - 1000 : y;
          const entity: Entity = {
            ...src,
            id: generateObjectId(),
            x, y,
            sortY,
          };
          dispatchRef.current({ type: 'PLACE_OBJECT', entity });
          dispatchRef.current({ type: 'SELECT_OBJECT', id: entity.id });
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
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100dvh', overflow: 'hidden' }}>
      <EditorTopBar state={state} dispatch={dispatch} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <EditorToolPanel state={state} dispatch={dispatch} />
        <div
          ref={canvasContainerRef}
          style={{ flex: 1, position: 'relative', cursor: state.activeTool === 'tile' || state.activeTool === 'eraser' ? 'crosshair' : 'default' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => { handlePointerUp(); handlePointerLeave(); }}
          onContextMenu={handleContextMenu}
        />
      </div>
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
      {objectLayers.map(l => (
        <button
          key={l.id}
          onClick={() => onSelect(l.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%',
            padding: '4px 6px',
            background: 'transparent',
            border: 'none',
            color: '#ddd',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 11,
            borderRadius: 2,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#2a3a5a')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span
            style={{
              width: 14, height: 14, fontSize: 9, fontWeight: 'bold',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: '#4a3a5a', color: '#cc99ff',
              borderRadius: 2, flexShrink: 0,
            }}
          >O</span>
          {l.name}
        </button>
      ))}
    </div>
  );
}
