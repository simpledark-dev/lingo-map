'use client';

import { useRef, useEffect, useReducer, useCallback } from 'react';
import { TileType } from '../core/types';
import { EditorApp } from './EditorApp';
import { editorReducer, createInitialState, EditorAction, generateObjectId } from './editorState';
import { OBJECT_DEFAULTS } from './objectDefaults';
import EditorToolPanel from './EditorToolPanel';
import EditorTopBar from './EditorTopBar';

export default function EditorCanvas() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const editorAppRef = useRef<EditorApp | null>(null);
  const [state, dispatch] = useReducer(editorReducer, null, () => createInitialState(50, 50));

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

  // ── Initialize PixiJS ──
  useEffect(() => {
    if (!canvasContainerRef.current || editorAppRef.current) return;

    const app = new EditorApp();
    editorAppRef.current = app;

    app.init(canvasContainerRef.current).then(() => {
      app.renderTiles(stateRef.current.tiles, stateRef.current.mapWidth, stateRef.current.mapHeight, stateRef.current.tileSize);
      app.renderObjects(stateRef.current.objects);
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
  }, [state.tiles, state.objects, state.mapWidth, state.mapHeight]);

  useEffect(() => {
    editorAppRef.current?.setGridVisible(state.showGrid);
  }, [state.showGrid]);

  useEffect(() => {
    editorAppRef.current?.updateCamera(state.cameraX, state.cameraY, state.zoom);
  }, [state.cameraX, state.cameraY, state.zoom]);

  useEffect(() => {
    const app = editorAppRef.current;
    if (!app || !state.selectedObjectId) { app?.clearSelection(); return; }
    const obj = state.objects.find(o => o.id === state.selectedObjectId);
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

    // Middle mouse or space — pan
    if (e.button === 1) {
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
      // Snap to tile center
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
    } else if (s.activeTool === 'select') {
      // Hit test objects (check from top — highest sortY first)
      const sorted = [...s.objects].sort((a, b) => b.sortY - a.sortY);
      let found = false;
      for (const obj of sorted) {
        const tex = editorAppRef.current?.getCanvas() ? true : false; // simplified
        const dx = x - obj.x;
        const dy = y - obj.y;
        if (Math.abs(dx) < 32 && Math.abs(dy) < 48) {
          dispatchRef.current({ type: 'SELECT_OBJECT', id: obj.id });
          found = true;
          break;
        }
      }
      if (!found) dispatchRef.current({ type: 'SELECT_OBJECT', id: null });
    } else if (s.activeTool === 'eraser') {
      // Try erasing an object first
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
    editorAppRef.current?.highlightCell(row, col);

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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const s = stateRef.current;
    const app = editorAppRef.current;
    if (!app) return;

    const oldZoom = s.zoom;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.25, Math.min(3, oldZoom + delta));
    if (newZoom === oldZoom) return;

    // Get world position under the mouse cursor
    const world = app.screenToWorld(e.clientX, e.clientY, s.cameraX, s.cameraY, oldZoom);

    // Adjust camera so the world point under the cursor stays in the same screen position
    const canvas = app.getCanvas();
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
      const newCamX = world.x - screenX / newZoom;
      const newCamY = world.y - screenY / newZoom;
      dispatchRef.current({ type: 'SET_CAMERA', x: newCamX, y: newCamY });
    }

    dispatchRef.current({ type: 'SET_ZOOM', zoom: newZoom });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        dispatchRef.current(e.shiftKey ? { type: 'REDO' } : { type: 'UNDO' });
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = stateRef.current;
        if (s.selectedObjectId) {
          dispatchRef.current({ type: 'DELETE_OBJECT', id: s.selectedObjectId });
        }
      }
      if (e.key === 'g') dispatchRef.current({ type: 'TOGGLE_GRID' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
        />
      </div>
    </div>
  );
}
