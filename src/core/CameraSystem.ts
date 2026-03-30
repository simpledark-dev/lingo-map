import { Position } from './types';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './constants';

/**
 * Compute camera position (top-left of viewport in world coords).
 * Centers on player, clamps to map bounds.
 * If map is smaller than viewport, centers the map.
 */
export function updateCamera(
  playerPos: Position,
  mapPixelWidth: number,
  mapPixelHeight: number,
): Position {
  let x = playerPos.x - VIEWPORT_WIDTH / 2;
  let y = playerPos.y - VIEWPORT_HEIGHT / 2;

  if (mapPixelWidth <= VIEWPORT_WIDTH) {
    x = -(VIEWPORT_WIDTH - mapPixelWidth) / 2;
  } else {
    x = Math.max(0, Math.min(x, mapPixelWidth - VIEWPORT_WIDTH));
  }

  if (mapPixelHeight <= VIEWPORT_HEIGHT) {
    y = -(VIEWPORT_HEIGHT - mapPixelHeight) / 2;
  } else {
    y = Math.max(0, Math.min(y, mapPixelHeight - VIEWPORT_HEIGHT));
  }

  return { x, y };
}
