import type { CSSProperties } from 'react';

export type DialogueThemeId = 'classicWood' | 'cutsceneParchment';

export interface DialogueThemeColors {
  parchment: string;
  parchmentLight: string;
  parchmentShadow: string;
  wood: string;
  woodLight: string;
  woodShadow: string;
  text: string;
  accentGold: string;
  accentGoldDark: string;
  optionRest: string;
  optionHover: string;
  optionBorder: string;
  hintText: string;
}

export interface DialogueTheme {
  id: DialogueThemeId;
  colors: DialogueThemeColors;
  frameStyle: CSSProperties;
  panelStyle: CSSProperties;
  namePlaqueStyle: CSSProperties;
  bodyTextStyle: CSSProperties;
  optionsStyle: CSSProperties;
  optionButtonStyle: CSSProperties;
  optionButtonRestShadow: string;
  optionButtonPressedShadow: string;
  optionLabelStyle: CSSProperties;
  optionHintStyle: CSSProperties;
  soonBadgeStyle: CSSProperties;
  continueMode: 'indicator' | 'button';
  continueIndicatorStyle: CSSProperties;
  footerStyle: CSSProperties;
  footerHintStyle: CSSProperties;
  continueButtonStyle: CSSProperties;
}

const baseColors: DialogueThemeColors = {
  parchment: '#fbe9b8',
  parchmentLight: '#fff5d6',
  parchmentShadow: '#e2cb88',
  wood: '#5b3a1f',
  woodLight: '#8b5a2b',
  woodShadow: '#3a2410',
  text: '#3d2410',
  accentGold: '#c97f1a',
  accentGoldDark: '#8b4f10',
  optionRest: '#f0d28a',
  optionHover: '#fff0b8',
  optionBorder: '#6b3f1a',
  hintText: '#7b5530',
};

const fontFamily = 'var(--font-geist-mono), ui-monospace, "Courier New", monospace';

