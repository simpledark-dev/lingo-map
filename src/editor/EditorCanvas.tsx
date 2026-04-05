'use client';

import { useRef, useEffect, useReducer, useCallback } from 'react';
import { TileType, Entity } from '../core/types';
import { EditorApp } from './EditorApp';
import { editorReducer, createInitialState, EditorAction, generateObjectId } from './editorState';
import { OBJECT_DEFAULTS, BUILDING_DEFAULTS } from './objectDefaults';
import EditorToolPanel from './EditorToolPanel';
import EditorTopBar from './EditorTopBar';

export default function EditorCanvas() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const editorAppRef = useRef<EditorApp | null>(null);
  const [state, dispatch] = useReducer(editorReducer, null, () => {
    if (typeof window !== 'undefined') {
      try {
        // Try loading last active map
        const { getActiveMapName, loadSavedMap } = require('./mapStorage');
        const activeName = getActiveMapName();
        if (activeName) {
          const saved = loadSavedMap(activeName);
          if (saved) {
            const base = createInitialState(saved.mapWidth, saved.mapHeight);
            return { ...base, tiles: saved.tiles, objects: saved.objects, buildings: saved.buildings, mapWidth: saved.mapWidth, mapHeight: saved.mapHeight, mapName: saved.mapName };
          }
        }
        // Fallback: try old autosave format
        const autosave = localStorage.getItem('editor-autosave');
        if (autosave) {
          const data = JSON.parse(autosave);
          if (data.tiles && data.mapWidth && data.mapHeight) {
            const base = createInitialState(data.mapWidth, data.mapHeight);
            return { ...base, tiles: data.tiles, objects: data.objects || [], buildings: data.buildings || [], mapWidth: data.mapWidth, mapHeight: data.mapHeight, mapName: data.mapName || 'custom-map' };
          }
        }
      } catch { /* ignore */ }
    }
    return createInitialState(50, 50);
  });

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

  // ── Auto-save current map ──
  useEffect(() => {
    if (!state.mapName.trim()) return;
    try {
      const { saveMap, setActiveMapName } = require('./mapStorage');
      saveMap({
        mapName: state.mapName,
        tiles: state.tiles,
        objects: state.objects,
        buildings: state.buildings,
        mapWidth: state.mapWidth,
        mapHeight: state.mapHeight,
        savedAt: '',
      });
      setActiveMapName(state.mapName);
    } catch { /* storage full */ }
  }, [state.tiles, state.objects, state.buildings, state.mapWidth, state.mapHeight, state.mapName]);

  // ── Initialize PixiJS ──
  useEffect(() => {
    if (!canvasContainerRef.current || editorAppRef.current) return;

    const app = new EditorApp();
    editorAppRef.current = app;

    app.init(canvasContainerRef.current).then(() => {
      app.renderTiles(stateRef.current.tiles, stateRef.current.mapWidth, stateRef.current.mapHeight, stateRef.current.tileSize);
      app.renderObjects(stateRef.current.objects);
      app.renderBuildings(stateRef.current.buildings);
      app.setGridVisible(stateRef.current.showGrid);
      app.updateCamera(stateRef.current.cameraX, stateRef.current.cameraY, stateRef.current.zoom);
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
  }, [state.tiles, state.objects, state.buildings, state.mapWidth, state.mapHeight]);

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
      const snapX = col * s.tileSize + s.tileSize / 2;
      const snapY = (row + 1) * s.tileSize;
      const entity = {
        id: generateObjectId(),
        x: snapX, y: snapY,
        spriteKey: s.selectedObjectKey,
        anchor: defaults.anchor,
        sortY: snapY,
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
      // Hit test buildings first (larger), then objects
      let found = false;
      for (const b of s.buildings) {
        const dx = x - b.x;
        const dy = y - b.y;
        if (Math.abs(dx) < 96 && Math.abs(dy) < 96) {
          dispatchRef.current({ type: 'SELECT_OBJECT', id: b.id });
          found = true;
          break;
        }
      }
      if (!found) {
        const sorted = [...s.objects].sort((a, b) => b.sortY - a.sortY);
        for (const obj of sorted) {
          const dx = x - obj.x;
          const dy = y - obj.y;
          if (Math.abs(dx) < 32 && Math.abs(dy) < 48) {
            dispatchRef.current({ type: 'SELECT_OBJECT', id: obj.id });
            found = true;
            break;
          }
        }
      }
      if (!found) dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
    } else if (s.activeTool === 'eraser') {
      // Try erasing a building first
      for (const b of s.buildings) {
        const dx = x - b.x;
        const dy = y - b.y;
        if (Math.abs(dx) < 96 && Math.abs(dy) < 96) {
          dispatchRef.current({ type: 'DELETE_BUILDING', id: b.id });
          return;
        }
      }
      // Then try objects
      const sorted = [...s.objects].sort((a, b) => b.sortY - a.sortY);
      for (const obj of sorted) {
        const dx = x - obj.x;
        const dy = y - obj.y;
        if (Math.abs(dx) < 32 && Math.abs(dy) < 48) {
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
        const snapX = col * s.tileSize + s.tileSize / 2;
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
        const tileType = s.activeTool === 'eraser' ? TileType.GRASS : s.selectedTileType;
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
      const tileType = s.activeTool === 'eraser' ? TileType.GRASS : s.selectedTileType;
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
