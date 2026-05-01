import { DialogueState } from './types';

/** Event types the game can emit to the UI layer. */
export type GameEvent =
  | { type: 'dialogueStart'; dialogue: DialogueState }
  | { type: 'dialogueAdvance'; dialogue: DialogueState }
  | { type: 'dialogueEnd' }
  /** Fired the moment a door trigger fires, BEFORE the new map loads.
   *  Pairs with `sceneChange` (which fires once the new scene is ready)
   *  to drive the fade-to-black overlay in `GameCanvas`. */
  | { type: 'sceneTransitionStart' }
  | { type: 'sceneChange'; mapId: string };

type Listener = (event: GameEvent) => void;

/**
 * Framework-agnostic typed event bridge.
 * Pure TypeScript — no React, no PixiJS.
 * The renderer publishes events; any subscriber (React, React Native, etc.) listens.
 */
export class GameBridge {
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: GameEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
