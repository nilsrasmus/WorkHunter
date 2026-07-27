import type { Editor } from "@tiptap/core";
import { FONT_SIZES, type EditorFontOption } from "./editorFonts";

export type ToolbarTypography = {
  fontFamily: string;
  fontSize: string;
};

export type ToolbarMarks = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

const EMPTY_TYPOGRAPHY: ToolbarTypography = { fontFamily: "", fontSize: "" };
const EMPTY_MARKS: ToolbarMarks = { bold: false, italic: false, underline: false };

type ParsedStyle = {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
};

/** First family name from a CSS font-family list, lowercased for matching. */
export function firstFontFamilyName(fontFamily: string): string {
  const raw = fontFamily.trim();
  if (!raw) return "";
  const first = raw.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "").trim().toLowerCase();
}

/** Parse a CSS font-size into points, or null if unparseable. */
export function fontSizeToPt(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const pt = s.match(/^([\d.]+)\s*pt$/);
  if (pt) return Number(pt[1]);
  const px = s.match(/^([\d.]+)\s*px$/);
  if (px) return (Number(px[1]) * 72) / 96;
  const bare = s.match(/^([\d.]+)$/);
  if (bare) return Number(bare[1]);
  return null;
}

export function parseStyleDeclaration(style: string | null | undefined): ParsedStyle {
  if (!style || typeof style !== "string") return {};
  const out: ParsedStyle = {};
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!val) continue;
    if (prop === "font-family") out.fontFamily = val;
    if (prop === "font-size") out.fontSize = val;
    if (prop === "font-weight") out.fontWeight = val;
    if (prop === "font-style") out.fontStyle = val;
    if (prop === "text-decoration" || prop === "text-decoration-line") {
      out.textDecoration = val;
    }
  }
  return out;
}

/** True when CSS font-weight is bold-ish (bold/bolder or numeric >= 600). */
export function isBoldFontWeight(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const w = raw.trim().toLowerCase();
  if (w === "bold" || w === "bolder") return true;
  if (w === "normal" || w === "lighter") return false;
  const n = Number(w);
  return Number.isFinite(n) && n >= 600;
}

export function isItalicFontStyle(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const s = raw.trim().toLowerCase();
  return s === "italic" || s === "oblique" || s.startsWith("oblique ");
}

export function hasUnderlineDecoration(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  return raw.trim().toLowerCase().split(/\s+/).includes("underline");
}

/** Map an explicit family string onto a known option value, or "" if unknown. */
export function matchFontFamily(
  raw: string | null | undefined,
  knownFonts: EditorFontOption[],
): string {
  if (!raw?.trim()) return "";
  const needle = firstFontFamilyName(raw);
  if (!needle) return "";

  for (const opt of knownFonts) {
    if (!opt.value) continue;
    if (firstFontFamilyName(opt.value) === needle) return opt.value;
    if (opt.label.trim().toLowerCase() === needle) return opt.value;
  }
  return "";
}

