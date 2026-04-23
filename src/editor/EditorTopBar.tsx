'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { EditorAction, EditorState } from './editorState';
import { loadMap } from '../core/MapLoader';

const GAME_MAPS = ['pokemon', 'pokemon-house-1f', 'pokemon-house-2f', 'grocer-1f'];

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export default function EditorTopBar({ state, dispatch }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyMapData = useCallback((data: { id?: string; tiles: unknown; objects?: unknown[]; buildings?: unknown[]; width: number; height: number; tileSize?: number }, fallbackId: string) => {
    dispatch({
      type: 'IMPORT_MAP',
      tiles: data.tiles as never,
      objects: (data.objects as never[]) || [],
      buildings: (data.buildings as never[]) || [],
      width: data.width,
      height: data.height,
    });
    dispatch({ type: 'SET_MAP_NAME', name: data.id || fallbackId });
    if (data.tileSize) dispatch({ type: 'SET_TILE_SIZE', tileSize: data.tileSize });
  }, [dispatch]);

  const handleLoadGameMap = useCallback(async (mapId: string) => {
    if (!mapId) return;

    // 1) Prefer disk-persisted version
    try {
      const res = await fetch(`/api/maps/${encodeURIComponent(mapId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.tiles && data.width && data.height) {
          applyMapData(data, mapId);
          return;
        }
      }
    } catch { /* fall through */ }

    // 2) Fall back to compiled map
    const map = loadMap(mapId);
    applyMapData(map, mapId);
  }, [applyMapData]);

  const handleExport = useCallback(() => {
    const mapData = {
      id: state.mapName,
      width: state.mapWidth,
      height: state.mapHeight,
      tileSize: state.tileSize,
      tiles: state.tiles,
      objects: state.objects,
      buildings: state.buildings,
      npcs: [],
      triggers: [],
      spawnPoints: [{ id: 'default', x: state.mapWidth * state.tileSize / 2, y: state.mapHeight * state.tileSize / 2, facing: 'down' }],
    };
    const blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.mapName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.tiles && data.width && data.height) {
          dispatch({
            type: 'IMPORT_MAP',
            tiles: data.tiles,
            objects: data.objects || [],
            buildings: data.buildings || [],
            width: data.width,
            height: data.height,
          });
          if (data.id) dispatch({ type: 'SET_MAP_NAME', name: data.id });
          if (data.tileSize) dispatch({ type: 'SET_TILE_SIZE', tileSize: data.tileSize });
        }
      } catch {
        alert('Invalid map JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [dispatch]);

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px', border: '1px solid #444', borderRadius: 4,
    background: '#2a2a3a', color: '#ddd', cursor: 'pointer', fontSize: 11,
  };

  const inputStyle: React.CSSProperties = {
    padding: '2px 6px', background: '#2a2a3a', border: '1px solid #444',
    borderRadius: 3, color: '#ddd', fontSize: 11,
  };

  return (
    <div style={{
      height: 40, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
      background: '#1a1a2e', borderBottom: '1px solid #333', color: '#ccc', fontSize: 12,
      flexWrap: 'nowrap', overflow: 'hidden',
    }}>
      <a href="/" style={{ color: '#6688cc', textDecoration: 'none', fontSize: 11 }}>Back</a>

      <span style={{ color: '#555' }}>|</span>

      {/* Map selector */}
      <select
        value={state.mapName}
        onChange={e => handleLoadGameMap(e.target.value)}
        style={{ ...inputStyle, width: 150 }}
      >
        {GAME_MAPS.map(id => <option key={id} value={id}>{id}</option>)}
      </select>

      <span style={{ color: '#555' }}>|</span>

      {/* Dimensions */}
      <DimensionInput
        value={state.mapWidth}
        onApply={v => dispatch({ type: 'RESIZE_MAP', width: v, height: state.mapHeight })}
        style={{ ...inputStyle, width: 52, textAlign: 'center' }}
      />
      <span style={{ color: '#777', fontSize: 10 }}>x</span>
      <DimensionInput
        value={state.mapHeight}
        onApply={v => dispatch({ type: 'RESIZE_MAP', width: state.mapWidth, height: v })}
        style={{ ...inputStyle, width: 52, textAlign: 'center' }}
      />

      <span style={{ color: '#555' }}>|</span>

      <button style={btnStyle} onClick={() => dispatch({ type: 'UNDO' })} disabled={state.undoStack.length === 0}>Undo</button>
      <button style={btnStyle} onClick={() => dispatch({ type: 'REDO' })} disabled={state.redoStack.length === 0}>Redo</button>

      <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11 }}>
        <input type="checkbox" checked={state.showGrid} onChange={() => dispatch({ type: 'TOGGLE_GRID' })} />
        Grid
      </label>

      <div style={{ flex: 1 }} />

      <button style={btnStyle} onClick={() => fileInputRef.current?.click()}>Import</button>
      <button style={{ ...btnStyle, background: '#2a3a4a', borderColor: '#4a6a8a' }} onClick={handleExport}>Export</button>

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
    </div>
  );
}

function DimensionInput({ value, onApply, style }: { value: number; onApply: (v: number) => void; style: React.CSSProperties }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const apply = () => {
    const v = Math.max(10, Math.min(200, parseInt(draft) || value));
    if (v !== value) onApply(v);
    setDraft(String(v));
  };

  return (
    <input
      type="number"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={e => { if (e.key === 'Enter') apply(); }}
      style={style}
    />
  );
}
