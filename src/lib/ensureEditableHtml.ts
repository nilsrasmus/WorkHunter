import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { api } from "./api";
import { isBinaryLegacyFormat } from "./files";
import { documentHtmlFromVersion } from "./documentUtils";
import {
  base64ToBytes,
  bytesToHtml,
  detectImportKind,
  type HtmlImportResult,
  type ImportOptions,
} from "./importDocument";
import type { RoleDocumentVersion } from "../types";

/** Ensure a role document version is editable HTML (converts legacy binary/markdown in place). */
export async function ensureVersionHtml(
  version: RoleDocumentVersion,
  options: ImportOptions = {},
): Promise<{ version: RoleDocumentVersion; html: string; aiError?: string }> {
  if (version.format === "html" && version.content_html.trim()) {
    return { version, html: version.content_html };
  }

  if (version.format === "html" || version.format === "markdown") {
    const html = documentHtmlFromVersion(version);
    if (version.format === "markdown" || !version.content_html.trim()) {
      const updated = await api.updateRoleDocumentHtml(version.id, html);
      return { version: updated, html };
    }
    return { version, html };
  }

  if (!isBinaryLegacyFormat(version.format)) {
    throw new Error(`Unsupported document format: ${version.format}`);
  }

  const payload = await api.getRoleDocumentFileBase64(version.id);
  const kind =
    detectImportKind(payload.file_name ?? `file.${version.format}`)
    ?? (version.format === "pdf" ? "pdf" : "docx");
  const imported = await bytesToHtml(base64ToBytes(payload.data_base64), kind, {
    ...options,
    docType: options.docType ?? version.doc_type,
  });
  const updated = await api.convertRoleDocumentToHtml(version.id, imported.html);
  return { version: updated, html: imported.html, aiError: imported.aiError };
}

export async function importPathToHtml(
  filePath: string,
  options: ImportOptions = {},
): Promise<HtmlImportResult> {
  const kind = detectImportKind(filePath);
  if (!kind) throw new Error("Unsupported file type");
  if (kind === "markdown" || kind === "txt") {
    const text = await readTextFile(filePath);
    return bytesToHtml(new TextEncoder().encode(text), kind, {
      ...options,
      textFallback: text,
    });
  }
  return bytesToHtml(await readFile(filePath), kind, options);
}
