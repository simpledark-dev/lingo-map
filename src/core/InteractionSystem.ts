import { PlayerState, NPCData, InputState, DialogueState } from "./types";
import { INTERACTION_RANGE } from "./constants";
import { getVocabularyPack } from "../data/vocabularyPacks";
import { t } from "../data/i18n";
import {
  getNpcDialogueLines,
  getNpcFirstDialogueLine,
  getNpcVocabularyOfferLine,
} from "../data/npcDialogue";

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
  input: InputState,
): DialogueState | null {
  if (!input.interact) return null;

  for (const npc of npcs) {
    const dx = player.x - npc.x;
    const dy = player.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > INTERACTION_RANGE) continue;

    // Shopkeeper short-circuit: 2-option offer that the React layer
    // routes to ShopView. Reuses the dialogue-options infra rather
    // than introducing a separate "shop interaction" event type.
    if (npc.shopName) {
      return {
        npcId: npc.id,
        npcName: npc.name,
        lines: [t('shop.welcome', { name: npc.shopName })],
        currentLine: 0,
        options: [
          { id: "shop-browse", label: t('shop.option.browse') },
          { id: "shop-leave", label: t('shop.option.leave') },
        ],
      };
    }

    // Quest NPC short-circuit: emits a dialogue with a `dialogueKind`
    // marker, and the React layer rewrites the lines based on
    // current inventory / flag state. The static lines below are a
    // safe fallback if React doesn't override (e.g. during init
    // before the listener is attached).
    if (npc.dialogueKind) {
      return {
        npcId: npc.id,
        npcName: npc.name,
        lines: [getNpcFirstDialogueLine(npc)],
        currentLine: 0,
        dialogueKind: npc.dialogueKind,
      };
    }

    if (npc.vocabularyPackId) {
      const pack = getVocabularyPack(npc.vocabularyPackId);
      const wordCount = pack?.entries.length ?? 0;
      // Prefer the NPC's own offer line so each character pitches the
      // job in their own voice. Falls back to a generic line for any
      // NPC that's been given a pack but no line yet.
      const offerLine = getNpcVocabularyOfferLine(npc);
      return {
        npcId: npc.id,
        npcName: npc.name,
        lines: [offerLine],
        currentLine: 0,
        vocabularyPackId: npc.vocabularyPackId,
        vocabularyWordCount: wordCount,
        options: [
          {
            id: "help",
            label: t('dialogue.offer.help'),
            hint: t('dialogue.offer.helpHint'),
          },
          {
            id: "view",
            label: t('dialogue.offer.view', { count: wordCount }),
            hint: t('dialogue.offer.viewHint'),
          },
          {
            id: "decline",
            label: t('dialogue.offer.decline'),
            hint: "",
          },
        ],
      };
    }

    return {
      npcId: npc.id,
      npcName: npc.name,
      lines: getNpcDialogueLines(npc),
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
