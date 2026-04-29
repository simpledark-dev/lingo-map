'use client';

import { useEffect, useRef, useState } from 'react';
import { TileType } from '../core/types';
import { EditorAction, EditorState, getAllObjects } from './editorState';
import { TILE_ITEMS, OBJECT_CATEGORIES, BUILDING_ITEMS } from './objectDefaults';
import PackPicker from './PackPicker';
import { getTexture } from '../renderer/AssetLoader';
import { CAR_SPRITE_SETS } from '../core/CarSystem';

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

type PaletteTab = 'placeholder' | 'pack';

export default function EditorToolPanel({ state, dispatch }: Props) {
  const [paletteTab, setPaletteTab] = useState<PaletteTab>('pack');
  const allObjects = getAllObjects(state);
  // Single-select: show the scale-slider UI for that one object/building.
  // Multi-select (length > 1): show a count chip; scale slider hidden since
  // bulk-resize across heterogeneous sprites isn't supported (and the bulk
  // workflow is delete/move, not resize).
  const onlyId = state.selectedObjectIds.length === 1 ? state.selectedObjectIds[0] : null;
  const selectedObject = onlyId ? allObjects.find(o => o.id === onlyId) : null;
  const selectedBuilding = !selectedObject && onlyId
    ? state.buildings.find(b => b.id === onlyId)
    : null;
  const multiSelectCount = state.selectedObjectIds.length > 1 ? state.selectedObjectIds.length : 0;

  return (
    <div style={{
      width: 320, minWidth: 320, height: '100%', overflow: 'hidden',
      background: '#1a1a2e', borderRight: '1px solid #333', padding: 8,
      display: 'flex', flexDirection: 'column', gap: 12,
      fontSize: 12, color: '#ccc',
    }}>
      {/* Tools */}
      <Section title="Tools">
        <div style={{ display: 'flex', gap: 4 }}>
          <ToolBtn active={state.activeTool === 'select'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'select' })} label="Select" />
          <ToolBtn active={state.activeTool === 'eraser'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'eraser' })} label="Eraser" />
          <ToolBtn active={state.activeTool === 'area-erase'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'area-erase' })} label="Area" />
          <ToolBtn active={state.activeTool === 'area-select'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'area-select' })} label="Area Sel" />
        </div>
      </Section>

      {/* Layers */}
      <Section title="Layers">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Render top-down: index N (last in array) renders on top, so we
              flip the visual order so the top of the list is "front". */}
          {[...state.layers].reverse().map(layer => {
            const isActive = layer.id === state.activeLayerId;
            const isVisible = layer.visible !== false;
            const isTile = layer.kind === 'tile';
            const isCarPath = layer.kind === 'car-path';
            return (
              <div
                key={layer.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 4px',
                  background: isActive ? '#2a3a5a' : 'transparent',
                  border: isActive ? '1px solid #4488ff' : '1px solid transparent',
                  borderRadius: 3,
                }}
              >
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_LAYER_VISIBLE', id: layer.id })}
                  title={isVisible ? 'Hide layer' : 'Show layer'}
                  style={iconBtnStyle(isVisible ? '#ddd' : '#555')}
                >
                  {isVisible ? <EyeIcon /> : <EyeOffIcon />}
                </button>
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_LAYER_LOCKED', id: layer.id })}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  style={iconBtnStyle(layer.locked ? '#ff8844' : '#888')}
                >
                  {layer.locked ? <LockedIcon /> : <UnlockedIcon />}
                </button>
                {/* Kind badge — T (tile), O (object), or C (car path).
                    Color-coded so the user can scan the stack at a glance
                    and tell what each layer holds. */}
                <span
                  title={isTile ? 'Tile layer' : isCarPath ? 'Car-path layer' : 'Object layer'}
                  style={{
                    width: 16, height: 16, fontSize: 9, fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isTile ? '#3a4a6a' : isCarPath ? '#5a4a2a' : '#4a3a5a',
                    color: isTile ? '#88bbff' : isCarPath ? '#ffcc66' : '#cc99ff',
                    borderRadius: 2, flexShrink: 0,
                  }}
                >
                  {isTile ? 'T' : isCarPath ? 'C' : 'O'}
                </span>
                <button
                  onClick={() => dispatch({ type: 'SET_ACTIVE_LAYER', id: layer.id })}
                  onDoubleClick={() => {
                    const next = window.prompt('Rename layer', layer.name);
                    if (next != null) dispatch({ type: 'RENAME_LAYER', id: layer.id, name: next });
                  }}
                  title="Click to activate, double-click to rename"
                  style={{
                    flex: 1, textAlign: 'left', background: 'transparent',
                    border: 'none', color: '#ddd', cursor: 'pointer',
                    fontSize: 11, padding: '2px 4px',
                  }}
                >
                  {layer.name}
                </button>
                <button
                  onClick={() => dispatch({ type: 'REORDER_LAYER', id: layer.id, direction: 'up' })}
                  title="Move toward front"
                  style={iconBtnStyle('#888')}
                >▲</button>
                <button
                  onClick={() => dispatch({ type: 'REORDER_LAYER', id: layer.id, direction: 'down' })}
                  title="Move toward back"
                  style={iconBtnStyle('#888')}
                >▼</button>
                <button
                  onClick={() => {
                    if (state.layers.length <= 1) return;
                    // Object layers warn about objects; tile layers warn
                    // about non-empty cells. Tile layer cells are LOST on
                    // delete (no fallback, since cells aren't owned by
                    // entities).
                    const target = state.layers.find(l => l.id === layer.id);
                    let warning: string | null = null;
                    if (target && target.kind === 'object' && target.objects.length > 0) {
                      warning = `Layer "${layer.name}" has ${target.objects.length} objects. They'll move to another layer. Continue?`;
                    } else if (target && target.kind === 'tile') {
                      let cellCount = 0;
                      for (const row of target.tiles) for (const c of row) if (c) cellCount++;
                      if (cellCount > 0) warning = `Layer "${layer.name}" has ${cellCount} painted cells. They will be deleted. Continue?`;
                    }
                    if (warning && !window.confirm(warning)) return;
                    dispatch({ type: 'REMOVE_LAYER', id: layer.id });
                  }}
                  disabled={state.layers.length <= 1}
                  title="Delete layer"
                  style={{ ...iconBtnStyle('#c66'), opacity: state.layers.length <= 1 ? 0.3 : 1 }}
                >×</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button
              onClick={() => dispatch({ type: 'ADD_LAYER', kind: 'tile' })}
              title="Add a new tile layer (paintable grid). Stacks above existing layers."
              style={addLayerBtnStyle('#88bbff')}
            >+ Tile</button>
            <button
              onClick={() => dispatch({ type: 'ADD_LAYER', kind: 'object' })}
              title="Add a new object layer (free-positioned entities). Stacks above existing layers."
              style={addLayerBtnStyle('#cc99ff')}
            >+ Object</button>
            <button
              onClick={() => dispatch({ type: 'ADD_LAYER', kind: 'car-path', name: 'Car Path' })}
              title="Add a new car-path layer (paint allowed exit directions per cell). Editor-only — invisible in game."
              style={addLayerBtnStyle('#ffcc66')}
            >+ Car</button>
          </div>
        </div>
      </Section>

      {/* Car-path painter controls — only when the active layer is a
          car-path layer. The four direction toggles compose into the set
          of exits stamped onto each clicked cell; an empty set clears
          the cell. */}
      {state.layers.find(l => l.id === state.activeLayerId)?.kind === 'car-path' && (
        <Section title="Car-path exits">
          <CarPathDirectionToggles state={state} dispatch={dispatch} />
        </Section>
      )}

      {/* Per-sprite car collision boxes — also gated on car-path layer
          activation since that's when the user is dialling in car
          behaviour. Edits persist to localStorage; PixiApp reads them on
          every game-tab refresh, so changes take effect on reload. */}
      {state.layers.find(l => l.id === state.activeLayerId)?.kind === 'car-path' && (
        <Section title="Car collision boxes">
          <CarCollisionEditor />
        </Section>
      )}

      {/* Multi-selection summary — replaces the per-object scale slider when
          more than one object is selected. Shows count + a hint that
          delete/group-drag work; scale is intentionally not exposed for
          bulk because it'd produce unpredictable results across mixed sprite
          sizes. */}
      {multiSelectCount > 0 && (
        <Section title={`${multiSelectCount} objects selected`}>
          <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.4 }}>
            Drag any selected object to move them all together. Press Delete to remove. Shift-click to add or remove items.
          </div>
        </Section>
      )}

      {/* Selection — only shown when exactly one object is selected via the
          select tool (multi-selection takes the panel above instead). */}
      {selectedObject && (
        <Section title={`Selection: ${selectedObject.spriteKey}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>
              Scale: {Math.round((selectedObject.scale ?? 1) * 100)}%
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <ScaleBtn label="−−" onClick={() => dispatch({ type: 'SET_OBJECT_SCALE', id: selectedObject.id, scale: (selectedObject.scale ?? 1) * 0.5 })} />
              <ScaleBtn label="−" onClick={() => dispatch({ type: 'SET_OBJECT_SCALE', id: selectedObject.id, scale: (selectedObject.scale ?? 1) * 0.9 })} />
              <ScaleBtn label="+" onClick={() => dispatch({ type: 'SET_OBJECT_SCALE', id: selectedObject.id, scale: (selectedObject.scale ?? 1) * 1.1 })} />
              <ScaleBtn label="Reset" onClick={() => dispatch({ type: 'SET_OBJECT_SCALE', id: selectedObject.id, scale: 1 })} />
            </div>
            <input
              type="range"
              min={1}
              max={150}
              value={Math.round((selectedObject.scale ?? 1) * 100)}
              onChange={e => dispatch({ type: 'SET_OBJECT_SCALE', id: selectedObject.id, scale: parseInt(e.target.value) / 100 })}
              style={{ width: '100%' }}
            />
          </div>
          {/* Key on entity.id resets the collapse state of these sub-
              sections when the user switches selection — Entity A's
              expanded "Door" shouldn't carry over into Entity B. */}
          <CollisionEditor key={`coll-${selectedObject.id}`} entity={selectedObject} dispatch={dispatch} />
          <DoorEditor key={`door-${selectedObject.id}`} entity={selectedObject} dispatch={dispatch} tileSize={state.tileSize} />
        </Section>
      )}

      {/* Building selection — scale shrinks the visual AND the collision/door */}
      {selectedBuilding && (
        <Section title={`Building: ${selectedBuilding.baseSpriteKey}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>
              Scale: {Math.round((selectedBuilding.scale ?? 1) * 100)}%
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <ScaleBtn label="−−" onClick={() => dispatch({ type: 'SET_BUILDING_SCALE', id: selectedBuilding.id, scale: (selectedBuilding.scale ?? 1) * 0.5 })} />
              <ScaleBtn label="−" onClick={() => dispatch({ type: 'SET_BUILDING_SCALE', id: selectedBuilding.id, scale: (selectedBuilding.scale ?? 1) * 0.9 })} />
              <ScaleBtn label="+" onClick={() => dispatch({ type: 'SET_BUILDING_SCALE', id: selectedBuilding.id, scale: (selectedBuilding.scale ?? 1) * 1.1 })} />
              <ScaleBtn label="Reset" onClick={() => dispatch({ type: 'SET_BUILDING_SCALE', id: selectedBuilding.id, scale: 1 })} />
            </div>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round((selectedBuilding.scale ?? 1) * 100)}
              onChange={e => dispatch({ type: 'SET_BUILDING_SCALE', id: selectedBuilding.id, scale: parseInt(e.target.value) / 100 })}
              style={{ width: '100%' }}
            />
          </div>
        </Section>
      )}

      {/* Palette source tabs — Placeholder (the local sprite sets we built up
          while prototyping) vs. Pack (Modern Exteriors master sheets). */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #333', paddingBottom: 6 }}>
        <PaletteTab active={paletteTab === 'placeholder'} onClick={() => setPaletteTab('placeholder')} label="Placeholder" />
        <PaletteTab active={paletteTab === 'pack'}        onClick={() => setPaletteTab('pack')}        label="Pack" />
      </div>

      {/* Palette content fills the remaining vertical space and scrolls
          internally so the Tools/Selection sections above stay pinned. */}
      <div style={{ flex: 1, minHeight: 0, overflow: paletteTab === 'placeholder' ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {paletteTab === 'placeholder' && (
          <PlaceholderPalette state={state} dispatch={dispatch} />
        )}

        {paletteTab === 'pack' && (
          <PackPicker
            selectedTileType={state.selectedTileType}
            selectedObjectKey={state.selectedObjectKey}
            activeLayerKind={(() => {
              const k = state.layers.find(l => l.id === state.activeLayerId)?.kind;
              // PackPicker only knows about tile/object layers — car-path
              // doesn't pick assets, so coerce. The palette panel will
              // hide itself for car-path layers anyway via the layer-kind
              // gate.
              return k === 'tile' ? 'tile' : 'object';
            })()}
            dispatch={dispatch}
          />
        )}
      </div>
    </div>
  );
}

/** Categorised placeholder palette: tile palette + (optional) building
 * palette + per-category object palettes, with a top-level substring search
 * that filters across all sections. Each section hides itself when the
 * search has no matches inside it, so the user only sees populated groups. */
function PlaceholderPalette({ state, dispatch }: Props) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const matches = (item: { key: string; label: string }) =>
    q === '' || item.key.toLowerCase().includes(q) || item.label.toLowerCase().includes(q);

  const visibleTiles = TILE_ITEMS.filter(matches);
  const visibleBuildings = BUILDING_ITEMS.filter(matches);
  const visibleObjectCategories = OBJECT_CATEGORIES
    .map(cat => ({ ...cat, items: cat.items.filter(matches) }))
    .filter(cat => cat.items.length > 0);
  const totalVisible = visibleTiles.length + visibleBuildings.length
    + visibleObjectCategories.reduce((s, c) => s + c.items.length, 0);

  return (
    <>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search assets…"
        style={{
          padding: '6px 8px',
          fontSize: 11,
          background: '#2a2a3a',
          color: '#ddd',
          border: '1px solid #444',
          borderRadius: 4,
          flexShrink: 0,
          marginBottom: -4,
        }}
      />

      {q !== '' && totalVisible === 0 && (
        <div style={{ color: '#888', fontSize: 11, padding: '8px 4px' }}>No matching assets.</div>
      )}

      {visibleTiles.length > 0 && (
        <Section title="Tiles">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {visibleTiles.map(t => (
              <AssetBtn
                key={t.key}
                path={t.path}
                label={t.label}
                frame={t.frame}
                active={state.activeTool === 'tile' && state.selectedTileType === t.key}
                onClick={() => dispatch({ type: 'SET_SELECTED_TILE', tileType: t.key as TileType })}
              />
            ))}
          </div>
        </Section>
      )}

      {visibleBuildings.length > 0 && (
        <Section title="Buildings">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {visibleBuildings.map(b => (
              <AssetBtn
                key={b.key}
                path={b.path}
                label={b.label}
                active={state.activeTool === 'building' && state.selectedBuildingKey === b.key}
                onClick={() => dispatch({ type: 'SET_SELECTED_BUILDING', buildingKey: b.key })}
              />
            ))}
          </div>
        </Section>
      )}

      {visibleObjectCategories.map(cat => (
        <Section key={cat.label} title={cat.label}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {cat.items.map(o => (
              <AssetBtn
                key={o.key}
                path={o.path}
                label={o.label}
                active={state.activeTool === 'object' && state.selectedObjectKey === o.key}
                onClick={() => dispatch({ type: 'SET_SELECTED_OBJECT', spriteKey: o.key })}
              />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    width: 22, height: 22, padding: 0,
    background: 'transparent', border: '1px solid #333', borderRadius: 2,
    color, cursor: 'pointer', fontSize: 11,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };
}

/** Eye / eye-off icons for the per-layer visibility toggle. Stroke-based
 * SVGs (currentColor) so the parent button's `color` controls them and the
 * dim/bright contrast between hidden/visible states stays obvious. */
function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.46 18.46 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

/** Lock / unlock icons. The locked variant has the shackle CLOSED into the
 * body; the unlocked variant lifts the shackle and rotates it open so the
 * two states are obviously different at a glance — emoji 🔒/🔓 looked
 * nearly identical at small sizes. */
function LockedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function UnlockedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.9-1" />
    </svg>
  );
}

function addLayerBtnStyle(color: string): React.CSSProperties {
  return {
    flex: 1, padding: '4px 0',
    background: '#2a3a2a', border: '1px solid #444', borderRadius: 3,
    color, cursor: 'pointer', fontSize: 11,
  };
}

function PaletteTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '6px 0',
        border: active ? '2px solid #4488ff' : '1px solid #444',
        borderRadius: 4,
        background: active ? '#2a3a5a' : '#2a2a3a',
        color: '#ddd',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 'bold' : 'normal',
      }}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#aaa', textTransform: 'uppercase', fontSize: 10, letterSpacing: 1 }}>{title}</div>
      {children}
    </div>
  );
}

function ScaleBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '4px 0', border: '1px solid #444',
        borderRadius: 3, background: '#2a2a3a', color: '#ddd',
        cursor: 'pointer', fontSize: 10, minWidth: 28,
      }}
    >{label}</button>
  );
}

