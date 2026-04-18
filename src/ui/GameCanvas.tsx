'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../core/constants';
import { normalizeObjectMultiplier, STRESS_OBJECT_OPTIONS } from '../core/MapStress';
import { PixiApp } from '../renderer/PixiApp';
import { DialogueState, MapData, GameState } from '../core/types';
import { GameEvent } from '../core/GameBridge';
import DialogueOverlay from './DialogueOverlay';
import Minimap from './Minimap';

function readInitialObjectMultiplier(): number {
  if (typeof window === 'undefined') return 1;
  const value = Number(window.location.search ? new URLSearchParams(window.location.search).get('objects') : null);
  return normalizeObjectMultiplier(value);
}

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const soundOnRef = useRef(true);
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  const [minimapData, setMinimapData] = useState<{ map: MapData; state: GameState } | null>(null);
  const [currentMapId, setCurrentMapId] = useState('outdoor');
  const [objectMultiplier, setObjectMultiplier] = useState(readInitialObjectMultiplier);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (objectMultiplier <= 1) {
      url.searchParams.delete('objects');
    } else {
      url.searchParams.set('objects', String(objectMultiplier));
    }
    window.history.replaceState({}, '', url);
  }, [objectMultiplier]);

  const handleToggleSound = useCallback(() => {
    const nextSoundOn = !soundOn;
    pixiAppRef.current?.setMusicEnabled(nextSoundOn);
    soundOnRef.current = nextSoundOn;
    setSoundOn(nextSoundOn);
  }, [soundOn]);

  useEffect(() => {
    const app = pixiAppRef.current;
    if (app && app.isMusicEnabled() !== soundOn) {
      app.setMusicEnabled(soundOn);
    }
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    if (!containerRef.current || pixiAppRef.current) return;

    let cancelled = false;
    // Determine start map — default to pokemon, allow ?map=<id> override
    let startMapId = 'pokemon';
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mapParam = params.get('map');
      if (mapParam) startMapId = mapParam;

      // Load editor-modified maps from localStorage (overrides compiled maps)
      const { registerMap } = require('../core/MapLoader');
      const editorKeys = Object.keys(localStorage).filter(k => k.startsWith('editor-map:'));
      for (const key of editorKeys) {
        try {
          const mapData = JSON.parse(localStorage.getItem(key)!);
          if (mapData?.id && mapData.tiles && mapData.width && mapData.height) {
            registerMap(mapData.id, mapData);
          }
        } catch { /* skip corrupt entries */ }
      }
    }

    const pixiApp = new PixiApp({
      objectMultiplier,
      musicEnabled: soundOnRef.current,
      startMapId,
    });
    pixiAppRef.current = pixiApp;

    const unsubscribe = pixiApp.bridge.subscribe((event: GameEvent) => {
      if (cancelled) return;
      switch (event.type) {
        case 'dialogueStart':
        case 'dialogueAdvance':
          setDialogue(event.dialogue);
          break;
        case 'dialogueEnd':
          setDialogue(null);
          break;
        case 'sceneChange':
          setCurrentMapId(event.mapId);
          break;
      }
    });

    pixiApp.init(containerRef.current).catch((err) => {
      if (!cancelled) console.error(err);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      pixiApp.destroy();
      pixiAppRef.current = null;
    };
  }, [objectMultiplier]);

  const handleAdvanceDialogue = useCallback(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    app.commandQueue.push({ type: 'ADVANCE_DIALOGUE' });
  }, []);

  const handleOpenMinimap = useCallback(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    const map = app.getMapData();
    const state = app.getGameState();
    if (map && state) {
      setMinimapData({ map, state });
    }
  }, []);

  const handleCloseMinimap = useCallback(() => {
    setMinimapData(null);
  }, []);

  const handleObjectMultiplierChange = useCallback((value: number) => {
    setDialogue(null);
    setMinimapData(null);
    setCurrentMapId('outdoor');
    setObjectMultiplier(value);
  }, []);

  const btnStyle: React.CSSProperties = {
    pointerEvents: 'auto',
    position: 'relative',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    background: 'rgba(0,0,0,0.5)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
      }}
    >
      {/* PixiJS canvas mounts here */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* UI overlay — always on top of canvas */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        {/* Top-right icon group */}
        <div
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 6,
          }}
        >
          {process.env.NODE_ENV === 'development' && (
            <label
              style={{
                ...btnStyle,
                width: 'auto',
                padding: '0 10px',
                gap: 8,
                fontSize: 12,
              }}
            >
              <span>Objs</span>
              <select
                value={objectMultiplier}
                onChange={(event) => handleObjectMultiplierChange(normalizeObjectMultiplier(Number(event.target.value)))}
                style={{
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                aria-label="Stress test object multiplier"
              >
                {STRESS_OBJECT_OPTIONS.map((option) => (
                  <option key={option} value={option} style={{ color: 'black' }}>
                    {option}x
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Sound toggle — always visible */}
          <button
            onClick={handleToggleSound}
            style={btnStyle}
            aria-label={soundOn ? 'Mute background music' : 'Unmute background music'}
          >
            {soundOn ? (
              // Speaker on
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 7.5h2.5L9 4v12l-3.5-3.5H3a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 3 7.5Z" fill="currentColor" />
                <path d="M12 6.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M14 4a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            ) : (
              // Speaker off (muted X)
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 7.5h2.5L9 4v12l-3.5-3.5H3a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 3 7.5Z" fill="currentColor" opacity="0.5" />
                <line x1="12" y1="8" x2="17" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="17" y1="8" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>

          {/* Map button — only on outdoor map */}
          {(currentMapId === 'outdoor' || currentMapId === 'custom') && (
            <button
              onClick={handleOpenMinimap}
              style={btnStyle}
              aria-label="Open map"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <circle cx="10" cy="10" r="2" fill="currentColor" />
              </svg>
            </button>
          )}
        </div>

        {dialogue && (
          <div style={{ pointerEvents: 'auto' }}>
            <DialogueOverlay
              dialogue={dialogue}
              onAdvance={handleAdvanceDialogue}
            />
          </div>
        )}

        {minimapData && (
          <div style={{ pointerEvents: 'auto' }}>
            <Minimap
              mapData={minimapData.map}
              gameState={minimapData.state}
              onClose={handleCloseMinimap}
            />
          </div>
        )}
      </div>
    </div>
  );
}
