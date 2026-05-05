import type { CSSProperties } from "react";

export type UIThemeId = "classicWood" | "cutsceneParchment";

export interface UIThemeColors {
  parchment: string;
  parchmentLight: string;
  parchmentShadow: string;
  wood: string;
  woodLight: string;
  woodShadow: string;
  text: string;
  accentGold: string;
  accentGoldDark: string;
  cardRest: string;
  cardActive: string;
  cardBorder: string;
  optionRest: string;
  optionHover: string;
  optionBorder: string;
  hintText: string;
  speakerBg: string;
  speakerBgActive: string;
  correct: string;
  correctBg: string;
  wrong: string;
  wrongBg: string;
  coinGold: string;
  coinGoldDark: string;
  energyAccent: string;
  eatBtn: string;
  eatBtnDisabled: string;
  buyEnabled: string;
  buyDisabled: string;
  active: string;
  done: string;
  available: string;
  warn: string;
  warnBg: string;
  skyTop: string;
  skyBottom: string;
}

export interface DialogueTheme {
  id: UIThemeId;
  colors: UIThemeColors;
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
  continueMode: "indicator" | "button";
  continueIndicatorStyle: CSSProperties;
  footerStyle: CSSProperties;
  footerHintStyle: CSSProperties;
  continueButtonStyle: CSSProperties;
}

export interface ModalTheme {
  panelStyle: CSSProperties;
}

export interface HudTheme {
  statusRowStyle: CSSProperties;
  statusPlateStyle: CSSProperties;
  debtPlateStyle: CSSProperties;
  energyPlateStyle: CSSProperties;
  inventoryButtonStyle: CSSProperties;
  inventoryChipStyle: CSSProperties;
  iconGroupStyle: CSSProperties;
  iconButtonStyle: CSSProperties;
}

export interface UITheme {
  id: UIThemeId;
  colors: UIThemeColors;
  dialogue: DialogueTheme;
  modal: ModalTheme;
  hud: HudTheme;
}

const fontFamily =
  'var(--font-geist-mono), ui-monospace, "Courier New", monospace';

const sharedStatusColors = {
  correct: "#5d8a3a",
  correctBg: "#cde0a3",
  wrong: "#a14535",
  wrongBg: "#e6a99c",
  coinGold: "#d9a429",
  coinGoldDark: "#9a6e16",
  energyAccent: "#3b87a6",
  eatBtn: "#5d8a3a",
  eatBtnDisabled: "#9c8460",
  buyEnabled: "#5d8a3a",
  buyDisabled: "#9c8460",
  active: "#c97f1a",
  done: "#5d8a3a",
  available: "#6b8aa1",
  warn: "#a14535",
  warnBg: "#f0c7b8",
  skyTop: "#9ec7e8",
  skyBottom: "#f6c790",
};

const classicColors: UIThemeColors = {
  parchment: "#fbe9b8",
  parchmentLight: "#fff5d6",
  parchmentShadow: "#e2cb88",
  wood: "#5b3a1f",
  woodLight: "#8b5a2b",
  woodShadow: "#3a2410",
  text: "#3d2410",
  accentGold: "#c97f1a",
  accentGoldDark: "#8b4f10",
  cardRest: "#f0d28a",
  cardActive: "#fff0b8",
  cardBorder: "#6b3f1a",
  optionRest: "#f0d28a",
  optionHover: "#fff0b8",
  optionBorder: "#6b3f1a",
  hintText: "#7b5530",
  speakerBg: "#e8c896",
  speakerBgActive: "#fff0b8",
  ...sharedStatusColors,
};

const cutsceneColors: UIThemeColors = {
  ...classicColors,
  cardRest: "#fff5d6",
  cardActive: "#fff9e6",
  optionRest: "#fff5d6",
  optionHover: "#fff9e6",
  speakerBg: "#fff5d6",
  speakerBgActive: "#fff9e6",
};

