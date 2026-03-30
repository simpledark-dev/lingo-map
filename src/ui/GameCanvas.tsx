'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { PixiApp } from '../renderer/PixiApp';
import { DialogueState, MapData, GameState } from '../core/types';
import { GameEvent } from '../core/GameBridge';
import DialogueOverlay from './DialogueOverlay';
import Minimap from './Minimap';

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  const [minimapData, setMinimapData] = useState<{ map: MapData; state: GameState } | null>(null);
  const [currentMapId, setCurrentMapId] = useState('outdoor');

  useEffect(() => {
    if (!containerRef.current || pixiAppRef.current) return;

    let cancelled = false;
    const pixiApp = new PixiApp();
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
  }, []);

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

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 1024,
        maxHeight: '100dvh',
        aspectRatio: '640 / 480',
        margin: '0 auto',
      }}
    >
      {/* PixiJS canvas mounts here */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* UI overlay — always on top of canvas */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        {/* Map button — only on outdoor map */}
        {currentMapId === 'outdoor' && <button
          onClick={handleOpenMinimap}
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: 8,
            right: 8,
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
          }}
          aria-label="Open map"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            <line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            <circle cx="10" cy="10" r="2" fill="currentColor" />
          </svg>
        </button>}

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
