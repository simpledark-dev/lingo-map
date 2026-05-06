import type { NPCData } from '../core/types';
import { t } from './i18n';

export function getNpcDialogueLines(npc: NPCData): string[] {
  if (npc.dialogueKeys?.length) {
    return npc.dialogueKeys.map((key) => t(key));
  }
  return npc.dialogue.length > 0 ? npc.dialogue : [t('common.unknown')];
}

export function getNpcFirstDialogueLine(npc: NPCData): string {
  return getNpcDialogueLines(npc)[0] ?? t('common.unknown');
}

export function getNpcVocabularyOfferLine(npc: NPCData): string {
  if (npc.vocabularyOfferLineKey) return t(npc.vocabularyOfferLineKey);
  return npc.vocabularyOfferLine ?? t('dialogue.offer.generic');
}
