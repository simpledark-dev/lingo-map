export const MARKER_LABEL_STYLES = [
  {
    id: "classic",
    label: "Classic",
    fontFamily: "monospace",
    cssFontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 6,
    fontWeight: "700",
    fill: 0xfdf6e0,
    strokeColor: 0x1a1008,
    strokeWidth: 3,
    textTransform: "none",
  },
  {
    id: "pixel",
    label: "Tiny Pixel",
    fontFamily: '"Courier New", "Roboto Mono", monospace',
    cssFontFamily: '"Courier New", var(--font-geist-mono), monospace',
    fontSize: 7,
    fontWeight: "900",
    fill: 0xfff0b8,
    strokeColor: 0x2a1608,
    strokeWidth: 3,
    textTransform: "uppercase",
  },
  {
    id: "signpost",
    label: "Signpost",
    fontFamily: 'Georgia, "Times New Roman", serif',
    cssFontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 7,
    fontWeight: "700",
    fill: 0xffd77a,
    strokeColor: 0x3c200d,
    strokeWidth: 3,
    textTransform: "none",
  },
  {
    id: "clean",
    label: "Clean",
    fontFamily: 'Arial, "Helvetica Neue", sans-serif',
    cssFontFamily: 'var(--font-geist-sans), Arial, sans-serif',
    fontSize: 7,
    fontWeight: "800",
    fill: 0xffffff,
    strokeColor: 0x23150b,
    strokeWidth: 2,
    textTransform: "none",
  },
] as const;

export type MarkerLabelStyleId = (typeof MARKER_LABEL_STYLES)[number]["id"];

export const DEFAULT_MARKER_LABEL_STYLE: MarkerLabelStyleId = "clean";

export function normalizeMarkerLabelStyleId(
  value: unknown,
): MarkerLabelStyleId {
  return MARKER_LABEL_STYLES.some((style) => style.id === value)
    ? (value as MarkerLabelStyleId)
    : DEFAULT_MARKER_LABEL_STYLE;
}

export function getMarkerLabelPreset(id: MarkerLabelStyleId) {
  return MARKER_LABEL_STYLES.find((style) => style.id === id) ??
    MARKER_LABEL_STYLES.find((style) => style.id === DEFAULT_MARKER_LABEL_STYLE)!;
}
