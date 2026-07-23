/** Read a file path as base64 for Tauri uploads. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function formatLabel(format: string): string {
  if (format === "markdown") return "Markdown";
  if (format === "html") return "Rich document";
  if (format === "docx") return "Word (.docx)";
  if (format === "pdf") return "PDF";
  return format;
}

/** All stored docs should be HTML; markdown is legacy pending migrate. */
export function canTailorFormat(format: string): boolean {
  return format === "markdown" || format === "html";
}

export function isEditableTextFormat(format: string): boolean {
  return format === "markdown" || format === "html";
}

export function isBinaryLegacyFormat(format: string): boolean {
  return format === "pdf" || format === "docx";
}

export function versionDisplayName(v: { name: string; format: string; file_name?: string | null }): string {
  if (isBinaryLegacyFormat(v.format)) {
    return `${v.name} · converting…`;
  }
  const suffix = v.format === "markdown" ? " · Markdown" : "";
  return `${v.name}${suffix}`;
}