function buildClassicDialogue(colors: UIThemeColors): DialogueTheme {
  return {
    id: "classicWood",
    colors,
    frameStyle: {
      background: colors.wood,
      border: `3px solid ${colors.woodShadow}`,
      boxShadow: `0 4px 0 0 ${colors.woodShadow}`,
      padding: 4,
      imageRendering: "pixelated",
      fontFamily,
      maxWidth: 720,
      marginLeft: "auto",
      marginRight: "auto",
    },
    panelStyle: {
      background: colors.parchment,
      border: `2px solid ${colors.woodLight}`,
      boxShadow: `inset 2px 2px 0 0 ${colors.parchmentLight}, inset -2px -2px 0 0 ${colors.parchmentShadow}`,
      padding: "14px 16px 12px",
    },
    namePlaqueStyle: {
      color: colors.accentGoldDark,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      borderBottom: `2px solid ${colors.accentGold}`,
      paddingBottom: 4,
      marginBottom: 10,
      display: "inline-block",
    },
    bodyTextStyle: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 1.5,
      whiteSpace: "pre-wrap",
    },
    optionsStyle: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginTop: 4,
    },
    optionButtonStyle: {
      textAlign: "left",
      padding: "8px 12px",
      background: colors.optionRest,
      border: `2px solid ${colors.optionBorder}`,
      fontFamily: "inherit",
      color: colors.text,
      transition: "transform 80ms ease-out, background 120ms",
    },
    optionButtonRestShadow: `inset 1px 1px 0 0 ${colors.parchmentLight}, 0 2px 0 0 ${colors.optionBorder}`,
    optionButtonPressedShadow: `inset 1px 1px 0 0 ${colors.parchmentLight}`,
    optionLabelStyle: {
      fontSize: 14,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    optionHintStyle: {
      fontSize: 11,
      color: colors.hintText,
      marginTop: 3,
      lineHeight: 1.4,
    },
    soonBadgeStyle: {
      fontSize: 9,
      background: colors.hintText,
      color: colors.parchmentLight,
      padding: "1px 6px",
      letterSpacing: 1,
      fontWeight: 700,
    },
    continueMode: "indicator",
    continueIndicatorStyle: {
      color: colors.accentGoldDark,
      fontSize: 11,
      textAlign: "right",
      marginTop: 4,
      animation: "lingoMapDialogueBlink 1.1s ease-in-out infinite",
    },
    footerStyle: {},
    footerHintStyle: {},
    continueButtonStyle: {},
  };
}

function buildCutsceneDialogue(colors: UIThemeColors): DialogueTheme {
  return {
    id: "cutsceneParchment",
    colors,
    frameStyle: {
      width: "100%",
      maxWidth: 720,
      marginLeft: "auto",
      marginRight: "auto",
      background: colors.parchment,
      border: `3px solid ${colors.cardBorder}`,
      borderRadius: 8,
      boxShadow: `inset 2px 2px 0 0 ${colors.parchmentLight}, inset -2px -2px 0 0 ${colors.parchmentShadow}, 0 6px 0 0 #2a1a0a`,
      padding: 18,
      color: colors.text,
      minHeight: 132,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      imageRendering: "pixelated",
      fontFamily,
    },
    panelStyle: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minHeight: 0,
    },
    namePlaqueStyle: {
      color: colors.accentGoldDark,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: "uppercase",
      borderBottom: `2px solid ${colors.accentGold}`,
      paddingBottom: 4,
      display: "inline-block",
      alignSelf: "flex-start",
    },
    bodyTextStyle: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 1.5,
      minHeight: 48,
      whiteSpace: "pre-wrap",
    },
    optionsStyle: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
    },
    optionButtonStyle: {
      textAlign: "left",
      padding: "8px 12px",
      background: colors.optionRest,
      border: `2px solid ${colors.optionBorder}`,
      borderRadius: 4,
      fontFamily: "inherit",
      color: colors.text,
      transition: "transform 80ms ease-out, background 120ms, opacity 120ms",
    },
    optionButtonRestShadow: `inset 1px 1px 0 0 ${colors.parchmentLight}, 0 2px 0 0 ${colors.optionBorder}`,
    optionButtonPressedShadow: `inset 1px 1px 0 0 ${colors.parchmentLight}`,
    optionLabelStyle: {
      fontSize: 14,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    optionHintStyle: {
      fontSize: 11,
      color: colors.hintText,
      marginTop: 3,
      lineHeight: 1.4,
    },
    soonBadgeStyle: {
      fontSize: 9,
      background: colors.hintText,
      color: colors.parchmentLight,
      padding: "1px 6px",
      borderRadius: 3,
      letterSpacing: 1,
      fontWeight: 700,
    },
    continueMode: "button",
    continueIndicatorStyle: {},
    footerStyle: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      justifyContent: "space-between",
      marginTop: 4,
    },
    footerHintStyle: {
      fontSize: 10,
      color: colors.hintText,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    continueButtonStyle: {
      background: colors.accentGold,
      color: "#fdf6e0",
      border: `2px solid ${colors.optionBorder}`,
      borderRadius: 4,
      padding: "6px 14px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.5,
      cursor: "pointer",
      fontFamily: "inherit",
    },
  };
}

