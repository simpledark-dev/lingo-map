'use client';

import { useEffect } from 'react';
import { DialogueState } from '../core/types';

interface DialogueOverlayProps {
  dialogue: DialogueState;
  onAdvance: () => void;
}

export default function DialogueOverlay({ dialogue, onAdvance }: DialogueOverlayProps) {
  const isLastLine = dialogue.currentLine >= dialogue.lines.length - 1;
  const currentLine = dialogue.lines[dialogue.currentLine] ?? '';

  useEffect(() => {
    if (!currentLine || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(currentLine);
    utterance.rate = 1;
    utterance.pitch = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [currentLine, dialogue.npcId]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 p-4"
      onClick={onAdvance}
    >
      <div className="bg-black/80 border-2 border-white/30 rounded-lg p-4 max-w-full">
        <div className="text-yellow-300 text-sm font-bold mb-2">
          {dialogue.npcName}
        </div>
        <div className="text-white text-base leading-relaxed mb-3">
          {currentLine}
        </div>
        <div className="text-white/50 text-xs text-right">
          {isLastLine ? 'Press Space to close' : 'Press Space to continue'}
        </div>
      </div>
    </div>
  );
}
