'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../core/constants';
import { normalizeObjectMultiplier } from '../core/MapStress';
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
  const [objectMultiplier] = useState(readInitialObjectMultiplier);
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
    }

    const { loadMap, registerMap } = require('../core/MapLoader');

    // Fetch disk-persisted map edits, register them as overrides, then start the game.
    // We only take the edited parts (tiles/objects/buildings/dimensions) — triggers,
    // spawnPoints and NPCs always come from the compiled map so gameplay logic
    // isn't broken by a stale version.
    const applyOverride = (mapData: { id?: string; width?: number; height?: number; tileSize?: number; tiles?: unknown; objects?: unknown[]; buildings?: unknown[]; layers?: unknown[] }) => {
      if (!mapData?.id || !Array.isArray(mapData.tiles) || typeof mapData.width !== 'number' || typeof mapData.height !== 'number') return;
      let compiled: ReturnType<typeof loadMap> | null = null;
      try { compiled = loadMap(mapData.id); } catch { /* map not in registry */ }

      // For legacy disk saves (no `layers` field) the editor used not to
      // serialise `transition`, so we re-attach it from the compiled map by
      // matching spriteKey. New-format saves (with `layers`) come from an
      // editor that DOES write `transition` explicitly — re-attaching there
      // would override the user's intent (e.g., duplicating a door entity
      // and unchecking "Acts as a door" on the duplicate; the duplicate
      // shares the original's spriteKey and would silently get its door
      // back). So only run the back-compat re-attach for legacy saves.
      const isLegacySave = !Array.isArray(mapData.layers);
      const transitionsBySpriteKey = new Map<string, { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string }>();
      if (isLegacySave) {
        compiled?.objects.forEach((o: { spriteKey: string; transition?: { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string } }) => {
          if (o.transition) transitionsBySpriteKey.set(o.spriteKey, o.transition);
        });
      }
      const objects = (mapData.objects ?? []).map(o => {
        const obj = o as { spriteKey?: string; transition?: unknown };
        if (isLegacySave && obj.spriteKey && !obj.transition) {
          const t = transitionsBySpriteKey.get(obj.spriteKey);
          if (t) return { ...obj, transition: t };
        }
        return obj;
      });

      registerMap(mapData.id, {
        id: mapData.id,
        width: mapData.width,
        height: mapData.height,
        tileSize: mapData.tileSize ?? compiled?.tileSize ?? 16,
        tiles: mapData.tiles,
        objects,
        buildings: mapData.buildings ?? [],
        npcs: compiled?.npcs ?? [],
        triggers: compiled?.triggers ?? [],
        spawnPoints: compiled?.spawnPoints ?? [{ id: 'default', x: 0, y: 0, facing: 'down' }],
        // Engine-only map metadata (not produced by the editor) comes from the
        // compiled map so interior view caps etc. aren't lost on override.
        maxViewTiles: compiled?.maxViewTiles,
        // Editor-managed layer list — fall back to compiled layers, then to
        // implicit defaults via `getLayers()` when neither is set.
        layers: (mapData.layers as never[] | undefined) ?? compiled?.layers,
      });
    };

    let unsubscribe: (() => void) | null = null;

    const startGame = () => {
      if (cancelled || !containerRef.current) return;
      const pixiApp = new PixiApp({
        objectMultiplier,
        musicEnabled: soundOnRef.current,
        startMapId,
      });
      pixiAppRef.current = pixiApp;
      unsubscribe = pixiApp.bridge.subscribe((event: GameEvent) => {
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
    };

    // Fetch disk overrides first, then start. If API fails, fall back to compiled maps.
    fetch('/api/maps')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.maps) {
          for (const id of Object.keys(data.maps)) applyOverride(data.maps[id]);
        }
      })
      .catch(() => { /* offline or no data dir — use compiled maps */ })
      .finally(startGame);

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy();
        pixiAppRef.current = null;
      }
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
