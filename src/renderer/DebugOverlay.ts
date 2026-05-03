const SAMPLE_SIZE = 60; // rolling window for average frame time

/**
 * Lightweight debug performance overlay.
 * Pure DOM — no PixiJS, no React. Attaches a <div> to the container.
 */
export class DebugOverlay {
  private el: HTMLDivElement;
  private frameTimes: number[] = [];
  private lastTime = performance.now();
  private collapsed = true;
  private lastFps = 0;
  private lastAvgMs = 0;

  // Stats fed externally each frame
  totalObjects = 0;
  renderedSprites = 0;
  zoomLevel = 1;

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
      pointerEvents: 'auto',
      cursor: 'pointer',
      zIndex: '9999',
      borderRadius: '4px',
      whiteSpace: 'pre',
      userSelect: 'none',
    });

    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.collapsed = !this.collapsed;
      this.forceUpdateText();
    });

    container.appendChild(this.el);
  }

  private forceUpdateText() {
    if (this.collapsed) {
      this.el.textContent = `[+] Debug (${this.lastFps.toFixed(0)} fps)`;
    } else {
      this.el.textContent =
        `[-] Debug\n` +
        `FPS: ${this.lastFps.toFixed(0)}\n` +
        `Frame: ${this.lastAvgMs.toFixed(1)} ms\n` +
        `Zoom: ${this.zoomLevel.toFixed(1)}x\n` +
        `Objects: ${this.totalObjects}\n` +
        `Sprites: ${this.renderedSprites}`;
    }
  }

  update(): void {
    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.frameTimes.push(dt);
    if (this.frameTimes.length > SAMPLE_SIZE) {
      this.frameTimes.shift();
    }

    this.lastAvgMs = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.lastFps = this.lastAvgMs > 0 ? 1000 / this.lastAvgMs : 0;

    this.forceUpdateText();
  }

  destroy(): void {
    this.el.remove();
  }
}