function buildModalTheme(colors: UIThemeColors, id: UIThemeId): ModalTheme {
  return {
    panelStyle: {
      background: colors.parchment,
      border:
        id === "classicWood"
          ? `3px solid ${colors.woodShadow}`
          : `3px solid ${colors.cardBorder}`,
      borderRadius: id === "classicWood" ? 0 : 8,
      boxShadow:
        id === "classicWood"
          ? `inset 2px 2px 0 0 ${colors.parchmentLight}, inset -2px -2px 0 0 ${colors.parchmentShadow}, 0 4px 0 0 ${colors.woodShadow}`
          : `inset 2px 2px 0 0 ${colors.parchmentLight}, inset -2px -2px 0 0 ${colors.parchmentShadow}, 0 6px 0 0 #2a1a0a`,
      imageRendering: "pixelated",
      fontFamily,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      color: colors.text,
    },
  };
}

function buildHudTheme(colors: UIThemeColors, id: UIThemeId): HudTheme {
  const shadowColor = id === "classicWood" ? colors.woodShadow : "#2a1a0a";
  const panelBackground = id === "classicWood" ? colors.cardRest : colors.parchment;
  const plateBase: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 9px",
    background: panelBackground,
    border: `2px solid ${colors.cardBorder}`,
    borderRadius: id === "classicWood" ? 0 : 4,
    boxShadow: `inset 1px 1px 0 0 ${colors.parchmentLight}, 0 3px 0 0 ${shadowColor}`,
    fontFamily,
    fontSize: 12,
    fontWeight: 700,
    color: colors.text,
    userSelect: "none",
    imageRendering: "pixelated",
  };

  return {
    statusRowStyle: {
      position: "absolute",
      top: 8,
      left: 20,
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 7,
      maxWidth: "calc(100% - 232px)",
    },
    statusPlateStyle: {
      ...plateBase,
      pointerEvents: "none",
    },
    debtPlateStyle: {
      ...plateBase,
      pointerEvents: "none",
      background: colors.warnBg,
      border: `2px solid ${colors.wrong}`,
      color: colors.wrong,
    },
    energyPlateStyle: {
      ...plateBase,
      pointerEvents: "none",
      background: colors.parchmentLight,
      border: `2px solid ${colors.energyAccent}`,
    },
    inventoryButtonStyle: {
      ...plateBase,
      position: "absolute",
      top: 48,
      left: 8,
      gap: 6,
      pointerEvents: "auto",
      cursor: "pointer",
    },
    inventoryChipStyle: {
      display: "flex",
      alignItems: "center",
      gap: 3,
      padding: "2px 6px",
      background: colors.cardRest,
      border: `1px solid ${colors.cardBorder}`,
      borderRadius: id === "classicWood" ? 0 : 3,
      boxShadow: `inset 1px 1px 0 0 ${colors.parchmentLight}`,
    },
    iconGroupStyle: {
      pointerEvents: "auto",
      position: "absolute",
      top: 8,
      right: 20,
      display: "flex",
      gap: 6,
    },
    iconButtonStyle: {
      pointerEvents: "auto",
      position: "relative",
      width: 34,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      borderRadius: id === "classicWood" ? 0 : 4,
      background: panelBackground,
      color: colors.text,
      border: `2px solid ${colors.cardBorder}`,
      boxShadow: `inset 1px 1px 0 0 ${colors.parchmentLight}, 0 3px 0 0 ${shadowColor}`,
      cursor: "pointer",
      imageRendering: "pixelated",
    },
  };
}

const classicTheme: UITheme = {
  id: "classicWood",
  colors: classicColors,
  dialogue: buildClassicDialogue(classicColors),
  modal: buildModalTheme(classicColors, "classicWood"),
  hud: buildHudTheme(classicColors, "classicWood"),
};

const cutsceneTheme: UITheme = {
  id: "cutsceneParchment",
  colors: cutsceneColors,
  dialogue: buildCutsceneDialogue(cutsceneColors),
  modal: buildModalTheme(cutsceneColors, "cutsceneParchment"),
  hud: buildHudTheme(cutsceneColors, "cutsceneParchment"),
};

export const UI_THEMES: Record<UIThemeId, UITheme> = {
  classicWood: classicTheme,
  cutsceneParchment: cutsceneTheme,
};

export const ACTIVE_UI_THEME_ID: UIThemeId = "cutsceneParchment";

export function getUiTheme(id: UIThemeId = ACTIVE_UI_THEME_ID): UITheme {
  return UI_THEMES[id];
}
