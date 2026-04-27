'use client';

import { useState } from 'react';
import { TileType } from '../core/types';
import { EditorAction, EditorState } from './editorState';
import { TILE_ITEMS, OBJECT_CATEGORIES, BUILDING_ITEMS } from './objectDefaults';
import PackPicker from './PackPicker';

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

type PaletteTab = 'placeholder' | 'pack';

export default function EditorToolPanel({ state, dispatch }: Props) {
  const [paletteTab, setPaletteTab] = useState<PaletteTab>('placeholder');
  const selectedObject = state.selectedObjectId
    ? state.objects.find(o => o.id === state.selectedObjectId)
    : null;
  const selectedBuilding = !selectedObject && state.selectedObjectId
    ? state.buildings.find(b => b.id === state.selectedObjectId)
    : null;

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
                  {isVisible ? '●' : '○'}
                </button>
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_LAYER_LOCKED', id: layer.id })}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  style={iconBtnStyle(layer.locked ? '#ff8844' : '#555')}
                >
                  {layer.locked ? '🔒' : '🔓'}
                </button>
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
                    const objCount = state.objects.filter(o => o.layer === layer.id).length;
                    if (objCount > 0 && !window.confirm(`Layer "${layer.name}" has ${objCount} objects. They'll move to another layer. Continue?`)) return;
                    dispatch({ type: 'REMOVE_LAYER', id: layer.id });
                  }}
                  disabled={state.layers.length <= 1}
                  title="Delete layer"
                  style={{ ...iconBtnStyle('#c66'), opacity: state.layers.length <= 1 ? 0.3 : 1 }}
                >×</button>
              </div>
            );
          })}
          <button
            onClick={() => dispatch({ type: 'ADD_LAYER' })}
            style={{
              marginTop: 4, padding: '4px 0',
              background: '#2a3a2a', border: '1px solid #444', borderRadius: 3,
              color: '#9c9', cursor: 'pointer', fontSize: 11,
            }}
          >+ Add Layer</button>
        </div>
      </Section>

      {/* Selection — only shown when an object is selected via the select tool */}
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
              max={100}
              value={Math.round((selectedObject.scale ?? 1) * 100)}
              onChange={e => dispatch({ type: 'SET_OBJECT_SCALE', id: selectedObject.id, scale: parseInt(e.target.value) / 100 })}
              style={{ width: '100%' }}
            />
          </div>
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
          <>
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
          </>
        )}

        {paletteTab === 'pack' && (
          <PackPicker
            selectedTileType={state.selectedTileType}
            selectedObjectKey={state.selectedObjectKey}
            dispatch={dispatch}
          />
        )}
      </div>
    </div>
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
