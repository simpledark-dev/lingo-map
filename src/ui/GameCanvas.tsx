'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { PixiApp } from '../renderer/PixiApp';
import { DialogueState } from '../core/types';
import { GameEvent } from '../core/GameBridge';
import DialogueOverlay from './DialogueOverlay';

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);

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

  return (
    <div
      ref={containerRef}
      className="relative mx-auto"
      style={{
        width: '100%',
        maxWidth: 1024,
        aspectRatio: '640 / 480',
      }}
    >
      {dialogue && (
        <DialogueOverlay
          dialogue={dialogue}
          onAdvance={handleAdvanceDialogue}
        />
      )}
    </div>
  );
}
