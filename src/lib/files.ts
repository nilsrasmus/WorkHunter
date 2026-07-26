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