/** Collapsible section header shared by CollisionEditor / DoorEditor.
 * Click toggles a chevron and shows/hides the children. Initial state is
 * derived from `defaultOpen` so sections with data on the entity start
 * expanded and empty ones stay tucked away — keeps the panel compact. */
function CollapsibleSubsection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          color: '#aaa', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 9, color: '#777' }}>{open ? '▼' : '▶'}</span>
      </button>
      {open && children}
    </div>
  );
}

/** Per-sprite collision-box editor for ambient cars. Modern Exteriors
 * pack-singles ship with a lot of transparent padding, so the
 * full-sprite default fires the obstacle test way too early. This
 * panel lets the user shrink each sprite's box to the actual visible
 * vehicle.
 *
 * Persistence is plain localStorage — the runtime (PixiApp) reads the
 * same key on every game-tab load. No disk round-trip yet, since the
 * user is on a single dev machine and saving is instant. */
function CarCollisionEditor() {
  const STORAGE_KEY = 'editor:car-collisions';
  type Box = { offsetX: number; offsetY: number; width: number; height: number };
  // Build the unique sprite-key list once. CAR_SPRITE_SETS already
  // dedupes by id, but the same sprite key shows up four times per
  // vehicle (one per heading) — only one entry per key is kept.
  const allKeys = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const set of CAR_SPRITE_SETS) {
      for (const k of Object.values(set)) {
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
      }
    }
    return out;
  })();
  // Initial state from localStorage so the panel renders snappily; disk
  // fetch below upgrades to the canonical version once it returns.
  const [overrides, setOverrides] = useState<Record<string, Box>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  // On mount: load disk + ensure every sprite key has an entry.
  //
  // The flow is one shot, on purpose: the previous design seeded entries
  // as each <img> fired its onLoad and debounced a POST per entry, which
  // raced with React StrictMode's double-mount and disk-fetch returns.
  // Result: only a handful of entries actually got persisted. We now
  // preload every sprite via `new Image()` ourselves, wait for ALL of
  // them via Promise.all, merge with the disk version, then POST once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const disk: Record<string, Box> = await fetch('/api/car-collisions')
        .then(r => r.json())
        .catch(() => ({}));
      const merged: Record<string, Box> = (disk && typeof disk === 'object') ? { ...disk } : {};
      let changed = false;
      await Promise.all(allKeys.map(key => new Promise<void>(resolve => {
        if (merged[key]) { resolve(); return; }
        const img = new Image();
        img.onload = () => {
          merged[key] = defaultBoxFor(img.naturalWidth, img.naturalHeight);
          changed = true;
          resolve();
        };
        // 404s shouldn't block the seeding pass — log and move on so a
        // single missing PNG doesn't prevent the other 39 from being
        // persisted.
        img.onerror = () => {
          console.warn(`[CarCollisionEditor] sprite "${key}" failed to load — skipping seed`);
          resolve();
        };
        img.src = key.startsWith('me:')
          ? `/assets/me/${key.slice(3)}.png`
          : `/assets/placeholder/${key}.png`;
      })));
      if (cancelled) return;
      setOverrides(merged);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* quota */ }
      // Only POST when seeding actually added entries — avoids a
      // pointless write on every editor open after the file is
      // complete.
      if (changed) {
        fetch('/api/car-collisions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        }).catch(err => console.error('Failed to seed car collisions:', err));
      }
    })();
    return () => { cancelled = true; };
    // allKeys is stable (computed from a module-level constant); deps
    // empty is intentional so this runs exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Debounced disk save — fires 500ms after the last edit so rapid
  // typing in number inputs collapses to a single POST. The file is
  // the source of truth and contains an entry for EVERY sprite key,
  // so we always POST the full map (no partial writes).
  const diskSaveTimerRef = useRef<number | null>(null);
  const persist = (next: Record<string, Box>) => {
    setOverrides(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota / disabled */ }
    if (diskSaveTimerRef.current) window.clearTimeout(diskSaveTimerRef.current);
    diskSaveTimerRef.current = window.setTimeout(() => {
      fetch('/api/car-collisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(err => console.error('Failed to persist car collisions:', err));
    }, 500);
  };
  useEffect(() => {
    return () => {
      if (diskSaveTimerRef.current) window.clearTimeout(diskSaveTimerRef.current);
    };
  }, []);
  // Default box for a sprite of given natural dimensions: full footprint,
  // centred on the anchor (sprite anchor is 0.5/0.5). Same shape the
  // runtime resolver falls back to when no override exists.
  const defaultBoxFor = (natW: number, natH: number): Box => ({
    offsetX: -natW / 2,
    offsetY: -natH / 2,
    width: natW,
    height: natH,
  });
  // Cache image dimensions so the visual overlay can scale the rect
  // correctly relative to the rendered preview. Loaded lazily via the
  // <img>'s onLoad handler.
  const [naturalDims, setNaturalDims] = useState<Record<string, { w: number; h: number }>>({});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.4 }}>
        Default: full sprite footprint. Shrink each box to the actual visible vehicle pixels so cars stop at the right distance from the player. Reload the game tab to apply.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {allKeys.map(key => (
          <CarCollisionRow
            key={key}
            spriteKey={key}
            box={overrides[key]}
            naturalDims={naturalDims[key]}
            onLoadDims={(w, h) => setNaturalDims(prev => ({ ...prev, [key]: { w, h } }))}
            onReset={(natW, natH) => {
              persist({ ...overrides, [key]: defaultBoxFor(natW, natH) });
            }}
            onChange={next => {
              persist({ ...overrides, [key]: next });
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** One row in the car-collision editor: sprite preview with a
 * translucent red rectangle showing the current box, plus four numeric
 * inputs and a Reset button. The rectangle is positioned in CSS pixels
 * scaled from the sprite's natural dimensions, so the visual lines up
 * regardless of how the preview is sized. */
function CarCollisionRow({
  spriteKey,
  box,
  naturalDims,
  onLoadDims,
  onChange,
  onReset,
}: {
  spriteKey: string;
  box: { offsetX: number; offsetY: number; width: number; height: number } | undefined;
  naturalDims: { w: number; h: number } | undefined;
  onLoadDims: (w: number, h: number) => void;
  onChange: (next: { offsetX: number; offsetY: number; width: number; height: number }) => void;
  onReset: (natW: number, natH: number) => void;
}) {
  // PREVIEW_PX caps the rendered sprite so a 64×48 horizontal car and a
  // 32×64 vertical car both fit the same row layout without wrapping.
  const PREVIEW_PX = 80;
  // Resolve the URL the same way the renderer does — pack keys map to
  // /assets/me/<themeFolder>/<file>.png. Keep this aligned with
  // packKeyToUrl in AssetLoader.ts.
  const url = spriteKey.startsWith('me:') ? `/assets/me/${spriteKey.slice(3)}.png` : `/assets/placeholder/${spriteKey}.png`;
  // Effective box for the overlay: user override, else full-sprite
  // default. This matches the runtime fallback so the editor preview
  // doesn't lie about what the simulation is actually using.
  const dims = naturalDims ?? { w: 16, h: 16 };
  const effective = box ?? { offsetX: -dims.w / 2, offsetY: -dims.h / 2, width: dims.w, height: dims.h };
  const scale = Math.min(PREVIEW_PX / dims.w, PREVIEW_PX / dims.h);
  const previewW = dims.w * scale;
  const previewH = dims.h * scale;
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '2px 4px', fontSize: 10,
    background: '#2a2a3a', color: '#ddd',
    border: '1px solid #444', borderRadius: 3,
  };
  // Pretty short label — drop the long pack-key prefix and show only
  // the meaningful "<vehicle>_<dir>_<idx>" portion so 40 rows are
  // visually scannable.
  const label = spriteKey.split('/').pop() ?? spriteKey;
  return (
    <div style={{ display: 'flex', gap: 8, padding: 4, background: '#15151f', borderRadius: 3 }}>
      <div style={{ width: PREVIEW_PX, height: PREVIEW_PX, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a14', flexShrink: 0 }}>
        <img
          src={url}
          alt={spriteKey}
          onLoad={(e) => onLoadDims(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          style={{
            width: previewW, height: previewH,
            imageRendering: 'pixelated',
            objectFit: 'contain',
          }}
        />
        {/* Red rectangle overlay — coordinates derived from the
            collision box anchored at sprite center (sprite's anchor is
            0.5/0.5 at runtime, so center-of-sprite → CSS center of the
            preview). Positive offsetX moves right, positive offsetY
            moves down. */}
        <div
          style={{
            position: 'absolute',
            left: previewW / 2 + effective.offsetX * scale + (PREVIEW_PX - previewW) / 2,
            top: previewH / 2 + effective.offsetY * scale + (PREVIEW_PX - previewH) / 2,
            width: effective.width * scale,
            height: effective.height * scale,
            border: '1px solid #ff4444',
            background: 'rgba(255, 68, 68, 0.15)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={spriteKey}>{label}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {(['offsetX','offsetY','width','height'] as const).map(field => (
            <label key={field} style={{ fontSize: 9, color: '#888' }}>
              {field}
              <input
                type="number"
                value={effective[field]}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isNaN(v)) return;
                  let next = { ...effective, [field]: v };
                  // Height grows/shrinks from the TOP — keep the bottom
                  // edge of the box anchored where it was so cars don't
                  // hover above the road when the user shaves height
                  // off the top of the sprite. Mirrors the entity
                  // collision editor's behaviour.
                  if (field === 'height') {
                    next = {
                      ...next,
                      offsetY: effective.offsetY + (effective.height - v),
                    };
                  }
                  onChange(next);
                }}
                style={inputStyle}
              />
            </label>
          ))}
        </div>
        <button
          onClick={() => {
            if (!naturalDims) return;
            onReset(naturalDims.w, naturalDims.h);
          }}
          disabled={!naturalDims}
          style={{
            padding: '2px 4px', fontSize: 9,
            background: naturalDims ? '#3a2a3a' : '#1a1a2e',
            border: '1px solid #444', borderRadius: 3,
            color: naturalDims ? '#ccc' : '#555',
            cursor: naturalDims ? 'pointer' : 'not-allowed',
          }}
        >Reset to default (full sprite)</button>
      </div>
    </div>
  );
}

/** Direction toggles for the car-path painter. Click one or more arrows
 * to set which exits get stamped into each clicked/dragged cell. An empty
 * selection clears cells. */
function CarPathDirectionToggles({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}) {
  const sel = new Set(state.selectedCarDirections);
  const toggle = (d: 'n' | 's' | 'e' | 'w') => {
    const next = new Set(sel);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    dispatch({ type: 'SET_SELECTED_CAR_DIRECTIONS', directions: Array.from(next) as ('n'|'s'|'e'|'w')[] });
  };
  const btn = (d: 'n' | 's' | 'e' | 'w', label: string, title: string): React.ReactElement => {
    const active = sel.has(d);
    return (
      <button
        key={d}
        onClick={() => toggle(d)}
        title={title}
        style={{
          width: 36, height: 36, padding: 0,
          background: active ? '#5a4a2a' : '#1a1a2e',
          border: active ? '2px solid #ffcc66' : '1px solid #444',
          borderRadius: 4,
          color: active ? '#ffcc66' : '#888',
          cursor: 'pointer', fontSize: 18, fontWeight: 'bold',
        }}
      >{label}</button>
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.4 }}>
        Pick one or more directions, then click/drag on the map. Empty selection clears cells.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gridTemplateRows: 'repeat(3, 36px)', gap: 4, justifyContent: 'center' }}>
        <span />{btn('n', '↑', 'North exit (Y−)')}<span />
        {btn('w', '←', 'West exit (X−)')}<span />{btn('e', '→', 'East exit (X+)')}
        <span />{btn('s', '↓', 'South exit (Y+)')}<span />
      </div>
      <button
        onClick={() => dispatch({ type: 'SET_SELECTED_CAR_DIRECTIONS', directions: [] })}
        style={{
          padding: '4px 6px', fontSize: 10,
          background: '#3a2a2a', border: '1px solid #444', borderRadius: 3,
          color: '#c99', cursor: 'pointer',
        }}
      >Clear (eraser mode)</button>
    </div>
  );
}

/** Collision editor sub-section shown inside the entity selection panel.
 * Displays the entity's collisionBox as four numeric inputs (offsetX,
 * offsetY, width, height) plus a "Block player" toggle and an "Auto-fit at
 * feet" preset (16×8 box centered on the anchor — sensible for trees,
 * lamps, posts). The runtime CollisionSystem treats `width <= 0 ||
 * height <= 0` as "no collision", so disabling just dispatches a zero box. */
function CollisionEditor({
  entity,
  dispatch,
}: {
  entity: import('../core/types').Entity;
  dispatch: React.Dispatch<EditorAction>;
}) {
  const cb = entity.collisionBox;
  const enabled = cb.width > 0 && cb.height > 0;
  const setBox = (next: typeof cb) => dispatch({ type: 'SET_OBJECT_COLLISION', id: entity.id, box: next });
  // Default = the lower half of the sprite's visible footprint at its
  // current scale. Top half is usually decorative (canopy / roof / lamp
  // head); the player physically bumps into the bottom. Falls back to a
  // 16×8 box when the texture isn't loaded yet.
  const tex = getTexture(entity.spriteKey);
  const scale = entity.scale ?? 1;
  const visW = Math.round((tex?.width ?? 16) * scale);
  const visH = Math.round((tex?.height ?? 16) * scale);
  const FEET_DEFAULT = {
    offsetX: -Math.round(visW / 2),
    offsetY: -Math.round(visH / 2),
    width: visW,
    height: Math.round(visH / 2),
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '3px 6px', fontSize: 11,
    background: '#2a2a3a', color: '#ddd',
    border: '1px solid #444', borderRadius: 3,
  };

  return (
    <CollapsibleSubsection title="Collision" defaultOpen={enabled}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setBox(e.target.checked ? FEET_DEFAULT : { offsetX: 0, offsetY: 0, width: 0, height: 0 })}
        />
        Block player movement
      </label>
      {enabled && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <NumberRow label="Width" value={cb.width} onChange={v => setBox({ ...cb, width: v })} inputStyle={inputStyle} />
            {/* Height grows/shrinks from the TOP — bottom edge stays anchored
                to the feet line (entity.y + offsetY + height). Without this
                offsetY adjustment the box would extend downward into the
                ground when height grew, or pull away from the feet when it
                shrank, neither of which matches how players actually
                collide with sprites. */}
            <NumberRow
              label="Height"
              value={cb.height}
              onChange={v => setBox({ ...cb, offsetY: cb.offsetY + (cb.height - v), height: v })}
              inputStyle={inputStyle}
            />
            <NumberRow label="Offset X" value={cb.offsetX} onChange={v => setBox({ ...cb, offsetX: v })} inputStyle={inputStyle} />
            <NumberRow label="Offset Y" value={cb.offsetY} onChange={v => setBox({ ...cb, offsetY: v })} inputStyle={inputStyle} />
          </div>
          <button
            onClick={() => setBox(FEET_DEFAULT)}
            style={{
              padding: '4px 6px', fontSize: 10,
              background: '#2a3a2a', border: '1px solid #444', borderRadius: 3,
              color: '#9c9', cursor: 'pointer',
            }}
          >Auto-fit ({visW}×{Math.round(visH / 2)})</button>
        </>
      )}
    </CollapsibleSubsection>
  );
}

