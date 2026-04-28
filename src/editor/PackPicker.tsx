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
  /** Kind of the user's currently-active layer — `'tile'` means a thumbnail
   * pick dispatches as a tile (paintable into the active tile grid), `'object'`
   * means it dispatches as an object (placed at click position on the layer). */
  activeLayerKind: 'tile' | 'object';
  dispatch: React.Dispatch<EditorAction>;
}

interface ThumbDims { w: number; h: number }

/** localStorage key for the last-selected pack theme. Persisting it
 * means reloading the editor returns the user to whichever theme they
 * were working in (e.g. "5_City_Props_Singles_16x16") rather than always
 * snapping back to the first registered theme. */
const PACK_THEME_KEY = 'editor:pack-theme';

export default function PackPicker({ selectedTileType, selectedObjectKey, activeLayerKind, dispatch }: Props) {
  const [themes, setThemes] = useState<string[]>([]);
  const [theme, setTheme] = useState<string | null>(null);
  // Tag the file list with the theme it came from so the render can ignore
  // stale lists when the user switches themes mid-fetch.
  const [filesFor, setFilesFor] = useState<{ theme: string; files: string[] } | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const dimsRef = useRef<Map<string, ThumbDims>>(new Map());

  // Fetch the list of theme folders once. Restore the user's last-selected
  // theme from localStorage if it's still in the list (handles the case
  // where the pack folder layout changed since their last session).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/themes')
      .then(r => r.json())
      .then((data: { themes?: string[] }) => {
        if (cancelled) return;
        const list = data.themes ?? [];
        setThemes(list);
        if (list.length === 0) return;
        const saved = typeof window !== 'undefined' ? localStorage.getItem(PACK_THEME_KEY) : null;
        setTheme(saved && list.includes(saved) ? saved : list[0]);
      })
      .catch(err => console.warn('Failed to load themes:', err));
    return () => { cancelled = true; };
  }, []);

  // Persist theme selection so the next page load restores it.
  useEffect(() => {
    if (!theme) return;
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(PACK_THEME_KEY, theme); } catch { /* quota / disabled */ }
  }, [theme]);

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

  // Local memory of the most recently picked pack key — used so switching
  // the active layer's KIND (tile vs object) after a pick re-applies the same
  // asset in the new kind, otherwise paintings would keep coming out as the
  // previous kind until the user clicks the thumbnail again.
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const dispatchPick = useCallback((key: string, kind: 'tile' | 'object') => {
    if (kind === 'tile') dispatch({ type: 'SET_SELECTED_TILE', tileType: key });
    else dispatch({ type: 'SET_SELECTED_OBJECT', spriteKey: key });
  }, [dispatch]);

  const handlePick = useCallback((file: string) => {
    if (!theme) return;
    const key = `me:${theme}/${file}`;
    // Pre-load into PixiJS so painting / placing works on the next frame.
    void loadPackSingle(key);
    setPickedKey(key);
    dispatchPick(key, activeLayerKind);
  }, [theme, activeLayerKind, dispatchPick]);

  // Re-dispatch the previously-picked key when the user activates a layer of
  // a different kind. Without this the editor would still be in the prior
  // mode (e.g. user picks sidewalk on a tile layer → SET_SELECTED_TILE; user
  // switches to Props → next click would still try to paint a tile). Skipped
  // when there's nothing to re-emit.
  useEffect(() => {
    if (pickedKey) dispatchPick(pickedKey, activeLayerKind);
    // Intentionally only depending on activeLayerKind: we want this to fire
    // when the kind changes, not on every pickedKey change (handlePick already
    // dispatches there).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayerKind]);

  // Substring filter applied to the file list. Case-insensitive match
  // against the file basename (e.g. typing "cone" matches every
  // `..._Cone_*` file). Empty string = no filter, show everything.
  const [search, setSearch] = useState('');
  const visibleFiles = files
    ? (search.trim() === ''
        ? files
        : files.filter(f => f.toLowerCase().includes(search.trim().toLowerCase())))
    : null;

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

      {/* Search — filters within the currently-selected theme by substring.
          Switching themes preserves the query so a user looking for "cone"
          across themes can flip the dropdown without retyping. */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search assets…"
        style={{
          padding: '6px 8px',
          fontSize: 11,
          background: '#2a2a3a',
          color: '#ddd',
          border: '1px solid #444',
          borderRadius: 4,
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#0f0f1a', padding: 4 }}>
        {loadingFiles && <div style={{ color: '#888', fontSize: 11 }}>Loading…</div>}
        {!loadingFiles && files && files.length === 0 && (
          <div style={{ color: '#888', fontSize: 11 }}>No files in this theme.</div>
        )}
        {!loadingFiles && visibleFiles && visibleFiles.length === 0 && files && files.length > 0 && (
          <div style={{ color: '#888', fontSize: 11 }}>No matches in this theme. Try another.</div>
        )}
        {!loadingFiles && visibleFiles && visibleFiles.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 4 }}>
            {visibleFiles.map(f => {
              const key = theme ? `me:${theme}/${f}` : '';
              // Highlight whichever selection matches the active layer's
              // kind — picking a tile while a tile layer is active fills
              // selectedTileType; picking on an object layer fills
              // selectedObjectKey. Only one is ever current.
              const externallySelected = activeLayerKind === 'tile' ? selectedTileType : selectedObjectKey;
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

function prettyName(folder: string): string {
  // "1_Terrains_and_Fences_Singles_16x16" → "1. Terrains and Fences"
  const stripped = folder.replace(/_Singles_16x16$/, '');
  const m = /^(\d+)_(.+)$/.exec(stripped);
  if (!m) return stripped.replace(/_/g, ' ');
  return `${m[1]}. ${m[2].replace(/_/g, ' ')}`;
}
