/**
 * A4 printable content area (matches html_pdf.rs `@page { size: A4; margin: 20mm }`).
 * Guides use fixed CSS px at 96dpi — the same coordinate system Chromium print uses —
 * not the editor viewport width.
 */
export const A4_PAGE_WIDTH_MM = 210;
export const A4_PAGE_HEIGHT_MM = 297;
export const A4_MARGIN_MM = 20;
export const A4_CONTENT_WIDTH_MM = A4_PAGE_WIDTH_MM - A4_MARGIN_MM * 2; // 170
export const A4_CONTENT_HEIGHT_MM = A4_PAGE_HEIGHT_MM - A4_MARGIN_MM * 2; // 257

/** CSS reference px per mm (96dpi), matching Chromium print layout. */
export const CSS_PX_PER_MM = 96 / 25.4;

export const A4_CONTENT_WIDTH_PX = A4_CONTENT_WIDTH_MM * CSS_PX_PER_MM;
export const A4_CONTENT_HEIGHT_PX = A4_CONTENT_HEIGHT_MM * CSS_PX_PER_MM;

/** Fixed printable page content height in CSS px (does not scale with editor width). */
export function pageContentHeightPx(): number {
  return A4_CONTENT_HEIGHT_PX;
}

export function pageBreakOffsets(scrollHeight: number, pageHeight: number = A4_CONTENT_HEIGHT_PX): number[] {
  if (pageHeight <= 0 || scrollHeight <= pageHeight) return [];
  const offsets: number[] = [];
  for (let y = pageHeight; y < scrollHeight - 2; y += pageHeight) {
    offsets.push(y);
  }
  return offsets;
}
