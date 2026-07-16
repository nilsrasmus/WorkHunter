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
  if (format === "docx") return "Word (.docx)";
  if (format === "pdf") return "PDF";
  return format;
}

export function canTailorFormat(format: string): boolean {
  return format === "markdown";
}

export function versionDisplayName(v: { name: string; format: string; file_name?: string | null }): string {
  const suffix = v.format === "markdown" ? "" : ` · ${formatLabel(v.format)}`;
  const file = v.file_name ? ` (${v.file_name})` : "";
  return `${v.name}${suffix}${file}`;
}
