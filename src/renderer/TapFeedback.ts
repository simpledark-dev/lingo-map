import { Graphics, Container, Sprite } from 'pixi.js';
import { getTexture } from './AssetLoader';

const INDICATOR_DURATION = 0.45; // seconds
const INDICATOR_MAX_RADIUS = 16;
const INDICATOR_COLOR = 0xffffff;
const INDICATOR_ALPHA = 0.6;
const TAP_ARROW_TEXTURE = 'ui:tap-move-down-arrow';
const TAP_ARROW_START_Y = 0;
const TAP_ARROW_END_Y = 0;

interface TapIndicator {
  graphics?: Graphics;
  sprite?: Sprite;
  elapsed: number;
  x: number;
  y: number;
}

/**
 * Tap feedback — visual ring indicator.
 * Renderer-only, does not affect gameplay.
 */
export class TapFeedback {
  private indicators: TapIndicator[] = [];
  private container: Container;

  constructor(private worldContainer: Container) {
    // Container for indicators — added to worldContainer so they move with the camera
    this.container = new Container();
    this.container.zIndex = 99999;
    this.worldContainer.addChild(this.container);
  }

  /** Call when the player taps/clicks on the map. worldX/worldY = world coordinates. */
  trigger(worldX: number, worldY: number): void {
    const arrowTexture = getTexture(TAP_ARROW_TEXTURE);
    if (arrowTexture) {
      const sprite = new Sprite(arrowTexture);
      sprite.anchor.set(0.5, 1);
      sprite.x = worldX;
      sprite.y = worldY + TAP_ARROW_START_Y;
      this.container.addChild(sprite);
      this.indicators.push({ sprite, elapsed: 0, x: worldX, y: worldY });
      return;
    }

    // Fallback ring if the UI atlas fails to load.
    const g = new Graphics();
    g.x = worldX;
    g.y = worldY;
    this.container.addChild(g);
    this.indicators.push({ graphics: g, elapsed: 0, x: worldX, y: worldY });
  }

  /** Call each frame with delta in seconds. */
  update(delta: number): void {
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const ind = this.indicators[i];
      ind.elapsed += delta;

      const progress = ind.elapsed / INDICATOR_DURATION;
      if (progress >= 1) {
        // Remove finished indicator
        if (ind.sprite) {
          this.container.removeChild(ind.sprite);
          ind.sprite.destroy();
        }
        if (ind.graphics) {
          this.container.removeChild(ind.graphics);
          ind.graphics.destroy();
        }
        this.indicators.splice(i, 1);
        continue;
      }

      if (ind.sprite) {
        const eased = 1 - (1 - progress) * (1 - progress);
        ind.sprite.x = ind.x;
        ind.sprite.y = ind.y + TAP_ARROW_START_Y + (TAP_ARROW_END_Y - TAP_ARROW_START_Y) * eased;
        ind.sprite.alpha = Math.min(1, (1 - progress) * 1.4);
        ind.sprite.scale.set(1 + 0.15 * (1 - progress));
        continue;
      }

      if (!ind.graphics) continue;

      // Draw expanding ring that fades out
      const radius = INDICATOR_MAX_RADIUS * progress;
      const alpha = INDICATOR_ALPHA * (1 - progress);

      ind.graphics.clear();
      // Outer ring
      ind.graphics.setStrokeStyle({ width: 2, color: INDICATOR_COLOR, alpha });
      ind.graphics.circle(0, 0, radius);
      ind.graphics.stroke();
      // Inner dot (shrinks)
      const dotRadius = 3 * (1 - progress);
      if (dotRadius > 0.5) {
        ind.graphics.circle(0, 0, dotRadius);
        ind.graphics.fill({ color: INDICATOR_COLOR, alpha: alpha * 0.8 });
      }
    }
  }

  destroy(): void {
    for (const ind of this.indicators) {
      ind.graphics?.destroy();
      ind.sprite?.destroy();
    }
    this.indicators = [];
    this.container.destroy();
  }
}