/** Map an explicit size onto a list value, or normalized Npt when not in list. */
export function matchFontSize(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const pt = fontSizeToPt(raw);
  if (pt == null || !Number.isFinite(pt)) return "";

  let best: EditorFontOption | null = null;
  let bestDelta = Infinity;
  for (const opt of FONT_SIZES) {
    if (!opt.value) continue;
    const optPt = fontSizeToPt(opt.value);
    if (optPt == null) continue;
    const delta = Math.abs(optPt - pt);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = opt;
    }
  }
  if (best && bestDelta <= 0.5) return best.value;

  const rounded = Math.round(pt * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${label}pt`;
}

function readTypographyFromTextStyle(editor: Editor): { fontFamily?: string; fontSize?: string } {
  const attrs = editor.getAttributes("textStyle") as {
    fontFamily?: string | null;
    fontSize?: string | null;
  };
  return {
    fontFamily: attrs.fontFamily || undefined,
    fontSize: attrs.fontSize || undefined,
  };
}

function readStyleFromNodeAttrs(editor: Editor): ParsedStyle {
  const { $from } = editor.state.selection;
  const out: ParsedStyle = {};
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    const style = typeof node.attrs?.style === "string" ? node.attrs.style : null;
    const parsed = parseStyleDeclaration(style);
    if (!out.fontFamily && parsed.fontFamily) out.fontFamily = parsed.fontFamily;
    if (!out.fontSize && parsed.fontSize) out.fontSize = parsed.fontSize;
    if (!out.fontWeight && parsed.fontWeight) out.fontWeight = parsed.fontWeight;
    if (!out.fontStyle && parsed.fontStyle) out.fontStyle = parsed.fontStyle;
    if (!out.textDecoration && parsed.textDecoration) out.textDecoration = parsed.textDecoration;
  }
  return out;
}

function readStyleFromDom(editor: Editor): ParsedStyle & {
  boldTag?: boolean;
  italicTag?: boolean;
  underlineTag?: boolean;
} {
  const view = editor.view;
  if (!view) return {};
  const { from } = editor.state.selection;
  let dom: Node | null = null;
  try {
    dom = view.domAtPos(from).node;
  } catch {
    return {};
  }
  let el: Element | null =
    dom.nodeType === Node.ELEMENT_NODE ? (dom as Element) : dom.parentElement;

  const out: ParsedStyle & {
    boldTag?: boolean;
    italicTag?: boolean;
    underlineTag?: boolean;
  } = {};

  while (el && el instanceof HTMLElement) {
    if (el.classList.contains("tiptap") || el.classList.contains("ProseMirror")) break;

    const tag = el.tagName.toLowerCase();
    if (tag === "strong" || tag === "b") out.boldTag = true;
    if (tag === "em" || tag === "i") out.italicTag = true;
    if (tag === "u") out.underlineTag = true;

    const inlineFamily = el.style.fontFamily?.trim();
    const inlineSize = el.style.fontSize?.trim();
    const inlineWeight = el.style.fontWeight?.trim();
    const inlineStyle = el.style.fontStyle?.trim();
    const inlineDecoration = (el.style.textDecorationLine || el.style.textDecoration)?.trim();
    const parsed = parseStyleDeclaration(el.getAttribute("style"));

    if (!out.fontFamily && (inlineFamily || parsed.fontFamily)) {
      out.fontFamily = inlineFamily || parsed.fontFamily;
    }
    if (!out.fontSize && (inlineSize || parsed.fontSize)) {
      out.fontSize = inlineSize || parsed.fontSize;
    }
    if (!out.fontWeight && (inlineWeight || parsed.fontWeight)) {
      out.fontWeight = inlineWeight || parsed.fontWeight;
    }
    if (!out.fontStyle && (inlineStyle || parsed.fontStyle)) {
      out.fontStyle = inlineStyle || parsed.fontStyle;
    }
    if (!out.textDecoration && (inlineDecoration || parsed.textDecoration)) {
      out.textDecoration = inlineDecoration || parsed.textDecoration;
    }

    el = el.parentElement;
  }

  return out;
}

/**
 * Resolve explicit font/size at the caret for toolbar display.
 * Unknown fonts map to Default (""); unmatched sizes keep normalized "Npt".
 */
export function resolveToolbarTypography(
  editor: Editor | null | undefined,
  knownFonts: EditorFontOption[],
): ToolbarTypography {
  if (!editor || editor.isDestroyed) return EMPTY_TYPOGRAPHY;

  const fromMark = readTypographyFromTextStyle(editor);
  const fromAttrs = readStyleFromNodeAttrs(editor);
  const fromDom = readStyleFromDom(editor);

  const rawFamily = fromMark.fontFamily || fromAttrs.fontFamily || fromDom.fontFamily;
  const rawSize = fromMark.fontSize || fromAttrs.fontSize || fromDom.fontSize;

  return {
    fontFamily: matchFontFamily(rawFamily, knownFonts),
    fontSize: matchFontSize(rawSize),
  };
}

/**
 * Resolve bold/italic/underline at the caret from TipTap marks, HTML tags,
 * and explicit CSS (e.g. font-weight:700 from AI HTML).
 */
export function resolveToolbarMarks(editor: Editor | null | undefined): ToolbarMarks {
  if (!editor || editor.isDestroyed) return EMPTY_MARKS;

  const fromAttrs = readStyleFromNodeAttrs(editor);
  const fromDom = readStyleFromDom(editor);

  const bold =
    editor.isActive("bold")
    || Boolean(fromDom.boldTag)
    || isBoldFontWeight(fromAttrs.fontWeight)
    || isBoldFontWeight(fromDom.fontWeight);

  const italic =
    editor.isActive("italic")
    || Boolean(fromDom.italicTag)
    || isItalicFontStyle(fromAttrs.fontStyle)
    || isItalicFontStyle(fromDom.fontStyle);

  const underline =
    editor.isActive("underline")
    || Boolean(fromDom.underlineTag)
    || hasUnderlineDecoration(fromAttrs.textDecoration)
    || hasUnderlineDecoration(fromDom.textDecoration);

  return { bold, italic, underline };
}
