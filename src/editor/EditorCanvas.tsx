'use client';

import { useRef, useEffect, useReducer, useCallback } from 'react';
import { TileType, Entity } from '../core/types';
import { EditorApp } from './EditorApp';
import { editorReducer, createInitialState, EditorAction, generateObjectId } from './editorState';
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
          return { ...base, tiles: saved.tiles, objects: saved.objects || [], buildings: saved.buildings || [], mapWidth: saved.width, mapHeight: saved.height, mapName: saved.id || mapId, tileSize: saved.tileSize || 16 };
        }
      }
    } catch { /* fall through to compiled map */ }
  }

  // 3) Fallback: compiled map
  const map = loadMap(mapId);
  const base = createInitialState(map.width, map.height);
  return { ...base, tiles: map.tiles, objects: map.objects, buildings: map.buildings, mapWidth: map.width, mapHeight: map.height, mapName: map.id, tileSize: map.tileSize };
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

  // Object drag state — when user grabs a selected object with the select tool
  const draggingObjectRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const draggingBuildingRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const areaEraseRef = useRef<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);

  // Copy/paste: last copied entity (without id) and last known cursor world pos
  const clipboardRef = useRef<Entity | null>(null);
  const cursorWorldRef = useRef<{ x: number; y: number } | null>(null);
  const shiftDownRef = useRef(false);

  // Track whether we've loaded from disk yet, so the auto-save doesn't fire
  // with stale (pre-load) state and overwrite the disk copy.
  const diskLoadedRef = useRef(false);

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

    const mapData = {
      id: state.mapName,
      width: state.mapWidth,
      height: state.mapHeight,
      tileSize: state.tileSize,
      tiles: state.tiles,
      objects: state.objects,
      buildings: state.buildings,
      npcs,
      triggers,
      spawnPoints,
      // Persist user-managed layers (id/name/visible/locked) so reopening
      // the editor restores the same layer setup. Game runtime ignores the
      // editor-only `visible`/`locked` flags.
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
  }, [state.tiles, state.objects, state.buildings, state.layers, state.mapWidth, state.mapHeight, state.mapName, state.tileSize]);

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
      await app.ensurePackAssets({ tiles: s.tiles, objects: s.objects, buildings: s.buildings });
      app.setLayers(s.layers);
      app.renderTiles(s.tiles, s.mapWidth, s.mapHeight, s.tileSize);
      app.renderObjects(s.objects);
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
    app.ensurePackAssets({ tiles: state.tiles, objects: state.objects, buildings: state.buildings }).then(() => {
      if (cancelled) return;
      app.renderTiles(state.tiles, state.mapWidth, state.mapHeight, state.tileSize);
      app.renderObjects(state.objects);
      app.renderBuildings(state.buildings);
    });
    return () => { cancelled = true; };
  }, [state.tiles, state.objects, state.buildings, state.layers, state.mapWidth, state.mapHeight, state.tileSize]);

  useEffect(() => {
    editorAppRef.current?.setGridVisible(state.showGrid);
  }, [state.showGrid]);

  useEffect(() => {
    editorAppRef.current?.updateCamera(state.cameraX, state.cameraY, state.zoom);
  }, [state.cameraX, state.cameraY, state.zoom]);

  useEffect(() => {
    const app = editorAppRef.current;
    if (!app || !state.selectedObjectId) { app?.clearSelection(); return; }
    const obj = state.objects.find((o: Entity) => o.id === state.selectedObjectId);
    if (obj) { app.highlightObject(obj); return; }
    const bld = state.buildings.find((b) => b.id === state.selectedObjectId);
    if (bld) { app.highlightBuilding(bld); return; }
    app.clearSelection();
  }, [state.selectedObjectId, state.objects, state.buildings]);

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

    // Right click — deselect
    if (e.button === 2) {
      dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
      return;
    }

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
      let found = false;
      for (const b of s.buildings) {
        const bb = getSpriteBounds(b.x, b.y, b.baseSpriteKey, b.anchor, s.tileSize, b.scale ?? 1);
        if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
          dispatchRef.current({ type: 'SELECT_OBJECT', id: b.id });
          draggingBuildingRef.current = { id: b.id, dx: b.x - x, dy: b.y - y };
          found = true;
          break;
        }
      }
      if (!found) {
        const sorted = [...s.objects]
          .filter(o => !lockedLayers.has(o.layer ?? ''))
          .sort((a, b) => b.sortY - a.sortY);
        for (const obj of sorted) {
          const bb = getSpriteBounds(obj.x, obj.y, obj.spriteKey, obj.anchor, s.tileSize, obj.scale ?? 1);
          if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
            dispatchRef.current({ type: 'SELECT_OBJECT', id: obj.id });
            // Start dragging — record offset between cursor and entity anchor
            draggingObjectRef.current = { id: obj.id, dx: obj.x - x, dy: obj.y - y };
            found = true;
            break;
          }
        }
      }
      if (!found) dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
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
      const sorted = [...s.objects]
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
  }, [getWorldPos]);

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
    if (draggingObjectRef.current) {
      const drag = draggingObjectRef.current;
      const obj = s.objects.find(o => o.id === drag.id);
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
    const freeMode = e.shiftKey;
    if (app && s.activeTool === 'building' && s.selectedBuildingKey) {
      const bd = BUILDING_DEFAULTS[s.selectedBuildingKey];
      if (bd) {
        const snapX = col * s.tileSize + bd.baseWidth / 2;
        const snapY = (row + 1) * s.tileSize + bd.baseHeight - s.tileSize;
        app.showBuildingPreview(bd.baseSpriteKey, bd.roofSpriteKey, snapX, snapY, bd.anchor);
      }
    } else if (app && s.activeTool === 'object' && s.selectedObjectKey) {
      const defaults = OBJECT_DEFAULTS[s.selectedObjectKey];
      if (defaults) {
        const px = freeMode ? x : snapXForSprite(col, s.selectedObjectKey, s.tileSize);
        const py = freeMode ? y : (row + 1) * s.tileSize;
        app.showObjectPreview(s.selectedObjectKey, px, py, defaults.anchor, DEFAULT_OBJECT_SCALE);
      }
    } else {
      app?.clearPreview();
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

  const handlePointerUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
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

      if (e.ctrlKey) {
        // Ctrl+scroll or trackpad pinch = zoom. Multiplicative step feels
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
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        dispatchRef.current(e.shiftKey ? { type: 'REDO' } : { type: 'UNDO' });
      }
      if (e.key === 'Escape') {
        dispatchRef.current({ type: 'SET_TOOL', tool: 'select' });
        editorAppRef.current?.clearPreview();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = stateRef.current;
        if (s.selectedObjectId) {
          // Check if it's a building or object
          if (s.buildings.some((b: { id: string }) => b.id === s.selectedObjectId)) {
            dispatchRef.current({ type: 'DELETE_BUILDING', id: s.selectedObjectId });
          } else {
            dispatchRef.current({ type: 'DELETE_OBJECT', id: s.selectedObjectId });
          }
        }
      }
      if (e.key === 'g') dispatchRef.current({ type: 'TOGGLE_GRID' });
      if (e.code === 'Space') { e.preventDefault(); spaceDownRef.current = true; }
      if (e.key === 'Shift') shiftDownRef.current = true;

      // Undo / redo — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y)
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatchRef.current({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatchRef.current({ type: 'REDO' });
      }

      // Copy / paste
      if (mod && e.key.toLowerCase() === 'c') {
        const s = stateRef.current;
        if (s.selectedObjectId) {
          const selected = s.objects.find(o => o.id === s.selectedObjectId);
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
          onPointerLeave={handlePointerUp}
          onContextMenu={handleContextMenu}
        />
      </div>
    </div>
  );
}
