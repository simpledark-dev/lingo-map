import { InputState, Position } from '../core/types';

/**
 * Browser-side input adapter. Lives in the renderer layer because it touches DOM.
 * Produces a pure InputState object for the core to consume.
 */
export class InputAdapter {
  private keys: Set<string> = new Set();
  private _moveTarget: Position | null = null;
  private _interact: boolean = false;

  /** Camera offset needed for screen-to-world conversion. Set each frame by the game loop. */
  cameraOffset: Position = { x: 0, y: 0 };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyE' || e.code === 'Space') {
      this._interact = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    const canvas = e.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    this._moveTarget = {
      x: screenX + this.cameraOffset.x,
      y: screenY + this.cameraOffset.y,
    };
  };

  attach(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  getInputState(): InputState {
    const up = this.keys.has('ArrowUp') || this.keys.has('KeyW');
    const down = this.keys.has('ArrowDown') || this.keys.has('KeyS');
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const interact = this._interact;

    // Consume one-shot flags
    this._interact = false;
    const moveTarget = this._moveTarget;
    this._moveTarget = null;

    return { up, down, left, right, interact, moveTarget };
  }
}