export const DIALOGUE_THEMES: Record<DialogueThemeId, DialogueTheme> = {
  classicWood: {
    id: 'classicWood',
    colors: baseColors,
    frameStyle: {
      background: baseColors.wood,
      border: `3px solid ${baseColors.woodShadow}`,
      boxShadow: `0 4px 0 0 ${baseColors.woodShadow}`,
      padding: 4,
      imageRendering: 'pixelated',
      fontFamily,
      maxWidth: 720,
      marginLeft: 'auto',
      marginRight: 'auto',
    },
    panelStyle: {
      background: baseColors.parchment,
      border: `2px solid ${baseColors.woodLight}`,
      boxShadow: `inset 2px 2px 0 0 ${baseColors.parchmentLight}, inset -2px -2px 0 0 ${baseColors.parchmentShadow}`,
      padding: '14px 16px 12px',
    },
    namePlaqueStyle: {
      color: baseColors.accentGoldDark,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      borderBottom: `2px solid ${baseColors.accentGold}`,
      paddingBottom: 4,
      marginBottom: 10,
      display: 'inline-block',
    },
    bodyTextStyle: {
      color: baseColors.text,
      fontSize: 15,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
    },
    optionsStyle: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginTop: 4,
    },
    optionButtonStyle: {
      textAlign: 'left',
      padding: '8px 12px',
      background: baseColors.optionRest,
      border: `2px solid ${baseColors.optionBorder}`,
      fontFamily: 'inherit',
      color: baseColors.text,
      transition: 'transform 80ms ease-out, background 120ms',
    },
    optionButtonRestShadow: `inset 1px 1px 0 0 ${baseColors.parchmentLight}, 0 2px 0 0 ${baseColors.optionBorder}`,
    optionButtonPressedShadow: `inset 1px 1px 0 0 ${baseColors.parchmentLight}`,
    optionLabelStyle: {
      fontSize: 14,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    optionHintStyle: {
      fontSize: 11,
      color: baseColors.hintText,
      marginTop: 3,
      lineHeight: 1.4,
    },
    soonBadgeStyle: {
      fontSize: 9,
      background: baseColors.hintText,
      color: baseColors.parchmentLight,
      padding: '1px 6px',
      letterSpacing: 1,
      fontWeight: 700,
    },
    continueMode: 'indicator',
    continueIndicatorStyle: {
      color: baseColors.accentGoldDark,
      fontSize: 11,
      textAlign: 'right',
      marginTop: 4,
      animation: 'lingoMapDialogueBlink 1.1s ease-in-out infinite',
    },
    footerStyle: {},
    footerHintStyle: {},
    continueButtonStyle: {},
  },
  cutsceneParchment: {
    id: 'cutsceneParchment',
    colors: {
      ...baseColors,
      woodLight: '#6b3f1a',
      optionBorder: '#6b3f1a',
      optionRest: '#fff5d6',
      optionHover: '#fff9e6',
    },
    frameStyle: {
      width: '100%',
      maxWidth: 720,
      marginLeft: 'auto',
      marginRight: 'auto',
      background: baseColors.parchment,
      border: `3px solid ${baseColors.optionBorder}`,
      borderRadius: 8,
      boxShadow: `inset 2px 2px 0 0 ${baseColors.parchmentLight}, inset -2px -2px 0 0 ${baseColors.parchmentShadow}, 0 6px 0 0 #2a1a0a`,
      padding: 18,
      color: baseColors.text,
      minHeight: 132,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      imageRendering: 'pixelated',
      fontFamily,
    },
    panelStyle: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      minHeight: 0,
    },
    namePlaqueStyle: {
      color: baseColors.accentGoldDark,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      borderBottom: `2px solid ${baseColors.accentGold}`,
      paddingBottom: 4,
      display: 'inline-block',
      alignSelf: 'flex-start',
    },
    bodyTextStyle: {
      color: baseColors.text,
      fontSize: 14,
      lineHeight: 1.5,
      minHeight: 48,
      whiteSpace: 'pre-wrap',
    },
    optionsStyle: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    optionButtonStyle: {
      textAlign: 'left',
      padding: '8px 12px',
      background: '#fff5d6',
      border: `2px solid ${baseColors.optionBorder}`,
      borderRadius: 4,
      fontFamily: 'inherit',
      color: baseColors.text,
      transition: 'transform 80ms ease-out, background 120ms, opacity 120ms',
    },
    optionButtonRestShadow: `inset 1px 1px 0 0 ${baseColors.parchmentLight}, 0 2px 0 0 ${baseColors.optionBorder}`,
    optionButtonPressedShadow: `inset 1px 1px 0 0 ${baseColors.parchmentLight}`,
    optionLabelStyle: {
      fontSize: 14,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    optionHintStyle: {
      fontSize: 11,
      color: baseColors.hintText,
      marginTop: 3,
      lineHeight: 1.4,
    },
    soonBadgeStyle: {
      fontSize: 9,
      background: baseColors.hintText,
      color: baseColors.parchmentLight,
      padding: '1px 6px',
      borderRadius: 3,
      letterSpacing: 1,
      fontWeight: 700,
    },
    continueMode: 'button',
    continueIndicatorStyle: {},
    footerStyle: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'space-between',
      marginTop: 4,
    },
    footerHintStyle: {
      fontSize: 10,
      color: baseColors.hintText,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    continueButtonStyle: {
      background: baseColors.accentGold,
      color: '#fdf6e0',
      border: `2px solid ${baseColors.optionBorder}`,
      borderRadius: 4,
      padding: '6px 14px',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.5,
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
  },
};

export const ACTIVE_DIALOGUE_THEME_ID: DialogueThemeId = 'cutsceneParchment';

export function getDialogueTheme(id: DialogueThemeId = ACTIVE_DIALOGUE_THEME_ID): DialogueTheme {
  return DIALOGUE_THEMES[id];
}
