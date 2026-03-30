import { PlayerState, NPCData, InputState, DialogueState } from './types';
import { INTERACTION_RANGE } from './constants';

/**
 * Check if player is in range of an NPC and pressing interact.
 * Returns a DialogueState if interaction should start, null otherwise.
 */
export function checkInteraction(
  player: PlayerState,
  npcs: NPCData[],
  input: InputState,
): DialogueState | null {
  if (!input.interact) return null;

  for (const npc of npcs) {
    const dx = player.x - npc.x;
    const dy = player.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= INTERACTION_RANGE) {
      return {
        npcId: npc.id,
        npcName: npc.name,
        lines: npc.dialogue,
        currentLine: 0,
      };
    }
  }

  return null;
}

/**
 * Advance dialogue to the next line.
 * Returns null if dialogue is finished (should close).
 */
export function advanceDialogue(dialogue: DialogueState): DialogueState | null {
  const nextLine = dialogue.currentLine + 1;
  if (nextLine >= dialogue.lines.length) {
    return null; // dialogue finished
  }
  return { ...dialogue, currentLine: nextLine };
}
