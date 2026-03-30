import { Position } from './types';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './constants';

/**
 * Compute camera position (top-left of viewport in world coords).
 * Centers on player, clamps to map bounds.
 * If map is smaller than viewport, centers the map.
 * Zoom affects the effective viewport size in world space.
 */
export function updateCamera(
  playerPos: Position,
  mapPixelWidth: number,
  mapPixelHeight: number,
  zoom: number = 1,
): Position {
  // The viewport in world-space pixels shrinks when zoomed in
  const viewW = VIEWPORT_WIDTH / zoom;
  const viewH = VIEWPORT_HEIGHT / zoom;

  let x = playerPos.x - viewW / 2;
  let y = playerPos.y - viewH / 2;

  if (mapPixelWidth <= viewW) {
    x = -(viewW - mapPixelWidth) / 2;
  } else {
    x = Math.max(0, Math.min(x, mapPixelWidth - viewW));
  }

  if (mapPixelHeight <= viewH) {
    y = -(viewH - mapPixelHeight) / 2;
  } else {
    y = Math.max(0, Math.min(y, mapPixelHeight - viewH));
  }

  return { x, y };
}
