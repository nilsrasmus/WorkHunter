/**
 * A4 printable content area (matches html_pdf.rs @page size A4; margin 20mm).
 * Used to draw approximate page-break guides in the editor.
 */
export const A4_CONTENT_WIDTH_MM = 170;
export const A4_CONTENT_HEIGHT_MM = 257;

/** Page content height in px for a given content-box width (scales with editor width). */
export function pageContentHeightPx(contentWidthPx: number): number {
  if (contentWidthPx <= 0) return 0;
  return contentWidthPx * (A4_CONTENT_HEIGHT_MM / A4_CONTENT_WIDTH_MM);
}

export function pageBreakOffsets(scrollHeight: number, pageHeight: number): number[] {
  if (pageHeight <= 0 || scrollHeight <= pageHeight) return [];
  const offsets: number[] = [];
  for (let y = pageHeight; y < scrollHeight - 2; y += pageHeight) {
    offsets.push(y);
  }
  return offsets;
}
