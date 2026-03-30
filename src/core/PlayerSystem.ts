import { PlayerState, InputState, Direction, MovementMode, SpawnPoint } from './types';
import { PLAYER_SPEED, CLICK_ARRIVE_THRESHOLD } from './constants';

export function createPlayer(spawn: SpawnPoint): PlayerState {
  return {
    id: 'player',
    x: spawn.x,
    y: spawn.y,
    spriteKey: `player-${spawn.facing}`,
    anchor: { x: 0.5, y: 1.0 },
    sortY: spawn.y,
    collisionBox: { offsetX: -10, offsetY: -12, width: 20, height: 12 },
    facing: spawn.facing,
    movementMode: { type: 'direct' },
  };
}

function faceDirection(tdx: number, tdy: number): Direction {
  if (Math.abs(tdx) > Math.abs(tdy)) {
    return tdx > 0 ? 'right' : 'left';
  }
  return tdy > 0 ? 'down' : 'up';
}

export function updatePlayer(
  player: PlayerState,
  input: InputState,
  delta: number,
): PlayerState {
  const hasDirectional = input.up || input.down || input.left || input.right;

  // Determine movement mode
  let mode: MovementMode = player.movementMode;
  if (hasDirectional) {
    // Keyboard always cancels any path/target movement
    mode = { type: 'direct' };
  } else if (input.moveTarget) {
    // New tap — will be converted to path by PixiApp before reaching here,
    // but fallback to straight-line if no path was set
    mode = { type: 'target', target: input.moveTarget };
  }

  let dx = 0;
  let dy = 0;
  let facing: Direction = player.facing;

  if (mode.type === 'direct') {
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    if (input.down) facing = 'down';
    else if (input.up) facing = 'up';
    else if (input.left) facing = 'left';
    else if (input.right) facing = 'right';

  } else if (mode.type === 'path' && mode.waypoints && mode.waypoints.length > 0) {
    // Follow the next waypoint
    const wp = mode.waypoints[0];
    const tdx = wp.x - player.x;
    const tdy = wp.y - player.y;
    const dist = Math.sqrt(tdx * tdx + tdy * tdy);

    if (dist < CLICK_ARRIVE_THRESHOLD) {
      // Reached this waypoint — advance to next
      const remaining = mode.waypoints.slice(1);
      if (remaining.length === 0) {
        mode = { type: 'direct' };
      } else {
        mode = { type: 'path', waypoints: remaining };
        // Move toward the new next waypoint this frame
        const nwp = remaining[0];
        const ndx = nwp.x - player.x;
        const ndy = nwp.y - player.y;
        const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
        if (ndist > CLICK_ARRIVE_THRESHOLD) {
          dx = ndx / ndist;
          dy = ndy / ndist;
          facing = faceDirection(ndx, ndy);
        }
      }
    } else {
      dx = tdx / dist;
      dy = tdy / dist;
      facing = faceDirection(tdx, tdy);
    }

  } else if (mode.type === 'target' && mode.target) {
    // Straight-line fallback (no path found, or short distance)
    const tdx = mode.target.x - player.x;
    const tdy = mode.target.y - player.y;
    const dist = Math.sqrt(tdx * tdx + tdy * tdy);

    if (dist < CLICK_ARRIVE_THRESHOLD) {
      mode = { type: 'direct' };
    } else {
      dx = tdx / dist;
      dy = tdy / dist;
      facing = faceDirection(tdx, tdy);
    }
  }

  const speed = PLAYER_SPEED * delta;
  const newX = player.x + dx * speed;
  const newY = player.y + dy * speed;

  return {
    ...player,
    x: newX,
    y: newY,
    sortY: newY,
    facing,
    spriteKey: `player-${facing}`,
    movementMode: mode,
  };
}
