import { PlayerState, NPCData, InputState, DialogueState } from "./types";
import { INTERACTION_RANGE } from "./constants";
import { getVocabularyPack } from "../data/vocabularyPacks";

/**
 * Check if player is in range of an NPC and pressing interact.
 * Returns a DialogueState if interaction should start, null otherwise.
 *
 * Two flavours of dialogue:
 *   - NPC has `vocabularyPackId` → translator-job OFFER dialog with
 *     two options (View dictionary / Help translate). Options aren't
 *     wired to actions yet; they're rendered as static buttons.
 *   - NPC has no pack → standard line-by-line chat using `dialogue[]`.
 */
export function checkInteraction(
  player: PlayerState,
  npcs: NPCData[],
  input: InputState
): DialogueState | null {
  if (!input.interact) return null;

  for (const npc of npcs) {
    const dx = player.x - npc.x;
    const dy = player.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > INTERACTION_RANGE) continue;

    if (npc.vocabularyPackId) {
      const pack = getVocabularyPack(npc.vocabularyPackId);
      const wordCount = pack?.entries.length ?? 0;
      return {
        npcId: npc.id,
        npcName: npc.name,
        lines: [
          "Hey! You are the new translator in town, right? I'm really struggling with these words. Can you help me?",
        ],
        currentLine: 0,
        vocabularyPackId: npc.vocabularyPackId,
        vocabularyWordCount: wordCount,
        options: [
          {
            id: "help",
            label: "1. Sure, I'll give it a shot",
            hint: "Earn coins for every word you get right. Wrong ones will cost you.",
          },
          {
            id: "view",
            label: `2. Let me look them over first (${wordCount})`,
            hint: "Browse the list, hear how they sound, practice freely — no coins on the line.",
          },
        ],
      };
    }

    return {
      npcId: npc.id,
      npcName: npc.name,
      lines: npc.dialogue,
      currentLine: 0,
    };
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
