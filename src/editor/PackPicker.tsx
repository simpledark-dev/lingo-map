'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { EditorAction } from './editorState';
import { loadPackSingle } from '../renderer/AssetLoader';

interface Props {
  /** Current selected tile string in editor state — used to highlight which
   * single is active when the user has picked one as a tile. */
  selectedTileType: string;
  /** Current selected object key — used to highlight pack-object selections. */
  selectedObjectKey: string | null;
  dispatch: React.Dispatch<EditorAction>;
}

interface ThumbDims { w: number; h: number }
type PickMode = 'tile' | 'object';

export default function PackPicker({ selectedTileType, selectedObjectKey, dispatch }: Props) {
  const [themes, setThemes] = useState<string[]>([]);
  const [theme, setTheme] = useState<string | null>(null);
  // Tag the file list with the theme it came from so the render can ignore
  // stale lists when the user switches themes mid-fetch.
  const [filesFor, setFilesFor] = useState<{ theme: string; files: string[] } | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  // Default to Object — most pack content is entities (props, vehicles, etc.).
  // Switch to Tile for ground/terrain/wall sprites that should replace the
  // tile beneath them.
  const [mode, setMode] = useState<PickMode>('object');
  const dimsRef = useRef<Map<string, ThumbDims>>(new Map());

  // Fetch the list of theme folders once.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/themes')
      .then(r => r.json())
      .then((data: { themes?: string[] }) => {
        if (cancelled) return;
        const list = data.themes ?? [];
        setThemes(list);
        if (list.length > 0) setTheme(list[0]);
      })
      .catch(err => console.warn('Failed to load themes:', err));
    return () => { cancelled = true; };
  }, []);

  // Fetch the file list for the selected theme.
  useEffect(() => {
    if (!theme) return;
    let cancelled = false;
    setLoadingFiles(true);
    fetch(`/api/me/themes/${encodeURIComponent(theme)}`)
      .then(r => r.json())
      .then((data: { files?: string[] }) => {
        if (cancelled) return;
        setFilesFor({ theme, files: data.files ?? [] });
        setLoadingFiles(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('Failed to load files:', err);
        setLoadingFiles(false);
      });
    return () => { cancelled = true; };
  }, [theme]);

  // Only render files whose owning theme matches the currently-selected theme.
  // Otherwise we'd briefly request stale URLs combining new theme path + old
  // filenames (→ 404s) until the new fetch resolves.
  const files = filesFor && filesFor.theme === theme ? filesFor.files : null;

  // Local memory of the most recently picked pack key — used so toggling
  // Tile/Object after a pick re-applies the same asset in the new mode
  // (otherwise the user would have to click the thumbnail twice).
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const dispatchPick = useCallback((key: string, m: PickMode) => {
    if (m === 'tile') dispatch({ type: 'SET_SELECTED_TILE', tileType: key });
    else dispatch({ type: 'SET_SELECTED_OBJECT', spriteKey: key });
  }, [dispatch]);

  const handlePick = useCallback((file: string) => {
    if (!theme) return;
    const key = `me:${theme}/${file}`;
    // Pre-load into PixiJS so painting / placing works on the next frame.
    void loadPackSingle(key);
    setPickedKey(key);
    dispatchPick(key, mode);
  }, [theme, mode, dispatchPick]);

  /** Toggling mode after a pick should re-dispatch the same key in the new
   * mode — otherwise paintings keep coming out as the previous mode until the
   * user clicks the thumbnail again. */
  const handleModeChange = useCallback((newMode: PickMode) => {
    setMode(newMode);
    if (pickedKey) dispatchPick(pickedKey, newMode);
  }, [pickedKey, dispatchPick]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', minHeight: 0 }}>
      {/* Theme picker — single-select dropdown is more compact than 24 tabs. */}
      <select
        value={theme ?? ''}
        onChange={(e) => setTheme(e.target.value)}
        style={{
          padding: '6px 8px',
          fontSize: 11,
          background: '#2a2a3a',
          color: '#ddd',
          border: '1px solid #444',
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        {themes.map(t => (
          <option key={t} value={t} style={{ color: 'black' }}>
            {prettyName(t)}
          </option>
        ))}
      </select>

      {/* Mode toggle — explicit choice between tile (replaces ground) and
          object (placed on entity layer). Toggling after a pick automatically
          re-applies the same asset in the new mode. */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <ModeBtn active={mode === 'tile'}   onClick={() => handleModeChange('tile')}   label="Tile" />
        <ModeBtn active={mode === 'object'} onClick={() => handleModeChange('object')} label="Object" />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#0f0f1a', padding: 4 }}>
        {loadingFiles && <div style={{ color: '#888', fontSize: 11 }}>Loading…</div>}
        {!loadingFiles && files && files.length === 0 && (
          <div style={{ color: '#888', fontSize: 11 }}>No files in this theme.</div>
        )}
        {!loadingFiles && files && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 4 }}>
            {files.map(f => {
              const key = theme ? `me:${theme}/${f}` : '';
              // Highlight only the asset that matches the CURRENT mode's
              // selection — otherwise a previous pick lingers as a second
              // highlight when the user toggles between Tile and Object.
              const externallySelected = mode === 'tile' ? selectedTileType : selectedObjectKey;
              const active = externallySelected === key;
              return (
                <button
                  key={f}
                  title={f}
                  onClick={() => handlePick(f)}
                  style={{
                    padding: 0,
                    background: active ? '#2a3a5a' : '#1a1a2e',
                    border: active ? '2px solid #4488ff' : '1px solid #333',
                    borderRadius: 4,
                    cursor: 'pointer',
                    aspectRatio: '1 / 1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={`/assets/me/${theme}/${f}.png`}
                    alt={f}
                    loading="lazy"
                    style={{
                      // Fill the button so 16×16 sources scale up to be visible.
                      // `objectFit: contain` keeps aspect for non-square singles
                      // (e.g. 256×240 buildings).
                      width: '100%',
                      height: '100%',
                      imageRendering: 'pixelated',
                      objectFit: 'contain',
                    }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      dimsRef.current.set(f, { w: img.naturalWidth, h: img.naturalHeight });
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '4px 0',
        fontSize: 11,
        background: active ? '#2a3a5a' : '#2a2a3a',
        border: active ? '2px solid #4488ff' : '1px solid #444',
        borderRadius: 4,
        color: '#ddd',
        cursor: 'pointer',
        fontWeight: active ? 'bold' : 'normal',
      }}
    >
      {label}
    </button>
  );
}

function prettyName(folder: string): string {
  // "1_Terrains_and_Fences_Singles_16x16" → "1. Terrains and Fences"
  const stripped = folder.replace(/_Singles_16x16$/, '');
  const m = /^(\d+)_(.+)$/.exec(stripped);
  if (!m) return stripped.replace(/_/g, ' ');
  return `${m[1]}. ${m[2].replace(/_/g, ' ')}`;
}
