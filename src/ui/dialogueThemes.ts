import { ACTIVE_UI_THEME_ID, getUiTheme, UI_THEMES } from './uiThemes';
import type { DialogueTheme, UIThemeColors, UIThemeId } from './uiThemes';

export type DialogueThemeId = UIThemeId;
export type DialogueThemeColors = UIThemeColors;
export type { DialogueTheme };

export const ACTIVE_DIALOGUE_THEME_ID: DialogueThemeId = ACTIVE_UI_THEME_ID;

export const DIALOGUE_THEMES: Record<DialogueThemeId, DialogueTheme> = {
  classicWood: UI_THEMES.classicWood.dialogue,
  cutsceneParchment: UI_THEMES.cutsceneParchment.dialogue,
};

export function getDialogueTheme(id?: DialogueThemeId): DialogueTheme {
  return getUiTheme(id).dialogue;
}
