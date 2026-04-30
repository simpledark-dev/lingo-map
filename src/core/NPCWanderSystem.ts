import { NPCData, Position, Direction } from './types';

const NPC_SPEED = 40; // pixels per second — slower than player
const ARRIVE_THRESHOLD = 4;
const MIN_IDLE_TIME = 2.0; // seconds
const MAX_IDLE_TIME = 6.0;
// Walk-anim cadence — same period the player uses (RenderSystem
// WALK_FRAME_DURATION). Drives the idle ↔ walk1 alternation.
const NPC_WALK_FRAME_DURATION = 0.18;

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
  // Facing direction the NPC's sprite should show. Updated whenever a
  // walk target is chosen (locked in for the walk leg). Used by the
  // renderer to look up directional textures when the NPC's spriteKey
  // is a Modern-Interiors character prefix; ignored for legacy
  // single-texture NPCs.
  facing: Direction;
  // Tiny state machine for the 2-frame walk cycle (idle/walk1) — same
  // shape the player uses, but per-NPC.
  walkTimer: number;
  walkFrame: 0 | 1;
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
      facing: 'down',
      walkTimer: 0,
      walkFrame: 0,
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
      // Reset walk-anim cycle while idling so the next walk leg starts
      // clean on the idle frame (avoids snapping mid-step on resume).
      s.walkTimer = 0;
      s.walkFrame = 0;
      s.idleTimer -= delta;
      if (s.idleTimer <= 0) {
        // Pick a random walk target within wander radius/bounds
        const target = pickWanderTarget(s, isWalkable);
        if (target) {
          s.target = target;
          s.state = 'walking';
          // Lock the facing for this walk leg based on dominant axis.
          // Done once at leg start (rather than per frame) so a small
          // floating-point wobble near the target doesn't cause the
          // NPC to flicker between facings on the last few pixels.
          const dx = target.x - s.currentX;
          const dy = target.y - s.currentY;
          s.facing = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up');
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
        // Advance the 2-frame walk cycle.
        s.walkTimer += delta;
        if (s.walkTimer >= NPC_WALK_FRAME_DURATION) {
          s.walkTimer -= NPC_WALK_FRAME_DURATION;
          s.walkFrame = s.walkFrame === 0 ? 1 : 0;
        }
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
