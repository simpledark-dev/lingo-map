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

export function updatePlayer(
  player: PlayerState,
  input: InputState,
  delta: number,
): PlayerState {
  const hasDirectional = input.up || input.down || input.left || input.right;

  // Determine movement mode
  let mode: MovementMode = player.movementMode;
  if (hasDirectional) {
    mode = { type: 'direct' };
  } else if (input.moveTarget) {
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

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    // Update facing based on input
    if (input.down) facing = 'down';
    else if (input.up) facing = 'up';
    else if (input.left) facing = 'left';
    else if (input.right) facing = 'right';
  } else if (mode.type === 'target' && mode.target) {
    const tdx = mode.target.x - player.x;
    const tdy = mode.target.y - player.y;
    const dist = Math.sqrt(tdx * tdx + tdy * tdy);

    if (dist < CLICK_ARRIVE_THRESHOLD) {
      // Arrived
      mode = { type: 'direct' };
    } else {
      dx = tdx / dist;
      dy = tdy / dist;

      // Face dominant direction
      if (Math.abs(tdx) > Math.abs(tdy)) {
        facing = tdx > 0 ? 'right' : 'left';
      } else {
        facing = tdy > 0 ? 'down' : 'up';
      }
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
