import { api } from "./api";
import type { CustomFont } from "../types";

const STYLE_ID = "wh-custom-fonts";

/** Inject @font-face rules into the document so the editor can use custom fonts. */
export async function ensureCustomFontsLoaded(profileId: number): Promise<CustomFont[]> {
  const fonts = await api.listCustomFonts(profileId);
  const css = await api.getCustomFontsCss(profileId);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
  return fonts;
}

export function familyCssValue(family: string): string {
  const needsQuotes = /[\s,]/.test(family);
  return needsQuotes ? `"${family.replace(/"/g, '\\"')}"` : family;
}

export async function uploadCustomFont(
  profileId: number,
  filePath: string,
  bytes: Uint8Array,
): Promise<CustomFont> {
  const fileName = filePath.split(/[/\\]/).pop() ?? "font.ttf";
  const baseName = fileName.replace(/\.(ttf|otf|woff2?)$/i, "");
  const family = baseName.replace(/[-_]+/g, " ").trim() || "Custom Font";
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const fileBase64 = btoa(binary);
  const font = await api.addCustomFont(profileId, family, fileName, fileBase64);
  await ensureCustomFontsLoaded(profileId);
  return font;
}
