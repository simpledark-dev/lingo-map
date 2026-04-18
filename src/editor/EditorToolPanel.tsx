'use client';

import { TileType } from '../core/types';
import { EditorAction, EditorState } from './editorState';
import { TILE_ITEMS, OBJECT_CATEGORIES, BUILDING_ITEMS } from './objectDefaults';

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export default function EditorToolPanel({ state, dispatch }: Props) {
  return (
    <div style={{
      width: 240, minWidth: 240, height: '100%', overflow: 'auto',
      background: '#1a1a2e', borderRight: '1px solid #333', padding: 8,
      display: 'flex', flexDirection: 'column', gap: 12,
      fontSize: 12, color: '#ccc',
    }}>
      {/* Tools */}
      <Section title="Tools">
        <div style={{ display: 'flex', gap: 4 }}>
          <ToolBtn active={state.activeTool === 'select'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'select' })} label="Select" />
          <ToolBtn active={state.activeTool === 'eraser'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'eraser' })} label="Eraser" />
        </div>
      </Section>

      {/* Tiles */}
      <Section title="Tiles">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {TILE_ITEMS.map(t => (
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

      {/* Buildings — hidden when no building types are defined */}
      {BUILDING_ITEMS.length > 0 && (
        <Section title="Buildings">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {BUILDING_ITEMS.map(b => (
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

      {/* Objects */}
      {OBJECT_CATEGORIES.map(cat => (
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
    </div>
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
