'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { TileType, Entity } from '../core/types';
import { EditorAction, EditorState, createInitialState } from './editorState';
import { getSavedMapNames, loadSavedMap, saveMap, deleteSavedMap, setActiveMapName } from './mapStorage';

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export default function EditorTopBar({ state, dispatch }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedMaps, setSavedMaps] = useState<string[]>([]);

  useEffect(() => {
    setSavedMaps(getSavedMapNames());
  }, []);

  const refreshMapList = () => setSavedMaps(getSavedMapNames());

  const handleSave = useCallback(() => {
    if (!state.mapName.trim()) return;
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
    refreshMapList();
  }, [state]);

  const handleLoadMap = useCallback((name: string) => {
    const saved = loadSavedMap(name);
    if (!saved) return;
    dispatch({
      type: 'IMPORT_MAP',
      tiles: saved.tiles,
      objects: saved.objects,
      buildings: saved.buildings,
      width: saved.mapWidth,
      height: saved.mapHeight,
    });
    dispatch({ type: 'SET_MAP_NAME', name: saved.mapName });
    setActiveMapName(name);
  }, [dispatch]);

  const handleNewMap = useCallback(() => {
    if (!confirm('Create a new map? Unsaved changes will be lost.')) return;
    const fresh = createInitialState(50, 50);
    dispatch({
      type: 'IMPORT_MAP',
      tiles: fresh.tiles,
      objects: [],
      buildings: [],
      width: fresh.mapWidth,
      height: fresh.mapHeight,
    });
    dispatch({ type: 'SET_MAP_NAME', name: 'untitled-' + Date.now().toString(36).slice(-4) });
  }, [dispatch]);

  const handleDeleteMap = useCallback(() => {
    if (!state.mapName.trim()) return;
    if (!confirm(`Delete saved map "${state.mapName}"?`)) return;
    deleteSavedMap(state.mapName);
    refreshMapList();
  }, [state.mapName]);

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
            buildings: data.buildings || [],
            width: data.width,
            height: data.height,
          });
          if (data.id) dispatch({ type: 'SET_MAP_NAME', name: data.id });
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

      {/* Map selector dropdown */}
      <select
        value={state.mapName}
        onChange={e => handleLoadMap(e.target.value)}
        style={{ ...inputStyle, width: 110 }}
      >
        <option value={state.mapName}>{state.mapName}</option>
        {savedMaps.filter(n => n !== state.mapName).map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      {/* Map name edit */}
      <input
        value={state.mapName}
        onChange={e => dispatch({ type: 'SET_MAP_NAME', name: e.target.value })}
        style={{ ...inputStyle, width: 100 }}
        placeholder="map name"
      />

      <button style={{ ...btnStyle, background: '#2a4a3a', borderColor: '#4a8a5a' }} onClick={handleSave}>Save</button>
      <button style={btnStyle} onClick={handleNewMap}>New</button>

      <span style={{ color: '#555' }}>|</span>

      {/* Dimensions — apply on Enter or blur */}
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

      <select
        value={state.tileSize}
        onChange={e => dispatch({ type: 'SET_TILE_SIZE', tileSize: parseInt(e.target.value) })}
        style={{ ...inputStyle, width: 58 }}
        title="Tile size (px)"
      >
        <option value={16}>16 px</option>
        <option value={32}>32 px</option>
      </select>

      <div style={{ flex: 1 }} />

      {savedMaps.includes(state.mapName) && (
        <button style={{ ...btnStyle, color: '#c44', borderColor: '#844' }} onClick={handleDeleteMap}>Del</button>
      )}
      <button style={btnStyle} onClick={handleImport}>Import</button>
      <button style={{ ...btnStyle, background: '#2a3a4a', borderColor: '#4a6a8a' }} onClick={handleExport}>Export</button>
      <button
        style={{ ...btnStyle, background: '#4a3a6a', borderColor: '#6a5a9a' }}
        onClick={() => {
          const mapData = buildPlaytestMapData(state);
          localStorage.setItem('playtest-map', JSON.stringify(mapData));
          window.open('/?map=custom', '_blank');
        }}
      >Play Test</button>
      <button
        style={{ ...btnStyle, background: '#3a4a2a', borderColor: '#6a8a4a' }}
        title="Make this map load when visiting / (the home page)"
        onClick={() => {
          const mapData = buildPlaytestMapData(state);
          localStorage.setItem('playtest-map', JSON.stringify(mapData));
          localStorage.setItem('use-custom-as-default', '1');
          alert('This map will now load when visiting the home page. Use "Clear Default" to revert.');
        }}
      >Set as Default</button>
      {typeof window !== 'undefined' && localStorage.getItem('use-custom-as-default') && (
        <button
          style={{ ...btnStyle, color: '#c44', borderColor: '#844' }}
          onClick={() => {
            localStorage.removeItem('use-custom-as-default');
            alert('Reverted — the home page will now load the built-in outdoor map.');
          }}
        >Clear Default</button>
      )}

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
    </div>
  );
}

/** Build the MapData JSON used by both Play Test and Set-as-Default. */
function buildPlaytestMapData(state: EditorState) {
  return {
    id: 'custom',
    width: state.mapWidth,
    height: state.mapHeight,
    tileSize: state.tileSize,
    tiles: state.tiles,
    objects: state.objects,
    buildings: state.buildings,
    npcs: [],
    triggers: [],
    spawnPoints: [{ id: 'default', x: Math.floor(state.mapWidth / 2) * state.tileSize, y: Math.floor(state.mapHeight / 2) * state.tileSize, facing: 'down' }],
  };
}

/** Number input that only applies on Enter or blur — no live resize while typing. */
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