function NumberRow({
  label, value, onChange, inputStyle,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  inputStyle: React.CSSProperties;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#888' }}>
      {label}
      <input
        type="number"
        value={value}
        onChange={e => {
          const n = parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        style={inputStyle}
      />
    </label>
  );
}

/** Static list of compiled-registry map IDs available as door targets.
 * Mirrors `GAME_MAPS` in EditorTopBar; kept inline rather than fetching
 * `/api/maps` so the dropdown is synchronous and the user can wire up a
 * door even before the disk-load round-trip resolves. New maps in the
 * registry need to be added here too. */
const TARGET_MAP_IDS = ['pokemon', 'pokemon-house-1f', 'pokemon-house-2f', 'grocer-1f'] as const;

/** Door / Transition editor sub-section. When toggled on, sets
 * `entity.transition` so the runtime PixiApp auto-generates a door
 * trigger at the entity's feet row (see PixiApp's `transitionEntities`
 * conversion). Disabling strips the field entirely. */
function DoorEditor({
  entity,
  dispatch,
  tileSize,
}: {
  entity: import('../core/types').Entity;
  dispatch: React.Dispatch<EditorAction>;
  tileSize: number;
}) {
  const t = entity.transition;
  const enabled = !!t;
  const setT = (next: NonNullable<import('../core/types').Entity['transition']> | null) =>
    dispatch({ type: 'SET_OBJECT_TRANSITION', id: entity.id, transition: next });

  // Default trigger zone when the user first toggles the door on:
  // 2 tiles wide × 1 tile tall at the entity's feet, mirroring the legacy
  // auto-shape. They can then drag the entity OR resize/offset the box
  // independently. In offset form (relative to entity at anchor 0.5, 1.0):
  //   offsetX = -T (left edge one tile left of entity x)
  //   offsetY = -T (top edge one tile above entity y, since y is the feet)
  //   width  = 2T
  //   height = T
  const T = tileSize;
  const DEFAULT_TRIGGER = { offsetX: -T, offsetY: -T, width: 2 * T, height: T };
  const tb = t?.triggerBox;

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '3px 6px', fontSize: 11,
    background: '#2a2a3a', color: '#ddd',
    border: '1px solid #444', borderRadius: 3,
  };

  return (
    <CollapsibleSubsection title="Door / Transition" defaultOpen={enabled}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            if (e.target.checked) {
              // Set transition with an explicit triggerBox so the user can
              // immediately see and resize the green rect. Default target
              // is the first registry map; user changes via dropdown.
              setT({
                targetMapId: TARGET_MAP_IDS[0],
                targetSpawnId: 'entrance',
                triggerBox: DEFAULT_TRIGGER,
              });
            } else {
              setT(null);
            }
          }}
        />
        Acts as a door
      </label>
      {enabled && t && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#888' }}>
            Target map
            <select
              value={t.targetMapId}
              onChange={e => setT({ ...t, targetMapId: e.target.value })}
              style={inputStyle}
            >
              {/* Include the saved value even if it's not in the static
                  registry list, so editing a door pointing at a custom
                  map name doesn't silently lose its target. */}
              {!TARGET_MAP_IDS.includes(t.targetMapId as typeof TARGET_MAP_IDS[number]) && (
                <option value={t.targetMapId}>{t.targetMapId}</option>
              )}
              {TARGET_MAP_IDS.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#888' }}>
            Target spawn id
            <input
              type="text"
              value={t.targetSpawnId}
              onChange={e => setT({ ...t, targetSpawnId: e.target.value })}
              placeholder="entrance"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#888' }}>
            Incoming spawn id <span style={{ color: '#555' }}>(optional)</span>
            <input
              type="text"
              value={t.incomingSpawnId ?? ''}
              onChange={e => {
                const v = e.target.value.trim();
                // Empty string strips the field so save format stays clean
                // and the engine doesn't register a spawn for it.
                const next = { ...t };
                if (v) next.incomingSpawnId = v;
                else delete next.incomingSpawnId;
                setT(next);
              }}
              placeholder="e.g. outdoor-houseA-door"
              style={inputStyle}
            />
            <span style={{ color: '#666', fontSize: 9, lineHeight: 1.4 }}>
              The runtime registers this name as a spawn point 1 tile below
              this entity. Set the interior exit door&apos;s <strong>Target
              spawn id</strong> to the same value so leaving the building
              lands the player back here.
            </span>
          </label>
          <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Trigger zone</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <NumberRow
              label="Width"
              value={tb?.width ?? DEFAULT_TRIGGER.width}
              onChange={v => setT({ ...t, triggerBox: { ...(tb ?? DEFAULT_TRIGGER), width: v } })}
              inputStyle={inputStyle}
            />
            <NumberRow
              label="Height"
              value={tb?.height ?? DEFAULT_TRIGGER.height}
              onChange={v => setT({ ...t, triggerBox: { ...(tb ?? DEFAULT_TRIGGER), height: v } })}
              inputStyle={inputStyle}
            />
            <NumberRow
              label="Offset X"
              value={tb?.offsetX ?? DEFAULT_TRIGGER.offsetX}
              onChange={v => setT({ ...t, triggerBox: { ...(tb ?? DEFAULT_TRIGGER), offsetX: v } })}
              inputStyle={inputStyle}
            />
            <NumberRow
              label="Offset Y"
              value={tb?.offsetY ?? DEFAULT_TRIGGER.offsetY}
              onChange={v => setT({ ...t, triggerBox: { ...(tb ?? DEFAULT_TRIGGER), offsetY: v } })}
              inputStyle={inputStyle}
            />
          </div>
          <button
            onClick={() => setT({ ...t, triggerBox: DEFAULT_TRIGGER })}
            style={{
              padding: '4px 6px', fontSize: 10,
              background: '#2a3a2a', border: '1px solid #444', borderRadius: 3,
              color: '#9c9', cursor: 'pointer',
            }}
          >Reset trigger ({DEFAULT_TRIGGER.width}×{DEFAULT_TRIGGER.height})</button>
          <div style={{ fontSize: 10, color: '#666', lineHeight: 1.4 }}>
            Walk into the green rectangle to enter <code>{t.targetMapId}</code> at spawn{' '}
            <code>{t.targetSpawnId || 'entrance'}</code>. Offsets are
            relative to this entity, so dragging the entity moves the trigger with it.
          </div>
        </>
      )}
    </CollapsibleSubsection>
  );
}

function ToolBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '6px 0', border: active ? '2px solid #4488ff' : '1px solid #444',
        borderRadius: 4, background: active ? '#2a3a5a' : '#2a2a3a', color: '#ddd',
        cursor: 'pointer', fontSize: 11,
      }}
    >{label}</button>
  );
}

interface AssetBtnFrame { x: number; y: number; w: number; h: number; sheetW: number; sheetH: number }

function AssetBtn({ path, label, active, onClick, frame }: { path: string; label: string; active: boolean; onClick: () => void; frame?: AssetBtnFrame }) {
  // When `frame` is set, render the asset as a CSS background slice (so we
  // can show one tile out of a tileset) instead of a plain `<img>`.
  const thumbSize = 32;
  const thumb = frame ? (
    <div
      aria-label={label}
      style={{
        width: thumbSize,
        height: thumbSize,
        backgroundImage: `url(${path})`,
        backgroundRepeat: 'no-repeat',
        // Scale the entire sheet so that one cell becomes `thumbSize` px,
        // then offset to the requested cell.
        backgroundSize: `${frame.sheetW * (thumbSize / frame.w)}px ${frame.sheetH * (thumbSize / frame.h)}px`,
        backgroundPosition: `-${frame.x * (thumbSize / frame.w)}px -${frame.y * (thumbSize / frame.h)}px`,
        imageRendering: 'pixelated',
      }}
    />
  ) : (
    <img src={path} alt={label} style={{ width: thumbSize, height: thumbSize, imageRendering: 'pixelated', objectFit: 'contain' }} />
  );

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: 4, border: active ? '2px solid #4488ff' : '1px solid #333',
        borderRadius: 4, background: active ? '#2a3a5a' : 'transparent',
        cursor: 'pointer', color: '#ccc', fontSize: 10,
      }}
    >
      {thumb}
      {label}
    </button>
  );
}
