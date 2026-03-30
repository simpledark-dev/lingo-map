import { InputState, Position, NPCData } from '../core/types';
import { INTERACTION_RANGE } from '../core/constants';

/**
 * Browser-side input adapter. Lives in the renderer layer because it touches DOM.
 * Produces a pure InputState object for the core to consume.
 */
export class InputAdapter {
  private keys: Set<string> = new Set();
  private _moveTarget: Position | null = null;
  private _interact: boolean = false;
  private canvas: HTMLCanvasElement | null = null;

  /** Camera offset needed for screen-to-world conversion. Set each frame by the game loop. */
  cameraOffset: Position = { x: 0, y: 0 };

  /** Player position in world coords. Set each frame for tap-near-NPC detection. */
  playerPos: Position = { x: 0, y: 0 };

  /** Current NPC list. Set on scene load for tap-near-NPC detection. */
  npcs: NPCData[] = [];

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
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    const worldX = screenX + this.cameraOffset.x;
    const worldY = screenY + this.cameraOffset.y;

    // Check if tap is near an NPC that the player can interact with
    const playerDist = (nx: number, ny: number) =>
      Math.sqrt((this.playerPos.x - nx) ** 2 + (this.playerPos.y - ny) ** 2);

    for (const npc of this.npcs) {
      const tapDist = Math.sqrt((worldX - npc.x) ** 2 + (worldY - npc.y) ** 2);
      // Tap is on/near the NPC AND player is within interaction range
      if (tapDist < 48 && playerDist(npc.x, npc.y) <= INTERACTION_RANGE) {
        this._interact = true;
        return; // Don't set move target
      }
    }

    this._moveTarget = { x: worldX, y: worldY };
  };

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas = null;
    }
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
