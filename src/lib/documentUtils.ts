import { marked } from "marked";
import { ensureSlotIds } from "./contentSlots";

marked.setOptions({ breaks: true, gfm: true });

/** Convert markdown to HTML with auto-assigned content slots. */
export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return ensureSlotIds("<p></p>");
  const raw = marked.parse(markdown, { async: false }) as string;
  return ensureSlotIds(raw);
}

/** Migrate legacy markdown document content to slotted HTML. */
export function migrateMarkdownDocument(markdown: string): string {
  return markdownToHtml(markdown);
}

/** Pick the editable HTML content from a version record. */
export function documentHtmlFromVersion(version: {
  format: string;
  content_md: string;
  content_html?: string;
}): string {
  if (version.format === "html" && version.content_html?.trim()) {
    return version.content_html;
  }
  if (version.format === "html" && !version.content_html?.trim()) {
    return migrateMarkdownDocument(version.content_md);
  }
  if (version.format === "markdown" && version.content_md.trim()) {
    return migrateMarkdownDocument(version.content_md);
  }
  return "";
}

export function isTextDocumentFormat(format: string): boolean {
  return format === "markdown" || format === "html";
}

export function defaultPdfFileName(docType: "resume" | "letter", _format?: string): string {
  return docType === "resume" ? "resume.pdf" : "personal_letter.pdf";
}
