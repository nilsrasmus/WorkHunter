import { describe, expect, it } from "vitest";
import {
  firstFontFamilyName,
  fontSizeToPt,
  hasUnderlineDecoration,
  isBoldFontWeight,
  isItalicFontStyle,
  matchFontFamily,
  matchFontSize,
} from "./editorTypography";

describe("editorTypography", () => {
  it("extracts the first font family name", () => {
    expect(firstFontFamilyName('"Times New Roman", Times, serif')).toBe("times new roman");
    expect(firstFontFamilyName("Georgia, serif")).toBe("georgia");
  });

  it("converts font sizes to pt", () => {
    expect(fontSizeToPt("11pt")).toBe(11);
    expect(fontSizeToPt("16px")).toBe(12);
    expect(fontSizeToPt("10")).toBe(10);
  });

  it("matches known font families case-insensitively", () => {
    const known = [
      { label: "Default", value: "" },
      { label: "Georgia", value: "Georgia, serif" },
      { label: "Arial", value: "Arial, Helvetica, sans-serif" },
    ];
    expect(matchFontFamily("georgia", known)).toBe("Georgia, serif");
    expect(matchFontFamily("Arial, Helvetica, sans-serif", known)).toBe(
      "Arial, Helvetica, sans-serif",
    );
    expect(matchFontFamily("Roboto, sans-serif", known)).toBe("");
  });

  it("matches nearby sizes to the known list and keeps others normalized", () => {
    expect(matchFontSize("11pt")).toBe("11pt");
    expect(matchFontSize("16px")).toBe("12pt");
    expect(matchFontSize("13pt")).toBe("13pt");
  });

  it("detects bold/italic/underline from CSS values", () => {
    expect(isBoldFontWeight("700")).toBe(true);
    expect(isBoldFontWeight("bold")).toBe(true);
    expect(isBoldFontWeight("400")).toBe(false);
    expect(isItalicFontStyle("italic")).toBe(true);
    expect(isItalicFontStyle("normal")).toBe(false);
    expect(hasUnderlineDecoration("underline")).toBe(true);
    expect(hasUnderlineDecoration("underline line-through")).toBe(true);
    expect(hasUnderlineDecoration("none")).toBe(false);
  });
});
