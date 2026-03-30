import { NPCData, Position } from './types';

const NPC_SPEED = 40; // pixels per second — slower than player
const ARRIVE_THRESHOLD = 4;
const MIN_IDLE_TIME = 2.0; // seconds
const MAX_IDLE_TIME = 6.0;

export interface NPCWanderState {
  npcId: string;
  spawnX: number;
  spawnY: number;
  currentX: number;
  currentY: number;
  state: 'idle' | 'walking';
  target: Position | null;
  idleTimer: number; // seconds remaining in idle state
  wanderRadius: number;
  wanderBounds: { x: number; y: number; width: number; height: number } | null;
}

// Simple seeded random per-NPC
function hashRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 10000) / 10000;
  };
}

/**
 * Initialize wander states for all NPCs that have wanderRadius set.
 * NPCs without wanderRadius are excluded (they stay still).
 */
export function initWanderStates(npcs: NPCData[]): NPCWanderState[] {
  const states: NPCWanderState[] = [];
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (!npc.wanderRadius || npc.wanderRadius <= 0) continue;
    const r = hashRand(i * 7919 + 42);
    states.push({
      npcId: npc.id,
      spawnX: npc.x,
      spawnY: npc.y,
      currentX: npc.x,
      currentY: npc.y,
      state: 'idle',
      target: null,
      idleTimer: MIN_IDLE_TIME + r() * (MAX_IDLE_TIME - MIN_IDLE_TIME),
      wanderRadius: npc.wanderRadius,
      wanderBounds: npc.wanderBounds ?? null,
    });
  }
  return states;
}

/**
 * Update all NPC wander states. Pure function-style (mutates states in place for perf).
 * Returns the list of NPC position updates for the renderer.
 */
export function updateWanderStates(
  states: NPCWanderState[],
  delta: number,
  isWalkable: (x: number, y: number) => boolean,
): void {
  for (const s of states) {
    if (s.state === 'idle') {
      s.idleTimer -= delta;
      if (s.idleTimer <= 0) {
        // Pick a random walk target within wander radius/bounds
        const target = pickWanderTarget(s, isWalkable);
        if (target) {
          s.target = target;
          s.state = 'walking';
        } else {
          // Couldn't find a walkable target, reset idle
          s.idleTimer = MIN_IDLE_TIME + Math.random() * (MAX_IDLE_TIME - MIN_IDLE_TIME);
        }
      }
    } else if (s.state === 'walking' && s.target) {
      const dx = s.target.x - s.currentX;
      const dy = s.target.y - s.currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ARRIVE_THRESHOLD) {
        // Arrived — go idle
        s.state = 'idle';
        s.target = null;
        s.idleTimer = MIN_IDLE_TIME + Math.random() * (MAX_IDLE_TIME - MIN_IDLE_TIME);
      } else {
        // Move toward target
        const speed = NPC_SPEED * delta;
        const step = Math.min(speed, dist);
        s.currentX += (dx / dist) * step;
        s.currentY += (dy / dist) * step;
      }
    }
  }
}

function pickWanderTarget(s: NPCWanderState, isWalkable: (x: number, y: number) => boolean): Position | null {
  // Try up to 10 random positions
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 32 + Math.random() * (s.wanderRadius - 32);
    let tx = s.spawnX + Math.cos(angle) * dist;
    let ty = s.spawnY + Math.sin(angle) * dist;

    // Clamp to bounds if set
    if (s.wanderBounds) {
      const b = s.wanderBounds;
      tx = Math.max(b.x, Math.min(b.x + b.width, tx));
      ty = Math.max(b.y, Math.min(b.y + b.height, ty));
    }

    // Clamp to radius
    const dx = tx - s.spawnX;
    const dy = ty - s.spawnY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > s.wanderRadius) {
      tx = s.spawnX + (dx / d) * s.wanderRadius;
      ty = s.spawnY + (dy / d) * s.wanderRadius;
    }

    if (isWalkable(tx, ty)) {
      return { x: tx, y: ty };
    }
  }
  return null;
}
