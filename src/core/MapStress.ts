import { Entity, MapData } from './types';

export const STRESS_OBJECT_OPTIONS = [1, 2, 4, 8, 12, 16, 20, 24] as const;

export interface StressOptions {
  objectMultiplier?: number;
}

const OFFSET_PATTERN: ReadonlyArray<readonly [number, number]> = [
  [22, 0],
  [-22, 0],
  [0, 22],
  [0, -22],
  [16, 16],
  [-16, 16],
  [16, -16],
  [-16, -16],
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function normalizeObjectMultiplier(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 1;
  const multiplier = Math.floor(value ?? 1);
  return clamp(multiplier, STRESS_OBJECT_OPTIONS[0], STRESS_OBJECT_OPTIONS[STRESS_OBJECT_OPTIONS.length - 1]);
}

function cloneStressObject(base: Entity, copyIndex: number, map: MapData): Entity {
  const pattern = OFFSET_PATTERN[copyIndex % OFFSET_PATTERN.length];
  const ring = Math.floor(copyIndex / OFFSET_PATTERN.length) + 1;
  const hash = hashString(base.id);
  const jitterX = (hash % 7) - 3;
  const jitterY = (Math.floor(hash / 7) % 7) - 3;
  const worldWidth = map.width * map.tileSize - 1;
  const worldHeight = map.height * map.tileSize - 1;
  const x = clamp(base.x + pattern[0] * ring + jitterX, 0, worldWidth);
  const y = clamp(base.y + pattern[1] * ring + jitterY, 0, worldHeight);

  return {
    ...base,
    id: `${base.id}__stress-${copyIndex + 1}`,
    x,
    y,
    sortY: y,
    // Decorative-only clone: preserves render/culling/update cost without blocking movement.
    collisionBox: { offsetX: 0, offsetY: 0, width: 0, height: 0 },
  };
}

export function buildStressMap(baseMap: MapData, options: StressOptions = {}): MapData {
  const objectMultiplier = normalizeObjectMultiplier(options.objectMultiplier);
  if (baseMap.id !== 'outdoor' || objectMultiplier === 1) {
    return baseMap;
  }

  const objects = [...baseMap.objects];
  for (let copyIndex = 0; copyIndex < objectMultiplier - 1; copyIndex++) {
    for (const baseObject of baseMap.objects) {
      objects.push(cloneStressObject(baseObject, copyIndex, baseMap));
    }
  }

  return {
    ...baseMap,
    objects,
    spawnPoints: [...baseMap.spawnPoints],
  };
}
