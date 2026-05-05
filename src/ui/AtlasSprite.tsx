'use client';

/**
 * Render a single frame from `me-char-atlas` as a CSS-positioned
 * background image. Shared by the intro cutscene and any other UI
 * that wants to inline a character portrait without booting Pixi.
 *
 * Two-div trick: inner is at the atlas's native 16×32 with the
 * background-position cropped to the frame; outer wraps it at the
 * scaled-up display size so layout reserves the right footprint.
 * `image-rendering: pixelated` keeps the look crisp at any scale.
 */

import { useEffect, useState, type CSSProperties } from 'react';

type AtlasFrame = [number, number, number, number]; // x, y, w, h
type AtlasJson = {
  image: string;
  cellWidth: number;
  cellHeight: number;
  frames: Record<string, AtlasFrame>;
};

let atlasCache: AtlasJson | null = null;
let atlasFetchPromise: Promise<AtlasJson | null> | null = null;
const ATLAS_JSON_URL = '/assets/me-char-atlas.json';
// PNG over WebP — both ship; PNG is widely supported with no
// surprises across the browsers we target.
const ATLAS_IMAGE_URL = '/assets/me-char-atlas.png';

function loadAtlas(): Promise<AtlasJson | null> {
  if (atlasCache) return Promise.resolve(atlasCache);
  if (atlasFetchPromise) return atlasFetchPromise;
  atlasFetchPromise = fetch(ATLAS_JSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && typeof j === 'object' && 'frames' in j) {
        atlasCache = j as AtlasJson;
        return atlasCache;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      atlasFetchPromise = null;
    });
  return atlasFetchPromise;
}

interface AtlasSpriteProps {
  /** Frame key into `me-char-atlas.json`, e.g. `me-char-07-down`. */
  atlasKey: string;
  /** Integer scale factor — atlas frames are 16×32, so SCALE 4
   *  renders at 64×128. */
  scale?: number;
  /** Additional style applied to the outer wrapper. Useful for
   *  centering / spacing in flex layouts. */
  style?: CSSProperties;
  /** Accessibility label. Falls back to the atlas key. */
  ariaLabel?: string;
}

export default function AtlasSprite({
  atlasKey,
  scale = 4,
  style,
  ariaLabel,
}: AtlasSpriteProps) {
  const [atlas, setAtlas] = useState<AtlasJson | null>(atlasCache);

  useEffect(() => {
    if (atlas) return;
    let cancelled = false;
    loadAtlas().then((a) => {
      if (!cancelled) setAtlas(a);
    });
    return () => {
      cancelled = true;
    };
  }, [atlas]);

  const frame = atlas?.frames[atlasKey];
  // Layout placeholder while atlas is loading — match the post-load
  // size so the surrounding layout doesn't reflow when the sprite
  // appears.
  const placeholderStyle: CSSProperties = atlas
    ? { width: 16 * scale, height: 32 * scale }
    : { width: 16 * scale, height: 32 * scale, opacity: 0.4, background: 'rgba(0,0,0,0.1)' };

  if (!frame) {
    return <div style={{ ...placeholderStyle, ...style }} aria-label={ariaLabel ?? atlasKey} />;
  }

  return (
    <div
      style={{
        width: frame[2] * scale,
        height: frame[3] * scale,
        overflow: 'hidden',
        ...style,
      }}
      aria-label={ariaLabel ?? atlasKey}
    >
      <div
        style={{
          width: frame[2],
          height: frame[3],
          backgroundImage: `url(${ATLAS_IMAGE_URL})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `-${frame[0]}px -${frame[1]}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
