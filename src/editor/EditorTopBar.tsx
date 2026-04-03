'use client';

import { useCallback, useRef } from 'react';
import { TileType, Entity } from '../core/types';
import { EditorAction, EditorState } from './editorState';

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export default function EditorTopBar({ state, dispatch }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const mapData = {
      id: state.mapName,
      width: state.mapWidth,
      height: state.mapHeight,
      tileSize: state.tileSize,
      tiles: state.tiles,
      objects: state.objects,
      buildings: [],
      npcs: [],
      triggers: [],
      spawnPoints: [{ id: 'default', x: state.mapWidth * 16, y: state.mapHeight * 16, facing: 'down' }],
    };
    const blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.mapName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
            width: data.width,
            height: data.height,
          });
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

  return (
    <div style={{
      height: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
      background: '#1a1a2e', borderBottom: '1px solid #333', color: '#ccc', fontSize: 12,
    }}>
      <a href="/" style={{ color: '#6688cc', textDecoration: 'none', marginRight: 8 }}>Back</a>

      <input
        value={state.mapName}
        onChange={e => dispatch({ type: 'SET_MAP_NAME', name: e.target.value })}
        style={{ width: 120, padding: '2px 6px', background: '#2a2a3a', border: '1px solid #444', borderRadius: 3, color: '#ddd', fontSize: 11 }}
      />

      <span style={{ color: '#777' }}>|</span>

      <input
        type="number"
        value={state.mapWidth}
        onChange={e => {
          const v = Math.max(10, Math.min(200, parseInt(e.target.value) || 50));
          dispatch({ type: 'RESIZE_MAP', width: v, height: state.mapHeight });
        }}
        style={{ width: 44, padding: '2px 4px', background: '#2a2a3a', border: '1px solid #444', borderRadius: 3, color: '#ddd', fontSize: 11, textAlign: 'center' }}
      />
      <span style={{ color: '#777' }}>x</span>
      <input
        type="number"
        value={state.mapHeight}
        onChange={e => {
          const v = Math.max(10, Math.min(200, parseInt(e.target.value) || 50));
          dispatch({ type: 'RESIZE_MAP', width: state.mapWidth, height: v });
        }}
        style={{ width: 44, padding: '2px 4px', background: '#2a2a3a', border: '1px solid #444', borderRadius: 3, color: '#ddd', fontSize: 11, textAlign: 'center' }}
      />

      <span style={{ color: '#777' }}>|</span>

      <button style={btnStyle} onClick={() => dispatch({ type: 'UNDO' })} disabled={state.undoStack.length === 0}>Undo</button>
      <button style={btnStyle} onClick={() => dispatch({ type: 'REDO' })} disabled={state.redoStack.length === 0}>Redo</button>

      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input type="checkbox" checked={state.showGrid} onChange={() => dispatch({ type: 'TOGGLE_GRID' })} />
        Grid
      </label>

      <div style={{ flex: 1 }} />

      <button style={btnStyle} onClick={handleImport}>Import</button>
      <button style={{ ...btnStyle, background: '#2a4a3a', borderColor: '#4a8a5a' }} onClick={handleExport}>Export</button>

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
    </div>
  );
}
