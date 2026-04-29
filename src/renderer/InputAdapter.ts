import { InputState, Position, NPCData } from '../core/types';
import { INTERACTION_RANGE, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM, ZOOM_STEP } from '../core/constants';

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

  /** Current zoom level. Read by the game loop. */
  zoom: number = DEFAULT_ZOOM;

  // Pinch tracking
  private activeTouches = new Map<number, { x: number; y: number }>();
  private lastPinchDist: number | null = null;

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
    this.canvas.setPointerCapture(e.pointerId);

    // Track touch for pinch detection
    this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // If 2 fingers down, start pinch — don't process as tap
    if (this.activeTouches.size >= 2) {
      this.lastPinchDist = this.getPinchDist();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;

    // Screen-to-world conversion accounting for zoom
    const worldX = screenX / this.zoom + this.cameraOffset.x;
    const worldY = screenY / this.zoom + this.cameraOffset.y;

    // Check if tap is near an NPC that the player can interact with
    const playerDist = (nx: number, ny: number) =>
      Math.sqrt((this.playerPos.x - nx) ** 2 + (this.playerPos.y - ny) ** 2);

    for (const npc of this.npcs) {
      const tapDist = Math.sqrt((worldX - npc.x) ** 2 + (worldY - npc.y) ** 2);
      if (tapDist < 48 && playerDist(npc.x, npc.y) <= INTERACTION_RANGE) {
        this._interact = true;
        return;
      }
    }

    this._moveTarget = { x: worldX, y: worldY };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.activeTouches.has(e.pointerId)) return;
    this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activeTouches.size >= 2 && this.lastPinchDist !== null) {
      const dist = this.getPinchDist();
      const delta = dist - this.lastPinchDist;
      if (Math.abs(delta) > 8) {
        this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
          this.zoom + (delta > 0 ? ZOOM_STEP : -ZOOM_STEP)
        ));
        this.lastPinchDist = dist;
      }
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.canvas?.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.activeTouches.delete(e.pointerId);
    if (this.activeTouches.size < 2) {
      this.lastPinchDist = null;
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + delta));
  };

  private getPinchDist(): number {
    const pts = Array.from(this.activeTouches.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // Prevent default touch behavior (scroll/zoom) on the canvas
    canvas.style.touchAction = 'none';
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.removeEventListener('pointermove', this.onPointerMove);
      this.canvas.removeEventListener('pointerup', this.onPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onPointerUp);
      this.canvas.removeEventListener('wheel', this.onWheel);
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
