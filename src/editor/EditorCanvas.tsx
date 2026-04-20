'use client';

import { useRef, useEffect, useReducer, useCallback } from 'react';
import { TileType, Entity } from '../core/types';
import { EditorApp } from './EditorApp';
import { editorReducer, createInitialState, EditorAction, generateObjectId } from './editorState';
import { OBJECT_DEFAULTS, BUILDING_DEFAULTS } from './objectDefaults';
import { loadMap } from '../core/MapLoader';
import { getTexture } from '../renderer/AssetLoader';
import EditorToolPanel from './EditorToolPanel';
import EditorTopBar from './EditorTopBar';

const ACTIVE_MAP_KEY = 'editor-active-map';

/**
 * World-space AABB that a sprite covers, given its anchor and feet position.
 * Uses the loaded texture size. Falls back to a 1-tile square if the texture
 * isn't loaded yet (shouldn't happen after initial render, but safe default).
 */
function getSpriteBounds(
  x: number, y: number, spriteKey: string, anchor: { x: number; y: number }, tileSize: number,
): { left: number; top: number; right: number; bottom: number } {
  const tex = getTexture(spriteKey);
  const w = tex?.width ?? tileSize;
  const h = tex?.height ?? tileSize;
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
        dispatch({ type: 'IMPORT_MAP', tiles: data.tiles, objects: data.objects || [], buildings: data.buildings || [], width: data.width, height: data.height });
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
  }, [state.tiles, state.objects, state.buildings, state.mapWidth, state.mapHeight, state.mapName, state.tileSize]);

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

    app.init(canvasContainerRef.current).then(() => {
      const s = stateRef.current;
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
    app.renderTiles(state.tiles, state.mapWidth, state.mapHeight, state.tileSize);
    app.renderObjects(state.objects);
    app.renderBuildings(state.buildings);
  }, [state.tiles, state.objects, state.buildings, state.mapWidth, state.mapHeight, state.tileSize]);

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
    if (obj) app.highlightObject(obj);
    else app.clearSelection();
  }, [state.selectedObjectId, state.objects]);

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

    if (s.activeTool === 'tile') {
      isPaintingRef.current = true;
      paintedCellsRef.current = new Set();
      const key = `${row},${col}`;
      paintedCellsRef.current.add(key);
      editorAppRef.current?.updateSingleTile(row, col, s.selectedTileType);
      // We'll batch dispatch on pointer up
    } else if (s.activeTool === 'object' && s.selectedObjectKey) {
      const defaults = OBJECT_DEFAULTS[s.selectedObjectKey] ?? { anchor: { x: 0.5, y: 1.0 }, collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 } };
      const snapX = snapXForSprite(col, s.selectedObjectKey, s.tileSize);
      const snapY = (row + 1) * s.tileSize;
      // Decor objects (rugs, doormats, wall-mounted items) render BEHIND the
      // player so we can walk over/in front of them. Big negative offset.
      const sortY = defaults.isDecor ? snapY - 1000 : snapY;
      const entity = {
        id: generateObjectId(),
        x: snapX, y: snapY,
        spriteKey: s.selectedObjectKey,
        anchor: defaults.anchor,
        sortY,
        collisionBox: defaults.collisionBox,
      };
      dispatchRef.current({ type: 'PLACE_OBJECT', entity });
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
          targetMapId: bd.targetMapId,
          targetSpawnId: 'entrance',
        };
        dispatchRef.current({ type: 'PLACE_BUILDING', building });
      }
    } else if (s.activeTool === 'select') {
      // Hit test buildings first (larger), then objects — use sprite bounds
      let found = false;
      for (const b of s.buildings) {
        const bb = getSpriteBounds(b.x, b.y, b.baseSpriteKey, b.anchor, s.tileSize);
        if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
          dispatchRef.current({ type: 'SELECT_OBJECT', id: b.id });
          found = true;
          break;
        }
      }
      if (!found) {
        const sorted = [...s.objects].sort((a, b) => b.sortY - a.sortY);
        for (const obj of sorted) {
          const bb = getSpriteBounds(obj.x, obj.y, obj.spriteKey, obj.anchor, s.tileSize);
          if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
            dispatchRef.current({ type: 'SELECT_OBJECT', id: obj.id });
            found = true;
            break;
          }
        }
      }
      if (!found) dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
    } else if (s.activeTool === 'eraser') {
      // Try erasing a building first — sprite-sized hit box
      for (const b of s.buildings) {
        const bb = getSpriteBounds(b.x, b.y, b.baseSpriteKey, b.anchor, s.tileSize);
        if (x >= bb.left && x < bb.right && y >= bb.top && y < bb.bottom) {
          dispatchRef.current({ type: 'DELETE_BUILDING', id: b.id });
          return;
        }
      }
      // Then objects
      const sorted = [...s.objects].sort((a, b) => b.sortY - a.sortY);
      for (const obj of sorted) {
        const bb = getSpriteBounds(obj.x, obj.y, obj.spriteKey, obj.anchor, s.tileSize);
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

    const { row, col } = getWorldPos(e);
    const app = editorAppRef.current;
    app?.highlightCell(row, col);

    // Show placement preview
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
        const snapX = snapXForSprite(col, s.selectedObjectKey, s.tileSize);
        const snapY = (row + 1) * s.tileSize;
        app.showObjectPreview(s.selectedObjectKey, snapX, snapY, defaults.anchor);
      }
    } else {
      app?.clearPreview();
    }

    if (isPaintingRef.current) {
      const key = `${row},${col}`;
      if (!paintedCellsRef.current.has(key)) {
        paintedCellsRef.current.add(key);
        const tileType = s.activeTool === 'eraser' ? TileType.VOID : s.selectedTileType;
        editorAppRef.current?.updateSingleTile(row, col, tileType);
      }
    }
  }, [getWorldPos]);

  const handlePointerUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (isPaintingRef.current && paintedCellsRef.current.size > 0) {
      const s = stateRef.current;
      const cells = Array.from(paintedCellsRef.current).map(k => {
        const [r, c] = k.split(',').map(Number);
        return { row: r, col: c };
      });
      const tileType = s.activeTool === 'eraser' ? TileType.VOID : s.selectedTileType;
      dispatchRef.current({ type: 'PAINT_TILES', cells, tileType });
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
        // Ctrl+scroll or trackpad pinch = zoom
        const oldZoom = s.zoom;
        const step = 0.05;
        const delta = e.deltaY > 0 ? -step : step;
        const newZoom = Math.max(0.25, Math.min(3, oldZoom + delta));
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

      // Undo / redo — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y)
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatchRef.current({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatchRef.current({ type: 'REDO' });
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDownRef.current = false;
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
