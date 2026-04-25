import { MapData, Position } from './types';

/** Compute the visible viewport size in world pixels. If the map has a
 * `maxViewTiles` cap, the viewport shrinks to at most that many tiles —
 * independent of user zoom. The rest of the canvas is meant to render black
 * (see RenderSystem's mask), and the camera will scroll within the map once
 * the player approaches the edge of this window. */
export function getViewportWorldSize(
  map: Pick<MapData, 'tileSize' | 'maxViewTiles'>,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
): { viewW: number; viewH: number } {
  const uncappedW = canvasWidth / zoom;
  const uncappedH = canvasHeight / zoom;
  if (!map.maxViewTiles) return { viewW: uncappedW, viewH: uncappedH };
  return {
    viewW: Math.min(uncappedW, map.maxViewTiles.width * map.tileSize),
    viewH: Math.min(uncappedH, map.maxViewTiles.height * map.tileSize),
  };
}

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
  canvasWidth: number = 800,
  canvasHeight: number = 480,
  viewportCap?: { viewW: number; viewH: number },
): Position {
  // Default viewport is the canvas at current zoom. A cap (e.g. for interior
  // maps with `maxViewTiles`) shrinks it further so the visible area is
  // smaller than the canvas and the edges render as black margins.
  const viewW = viewportCap?.viewW ?? canvasWidth / zoom;
  const viewH = viewportCap?.viewH ?? canvasHeight / zoom;

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
