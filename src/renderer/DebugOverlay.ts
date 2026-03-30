const SAMPLE_SIZE = 60; // rolling window for average frame time

/**
 * Lightweight debug performance overlay.
 * Pure DOM — no PixiJS, no React. Attaches a <div> to the container.
 */
export class DebugOverlay {
  private el: HTMLDivElement;
  private frameTimes: number[] = [];
  private lastTime = performance.now();

  // Stats fed externally each frame
  totalObjects = 0;
  renderedSprites = 0;

  constructor(container: HTMLDivElement) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'absolute',
      top: '4px',
      left: '4px',
      padding: '6px 10px',
      background: 'rgba(0,0,0,0.7)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: '12px',
      lineHeight: '1.5',
      pointerEvents: 'none',
      zIndex: '9999',
      borderRadius: '4px',
      whiteSpace: 'pre',
    });
    container.appendChild(this.el);
  }

  update(): void {
    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.frameTimes.push(dt);
    if (this.frameTimes.length > SAMPLE_SIZE) {
      this.frameTimes.shift();
    }

    const avgMs = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = avgMs > 0 ? 1000 / avgMs : 0;

    this.el.textContent =
      `FPS: ${fps.toFixed(0)}\n` +
      `Frame: ${avgMs.toFixed(1)} ms\n` +
      `Objects: ${this.totalObjects}\n` +
      `Sprites: ${this.renderedSprites}`;
  }

  destroy(): void {
    this.el.remove();
  }
}
