/** Builtin font options for the rich document editor (Google Docs–style system stacks). */

export type EditorFontOption = {
  label: string;
  value: string;
};

export type EditorFontGroup = {
  label: string;
  fonts: EditorFontOption[];
};

/** Default / unset — rendered outside optgroups. */
export const DEFAULT_FONT_OPTION: EditorFontOption = { label: "Default", value: "" };

/**
 * Widely available desktop fonts with CSS fallback stacks.
 * Missing OS fonts fall through the stack (same as Docs / Word).
 */
export const BUILTIN_FONT_GROUPS: EditorFontGroup[] = [
  {
    label: "Sans-serif",
    fonts: [
      { label: "Arial", value: "Arial, Helvetica, sans-serif" },
      { label: "Calibri", value: 'Calibri, "Segoe UI", Candara, sans-serif' },
      { label: "Candara", value: "Candara, Calibri, sans-serif" },
      { label: "Century Gothic", value: '"Century Gothic", CenturyGothic, AppleGothic, sans-serif' },
      { label: "Geist", value: "Geist Variable, sans-serif" },
      { label: "Gill Sans", value: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
      { label: "Helvetica", value: 'Helvetica, "Helvetica Neue", Arial, sans-serif' },
      { label: "Segoe UI", value: '"Segoe UI", Tahoma, Geneva, sans-serif' },
      { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
      { label: "Trebuchet MS", value: '"Trebuchet MS", Helvetica, sans-serif' },
      { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
    ],
  },
  {
    label: "Serif",
    fonts: [
      { label: "Baskerville", value: 'Baskerville, "Baskerville Old Face", "Times New Roman", serif' },
      { label: "Cambria", value: 'Cambria, "Times New Roman", serif' },
      { label: "Garamond", value: 'Garamond, "Palatino Linotype", Palatino, serif' },
      { label: "Georgia", value: "Georgia, serif" },
      { label: "Palatino", value: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
      { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
    ],
  },
  {
    label: "Monospace",
    fonts: [
      { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
      { label: "Courier New", value: '"Courier New", Courier, monospace' },
      { label: "Geist Mono", value: "Geist Mono Variable, monospace" },
    ],
  },
];

/** Flat list for lookups / custom-font merging. */
export const BUILTIN_FONTS: EditorFontOption[] = [
  DEFAULT_FONT_OPTION,
  ...BUILTIN_FONT_GROUPS.flatMap((g) => g.fonts),
];

/** Google Docs–style font size list (pt). */
export const FONT_SIZES: EditorFontOption[] = [
  { label: "Default", value: "" },
  { label: "8", value: "8pt" },
  { label: "9", value: "9pt" },
  { label: "10", value: "10pt" },
  { label: "11", value: "11pt" },
  { label: "12", value: "12pt" },
  { label: "14", value: "14pt" },
  { label: "18", value: "18pt" },
  { label: "24", value: "24pt" },
  { label: "30", value: "30pt" },
  { label: "36", value: "36pt" },
  { label: "48", value: "48pt" },
  { label: "60", value: "60pt" },
  { label: "72", value: "72pt" },
  { label: "96", value: "96pt" },
];
