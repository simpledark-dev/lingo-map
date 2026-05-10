import type { DialogueState } from './types';

/**
 * Commands the UI can send back to the game loop.
 * Pure TypeScript — no framework coupling.
 */
export type GameCommand =
  | { type: 'ADVANCE_DIALOGUE' }
  | { type: 'CLOSE_DIALOGUE' }
  | { type: 'SET_DIALOGUE'; dialogue: DialogueState };

export class CommandQueue {
  private queue: GameCommand[] = [];

  push(command: GameCommand): void {
    this.queue.push(command);
  }

  drain(): GameCommand[] {
    const commands = this.queue.splice(0);
    return commands;
  }
}
